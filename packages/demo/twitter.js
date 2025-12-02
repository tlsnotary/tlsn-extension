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
    const isRequestPending = useState('isRequestPending', false);

    if (isRequestPending) return;

    setState('isRequestPending', true);

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
            maxRecvData: 4000,

            // Maximum bytes to send to server (request size limit)
            maxSentData: 2000,

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

function expandUI() {
    setState('isMinimized', false);
}

function minimizeUI() {
    setState('isMinimized', true);
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
    const isMinimized = useState('isMinimized', false);
    const isRequestPending = useState('isRequestPending', false);

    // Run once on plugin load: Open X.com in a new window
    // The empty dependency array [] means this runs only once
    // The opened window's requests will be intercepted by the plugin
    useEffect(() => {
        openWindow('https://x.com');
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
            }, ['X Profile Prover']),
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
            // Status indicator showing whether profile is detected
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
                header ? '✓ Profile detected' : '⚠ No profile detected'
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
                }, ['Please login to x.com to continue'])
            )
        ])
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
    expandUI,
    minimizeUI,
    config,
};
