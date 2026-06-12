/**
 * @tlsn/host-cli/adapter
 *
 * Top-level CLI adapter that ties together the Playwright window manager,
 * the request interceptor, the prover client, the renderer, and the approval
 * UI, then wires them into the `@tlsn/plugin-sdk` Host.
 */

import { chromium } from 'playwright';
import { HostCore, NativeFunctionEvaluator } from '@tlsn/plugin-sdk';
import type { ProveProgressData } from '@tlsn/plugin-sdk';
import type {
  ApprovalUi,
  HostAdapter,
  HostAdapterOptions,
  PluginRenderer,
  ProveRequest,
  ProverClient,
  ProverOptions,
} from '@tlsn/host-contracts';

import { existsSync } from 'node:fs';
import { PlaywrightState } from './playwright-state.js';
import { PlaywrightWindowManager } from './playwright-windows.js';
import { PlaywrightRequestInterceptor } from './playwright-interceptor.js';
import { NullProverClient } from './null-prover.js';
import { RustProverClient, resolveBinary } from './rust-prover.js';
import { JsonRenderer } from './json-renderer.js';
import { PlaywrightDomRenderer } from './playwright-renderer.js';
import { ClackApprovalUi } from './clack-approval.js';
import { AutoApproveUi } from './auto-approve.js';

export { RustProverClient } from './rust-prover.js';
export { NullProverClient } from './null-prover.js';
export { JsonRenderer } from './json-renderer.js';
export { PlaywrightDomRenderer } from './playwright-renderer.js';

export interface CliAdapterOptions {
  /**
   * `capture` launches a headed Chromium so the user can sign in interactively;
   * `replay` launches headless and expects a pre-saved Playwright storageState.
   */
  mode?: 'capture' | 'replay';
  /** Path to a Playwright storageState JSON. Used only in `replay` mode. */
  storageStatePath?: string;
  /** Replace the default ProverClient (e.g. with the Rust binary spawn). */
  prover?: ProverClient;
  /** Replace the default JSON renderer (e.g. with an ink TUI). */
  renderer?: PluginRenderer;
  /** Replace the default Clack approval UI (e.g. with the policy-file UI). */
  approval?: ApprovalUi;
}

export async function createCliAdapter(opts: CliAdapterOptions = {}): Promise<HostAdapter> {
  const mode = opts.mode ?? 'capture';
  const browser = await chromium.launch({ headless: mode !== 'capture' });
  const context = await browser.newContext({
    storageState: opts.storageStatePath,
  });

  const state = new PlaywrightState({ browser, context });
  const windows = new PlaywrightWindowManager(state);
  const interceptor = new PlaywrightRequestInterceptor(state);
  const prover = opts.prover ?? defaultProver();
  const renderer = opts.renderer ?? new PlaywrightDomRenderer(state);
  const approval = opts.approval ?? new ClackApprovalUi();
  // Renderer wired in-page click → host event. Stash on the context so the
  // PlaywrightDomRenderer can lazily set it up on the first render.
  if (renderer instanceof PlaywrightDomRenderer) {
    await renderer.ensureExposed(context);
  }

  return new CliAdapter(state, windows, interceptor, prover, renderer, approval);
}

/**
 * Convenience constructor for fully-headless CI flows. Skips Clack prompts and
 * approves everything. Pair with `--auto-approve` at the CLI layer.
 */
/**
 * Default ProverClient selection: prefer the real Rust binary when present
 * (in `$TLSN_PROVER_BIN` or under `packages/tlsn-mobile/target/release/`),
 * otherwise fall back to the NullProverClient stub so the rest of the
 * adapter is still usable.
 */
function defaultProver() {
  const bin = resolveBinary();
  // resolveBinary returns the literal string 'tlsn-prover' when nothing was
  // found on disk — that's the "fall back to PATH" signal. Don't auto-pick
  // Rust mode in that case; fail safe to the stub instead so a missing
  // binary doesn't surprise a user who didn't ask for it.
  if (bin === 'tlsn-prover' && !existsSync('/usr/local/bin/tlsn-prover')) {
    return new NullProverClient();
  }
  return new RustProverClient({ binary: bin });
}

export async function createHeadlessCliAdapter(
  opts: Omit<CliAdapterOptions, 'mode' | 'approval'> = {},
): Promise<HostAdapter> {
  return createCliAdapter({
    ...opts,
    mode: 'replay',
    approval: new AutoApproveUi('all-session'),
  });
}

class CliAdapter implements HostAdapter {
  constructor(
    private readonly state: PlaywrightState,
    readonly windows: PlaywrightWindowManager,
    readonly interceptor: PlaywrightRequestInterceptor,
    readonly prover: ProverClient,
    readonly renderer: PluginRenderer,
    readonly approval: ApprovalUi,
  ) {}

  async createHost(opts: HostAdapterOptions): Promise<HostCore> {
    const approvalMode = opts.approvalMode ?? 'all-session';

    if (approvalMode === 'rejected') {
      throw new Error('Plugin approval rejected; refusing to create Host.');
    }

    // Hand the renderer the emitter so click events flow back from the page.
    if (this.renderer instanceof PlaywrightDomRenderer && opts.eventEmitter) {
      this.renderer.setEmitter(opts.eventEmitter);
    }

    // We use HostCore (not the QuickJS-backed Host) because the CLI runs in
    // Node — NativeFunctionEvaluator is the right evaluator for the platform.
    // The contract still calls this a `Host` for parity with other adapters.
    return new HostCore({
      evaluator: new NativeFunctionEvaluator(),

      // The SDK's default reRenderEvent ('TO_BG_RE_RENDER_PLUGIN_UI') assumes
      // an extension background script that translates it to
      // 'RE_RENDER_PLUGIN_UI'. The CLI has no such translator, so we set the
      // event name the SDK's own listener already handles — same pattern
      // mobile uses in app/mobile/lib/MobilePluginHost.ts.
      reRenderEvent: 'RE_RENDER_PLUGIN_UI',

      onProve: async (
        request: ProveRequest,
        proverOpts: ProverOptions,
        onProgress?: (data: ProveProgressData) => void,
      ) => {
        const merged = {
          ...proverOpts,
          verifierUrl: proverOpts.verifierUrl || opts.verifierUrl,
          proxyUrl: proverOpts.proxyUrl || opts.proxyUrl || '',
        };

        if (approvalMode === 'manual' && this.prover.proveUntilReveal && this.prover.proveFinalize) {
          const prep = await this.prover.proveUntilReveal(request, merged, onProgress);
          const ok = (await this.approval.requestRevealApproval?.({
            request,
            descriptors: prep.descriptors,
            sessionId: prep.sessionId,
            response: prep.response,
          })) ?? false;
          return this.prover.proveFinalize(prep.sessionId, ok);
        }

        return this.prover.prove(request, merged, onProgress);
      },

      onOpenWindow: async (url: string) => {
        try {
          const handle = await this.windows.open(url);
          // Wire request-interception into the plugin's event emitter so
          // `useHeaders` / `useRequests` see the captured headers.
          if (opts.eventEmitter) {
            const emitter = opts.eventEmitter;
            this.interceptor.subscribe(handle, (header) => {
              emitter.emit({
                type: 'HEADER_INTERCEPTED',
                header,
                windowId: handle.id,
              });
            });
          }
          return {
            type: 'WINDOW_OPENED',
            payload: {
              windowId: handle.id,
              uuid: String(handle.id),
              tabId: handle.id,
            },
          };
        } catch (err) {
          return {
            type: 'WINDOW_ERROR',
            payload: {
              error: 'OPEN_FAILED',
              details: err instanceof Error ? err.message : String(err),
            },
          };
        }
      },

      onCloseWindow: (windowId: number) => {
        // Close is fire-and-forget at the SDK layer.
        const page = this.state.pages.get(windowId);
        if (page) page.close().catch(() => {});
      },

      onRenderPluginUi: (windowId: number, dom: unknown) => {
        const handle = this.state.listHandles().find((h) => h.id === windowId);
        if (handle) this.renderer.render(handle, dom);
      },
    });
  }

  async dispose(): Promise<void> {
    await this.state.dispose();
  }
}
