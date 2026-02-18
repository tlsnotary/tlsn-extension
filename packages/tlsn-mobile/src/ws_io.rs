//! WebSocket to byte-stream adapter.
//!
//! Bridges `tokio-tungstenite`'s `WebSocketStream` (which is
//! `Stream<Item=Message>` / `Sink<Message>`) into a `futures::AsyncRead +
//! AsyncWrite` byte stream that satisfies sdk-core's `Io` trait.

use std::pin::Pin;
use std::task::{Context, Poll};

use futures::{AsyncRead, AsyncWrite, Sink, Stream};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

/// Adapts a WebSocketStream (message-framed) into a contiguous byte stream.
///
/// sdk-core's `Io` trait requires `futures::AsyncRead + AsyncWrite + Send +
/// Unpin + 'static`. `WebSocketStream` only implements `Stream` / `Sink`, so
/// this adapter buffers binary WebSocket messages into a continuous byte
/// stream.
pub struct WsIoAdapter {
    inner: WebSocketStream<MaybeTlsStream<TcpStream>>,
    read_buf: Vec<u8>,
    read_pos: usize,
}

impl WsIoAdapter {
    pub fn new(ws: WebSocketStream<MaybeTlsStream<TcpStream>>) -> Self {
        Self {
            inner: ws,
            read_buf: Vec::new(),
            read_pos: 0,
        }
    }
}

impl AsyncRead for WsIoAdapter {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut [u8],
    ) -> Poll<std::io::Result<usize>> {
        // Drain buffered data from a partially-consumed WS message.
        if self.read_pos < self.read_buf.len() {
            let remaining = &self.read_buf[self.read_pos..];
            let n = remaining.len().min(buf.len());
            buf[..n].copy_from_slice(&remaining[..n]);
            self.read_pos += n;
            if self.read_pos >= self.read_buf.len() {
                self.read_buf.clear();
                self.read_pos = 0;
            }
            return Poll::Ready(Ok(n));
        }

        // Poll the WebSocket for the next message.
        match Pin::new(&mut self.inner).poll_next(cx) {
            Poll::Ready(Some(Ok(Message::Binary(data)))) => {
                let n = data.len().min(buf.len());
                buf[..n].copy_from_slice(&data[..n]);
                if n < data.len() {
                    self.read_buf = data[n..].to_vec();
                    self.read_pos = 0;
                }
                Poll::Ready(Ok(n))
            }
            Poll::Ready(Some(Ok(Message::Close(_)))) | Poll::Ready(None) => {
                Poll::Ready(Ok(0)) // EOF
            }
            Poll::Ready(Some(Ok(_))) => {
                // Skip non-binary messages (text, ping, pong), re-poll.
                cx.waker().wake_by_ref();
                Poll::Pending
            }
            Poll::Ready(Some(Err(e))) => {
                Poll::Ready(Err(std::io::Error::new(std::io::ErrorKind::Other, e)))
            }
            Poll::Pending => Poll::Pending,
        }
    }
}

impl AsyncWrite for WsIoAdapter {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        match Pin::new(&mut self.inner).poll_ready(cx) {
            Poll::Ready(Ok(())) => {
                let msg = Message::Binary(buf.to_vec().into());
                match Pin::new(&mut self.inner).start_send(msg) {
                    Ok(()) => Poll::Ready(Ok(buf.len())),
                    Err(e) => {
                        Poll::Ready(Err(std::io::Error::new(std::io::ErrorKind::Other, e)))
                    }
                }
            }
            Poll::Ready(Err(e)) => {
                Poll::Ready(Err(std::io::Error::new(std::io::ErrorKind::Other, e)))
            }
            Poll::Pending => Poll::Pending,
        }
    }

    fn poll_flush(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.inner)
            .poll_flush(cx)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
    }

    fn poll_close(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.inner)
            .poll_close(cx)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
    }
}
