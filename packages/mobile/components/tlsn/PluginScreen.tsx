import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { PluginWebView, InterceptedRequestHeader } from './PluginWebView';
import { PluginRenderer, DomJson } from './PluginRenderer';
import { NativeProver, NativeProverHandle, Handler as NativeHandler } from './NativeProver';
import {
  MobilePluginHost,
  PluginConfig,
  PluginHandler,
  translateHandlers,
  EventEmitter,
  WindowMessage,
} from '../../lib/MobilePluginHost';

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
 */
function buildHandlerResults(
  handlers: PluginHandler[],
  nativeResult: { status: number; headers?: { name: string; value: string }[]; body: unknown },
): { results: { value: string }[] } {
  const results: { value: string }[] = [];

  for (const handler of handlers) {
    if (handler.action !== 'REVEAL') continue;
    let value = '';

    if (handler.type === 'RECV') {
      if (handler.part === 'START_LINE') {
        value = `HTTP/1.1 ${nativeResult.status}`;
      } else if (handler.part === 'HEADERS' && handler.params?.key) {
        const h = nativeResult.headers?.find(
          (hdr) => hdr.name.toLowerCase() === (handler.params!.key as string).toLowerCase(),
        );
        if (h) value = `${h.name}: ${h.value}`;
      } else if (handler.part === 'BODY') {
        if (handler.params?.type === 'json' && handler.params?.path) {
          value = extractJsonPath(nativeResult.body, handler.params.path as string);
        } else {
          value =
            typeof nativeResult.body === 'string'
              ? nativeResult.body
              : JSON.stringify(nativeResult.body);
        }
      }
    } else if (handler.type === 'SENT' && handler.part === 'START_LINE') {
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
  /** Called when the plugin completes (calls done()) */
  onComplete?: (result: unknown) => void;
  /** Called when the plugin encounters an error */
  onError?: (error: Error) => void;
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
  onComplete,
  onError,
}: PluginScreenProps) {
  const [domJson, setDomJson] = useState<DomJson | null>(null);
  const [webViewUrl, setWebViewUrl] = useState<string | null>(null);
  const [windowId, setWindowId] = useState<number>(0);
  const [proverReady, setProverReady] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Create host
  const host = useMemo(() => {
    const h = new MobilePluginHost({
      onProve: async (requestOptions, proverOptions) => {
        if (!proverRef.current?.isReady) {
          throw new Error('Native prover not ready');
        }

        // Translate handlers from plugin format to native format
        const nativeHandlers: NativeHandler[] = translateHandlers(
          proverOptions.handlers || [],
        ).map((h) => ({
          handlerType: h.handlerType,
          part: h.part,
          action: h.action,
          params: h.params,
        })) as NativeHandler[];

        const nativeResult = await proverRef.current.prove({
          url: requestOptions.url,
          method: requestOptions.method,
          headers: requestOptions.headers,
          proverOptions: {
            verifierUrl: proverOptions.verifierUrl,
            maxSentData: proverOptions.maxSentData ?? 4096,
            maxRecvData: proverOptions.maxRecvData ?? 16384,
            handlers: nativeHandlers,
          },
        });

        // Transform native result into extension-compatible format
        return buildHandlerResults(proverOptions.handlers || [], nativeResult);
      },

      onRenderPluginUi: (_windowId, json) => {
        setDomJson(json);
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
        console.warn('[PluginScreen] Skipping header: emitter=', !!eventEmitterRef.current, 'wId=', wId);
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

  // Start plugin execution when prover is ready
  useEffect(() => {
    if (!proverReady || isRunning) return;

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
  }, [proverReady, pluginCode, eventEmitter, host, onComplete, onError]);

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

      {/* Plugin UI overlay */}
      {domJson && (
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
