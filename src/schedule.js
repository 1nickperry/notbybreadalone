const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const TIME_ZONE = "America/Denver";
const sendScript = path.join(__dirname, "send.js");
const root = path.join(__dirname, "..");
const prefsPath = path.join(root, "data", "preferences.json");
const DEFAULT_SLOT = "8:15 AM";
const ALL_SLOTS = [
  "6:00 AM",
  "7:00 AM",
  "8:15 AM",
  "12:00 PM",
  "6:00 PM",
  "9:00 PM",
];

function partsInZone(date) {
  const parts = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return parts;
}

function zonedTimeToUtc(year, month, day, hour, minute) {
  const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let guess = wanted;
  for (let i = 0; i < 3; i += 1) {
    const map = {};
    for (const part of format.formatToParts(new Date(guess))) {
      if (part.type !== "literal") map[part.type] = part.value;
    }
    const asUtc = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour),
      Number(map.minute),
      Number(map.second)
    );
    guess -= asUtc - wanted;
  }
  return new Date(guess);
}

function parseSlot(slot) {
  const match = String(slot || "").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const mer = match[3].toUpperCase();
  if (hour === 12) hour = 0;
  if (mer === "PM") hour += 12;
  return { hour, minute };
}

function readActiveSlots() {
  const slots = new Set([DEFAULT_SLOT]);
  try {
    const prefs = JSON.parse(fs.readFileSync(prefsPath, "utf8"));
    if (prefs && typeof prefs === "object" && !Array.isArray(prefs)) {
      for (const entry of Object.values(prefs)) {
        if (entry && typeof entry.time === "string" && ALL_SLOTS.includes(entry.time)) {
          slots.add(entry.time);
        }
      }
    }
  } catch {
    // No preferences yet
  }
  return [...slots];
}

function nextSlot(from = new Date()) {
  const today = partsInZone(from);
  const year = Number(today.year);
  const month = Number(today.month);
  const day = Number(today.day);
  let best = null;

  for (const label of readActiveSlots()) {
    const parsed = parseSlot(label);
    if (!parsed) continue;
    let target = zonedTimeToUtc(year, month, day, parsed.hour, parsed.minute);
    if (target.getTime() <= from.getTime()) {
      const tomorrow = partsInZone(new Date(target.getTime() + 36 * 60 * 60 * 1000));
      target = zonedTimeToUtc(
        Number(tomorrow.year),
        Number(tomorrow.month),
        Number(tomorrow.day),
        parsed.hour,
        parsed.minute
      );
    }
    if (!best || target.getTime() < best.when.getTime()) {
      best = { when: target, slot: label };
    }
  }

  if (!best) {
    const parsed = parseSlot(DEFAULT_SLOT);
    let target = zonedTimeToUtc(year, month, day, parsed.hour, parsed.minute);
    if (target.getTime() <= from.getTime()) {
      const tomorrow = partsInZone(new Date(target.getTime() + 36 * 60 * 60 * 1000));
      target = zonedTimeToUtc(
        Number(tomorrow.year),
        Number(tomorrow.month),
        Number(tomorrow.day),
        parsed.hour,
        parsed.minute
      );
    }
    best = { when: target, slot: DEFAULT_SLOT };
  }
  return best;
}

function sendVerse(slot) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [sendScript, "--slot", slot], { stdio: "inherit" });
    child.on("exit", () => resolve());
  });
}

function arm() {
  const { when, slot } = nextSlot();
  const delay = Math.max(0, when.getTime() - Date.now());
  const minutes = Math.round(delay / 60000);
  console.log(
    `Timer set. Next text at ${slot} ${TIME_ZONE} (${when.toISOString()}, in ${minutes} min).`
  );
  setTimeout(async () => {
    try {
      await sendVerse(slot);
    } catch (error) {
      console.error(error.message);
    }
    arm();
  }, delay);
}

arm();
