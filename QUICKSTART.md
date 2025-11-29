# 🚀 Quick Fix: Enable Project Column Sync

Your `status_column` changes weren't syncing to GitHub Projects because your token doesn't have the required permissions.

## Fix in 3 Steps (5 minutes)

### 1️⃣ Update Your Token

1. Go to: **https://github.com/settings/tokens**
2. Click your token or create new
3. **Check these boxes:**
   - ✅ `repo` (already checked)
   - ✅ **`project`** ← ADD THIS
4. Generate/Update token
5. Copy the new token

### 2️⃣ Update .env

Replace your token in `.env`:

```env
GITHUB_TOKEN=your_new_token_here
GITHUB_OWNER=ckchessmaster
GITHUB_REPO=the-cycle
CSV_FILE_PATH=./issues.csv
SYNC_PROJECT_STATUS=true
```

### 3️⃣ Test It

```bash
# Rebuild
npm run build

# Test sync
npm run dev
```

Look for this output:

```
✓ Updated GitHub issue #97
Updating project status for X issues...
✓ Updated project status for issue #97 to "Done"
Successfully updated project status for X/X issues
```

## That's It! 🎉

Now when you change `status_column` in your CSV and run sync, the GitHub Projects board columns will update automatically.

## Troubleshooting

**Still seeing "Resource not accessible"?**
- Make sure you checked the `project` scope box
- Make sure you copied the NEW token to `.env`
- Try creating a completely new token if updating doesn't work

**"Issue #X not in project"?**
- That issue hasn't been added to your project board yet
- Add it manually once, then future syncs will work

## More Info

- Full setup guide: `GITHUB_PROJECTS_SETUP.md`
- Technical details: `SOLUTION_SUMMARY.md`
