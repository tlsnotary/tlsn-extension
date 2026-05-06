export function WhatAndWhy() {
  return (
    <section id="what-and-why" className="what-and-why">
      <div className="what-and-why-grid">
        <div className="what-and-why-card">
          <h3>Today, web data is locked in.</h3>
          <p>
            TLS protects your connection to a server, but it doesn't give you anything you can show
            someone else. Screenshots are forgeable. APIs require permission from the platform.
          </p>
        </div>
        <div className="what-and-why-card">
          <h3>TLSNotary changes that.</h3>
          <p>
            A <em>verifier</em> joins your TLS session using multi-party computation. They never see
            your plaintext during the session, but their participation means the data you show them
            afterwards can't be faked.
          </p>
        </div>
        <div className="what-and-why-card">
          <h3>Privacy on your terms.</h3>
          <p>
            Reveal a single field, redact the rest, or use zero-knowledge proofs to prove a fact
            without revealing any data. The plugin defines what's disclosed; you decide whether to
            run it, and the code is open for inspection.
          </p>
        </div>
      </div>
    </section>
  );
}
