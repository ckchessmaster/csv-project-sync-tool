#!/usr/bin/env node

/**
 * Script to add status_column labels to all issues
 * Forces updated_at to current timestamp so push will sync them
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const csvFilePath = process.env.CSV_FILE_PATH || path.join(__dirname, '../issues.csv');

try {
  const content = fs.readFileSync(csvFilePath, 'utf-8');
  const rows = parse(content, {
    columns: true,
    skip_empty_lines: true,
  });

  const now = new Date().toISOString();
  let updated = 0;

  // Update each row with timestamp so push will sync the status_column labels
  const updatedRows = rows.map((row) => {
    const oldTimestamp = row.updated_at;
    return {
      ...row,
      updated_at: now, // Force update so push will sync
    };
  });

  // Write back
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

  // Atomic write: write to temp file, then rename
  const tempPath = `${csvFilePath}.tmp`;
  fs.writeFileSync(tempPath, csv, 'utf-8');
  fs.renameSync(tempPath, csvFilePath);

  console.log(`✓ Updated ${updatedRows.length} rows with timestamp ${now}`);
} catch (error) {
  console.error('✗ Error:', error.message);
  process.exit(1);
}
