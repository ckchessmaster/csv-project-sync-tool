#!/usr/bin/env node

/**
 * Check specific issue labels
 */

import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.GITHUB_TOKEN;
const owner = process.env.GITHUB_OWNER;
const repo = process.env.GITHUB_REPO;

if (!token || !owner || !repo) {
  console.error('Missing env vars');
  process.exit(1);
}

const octokit = new Octokit({ auth: token });

(async () => {
  try {
    const issue = await octokit.issues.get({
      owner,
      repo,
      issue_number: 1,
    });

    const labels = issue.data.labels.map((l) => typeof l === 'string' ? l : l.name);
    console.log(`Issue #1 labels: ${labels.join(', ')}`);
  } catch (error) {
    console.error('Error:', error.message);
  }
})();
