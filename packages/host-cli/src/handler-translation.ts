/**
 * Translate `@tlsn/plugin-sdk` Handler descriptors (SCREAMING_SNAKE_CASE) into
 * the NativeHandler shape the tlsn-prover Rust binary deserializes.
 *
 * This is a copy of the mobile-side helper in `app/mobile/lib/handlerTranslation.ts`.
 * The shared home for this module is `@tlsn/host-contracts` (Phase 2 of the
 * plan), at which point both adapters will import it from there. Until then,
 * keeping a copy here avoids cross-workspace imports.
 */

import type { Handler } from '@tlsn/plugin-sdk';

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
    return { type: 'Hash', algorithm: ALGORITHM_MAP[action.algorithm] };
  }
  return { type: 'Reveal' };
}

function translateParams(handler: Handler): NativeHandler['params'] | undefined {
  const params = (handler as { params?: Record<string, unknown> }).params;
  if (!params) return undefined;
  const out: NonNullable<NativeHandler['params']> = {};
  if (typeof params.key === 'string') out.key = params.key;
  if (typeof params.hideKey === 'boolean') out.hideKey = params.hideKey;
  if (typeof params.hideValue === 'boolean') out.hideValue = params.hideValue;
  if (typeof params.type === 'string') out.contentType = params.type;
  if (typeof params.path === 'string') out.path = params.path;
  if (typeof params.regex === 'string') out.regex = params.regex;
  if (typeof params.flags === 'string') out.flags = params.flags;
  return Object.keys(out).length ? out : undefined;
}

export function translateHandler(handler: Handler): NativeHandler {
  return {
    handlerType: HANDLER_TYPE_MAP[handler.type],
    part: HANDLER_PART_MAP[handler.part],
    action: translateAction(handler),
    params: translateParams(handler),
  };
}

export function translateHandlers(handlers: Handler[]): NativeHandler[] {
  return handlers.map(translateHandler);
}
