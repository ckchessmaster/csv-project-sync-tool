/**
 * Sync command - performs sync, push, or pull operations
 */

import { loadConfig } from '../config/index.js';
import { GitHubClient } from '../github/client.js';
import { SyncEngine } from '../sync/syncEngine.js';
import { logger } from '../utils/logger.js';

export async function runSync(): Promise<void> {
  try {
    const config = loadConfig();
    logger.info(`Using CSV file: ${config.csvFilePath}`);

    const githubClient = new GitHubClient(
      config.githubToken,
      config.githubOwner,
      config.githubRepo
    );
    const syncEngine = new SyncEngine(githubClient, config.csvFilePath);

    await syncEngine.sync();
  } catch (error) {
    logger.error(`${error}`);
    process.exit(1);
  }
}

export async function runPush(): Promise<void> {
  try {
    logger.info('Push command: pushing CSV changes to GitHub');
    const config = loadConfig();
    const githubClient = new GitHubClient(
      config.githubToken,
      config.githubOwner,
      config.githubRepo
    );
    const syncEngine = new SyncEngine(githubClient, config.csvFilePath);

    await syncEngine.sync();
  } catch (error) {
    logger.error(`${error}`);
    process.exit(1);
  }
}

export async function runPull(): Promise<void> {
  try {
    logger.info('Pull command: pulling GitHub changes to CSV');
    const config = loadConfig();
    const githubClient = new GitHubClient(
      config.githubToken,
      config.githubOwner,
      config.githubRepo
    );
    const syncEngine = new SyncEngine(githubClient, config.csvFilePath);

    await syncEngine.sync();
  } catch (error) {
    logger.error(`${error}`);
    process.exit(1);
  }
}
