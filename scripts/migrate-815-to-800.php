#!/usr/bin/env php
<?php
/**
 * One-time migration: 8:15 AM → 8:00 AM slot rename
 * 
 * Run this ONCE on Hostinger after deploying the updated code.
 * 
 * Usage:
 *   php scripts/migrate-815-to-800.php [--dry-run]
 * 
 * What it does:
 *   - Reads /home/u593240408/morning-bible-verse/data/preferences.json
 *   - Rewrites any preference with time "8:15 AM" → "8:00 AM"
 *   - Writes back to preferences.json with backup
 *   - Refreshes slot-counts.json cache
 * 
 * Safe to run multiple times (idempotent).
 */

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

$dryRun = in_array("--dry-run", $argv, true);

$dataDir = projectDataDir();
$prefsFile = $dataDir . "/preferences.json";
$cacheFile = $dataDir . "/slot-counts.json";

if (!is_file($prefsFile)) {
    echo "No preferences.json found at $prefsFile - nothing to migrate.\n";
    exit(0);
}

echo "Reading preferences from $prefsFile\n";
$prefs = readJsonFile($prefsFile, []);

if (!is_array($prefs) || count($prefs) === 0) {
    echo "Preferences file is empty or invalid - nothing to migrate.\n";
    exit(0);
}

$migrated = 0;
foreach ($prefs as $phone => $entry) {
    if (is_array($entry) && isset($entry["time"]) && $entry["time"] === "8:15 AM") {
        $prefs[$phone]["time"] = "8:00 AM";
        $migrated++;
        echo "  $phone: 8:15 AM → 8:00 AM\n";
    }
}

if ($migrated === 0) {
    echo "No preferences needed migration (no 8:15 AM slots found).\n";
    exit(0);
}

echo "\nTotal migrated: $migrated phone(s)\n";

if ($dryRun) {
    echo "[DRY RUN] Would write preferences.json and refresh slot-counts.json. Run without --dry-run to apply.\n";
    exit(0);
}

// Backup before writing
$backupFile = $prefsFile . ".backup-" . gmdate("YmdHis");
if (is_file($prefsFile)) {
    copy($prefsFile, $backupFile);
    echo "Backed up original to $backupFile\n";
}

// Write migrated preferences
writeJsonFile($prefsFile, $prefs);
echo "Updated $prefsFile\n";

// Refresh slot counts cache
$allowedTimes = ["6:00 AM", "7:00 AM", "8:00 AM", "12:00 PM", "6:00 PM", "9:00 PM"];
$counts = array_fill_keys($allowedTimes, 0);

foreach ($prefs as $phone => $entry) {
    if (is_array($entry) && isset($entry["time"]) && in_array($entry["time"], $allowedTimes, true)) {
        $counts[$entry["time"]] += 1;
    }
}

writeJsonFile($cacheFile, $counts);
echo "Refreshed $cacheFile\n";

echo "\nMigration complete. All 8:15 AM subscribers now receive at 8:00 AM.\n";
