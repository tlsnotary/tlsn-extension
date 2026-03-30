/**
 * Register the EAS schema on Sepolia.
 *
 * Usage:
 *   PRIVATE_KEY=0x... npx tsx src/register-schema.ts
 *
 * Prints the schema UID on success. Use it as the EAS_SCHEMA_UID env var.
 */
import { SchemaRegistry } from '@ethereum-attestation-service/eas-sdk';
import { ethers } from 'ethers';

const SCHEMA_REGISTRY_ADDRESS = '0x0a7E2Ff54e76B8E6659aedc9103FB21c038050D0'; // Sepolia
const SEPOLIA_RPC = process.env.SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com';
const SCHEMA =
  'string artistName, string serverName, string verifierUrl, bytes32 transcriptHash, uint64 timestamp';

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('Error: PRIVATE_KEY environment variable is required');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const signer = new ethers.Wallet(privateKey, provider);

  console.log(`Registering schema with wallet: ${signer.address}`);
  console.log(`Schema: ${SCHEMA}`);
  console.log();

  const schemaRegistry = new SchemaRegistry(SCHEMA_REGISTRY_ADDRESS);
  schemaRegistry.connect(signer);

  const tx = await schemaRegistry.register({
    schema: SCHEMA,
    resolverAddress: '0x0000000000000000000000000000000000000000',
    revocable: false,
  });

  console.log('Transaction submitted, waiting for confirmation...');

  const schemaUid = await tx.wait();

  console.log();
  console.log(`Schema registered successfully!`);
  console.log(`Schema UID: ${schemaUid}`);
  console.log();
  console.log(`Export it:`);
  console.log(`  export EAS_SCHEMA_UID=${schemaUid}`);
}

main().catch((err) => {
  console.error('Failed to register schema:', err.message || err);
  process.exit(1);
});
