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
// The member-stats endpoint returns a member's ratings as a small JSON object.
// The username in the path controls *whose* stats come back, so the path alone
// can't prove ownership. But chess.com stamps the *authenticated* user into the
// `x-chesscom-meta: username=…` response header — derived from the session
// cookie, not the URL (requesting another member's stats still returns YOUR
// username there). Revealing that header alongside the request target binds the
// proof: when the header username matches the path username, it attests "I am
// this user, and this is my rating". The request must therefore be authenticated
// (the cookie denylist keeps the session cookie; it only drops analytics). We
// auto-detect the username from a /callback/member/stats/ request the profile
// page fires (the page appends a trailing path segment we strip off) rather
// than letting the user type one.
const statsPrefix = '/callback/member/stats/';

const config: PluginConfig = {
  name: 'Chess.com Rating',
  description: 'Prove your current Chess.com rating.',
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

// chess.com's cookie jar is dominated by third-party analytics / ad-tech /
// consent cookies (ATTRIBUTION_V1 ~680 B, Optanon* ~460 B, eupubconsent ~320 B,
// Confiant cw-test-*, Google _ga*/_gcl, …) that the stats API and Cloudflare
// both ignore. Dropping them by name prefix shrinks the proven request by ~2 KB
// while leaving the session cookie, `cf_clearance`, and anything unrecognised
// untouched — so the WAF still sees a browser-like, clearance-bearing request.
const DROP_COOKIE_PREFIXES = [
  'ATTRIBUTION_V1',
  'Optanon', // OneTrust consent banner
  'eupubconsent', // IAB TCF consent
  'cw-test-', // Confiant ad-tech A/B buckets
  'BUCKETING_ID', // ad bucketing
  '__eoi',
  '__gads',
  '__gpi', // Google ad
  '_ga',
  '_gid',
  '_gcl', // Google Analytics
];

const trimCookieHeader = (cookie: string): string =>
  cookie
    .split('; ')
    .filter((pair) => {
      const name = pair.slice(0, pair.indexOf('='));
      return !DROP_COOKIE_PREFIXES.some((prefix) => name.startsWith(prefix));
    })
    .join('; ');

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

  // Replay the browser's header set so the request stays browser-like and keeps
  // the Cloudflare `cf_clearance` token — chess.com's WAF 403s requests that
  // don't look like they came from the page. We only override the few headers
  // the TLSN prover controls, then strip the analytics cookies that bloat the
  // cookie jar but mean nothing to the stats API or the WAF (see
  // DROP_COOKIE_PREFIXES).
  const headers: Record<string, string> = {
    ...cachedHeaders,
    Host: api,
    'Accept-Encoding': 'identity',
    Connection: 'close',
  };

  const cookieKey = 'Cookie' in headers ? 'Cookie' : 'cookie';
  if (headers[cookieKey]) headers[cookieKey] = trimCookieHeader(headers[cookieKey]);

  const resp = await prove(
    {
      url: `https://${api}${statsPrefix}${username}`,
      method: 'GET',
      headers,
    },
    {
      verifierUrl: __VERIFIER_URL__,
      proxyUrl: __PROXY_URL__ + api,
      // Sized against the real transcript: the response is ~2 KB (status line +
      // Cloudflare headers + the ~750 B uncompressed JSON body), and the request
      // is ~2–3 KB, dominated by the replayed cookie jar (session + cf_clearance).
      // The cookie jar is the most variable part — it rotates and grows on
      // re-login — so sent keeps more headroom than recv.
      maxRecvData: 4000,
      maxSentData: 4000,
      handlers: [
        // Request target — reveals the path username whose rating we prove.
        { type: 'SENT', part: 'START_LINE', action: 'REVEAL' } satisfies Handler,
        { type: 'RECV', part: 'START_LINE', action: 'REVEAL' } satisfies Handler,
        {
          type: 'RECV',
          part: 'HEADERS',
          action: 'REVEAL',
          params: { key: 'date' },
        } satisfies Handler,
        // Ownership binding: chess.com sets this header from the session cookie
        // (not the URL), so revealing it lets a verifier confirm it matches the
        // path username — proving the rating is the session owner's own, not
        // just some public profile's.
        {
          type: 'RECV',
          part: 'HEADERS',
          action: 'REVEAL',
          params: { key: 'x-chesscom-meta' },
        } satisfies Handler,
        // Reveal only the current rating from the response body. The body is a
        // `stats` array of {key, stats:{rating}} entries; `stats.0.stats.rating`
        // walks to the first entry's rating value and reveals just that
        // `"rating":<n>` key-value pair — the rest of the body stays redacted.
        {
          type: 'RECV',
          part: 'BODY',
          action: 'REVEAL',
          params: { type: 'json', path: 'stats.0.stats.rating' },
        } satisfies Handler,
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

  // Capture the headers to replay: the cookie jar (Cloudflare `cf_clearance`
  // plus the session cookie that authenticates the request — which is what fills
  // the x-chesscom-meta ownership header) and the browser-like headers that
  // satisfy the WAF. The interception model differs by platform, so we match the
  // chess.com host rather than a /callback/ path:
  //   • Extension: webRequest exposes the full header set — including the
  //     complete cookie jar — on every request, so any /callback/ XHR has it all.
  //   • Mobile: JS can't read HttpOnly cookies, so the session + cf_clearance
  //     arrive only via the native cookie reader, which emits them against the
  //     host root (https://www.chess.com) — no /callback/ path, Cookie only.
  // Take the richest header set (prefer a /callback/ request) but override its
  // Cookie with the longest jar seen across all requests — on mobile that's the
  // native HttpOnly-complete one; on the extension every request already has it.
  // Headers the TLSN prover controls are skipped (re-added in onClick).
  if (!cachedHeaders) {
    const reqs = useHeaders((h: InterceptedRequestHeader[]) =>
      h.filter((x) => x.url.startsWith(`https://${api}`)),
    );
    const headerSrc =
      reqs.filter((x) => x.url.includes('/callback/')).pop() ?? reqs[reqs.length - 1];
    let cookie = '';
    for (const x of reqs) {
      for (const r of x.requestHeaders) {
        if (r.name.toLowerCase() === 'cookie' && r.value && r.value.length > cookie.length) {
          cookie = r.value;
        }
      }
    }
    if (headerSrc && cookie) {
      const skip = new Set([
        'accept-encoding',
        'content-length',
        'connection',
        'host',
        'cookie',
        'if-none-match',
        'if-modified-since',
      ]);
      const captured: Record<string, string> = { Cookie: cookie };
      for (const { name, value } of headerSrc.requestHeaders) {
        if (value !== undefined && !skip.has(name.toLowerCase())) {
          captured[name] = value;
        }
      }
      setState('apiHeaders', captured);
    }
  }

  // Detect the username from the /callback/member/stats/{username} request the
  // profile page fires (it also appends a trailing path segment, which the
  // split below strips). Anchoring on the exact endpoint we prove keeps the
  // proven username tied to the visited profile rather than an arbitrary one.
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
