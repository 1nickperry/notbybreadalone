<?php
header("Content-Type: text/plain; charset=utf-8");

require_once __DIR__ . "/log-activity.php";
require_once __DIR__ . "/sms.php";

function projectDataDir() {
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

function refreshSlotCountsCache($dataDir) {
    // Refresh slot-counts.json after preference changes so counts stay fresh
    $prefsFile = $dataDir . "/preferences.json";
    $cacheFile = $dataDir . "/slot-counts.json";
    $allowedTimes = ["6:00 AM", "7:00 AM", "8:00 AM", "12:00 PM", "6:00 PM", "9:00 PM"];
    
    $prefs = readJsonFile($prefsFile, []);
    if (!is_array($prefs)) {
        $prefs = [];
    }
    
    $counts = array_fill_keys($allowedTimes, 0);
    
    foreach ($prefs as $phone => $entry) {
        if (!is_array($entry) || !isset($entry["time"])) {
            continue;
        }
        $time = ($entry["time"] === "8:15 AM") ? "8:00 AM" : $entry["time"];
        if (in_array($time, $allowedTimes, true)) {
            $counts[$time] += 1;
        }
    }
    
    file_put_contents($cacheFile, json_encode($counts, JSON_PRETTY_PRINT) . "\n", LOCK_EX);
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

$raw = "";
if (isset($_GET["number"]) && $_GET["number"] !== "") {
    $raw = $_GET["number"];
} elseif (isset($_POST["number"]) && $_POST["number"] !== "") {
    $raw = $_POST["number"];
} elseif (isset($_GET["phone"]) && $_GET["phone"] !== "") {
    $raw = $_GET["phone"];
} elseif (isset($_POST["phone"]) && $_POST["phone"] !== "") {
    $raw = $_POST["phone"];
} elseif (isset($_GET[""]) && $_GET[""] !== "") {
    $raw = $_GET[""];
} elseif (!empty($_SERVER["QUERY_STRING"]) && preg_match("/^=([^&]*)/", $_SERVER["QUERY_STRING"], $match)) {
    $raw = urldecode($match[1]);
}

$phone = normalizePhone($raw);
if ($phone === null) {
    http_response_code(400);
    echo "Send a phone number, like /remove?=17023422909\n";
    exit;
}

// Optional reason from the SEO unsubscribe page. Keep TextLink ?=phone links working.
$reason = trim((string) requestValue(["reason"]));
if (strlen($reason) > 2000) {
    $reason = substr($reason, 0, 2000);
}

$dataDir = projectDataDir();
$numbersFile = $dataDir . "/numbers.json";
$prefsFile = $dataDir . "/preferences.json";
$reasonsFile = $dataDir . "/unsubscribe-reasons.json";

$list = readJsonFile($numbersFile, []);
$list = array_values(array_filter($list, function ($item) {
    return is_string($item);
}));

$index = array_search($phone, $list, true);
$wasOnList = ($index !== false);

// Snapshot preferences for the activity log before clearing.
$prefs = readJsonFile($prefsFile, []);
$prefEntry = (is_array($prefs) && isset($prefs[$phone]) && is_array($prefs[$phone]))
    ? $prefs[$phone]
    : [];
$logVersion = isset($prefEntry["version"]) ? (string) $prefEntry["version"] : "";
$logTime = isset($prefEntry["time"]) ? (string) $prefEntry["time"] : "";
$logTheme = isset($prefEntry["theme"]) ? (string) $prefEntry["theme"] : "";

if ($wasOnList) {
    array_splice($list, $index, 1);
    writeJsonFile($numbersFile, array_values($list));

    // Clear preferences for this phone when present. Never merge reasons into numbers.json.
    if (is_array($prefs) && array_key_exists($phone, $prefs)) {
        unset($prefs[$phone]);
        writeJsonFile($prefsFile, $prefs);
    }
    
    // Refresh slot counts cache so frontend loads updated counts quickly
    refreshSlotCountsCache($dataDir);
}

// Record reason separately when provided (page flow). Does not change numbers.json shape.
if ($reason !== "") {
    $reasons = readJsonFile($reasonsFile, []);
    if (!is_array($reasons)) {
        $reasons = [];
    }
    // Prefer a list of entries.
    $isList = $reasons === [] || array_keys($reasons) === range(0, count($reasons) - 1);
    if (!$isList) {
        $reasons = [];
    }
    $reasons[] = [
        "phone" => $phone,
        "reason" => $reason,
        "removed" => $wasOnList,
        "at" => gmdate("c"),
    ];
    writeJsonFile($reasonsFile, $reasons);
}

$count = count($list);

if (!$wasOnList) {
    dv_log_activity($dataDir, [
        "action" => "unsubscribe_miss",
        "phone" => $phone,
        "status" => "not_on_list",
        "version" => $logVersion,
        "time" => $logTime,
        "theme" => $logTheme,
        "reason" => $reason,
        "list_count" => $count,
    ]);
    echo "Not on the list: $phone ($count numbers)\n";
    exit;
}

dv_log_activity($dataDir, [
    "action" => "unsubscribe",
    "phone" => $phone,
    "status" => "removed",
    "version" => $logVersion,
    "time" => $logTime,
    "theme" => $logTheme,
    "reason" => $reason,
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
    // Send unsubscribe confirmation to the end user.
    $confirmText = "You have been unsubscribed from Daily Verse. No more texts. Resubscribe anytime at notbybreadalone.app";
    $userResult = dv_send_sms($phone, $confirmText, $env);

    // Send admin notice to Nick.
    $adminText = "Removed $phone from the morning verse list.";
    $adminResult = dv_send_sms("+17023422909", $adminText, $env);

    $userFailed = !$userResult["ok"];
    $adminFailed = !$adminResult["ok"];

    if ($userFailed && $adminFailed) {
        echo "Removed $phone ($count numbers), but SMS to subscriber and admin both failed: user={$userResult['message']}, admin={$adminResult['message']}\n";
        exit;
    }
    if ($userFailed) {
        echo "Removed $phone ($count numbers). Admin notified, but unsubscribe SMS to subscriber failed: {$userResult['message']}\n";
        exit;
    }
    if ($adminFailed) {
        echo "Removed $phone ($count numbers). Unsubscribe SMS sent, but notice to 7023422909 did not send: {$adminResult['message']}\n";
        exit;
    }
    echo "Removed $phone ($count numbers). Unsubscribe SMS sent. Texted 7023422909.\n";
    exit;
}

echo "Removed $phone ($count numbers). Preferences cleared.\n";
