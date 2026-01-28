/// <reference types="@tlsn/plugin-sdk/src/globals" />

// Environment variables injected at build time
// @ts-ignore - These will be replaced at build time by Vite's define option
const VERIFIER_URL = VITE_VERIFIER_URL;
// @ts-ignore
const PROXY_URL_BASE = VITE_PROXY_URL;

// =============================================================================
// PLUGIN CONFIGURATION
// =============================================================================
/**
 * The config object defines plugin metadata displayed to users.
 * This information appears in the plugin selection UI.
 */
const config = {
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
    urls: [
        'https://x.com/*',
    ],
};


// =============================================================================
// PROOF GENERATION CALLBACK
// =============================================================================
/**
 * This function is triggered when the user clicks the "Prove" button.
 * It extracts authentication headers from intercepted requests and generates
 * a TLSNotary proof using the unified prove() API.
 */
async function onClick() {
    const isRequestPending = useState('isRequestPending', false);

    if (isRequestPending) return;

    setState('isRequestPending', true);

    // Use cached values from state
    const cachedCookie = useState('cookie', null);
    const cachedCsrfToken = useState('x-csrf-token', null);
    const cachedTransactionId = useState('x-client-transaction-id', null);
    const cachedAuthorization = useState('authorization', null);

    if (!cachedCookie || !cachedCsrfToken || !cachedAuthorization) {
        setState('isRequestPending', false);
        return;
    }

    const headers = {
        'cookie': cachedCookie,
        'x-csrf-token': cachedCsrfToken,
        ...(cachedTransactionId ? { 'x-client-transaction-id': cachedTransactionId } : {}),
        Host: 'api.x.com',
        authorization: cachedAuthorization,
        'Accept-Encoding': 'identity',
        Connection: 'close',
    };

    const resp = await prove(
        {
            url: 'https://api.x.com/1.1/account/settings.json',
            method: 'GET',
            headers: headers as unknown as Record<string, string>,
        },
        {
            verifierUrl: VERIFIER_URL,
            proxyUrl: PROXY_URL_BASE + 'api.x.com',
            maxRecvData: 4000,
            maxSentData: 2000,
            handlers: [
                { type: 'SENT', part: 'START_LINE', action: 'REVEAL' },
                { type: 'RECV', part: 'START_LINE', action: 'REVEAL' },
                {
                    type: 'RECV',
                    part: 'HEADERS',
                    action: 'REVEAL',
                    params: { key: 'date' },
                },
                {
                    type: 'RECV',
                    part: 'BODY',
                    action: 'REVEAL',
                    params: {
                        type: 'json',
                        path: 'screen_name',
                    },
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

// =============================================================================
// MAIN UI FUNCTION
// =============================================================================
function main() {
    const isMinimized = useState('isMinimized', false);
    const isRequestPending = useState('isRequestPending', false);
    const cachedCookie = useState('cookie', null);
    const cachedCsrfToken = useState('x-csrf-token', null);
    const cachedTransactionId = useState('x-client-transaction-id', null);
    const cachedAuthorization = useState('authorization', null);

    // Only search for header values if not already cached
    if (!cachedCookie || !cachedCsrfToken || !cachedAuthorization) {
        const [header] = useHeaders((headers: any[]) =>
            headers.filter(h => h.url.includes('https://api.x.com/1.1/account/settings.json'))
        );

        if (header) {
            const cookie = header.requestHeaders.find((h: any) => h.name === 'Cookie')?.value;
            const csrfToken = header.requestHeaders.find((h: any) => h.name === 'x-csrf-token')?.value;
            const transactionId = header.requestHeaders.find((h: any) => h.name === 'x-client-transaction-id')?.value;
            const authorization = header.requestHeaders.find((h: any) => h.name === 'authorization')?.value;

            if (cookie && !cachedCookie) {
                setState('cookie', cookie);
                console.log('Cookie found');
            }
            if (csrfToken && !cachedCsrfToken) {
                setState('x-csrf-token', csrfToken);
                console.log('CSRF token found');
            }
            if (transactionId && !cachedTransactionId) {
                setState('x-client-transaction-id', transactionId);
                console.log('Transaction ID found');
            }
            if (authorization && !cachedAuthorization) {
                setState('authorization', authorization);
                console.log('Authorization found');
            }
        }
    }

    const header = cachedCookie && cachedCsrfToken && cachedAuthorization;

    useEffect(() => {
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
                        ['X Profile Prover']
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
                                backgroundColor: header ? '#d4edda' : '#f8d7da',
                                color: header ? '#155724' : '#721c24',
                                border: `1px solid ${header ? '#c3e6cb' : '#f5c6cb'}`,
                                fontWeight: '500',
                            },
                        },
                        [header ? '✓ Profile detected' : '⚠ No profile detected']
                    ),
                    header
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
                            ['Please login to x.com to continue']
                        ),
                ]
            ),
        ]
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
