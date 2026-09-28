const fs = require("fs");
const path = require("path");

const htmlPath = path.join(__dirname, "..", "POPULAR BIBLE VERSES.html");
const outPath = path.join(__dirname, "..", "data", "verses.json");

const html = fs.readFileSync(htmlPath, "latin1");
const re =
  /<dt>[\s\S]*?title='([^']+)'[\s\S]*?<\/dt>\s*<dd><p>([\s\S]*?)<\/p><\/dd>/g;

function decode(text) {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim();
}

const verses = [];
const seen = new Set();
let match;
while ((match = re.exec(html))) {
  const reference = decode(match[1]);
  const text = decode(match[2]);
  if (!reference || !text || seen.has(reference)) continue;
  seen.add(reference);
  verses.push({ reference, text });
}

if (verses.length < 50) {
  throw new Error(`Only parsed ${verses.length} verses. The page format may have changed.`);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(verses, null, 2));
console.log(`Wrote ${verses.length} verses to ${outPath}`);
