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
const now = new Date().toISOString();

const updated = records.map((row) => ({
  id: row.id || '',
  title: row.title || '',
  body: row.body || '',
  state: row.state || '',
  labels: row.labels || '',
  updated_at: now,
}));

const csv = stringify(updated, { header: true, columns: ['id', 'title', 'body', 'state', 'labels', 'updated_at'] });
const temp = filePath + '.temp';
fs.writeFileSync(temp, csv, 'utf-8');
fs.renameSync(temp, filePath);
console.log(`Bumped updated_at for ${updated.length} rows to ${now}`);
