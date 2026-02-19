import React, { useCallback, useMemo, useRef } from 'react';
import { WebView, WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import CookieManager from '@react-native-cookies/cookies';

// Desktop user-agent prevents iOS from triggering universal links
// (which would redirect x.com, spotify.com etc. to their native apps).
const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Intercepted request header matching plugin-sdk's InterceptedRequestHeader type.
 */
export interface InterceptedRequestHeader {
  id: string;
  method: string;
  url: string;
  timestamp: number;
  type: string;
  requestHeaders: { name: string; value?: string }[];
  tabId: number;
}

interface PluginWebViewProps {
  /** URL to load in the WebView */
  url: string;
  /** Target hosts to intercept requests for (e.g., ['api.spotify.com', 'api.x.com']) */
  targetHosts: string[];
  /** Called when an intercepted request header is captured */
  onHeaderIntercepted: (header: InterceptedRequestHeader) => void;
  /** Optional style */
  style?: object;
}

let headerIdCounter = 0;

function urlMatchesHosts(url: string, hosts: string[]): boolean {
  for (const host of hosts) {
    if (url.includes(host)) return true;
  }
  return false;
}

/**
 * Read cookies from the native cookie store for the given URL.
 * This captures HttpOnly cookies that document.cookie cannot see.
 */
async function readNativeCookies(
  pageUrl: string,
  targetHosts: string[],
  onHeaderIntercepted: (header: InterceptedRequestHeader) => void,
): Promise<void> {
  try {
    // Build full URLs to check for each target host
    const urlsToCheck = new Set<string>();

    // Always check the page URL itself
    urlsToCheck.add(pageUrl);

    // Also check https:// URLs for each target host
    for (const host of targetHosts) {
      urlsToCheck.add(`https://${host}`);
    }

    for (const checkUrl of urlsToCheck) {
      if (!urlMatchesHosts(checkUrl, targetHosts)) continue;

      const cookies = await CookieManager.get(checkUrl);
      const cookiePairs: string[] = [];
      for (const [name, cookie] of Object.entries(cookies)) {
        if (cookie.value) {
          cookiePairs.push(`${name}=${cookie.value}`);
        }
      }

      if (cookiePairs.length > 0) {
        const cookieString = cookiePairs.join('; ');
        console.log('[PluginWebView] Native cookies found for', checkUrl, ':', cookiePairs.length, 'cookies');
        const header: InterceptedRequestHeader = {
          id: `header-${++headerIdCounter}`,
          method: 'GET',
          url: checkUrl,
          timestamp: Date.now(),
          type: 'cookie',
          requestHeaders: [{ name: 'Cookie', value: cookieString }],
          tabId: 0,
        };
        onHeaderIntercepted(header);
      }
    }
  } catch (e) {
    console.error('[PluginWebView] Failed to read native cookies:', e);
  }
}

/**
 * Generic WebView with fetch/XHR header interception and native cookie reading.
 *
 * Captures headers via:
 * 1. JS interception of fetch() and XMLHttpRequest (for explicit headers)
 * 2. document.cookie polling (for non-HttpOnly cookies)
 * 3. Native CookieManager (for HttpOnly cookies, on navigation)
 */
export function PluginWebView({
  url,
  targetHosts,
  onHeaderIntercepted,
  style,
}: PluginWebViewProps) {
  const webViewRef = useRef<WebView>(null);
  const lastNativeCookie = useRef<string>('');

  // Build the interception script with the target hosts baked in
  const injectedJS = useMemo(
    () => buildInterceptionScript(targetHosts),
    [targetHosts],
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);

        if (data.type === 'DEBUG') {
          console.log('[PluginWebView:DEBUG]', data.message);
          return;
        }

        if (data.type === 'HEADER_INTERCEPTED') {
          console.log('[PluginWebView] Header intercepted:', data.method, data.url);
          const header: InterceptedRequestHeader = {
            id: `header-${++headerIdCounter}`,
            method: data.method || 'GET',
            url: data.url,
            timestamp: data.timestamp || Date.now(),
            type: 'xmlhttprequest',
            requestHeaders: data.headers || [],
            tabId: 0,
          };
          onHeaderIntercepted(header);
        }
      } catch (e) {
        console.error('[PluginWebView] Failed to parse WebView message:', e);
      }
    },
    [onHeaderIntercepted],
  );

  // Read native cookies when page finishes loading (catches HttpOnly cookies)
  const handleNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      if (!navState.loading && navState.url) {
        // Delay slightly to ensure cookies from the response are stored
        setTimeout(() => {
          readNativeCookies(navState.url, targetHosts, (header) => {
            // Deduplicate: only emit if cookies changed
            const cookieValue = header.requestHeaders[0]?.value || '';
            if (cookieValue && cookieValue !== lastNativeCookie.current) {
              lastNativeCookie.current = cookieValue;
              onHeaderIntercepted(header);
            }
          });
        }, 500);
      }
    },
    [targetHosts, onHeaderIntercepted],
  );

  // Keep all http(s) navigations inside the WebView; block custom schemes.
  const handleShouldStartLoad = useCallback((request: ShouldStartLoadRequest) => {
    return request.url.startsWith('http://') || request.url.startsWith('https://');
  }, []);

  return (
    <WebView
      ref={webViewRef}
      source={{ uri: url }}
      userAgent={DESKTOP_USER_AGENT}
      injectedJavaScriptBeforeContentLoaded={injectedJS}
      onMessage={handleMessage}
      onNavigationStateChange={handleNavigationStateChange}
      onShouldStartLoadWithRequest={handleShouldStartLoad}
      sharedCookiesEnabled={true}
      thirdPartyCookiesEnabled={true}
      javaScriptEnabled={true}
      domStorageEnabled={true}
      startInLoadingState={true}
      allowsBackForwardNavigationGestures={true}
      setSupportMultipleWindows={false}
      style={style ?? { flex: 1 }}
    />
  );
}

/**
 * Build the JavaScript interception script for the given target hosts.
 * Intercepts fetch(), XMLHttpRequest, and polls document.cookie
 * to capture full request headers including non-HttpOnly cookies.
 */
function buildInterceptionScript(targetHosts: string[]): string {
  const hostsJson = JSON.stringify(targetHosts);

  return `
(function() {
  var TARGET_HOSTS = ${hostsJson};

  function matchesTarget(url) {
    if (!url) return false;
    for (var i = 0; i < TARGET_HOSTS.length; i++) {
      if (url.indexOf(TARGET_HOSTS[i]) !== -1) return true;
    }
    return false;
  }

  function pageHostMatchesTarget() {
    var hostname = window.location.hostname;
    for (var i = 0; i < TARGET_HOSTS.length; i++) {
      var target = TARGET_HOSTS[i];
      if (hostname === target) return true;
      // page is subdomain of target (e.g. hostname=foo.x.com, target=x.com)
      if (hostname.indexOf('.' + target) !== -1) return true;
      // target is subdomain of page (e.g. hostname=x.com, target=api.x.com)
      if (target.indexOf('.' + hostname) !== -1) return true;
    }
    return false;
  }

  function sendHeaders(method, url, headers) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'HEADER_INTERCEPTED',
        method: method,
        url: url,
        timestamp: Date.now(),
        headers: headers
      }));
    } catch(e) {}
  }

  function debugLog(msg) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'DEBUG',
        message: msg
      }));
    } catch(e) {}
  }

  function headersToArray(headers) {
    var result = [];
    if (headers instanceof Headers) {
      headers.forEach(function(value, name) {
        result.push({ name: name, value: value });
      });
    } else if (headers && typeof headers === 'object') {
      var keys = Object.keys(headers);
      for (var i = 0; i < keys.length; i++) {
        result.push({ name: keys[i], value: String(headers[keys[i]]) });
      }
    }
    return result;
  }

  // Include document.cookie as a Cookie header for same-origin requests
  function appendCookieHeader(headers, url) {
    try {
      var hasCookie = false;
      for (var i = 0; i < headers.length; i++) {
        if (headers[i].name === 'Cookie' || headers[i].name === 'cookie') {
          hasCookie = true;
          break;
        }
      }
      if (!hasCookie && document.cookie && pageHostMatchesTarget()) {
        headers.push({ name: 'Cookie', value: document.cookie });
      }
    } catch(e) {}
    return headers;
  }

  // ============ FETCH INTERCEPTION ============
  var originalFetch = window.fetch;
  window.fetch = function(input, init) {
    var url = '';
    var method = 'GET';
    var headers = [];

    if (input instanceof Request) {
      url = input.url;
      method = input.method || 'GET';
      headers = headersToArray(input.headers);
      if (init && init.headers) {
        headers = headers.concat(headersToArray(init.headers));
      }
    } else {
      url = String(input);
      method = (init && init.method) || 'GET';
      if (init && init.headers) {
        headers = headersToArray(init.headers);
      }
    }

    debugLog('[fetch] ' + method + ' ' + url + ' matched=' + matchesTarget(url));
    if (matchesTarget(url)) {
      sendHeaders(method, url, appendCookieHeader(headers, url));
    }
    return originalFetch.apply(this, arguments);
  };

  // ============ XMLHTTPREQUEST INTERCEPTION ============
  var originalXHROpen = XMLHttpRequest.prototype.open;
  var originalXHRSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  var originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this._tlsn_url = String(url);
    this._tlsn_method = method;
    this._tlsn_headers = [];
    return originalXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    if (this._tlsn_headers) {
      this._tlsn_headers.push({ name: name, value: value });
    }
    return originalXHRSetHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function() {
    debugLog('[xhr] ' + (this._tlsn_method || 'GET') + ' ' + this._tlsn_url + ' matched=' + matchesTarget(this._tlsn_url));
    if (this._tlsn_url && matchesTarget(this._tlsn_url)) {
      sendHeaders(this._tlsn_method || 'GET', this._tlsn_url, appendCookieHeader(this._tlsn_headers || [], this._tlsn_url));
    }
    return originalXHRSend.apply(this, arguments);
  };

  // ============ COOKIE POLLING ============
  // For non-HttpOnly cookies on traditional server-rendered apps.
  var lastCookie = '';
  setInterval(function() {
    try {
      if (!pageHostMatchesTarget()) return;
      var currentCookie = document.cookie;
      if (currentCookie && currentCookie !== lastCookie) {
        lastCookie = currentCookie;
        debugLog('[cookie-poll] cookie changed on ' + window.location.hostname);
        sendHeaders('GET', window.location.href, [
          { name: 'Cookie', value: currentCookie }
        ]);
      }
    } catch(e) {}
  }, 1500);

  console.log('[TLSN] Header interception installed for: ' + TARGET_HOSTS.join(', '));
  true;
})();
`;
}
