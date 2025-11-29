/**
 * Watch command - monitors CSV file for changes and syncs automatically
 */

import fs from 'fs';
import path from 'path';
import { loadConfig } from '../config/index.js';
import { GitHubClient } from '../github/client.js';
import { SyncEngine } from '../sync/syncEngine.js';
import { logger } from '../utils/logger.js';
import { sleep } from '../utils/helpers.js';

export async function runWatch(): Promise<void> {
  try {
    const config = loadConfig();

    const csvPath = path.resolve(config.csvFilePath);
    logger.info(`Watching ${csvPath} for changes...`);
    logger.info('Press Ctrl+C to stop watching');

    const githubClient = new GitHubClient(
      config.githubToken,
      config.githubOwner,
      config.githubRepo
    );
    const syncEngine = new SyncEngine(githubClient, config.csvFilePath);

    let isWatching = false;
    let debounceTimer: NodeJS.Timeout | null = null;

    const performSync = async () => {
      if (isWatching) return;

      isWatching = true;
      try {
        await syncEngine.sync();
      } catch (error) {
        logger.error(`Sync failed: ${error}`);
      } finally {
        isWatching = false;
      }
    };

    // Watch for changes to the CSV file
    fs.watch(csvPath, async (eventType, filename) => {
      if (filename === path.basename(csvPath) && eventType === 'change') {
        logger.info(`CSV file changed, syncing in 1 second...`);

        // Debounce: wait 1 second before syncing to catch multiple rapid changes
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(() => {
          performSync();
        }, 1000);
      }
    });

    // Keep the process running
    await new Promise(() => {});
  } catch (error) {
    logger.error(`${error}`);
    process.exit(1);
  }
}
