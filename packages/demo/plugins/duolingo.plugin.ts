import type {
  PluginConfig,
  RequestPermission,
  Handler,
  DomJson,
} from '@tlsn/plugin-sdk';

// Injected at build time via esbuild --define
declare const __VERIFIER_URL__: string;
declare const __PROXY_URL__: string;

const api = 'www.duolingo.com';
const ui = 'https://www.duolingo.com/';

// =============================================================================
// PLUGIN CONFIGURATION
// =============================================================================

const config: PluginConfig = {
  name: 'Duolingo Plugin',
  description:
    'This plugin will prove your email and current streak on Duolingo.',
  requests: [
    {
      method: 'GET',
      host: 'www.duolingo.com',
      pathname: '/2023-05-23/users/*',
      verifierUrl: __VERIFIER_URL__,
    } satisfies RequestPermission,
  ],
  urls: ['https://www.duolingo.com/*'],
};

// =============================================================================
// PROOF GENERATION CALLBACK
// =============================================================================

const onClick = async (): Promise<void> => {
  const isRequestPending = useState<boolean>('isRequestPending', false);

  if (isRequestPending) return;

  setState('isRequestPending', true);

  const authorization = useState<string | null>('authorization', null);
  const userId = useState<string | null>('user_id', null);

  if (!authorization || !userId) {
    setState('isRequestPending', false);
    return;
  }

  const headers: Record<string, string> = {
    authorization,
    Host: api,
    'Accept-Encoding': 'identity',
    Connection: 'close',
  };

  const resp = await prove(
    {
      url: `https://${api}/2023-05-23/users/${userId}?fields=longestStreak,username`,
      method: 'GET',
      headers,
    },
    {
      verifierUrl: __VERIFIER_URL__,
      proxyUrl: __PROXY_URL__ + api,
      maxRecvData: 2400,
      maxSentData: 1200,
      handlers: [
        { type: 'SENT', part: 'START_LINE', action: 'REVEAL' } satisfies Handler,
        {
          type: 'RECV',
          part: 'BODY',
          action: 'REVEAL',
          params: { type: 'json', path: 'longestStreak' },
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

const main = (): DomJson => {
  const isMinimized = useState<boolean>('isMinimized', false);
  const isRequestPending = useState<boolean>('isRequestPending', false);
  const authorization = useState<string | null>('authorization', null);
  const userId = useState<string | null>('user_id', null);

  // Only search for auth values if not already cached
  if (!authorization || !userId) {
    const [header] = useHeaders((headers) =>
      headers.filter((h) =>
        h.url.includes(`https://${api}/2023-05-23/users`),
      ),
    );

    const authValue = header?.requestHeaders.find(
      (h) => h.name === 'Authorization',
    )?.value;
    const traceId = header?.requestHeaders.find(
      (h) => h.name === 'X-Amzn-Trace-Id',
    )?.value;
    const userIdValue = traceId?.split('=')[1];

    if (authValue && !authorization) {
      setState('authorization', authValue);
    }
    if (userIdValue && !userId) {
      setState('user_id', userIdValue);
    }
  }

  const isConnected = !!(authorization && userId);

  useEffect(() => {
    openWindow(ui);
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
          backgroundColor: '#58CC02',
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
      ['\uD83E\uDD89'],
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
            background: 'linear-gradient(135deg, #58CC02 0%, #4CAF00 100%)',
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
            ['Duolingo Streak'],
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
                ? '\u2713 Api token detected'
                : '\u26A0 No API token detected',
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
                      'linear-gradient(135deg, #58CC02 0%, #4CAF00 100%)',
                    color: 'white',
                    fontWeight: '600',
                    fontSize: '15px',
                    cursor: isRequestPending ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    opacity: isRequestPending ? '0.5' : '1',
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
                ['Please login to Duolingo to continue'],
              ),
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
