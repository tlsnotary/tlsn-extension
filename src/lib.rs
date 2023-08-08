use std::panic;
use std::ops::Range;

use hyper::{body::to_bytes, Body, Request, StatusCode};
// use futures::{AsyncWriteExt, TryFutureExt};
use futures_util::io::AsyncWriteExt;
// use tokio::io::AsyncWriteExt as _;
// use tokio_util::compat::{FuturesAsyncReadCompatExt, TokioAsyncReadCompatExt};
// use tokio::io::AsyncWriteExt as _;
// use tokio_util::compat::{FuturesAsyncReadCompatExt, TokioAsyncReadCompatExt};

use wasm_bindgen::prelude::*;
// use wasm_bindgen_futures::spawn_local;

use tracing_web::{MakeConsoleWriter, performance_layer};
use tracing_subscriber::fmt::format::Pretty;
use tracing_subscriber::fmt::time::UtcTime;
use tracing_subscriber::prelude::*;


use ws_stream_wasm::{*};

use tlsn_prover::{bind_prover, ProverConfig};

extern crate web_sys;

// A macro to provide `println!(..)`-style syntax for `console.log` logging.
macro_rules! log {
    ( $( $t:tt )* ) => {
        web_sys::console::log_1(&format!( $( $t )* ).into());
    }
}

extern crate console_error_panic_hook;


#[wasm_bindgen(start)]
pub async fn ss() -> Result<(), JsValue> {
    let fmt_layer = tracing_subscriber::fmt::layer()
    .with_ansi(false) // Only partially supported across browsers
    .with_timer(UtcTime::rfc_3339()) // std::time is not available in browsers
    .with_writer(MakeConsoleWriter); // write events to the console
    let perf_layer = performance_layer()
        .with_details_from_fields(Pretty::default());

    tracing_subscriber::registry()
        .with(fmt_layer)
        .with(perf_layer)
        .init(); // Install these as subscribers to tracing events

    // https://github.com/rustwasm/console_error_panic_hook
    panic::set_hook(Box::new(console_error_panic_hook::hook));

    let (mut client_ws_meta, mut client_ws_stream) = WsMeta::connect( "ws://localhost:55688", None ).await
        .expect_throw( "assume the client ws connection succeeds" );
    let (mut notary_ws_meta, mut notary_ws_stream) = WsMeta::connect( "ws://localhost:7788", None ).await
        .expect_throw( "assume the notary ws connection succeeds" );

    let mut client_ws_stream_into = client_ws_stream.into_io();
    let mut notary_ws_stream_into = notary_ws_stream.into_io();
    log!("!@# 0");

    // let message         = b"Hello from browser".to_vec();

	// notary_ws_stream_into.write(&message).await

	// 	.expect_throw( "Failed to write to websocket" );


    // Basic default prover config
    let config = ProverConfig::builder()
        .id("example")
        .server_dns(SERVER_DOMAIN)
        .build()
        .unwrap();

    log!("!@# 1");

    // Bind the Prover to the sockets
    let (tls_connection, prover_fut, mux_fut) =
        bind_prover(config, client_ws_stream_into, notary_ws_stream_into)
            .await
            .unwrap();

    log!("!@# 2");

    // // Spawn the Prover and Mux tasks to be run concurrently
    // tokio::spawn(mux_fut);
    // log!("!@# 3");
    // let prover_task = tokio::spawn(prover_fut);
    // log!("!@# 4");

    // // Attach the hyper HTTP client to the TLS connection
    // let (mut request_sender, connection) = hyper::client::conn::handshake(tls_connection.compat())
    //     .await
    //     .unwrap();
    // log!("!@# 5");

    // // Spawn the HTTP task to be run concurrently
    // let connection_task = tokio::spawn(connection.without_shutdown());
    // log!("!@# 6");

    // // Build the HTTP request to fetch the DMs
    // let request = Request::builder()
    //     .uri(format!(
    //         "https://{SERVER_DOMAIN}/{ROUTE}/{CONVERSATION_ID}.json"
    //     ))
    //     .header("Host", SERVER_DOMAIN)
    //     .header("Accept", "*/*")
    //     .header("Accept-Encoding", "identity")
    //     .header("Connection", "close")
    //     .header("User-Agent", USER_AGENT)
    //     .header("Authorization", format!("Bearer {ACCESS_TOKEN}"))
    //     .header(
    //         "Cookie",
    //         format!("auth_token={AUTH_TOKEN}; ct0={CSRF_TOKEN}"),
    //     )
    //     .header("Authority", SERVER_DOMAIN)
    //     .header("X-Twitter-Auth-Type", "OAuth2Session")
    //     .header("x-twitter-active-user", "yes")
    //     .header("X-Client-Uuid", CLIENT_UUID)
    //     .header("X-Csrf-Token", CSRF_TOKEN)
    //     .body(Body::empty())
    //     .unwrap();


    // log!("Sending request");

    // let response = request_sender.send_request(request).await.unwrap();

    // log!("Sent request");

    // assert!(response.status() == StatusCode::OK);

    // log!("Request OK");

    // // Pretty printing :)
    // let payload = to_bytes(response.into_body()).await.unwrap().to_vec();
    // let parsed =
    //     serde_json::from_str::<serde_json::Value>(&String::from_utf8_lossy(&payload)).unwrap();
    // log!("!@# 7");
    // log!("{}", serde_json::to_string_pretty(&parsed).unwrap());
    // log!("!@# 8");

    // // Close the connection to the server
    // let mut client_socket = connection_task.await.unwrap().unwrap().io.into_inner();
    // log!("!@# 9");
    // client_socket.close().await.unwrap();
    // log!("!@# 10");

    // // The Prover task should be done now, so we can grab it.
    // let mut prover = prover_task.await.unwrap().unwrap();
    // log!("!@# 11");

    // // Identify the ranges in the transcript that contain secrets
    // let (public_ranges, private_ranges) = find_ranges(
    //     prover.sent_transcript().data(),
    //     &[
    //         ACCESS_TOKEN.as_bytes(),
    //         AUTH_TOKEN.as_bytes(),
    //         CSRF_TOKEN.as_bytes(),
    //     ],
    // );
    // log!("!@# 12");

    // // Commit to the outbound transcript, isolating the data that contain secrets
    // for range in public_ranges.iter().chain(private_ranges.iter()) {
    //     prover.add_commitment_sent(range.clone()).unwrap();
    // }
    // log!("!@# 13");

    // // Commit to the full received transcript in one shot, as we don't need to redact anything
    // let recv_len = prover.recv_transcript().data().len();
    // log!("!@# 14");
    // prover.add_commitment_recv(0..recv_len as u32).unwrap();
    // log!("!@# 15");

    // // Finalize, returning the notarized session
    // let notarized_session = prover.finalize().await.unwrap();
    // log!("!@# 6");

    // log!("Notarization complete!");
    // let res_str = serde_json::to_string_pretty(&notarized_session)
    //         .unwrap();
    // log!("Notarized session: {}", res_str);

    Ok(())

}


/// Find the ranges of the public and private parts of a sequence.
///
/// Returns a tuple of `(public, private)` ranges.
fn find_ranges(seq: &[u8], sub_seq: &[&[u8]]) -> (Vec<Range<u32>>, Vec<Range<u32>>) {
    let mut private_ranges = Vec::new();
    for s in sub_seq {
        for (idx, w) in seq.windows(s.len()).enumerate() {
            if w == *s {
                private_ranges.push(idx as u32..(idx + w.len()) as u32);
            }
        }
    }

    let mut sorted_ranges = private_ranges.clone();
    sorted_ranges.sort_by_key(|r| r.start);

    let mut public_ranges = Vec::new();
    let mut last_end = 0;
    for r in sorted_ranges {
        if r.start > last_end {
            public_ranges.push(last_end..r.start);
        }
        last_end = r.end;
    }

    if last_end < seq.len() as u32 {
        public_ranges.push(last_end..seq.len() as u32);
    }

    (public_ranges, private_ranges)
}

