#!/usr/bin/env node

/**
 * Script to verify that status_column labels were synced to GitHub
 */

import { Octokit } from '@octokit/rest';

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
    // Check issue #1
    const response = await octokit.issues.get({
      owner,
      repo,
      issue_number: 1,
    });

    const issue = response.data;
    const labels = issue.labels.map((l) => typeof l === 'string' ? l : l.name);
    
    console.log(`Issue #1: "${issue.title}"`);
    console.log(`Labels: ${labels.join(', ')}`);
    
    // Check for status column label
    const statusLabels = labels.filter((l) => ['todo', 'in-progress', 'inprogress', 'done', 'blocked'].includes(l.toLowerCase()));
    if (statusLabels.length > 0) {
      console.log(`✓ Status column label found: ${statusLabels[0]}`);
    } else {
      console.log(`✗ No status column label found`);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
