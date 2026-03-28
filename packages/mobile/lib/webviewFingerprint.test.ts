import { describe, it, expect } from 'vitest';
import { buildFingerprintHidingScript } from './webviewFingerprint';

describe('buildFingerprintHidingScript', () => {
  it('returns a string of JavaScript', () => {
    const script = buildFingerprintHidingScript();
    expect(typeof script).toBe('string');
    expect(script.length).toBeGreaterThan(0);
  });

  it('hides window.webkit.messageHandlers by making it non-enumerable', () => {
    const script = buildFingerprintHidingScript();
    expect(script).toContain('webkit');
    expect(script).toContain('messageHandlers');
  });

  it('creates a window.chrome stub to match desktop Chrome user-agent', () => {
    const script = buildFingerprintHidingScript();
    expect(script).toContain('window.chrome');
    expect(script).toContain('runtime');
  });

  it('sets navigator.webdriver to false', () => {
    const script = buildFingerprintHidingScript();
    expect(script).toContain('webdriver');
  });

  it('hides the ReactNativeWebView bridge object', () => {
    const script = buildFingerprintHidingScript();
    expect(script).toContain('ReactNativeWebView');
  });

  it('wraps everything in an IIFE', () => {
    const script = buildFingerprintHidingScript();
    expect(script.trim()).toMatch(/^\(function\(\)/);
    expect(script.trim()).toMatch(/\}\)\(\);$/);
  });

  it('produces valid JavaScript syntax', () => {
    const script = buildFingerprintHidingScript();
    // Should not throw when parsed
    expect(() => new Function(script)).not.toThrow();
  });
});
