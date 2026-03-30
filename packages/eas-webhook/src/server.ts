import express from 'express';
import { ethers } from 'ethers';
import { EAS, SchemaEncoder } from '@ethereum-attestation-service/eas-sdk';

// --- Types ---

interface Registration {
  correlationId: string;
  ethAddress: string;
  createdAt: number;
}

interface AttestationRecord {
  correlationId: string;
  ethAddress: string;
  status: 'pending' | 'attesting' | 'complete' | 'error';
  artistName?: string;
  serverName?: string;
  transcriptHash?: string;
  txHash?: string;
  attestationUid?: string;
  error?: string;
  createdAt: number;
}

interface WebhookPayload {
  server_name: string;
  results: Array<{ type: string; part: string; value: string }>;
  session: Record<string, string>;
  config: unknown;
  transcript: {
    sent: string;
    recv: string;
    sent_length: number;
    recv_length: number;
  };
}

// --- Config ---

const PORT = parseInt(process.env.PORT || '3001', 10);
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const EAS_SCHEMA_UID = process.env.EAS_SCHEMA_UID;
const VERIFIER_URL = process.env.VERIFIER_URL || 'https://demo.tlsnotary.org';

const EAS_CONTRACT = '0xC2679fBD37d54388Ce493F1DB75320D236e1815e'; // Sepolia
const SEPOLIA_RPC = process.env.SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com';

// Schema: string artistName, string serverName, string verifierUrl, bytes32 transcriptHash, uint64 timestamp
const SCHEMA_STRING =
  'string artistName, string serverName, string verifierUrl, bytes32 transcriptHash, uint64 timestamp';

// --- In-memory store ---

const registrations = new Map<string, Registration>();
const attestations = new Map<string, AttestationRecord>();
const webhookBuffer = new Map<string, { payload: WebhookPayload; receivedAt: number }>();

const MAX_ENTRIES = 1000;
const TTL_MS = 60 * 60 * 1000; // 1 hour
const WEBHOOK_BUFFER_TTL_MS = 30 * 1000; // 30 seconds

// Periodic cleanup
setInterval(() => {
  const now = Date.now();

  for (const [id, reg] of registrations) {
    if (now - reg.createdAt > TTL_MS) registrations.delete(id);
  }

  for (const [id, buf] of webhookBuffer) {
    if (now - buf.receivedAt > WEBHOOK_BUFFER_TTL_MS) webhookBuffer.delete(id);
  }

  for (const [id, rec] of attestations) {
    if (now - rec.createdAt > TTL_MS) attestations.delete(id);
  }
}, 60 * 1000);

// --- EAS setup ---

let eas: EAS;
let signer: ethers.Wallet;
let schemaEncoder: SchemaEncoder;

function initEAS() {
  if (!PRIVATE_KEY) {
    console.warn('WARNING: PRIVATE_KEY not set. EAS attestations will fail.');
    return;
  }

  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  signer = new ethers.Wallet(PRIVATE_KEY, provider);
  eas = new EAS(EAS_CONTRACT);
  eas.connect(signer);
  schemaEncoder = new SchemaEncoder(SCHEMA_STRING);

  console.log(`EAS initialized. Attester address: ${signer.address}`);
  if (EAS_SCHEMA_UID) {
    console.log(`Using schema UID: ${EAS_SCHEMA_UID}`);
  } else {
    console.warn('WARNING: EAS_SCHEMA_UID not set. Attestations will fail.');
  }
}

async function submitAttestation(
  ethAddress: string,
  artistName: string,
  serverName: string,
  transcriptHash: string,
): Promise<{ txHash: string; attestationUid: string }> {
  if (!eas || !signer || !EAS_SCHEMA_UID) {
    throw new Error('EAS not configured (missing PRIVATE_KEY or EAS_SCHEMA_UID)');
  }

  const timestamp = BigInt(Math.floor(Date.now() / 1000));

  const encodedData = schemaEncoder.encodeData([
    { name: 'artistName', value: artistName, type: 'string' },
    { name: 'serverName', value: serverName, type: 'string' },
    { name: 'verifierUrl', value: VERIFIER_URL, type: 'string' },
    { name: 'transcriptHash', value: transcriptHash, type: 'bytes32' },
    { name: 'timestamp', value: timestamp, type: 'uint64' },
  ]);

  const tx = await eas.attest({
    schema: EAS_SCHEMA_UID,
    data: {
      recipient: ethAddress,
      expirationTime: BigInt(0),
      revocable: false,
      data: encodedData,
    },
  });

  const uid = await tx.wait();

  if (!tx.receipt) {
    throw new Error('Transaction receipt unavailable after wait()');
  }

  return {
    txHash: tx.receipt.hash,
    attestationUid: uid,
  };
}

// --- Process attestation (called from webhook or buffered match) ---

async function processAttestation(
  correlationId: string,
  registration: Registration,
  payload: WebhookPayload,
) {
  // Extract artist name from results (RECV BODY handler)
  const bodyResult = payload.results.find((r) => r.type === 'RECV' && r.part === 'BODY');
  const artistName = bodyResult?.value || 'Unknown';
  const serverName = payload.server_name;

  // Compute transcript hash
  const transcriptHash = ethers.keccak256(
    ethers.concat([
      ethers.toUtf8Bytes(payload.transcript.sent),
      ethers.toUtf8Bytes(payload.transcript.recv),
    ]),
  );

  const record: AttestationRecord = {
    correlationId,
    ethAddress: registration.ethAddress,
    status: 'attesting',
    artistName,
    serverName,
    transcriptHash,
    createdAt: Date.now(),
  };
  attestations.set(correlationId, record);

  try {
    const { txHash, attestationUid } = await submitAttestation(
      registration.ethAddress,
      artistName,
      serverName,
      transcriptHash,
    );

    record.status = 'complete';
    record.txHash = txHash;
    record.attestationUid = attestationUid;
    console.log(`Attestation complete for ${correlationId}: UID=${attestationUid}`);
  } catch (err) {
    record.status = 'error';
    record.error = err instanceof Error ? err.message : String(err);
    console.error(`Attestation failed for ${correlationId}:`, record.error);
  }
}

// --- Express app ---

const app = express();
app.use(express.json({ limit: '1mb' }));

// CORS for demo frontend
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (_req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Health check
app.get('/health', (_req, res) => {
  res.send('ok');
});

// Service info (attester address, schema UID)
app.get('/info', (_req, res) => {
  res.json({
    attesterAddress: signer?.address ?? null,
    schemaUid: EAS_SCHEMA_UID ?? null,
  });
});

// Register correlation ID + ETH address (with wallet signature verification)
app.post('/register', (req, res) => {
  const { correlationId, ethAddress, signature, message } = req.body;

  if (!correlationId || !ethAddress || !signature || !message) {
    res
      .status(400)
      .json({ error: 'correlationId, ethAddress, signature, and message are required' });
    return;
  }

  // Validate ETH address format
  if (!/^0x[0-9a-fA-F]{40}$/.test(ethAddress)) {
    res.status(400).json({ error: 'Invalid Ethereum address' });
    return;
  }

  // Verify wallet signature
  try {
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== ethAddress.toLowerCase()) {
      res.status(400).json({ error: 'Signature does not match address' });
      return;
    }
  } catch {
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  // Enforce max entries
  if (registrations.size >= MAX_ENTRIES) {
    res.status(503).json({ error: 'Too many pending registrations' });
    return;
  }

  registrations.set(correlationId, {
    correlationId,
    ethAddress,
    createdAt: Date.now(),
  });

  // Check if there's a buffered webhook waiting for this correlationId
  const buffered = webhookBuffer.get(correlationId);
  if (buffered) {
    webhookBuffer.delete(correlationId);
    registrations.delete(correlationId);
    console.log(`Matched buffered webhook for ${correlationId}`);
    processAttestation(
      correlationId,
      { correlationId, ethAddress, createdAt: Date.now() },
      buffered.payload,
    ).catch((err) => console.error(`Attestation error for ${correlationId}:`, err));
  }

  res.json({ success: true });
});

// Verifier webhook endpoint
app.post('/webhook', (req, res) => {
  const payload = req.body as WebhookPayload;

  console.log(
    `Webhook received: server=${payload.server_name}, results=${payload.results?.length}`,
  );
  console.log(`Webhook session:`, JSON.stringify(payload.session));

  // sessionData is flattened into the session object by the verifier
  const correlationId = payload.session?.correlationId;
  if (!correlationId) {
    console.warn('Webhook missing correlationId in session.data');
    res.status(200).json({ received: true, warning: 'No correlationId' });
    return;
  }

  // Deduplicate: skip if already processing/processed
  if (attestations.has(correlationId)) {
    console.log(`Duplicate webhook for ${correlationId}, ignoring`);
    res.status(200).json({ received: true, duplicate: true });
    return;
  }

  // Look up registration
  const registration = registrations.get(correlationId);
  if (!registration) {
    // Buffer the webhook — registration might arrive soon
    if (webhookBuffer.size >= MAX_ENTRIES) {
      console.warn('Webhook buffer full, dropping oldest entries');
      const oldest = webhookBuffer.keys().next().value;
      if (oldest) webhookBuffer.delete(oldest);
    }
    console.log(`No registration for ${correlationId}, buffering webhook`);
    webhookBuffer.set(correlationId, {
      payload,
      receivedAt: Date.now(),
    });
    res.status(200).json({ received: true, buffered: true });
    return;
  }

  // Process attestation asynchronously; delete registration to prevent duplicates
  registrations.delete(correlationId);
  processAttestation(correlationId, registration, payload).catch((err) =>
    console.error(`Attestation error for ${correlationId}:`, err),
  );
  res.status(200).json({ received: true });
});

// Poll attestation status
app.get('/attestation/:id', (req, res) => {
  const { id } = req.params;

  const record = attestations.get(id);
  if (!record) {
    // Check if registration exists but no webhook yet
    if (registrations.has(id)) {
      res.json({ status: 'pending' });
      return;
    }
    res.status(404).json({ error: 'Not found' });
    return;
  }

  res.json({
    status: record.status,
    artistName: record.artistName,
    serverName: record.serverName,
    transcriptHash: record.transcriptHash,
    txHash: record.txHash,
    attestationUid: record.attestationUid,
    error: record.error,
  });
});

// --- Start ---

initEAS();

app.listen(PORT, () => {
  console.log(`EAS webhook server listening on port ${PORT}`);
});
