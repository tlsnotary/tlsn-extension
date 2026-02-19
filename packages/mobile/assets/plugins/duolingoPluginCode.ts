export const DUOLINGO_PLUGIN_CODE = `
var VERIFIER_URL = 'http://localhost:7047';
var api = 'www.duolingo.com';
var ui = 'https://www.duolingo.com/';

var config = {
  name: 'Duolingo Plugin',
  description: 'This plugin will prove your email and current streak on Duolingo.',
  requests: [
    {
      method: 'GET',
      host: 'www.duolingo.com',
      pathname: '/2023-05-23/users/*',
      verifierUrl: VERIFIER_URL,
    },
  ],
  urls: ['https://www.duolingo.com/*'],
};

async function onClick() {
  var isRequestPending = useState('isRequestPending', false);
  if (isRequestPending) return;

  setState('isRequestPending', true);

  var authorization = useState('authorization', null);
  var userId = useState('user_id', null);

  if (!authorization || !userId) {
    setState('isRequestPending', false);
    return;
  }

  var headers = {
    authorization: authorization,
    Host: api,
    'Accept-Encoding': 'identity',
    Connection: 'close',
  };

  var resp = await prove(
    {
      url: 'https://' + api + '/2023-05-23/users/' + userId + '?fields=longestStreak,username',
      method: 'GET',
      headers: headers,
    },
    {
      verifierUrl: VERIFIER_URL,
      proxyUrl: '',
      maxRecvData: 2400,
      maxSentData: 1200,
      handlers: [
        { type: 'SENT', part: 'START_LINE', action: 'REVEAL' },
        {
          type: 'RECV',
          part: 'BODY',
          action: 'REVEAL',
          params: { type: 'json', path: 'longestStreak' },
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
  var authorization = useState('authorization', null);
  var userId = useState('user_id', null);

  if (!authorization || !userId) {
    var headers = useHeaders(function(h) {
      return h.filter(function(x) {
        return x.url.indexOf('https://' + api + '/2023-05-23/users') >= 0;
      });
    });

    if (headers.length > 0) {
      var header = headers[0];
      var authValue = null;
      var traceId = null;

      for (var i = 0; i < header.requestHeaders.length; i++) {
        var h = header.requestHeaders[i];
        if (h.name === 'Authorization') authValue = h.value;
        if (h.name === 'X-Amzn-Trace-Id') traceId = h.value;
      }

      var userIdValue = null;
      if (traceId) {
        var parts = traceId.split('=');
        if (parts.length > 1) userIdValue = parts[1];
      }

      if (authValue && !authorization) setState('authorization', authValue);
      if (userIdValue && !userId) setState('user_id', userIdValue);
    }
  }

  var isConnected = !!(authorization && userId);

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
          backgroundColor: '#58CC02',
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
      ['\\uD83E\\uDD89'],
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
            backgroundColor: '#58CC02',
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
                ? '\\u2713 Api token detected'
                : '\\u26A0 No API token detected',
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
                    backgroundColor: '#58CC02',
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
                ['Please login to Duolingo to continue'],
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
