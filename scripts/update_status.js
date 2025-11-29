#!/usr/bin/env node

/**
 * Script to update status_column for issues matching a pattern
 * Usage: node scripts/update_status.js "pattern" "new_status"
 * Example: node scripts/update_status.js "Judge" "in-progress"
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const csvFilePath = process.env.CSV_FILE_PATH || path.join(__dirname, '../issues.csv');
const pattern = process.argv[2];
const newStatus = process.argv[3];
const validStatuses = ['todo', 'in-progress', 'done', 'blocked'];

if (!pattern || !newStatus) {
  console.error('Usage: node scripts/update_status.js "pattern" "new_status"');
  console.error(`Valid statuses: ${validStatuses.join(', ')}`);
  process.exit(1);
}

if (!validStatuses.includes(newStatus)) {
  console.error(`Invalid status: ${newStatus}`);
  console.error(`Valid statuses: ${validStatuses.join(', ')}`);
  process.exit(1);
}

try {
  const content = fs.readFileSync(csvFilePath, 'utf-8');
  const rows = parse(content, {
    columns: true,
    skip_empty_lines: true,
  });

  const now = new Date().toISOString();
  let updated = 0;

  const regex = new RegExp(pattern, 'i');
  const updatedRows = rows.map((row) => {
    if (regex.test(row.title)) {
      updated++;
      return {
        ...row,
        status_column: newStatus,
        updated_at: now, // Update timestamp so push will sync
      };
    }
    return row;
  });

  const csv = stringify(updatedRows, {
    header: true,
    columns: [
      'id',
      'title',
      'body',
      'state',
      'labels',
      'updated_at',
      'status_column',
    ],
  });

  // Atomic write
  const tempPath = `${csvFilePath}.tmp`;
  fs.writeFileSync(tempPath, csv, 'utf-8');
  fs.renameSync(tempPath, csvFilePath);

  console.log(`✓ Updated ${updated} rows with status_column: ${newStatus}`);
  console.log(`Run 'npm run push' to sync changes to GitHub`);
} catch (error) {
  console.error('✗ Error:', error.message);
  process.exit(1);
}
