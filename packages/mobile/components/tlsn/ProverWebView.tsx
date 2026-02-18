import React, { useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

// Simple UUID generator to avoid external dependency issues
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export interface ProveParams {
  url: string;
  method: string;
  headers: Record<string, string>;
  proverOptions: {
    verifierUrl: string;
    maxSentData: number;
    maxRecvData: number;
  };
}

export interface ProveResult {
  status: number;
  body: unknown;
  transcript: {
    sentLength: number;
    recvLength: number;
  };
}

export interface ProverHandle {
  prove: (params: ProveParams) => Promise<ProveResult>;
  isReady: boolean;
}

interface PendingRequest {
  resolve: (result: ProveResult) => void;
  reject: (error: Error) => void;
}

interface ProverWebViewProps {
  onReady?: () => void;
  onError?: (error: string) => void;
}

function ProverWebViewComponent(
  { onReady, onError }: ProverWebViewProps,
  ref: React.ForwardedRef<ProverHandle>
) {
  const webviewRef = useRef<WebView>(null);
  const pendingRequests = useRef<Map<string, PendingRequest>>(new Map());
  const [isReady, setIsReady] = useState(false);

  const prove = useCallback((params: ProveParams): Promise<ProveResult> => {
    return new Promise((resolve, reject) => {
      if (!isReady) {
        reject(new Error('Prover not ready'));
        return;
      }

      const id = generateId();
      console.log('[ProverWebView] Creating prove request:', id);

      // Set up timeout (2 minutes)
      const timeoutId = setTimeout(() => {
        if (pendingRequests.current.has(id)) {
          pendingRequests.current.delete(id);
          reject(new Error('Proof generation timed out after 2 minutes'));
        }
      }, 120000);

      pendingRequests.current.set(id, {
        resolve: (result) => {
          clearTimeout(timeoutId);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        }
      });

      const message = { id, action: 'prove', params };
      console.log('[ProverWebView] Sending prove request:', id);
      console.log('[ProverWebView] Params:', JSON.stringify(params, null, 2));

      // Send message to WebView
      const script = `
        console.log('[TLSN-Injected] Posting message to window');
        window.postMessage(${JSON.stringify(message)}, '*');
        true;
      `;
      console.log('[ProverWebView] Injecting script...');
      webviewRef.current?.injectJavaScript(script);
    });
  }, [isReady]);

  useImperativeHandle(ref, () => ({
    prove,
    isReady,
  }), [prove, isReady]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      // Forward console logs from WebView
      if (data.type === 'CONSOLE') {
        const prefix = `[WebView:${data.level}]`;
        if (data.level === 'error') {
          console.error(prefix, data.message);
        } else if (data.level === 'warn') {
          console.warn(prefix, data.message);
        } else {
          console.log(prefix, data.message);
        }
        return;
      }

      if (data.type === 'PAGE_LOADED') {
        console.log('[ProverWebView] Page loaded, waiting for WASM...');
        return;
      }

      if (data.type === 'READY') {
        console.log('[ProverWebView] WASM ready');
        setIsReady(true);
        onReady?.();
        return;
      }

      if (data.type === 'ERROR') {
        console.error('[ProverWebView] Initialization error:', data.error);
        onError?.(data.error);
        return;
      }

      if (data.id) {
        const pending = pendingRequests.current.get(data.id);
        if (pending) {
          if (data.success) {
            console.log('[ProverWebView] Proof succeeded');
            pending.resolve(data.result);
          } else {
            console.error('[ProverWebView] Proof failed:', data.error);
            pending.reject(new Error(data.error));
          }
          pendingRequests.current.delete(data.id);
        }
      }
    } catch (e) {
      console.error('[ProverWebView] Failed to parse message:', e);
    }
  }, [onReady, onError]);

  // Prover URL - for local development, run: npm run serve:prover
  // Then replace YOUR_IP with your machine's IP address (not localhost!)
  // To find your IP: ifconfig | grep "inet " | grep -v 127.0.0.1
  const PROVER_URL = 'http://localhost:8888/index.html'; // Works on iOS simulator

  // For physical device, use your machine's IP:
  // const PROVER_URL = 'http://192.168.x.x:8888/index.html';

  const proverSource = { uri: PROVER_URL };

  return (
    <View style={styles.container}>
      <WebView
        ref={webviewRef}
        source={proverSource}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowFileAccess={true}
        allowFileAccessFromFileURLs={true}
        allowUniversalAccessFromFileURLs={true}
        originWhitelist={['*']}
        onLoad={() => {
          console.log('[ProverWebView] WebView loaded');
        }}
        injectedJavaScript={`
          // Override console to forward logs to React Native
          const originalConsole = { ...console };
          ['log', 'warn', 'error'].forEach(level => {
            console[level] = (...args) => {
              originalConsole[level](...args);
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'CONSOLE',
                level,
                message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
              }));
            };
          });
          console.log('[TLSN] Console forwarding enabled');
          true;
        `}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('[ProverWebView] WebView error:', nativeEvent);
          onError?.(nativeEvent.description);
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('[ProverWebView] HTTP error:', nativeEvent.statusCode);
        }}
      />
    </View>
  );
}

export const ProverWebView = forwardRef<ProverHandle, ProverWebViewProps>(ProverWebViewComponent);
ProverWebView.displayName = 'ProverWebView';

const styles = StyleSheet.create({
  container: {
    // Use small size instead of 0 for debugging (0 might prevent loading)
    width: 1,
    height: 1,
    opacity: 0,
    position: 'absolute',
    left: -10,
    top: -10,
  },
});
