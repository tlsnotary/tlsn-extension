/**
 * ⚠️  FOR TESTING ONLY — DO NOT USE IN PRODUCTION ⚠️
 *
 * Generates a random Ethereum wallet and prints the address and private key.
 * This is intended for Sepolia testnet usage only.
 *
 * The private key is printed to stdout. Do not use this wallet for mainnet
 * or to hold any real value.
 *
 * Usage:
 *   npm run create-wallet
 */
import { ethers } from 'ethers';

const wallet = ethers.Wallet.createRandom();

console.log('⚠️  FOR TESTING ONLY — DO NOT USE FOR MAINNET OR REAL FUNDS ⚠️');
console.log();
console.log(`Address:     ${wallet.address}`);
console.log(`Private Key: ${wallet.privateKey}`);
console.log();
console.log('Next steps:');
console.log(`  1. Fund this address with Sepolia ETH from a faucet`);
console.log(`  2. Export the key:  export PRIVATE_KEY=${wallet.privateKey}`);
console.log(`  3. Register schema: npm run register-schema`);
