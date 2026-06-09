/**
 * Non-interactive ApprovalUi that auto-approves everything. Use only with
 * `--auto-approve` or in CI fixtures where the plugin's manifest is already
 * vetted.
 */

import type {
  ApprovalMode,
  ApprovalUi,
  PluginApprovalRequest,
  RevealApprovalRequest,
} from '@tlsn/host-contracts';

export class AutoApproveUi implements ApprovalUi {
  constructor(private readonly mode: ApprovalMode = 'all-session') {}

  async requestPluginApproval(_req: PluginApprovalRequest): Promise<ApprovalMode> {
    return this.mode;
  }

  async requestRevealApproval(_req: RevealApprovalRequest): Promise<boolean> {
    return true;
  }
}
