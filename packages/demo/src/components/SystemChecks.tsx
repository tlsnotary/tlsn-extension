import { CheckStatus } from '../types';
import { config } from '../config';

const CHROME_STORE_URL =
  'https://chromewebstore.google.com/detail/tlsnotary/gnoglgpcamodhflknhmafmjdahcejcgg';

interface CheckLink {
  href: string;
  label: string;
}

interface CheckItemProps {
  id: string;
  icon: string;
  label: string;
  status: CheckStatus;
  message: string;
  showInstructions?: boolean;
  onRecheck?: () => void;
  link?: CheckLink;
}

export function CheckItem({
  icon,
  label,
  status,
  message,
  showInstructions,
  onRecheck,
  link,
}: CheckItemProps) {
  return (
    <div className={`check-item ${status}`}>
      <div className="check-item-row">
        {icon} {label}: <span className={`status ${status}`}>{message}</span>
      </div>
      {link && (
        <div className="check-item-link">
          <a href={link.href} target="_blank" rel="noopener noreferrer">
            {link.label} →
          </a>
        </div>
      )}
      {showInstructions && (
        <div style={{ marginTop: '10px', fontSize: '14px' }}>
          <p>Start the verifier server:</p>
          <code>cd packages/verifier; cargo run --release</code>
          {onRecheck && (
            <button onClick={onRecheck} style={{ marginLeft: '10px', padding: '5px 10px' }}>
              Check Again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface SystemChecksProps {
  checks: {
    browser: { status: CheckStatus; message: string };
    extension: { status: CheckStatus; message: string };
    verifier: { status: CheckStatus; message: string; showInstructions: boolean };
  };
  onRecheck: () => void;
  showBrowserWarning: boolean;
}

export function SystemChecks({ checks, onRecheck, showBrowserWarning }: SystemChecksProps) {
  return (
    <>
      {showBrowserWarning && (
        <div className="warning-box">
          <h3>⚠️ Browser Compatibility</h3>
          <p>
            <strong>Unsupported Browser Detected</strong>
          </p>
          <p>TLSNotary extension requires a Chrome-based browser (Chrome, Edge, Brave, etc.).</p>
          <p>Please switch to a supported browser to continue.</p>
        </div>
      )}

      <div>
        <CheckItem
          id="check-browser"
          icon="🌐"
          label="Browser"
          status={checks.browser.status}
          message={checks.browser.message}
        />
        <CheckItem
          id="check-extension"
          icon="🔌"
          label="Extension"
          status={checks.extension.status}
          message={checks.extension.message}
          link={{ href: CHROME_STORE_URL, label: 'View in Chrome Web Store' }}
        />
        <CheckItem
          id="check-verifier"
          icon="✅"
          label="Verifier"
          status={checks.verifier.status}
          message={checks.verifier.message}
          showInstructions={checks.verifier.showInstructions}
          onRecheck={onRecheck}
          link={{ href: `${config.verifierUrl}/info`, label: `${config.verifierUrl}/info` }}
        />
      </div>
    </>
  );
}
