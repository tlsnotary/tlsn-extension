//! `tlsn-prover` — JSON-stdin/stdout shim around `tlsn_mobile::prove*`.
//!
//! Consumed by `@tlsn/host-cli`'s RustProverClient. Reads newline-delimited
//! JSON commands from stdin, writes one response per command to stdout.
//! Wire shape mirrors the existing `NativeHandler` JSON format used by the
//! mobile bridge (see `app/mobile/lib/handlerTranslation.ts`) so types
//! deserialize directly via serde derives on the uniffi records.
//!
//! Commands
//! --------
//!
//! `{"command":"prove","request":{...},"options":{...}}`
//!   → one-shot prove; emits `{"status":"ok",...ProofResult fields}` and exits.
//!
//! `{"command":"prove_until_reveal","request":{...},"options":{...}}`
//!   → runs the protocol up to compute_reveal; emits
//!     `{"status":"reveal","sessionId":"...","response":{...},"descriptors":[...]}`
//!     and waits for the next command.
//!
//! `{"command":"prove_finalize","sessionId":"...","approved":true}`
//!   → finalizes a session left in the reveal-pending state; emits
//!     `{"status":"ok",...ProofResult fields}` and exits.
//!
//! Errors come back as `{"status":"err","error":"..."}`. Non-zero exit code
//! also accompanies the error.

use std::io::{BufRead, Write};

use serde::{Deserialize, Serialize};
use tlsn_mobile::{prove, prove_finalize, prove_until_reveal, HttpRequest, ProverOptions};

#[derive(Deserialize)]
#[serde(tag = "command", rename_all = "snake_case")]
enum Command {
    Prove {
        request: HttpRequest,
        options: ProverOptions,
    },
    ProveUntilReveal {
        request: HttpRequest,
        options: ProverOptions,
    },
    ProveFinalize {
        #[serde(rename = "sessionId")]
        session_id: String,
        approved: bool,
    },
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "lowercase")]
enum Output {
    Ok {
        #[serde(flatten)]
        result: tlsn_mobile::ProofResult,
    },
    Reveal {
        #[serde(rename = "sessionId")]
        session_id: String,
        response: tlsn_mobile::HttpResponse,
        descriptors: Vec<tlsn_mobile::RevealRangeDescriptor>,
    },
    Err {
        error: String,
    },
}

fn main() {
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) if l.trim().is_empty() => continue,
            Ok(l) => l,
            Err(e) => {
                emit_error(format!("reading stdin: {e}"));
                std::process::exit(1);
            }
        };

        let cmd: Command = match serde_json::from_str(&line) {
            Ok(c) => c,
            Err(e) => {
                emit_error(format!("parsing command JSON: {e}"));
                std::process::exit(2);
            }
        };

        let out = match cmd {
            Command::Prove { request, options } => match prove(request, options, None) {
                Ok(result) => Output::Ok { result },
                Err(e) => Output::Err {
                    error: format!("prove failed: {e:?}"),
                },
            },
            Command::ProveUntilReveal { request, options } => {
                match prove_until_reveal(request, options, None) {
                    Ok(prep) => Output::Reveal {
                        session_id: prep.session_id,
                        response: prep.response,
                        descriptors: prep.descriptors,
                    },
                    Err(e) => Output::Err {
                        error: format!("prove_until_reveal failed: {e:?}"),
                    },
                }
            }
            Command::ProveFinalize { session_id, approved } => {
                match prove_finalize(session_id, approved, None) {
                    Ok(result) => Output::Ok { result },
                    Err(e) => Output::Err {
                        error: format!("prove_finalize failed: {e:?}"),
                    },
                }
            }
        };

        let s = serde_json::to_string(&out)
            .unwrap_or_else(|e| format!("{{\"status\":\"err\",\"error\":\"serialize: {e}\"}}"));
        let _ = stdout.write_all(s.as_bytes());
        let _ = stdout.write_all(b"\n");
        let _ = stdout.flush();

        // For terminal commands (anything ending with Ok or Err), exit after responding.
        if matches!(out, Output::Ok { .. } | Output::Err { .. }) {
            let exit_code = if matches!(out, Output::Err { .. }) { 3 } else { 0 };
            std::process::exit(exit_code);
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
