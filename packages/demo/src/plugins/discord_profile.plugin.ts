/// <reference types="@tlsn/plugin-sdk/src/globals" />

// @ts-ignore - These will be replaced at build time by Vite's define option
const VERIFIER_URL = VITE_VERIFIER_URL;
// @ts-ignore
const PROXY_URL_BASE = VITE_PROXY_URL;
const api = 'discord.com';
const ui = `https://${api}/channels/@me`;

const config = {
    name: 'Discord Profile Plugin',
    description: 'This plugin will prove your Discord username and ID.',
    requests: [
        {
            method: 'GET',
            host: api,
            pathname: '/api/v9/users/@me',
            verifierUrl: VERIFIER_URL,
        },
    ],
    urls: [
        `https://${api}/*`,
    ],
};

function getRelevantHeaderValues() {
    const [header] = useHeaders(headers => {
        console.log('All captured headers:', headers);
        // Find the first header that contains an 'authorization' request header, regardless of URL
        return headers.filter(h =>
            h.requestHeaders.some(rh => rh.name === 'authorization')
        );
    });

    const authorization = header?.requestHeaders.find(h => h.name === 'authorization')?.value;

    return { authorization };
}

async function onClick() {
    const isRequestPending = useState('isRequestPending', false);

    if (isRequestPending) return;

    setState('isRequestPending', true);

    const { authorization } = getRelevantHeaderValues();

    const headers = {
        authorization: authorization,
        Host: api,
        'Accept-Encoding': 'identity',
        Connection: 'close',
    };

    const resp = await prove(
        {
            url: `https://${api}/api/v9/users/@me`,
            method: 'GET',
            headers: headers,
        },
        {
            verifierUrl: VERIFIER_URL,
            proxyUrl: PROXY_URL_BASE + api,
            maxRecvData: 2000,
            maxSentData: 1000,
            handlers: [
                { type: 'SENT', part: 'START_LINE', action: 'REVEAL' },
                { type: 'RECV', part: 'BODY', action: 'REVEAL', params: { type: 'json', path: 'username' } },
                { type: 'RECV', part: 'BODY', action: 'REVEAL', params: { type: 'json', path: 'id' } },
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
    const { authorization } = getRelevantHeaderValues();

    console.log('🚀🚀🚀🚀🚀🚀🚀 Authorization Header:', authorization);

    const header_has_necessary_values = !!authorization;

    const isMinimized = useState('isMinimized', false);
    const isRequestPending = useState('isRequestPending', false);

    useEffect(() => {
        openWindow(ui);
    }, []);

    if (isMinimized) {
        return div({
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
        }, ['💬']);
    }

    return div({
        style: {
            position: 'fixed',
            bottom: '0',
            right: '8px',
            width: '320px',
            borderRadius: '8px 8px 0 0',
            backgroundColor: 'white',
            boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
            zIndex: '999999',
            fontSize: '14px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            overflow: 'hidden',
        },
    }, [
        div({
            style: {
                background: 'linear-gradient(135deg, #5865F2 0%, #4752C4 100%)',
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                color: 'white',
            }
        }, [
            div({
                style: {
                    fontWeight: '600',
                    fontSize: '16px',
                }
            }, ['Discord Profile Proof']),
            button({
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
            }, ['−'])
        ]),

        div({
            style: {
                padding: '20px',
                backgroundColor: '#f8f9fa',
            }
        }, [
            div({
                style: {
                    marginBottom: '16px',
                    padding: '12px',
                    borderRadius: '6px',
                    backgroundColor: header_has_necessary_values ? '#d4edda' : '#f8d7da',
                    color: header_has_necessary_values ? '#155724' : '#721c24',
                    border: `1px solid ${header_has_necessary_values ? '#c3e6cb' : '#f5c6cb'}`,
                    fontWeight: '500',
                },
            }, [
                header_has_necessary_values ? '✓ Discord token detected' : '⚠ Please login to Discord'
            ]),

            header_has_necessary_values ? (
                button({
                    style: {
                        width: '100%',
                        padding: '12px 24px',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #5865F2 0%, #4752C4 100%)',
                        color: 'white',
                        fontWeight: '600',
                        fontSize: '15px',
                        cursor: isRequestPending ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                        opacity: isRequestPending ? 0.5 : 1,
                    },
                    onclick: 'onClick',
                }, [isRequestPending ? 'Generating Proof...' : 'Generate Proof'])
            ) : (
                div({
                    style: {
                        textAlign: 'center',
                        color: '#666',
                        padding: '12px',
                        backgroundColor: '#fff3cd',
                        borderRadius: '6px',
                        border: '1px solid #ffeaa7',
                    }
                }, ['Please login to Discord to continue'])
            )
        ])
    ]);
}

export default {
    main,
    onClick,
    expandUI,
    minimizeUI,
    config,
};