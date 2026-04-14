import { describe, it, expect } from 'vitest';
import {
  clampTimeout,
  createTimeoutWarningOverlay,
  DEFAULT_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  TIMEOUT_EXTEND_MS,
} from '../src/index';
import type { DomJson } from '../src/types';

// Skip in browser environment — Node only
describe.skipIf(typeof window !== 'undefined')('Timeout utilities', () => {
  // ---------------------------------------------------------------------------
  // clampTimeout
  // ---------------------------------------------------------------------------

  describe('clampTimeout', () => {
    it('returns default (15 min) when value is undefined', () => {
      expect(clampTimeout(undefined)).toBe(DEFAULT_TIMEOUT_MS);
      expect(clampTimeout()).toBe(DEFAULT_TIMEOUT_MS);
    });

    it('returns default when value is null', () => {
      expect(clampTimeout(null as unknown as undefined)).toBe(DEFAULT_TIMEOUT_MS);
    });

    it('clamps to minimum (2 min) when value is too small', () => {
      expect(clampTimeout(0)).toBe(MIN_TIMEOUT_MS);
      expect(clampTimeout(1000)).toBe(MIN_TIMEOUT_MS);
      expect(clampTimeout(60_000)).toBe(MIN_TIMEOUT_MS);
    });

    it('clamps to maximum (60 min) when value is too large', () => {
      expect(clampTimeout(99_999_999)).toBe(MAX_TIMEOUT_MS);
      expect(clampTimeout(MAX_TIMEOUT_MS + 1)).toBe(MAX_TIMEOUT_MS);
    });

    it('passes through values within range', () => {
      expect(clampTimeout(MIN_TIMEOUT_MS)).toBe(MIN_TIMEOUT_MS);
      expect(clampTimeout(300_000)).toBe(300_000);
      expect(clampTimeout(MAX_TIMEOUT_MS)).toBe(MAX_TIMEOUT_MS);
    });
  });

  // ---------------------------------------------------------------------------
  // createTimeoutWarningOverlay
  // ---------------------------------------------------------------------------

  describe('createTimeoutWarningOverlay', () => {
    it('returns valid DomJson with expected structure', () => {
      const overlay = createTimeoutWarningOverlay();

      // Root is a full-screen backdrop div
      expect(typeof overlay).toBe('object');
      expect(overlay).not.toBeNull();
      const root = overlay as Exclude<DomJson, string>;
      expect(root.type).toBe('div');
      expect(root.options.style?.position).toBe('fixed');
      expect(root.options.style?.zIndex).toBe('9999999');
    });

    it('contains a modal card with title and message', () => {
      const overlay = createTimeoutWarningOverlay() as Exclude<DomJson, string>;
      // First child is the modal card
      const card = overlay.children[0] as Exclude<DomJson, string>;
      expect(card.type).toBe('div');

      // Card children: icon, title, message, extend button, expire button
      expect(card.children.length).toBe(5);

      // Title
      const title = card.children[1] as Exclude<DomJson, string>;
      expect(title.children).toContain('Plugin Timeout Warning');

      // Message
      const message = card.children[2] as Exclude<DomJson, string>;
      expect((message.children[0] as string).toLowerCase()).toContain('time out');
    });

    it('has extend button with _extendTimeout onclick', () => {
      const overlay = createTimeoutWarningOverlay() as Exclude<DomJson, string>;
      const card = overlay.children[0] as Exclude<DomJson, string>;
      const extendBtn = card.children[3] as Exclude<DomJson, string>;

      expect(extendBtn.type).toBe('button');
      expect(extendBtn.options.onclick).toBe('_extendTimeout');
      expect(extendBtn.children[0]).toContain('5 min');
    });

    it('has dismiss button with _dismissTimeoutWarning onclick', () => {
      const overlay = createTimeoutWarningOverlay() as Exclude<DomJson, string>;
      const card = overlay.children[0] as Exclude<DomJson, string>;
      const dismissBtn = card.children[4] as Exclude<DomJson, string>;

      expect(dismissBtn.type).toBe('button');
      expect(dismissBtn.options.onclick).toBe('_dismissTimeoutWarning');
    });
  });

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  describe('Timeout constants', () => {
    it('DEFAULT_TIMEOUT_MS is 15 minutes', () => {
      expect(DEFAULT_TIMEOUT_MS).toBe(15 * 60 * 1000);
    });

    it('TIMEOUT_EXTEND_MS is 5 minutes', () => {
      expect(TIMEOUT_EXTEND_MS).toBe(5 * 60 * 1000);
    });

    it('MIN < DEFAULT < MAX', () => {
      expect(MIN_TIMEOUT_MS).toBeLessThan(DEFAULT_TIMEOUT_MS);
      expect(DEFAULT_TIMEOUT_MS).toBeLessThan(MAX_TIMEOUT_MS);
    });
  });
});
