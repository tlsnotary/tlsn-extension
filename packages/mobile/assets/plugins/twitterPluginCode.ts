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
      pathname: '/1.1/account/settings.json',
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

  var resp = await prove(
    {
      url: 'https://api.x.com/1.1/account/settings.json',
      method: 'GET',
      headers: headers,
    },
    {
      verifierUrl: VERIFIER_URL,
      proxyUrl: '',
      maxRecvData: 16384,
      maxSentData: 4096,
      handlers: [
        { type: 'SENT', part: 'START_LINE', action: 'REVEAL' },
        { type: 'RECV', part: 'START_LINE', action: 'REVEAL' },
        { type: 'RECV', part: 'HEADERS', action: 'REVEAL', params: { key: 'date' } },
        { type: 'RECV', part: 'BODY', action: 'REVEAL', params: { type: 'json', path: 'screen_name' } },
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
  var cachedCookie = useState('cookie', null);
  var cachedCsrfToken = useState('x-csrf-token', null);
  var cachedTransactionId = useState('x-client-transaction-id', null);
  var cachedAuthorization = useState('authorization', null);

  if (!cachedCookie || !cachedCsrfToken || !cachedAuthorization) {
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
          if (lname === 'cookie' && !cookie) cookie = h.value;
          if (lname === 'x-csrf-token' && !csrfToken) csrfToken = h.value;
          if (lname === 'x-client-transaction-id' && !transactionId) transactionId = h.value;
          if (lname === 'authorization' && !authorization) authorization = h.value;
        }
      }

      if (cookie && !cachedCookie) setState('cookie', cookie);
      if (csrfToken && !cachedCsrfToken) setState('x-csrf-token', csrfToken);
      if (transactionId && !cachedTransactionId) setState('x-client-transaction-id', transactionId);
      if (authorization && !cachedAuthorization) setState('authorization', authorization);
    }
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
