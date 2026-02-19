export const SWISSBANK_PLUGIN_CODE = `
var VERIFIER_URL = 'http://localhost:7047';
var host = 'swissbank.tlsnotary.org';
var uiPath = '/account';
var apiPath = '/balances';
var url = 'https://' + host + apiPath;

var config = {
  name: 'Swiss Bank Prover',
  description: 'This plugin will prove your Swiss Bank account balance.',
  requests: [
    {
      method: 'GET',
      host: 'swissbank.tlsnotary.org',
      pathname: '/balances',
      verifierUrl: VERIFIER_URL,
    },
  ],
  urls: ['https://swissbank.tlsnotary.org/*'],
};

async function onClick() {
  var isRequestPending = useState('isRequestPending', false);
  if (isRequestPending) return;

  setState('isRequestPending', true);

  var cachedCookie = useState('cookie', null);

  if (!cachedCookie) {
    setState('isRequestPending', false);
    return;
  }

  var headers = {
    cookie: cachedCookie,
    Host: host,
    'Accept-Encoding': 'identity',
    Connection: 'close',
  };

  var resp = await prove(
    {
      url: url,
      method: 'GET',
      headers: headers,
    },
    {
      verifierUrl: VERIFIER_URL,
      proxyUrl: '',
      maxRecvData: 460,
      maxSentData: 180,
      handlers: [
        { type: 'SENT', part: 'START_LINE', action: 'REVEAL' },
        { type: 'RECV', part: 'START_LINE', action: 'REVEAL' },
        {
          type: 'RECV',
          part: 'BODY',
          action: 'REVEAL',
          params: { type: 'json', path: 'account_id' },
        },
        {
          type: 'RECV',
          part: 'BODY',
          action: 'REVEAL',
          params: { type: 'json', path: 'accounts.CHF' },
        },
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

  if (!cachedCookie) {
    var headers = useHeaders(function(h) {
      return h.filter(function(x) {
        return x.url.indexOf('https://' + host) >= 0;
      });
    });

    if (headers.length > 0) {
      var header = headers[0];
      var cookie = null;

      for (var i = 0; i < header.requestHeaders.length; i++) {
        var h = header.requestHeaders[i];
        if (h.name === 'Cookie') cookie = h.value;
      }

      if (cookie) {
        setState('cookie', cookie);
      }
    }
  }

  useEffect(function() {
    openWindow('https://' + host + uiPath);
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
            ['Swiss Bank Prover'],
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
                backgroundColor: cachedCookie ? '#d4edda' : '#f8d7da',
                color: cachedCookie ? '#155724' : '#721c24',
                border: '1px solid ' + (cachedCookie ? '#c3e6cb' : '#f5c6cb'),
                fontWeight: '500',
              },
            },
            [
              cachedCookie
                ? '\\u2713 Cookie detected'
                : '\\u26A0 No Cookie detected',
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
                ['Please login to continue'],
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
