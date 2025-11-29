#!/usr/bin/env node

/**
 * Script to check the current labels on GitHub issues
 */

import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.GITHUB_TOKEN;
const owner = process.env.GITHUB_OWNER;
const repo = process.env.GITHUB_REPO;

if (!token || !owner || !repo) {
  console.error('Missing GITHUB_TOKEN, GITHUB_OWNER, or GITHUB_REPO env vars');
  process.exit(1);
}

const octokit = new Octokit({ auth: token });

(async () => {
  try {
    // Check first 10 issues
    const response = await octokit.issues.listForRepo({
      owner,
      repo,
      state: 'all',
      per_page: 10,
    });

    console.log(`\nLabels found on first 10 issues:\n`);
    const allLabels = new Set();
    
    for (const issue of response.data) {
      const labels = issue.labels.map((l) => typeof l === 'string' ? l : l.name);
      console.log(`Issue #${issue.number}: ${labels.join(', ') || '(no labels)'}`);
      labels.forEach((l) => allLabels.add(l));
    }

    console.log(`\nUnique labels across all checked issues:`);
    console.log(Array.from(allLabels).sort().join('\n'));
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
