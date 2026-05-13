import { config, MIN_EXTENSION_VERSION } from './config';

export function checkBrowserCompatibility(): boolean {
  const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
  const isEdge = /Edg/.test(navigator.userAgent);
  const isBrave = navigator.brave && typeof navigator.brave.isBrave === 'function';
  const isChromium = /Chromium/.test(navigator.userAgent);

  return isChrome || isEdge || isBrave || isChromium;
}

export type ExtensionStatus = 'missing' | 'outdated' | 'ok';

export interface ExtensionCheck {
  status: ExtensionStatus;
  version?: string;
  minVersion: string;
}

// Compare dot-separated numeric versions (e.g. "0.1.0.1408"). Missing parts are
// treated as 0. Returns negative if a<b, 0 if equal, positive if a>b.
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((p) => parseInt(p, 10) || 0);
  const pb = b.split('.').map((p) => parseInt(p, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function checkExtension(): Promise<ExtensionCheck> {
  // Wait a bit for tlsn to load if page just loaded
  await new Promise((resolve) => setTimeout(resolve, 1000));
  if (typeof window.tlsn === 'undefined') {
    return { status: 'missing', minVersion: MIN_EXTENSION_VERSION };
  }
  const version = window.tlsn.version;
  if (!version || compareVersions(version, MIN_EXTENSION_VERSION) < 0) {
    return { status: 'outdated', version, minVersion: MIN_EXTENSION_VERSION };
  }
  return { status: 'ok', version, minVersion: MIN_EXTENSION_VERSION };
}

export async function checkVerifier(): Promise<boolean> {
  try {
    const response = await fetch(`${config.verifierUrl}/health`);
    if (response.ok && (await response.text()) === 'ok') {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function formatTimestamp(): string {
  return new Date().toLocaleTimeString();
}
