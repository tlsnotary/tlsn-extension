use std::panic;
use std::ops::Range;
use web_time::Instant;

use hyper::{body::to_bytes, Body, Request, StatusCode};
use futures::{AsyncWriteExt, TryFutureExt};
use futures::channel::oneshot;
use tlsn_prover::{Prover, ProverConfig};

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


pub use wasm_bindgen_rayon::init_thread_pool;
// use rayon::iter::IntoParallelRefIterator;
use rayon::prelude::*;
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

const ROUTE: &str = "i/api/1.1/dm/conversation";
const CONVERSATION_ID: &str = "";

const CLIENT_UUID: &str = "";
const USER_AGENT: &str = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36";

const AUTH_TOKEN: &str = "";
const ACCESS_TOKEN: &str = "";
const CSRF_TOKEN: &str = "";

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
    // log!("!@# 0.1");

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

    // Create a Prover and set it up with the Notary
    // This will set up the MPC backend prior to connecting to the server.
    let prover = Prover::new(config)
        .setup(notary_ws_stream_into)
        .await
        .unwrap();


    // Bind the Prover to the server connection.
    // The returned `mpc_tls_connection` is an MPC TLS connection to the Server: all data written
    // to/read from it will be encrypted/decrypted using MPC with the Notary.
    let (mpc_tls_connection, prover_fut) = prover.connect(client_ws_stream_into).await.unwrap();

    log!("!@# 3");


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
    spawn_local(handled_prover_fut);
    log!("!@# 7");

    // Attach the hyper HTTP client to the TLS connection
    let (mut request_sender, connection) = hyper::client::conn::handshake(mpc_tls_connection.compat())
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


    log!("Starting an MPC TLS connection with the server");

    // Send the request to the Server and get a response via the MPC TLS connection
    let response = request_sender.send_request(request).await.unwrap();

    log!("Got a response from the server");

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
    let mut prover = prover.start_notarize();
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

    let recv_len = prover.recv_transcript().data().len();

    let builder = prover.commitment_builder();

    // Commit to each range of the public outbound data which we want to disclose
    let sent_commitments: Vec<_> = public_ranges
        .iter()
        .map(|r| builder.commit_sent(r.clone()).unwrap())
        .collect();

    // Commit to all inbound data in one shot, as we don't need to redact anything in it
    let recv_commitment = builder.commit_recv(0..recv_len).unwrap();

    // Finalize, returning the notarized session
    let notarized_session = prover.finalize().await.unwrap();

    // Create a proof for all committed data in this session
    let session_proof = notarized_session.session_proof();

    let mut proof_builder = notarized_session.data().build_substrings_proof();

    // Reveal all the public ranges
    for commitment_id in sent_commitments {
        proof_builder.reveal(commitment_id).unwrap();
    }
    proof_builder.reveal(recv_commitment).unwrap();

    let substrings_proof = proof_builder.build().unwrap();
    let res = serde_json::to_string_pretty(&(&session_proof, &substrings_proof, &SERVER_DOMAIN))
        .unwrap();
    log!("res = {}", res);

    let duration = start_time.elapsed();
    log!("!@# request takes: {} seconds", duration.as_secs());

    Ok(())

}


/// Find the ranges of the public and private parts of a sequence.
///
/// Returns a tuple of `(public, private)` ranges.
fn find_ranges(seq: &[u8], private_seq: &[&[u8]]) -> (Vec<Range<usize>>, Vec<Range<usize>>) {
    let mut private_ranges = Vec::new();
    for s in private_seq {
        for (idx, w) in seq.windows(s.len()).enumerate() {
            if w == *s {
                private_ranges.push(idx..(idx + w.len()));
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

    if last_end < seq.len() {
        public_ranges.push(last_end..seq.len());
    }

    (public_ranges, private_ranges)
}
