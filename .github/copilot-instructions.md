# AI Coding Agent Instructions for csv-project-sync-tool

## Purpose
Bidirectional sync tool between a local CSV file and GitHub Issues. The core business rule is "Last Write Wins" using ISO 8601 timestamps. Agents must preserve this conflict-resolution model when changing sync logic.

## High-level Architecture (what to read first)
- `src/sync/syncEngine.ts` — orchestrates the 5-step sync and is the only place that needs to coordinate push/pull/delete/finalization.
- `src/csv/parser.ts` and `src/csv/writer.ts` — CSV read/write. `writeCSV()` performs atomic writes using a temp file + rename and must be used for all CSV output.
- `src/github/client.ts` — Octokit wrapper: `fetchAllIssues()`, `createIssue()`, `updateIssue()` and `githubIssuesToMap()`.
- `src/utils/helpers.ts` — conversions between GitHub and CSV formats, `isTimestampNewer()` used for Last Write Wins.
- `src/utils/duplicate.ts` — title-based deduplication helpers (keep newest by `updated_at`).

Agents should read these files in that order to gain context quickly.

## Core Sync Flow (5 steps)
1. Initialization: load CSV (`parseCSV`) and fetch GitHub issues (`fetchAllIssues`). Convert both lists into Maps for O(1) lookups.
2. Deduplication (new): run title-based dedupe on both CSV rows and GitHub issues. Keep the newest item per title. The behavior is configurable:
   - `DEDUPE_TITLE_CASE_SENSITIVE` (bool) — default `false` (case-insensitive)
   - `DEDUPE_TIE_BREAKER` (string) — `first` (default), `prefer_csv`, `prefer_github`, or `highest_id`
3. CSV → GitHub (Push): create issues for CSV rows without `id`, update GitHub issues where CSV is newer.
4. GitHub → CSV (Pull): append new GitHub issues to CSV or overwrite CSV rows when GitHub is newer.
5. Finalization: write consolidated CSV atomically (`writeCSV`). A backup of removed duplicates is written to `<csvFilePath>.duplicates.removed.<timestamp>.csv`.

## Important Project Conventions
- Map-based lookups: always use `Map` conversions (see `csvRowsToMap` and `githubIssuesToMap`) for conflict detection to keep O(n+m) behavior.
- Timestamps: always treat timestamps as ISO 8601 strings and compare via `isTimestampNewer()`.
- Atomic writes: never write CSV directly; use `writeCSV()`.
- Error handling: operations should be best-effort; log errors and continue processing other items.

## Deduplication Details
- Implemented in `src/utils/duplicate.ts`. Two exported functions:
  - `dedupeCsvRowsByTitle(rows, caseSensitive, tieBreaker)`
  - `dedupeGitHubIssuesByTitle(issues, caseSensitive, tieBreaker)`
- Matching is by title string (normalized by case-sensitivity flag).
- Decision to keep is based on `updated_at` using `isTimestampNewer`. If timestamps equal, `tieBreaker` controls choice:
  - `first`: keep first encountered (default)
  - `prefer_csv`: when deduping CSV rows, prefer rows that already have an `id` (linked to GitHub)
  - `prefer_github`: when deduping GitHub issues, prefer the one with higher issue number
  - `highest_id`: prefer the item with the higher numeric id/number
- The dedupe step returns both `kept` and `removed` arrays. The SyncEngine writes a timestamped backup containing removed items before continuing.

## Configuration (env vars)
- `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `CSV_FILE_PATH` — required as before.
- `DEBUG=true` — enable debug logging.
- `DEDUPE_TITLE_CASE_SENSITIVE=false` — default behavior is case-insensitive matching.
- `DEDUPE_TIE_BREAKER=first` — default tie-breaker. Other valid values: `prefer_csv`, `prefer_github`, `highest_id`.

Config is loaded from `src/config/index.ts` and exposed to commands and `SyncEngine`.

## Where to Change Behavior Safely
- To change tie-break behavior, modify `src/utils/duplicate.ts` and update `src/config/index.ts` to expose additional options if needed.
- To change atomic write behavior or add backup formats, modify `src/csv/writer.ts` and the backup write in `src/sync/syncEngine.ts`.

## Tests and Manual Verification
- No unit tests exist; prefer small, manual integration tests:
  1. Create a CSV with duplicate titles and varying `updated_at` values.
  2. Set `DEDUPE_TITLE_CASE_SENSITIVE` and `DEDUPE_TIE_BREAKER` as needed.
  3. Run `npm run dev` and confirm only the newest item per title remains in final `issues.csv` and backup file contains removed rows.

## Small Implementation Notes for Agents
- Always update `src/types/index.ts` when adding new config fields so TypeScript catches misuse.
- Keep changes localized: the dedupe pass runs in `SyncEngine.sync()` right after initial load—this is the minimal change surface.
- Use existing helpers for conversions: `githubIssueToCsvRow()` when converting removed GitHub issues to CSV rows for backup.

## Summary
This repository focuses on a small, well-scoped problem. Key places to touch: `SyncEngine` for orchestration, `duplicate.ts` to change dedupe logic, and `csv/writer.ts` for output semantics. Preserve timestamp comparisons and atomic writes; avoid changing the conflict-resolution model unless explicitly requested.
