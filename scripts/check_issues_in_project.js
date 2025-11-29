#!/usr/bin/env node

/**
 * Check which issues are in the GitHub Project
 */

import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.GITHUB_TOKEN;
const owner = process.env.GITHUB_OWNER;
const repo = process.env.GITHUB_REPO;

const query = `
  query($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      issues(first: 20, states: OPEN, orderBy: {field: CREATED_AT, direction: DESC}) {
        nodes {
          number
          title
          projectItems(first: 5) {
            nodes {
              id
              project {
                title
                number
              }
              fieldValueByName(name: "Status") {
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                }
              }
            }
          }
        }
      }
    }
  }
`;

const data = JSON.stringify({ 
  query,
  variables: { owner, repo }
});

const options = {
  hostname: 'api.github.com',
  path: '/graphql',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'Node.js',
  },
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => (body += chunk));
  res.on('end', () => {
    try {
      const result = JSON.parse(body);
      const issues = result?.data?.repository?.issues?.nodes || [];
      
      console.log('\n📊 Recent Open Issues and their Project Status:\n');
      
      issues.forEach(issue => {
        const projectItems = issue.projectItems?.nodes || [];
        console.log(`Issue #${issue.number}: ${issue.title}`);
        
        if (projectItems.length === 0) {
          console.log('  ❌ Not in any project\n');
        } else {
          projectItems.forEach(item => {
            const status = item.fieldValueByName?.name || 'No status';
            console.log(`  ✅ In project "${item.project.title}" (${status})\n`);
          });
        }
      });
      
      const notInProject = issues.filter(i => !i.projectItems?.nodes?.length);
      if (notInProject.length > 0) {
        console.log(`\n⚠️  ${notInProject.length} issue(s) are not in any project.`);
        console.log('Add them to your project board to enable status sync.\n');
      }
    } catch (e) {
      console.error('Failed to parse response');
      console.log(body);
    }
  });
});

req.on('error', (e) => {
  console.error('Error:', e.message);
});

req.write(data);
req.end();
