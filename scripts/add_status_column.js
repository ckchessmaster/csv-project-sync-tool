#!/usr/bin/env node

/**
 * Script to add status_column to issues.csv
 * Maps labels and state to appropriate column: todo, in-progress, or done
 * 
 * Logic:
 * - If state === 'closed' and no blocking labels → "done"
 * - If labels contain 'in-progress' → "in-progress"
 * - If labels contain 'blocked' or 'waiting' → "blocked" 
 * - Otherwise or if state === 'open' → "todo"
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

  // Add status_column to each row
  const updatedRows = rows.map((row) => {
    const labels = (row.labels || '').toLowerCase();
    const state = (row.state || 'open').toLowerCase();
    let statusColumn = 'todo';

    // Determine which column the issue belongs in
    if (labels.includes('in-progress') || labels.includes('inprogress')) {
      statusColumn = 'in-progress';
    } else if (labels.includes('blocked') || labels.includes('waiting')) {
      statusColumn = 'blocked';
    } else if (state === 'closed') {
      statusColumn = 'done';
    }

    return {
      ...row,
      status_column: statusColumn,
    };
  });

  // Write back with status_column as the last column
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

  // Count by column
  const columnCounts = {};
  updatedRows.forEach((row) => {
    columnCounts[row.status_column] = (columnCounts[row.status_column] || 0) + 1;
  });

  console.log(`✓ Added status_column to ${updatedRows.length} rows in ${csvFilePath}`);
  console.log(`Column distribution: ${JSON.stringify(columnCounts)}`);
} catch (error) {
  console.error('✗ Error:', error.message);
  process.exit(1);
}
