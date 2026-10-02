# Scripts

## update-slot-counts.php

Regenerates the cached slot counts file (`data/slot-counts.json`) from `data/preferences.json`.

**Why**: The homepage displays subscriber counts per send-time slot ("6:00-6:10 (N others)"). Computing these counts on every page load from preferences.json was slow (0.5-0.7s). The cache makes page loads snappy by serving precomputed counts.

**When it runs**:
- Daily at midnight America/Denver via cron (required)
- Automatically on signup/preference updates (add.php, remove.php)

**How to run manually** (for testing or after bulk preference changes):

```bash
cd /home/u593240408/morning-bible-verse
php scripts/update-slot-counts.php
```

Output is logged to stdout. Cron logs to `data/cron-slot-counts.log`.

**Cron setup** (see DEPLOY.md):

```bash
0 0 * * * cd /home/u593240408/morning-bible-verse && php scripts/update-slot-counts.php >> data/cron-slot-counts.log 2>&1
```
