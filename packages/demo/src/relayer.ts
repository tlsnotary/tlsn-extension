export interface AttestationResult {
  status: 'pending' | 'attesting' | 'complete' | 'error';
  artistName?: string;
  serverName?: string;
  transcriptHash?: string;
  txHash?: string;
  attestationUid?: string;
  error?: string;
}

const API_BASE = '/api';

export async function registerCorrelation(
  correlationId: string,
  ethAddress: string,
  signature: string,
  message: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correlationId, ethAddress, signature, message }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Registration failed (${res.status})`);
  }
}

export async function pollAttestation(correlationId: string): Promise<AttestationResult> {
  const res = await fetch(`${API_BASE}/attestation/${correlationId}`);
  if (res.status === 404) {
    return { status: 'pending' };
  }
  if (!res.ok) {
    throw new Error(`Poll failed (${res.status})`);
  }
  return res.json();
}

export async function pollUntilComplete(
  correlationId: string,
  timeoutMs = 120_000,
  intervalMs = 3_000,
): Promise<AttestationResult> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const result = await pollAttestation(correlationId);

    if (result.status === 'complete' || result.status === 'error') {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('Attestation polling timed out');
}
