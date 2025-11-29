/**
 * GitHub Projects (v2) GraphQL Client
 * Handles updating project item status fields
 */

import { Octokit } from '@octokit/rest';
import { logger } from '../utils/logger.js';

interface ProjectV2Item {
  id: string;
  content?: {
    id: string;
    number: number;
  };
}

interface ProjectField {
  id: string;
  name: string;
  options?: Array<{ id: string; name: string }>;
}

interface ProjectInfo {
  id: string;
  title: string;
  number: number;
  fields: ProjectField[];
}

export class GitHubProjectsClient {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private projectNumber?: number;
  private projectCache?: ProjectInfo | null;
  private issueItemCache: Map<number, string> = new Map(); // issueNumber -> projectItemId

  constructor(token: string, owner: string, repo: string, projectNumber?: number) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
    this.projectNumber = projectNumber;
  }

  /**
   * Get project information including field IDs
   */
  private async getProjectInfo(): Promise<ProjectInfo | null> {
    if (this.projectCache) {
      return this.projectCache;
    }

    try {
      // Try user projects first
      const userQuery = `
        query($owner: String!) {
          user(login: $owner) {
            projectsV2(first: 20) {
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

      let result: any = await this.octokit.graphql(userQuery, { owner: this.owner });
      let projects = result?.user?.projectsV2?.nodes || [];

      // If not found in user, try organization
      if (projects.length === 0 || projects.every((p: any) => p === null)) {
        const orgQuery = `
          query($owner: String!) {
            organization(login: $owner) {
              projectsV2(first: 20) {
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

        result = await this.octokit.graphql(orgQuery, { owner: this.owner });
        projects = result?.organization?.projectsV2?.nodes || [];
      }

      // Filter out null projects
      projects = projects.filter((p: any) => p !== null);

      if (projects.length === 0) {
        logger.warn('No projects found. Make sure your GitHub token has "project" scope.');
        return null;
      }

      // Transform projects to extract fields.nodes
      projects = projects.map((p: any) => ({
        id: p.id,
        title: p.title,
        number: p.number,
        fields: p.fields?.nodes || [],
      }));

      // Find the specific project by number, or use the first one
      let project: ProjectInfo | null = null;
      if (this.projectNumber) {
        const found = projects.find((p: ProjectInfo) => p.number === this.projectNumber);
        if (!found) {
          logger.warn(
            `Project #${this.projectNumber} not found. Available: ${projects.map((p: ProjectInfo) => `#${p.number} "${p.title}"`).join(', ')}`
          );
          return null;
        }
        project = found;
      } else {
        project = projects[0] || null;
        if (project) {
          logger.info(`Using first project found: #${project.number} "${project.title}"`);
        }
      }

      this.projectCache = project;
      return project;
    } catch (error: any) {
      if (error.message && error.message.includes('Resource not accessible')) {
        logger.warn(
          'Cannot access GitHub Projects. Your token needs the "project" scope. ' +
          'Visit: https://github.com/settings/tokens and regenerate with "project" permission.'
        );
      } else {
        logger.error(`Failed to fetch project info: ${error}`);
      }
      return null;
    }
  }

  /**
   * Get the project item ID for an issue
   */
  private async getProjectItemId(issueNumber: number): Promise<string | null> {
    // Check cache first
    if (this.issueItemCache.has(issueNumber)) {
      return this.issueItemCache.get(issueNumber)!;
    }

    const project = await this.getProjectInfo();
    if (!project) {
      return null;
    }

    try {
      const query = `
        query($owner: String!, $repo: String!, $issueNumber: Int!) {
          repository(owner: $owner, name: $repo) {
            issue(number: $issueNumber) {
              projectItems(first: 10) {
                nodes {
                  id
                  project {
                    id
                  }
                }
              }
            }
          }
        }
      `;

      const result: any = await this.octokit.graphql(query, {
        owner: this.owner,
        repo: this.repo,
        issueNumber,
      });

      const items = result?.repository?.issue?.projectItems?.nodes || [];
      const projectItem = items.find((item: any) => item.project.id === project.id);

      if (projectItem) {
        this.issueItemCache.set(issueNumber, projectItem.id);
        return projectItem.id;
      }

      logger.debug(`Issue #${issueNumber} is not in project #${project.number}`);
      return null;
    } catch (error) {
      logger.error(`Failed to get project item ID for issue #${issueNumber}: ${error}`);
      return null;
    }
  }

  /**
   * Update the status field for an issue in the project
   */
  async updateIssueStatus(issueNumber: number, statusColumn: string): Promise<boolean> {
    const project = await this.getProjectInfo();
    if (!project) {
      return false;
    }

    const projectItemId = await this.getProjectItemId(issueNumber);
    if (!projectItemId) {
      logger.debug(`Issue #${issueNumber} not in project, skipping status update`);
      return false;
    }

    // Find the Status field
    const statusField = project.fields.find(
      (f) => f.name.toLowerCase() === 'status' && f.options
    );

    if (!statusField || !statusField.options) {
      logger.warn('Status field not found in project');
      return false;
    }

    // Map status_column to option name (case-insensitive match)
    const normalizedStatus = statusColumn.toLowerCase().trim();
    const option = statusField.options.find((opt) => {
      const normalizedOpt = opt.name.toLowerCase().trim();
      return (
        normalizedOpt === normalizedStatus ||
        normalizedOpt.replace(/[-\s]/g, '') === normalizedStatus.replace(/[-\s]/g, '')
      );
    });

    if (!option) {
      logger.warn(
        `Status option "${statusColumn}" not found in project. Available: ${statusField.options.map((o) => o.name).join(', ')}`
      );
      return false;
    }

    try {
      const mutation = `
        mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
          updateProjectV2ItemFieldValue(
            input: {
              projectId: $projectId
              itemId: $itemId
              fieldId: $fieldId
              value: { singleSelectOptionId: $optionId }
            }
          ) {
            projectV2Item {
              id
            }
          }
        }
      `;

      await this.octokit.graphql(mutation, {
        projectId: project.id,
        itemId: projectItemId,
        fieldId: statusField.id,
        optionId: option.id,
      });

      logger.success(`Updated project status for issue #${issueNumber} to "${option.name}"`);
      return true;
    } catch (error) {
      logger.error(`Failed to update project status for issue #${issueNumber}: ${error}`);
      return false;
    }
  }

  /**
   * Batch update status for multiple issues
   */
  async batchUpdateIssueStatus(updates: Array<{ issueNumber: number; statusColumn: string }>): Promise<number> {
    let successCount = 0;

    for (const { issueNumber, statusColumn } of updates) {
      const success = await this.updateIssueStatus(issueNumber, statusColumn);
      if (success) {
        successCount++;
      }
      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return successCount;
  }

  /**
   * Clear caches (useful for testing or when project structure changes)
   */
  clearCache(): void {
    this.projectCache = undefined;
    this.issueItemCache.clear();
  }
}
