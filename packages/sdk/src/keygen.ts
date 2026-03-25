import * as secp from "@noble/secp256k1";
import { keccak256 } from "viem";

export interface StealthMetaAddress {
  spendingPubKey: `0x${string}`; // 33-byte compressed public key
  viewingPubKey: `0x${string}`; // 33-byte compressed public key
  /** Concatenated spending + viewing pubkeys (66 bytes) for on-chain registration */
  encoded: `0x${string}`;
}

export interface StealthKeys {
  spendingKey: `0x${string}`; // 32-byte private key
  viewingKey: `0x${string}`; // 32-byte private key
  metaAddress: StealthMetaAddress;
}

/**
 * Generate a stealth meta-address from a root private key.
 *
 * Derives separate spending and viewing keys deterministically:
 * - spendingKey = rootKey
 * - viewingKey = keccak256(rootKey)
 *
 * This separation ensures the viewing key can be shared with a scanner
 * service without exposing spending authority.
 */
export function generateStealthKeys(rootPrivateKey: `0x${string}`): StealthKeys {
  const rootKeyBytes = hexToBytes(rootPrivateKey);

  // Spending key is the root key directly
  const spendingKey = rootKeyBytes;
  const spendingPubKey = secp.getPublicKey(spendingKey, true);

  // Viewing key is derived from the root key via keccak256
  const viewingKeyHex = keccak256(rootPrivateKey);
  const viewingKey = hexToBytes(viewingKeyHex);
  const viewingPubKey = secp.getPublicKey(viewingKey, true);

  const spendingPubHex = bytesToHex(spendingPubKey);
  const viewingPubHex = bytesToHex(viewingPubKey);

  // Encoded meta-address: spending pubkey (33 bytes) || viewing pubkey (33 bytes)
  const encoded = `0x${spendingPubHex.slice(2)}${viewingPubHex.slice(2)}` as `0x${string}`;

  return {
    spendingKey: bytesToHex(spendingKey),
    viewingKey: viewingKeyHex as `0x${string}`,
    metaAddress: {
      spendingPubKey: spendingPubHex,
      viewingPubKey: viewingPubHex,
      encoded,
    },
  };
}

/**
 * Parse a 66-byte encoded stealth meta-address into its component public keys.
 */
export function parseMetaAddress(encoded: `0x${string}`): StealthMetaAddress {
  // Remove 0x prefix, should be 132 hex chars (66 bytes)
  const hex = encoded.slice(2);
  if (hex.length !== 132) {
    throw new Error(`Invalid meta-address length: expected 132 hex chars (66 bytes), got ${hex.length}`);
  }

  const spendingPubKey = `0x${hex.slice(0, 66)}` as `0x${string}`;
  const viewingPubKey = `0x${hex.slice(66)}` as `0x${string}`;

  return { spendingPubKey, viewingPubKey, encoded };
}

// ── Helpers ──────────────────────────────────────

function hexToBytes(hex: `0x${string}`): Uint8Array {
  const clean = hex.slice(2);
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}` as `0x${string}`;
}

export { hexToBytes, bytesToHex };
