/**
 * Type definitions for GitHub ↔ CSV Sync Tool
 */

export interface Issue {
  id?: number;
  number?: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: string[];
  updated_at: string;
  created_at?: string;
  url?: string;
  status_column?: string;
}

export interface CSVRow {
  id: string;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: string;
  updated_at: string;
  status_column?: string;
}

export interface SyncConfig {
  githubToken: string;
  githubOwner: string;
  githubRepo: string;
  csvFilePath: string;
  dedupeTitleCaseSensitive?: boolean;
  dedupeTieBreaker?: 'first' | 'prefer_csv' | 'prefer_github' | 'highest_id';
  dedupeDeleteOnGithub?: boolean;
  dedupeDryRun?: boolean;
  dedupeCloseBatchSize?: number;
  githubProjectNumber?: number;
  syncProjectStatus?: boolean;
}

export interface SyncResult {
  csvRowsCreated: number;
  csvRowsUpdated: number;
  githubIssuesCreated: number;
  githubIssuesUpdated: number;
  githubIssuesSkipped: number;
  deletedRowsMarked: number;
  removedDuplicates?: number;
  githubDuplicatesClosed?: number;
  githubDuplicatePreviewPath?: string;
  errors: string[];
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: Array<{ name: string }>;
  updated_at: string;
  created_at: string;
  url: string;
}
