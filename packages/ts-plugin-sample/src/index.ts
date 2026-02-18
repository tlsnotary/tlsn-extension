/**
 * X Profile Prover - TypeScript Plugin Sample
 *
 * This is a TypeScript implementation of the X.com profile prover plugin.
 * It demonstrates how to write type-safe TLSN plugins using TypeScript.
 */

// =============================================================================
// IMPORTS
// =============================================================================
/**
 * Import types and enums from the plugin SDK.
 *
 * The plugin API functions (div, button, openWindow, etc.) are declared globally
 * via the SDK type declarations.
 */
import type { Handler, DomJson } from '@tlsn/plugin-sdk';
import { config } from './config';
import { FloatingButton, PluginOverlay } from './components';

// Injected at build time via esbuild --define
declare const __VERIFIER_URL__: string;
declare const __PROXY_URL__: string;

// =============================================================================
// PROOF GENERATION CALLBACK
// =============================================================================
/**
 * This function is triggered when the user clicks the "Prove" button.
 * It reads cached authentication headers from state and generates
 * a TLSNotary proof using the unified prove() API.
 */
async function onClick(): Promise<void> {
  const isRequestPending = useState<boolean>('isRequestPending', false);

  if (isRequestPending) return;

  setState('isRequestPending', true);

  // Step 1: Read cached authentication headers from state
  const cachedCookie = useState<string | null>('cookie', null);
  const cachedCsrfToken = useState<string | null>('x-csrf-token', null);
  const cachedTransactionId = useState<string | null>('x-client-transaction-id', null);
  const cachedAuthorization = useState<string | null>('authorization', null);

  if (!cachedCookie || !cachedCsrfToken || !cachedAuthorization) {
    setState('isRequestPending', false);
    return;
  }

  // Step 2: Build request headers from cached values
  const headers: Record<string, string> = {
    cookie: cachedCookie,
    'x-csrf-token': cachedCsrfToken,
    ...(cachedTransactionId ? { 'x-client-transaction-id': cachedTransactionId } : {}),
    Host: 'api.x.com',
    authorization: cachedAuthorization,
    'Accept-Encoding': 'identity',
    Connection: 'close',
  };

  // Step 3: Generate TLS proof using the unified prove() API
  const requestUrl = 'https://api.x.com/1.1/account/settings.json';
  const requestHost = new URL(requestUrl).host;

  const resp = await prove(
    // Request options
    {
      url: requestUrl,
      method: 'GET',
      headers: headers,
    },
    // Prover options
    {
      verifierUrl: __VERIFIER_URL__,
      proxyUrl: `${__PROXY_URL__}?token=${requestHost}`,
      maxRecvData: 4000,
      maxSentData: 2000,
      handlers: [
        // Reveal the request start line
        {
          type: 'SENT',
          part: 'START_LINE',
          action: 'REVEAL',
        } satisfies Handler,
        // Reveal the response start line
        {
          type: 'RECV',
          part: 'START_LINE',
          action: 'REVEAL',
        } satisfies Handler,
        // Reveal the 'date' header from the response
        {
          type: 'RECV',
          part: 'HEADERS',
          action: 'REVEAL',
          params: {
            key: 'date',
          },
        } satisfies Handler,
        // Reveal the 'screen_name' field from the JSON response body
        {
          type: 'RECV',
          part: 'BODY',
          action: 'REVEAL',
          params: {
            type: 'json',
            path: 'screen_name',
          },
        } satisfies Handler,
      ],
    }
  );

  // Step 4: Complete plugin execution and return the proof result
  done(JSON.stringify(resp));
}

/**
 * Expand the minimized UI to show full plugin interface
 */
function expandUI(): void {
  setState('isMinimized', false);
}

/**
 * Minimize the UI to a floating action button
 */
function minimizeUI(): void {
  setState('isMinimized', true);
}

// =============================================================================
// MAIN UI FUNCTION
// =============================================================================
/**
 * The main() function is called reactively whenever plugin state changes.
 * It returns a DOM structure that is rendered as the plugin UI.
 */
function main(): DomJson {
  const isMinimized = useState<boolean>('isMinimized', false);
  const isRequestPending = useState<boolean>('isRequestPending', false);

  // Read cached header values from state
  const cachedCookie = useState<string | null>('cookie', null);
  const cachedCsrfToken = useState<string | null>('x-csrf-token', null);
  const cachedTransactionId = useState<string | null>('x-client-transaction-id', null);
  const cachedAuthorization = useState<string | null>('authorization', null);

  // Only search for headers if not already cached
  if (!cachedCookie || !cachedCsrfToken || !cachedAuthorization) {
    const [header] = useHeaders((headers) =>
      headers.filter((h) => h.url.includes('https://api.x.com/1.1/account/settings.json'))
    );

    if (header) {
      const cookie = header.requestHeaders.find((h) => h.name === 'Cookie')?.value;
      const csrfToken = header.requestHeaders.find((h) => h.name === 'x-csrf-token')?.value;
      const transactionId = header.requestHeaders.find((h) => h.name === 'x-client-transaction-id')?.value;
      const authorization = header.requestHeaders.find((h) => h.name === 'authorization')?.value;

      if (cookie && !cachedCookie) setState('cookie', cookie);
      if (csrfToken && !cachedCsrfToken) setState('x-csrf-token', csrfToken);
      if (transactionId && !cachedTransactionId) setState('x-client-transaction-id', transactionId);
      if (authorization && !cachedAuthorization) setState('authorization', authorization);
    }
  }

  // Connection requires all essential headers to be cached
  const isConnected = !!(cachedCookie && cachedCsrfToken && cachedAuthorization);

  // Run once on plugin load: Open X.com in a new window
  useEffect(() => {
    openWindow('https://x.com');
  }, []);

  // If minimized, show floating action button
  if (isMinimized) {
    return FloatingButton({ onClick: 'expandUI' });
  }

  // Render the plugin UI overlay
  return PluginOverlay({
    title: 'X Profile Prover',
    isConnected,
    isPending: isRequestPending,
    onMinimize: 'minimizeUI',
    onProve: 'onClick',
  });
}

// =============================================================================
// PLUGIN EXPORTS
// =============================================================================
/**
 * All plugins must export an object with these properties:
 * - main: The reactive UI rendering function
 * - onClick: Click handler callback for buttons
 * - config: Plugin metadata
 *
 * Additional exported functions (expandUI, minimizeUI) are also available
 * as click handlers referenced by the 'onclick' property in DOM elements.
 */
export default {
  main,
  onClick,
  expandUI,
  minimizeUI,
  config,
};
