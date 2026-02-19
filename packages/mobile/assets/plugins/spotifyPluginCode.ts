/**
 * Spotify Top Artist Plugin code as an embeddable string.
 *
 * This is a pre-processed version of packages/demo/plugins/spotify.plugin.ts
 * with TypeScript annotations removed and template literals replaced for
 * compatibility with the MobilePluginHost's Function() evaluator.
 *
 * When native QuickJS is implemented (Phase 1), this can be loaded from
 * a file or fetched from a URL instead.
 */
export const SPOTIFY_PLUGIN_CODE = `
var VERIFIER_URL = 'http://localhost:7047';
var api = 'api.spotify.com';
var ui = 'https://developer.spotify.com/';
var topArtistPath = '/v1/me/top/artists?time_range=medium_term&limit=1';

var config = {
  name: 'Spotify Top Artist',
  description: 'This plugin will prove your top artist on Spotify.',
  requests: [
    {
      method: 'GET',
      host: 'api.spotify.com',
      pathname: '/v1/me/top/artists',
      verifierUrl: VERIFIER_URL,
    },
  ],
  urls: ['https://developer.spotify.com/*'],
};

async function onClick() {
  var isRequestPending = useState('isRequestPending', false);
  if (isRequestPending) return;

  setState('isRequestPending', true);

  var authToken = useState('authToken', null);
  if (!authToken) {
    setState('isRequestPending', false);
    return;
  }

  var headers = {
    authorization: authToken,
    Host: api,
    'Accept-Encoding': 'identity',
    Connection: 'close',
  };

  var resp = await prove(
    {
      url: 'https://' + api + topArtistPath,
      method: 'GET',
      headers: headers,
    },
    {
      verifierUrl: VERIFIER_URL,
      proxyUrl: '',
      maxRecvData: 2400,
      maxSentData: 600,
      handlers: [
        { type: 'SENT', part: 'START_LINE', action: 'REVEAL' },
        { type: 'RECV', part: 'START_LINE', action: 'REVEAL' },
        { type: 'RECV', part: 'HEADERS', action: 'REVEAL', params: { key: 'date' } },
        { type: 'RECV', part: 'BODY', action: 'REVEAL', params: { type: 'json', path: 'items.0.name' } },
      ],
    },
  );
  done(JSON.stringify(resp));
}

function expandUI() {
  setState('isMinimized', false);
}

function minimizeUI() {
  setState('isMinimized', true);
}

function main() {
  var isMinimized = useState('isMinimized', false);
  var isRequestPending = useState('isRequestPending', false);
  var authToken = useState('authToken', null);

  if (!authToken) {
    var headers = useHeaders(function(h) {
      return h.filter(function(x) { return x.url.indexOf('https://' + api) === 0; });
    });
    var allHeaders = [];
    for (var i = 0; i < headers.length; i++) {
      for (var j = 0; j < headers[i].requestHeaders.length; j++) {
        allHeaders.push(headers[i].requestHeaders[j]);
      }
    }
    var authHeader = null;
    for (var k = 0; k < allHeaders.length; k++) {
      if (allHeaders[k].name === 'Authorization' || allHeaders[k].name === 'authorization') {
        authHeader = allHeaders[k];
        break;
      }
    }
    if (authHeader && authHeader.value) {
      setState('authToken', authHeader.value);
    }
  }

  useEffect(function() {
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
          fontSize: '24px',
          color: 'white',
        },
        onclick: 'expandUI',
      },
      ['\\uD83C\\uDFB5'],
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
        overflow: 'hidden',
      },
    },
    [
      div(
        {
          style: {
            backgroundColor: '#1DB954',
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
                backgroundColor: 'transparent',
                border: 'none',
                color: 'white',
                fontSize: '20px',
                padding: '0',
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              },
              onclick: 'minimizeUI',
            },
            ['\\u2212'],
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
                border: '1px solid ' + (authToken ? '#c3e6cb' : '#f5c6cb'),
                fontWeight: '500',
              },
            },
            [
              authToken
                ? '\\u2713 Api token detected'
                : '\\u26A0 No API token detected',
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
                    backgroundColor: '#1DB954',
                    color: 'white',
                    fontWeight: '600',
                    fontSize: '15px',
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
                ['Please login to Spotify to continue'],
              ),
        ],
      ),
    ],
  );
}

return {
  main: main,
  onClick: onClick,
  expandUI: expandUI,
  minimizeUI: minimizeUI,
  config: config,
};
`;
