# Setup Guide

## Quick Start

Follow these steps to get the CSV-GitHub Sync Tool up and running.

### Step 1: Prerequisites

- Node.js 16 or higher (check with `node -v`)
- GitHub account with repository access
- Personal GitHub Access Token

### Step 2: Get Your GitHub Token

1. Go to [GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
2. Click "Generate new token" → "Fine-grained tokens"
3. Fill in the details:
   - **Token name**: `csv-sync-tool`
   - **Expiration**: 90 days (recommended)
   - **Repository access**: Select your target repository
   - **Permissions**: 
     - Issues: Read and Write
4. Click "Generate token"
5. Copy the token (you won't be able to see it again!)

### Step 3: Configure Environment

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` with your values:
```env
GITHUB_TOKEN=ghp_your_token_here
GITHUB_OWNER=your_username_or_org
GITHUB_REPO=your_repository_name
CSV_FILE_PATH=./issues.csv
```

3. Save the file

### Step 4: Install Dependencies

```bash
npm install
```

### Step 5: Create Your CSV File

Option A: Start with an empty CSV:
```bash
# Create from template
cp issues.csv.example issues.csv
```

Option B: Create manually with these headers:
```csv
id,title,body,state,labels,updated_at
```

### Step 6: Test the Setup

Run the help command:
```bash
npm start -- --help
```

You should see the available commands:
- `sync` - Bidirectional sync
- `push` - CSV → GitHub
- `pull` - GitHub → CSV
- `watch` - Auto-sync on file changes

### Step 7: Run Your First Sync

⚠️ **Important**: Start with `pull` to safely import existing GitHub issues into your CSV:

```bash
npm run pull
```

This will:
- Fetch all issues from GitHub
- Add them to your CSV file
- Preserve the timestamp information

### Step 8: Start Using the Tool

Now you can:

**Full bidirectional sync:**
```bash
npm run sync
```

**Push CSV changes to GitHub:**
```bash
npm run push
```

**Pull GitHub changes to CSV:**
```bash
npm run pull
```

**Auto-sync on CSV changes (watch mode):**
```bash
npm run watch
```

## Workflow Example

### Scenario: Managing Issues Both Ways

1. **Initial Setup**
   ```bash
   npm run pull          # Import GitHub issues to CSV
   ```

2. **Edit in CSV**
   - Open `issues.csv`
   - Add new row with empty `id`: `,"New feature","Build API endpoint",open,feature,2025-01-15T12:00:00Z`
   - Update existing issue title

3. **Sync Changes**
   ```bash
   npm run sync          # Push CSV changes, pull GitHub changes
   ```

4. **Check Results**
   - New row gets GitHub issue number in `id` column
   - Updated data is reflected on GitHub
   - Any changes made on GitHub are pulled back to CSV

## CSV File Guidelines

### Headers (Required)

| Column | Format | Example |
|--------|--------|---------|
| `id` | string | `1` or leave blank for new |
| `title` | string | `Fix login bug` |
| `body` | string | `Users can't log in after password reset` |
| `state` | `open` or `closed` | `open` |
| `labels` | comma-separated | `bug,backend` |
| `updated_at` | ISO 8601 | `2025-01-15T10:30:00Z` |

### Important Notes

- **First line must be headers**: Never delete the header row
- **New items**: Leave `id` empty for new issues to create on GitHub
- **Timestamps**: Use ISO 8601 format with `Z` suffix for UTC
- **Commas in content**: If your content has commas, wrap in quotes: `"Hello, world"`
- **State values**: Must be exactly `open` or `closed`
- **No deletes**: To close an issue, change state to `closed` instead of deleting the row

## Troubleshooting

### "Configuration errors: GITHUB_TOKEN not set"

Make sure:
- `.env` file exists in the project root
- All three variables are set: `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`
- No extra spaces in the `.env` file

### "Failed to fetch issues from GitHub"

Check:
- Token is valid (not expired, not revoked)
- Token has correct permissions (Issues: Read & Write)
- Repository name is spelled correctly
- You have access to the repository

### "Failed to parse CSV"

Verify:
- CSV headers are exactly: `id,title,body,state,labels,updated_at`
- `state` column has only `open` or `closed`
- `updated_at` uses ISO 8601 format
- No extra spaces or missing columns

### "CSV file not found"

Either:
- Create the file: `echo "id,title,body,state,labels,updated_at" > issues.csv`
- Update `CSV_FILE_PATH` in `.env` to correct location

### "Sync is very slow"

This is normal if you have many issues (>100). The tool:
- Respects GitHub API rate limits
- Adds small delays to prevent hitting limits
- Will complete successfully (may take several minutes)

## Advanced Usage

### Enable Debug Logging

```bash
DEBUG=true npm start
```

This will show detailed information about each sync step.

### Rebuilding TypeScript

If you modify source files:
```bash
npm run build
```

Then run:
```bash
npm start
```

### Development Mode (ts-node)

Run TypeScript directly without building:
```bash
npm run dev
```

## Best Practices

1. **Always pull before push**: Start with `npm run pull` to get latest GitHub data
2. **Use meaningful labels**: Makes filtering easier on GitHub
3. **Keep updated_at format consistent**: ISO 8601 with `Z`
4. **Don't manually edit timestamps**: Let the tool manage them
5. **Commit CSV to git**: Track changes to see history
6. **Test with one issue first**: Before syncing many issues
7. **Use watch mode cautiously**: May create many API calls if saving frequently

## Getting Help

For issues or questions:
1. Check README.md for full documentation
2. Review the output messages - they usually indicate what went wrong
3. Enable debug mode: `DEBUG=true npm start`
4. Check `.env` configuration
5. Verify CSV format matches requirements

---

**Happy syncing!** 🚀
