/**
 * Sync Engine - implements bidirectional sync with "Last Write Wins" strategy
 */

import { CSVRow, GitHubIssue, Issue, SyncResult } from '../types/index.js';
import { GitHubClient } from '../github/client.js';
import { parseCSV, csvRowsToMap, getNewRowsFromCSV } from '../csv/parser.js';
import { writeCSV } from '../csv/writer.js';
import {
  isTimestampNewer,
  githubIssueToCsvRow,
  csvRowToGitHubIssue,
  sleep,
} from '../utils/helpers.js';
import { logger } from '../utils/logger.js';

export class SyncEngine {
  private githubClient: GitHubClient;
  private csvFilePath: string;

  constructor(githubClient: GitHubClient, csvFilePath: string) {
    this.githubClient = githubClient;
    this.csvFilePath = csvFilePath;
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
      const csvRowsMap = csvRowsToMap(csvRows);
      const newCsvRows = getNewRowsFromCSV(csvRows);

      const githubIssues = await this.githubClient.fetchAllIssues();
      const githubIssuesMap = this.githubClient.githubIssuesToMap(githubIssues);

      logger.info(`Loaded ${csvRowsMap.size} existing items from CSV`);
      logger.info(`Loaded ${githubIssuesMap.size} issues from GitHub`);
      logger.info(`Found ${newCsvRows.length} new items in CSV`);

      let consolidatedRows = [...csvRows];

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
      const step3Result = this.pullGitHubChangesToCsv(
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

    // Case 1: Create new issues from CSV rows without ID
    for (const row of newRows) {
      try {
        logger.debug(`Creating new GitHub issue from CSV: "${row.title}"`);
        const issue = csvRowToGitHubIssue(row);
        const createdIssue = await this.githubClient.createIssue(issue);

        // Update the row with the GitHub issue number and updated_at
        const updatedRow = githubIssueToCsvRow(createdIssue);
        const rowIndex = consolidatedRows.findIndex(
          (r) => r.title === row.title && !r.id
        );
        if (rowIndex !== -1) {
          consolidatedRows[rowIndex] = updatedRow;
        }

        created++;
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
            updated++;
            logger.success(`Updated GitHub issue #${issueNumber}`);
            await sleep(100); // Rate limiting
          } catch (error) {
            logger.error(`Failed to update GitHub issue #${issueNumber}: ${error}`);
          }
        }
      }
    }

    return { created, updated, updatedRows: consolidatedRows };
  }

  /**
   * Step 3: Pull GitHub changes to CSV
   */
  private pullGitHubChangesToCsv(
    githubIssuesMap: Map<number, GitHubIssue>,
    csvRowsMap: Map<string, CSVRow>,
    consolidatedRows: CSVRow[]
  ): {
    created: number;
    updated: number;
    updatedRows: CSVRow[];
  } {
    let created = 0;
    let updated = 0;

    for (const [issueNumber, githubIssue] of githubIssuesMap) {
      const csvRow = csvRowsMap.get(String(issueNumber));

      if (!csvRow) {
        // Case 1: New remote issue not in CSV
        logger.debug(`Adding new GitHub issue #${issueNumber} to CSV`);
        const newRow = githubIssueToCsvRow(githubIssue);
        consolidatedRows.push(newRow);
        created++;
        logger.success(`Added GitHub issue #${issueNumber} to CSV`);
      } else {
        // Case 2: Remote update (GitHub version is newer)
        if (isTimestampNewer(githubIssue.updated_at, csvRow.updated_at)) {
          logger.debug(`Updating CSV with GitHub issue #${issueNumber} changes`);
          const updatedRow = githubIssueToCsvRow(githubIssue);
          const rowIndex = consolidatedRows.findIndex(
            (r) => r.id === String(issueNumber)
          );
          if (rowIndex !== -1) {
            consolidatedRows[rowIndex] = updatedRow;
          }
          updated++;
          logger.success(`Updated CSV with GitHub issue #${issueNumber}`);
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

    if (result.errors.length > 0) {
      console.log(`\nErrors: ${result.errors.length}`);
      result.errors.forEach((err) => console.log(`  - ${err}`));
    }

    console.log('='.repeat(50) + '\n');
  }
}
