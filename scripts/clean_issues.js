#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const filePath = path.resolve(process.cwd(), 'issues.csv');
if (!fs.existsSync(filePath)) {
  console.error('issues.csv not found');
  process.exit(1);
}

const raw = fs.readFileSync(filePath, 'utf-8');
const records = parse(raw, { columns: true, skip_empty_lines: true });

function cleanTitle(title) {
  if (!title) return '';
  // Remove any leading occurrences of [DELETED] (case-insensitive) and surrounding whitespace
  return title.replace(/^(?:\s*\[DELETED\]\s*)+/i, '').trim();
}

function cleanLabels(labels) {
  if (!labels) return '';
  // labels may be a comma-separated string; remove "duplicate" token (case-insensitive)
  const tokens = labels
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.toLowerCase() !== 'duplicate');
  return tokens.join(',');
}

const cleaned = records.map((row) => {
  return {
    id: row.id || '',
    title: cleanTitle(row.title || ''),
    body: row.body || '',
    state: row.state || '',
    labels: cleanLabels(row.labels || ''),
    updated_at: row.updated_at || '',
  };
});

const csv = stringify(cleaned, { header: true, columns: ['id', 'title', 'body', 'state', 'labels', 'updated_at'] });
const temp = filePath + '.temp';
fs.writeFileSync(temp, csv, 'utf-8');
fs.renameSync(temp, filePath);
console.log('Cleaned issues.csv — removed duplicate labels and [DELETED] prefixes.');
