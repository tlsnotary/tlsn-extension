const config = {
    name: 'Swiss Bank Prover',
    description: 'This plugin will prove your Swiss Bank account balance.',
};


async function onClick() {
    const [header] = useHeaders(headers => {
        console.log('Intercepted headers:', headers);
        return headers.filter(header => header.url.includes('https://swissbank.tlsnotary.org'));
    });

    const headers = {
        'cookie': header.requestHeaders.find(header => header.name === 'Cookie')?.value,
        Host: 'swissbank.tlsnotary.org',
        'Accept-Encoding': 'identity',
        Connection: 'close',
    };

    const resp = await prove(
        {
            url: 'https://swissbank.tlsnotary.org/balances',
            method: 'GET',
            headers: headers,
        },
        {
            // Verifier URL: The notary server that verifies the TLS connection
            // Must be running locally or accessible at this address
            verifierUrl: 'http://localhost:7047',
            proxyUrl: 'wss://notary.pse.dev/proxy?token=swissbank.tlsnotary.org',
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
                { type: 'RECV', part: 'BODY', action: 'REVEAL', params: { type: 'json', path: 'account_id' }, },
                { type: 'RECV', part: 'BODY', action: 'REVEAL', params: { type: 'json', path: 'accounts' }, },
            ]
        }
    );

    // Step 4: Complete plugin execution and return the proof result
    // done() signals that the plugin has finished and passes the result back
    done(JSON.stringify(resp));
}


function main() {
    const [header] = useHeaders(headers => headers.filter(header => header.url.includes('https://swissbank.tlsnotary.org/account')));

    // Run once on plugin load
    useEffect(() => {
        openWindow('https://swissbank.tlsnotary.org/login');
    }, []);

    // Render the plugin UI overlay
    // This creates a fixed-position widget in the bottom-right corner
    return div({
        style: {
            position: 'fixed',        // Fixed positioning relative to viewport
            bottom: '0',              // Anchor to bottom of screen
            right: '8px',             // 8px from right edge
            width: '240px',           // Fixed width
            height: '240px',          // Fixed height
            borderRadius: '4px 4px 0 0',  // Rounded top corners only
            backgroundColor: '#b8b8b8',   // Light gray background
            zIndex: '999999',         // Ensure it appears above page content
            fontSize: '16px',         // Base font size
            color: '#0f0f0f',         // Dark text color
            border: '1px solid #e2e2e2',  // Light border
            borderBottom: 'none',     // No bottom border (anchored to screen)
            padding: '8px',           // Internal spacing
            fontFamily: 'sans-serif', // Standard font
        },
    }, [
        // Status indicator showing whether profile is detected
        div({
            style: {
                fontWeight: 'bold',
                // Green if header detected, red if not
                color: header ? 'green' : 'red',
            },
        }, [header ? 'Profile detected!' : 'No profile detected']),

        // Conditional UI based on whether we have intercepted the headers
        // If header exists: Show "Prove" button that triggers onClick()
        // If header doesn't exist: Show "Please login" message
        header
            ? button({
                style: {
                    color: 'black',
                    backgroundColor: 'white',
                },
                // The onclick attribute references the onClick function name
                // When clicked, the onClick() function will be called
                onclick: 'onClick',
            }, ['Prove'])
            : div({ style: { color: 'black' } }, ['Please login'])
    ]);
}

export default {
    main,
    onClick,
    config,
};
