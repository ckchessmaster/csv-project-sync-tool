#!/usr/bin/env node

/**
 * Script to check GitHub project board configuration
 */

import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.GITHUB_TOKEN;
const owner = process.env.GITHUB_OWNER;
const repo = process.env.GITHUB_REPO;

if (!token || !owner || !repo) {
  console.error('Missing GITHUB_TOKEN, GITHUB_OWNER, or GITHUB_REPO env vars');
  process.exit(1);
}

const octokit = new Octokit({ auth: token });

(async () => {
  try {
    // List all projects in the repository
    const projects = await octokit.projects.listForRepo({
      owner,
      repo,
    });

    console.log(`Found ${projects.data.length} projects:\n`);
    
    for (const project of projects.data) {
      console.log(`Project: ${project.name} (ID: ${project.id})`);
      console.log(`  URL: ${project.html_url}`);
      console.log(`  Columns: ${project.body || 'N/A'}\n`);
    }

    if (projects.data.length > 0) {
      const project = projects.data[0];
      console.log(`\nGetting columns for project: ${project.name}`);
      
      const columns = await octokit.projects.listColumns({
        project_id: project.id,
      });

      console.log(`\nColumns in project:`);
      for (const col of columns.data) {
        console.log(`  - ${col.name} (ID: ${col.id})`);
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
