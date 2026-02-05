//! I/O Adapters for TLSN
//!
//! This module provides adapters that bridge different async I/O types:
//! - `WsStreamAdapter`: Adapts WebSocket streams to tokio's AsyncRead/AsyncWrite
//! - `HyperIo`: Adapts tokio's AsyncRead/AsyncWrite to hyper's rt::Read/Write

use std::pin::Pin;
use std::task::{Context, Poll};
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};
use tokio::net::TcpStream;
use tokio_tungstenite::{tungstenite::Message, MaybeTlsStream, WebSocketStream};
use futures::{Sink, Stream};

// ============================================================================
// WebSocket Adapter
// ============================================================================

/// Wrapper to adapt WebSocket stream to AsyncRead + AsyncWrite
pub struct WsStreamAdapter {
    inner: WebSocketStream<MaybeTlsStream<TcpStream>>,
    read_buffer: Vec<u8>,
    read_offset: usize,
}

impl WsStreamAdapter {
    pub fn new(ws: WebSocketStream<MaybeTlsStream<TcpStream>>) -> Self {
        Self {
            inner: ws,
            read_buffer: Vec::new(),
            read_offset: 0,
        }
    }
}

impl AsyncRead for WsStreamAdapter {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        // If we have buffered data, return it
        if self.read_offset < self.read_buffer.len() {
            let remaining = &self.read_buffer[self.read_offset..];
            let to_copy = std::cmp::min(remaining.len(), buf.remaining());
            buf.put_slice(&remaining[..to_copy]);
            self.read_offset += to_copy;
            return Poll::Ready(Ok(()));
        }

        // Clear the buffer and read new data
        self.read_buffer.clear();
        self.read_offset = 0;

        match Pin::new(&mut self.inner).poll_next(cx) {
            Poll::Ready(Some(Ok(msg))) => {
                match msg {
                    Message::Binary(data) => {
                        let to_copy = std::cmp::min(data.len(), buf.remaining());
                        buf.put_slice(&data[..to_copy]);
                        if data.len() > to_copy {
                            self.read_buffer = data[to_copy..].to_vec();
                        }
                        Poll::Ready(Ok(()))
                    }
                    Message::Text(text) => {
                        let data = text.into_bytes();
                        let to_copy = std::cmp::min(data.len(), buf.remaining());
                        buf.put_slice(&data[..to_copy]);
                        if data.len() > to_copy {
                            self.read_buffer = data[to_copy..].to_vec();
                        }
                        Poll::Ready(Ok(()))
                    }
                    Message::Ping(_) | Message::Pong(_) => {
                        // Skip ping/pong and try again
                        cx.waker().wake_by_ref();
                        Poll::Pending
                    }
                    Message::Close(_) => {
                        Poll::Ready(Ok(())) // EOF
                    }
                    _ => {
                        cx.waker().wake_by_ref();
                        Poll::Pending
                    }
                }
            }
            Poll::Ready(Some(Err(e))) => {
                Poll::Ready(Err(std::io::Error::new(std::io::ErrorKind::Other, e)))
            }
            Poll::Ready(None) => Poll::Ready(Ok(())), // EOF
            Poll::Pending => Poll::Pending,
        }
    }
}

impl AsyncWrite for WsStreamAdapter {
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
                    Err(e) => Poll::Ready(Err(std::io::Error::new(std::io::ErrorKind::Other, e))),
                }
            }
            Poll::Ready(Err(e)) => {
                Poll::Ready(Err(std::io::Error::new(std::io::ErrorKind::Other, e)))
            }
            Poll::Pending => Poll::Pending,
        }
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        match Pin::new(&mut self.inner).poll_flush(cx) {
            Poll::Ready(Ok(())) => Poll::Ready(Ok(())),
            Poll::Ready(Err(e)) => {
                Poll::Ready(Err(std::io::Error::new(std::io::ErrorKind::Other, e)))
            }
            Poll::Pending => Poll::Pending,
        }
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        match Pin::new(&mut self.inner).poll_close(cx) {
            Poll::Ready(Ok(())) => Poll::Ready(Ok(())),
            Poll::Ready(Err(e)) => {
                Poll::Ready(Err(std::io::Error::new(std::io::ErrorKind::Other, e)))
            }
            Poll::Pending => Poll::Pending,
        }
    }
}

// ============================================================================
// Hyper I/O Adapter
// ============================================================================

/// Wrapper to adapt tokio's AsyncRead/AsyncWrite to hyper's rt::Read/Write
pub struct HyperIo<T>(pub T);

impl<T> HyperIo<T> {
    pub fn new(inner: T) -> Self {
        Self(inner)
    }
}

impl<T: AsyncRead + Unpin> hyper::rt::Read for HyperIo<T> {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        mut buf: hyper::rt::ReadBufCursor<'_>,
    ) -> Poll<std::io::Result<()>> {
        // Safety: we need to initialize the buffer for tokio's ReadBuf
        let unfilled = unsafe { buf.as_mut() };
        let mut read_buf = ReadBuf::uninit(unfilled);

        match Pin::new(&mut self.0).poll_read(cx, &mut read_buf) {
            Poll::Ready(Ok(())) => {
                let filled = read_buf.filled().len();
                unsafe { buf.advance(filled) };
                Poll::Ready(Ok(()))
            }
            Poll::Ready(Err(e)) => Poll::Ready(Err(e)),
            Poll::Pending => Poll::Pending,
        }
    }
}

impl<T: AsyncWrite + Unpin> hyper::rt::Write for HyperIo<T> {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        Pin::new(&mut self.0).poll_write(cx, buf)
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.0).poll_flush(cx)
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.0).poll_shutdown(cx)
    }
}
