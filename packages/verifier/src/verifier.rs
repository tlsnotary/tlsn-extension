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
pub async fn verifier<T: AsyncWrite + AsyncRead + Send + Unpin + 'static>(
    socket: T,
    max_sent_data: usize,
    max_recv_data: usize,
) -> Result<(String, String), eyre::ErrReport> {
    info!("Starting verification with maxSentData={}, maxRecvData={}", max_sent_data, max_recv_data);

    let config_validator = ProtocolConfigValidator::builder()
        .max_sent_data(max_sent_data)
        .max_recv_data(max_recv_data)
        .build()
        .unwrap();

    info!("config_validator: {:?}", config_validator);
    let verifier_config = VerifierConfig::builder()
        .protocol_config_validator(config_validator)
        .build()
        .unwrap();

    info!("verifier_config: {:?}", verifier_config);
    let verifier = Verifier::new(verifier_config);

    info!("✅ Created verifier");

    // Receive authenticated data.
    info!("🔄 Starting MPC-TLS verification...");
    info!("⏳ BLOCKING: Waiting for prover to connect and send MPC-TLS handshake data...");
    info!("   This will block until prover completes the TLS connection");
    debug!("About to call verifier.verify() - this is the blocking point");

    let VerifierOutput {
        server_name,
        transcript,
        ..
    } = verifier
        .verify(socket.compat(), &VerifyConfig::default())
        .await
        .map_err(|e| eyre!("Verification failed: {}", e))?;

    info!("✅ verify() returned successfully - prover sent all data");

    let server_name =
        server_name.ok_or_else(|| eyre!("prover should have revealed server name"))?;
    let transcript =
        transcript.ok_or_else(|| eyre!("prover should have revealed transcript data"))?;

    info!("server_name: {:?}", server_name);
    info!("transcript: {:?}", transcript);

    // Extract sent and received data
    info!("Extracting transcript data...");
    let sent = transcript.sent_unsafe().to_vec();
    let received = transcript.received_unsafe().to_vec();

    // Check Session info: server name.
    let ServerName::Dns(dns_name) = server_name;
    info!("Server name verified: {:?}", dns_name);

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
