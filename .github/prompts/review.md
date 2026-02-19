# Code Review Guidelines

You are reviewing code for the TLSNotary Browser Extension, a Chrome Extension (Manifest V3) and supporting packages for generating TLS proofs in the browser using the TLSNotary protocol.

## Project Context

- **Monorepo**: npm workspaces with packages: `extension`, `plugin-sdk`, `common`, `verifier` (Rust), `demo`, `tutorial`.
- **Security-sensitive**: Handles cryptographic proofs, TLS transcripts, and selective disclosure of private data.
- **Browser extension**: Code runs in service workers, content scripts, offscreen documents, and sandboxed QuickJS environments.
- **Plugin system**: Third-party plugins run in a QuickJS sandbox with capability injection - review capability boundaries carefully.
- **Not production ready**: Project is under active development with expected breaking changes.

## Review Focus Areas

### Security (High Priority)

- No secrets (tokens, credentials, private keys) logged or exposed in messages
- Content script origin validation on `postMessage` handlers
- Plugin sandbox boundaries: no unintended capability leaks from Host to QuickJS
- URL validation before opening windows or making requests
- Proper CSP compliance (extension uses `wasm-unsafe-eval`)
- Selective disclosure handlers: ensure only intended data ranges are revealed in proofs

### Extension Architecture

- Message passing between contexts (background, content script, popup, offscreen) is correct
- Service worker lifecycle: no assumptions about persistent state
- `WindowManager` limits enforced (max 10 windows, max 1000 requests per window)
- Offscreen document created/reused correctly (not duplicated)
- `webextension-polyfill` used for cross-browser compatibility where applicable

### Plugin SDK

- QuickJS sandbox isolation maintained - no filesystem or network access leaks
- Host capability injection is minimal and well-scoped
- State management (`useState`/`setState`) triggers re-renders correctly
- DOM JSON output from plugins is sanitized before rendering in content scripts
- Parser byte-range tracking is accurate for selective disclosure

### Code Quality

- TypeScript strict mode compliance
- Prefer `const` over `let`, avoid `any` (warning-level per ESLint config)
- Follow existing Prettier config: single quotes, 2-space indent, semicolons, 80-char print width
- No `@ts-ignore` without justification
- Padding lines between statements (enforced by ESLint)

### API Design

- Breaking changes to the plugin API (`prove()`, hooks, UI components) are clearly justified
- New Host capabilities are documented and minimal
- Error messages are descriptive and actionable
- Handler types (`SENT`/`RECV`, parts, actions) are consistent with existing patterns

### Testing

- New functionality has corresponding Vitest tests
- Plugin SDK parser tests use sanitized/redacted test data (no real tokens or usernames)
- Edge cases and error conditions are tested
- Rust verifier changes have `cargo test` coverage

### Dependencies

- New npm dependencies are justified and audited for security
- `package-lock.json` is updated when `package.json` changes
- New Rust dependencies are justified; `Cargo.lock` updated with `Cargo.toml` changes
- WASM-compatible alternatives used where needed

### Verifier Server (Rust)

- WebSocket session lifecycle is correct (creation, verification, cleanup)
- Webhook payloads contain only redacted/revealed data, not full transcripts
- Configuration changes to `config.yaml` schema are backward-compatible
- Proxy endpoint validates target host tokens

## Review Style

- Be constructive and specific
- Explain *why* something is a problem, not just *what*
- Suggest concrete fixes when possible
- Distinguish between blocking issues and suggestions
- Acknowledge good patterns and improvements

## Out of Scope

- Stylistic preferences already handled by Prettier and ESLint
- Webpack configuration unless it affects security or correctness
