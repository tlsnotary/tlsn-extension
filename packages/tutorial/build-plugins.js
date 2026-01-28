import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const VERIFIER_HOST = process.env.VITE_VERIFIER_HOST || 'localhost:7047';
const SSL = process.env.VITE_SSL === 'true';
const VERIFIER_URL = `${SSL ? 'https' : 'http'}://${VERIFIER_HOST}`;
const PROXY_BASE = `${SSL ? 'wss' : 'ws'}://${VERIFIER_HOST}/proxy?token=`;

console.log(`Building plugins with VERIFIER_URL=${VERIFIER_URL}`);

// Ensure output directory exists
const outputDir = join(__dirname, 'public', 'plugins');
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

// Twitter plugin (already has all handler code, just needs env vars substituted)
const twitterPlugin = `// Twitter Plugin - Pre-built
const config = {
  name: 'X Profile Prover',
  description: 'This plugin will prove your X.com profile.',
  requests: [
    {
        method: 'GET',
        host: 'api.x.com',
        pathname: '/1.1/account/settings.json',
        verifierUrl: '${VERIFIER_URL}',
    },
  ],
  urls: [
      'https://x.com/*',
  ],
};

async function onClick() {
  const isRequestPending = useState('isRequestPending', false);
  if (isRequestPending) return;

  setState('isRequestPending', true);

  const [header] = useHeaders(headers => {
    return headers.filter(header => header.url.includes('https://api.x.com/1.1/account/settings.json'));
  });

  const headers = {
    'cookie': header.requestHeaders.find(header => header.name === 'Cookie')?.value,
    'x-csrf-token': header.requestHeaders.find(header => header.name === 'x-csrf-token')?.value,
    'x-client-transaction-id': header.requestHeaders.find(header => header.name === 'x-client-transaction-id')?.value,
    Host: 'api.x.com',
    authorization: header.requestHeaders.find(header => header.name === 'authorization')?.value,
    'Accept-Encoding': 'identity',
    Connection: 'close',
  };

  const resp = await prove(
    {
      url: 'https://api.x.com/1.1/account/settings.json',
      method: 'GET',
      headers: headers,
    },
    {
      verifierUrl: '${VERIFIER_URL}',
      proxyUrl: '${PROXY_BASE}api.x.com',
      maxRecvData: 4000,
      maxSentData: 2000,
      handlers: [
        { type: 'SENT', part: 'START_LINE', action: 'REVEAL' },
        { type: 'RECV', part: 'START_LINE', action: 'REVEAL' },
        { type: 'RECV', part: 'HEADERS', action: 'REVEAL', params: { key: 'date' } },
        { type: 'RECV', part: 'BODY', action: 'REVEAL', params: { type: 'json', path: 'screen_name' } },
      ]
    }
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
  const [header] = useHeaders(headers => headers.filter(header => header.url.includes('https://api.x.com/1.1/account/settings.json')));
  const isMinimized = useState('isMinimized', false);
  const isRequestPending = useState('isRequestPending', false);

  useEffect(() => {
    openWindow('https://x.com');
  }, []);

  if (isMinimized) {
    return div({
      style: {
        position: 'fixed', bottom: '20px', right: '20px', width: '60px', height: '60px',
        borderRadius: '50%', backgroundColor: '#4CAF50', boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
        zIndex: '999999', display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all 0.3s ease', fontSize: '24px', color: 'white',
      },
      onclick: 'expandUI',
    }, ['🔐']);
  }

  return div({
    style: {
      position: 'fixed', bottom: '0', right: '8px', width: '280px', borderRadius: '8px 8px 0 0',
      backgroundColor: 'white', boxShadow: '0 -2px 10px rgba(0,0,0,0.1)', zIndex: '999999',
      fontSize: '14px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      overflow: 'hidden',
    },
  }, [
    div({ style: { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white' }}, [
      div({ style: { fontWeight: '600', fontSize: '16px' }}, ['X Profile Prover']),
      button({ style: { background: 'transparent', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer', padding: '0', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }, onclick: 'minimizeUI' }, ['−'])
    ]),
    div({ style: { padding: '20px', backgroundColor: '#f8f9fa' }}, [
      div({ style: { marginBottom: '16px', padding: '12px', borderRadius: '6px', backgroundColor: header ? '#d4edda' : '#f8d7da', color: header ? '#155724' : '#721c24', border: \`1px solid \${header ? '#c3e6cb' : '#f5c6cb'}\`, fontWeight: '500' }}, [header ? '✓ Profile detected' : '⚠ No profile detected']),
      header ? button({ style: { width: '100%', padding: '12px 24px', borderRadius: '6px', border: 'none', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', fontWeight: '600', fontSize: '15px', cursor: 'pointer', transition: 'all 0.2s ease', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', opacity: isRequestPending ? 0.5 : 1, cursor: isRequestPending ? 'not-allowed' : 'pointer' }, onclick: 'onClick' }, [isRequestPending ? 'Generating Proof...' : 'Generate Proof']) : div({ style: { textAlign: 'center', color: '#666', padding: '12px', backgroundColor: '#fff3cd', borderRadius: '6px', border: '1px solid #ffeaa7' }}, ['Please login to x.com to continue'])
    ])
  ]);
}

export default { main, onClick, expandUI, minimizeUI, config };
`;

// Swiss Bank Starter (with TODO comment)
const swissbankStarter = `// Swiss Bank Plugin - Starter Template
const config = {
  name: 'Swiss Bank Prover',
  description: 'This plugin will prove your Swiss Bank account balance.',
  requests: [
    {
        method: 'GET',
        host: 'swissbank.tlsnotary.org',
        pathname: '/balances',
        verifierUrl: '${VERIFIER_URL}',
    },
  ],
  urls: [
    'https://swissbank.tlsnotary.org/*',
  ],
};

const host = 'swissbank.tlsnotary.org';
const ui_path = '/account';
const path = '/balances';
const url = \`https://\${host}\${path}\`;

async function onClick() {
  const isRequestPending = useState('isRequestPending', false);
  if (isRequestPending) return;

  setState('isRequestPending', true);
  const [header] = useHeaders(headers => {
    return headers.filter(header => header.url.includes(\`https://\${host}\`));
  });

  const headers = {
    'cookie': header.requestHeaders.find(header => header.name === 'Cookie')?.value,
    Host: host,
    'Accept-Encoding': 'identity',
    Connection: 'close',
  };

  const resp = await prove(
    { url: url, method: 'GET', headers: headers },
    {
      verifierUrl: '${VERIFIER_URL}',
      proxyUrl: '${PROXY_BASE}swissbank.tlsnotary.org',
      maxRecvData: 460,
      maxSentData: 180,
      handlers: [
        { type: 'SENT', part: 'START_LINE', action: 'REVEAL' },
        { type: 'RECV', part: 'START_LINE', action: 'REVEAL' },
        { type: 'RECV', part: 'BODY', action: 'REVEAL', params: { type: 'json', path: 'account_id' } },
        // TODO: add handler to reveal balance here

      ]
    }
  );

  done(JSON.stringify(resp));
}

function expandUI() { setState('isMinimized', false); }
function minimizeUI() { setState('isMinimized', true); }

function main() {
  const [header] = useHeaders(headers => headers.filter(header => header.url.includes(\`https://\${host}\${ui_path}\`)));
  const hasNecessaryHeader = header?.requestHeaders.some(h => h.name === 'Cookie');
  const isMinimized = useState('isMinimized', false);
  const isRequestPending = useState('isRequestPending', false);

  useEffect(() => { openWindow(\`https://\${host}\${ui_path}\`); }, []);

  if (isMinimized) {
    return div({ style: { position: 'fixed', bottom: '20px', right: '20px', width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#4CAF50', boxShadow: '0 4px 8px rgba(0,0,0,0.3)', zIndex: '999999', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '24px', color: 'white' }, onclick: 'expandUI' }, ['🔐']);
  }

  return div({ style: { position: 'fixed', bottom: '0', right: '8px', width: '280px', borderRadius: '8px 8px 0 0', backgroundColor: 'white', boxShadow: '0 -2px 10px rgba(0,0,0,0.1)', zIndex: '999999', fontSize: '14px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', overflow: 'hidden' }}, [
    div({ style: { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white' }}, [
      div({ style: { fontWeight: '600', fontSize: '16px' }}, ['Swiss Bank Prover']),
      button({ style: { background: 'transparent', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer', padding: '0', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }, onclick: 'minimizeUI' }, ['−'])
    ]),
    div({ style: { padding: '20px', backgroundColor: '#f8f9fa' }}, [
      div({ style: { marginBottom: '16px', padding: '12px', borderRadius: '6px', backgroundColor: header ? '#d4edda' : '#f8d7da', color: header ? '#155724' : '#721c24', border: \`1px solid \${header ? '#c3e6cb' : '#f5c6cb'}\`, fontWeight: '500' }}, [hasNecessaryHeader ? '✓ Cookie detected' : '⚠ No Cookie detected']),
      hasNecessaryHeader ? button({ style: { width: '100%', padding: '12px 24px', borderRadius: '6px', border: 'none', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', fontWeight: '600', fontSize: '15px', cursor: 'pointer', transition: 'all 0.2s ease', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', opacity: isRequestPending ? 0.5 : 1 }, onclick: 'onClick' }, [isRequestPending ? 'Generating Proof...' : 'Generate Proof']) : div({ style: { textAlign: 'center', color: '#666', padding: '12px', backgroundColor: '#fff3cd', borderRadius: '6px', border: '1px solid #ffeaa7' }}, ['Please login to continue'])
    ])
  ]);
}

export default { main, onClick, expandUI, minimizeUI, config };
`;

// Swiss Bank Solution (with CHF handler added)
const swissbankSolution = swissbankStarter.replace(
  '// TODO: add handler to reveal CHF balance here',
  `{ type: 'RECV', part: 'ALL', action: 'REVEAL', params: { type: 'regex', regex: '"CHF"\\\\s*:\\\\s*"[^"]+"' } },`
);

// Write files
writeFileSync(join(outputDir, 'twitter.js'), twitterPlugin);
writeFileSync(join(outputDir, 'swissbank-starter.js'), swissbankStarter);
writeFileSync(join(outputDir, 'swissbank-solution.js'), swissbankSolution);

console.log('Plugins built successfully!');
console.log(`  - twitter.js`);
console.log(`  - swissbank-starter.js`);
console.log(`  - swissbank-solution.js`);
