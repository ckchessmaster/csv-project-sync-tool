# csv-project-sync-tool

Bidirectional synchronization between a local CSV file and GitHub Repository Issues. This tool uses a "Last Write Wins" strategy to resolve conflicts, ensuring seamless two-way sync with automatic timestamp-based conflict resolution.

## Features

- ✅ **Bidirectional Sync**: Push changes from CSV → GitHub and pull changes from GitHub → CSV
- 🔄 **Automatic Conflict Resolution**: Uses timestamps to determine which version wins (Last Write Wins)
- 📊 **Full Issue Sync**: Synchronizes title, body, state, labels, and update timestamps
- ⚡ **Atomic CSV Writes**: Uses temporary files to prevent corruption on crash
- 📝 **Pagination Support**: Handles GitHub API pagination to sync all issues
- ⏱️ **Watch Mode**: Automatically sync when CSV file changes
- 🎯 **Rate Limiting**: Built-in delays to respect GitHub API rate limits
- 🚨 **Safe Deletion Handling**: Warns instead of silently deleting, marks deleted items

## Installation

### Prerequisites

- Node.js 16+ (LTS recommended)
- GitHub Personal Access Token with `repo` scope

### Setup

1. Clone the repository:
```bash
git clone https://github.com/ckchessmaster/csv-project-sync-tool.git
cd csv-project-sync-tool
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file from the template:
```bash
cp .env.example .env
```

4. Edit `.env` with your GitHub credentials:
```env
GITHUB_TOKEN=ghp_your_personal_access_token
GITHUB_OWNER=your_username_or_org
GITHUB_REPO=your_repository_name
CSV_FILE_PATH=./issues.csv
```

## CSV File Format

The CSV file must have the following columns (headers required):

| Column | Type | Description |
|--------|------|-------------|
| `id` | string | GitHub issue number (leave empty for new issues) |
| `title` | string | Issue title |
| `body` | string | Issue description/content |
| `state` | string | `open` or `closed` |
| `labels` | string | Comma-separated labels (e.g., "bug,frontend") |
| `updated_at` | string | ISO 8601 timestamp (e.g., "2025-01-15T10:30:00Z") |

### Example CSV

```csv
id,title,body,state,labels,updated_at
1,Add user authentication,Implement login system,open,feature,2025-01-15T10:30:00Z
2,Fix header layout,CSS alignment issue,closed,bug,2025-01-14T15:20:00Z
,New feature request,Auto-save functionality,open,enhancement,2025-01-15T11:45:00Z
```

## Usage

### Perform Bidirectional Sync

Syncs changes in both directions (CSV → GitHub and GitHub → CSV):

```bash
npm start
# or
npm run sync
# or with ts-node
npm run dev
```

### Push CSV to GitHub

Push changes from CSV to GitHub:

```bash
npm run push
```

### Pull GitHub to CSV

Pull changes from GitHub to CSV:

```bash
npm run pull
```

### Watch Mode (Development)

Automatically sync whenever the CSV file changes:

```bash
npm run watch
```

## Sync Algorithm (Last Write Wins)

The tool implements a 5-step synchronization algorithm:

### Step 1: Initialization
- Reads local CSV file into memory (Map<id, row>)
- Fetches all issues from GitHub repository with pagination
- Validates CSV headers

Deduplication: After loading CSV rows and GitHub issues, the sync engine performs a title-based deduplication pass. For each title, the tool keeps the item (CSV row or GitHub issue) with the newest `updated_at` timestamp and removes older duplicates from the consolidated CSV output. Configure matching case-sensitivity with `DEDUPE_TITLE_CASE_SENSITIVE` in your `.env`.

### Step 2: CSV → GitHub (Push Local Changes)

For each CSV row:
- **New Item (No ID)**: Creates new GitHub issue via POST
- **Existing Item (Has ID)**: Compares `updated_at` timestamps
  - If CSV is newer: Updates GitHub issue via PATCH with new title, body, state, labels

### Step 3: GitHub → CSV (Pull Remote Changes)

For each GitHub issue:
- **New Remote Issue (ID not in CSV)**: Appends new row to CSV
- **Remote Update (ID exists in CSV)**: Compares `updated_at` timestamps
  - If GitHub is newer: Overwrites CSV row with GitHub data

### Step 4: Deletion Handling

**Constraint**: True deletion is unsafe without a database.

- **Row deleted from CSV but exists on GitHub**: Logs warning, skips deletion
- **Issue deleted on GitHub but exists in CSV**: Marks row with `[DELETED]` prefix

### Step 5: Finalization

- Writes consolidated data back to CSV using atomic write (temp file → rename)
- Formats timestamps as GitHub ISO 8601 format

## Sync Decision Matrix

| Scenario | CSV Updated | GitHub Updated | Action |
|----------|-------------|----------------|--------|
| New in CSV | N/A | N/A | Create on GitHub |
| New on GitHub | N/A | N/A | Add to CSV |
| Updated in CSV (newer) | ✓ | ✗ | Update GitHub |
| Updated on GitHub (newer) | ✗ | ✓ | Update CSV |
| Updated both (CSV newer) | ✓ | ✓ | CSV wins, update GitHub |
| Updated both (GitHub newer) | ✓ | ✓ | GitHub wins, update CSV |
| Deleted from CSV | ✓ | ✗ | Warn, skip deletion |
| Deleted on GitHub | ✗ | ✓ | Mark as [DELETED] in CSV |

## Environment Variables

Create a `.env` file in the project root:

```env
# GitHub authentication
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Repository information
GITHUB_OWNER=your_username_or_org
GITHUB_REPO=your_repository_name

# Local CSV file path
CSV_FILE_PATH=./issues.csv

# Deduplication: case-sensitive title matching (default: false)
# If true, title matching is case-sensitive; otherwise case-insensitive.
DEDUPE_TITLE_CASE_SENSITIVE=false

# Tie-breaker for deduplication (optional)
# Options: first | prefer_csv | prefer_github | highest_id
# Default: first
DEDUPE_TIE_BREAKER=first

# Optional: Enable debug logging
DEBUG=true
```

### Getting Your GitHub Token

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Click "Generate new token"
3. Name it (e.g., "csv-sync-tool")
4. Set expiration (recommended: 90 days)
5. Select repository access: "Only select repositories" → Choose your repo
6. Permissions needed: `Issues` (read and write)
7. Generate and copy the token
8. Paste into `.env` as `GITHUB_TOKEN`

## Commands

```bash
# Install dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Run the application (compiled)
npm start

# Run with ts-node (development)
npm run dev

# Sync: full bidirectional synchronization
npm run sync

# Push: CSV → GitHub
npm run push

# Pull: GitHub → CSV
npm run pull

# Watch: auto-sync on CSV file changes
npm run watch

# Lint code
npm run lint

# Clean build artifacts
npm run clean
```

## Output Example

```
ℹ Starting synchronization...
ℹ Step 1: Loading data from CSV and GitHub...
ℹ Loaded 5 existing items from CSV
ℹ Loaded 8 issues from GitHub
ℹ Found 2 new items in CSV
ℹ Step 2: Pushing CSV changes to GitHub...
✓ Created GitHub issue #9
✓ Updated GitHub issue #2
ℹ Step 3: Pulling GitHub changes to CSV...
✓ Added GitHub issue #10 to CSV
✓ Updated CSV with GitHub issue #3
ℹ Step 4: Handling deletions...
⚠ Skipping issue #7 (missing from CSV). To close, mark state as 'closed' instead of deleting.
ℹ Step 5: Writing consolidated data to CSV...
✓ CSV written successfully
✓ Synchronization complete!

==================================================
SYNC SUMMARY
==================================================
GitHub Issues Created: 1
GitHub Issues Updated: 1
GitHub Issues Skipped: 1
CSV Rows Created: 1
CSV Rows Updated: 1
Deleted Rows Marked: 0
==================================================
```

## Rate Limiting

The tool respects GitHub's rate limits:
- Octokit's built-in throttling is enabled by default
- 100ms delay between API operations for processing >50 items
- Handles 60 requests/hour for unauthenticated, 5000/hour for authenticated

## Troubleshooting

### "Configuration errors: GITHUB_TOKEN not set"
- Ensure `.env` file exists in project root
- Check that `GITHUB_TOKEN`, `GITHUB_OWNER`, and `GITHUB_REPO` are set

### "Failed to parse CSV"
- Verify CSV headers: `id,title,body,state,labels,updated_at`
- Check that `state` is either `open` or `closed`
- Ensure `updated_at` uses ISO 8601 format (e.g., `2025-01-15T10:30:00Z`)

### "Failed to fetch issues from GitHub"
- Verify GitHub token is valid and not expired
- Check that repository exists and you have access
- Ensure token has `repo` scope permissions

### CSV file keeps resetting
- CSV is write-protected or read-only
- File permissions issue - check file access

## Development

### Project Structure

```
src/
├── index.ts              # Main entry point
├── cli.ts                # CLI command routing
├── types/
│   └── index.ts          # Type definitions
├── config/
│   └── index.js          # Environment configuration
├── csv/
│   ├── parser.ts         # CSV reading
│   └── writer.ts         # CSV writing (atomic)
├── github/
│   └── client.ts         # Octokit wrapper
├── sync/
│   └── syncEngine.ts     # Core sync logic
├── utils/
│   ├── logger.ts         # Colored output
│   └── helpers.ts        # Utilities
└── commands/
    ├── sync.ts           # Sync/push/pull commands
    └── watch.ts          # Watch mode command
```

### Building

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

### Running Tests (Future)

```bash
npm test
```

## License

MIT - See LICENSE file for details

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues, questions, or suggestions, please open an issue on GitHub.
