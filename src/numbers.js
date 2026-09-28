const fs = require("fs");
const path = require("path");

const numbersPath = path.join(__dirname, "..", "data", "numbers.json");

function normalizeNumber(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

function readNumbers() {
  try {
    const list = JSON.parse(fs.readFileSync(numbersPath, "utf8"));
    return Array.isArray(list) ? list.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function addNumber(raw) {
  const phone = normalizeNumber(raw);
  if (!phone) {
    return { ok: false, message: "Send a phone number, like /add?=17023422909" };
  }
  const list = readNumbers();
  if (list.includes(phone)) {
    return { ok: true, phone, added: false, count: list.length };
  }
  list.push(phone);
  fs.mkdirSync(path.dirname(numbersPath), { recursive: true });
  fs.writeFileSync(numbersPath, JSON.stringify(list, null, 2));
  return { ok: true, phone, added: true, count: list.length };
}

module.exports = { numbersPath, normalizeNumber, readNumbers, addNumber };
