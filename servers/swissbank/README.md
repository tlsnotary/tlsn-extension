# swissbank

Fake Swiss bank server with a dashboard UI, used as a target for TLSNotary
demos. Part of the `servers/` Cargo workspace in the tlsn-extension monorepo.

Inspired by `httpbin.org`. Originally built for the DevConnect 2025 demo.

## Quickstart

From the workspace root (`servers/`):

```bash
cargo run --release -p swissbank
```

Or from this crate's directory:

```bash
cargo run --release
```

Visit http://localhost:3000/ to view the dashboard.

## Dashboard UI

The dashboard at `/` shows:

- **Swiss Bank Demo** header with explanation
- **Bank Reserves** with fake bank balances
- **Live Access Log** displaying authorized/unauthorized requests to `/balances`
- Large fonts and high contrast colors suitable for booth display

## Configuration

- `PORT` — port the server listens on (default `3000`).
- `RUST_LOG` — log level (e.g. `info`, `debug`).

```bash
PORT=3001 RUST_LOG=info cargo run --release
```

## Bank Balances Endpoint

`/balances` returns fake bank balance data:

```bash
# Unauthorized access (logged as "unauthorized")
curl http://localhost:3000/balances

# Authorized access (logged as "authorized")
curl http://localhost:3000/balances -H "Authorization: Bearer random_auth_token"
```

All access attempts are logged and displayed in real-time on the dashboard UI.

## Docker

```bash
docker build -f servers/swissbank/Dockerfile -t swissbank servers/
docker run --rm -p 3000:3000 swissbank
```

Production images are published as `ghcr.io/tlsnotary/tlsn-extension/swissbank:latest`
by the [swissbank workflow](../../.github/workflows/swissbank.yml) whenever this
crate's source changes on `main`. HTTPS termination, certs, and the public
domain (`swissbank.tlsnotary.org`) are handled by the deployment host, not this
repo.
