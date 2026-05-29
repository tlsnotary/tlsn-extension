/**
 * Handler format translation
 *
 * Plugin-sdk uses canonical SCREAMING_SNAKE_CASE handler descriptors
 * (`type: 'SENT' | 'RECV'`, `part: 'START_LINE' | …`, `action: 'REVEAL' | { kind: 'HASH', algorithm }`).
 *
 * The mobile native module (Rust/Kotlin/Swift) uses PascalCase enum variants
 * (`handlerType: 'Sent' | 'Recv'`, `part: 'StartLine' | …`, `action: { type: 'Reveal' } | { type: 'Hash', algorithm }`).
 *
 * This module bridges those two representations.
 */

import type { Handler } from '@tlsn/plugin-sdk';

/**
 * Mobile native handler format (PascalCase).
 *
 * Mirrors the broader shape accepted by the native side, including the
 * subset of params used by current plugins. The `tlsn-native` package
 * exports a narrower `Handler` type; this superset is what we hand to
 * the native module after translation.
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
  action:
    | { type: 'Reveal' }
    | { type: 'Hash'; algorithm: 'Blake3' | 'Sha256' | 'Keccak256' }
    | {
        type: 'Assert';
        op: 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'in';
        value?: number;
        min?: number;
        max?: number;
        inclusive?: boolean;
        values?: (string | number)[];
      };
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
  if (action.kind === 'ASSERT') {
    // ASSERT reveals the value natively (treated as Reveal by compute_reveal);
    // the comparison spec is carried through to the verifier's reveal_config.
    if (action.op === 'between') {
      return {
        type: 'Assert',
        op: 'between',
        min: action.min,
        max: action.max,
        ...(action.inclusive !== undefined ? { inclusive: action.inclusive } : {}),
      };
    }
    if (action.op === 'in') {
      return { type: 'Assert', op: 'in', values: action.values };
    }
    return { type: 'Assert', op: action.op, value: action.value };
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
