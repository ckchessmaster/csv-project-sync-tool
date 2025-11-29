#!/usr/bin/env node

import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.GITHUB_TOKEN;
const owner = process.env.GITHUB_OWNER;
const repo = process.env.GITHUB_REPO;

async function fetchAllIssues() {
  let allIssues = [];
  let page = 1;
  
  while (true) {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/issues?state=all&per_page=100&page=${page}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Node.js'
      }
    };
    
    const issues = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => resolve(JSON.parse(body)));
      });
      req.on('error', reject);
      req.end();
    });
    
    if (issues.length === 0) break;
    allIssues = allIssues.concat(issues);
    page++;
    if (issues.length < 100) break;
  }
  
  return allIssues;
}

(async () => {
  const issues = await fetchAllIssues();
  console.log(`Total issues: ${issues.length}`);
  
  const titles = {};
  issues.forEach(i => {
    const title = i.title.toLowerCase().trim();
    if (!titles[title]) titles[title] = [];
    titles[title].push({ number: i.number, state: i.state, title: i.title });
  });
  
  const dupes = Object.entries(titles).filter(([t, nums]) => nums.length > 1);
  console.log(`\nDuplicate titles found: ${dupes.length}\n`);
  
  dupes.slice(0, 10).forEach(([title, issues]) => {
    console.log(`"${issues[0].title}"`);
    issues.forEach(i => console.log(`  #${i.number} (${i.state})`));
    console.log();
  });
})();
