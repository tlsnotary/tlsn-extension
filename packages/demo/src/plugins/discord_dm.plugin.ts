/// <reference types="@tlsn/plugin-sdk/src/globals" />

// @ts-ignore - These will be replaced at build time by Vite's define option
const VERIFIER_URL = VITE_VERIFIER_URL;
// @ts-ignore
const PROXY_URL_BASE = VITE_PROXY_URL;

const api = 'discord.com';
const ui = 'https://discord.com/channels/@me';

const config = {
    name: 'Discord DM Plugin',
    description: 'This plugin will prove your Discord direct messages.',
    requests: [
        {
            method: 'GET',
            host: 'discord.com',
            pathname: '/api/v9/users/@me/channels',
            verifierUrl: VERIFIER_URL,
        },
        {
            method: 'GET',
            host: 'discord.com',
            pathname: '/api/v9/channels/*/messages',
            verifierUrl: VERIFIER_URL,
        },
    ],
    urls: [
        'https://discord.com/*',
    ],
};

function getRelevantHeaderValues() {
    const [header] = useHeaders(headers => {
        return headers.filter(header =>
            header.url.includes(`https://${api}/api/v9/users/@me`) ||
            header.url.includes(`https://${api}/api/v9/channels`)
        );
    });

    const authorization = header?.requestHeaders.find(header => header.name === 'authorization')?.value;

    return { authorization };
}

async function fetchDMs() {
    const { authorization } = getRelevantHeaderValues();

    if (!authorization) return [];

    try {
        const headers = {
            authorization: authorization,
            Host: api,
            'Accept-Encoding': 'identity',
            Connection: 'close',
        };

        const response = await fetch(`https://${api}/api/v9/users/@me/channels`, {
            method: 'GET',
            headers: headers,
        });

        const channels = await response.json();

        // Filter only DM channels (type 1)
        return channels.filter((channel: any) => channel.type === 1).map((channel: any) => ({
            id: channel.id,
            name: channel.recipients?.[0]?.username || 'Unknown User',
            avatar: channel.recipients?.[0]?.avatar,
        }));
    } catch (error) {
        console.error('Error fetching DMs:', error);
        return [];
    }
}

async function onClick() {
    const isRequestPending = useState('isRequestPending', false);
    const selectedDMId = useState('selectedDMId', '');

    if (isRequestPending || !selectedDMId) return;

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
            url: `https://${api}/api/v9/channels/${selectedDMId}/messages?limit=50`,
            method: 'GET',
            headers: headers,
        },
        {
            verifierUrl: VERIFIER_URL,
            proxyUrl: PROXY_URL_BASE + api,
            maxRecvData: 8000,
            maxSentData: 2000,
            handlers: [
                { type: 'SENT', part: 'START_LINE', action: 'REVEAL' },
                { type: 'RECV', part: 'BODY', action: 'REVEAL', params: { type: 'json', path: '[*].content' } },
                { type: 'RECV', part: 'BODY', action: 'REVEAL', params: { type: 'json', path: '[*].author.username' } },
                { type: 'RECV', part: 'BODY', action: 'REVEAL', params: { type: 'json', path: '[*].timestamp' } },
            ]
        }
    );

    setState('isRequestPending', false);
    done(JSON.stringify(resp));
}

function selectDM(dmId: string) {
    setState('selectedDMId', dmId);
}

function expandUI() {
    setState('isMinimized', false);
}

function minimizeUI() {
    setState('isMinimized', true);
}

function main() {
    const { authorization } = getRelevantHeaderValues();
    const header_has_necessary_values = !!authorization;

    const isMinimized = useState('isMinimized', false);
    const isRequestPending = useState('isRequestPending', false);
    const selectedDMId = useState('selectedDMId', '');
    const dmList = useState('dmList', []);

    useEffect(() => {
        openWindow(ui);
    }, []);

    useEffect(() => {
        if (header_has_necessary_values && dmList.length === 0) {
            fetchDMs().then(dms => setState('dmList', dms));
        }
    }, [header_has_necessary_values]);

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
            }, ['Discord DM Proof']),
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
            // Step 1: Login Status
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
                header_has_necessary_values ? '✓ Discord token detected' : '⚠ No Discord token detected'
            ]),

            // Step 2: DM Selection
            header_has_necessary_values && dmList.length > 0 ? (
                div({
                    style: {
                        marginBottom: '16px',
                    }
                }, [
                    div({
                        style: {
                            marginBottom: '8px',
                            fontWeight: '600',
                            color: '#333',
                        }
                    }, ['Select a DM:']),
                    div({
                        style: {
                            maxHeight: '200px',
                            overflowY: 'auto',
                            border: '1px solid #ddd',
                            borderRadius: '6px',
                            backgroundColor: 'white',
                        }
                    }, dmList.map((dm: any) =>
                        div({
                            style: {
                                padding: '10px 12px',
                                cursor: 'pointer',
                                borderBottom: '1px solid #f0f0f0',
                                backgroundColor: selectedDMId === dm.id ? '#e3f2fd' : 'transparent',
                                transition: 'background-color 0.2s',
                            },
                            onclick: () => selectDM(dm.id),
                        }, [
                            div({
                                style: {
                                    fontWeight: selectedDMId === dm.id ? '600' : '400',
                                    color: '#333',
                                }
                            }, [dm.name])
                        ])
                    ))
                ])
            ) : null,

            // Step 3: Notarize Button
            header_has_necessary_values && selectedDMId ? (
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
            ) : header_has_necessary_values && dmList.length === 0 ? (
                div({
                    style: {
                        textAlign: 'center',
                        color: '#666',
                        padding: '12px',
                        backgroundColor: '#fff3cd',
                        borderRadius: '6px',
                        border: '1px solid #ffeaa7',
                    }
                }, ['Loading DMs...'])
            ) : !header_has_necessary_values ? (
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
            ) : null
        ])
    ]);
}

export default {
    main,
    onClick,
    expandUI,
    minimizeUI,
    fetchDMs,
    selectDM,
    config,
};