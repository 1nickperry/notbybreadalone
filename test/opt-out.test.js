// Dry-run test of the opt-out handler with a mocked TextLink and alert webhook.
// Runs src/send.js in a temp copy so no real data or SMS is touched.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const assert = require("assert");

const repo = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dv-optout-"));
fs.mkdirSync(path.join(tmp, "src"));
fs.mkdirSync(path.join(tmp, "data"));
for (const f of ["send.js", "numbers.js", "opt-out.js"]) {
  fs.copyFileSync(path.join(repo, "src", f), path.join(tmp, "src", f));
}
fs.writeFileSync(path.join(tmp, "data", "verses.json"), JSON.stringify([
  { reference: "John 3:16", text: "For God so loved the world" },
  { reference: "Psalm 23:1", text: "The Lord is my shepherd" },
]));
const A = "+15550000001", B = "+15550000002", C = "+15550000003";
fs.writeFileSync(path.join(tmp, "data", "numbers.json"), JSON.stringify([A, B, C]));
const prefs = {
  [A]: { time: "8:00 AM", updatedAt: "2026-10-01T00:00:00+00:00" },
  [B]: { time: "8:00 AM", updatedAt: "2026-10-01T00:00:00+00:00" },
  [C]: { time: "8:00 AM", updatedAt: "2026-10-01T00:00:00+00:00" },
};
fs.writeFileSync(path.join(tmp, "data", "preferences.json"), JSON.stringify(prefs));
fs.writeFileSync(path.join(tmp, ".env"),
  "TEXTLINK_API_KEY=mock\nSIM_CARD_ID=3887\nDV_ALERT_WEBHOOK_URL=https://mock.invalid/alert\nDV_ALERT_SECRET=s\n");

// Mock: B always opted out, C opted out until "C_OK" flag file exists.
const calls = path.join(tmp, "calls.jsonl");
fs.writeFileSync(path.join(tmp, "mock.js"), `
const fs=require("fs");
global.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body);
  fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify({url, body})+"\\n");
  if (url.includes("mock.invalid/alert")) return { ok: true, status: 200, text: async()=>"{}" };
  if (!url.includes("textlinksms.com")) throw new Error("unexpected url "+url);
  const out = (body.phone_number === "${B}" || (body.phone_number === "${C}" && !fs.existsSync(${JSON.stringify(path.join(tmp, "C_OK"))})))
    ? { ok:false, message:"User has opted out, you can not send them any more messages." }
    : { ok:true };
  return { ok: true, status: 200, text: async()=>JSON.stringify(out) };
};`);

function run() {
  fs.writeFileSync(calls, "");
  try {
    execFileSync("node", ["-r", path.join(tmp, "mock.js"), "src/send.js", "--now", "--slot", "8:00 AM"],
      { cwd: tmp, env: { ...process.env, DV_OPT_OUT_PATH: "" , TZ: "America/Denver" }, stdio: "pipe" });
  } catch (e) { /* exitCode 1 expected when some fail */ }
  return fs.readFileSync(calls, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
}
const optPath = path.join(tmp, "data", "opted-out.json");
const sms = (c) => c.filter((x) => x.url.includes("textlink")).map((x) => x.body.phone_number);
const alerts = (c) => c.filter((x) => x.url.includes("alert")).map((x) => x.body.phone);

// Run 1: B and C refused once each (no in-slot retry), one alert each.
let c = run();
assert.deepStrictEqual(sms(c).sort(), [A, B, C].sort(), "run1 sends each once, no retry");
assert.deepStrictEqual(alerts(c).sort(), [B, C].sort(), "run1 alerts B and C once");
let st = JSON.parse(fs.readFileSync(optPath, "utf8"));
assert.ok(st[B].alerted && st[C].alerted, "both marked alerted");
console.log("PASS run1: refusal marks opted out, no retry in slot, one alert each");

// Run 2: B and C skipped, no alerts.
c = run();
assert.deepStrictEqual(sms(c), [A], "run2 only sends A");
assert.deepStrictEqual(alerts(c), [], "run2 no alerts");
console.log("PASS run2: opted-out numbers skipped next slot, no repeat alert");

// Run 3: C re-signs up on site and TextLink now accepts: one attempt, mark cleared.
fs.writeFileSync(path.join(tmp, "C_OK"), "");
st = JSON.parse(fs.readFileSync(optPath, "utf8"));
st[C].optedOutAt = "2026-10-01T00:00:01.000Z"; fs.writeFileSync(optPath, JSON.stringify(st));
prefs[C].updatedAt = new Date(Date.now() - 500).toISOString();
fs.writeFileSync(path.join(tmp, "data", "preferences.json"), JSON.stringify(prefs));
c = run();
assert.deepStrictEqual(sms(c).sort(), [A, C].sort(), "run3 tries C after re-signup");
st = JSON.parse(fs.readFileSync(optPath, "utf8"));
assert.ok(!st[C] && st[B], "C cleared, B still opted out");
assert.deepStrictEqual(alerts(c), [], "run3 no alerts");
console.log("PASS run3: re-signup gets one attempt, success auto-clears");

// Run 4: B re-signs up but TextLink still refuses: one attempt, no alert, then skipped again.
prefs[B].updatedAt = new Date(Date.now() - 1000).toISOString();
fs.writeFileSync(path.join(tmp, "data", "preferences.json"), JSON.stringify(prefs));
// make optedOutAt older than the new updatedAt
st = JSON.parse(fs.readFileSync(optPath, "utf8"));
st[B].optedOutAt = "2026-10-01T00:00:01.000Z"; fs.writeFileSync(optPath, JSON.stringify(st));
c = run();
assert.ok(sms(c).includes(B) && sms(c).filter((p) => p === B).length === 1, "run4 one B attempt");
assert.deepStrictEqual(alerts(c), [], "run4 no re-alert");
c = run();
assert.ok(!sms(c).includes(B), "run5 B skipped again");
console.log("PASS run4/5: failed re-signup attempt does not re-alert and goes back to skipped");

// Seeded entry (alerted:true) never alerts.
const oo = require(path.join(tmp, "src", "opt-out.js"));
assert.ok(oo.isOptOutMessage("User has opted out, you can not send them any more messages."));
assert.ok(!oo.isOptOutMessage("Device offline"));
console.log("PASS matcher");
fs.rmSync(tmp, { recursive: true, force: true });
console.log("ALL TESTS PASSED");
