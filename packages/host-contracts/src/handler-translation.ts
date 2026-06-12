/**
 * Handler format translation
 *
 * `@tlsn/plugin-sdk` emits handlers in canonical SCREAMING_SNAKE_CASE form
 * (`type: 'SENT' | 'RECV'`, `part: 'START_LINE' | …`,
 * `action: 'REVEAL' | { kind: 'HASH', algorithm }`).
 *
 * Every native adapter (Rust prover via uniffi for mobile + CLI; tlsn-wasm
 * for the extension) wants the same PascalCase shape:
 * `handlerType: 'Sent' | 'Recv'`, `part: 'StartLine' | …`,
 * `action: { type: 'Reveal' } | { type: 'Hash', algorithm: ... }`.
 *
 * Lifted here so every adapter shares one canonical implementation rather
 * than each carrying its own copy.
 */

import type { Handler } from '@tlsn/plugin-sdk';

/**
 * Native handler format (PascalCase). Mirrors the broader shape accepted by
 * the native side, including the subset of params used by current plugins.
 */
export interface NativeHandler {
  handlerType: 'Sent' | 'Recv';
  part:
    | 'StartLine'
    | 'Protocol'
    | 'Method'
    | 'RequestTarget'
    | 'StatusCode'
    | 'Headers'
    | 'Body'
    | 'All';
  action: { type: 'Reveal' } | { type: 'Hash'; algorithm: 'Blake3' | 'Sha256' | 'Keccak256' };
  params?: {
    key?: string;
    hideKey?: boolean;
    hideValue?: boolean;
    contentType?: string;
    path?: string;
    regex?: string;
    flags?: string;
  };
}

const HANDLER_TYPE_MAP: Record<string, 'Sent' | 'Recv'> = {
  SENT: 'Sent',
  RECV: 'Recv',
};

const HANDLER_PART_MAP: Record<string, NativeHandler['part']> = {
  START_LINE: 'StartLine',
  PROTOCOL: 'Protocol',
  METHOD: 'Method',
  REQUEST_TARGET: 'RequestTarget',
  STATUS_CODE: 'StatusCode',
  HEADERS: 'Headers',
  BODY: 'Body',
  ALL: 'All',
};

const ALGORITHM_MAP: Record<string, 'Blake3' | 'Sha256' | 'Keccak256'> = {
  BLAKE3: 'Blake3',
  SHA256: 'Sha256',
  KECCAK256: 'Keccak256',
};

function translateAction(handler: Handler): NativeHandler['action'] {
  const action =
    typeof handler.action === 'string' ? ({ kind: handler.action } as const) : handler.action;
  if (action.kind === 'HASH') {
    return {
      type: 'Hash',
      algorithm: ALGORITHM_MAP[action.algorithm],
    };
  }
  return { type: 'Reveal' };
}

export function translateHandler(handler: Handler): NativeHandler {
  const result: NativeHandler = {
    handlerType: HANDLER_TYPE_MAP[handler.type] || 'Sent',
    part: HANDLER_PART_MAP[handler.part] || 'StartLine',
    action: translateAction(handler),
  };

  const params = (handler as { params?: Record<string, unknown> }).params;
  if (params) {
    result.params = {};
    if (params.key) result.params.key = params.key as string;
    if (params.hideKey) result.params.hideKey = params.hideKey as boolean;
    if (params.hideValue) result.params.hideValue = params.hideValue as boolean;
    if (params.path) result.params.path = params.path as string;
    if (params.regex) result.params.regex = params.regex as string;
    if (params.flags) result.params.flags = params.flags as string;
    // Plugin uses params.type: 'json' | 'regex'; native uses params.contentType.
    if (params.type) result.params.contentType = params.type as string;
  }

  return result;
}

export function translateHandlers(handlers: Handler[]): NativeHandler[] {
  return handlers.map(translateHandler);
}
