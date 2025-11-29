/**
 * Configuration module - loads and validates environment variables
 */

import dotenv from 'dotenv';
import { SyncConfig } from '../types/index.js';

dotenv.config();

export function loadConfig(): SyncConfig {
  const githubToken = process.env.GITHUB_TOKEN;
  const githubOwner = process.env.GITHUB_OWNER;
  const githubRepo = process.env.GITHUB_REPO;
  const csvFilePath = process.env.CSV_FILE_PATH || './issues.csv';
  const dedupeTitleCaseSensitive = (process.env.DEDUPE_TITLE_CASE_SENSITIVE || 'false').toLowerCase() === 'true';
  const dedupeTieBreaker = (process.env.DEDUPE_TIE_BREAKER || 'first') as 'first' | 'prefer_csv' | 'prefer_github' | 'highest_id';
  const dedupeDeleteOnGithub = (process.env.DEDUPE_DELETE_GITHUB || 'false').toLowerCase() === 'true';
  const dedupeDryRun = (process.env.DEDUPE_DRY_RUN || 'false').toLowerCase() === 'true';
  const dedupeCloseBatchSize = parseInt(process.env.DEDUPE_CLOSE_BATCH_SIZE || '5', 10) || 5;
  const githubProjectNumber = process.env.GITHUB_PROJECT_NUMBER ? parseInt(process.env.GITHUB_PROJECT_NUMBER, 10) : undefined;
  const syncProjectStatus = (process.env.SYNC_PROJECT_STATUS || 'true').toLowerCase() === 'true';

  const errors: string[] = [];

  if (!githubToken) errors.push('GITHUB_TOKEN not set in .env');
  if (!githubOwner) errors.push('GITHUB_OWNER not set in .env');
  if (!githubRepo) errors.push('GITHUB_REPO not set in .env');

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }

  return {
    githubToken: githubToken!,
    githubOwner: githubOwner!,
    githubRepo: githubRepo!,
    csvFilePath,
    dedupeTitleCaseSensitive,
    dedupeTieBreaker,
    dedupeDeleteOnGithub,
    dedupeDryRun,
    dedupeCloseBatchSize,
    githubProjectNumber,
    syncProjectStatus,
  };
}
