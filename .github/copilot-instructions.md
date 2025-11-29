# AI Coding Agent Instructions for csv-project-sync-tool

## Project Purpose
Bidirectional sync tool between local CSV files and GitHub Issues using "Last Write Wins" conflict resolution. The tool automatically reconciles changes in both directions using timestamps without requiring a database.

## Critical Architecture Understanding

### The 5-Step Sync Algorithm (Core Business Logic)
This is the heart of the application—understand this flow before making changes:

1. **Initialize**: Load CSV via `parseCSV()` into `Map<id, CSVRow>` and fetch all GitHub issues via `GitHubClient.fetchAllIssues()` into `Map<number, GitHubIssue>`. Both use O(1) lookups for fast conflict detection.

2. **CSV → GitHub (Push)**: 
   - Rows **without ID** (CSV-only): `createIssue()` → GitHub returns issue number, update CSV row
   - Rows **with ID** (existing): Compare `CSVRow.updated_at > GitHubIssue.updated_at` → if true, `updateIssue()` PATCH

3. **GitHub → CSV (Pull)**: 
   - Issues **not in CSV map**: Append new row via `githubIssueToCsvRow()`
   - Issues **in map**: Compare timestamps → if GitHub newer, overwrite CSV row

4. **Deletion Handling**: 
   - CSV row missing but issue exists on GitHub → **Log warning, skip deletion** (no true deletion without DB)
   - Issue missing on GitHub but exists in CSV → **Mark title with `[DELETED]` prefix**

5. **Finalization**: Write consolidated rows atomically using temp file + rename in `writeCSV()`

### Key Design Decision: "Last Write Wins"
Uses **ISO 8601 timestamps** to resolve conflicts (see `isTimestampNewer()` in `src/utils/helpers.ts`). When both sides are updated, whichever has the newer timestamp wins. **This is the fundamental conflict resolution model**—don't introduce alternative strategies without careful consideration.

### Module Responsibilities
- **`src/sync/syncEngine.ts`**: Orchestrates the 5-step algorithm, calls other modules in correct sequence
- **`src/csv/parser.ts`**: Reads CSV, validates headers, builds `Map<string, CSVRow>` for O(1) lookups
- **`src/csv/writer.ts`**: **Atomic writes only**—writes to temp file then renames to ensure crash safety
- **`src/github/client.ts`**: Octokit wrapper handling pagination (100 issues per page), creating/updating issues
- **`src/utils/helpers.ts`**: Format conversion (GitHub ↔ CSV), timestamp comparison, label parsing

### Data Format Conversions
- **CSV columns**: `id,title,body,state,labels,updated_at` (labels are comma-separated string)
- **GitHub labels**: Array of `{ name: string }` objects
- **Timestamp format**: ISO 8601 (e.g., `2025-01-15T10:30:00Z`)—**must preserve exact format** to maintain GitHub API compatibility
- Conversion functions in `src/utils/helpers.ts`: `githubIssueToCsvRow()`, `csvRowToGitHubIssue()`, `parseLabelsString()`, `labelsArrayToString()`

## Developer Workflows

### Running Locally
```bash
npm run dev                # ts-node, fastest for development
npm run build && npm start # Compile TypeScript, then run
npm run watch            # Auto-sync on CSV file changes (tests integration)
DEBUG=true npm run dev   # Enable debug logging (verbose output)
```

### Testing
**No formal test suite exists.** Manual testing approach:
1. Create test CSV with sample data in `issues.csv`
2. Create test GitHub repository
3. Set `.env` with test repo credentials
4. Run `npm run pull` to import issues, then `npm run sync` to verify bidirectional sync
5. Test edge cases: large files (100+ issues), rapid consecutive syncs, special characters

### Build & Lint
```bash
npm run build   # Compiles src/**/*.ts → dist/**/*.js
npm run lint    # ESLint on src/**/*.ts
npm run clean   # Removes dist/
```

## Project-Specific Patterns & Conventions

### Map-Based Lookups Are Critical
The codebase heavily uses `Map<id, entity>` for O(1) conflict detection. When iterating issues:
```typescript
// Good: Fast conflict detection
const csvRowsMap = csvRowsToMap(csvRows);  // Map<string, CSVRow>
for (const [issueNumber, githubIssue] of githubIssuesMap) {
  const csvRow = csvRowsMap.get(String(issueNumber));  // O(1)
  if (!csvRow) { /* new remote issue */ }
}

// Bad: O(n²) performance
for (const githubIssue of githubIssues) {
  const csvRow = csvRows.find(r => r.id === String(githubIssue.number));  // O(n)
}
```

### Timestamp Comparisons Use Exact ISO 8601 Format
Timestamps from GitHub API are ISO 8601. **Don't modify the format**. The `isTimestampNewer()` function uses JavaScript Date comparison:
```typescript
export function isTimestampNewer(timestamp1: string, timestamp2: string): boolean {
  const date1 = parseTimestamp(timestamp1);
  const date2 = parseTimestamp(timestamp2);
  return date1 > date2;
}
```

### CSV Atomic Writes Prevent Corruption
**Always use `writeCSV()` from `src/csv/writer.ts`**—it writes to temp file then atomically renames. Never directly write the CSV file. This prevents data loss on process crash:
```typescript
// Good: Atomic
const tempFilePath = `${filePath}.temp`;
fs.writeFileSync(tempFilePath, csvContent, 'utf-8');
fs.renameSync(tempFilePath, filePath);

// Bad: Not atomic
fs.writeFileSync(filePath, csvContent, 'utf-8');
```

### Error Handling: Log and Continue
Individual operation failures don't stop sync. Each step (push, pull, delete) logs errors and continues:
```typescript
try {
  await this.githubClient.updateIssue(issueNumber, issue);
} catch (error) {
  logger.error(`Failed to update GitHub issue #${issueNumber}: ${error}`);
  // Continue with next issue
}
```

### Configuration Via `.env`
All configuration loads from `.env` in `src/config/index.ts`. Required variables:
- `GITHUB_TOKEN` (GitHub Personal Access Token)
- `GITHUB_OWNER` (username or org)
- `GITHUB_REPO` (repository name)
- `CSV_FILE_PATH` (local CSV file path, relative or absolute)
- `DEBUG` (optional, set to `true` for verbose logging)

## Integration Points

### External Dependencies
- **Octokit (`@octokit/rest`)**: GitHub API client with built-in pagination and throttling
- **csv-parse/csv-stringify**: CSV parsing/writing (used in sync, don't replace)
- **Commander**: CLI argument parsing (used in `src/cli.ts`)
- **chalk**: Colored console output (used in `src/utils/logger.ts`)
- **dotenv**: Environment variable loading

### CLI Command Routing
Entry point is `src/index.ts` → dispatches to `src/cli.ts` → runs command (sync, push, pull, watch). All commands eventually call `SyncEngine.sync()` (no differentiation logic yet—all commands do bidirectional sync).

## Common Modifications

### Adding a New CSV Column
1. Update `REQUIRED_HEADERS` and `HEADERS` in `src/csv/parser.ts` and `src/csv/writer.ts`
2. Add field to `CSVRow` interface in `src/types/index.ts`
3. Update conversion functions in `src/utils/helpers.ts`: `githubIssueToCsvRow()`, `csvRowToGitHubIssue()`
4. Update `SyncEngine` if the new field affects sync logic
5. Test with sample CSV containing the new column

### Adding GitHub Issue Field Support
1. Add field to `GitHubIssue` interface in `src/types/index.ts`
2. Update `GitHubClient.fetchAllIssues()` response mapping if field isn't auto-mapped
3. Update conversion function `githubIssueToCsvRow()` to include new field
4. Add corresponding CSV column (follow steps above)

### Implementing True Deletion (Future)
Requires database to track deletion state. Current approach only marks with `[DELETED]` prefix. Changing this affects Step 4 of `SyncEngine.sync()`.

## Debugging Tips

### Enable Debug Logging
```bash
DEBUG=true npm run dev
```
Enables `logger.debug()` output showing:
- Which issues are being created/updated/deleted
- Why decisions are made (timestamp comparisons, missing IDs)

### Check CSV Format
```bash
cat issues.csv  # Verify headers and structure
```
Must have exactly: `id,title,body,state,labels,updated_at`

### Test GitHub Connectivity
Check `.env` is correct:
```bash
GITHUB_TOKEN=ghp_xxxxx  # Valid token with repo scope
GITHUB_OWNER=username   # Your username or org
GITHUB_REPO=repo_name   # Public or accessible repo
```

### Rate Limiting Issues
If sync fails with 403 errors, GitHub API rate limit likely exceeded. Current implementation has 100ms delay between operations and uses Octokit throttling. Check GitHub API status and retry later.

## Performance Characteristics
- **Time**: O(n + m) where n=CSV rows, m=GitHub issues (dominated by API calls)
- **Space**: O(n + m) for two maps in memory
- **API calls**: 1 (fetch all issues) + 1 per new issue + 1 per updated issue
- **Scaling**: Works reliably up to 1000+ issues per repository
