# Architecture & Development Guide

## Project Architecture

### Module Overview

```
┌─────────────────────────────────────────┐
│           CLI Layer (cli.ts)            │
│    ↓ Command Routing ↓                  │
├──────────┬──────────┬──────────┐        │
│  sync    │  push    │  pull    │ watch  │
└──────────┴──────────┴──────────┘        │
     ↓                                     │
┌─────────────────────────────────────────┐
│    SyncEngine (sync/syncEngine.ts)      │
│  - Orchestrates 5-step algorithm       │
│  - Timestamp-based conflict resolution  │
│  - Rate limiting & error handling       │
└─────────────────────────────────────────┘
     ↙                    ↖
┌──────────────────┐  ┌──────────────────┐
│   CSV Module     │  │  GitHub Module   │
├──────────────────┤  ├──────────────────┤
│  parser.ts       │  │  client.ts       │
│  writer.ts       │  │  (Octokit)       │
└──────────────────┘  └──────────────────┘
     ↓                       ↓
   CSV File          GitHub API (REST)
```

### Data Flow

```
1. Load Data
   ├─ CSV → parseCSV() → CSVRow[]
   └─ GitHub → fetchAllIssues() → GitHubIssue[]

2. Sync Algorithm (5 Steps)
   ├─ Step 1: Initialize & map data
   ├─ Step 2: CSV → GitHub push
   ├─ Step 3: GitHub → CSV pull
   ├─ Step 4: Handle deletions
   └─ Step 5: Write consolidated CSV

3. Transform Data
   ├─ csvRowToGitHubIssue() - CSV → GitHub format
   └─ githubIssueToCsvRow() - GitHub → CSV format
```

## File Structure

### Core Modules

**`src/index.ts`** - Application entry point
- Initializes CLI and runs the specified command

**`src/cli.ts`** - Command routing
- Defines available commands (sync, push, pull, watch)
- Dispatches to command handlers

**`src/types/index.ts`** - Type definitions
- `Issue` - GitHub issue representation
- `CSVRow` - CSV row representation
- `GitHubIssue` - GitHub API issue response
- `SyncConfig` - Configuration object
- `SyncResult` - Sync operation results

**`src/config/index.ts`** - Configuration management
- Loads and validates `.env` variables
- Throws errors if required variables are missing

**`src/sync/syncEngine.ts`** - Core sync logic
- `SyncEngine` class with `sync()` method
- Implements 5-step "Last Write Wins" algorithm
- Handles all conflict resolution

### CSV Module

**`src/csv/parser.ts`** - CSV reading
- `parseCSV()` - Reads and parses CSV file
- `csvRowsToMap()` - Converts rows to Map<id, row>
- `getNewRowsFromCSV()` - Filters rows without IDs
- Validates required headers

**`src/csv/writer.ts`** - CSV writing
- `writeCSV()` - Atomic write using temp file
- Ensures data integrity on crash

### GitHub Module

**`src/github/client.ts`** - GitHub API wrapper
- `GitHubClient` class wrapping Octokit
- `fetchAllIssues()` - Pagination-aware fetching
- `createIssue()` - Create new issues
- `updateIssue()` - Update existing issues
- `githubIssuesToMap()` - Convert to Map<number, issue>

### Utilities

**`src/utils/logger.ts`** - Colored console output
- `logger.info()` - Blue info messages
- `logger.success()` - Green success messages
- `logger.warn()` - Yellow warnings
- `logger.error()` - Red errors
- `logger.debug()` - Debug output (DEBUG=true)

**`src/utils/helpers.ts`** - Utility functions
- `parseLabelsString()` - "bug,ui" → ["bug", "ui"]
- `labelsArrayToString()` - ["bug"] → "bug"
- `githubIssueToCsvRow()` - Format conversion
- `csvRowToGitHubIssue()` - Format conversion
- `isTimestampNewer()` - Timestamp comparison
- `sleep()` - Rate limiting utility

### Commands

**`src/commands/sync.ts`** - Sync operations
- `runSync()` - Bidirectional sync
- `runPush()` - CSV → GitHub
- `runPull()` - GitHub → CSV

**`src/commands/watch.ts`** - File watching
- `runWatch()` - Watches CSV for changes
- Auto-triggers sync on file modification

## The Sync Algorithm

### Step 1: Initialization
```typescript
const csvRows = parseCSV(filePath);           // Read CSV
const csvRowsMap = csvRowsToMap(csvRows);     // Map by ID
const githubIssues = fetchAllIssues();         // Fetch from GitHub
const githubIssuesMap = githubIssuesToMap();   // Map by number
```

### Step 2: CSV → GitHub (Push)
```
For each CSV row:
  - No ID (new): POST /issues
    → Gets GitHub issue number
    → Updates CSV row with number and updated_at
  
  - Has ID (existing):
    - If CSV.updated_at > GitHub.updated_at:
      → PATCH /issues/{number}
      → Update title, body, state, labels
```

### Step 3: GitHub → CSV (Pull)
```
For each GitHub issue:
  - Not in CSV (new):
    → Add new row to CSV
  
  - In CSV (existing):
    - If GitHub.updated_at > CSV.updated_at:
      → Overwrite CSV row with GitHub data
```

### Step 4: Deletion Handling
```
CSV rows deleted but exist on GitHub:
  → Log warning (skip deletion)

GitHub issues deleted but exist in CSV:
  → Mark row with [DELETED] prefix
```

### Step 5: Finalization
```
writeCSV(consolidatedRows):
  1. Format all rows for output
  2. Generate CSV string with headers
  3. Write to temp file (issues.csv.temp)
  4. Atomic rename temp → actual file
```

## Key Design Decisions

### 1. "Last Write Wins" Strategy
- **Why**: Simple, predictable, no database needed
- **How**: Compare ISO 8601 timestamps
- **Trade-off**: Older updates can be lost if not synced frequently

### 2. Atomic CSV Writes
- **Why**: Prevents data corruption on crash
- **How**: Write to temp file, atomic rename
- **Implementation**: `writeCSV()` uses `fs.renameSync()`

### 3. Map-Based Data Structures
- **Why**: O(1) lookups for conflict detection
- **How**: `Map<id, CSVRow>` and `Map<number, GitHubIssue>`
- **Benefit**: Fast sync even with many issues

### 4. No True Deletion
- **Why**: Two-way sync without DB is unsafe
- **How**: Mark deleted with `[DELETED]` prefix
- **User Action**: Close issue instead of deleting

### 5. Rate Limiting
- **Why**: GitHub API has rate limits (5000 req/hr)
- **How**: 100ms delay between operations, Octokit throttling
- **Scaling**: Works reliably for repositories with 1000+ issues

## Type System

### Core Types

```typescript
interface Issue {
  id?: number;
  number?: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: string[];
  updated_at: string;
  created_at?: string;
  url?: string;
}

interface CSVRow {
  id: string;                    // Primary key
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: string;                // Comma-separated
  updated_at: string;            // ISO 8601
}

interface SyncConfig {
  githubToken: string;
  githubOwner: string;
  githubRepo: string;
  csvFilePath: string;
}

interface SyncResult {
  csvRowsCreated: number;
  csvRowsUpdated: number;
  githubIssuesCreated: number;
  githubIssuesUpdated: number;
  githubIssuesSkipped: number;
  deletedRowsMarked: number;
  errors: string[];
}
```

## Error Handling

### Configuration Errors
- Missing `.env` variables → Throws immediately
- User sees clear error message

### CSV Errors
- Invalid headers → Parsing stops with error
- Corrupted file → Atomic write prevents loss

### GitHub API Errors
- Network errors → Caught and logged
- Authentication errors → Clear error message
- Rate limit → Handled by Octokit throttling

### Sync Errors
- Individual operation failures → Logged, sync continues
- Critical failures → Process exits with code 1

## Development Workflow

### Adding a New Feature

1. **Update Types** (`src/types/index.ts`)
   ```typescript
   interface NewFeature {
     // Add new fields
   }
   ```

2. **Implement Logic** (appropriate module)
   ```typescript
   export function newFeature(): void {
     // Implementation
   }
   ```

3. **Update Sync Engine** if needed
   - Add step or modify existing logic
   - Test with sample data

4. **Build and Test**
   ```bash
   npm run build
   npm run dev  # or npm start
   ```

5. **Lint**
   ```bash
   npm run lint
   ```

### Testing Approach

Since comprehensive unit tests aren't included:

1. **Manual Testing**
   ```bash
   # With test repository
   npm run pull         # Import issues
   npm run sync         # Full sync
   ```

2. **Integration Testing**
   - Create test CSV
   - Create test GitHub repo
   - Run sync commands
   - Verify results

3. **Edge Cases to Test**
   - Empty CSV file
   - Large number of issues (>100)
   - Special characters in title/body
   - Rapid consecutive syncs
   - Network interruption

## Performance Considerations

### Time Complexity
- CSV Parsing: O(n) where n = number of rows
- GitHub Fetch: O(n/100 + 1) API calls (pagination)
- Sync Algorithm: O(n + m) where m = GitHub issues
- Overall: O(n + m) for n CSV rows, m GitHub issues

### Space Complexity
- CSV Map: O(n)
- GitHub Map: O(m)
- Overall: O(n + m)

### Optimization Tips
1. **Reduce Frequency**: Sync less often if many issues
2. **Filter Issues**: Could implement label-based filtering
3. **Parallel Operations**: Could fetch and parse in parallel
4. **Caching**: Could cache GitHub responses between runs

## Future Enhancement Ideas

1. **Selective Sync**
   - Sync only specific labels
   - Sync only open/closed issues

2. **Merge Conflict Resolution**
   - Show conflicts and let user choose
   - Three-way merge support

3. **Database Backend**
   - Track history of changes
   - Safer deletion handling
   - More granular timestamp tracking

4. **Pull Request Support**
   - Extend to sync PRs in addition to issues

5. **Custom Field Mapping**
   - Allow users to define CSV ↔ GitHub field mapping

6. **Comment Sync**
   - Sync issue comments to additional CSV columns

7. **Test Suite**
   - Unit tests for each module
   - Integration tests with mock GitHub API

8. **Performance Optimization**
   - Parallel processing of issues
   - Incremental sync (only changed issues)

## Building and Deployment

### Local Development
```bash
npm run dev          # Run ts-node
DEBUG=true npm run dev  # Debug mode
```

### Production Build
```bash
npm run build        # Compile TypeScript
npm start            # Run compiled version
```

### Distribution
1. Users clone repository
2. Copy `.env.example` → `.env`
3. Fill in configuration
4. Run `npm install`
5. Run `npm start`

### CI/CD Potential
- GitHub Actions for building
- Automated testing on PR
- Release versioning

---

For questions about architecture or design decisions, see comments in source files.
