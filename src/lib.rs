use std::panic;
use std::ops::Range;
use web_time::Instant;

use hyper::{body::to_bytes, Body, Request, StatusCode};
use futures::{AsyncWriteExt, TryFutureExt};
use futures::channel::oneshot;
use tlsn_prover::{bind_prover, ProverConfig};

// use tokio::io::AsyncWriteExt as _;
use tokio_util::compat::{FuturesAsyncReadCompatExt, TokioAsyncReadCompatExt};

use tokio_util::compat::FuturesAsyncWriteCompatExt;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::spawn_local;

use tracing_web::{MakeConsoleWriter, performance_layer};
use tracing_subscriber::fmt::format::Pretty;
use tracing_subscriber::fmt::time::UtcTime;
use tracing_subscriber::prelude::*;


use ws_stream_wasm::{*};


// pub use wasm_bindgen_rayon::init_thread_pool;
// use rayon::iter::IntoParallelRefIterator;
// use rayon::prelude::*;
// ...

extern crate web_sys;

// A macro to provide `println!(..)`-style syntax for `console.log` logging.
macro_rules! log {
    ( $( $t:tt )* ) => {
        web_sys::console::log_1(&format!( $( $t )* ).into());
    }
}

extern crate console_error_panic_hook;


const SERVER_DOMAIN: &str = "twitter.com";

#[wasm_bindgen]
pub async fn prover() -> Result<(), JsValue> {
    let fmt_layer = tracing_subscriber::fmt::layer()
    .with_ansi(false) // Only partially supported across browsers
    .with_timer(UtcTime::rfc_3339()) // std::time is not available in browsers
    .with_writer(MakeConsoleWriter); // write events to the console
    let perf_layer = performance_layer()
        .with_details_from_fields(Pretty::default());

    tracing_subscriber::registry()
        .with(tracing_subscriber::filter::LevelFilter::DEBUG)
        .with(fmt_layer)
        .with(perf_layer)
        .init(); // Install these as subscribers to tracing events

    // https://github.com/rustwasm/console_error_panic_hook
    panic::set_hook(Box::new(console_error_panic_hook::hook));

    let start_time = Instant::now();

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

    // let mut output = [0u8; 20];
    // let bytes = notary_ws_stream_into.read(&mut output[..]).await.unwrap();
    // assert_eq!(bytes, 18);
    // log!("Received: {:?}", &output[..bytes]);

    // Basic default prover config
    let config = ProverConfig::builder()
        .id("example")
        .server_dns(SERVER_DOMAIN)
        .build()
        .unwrap();

    log!("!@# 1");


    log!("!@# 2");
    let (tls_connection, prover_fut, mux_fut) =
    bind_prover(config, client_ws_stream_into, notary_ws_stream_into)
        .await
        .unwrap();
    log!("!@# 3");


    // Spawn the Prover and Mux tasks to be run concurrently
    // tokio::spawn(mux_fut);
    let handled_mux_fut = async {
        log!("!@# 4");
        match mux_fut.await {
            Ok(_) => {
                log!("!@# 4.1");
                ()
            },
            Err(err) => {
                panic!("An error occurred in mux_fut: {:?}", err);
            }
        }
    };
    log!("!@# 5");
    spawn_local(handled_mux_fut);
    log!("!@# 6");


    // let prover_task = tokio::spawn(prover_fut);
    let (prover_sender, prover_receiver) = oneshot::channel();
    let handled_prover_fut = async {
        match prover_fut.await {
            Ok(prover_result) => {
                // Send the prover
                let _ = prover_sender.send(prover_result);
            },
            Err(err) => {
                panic!("An error occurred in prover_fut: {:?}", err);
            }
        }
    };
    // let prover_task = tokio::spawn(prover_fut);
    spawn_local(handled_prover_fut);
    log!("!@# 7");

    // Attach the hyper HTTP client to the TLS connection
    let (mut request_sender, connection) = hyper::client::conn::handshake(tls_connection.compat_write())
        .await
        .unwrap();
    log!("!@# 8");

    // Spawn the HTTP task to be run concurrently
    // let connection_task = tokio::spawn(connection.without_shutdown());
    let (connection_sender, connection_receiver) = oneshot::channel();
    let connection_fut = connection.without_shutdown();
    let handled_connection_fut = async {
        match connection_fut.await {
            Ok(connection_result) => {
                // Send the connection
                let _ = connection_sender.send(connection_result);
            },
            Err(err) => {
                panic!("An error occurred in connection_task: {:?}", err);
            }
        }
    };
    spawn_local(handled_connection_fut);
    log!("!@# 9");

    // Build the HTTP request to fetch the DMs
    let request = Request::builder()
        .uri(format!(
            "https://{SERVER_DOMAIN}/{ROUTE}/{CONVERSATION_ID}.json"
        ))
        .header("Host", SERVER_DOMAIN)
        .header("Accept", "*/*")
        .header("Accept-Encoding", "identity")
        .header("Connection", "close")
        .header("User-Agent", USER_AGENT)
        .header("Authorization", format!("Bearer {ACCESS_TOKEN}"))
        .header(
            "Cookie",
            format!("auth_token={AUTH_TOKEN}; ct0={CSRF_TOKEN}"),
        )
        .header("Authority", SERVER_DOMAIN)
        .header("X-Twitter-Auth-Type", "OAuth2Session")
        .header("x-twitter-active-user", "yes")
        .header("X-Client-Uuid", CLIENT_UUID)
        .header("X-Csrf-Token", CSRF_TOKEN)
        .body(Body::empty())
        .unwrap();


    log!("Sending request");

    let response = request_sender.send_request(request).await.unwrap();

    log!("Sent request");

    assert!(response.status() == StatusCode::OK);

    log!("Request OK");

    // Pretty printing :)
    let payload = to_bytes(response.into_body()).await.unwrap().to_vec();
    let parsed =
        serde_json::from_str::<serde_json::Value>(&String::from_utf8_lossy(&payload)).unwrap();
    log!("!@# 10");
    log!("{}", serde_json::to_string_pretty(&parsed).unwrap());
    log!("!@# 11");

    // Close the connection to the server
    // let mut client_socket = connection_task.await.unwrap().unwrap().io.into_inner();
    let mut client_socket = connection_receiver.await.unwrap().io.into_inner();
    log!("!@# 12");
    client_socket.close().await.unwrap();
    log!("!@# 13");

    // The Prover task should be done now, so we can grab it.
    // let mut prover = prover_task.await.unwrap().unwrap();
    let mut prover = prover_receiver.await.unwrap();
    log!("!@# 14");

    // Identify the ranges in the transcript that contain secrets
    let (public_ranges, private_ranges) = find_ranges(
        prover.sent_transcript().data(),
        &[
            ACCESS_TOKEN.as_bytes(),
            AUTH_TOKEN.as_bytes(),
            CSRF_TOKEN.as_bytes(),
        ],
    );
    log!("!@# 15");

    // Commit to the outbound transcript, isolating the data that contain secrets
    for range in public_ranges.iter().chain(private_ranges.iter()) {
        prover.add_commitment_sent(range.clone()).unwrap();
    }
    log!("!@# 16");

    // Commit to the full received transcript in one shot, as we don't need to redact anything
    let recv_len = prover.recv_transcript().data().len();
    log!("!@# 17");
    prover.add_commitment_recv(0..recv_len as u32).unwrap();
    log!("!@# 18");

    // Finalize, returning the notarized session
    let notarized_session = prover.finalize().await.unwrap();
    log!("!@# 19");

    log!("Notarization complete!");
    let res_str = serde_json::to_string_pretty(&notarized_session)
            .unwrap();
    log!("Notarized session: {}", res_str);

    let duration = start_time.elapsed();
    log!("!@# request costs: {} seconds", duration.as_secs());

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

