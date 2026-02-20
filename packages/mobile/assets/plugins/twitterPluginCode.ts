export const TWITTER_PLUGIN_CODE = `
var VERIFIER_URL = 'http://localhost:7047';
var api = 'api.x.com';
var ui = 'https://x.com/';

var config = {
  name: 'X Profile Prover',
  description: 'This plugin will prove your X.com profile.',
  requests: [
    {
      method: 'GET',
      host: 'api.x.com',
      pathname: '/1.1/account/verify_credentials.json',
      verifierUrl: VERIFIER_URL,
    },
  ],
  urls: ['https://x.com/*'],
};

async function onClick() {
  var isRequestPending = useState('isRequestPending', false);
  if (isRequestPending) return;

  setState('isRequestPending', true);

  var cachedCookie = useState('cookie', null);
  var cachedCsrfToken = useState('x-csrf-token', null);
  var cachedTransactionId = useState('x-client-transaction-id', null);
  var cachedAuthorization = useState('authorization', null);

  if (!cachedCookie || !cachedCsrfToken || !cachedAuthorization) {
    setState('isRequestPending', false);
    return;
  }

  var headers = {
    cookie: cachedCookie,
    'x-csrf-token': cachedCsrfToken,
    Host: 'api.x.com',
    authorization: cachedAuthorization,
    'Accept-Encoding': 'identity',
    Connection: 'close',
  };
  if (cachedTransactionId) {
    headers['x-client-transaction-id'] = cachedTransactionId;
  }

  try {
    var resp = await prove(
      {
        url: 'https://api.x.com/1.1/account/verify_credentials.json',
        method: 'GET',
        headers: headers,
      },
      {
        verifierUrl: VERIFIER_URL,
        proxyUrl: '',
        maxRecvData: 16384,
        maxSentData: 4096,
        handlers: [],
      },
    );
    done(JSON.stringify(resp));
  } catch (e) {
    setState('isRequestPending', false);
    setState('error', e && e.message ? e.message : String(e));
  }
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
  var pluginError = useState('error', null);
  var cachedCookie = useState('cookie', null);
  var cachedCsrfToken = useState('x-csrf-token', null);
  var cachedTransactionId = useState('x-client-transaction-id', null);
  var cachedAuthorization = useState('authorization', null);

  var headers = useHeaders(function(h) {
    return h.filter(function(x) {
      return x.url.indexOf('x.com') >= 0;
    });
  });

  if (headers.length > 0) {
    var cookie = null;
    var csrfToken = null;
    var transactionId = null;
    var authorization = null;

    for (var j = 0; j < headers.length; j++) {
      var header = headers[j];
      for (var i = 0; i < header.requestHeaders.length; i++) {
        var h = header.requestHeaders[i];
        var lname = h.name.toLowerCase();
        // Always take the longest cookie (native cookies include HttpOnly auth_token)
        if (lname === 'cookie' && h.value) {
          if (!cookie || h.value.length > cookie.length) cookie = h.value;
        }
        if (lname === 'x-csrf-token' && !csrfToken) csrfToken = h.value;
        if (lname === 'x-client-transaction-id' && !transactionId) transactionId = h.value;
        if (lname === 'authorization' && !authorization) authorization = h.value;
      }
    }

    // Update cookie if we found a more complete one (native cookies > document.cookie)
    if (cookie && (!cachedCookie || cookie.length > cachedCookie.length)) setState('cookie', cookie);
    if (csrfToken && !cachedCsrfToken) setState('x-csrf-token', csrfToken);
    if (transactionId && !cachedTransactionId) setState('x-client-transaction-id', transactionId);
    if (authorization && !cachedAuthorization) setState('authorization', authorization);
  }

  var isConnected = !!(cachedCookie && cachedCsrfToken && cachedAuthorization);

  useEffect(function() {
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
          fontSize: '24px',
          color: 'white',
        },
        onclick: 'expandUI',
      },
      ['\\uD83D\\uDD10'],
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
            backgroundColor: '#667eea',
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
                backgroundColor: isConnected ? '#d4edda' : '#f8d7da',
                color: isConnected ? '#155724' : '#721c24',
                border: '1px solid ' + (isConnected ? '#c3e6cb' : '#f5c6cb'),
                fontWeight: '500',
              },
            },
            [
              isConnected
                ? '\\u2713 Profile detected'
                : '\\u26A0 No profile detected',
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
                    backgroundColor: '#667eea',
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
                ['Please login to x.com to continue'],
              ),
          pluginError
            ? div(
                {
                  style: {
                    marginTop: '12px',
                    padding: '10px',
                    borderRadius: '6px',
                    backgroundColor: '#f8d7da',
                    color: '#721c24',
                    fontSize: '12px',
                    border: '1px solid #f5c6cb',
                  },
                },
                [pluginError],
              )
            : div({}, []),
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
