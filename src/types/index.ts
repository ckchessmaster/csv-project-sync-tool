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
}

export interface CSVRow {
  id: string;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: string;
  updated_at: string;
}

export interface SyncConfig {
  githubToken: string;
  githubOwner: string;
  githubRepo: string;
  csvFilePath: string;
}

export interface SyncResult {
  csvRowsCreated: number;
  csvRowsUpdated: number;
  githubIssuesCreated: number;
  githubIssuesUpdated: number;
  githubIssuesSkipped: number;
  deletedRowsMarked: number;
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
