import type {
  PluginConfig,
  RequestPermission,
  Handler,
  DomJson,
} from '@tlsn/plugin-sdk';

// Injected at build time via esbuild --define
declare const __VERIFIER_URL__: string;
declare const __PROXY_URL__: string;

const host = 'riders.uber.com';
const uiPath = '/';
const apiPath = '/graphql';
const url = `https://${host}${apiPath}`;

// Full query (commented out — reveals too much for a demo):
// '{ currentUser { email firstName lastName uuid formattedNumber signupCountry } }'
const graphqlQuery = JSON.stringify({
  query: '{ currentUser { firstName signupCountry } }',
});

// =============================================================================
// PLUGIN CONFIGURATION
// =============================================================================

const config: PluginConfig = {
  name: 'Uber Profile Prover',
  description: 'This plugin will prove your Uber rider profile via GraphQL.',
  requests: [
    {
      method: 'POST',
      host,
      pathname: '/graphql',
      verifierUrl: __VERIFIER_URL__,
    } satisfies RequestPermission,
  ],
  urls: [`https://${host}/*`],
};

// =============================================================================
// PROOF GENERATION CALLBACK
// =============================================================================

const onClick = async (): Promise<void> => {
  const isRequestPending = useState<boolean>('isRequestPending', false);

  if (isRequestPending) return;

  setState('isRequestPending', true);

  const cachedCookie = useState<string | null>('cookie', null);
  const cachedCsrfToken = useState<string | null>('x-csrf-token', null);

  if (!cachedCookie) {
    setState('isRequestPending', false);
    return;
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    cookie: cachedCookie,
    'x-csrf-token': cachedCsrfToken || 'x',
    Host: host,
    'Accept-Encoding': 'identity',
    Connection: 'close',
  };

  const resp = await prove(
    {
      url,
      method: 'POST',
      headers,
      body: graphqlQuery,
    },
    {
      verifierUrl: __VERIFIER_URL__,
      proxyUrl: __PROXY_URL__ + host,
      maxRecvData: 16384,
      maxSentData: 4096,
      handlers: [
        {
          type: 'SENT',
          part: 'START_LINE',
          action: 'REVEAL',
        } satisfies Handler,
        { type: 'SENT', part: 'BODY', action: 'REVEAL' } satisfies Handler,
        {
          type: 'RECV',
          part: 'START_LINE',
          action: 'REVEAL',
        } satisfies Handler,
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
          params: { type: 'json', path: 'data' },
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
                background: 'linear-gradient(90deg, #276EF1, #1A56C4)',
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
  const cachedCookie = useState<string | null>('cookie', null);
  const cachedCsrfToken = useState<string | null>('x-csrf-token', null);

  // Only search for credentials if not already cached
  if (!cachedCookie) {
    const [header] = useHeaders((headers) =>
      headers.filter(
        (h) =>
          h.url.includes(`https://${host}`) &&
          h.requestHeaders.some((r) => r.name === 'Cookie'),
      ),
    );

    if (header) {
      const cookie = header.requestHeaders.find(
        (h) => h.name === 'Cookie',
      )?.value;
      const csrfToken = header.requestHeaders.find(
        (h) => h.name === 'x-csrf-token',
      )?.value;

      if (cookie) setState('cookie', cookie);
      if (csrfToken) setState('x-csrf-token', csrfToken);
    }
  }

  useEffect(() => {
    openWindow(`https://${host}${uiPath}`);
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
          backgroundColor: '#276EF1',
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
      ['\uD83D\uDE97'],
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
            background: 'linear-gradient(135deg, #276EF1 0%, #1A56C4 100%)',
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: 'white',
          },
        },
        [
          div(
            { style: { fontWeight: '600', fontSize: '16px' } },
            ['Uber Profile Prover'],
          ),
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
      div(
        { style: { padding: '20px', backgroundColor: '#f8f9fa' } },
        [
          div(
            {
              style: {
                marginBottom: '16px',
                padding: '12px',
                borderRadius: '6px',
                backgroundColor: cachedCookie ? '#d4edda' : '#f8d7da',
                color: cachedCookie ? '#155724' : '#721c24',
                border: `1px solid ${cachedCookie ? '#c3e6cb' : '#f5c6cb'}`,
                fontWeight: '500',
              },
            },
            [
              cachedCookie
                ? '\u2713 Cookie detected'
                : '\u26A0 No cookie detected',
            ],
          ),
          cachedCookie
            ? button(
                {
                  style: {
                    width: '100%',
                    padding: '12px 24px',
                    borderRadius: '6px',
                    border: 'none',
                    background:
                      'linear-gradient(135deg, #276EF1 0%, #1A56C4 100%)',
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
                ['Please login to riders.uber.com to continue'],
              ),
          ...proveProgressBar(),
        ],
      ),
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
