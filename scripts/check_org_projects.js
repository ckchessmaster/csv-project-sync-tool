#!/usr/bin/env node

/**
 * Check GitHub organization/user projects using GraphQL
 */

import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.GITHUB_TOKEN;
const owner = process.env.GITHUB_OWNER;

if (!token || !owner) {
  console.error('Missing env vars');
  process.exit(1);
}

// Try as organization first
const orgQuery = `
query {
  organization(login: "${owner}") {
    projectsV2(first: 10) {
      nodes {
        id
        title
        number
        fields(first: 20) {
          nodes {
            ... on ProjectV2Field {
              id
              name
              dataType
            }
            ... on ProjectV2SingleSelectField {
              id
              name
              dataType
              options {
                id
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

// Try as user if org fails
const userQuery = `
query {
  user(login: "${owner}") {
    projectsV2(first: 10) {
      nodes {
        id
        title
        number
        fields(first: 20) {
          nodes {
            ... on ProjectV2Field {
              id
              name
              dataType
            }
            ... on ProjectV2SingleSelectField {
              id
              name
              dataType
              options {
                id
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

async function tryQuery(query, type) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query });

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
          resolve({ type, result });
        } catch (e) {
          reject(new Error('Failed to parse response'));
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.write(data);
    req.end();
  });
}

(async () => {
  console.log('Trying organization query...');
  try {
    const orgResult = await tryQuery(orgQuery, 'organization');
    if (!orgResult.result.errors && orgResult.result.data.organization) {
      console.log('Found organization projects:');
      console.log(JSON.stringify(orgResult.result, null, 2));
      return;
    }
  } catch (e) {
    console.log('Organization query failed, trying user...');
  }

  console.log('Trying user query...');
  try {
    const userResult = await tryQuery(userQuery, 'user');
    console.log(JSON.stringify(userResult.result, null, 2));
  } catch (e) {
    console.error('Both queries failed:', e);
  }
})();
