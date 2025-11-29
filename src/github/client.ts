/**
 * GitHub API Client - wrapper around Octokit for fetching and updating issues
 */

import { Octokit } from '@octokit/rest';
import { GitHubIssue, Issue } from '../types/index.js';

export class GitHubClient {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(token: string, owner: string, repo: string) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
  }

  /**
   * Delete an issue from GitHub (requires delete scope)
   */
  async deleteIssue(issueNumber: number): Promise<void> {
    try {
      // GitHub's REST API doesn't support deleting issues directly
      // We need to use the GraphQL API
      const mutation = `
        mutation($issueId: ID!) {
          deleteIssue(input: { issueId: $issueId }) {
            repository {
              id
            }
          }
        }
      `;

      // First, get the issue's node ID
      const issue = await this.octokit.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
      });

      await this.octokit.graphql(mutation, {
        issueId: issue.data.node_id,
      });
    } catch (error: any) {
      // If deletion fails due to permissions, fall back to closing
      if (error.message && (error.message.includes('not found') || error.message.includes('Field \'deleteIssue\' doesn\'t exist'))) {
        throw new Error(`Cannot delete issue #${issueNumber}: GitHub API doesn't support issue deletion. Issues can only be closed.`);
      }
      throw new Error(`Failed to delete issue #${issueNumber} on GitHub: ${error}`);
    }
  }

  /**
   * Close an existing issue and mark it as a duplicate (adds label and optional comment)
   */
  async closeIssueAsDuplicate(issueNumber: number, existingLabels: string[] = [], comment?: string): Promise<void> {
    try {
      const cleaned = (existingLabels || []).map((l) => (l || '').toString().trim()).filter((l) => l.length > 0);
      const labels = Array.from(new Set([...(cleaned || []), 'duplicate']));
      // Update issue state to closed and add duplicate label
      await this.octokit.issues.update({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        state: 'closed',
        labels,
      });

      if (comment) {
        await this.octokit.issues.createComment({
          owner: this.owner,
          repo: this.repo,
          issue_number: issueNumber,
          body: comment,
        });
      }
    } catch (error) {
      throw new Error(`Failed to close/label duplicate issue #${issueNumber} on GitHub: ${error}`);
    }
  }

  /**
   * Fetch all issues from the repository with pagination
   */
  async fetchAllIssues(): Promise<GitHubIssue[]> {
    const issues: GitHubIssue[] = [];
    let page = 1;
    const perPage = 100;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.octokit.issues.listForRepo({
          owner: this.owner,
          repo: this.repo,
          state: 'all', // Get both open and closed issues
          per_page: perPage,
          page,
        });

        const githubIssues = response.data.map((issue) => ({
          number: issue.number,
          title: issue.title,
          body: issue.body || '',
          state: issue.state as 'open' | 'closed',
          labels: issue.labels.map((label) => ({
            name: typeof label === 'string' ? label : label.name,
          })),
          updated_at: issue.updated_at,
          created_at: issue.created_at,
          url: issue.html_url,
        })) as GitHubIssue[];

        issues.push(...githubIssues);

        // Check if there are more pages
        hasMore = response.data.length === perPage;
        page++;
      } catch (error) {
        throw new Error(`Failed to fetch issues from GitHub: ${error}`);
      }
    }

    return issues;
  }

  /**
   * Create a new issue on GitHub
   */
  async createIssue(issue: Issue): Promise<GitHubIssue> {
    try {
      const response = await this.octokit.issues.create({
        owner: this.owner,
        repo: this.repo,
        title: issue.title,
        body: issue.body,
        labels: issue.labels,
      });

      return {
        number: response.data.number,
        title: response.data.title,
        body: response.data.body || '',
        state: response.data.state as 'open' | 'closed',
        labels: response.data.labels.map((label) => ({
          name: (typeof label === 'string' ? label : label.name) || '',
        })),
        updated_at: response.data.updated_at,
        created_at: response.data.created_at,
        url: response.data.html_url,
      };
    } catch (error) {
      throw new Error(`Failed to create issue on GitHub: ${error}`);
    }
  }

  /**
   * Update an existing issue on GitHub
   */
  async updateIssue(issueNumber: number, issue: Partial<Issue>): Promise<void> {
    try {
      await this.octokit.issues.update({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        labels: issue.labels,
      });
    } catch (error) {
      throw new Error(
        `Failed to update issue #${issueNumber} on GitHub: ${error}`
      );
    }
  }

  /**
   * Create a map of GitHub issues by issue number
   */
  githubIssuesToMap(issues: GitHubIssue[]): Map<number, GitHubIssue> {
    const map = new Map<number, GitHubIssue>();
    for (const issue of issues) {
      map.set(issue.number, issue);
    }
    return map;
  }
}
