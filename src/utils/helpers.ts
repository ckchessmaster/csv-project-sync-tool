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
export function githubIssueToCsvRow(issue: GitHubIssue, statusColumn?: string): CSVRow {
  const labelNames = issue.labels.map((l) => l.name);
  // Extract status_column from labels if not provided
  const finalStatusColumn = statusColumn || extractStatusColumnFromLabels(labelNames) || 'todo';
  // Remove status_column labels from the stored labels string
  const cleanedLabels = removeStatusColumnLabel(labelNames);
  
  return {
    id: String(issue.number),
    title: issue.title,
    body: issue.body,
    state: issue.state,
    labels: labelsArrayToString(cleanedLabels),
    updated_at: issue.updated_at,
    status_column: finalStatusColumn,
  };
}

/**
 * Convert CSV row to GitHub issue format
 */
export function csvRowToGitHubIssue(row: CSVRow): Issue {
  const labels = parseLabelsString(row.labels);
  // Add status_column as a label if present
  const labelsWithStatus = row.status_column 
    ? addStatusColumnLabel(labels, row.status_column)
    : labels;
  return {
    number: parseInt(row.id, 10) || undefined,
    title: row.title,
    body: row.body,
    state: row.state,
    labels: labelsWithStatus,
    updated_at: row.updated_at,
    status_column: row.status_column,
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

/**
 * Extract status_column from labels array
 */
export function extractStatusColumnFromLabels(labels: string[]): string | undefined {
  if (!labels || labels.length === 0) return undefined;
  const statusLabels = labels.map((l) => (l || '').toLowerCase());
  if (statusLabels.includes('todo')) return 'todo';
  if (statusLabels.includes('backlog')) return 'backlog';
  if (statusLabels.includes('ready')) return 'ready';
  if (statusLabels.includes('in-progress') || statusLabels.includes('in progress')) return 'in-progress';
  if (statusLabels.includes('inprogress')) return 'in-progress';
  if (statusLabels.includes('done')) return 'done';
  if (statusLabels.includes('blocked')) return 'blocked';
  return undefined;
}

/**
 * Remove status_column label from labels array
 */
export function removeStatusColumnLabel(labels: string[]): string[] {
  if (!labels) return [];
  return labels.filter((l) => {
    const lower = (l || '').toLowerCase();
    return ![
      'todo',
      'backlog',
      'ready',
      'in-progress',
      'in progress',
      'inprogress',
      'done',
      'blocked',
    ].includes(lower);
  });
}

/**
 * Add status_column label to labels array (replaces any existing status label)
 * Capitalize to match GitHub Projects board expectations
 */
export function addStatusColumnLabel(labels: string[], statusColumn: string): string[] {
  if (!statusColumn) return labels;
  const cleaned = removeStatusColumnLabel(labels || []);
  // Capitalize the status column for GitHub Projects
  const capitalizedStatus = statusColumn.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  return [...cleaned, capitalizedStatus];
}
