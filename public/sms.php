<?php
/**
 * Shared SMS helper for Daily Verse TextLink API calls.
 */

/**
 * Send an SMS via the TextLink API.
 *
 * @param string $phone E.164 phone number (e.g. +17023422909)
 * @param string $text  Message body (prefer ≤160 GSM-7 characters)
 * @param array  $env   Environment variables (must include TEXTLINK_API_KEY)
 * @return array Result: ["ok" => bool, "message" => string]
 */
function dv_send_sms($phone, $text, $env) {
    if (empty($env["TEXTLINK_API_KEY"])) {
        return ["ok" => false, "message" => "TEXTLINK_API_KEY not set"];
    }

    $payload = json_encode([
        "phone_number" => $phone,
        "text" => $text,
        "sim_card_id" => (int) ($env["SIM_CARD_ID"] ?? 3066),
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
        $reason = is_array($result) && isset($result["message"]) ? $result["message"] : "text failed";
        return ["ok" => false, "message" => $reason];
    }

    return ["ok" => true, "message" => "sent"];
}
