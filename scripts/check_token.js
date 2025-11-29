#!/usr/bin/env node

/**
 * Check GitHub token scopes
 */

import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.GITHUB_TOKEN;

if (!token) {
  console.error('❌ GITHUB_TOKEN not set in .env');
  process.exit(1);
}

const options = {
  hostname: 'api.github.com',
  path: '/user',
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'User-Agent': 'Node.js'
  }
};

const req = https.request(options, (res) => {
  const scopes = res.headers['x-oauth-scopes'];
  
  console.log('\n🔑 GitHub Token Status\n');
  console.log(`Status Code: ${res.statusCode}`);
  
  if (res.statusCode === 200) {
    console.log('✅ Token is valid\n');
    
    if (scopes) {
      const scopeList = scopes.split(', ').filter(s => s.trim());
      console.log('Scopes granted:');
      scopeList.forEach(scope => console.log(`  ✓ ${scope}`));
      
      console.log('\nRequired for this tool:');
      const hasRepo = scopeList.includes('repo');
      const hasProject = scopeList.includes('project');
      
      console.log(`  ${hasRepo ? '✅' : '❌'} repo (for issues)`);
      console.log(`  ${hasProject ? '✅' : '❌'} project (for project board sync)`);
      
      if (!hasProject) {
        console.log('\n⚠️  Missing "project" scope!');
        console.log('Project board column sync will not work.\n');
        console.log('To fix:');
        console.log('1. Go to: https://github.com/settings/tokens');
        console.log('2. Find your token and click "Edit"');
        console.log('3. Check the "project" scope checkbox');
        console.log('4. Click "Update token"');
        console.log('5. Copy the token and update your .env file\n');
      } else {
        console.log('\n✅ All required scopes present!');
      }
    } else {
      console.log('⚠️  Could not read token scopes');
    }
  } else {
    console.log('❌ Token is invalid or expired');
    console.log('Generate a new token at: https://github.com/settings/tokens');
  }
  
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    try {
      const user = JSON.parse(body);
      if (user.login) {
        console.log(`\nAuthenticated as: ${user.login}`);
      }
    } catch (e) {
      // ignore
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Error checking token:', e.message);
});

req.end();
