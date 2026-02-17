import type {
  PluginConfig,
  RequestPermission,
  Handler,
  DomJson,
} from '@tlsn/plugin-sdk';

// Injected at build time via esbuild --define
declare const __VERIFIER_URL__: string;
declare const __PROXY_URL__: string;

const api = 'api.spotify.com';
const ui = 'https://developer.spotify.com/';
const topArtistPath = '/v1/me/top/artists?time_range=medium_term&limit=1';

// =============================================================================
// PLUGIN CONFIGURATION
// =============================================================================

const config: PluginConfig = {
  name: 'Spotify Top Artist',
  description: 'This plugin will prove your top artist on Spotify.',
  requests: [
    {
      method: 'GET',
      host: 'api.spotify.com',
      pathname: '/v1/me/top/artists',
      verifierUrl: __VERIFIER_URL__,
    } satisfies RequestPermission,
  ],
  urls: ['https://developer.spotify.com/*'],
};

// =============================================================================
// PROOF GENERATION CALLBACK
// =============================================================================

async function onClick(): Promise<void> {
  const isRequestPending = useState<boolean>('isRequestPending', false);

  if (isRequestPending) return;

  setState('isRequestPending', true);

  const authToken = useState<string | null>('authToken', null);

  if (!authToken) {
    setState('isRequestPending', false);
    return;
  }

  const headers: Record<string, string> = {
    authorization: authToken,
    Host: api,
    'Accept-Encoding': 'identity',
    Connection: 'close',
  };

  const resp = await prove(
    {
      url: `https://${api}${topArtistPath}`,
      method: 'GET',
      headers,
    },
    {
      verifierUrl: __VERIFIER_URL__,
      proxyUrl: __PROXY_URL__ + api,
      maxRecvData: 2400,
      maxSentData: 600,
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
          params: { type: 'json', path: 'items[0].name' },
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
  const authToken = useState<string | null>('authToken', null);

  // Only search for auth token if not already cached
  if (!authToken) {
    const token = useHeaders((h) =>
      h.filter((x) => x.url.startsWith(`https://${api}`)),
    )
      .flatMap((h) => h.requestHeaders)
      .find((h) => h.name === 'Authorization')?.value;

    if (token) {
      setState('authToken', token);
    }
  }

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
          backgroundColor: '#1DB954',
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
      ['\uD83C\uDFB5'],
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
            background: 'linear-gradient(135deg, #1DB954 0%, #1AA34A 100%)',
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
            ['Spotify Top Artist'],
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
                backgroundColor: authToken ? '#d4edda' : '#f8d7da',
                color: authToken ? '#155724' : '#721c24',
                border: `1px solid ${authToken ? '#c3e6cb' : '#f5c6cb'}`,
                fontWeight: '500',
              },
            },
            [
              authToken
                ? '\u2713 Api token detected'
                : '\u26A0 No API token detected',
            ],
          ),
          authToken
            ? button(
                {
                  style: {
                    width: '100%',
                    padding: '12px 24px',
                    borderRadius: '6px',
                    border: 'none',
                    background:
                      'linear-gradient(135deg, #1DB954 0%, #1AA34A 100%)',
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
                ['Please login to Spotify to continue'],
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
