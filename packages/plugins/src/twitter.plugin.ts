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

const config: PluginConfig = {
  name: 'X Profile Prover',
  description: 'This plugin will prove your X.com profile.',
  requests: [
    {
      method: 'GET',
      host: 'api.x.com',
      pathname: '/1.1/account/settings.json',
      verifierUrl: __VERIFIER_URL__,
    } satisfies RequestPermission,
  ],
  urls: ['https://x.com/*'],
};

// =============================================================================
// PROOF GENERATION CALLBACK
// =============================================================================

async function onClick(): Promise<void> {
  const isRequestPending = useState<boolean>('isRequestPending', false);

  if (isRequestPending) return;

  setState('isRequestPending', true);

  const cachedCookie = useState<string | null>('cookie', null);
  const cachedCsrfToken = useState<string | null>('x-csrf-token', null);
  const cachedTransactionId = useState<string | null>(
    'x-client-transaction-id',
    null,
  );
  const cachedAuthorization = useState<string | null>('authorization', null);

  if (!cachedCookie || !cachedCsrfToken || !cachedAuthorization) {
    setState('isRequestPending', false);
    return;
  }

  const headers: Record<string, string> = {
    cookie: cachedCookie,
    'x-csrf-token': cachedCsrfToken,
    ...(cachedTransactionId
      ? { 'x-client-transaction-id': cachedTransactionId }
      : {}),
    Host: 'api.x.com',
    authorization: cachedAuthorization,
    'Accept-Encoding': 'identity',
    Connection: 'close',
  };

  const resp = await prove(
    {
      url: 'https://api.x.com/1.1/account/settings.json',
      method: 'GET',
      headers,
    },
    {
      verifierUrl: __VERIFIER_URL__,
      proxyUrl: __PROXY_URL__ + 'api.x.com',
      maxRecvData: 4000,
      maxSentData: 2000,
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
          params: { type: 'json', path: 'screen_name' },
        } satisfies Handler,
      ],
    },
  );

  done(JSON.stringify(resp));
}

function expandUI(): void {
  setState('isMinimized', false);
}

function minimizeUI(): void {
  setState('isMinimized', true);
}

// =============================================================================
// MAIN UI FUNCTION
// =============================================================================

function main(): DomJson {
  const isMinimized = useState<boolean>('isMinimized', false);
  const isRequestPending = useState<boolean>('isRequestPending', false);
  const cachedCookie = useState<string | null>('cookie', null);
  const cachedCsrfToken = useState<string | null>('x-csrf-token', null);
  const cachedTransactionId = useState<string | null>(
    'x-client-transaction-id',
    null,
  );
  const cachedAuthorization = useState<string | null>('authorization', null);

  // Only search for header values if not already cached
  if (!cachedCookie || !cachedCsrfToken || !cachedAuthorization) {
    const [header] = useHeaders((headers: InterceptedRequestHeader[]) =>
      headers.filter((h) =>
        h.url.includes('https://api.x.com/1.1/account/settings.json'),
      ),
    );

    if (header) {
      const cookie = header.requestHeaders.find(
        (h) => h.name === 'Cookie',
      )?.value;
      const csrfToken = header.requestHeaders.find(
        (h) => h.name === 'x-csrf-token',
      )?.value;
      const transactionId = header.requestHeaders.find(
        (h) => h.name === 'x-client-transaction-id',
      )?.value;
      const authorization = header.requestHeaders.find(
        (h) => h.name === 'authorization',
      )?.value;

      if (cookie && !cachedCookie) setState('cookie', cookie);
      if (csrfToken && !cachedCsrfToken) setState('x-csrf-token', csrfToken);
      if (transactionId && !cachedTransactionId)
        setState('x-client-transaction-id', transactionId);
      if (authorization && !cachedAuthorization)
        setState('authorization', authorization);
    }
  }

  const isConnected = !!(
    cachedCookie &&
    cachedCsrfToken &&
    cachedAuthorization
  );

  useEffect(() => {
    openWindow('https://x.com');
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
          backgroundColor: '#4CAF50',
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
      ['\uD83D\uDD10'],
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
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
            ['X Profile Prover'],
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
                backgroundColor: isConnected ? '#d4edda' : '#f8d7da',
                color: isConnected ? '#155724' : '#721c24',
                border: `1px solid ${isConnected ? '#c3e6cb' : '#f5c6cb'}`,
                fontWeight: '500',
              },
            },
            [
              isConnected
                ? '\u2713 Profile detected'
                : '\u26A0 No profile detected',
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
                    background:
                      'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
                ['Please login to x.com to continue'],
              ),
        ],
      ),
    ],
  );
}

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
