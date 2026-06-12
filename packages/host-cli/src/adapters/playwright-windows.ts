import type {
  OpenWindowOptions,
  Unsubscribe,
  WindowHandle,
  WindowManager,
} from '@tlsn/host-contracts';
import type { PlaywrightState } from './playwright-state';

export class PlaywrightWindowManager implements WindowManager {
  constructor(private readonly state: PlaywrightState) {}

  async open(url: string, _opts?: OpenWindowOptions): Promise<WindowHandle> {
    const id = this.state.assignId();
    const page = await this.state.context.newPage();
    const handle = this.state.registerPage(id, page, url);
    // Don't block on the load — plugins frequently want to subscribe to
    // header interception before navigation completes.
    page.goto(url).catch(() => {
      // Best-effort: failed navigations still leave the page open so the
      // plugin can decide what to do (the close event will fire if the user
      // dismisses).
    });
    return handle;
  }

  async close(handle: WindowHandle): Promise<void> {
    const page = this.state.pages.get(handle.id);
    if (!page) return;
    await page.close().catch(() => {});
  }

  list(): WindowHandle[] {
    return this.state.listHandles();
  }

  onClose(handle: WindowHandle, cb: () => void): Unsubscribe {
    const set = this.state.closeListeners.get(handle.id);
    if (!set) {
      // Window already closed — fire synchronously next tick.
      queueMicrotask(cb);
      return () => {};
    }
    set.add(cb);
    return () => set.delete(cb);
  }
}
