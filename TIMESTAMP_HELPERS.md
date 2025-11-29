# Timestamp Bump Helper Scripts

## Problem

The sync tool uses "Last Write Wins" - it only syncs changes when the CSV `updated_at` timestamp is **newer** than GitHub's timestamp. When you manually edit a `status_column` in your CSV, you need to update the timestamp for the sync to recognize the change.

## Solution: Automatic Timestamp Bumping

Two helper scripts to automatically update timestamps:

---

## Script 1: `bump_status.js` (Simple & Fast)

Bump timestamps for all issues with a specific status.

### Usage

```bash
# Bump all issues with status "backlog"
npm run bump-status backlog

# Bump all issues with status "in-progress"
npm run bump-status in-progress

# Bump specific issues (by ID) with status "done"
npm run bump-status done 7 8 10
```

### Example Workflow

```bash
# 1. Edit your CSV in Excel/VSCode - change some status_column values to "backlog"
# 2. Bump timestamps for all backlog issues
npm run bump-status backlog

# 3. Sync to GitHub
npm run sync
```

### How It Works

- Finds all CSV rows where `status_column` matches your specified status
- Updates their `updated_at` to current time
- Optionally filters to specific issue IDs if provided

---

## Script 2: `bump_timestamps.js` (Smart Detection)

Automatically detects which issues have status changes by comparing CSV to GitHub.

### Usage

```bash
npm run bump-timestamps
```

### How It Works

1. Reads your CSV
2. Fetches current issue states from GitHub
3. Compares `status_column` in CSV vs GitHub labels
4. Bumps timestamps only for issues with different statuses
5. Shows exactly which issues were updated

### Example Output

```
📝 Bumping timestamps for modified status columns in ./issues.csv

Fetching current state from GitHub...
  Issue #7: Data: Unit Stats Class
    CSV status: backlog → GitHub status: done
    Bumping timestamp: 2025-11-29T19:54:35Z → 2025-11-29T20:30:00Z
  Issue #12: Data: Captain Resource
    CSV status: in-progress → GitHub status: backlog
    Bumping timestamp: 2025-11-29T19:54:38Z → 2025-11-29T20:30:00Z

✓ Bumped timestamps for 2 issue(s)
✓ Updated ./issues.csv

Run "npm run sync" to push these changes to GitHub.
```

---

## Status Values

Valid `status_column` values (case-insensitive):

- `backlog` → "Backlog" column
- `ready` → "Ready" column  
- `in-progress` (or `in progress`) → "In progress" column
- `done` → "Done" column

---

## Recommended Workflow

### Option 1: Manual Status Changes (Simple)

```bash
# 1. Edit CSV - change status_column values
# 2. Bump all changed statuses
npm run bump-status backlog
npm run bump-status in-progress

# 3. Sync
npm run sync
```

### Option 2: Smart Detection (Automatic)

```bash
# 1. Edit CSV - change status_column values
# 2. Auto-detect and bump changed issues
npm run bump-timestamps

# 3. Sync
npm run sync
```

### Option 3: One-Command Bump & Sync

```bash
# Bump specific status and sync in one line
npm run bump-status backlog && npm run sync
```

---

## Tips

1. **Always bump timestamps after editing status_column** - The sync won't detect changes without newer timestamps

2. **Use git to track changes** - Before running bump scripts:
   ```bash
   git diff issues.csv  # See what you changed
   ```

3. **Bulk updates** - To move many issues to backlog:
   ```bash
   # Edit CSV to set multiple status_column = backlog
   npm run bump-status backlog  # Bumps all of them
   npm run sync                  # Pushes to GitHub
   ```

4. **Check before syncing**:
   ```bash
   npm run bump-timestamps  # Shows what will change
   # Review the output
   npm run sync             # Push if it looks correct
   ```

---

## Troubleshooting

### "No issues found with status X"

- Check your CSV has issues with that exact status
- Status values are case-sensitive in the script (use lowercase)

### "Issue not moving on GitHub Projects"

1. Check if issue is in the project:
   ```bash
   node scripts/check_issue_in_project.js 7
   ```

2. If not in project, add it manually:
   - Go to GitHub Projects board
   - Click "Add item"
   - Search for the issue number

3. Then run sync again:
   ```bash
   npm run sync
   ```

### "Timestamp not bumping"

Make sure you:
1. Saved your CSV changes
2. Ran the bump script AFTER editing
3. The status value matches exactly (check spelling)
