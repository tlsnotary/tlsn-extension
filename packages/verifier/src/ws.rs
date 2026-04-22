//! Minimal WebSocket upgrade that yields an async-tungstenite stream.
//!
//! Axum's built-in `WebSocketUpgrade` ties the resulting stream to
//! `tokio_tungstenite`, but `ws_stream_tungstenite::WsStream` only accepts
//! `async_tungstenite::WebSocketStream`. Rather than forking axum's entire
//! ws module to swap the backend, we implement just the upgrade handshake
//! here and return the async-tungstenite stream directly.

use async_trait::async_trait;
use async_tungstenite::{
    tokio::TokioAdapter,
    tungstenite::protocol::{Role, WebSocketConfig},
    WebSocketStream,
};
use axum::{
    body::Body,
    extract::FromRequestParts,
    http::{header, request::Parts, HeaderMap, HeaderName, HeaderValue, Method, StatusCode},
    response::{IntoResponse, Response},
};
use base64::Engine;
use hyper_util::rt::TokioIo;
use sha1::{Digest, Sha1};
use std::future::Future;
use tracing::error;

/// The WebSocket stream type handed to upgrade callbacks. Matches what
/// `ws_stream_tungstenite::WsStream::new` expects.
pub type TungsteniteStream =
    WebSocketStream<TokioAdapter<TokioIo<hyper::upgrade::Upgraded>>>;

/// Extractor that performs the WebSocket handshake and yields a raw
/// async-tungstenite stream via [`WsUpgrade::on_upgrade`].
pub struct WsUpgrade {
    key: HeaderValue,
    on_upgrade: hyper::upgrade::OnUpgrade,
}

impl WsUpgrade {
    #[must_use = "to set up the WebSocket connection, this response must be returned"]
    pub fn on_upgrade<F, Fut>(self, callback: F) -> Response
    where
        F: FnOnce(TungsteniteStream) -> Fut + Send + 'static,
        Fut: Future<Output = ()> + Send + 'static,
    {
        tokio::spawn(async move {
            let upgraded = match self.on_upgrade.await {
                Ok(u) => u,
                Err(err) => {
                    error!("WebSocket upgrade failed: {err:?}");
                    return;
                }
            };
            let stream = WebSocketStream::from_raw_socket(
                TokioAdapter::new(TokioIo::new(upgraded)),
                Role::Server,
                Some(WebSocketConfig::default()),
            )
            .await;
            callback(stream).await;
        });

        Response::builder()
            .status(StatusCode::SWITCHING_PROTOCOLS)
            .header(header::CONNECTION, HeaderValue::from_static("upgrade"))
            .header(header::UPGRADE, HeaderValue::from_static("websocket"))
            .header(header::SEC_WEBSOCKET_ACCEPT, sign(self.key.as_bytes()))
            .body(Body::empty())
            .unwrap()
    }
}

pub enum WsRejection {
    MethodNotGet,
    InvalidConnectionHeader,
    InvalidUpgradeHeader,
    InvalidWebSocketVersionHeader,
    WebSocketKeyHeaderMissing,
    ConnectionNotUpgradable,
}

impl IntoResponse for WsRejection {
    fn into_response(self) -> Response {
        match self {
            Self::MethodNotGet => (
                StatusCode::METHOD_NOT_ALLOWED,
                "Request method must be `GET`",
            ),
            Self::InvalidConnectionHeader => (
                StatusCode::BAD_REQUEST,
                "Connection header did not include 'upgrade'",
            ),
            Self::InvalidUpgradeHeader => (
                StatusCode::BAD_REQUEST,
                "`Upgrade` header did not include 'websocket'",
            ),
            Self::InvalidWebSocketVersionHeader => (
                StatusCode::BAD_REQUEST,
                "`Sec-WebSocket-Version` header did not include '13'",
            ),
            Self::WebSocketKeyHeaderMissing => {
                (StatusCode::BAD_REQUEST, "`Sec-WebSocket-Key` header missing")
            }
            Self::ConnectionNotUpgradable => (
                StatusCode::UPGRADE_REQUIRED,
                "Connection not upgradable (HTTP/1.0?)",
            ),
        }
        .into_response()
    }
}

#[async_trait]
impl<S: Send + Sync> FromRequestParts<S> for WsUpgrade {
    type Rejection = WsRejection;

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, Self::Rejection> {
        if parts.method != Method::GET {
            return Err(WsRejection::MethodNotGet);
        }
        if !header_contains(&parts.headers, &header::CONNECTION, "upgrade") {
            return Err(WsRejection::InvalidConnectionHeader);
        }
        if !header_eq(&parts.headers, &header::UPGRADE, "websocket") {
            return Err(WsRejection::InvalidUpgradeHeader);
        }
        if !header_eq(&parts.headers, &header::SEC_WEBSOCKET_VERSION, "13") {
            return Err(WsRejection::InvalidWebSocketVersionHeader);
        }
        let key = parts
            .headers
            .get(header::SEC_WEBSOCKET_KEY)
            .ok_or(WsRejection::WebSocketKeyHeaderMissing)?
            .clone();
        // Sec-WebSocket-Protocol is intentionally ignored: no caller negotiates
        // a subprotocol. To support one, parse the header here and echo the
        // selected value back in `on_upgrade`'s response.
        let on_upgrade = parts
            .extensions
            .remove::<hyper::upgrade::OnUpgrade>()
            .ok_or(WsRejection::ConnectionNotUpgradable)?;
        Ok(Self { key, on_upgrade })
    }
}

fn sign(key: &[u8]) -> HeaderValue {
    let mut sha = Sha1::new();
    sha.update(key);
    sha.update(b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
    let b64 = base64::engine::general_purpose::STANDARD.encode(sha.finalize());
    HeaderValue::from_str(&b64).expect("base64 is valid ASCII")
}

fn header_eq(h: &HeaderMap, k: &HeaderName, v: &str) -> bool {
    h.get(k)
        .is_some_and(|x| x.as_bytes().eq_ignore_ascii_case(v.as_bytes()))
}

fn header_contains(h: &HeaderMap, k: &HeaderName, v: &str) -> bool {
    h.get(k)
        .and_then(|x| std::str::from_utf8(x.as_bytes()).ok())
        .is_some_and(|s| s.to_ascii_lowercase().contains(v))
}
