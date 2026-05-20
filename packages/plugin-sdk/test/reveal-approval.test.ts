import { describe, it, expect } from 'vitest';
import { createRevealApprovalOverlay } from '../src/index';
import type { RevealRangeDescriptor, DomJson } from '../src/index';

function findButtons(node: DomJson): string[] {
  if (typeof node === 'string') {
    return [];
  }
  const collected: string[] = [];
  if (node.type === 'button' && typeof node.options.onclick === 'string') {
    collected.push(node.options.onclick);
  }
  for (const child of node.children) {
    collected.push(...findButtons(child));
  }
  return collected;
}

function flattenText(node: DomJson): string[] {
  if (typeof node === 'string') {
    return [node];
  }
  const collected: string[] = [];
  for (const child of node.children) {
    collected.push(...flattenText(child));
  }
  return collected;
}

describe('createRevealApprovalOverlay', () => {
  it('returns a non-empty DomJson', () => {
    const result = createRevealApprovalOverlay([]);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('object');
  });

  it('includes _revealApprove and _revealReject buttons', () => {
    const result = createRevealApprovalOverlay([]);
    const buttons = findButtons(result);
    expect(buttons).toContain('_revealApprove');
    expect(buttons).toContain('_revealReject');
  });

  it('only _revealApprove and _revealReject are present as onclick handlers', () => {
    const result = createRevealApprovalOverlay([]);
    const buttons = findButtons(result);
    expect(buttons.every((b) => b === '_revealApprove' || b === '_revealReject')).toBe(true);
  });

  it('renders SENT descriptors and RECV descriptors in separate sections', () => {
    const descriptors: RevealRangeDescriptor[] = [
      { direction: 'SENT', label: 'Start line', action: 'REVEAL', preview: 'GET /path' },
      { direction: 'SENT', label: 'Headers: host', action: 'REVEAL', preview: 'example.com' },
      { direction: 'RECV', label: 'Body: amount', action: 'REVEAL', preview: '1234.56' },
    ];
    const result = createRevealApprovalOverlay(descriptors);
    const text = flattenText(result);
    expect(text.some((t) => t.toLowerCase().includes('sent'))).toBe(true);
    expect(text.some((t) => t.toLowerCase().includes('receiv'))).toBe(true);
    expect(text.some((t) => t.includes('Start line'))).toBe(true);
    expect(text.some((t) => t.includes('Body: amount'))).toBe(true);
  });

  it('renders HASH action chip differently from REVEAL', () => {
    const descriptors: RevealRangeDescriptor[] = [
      { direction: 'RECV', label: 'Body: secret', action: 'HASH', preview: 'hidden' },
    ];
    const result = createRevealApprovalOverlay(descriptors);
    const text = flattenText(result);
    expect(text.some((t) => t.includes('HASH') || t.includes('SHA'))).toBe(true);
  });

  it('only shows SENT section when all descriptors are SENT', () => {
    const descriptors: RevealRangeDescriptor[] = [
      { direction: 'SENT', label: 'Start line', action: 'REVEAL', preview: 'GET /' },
    ];
    const result = createRevealApprovalOverlay(descriptors);
    const text = flattenText(result);
    expect(text.some((t) => t.toLowerCase().includes('sent'))).toBe(true);
    expect(text.some((t) => t.toLowerCase().includes('receiv'))).toBe(false);
  });
});
