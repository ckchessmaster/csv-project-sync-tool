/**
 * CSV Parser - reads and parses CSV files
 */

import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { CSVRow } from '../types/index.js';

const REQUIRED_HEADERS = ['id', 'title', 'body', 'state', 'labels', 'updated_at'];

export function parseCSV(filePath: string): CSVRow[] {
  if (!fs.existsSync(filePath)) {
    // Return empty array if file doesn't exist
    return [];
  }

  const fileContent = fs.readFileSync(filePath, 'utf-8');

  if (!fileContent.trim()) {
    // Return empty array if file is empty
    return [];
  }

  try {
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    // Validate headers
    if (records.length > 0) {
      const headers = Object.keys(records[0]);
      const missingHeaders = REQUIRED_HEADERS.filter((h) => !headers.includes(h));

      if (missingHeaders.length > 0) {
        throw new Error(
          `CSV missing required headers: ${missingHeaders.join(', ')}`
        );
      }
    }

    return records as CSVRow[];
  } catch (error) {
    throw new Error(`Failed to parse CSV at ${filePath}: ${error}`);
  }
}

export function csvRowsToMap(rows: CSVRow[]): Map<string, CSVRow> {
  const map = new Map<string, CSVRow>();
  for (const row of rows) {
    if (row.id) {
      map.set(row.id, row);
    }
  }
  return map;
}

export function getNewRowsFromCSV(rows: CSVRow[]): CSVRow[] {
  return rows.filter((row) => !row.id || row.id.trim() === '');
}
