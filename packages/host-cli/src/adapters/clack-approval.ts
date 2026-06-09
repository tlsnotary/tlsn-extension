/**
 * Interactive ApprovalUi using @clack/prompts. Renders the plugin's manifest
 * (host + paths it intends to call) and asks the user to pick an approval mode.
 *
 * Non-interactive modes (--auto-approve, --policy=<yaml>) are handled by
 * separate ApprovalUi implementations under ./auto-approve.ts and ./policy.ts.
 */

import * as p from '@clack/prompts';
import type {
  ApprovalMode,
  ApprovalUi,
  PluginApprovalRequest,
  RevealApprovalRequest,
} from '@tlsn/host-contracts';

export class ClackApprovalUi implements ApprovalUi {
  async requestPluginApproval(req: PluginApprovalRequest): Promise<ApprovalMode> {
    p.intro(`Plugin: ${req.config.name}`);
    p.log.message(req.config.description);

    if (req.config.requests?.length) {
      p.log.message('Requests this plugin will make:');
      for (const r of req.config.requests) {
        p.log.message(`  ${r.method ?? 'GET'} ${r.host}${r.pathname ?? ''}`);
      }
    }

    const choice = await p.select({
      message: 'How do you want to approve this plugin?',
      options: [
        { value: 'all-session', label: 'Approve all reveals this session', hint: 'low friction' },
        { value: 'manual', label: 'Approve each reveal individually', hint: 'review every byte' },
        { value: 'rejected', label: 'Reject', hint: 'do not run this plugin' },
      ],
    });

    if (p.isCancel(choice)) {
      p.cancel('Approval cancelled.');
      return 'rejected';
    }
    return choice as ApprovalMode;
  }

  async requestRevealApproval(req: RevealApprovalRequest): Promise<boolean> {
    p.log.info(`prove(): ${req.request.method} ${req.request.url}`);
    if (req.descriptors.length) {
      p.log.message(`About to reveal ${req.descriptors.length} byte range(s):`);
      for (const d of req.descriptors) {
        const preview = (d.preview ?? '').slice(0, 100);
        p.log.message(`  · ${d.label ?? '(unlabeled)'} [${d.action}] ${preview}`);
      }
    }

    const ok = await p.confirm({
      message: 'Reveal these bytes to the verifier?',
      initialValue: true,
    });
    if (p.isCancel(ok)) return false;
    return ok === true;
  }
}
