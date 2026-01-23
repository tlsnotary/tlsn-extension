import { useState } from 'react';

interface StatusBarProps {
    browserOk: boolean;
    extensionOk: boolean;
    verifierOk: boolean;
    onRecheck: () => void;
    detailsContent?: React.ReactNode;
}

export function StatusBar({
    browserOk,
    extensionOk,
    verifierOk,
    onRecheck,
    detailsContent,
}: StatusBarProps) {
    const [showDetails, setShowDetails] = useState(false);
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
                        <button className="btn-recheck" onClick={onRecheck}>
                            Recheck
                        </button>
                    )}
                    <button
                        className={`btn-details ${showDetails ? 'expanded' : ''}`}
                        onClick={() => setShowDetails(!showDetails)}
                    >
                        <span className="btn-details-icon">{showDetails ? '▼' : '▶'}</span>
                        <span>Details</span>
                    </button>
                </div>
            </div>

            {
                someIssues && (
                    <div className="status-help">
                        {!browserOk && <div>Please use a Chrome-based browser (Chrome, Edge, Brave)</div>}
                        {!extensionOk && (
                            <div>
                                TLSNotary extension not detected.{' '}
                                <a href="https://chromewebstore.google.com/detail/tlsnotary/gnoglgpcamodhflknhmafmjdahcejcgg?authuser=2&hl=en" target="_blank" rel="noopener noreferrer">
                                    Install extension
                                </a>
                                {' '}then <strong>refresh this page</strong>.
                            </div>
                        )}
                        {!verifierOk && (
                            <div>
                                Verifier server not running. Start it with: <code>cd packages/verifier; cargo run --release</code>
                            </div>
                        )}
                    </div>
                )
            }

            {
                showDetails && detailsContent && (
                    <div className="status-details-content">
                        {detailsContent}
                    </div>
                )
            }
        </div >
    );
}
