<?php
header("Content-Type: text/plain; charset=utf-8");

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

if ($wasOnList) {
    array_splice($list, $index, 1);
    writeJsonFile($numbersFile, array_values($list));

    // Clear preferences for this phone when present. Never merge reasons into numbers.json.
    $prefs = readJsonFile($prefsFile, []);
    if (is_array($prefs) && array_key_exists($phone, $prefs)) {
        unset($prefs[$phone]);
        writeJsonFile($prefsFile, $prefs);
    }
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
    echo "Not on the list: $phone ($count numbers)\n";
    exit;
}

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
    $notice = "Removed $phone from the morning verse list.";
    $payload = json_encode([
        "phone_number" => "+17023422909",
        "text" => $notice,
        "device_id" => (int) ($env["SIM_CARD_ID"] ?? 3066),
    ]);
    $context = stream_context_create([
        "http" => [
            "method" => "POST",
            "header" => "Content-Type: application/json\r\nAuthorization: Bearer " . $env["TEXTLINK_API_KEY"] . "\r\n",
            "content" => $payload,
            "timeout" => 20,
            "ignore_errors" => true,
        ],
    ]);
    $sent = @file_get_contents("https://textlinksms.com/api/send-sms", false, $context);
    $result = json_decode($sent, true);
    if (!is_array($result) || empty($result["ok"])) {
        $smsReason = is_array($result) && isset($result["message"]) ? $result["message"] : "text failed";
        echo "Removed $phone ($count numbers), but the notice to 7023422909 did not send: $smsReason\n";
        exit;
    }
    echo "Removed $phone ($count numbers). Texted 7023422909.\n";
    exit;
}

echo "Removed $phone ($count numbers). Preferences cleared.\n";
