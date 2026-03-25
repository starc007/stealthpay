import * as secp from "@noble/secp256k1";
import { keccak256 } from "viem";
import { hexToBytes, bytesToHex } from "./keygen";

/**
 * Check if a stealth address belongs to you, and if so, derive the private key.
 *
 * EIP-5564 Scheme 1 (secp256k1):
 * 1. Compute shared secret: secret = keccak256(v * R) where v = viewing key, R = ephemeral pubkey
 * 2. Compute expected stealth pubkey: S + secret * G
 * 3. Derive expected address from that pubkey
 * 4. If it matches, stealth private key = s + secret (mod n)
 *
 * @param ephemeralPubKey The ephemeral public key from the announcement
 * @param spendingKey Your spending private key
 * @param viewingKey Your viewing private key
 * @param announcedStealthAddress The stealth address from the announcement (for matching)
 * @returns The stealth private key if this payment is yours, null otherwise
 */
export function checkStealthAddress(
  ephemeralPubKey: `0x${string}`,
  spendingKey: `0x${string}`,
  viewingKey: `0x${string}`,
  announcedStealthAddress: `0x${string}`
): `0x${string}` | null {
  const viewingKeyBytes = hexToBytes(viewingKey);
  const ephemeralPubBytes = hexToBytes(ephemeralPubKey);

  // Compute ECDH shared point: v * R
  const sharedPoint = secp.getSharedSecret(viewingKeyBytes, ephemeralPubBytes, true);

  // Shared secret = keccak256(sharedPoint)
  const sharedSecretHash = keccak256(bytesToHex(sharedPoint));
  const sharedSecret = hexToBytes(sharedSecretHash);

  // Compute expected stealth pubkey: S + secret * G
  const spendingKeyBytes = hexToBytes(spendingKey);
  const spendingPubKey = secp.getPublicKey(spendingKeyBytes, false); // uncompressed
  const sharedSecretPubKey = secp.getPublicKey(sharedSecret, false); // uncompressed

  const spendingPoint = secp.ProjectivePoint.fromHex(spendingPubKey);
  const sharedSecretPoint = secp.ProjectivePoint.fromHex(sharedSecretPubKey);
  const expectedStealthPoint = spendingPoint.add(sharedSecretPoint);

  // Derive expected address
  const stealthPubUncompressed = expectedStealthPoint.toRawBytes(false);
  const pubKeyNoPrefix = stealthPubUncompressed.slice(1);
  const addressHash = keccak256(bytesToHex(pubKeyNoPrefix));
  const expectedAddress = `0x${addressHash.slice(-40)}`.toLowerCase();

  // Compare addresses
  if (expectedAddress !== announcedStealthAddress.toLowerCase()) {
    return null;
  }

  // Derive stealth private key: s + secret (mod n)
  const n = secp.CURVE.n;
  const s = bytesToBigInt(spendingKeyBytes);
  const secret = bytesToBigInt(sharedSecret);
  const stealthPrivKey = mod(s + secret, n);

  return bigIntToHex(stealthPrivKey);
}

/**
 * Quick check using only the viewing key — for scanning without spending authority.
 * Returns the expected stealth address and view tag without deriving the private key.
 */
export function scanStealthAddress(
  ephemeralPubKey: `0x${string}`,
  viewingKey: `0x${string}`,
  spendingPubKey: `0x${string}`
): { expectedAddress: `0x${string}`; viewTag: number } {
  const viewingKeyBytes = hexToBytes(viewingKey);
  const ephemeralPubBytes = hexToBytes(ephemeralPubKey);

  // Compute ECDH shared point: v * R
  const sharedPoint = secp.getSharedSecret(viewingKeyBytes, ephemeralPubBytes, true);

  // Shared secret = keccak256(sharedPoint)
  const sharedSecretHash = keccak256(bytesToHex(sharedPoint));
  const sharedSecret = hexToBytes(sharedSecretHash);
  const viewTag = sharedSecret[0];

  // Compute expected stealth pubkey: S + secret * G
  const spendingPubBytes = hexToBytes(spendingPubKey);
  const sharedSecretPubKey = secp.getPublicKey(sharedSecret, false);

  const spendingPoint = secp.ProjectivePoint.fromHex(spendingPubBytes);
  const sharedSecretPoint = secp.ProjectivePoint.fromHex(sharedSecretPubKey);
  const expectedStealthPoint = spendingPoint.add(sharedSecretPoint);

  const stealthPubUncompressed = expectedStealthPoint.toRawBytes(false);
  const pubKeyNoPrefix = stealthPubUncompressed.slice(1);
  const addressHash = keccak256(bytesToHex(pubKeyNoPrefix));
  const expectedAddress = `0x${addressHash.slice(-40)}` as `0x${string}`;

  return { expectedAddress, viewTag };
}

// ── Helpers ──────────────────────────────────────

function bytesToBigInt(bytes: Uint8Array): bigint {
  let hex = "0x";
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  return BigInt(hex);
}

function mod(a: bigint, m: bigint): bigint {
  return ((a % m) + m) % m;
}

function bigIntToHex(n: bigint): `0x${string}` {
  const hex = n.toString(16).padStart(64, "0");
  return `0x${hex}` as `0x${string}`;
}
