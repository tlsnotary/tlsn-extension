const config = {
    name: 'Spotify Top Artist',
    description: 'This plugin will prove your top artist on Spotify.',
};

const api = 'api.spotify.com';
const ui = 'https://developer.spotify.com/';
const top_artist_path = '/v1/me/top/artists?time_range=medium_term&limit=1';


async function onClick() {
    const isRequestPending = useState('isRequestPending', false);

    if (isRequestPending) return;

    setState('isRequestPending', true);

    const [header] = useHeaders(headers => {
        return headers.filter(header => header.url.includes(`https://${api}`));
    });

    // console.log('Intercepted Spotify API request header:', header);

    const headers = {
        authorization: header.requestHeaders.find(header => header.name === 'Authorization')?.value,
        Host: api,
        'Accept-Encoding': 'identity',
        Connection: 'close',
    };

    const resp = await prove(
        // -------------------------------------------------------------------------
        {
            url: `https://${api}${top_artist_path}`,  // Target API endpoint
            method: 'GET',                                        // HTTP method
            headers: headers,                                     // Authentication headers
        },
        {
            verifierUrl: 'http://localhost:7047',
            proxyUrl: 'ws://localhost:7047/proxy?token=api.spotify.com',
            maxRecvData: 2400,
            maxSentData: 600,
            handlers: [
                { type: 'SENT', part: 'START_LINE', action: 'REVEAL', },
                { type: 'RECV', part: 'START_LINE', action: 'REVEAL', },
                {
                    type: 'RECV', part: 'HEADERS', action: 'REVEAL', params: { key: 'date', },
                },
                {
                    type: 'RECV', part: 'BODY', action: 'REVEAL', params: { type: 'json', path: 'items[0].name', },
                    // type: 'RECV', part: 'BODY', action: 'REVEAL', params: { type: 'json', path: 'items[0].external_urls.spotify', },
                },
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
    const [header] = useHeaders(headers => headers.filter(h => h.url.includes(`https://${api}`)));
    // const [header] = useHeaders(headers => { return headers.filter(headers => headers.url.includes('https://api.spotify.com')) });

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
                backgroundColor: '#1DB954',
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
        }, ['🎵']);
    }

    return div({
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
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            overflow: 'hidden',
        },
    }, [
        div({
            style: {
                background: 'linear-gradient(135deg, #1DB954 0%, #1AA34A 100%)',
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
            }, ['Spotify Top Artist']),
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
                    backgroundColor: header ? '#d4edda' : '#f8d7da',
                    color: header ? '#155724' : '#721c24',
                    border: `1px solid ${header ? '#c3e6cb' : '#f5c6cb'}`,
                    fontWeight: '500',
                },
            }, [
                header ? '✓ Api token detected' : '⚠ No API token detected'
            ]),

            // Conditional UI based on whether we have intercepted the headers
            header ? (
                // Show prove button when not pending
                button({
                    style: {
                        width: '100%',
                        padding: '12px 24px',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #1DB954 0%, #1AA34A 100%)',
                        color: 'white',
                        fontWeight: '600',
                        fontSize: '15px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                        opacity: isRequestPending ? 0.5 : 1,
                        cursor: isRequestPending ? 'not-allowed' : 'pointer',
                    },
                    onclick: 'onClick',
                }, [isRequestPending ? 'Generating Proof...' : 'Generate Proof'])
            ) : (
                // Show login message
                div({
                    style: {
                        textAlign: 'center',
                        color: '#666',
                        padding: '12px',
                        backgroundColor: '#fff3cd',
                        borderRadius: '6px',
                        border: '1px solid #ffeaa7',
                    }
                }, ['Please login to Spotify to continue'])
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
