import { useEffect, useState } from 'react';
import Peer, { DataConnection } from 'peerjs';

export type ConnStatus =
  | 'idle'
  | 'opening'
  | 'waiting'
  | 'connecting'
  | 'connected'
  | 'closed'
  | 'error';

export interface PeerDialer {
  /** The open data channel to the remote peer, or null until connected. */
  conn: DataConnection | null;
  status: ConnStatus;
  error: string | null;
}

export interface PeerHostState {
  /** This peer's id (available once the signaling socket opens). */
  peerId: string | null;
  /** The open data channel to the verifier, or null until it connects. */
  conn: DataConnection | null;
  status: ConnStatus;
  error: string | null;
}

/**
 * Host a PeerJS peer over a binary data channel and wait for a verifier to
 * connect. Used by the prover page; `active` gates when hosting starts.
 */
export function usePeerHost(active: boolean): PeerHostState {
  const [peerId, setPeerId] = useState<string | null>(null);
  const [conn, setConn] = useState<DataConnection | null>(null);
  const [status, setStatus] = useState<ConnStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setStatus('opening');
    const peer = new Peer();

    peer.on('open', (id) => {
      if (cancelled) return;
      setPeerId(id);
      setStatus('waiting');
    });
    peer.on('connection', (dataConn) => {
      dataConn.on('open', () => {
        if (cancelled) return;
        setConn(dataConn);
        setStatus('connected');
      });
      dataConn.on('close', () => {
        if (!cancelled) setStatus('closed');
      });
      dataConn.on('error', (err) => {
        if (!cancelled) {
          setError(err.message || String(err));
          setStatus('error');
        }
      });
    });
    peer.on('disconnected', () => {
      try {
        peer.reconnect();
      } catch {
        /* already destroyed */
      }
    });
    peer.on('error', (err) => {
      if (cancelled) return;
      setError(err.message || String(err));
      setStatus('error');
    });

    return () => {
      cancelled = true;
      peer.destroy();
    };
  }, [active]);

  return { peerId, conn, status, error };
}

/**
 * Dial a remote PeerJS peer over a binary data channel. Used by the verifier to
 * connect to the prover (which hosts the peer). Pass `null` to stay idle.
 */
export function usePeerDialer(remoteId: string | null): PeerDialer {
  const [conn, setConn] = useState<DataConnection | null>(null);
  const [status, setStatus] = useState<ConnStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  // Reset when the target changes (React "adjust state during render" pattern).
  const [prev, setPrev] = useState(remoteId);
  if (prev !== remoteId) {
    setPrev(remoteId);
    setStatus(remoteId ? 'opening' : 'idle');
    setError(null);
    setConn(null);
  }

  useEffect(() => {
    if (!remoteId) return;
    let cancelled = false;
    const peer = new Peer();

    peer.on('open', () => {
      if (cancelled) return;
      setStatus('connecting');
      const dataConn = peer.connect(remoteId, { serialization: 'binary', reliable: true });
      dataConn.on('open', () => {
        if (cancelled) return;
        setConn(dataConn);
        setStatus('connected');
      });
      dataConn.on('error', (err) => {
        if (cancelled) return;
        setError(err.message || String(err));
        setStatus('error');
      });
      dataConn.on('close', () => {
        if (!cancelled) setStatus('closed');
      });
    });

    peer.on('disconnected', () => {
      try {
        peer.reconnect();
      } catch {
        /* already destroyed */
      }
    });
    peer.on('error', (err) => {
      if (cancelled) return;
      setError(err.message || String(err));
      setStatus('error');
    });

    return () => {
      cancelled = true;
      peer.destroy();
    };
  }, [remoteId]);

  return { conn, status, error };
}
