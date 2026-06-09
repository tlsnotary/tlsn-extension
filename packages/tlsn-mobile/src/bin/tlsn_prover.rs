//! `tlsn-prover` — JSON-stdin/stdout shim around `tlsn_mobile::prove`.
//!
//! Consumed by `@tlsn/host-cli`'s RustProverClient. Input wire shape mirrors
//! the existing `NativeHandler` JSON format used by the mobile bridge — see
//! `app/mobile/lib/handlerTranslation.ts` and the serde attributes on the
//! types in `crate::lib`.
//!
//! ```bash
//! echo '{"request": {...}, "options": {...}}' | tlsn-prover
//! # → {"response": {...}, "transcript": {...}, "handlersReceived": 1}
//! ```
//!
//! Errors come back on stderr; exit code is non-zero. Progress is intentionally
//! NOT streamed yet — the CLI today reads stdout once when the child exits.

use std::io::{Read, Write};

use serde::{Deserialize, Serialize};
use tlsn_mobile::{prove, HttpRequest, ProverOptions};

#[derive(Deserialize)]
struct Input {
    request: HttpRequest,
    options: ProverOptions,
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "lowercase")]
enum Output {
    Ok {
        #[serde(flatten)]
        result: tlsn_mobile::ProofResult,
    },
    Err {
        error: String,
    },
}

fn main() {
    let mut buf = String::new();
    if let Err(e) = std::io::stdin().read_to_string(&mut buf) {
        emit_error(format!("reading stdin: {e}"));
        std::process::exit(1);
    }

    let input: Input = match serde_json::from_str(&buf) {
        Ok(v) => v,
        Err(e) => {
            emit_error(format!("parsing input JSON: {e}"));
            std::process::exit(2);
        }
    };

    match prove(input.request, input.options, None) {
        Ok(result) => {
            let out = Output::Ok { result };
            let s = serde_json::to_string(&out).unwrap_or_else(|e| {
                format!("{{\"status\":\"err\",\"error\":\"serialize result: {e}\"}}")
            });
            let _ = std::io::stdout().write_all(s.as_bytes());
            let _ = std::io::stdout().write_all(b"\n");
        }
        Err(e) => {
            emit_error(format!("prove failed: {e:?}"));
            std::process::exit(3);
        }
    }
}

fn emit_error(msg: String) {
    eprintln!("{msg}");
    let out = Output::Err { error: msg };
    if let Ok(s) = serde_json::to_string(&out) {
        let _ = std::io::stdout().write_all(s.as_bytes());
        let _ = std::io::stdout().write_all(b"\n");
    }
}
