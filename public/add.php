<?php
header("Content-Type: text/plain; charset=utf-8");

require_once __DIR__ . "/log-activity.php";
require_once __DIR__ . "/sms.php";

function projectDataDir() {
    // Prefer Hostinger absolute path; fall back to project data/ for local testing.
    $hostinger = "/home/u593240408/morning-bible-verse/data";
    if (is_dir($hostinger)) {
        return $hostinger;
    }
    $local = dirname(__DIR__) . "/data";
    if (!is_dir($local)) {
        @mkdir($local, 0755, true);
    }
    return $local;
}

function readJsonFile($file, $default) {
    if (!is_file($file)) {
        return $default;
    }
    $decoded = json_decode(file_get_contents($file), true);
    return is_array($decoded) ? $decoded : $default;
}

function writeJsonFile($file, $data) {
    $dir = dirname($file);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    file_put_contents(
        $file,
        json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n",
        LOCK_EX
    );
}

function loadEnvFile($envFile) {
    $env = [];
    if (!is_file($envFile)) {
        return $env;
    }
    foreach (file($envFile, FILE_IGNORE_NEW_LINES) as $line) {
        $line = trim($line);
        if ($line === "" || $line[0] === "#" || strpos($line, "=") === false) {
            continue;
        }
        [$key, $value] = explode("=", $line, 2);
        $env[trim($key)] = trim($value);
    }
    return $env;
}

function normalizePhone($raw) {
    $digits = preg_replace("/\D/", "", $raw);
    if (strlen($digits) === 10) {
        return "+1" . $digits;
    }
    if (strlen($digits) === 11 && $digits[0] === "1") {
        return "+" . $digits;
    }
    if (strlen($digits) >= 8 && strlen($digits) <= 15) {
        return "+" . $digits;
    }
    return null;
}

function requestValue($keys) {
    foreach ($keys as $key) {
        if (isset($_POST[$key]) && $_POST[$key] !== "") {
            return $_POST[$key];
        }
        if (isset($_GET[$key]) && $_GET[$key] !== "") {
            return $_GET[$key];
        }
    }
    return "";
}

$raw = requestValue(["number", "phone"]);
if ($raw === "" && isset($_GET[""]) && $_GET[""] !== "") {
    $raw = $_GET[""];
}
if ($raw === "" && !empty($_SERVER["QUERY_STRING"]) && preg_match("/^=([^&]*)/", $_SERVER["QUERY_STRING"], $match)) {
    $raw = urldecode($match[1]);
}

$phone = normalizePhone($raw);
if ($phone === null) {
    http_response_code(400);
    echo "Send a phone number, like /add?=17023422909\n";
    exit;
}

$version = trim((string) requestValue(["version"]));
$time = trim((string) requestValue(["time"]));
$theme = trim((string) requestValue(["theme", "fulfillment"]));

$allowedVersions = ["KJV", "NIV", "ESV", "NLT", "NKJV"];
$allowedTimes = ["6:00 AM", "7:00 AM", "8:15 AM", "12:00 PM", "6:00 PM", "9:00 PM"];
$allowedThemes = [
    "Faith", "Courage", "Love", "Peace",
    "Wisdom", "Knowledge", "Healing", "Miracles", "Prophecy", "Discernment",
    "Tongues", "Interpretation", "Interpretation of Tongues",
    "Joy", "Patience", "Kindness", "Goodness", "Faithfulness", "Gentleness", "Self-Control",
];

// Migrate old 8:00 AM slot to 8:15 AM
if ($time === "8:00 AM") {
    $time = "8:15 AM";
}

// Marketing form currently only offers KJV; default and coerce unknowns to KJV.
if ($version === "" || !in_array($version, $allowedVersions, true)) {
    $version = "KJV";
}
if ($time === "" || !in_array($time, $allowedTimes, true)) {
    $time = "12:00 PM";
}
if ($theme === "Interpretation of Tongues") {
    $theme = "Interpretation";
}
if ($theme !== "" && !in_array($theme, $allowedThemes, true)) {
    $theme = "Faith";
}

$dataDir = projectDataDir();
$numbersFile = $dataDir . "/numbers.json";
$prefsFile = $dataDir . "/preferences.json";

$list = readJsonFile($numbersFile, []);
// Keep numbers.json as a plain array of phone strings only.
$list = array_values(array_filter($list, function ($item) {
    return is_string($item);
}));

$already = in_array($phone, $list, true);
if (!$already) {
    $list[] = $phone;
    writeJsonFile($numbersFile, $list);
}

// Parallel preferences object keyed by phone. Never merge into numbers.json.
$prefs = readJsonFile($prefsFile, []);
if (!is_array($prefs)) {
    $prefs = [];
} else {
    // Prefer object-shaped map keyed by phone. Reset if it looks like a list.
    $isList = $prefs === [] || array_keys($prefs) === range(0, count($prefs) - 1);
    if ($isList) {
        $prefs = [];
    }
}

$entry = isset($prefs[$phone]) && is_array($prefs[$phone]) ? $prefs[$phone] : [];
$entry["version"] = $version;
$entry["time"] = $time;
if ($theme !== "") {
    $entry["theme"] = $theme;
} elseif (!isset($entry["theme"])) {
    $entry["theme"] = "Faith";
}
$entry["updatedAt"] = gmdate("c");
$prefs[$phone] = $entry;
writeJsonFile($prefsFile, $prefs);

$count = count($list);

if ($already) {
    dv_log_activity($dataDir, [
        "action" => "subscribe_update",
        "phone" => $phone,
        "status" => "already_subscribed",
        "version" => $entry["version"] ?? $version,
        "time" => $entry["time"] ?? $time,
        "theme" => $entry["theme"] ?? $theme,
        "reason" => "",
        "list_count" => $count,
    ]);
    echo "Already on the list: $phone ($count numbers). Preferences saved.\n";
    exit;
}

dv_log_activity($dataDir, [
    "action" => "subscribe",
    "phone" => $phone,
    "status" => "added",
    "version" => $entry["version"] ?? $version,
    "time" => $entry["time"] ?? $time,
    "theme" => $entry["theme"] ?? $theme,
    "reason" => "",
    "list_count" => $count,
]);

// Load environment for SMS. Skip quietly if .env missing.
$envCandidates = [
    "/home/u593240408/morning-bible-verse/.env",
    dirname(__DIR__) . "/.env",
];
$env = [];
foreach ($envCandidates as $envFile) {
    if (is_file($envFile)) {
        $env = loadEnvFile($envFile);
        break;
    }
}

if (!empty($env["TEXTLINK_API_KEY"])) {
    // Send welcome SMS to the end user.
    $welcomeText = "Thanks for subscribing! Meditate on the verse: start with 5 minutes. Maybe study it. Unsubscribe anytime.";
    $userResult = dv_send_sms($phone, $welcomeText, $env);

    // Send admin notice to Nick.
    $adminText = "Added $phone to the morning verse list.";
    $adminResult = dv_send_sms("+17023422909", $adminText, $env);

    $userFailed = !$userResult["ok"];
    $adminFailed = !$adminResult["ok"];

    if ($userFailed && $adminFailed) {
        echo "Added $phone ($count numbers), but SMS to subscriber and admin both failed: user={$userResult['message']}, admin={$adminResult['message']}\n";
        exit;
    }
    if ($userFailed) {
        echo "Added $phone ($count numbers). Admin notified, but welcome SMS to subscriber failed: {$userResult['message']}\n";
        exit;
    }
    if ($adminFailed) {
        echo "Added $phone ($count numbers). Welcome SMS sent, but notice to 7023422909 did not send: {$adminResult['message']}\n";
        exit;
    }
    echo "Added $phone ($count numbers). Welcome SMS sent. Texted 7023422909.\n";
    exit;
}

echo "Added $phone ($count numbers). Preferences saved.\n";
