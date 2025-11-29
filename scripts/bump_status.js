#!/usr/bin/env node

/**
 * Bump updated_at timestamp for specific issues
 * Usage: node scripts/bump_status.js <status> [issue_ids...]
 * Examples:
 *   node scripts/bump_status.js backlog          (bump all backlog issues)
 *   node scripts/bump_status.js in-progress 7 8  (bump issues #7 and #8)
 */

import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import dotenv from 'dotenv';

dotenv.config();

const csvPath = process.env.CSV_FILE_PATH || './issues.csv';
const targetStatus = process.argv[2];
const specificIds = process.argv.slice(3).map(id => id.toString());

if (!targetStatus) {
  console.error('Usage: node scripts/bump_status.js <status> [issue_ids...]');
  console.error('Status values: backlog, ready, in-progress, done');
  process.exit(1);
}

// Read and parse CSV
const csvContent = fs.readFileSync(csvPath, 'utf-8');
const records = parse(csvContent, {
  columns: true,
  skip_empty_lines: true,
  relax_column_count: true,
});

let updatedCount = 0;
const now = new Date().toISOString();

console.log(`\n📝 Bumping timestamps for status: ${targetStatus}\n`);

// Update matching rows
const updatedRecords = records.map(row => {
  const rowStatus = (row.status_column || '').toLowerCase().trim();
  const targetStatusNormalized = targetStatus.toLowerCase().trim();
  
  const shouldUpdate = rowStatus === targetStatusNormalized && 
                       (specificIds.length === 0 || specificIds.includes(row.id));
  
  if (shouldUpdate) {
    const title = row.title.substring(0, 50);
    console.log(`  ✓ Issue #${row.id}: ${title}${title.length === 50 ? '...' : ''}`);
    updatedCount++;
    
    return {
      ...row,
      updated_at: now
    };
  }
  
  return row;
});

if (updatedCount === 0) {
  console.log(`No issues found with status "${targetStatus}"\n`);
} else {
  // Write back to CSV
  const output = stringify(updatedRecords, {
    header: true,
    columns: ['id', 'title', 'body', 'state', 'labels', 'updated_at', 'status_column']
  });
  
  fs.writeFileSync(csvPath, output, 'utf-8');
  console.log(`\n✓ Updated ${updatedCount} issue(s)`);
  console.log(`✓ Saved to ${csvPath}`);
  console.log('\nRun "npm run sync" to push these changes to GitHub.\n');
}
