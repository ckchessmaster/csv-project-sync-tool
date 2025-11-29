/**
 * CSV Writer - writes CSV files atomically
 */

import fs from 'fs';
import path from 'path';
import { stringify } from 'csv-stringify/sync';
import { CSVRow } from '../types/index.js';

const HEADERS = ['id', 'title', 'body', 'state', 'labels', 'updated_at'];

export function writeCSV(filePath: string, rows: CSVRow[]): void {
  // Format rows for CSV output
  const csvRows = rows.map((row) => ({
    id: row.id || '',
    title: row.title,
    body: row.body,
    state: row.state,
    labels: row.labels,
    updated_at: row.updated_at,
  }));

  try {
    const csvContent = stringify(csvRows, {
      header: true,
      columns: HEADERS,
    });

    // Atomic write: write to temp file, then rename
    const tempFilePath = `${filePath}.temp`;
    fs.writeFileSync(tempFilePath, csvContent, 'utf-8');

    // Rename temp file to actual file (atomic operation)
    fs.renameSync(tempFilePath, filePath);
  } catch (error) {
    throw new Error(`Failed to write CSV at ${filePath}: ${error}`);
  }
}

export function appendRowToCSV(filePath: string, row: CSVRow): void {
  const existingRows = fs.existsSync(filePath)
    ? parseExistingCSV(filePath)
    : [];
  existingRows.push(row);
  writeCSV(filePath, existingRows);
}

function parseExistingCSV(filePath: string): CSVRow[] {
  const { parseCSV } = require('./parser.js');
  return parseCSV(filePath);
}
