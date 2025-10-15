use crate::config::{MAX_RECV_DATA, MAX_SENT_DATA};
use eyre::eyre;
use tlsn::{
    config::ProtocolConfigValidator,
    connection::ServerName,
    verifier::{Verifier, VerifierConfig, VerifierOutput, VerifyConfig},
};
use tokio::io::{AsyncRead, AsyncWrite};
use tokio_util::compat::TokioAsyncReadCompatExt;
use tracing::{debug, info};

/// Core verifier logic that validates the TLS proof
pub async fn verify<T: AsyncWrite + AsyncRead + Send + Unpin + 'static>(
    socket: T
) -> Result<(String, String), eyre::ErrReport> {
    debug!("Starting verification...");

    // Setup Verifier.
    let config_validator = ProtocolConfigValidator::builder()
        .max_sent_data(MAX_SENT_DATA)
        .max_recv_data(MAX_RECV_DATA)
        .build()
        .unwrap();

    let verifier_config = VerifierConfig::builder()
        .protocol_config_validator(config_validator)
        .build()
        .unwrap();
    let verifier = Verifier::new(verifier_config);

    // Receive authenticated data.
    debug!("Starting MPC-TLS verification...");

    let VerifierOutput {
        server_name,
        transcript,
        ..
    } = verifier
        .verify(socket.compat(), &VerifyConfig::default())
        .await
        .map_err(|e| eyre!("Verification failed: {}", e))?;

    let server_name =
        server_name.ok_or_else(|| eyre!("prover should have revealed server name"))?;
    let transcript =
        transcript.ok_or_else(|| eyre!("prover should have revealed transcript data"))?;

    // Check sent data: check host.
    debug!("Starting sent data verification...");
    let sent = transcript.sent_unsafe().to_vec();
    let sent_data = String::from_utf8(sent.clone()).expect("Verifier expected sent data");

    // Check received data: check json and version number.
    debug!("Starting received data verification...");
    let received = transcript.received_unsafe().to_vec();
    let response = String::from_utf8(received.clone()).expect("Verifier expected received data");

    debug!("Received data: {:?}", response);
    response
        .find("Ethereum Foundation")
        .ok_or_else(|| eyre!("Verification failed: missing data in received data"))?;

    // Check Session info: server name.
    let ServerName::Dns(dns_name) = server_name;
    info!("Server name: {:?}", dns_name);

    let sent_string = bytes_to_redacted_string(&sent)?;
    let received_string = bytes_to_redacted_string(&received)?;

    info!("============================================");
    info!("Verification successful!");
    info!("============================================");
    info!("Sent data: {:?}", sent_string);
    info!("Received data: {:?}", received_string);

    Ok((sent_string, received_string))
}

/// Render redacted bytes as `🙈`.
fn bytes_to_redacted_string(bytes: &[u8]) -> Result<String, eyre::ErrReport> {
    Ok(String::from_utf8(bytes.to_vec())
        .map_err(|err| eyre!("Failed to parse bytes to redacted string: {err}"))?
        .replace('\0', "🙈"))
}
