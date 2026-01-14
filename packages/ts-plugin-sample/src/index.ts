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
 * Import types from the plugin SDK (type-only, stripped at compile time).
 *
 * The plugin API functions (div, button, openWindow, etc.) are declared globally
 * via the SDK type declarations.
 */
import type { Handler, DomJson } from '@tlsn/plugin-sdk';
import { config } from './config';
import { FloatingButton, PluginOverlay } from './components';

// =============================================================================
// HANDLER ENUMS (Inlined for standalone execution)
// =============================================================================
/**
 * These enum values are inlined instead of imported to create a standalone
 * JavaScript file with no external dependencies.
 */
enum HandlerType {
  SENT = 'SENT',
  RECV = 'RECV',
}

enum HandlerPart {
  START_LINE = 'START_LINE',
  PROTOCOL = 'PROTOCOL',
  METHOD = 'METHOD',
  REQUEST_TARGET = 'REQUEST_TARGET',
  STATUS_CODE = 'STATUS_CODE',
  HEADERS = 'HEADERS',
  BODY = 'BODY',
  ALL = 'ALL',
}

enum HandlerAction {
  REVEAL = 'REVEAL',
  PEDERSEN = 'PEDERSEN',
}

// =============================================================================
// PROOF GENERATION CALLBACK
// =============================================================================
/**
 * This function is triggered when the user clicks the "Prove" button.
 * It extracts authentication headers from intercepted requests and generates
 * a TLSNotary proof using the unified prove() API.
 */
async function onClick(): Promise<void> {
  const isRequestPending = useState<boolean>('isRequestPending', false);

  if (isRequestPending) return;

  setState('isRequestPending', true);

  // Step 1: Get the intercepted header from the X.com API request
  const [header] = useHeaders((headers) => {
    return headers.filter((header) =>
      header.url.includes('https://api.x.com/1.1/account/settings.json')
    );
  });

  if (!header) {
    setState('isRequestPending', false);
    return;
  }

  // Step 2: Extract authentication headers from the intercepted request
  const headers: Record<string, string | undefined> = {
    cookie: header.requestHeaders.find((h) => h.name === 'Cookie')?.value,
    'x-csrf-token': header.requestHeaders.find((h) => h.name === 'x-csrf-token')?.value,
    'x-client-transaction-id': header.requestHeaders.find(
      (h) => h.name === 'x-client-transaction-id'
    )?.value,
    Host: 'api.x.com',
    authorization: header.requestHeaders.find((h) => h.name === 'authorization')?.value,
    'Accept-Encoding': 'identity',
    Connection: 'close',
  };

  // Step 3: Generate TLS proof using the unified prove() API
  const resp = await prove(
    // Request options
    {
      url: 'https://api.x.com/1.1/account/settings.json',
      method: 'GET',
      headers: headers,
    },
    // Prover options
    {
      verifierUrl: 'http://localhost:7047',
      proxyUrl: 'ws://localhost:7047/proxy?token=api.x.com',
      maxRecvData: 4000,
      maxSentData: 2000,
      handlers: [
        // Reveal the request start line
        {
          type: HandlerType.SENT,
          part: HandlerPart.START_LINE,
          action: HandlerAction.REVEAL,
        } satisfies Handler,
        // Reveal the response start line
        {
          type: HandlerType.RECV,
          part: HandlerPart.START_LINE,
          action: HandlerAction.REVEAL,
        } satisfies Handler,
        // Reveal the 'date' header from the response
        {
          type: HandlerType.RECV,
          part: HandlerPart.HEADERS,
          action: HandlerAction.REVEAL,
          params: {
            key: 'date',
          },
        } satisfies Handler,
        // Reveal the 'screen_name' field from the JSON response body
        {
          type: HandlerType.RECV,
          part: HandlerPart.BODY,
          action: HandlerAction.REVEAL,
          params: {
            type: 'json' as const,
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
  // Subscribe to intercepted headers for the X.com API endpoint
  const [header] = useHeaders((headers) =>
    headers.filter((header) => header.url.includes('https://api.x.com/1.1/account/settings.json'))
  );

  const isMinimized = useState<boolean>('isMinimized', false);
  const isRequestPending = useState<boolean>('isRequestPending', false);

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
    isConnected: !!header,
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
