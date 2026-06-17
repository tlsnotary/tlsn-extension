import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import type { DataConnection } from 'peerjs';
import { bytesToBase64, base64ToBytes, toUint8Array } from '@tlsn/common';
import { plugins } from '../plugins';
import { usePeerDialer, usePeerHost } from './usePeerConnection';
import {
  initWasmRuntime,
  runVerifierSession,
  VerifierResult,
  WasmRuntimeStatus,
} from './wasmRuntime';
import '../App.css';
import './peer.css';

const PLUGIN_ENTRIES = Object.entries(plugins);
// TCP proxy for the server hop (browsers can't open raw TCP). In MPC mode the
// prover (extension) uses it; in Proxy mode the verifier (this page) does.
const PROXY_BASE = 'wss://demo.tlsnotary.org';
const CHROME_STORE_URL =
  'https://chromewebstore.google.com/detail/tlsnotary/gnoglgpcamodhflknhmafmjdahcejcgg';

type Mode = 'Mpc' | 'Proxy';

// ---- Control frames sent over the data channel (strings; MPC frames are bytes).
interface LimitsFrame {
  t: 'limits';
  maxSentData: number;
  maxRecvData: number;
  mode?: Mode;
  server?: string;
}
interface ProverStatusFrame {
  t: 'ps';
  step?: string;
  message?: string;
}
interface VerifierStatusFrame {
  t: 'vs';
  state: 'connected' | 'verifying' | 'verified' | 'error';
  message?: string;
  threads?: number;
  serverName?: string;
}
type CtrlFrame = LimitsFrame | ProverStatusFrame | VerifierStatusFrame;

interface RemoteVerifier {
  state: 'idle' | 'connected' | 'verifying' | 'verified' | 'error';
  message?: string;
  threads?: number;
}
interface RemoteProver {
  state: 'idle' | 'connected' | 'proving' | 'done' | 'error';
  message?: string;
}

function parseJoinId(): string | null {
  return new URLSearchParams(window.location.search).get('j');
}

function pillClass(state: string): string {
  // Success states (paired / finished) are green; in-progress is blue.
  if (state === 'verified' || state === 'done' || state === 'connected') return 'connected';
  if (state === 'error') return 'error';
  if (state === 'idle') return 'idle';
  return 'progress';
}

// ---------------------------------------------------------------------------
// Shared presentational pieces
// ---------------------------------------------------------------------------

// Lightweight click-to-open explainer modal (closes on overlay click or ×).
function InfoModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="peer-modal-overlay" onClick={onClose}>
      <div className="peer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="peer-modal-head">
          <span className="peer-modal-title">{title}</span>
          <button type="button" className="peer-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="peer-modal-body">{children}</div>
      </div>
    </div>
  );
}

function Channel({ proving, mode }: { proving: boolean; mode: Mode }) {
  return (
    <div className="peer-topo-channel">
      <div className={`peer-track ${proving ? 'peer-track--proving' : ''}`}>
        <div className="peer-rail" />
        {[0, 0.25, 0.5, 0.75].map((d) => (
          <span
            key={`f${d}`}
            className="peer-packet peer-packet--fwd"
            style={{ animationDelay: `${d}s` }}
          />
        ))}
        <span className="peer-packet peer-packet--rev" style={{ animationDelay: '0.4s' }} />
      </div>
      <div className="peer-clabel">P2P · {mode === 'Proxy' ? 'Proxy' : 'MPC'}</div>
    </div>
  );
}

// Render a hostname with a <wbr> break opportunity after each dot, so a long
// host wraps at label boundaries ("swissbank." / "tlsnotary.org") instead of
// mid-word.
function HostName({ host }: { host: string }) {
  return (
    <>
      {host.split('.').map((label, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <>
              .<wbr />
            </>
          )}
          {label}
        </Fragment>
      ))}
    </>
  );
}

// The target server, shown as a card alongside the prover/verifier panes.
function ServerNode({ mode, host }: { mode: Mode; host: string }) {
  const side = mode === 'Proxy' ? 'verifier' : 'prover';
  return (
    <div className="peer-topo-node peer-topo-node--server">
      <div className="peer-pane-head">
        <span className="peer-pane-role">Server</span>
        <span className="peer-pane-badge">🌐 HTTPS</span>
      </div>
      <div className="peer-node-host">{host ? <HostName host={host} /> : 'the target site'}</div>
      <div className="peer-node-n">
        {side} connects · {mode === 'Proxy' ? 'Proxy' : 'MPC'}
      </div>
    </div>
  );
}

// The server↔browser hop: a connector line with an ⓘ that explains the TCP
// proxy (browsers can't open raw TCP). Clicking ⓘ opens the shared InfoModal.
function ProxyLink({ proving }: { proving: boolean }) {
  const [info, setInfo] = useState(false);
  return (
    <div className="peer-link">
      <div className={`peer-link-rail ${proving ? 'peer-link-rail--flow' : ''}`} />
      <button
        type="button"
        className="peer-idot"
        onClick={() => setInfo(true)}
        title="Why a TCP proxy?"
        aria-label="Why a TCP proxy?"
      >
        i
      </button>
      <span className="peer-link-cap">TCP proxy</span>
      {info && (
        <InfoModal title="Why a TCP proxy?" onClose={() => setInfo(false)}>
          <p>
            Browsers can&apos;t open raw TCP sockets, so the TLS connection to the server is relayed
            through a WebSocket-to-TCP proxy ({new URL(PROXY_BASE).host}). It only forwards the
            already-encrypted bytes — it can&apos;t read or change the traffic, and it is not the
            verifier.
          </p>
        </InfoModal>
      )}
    </div>
  );
}

// Linear topology row: the Server sits beside whichever browser opens the
// connection — left of the prover in MPC, right of the verifier in Proxy.
function Topo({
  mode,
  proving,
  host,
  proverLocal,
  proverPane,
  verifierPane,
}: {
  mode: Mode;
  proving: boolean;
  host: string;
  proverLocal: boolean;
  proverPane: ReactNode;
  verifierPane: ReactNode;
}) {
  const serverSide = (
    <>
      <ServerNode mode={mode} host={host} />
      <ProxyLink proving={proving} />
    </>
  );
  return (
    <div className="peer-topo">
      {mode === 'Mpc' && serverSide}
      <div
        className={`peer-topo-pane peer-topo-pane--prover ${proverLocal ? 'peer-topo-pane--local' : 'peer-topo-pane--remote'}`}
      >
        {proverPane}
      </div>
      <Channel proving={proving} mode={mode} />
      <div
        className={`peer-topo-pane peer-topo-pane--verifier ${proverLocal ? 'peer-topo-pane--remote' : 'peer-topo-pane--local'}`}
      >
        {verifierPane}
      </div>
      {mode === 'Proxy' && (
        <>
          <ProxyLink proving={proving} />
          <ServerNode mode={mode} host={host} />
        </>
      )}
    </div>
  );
}

// Role is decided by the URL: `?j=<peerId>` opens the verifier (it dials the
// prover that is hosting that peer); no query opens the prover.
export function PeerToPeerPage() {
  const [joinId] = useState(parseJoinId);

  return (
    <div className="app-container">
      <div className="peer-topbar">
        <a href="/" className="peer-back-link">
          ← Back to demo
        </a>
        <span className="peer-tag">Preview</span>
      </div>

      <div className="hero-section peer-hero">
        <h1 className="hero-title">Peer-to-peer web proofs</h1>
        <p className="hero-subtitle">
          Use the TLSNotary extension to prove from this browser to another browser, on any machine
          you like. The TLSNotary session runs peer-to-peer: no server in the middle, no hosted
          verifier.
        </p>
        <p className="peer-newcomer">
          New to TLSNotary? <a href="/">Start with the main demo →</a>
        </p>
      </div>

      {joinId ? <VerifierView joinId={joinId} /> : <ProverView />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prover (this device has the extension). The PAGE hosts the PeerJS connection
// (QR + pairing) and relays the MPC byte stream to/from the extension, which
// does the actual proving. No PeerJS in the extension.
// ---------------------------------------------------------------------------

function ProverView() {
  // Host immediately so the join QR appears right away — no extra click.
  const host = usePeerHost(true);

  const [selected, setSelected] = useState<string>(
    plugins.spotify ? 'spotify' : (PLUGIN_ENTRIES[0]?.[0] ?? ''),
  );
  const [mode, setMode] = useState<Mode>('Mpc');
  const [showProtocolInfo, setShowProtocolInfo] = useState(false);
  const [proving, setProving] = useState(false);
  const [proveProgress, setProveProgress] = useState('');
  const [proveDone, setProveDone] = useState(false);
  const [proveError, setProveError] = useState<string | null>(null);
  const [hasExtension, setHasExtension] = useState<boolean | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [verifier, setVerifier] = useState<RemoteVerifier>({ state: 'idle' });
  // Tears down the current relay wiring. Kept in a ref (not unwired when
  // execCode resolves) because in relay mode the prover finishes before the
  // verifier does, and we must keep listening for its terminal {t:'vs'} frame.
  const unwireRef = useRef<(() => void) | null>(null);
  useEffect(() => () => unwireRef.current?.(), []);

  const plugin = plugins[selected];
  const serverHost = plugin?.host ?? '';

  // Detect the extension's injected window.tlsn. The content script injects it
  // shortly after load; poll and also listen for the `tlsn_loaded` event so a
  // late install is picked up automatically (once the page has the content
  // script — a fresh install still needs a reload, offered in the warning).
  useEffect(() => {
    const check = () => {
      if (window.tlsn?.execCode) {
        setHasExtension(true);
        clearInterval(interval);
      } else {
        setHasExtension((v) => (v === null ? false : v));
      }
    };
    const initial = setTimeout(check, 800);
    const interval = setInterval(check, 1500);
    const onLoaded = () => check();
    window.addEventListener('tlsn_loaded', onLoaded);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
      window.removeEventListener('tlsn_loaded', onLoaded);
    };
  }, []);

  const joinUrl = host.peerId ? `${window.location.origin}/peer.html?j=${host.peerId}` : null;

  useEffect(() => {
    if (!joinUrl) {
      setQr(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(joinUrl, { width: 200, margin: 1 })
      .then((u) => {
        if (!cancelled) setQr(u);
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [joinUrl]);

  const connected = host.status === 'connected' && !!host.conn;

  // Reflect verifier connection state in the remote pane as soon as paired.
  useEffect(() => {
    setVerifier((v) => (connected && v.state === 'idle' ? { state: 'connected' } : v));
  }, [connected]);

  // Bridge the extension's MPC byte stream over the page's data channel, and
  // relay status both ways so each pane mirrors the other device:
  //  - extension → page (TLSN_RELAY_OUT) → conn.send → verifier
  //  - extension progress → conn.send({t:'ps'}) → verifier's prover pane
  //  - verifier → conn.on('data'): bytes → extension; {t:'vs'} → verifier pane
  const wireRelay = (conn: DataConnection, requestId: string): (() => void) => {
    const onWindow = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const d = event.data;
      if (!d || d.requestId !== requestId) return;
      if (d.type === 'TLSN_RELAY_OUT') {
        try {
          conn.send(base64ToBytes(d.data));
        } catch {
          /* channel closed */
        }
      } else if (d.type === 'TLSN_PROVE_PROGRESS') {
        if (d.step === 'RELAY_LIMITS') {
          // First control frame: limits + mode + server name for the verifier.
          // Stamp mode/server from this page's own state (authoritative) so the
          // verifier always reflects the selected mode and target.
          try {
            const limits = JSON.parse(d.message) as Omit<LimitsFrame, 't' | 'server'>;
            conn.send(JSON.stringify({ t: 'limits', ...limits, mode, server: serverHost }));
          } catch {
            /* channel closed */
          }
        } else {
          setProveProgress(d.message ?? d.step ?? '');
          try {
            conn.send(JSON.stringify({ t: 'ps', step: d.step, message: d.message }));
          } catch {
            /* channel closed */
          }
        }
      }
    };
    const onData = (raw: unknown) => {
      if (typeof raw === 'string') {
        // Status from the verifier — update its pane; don't relay as MPC bytes.
        try {
          const frame = JSON.parse(raw) as CtrlFrame;
          if (frame.t === 'vs') {
            setVerifier({
              state: frame.state,
              message: frame.message,
              threads: frame.threads,
            });
          }
        } catch {
          /* ignore malformed control frame */
        }
        return;
      }
      window.postMessage(
        { type: 'TLSN_RELAY_IN', requestId, data: bytesToBase64(toUint8Array(raw)) },
        window.location.origin,
      );
    };
    const onClose = () => {
      window.postMessage({ type: 'TLSN_RELAY_CLOSED', requestId }, window.location.origin);
    };
    window.addEventListener('message', onWindow);
    conn.on('data', onData);
    conn.on('close', onClose);
    return () => {
      window.removeEventListener('message', onWindow);
      conn.off('data', onData);
      conn.off('close', onClose);
    };
  };

  const handleProve = async () => {
    if (!plugin || proving || !host.conn) return;
    if (!window.tlsn?.execCode) {
      setProveError('TLSNotary extension not detected on this page.');
      return;
    }
    const requestId = `p2p_prove_${Date.now()}`;
    // Tear down any prior wiring, then wire this proof. Do NOT unwire when
    // execCode resolves: the verifier sends its terminal {t:'vs'} frame after
    // the prover finishes, so the listener must outlive this call. It is torn
    // down by the next proof or on unmount.
    unwireRef.current?.();
    unwireRef.current = wireRelay(host.conn, requestId);
    setProving(true);
    setProveError(null);
    setProveDone(false);
    setProveProgress('Starting…');
    setVerifier({ state: 'verifying', message: 'Verifying…' });
    try {
      const code = await fetch(plugin.file).then((r) => r.text());
      await window.tlsn.execCode(code, {
        requestId,
        // proxyBase: where the server hop is tunnelled. mode: MPC or Proxy.
        sessionData: { relay: '1', mode, proxyBase: PROXY_BASE },
      });
      setProveDone(true);
    } catch (e: unknown) {
      setProveError(e instanceof Error ? e.message : String(e));
    } finally {
      setProving(false);
    }
  };

  const proverPane = (
    <>
      <div className="peer-pane-head">
        <span className="peer-pane-role">
          Prover <span className="peer-you">you</span>
        </span>
        <span className="peer-pane-badge">extension · {mode === 'Proxy' ? 'Proxy' : 'MPC'}</span>
      </div>

      <ol className="peer-steps">
        <li>Pair a verifier (scan QR code)</li>
        <li>Select what you want to prove</li>
        <li>Click "Prove to the verifier" and follow the steps in the extension popup</li>
      </ol>

      {hasExtension === false && (
        <div className="peer-check-warn">
          ⚠️ TLSNotary extension not detected.{' '}
          <a href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer">
            Install from the Chrome Web Store
          </a>
          , then{' '}
          <button type="button" className="peer-link-btn" onClick={() => window.location.reload()}>
            recheck
          </button>
          .
        </div>
      )}

      <label className="peer-field-label" htmlFor="peer-plugin-select">
        What do you want to prove?
      </label>
      <select
        id="peer-plugin-select"
        className="peer-select"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={proving}
      >
        {PLUGIN_ENTRIES.map(([key, p]) => (
          <option key={key} value={key}>
            {p.logo} {p.name}
          </option>
        ))}
      </select>
      {plugin?.description && <p className="peer-claim">{plugin.description}</p>}

      <div className="peer-mode-row">
        <span className="peer-field-label peer-field-label--inline">
          Protocol{' '}
          <button
            type="button"
            className="peer-info-btn"
            onClick={() => setShowProtocolInfo(true)}
            aria-label="About protocol modes"
            title="MPC vs Proxy"
          >
            ⓘ
          </button>
        </span>
        <div className="peer-seg" role="group" aria-label="Protocol mode">
          <button
            type="button"
            className={`peer-seg-btn ${mode === 'Mpc' ? 'peer-seg-btn--active' : ''}`}
            onClick={() => setMode('Mpc')}
            disabled={proving}
          >
            MPC
          </button>
          <button
            type="button"
            className={`peer-seg-btn ${mode === 'Proxy' ? 'peer-seg-btn--active' : ''}`}
            onClick={() => setMode('Proxy')}
            disabled={proving}
          >
            Proxy
          </button>
        </div>
      </div>

      <button
        className="plugin-run-btn"
        onClick={handleProve}
        disabled={!connected || proving || hasExtension === false}
      >
        {proving ? (
          <>
            <span className="spinner" /> Proving…
          </>
        ) : !connected ? (
          'Waiting for verifier…'
        ) : proveDone ? (
          '▶ Prove again'
        ) : (
          '▶ Prove to the verifier'
        )}
      </button>

      {proving && proveProgress && !proveDone && (
        <div className="peer-selftest-progress">
          <span className="spinner spinner--dark" /> {proveProgress}
        </div>
      )}
      {proveError && <div className="peer-error">❌ {proveError}</div>}
      {proveDone && !proveError && (
        <div className="peer-proof-sent">
          {verifier.state === 'verified'
            ? '✓ Proof complete — verified on the other device.'
            : verifier.state === 'error'
              ? '✓ Proof sent — but verification failed on the other device.'
              : '✓ Proof sent — waiting for the other device to verify…'}
        </div>
      )}

      {showProtocolInfo && (
        <InfoModal title="Protocol: MPC vs Proxy" onClose={() => setShowProtocolInfo(false)}>
          <p>
            <strong>MPC</strong> — strongest. The verifier helps run the TLS session with you via
            secure multi-party computation, so it can vouch for the data while never seeing your
            connection or login.
          </p>
          <p>
            <strong>Proxy</strong> — faster. The verifier relays your encrypted connection to the
            server, so it sits in the data path (it still can&apos;t read the TLS traffic). Its
            integrity then depends on the verifier&apos;s network path to the server being
            trustworthy — and in this demo that hop runs through a shared TCP proxy, which becomes
            part of that trust. MPC mode avoids this.{' '}
            <a
              href="https://tlsnotary.org/blog/2026/04/22/proxy-mode/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Learn more →
            </a>
          </p>
        </InfoModal>
      )}
    </>
  );

  const verifierPane = (
    <>
      <div className="peer-pane-head">
        <span className="peer-pane-role">Verifier</span>
        <span className="peer-pane-badge">📱 other device</span>
      </div>
      {!connected ? (
        <>
          <span className="peer-status-pill peer-status-pill--idle">Waiting</span>
          <p className="peer-pane-msg">
            Scan with the device that will verify, or open the link in another browser.
          </p>
          {host.error && <div className="peer-error">❌ {host.error}</div>}
          {qr && <img className="peer-qr" src={qr} alt="Verifier join QR code" />}
          {joinUrl && (
            <div className="peer-link-row">
              <input className="peer-link-input" readOnly value={joinUrl} />
              <button
                type="button"
                className="peer-copy-icon"
                title={copied ? 'Copied' : 'Copy link'}
                aria-label="Copy link"
                onClick={() => {
                  navigator.clipboard
                    .writeText(joinUrl)
                    .then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    })
                    .catch(() => {
                      /* clipboard unavailable */
                    });
                }}
              >
                {copied ? (
                  '✓'
                ) : (
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            </div>
          )}
          <p className="peer-disclaimer">
            Uses WebRTC (PeerJS) — may fail on restrictive networks or firewalls.
          </p>
        </>
      ) : (
        <>
          <span className={`peer-status-pill peer-status-pill--${pillClass(verifier.state)}`}>
            {verifier.state === 'verifying'
              ? 'Verifying'
              : verifier.state === 'verified'
                ? 'Verified'
                : 'Connected'}
          </span>
          <p className="peer-pane-msg">
            {(verifier.state === 'idle' || verifier.state === 'connected') &&
              'Connected — ready to verify.'}
            {verifier.state === 'verifying' && (verifier.message || 'Verifying the TLS session…')}
            {verifier.state === 'verified' && '✓ Verified independently on the other device.'}
            {verifier.state === 'error' && (verifier.message || 'Verification failed.')}
          </p>
        </>
      )}
    </>
  );

  return (
    <Topo
      mode={mode}
      proving={proving}
      host={serverHost}
      proverLocal
      proverPane={proverPane}
      verifierPane={verifierPane}
    />
  );
}

// ---------------------------------------------------------------------------
// Verifier (other device, e.g. a phone). Runs the WASM verifier in-browser.
// ---------------------------------------------------------------------------

function VerifierView({ joinId }: { joinId: string }) {
  const [wasm, setWasm] = useState<WasmRuntimeStatus>(() => {
    const isolated = window.crossOriginIsolated === true;
    return isolated
      ? { state: 'initializing', isolated }
      : {
          state: 'error',
          isolated: false,
          error: 'Page is not cross-origin isolated, so SharedArrayBuffer is unavailable.',
        };
  });
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<VerifierResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('Mpc');
  const [server, setServer] = useState('');
  const [prover, setProver] = useState<RemoteProver>({ state: 'idle' });
  // True while a verifier session is in flight — guards against starting a
  // second session over the same channel while one is running.
  const runningRef = useRef(false);
  const [busy, setBusy] = useState(false);

  // Boot the WASM runtime (needs cross-origin isolation — provided for ?j= pages).
  useEffect(() => {
    if (wasm.state !== 'initializing') return;
    let cancelled = false;
    initWasmRuntime({ loggingLevel: 'Info' })
      .then((threads) => {
        if (!cancelled) setWasm({ state: 'ready', isolated: true, threads });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setWasm({
            state: 'error',
            isolated: true,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only dial the prover once the WASM is ready, so the verifier is wired to
  // consume the MPC stream the instant the channel opens.
  const dialer = usePeerDialer(wasm.state === 'ready' ? joinId : null);

  // Mark the prover connected once the channel opens — before it starts proving.
  useEffect(() => {
    if (dialer.status === 'connected') {
      setProver((p) => (p.state === 'idle' ? { state: 'connected' } : p));
    }
  }, [dialer.status]);

  // The prover sends its limits as the first (string) frame; adopt them and
  // start the session. It also streams {t:'ps'} status; we mirror it in the
  // prover pane and stream {t:'vs'} back so the prover sees our state.
  useEffect(() => {
    if (!dialer.conn || wasm.state !== 'ready') return;
    const conn = dialer.conn;

    const sendVs = (frame: Omit<VerifierStatusFrame, 't'>) => {
      try {
        conn.send(JSON.stringify({ t: 'vs', ...frame }));
      } catch {
        /* channel closed */
      }
    };

    const onCtrl = (raw: unknown) => {
      if (typeof raw !== 'string') return; // MPC bytes handled in runVerifierSession
      let frame: CtrlFrame;
      try {
        frame = JSON.parse(raw) as CtrlFrame;
      } catch {
        return;
      }
      if (frame.t === 'ps') {
        setProver({ state: 'proving', message: frame.message });
      } else if (frame.t === 'limits' && !runningRef.current) {
        // Each `limits` frame is a fresh proof — start a new verifier session.
        // Repeatable: the prover can prove again over the same channel.
        runningRef.current = true;
        setBusy(true);
        setResult(null);
        setError(null);
        if (frame.mode) setMode(frame.mode);
        if (frame.server) setServer(frame.server);
        setProver({ state: 'proving', message: 'Proving…' });
        setProgress('Starting verifier…');
        sendVs({ state: 'connected', threads: wasm.threads });
        const onProg = (m: string) => {
          setProgress(m);
          sendVs({ state: 'verifying', message: m });
        };
        runVerifierSession(
          { maxSentData: frame.maxSentData, maxRecvData: frame.maxRecvData, proxyBase: PROXY_BASE },
          conn,
          onProg,
        )
          .then((r) => {
            setResult(r);
            setProver({ state: 'done', message: 'Proof complete' });
            sendVs({ state: 'verified', serverName: r.serverName, threads: r.threads });
          })
          .catch((e: unknown) => {
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg);
            setProver({ state: 'error', message: msg });
            sendVs({ state: 'error', message: msg });
          })
          .finally(() => {
            runningRef.current = false;
            setBusy(false);
          });
      }
    };

    conn.on('data', onCtrl);
    return () => {
      conn.off('data', onCtrl);
    };
  }, [dialer.conn, wasm.state, wasm.threads]);

  const proving = busy;
  const connecting = wasm.state === 'ready' && !result && !error && dialer.status !== 'error';

  const proverPane = (
    <>
      <div className="peer-pane-head">
        <span className="peer-pane-role">Prover</span>
        <span className="peer-pane-badge">💻 other device</span>
      </div>
      <span className={`peer-status-pill peer-status-pill--${pillClass(prover.state)}`}>
        {prover.state === 'idle'
          ? 'Connecting'
          : prover.state === 'proving'
            ? 'Proving'
            : prover.state === 'done'
              ? 'Done'
              : prover.state === 'error'
                ? 'Error'
                : 'Connected'}
      </span>
      <p className="peer-pane-msg">
        {prover.state === 'idle' && 'Connecting to the prover…'}
        {prover.state === 'connected' && 'Connected — waiting for it to start the proof.'}
        {prover.state === 'proving' && (
          <>
            Proving {server || 'a site'}
            {prover.message ? ` — ${prover.message}` : '…'}
          </>
        )}
        {prover.state === 'done' && '✓ Proof sent.'}
        {prover.state === 'error' && (prover.message || 'Prover error.')}
      </p>
    </>
  );

  const verifierPane = (
    <>
      <div className="peer-pane-head">
        <span className="peer-pane-role">
          Verifier <span className="peer-you">you</span>
        </span>
        <span className="peer-pane-badge">🦀 in-browser WASM</span>
      </div>

      {wasm.state === 'error' && (
        <div className="peer-error">⚠️ In-browser verifier unavailable: {wasm.error}</div>
      )}

      {connecting && (
        <div className="peer-verifier-progress">
          <span className="spinner spinner--dark" />
          <div>
            <div className="peer-verifier-progress-title">
              {proving
                ? 'Verifying…'
                : dialer.status === 'connected'
                  ? 'Waiting for the prover…'
                  : 'Connecting to prover…'}
            </div>
            <div className="peer-verifier-progress-msg">
              {proving ? progress : 'The prover will start the proof from the other device.'}
            </div>
            {proving && server && (
              <div className="peer-verifier-progress-msg">
                {mode === 'Proxy' ? 'Proxy' : 'MPC'} mode · {server}
              </div>
            )}
          </div>
        </div>
      )}

      {dialer.error && !result && <div className="peer-error">❌ {dialer.error}</div>}
      {error && <div className="peer-error">❌ {error}</div>}

      {result && (
        <>
          <div className="peer-verdict">
            ✓ Verified in this browser — authenticated TLS session to{' '}
            {result.serverName ?? 'the server'} in {(result.ms / 1000).toFixed(1)}s
          </div>
          <div className="peer-fields-title">Request sent</div>
          <pre className="peer-selftest-pre">{result.sent}</pre>
          <div className="peer-fields-title">Response received</div>
          <pre className="peer-selftest-pre">{result.recv}</pre>
        </>
      )}
    </>
  );

  return (
    <>
      {/* Only surface the runtime banner while loading or on error — once ready,
          the verifier pane's "🦀 in-browser WASM" badge already says it. */}
      {wasm.state !== 'ready' && (
        <div className={`peer-wasm-banner peer-wasm-banner--${wasm.state}`}>
          {(wasm.state === 'initializing' || wasm.state === 'idle') && (
            <span>
              <span className="spinner spinner--dark" /> Loading in-browser TLSNotary verifier…
            </span>
          )}
          {wasm.state === 'error' && <span>⚠️ In-browser verifier unavailable: {wasm.error}</span>}
        </div>
      )}

      <Topo
        mode={mode}
        proving={proving}
        host={server}
        proverLocal={false}
        proverPane={proverPane}
        verifierPane={verifierPane}
      />
    </>
  );
}
