# Test Slot Verification

Quick manual tests to verify Denver hour/slot matching and 5-minute test mode.

## Production slot verification

Test that `send.js` correctly identifies production slots:

```bash
# Should send at 8:00 AM Mountain (if you have a recipient with 8:00 AM preference)
node src/send.js --dry-run

# Force send to everyone regardless of time/preference (NO SMS sent, just logs)
node src/send.js --dry-run --now

# Simulate a specific slot (12:00 PM) regardless of current time
node src/send.js --dry-run --slot "12:00 PM"
```

## Test mode verification (5-minute intervals)

### Setup

1. Create `.env` with test mode enabled:
   ```bash
   DV_TEST_MODE=1
   TEXTLINK_API_KEY=your_key_here
   SIM_CARD_ID=2366
   ```

2. Add a test preference in `data/preferences.json`:
   ```json
   {
     "+15551234567": {
       "time": "2:35 PM",
       "version": "KJV",
       "theme": "Faith"
     }
   }
   ```

3. Add the number to `data/numbers.json`:
   ```json
   ["+15551234567"]
   ```

### Dry-run tests

```bash
# At 2:35 PM Mountain, this should show the test number as a recipient
DV_TEST_MODE=1 node src/send.js --dry-run

# At 2:36 PM Mountain, this should skip (no matching slot)
DV_TEST_MODE=1 node src/send.js --dry-run

# Force send test (no SMS, just logs)
DV_TEST_MODE=1 node src/send.js --dry-run --now

# Simulate a specific test slot
DV_TEST_MODE=1 node src/send.js --dry-run --slot "3:10 PM"
```

### Live test with temporary SMS number

Use a free public temp SMS number service:
- https://receive-sms.com/
- https://smsreceivefree.com/
- https://freesmsverification.com/

**Steps:**

1. Pick a public number from one of the services above
2. Add it to `data/numbers.json` and `data/preferences.json` with a 5-minute slot 2-3 minutes in the future
3. Set `DV_TEST_MODE=1` in `.env`
4. Wait for the slot time
5. Run: `DV_TEST_MODE=1 node src/send.js`
6. Check the public SMS inbox for the verse

**Example:**

```json
// data/preferences.json
{
  "+15551234567": {
    "time": "3:15 PM",
    "version": "KJV",
    "theme": "Faith"
  }
}
```

At 3:15 PM Mountain Time:
```bash
DV_TEST_MODE=1 node src/send.js
# Check data/log.txt for confirmation
# Check the temp SMS inbox online
```

## Verify cron behavior

Simulate cron running every minute at different times:

```bash
# At 8:00 AM Mountain → should send to 8 AM recipients
node src/send.js

# At 8:01 AM Mountain → should skip (not 8:00)
node src/send.js

# At 12:00 PM Mountain → should send to 12 PM recipients
node src/send.js

# At 12:01 PM Mountain → should skip (not 12:00)
node src/send.js
```

Check `data/log.txt` for output like:
- `"Waiting for 8:00 AM America/Denver. It is 08:01 there now."` (skipped)
- `"sent Matthew 6:33 to +1... via sim_card_id 3887 (8:00 AM)"` (sent)
- `"No recipients for slot 12:00 PM."` (no one signed up for that time)

## Idempotency check

Verify that running send.js multiple times in the same hour doesn't duplicate sends:

```bash
# First run at 8:00 AM → should send
node src/send.js --slot "8:00 AM"

# Second run at 8:00 AM → should skip with "Already sent" message
node src/send.js --slot "8:00 AM"

# Check data/last-sent.json to see the slots state
cat data/last-sent.json
```

Expected `last-sent.json` structure:
```json
{
  "date": "2026-09-29",
  "reference": "Matthew 6:33",
  "sentAt": "2026-09-29T14:00:00.000Z",
  "count": 1,
  "slot": "8:00 AM",
  "slots": {
    "2026-09-29": {
      "8:00 AM": "Matthew 6:33"
    }
  }
}
```
