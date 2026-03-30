# EAS Webhook Service

Receives TLSNotary verifier webhooks and creates [EAS](https://attest.sh/) attestations on Sepolia testnet.

## Prerequisites

- Node.js >= 18
- A Sepolia wallet funded with testnet ETH (for gas)

## Setup

### 1. Install dependencies

```bash
cd packages/eas-webhook
npm install
```

### 2. Create a Sepolia wallet

Generate a testnet wallet (or use an existing one):

```bash
npm run create-wallet
```

This prints an address and private key. Fund it with Sepolia ETH from a faucet (e.g. [sepoliafaucet.com](https://sepoliafaucet.com)), then export the key:

```bash
export PRIVATE_KEY=0x...
```

> **Warning**: `create-wallet` is for testing only. Do not use the generated wallet for mainnet or real funds.

### 3. Register the EAS schema

A script is provided to register the schema on Sepolia automatically:

```bash
PRIVATE_KEY=0x... npm run register-schema
```

This registers the following schema (non-revocable, no resolver):

```
string artistName, string serverName, string verifierUrl, bytes32 transcriptHash, uint64 timestamp
```

The script prints the schema UID on success:

```
Schema registered successfully!
Schema UID: 0x...

Export it:
  export EAS_SCHEMA_UID=0x...
```

Export the UID:

```bash
export EAS_SCHEMA_UID=0x...
```

### 4. Run the service

```bash
npm run dev
```

The server starts on port 3001 by default.

## Environment Variables

| Variable         | Required | Default                                       | Description                                                     |
| ---------------- | -------- | --------------------------------------------- | --------------------------------------------------------------- |
| `PRIVATE_KEY`    | Yes      | —                                             | Sepolia wallet private key for signing attestation transactions |
| `EAS_SCHEMA_UID` | Yes      | —                                             | Schema UID from step 2 above                                    |
| `PORT`           | No       | `3001`                                        | HTTP server port                                                |
| `SEPOLIA_RPC`    | No       | `https://ethereum-sepolia-rpc.publicnode.com` | Sepolia RPC endpoint                                            |
| `VERIFIER_URL`   | No       | `https://demo.tlsnotary.org`                  | Verifier URL stored in attestations                             |

## API Endpoints

| Method | Path               | Description                                                        |
| ------ | ------------------ | ------------------------------------------------------------------ |
| `GET`  | `/health`          | Health check — returns `"ok"`                                      |
| `POST` | `/register`        | Register a correlation ID with an ETH address and wallet signature |
| `POST` | `/webhook`         | Receives verifier webhook payload, creates EAS attestation         |
| `GET`  | `/attestation/:id` | Poll attestation status by correlation ID                          |

### POST /register

```json
{
  "correlationId": "uuid",
  "ethAddress": "0x...",
  "signature": "0x...",
  "message": "Attest my Spotify data to 0x..."
}
```

The signature is verified against the provided address using `ethers.verifyMessage`.

### POST /webhook

Receives the [verifier webhook payload](../verifier/README.md) automatically. The `correlationId` is read from `session.data.correlationId`. The artist name is extracted from the `RECV`/`BODY` handler result.

### GET /attestation/:id

```json
{
  "status": "complete",
  "artistName": "Radiohead",
  "serverName": "api.spotify.com",
  "transcriptHash": "0x3a7f...9b2c",
  "txHash": "0xabc1...def2",
  "attestationUid": "0x..."
}
```

Status values: `pending`, `attesting`, `complete`, `error`.

## Docker Deployment

The service is included in the demo's `docker-compose.yml`:

```bash
# 1. Register schema (one-time, from packages/eas-webhook)
cd packages/eas-webhook && npm install
PRIVATE_KEY=0x... npm run register-schema
# Note the schema UID from the output

# 2. Start all services
cd packages/demo
export PRIVATE_KEY=0x...
export EAS_SCHEMA_UID=0x...  # from step 1
docker compose up --build
```

The nginx proxy routes `/api/*` to this service. The verifier is configured (via `verifier-config.yaml`) to send `api.spotify.com` webhooks to `http://eas-webhook:3001/webhook`.

## EAS Attestation Schema

Each attestation contains:

| Field            | Type      | Description                                                                |
| ---------------- | --------- | -------------------------------------------------------------------------- |
| `artistName`     | `string`  | The proven top artist from Spotify                                         |
| `serverName`     | `string`  | TLS server hostname (e.g. `api.spotify.com`)                               |
| `verifierUrl`    | `string`  | Verifier that performed the verification                                   |
| `transcriptHash` | `bytes32` | `keccak256(sent_transcript \|\| recv_transcript)` — links to the TLS proof |
| `timestamp`      | `uint64`  | Unix timestamp of attestation creation                                     |

The attestation **recipient** is the user's ETH address (verified via wallet signature). The **attester** is the relayer wallet.

## How It Works

The EAS webhook service links a user's wallet address to a TLSNotary proof using a **correlation ID**:

```
Frontend                    EAS Webhook Server              Verifier
   │                              │                            │
   │ 1. Connect wallet, sign msg  │                            │
   │                              │                            │
   │ 2. POST /register            │                            │
   │    {correlationId, address,  │                            │
   │     signature}               │                            │
   │                              │                            │
   │    Verifies signature,       │                            │
   │    stores: uuid → address    │                            │
   │                              │                            │
   │ 3. execCode(plugin,          │                            │
   │    {sessionData:             │                            │
   │      {correlationId}})       │                            │
   │         │                    │                            │
   │         └─── prove() ────────┼───────────────────────────→│
   │                              │                            │
   │                              │ 4. POST /webhook           │
   │                              │    {session:               │
   │                              │      {correlationId},      │
   │                              │     results, transcript}   │
   │                              │                            │
   │                              │ 5. Looks up uuid → address │
   │                              │    Submits EAS attestation │
   │                              │    with recipient = address│
   │                              │                            │
   │ 6. GET /attestation/:id      │                            │
   │    ← {status, txHash, uid}   │                            │
```

1. **Frontend** generates a random `correlationId` (UUID) and registers it with the EAS server alongside the user's wallet address + a wallet signature proving ownership.
2. **EAS server** verifies the signature via `ethers.verifyMessage`, then stores the mapping `correlationId → ethAddress`.
3. **Frontend** passes the same `correlationId` into `execCode()` as `sessionData`. The extension threads this through SessionManager → `prove()` → verifier.
4. **Verifier** completes the MPC-TLS proof and fires a webhook containing the `correlationId` in `session.data`, along with the proven results and transcript.
5. **EAS server** receives the webhook, looks up the `correlationId` to find the registered wallet address, and submits an EAS attestation on Sepolia with that address as the **recipient**.
6. **Frontend** polls `GET /attestation/:id` until the attestation transaction is confirmed.

A webhook buffer handles race conditions where the webhook arrives before the registration completes (within a 30-second window).

## Known Limitations

This is a **demo implementation**. The following limitations apply if adapting for production:

### No deduplication of attestations

A user can generate multiple EAS attestations from the same TLSNotary proof (or the same underlying data). Each `prove()` call creates a new `correlationId`, so the same Spotify account can produce unlimited attestations.

**Possible mitigations:**

- **Hash-based deduplication on-chain**: Include a hash of the user's proven identity (e.g., `keccak256(spotifyUsername)`) in the attestation schema. A resolver contract can check for existing attestations with the same identity hash and reject duplicates.
- **Server-side deduplication**: The verifier or EAS webhook server maintains a set of previously attested identities (e.g., Spotify usernames) in a database and rejects duplicate webhook payloads.

### In-memory storage

Registrations, attestations, and buffered webhooks are stored in memory. They are lost on server restart and limited to 1000 entries with a 1-hour TTL. A production deployment should use persistent storage.

### Single attester key

All attestations are signed by a single relayer wallet. The private key must be kept secure. Consider using a hardware security module (HSM) or multisig for production.
