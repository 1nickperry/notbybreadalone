// Persistent TextLink opt-out tracking for the Daily Verse poller.
// State lives in data/opted-out.json (VPS-local). The Hostinger sync only
// copies preferences.json and numbers.json, so it never touches this file.
const fs = require("fs");
const path = require("path");

const optOutPath =
  process.env.DV_OPT_OUT_PATH || path.join(__dirname, "..", "data", "opted-out.json");
const ALERT_RETRY_MS = 60 * 60 * 1000; // retry a failed alert at most hourly

function isOptOutMessage(message) {
  return /opted[\s-]?out|unsubscribed/i.test(String(message || ""));
}

function readOptOuts() {
  try {
    const data = JSON.parse(fs.readFileSync(optOutPath, "utf8"));
    if (data && typeof data === "object" && !Array.isArray(data)) return data;
  } catch {
    // missing or unreadable: treat as empty
  }
  return {};
}

function writeOptOuts(data) {
  fs.mkdirSync(path.dirname(optOutPath), { recursive: true });
  const tmp = `${optOutPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, optOutPath);
}

// A number re-signed up on the site after we marked it opted out.
function resubscribedSince(entry, pref) {
  if (!entry || !pref || !pref.updatedAt) return false;
  const updated = Date.parse(pref.updatedAt);
  const marked = Date.parse(entry.optedOutAt);
  return Number.isFinite(updated) && Number.isFinite(marked) && updated > marked;
}

// Decide whether to skip a phone this slot.
// Returns { skip: boolean, reason: string|null }
function shouldSkip(phone, optOuts, prefs) {
  const entry = optOuts[phone];
  if (!entry) return { skip: false, reason: null };
  if (resubscribedSince(entry, prefs && prefs[phone])) {
    // Allow one real attempt. If TextLink refuses again, markOptedOut bumps
    // optedOutAt so it will not try again until another re-signup.
    return { skip: false, reason: "resubscribed" };
  }
  return { skip: true, reason: "opted-out" };
}

function markOptedOut(optOuts, phone, message, now = new Date()) {
  const existing = optOuts[phone];
  if (existing) {
    // Already known (for example a re-signup attempt that failed again).
    // Refresh the timestamp, never re-alert.
    optOuts[phone] = {
      ...existing,
      optedOutAt: now.toISOString(),
      lastMessage: String(message || ""),
      refusals: (existing.refusals || 1) + 1,
    };
    return { isNew: false };
  }
  optOuts[phone] = {
    optedOutAt: now.toISOString(),
    firstSeenAt: now.toISOString(),
    lastMessage: String(message || ""),
    refusals: 1,
    source: "textlink-refusal",
    alerted: false,
  };
  return { isNew: true };
}

function clearOptOut(optOuts, phone) {
  if (!optOuts[phone]) return false;
  delete optOuts[phone];
  return true;
}

function maskPhone(phone) {
  const s = String(phone || "");
  return s.length > 4 ? `...${s.slice(-4)}` : s;
}

async function postAlert({ url, secret, phone, entry, fetchImpl = fetch }) {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-dv-secret": secret || "" },
    body: JSON.stringify({
      kind: "daily_verse_opt_out",
      phone,
      optedOutAt: entry.optedOutAt,
      message: entry.lastMessage,
    }),
  });
  if (!res.ok) throw new Error(`alert webhook HTTP ${res.status}`);
  return true;
}

// Send one alert per newly opted-out number that has not been alerted yet.
async function flushAlerts({ optOuts, log, now = new Date(), fetchImpl = fetch }) {
  const url = process.env.DV_ALERT_WEBHOOK_URL;
  const secret = process.env.DV_ALERT_SECRET;
  let changed = false;
  for (const [phone, entry] of Object.entries(optOuts)) {
    if (!entry || entry.alerted !== false) continue;
    const last = Date.parse(entry.lastAlertAttemptAt || "");
    if (Number.isFinite(last) && now.getTime() - last < ALERT_RETRY_MS) continue;
    if (!url) {
      log(`Opt-out alert pending for ${phone}: DV_ALERT_WEBHOOK_URL not set.`);
      entry.lastAlertAttemptAt = now.toISOString();
      changed = true;
      continue;
    }
    entry.lastAlertAttemptAt = now.toISOString();
    changed = true;
    try {
      await postAlert({ url, secret, phone, entry, fetchImpl });
      entry.alerted = true;
      entry.alertedAt = now.toISOString();
      log(`Opt-out alert sent for ${phone} (email via n8n).`);
    } catch (error) {
      log(`Opt-out alert failed for ${phone}: ${error.message}. Will retry in about 1 hour.`);
    }
  }
  return changed;
}

module.exports = {
  optOutPath,
  isOptOutMessage,
  readOptOuts,
  writeOptOuts,
  shouldSkip,
  markOptedOut,
  clearOptOut,
  flushAlerts,
  maskPhone,
};

// CLI: node src/opt-out.js list | clear +1XXXXXXXXXX
if (require.main === module) {
  const [cmd, arg] = process.argv.slice(2);
  const data = readOptOuts();
  if (cmd === "clear" && arg) {
    const ok = clearOptOut(data, arg);
    if (ok) writeOptOuts(data);
    console.log(ok ? `Cleared ${arg}; it will be sent at its next slot.` : `${arg} was not opted out.`);
  } else {
    const rows = Object.entries(data);
    if (rows.length === 0) console.log("No opted-out numbers.");
    for (const [phone, e] of rows) {
      console.log(`${phone}  since ${e.firstSeenAt || e.optedOutAt}  alerted=${e.alerted}  source=${e.source}`);
    }
    if (cmd && cmd !== "list") console.log("Usage: node src/opt-out.js list | clear +1XXXXXXXXXX");
  }
}
