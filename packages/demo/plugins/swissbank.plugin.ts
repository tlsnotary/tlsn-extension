/// <reference types="@tlsn/plugin-sdk/src/globals" />

// Environment variables injected at build time
// @ts-ignore - These will be replaced at build time by Vite's define option
const VERIFIER_URL = VITE_VERIFIER_URL;
// @ts-ignore
const PROXY_URL_BASE = VITE_PROXY_URL;

const config = {
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
    urls: [
        'https://swissbank.tlsnotary.org/*',
    ],
};

const host = 'swissbank.tlsnotary.org';
const ui_path = '/account';
const path = '/balances';
const url = `https://${host}${path}`;

async function onClick() {
    const isRequestPending = useState('isRequestPending', false);

    if (isRequestPending) return;

    setState('isRequestPending', true);

    // Use cached cookie from state
    const cachedCookie = useState('cookie', null);

    if (!cachedCookie) {
        setState('isRequestPending', false);
        return;
    }

    const headers = {
        'cookie': cachedCookie,
        Host: host,
        'Accept-Encoding': 'identity',
        Connection: 'close',
    };

    const resp = await prove(
        {
            url: url,
            method: 'GET',
            headers: headers,
        },
        {
            verifierUrl: VERIFIER_URL,
            proxyUrl: PROXY_URL_BASE + 'swissbank.tlsnotary.org',
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
    const isMinimized = useState('isMinimized', false);
    const isRequestPending = useState('isRequestPending', false);
    const cachedCookie = useState('cookie', null);

    // Only search for cookie if not already cached
    if (!cachedCookie) {
        const [header] = useHeaders((headers: any[]) =>
            headers.filter(h => h.url.includes(`https://${host}`))
        );

        if (header) {
            const cookie = header.requestHeaders.find((h: any) => h.name === 'Cookie')?.value;
            if (cookie) {
                setState('cookie', cookie);
                console.log('Cookie found');
            }
        }
    }

    useEffect(() => {
        openWindow(`https://${host}${ui_path}`);
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
            ['🔐']
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
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        padding: '12px 16px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        color: 'white',
                    },
                },
                [
                    div(
                        {
                            style: {
                                fontWeight: '600',
                                fontSize: '16px',
                            },
                        },
                        ['Swiss Bank Prover']
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
                        ['−']
                    ),
                ]
            ),
            div(
                {
                    style: {
                        padding: '20px',
                        backgroundColor: '#f8f9fa',
                    },
                },
                [
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
                        [cachedCookie ? '✓ Cookie detected' : '⚠ No Cookie detected']
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
                                    opacity: isRequestPending ? 0.5 : 1,
                                    cursor: isRequestPending ? 'not-allowed' : 'pointer',
                                },
                                onclick: 'onClick',
                            },
                            [isRequestPending ? 'Generating Proof...' : 'Generate Proof']
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
                            ['Please login to continue']
                        ),
                ]
            ),
        ]
    );
}

export default {
    main,
    onClick,
    expandUI,
    minimizeUI,
    config,
};
