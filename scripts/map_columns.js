#!/usr/bin/env node

/**
 * Script to map issues to correct columns based on their content
 * Columns: backlog, ready, in-progress, done
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
  const columnCounts = { backlog: 0, ready: 0, 'in-progress': 0, done: 0 };

  const updatedRows = rows.map((row) => {
    const state = row.state.toLowerCase();
    const body = (row.body || '').toLowerCase();
    const title = (row.title || '').toLowerCase();
    
    let statusColumn = 'backlog'; // default

    if (state === 'closed') {
      // Closed issues go to done
      statusColumn = 'done';
    } else if (state === 'open') {
      // Check for acceptance criteria completion markers
      const allCheckboxes = (body.match(/- \[./g) || []).length;
      const completedCheckboxes = (body.match(/- \[x\]/gi) || []).length;
      
      if (allCheckboxes === 0) {
        // No checkboxes = backlog
        statusColumn = 'backlog';
      } else if (completedCheckboxes === allCheckboxes) {
        // All completed = ready to merge/close (move to ready for review)
        statusColumn = 'ready';
      } else if (completedCheckboxes > 0) {
        // Some completed = in-progress
        statusColumn = 'in-progress';
      } else {
        // No completed items = backlog
        statusColumn = 'backlog';
      }
    }
    
    columnCounts[statusColumn]++;
    
    return {
      ...row,
      status_column: statusColumn,
      updated_at: now,
    };
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

  console.log(`✓ Updated ${updatedRows.length} rows with correct column mapping`);
  console.log(`Column distribution: ${JSON.stringify(columnCounts)}`);
  console.log(`Run 'npm run push' to sync changes to GitHub`);
} catch (error) {
  console.error('✗ Error:', error.message);
  process.exit(1);
}
