import { describe, it, expect, vi } from 'vitest';
import { Host, createRevealApprovalOverlay } from '../src/index';
import type { WindowMessage, DomJson, RevealRangeDescriptor } from '../src/types';

/**
 * Browser E2E tests for the reveal approval flow.
 *
 * These tests run real QuickJS WASM in Chromium via Playwright, verifying:
 * - _revealApprove resolves the pending prove() approval
 * - _revealReject rejects the pending prove() approval
 * - _revealApprove and _revealReject are not forwarded to plugin callbacks
 * - createRevealApprovalOverlay produces the expected DomJson structure
 */
describe('Reveal Approval E2E', () => {
  function createEventEmitter() {
    const listeners: Array<(msg: WindowMessage) => void> = [];
    return {
      addListener: (fn: (msg: WindowMessage) => void) => listeners.push(fn),
      removeListener: (fn: (msg: WindowMessage) => void) => {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      },
      emit: (msg: WindowMessage) => {
        [...listeners].forEach((fn) => fn(msg));
      },
    };
  }

  const sampleDescriptors: RevealRangeDescriptor[] = [
    {
      direction: 'RECV',
      label: 'Body: amount',
      action: 'REVEAL',
      preview: '1234.56',
    },
  ];

  const provePluginCode = `
    export function main() {
      openWindow('https://example.com', { width: 400, height: 300 });
      return button({ onclick: 'handleProve' }, ['Prove']);
    }
    export async function handleProve() {
      try {
        const result = await prove(
          { url: 'https://example.com', method: 'GET', headers: {} },
          { verifierUrl: 'http://localhost:7047', proxyUrl: 'ws://localhost:55688', handlers: [] }
        );
        done({ ok: true, result });
      } catch (err) {
        done({ ok: false, message: err && err.message ? err.message : String(err) });
      }
    }
  `;

  it('should resolve prove() when _revealApprove is clicked', async () => {
    const onProve = vi.fn(async () => {
      host.renderUi(1, createRevealApprovalOverlay(sampleDescriptors));
      await new Promise<void>((resolve, reject) => {
        host.registerRevealApproval(resolve, reject);
      });
      return { proof: 'mock' };
    });

    const onRenderPluginUi = vi.fn().mockImplementation((_windowId: number, json: DomJson) => {
      if (JSON.stringify(json).includes('_revealApprove')) {
        setTimeout(() => {
          emitter.emit({
            type: 'PLUGIN_UI_CLICK',
            onclick: '_revealApprove',
            windowId: 1,
          } as unknown as WindowMessage);
        }, 10);
      }
    });

    const host = new Host({
      onProve,
      onRenderPluginUi,
      onCloseWindow: vi.fn(),
      onOpenWindow: vi.fn().mockResolvedValue({
        type: 'WINDOW_OPENED',
        payload: { windowId: 1, uuid: 'test-uuid', tabId: 1 },
      }),
    });

    const emitter = createEventEmitter();

    const donePromise = host.executePlugin(provePluginCode, { eventEmitter: emitter });

    await new Promise((r) => setTimeout(r, 200));
    emitter.emit({
      type: 'PLUGIN_UI_CLICK',
      onclick: 'handleProve',
      windowId: 1,
    } as unknown as WindowMessage);

    const result = (await donePromise) as { ok: boolean; result?: unknown };
    expect(result).toEqual({ ok: true, result: { proof: 'mock' } });
    expect(onProve).toHaveBeenCalledTimes(1);
  });

  it('should reject prove() when _revealReject is clicked', async () => {
    const onProve = vi.fn(async () => {
      host.renderUi(1, createRevealApprovalOverlay(sampleDescriptors));
      await new Promise<void>((resolve, reject) => {
        host.registerRevealApproval(resolve, reject);
      });
      return { proof: 'mock' };
    });

    const onRenderPluginUi = vi.fn().mockImplementation((_windowId: number, json: DomJson) => {
      if (JSON.stringify(json).includes('_revealReject')) {
        setTimeout(() => {
          emitter.emit({
            type: 'PLUGIN_UI_CLICK',
            onclick: '_revealReject',
            windowId: 1,
          } as unknown as WindowMessage);
        }, 10);
      }
    });

    const host = new Host({
      onProve,
      onRenderPluginUi,
      onCloseWindow: vi.fn(),
      onOpenWindow: vi.fn().mockResolvedValue({
        type: 'WINDOW_OPENED',
        payload: { windowId: 1, uuid: 'test-uuid', tabId: 1 },
      }),
    });

    const emitter = createEventEmitter();

    const donePromise = host.executePlugin(provePluginCode, { eventEmitter: emitter });

    await new Promise((r) => setTimeout(r, 200));
    emitter.emit({
      type: 'PLUGIN_UI_CLICK',
      onclick: 'handleProve',
      windowId: 1,
    } as unknown as WindowMessage);

    const result = (await donePromise) as { ok: boolean; message?: string };
    expect(result.ok).toBe(false);
    expect(result.message).toContain('rejected');
  });

  it('should not forward _revealApprove or _revealReject to plugin callbacks', async () => {
    const handleSpy = vi.fn();

    const onProve = vi.fn(async () => {
      host.renderUi(1, createRevealApprovalOverlay(sampleDescriptors));
      await new Promise<void>((resolve, reject) => {
        host.registerRevealApproval(resolve, reject);
      });
      return { proof: 'mock' };
    });

    const onRenderPluginUi = vi.fn().mockImplementation((_windowId: number, json: DomJson) => {
      if (JSON.stringify(json).includes('_revealApprove')) {
        setTimeout(() => {
          emitter.emit({
            type: 'PLUGIN_UI_CLICK',
            onclick: '_revealApprove',
            windowId: 1,
          } as unknown as WindowMessage);
        }, 10);
      }
    });

    const host = new Host({
      onProve,
      onRenderPluginUi,
      onCloseWindow: vi.fn(),
      onOpenWindow: vi.fn().mockResolvedValue({
        type: 'WINDOW_OPENED',
        payload: { windowId: 1, uuid: 'test-uuid', tabId: 1 },
      }),
    });

    const emitter = createEventEmitter();
    host.addCapability('handleSpy', handleSpy);

    const donePromise = host.executePlugin(
      `
      export function main() {
        openWindow('https://example.com', { width: 400, height: 300 });
        return button({ onclick: 'handleProve' }, ['Prove']);
      }
      export async function _revealApprove() {
        handleSpy('_revealApprove');
      }
      export async function _revealReject() {
        handleSpy('_revealReject');
      }
      export async function handleProve() {
        try {
          const result = await prove(
            { url: 'https://example.com', method: 'GET', headers: {} },
            { verifierUrl: 'http://localhost:7047', proxyUrl: 'ws://localhost:55688', handlers: [] }
          );
          done({ ok: true, result });
        } catch (err) {
          done({ ok: false, message: err && err.message ? err.message : String(err) });
        }
      }
    `,
      { eventEmitter: emitter },
    );

    await new Promise((r) => setTimeout(r, 200));
    emitter.emit({
      type: 'PLUGIN_UI_CLICK',
      onclick: 'handleProve',
      windowId: 1,
    } as unknown as WindowMessage);

    const result = (await donePromise) as { ok: boolean };
    expect(result.ok).toBe(true);
    expect(handleSpy).not.toHaveBeenCalled();
  });

  it('should produce overlay DomJson with _revealApprove and _revealReject buttons', () => {
    const overlay = createRevealApprovalOverlay([
      {
        direction: 'SENT',
        label: 'Method',
        action: 'REVEAL',
        preview: 'GET',
      },
      {
        direction: 'RECV',
        label: 'Body: amount',
        action: 'REVEAL',
        preview: '1234.56',
      },
    ]);

    const json = JSON.stringify(overlay);
    expect(json).toContain('_revealApprove');
    expect(json).toContain('_revealReject');

    const buttons = collectButtons(overlay);
    const onclicks = buttons.map((b) => b.options?.onclick).filter(Boolean);
    expect(onclicks).toContain('_revealApprove');
    expect(onclicks).toContain('_revealReject');
  });
});

function collectButtons(node: DomJson): DomJson[] {
  const out: DomJson[] = [];
  if (typeof node !== 'object' || node === null) return out;
  if (node.type === 'button') out.push(node);
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      if (typeof child === 'object' && child !== null) {
        out.push(...collectButtons(child));
      }
    }
  }
  return out;
}
