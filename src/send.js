const fs = require("fs");
const path = require("path");
const { readNumbers } = require("./numbers");

const root = path.join(__dirname, "..");
const versesPath = path.join(root, "data", "verses.json");
const statePath = path.join(root, "data", "last-sent.json");
const prefsPath = path.join(root, "data", "preferences.json");
const logPath = path.join(root, "data", "log.txt");
const TIME_ZONE = "America/Denver";
const DEFAULT_SLOT = "8:00 AM";

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

function slotToHour(slot) {
  const match = String(slot || "").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const mer = match[3].toUpperCase();
  if (hour === 12) hour = 0;
  if (mer === "PM") hour += 12;
  return hour;
}

function hourToSlot(hour) {
  const map = {
    6: "6:00 AM",
    7: "7:00 AM",
    8: "8:00 AM",
    12: "12:00 PM",
    18: "6:00 PM",
    21: "9:00 PM",
  };
  return map[hour] || null;
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
    if (prefs && typeof prefs === "object" && !Array.isArray(prefs)) return prefs;
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
      device_id: simCardId,
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
  const simCardId = Number(process.env.SIM_CARD_ID || "2366");
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
  const hour = denverHour();

  let activeSlot = slotArg;
  if (!activeSlot) {
    activeSlot = hourToSlot(hour) || DEFAULT_SLOT;
  }
  const activeHour = slotToHour(activeSlot);

  if (!force && !dryRun && activeHour !== hour) {
    log(
      `Waiting for ${activeSlot} ${TIME_ZONE}. It is ${String(hour).padStart(2, "0")}:00 there now.`
    );
    return;
  }

  if (!force && !dryRun && !slotArg && !hourToSlot(hour)) {
    log(`No delivery slot at hour ${hour} ${TIME_ZONE}.`);
    return;
  }

  let recipients = phones;
  if (!(force && !slotArg)) {
    recipients = phones.filter((phone) => {
      const pref = prefs[phone];
      const preferred = pref && typeof pref.time === "string" ? pref.time : DEFAULT_SLOT;
      return preferred === activeSlot;
    });
  }

  if (recipients.length === 0) {
    log(`No recipients for slot ${activeSlot}.`);
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
    console.log(
      `\n(${verses.length} verses available, SIM ${simCardId}, ${TIME_ZONE} ${today}, slot ${activeSlot}, ${recipients.length} recipients)`
    );
    return;
  }

  let failed = 0;
  for (const phone of recipients) {
    const result = await sendSms({ apiKey, phone, text, simCardId });
    if (!result.ok) {
      failed += 1;
      log(`Failed to text ${verse.reference} to ${phone}: ${result.message || "unknown error"}`);
      continue;
    }
    const status = result.queued ? "queued" : "sent";
    log(`${status} ${verse.reference} to ${phone} via device ${simCardId} (${activeSlot})`);
  }

  if (failed === recipients.length) {
    process.exitCode = 1;
    return;
  }

  const nextSlots = { ...slotsState, [today]: { ...todaySlots, [activeSlot]: verse.reference } };
  writeState({
    date: today,
    reference: verse.reference,
    sentAt: new Date().toISOString(),
    count: recipients.length - failed,
    slot: activeSlot,
    slots: nextSlots,
  });
}

main().catch((error) => {
  log(error.message);
  process.exitCode = 1;
});
