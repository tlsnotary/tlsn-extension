import type { PluginConfig, RequestPermission, Handler, DomJson } from '@tlsn/plugin-sdk';

// Injected at build time via esbuild --define
declare const __VERIFIER_URL__: string;
declare const __PROXY_URL__: string;

const api = 'discord.com';
const ui = `https://${api}/channels/@me`;

// =============================================================================
// PLUGIN CONFIGURATION
// =============================================================================

const config: PluginConfig = {
  name: 'Discord Profile Plugin',
  description: 'This plugin will prove your Discord username and ID.',
  requests: [
    {
      method: 'GET',
      host: api,
      pathname: '/api/v9/users/@me',
      verifierUrl: __VERIFIER_URL__,
    } satisfies RequestPermission,
  ],
  urls: [`https://${api}/*`],
};

// =============================================================================
// PROOF GENERATION CALLBACK
// =============================================================================

const onClick = async (): Promise<void> => {
  const isRequestPending = useState<boolean>('isRequestPending', false);

  if (isRequestPending) return;

  setState('isRequestPending', true);

  const cachedAuthorization = useState<string | null>('authorization', null);

  if (!cachedAuthorization) {
    setState('isRequestPending', false);
    return;
  }

  const headers: Record<string, string> = {
    authorization: cachedAuthorization,
    Host: api,
    'Accept-Encoding': 'identity',
    Connection: 'close',
  };

  console.log(
    `curl -s -H "Authorization: ${cachedAuthorization}" "https://${api}/api/v9/users/@me" | jq .`,
  );

  const resp = await prove(
    {
      url: `https://${api}/api/v9/users/@me`,
      method: 'GET',
      headers,
    },
    {
      verifierUrl: __VERIFIER_URL__,
      proxyUrl: __PROXY_URL__ + api,
      maxRecvData: 2500,
      maxSentData: 1000,
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
          params: { type: 'json', path: 'id' },
        } satisfies Handler,
        {
          type: 'RECV',
          part: 'BODY',
          action: 'REVEAL',
          params: { type: 'json', path: 'username' },
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
                background: 'linear-gradient(90deg, #5865F2, #4752C4)',
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
  const cachedAuthorization = useState<string | null>('authorization', null);

  // Only search for header values if not already cached
  if (!cachedAuthorization) {
    const [header] = useHeaders((headers) =>
      headers.filter(
        (h) =>
          h.url.includes(`https://${api}`) &&
          h.requestHeaders.some((r) => r.name === 'Authorization'),
      ),
    );

    if (header) {
      const authorization = header.requestHeaders.find((h) => h.name === 'Authorization')?.value;

      if (authorization) setState('authorization', authorization);
    }
  }

  const isConnected = !!cachedAuthorization;

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
          backgroundColor: '#5865F2',
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
      ['\uD83D\uDCAC'],
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
            background: 'linear-gradient(135deg, #5865F2 0%, #4752C4 100%)',
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: 'white',
          },
        },
        [
          div({ style: { fontWeight: '600', fontSize: '16px' } }, ['Discord Profile Proof']),
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
          [isConnected ? '\u2713 Discord token detected' : '\u26A0 Please login to Discord'],
        ),
        isConnected
          ? button(
              {
                style: {
                  width: '100%',
                  padding: '12px 24px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #5865F2 0%, #4752C4 100%)',
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
              ['Please login to Discord to continue'],
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
