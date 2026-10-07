<?php
/**
 * Fast slot counts endpoint - reads from cached slot-counts.json
 * 
 * Cache is updated:
 *   - Daily at midnight America/Denver via cron
 *   - On signup/preference changes (add.php, remove.php)
 * 
 * Falls back to live computation if cache is missing.
 */
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: public, max-age=300");

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

function migrateOldSlot($time) {
    return $time === "8:15 AM" ? "8:00 AM" : $time;
}

function computeSlotCounts($dataDir, $allowedTimes) {
    $prefsFile = $dataDir . "/preferences.json";
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

    return $counts;
}

$dataDir = projectDataDir();
$cacheFile = $dataDir . "/slot-counts.json";
$allowedTimes = ["6:00 AM", "7:00 AM", "8:00 AM", "12:00 PM", "6:00 PM", "9:00 PM"];

// Try cache first (fast path)
if (is_file($cacheFile)) {
    $cached = readJsonFile($cacheFile, null);
    if (is_array($cached)) {
        echo json_encode($cached, JSON_PRETTY_PRINT);
        exit;
    }
}

// Fallback: compute live if cache is missing
$counts = computeSlotCounts($dataDir, $allowedTimes);
echo json_encode($counts, JSON_PRETTY_PRINT);
