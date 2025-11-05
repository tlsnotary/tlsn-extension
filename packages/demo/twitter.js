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
};

// =============================================================================
// PROOF GENERATION CALLBACK
// =============================================================================
/**
 * This function is triggered when the user clicks the "Prove" button.
 * It extracts authentication headers from intercepted requests and generates
 * a TLSNotary proof using the unified prove() API.
 *
 * Flow:
 * 1. Get the intercepted X.com API request headers
 * 2. Extract authentication headers (Cookie, CSRF token, OAuth token, etc.)
 * 3. Call prove() with the request configuration and reveal handlers
 * 4. prove() internally:
 *    - Creates a prover connection to the verifier
 *    - Sends the HTTP request through the TLS prover
 *    - Captures the TLS transcript (sent/received bytes)
 *    - Parses the transcript with byte-level range tracking
 *    - Applies selective reveal handlers to show only specified data
 *    - Generates and returns the cryptographic proof
 * 5. Return the proof result to the caller via done()
 */
async function onClick() {
    // Step 1: Get the intercepted header from the X.com API request
    // useHeaders() provides access to all intercepted HTTP request headers
    // We filter for the specific X.com API endpoint we want to prove
    const [header] = useHeaders(headers => {
        return headers.filter(header => header.url.includes('https://api.x.com/1.1/account/settings.json'));
    });

    // Step 2: Extract authentication headers from the intercepted request
    // These headers are required to authenticate with the X.com API
    const headers = {
        // Cookie: Session authentication token
        'cookie': header.requestHeaders.find(header => header.name === 'Cookie')?.value,

        // X-CSRF-Token: Cross-Site Request Forgery protection token
        'x-csrf-token': header.requestHeaders.find(header => header.name === 'x-csrf-token')?.value,

        // X-Client-Transaction-ID: Request tracking identifier
        'x-client-transaction-id': header.requestHeaders.find(header => header.name === 'x-client-transaction-id')?.value,

        // Host: Target server hostname
        Host: 'api.x.com',

        // Authorization: OAuth bearer token for API authentication
        authorization: header.requestHeaders.find(header => header.name === 'authorization')?.value,

        // Accept-Encoding: Must be 'identity' for TLSNotary (no compression)
        // TLSNotary requires uncompressed data to verify byte-for-byte
        'Accept-Encoding': 'identity',

        // Connection: Use 'close' to complete the connection after one request
        Connection: 'close',
    };

    // Step 3: Generate TLS proof using the unified prove() API
    // This single function handles the entire proof generation pipeline
    const resp = await prove(
        // -------------------------------------------------------------------------
        // REQUEST OPTIONS
        // -------------------------------------------------------------------------
        // Defines the HTTP request to be proven
        {
            url: 'https://api.x.com/1.1/account/settings.json',  // Target API endpoint
            method: 'GET',                                        // HTTP method
            headers: headers,                                     // Authentication headers
        },

        // -------------------------------------------------------------------------
        // PROVER OPTIONS
        // -------------------------------------------------------------------------
        // Configures the TLS proof generation process
        {
            // Verifier URL: The notary server that verifies the TLS connection
            // Must be running locally or accessible at this address
            verifierUrl: 'http://localhost:7047',

            // Proxy URL: WebSocket proxy that relays TLS data to the target server
            // The token parameter specifies which server to connect to
            proxyUrl: 'wss://notary.pse.dev/proxy?token=api.x.com',

            // Maximum bytes to receive from server (response size limit)
            maxRecvData: 2600,

            // Maximum bytes to send to server (request size limit)
            maxSentData: 1300,

            // -----------------------------------------------------------------------
            // HANDLERS
            // -----------------------------------------------------------------------
            // These handlers specify which parts of the TLS transcript to reveal
            // in the proof. Unrevealed data is redacted for privacy.
            handlers: [
                // Reveal the request start line (GET /path HTTP/1.1)
                // This proves the HTTP method and path were sent
                {
                    type: 'SENT',           // Direction: data sent to server
                    part: 'START_LINE',     // Part: HTTP request line
                    action: 'REVEAL',       // Action: include as plaintext in proof
                },

                // Reveal the response start line (HTTP/1.1 200 OK)
                // This proves the server responded with status code 200
                {
                    type: 'RECV',           // Direction: data received from server
                    part: 'START_LINE',     // Part: HTTP response line
                    action: 'REVEAL',       // Action: include as plaintext in proof
                },

                // Reveal the 'date' header from the response
                // This proves when the server generated the response
                {
                    type: 'RECV',           // Direction: data received from server
                    part: 'HEADERS',        // Part: HTTP headers
                    action: 'REVEAL',       // Action: include as plaintext in proof
                    params: {
                        key: 'date',          // Specific header to reveal
                    },
                },

                // Reveal the 'screen_name' field from the JSON response body
                // This proves the X.com username without revealing other profile data
                {
                    type: 'RECV',           // Direction: data received from server
                    part: 'BODY',           // Part: HTTP response body
                    action: 'REVEAL',       // Action: include as plaintext in proof
                    params: {
                        type: 'json',         // Body format: JSON
                        path: 'screen_name',  // JSON field to reveal (top-level only)
                    },
                },
            ]
        }
    );

    // Step 4: Complete plugin execution and return the proof result
    // done() signals that the plugin has finished and passes the result back
    done(JSON.stringify(resp));
}

// =============================================================================
// MAIN UI FUNCTION
// =============================================================================
/**
 * The main() function is called reactively whenever plugin state changes.
 * It returns a DOM structure that is rendered as the plugin UI.
 *
 * React-like Hooks Used:
 * - useHeaders(): Subscribes to intercepted HTTP request headers
 * - useEffect(): Runs side effects when dependencies change
 *
 * UI Flow:
 * 1. Check if X.com API request headers have been intercepted
 * 2. If not intercepted yet: Show "Please login" message
 * 3. If intercepted: Show "Profile detected" with a "Prove" button
 * 4. On first render: Open X.com in a new window to trigger login
 */
function main() {
    // Subscribe to intercepted headers for the X.com API endpoint
    // This will reactively update whenever new headers matching the filter arrive
    const [header] = useHeaders(headers => headers.filter(header => header.url.includes('https://api.x.com/1.1/account/settings.json')));

    // Run once on plugin load: Open X.com in a new window
    // The empty dependency array [] means this runs only once
    // The opened window's requests will be intercepted by the plugin
    useEffect(() => {
        openWindow('https://x.com');
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
            : div({ style: { color: 'black' } }, ['Please login to x.com'])
    ]);
}

// =============================================================================
// PLUGIN EXPORTS
// =============================================================================
/**
 * All plugins must export an object with these properties:
 * - main: The reactive UI rendering function
 * - onClick: Click handler callback for buttons
 * - config: Plugin metadata
 */
export default {
    main,
    onClick,
    config,
};
