#!/usr/bin/env node
/**
 * tlsn-cli bin entry. Parses subcommands and dispatches.
 */

import { Command } from 'commander';
import { runCommand } from './run.js';
import { sessionSaveCommand } from './session.js';

const program = new Command();

program
  .name('tlsn-cli')
  .description('TLSNotary CLI — run plugins from the terminal')
  .version('0.1.0');

program
  .command('run')
  .description('Run a plugin (by id or by path to a built .js file)')
  .argument('<plugin>', 'Plugin id (e.g. "swissbank") or path to a built plugin .js file')
  .option('--verifier <url>', 'Verifier server URL', 'http://localhost:7047')
  .option('--proxy <url>', 'WebSocket proxy URL', '')
  .option('--auto-approve', 'Skip approval prompts (use the all-session mode)')
  .option('--storage-state <path>', 'Path to a Playwright storageState JSON for replay mode')
  .option('--headless', 'Run replay/headless (requires --storage-state)')
  .action(runCommand);

program
  .command('session')
  .description('Manage saved Playwright storageState sessions')
  .command('save')
  .description('Open a browser, let the user sign into a site, save the cookie state')
  .argument('<url>', 'URL to load for sign-in')
  .option('--out <path>', 'Where to write the storageState JSON', '~/.tlsn/sessions/session.json')
  .action(sessionSaveCommand);

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
