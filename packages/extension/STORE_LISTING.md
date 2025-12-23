# Chrome Web Store Listing

## Extension Name
TLSNotary

## Description

TLSNotary Extension enables you to create cryptographic proofs of any data you access on the web. Prove ownership of your online accounts, verify your credentials, or demonstrate that you received specific information from a website—all without exposing your private data.

### What is TLSNotary?

TLSNotary is an open-source protocol that allows you to prove the authenticity of any data fetched from websites. When you visit an HTTPS website, your browser establishes a secure TLS (Transport Layer Security) connection. TLSNotary leverages this existing security infrastructure to generate verifiable proofs that specific data was genuinely returned by a particular website, without requiring any cooperation from the website itself.

### Why Install This Extension?

**Prove What You See Online**
Have you ever needed to prove that a website displayed certain information? Whether it's proving your account balance, ownership of a social media profile, or the contents of a private message, TLSNotary creates tamper-proof cryptographic evidence that stands up to scrutiny.

**Privacy-Preserving Proofs**
Unlike screenshots or screen recordings that can be easily faked and expose all your data, TLSNotary proofs are:
- Cryptographically verifiable and cannot be forged
- Selectively disclosed—reveal only the specific data points you choose while keeping everything else private
- Generated without exposing your login credentials or session tokens to third parties

**No Website Cooperation Required**
TLSNotary works with any HTTPS website without requiring the website to implement any special support. The proof generation happens entirely in your browser, using the standard TLS connection you already have.

### Key Features

**Cryptographic Data Proofs**
Generate unforgeable proofs that specific data was returned by a website. Each proof contains cryptographic evidence tied to the website's TLS certificate, making it impossible to fabricate or alter.

**Selective Disclosure**
Choose exactly what information to reveal in your proofs. Prove your account balance without revealing your transaction history. Verify your identity without exposing your full profile. Show specific fields while keeping everything else hidden.

**Plugin System**
Build and run custom plugins for specific proof workflows. The extension includes a Developer Console with a code editor for creating and testing plugins. Use React-like hooks for reactive UI updates and easy integration with the proof generation pipeline.

**Multi-Window Management**
Open and manage multiple browser windows for tracking different proof sessions. Each window maintains its own request history, allowing you to work on multiple proofs simultaneously.

**Request Interception**
Automatically capture HTTP/HTTPS requests from managed windows. View intercepted requests in real-time through an intuitive overlay interface. Select the specific requests you want to include in your proofs.

**Sandboxed Execution**
Plugins run in an isolated QuickJS WebAssembly environment for security. Network and filesystem access are disabled by default, ensuring plugins cannot access data beyond what you explicitly provide.

### Use Cases

**Identity Verification**
Prove you own a specific social media account, email address, or online profile without sharing your password or giving third-party access to your account.

**Financial Attestations**
Demonstrate your account balance, transaction history, or financial standing to lenders, landlords, or other parties who require proof—without exposing your complete financial information.

**Content Authentication**
Create verifiable evidence of online content that cannot be forged. Useful for legal documentation, journalism, research, or any situation where proving the authenticity of web content matters.

**Credential Verification**
Prove your credentials, certifications, or qualifications as displayed by official issuing organizations, without relying on easily-faked screenshots.

**Privacy-Preserving KYC**
Complete Know Your Customer (KYC) requirements while revealing only the minimum necessary information. Prove you meet eligibility criteria without exposing your full identity.

### How It Works

1. **Install the Extension**: Add TLSNotary to Chrome from the Web Store.

2. **Access the Developer Console**: Right-click on any webpage and select "Developer Console" to open the plugin editor.

3. **Run a Plugin**: Use the built-in example plugins or write your own. Plugins define what data to capture and which parts to include in proofs.

4. **Generate Proofs**: The extension captures your HTTPS traffic, creates a cryptographic commitment with a verifier server, and generates a proof of the data you selected.

5. **Share Selectively**: Export proofs containing only the data you want to reveal. Verifiers can confirm the proof's authenticity without seeing your hidden information.

### Technical Details

- **Manifest V3**: Built on Chrome's latest extension platform for improved security and performance
- **WebAssembly Powered**: Uses compiled Rust code via WebAssembly for efficient cryptographic operations
- **Plugin SDK**: Comprehensive SDK for developing custom proof workflows with TypeScript support
- **Open Source**: Full source code available for review and community contributions

### Requirements

- Chrome browser version 109 or later (for offscreen document support)
- A verifier server for proof generation (public servers available or run your own)
- Active internet connection for HTTPS request interception

### Privacy and Security

TLSNotary is designed with privacy as a core principle:

- **No Data Collection**: The extension does not collect, store, or transmit your browsing data to any third party
- **Local Processing**: All proof generation happens locally in your browser
- **Open Source**: The entire codebase is publicly auditable
- **Selective Disclosure**: You control exactly what data appears in proofs
- **Sandboxed Plugins**: Plugin code runs in an isolated environment with no access to your system

### Getting Started

After installation:

1. Right-click anywhere on a webpage
2. Select "Developer Console" from the context menu
3. Review the example plugin code in the editor
4. Click "Run Code" to execute the plugin
5. Follow the on-screen instructions to generate your first proof

For detailed documentation, tutorials, and plugin development guides, visit the TLSNotary documentation site.

### About TLSNotary

TLSNotary is an open-source project dedicated to enabling data portability and verifiable provenance for web data. The protocol has been in development since 2013 and has undergone multiple security audits. Join our community to learn more about trustless data verification and contribute to the future of verifiable web data.

### Support and Feedback

- Documentation: https://docs.tlsnotary.org/
- GitHub: https://github.com/tlsnotary/tlsn-extension
- Issues: https://github.com/tlsnotary/tlsn-extension/issues

Licensed under MIT and Apache 2.0 licenses.

---

## Screenshot Captions

### Screenshot 1: Plugin UI
**Caption:** "Prove any web data without compromising privacy"

### Screenshot 2: Permission Popup
**Caption:** "Control exactly what data you reveal in each proof"

### Screenshot 3: Developer Console
**Caption:** "Build custom plugins with the built-in code editor"

---

## Permission Justifications

The following permissions are required for the extension's core functionality of generating cryptographic proofs of web data:

### offscreen

**Justification:** Required to create offscreen documents for executing WebAssembly-based cryptographic operations. The TLSNotary proof generation uses Rust compiled to WebAssembly, which requires DOM APIs unavailable in Manifest V3 service workers. The offscreen document hosts the plugin execution environment (QuickJS sandbox) and the cryptographic prover that generates TLS proofs. Without this permission, the extension cannot perform its core function of generating cryptographic proofs.

### webRequest

**Justification:** Required to intercept HTTP/HTTPS requests from browser windows managed by the extension. When users initiate a proof generation workflow, the extension opens a managed browser window and captures the HTTP request/response data that will be included in the cryptographic proof. This interception is essential for capturing the exact data the user wants to prove, including request headers and URLs. The extension only intercepts requests in windows it explicitly manages for proof generation—not general browsing activity.

### storage

**Justification:** Required to persist user preferences and plugin configurations across browser sessions. The extension stores user settings such as preferred verifier server URLs and plugin code. This ensures users do not need to reconfigure the extension each time they restart their browser.

### activeTab

**Justification:** Required to access information about the currently active tab when the user initiates a proof generation workflow. The extension needs to read the current page URL and title to display context in the Developer Console and to determine which requests belong to the active proof session.

### tabs

**Justification:** Required to create, query, and manage browser tabs for proof generation workflows. When a plugin opens a managed window for capturing web data, the extension must create new tabs, send messages to content scripts in those tabs, and track which tabs belong to which proof session. This is essential for the multi-window proof management feature.

### windows

**Justification:** Required to create and manage browser windows for proof generation sessions. The extension opens dedicated browser windows when users run proof plugins, allowing isolation of the proof capture session from regular browsing. The extension tracks these windows to route intercepted requests to the correct proof session and to clean up resources when windows are closed.

### contextMenus

**Justification:** Required to add the "Developer Console" menu item to the browser's right-click context menu. This provides the primary access point for users to open the plugin development and execution interface. Without this permission, users would have no convenient way to access the Developer Console for writing and running proof plugins.

### Host Permissions (<all_urls>)

**Justification:** Required because TLSNotary is designed to generate cryptographic proofs of data from any HTTPS website. Users need to prove data from various websites including social media platforms, financial services, government portals, and any other web service. The extension cannot predict which websites users will need to generate proofs for, so it requires broad host access to intercept requests and inject content scripts for the proof overlay UI. The extension only actively intercepts requests in windows explicitly managed for proof generation—it does not monitor or collect data from general browsing activity.

---

## Single Purpose Description

TLSNotary Extension has a single purpose: to generate cryptographic proofs of web data. All requested permissions directly support this purpose by enabling request interception for proof capture, window management for proof sessions, and background processing for cryptographic operations.
