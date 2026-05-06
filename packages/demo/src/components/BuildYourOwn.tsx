import { trackOutboundClick } from '../analytics';

const TUTORIAL_URL = 'https://demo.tlsnotary.org/tutorial/';
const DOCS_URL = 'https://tlsnotary.org/docs/extension/plugins';
const DISCORD_URL = 'https://discord.com/invite/9XwESXtcN7';
const GITHUB_URL = 'https://github.com/tlsnotary/tlsn-extension';
const PLUGIN_SOURCES_URL =
  'https://github.com/tlsnotary/tlsn-extension/tree/main/packages/plugins/src';
const TLSNOTARY_URL = 'https://tlsnotary.org';

export function BuildYourOwn() {
  return (
    <div id="build-your-own" className="build-your-own">
      <div className="byo-header">
        <h2 className="cta-title">Build your own plugin</h2>
        <p className="cta-description">
          Learn the basics, ship your first plugin, and connect with other builders.
        </p>
      </div>

      <div className="tif-grid">
        <a
          href={TUTORIAL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="tif-card"
          onClick={() => trackOutboundClick('tutorial')}
        >
          <div className="tif-icon">📚</div>
          <h3 className="tif-card-title">Learn</h3>
          <p className="tif-card-description">
            Build your first plugin in 10 minutes. Step-by-step interactive tutorial.
          </p>
        </a>

        <a
          href={DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="tif-card"
          onClick={() => trackOutboundClick('docs')}
        >
          <div className="tif-icon">💻</div>
          <h3 className="tif-card-title">SDK &amp; docs</h3>
          <p className="tif-card-description">
            API reference, handler types, and the source for every plugin in this demo.
          </p>
        </a>

        <div className="tif-card tif-card-disabled" aria-disabled="true">
          <div className="tif-icon">📱</div>
          <h3 className="tif-card-title">
            Mobile <span className="tif-badge">Coming soon</span>
          </h3>
          <p className="tif-card-description">
            iOS and Android apps that run the same plugins. Get notified on Discord.
          </p>
        </div>

        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="tif-card"
          onClick={() => trackOutboundClick('discord')}
        >
          <div className="tif-icon">💬</div>
          <h3 className="tif-card-title">Community</h3>
          <p className="tif-card-description">
            Get help, share your plugins, and follow what TLSNotary contributors are building.
          </p>
        </a>
      </div>

      <div className="tif-footer">
        <a
          href={TLSNOTARY_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackOutboundClick('tlsnotary_home')}
        >
          tlsnotary.org
        </a>
        <span className="tif-footer-sep">·</span>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackOutboundClick('github')}
        >
          GitHub
        </a>
        <span className="tif-footer-sep">·</span>
        <a
          href={PLUGIN_SOURCES_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackOutboundClick('plugin_sources')}
        >
          Plugin sources
        </a>
      </div>
    </div>
  );
}
