/**
 * `tlsn-cli session save` — open Chromium, let the user sign into a site, save
 * Playwright's storageState (cookies + localStorage) to disk so later runs can
 * replay headlessly.
 */

import { chromium } from 'playwright';
import * as p from '@clack/prompts';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { homedir } from 'node:os';

export interface SessionSaveOptions {
  out: string;
}

export async function sessionSaveCommand(url: string, opts: SessionSaveOptions): Promise<void> {
  const outPath = expandHome(opts.out);

  p.intro('tlsn-cli session save');
  p.log.message(`Opening ${url} in Chromium. Sign in, then close the window to save state.`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url);

  // Block on the user closing the page (or context). Both surface as context close.
  await new Promise<void>((resolveWait) => {
    context.on('close', () => resolveWait());
  });

  const state = await context.storageState();
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(state, null, 2));

  await browser.close().catch(() => {});

  p.outro(`Saved ${outPath}`);
}

function expandHome(input: string): string {
  const expanded = input.startsWith('~') ? input.replace(/^~/, homedir()) : input;
  return isAbsolute(expanded) ? expanded : resolve(process.cwd(), expanded);
}
