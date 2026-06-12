/**
 * `tlsn-cli run <plugin>` — capture/replay a plugin against a verifier.
 */

import * as p from '@clack/prompts';
import { createCliAdapter } from '../adapters/index';
import { AutoApproveUi } from '../adapters/auto-approve';
import { PluginEventEmitter } from '../event-emitter';
import { resolvePlugin } from './resolve-plugin';

export interface RunOptions {
  verifier: string;
  proxy: string;
  autoApprove?: boolean;
  storageState?: string;
  headless?: boolean;
}

export async function runCommand(pluginRef: string, opts: RunOptions): Promise<void> {
  const resolved = await resolvePlugin(pluginRef);

  p.intro(`tlsn-cli run ${resolved.id}`);
  p.log.message(`Source: ${resolved.source}`);
  p.log.message(`Verifier: ${opts.verifier}`);

  const approval = opts.autoApprove ? new AutoApproveUi('all-session') : undefined;
  const mode = opts.headless ? 'replay' : 'capture';

  const adapter = await createCliAdapter({
    mode,
    storageStatePath: opts.storageState,
    approval,
  });

  try {
    let approvalMode: 'all-session' | 'manual' | 'rejected' = 'all-session';
    if (resolved.config) {
      approvalMode = await adapter.approval.requestPluginApproval({
        config: resolved.config,
        source: resolved.code,
      });
    }

    if (approvalMode === 'rejected') {
      p.outro('Plugin approval rejected.');
      return;
    }

    const eventEmitter = new PluginEventEmitter();
    const host = await adapter.createHost({
      verifierUrl: opts.verifier,
      proxyUrl: opts.proxy,
      approvalMode,
      pluginConfig: resolved.config,
      eventEmitter,
    });

    p.log.info('Running plugin…');
    const result = await host.executePlugin(resolved.code, { eventEmitter });

    p.log.success('Plugin completed.');
    process.stdout.write(`\n--- result ---\n${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await adapter.dispose();
    p.outro('Done.');
  }
}
