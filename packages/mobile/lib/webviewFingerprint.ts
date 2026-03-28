/**
 * WebView fingerprint hiding script.
 *
 * Google (and other OAuth providers) detect embedded WebViews by checking
 * for platform-specific JavaScript objects. This script hides those signals
 * so the WebView appears to be a regular desktop Chrome browser, matching
 * the desktop Chrome user-agent string we send in HTTP headers.
 *
 * Must run via `injectedJavaScriptBeforeContentLoaded` — before any page
 * scripts execute — so the fingerprint is hidden before detection runs.
 *
 * Signals hidden:
 * - window.webkit.messageHandlers (WKWebView native bridge, iOS)
 * - window.webkit.messageHandlers.ReactNativeWebView (RN-specific bridge)
 * - navigator.webdriver (automation flag, sometimes set in WebViews)
 * - Adds window.chrome stub (present in real Chrome, missing in WebView)
 */
export function buildFingerprintHidingScript(): string {
  return `(function() {
  // --- Hide WKWebView bridge objects (iOS) ---
  // Google checks for window.webkit.messageHandlers which only exists in WKWebView.
  // We preserve the bridge for our own postMessage calls but hide it from enumeration
  // and property checks that OAuth detection scripts use.
  if (typeof window.webkit !== 'undefined' && window.webkit.messageHandlers) {
    // Save a reference so our interception script can still use postMessage
    var __rnBridge = window.webkit.messageHandlers.ReactNativeWebView;

    // Create a proxy that hides messageHandlers from detection
    var originalWebkit = window.webkit;
    try {
      Object.defineProperty(window, 'webkit', {
        get: function() {
          // Return an object that looks empty but still has our bridge accessible
          // via the saved reference
          var fake = {};
          Object.defineProperty(fake, 'messageHandlers', {
            enumerable: false,
            configurable: true,
            get: function() { return undefined; }
          });
          return fake;
        },
        set: function() {},
        configurable: true
      });
    } catch(e) {}

    // Expose the bridge via a non-obvious global so our postMessage code still works
    window.__tlsnBridge = __rnBridge;
  }

  // --- Stub window.chrome (present in real desktop Chrome) ---
  // Our user-agent claims to be Chrome, but WebViews lack the chrome object.
  // Google's detection may check for its presence.
  if (typeof window.chrome === 'undefined') {
    window.chrome = {
      runtime: {
        // Empty stubs — just enough to pass existence checks
        id: undefined,
        connect: function() {},
        sendMessage: function() {},
        onMessage: { addListener: function() {} }
      },
      app: {
        isInstalled: false,
        getDetails: function() { return null; },
        installState: function() { return 'not_installed'; }
      },
      csi: function() { return {}; },
      loadTimes: function() { return {}; }
    };
  }

  // --- Hide navigator.webdriver ---
  // Some WebView implementations set this to true. Real browsers have it false/undefined.
  try {
    Object.defineProperty(navigator, 'webdriver', {
      get: function() { return false; },
      configurable: true
    });
  } catch(e) {}

  // --- Hide ReactNativeWebView from window ---
  // Some detection scripts scan window properties for known bridge names.
  if (typeof window.ReactNativeWebView !== 'undefined') {
    try {
      Object.defineProperty(window, 'ReactNativeWebView', {
        enumerable: false,
        configurable: true
      });
    } catch(e) {}
  }
})();`;
}
