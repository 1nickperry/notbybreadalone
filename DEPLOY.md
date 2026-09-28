# Deploy daily verse to Hostinger (`notbybreadalone.app`)

Account: `u593240408`  
App path on server: `/home/u593240408/morning-bible-verse/`  
Public domain: `https://notbybreadalone.app`

## Document root

Point the site document root at the **`public/`** folder so `/` serves `index.html` and `/add` `/remove` still hit PHP:

- Preferred: set the domain/subdomain document root to  
  `/home/u593240408/morning-bible-verse/public`
- Keep runtime data **outside** the web root at  
  `/home/u593240408/morning-bible-verse/data/`  
  (`numbers.json`, `preferences.json`, `verses.json`, `last-sent.json`, `log.txt`)

`public/add.php` and `public/remove.php` already look for that Hostinger data path first, then fall back to `../data` for local testing.

## What to upload

From this repo, sync at least:

```
public/index.html
public/css/styles.css
public/js/main.js
public/assets/iphone-mockup.png
public/add.php
public/remove.php
public/.htaccess
src/          (schedule + send workers)
data/verses.json
package.json
.env          (create on server from .env.example; never commit)
```

Do **not** overwrite `data/numbers.json` with an empty file. Prefer leaving the live file untouched, or merge carefully.

After first deploy with the new signup form, `data/preferences.json` is created automatically on signup. Shape:

```json
{
  "+17023422909": {
    "version": "KJV",
    "time": "12:00 PM",
    "theme": "Faith",
    "updatedAt": "2026-09-28T16:00:00+00:00"
  }
}
```

`numbers.json` remains a **JSON array of phone strings only**. Preferences live only in `preferences.json`.

## Apache / LiteSpeed

`.htaccess` in `public/` enables:

- `DirectoryIndex index.html`
- `/add` → `add.php`
- `/remove` → `remove.php`

Confirm `mod_rewrite` (or LiteSpeed equivalent) is on. If pretty routes 404, keep calling `/add.php?=…` as a fallback.

## Node sender (cron or long-running)

On the VPS / Node host that already runs the TextLink worker:

```bash
cd /home/u593240408/morning-bible-verse
npm run start          # long-running schedule.js
# or cron every minute:
# * * * * * cd /home/u593240408/morning-bible-verse && node src/send.js
```

### Per-user send times

`src/schedule.js` and `src/send.js` now read `data/preferences.json` when present:

- Default delivery remains **8:00 AM America/Denver** for numbers with no preference.
- If a phone has `"time": "12:00 PM"` (etc.), they are only included when that Mountain Time slot is due.
- Allowed slots: 6:00 AM, 7:00 AM, 8:00 AM, 12:00 PM, 6:00 PM, 9:00 PM.
- `npm run now` / `node src/send.js --now` still texts **everyone** (ops override).
- Theme / Bible version prefs are stored for future verse filtering. The current sender still picks from the shared `verses.json` pool until theme filtering is added.

If you prefer zero risk to the live 8 AM blast, pin an older `schedule.js` / `send.js` and rely on preferences storage only. The marketing site and PHP signup work either way.

## Smoke checks after publish

1. Open `https://notbybreadalone.app/` and confirm hero, phone image, About, Contact.
2. Sign up with a test number: form should call `/add?=1XXXXXXXXXX&version=…&time=…&theme=…` and show success inline.
3. Confirm `data/numbers.json` gained the E.164 string and `data/preferences.json` has the prefs object.
4. Hit `/remove?=1XXXXXXXXXX` and confirm both files drop that phone.
5. Do not wipe production `numbers.json`.

## Local preview

Open this file in a browser (static UI only; signup needs PHP):

`C:\Users\user\Documents\Coding\web-scrape-verse\public\index.html`

Or from the project root with PHP:

```bash
php -S localhost:8080 -t public
```

Then visit `http://localhost:8080/`.
