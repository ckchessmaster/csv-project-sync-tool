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
  };
}
