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

### Environment variables

Create `.env` on the server from `.env.example` with:

- **`TEXTLINK_API_KEY`** - Your TextLink API key
- **`SIM_CARD_ID`** - TextLink SIM card ID (the `sim_card_id` field from TextLink dashboard), NOT the device row ID. For US SMS to +17023422909, use `3874`.
- **`RECIPIENT_PHONE`** - (Optional) Single test recipient in E.164 format
- **`GOOGLE_SHEETS_WEBHOOK_URL`** - (Optional) Apps Script webhook for subscribe/unsubscribe logging
- **`DV_TEST_MODE`** - (Optional) Set to `1` or `true` for 5-minute test intervals; leave unset for production

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

## Node sender (cron recommended)

### Production: Cron every minute (recommended)

Hostinger shared hosting cron setup (via hPanel → Advanced → Cron Jobs):

```bash
* * * * * cd /home/u593240408/morning-bible-verse && /usr/bin/node src/send.js >> data/cron-send.log 2>&1
```

**Why cron-every-minute wins:**
- Survives PHP/Node process restarts automatically
- No need to keep a long-running process alive
- `send.js` is idempotent: checks Denver hour/minute against active slots
- Only sends when the current minute matches a slot time (e.g., 8:00, 12:00)
- Skips silently at all other minutes with clear logging

**Logs:**
- View `data/cron-send.log` for all cron runs
- View `data/log.txt` for successful sends and errors

### Alternative: Long-running schedule.js

If you prefer a persistent process (e.g., on a VPS):

```bash
cd /home/u593240408/morning-bible-verse
npm run start          # runs schedule.js with setTimeout scheduling
```

**Caveats:**
- Must stay running 24/7 (use systemd, PM2, or screen)
- Hostinger shared hosting may kill idle processes
- Fragile to process crashes; prefer cron for reliability

### Per-user send times

`src/schedule.js` and `src/send.js` now read `data/preferences.json` when present:

- Default delivery remains **8:00 AM America/Denver** for numbers with no preference.
- If a phone has `"time": "12:00 PM"` (etc.), they are only included when that Mountain Time slot is due.
- **Production allowed slots:** 6:00 AM, 7:00 AM, 8:00 AM, 12:00 PM, 6:00 PM, 9:00 PM.
- `npm run now` / `node src/send.js --now` still texts **everyone** (ops override).
- Theme / Bible version prefs are stored for future verse filtering. The current sender still picks from the shared `verses.json` pool until theme filtering is added.

### Test mode (5-minute intervals)

For testing with temporary SMS numbers before deploying changes:

1. Set environment variable `DV_TEST_MODE=1` in `.env`
2. Add a test preference with a 5-minute boundary time:
   ```json
   {
     "+15551234567": {
       "time": "1:05 PM",
       "version": "KJV",
       "theme": "Faith"
     }
   }
   ```
3. Wait for the next 5-minute mark (e.g., 1:05 PM Mountain Time)
4. Send will trigger automatically via cron, or manually: `node src/send.js`

**Test mode behavior:**
- Allows times on 5-minute boundaries: 1:00 PM, 1:05 PM, 1:10 PM, etc.
- Ignores production slots (6 AM, 7 AM, etc.) unless recipients have those exact times
- Logs include `[TEST]` tag for visibility
- Cron every minute still works; just checks every 5 minutes instead of every hour

**Production safety:**
- Remove or unset `DV_TEST_MODE` from `.env` before deploying to production
- Production mode ONLY accepts the 6 marketing slots listed above
- Test preferences with 5-minute times are silently skipped in production mode

**Use case:** Test with free temporary SMS numbers from services like receive-sms.com or smsreceivefree.com before deploying preference changes to production.

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
