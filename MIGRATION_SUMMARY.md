# Slot Migration: 8:15 AM → 8:00 AM

**Vikunja Task #134**: Fix slot display/timing mismatch where users selecting "8:00-8:10 AM" were actually receiving texts at 8:15 AM.

## Problem

The frontend displayed "8:00-8:10 AM" in the signup form, but the actual slot value was "8:15 AM". Users thought they were signing up for 8:00 AM but were receiving messages at 8:15 AM.

## Solution

Changed the actual slot time from **8:15 AM** to **8:00 AM** everywhere in the codebase, making the value match the display.

## Files Changed

### Backend (Node.js)
- **src/send.js**
  - Changed `DEFAULT_SLOT` from "8:15 AM" to "8:00 AM"
  - Changed `ALL_SLOTS` array to include "8:00 AM" instead of "8:15 AM"
  - Updated `readPreferences()` migration logic to convert "8:15 AM" → "8:00 AM" (reversed from old migration)

- **src/schedule.js**
  - Changed `DEFAULT_SLOT` from "8:15 AM" to "8:00 AM"
  - Changed `ALL_SLOTS` array to include "8:00 AM" instead of "8:15 AM"

### Backend (PHP)
- **public/add.php**
  - Updated `$allowedTimes` array: "8:00 AM" instead of "8:15 AM"
  - Reversed migration logic: "8:15 AM" → "8:00 AM" (was "8:00 AM" → "8:15 AM")
  - Updated `refreshSlotCountsCache()` to use new slot and migration

- **public/remove.php**
  - Updated `refreshSlotCountsCache()` with new slot and migration logic

- **public/slot-counts.php**
  - Updated `$allowedTimes` array: "8:00 AM" instead of "8:15 AM"
  - Updated `migrateOldSlot()` to convert "8:15 AM" → "8:00 AM"

- **scripts/update-slot-counts.php**
  - Updated `$allowedTimes` array: "8:00 AM" instead of "8:15 AM"
  - Updated `migrateOldSlot()` to convert "8:15 AM" → "8:00 AM"

### Frontend
- **public/index.html**
  - Changed option value from `"8:15 AM"` to `"8:00 AM"` (display already said "8:00-8:10")

- **public/js/main-v3.js**
  - Updated `slotDisplayMap`: key changed from "8:15 AM" to "8:00 AM" (display stays "8:00-8:10")

### Data Files
- **data/slot-counts.json**
  - Updated initial cache to use "8:00 AM" instead of "8:15 AM"

### Documentation
- **DEPLOY.md**
  - Added migration instructions section at top
  - Updated references from "8:15 AM" to "8:00 AM"
  - Updated production allowed slots list

- **package.json**
  - Updated description: "8:00 AM" instead of "8:15 AM"

### Migration Script (NEW)
- **scripts/migrate-815-to-800.php**
  - One-time migration script for production `preferences.json`
  - Rewrites all `"time": "8:15 AM"` to `"time": "8:00 AM"`
  - Creates timestamped backup before migrating
  - Refreshes slot-counts.json cache
  - Supports `--dry-run` flag for testing

## Migration Strategy

### For Existing Subscribers

All existing subscribers with `"time": "8:15 AM"` in their preferences will be automatically migrated:

1. **On-the-fly migration** (safe during transition):
   - `send.js` reads preferences and converts "8:15 AM" → "8:00 AM" in memory
   - `add.php` converts incoming "8:15 AM" values to "8:00 AM" before saving
   - `slot-counts.php` and `update-slot-counts.php` count old "8:15 AM" prefs as "8:00 AM"

2. **One-time data migration** (required for clean cutover):
   - Run `php scripts/migrate-815-to-800.php` on Hostinger after deploying
   - This permanently rewrites the preferences.json file
   - Safe to run multiple times (idempotent)

### Deployment Steps

1. **Deploy updated code** to Hostinger:
   ```bash
   # Upload all changed files to /home/u593240408/morning-bible-verse/
   ```

2. **Run migration script** (required):
   ```bash
   cd /home/u593240408/morning-bible-verse
   php scripts/migrate-815-to-800.php
   ```

3. **Verify**:
   - Check `/home/u593240408/morning-bible-verse/data/preferences.json` (no "8:15 AM" entries)
   - Check `/home/u593240408/morning-bible-verse/data/slot-counts.json` (has "8:00 AM" key)
   - Visit https://notbybreadalone.app/ and confirm dropdown shows "8:00-8:10" with correct counts

4. **Monitor first send**:
   - Watch `data/cron-send.log` at 8:00 AM Mountain Time (next day)
   - Verify subscribers receive at 8:00 AM (not 8:15 AM)

### VPS Send Process

The VPS cron running `/opt/daily-verse/src/send.js` must also pull the latest code:

```bash
ssh vps
cd /opt/daily-verse
git pull
# No data migration needed on VPS (reads from Hostinger via shared data path)
```

## Testing

### Before Deploying
```bash
# Dry run locally
npm run dry-run

# Test with a specific slot
node src/send.js --slot "8:00 AM" --dry-run
```

### After Deploying (Production)
1. Test signup with 8:00 AM slot
2. Verify preferences.json has `"time": "8:00 AM"`
3. Verify slot-counts.json shows count under "8:00 AM" key
4. Wait until 8:00 AM MT and verify send happens (check cron-send.log)

## Rollback Plan

If issues arise, the old "8:15 AM" slot can be restored:

1. Restore `preferences.json` from backup:
   ```bash
   cp data/preferences.json.backup-YYYYMMDDHHMMSS data/preferences.json
   ```

2. Revert code changes (checkout previous commit)

3. Refresh slot counts:
   ```bash
   php scripts/update-slot-counts.php
   ```

## Cache Keys

The slot-counts.json cache key changes from `"8:15 AM"` to `"8:00 AM"`. This cache is:
- Refreshed on every signup/unsubscribe (via add.php/remove.php)
- Refreshed daily at midnight MT (via cron + update-slot-counts.php)
- Loaded by frontend (index.html → main-v3.js → slot-counts.php)

After migration, the "8:15 AM" cache key is obsolete and can be removed.

## No User Action Required

Existing subscribers do NOT need to re-signup. The migration:
- Preserves all subscriber data (phone, version, theme, updatedAt)
- Only changes the `"time"` field from "8:15 AM" to "8:00 AM"
- Maintains all other preferences

Users will simply start receiving at 8:00 AM instead of 8:15 AM on the day after deployment.
