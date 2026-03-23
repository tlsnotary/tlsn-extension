import { trackOutboundClick } from '../analytics';

export function BuildYourOwn() {
    return (
        <div className="build-your-own">
            <div className="cta-content">
                <h2 className="cta-title">Ready to Build Your Own Plugin?</h2>
                <p className="cta-description">
                    Create custom plugins to prove data from any website.
                    Our SDK and documentation will help you get started in minutes.
                </p>

                <div className="cta-buttons">
                    <a
                        href="https://tlsnotary.org/docs/extension/plugins"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cta-btn cta-btn-primary"
                        onClick={() => trackOutboundClick('docs')}
                    >
                        📚 Read the Docs
                    </a>
                    <a
                        href="https://github.com/tlsnotary/tlsn-extension/tree/main/packages/demo/src/plugins"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cta-btn cta-btn-secondary"
                        onClick={() => trackOutboundClick('plugin_sources')}
                    >
                        💻 View Plugin Sources
                    </a>
                </div>

                <div className="cta-resources">
                    <h4 className="cta-resources-title">Resources</h4>
                    <ul className="cta-resources-list">
                        <li>
                            <a href="https://github.com/tlsnotary/tlsn-extension" target="_blank" rel="noopener noreferrer" onClick={() => trackOutboundClick('github')}>
                                GitHub Repository
                                <span className="resource-desc">— Extension source code and examples</span>
                            </a>
                        </li>
                        <li>
                            <a href="https://tlsnotary.org/docs/extension/plugins" target="_blank" rel="noopener noreferrer" onClick={() => trackOutboundClick('docs')}>
                                TLSNotary Plugin Documentation
                                <span className="resource-desc">— Complete protocol and API reference</span>
                            </a>
                        </li>
                        <li>
                            <a href="https://tlsnotary.org" target="_blank" rel="noopener noreferrer" onClick={() => trackOutboundClick('tlsnotary_home')}>
                                TLSNotary
                                <span className="resource-desc">— TLSNotary landing page</span>
                            </a>
                        </li>
                        <li>
                            <a href="https://discord.com/invite/9XwESXtcN7" target="_blank" rel="noopener noreferrer" onClick={() => trackOutboundClick('discord')}>
                                Discord Community
                                <span className="resource-desc">— Get help and share your plugins</span>
                            </a>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
