/**
 * Main entry point for the CLI application
 */

import { createCLI } from './cli.js';

async function main() {
  try {
    const program = createCLI();
    await program.parseAsync(process.argv);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
