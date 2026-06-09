/**
 * Ambient type declarations for the `tlsn-native` Expo module.
 *
 * The actual module ships its source as `main`/`types`, which pulls in
 * react-native + expo-modules-core types that don't compile cleanly in this
 * package's tsconfig. We don't need the runtime — only the type contract — so
 * we declare just the surface here.
 *
 * Keep in sync with `app/mobile/modules/tlsn-native/src/index.ts`.
 */

declare module 'tlsn-native' {
  export interface HttpHeader {
    name: string;
    value: string;
  }

  export interface ProveRequest {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  }

  export type HandlerType = 'Sent' | 'Recv';
  export type HandlerPart = 'StartLine' | 'Headers' | 'Body' | 'All';
  export type HandlerAction = 'Reveal';

  export interface HandlerParams {
    key?: string;
    contentType?: string;
    path?: string;
  }

  export interface Handler {
    handlerType: HandlerType;
    part: HandlerPart;
    action: HandlerAction;
    params?: HandlerParams;
  }

  export interface ProverOptions {
    verifierUrl: string;
    maxSentData?: number;
    maxRecvData?: number;
    handlers?: Handler[];
    mode?: 'Mpc' | 'Proxy';
  }

  export interface ProveResult {
    status: number;
    headers: HttpHeader[];
    body: unknown;
    transcript: { sentLength: number; recvLength: number };
    handlersReceived?: number;
  }

  export interface ProveProgress {
    step: string;
    progress: number;
    message: string;
  }

  export interface NativeLogLine {
    level: string;
    target: string;
    message: string;
  }

  export interface RevealRangeDescriptor {
    direction: 'SENT' | 'RECV';
    label: string;
    action: 'REVEAL' | 'HASH';
    algorithm?: 'Blake3' | 'Sha256' | 'Keccak256';
    preview: string;
  }

  export interface RevealPreparation {
    sessionId: string;
    response: { status: number; headers: HttpHeader[]; body: unknown };
    descriptors: RevealRangeDescriptor[];
  }

  /** envFilter directives, e.g. "tlsn_mobile=info,tlsn=warn". */
  export type TlsnLogLevel = string;

  export function initialize(): void;
  export function isAvailable(): boolean;
  export function prove(request: ProveRequest, options: ProverOptions): Promise<ProveResult>;
  export function proveUntilReveal(
    request: ProveRequest,
    options: ProverOptions,
  ): Promise<RevealPreparation>;
  export function proveFinalize(sessionId: string, approved: boolean): Promise<ProveResult>;
  export function addProgressListener(
    cb: (event: ProveProgress) => void,
  ): { remove: () => void };
  export function drainNativeLogs(): NativeLogLine[];
  export function setLogLevel(level: TlsnLogLevel): void;
}
