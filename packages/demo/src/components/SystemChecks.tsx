import { CheckStatus } from '../types';


interface CheckItemProps {
    id: string;
    icon: string;
    label: string;
    status: CheckStatus;
    message: string;
    showInstructions?: boolean;
    onRecheck?: () => void;
}

export function CheckItem({ icon, label, status, message, showInstructions, onRecheck }: CheckItemProps) {
    return (
        <div className={`check-item ${status}`}>
            {icon} {label}: <span className={`status ${status}`}>{message}</span>
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
                <strong>System Checks:</strong>
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
                />
                <CheckItem
                    id="check-verifier"
                    icon="✅"
                    label="Verifier"
                    status={checks.verifier.status}
                    message={checks.verifier.message}
                    showInstructions={checks.verifier.showInstructions}
                    onRecheck={onRecheck}
                />
            </div>
        </>
    );
}
