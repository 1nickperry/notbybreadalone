<?php
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-cache, must-revalidate");

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
    return is_array($decoded) ? $default : $decoded;
}

function migrateOldSlot($time) {
    return $time === "8:00 AM" ? "8:15 AM" : $time;
}

$dataDir = projectDataDir();
$prefsFile = $dataDir . "/preferences.json";

$allowedTimes = ["6:00 AM", "7:00 AM", "8:15 AM", "12:00 PM", "6:00 PM", "9:00 PM"];

$prefs = readJsonFile($prefsFile, []);
if (!is_array($prefs)) {
    $prefs = [];
}

$counts = array_fill_keys($allowedTimes, 0);

foreach ($prefs as $phone => $entry) {
    if (!is_array($entry) || !isset($entry["time"])) {
        continue;
    }
    $time = migrateOldSlot($entry["time"]);
    if (in_array($time, $allowedTimes, true)) {
        $counts[$time] += 1;
    }
}

echo json_encode($counts, JSON_PRETTY_PRINT);
