import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type { DataConnection } from 'peerjs';
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
// TCP proxy for the prover→server hop (the verifier is the peer; only this hop
// needs a reachable relay). Overrides the plugin's build-time localhost proxy.
const PROXY_BASE = 'wss://demo.tlsnotary.org';

interface PeerLimits {
  maxSentData: number;
  maxRecvData: number;
}

// Base64 (de)serialization for relayed MPC bytes (the extension↔page bridge
// carries strings). Loop-based to handle large payloads without spread.
function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}
function toU8(d: unknown): Uint8Array {
  if (d instanceof Uint8Array) return d;
  return new Uint8Array(d as ArrayBufferLike);
}

function parseJoinId(): string | null {
  return new URLSearchParams(window.location.search).get('j');
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
          Prove a fact from any site with your extension, and let another device verify it directly
          over a PeerJS data channel — the MPC-TLS session runs between two browsers, with no hosted
          verifier.
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
  const [connectStarted, setConnectStarted] = useState(false);
  const host = usePeerHost(connectStarted);

  const [selected, setSelected] = useState<string>(PLUGIN_ENTRIES[0]?.[0] ?? '');
  const [proving, setProving] = useState(false);
  const [proveProgress, setProveProgress] = useState('');
  const [proveDone, setProveDone] = useState(false);
  const [proveError, setProveError] = useState<string | null>(null);
  const [hasExtension, setHasExtension] = useState<boolean | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  // The content script injects window.tlsn shortly after load.
  useEffect(() => {
    const id = setTimeout(() => setHasExtension(!!window.tlsn?.execCode), 800);
    return () => clearTimeout(id);
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

  // Bridge the extension's MPC byte stream over the page's data channel:
  //  - extension → page (TLSN_PEER_DATA_OUT) → conn.send → verifier
  //  - verifier → conn.on('data') → page → extension (TLSN_PEER_DATA_IN)
  const wireRelay = (conn: DataConnection, requestId: string): (() => void) => {
    const onWindow = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const d = event.data;
      if (!d || d.requestId !== requestId) return;
      if (d.type === 'TLSN_PEER_DATA_OUT') {
        try {
          conn.send(b64ToBytes(d.data));
        } catch {
          /* channel closed */
        }
      } else if (d.type === 'TLSN_PROVE_PROGRESS') {
        // Forward the prover's limits to the verifier as a string frame (the
        // data channel otherwise carries raw MPC bytes), then show progress.
        if (d.step === 'PEER_LIMITS') {
          try {
            conn.send(d.message);
          } catch {
            /* channel closed */
          }
        } else {
          setProveProgress(d.message ?? d.step ?? '');
        }
      }
    };
    const onData = (raw: unknown) => {
      window.postMessage(
        { type: 'TLSN_PEER_DATA_IN', requestId, data: bytesToB64(toU8(raw)) },
        window.location.origin,
      );
    };
    const onClose = () => {
      window.postMessage({ type: 'TLSN_PEER_DATA_CLOSED', requestId }, window.location.origin);
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
    const plugin = plugins[selected];
    if (!plugin || proving || !host.conn) return;
    if (!window.tlsn?.execCode) {
      setProveError('TLSNotary extension not detected on this page.');
      return;
    }
    const requestId = `p2p_prove_${Date.now()}`;
    const unwire = wireRelay(host.conn, requestId);
    setProving(true);
    setProveError(null);
    setProveDone(false);
    setProveProgress('Starting…');
    try {
      const code = await fetch(plugin.file).then((r) => r.text());
      await window.tlsn.execCode(code, {
        requestId,
        // proxyBase: relay the prover↔server TCP through a reachable proxy
        // (overrides the plugin's build-time ws://localhost:7047 origin).
        sessionData: { peerRelay: '1', mode: 'Mpc', proxyBase: PROXY_BASE },
      });
      setProveDone(true);
    } catch (e: unknown) {
      setProveError(e instanceof Error ? e.message : String(e));
    } finally {
      setProving(false);
      unwire();
    }
  };

  return (
    <div className="peer-split peer-split--single">
      <section className="peer-pane peer-pane--prover">
        <div className="peer-pane-head">
          <span className="peer-pane-role">Prover (this device)</span>
          <span className="peer-pane-badge">extension · MPC</span>
        </div>
        <p className="peer-pane-sub">
          First connect a verifying device, then prove with your TLSNotary extension. PeerJS runs
          here in the page; the extension only relays its proof bytes.
        </p>

        {hasExtension === false && (
          <div className="peer-check-warn">
            ⚠️ TLSNotary extension not detected — you can still pair, but proving needs the
            extension.
          </div>
        )}

        {/* Step 1: connect */}
        {!connected && (
          <>
            <button
              className="plugin-run-btn"
              onClick={() => setConnectStarted(true)}
              disabled={connectStarted}
            >
              {connectStarted ? (
                <>
                  <span className="spinner" /> Waiting for verifier…
                </>
              ) : (
                '▶ Connect a verifier'
              )}
            </button>
            {host.error && <div className="peer-error">❌ {host.error}</div>}
            {connectStarted && joinUrl && (
              <div className="peer-qr-block">
                <div className="peer-fields-title">Scan with the verifying device</div>
                {qr && <img className="peer-qr" src={qr} alt="Verifier join QR code" />}
                <div className="peer-link-row">
                  <input className="peer-link-input" readOnly value={joinUrl} />
                </div>
              </div>
            )}
          </>
        )}

        {/* Step 2: prove (only after the verifier is connected) */}
        {connected && (
          <>
            <div className="peer-proof-sent">✓ Verifier connected — ready to prove.</div>

            <label className="peer-field-label" htmlFor="peer-plugin-select">
              Plugin
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

            <button
              className="plugin-run-btn"
              onClick={handleProve}
              disabled={proving || hasExtension === false}
            >
              {proving ? (
                <>
                  <span className="spinner" /> Proving…
                </>
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
                ✓ Proof complete — verified on the other device.
              </div>
            )}
          </>
        )}
      </section>
    </div>
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
  const started = useRef(false);

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

  // The prover sends its limits as the first (string) frame; adopt them — same
  // model as the verifier server, which takes the prover's register limits.
  // Subsequent frames are raw MPC bytes handled inside runVerifierSession.
  useEffect(() => {
    if (!dialer.conn || wasm.state !== 'ready' || started.current) return;
    const conn = dialer.conn;
    const onFirst = (d: unknown) => {
      if (typeof d !== 'string' || started.current) return;
      let limits: PeerLimits;
      try {
        limits = JSON.parse(d) as PeerLimits;
      } catch {
        return;
      }
      started.current = true;
      conn.off('data', onFirst);
      setProgress('Starting verifier…');
      runVerifierSession(limits, conn, setProgress)
        .then(setResult)
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    };
    conn.on('data', onFirst);
    return () => {
      conn.off('data', onFirst);
    };
  }, [dialer.conn, wasm.state]);

  const connecting = wasm.state === 'ready' && !result && !error && dialer.status !== 'error';

  return (
    <div className="peer-split peer-split--single">
      <div className={`peer-wasm-banner peer-wasm-banner--${wasm.state}`}>
        {wasm.state === 'ready' && (
          <span>
            🦀 In-browser verifier ready — WASM running with {wasm.threads} thread
            {wasm.threads === 1 ? '' : 's'}
          </span>
        )}
        {(wasm.state === 'initializing' || wasm.state === 'idle') && (
          <span>
            <span className="spinner spinner--dark" /> Loading in-browser TLSNotary verifier…
          </span>
        )}
        {wasm.state === 'error' && <span>⚠️ In-browser verifier unavailable: {wasm.error}</span>}
      </div>

      <section className="peer-pane peer-pane--verifier">
        <div className="peer-pane-head">
          <span className="peer-pane-role">Verifier (this device)</span>
          <span
            className={`peer-status-pill peer-status-pill--${result ? 'verified' : error ? 'error' : 'connected'}`}
          >
            {result ? 'Verified' : error ? 'Error' : 'Verifying'}
          </span>
        </div>
        <p className="peer-pane-sub">
          Runs the MPC-TLS verifier in this browser and confirms what the prover proved.
        </p>

        {connecting && (
          <div className="peer-verifier-progress">
            <span className="spinner spinner--dark" />
            <div>
              <div className="peer-verifier-progress-title">
                {dialer.status === 'connected' ? 'Verifying…' : 'Connecting to prover…'}
              </div>
              <div className="peer-verifier-progress-msg">{progress}</div>
            </div>
          </div>
        )}

        {dialer.error && !result && <div className="peer-error">❌ {dialer.error}</div>}
        {error && <div className="peer-error">❌ {error}</div>}

        {result && (
          <>
            <div className="peer-verdict">
              ✓ Verified in-browser — TLS session to {result.serverName ?? 'server'} authenticated (
              {result.threads} threads, {(result.ms / 1000).toFixed(1)}s)
            </div>
            <div className="peer-fields-title">Received (verifier's authenticated view)</div>
            <pre className="peer-selftest-pre">{result.recv}</pre>
            <div className="peer-fields-title">Sent</div>
            <pre className="peer-selftest-pre">{result.sent}</pre>
          </>
        )}
      </section>
    </div>
  );
}
