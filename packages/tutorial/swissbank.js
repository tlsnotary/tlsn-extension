const config = {
    name: 'Swiss Bank Prover',
    description: 'This plugin will prove your Swiss Bank account balance.',
};

const host = TODO; // hostname of the swiss bank website
const ui_path = '/account';
const path = '/TODO'; // path to the balances json file
const url = `https://${host}${path}`;


async function onClick() {
    const isRequestPending = useState('isRequestPending', false);

    if (isRequestPending) return;

    setState('isRequestPending', true);
    const [header] = useHeaders(headers => {
        console.log('Intercepted headers:', headers);
        return headers.filter(header => header.url.includes(`https://${host}`));
    });

    const headers = {
        'cookie': header.requestHeaders.find(header => header.name === 'Cookie')?.value,
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
            // Verifier URL: The notary server that verifies the TLS connection
            verifierUrl: 'http://localhost:7047',
            proxyUrl: 'wss://notary.pse.dev/proxy?token=swissbank.tlsnotary.org',
            // proxyUrl: 'ws://localhost:55688',
            maxRecvData: 460, // Maximum bytes to receive from server (response size limit)
            maxSentData: 180,// Maximum bytes to send to server (request size limit)

            // -----------------------------------------------------------------------
            // HANDLERS
            // -----------------------------------------------------------------------
            // These handlers specify which parts of the TLS transcript to reveal
            // in the proof. Unrevealed data is redacted for privacy.
            handlers: [
                { type: 'SENT', part: 'START_LINE', action: 'REVEAL', },
                { type: 'RECV', part: 'START_LINE', action: 'REVEAL', },
                { type: 'RECV', part: 'BODY', action: 'REVEAL', params: { type: 'json', path: 'account_id' }, },]
        }
    );

    // Step 4: Complete plugin execution and return the proof result
    // done() signals that the plugin has finished and passes the result back
    done(JSON.stringify(resp));
}

function expandUI() {
    setState('isMinimized', false);
}

function minimizeUI() {
    setState('isMinimized', true);
}
function main() {
    const [header] = useHeaders(
        headers => headers
            .filter(header => header.url.includes(`https://${host}${ui_path}`))
    );


    const hasNecessaryHeader = header?.requestHeaders.some(h => h.name === 'Cookie');
    const isMinimized = useState('isMinimized', false);
    const isRequestPending = useState('isRequestPending', false);

    // Run once on plugin load
    useEffect(() => {
        openWindow(`https://${host}${ui_path}`);
    }, []);

    // If minimized, show floating action button
    if (isMinimized) {
        return div({
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
        }, ['🔐']);
    }

    // Render the plugin UI overlay
    // This creates a fixed-position widget in the bottom-right corner
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
        // Header with minimize button
        div({
            style: {
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
            }, ['Swiss Bank Prover']),
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

        // Content area
        div({
            style: {
                padding: '20px',
                backgroundColor: '#f8f9fa',
            }
        }, [
            // Status indicator showing whether cookie is detected
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
                hasNecessaryHeader ? '✓ Cookie detected' : '⚠ No Cookie detected'
            ]),

            // Conditional UI based on whether we have intercepted the headers
            hasNecessaryHeader ? (
                // Show prove button when not pending
                button({
                    style: {
                        width: '100%',
                        padding: '12px 24px',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
                }, ['Please login to continue'])
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
