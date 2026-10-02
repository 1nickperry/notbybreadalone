const fs = require("fs");
const path = require("path");
const { readNumbers } = require("./numbers");

const root = path.join(__dirname, "..");
const versesPath = path.join(root, "data", "verses.json");
const statePath = path.join(root, "data", "last-sent.json");
const prefsPath = path.join(root, "data", "preferences.json");
const logPath = path.join(root, "data", "log.txt");
const TIME_ZONE = "America/Denver";
const DEFAULT_SLOT = "8:15 AM";
const ALL_SLOTS = [
  "6:00 AM",
  "8:15 AM",
  "12:00 PM",
  "6:00 PM",
];

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function denverParts(date = new Date()) {
  const parts = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return parts;
}

function denverDate(date = new Date()) {
  const parts = denverParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function denverHour(date = new Date()) {
  return Number(denverParts(date).hour);
}

function slotToHourMinute(slot) {
  const match = String(slot || "").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const mer = match[3].toUpperCase();
  if (hour === 12) hour = 0;
  if (mer === "PM") hour += 12;
  return { hour, minute };
}

function slotToHour(slot) {
  const parsed = slotToHourMinute(slot);
  return parsed ? parsed.hour : null;
}

function findActiveSlot(hour, minute) {
  for (const slot of ALL_SLOTS) {
    const parsed = slotToHourMinute(slot);
    if (parsed && parsed.hour === hour && parsed.minute === minute) {
      return slot;
    }
  }
  return null;
}

function isTestMode() {
  return process.env.DV_TEST_MODE === "1" || process.env.DV_TEST_MODE === "true";
}

function formatSlot(hour, minute) {
  let h = hour % 12;
  if (h === 0) h = 12;
  const mer = hour >= 12 ? "PM" : "AM";
  return `${h}:${String(minute).padStart(2, "0")} ${mer}`;
}

function getCurrentTestSlot(date = new Date()) {
  if (!isTestMode()) return null;
  const parts = denverParts(date);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const roundedMinute = Math.floor(minute / 5) * 5;
  return formatSlot(hour, roundedMinute);
}

function isValidTestSlot(slot) {
  if (!isTestMode()) return false;
  const parsed = slotToHourMinute(slot);
  if (!parsed) return false;
  return parsed.minute % 5 === 0;
}

function isSlotActive(slot, hour, minute) {
  const parsed = slotToHourMinute(slot);
  if (!parsed) return false;
  
  return parsed.hour === hour && parsed.minute === minute;
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return {};
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function readPreferences() {
  try {
    const prefs = JSON.parse(fs.readFileSync(prefsPath, "utf8"));
    if (prefs && typeof prefs === "object" && !Array.isArray(prefs)) {
      // Migrate old 8:00 AM to 8:15 AM
      for (const phone in prefs) {
        if (prefs[phone] && prefs[phone].time === "8:00 AM") {
          prefs[phone].time = "8:15 AM";
        }
      }
      return prefs;
    }
  } catch {
    // ignore
  }
  return {};
}

function log(line) {
  const stamp = new Date().toISOString();
  const entry = `${stamp} ${line}\n`;
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, entry);
  console.log(line);
}

function pickVerse(verses, lastReference) {
  const pool =
    verses.length > 1
      ? verses.filter((verse) => verse.reference !== lastReference)
      : verses;
  return pool[Math.floor(Math.random() * pool.length)];
}

function formatVerse(verse) {
  return `${verse.reference}\n${verse.text}`;
}

async function sendSms({ apiKey, phone, text, simCardId }) {
  const response = await fetch("https://textlinksms.com/api/send-sms", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      phone_number: phone,
      text,
      sim_card_id: simCardId,
    }),
  });

  const bodyText = await response.text();
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = { ok: false, message: bodyText || `HTTP ${response.status}` };
  }
  if (!response.ok && body.ok !== false) {
    body = { ok: false, message: body.message || `HTTP ${response.status}` };
  }
  return body;
}

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx === process.argv.length - 1) return null;
  return process.argv[idx + 1];
}

async function main() {
  loadEnv();
  const force = process.argv.includes("--now") || process.argv.includes("--force");
  const dryRun = process.argv.includes("--dry-run");
  const slotArg = argValue("--slot");

  const apiKey = process.env.TEXTLINK_API_KEY;
  const simCardId = Number(process.env.SIM_CARD_ID || "3887");
  const phones = readNumbers();
  if (phones.length === 0 && process.env.RECIPIENT_PHONE) {
    phones.push(process.env.RECIPIENT_PHONE.trim());
  }

  if (!apiKey) {
    throw new Error("TEXTLINK_API_KEY is missing from .env");
  }
  if (!Number.isInteger(simCardId)) {
    throw new Error("SIM_CARD_ID must be a number");
  }
  if (!dryRun && phones.length === 0) {
    throw new Error("No numbers yet. Add one at /add?=17023422909");
  }

  const verses = JSON.parse(fs.readFileSync(versesPath, "utf8"));
  const state = readState();
  const prefs = readPreferences();
  const today = denverDate();
  const parts = denverParts();
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const testMode = isTestMode();

  let activeSlot = slotArg;
  if (!activeSlot) {
    if (testMode) {
      activeSlot = getCurrentTestSlot();
      if (!activeSlot) {
        log(`Test mode: unable to determine current 5-minute slot`);
        return;
      }
    } else {
      activeSlot = findActiveSlot(hour, minute);
      if (!activeSlot) {
        log(`No delivery slot at hour ${hour}:${String(minute).padStart(2, "0")} ${TIME_ZONE}. Active slots: ${ALL_SLOTS.join(", ")}`);
        return;
      }
    }
  }

  if (!force && !dryRun) {
    if (!isSlotActive(activeSlot, hour, minute)) {
      const parsed = slotToHourMinute(activeSlot);
      if (testMode) {
        log(
          `Waiting for ${activeSlot} ${TIME_ZONE}. It is ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} there now. (test mode: 5-min intervals)`
        );
      } else {
        log(
          `Waiting for ${activeSlot} ${TIME_ZONE}. It is ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} there now.`
        );
      }
      return;
    }
  }

  if (!force && !dryRun && !slotArg && !testMode && !findActiveSlot(hour, minute)) {
    log(`No delivery slot at hour ${hour}:${String(minute).padStart(2, "0")} ${TIME_ZONE}. Active slots: ${ALL_SLOTS.join(", ")}`);
    return;
  }

  let recipients = phones;
  if (!(force && !slotArg)) {
    recipients = phones.filter((phone) => {
      const pref = prefs[phone];
      const preferred = pref && typeof pref.time === "string" ? pref.time : DEFAULT_SLOT;
      
      if (testMode) {
        if (isValidTestSlot(preferred)) {
          return preferred === activeSlot;
        }
        if (ALL_SLOTS.includes(preferred)) {
          return false;
        }
        return preferred === activeSlot;
      }
      
      if (!ALL_SLOTS.includes(preferred)) {
        return false;
      }
      return preferred === activeSlot;
    });
  }

  if (recipients.length === 0) {
    if (testMode) {
      log(`No recipients for slot ${activeSlot} (test mode: 5-min boundaries).`);
    } else {
      log(`No recipients for slot ${activeSlot}.`);
    }
    return;
  }

  const slotsState = state.slots && typeof state.slots === "object" ? state.slots : {};
  const todaySlots =
    slotsState[today] && typeof slotsState[today] === "object" ? slotsState[today] : {};
  if (!force && !dryRun && todaySlots[activeSlot]) {
    log(
      `Already sent for ${activeSlot} today (${today}): ${todaySlots[activeSlot]}. Use --now to send another.`
    );
    return;
  }

  if (
    !force &&
    !dryRun &&
    state.date === today &&
    !state.slots &&
    activeSlot === DEFAULT_SLOT
  ) {
    log(`Already sent ${state.reference} today (${today}). Use --now to send another.`);
    return;
  }

  const verse = pickVerse(verses, state.reference || todaySlots[activeSlot]);
  const text = formatVerse(verse);

  if (dryRun) {
    console.log(text);
    const mode = testMode ? ", test mode: 5-min" : "";
    console.log(
      `\n(${verses.length} verses available, SIM ${simCardId}, ${TIME_ZONE} ${today}, slot ${activeSlot}, ${recipients.length} recipients${mode})`
    );
    return;
  }

  const modeTag = testMode ? " [TEST]" : "";
  const failedPhones = [];
  let sentCount = 0;

  async function deliverOne(phone, attempt) {
    const result = await sendSms({ apiKey, phone, text, simCardId });
    if (!result.ok) {
      const attemptLabel = attempt > 1 ? " (retry)" : "";
      log(
        `Failed to text ${verse.reference} to ${phone}${attemptLabel}: ${result.message || "unknown error"}`
      );
      return false;
    }
    const status = result.queued ? "queued" : "sent";
    const attemptLabel = attempt > 1 ? " retry" : "";
    log(
      `${status} ${verse.reference} to ${phone} via sim_card_id ${simCardId} (${activeSlot}${modeTag}${attemptLabel})`
    );
    return true;
  }

  // Burst the whole slot cohort; TextLink may fan out over a few seconds.
  for (const phone of recipients) {
    const ok = await deliverOne(phone, 1);
    if (ok) sentCount += 1;
    else failedPhones.push(phone);
  }

  // One retry for failures only (no double-send to successes).
  if (failedPhones.length > 0) {
    log(`Retrying ${failedPhones.length} failed recipient(s) once for slot ${activeSlot}.`);
    const stillFailed = [];
    for (const phone of failedPhones) {
      const ok = await deliverOne(phone, 2);
      if (ok) sentCount += 1;
      else stillFailed.push(phone);
    }
    failedPhones.length = 0;
    failedPhones.push(...stillFailed);
  }

  if (sentCount === 0) {
    process.exitCode = 1;
    return;
  }

  const nextSlots = { ...slotsState, [today]: { ...todaySlots, [activeSlot]: verse.reference } };
  writeState({
    date: today,
    reference: verse.reference,
    sentAt: new Date().toISOString(),
    count: sentCount,
    slot: activeSlot,
    slots: nextSlots,
    failedCount: failedPhones.length,
  });

  if (failedPhones.length > 0) {
    log(
      `Slot ${activeSlot} partial: ${sentCount} sent, ${failedPhones.length} still failed after retry.`
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  log(error.message);
  process.exitCode = 1;
});
