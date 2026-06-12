import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { PluginWebView, InterceptedRequestHeader } from '@tlsn/host-react-native/components';
import { PluginRenderer, DomJson } from '@tlsn/host-react-native/components';
import {
  NativeProver,
  NativeProverHandle,
  ProveProgress,
} from '@tlsn/host-react-native/components';
import { PluginApprovalSheet, ApprovalMode } from './PluginApprovalSheet';
import { TimeoutWarningSheet } from './TimeoutWarningSheet';
import { RevealApprovalSheet } from './RevealApprovalSheet';
import { MobilePluginHost, EventEmitter, RevealRangeDescriptor } from '@tlsn/host-react-native';
import type { PluginConfig, WindowMessage } from '@tlsn/plugin-sdk';
import type { NativeHandler } from '@tlsn/host-contracts';
import { getEffectiveLogLevel } from '../../lib/useVerifierUrl';

/**
 * Resolve a dot-separated path (e.g. "items.0.name") against a JSON value.
 */
function extractJsonPath(obj: unknown, path: string): string {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return '';
    current = (current as Record<string, unknown>)[part];
  }
  if (current == null) return '';
  return typeof current === 'object' ? JSON.stringify(current) : String(current);
}

/**
 * Transform native prover result into extension-compatible { results: [{value}] }
 * by applying each handler to extract specific values from the response.
 *
 * Operates on handlers in the *native* (PascalCase) format — the same format
 * that was forwarded to the tlsn-native module to produce `nativeResult`.
 */
function buildHandlerResults(
  handlers: NativeHandler[],
  nativeResult: { status: number; headers?: { name: string; value: string }[]; body: unknown },
): {
  results: { value: string }[];
  response: {
    status: number;
    headers?: { name: string; value: string }[];
    body: unknown;
  };
} {
  const results: { value: string }[] = [];

  for (const handler of handlers) {
    if (handler.action.type !== 'Reveal') continue;
    let value = '';

    if (handler.handlerType === 'Recv') {
      if (handler.part === 'StartLine') {
        value = `HTTP/1.1 ${nativeResult.status}`;
      } else if (handler.part === 'Headers' && handler.params?.key) {
        const h = nativeResult.headers?.find(
          (hdr) => hdr.name.toLowerCase() === handler.params!.key!.toLowerCase(),
        );
        if (h) value = `${h.name}: ${h.value}`;
      } else if (handler.part === 'Body') {
        if (handler.params?.contentType === 'json' && handler.params?.path) {
          value = extractJsonPath(nativeResult.body, handler.params.path);
        } else {
          value =
            typeof nativeResult.body === 'string'
              ? nativeResult.body
              : JSON.stringify(nativeResult.body);
        }
      }
    } else if (handler.handlerType === 'Sent' && handler.part === 'StartLine') {
      // Sent start line not available from native result; skip
    }

    if (value) {
      results.push({ value });
    }
  }

  return {
    results,
    response: {
      status: nativeResult.status,
      headers: nativeResult.headers,
      body: nativeResult.body,
    },
  };
}

interface PluginScreenProps {
  /** The plugin source code (JavaScript string) */
  pluginCode: string;
  /** Plugin configuration (extracted from plugin code) */
  pluginConfig: PluginConfig;
  /** GitHub URL for the plugin's source — shown on the approval sheet. */
  sourceUrl?: string;
  /** Called when the plugin completes (calls done()) */
  onComplete?: (result: unknown) => void;
  /** Called when the plugin encounters an error */
  onError?: (error: Error) => void;
  /** Override the verifier URL used by prove() (from Settings) */
  verifierUrlOverride?: string;
  /** TLS verification protocol mode (default: 'Mpc') */
  mode?: 'Mpc' | 'Proxy';
}

/**
 * Orchestrator component that runs a TLSN plugin in the mobile app.
 *
 * Manages:
 * - WebView for user login and header interception
 * - NativeProver for TLS proof generation
 * - Plugin UI rendering via PluginRenderer
 * - Event emitter bridging all components
 */
export function PluginScreen({
  pluginCode,
  pluginConfig,
  sourceUrl,
  onComplete,
  onError,
  verifierUrlOverride,
  mode = 'Mpc',
}: PluginScreenProps) {
  const verifierUrlRef = useRef(verifierUrlOverride);
  useEffect(() => {
    verifierUrlRef.current = verifierUrlOverride;
  }, [verifierUrlOverride]);

  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const [domJson, setDomJson] = useState<DomJson | null>(null);
  const [webViewUrl, setWebViewUrl] = useState<string | null>(null);
  const [_windowId, setWindowId] = useState<number>(0);
  const [proverReady, setProverReady] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-execution approval gate: null until the user picks a mode.
  const [approvalMode, setApprovalMode] = useState<ApprovalMode | null>(null);

  // Timeout warning sheet state. Set when HostCore fires onTimeoutWarning.
  const [timeoutWarning, setTimeoutWarning] = useState<{
    extend: () => void;
    dismiss: () => void;
  } | null>(null);

  // Reveal approval sheet state. Set when wrappedOnProve calls onRevealApproval.
  const [revealApproval, setRevealApproval] = useState<{
    descriptors: RevealRangeDescriptor[];
    approve: () => void;
    reject: (err: Error) => void;
  } | null>(null);

  const proverRef = useRef<NativeProverHandle>(null);
  const eventEmitterRef = useRef<EventEmitter | null>(null);
  const hostRef = useRef<MobilePluginHost | null>(null);
  const windowIdCounter = useRef(1);
  const windowIdRef = useRef<number>(0);

  // Extract target hosts from plugin config
  const targetHosts = useMemo(() => {
    if (!pluginConfig.requests) return [];
    return pluginConfig.requests.map((r) => r.host);
  }, [pluginConfig]);

  // Create event emitter
  const eventEmitter = useMemo<EventEmitter>(() => {
    const listeners: Set<(message: WindowMessage) => void> = new Set();
    const emitter: EventEmitter = {
      addListener: (listener) => listeners.add(listener),
      removeListener: (listener) => listeners.delete(listener),
      emit: (message) => {
        for (const listener of listeners) {
          try {
            listener(message);
          } catch (e) {
            console.error('[PluginScreen] Event listener error:', e);
          }
        }
      },
    };
    eventEmitterRef.current = emitter;
    return emitter;
  }, []);

  // Held across the wrappedOnProve split so the resolved handlers can be
  // re-applied to the response when phase B returns.
  const lastNativeHandlersRef = useRef<NativeHandler[]>([]);

  // Create host

  const host = useMemo(() => {
    const h = new MobilePluginHost({
      onProveUntilReveal: async (requestOptions, proverOptions) => {
        if (!proverRef.current?.isReady) {
          throw new Error('Native prover not ready');
        }
        const nativeHandlers = proverOptions.handlers ?? [];
        lastNativeHandlersRef.current = nativeHandlers;

        const prep = await proverRef.current.prepareReveal({
          url: requestOptions.url,
          method: requestOptions.method,
          headers: requestOptions.headers,
          proverOptions: {
            verifierUrl: verifierUrlRef.current || proverOptions.verifierUrl,
            maxSentData: proverOptions.maxSentData ?? 4096,
            maxRecvData: proverOptions.maxRecvData ?? 16384,
            handlers: nativeHandlers as unknown as Parameters<
              typeof proverRef.current.prepareReveal
            >[0]['proverOptions']['handlers'],
            mode: modeRef.current,
          },
        });
        return { sessionId: prep.sessionId, descriptors: prep.descriptors };
      },

      onProveFinalize: async (sessionId, approved) => {
        if (!proverRef.current?.isReady) {
          throw new Error('Native prover not ready');
        }
        const nativeResult = await proverRef.current.finalizeReveal(sessionId, approved);
        return buildHandlerResults(lastNativeHandlersRef.current, nativeResult);
      },

      onRevealApproval: ({ descriptors, approve, reject }) => {
        setRevealApproval({ descriptors, approve, reject });
      },

      onTimeoutWarning: (callbacks) => {
        setTimeoutWarning(callbacks);
      },

      onRenderPluginUi: (_windowId, json) => {
        // Plugin-sdk's DomJson permits 'input' nodes; PluginRenderer renders
        // only div/button/strings, so unsupported nodes degrade gracefully.
        setDomJson(json as DomJson);
      },

      onOpenWindow: async (url, _options) => {
        const wId = windowIdCounter.current++;
        windowIdRef.current = wId;
        setWebViewUrl(url);
        setWindowId(wId);
        return { windowId: wId, uuid: `mobile-${wId}`, tabId: 0 };
      },

      onCloseWindow: (_wId) => {
        setWebViewUrl(null);
        setDomJson(null);
      },
    });

    hostRef.current = h;
    return h;
  }, []);

  // Handle header interception from WebView
  const handleHeaderIntercepted = useCallback(
    (header: InterceptedRequestHeader) => {
      const wId = windowIdRef.current;
      console.log('[PluginScreen] handleHeaderIntercepted wId=', wId, 'url=', header.url);
      if (eventEmitterRef.current && wId) {
        host.emitHeaderIntercepted(eventEmitterRef.current, wId, header);
      } else {
        console.warn(
          '[PluginScreen] Skipping header: emitter=',
          !!eventEmitterRef.current,
          'wId=',
          wId,
        );
      }
    },
    [host],
  );

  // Handle plugin UI button clicks
  const handlePluginAction = useCallback(
    (handlerName: string) => {
      const wId = windowIdRef.current;
      if (eventEmitterRef.current && wId) {
        host.emitPluginAction(eventEmitterRef.current, wId, handlerName);
      }
    },
    [host],
  );

  // Forward native prover progress events to plugin state
  const handleProveProgress = useCallback(
    (progress: ProveProgress) => {
      host.setProveProgress(progress);
    },
    [host],
  );

  // Start plugin execution once the prover is ready AND the user has approved
  // execution via the pre-execution approval sheet (modes 'manual' or
  // 'all-session'). 'rejected' or unset blocks execution.
  useEffect(() => {
    if (!proverReady || isRunning) return;
    if (approvalMode == null || approvalMode === 'rejected') return;

    host.setApprovalMode(approvalMode);
    setIsRunning(true);
    setError(null);

    host
      .executePlugin(pluginCode, { eventEmitter })
      .then((result) => {
        console.log('[PluginScreen] Plugin completed:', result);
        onComplete?.(result);
      })
      .catch((err) => {
        console.error('[PluginScreen] Plugin error:', err);
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error.message);
        onError?.(error);
      })
      .finally(() => {
        setIsRunning(false);
      });
    // isRunning is intentionally omitted: it guards against double-starts,
    // and re-running when it flips back to false would start the plugin twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proverReady, approvalMode, pluginCode, eventEmitter, host, onComplete, onError]);

  return (
    <View style={styles.container}>
      {/* Native TLSN prover (headless) */}
      <NativeProver
        ref={proverRef}
        onReady={() => {
          console.log('[PluginScreen] Native prover ready');
          setProverReady(true);
        }}
        onError={(err) => {
          console.error('[PluginScreen] Native prover error:', err);
          setError(`Prover error: ${err}`);
        }}
        onProgress={handleProveProgress}
        getLogLevel={getEffectiveLogLevel}
      />

      {/* WebView for login/header interception */}
      {webViewUrl && (
        <View style={styles.webViewContainer}>
          <PluginWebView
            url={webViewUrl}
            targetHosts={targetHosts}
            onHeaderIntercepted={handleHeaderIntercepted}
          />
        </View>
      )}

      {/* Plugin UI overlay — hidden while any bottom-sheet gate is active so
          the sheet (absolute-positioned) is always visually on top without
          relying on z-index competition against plugin CSS. */}
      {domJson && revealApproval == null && timeoutWarning == null && (
        <View style={styles.pluginUiContainer}>
          <PluginRenderer domJson={domJson} onPluginAction={handlePluginAction} />
        </View>
      )}

      {/* Loading state */}
      {!proverReady && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#243f5f" />
          <Text style={styles.loadingText}>Initializing prover...</Text>
        </View>
      )}

      {/* Error display */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* "Plugin rejected" surface — shown after the user picks Reject on the
          pre-execution approval sheet, in lieu of running the plugin. */}
      {approvalMode === 'rejected' && (
        <View style={styles.rejectedContainer}>
          <Text style={styles.rejectedTitle}>Plugin not running</Text>
          <Text style={styles.rejectedSubtitle}>You rejected this plugin. No data was sent.</Text>
        </View>
      )}

      {/* Pre-execution approval sheet — visible until the user picks a mode.
          Rendered last so it stacks above the rest. */}
      <PluginApprovalSheet
        visible={proverReady && approvalMode == null}
        pluginConfig={pluginConfig}
        sourceUrl={sourceUrl}
        onApprove={(mode) => setApprovalMode(mode)}
        onReject={() => setApprovalMode('rejected')}
      />

      {/* Reveal approval sheet — visible when wrappedOnProve is awaiting user
          consent for the bytes about to be revealed. */}
      <RevealApprovalSheet
        visible={revealApproval != null}
        descriptors={revealApproval?.descriptors ?? []}
        onApprove={() => {
          revealApproval?.approve();
          setRevealApproval(null);
        }}
        onReject={() => {
          revealApproval?.reject(new Error('User rejected reveal'));
          setRevealApproval(null);
        }}
      />

      {/* Timeout warning sheet — fires ~60s before plugin deadline. */}
      <TimeoutWarningSheet
        visible={timeoutWarning != null}
        initialRemainingMs={60_000}
        onExtend={() => {
          timeoutWarning?.extend();
          setTimeoutWarning(null);
        }}
        onDismiss={() => {
          timeoutWarning?.dismiss();
          setTimeoutWarning(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  webViewContainer: {
    flex: 1,
  },
  pluginUiContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  rejectedContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    paddingHorizontal: 32,
  },
  rejectedTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  rejectedSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    padding: 12,
    backgroundColor: '#f8d7da',
    borderRadius: 8,
  },
  errorText: {
    color: '#721c24',
    textAlign: 'center',
    fontSize: 14,
  },
});
