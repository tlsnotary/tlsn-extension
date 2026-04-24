import { useState, useCallback, useEffect } from 'react';
import { registerCorrelation, pollUntilComplete, AttestationResult } from '../relayer';
import { plugins } from '../plugins';
import { ConsoleEntry } from '../types';

interface Props {
  allChecksPass: boolean;
  addConsoleEntry: (message: string, type?: ConsoleEntry['type']) => void;
}

type Phase = 'idle' | 'connecting' | 'proving' | 'waiting' | 'complete' | 'error';

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      isMetaMask?: boolean;
    };
  }
}

const EASSCAN_BASE = 'https://sepolia.easscan.org/attestation/view';

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function loadSavedWallet(): {
  address: string | null;
  signature: string | null;
  message: string | null;
} {
  try {
    const saved = localStorage.getItem('tlsn_onchain_wallet');
    if (saved) {
      const { address, signature, message } = JSON.parse(saved);
      if (address && signature && message) {
        return { address, signature, message };
      }
    }
  } catch {
    // ignore corrupt localStorage
  }
  return { address: null, signature: null, message: null };
}

const savedWallet = loadSavedWallet();

export function OnchainDemo({ allChecksPass, addConsoleEntry }: Props) {
  const [attesterAddress, setAttesterAddress] = useState<string | null>(null);
  const [schemaUid, setSchemaUid] = useState<string | null>(null);
  const [serviceAvailable, setServiceAvailable] = useState<boolean | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(savedWallet.address);
  const [walletSignature, setWalletSignature] = useState<string | null>(savedWallet.signature);
  const [signMessage, setSignMessage] = useState<string | null>(savedWallet.message);
  const [phase, setPhase] = useState<Phase>('idle');
  const [attestation, setAttestation] = useState<AttestationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch attester address from eas-webhook service
  useEffect(() => {
    fetch('/api/info')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setAttesterAddress(data.attesterAddress);
        setSchemaUid(data.schemaUid);
        setServiceAvailable(!!data.attesterAddress && !!data.schemaUid);
      })
      .catch(() => setServiceAvailable(false));
  }, []);

  const disconnectWallet = useCallback(() => {
    setWalletAddress(null);
    setWalletSignature(null);
    setSignMessage(null);
    localStorage.removeItem('tlsn_onchain_wallet');
  }, []);

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      setError('MetaMask or compatible wallet not detected');
      return;
    }

    try {
      const accounts = (await window.ethereum.request({
        method: 'eth_requestAccounts',
      })) as string[];
      const address = accounts[0];
      setWalletAddress(address);

      // Sign challenge message
      const message = `Attest my Spotify data to ${address}`;
      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, address],
      });
      setWalletSignature(signature as string);
      setSignMessage(message);
      setError(null);
      localStorage.setItem('tlsn_onchain_wallet', JSON.stringify({ address, signature, message }));
      addConsoleEntry(`Wallet connected: ${truncateAddress(address)}`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Wallet connection failed';
      setError(msg);
      addConsoleEntry(`Wallet error: ${msg}`, 'error');
    }
  }, [addConsoleEntry]);

  const handleProveAndAttest = useCallback(async () => {
    if (!walletAddress || !walletSignature || !signMessage) return;

    setPhase('connecting');
    setError(null);
    setAttestation(null);

    try {
      // 1. Generate correlation ID
      const correlationId = crypto.randomUUID();
      const requestId = `onchain_spotify_${Date.now()}`;

      // 2. Register with relayer
      addConsoleEntry('Registering with EAS webhook service...', 'info');
      await registerCorrelation(correlationId, walletAddress, walletSignature, signMessage);

      // 3. Fetch and run Spotify plugin
      setPhase('proving');
      addConsoleEntry('Running Spotify plugin...', 'info');
      const pluginCode = await fetch(plugins.spotify.file).then((r) => r.text());
      await window.tlsn!.execCode(pluginCode, {
        requestId,
        sessionData: { correlationId },
      });
      addConsoleEntry('Spotify proof generated, waiting for attestation...', 'success');

      // 4. Poll for attestation
      setPhase('waiting');
      const result = await pollUntilComplete(correlationId);

      if (result.status === 'complete') {
        setPhase('complete');
        setAttestation(result);
        addConsoleEntry(`EAS attestation created for "${result.artistName}"`, 'success');
      } else {
        setPhase('error');
        setError(result.error || 'Attestation failed');
        addConsoleEntry(`Attestation error: ${result.error}`, 'error');
      }
    } catch (err) {
      setPhase('error');
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      addConsoleEntry(`Onchain demo error: ${msg}`, 'error');
    }
  }, [walletAddress, walletSignature, signMessage, addConsoleEntry]);

  const isRunning = phase !== 'idle' && phase !== 'complete' && phase !== 'error';
  const canStart =
    allChecksPass && walletAddress && walletSignature && !isRunning && serviceAvailable;

  return (
    <div className="content-card">
      <h2 className="section-title">Onchain Demo: Prove &amp; Attest on Ethereum</h2>
      <p className="section-subtitle">
        Prove your favorite Spotify artist and get an EAS attestation on Ethereum Testnet (Sepolia)
        — powered by the verifier's webhook system.
      </p>

      {serviceAvailable === false && (
        <div
          className="alert-box"
          style={{
            background: 'var(--warning-light)',
            borderColor: 'var(--warning)',
            marginBottom: '1rem',
          }}
        >
          <span className="alert-icon">&#9888;&#65039;</span>
          <span>
            Onchain attestation is not available — the EAS webhook service is not configured. See
            the{' '}
            <a
              href="https://github.com/tlsnotary/tlsn-extension/tree/main/packages/eas-webhook"
              target="_blank"
              rel="noopener noreferrer"
            >
              setup instructions
            </a>{' '}
            to enable it.
          </span>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '2rem',
          alignItems: 'start',
        }}
      >
        {/* Left: How it works */}
        <div
          style={{
            background: 'var(--gray-50)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--spacing-lg)',
          }}
        >
          <h3
            style={{
              margin: '0 0 1rem',
              fontSize: '1rem',
              fontWeight: 600,
              color: 'var(--gray-700)',
            }}
          >
            How it works
          </h3>
          {[
            'Connect your wallet',
            'Run the Spotify plugin to generate a TLS proof',
            'Verifier webhook sends verified data to EAS service',
            'EAS attestation is created on Ethereum Testnet (Sepolia)',
            'View your attestation on EASScan',
          ].map((step, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: '0.75rem',
                marginBottom: '0.75rem',
                alignItems: 'flex-start',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: 'var(--primary)',
                  color: 'white',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </span>
              <span style={{ color: 'var(--gray-600)', fontSize: '0.9rem', lineHeight: '24px' }}>
                {step}
              </span>
            </div>
          ))}
          {attesterAddress && (
            <div
              style={{
                marginTop: '0.75rem',
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                background: 'white',
                border: '1px solid var(--gray-200)',
                fontSize: '0.8rem',
                color: 'var(--gray-500)',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--gray-700)', marginBottom: '0.25rem' }}>
                Verifier attester address
              </div>
              <code style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{attesterAddress}</code>
            </div>
          )}
          <div
            style={{
              marginTop: '0.75rem',
              fontSize: '0.8rem',
              color: 'var(--gray-500)',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--gray-700)', marginBottom: '0.5rem' }}>
              Source code
            </div>
            {[
              {
                label: 'EAS webhook service',
                url: 'https://github.com/tlsnotary/tlsn-extension/tree/main/packages/eas-webhook',
              },
              {
                label: 'Verifier webhook config',
                url: 'https://github.com/tlsnotary/tlsn-extension/tree/main/packages/demo/verifier-config.yaml',
              },
              ...(schemaUid
                ? [
                    {
                      label: 'EAS attestation schema',
                      url: `https://sepolia.easscan.org/schema/view/${schemaUid}`,
                    },
                  ]
                : []),
            ].map((link) => (
              <div key={link.label} style={{ marginBottom: '0.25rem' }}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--primary)', textDecoration: 'none' }}
                >
                  {link.label} &#8599;
                </a>
              </div>
            ))}
            <div style={{ marginTop: '0.25rem', color: 'var(--gray-400)', fontStyle: 'italic' }}>
              Uses the same Spotify plugin as the demo above
            </div>
          </div>
        </div>

        {/* Right: Action panel */}
        <div>
          {/* Wallet connection */}
          {!walletAddress ? (
            <button
              onClick={connectWallet}
              style={{
                width: '100%',
                padding: '0.75rem 1.5rem',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: 'linear-gradient(135deg, #f6851b 0%, #e2761b 100%)',
                color: 'white',
                fontWeight: 600,
                fontSize: '1rem',
                cursor: 'pointer',
                marginBottom: '1rem',
              }}
            >
              Connect Wallet
            </button>
          ) : (
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--success-light)',
                color: '#065f46',
                fontWeight: 500,
                marginBottom: '1rem',
                fontSize: '0.9rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>Connected: {truncateAddress(walletAddress)}</span>
              <button
                onClick={disconnectWallet}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#065f46',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                Disconnect
              </button>
            </div>
          )}

          {/* Prove & Attest button */}
          <button
            onClick={handleProveAndAttest}
            disabled={!canStart}
            style={{
              width: '100%',
              padding: '0.75rem 1.5rem',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: canStart
                ? 'linear-gradient(135deg, #1DB954 0%, #1AA34A 100%)'
                : 'var(--gray-300)',
              color: 'white',
              fontWeight: 600,
              fontSize: '1rem',
              cursor: canStart ? 'pointer' : 'not-allowed',
              marginBottom: '1rem',
            }}
          >
            {isRunning ? phaseLabel(phase) : 'Prove & Attest Onchain'}
          </button>

          {/* Progress indicator */}
          {isRunning && (
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                background: '#eff6ff',
                border: '1px solid var(--primary-light)',
                fontSize: '0.85rem',
                color: 'var(--gray-700)',
                marginBottom: '1rem',
              }}
            >
              {phaseLabel(phase)}...
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--error-light)',
                color: '#991b1b',
                fontSize: '0.85rem',
                marginBottom: '1rem',
              }}
            >
              {error}
            </div>
          )}

          {/* Result card */}
          {attestation && attestation.status === 'complete' && (
            <div
              style={{
                padding: '1.25rem',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--success-light)',
                border: '1px solid #a7f3d0',
              }}
            >
              <div
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  marginBottom: '0.75rem',
                  color: '#065f46',
                }}
              >
                {attestation.artistName}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#047857', marginBottom: '0.5rem' }}>
                Server: {attestation.serverName}
              </div>
              <a
                href={`${EASSCAN_BASE}/${attestation.attestationUid}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  marginTop: '0.5rem',
                  padding: '0.5rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--primary)',
                  color: 'white',
                  textDecoration: 'none',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                }}
              >
                View on EASScan &#8599;
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function phaseLabel(phase: Phase): string {
  switch (phase) {
    case 'connecting':
      return 'Registering';
    case 'proving':
      return 'Generating proof';
    case 'waiting':
      return 'Waiting for attestation';
    default:
      return '';
  }
}
