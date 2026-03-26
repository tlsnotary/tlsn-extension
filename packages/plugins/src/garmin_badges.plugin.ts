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

const api = 'connect.garmin.com';
const badgePath = '/gc-api/badge-service/badge/earned';

const config: PluginConfig = {
  name: 'Garmin Badges',
  description: 'Prove your earned Garmin Connect badges.',
  requests: [
    {
      method: 'GET',
      host: api,
      pathname: badgePath,
      verifierUrl: __VERIFIER_URL__,
    } satisfies RequestPermission,
  ],
  urls: ['https://connect.garmin.com/*'],
};

// =============================================================================
// PROOF GENERATION CALLBACK
// =============================================================================

const onClick = async (): Promise<void> => {
  const isRequestPending = useState<boolean>('isRequestPending', false);

  if (isRequestPending) return;

  setState('isRequestPending', true);

  const cachedHeaders = useState<Record<string, string> | null>('apiHeaders', null);

  if (!cachedHeaders) {
    setState('isRequestPending', false);
    return;
  }

  // Replay the exact header set the browser sent to the gc-api (user-agent,
  // accept, connect-csrf-token, cookies, …). Cherry-picking just Cookie + CSRF
  // gets a 403 — Garmin's WAF rejects requests without a browser user-agent.
  // We only override the few headers the TLSN prover needs to control.
  const headers: Record<string, string> = {
    ...cachedHeaders,
    Host: api,
    'Accept-Encoding': 'identity',
    Connection: 'close',
  };

  const resp = await prove(
    {
      url: `https://${api}${badgePath}`,
      method: 'GET',
      headers,
    },
    {
      verifierUrl: __VERIFIER_URL__,
      proxyUrl: __PROXY_URL__ + api,
      // Keep recv at 64 KiB: the verifier's MPC mux hits "maximum number of
      // streams reached" above this (idme works at 65536, 70000 fails).
      maxRecvData: 65536,
      maxSentData: 16384,
      handlers: [
        { type: 'SENT', part: 'START_LINE', action: 'REVEAL' } satisfies Handler,
        { type: 'RECV', part: 'START_LINE', action: 'REVEAL' } satisfies Handler,
        {
          type: 'RECV',
          part: 'HEADERS',
          action: 'REVEAL',
          params: { key: 'date' },
        } satisfies Handler,
        {
          type: 'RECV',
          part: 'BODY',
          action: 'REVEAL',
          params: { type: 'json', path: '0.displayName' },
        } satisfies Handler,
        {
          type: 'RECV',
          part: 'BODY',
          action: 'REVEAL',
          params: { type: 'json', path: '0.badgeName' },
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
                background: 'linear-gradient(90deg, #007CC7, #00A3E0)',
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

  // Capture the full header set from a real gc-api request and replay it
  // verbatim. The endpoint is cookie+CSRF authenticated, but Garmin's WAF also
  // requires a browser user-agent (and accept) — so we forward everything the
  // browser sends rather than cherry-picking individual headers. Headers the
  // TLSN prover sets/controls itself are skipped (and re-added in onClick).
  if (!cachedHeaders) {
    const apiRequests = useHeaders((h: InterceptedRequestHeader[]) =>
      h.filter((x) => x.url.startsWith(`https://${api}/gc-api/`)),
    );
    if (apiRequests.length > 0) {
      const skip = new Set([
        'accept-encoding',
        'content-length',
        'connection',
        'host',
        'if-none-match',
        'if-modified-since',
      ]);
      const captured: Record<string, string> = {};
      for (const { name, value } of apiRequests[apiRequests.length - 1].requestHeaders) {
        if (value !== undefined && !skip.has(name.toLowerCase())) {
          captured[name] = value;
        }
      }
      if (captured.Cookie || captured.cookie) setState('apiHeaders', captured);
    }
  }

  const isConnected = !!cachedHeaders;

  useEffect(() => {
    openWindow('https://connect.garmin.com/');
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
          backgroundColor: '#007CC7',
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
      ['\u{1F3C5}'],
    );
  }

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
            background: 'linear-gradient(135deg, #007CC7 0%, #00A3E0 100%)',
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: 'white',
          },
        },
        [
          div({ style: { fontWeight: '600', fontSize: '16px' } }, ['Garmin Badges']),
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
            ['\u2212'],
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
          [isConnected ? '\u2713 Garmin session detected' : '\u26A0 No session detected'],
        ),
        isConnected
          ? button(
              {
                style: {
                  width: '100%',
                  padding: '12px 24px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #007CC7 0%, #00A3E0 100%)',
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
              ['Please login to Garmin Connect to continue'],
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
