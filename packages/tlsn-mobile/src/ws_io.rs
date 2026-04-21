//! Session WebSocket mux.
//!
//! The verifier session uses one WebSocket for everything: JSON control
//! frames (Text) and MPC bytes (Binary). This module splits that socket into a
//! text control channel + a futures `AsyncRead + AsyncWrite` byte stream that
//! satisfies sdk-core's `Io` trait.

use futures::{SinkExt, StreamExt};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};
use tokio_util::compat::{Compat, TokioAsyncReadCompatExt};

pub(crate) type ClientWs = WebSocketStream<MaybeTlsStream<TcpStream>>;

/// Result of splitting a session WebSocket: a binary byte stream (for MPC) +
/// a text send/recv channel pair (for control frames).
pub(crate) struct SessionMux {
    /// Binary byte stream — pass to sdk-core's `setup()`.
    pub binary: Compat<tokio::io::DuplexStream>,
    /// Receive channel for incoming Text frames (post-registration).
    pub text_rx: mpsc::UnboundedReceiver<String>,
    /// Send channel for outgoing Text frames.
    pub send_text_tx: mpsc::UnboundedSender<String>,
}

/// Splits a `WebSocketStream` into text + binary channels. Spawns two
/// background tasks that own the sink/stream halves of the socket.
///
/// Binary and text directions run independently: dropping the binary side
/// (e.g. after MPC completes) does not close the text channel — so the caller
/// can still send `reveal_config` and await `session_completed` after MPC.
pub(crate) fn session_mux(ws: ClientWs) -> SessionMux {
    let (text_in_tx, text_in_rx) = mpsc::unbounded_channel::<String>();
    let (send_text_tx, mut send_text_rx) = mpsc::unbounded_channel::<String>();
    let (tlsn_side, mux_side) = tokio::io::duplex(64 * 1024);
    let (mut mux_read, mut mux_write) = tokio::io::split(mux_side);

    let (mut ws_sink, mut ws_stream) = ws.split();

    // WebSocket -> {text channel, binary duplex}
    tokio::spawn(async move {
        while let Some(msg) = ws_stream.next().await {
            match msg {
                Ok(Message::Text(t)) => {
                    if text_in_tx.send(t.to_string()).is_err() {
                        break;
                    }
                }
                Ok(Message::Binary(b)) => {
                    if mux_write.write_all(&b).await.is_err() {
                        break;
                    }
                }
                Ok(Message::Close(_)) => break,
                Ok(_) => {}
                Err(_) => break,
            }
        }
    });

    // {binary duplex, text channel} -> WebSocket. Binary and text are tracked
    // independently so the MPC binary stream dropping does not close the
    // text channel.
    tokio::spawn(async move {
        let mut buf = vec![0u8; 8192];
        let mut binary_open = true;
        let mut text_open = true;
        while binary_open || text_open {
            tokio::select! {
                biased;
                msg = send_text_rx.recv(), if text_open => match msg {
                    Some(t) => {
                        if ws_sink.send(Message::Text(t)).await.is_err() {
                            break;
                        }
                    }
                    None => text_open = false,
                },
                res = mux_read.read(&mut buf), if binary_open => match res {
                    Ok(0) => binary_open = false,
                    Ok(n) => {
                        if ws_sink.send(Message::Binary(buf[..n].to_vec())).await.is_err() {
                            break;
                        }
                    }
                    Err(_) => binary_open = false,
                },
            }
        }
        let _ = ws_sink.close().await;
    });

    SessionMux {
        binary: tlsn_side.compat(),
        text_rx: text_in_rx,
        send_text_tx,
    }
}
