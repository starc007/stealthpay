import * as secp from "@noble/secp256k1";
import { keccak256, toBytes } from "viem";
import { type StealthMetaAddress, hexToBytes, bytesToHex } from "./keygen";

export interface StealthAddressResult {
  /** The one-time stealth address (20-byte Ethereum address) */
  stealthAddress: `0x${string}`;
  /** The ephemeral public key the recipient needs to detect this payment */
  ephemeralPubKey: `0x${string}`;
  /** View tag — first byte of shared secret hash, for fast scanning */
  viewTag: number;
}

/**
 * Compute a stealth address for a recipient.
 *
 * EIP-5564 Scheme 1 (secp256k1):
 * 1. Generate random ephemeral key pair (r, R = r*G)
 * 2. Compute shared secret: secret = keccak256(r * V) where V = recipient's viewing pubkey
 * 3. Stealth pubkey = S + secret * G where S = recipient's spending pubkey
 * 4. Stealth address = address(keccak256(stealthPubKey))
 * 5. View tag = first byte of the shared secret hash
 */
export function computeStealthAddress(
  recipientMetaAddress: StealthMetaAddress
): StealthAddressResult {
  // Generate ephemeral key pair
  const ephemeralPrivKey = secp.utils.randomPrivateKey();
  const ephemeralPubKey = secp.getPublicKey(ephemeralPrivKey, true);

  // Compute ECDH shared point: r * V
  const viewingPubBytes = hexToBytes(recipientMetaAddress.viewingPubKey);
  const sharedPoint = secp.getSharedSecret(ephemeralPrivKey, viewingPubBytes, true);

  // Shared secret = keccak256(sharedPoint)
  const sharedSecretHash = keccak256(bytesToHex(sharedPoint));
  const sharedSecret = hexToBytes(sharedSecretHash);

  // View tag = first byte of shared secret hash
  const viewTag = sharedSecret[0];

  // Compute secret * G (the public key corresponding to the shared secret)
  const sharedSecretScalar = sharedSecret;
  const sharedSecretPoint = secp.getPublicKey(sharedSecretScalar, false); // uncompressed

  // Stealth pubkey = S + secret * G (point addition)
  const spendingPubBytes = hexToBytes(recipientMetaAddress.spendingPubKey);
  const spendingPubUncompressed = secp.ProjectivePoint.fromHex(spendingPubBytes);
  const sharedSecretPubPoint = secp.ProjectivePoint.fromHex(sharedSecretPoint);
  const stealthPubPoint = spendingPubUncompressed.add(sharedSecretPubPoint);

  // Convert to uncompressed pubkey bytes (65 bytes, 04 || x || y)
  const stealthPubUncompressed = stealthPubPoint.toRawBytes(false);

  // Stealth address = last 20 bytes of keccak256(pubkey without 04 prefix)
  const pubKeyNoPrefix = stealthPubUncompressed.slice(1); // remove 04 prefix
  const addressHash = keccak256(bytesToHex(pubKeyNoPrefix));
  const stealthAddress = `0x${addressHash.slice(-40)}` as `0x${string}`;

  return {
    stealthAddress,
    ephemeralPubKey: bytesToHex(ephemeralPubKey),
    viewTag,
  };
}

/**
 * Compute a stealth address with a specific ephemeral private key (for testing).
 */
export function computeStealthAddressWithKey(
  recipientMetaAddress: StealthMetaAddress,
  ephemeralPrivKey: Uint8Array
): StealthAddressResult {
  const ephemeralPubKey = secp.getPublicKey(ephemeralPrivKey, true);

  const viewingPubBytes = hexToBytes(recipientMetaAddress.viewingPubKey);
  const sharedPoint = secp.getSharedSecret(ephemeralPrivKey, viewingPubBytes, true);

  const sharedSecretHash = keccak256(bytesToHex(sharedPoint));
  const sharedSecret = hexToBytes(sharedSecretHash);
  const viewTag = sharedSecret[0];

  const sharedSecretPoint = secp.getPublicKey(sharedSecret, false);

  const spendingPubBytes = hexToBytes(recipientMetaAddress.spendingPubKey);
  const spendingPubUncompressed = secp.ProjectivePoint.fromHex(spendingPubBytes);
  const sharedSecretPubPoint = secp.ProjectivePoint.fromHex(sharedSecretPoint);
  const stealthPubPoint = spendingPubUncompressed.add(sharedSecretPubPoint);

  const stealthPubUncompressed = stealthPubPoint.toRawBytes(false);
  const pubKeyNoPrefix = stealthPubUncompressed.slice(1);
  const addressHash = keccak256(bytesToHex(pubKeyNoPrefix));
  const stealthAddress = `0x${addressHash.slice(-40)}` as `0x${string}`;

  return {
    stealthAddress,
    ephemeralPubKey: bytesToHex(ephemeralPubKey),
    viewTag,
  };
}
