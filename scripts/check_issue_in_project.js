#!/usr/bin/env node

/**
 * Check specific issue status in project
 */

import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.GITHUB_TOKEN;
const owner = process.env.GITHUB_OWNER;
const repo = process.env.GITHUB_REPO;
const issueNumber = process.argv[2] || 7;

const query = `
  query($owner: String!, $repo: String!, $issueNumber: Int!) {
    repository(owner: $owner, name: $repo) {
      issue(number: $issueNumber) {
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
`;

const data = JSON.stringify({ 
  query,
  variables: { owner, repo, issueNumber: parseInt(issueNumber) }
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
      const issue = result?.data?.repository?.issue;
      
      if (!issue) {
        console.log(`Issue #${issueNumber} not found`);
        return;
      }
      
      console.log(`\nIssue #${issue.number}: ${issue.title}`);
      
      const projectItems = issue.projectItems?.nodes || [];
      if (projectItems.length === 0) {
        console.log('❌ NOT in any project\n');
        console.log('To enable status sync:');
        console.log(`1. Go to your project: https://github.com/users/${owner}/projects/1`);
        console.log('2. Click "Add item"');
        console.log(`3. Search for #${issueNumber} and add it`);
      } else {
        projectItems.forEach(item => {
          const status = item.fieldValueByName?.name || 'No status';
          console.log(`✅ In project "${item.project.title}" #${item.project.number}`);
          console.log(`   Current status: ${status}\n`);
        });
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
