import type { InterceptedRequestHeader } from '@tlsn/plugin-sdk';
import type { RequestInterceptor, Unsubscribe, WindowHandle } from '@tlsn/host-contracts';
import type { PlaywrightState } from './playwright-state';

export class PlaywrightRequestInterceptor implements RequestInterceptor {
  constructor(private readonly state: PlaywrightState) {}

  subscribe(handle: WindowHandle, cb: (h: InterceptedRequestHeader) => void): Unsubscribe {
    const subs = this.state.subscribers.get(handle.id);
    if (!subs) {
      // Window unknown / closed — give caller a no-op so they don't crash.
      return () => {};
    }
    subs.add(cb);
    return () => subs.delete(cb);
  }
}
