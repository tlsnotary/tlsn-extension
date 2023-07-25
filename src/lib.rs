use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::spawn_local;

use ws_stream_wasm::{*};

use tlsn_prover::{bind_prover, ProverConfig};

macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

const SERVER_DOMAIN: &str = "twitter.com";

#[wasm_bindgen(start)]
pub async fn ss() -> Result<(), JsValue> {
    // Basic default prover config
    let config = ProverConfig::builder()
        .id("example")
        .server_dns(SERVER_DOMAIN)
        .build()
        .unwrap();


    let (mut client_ws_meta, client_ws_stream) = WsMeta::connect( "ws://localhost:55688", None ).await
        .expect_throw( "assume the client ws connection succeeds" );
    let (mut notary_ws_meta, notary_ws_stream) = WsMeta::connect( "ws://localhost:7788", None ).await
        .expect_throw( "assume the notary ws connection succeeds" );

    let client_ws_stream_into = client_ws_stream.into_io();
    let notary_ws_stream_into = notary_ws_stream.into_io();
    console_log!("after streams");

    // FIXME: calling `bind_prover` can be compiled but it incurs
    // runtime error `Module not found: Error: Can't resolve 'env'`
    // Bind the Prover to the sockets
    let (_, __, ___) =
        bind_prover(config, client_ws_stream_into, notary_ws_stream_into)
            .await
            .unwrap();

    // spawn_local(async {

    // });
    Ok(())

}
