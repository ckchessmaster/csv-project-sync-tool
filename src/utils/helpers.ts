/**
 * Helpers - utility functions for label parsing and data transformation
 */

import { GitHubIssue, CSVRow, Issue } from '../types/index.js';

/**
 * Parse comma-separated labels string into array
 */
export function parseLabelsString(labelsStr: string): string[] {
  if (!labelsStr || !labelsStr.trim()) {
    return [];
  }
  return labelsStr
    .split(',')
    .map((label) => label.trim())
    .filter((label) => label.length > 0);
}

/**
 * Convert labels array to comma-separated string
 */
export function labelsArrayToString(labels: string[]): string {
  return labels.join(',');
}

/**
 * Convert GitHub issue to CSV row format
 */
export function githubIssueToCsvRow(issue: GitHubIssue): CSVRow {
  return {
    id: String(issue.number),
    title: issue.title,
    body: issue.body,
    state: issue.state,
    labels: labelsArrayToString(issue.labels.map((l) => l.name)),
    updated_at: issue.updated_at,
  };
}

/**
 * Convert CSV row to GitHub issue format
 */
export function csvRowToGitHubIssue(row: CSVRow): Issue {
  return {
    number: parseInt(row.id, 10) || undefined,
    title: row.title,
    body: row.body,
    state: row.state,
    labels: parseLabelsString(row.labels),
    updated_at: row.updated_at,
  };
}

/**
 * Parse ISO 8601 timestamp to Date object for comparison
 */
export function parseTimestamp(timestamp: string): Date {
  return new Date(timestamp);
}

/**
 * Check if first timestamp is newer than second
 */
export function isTimestampNewer(timestamp1: string, timestamp2: string): boolean {
  const date1 = parseTimestamp(timestamp1);
  const date2 = parseTimestamp(timestamp2);
  return date1 > date2;
}

/**
 * Sleep utility for rate limiting
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
