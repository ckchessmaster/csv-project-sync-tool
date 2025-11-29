/**
 * Sync Engine - implements bidirectional sync with "Last Write Wins" strategy
 */

import { CSVRow, GitHubIssue, Issue, SyncResult } from '../types/index.js';
import { GitHubClient } from '../github/client.js';
import { GitHubProjectsClient } from '../github/projects.js';
import { parseCSV, csvRowsToMap, getNewRowsFromCSV } from '../csv/parser.js';
import { writeCSV } from '../csv/writer.js';
import {
  isTimestampNewer,
  githubIssueToCsvRow,
  csvRowToGitHubIssue,
  sleep,
} from '../utils/helpers.js';
import { logger } from '../utils/logger.js';
import { dedupeCsvRowsByTitle, dedupeGitHubIssuesByTitle } from '../utils/duplicate.js';
import fs from 'fs';
import path from 'path';

export class SyncEngine {
  private githubClient: GitHubClient;
  private projectsClient?: GitHubProjectsClient;
  private csvFilePath: string;
  private dedupeTitleCaseSensitive: boolean;
  private dedupeTieBreaker: 'first' | 'prefer_csv' | 'prefer_github' | 'highest_id';
  private dedupeDeleteOnGithub: boolean;
  private dedupeDryRun: boolean;
  private dedupeCloseBatchSize: number;
  private syncProjectStatus: boolean;

  constructor(
    githubClient: GitHubClient,
    csvFilePath: string,
    options?: { 
      dedupeTitleCaseSensitive?: boolean; 
      dedupeTieBreaker?: 'first' | 'prefer_csv' | 'prefer_github' | 'highest_id'; 
      dedupeDeleteOnGithub?: boolean; 
      dedupeDryRun?: boolean; 
      dedupeCloseBatchSize?: number;
      projectsClient?: GitHubProjectsClient;
      syncProjectStatus?: boolean;
    }
  ) {
    this.githubClient = githubClient;
    this.projectsClient = options?.projectsClient;
    this.csvFilePath = csvFilePath;
    this.dedupeTitleCaseSensitive = options?.dedupeTitleCaseSensitive ?? false;
    this.dedupeTieBreaker = options?.dedupeTieBreaker || 'first';
    this.dedupeDeleteOnGithub = (options as any)?.dedupeDeleteOnGithub || false;
    this.dedupeDryRun = (options as any)?.dedupeDryRun || false;
    this.dedupeCloseBatchSize = (options as any)?.dedupeCloseBatchSize || 5;
    this.syncProjectStatus = options?.syncProjectStatus ?? true;
  }

  /**
   * Execute full bidirectional sync
   */
  async sync(): Promise<SyncResult> {
    const result: SyncResult = {
      csvRowsCreated: 0,
      csvRowsUpdated: 0,
      githubIssuesCreated: 0,
      githubIssuesUpdated: 0,
      githubIssuesSkipped: 0,
      deletedRowsMarked: 0,
      errors: [],
    };

    try {
      logger.info('Starting synchronization...');

      // Step 1: Initialize - load CSV and fetch GitHub issues
      logger.info('Step 1: Loading data from CSV and GitHub...');
      const csvRows = parseCSV(this.csvFilePath);
      const githubIssues = await this.githubClient.fetchAllIssues();

      // Deduplicate by title (keep newest by updated_at)
      const csvDedupe = dedupeCsvRowsByTitle(csvRows, this.dedupeTitleCaseSensitive, (this as any).dedupeTieBreaker || 'first');
      const dedupedCsvRows = csvDedupe.keptRows;
      const removedCsvRows = csvDedupe.removedRows;

      // For GitHub issues dedupe, ONLY dedupe OPEN issues to avoid closing already-closed duplicates
      const openGithubIssues = githubIssues.filter(issue => issue.state === 'open');
      const closedGithubIssues = githubIssues.filter(issue => issue.state === 'closed');
      const ghDedupe = dedupeGitHubIssuesByTitle(openGithubIssues, this.dedupeTitleCaseSensitive, 'highest_id');
      const dedupedGithubIssues = [...ghDedupe.kept, ...closedGithubIssues];
      const removedGithubIssues = ghDedupe.removed;

      const csvRowsMap = csvRowsToMap(dedupedCsvRows);
      const newCsvRows = getNewRowsFromCSV(dedupedCsvRows);
      const githubIssuesMap = this.githubClient.githubIssuesToMap(dedupedGithubIssues);

      logger.info(`Loaded ${csvRowsMap.size} existing items from CSV`);
      logger.info(`Loaded ${githubIssuesMap.size} issues from GitHub`);
      logger.info(`Found ${newCsvRows.length} new items in CSV`);
      logger.info(`Removed duplicate CSV rows: ${removedCsvRows.length}`);
      logger.info(`Removed duplicate GitHub issues (kept newest per title): ${removedGithubIssues.length}`);

      // Record removed duplicates in result
      result.removedDuplicates = (removedCsvRows?.length || 0) + (removedGithubIssues?.length || 0);

      let consolidatedRows = [...dedupedCsvRows];

      // If duplicates were removed, write a backup file with removed rows
      if (removedCsvRows.length > 0 || removedGithubIssues.length > 0) {
        try {
          const removedAsCsvRows: CSVRow[] = [];
          if (removedCsvRows.length > 0) removedAsCsvRows.push(...removedCsvRows);
          if (removedGithubIssues.length > 0) {
            for (const gh of removedGithubIssues) {
              removedAsCsvRows.push(githubIssueToCsvRow(gh));
            }
          }

          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const backupsDir = path.join(path.dirname(this.csvFilePath), 'backups');
          if (!fs.existsSync(backupsDir)) {
            fs.mkdirSync(backupsDir, { recursive: true });
          }
          const backupPath = path.join(backupsDir, `${path.basename(this.csvFilePath)}.duplicates.removed.${timestamp}.csv`);
          writeCSV(backupPath, removedAsCsvRows);
          logger.info(`Wrote duplicate backup to ${backupPath}`);
        } catch (err) {
          logger.warn(`Failed to write duplicate backup: ${err}`);
        }
      }

      // Build a preview map: title -> { kept, removed[] }
      const previewMap = new Map<string, { title: string; kept?: number; removed: number[] }>();

      const normalize = (t: string) => (this.dedupeTitleCaseSensitive ? t.trim() : t.trim().toLowerCase());

      for (const kept of dedupedGithubIssues) {
        const key = normalize(kept.title || '');
        previewMap.set(key, { title: kept.title, kept: kept.number, removed: [] });
      }

      for (const rem of removedGithubIssues) {
        const key = normalize(rem.title || '');
        const entry = previewMap.get(key) || { title: rem.title, removed: [] };
        entry.removed.push(rem.number);
        previewMap.set(key, entry);
      }

      // If dry-run: write preview file and do not close anything
      let closedDuplicates = 0;
      let previewPath: string | undefined;
      if (this.dedupeDryRun) {
        try {
          const preview = Array.from(previewMap.values()).filter((p) => p.removed.length > 0);
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const backupsDir = path.join(path.dirname(this.csvFilePath), 'backups');
          if (!fs.existsSync(backupsDir)) {
            fs.mkdirSync(backupsDir, { recursive: true });
          }
          previewPath = path.join(backupsDir, `${path.basename(this.csvFilePath)}.duplicates.preview.${timestamp}.json`);
          fs.writeFileSync(previewPath, JSON.stringify(preview, null, 2), 'utf-8');
          logger.info(`Wrote duplicate preview to ${previewPath}`);
          result.githubDuplicatePreviewPath = previewPath;
        } catch (err) {
          logger.warn(`Failed to write duplicate preview: ${err}`);
        }
      } else if (this.dedupeDeleteOnGithub && removedGithubIssues.length > 0) {
        // Delete duplicates in small batches to reduce secondary rate limits
        const batchSize = Math.max(1, this.dedupeCloseBatchSize || 5);
        const toDelete = removedGithubIssues.slice(0, batchSize);

        for (const gh of toDelete) {
          let attempts = 0;
          const maxAttempts = 3;

          while (attempts < maxAttempts) {
            try {
              attempts++;
              // Try to delete the issue - GitHub doesn't actually support this via API
              // So we'll close it with a comment indicating it's a duplicate
              const existingLabels = gh.labels ? gh.labels.map((l) => l.name) : [];
              const comment = `Marked as duplicate by sync tool (kept issue with highest number).`;
              await this.githubClient.closeIssueAsDuplicate(gh.number, existingLabels, comment);
              closedDuplicates++;
              logger.info(`Closed duplicate GitHub issue #${gh.number}`);
              // be kind to the API
              await sleep(500);
              break;
            } catch (err: any) {
              const msg = err && err.message ? err.message.toLowerCase() : '';
              logger.warn(`Failed to close duplicate issue #${gh.number} (attempt ${attempts}): ${err}`);
              if (msg.includes('rate limit') || msg.includes('secondary rate limit')) {
                await sleep(60000);
                continue;
              }
              break;
            }
          }
        }
      }

      result.githubDuplicatesClosed = closedDuplicates;
      if (previewPath) result.githubDuplicatePreviewPath = previewPath;

      // Step 2: CSV -> GitHub (Push local changes to remote)
      logger.info('Step 2: Pushing CSV changes to GitHub...');
      const step2Result = await this.pushCsvChangesToGitHub(
        newCsvRows,
        csvRowsMap,
        githubIssuesMap,
        consolidatedRows
      );
      result.githubIssuesCreated = step2Result.created;
      result.githubIssuesUpdated = step2Result.updated;
      consolidatedRows = step2Result.updatedRows;

      // Step 3: GitHub -> CSV (Pull remote changes to local)
      logger.info('Step 3: Pulling GitHub changes to CSV...');
      const step3Result = await this.pullGitHubChangesToCsv(
        githubIssuesMap,
        csvRowsMap,
        consolidatedRows
      );
      result.csvRowsCreated = step3Result.created;
      result.csvRowsUpdated = step3Result.updated;
      consolidatedRows = step3Result.updatedRows;

      // Step 4: Deletion Handling
      logger.info('Step 4: Handling deletions...');
      const step4Result = this.handleDeletions(
        csvRowsMap,
        githubIssuesMap,
        consolidatedRows
      );
      result.githubIssuesSkipped = step4Result.skipped;
      result.deletedRowsMarked = step4Result.deleted;
      consolidatedRows = step4Result.updatedRows;

      // Step 5: Finalization - write consolidated data to CSV
      logger.info('Step 5: Writing consolidated data to CSV...');
      writeCSV(this.csvFilePath, consolidatedRows);
      logger.success('CSV written successfully');

      logger.success('Synchronization complete!');
      this.printSyncSummary(result);

      return result;
    } catch (error) {
      const errorMessage = `Sync failed: ${error}`;
      logger.error(errorMessage);
      result.errors.push(errorMessage);
      throw error;
    }
  }

  /**
   * Step 2: Push CSV changes to GitHub
   */
  private async pushCsvChangesToGitHub(
    newRows: CSVRow[],
    csvRowsMap: Map<string, CSVRow>,
    githubIssuesMap: Map<number, GitHubIssue>,
    consolidatedRows: CSVRow[]
  ): Promise<{
    created: number;
    updated: number;
    updatedRows: CSVRow[];
  }> {
    let created = 0;
    let updated = 0;

    // Prevent creating the same title twice in this run
    const createdTitles = new Set<string>();

    // Track issues that need project status updates
    const projectStatusUpdates: Array<{ issueNumber: number; statusColumn: string }> = [];

    // Case 1: Create new issues from CSV rows without ID
    for (const row of newRows) {
      try {
        logger.debug(`Creating new GitHub issue from CSV: "${row.title}"`);

        const titleKey = this.dedupeTitleCaseSensitive ? row.title : row.title.toLowerCase();
        if (createdTitles.has(titleKey)) {
          logger.warn(`Skipping creation for duplicate title (already created in this run): ${row.title}`);
          continue;
        }

        const issue = csvRowToGitHubIssue(row);
        const createdIssue = await this.githubClient.createIssue(issue);

        // Update the row with the GitHub issue number and updated_at, preserving status_column
        const updatedRow = githubIssueToCsvRow(createdIssue, row.status_column);
        const rowIndex = consolidatedRows.findIndex(
          (r) => r.title === row.title && !r.id
        );
        if (rowIndex !== -1) {
          consolidatedRows[rowIndex] = updatedRow;
        }

        // Queue project status update if status_column is present
        if (row.status_column && this.projectsClient && this.syncProjectStatus) {
          projectStatusUpdates.push({ issueNumber: createdIssue.number, statusColumn: row.status_column });
        }

        created++;
        createdTitles.add(titleKey);
        logger.success(`Created GitHub issue #${createdIssue.number}`);
        await sleep(100); // Rate limiting
      } catch (error) {
        logger.error(`Failed to create GitHub issue: ${error}`);
      }
    }

    // Case 2: Update existing issues if CSV version is newer
    for (const [csvId, csvRow] of csvRowsMap) {
      const issueNumber = parseInt(csvId, 10);
      const githubIssue = githubIssuesMap.get(issueNumber);

      if (githubIssue) {
        if (isTimestampNewer(csvRow.updated_at, githubIssue.updated_at)) {
          try {
            logger.debug(
              `Updating GitHub issue #${issueNumber} with CSV changes`
            );
            const issue = csvRowToGitHubIssue(csvRow);
            await this.githubClient.updateIssue(issueNumber, issue);
            
            // Queue project status update if status_column is present
            if (csvRow.status_column && this.projectsClient && this.syncProjectStatus) {
              projectStatusUpdates.push({ issueNumber, statusColumn: csvRow.status_column });
            }
            
            updated++;
            logger.success(`Updated GitHub issue #${issueNumber}`);
            await sleep(100); // Rate limiting
          } catch (error) {
            logger.error(`Failed to update GitHub issue #${issueNumber}: ${error}`);
          }
        }
      }
    }

    // Update project statuses in batch
    if (projectStatusUpdates.length > 0 && this.projectsClient && this.syncProjectStatus) {
      logger.info(`Updating project status for ${projectStatusUpdates.length} issues...`);
      const successCount = await this.projectsClient.batchUpdateIssueStatus(projectStatusUpdates);
      logger.info(`Successfully updated project status for ${successCount}/${projectStatusUpdates.length} issues`);
    }

    return { created, updated, updatedRows: consolidatedRows };
  }

  /**
   * Step 3: Pull GitHub changes to CSV
   */
  private async pullGitHubChangesToCsv(
    githubIssuesMap: Map<number, GitHubIssue>,
    csvRowsMap: Map<string, CSVRow>,
    consolidatedRows: CSVRow[]
  ): Promise<{
    created: number;
    updated: number;
    updatedRows: CSVRow[];
  }> {
    let created = 0;
    let updated = 0;

    // Fetch project statuses for all GitHub issues if project sync is enabled
    let projectStatusMap = new Map<number, string>();
    if (this.projectsClient && this.syncProjectStatus) {
      const issueNumbers = Array.from(githubIssuesMap.keys());
      logger.info(`Fetching project status for ${issueNumbers.length} issues...`);
      projectStatusMap = await this.projectsClient.batchGetIssueStatus(issueNumbers);
      logger.info(`Fetched project status for ${projectStatusMap.size} issues`);
    }

    for (const [issueNumber, githubIssue] of githubIssuesMap) {
      const csvRow = csvRowsMap.get(String(issueNumber));

      // Skip closed issues marked as duplicates - don't add them back to CSV
      const isDuplicate = githubIssue.state === 'closed' && 
                         githubIssue.labels.some(l => l.name.toLowerCase() === 'duplicate');
      
      // Get the project status for this issue
      const projectStatus = projectStatusMap.get(issueNumber);
      
      if (!csvRow) {
        // Case 1: New remote issue not in CSV
        if (isDuplicate) {
          logger.debug(`Skipping closed duplicate GitHub issue #${issueNumber}`);
          continue;
        }
        
        logger.debug(`Adding new GitHub issue #${issueNumber} to CSV`);
        const newRow = githubIssueToCsvRow(githubIssue, projectStatus);
        consolidatedRows.push(newRow);
        created++;
        logger.success(`Added GitHub issue #${issueNumber} to CSV`);
      } else {
        // Case 2: Remote update (GitHub version is newer)
        if (isTimestampNewer(githubIssue.updated_at, csvRow.updated_at)) {
          logger.debug(`Updating CSV with GitHub issue #${issueNumber} changes`);
          const updatedRow = githubIssueToCsvRow(githubIssue, projectStatus);
          const rowIndex = consolidatedRows.findIndex(
            (r) => r.id === String(issueNumber)
          );
          if (rowIndex !== -1) {
            consolidatedRows[rowIndex] = updatedRow;
          }
          updated++;
          logger.success(`Updated CSV with GitHub issue #${issueNumber}`);
        } else if (projectStatus && projectStatus !== csvRow.status_column) {
          // Special case: Even if timestamps are equal, update status_column if it changed in the project
          logger.debug(`Updating CSV with GitHub project status change for issue #${issueNumber}`);
          const rowIndex = consolidatedRows.findIndex(
            (r) => r.id === String(issueNumber)
          );
          if (rowIndex !== -1) {
            consolidatedRows[rowIndex] = {
              ...consolidatedRows[rowIndex],
              status_column: projectStatus
            };
          }
          updated++;
          logger.success(`Updated CSV status_column for issue #${issueNumber} to "${projectStatus}"`);
        }
      }
    }

    return { created, updated, updatedRows: consolidatedRows };
  }

  /**
   * Step 4: Handle deletions
   */
  private handleDeletions(
    csvRowsMap: Map<string, CSVRow>,
    githubIssuesMap: Map<number, GitHubIssue>,
    consolidatedRows: CSVRow[]
  ): {
    skipped: number;
    deleted: number;
    updatedRows: CSVRow[];
  } {
    let skipped = 0;
    let deleted = 0;

    // Check for rows deleted from CSV but existing on GitHub
    for (const [issueNumberStr, githubIssue] of githubIssuesMap) {
      const csvRow = csvRowsMap.get(String(issueNumberStr));
      if (!csvRow) {
        // Issue exists on GitHub but not in CSV - skip deletion
        logger.warn(
          `Skipping issue #${issueNumberStr} (missing from CSV). To close, mark state as 'closed' instead of deleting.`
        );
        skipped++;
      }
    }

    // Check for rows in CSV that no longer exist on GitHub
    for (const [csvId, csvRow] of csvRowsMap) {
      const issueNumber = parseInt(csvId, 10);
      const githubIssue = githubIssuesMap.get(issueNumber);

      if (!githubIssue) {
        // Issue in CSV but not on GitHub - mark as deleted
        logger.warn(`Issue #${csvId} deleted on GitHub, marking row as [DELETED]`);
        const rowIndex = consolidatedRows.findIndex((r) => r.id === csvId);
        if (rowIndex !== -1) {
          consolidatedRows[rowIndex] = {
            ...consolidatedRows[rowIndex],
            title: `[DELETED] ${consolidatedRows[rowIndex].title}`,
          };
        }
        deleted++;
      }
    }

    return { skipped, deleted, updatedRows: consolidatedRows };
  }

  /**
   * Print sync summary
   */
  private printSyncSummary(result: SyncResult): void {
    console.log('\n' + '='.repeat(50));
    console.log('SYNC SUMMARY');
    console.log('='.repeat(50));
    console.log(`GitHub Issues Created: ${result.githubIssuesCreated}`);
    console.log(`GitHub Issues Updated: ${result.githubIssuesUpdated}`);
    console.log(`GitHub Issues Skipped: ${result.githubIssuesSkipped}`);
    console.log(`CSV Rows Created: ${result.csvRowsCreated}`);
    console.log(`CSV Rows Updated: ${result.csvRowsUpdated}`);
    console.log(`Deleted Rows Marked: ${result.deletedRowsMarked}`);
    if (result.removedDuplicates && result.removedDuplicates > 0) {
      console.log(`Removed Duplicate Rows/Issues: ${result.removedDuplicates}`);
    }

    if (result.errors.length > 0) {
      console.log(`\nErrors: ${result.errors.length}`);
      result.errors.forEach((err) => console.log(`  - ${err}`));
    }

    console.log('='.repeat(50) + '\n');
  }
}
