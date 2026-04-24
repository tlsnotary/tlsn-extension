//! Frame multiplexer for a single WebSocket: splits a `WebSocket` into an
//! AsyncRead + AsyncWrite byte stream over Binary frames and mpsc channels for
//! Text frames. This lets one WebSocket carry both the JSON control protocol
//! (register, reveal_config, session_completed) and the tlsn MPC byte stream.

use futures_util::{SinkExt, StreamExt};
use tokio::io::{AsyncReadExt, AsyncWriteExt, DuplexStream};
use tokio::sync::mpsc;
use tracing::debug;

use crate::axum_websocket::{Message, WebSocket};

/// A WebSocket split into a Text channel and a Binary byte stream.
///
/// `binary` can be handed to tlsn's `verifier()` as `AsyncRead + AsyncWrite`.
/// `text_rx` yields incoming Text frames. `send_text_tx` sends Text frames.
pub(crate) struct SessionStream {
    pub(crate) text_rx: mpsc::UnboundedReceiver<String>,
    pub(crate) send_text_tx: mpsc::UnboundedSender<String>,
    pub(crate) binary: DuplexStream,
}

/// Splits a `WebSocket` into a control (text) + data (binary) pair.
///
/// Spawns two background tasks that own the sink/stream halves of the
/// WebSocket. The tasks exit when the WebSocket closes, either side of the
/// channels drops, or an I/O error occurs.
pub(crate) fn session_stream(ws: WebSocket) -> SessionStream {
    let (text_in_tx, text_in_rx) = mpsc::unbounded_channel::<String>();
    let (send_text_tx, mut send_text_rx) = mpsc::unbounded_channel::<String>();
    // 64 KiB is comfortably larger than any MPC frame we've observed.
    let (tlsn_side, mux_side) = tokio::io::duplex(64 * 1024);
    let (mut mux_read, mut mux_write) = tokio::io::split(mux_side);

    let (mut ws_sink, mut ws_stream) = ws.split();

    // Task: WebSocket -> {text channel, binary duplex}
    tokio::spawn(async move {
        while let Some(msg) = ws_stream.next().await {
            match msg {
                Ok(Message::Text(t)) => {
                    if text_in_tx.send(t).is_err() {
                        debug!("session mux: text_rx dropped, stopping inbound task");
                        break;
                    }
                }
                Ok(Message::Binary(b)) => {
                    if mux_write.write_all(&b).await.is_err() {
                        debug!("session mux: binary pipe closed, stopping inbound task");
                        break;
                    }
                }
                Ok(Message::Close(_)) => {
                    debug!("session mux: received Close frame");
                    break;
                }
                Ok(_) => {} // Ping/Pong handled by tungstenite
                Err(e) => {
                    debug!("session mux: inbound WS error: {}", e);
                    break;
                }
            }
        }
        // Dropping mux_write signals EOF to the tlsn side's AsyncRead.
    });

    // Task: {binary duplex, text channel} -> WebSocket.
    //
    // Binary and text are tracked independently: when the tlsn side of the
    // binary duplex is dropped (MPC complete), we must continue handling text
    // so the handler can still send `session_completed`.
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
                            debug!("session mux: failed to send text frame");
                            break;
                        }
                    }
                    None => {
                        debug!("session mux: send_text_tx dropped");
                        text_open = false;
                    }
                },
                res = mux_read.read(&mut buf), if binary_open => match res {
                    Ok(0) => {
                        debug!("session mux: binary pipe EOF");
                        binary_open = false;
                    }
                    Ok(n) => {
                        if ws_sink.send(Message::Binary(buf[..n].to_vec())).await.is_err() {
                            debug!("session mux: failed to send binary frame");
                            break;
                        }
                    }
                    Err(e) => {
                        debug!("session mux: binary pipe read error: {}", e);
                        binary_open = false;
                    }
                },
            }
        }
        let _ = ws_sink.close().await;
    });

    SessionStream {
        text_rx: text_in_rx,
        send_text_tx,
        binary: tlsn_side,
    }
}
