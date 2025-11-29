/**
 * Duplicate removal helpers - dedupe by title (keep newest by updated_at)
 */
import { CSVRow, GitHubIssue } from '../types/index.js';
import { isTimestampNewer } from './helpers.js';

export type DedupeResultCSV = {
  keptRows: CSVRow[];
  removedRows: CSVRow[];
};

export type DedupeResultGH = {
  kept: GitHubIssue[];
  removed: GitHubIssue[];
};

function normalizeTitle(title: string, caseSensitive: boolean): string {
  return caseSensitive ? title : title.toLowerCase();
}

export function dedupeCsvRowsByTitle(
  rows: CSVRow[],
  caseSensitive = false,
  tieBreaker: 'first' | 'prefer_csv' | 'prefer_github' | 'highest_id' = 'first'
): DedupeResultCSV {
  const map = new Map<string, CSVRow>();
  const removed: CSVRow[] = [];

  for (const row of rows) {
    const key = normalizeTitle(row.title || '', caseSensitive);
    if (!map.has(key)) {
      map.set(key, row);
      continue;
    }

    const existing = map.get(key)!;

    // Keep the newest based on updated_at
    if (isTimestampNewer(row.updated_at, existing.updated_at)) {
      // current row is newer -> replace and push existing to removed
      map.set(key, row);
      removed.push(existing);
    } else if (isTimestampNewer(existing.updated_at, row.updated_at)) {
      // existing is newer -> remove current
      removed.push(row);
    } else {
      // timestamps equal -> use tieBreaker
      if (tieBreaker === 'highest_id') {
        const existingId = parseInt(existing.id || '0', 10) || 0;
        const rowId = parseInt(row.id || '0', 10) || 0;
        if (rowId > existingId) {
          map.set(key, row);
          removed.push(existing);
        } else {
          removed.push(row);
        }
      } else if (tieBreaker === 'prefer_csv') {
        // prefer row that has an id (linked to GitHub) if available
        const existingHasId = !!existing.id && existing.id.trim() !== '';
        const rowHasId = !!row.id && row.id.trim() !== '';
        if (rowHasId && !existingHasId) {
          map.set(key, row);
          removed.push(existing);
        } else {
          removed.push(row);
        }
      } else {
        // 'first' or 'prefer_github' fallback behaves like 'first' here
        removed.push(row);
      }
    }
  }

  return { keptRows: Array.from(map.values()), removedRows: removed };
}

export function dedupeGitHubIssuesByTitle(
  issues: GitHubIssue[],
  caseSensitive = false,
  tieBreaker: 'first' | 'prefer_csv' | 'prefer_github' | 'highest_id' = 'first'
): DedupeResultGH {
  const map = new Map<string, GitHubIssue>();
  const removed: GitHubIssue[] = [];

  for (const issue of issues) {
    const key = normalizeTitle(issue.title || '', caseSensitive);
    if (!map.has(key)) {
      map.set(key, issue);
      continue;
    }

    const existing = map.get(key)!;

    if (isTimestampNewer(issue.updated_at, existing.updated_at)) {
      map.set(key, issue);
      removed.push(existing);
    } else if (isTimestampNewer(existing.updated_at, issue.updated_at)) {
      removed.push(issue);
    } else {
      // tie -> use tieBreaker
      if (tieBreaker === 'highest_id') {
        if ((issue.number || 0) > (existing.number || 0)) {
          map.set(key, issue);
          removed.push(existing);
        } else {
          removed.push(issue);
        }
      } else if (tieBreaker === 'prefer_github') {
        // both are GitHub issues; prefer the one with higher number
        if ((issue.number || 0) > (existing.number || 0)) {
          map.set(key, issue);
          removed.push(existing);
        } else {
          removed.push(issue);
        }
      } else {
        // 'first' or 'prefer_csv' fallback -> keep first encountered
        removed.push(issue);
      }
    }
  }

  return { kept: Array.from(map.values()), removed };
}
