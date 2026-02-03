import React from 'react';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

// Injected BEFORE page content loads - critical for interception
const INJECTED_JS_BEFORE_CONTENT = `
(function() {
  const TARGET_HOST = 'api.spotify.com';

  function sendAuthToken(token) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'AUTH_TOKEN',
      token: token
    }));
  }

  function extractAuthFromHeaders(headers, url) {
    if (!url || !url.includes(TARGET_HOST)) return;

    // Handle Headers object
    if (headers instanceof Headers) {
      const auth = headers.get('Authorization') || headers.get('authorization');
      if (auth) sendAuthToken(auth);
      return;
    }

    // Handle plain object
    if (headers && typeof headers === 'object') {
      const auth = headers['Authorization'] || headers['authorization'];
      if (auth) sendAuthToken(auth);
    }
  }

  // ============ FETCH INTERCEPTION ============
  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    let url = '';
    let headers = null;

    // Handle Request object
    if (input instanceof Request) {
      url = input.url;
      headers = input.headers;
    } else {
      url = String(input);
      headers = init?.headers;
    }

    extractAuthFromHeaders(headers, url);
    return originalFetch.apply(this, arguments);
  };

  // ============ XMLHTTPREQUEST INTERCEPTION ============
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function(method, url) {
    this._tlsn_url = String(url);
    return originalXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    if (this._tlsn_url?.includes(TARGET_HOST)) {
      if (name.toLowerCase() === 'authorization') {
        sendAuthToken(value);
      }
    }
    return originalXHRSetHeader.apply(this, arguments);
  };

  // Signal that interception is ready
  console.log('[TLSN] Header interception installed');
  true;
})();
`;

interface SpotifyWebViewProps {
  onAuthToken: (token: string) => void;
}

export function SpotifyWebView({ onAuthToken }: SpotifyWebViewProps) {
  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'AUTH_TOKEN' && data.token) {
        console.log('[TLSN] Auth token captured');
        onAuthToken(data.token);
      }
    } catch (e) {
      console.error('[TLSN] Failed to parse WebView message:', e);
    }
  };

  return (
    <WebView
      source={{ uri: 'https://developer.spotify.com/' }}
      injectedJavaScriptBeforeContentLoaded={INJECTED_JS_BEFORE_CONTENT}
      onMessage={handleMessage}
      sharedCookiesEnabled={true}
      thirdPartyCookiesEnabled={true}
      javaScriptEnabled={true}
      domStorageEnabled={true}
      startInLoadingState={true}
      style={{ flex: 1 }}
    />
  );
}
