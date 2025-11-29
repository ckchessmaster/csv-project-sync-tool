#!/usr/bin/env node

/**
 * Bump timestamps for issues with changed status_column
 * This ensures the sync tool recognizes them as modified and pushes to GitHub
 */

import fs from 'fs';
import { parseCSV } from '../dist/csv/parser.js';
import { writeCSV } from '../dist/csv/writer.js';
import { loadConfig } from '../dist/config/index.js';

const config = loadConfig();
const csvPath = config.csvFilePath;

console.log(`📝 Bumping timestamps for modified status columns in ${csvPath}\n`);

// Read current CSV
const rows = parseCSV(csvPath);
const now = new Date().toISOString();
let bumpedCount = 0;

// Read from GitHub to compare
console.log('Fetching current state from GitHub...');
const { GitHubClient } = await import('../dist/github/client.js');
const githubClient = new GitHubClient(config.githubToken, config.githubOwner, config.githubRepo);
const githubIssues = await githubClient.fetchAllIssues();
const githubMap = new Map(githubIssues.map(issue => [issue.number, issue]));

// Check each row
const updatedRows = rows.map(row => {
  if (!row.id) return row; // Skip rows without ID
  
  const issueNumber = parseInt(row.id, 10);
  const githubIssue = githubMap.get(issueNumber);
  
  if (!githubIssue) return row; // Skip if not on GitHub
  
  // Extract GitHub status from labels
  const githubLabels = githubIssue.labels.map(l => l.name.toLowerCase());
  let githubStatus = 'backlog'; // default
  
  if (githubLabels.includes('done')) githubStatus = 'done';
  else if (githubLabels.includes('in-progress') || githubLabels.includes('in progress')) githubStatus = 'in-progress';
  else if (githubLabels.includes('ready')) githubStatus = 'ready';
  else if (githubLabels.includes('backlog')) githubStatus = 'backlog';
  
  // Normalize for comparison
  const csvStatus = (row.status_column || 'backlog').toLowerCase().replace(/\s+/g, '-');
  const normalizedGithubStatus = githubStatus.toLowerCase().replace(/\s+/g, '-');
  
  // If status differs, bump the timestamp
  if (csvStatus !== normalizedGithubStatus) {
    console.log(`  Issue #${row.id}: ${row.title}`);
    console.log(`    CSV status: ${csvStatus} → GitHub status: ${normalizedGithubStatus}`);
    console.log(`    Bumping timestamp: ${row.updated_at} → ${now}`);
    bumpedCount++;
    
    return {
      ...row,
      updated_at: now
    };
  }
  
  return row;
});

if (bumpedCount === 0) {
  console.log('✓ No status changes detected. All issues are in sync.\n');
} else {
  console.log(`\n✓ Bumped timestamps for ${bumpedCount} issue(s)`);
  writeCSV(csvPath, updatedRows);
  console.log(`✓ Updated ${csvPath}`);
  console.log('\nRun "npm run sync" to push these changes to GitHub.\n');
}
