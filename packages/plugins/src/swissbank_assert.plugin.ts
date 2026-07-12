import type { PluginConfig, RequestPermission, Handler, DomJson } from '@tlsn/plugin-sdk';

// Injected at build time via esbuild --define
declare const __VERIFIER_URL__: string;
declare const __PROXY_URL__: string;

const host = 'swissbank.tlsnotary.org';
const uiPath = '/account';
const apiPath = '/balances';
const url = `https://${host}${apiPath}`;

// Threshold the verifier checks the revealed EUR balance against.
const MIN_BALANCE = 1000;

// =============================================================================
// PLUGIN CONFIGURATION
// =============================================================================

const config: PluginConfig = {
  name: 'Swiss Bank Assert Prover',
  description: `This plugin reveals the account balance and proves the verifier asserts it is >= ${MIN_BALANCE} EUR.`,
  requests: [
    {
      method: 'GET',
      host: 'swissbank.tlsnotary.org',
      pathname: '/balances',
      verifierUrl: __VERIFIER_URL__,
    } satisfies RequestPermission,
  ],
  urls: ['https://swissbank.tlsnotary.org/*'],
};

// =============================================================================
// PROOF GENERATION CALLBACK
// =============================================================================

const onClick = async (): Promise<void> => {
  const isRequestPending = useState<boolean>('isRequestPending', false);

  if (isRequestPending) return;

  setState('isRequestPending', true);

  const cachedCookie = useState<string | null>('cookie', null);

  if (!cachedCookie) {
    setState('isRequestPending', false);
    return;
  }

  const headers: Record<string, string> = {
    cookie: cachedCookie,
    Host: host,
    'Accept-Encoding': 'identity',
    Connection: 'close',
  };

  const resp = await prove(
    {
      url,
      method: 'GET',
      headers,
    },
    {
      verifierUrl: __VERIFIER_URL__,
      proxyUrl: __PROXY_URL__ + host,
      maxRecvData: 520,
      maxSentData: 180,
      handlers: [
        { type: 'SENT', part: 'START_LINE', action: 'REVEAL' } satisfies Handler,
        { type: 'RECV', part: 'START_LINE', action: 'REVEAL' } satisfies Handler,
        {
          type: 'RECV',
          part: 'BODY',
          action: 'REVEAL',
          params: { type: 'json', path: 'account_id' },
        } satisfies Handler,
        // Reveal the EUR balance AND have the verifier assert it is >= MIN_BALANCE.
        // The boolean outcome comes back on this handler result as `assert`.
        {
          type: 'RECV',
          part: 'BODY',
          action: { kind: 'ASSERT', op: 'gte', value: MIN_BALANCE, valueType: 'number' },
          params: { type: 'json', path: 'accounts.EUR', hideKey: true },
        } satisfies Handler,
      ],
    },
  );

  doneWithOverlay(JSON.stringify(resp));
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
                background: 'linear-gradient(90deg, #667eea, #764ba2)',
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

  // Only search for cookie if not already cached
  if (!cachedCookie) {
    const [header] = useHeaders((headers) =>
      headers.filter(
        (h) =>
          h.url.includes(`https://${host}`) && h.requestHeaders.some((r) => r.name === 'Cookie'),
      ),
    );

    if (header) {
      const cookie = header.requestHeaders.find((h) => h.name === 'Cookie')?.value;
      if (cookie) {
        setState('cookie', cookie);
      }
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
      ['🔐'],
    );
  }

  return div(
    {
      draggable: true,
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
          div({ style: { fontWeight: '600', fontSize: '16px' } }, ['Swiss Bank Assert Prover']),
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
              backgroundColor: cachedCookie ? '#d4edda' : '#f8d7da',
              color: cachedCookie ? '#155724' : '#721c24',
              border: `1px solid ${cachedCookie ? '#c3e6cb' : '#f5c6cb'}`,
              fontWeight: '500',
            },
          },
          [cachedCookie ? '✓ Cookie detected' : '⚠ No Cookie detected'],
        ),
        cachedCookie
          ? button(
              {
                style: {
                  width: '100%',
                  padding: '12px 24px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
              [isRequestPending ? 'Generating Proof...' : `Prove balance >= ${MIN_BALANCE}`],
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
              ['Please login to continue'],
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
