export function HowItWorks() {
  return (
    <div className="how-it-works">
      <h2 className="how-it-works-title">How It Works</h2>
      <p className="how-it-works-subtitle">
        From a normal TLS session to a verifiable proof, in three steps.
      </p>

      <div className="steps-container">
        <div className="step">
          <div className="step-number">1</div>
          <div className="step-icon">🔒</div>
          <h3 className="step-title">You browse normally</h3>
          <p className="step-description">
            The plugin opens the target website (Spotify, X, Duolingo, …). You log in as you would
            any day. The server sees a normal TLS connection and changes nothing on its side.
          </p>
        </div>

        <div className="step-arrow">→</div>

        <div className="step">
          <div className="step-number">2</div>
          <div className="step-icon">🤝</div>
          <h3 className="step-title">The verifier joins via MPC</h3>
          <p className="step-description">
            Your browser and the verifier jointly operate the TLS connection using multi-party
            computation. The verifier never sees your plaintext, but its participation locks the
            session: the data sent and received cannot be forged afterwards.
          </p>
        </div>

        <div className="step-arrow">→</div>

        <div className="step">
          <div className="step-number">3</div>
          <div className="step-icon">✅</div>
          <h3 className="step-title">The plugin reveals what it discloses</h3>
          <p className="step-description">
            The plugin shows the verifier only the bytes it was written to disclose, or runs a
            zero-knowledge proof for sensitive fields. The verifier checks the disclosure against
            the MPC-committed transcript.
          </p>
        </div>
      </div>

      <div className="how-it-works-note">
        <span className="note-icon">🔐</span>
        <span>
          <strong>Why no notary?</strong> The verifier was part of the TLS session, so it doesn't
          need to take anyone's word for the data afterwards. The only trust assumption is the
          server's TLS certificate, the same one your browser already validates.
        </span>
      </div>
    </div>
  );
}
