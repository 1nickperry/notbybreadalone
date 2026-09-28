<?php
/**
 * Shared subscribe/unsubscribe activity logger for Daily Verse.
 * Appends to activity-log.json and activity-log.csv under the data dir.
 * Optionally POSTs to GOOGLE_SHEETS_WEBHOOK_URL when set in .env.
 * Failures here must never break add.php / remove.php responses.
 */

if (!function_exists("dv_activity_load_env")) {
    function dv_activity_load_env() {
        static $cached = null;
        if ($cached !== null) {
            return $cached;
        }
        $parseEnvFile = static function ($envFile) {
            $values = [];
            if (!is_file($envFile)) {
                return $values;
            }
            foreach (file($envFile, FILE_IGNORE_NEW_LINES) as $line) {
                $line = trim($line);
                if ($line === "" || $line[0] === "#" || strpos($line, "=") === false) {
                    continue;
                }
                [$key, $value] = explode("=", $line, 2);
                $values[trim($key)] = trim($value);
            }
            return $values;
        };

        // Preserve the existing search order and first-match behavior.
        $candidates = [
            "/home/u593240408/morning-bible-verse/.env",
            dirname(__DIR__) . "/.env",
        ];
        $env = [];
        foreach ($candidates as $envFile) {
            if (!is_file($envFile)) {
                continue;
            }
            $env = $parseEnvFile($envFile);
            break;
        }

        // Allow a public_html-local .env to add or override settings.
        $env = array_merge($env, $parseEnvFile(__DIR__ . "/.env"));

        // A deployed sidecar file is the final override for this webhook.
        $webhookFile = __DIR__ . "/sheets-webhook.url";
        if (is_file($webhookFile)) {
            $lines = file($webhookFile, FILE_IGNORE_NEW_LINES);
            if ($lines !== false && isset($lines[0])) {
                $webhook = trim($lines[0]);
                if ($webhook !== "") {
                    $env["GOOGLE_SHEETS_WEBHOOK_URL"] = $webhook;
                }
            }
        }

        $cached = $env;
        return $env;
    }
}

if (!function_exists("dv_log_activity")) {
    /**
     * @param string $dataDir Absolute path to data directory
     * @param array $fields Keys: action, phone, status, version, time, theme, reason, list_count
     */
    function dv_log_activity($dataDir, $fields) {
        try {
            if (!is_dir($dataDir)) {
                @mkdir($dataDir, 0755, true);
            }

            $timestamp = gmdate("c");
            $event = [
                "timestamp_utc" => $timestamp,
                "action" => (string) ($fields["action"] ?? ""),
                "phone" => (string) ($fields["phone"] ?? ""),
                "status" => (string) ($fields["status"] ?? ""),
                "version" => (string) ($fields["version"] ?? ""),
                "time" => (string) ($fields["time"] ?? ""),
                "theme" => (string) ($fields["theme"] ?? ""),
                "reason" => (string) ($fields["reason"] ?? ""),
                "list_count" => isset($fields["list_count"]) ? (int) $fields["list_count"] : 0,
            ];

            // JSON array append
            $jsonFile = rtrim($dataDir, "/") . "/activity-log.json";
            $events = [];
            if (is_file($jsonFile)) {
                $decoded = json_decode(file_get_contents($jsonFile), true);
                if (is_array($decoded)) {
                    $events = $decoded;
                }
            }
            $events[] = $event;
            file_put_contents(
                $jsonFile,
                json_encode($events, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n",
                LOCK_EX
            );

            // CSV append (header if new)
            $csvFile = rtrim($dataDir, "/") . "/activity-log.csv";
            $csvHeader = "timestamp_utc,action,phone,status,version,time,theme,reason,list_count";
            $needHeader = !is_file($csvFile) || filesize($csvFile) === 0;
            $fp = fopen($csvFile, "a");
            if ($fp !== false) {
                if (flock($fp, LOCK_EX)) {
                    if ($needHeader) {
                        fputcsv($fp, explode(",", $csvHeader));
                    }
                    fputcsv($fp, [
                        $event["timestamp_utc"],
                        $event["action"],
                        $event["phone"],
                        $event["status"],
                        $event["version"],
                        $event["time"],
                        $event["theme"],
                        $event["reason"],
                        $event["list_count"],
                    ]);
                    flock($fp, LOCK_UN);
                }
                fclose($fp);
            }

            // Optional Google Sheets webhook; never fail the caller
            $env = dv_activity_load_env();
            $webhook = isset($env["GOOGLE_SHEETS_WEBHOOK_URL"]) ? trim($env["GOOGLE_SHEETS_WEBHOOK_URL"]) : "";
            if ($webhook !== "") {
                $payload = json_encode($event);
                $context = stream_context_create([
                    "http" => [
                        "method" => "POST",
                        "header" => "Content-Type: application/json\r\n",
                        "content" => $payload,
                        "timeout" => 5,
                        "ignore_errors" => true,
                    ],
                ]);
                @file_get_contents($webhook, false, $context);
            }
        } catch (Throwable $e) {
            // Swallow: logging must not break subscribe/unsubscribe
        }
    }
}
