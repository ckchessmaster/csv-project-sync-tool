/**
 * CLI interface - command-line argument parsing and routing
 */

import { Command } from 'commander';
import { logger } from './utils/logger.js';

export function createCLI(): Command {
  const program = new Command();

  program
    .name('csv-sync')
    .description('GitHub ↔ CSV Two-Way Sync Tool')
    .version('1.0.0');

  program
    .command('sync')
    .description('Perform bidirectional sync between CSV and GitHub')
    .action(async () => {
      const { runSync } = await import('./commands/sync.js');
      await runSync();
    });

  program
    .command('push')
    .description('Push CSV changes to GitHub (CSV → GitHub)')
    .action(async () => {
      const { runPush } = await import('./commands/sync.js');
      await runPush();
    });

  program
    .command('pull')
    .description('Pull GitHub changes to CSV (GitHub → CSV)')
    .action(async () => {
      const { runPull } = await import('./commands/sync.js');
      await runPull();
    });

  program
    .command('watch')
    .description('Watch CSV file for changes and sync automatically')
    .action(async () => {
      const { runWatch } = await import('./commands/watch.js');
      await runWatch();
    });

  program.parse(process.argv);

  if (process.argv.length === 2) {
    program.outputHelp();
  }

  return program;
}
