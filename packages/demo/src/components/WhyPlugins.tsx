export function WhyPlugins() {
    return (
        <div className="why-plugins">
            <h2 className="why-plugins-title">Why Plugins?</h2>
            <p className="why-plugins-subtitle">
                TLSNotary plugins provide a secure, flexible way to prove and verify web data
            </p>

            <div className="benefits-grid">
                <div className="benefit-card">
                    <div className="benefit-icon">🔒</div>
                    <h3 className="benefit-title">Secure by Design</h3>
                    <p className="benefit-description">
                        Plugins run inside the TLSNotary extension's sandboxed environment.
                        Your credentials and sensitive data never leave your browser.
                    </p>
                </div>

                <div className="benefit-card">
                    <div className="benefit-icon">👤</div>
                    <h3 className="benefit-title">User-Controlled</h3>
                    <p className="benefit-description">
                        Data flows through the user's browser — not third-party servers.
                        You choose exactly what data to reveal in each proof.
                    </p>
                </div>

                <div className="benefit-card">
                    <div className="benefit-icon">⚡</div>
                    <h3 className="benefit-title">Easy to Build</h3>
                    <p className="benefit-description">
                        Write plugins in JavaScript with a simple API.
                        Intercept requests, create proofs, and build custom UIs with minimal code.
                    </p>
                </div>
            </div>
        </div>
    );
}
