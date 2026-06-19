import type {
  PluginConfig,
  RequestPermission,
  Handler,
  DomJson,
  InterceptedRequestHeader,
} from '@tlsn/plugin-sdk';

// Injected at build time via esbuild --define
declare const __VERIFIER_URL__: string;
declare const __PROXY_URL__: string;

// =============================================================================
// PLUGIN CONFIGURATION
// =============================================================================

const api = 'www.chess.com';
// The stats overview endpoint takes a username in the path and returns that
// member's ratings as a small JSON array. It is auth-gated (a valid session
// cookie is required) but the URL controls *whose* stats come back — so the
// only thing that ties the proof to the prover is that we auto-detect the
// logged-in user's OWN username from a self-referential request the home page
// fires; we never let the user type an arbitrary one.
const statsPrefix = '/callback/stats/overview/';

const config: PluginConfig = {
  name: 'Chess.com Rating',
  description: 'Prove your Chess.com ratings.',
  requests: [
    {
      method: 'GET',
      host: api,
      pathname: `${statsPrefix}*`,
      verifierUrl: __VERIFIER_URL__,
    } satisfies RequestPermission,
  ],
  urls: ['https://www.chess.com/*'],
};

// =============================================================================
// PROOF GENERATION CALLBACK
// =============================================================================

const onClick = async (): Promise<void> => {
  const isRequestPending = useState<boolean>('isRequestPending', false);

  if (isRequestPending) return;

  setState('isRequestPending', true);

  const cachedHeaders = useState<Record<string, string> | null>('apiHeaders', null);
  const username = useState<string | null>('username', null);

  if (!cachedHeaders || !username) {
    setState('isRequestPending', false);
    return;
  }

  // Replay the exact header set the browser sent to www.chess.com (user-agent,
  // accept, the full cookie jar including the Cloudflare `cf_clearance` token, …).
  // Chess.com sits behind Cloudflare, so cherry-picking just the Cookie gets a
  // 403 from the WAF. We only override the few headers the TLSN prover controls.
  const headers: Record<string, string> = {
    ...cachedHeaders,
    Host: api,
    'Accept-Encoding': 'identity',
    Connection: 'close',
  };

  const resp = await prove(
    {
      url: `https://${api}${statsPrefix}${username}`,
      method: 'GET',
      headers,
    },
    {
      verifierUrl: __VERIFIER_URL__,
      proxyUrl: __PROXY_URL__ + api,
      maxRecvData: 8192,
      maxSentData: 16384,
      handlers: [
        // Reveals the request target — including the proven username.
        { type: 'SENT', part: 'START_LINE', action: 'REVEAL' } satisfies Handler,
        { type: 'RECV', part: 'START_LINE', action: 'REVEAL' } satisfies Handler,
        {
          type: 'RECV',
          part: 'HEADERS',
          action: 'REVEAL',
          params: { key: 'date' },
        } satisfies Handler,
        // The authenticated response is tiny (~700 B) and the ratings are nested
        // four levels deep (game_ratings.game_live_rapid.last_rating). Rather
        // than rely on deep JSON-path support, reveal the whole body — it proves
        // every rating (rapid / blitz / bullet / daily / tactics) at once.
        { type: 'RECV', part: 'BODY', action: 'REVEAL' } satisfies Handler,
      ],
    },
  );

  done(JSON.stringify(resp));
};

const expandUI = (): void => {
  setState('isMinimized', false);
};

const minimizeUI = (): void => {
  setState('isMinimized', true);
};

// =============================================================================
// MAIN UI FUNCTION
// =============================================================================

const proveProgressBar = (): DomJson[] => {
  const progress = useState<{
    step: string;
    progress: number;
    message: string;
  } | null>('_proveProgress', null);

  if (!progress) return [];

  const pct = `${Math.round(progress.progress * 100)}%`;

  return [
    div({ style: { marginTop: '12px' } }, [
      div(
        {
          style: {
            height: '6px',
            backgroundColor: '#e5e7eb',
            borderRadius: '3px',
            overflow: 'hidden',
          },
        },
        [
          div(
            {
              style: {
                height: '100%',
                width: pct,
                background: 'linear-gradient(90deg, #81b64c, #6a9b3f)',
                borderRadius: '3px',
                transition: 'width 0.4s ease',
              },
            },
            [],
          ),
        ],
      ),
      div(
        {
          style: {
            fontSize: '12px',
            color: '#6b7280',
            marginTop: '6px',
            textAlign: 'center',
          },
        },
        [progress.message],
      ),
    ]),
  ];
};

const main = (): DomJson => {
  const isMinimized = useState<boolean>('isMinimized', false);
  const isRequestPending = useState<boolean>('isRequestPending', false);
  const cachedHeaders = useState<Record<string, string> | null>('apiHeaders', null);
  const username = useState<string | null>('username', null);

  // Capture the full header set from a real /callback/ XHR and replay it
  // verbatim — the cookie jar (including Cloudflare's `cf_clearance`) plus the
  // `accept: application/json` + `sec-fetch-mode: cors` headers that make
  // chess.com return JSON. A broad "any request" filter would grab a document
  // or image load whose `accept: text/html` makes the endpoint serve the HTML
  // app shell instead. Headers the TLSN prover controls are skipped (re-added
  // in onClick).
  if (!cachedHeaders) {
    const requests = useHeaders((h: InterceptedRequestHeader[]) =>
      h.filter((x) => x.url.startsWith(`https://${api}/callback/`)),
    );
    if (requests.length > 0) {
      const skip = new Set([
        'accept-encoding',
        'content-length',
        'connection',
        'host',
        'if-none-match',
        'if-modified-since',
      ]);
      const captured: Record<string, string> = {};
      for (const { name, value } of requests[requests.length - 1].requestHeaders) {
        if (value !== undefined && !skip.has(name.toLowerCase())) {
          captured[name] = value;
        }
      }
      if (captured.Cookie || captured.cookie) setState('apiHeaders', captured);
    }
  }

  // Detect the logged-in user's OWN username from the self-referential
  // /callback/stats/overview/{username} request that the home page fires for
  // the current user. Anchoring on the exact endpoint we prove means the
  // username can only be the session owner's — not an arbitrary one.
  if (!username) {
    const statsRequests = useHeaders((h: InterceptedRequestHeader[]) =>
      h.filter((x) => x.url.startsWith(`https://${api}${statsPrefix}`)),
    );
    if (statsRequests.length > 0) {
      const url = statsRequests[statsRequests.length - 1].url;
      const detected = url.slice(`https://${api}${statsPrefix}`.length).split(/[?#/]/)[0];
      if (detected) setState('username', detected);
    }
  }

  const isConnected = !!(cachedHeaders && username);

  useEffect(() => {
    openWindow('https://www.chess.com/home');
  }, []);

  if (isMinimized) {
    return div(
      {
        style: {
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          backgroundColor: '#81b64c',
          boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
          zIndex: '999999',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          fontSize: '24px',
          color: 'white',
        },
        onclick: 'expandUI',
      },
      ['♟️'],
    );
  }

  // Three states: no session → log in; session but no username yet → nudge the
  // user to open their profile; both → ready to prove.
  const hasSession = !!cachedHeaders;

  return div(
    {
      style: {
        position: 'fixed',
        bottom: '0',
        right: '8px',
        width: '280px',
        borderRadius: '8px 8px 0 0',
        backgroundColor: 'white',
        boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
        zIndex: '999999',
        fontSize: '14px',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        overflow: 'hidden',
      },
    },
    [
      div(
        {
          style: {
            background: 'linear-gradient(135deg, #81b64c 0%, #6a9b3f 100%)',
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: 'white',
          },
        },
        [
          div({ style: { fontWeight: '600', fontSize: '16px' } }, ['Chess.com Rating']),
          button(
            {
              style: {
                background: 'transparent',
                border: 'none',
                color: 'white',
                fontSize: '20px',
                cursor: 'pointer',
                padding: '0',
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              },
              onclick: 'minimizeUI',
            },
            ['−'],
          ),
        ],
      ),
      div({ style: { padding: '20px', backgroundColor: '#f8f9fa' } }, [
        div(
          {
            style: {
              marginBottom: '16px',
              padding: '12px',
              borderRadius: '6px',
              backgroundColor: isConnected ? '#d4edda' : '#f8d7da',
              color: isConnected ? '#155724' : '#721c24',
              border: `1px solid ${isConnected ? '#c3e6cb' : '#f5c6cb'}`,
              fontWeight: '500',
            },
          },
          [
            isConnected
              ? `✓ Detected account: ${username}`
              : hasSession
                ? '⚠ Session detected — open your profile'
                : '⚠ No session detected',
          ],
        ),
        isConnected
          ? button(
              {
                style: {
                  width: '100%',
                  padding: '12px 24px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #81b64c 0%, #6a9b3f 100%)',
                  color: 'white',
                  fontWeight: '600',
                  fontSize: '15px',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  opacity: isRequestPending ? '0.5' : '1',
                  cursor: isRequestPending ? 'not-allowed' : 'pointer',
                },
                onclick: 'onClick',
              },
              [isRequestPending ? 'Generating Proof...' : 'Generate Proof'],
            )
          : div(
              {
                style: {
                  textAlign: 'center',
                  color: '#666',
                  padding: '12px',
                  backgroundColor: '#fff3cd',
                  borderRadius: '6px',
                  border: '1px solid #ffeaa7',
                },
              },
              [
                hasSession
                  ? 'Open your Chess.com profile so we can detect your username'
                  : 'Please login to Chess.com to continue',
              ],
            ),
        ...proveProgressBar(),
      ]),
    ],
  );
};

// =============================================================================
// PLUGIN EXPORTS
// =============================================================================

export default {
  main,
  onClick,
  expandUI,
  minimizeUI,
  config,
};
