export function HowItWorks() {
    return (
        <div className="how-it-works">
            <h2 className="how-it-works-title">How It Works</h2>
            <p className="how-it-works-subtitle">
                Experience cryptographic proof generation in three simple steps
            </p>

            <div className="steps-container">
                <div className="step">
                    <div className="step-number">1</div>
                    <div className="step-icon">🔌</div>
                    <h3 className="step-title">Run a Plugin</h3>
                    <p className="step-description">
                        Select a plugin and click "Run". A new browser window opens to the target website.
                    </p>
                </div>

                <div className="step-arrow">→</div>

                <div className="step">
                    <div className="step-number">2</div>
                    <div className="step-icon">🔐</div>
                    <h3 className="step-title">Create Proof</h3>
                    <p className="step-description">
                        Log in if needed, then click "Prove". TLSNotary creates a cryptographic proof of your data.
                    </p>
                </div>

                <div className="step-arrow">→</div>

                <div className="step">
                    <div className="step-number">3</div>
                    <div className="step-icon">✅</div>
                    <h3 className="step-title">Verify Result</h3>
                    <p className="step-description">
                        The proof is verified by the server. Only the data you chose to reveal is shared.
                    </p>
                </div>
            </div>

            <div className="how-it-works-note">
                <span className="note-icon">💡</span>
                <span>
                    <strong>Your data stays private:</strong> Plugins run inside the TLSNotary extension's secure sandbox.
                    Data flows through your browser — never through third-party servers.
                </span>
            </div>
        </div>
    );
}
