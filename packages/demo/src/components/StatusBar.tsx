interface StatusBarProps {
    browserOk: boolean;
    extensionOk: boolean;
    verifierOk: boolean;
    onRecheckVerifier: () => void;
    onShowDetails: () => void;
}

export function StatusBar({
    browserOk,
    extensionOk,
    verifierOk,
    onRecheckVerifier,
    onShowDetails,
}: StatusBarProps) {
    const allOk = browserOk && extensionOk && verifierOk;
    const someIssues = !allOk;

    return (
        <div className={`status-bar ${allOk ? 'status-ready' : 'status-issues'}`}>
            <div className="status-bar-content">
                <div className="status-indicator">
                    {allOk ? (
                        <>
                            <span className="status-icon">✓</span>
                            <span className="status-text">System Ready</span>
                        </>
                    ) : (
                        <>
                            <span className="status-icon">⚠</span>
                            <span className="status-text">Setup Required</span>
                        </>
                    )}
                </div>

                <div className="status-items">
                    <div className={`status-badge ${browserOk ? 'ok' : 'error'}`}>
                        Browser: {browserOk ? '✓' : '✗'}
                    </div>
                    <div className={`status-badge ${extensionOk ? 'ok' : 'error'}`}>
                        Extension: {extensionOk ? '✓' : '✗'}
                    </div>
                    <div className={`status-badge ${verifierOk ? 'ok' : 'error'}`}>
                        Verifier: {verifierOk ? '✓' : '✗'}
                    </div>
                </div>

                <div className="status-actions">
                    {!verifierOk && (
                        <button className="btn-recheck" onClick={onRecheckVerifier}>
                            Recheck
                        </button>
                    )}
                    <button className="btn-details" onClick={onShowDetails}>
                        Details
                    </button>
                </div>
            </div>

            {someIssues && (
                <div className="status-help">
                    {!browserOk && <div>Please use a Chrome-based browser (Chrome, Edge, Brave)</div>}
                    {!extensionOk && (
                        <div>
                            TLSNotary extension not detected.{' '}
                            <a href="chrome://extensions/" target="_blank" rel="noopener noreferrer">
                                Install extension
                            </a>
                        </div>
                    )}
                    {!verifierOk && (
                        <div>
                            Verifier server not running. Start it with: <code>cd packages/verifier; cargo run --release</code>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
