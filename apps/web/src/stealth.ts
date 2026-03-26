import * as secp from "@noble/secp256k1";
import { keccak256 } from "viem";

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
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

export function randomKey(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export function truncate(hex: string, n = 8): string {
  if (hex.length <= n * 2 + 4) return hex;
  return hex.slice(0, n + 2) + "..." + hex.slice(-n);
}

export interface KeygenResult {
  spendingKey: string;
  viewingKey: string;
  spendingPubKey: string;
  viewingPubKey: string;
  metaAddress: string;
}

export function generateKeys(rootKey: `0x${string}`): KeygenResult {
  const spendingKeyBytes = hexToBytes(rootKey);
  const spendingPubKey = secp.getPublicKey(spendingKeyBytes, true);

  const viewingKey = keccak256(rootKey);
  const viewingKeyBytes = hexToBytes(viewingKey);
  const viewingPubKey = secp.getPublicKey(viewingKeyBytes, true);

  const spendingPubHex = bytesToHex(spendingPubKey);
  const viewingPubHex = bytesToHex(viewingPubKey);
  const metaAddress =
    "0x" + spendingPubHex.slice(2) + viewingPubHex.slice(2);

  return {
    spendingKey: rootKey,
    viewingKey,
    spendingPubKey: spendingPubHex,
    viewingPubKey: viewingPubHex,
    metaAddress,
  };
}

export interface StealthResult {
  stealthAddress: string;
  ephemeralPubKey: string;
  viewTag: number;
  sharedSecretHash: string;
}

export function computeStealth(
  spendingPubKey: string,
  viewingPubKey: string
): StealthResult {
  const ephemeralPrivKey = secp.utils.randomPrivateKey();
  const ephemeralPubKey = secp.getPublicKey(ephemeralPrivKey, true);

  const viewingPubBytes = hexToBytes(viewingPubKey);
  const sharedPoint = secp.getSharedSecret(
    ephemeralPrivKey,
    viewingPubBytes,
    true
  );

  const sharedSecretHash = keccak256(bytesToHex(sharedPoint));
  const sharedSecret = hexToBytes(sharedSecretHash);
  const viewTag = sharedSecret[0];

  const sharedSecretPoint = secp.getPublicKey(sharedSecret, false);
  const spendingPubBytes = hexToBytes(spendingPubKey);
  const spendingPoint = secp.ProjectivePoint.fromHex(spendingPubBytes);
  const secretPoint = secp.ProjectivePoint.fromHex(sharedSecretPoint);
  const stealthPoint = spendingPoint.add(secretPoint);

  const stealthPubUncompressed = stealthPoint.toRawBytes(false);
  const pubKeyNoPrefix = stealthPubUncompressed.slice(1);
  const addressHash = keccak256(bytesToHex(pubKeyNoPrefix));
  const stealthAddress = "0x" + addressHash.slice(-40);

  return {
    stealthAddress,
    ephemeralPubKey: bytesToHex(ephemeralPubKey),
    viewTag,
    sharedSecretHash,
  };
}

export interface ScanResult {
  expectedAddress: string;
  viewTag: number;
  match: boolean;
}

export function scanPayment(
  ephemeralPubKey: string,
  viewingKey: string,
  spendingPubKey: string,
  announcedAddress: string
): ScanResult {
  const viewingKeyBytes = hexToBytes(viewingKey);
  const ephemeralPubBytes = hexToBytes(ephemeralPubKey);

  const sharedPoint = secp.getSharedSecret(
    viewingKeyBytes,
    ephemeralPubBytes,
    true
  );

  const sharedSecretHash = keccak256(bytesToHex(sharedPoint));
  const sharedSecret = hexToBytes(sharedSecretHash);
  const viewTag = sharedSecret[0];

  const sharedSecretPubKey = secp.getPublicKey(sharedSecret, false);
  const spendingPubBytes = hexToBytes(spendingPubKey);
  const spendingPoint = secp.ProjectivePoint.fromHex(spendingPubBytes);
  const secretPoint = secp.ProjectivePoint.fromHex(sharedSecretPubKey);
  const expectedPoint = spendingPoint.add(secretPoint);

  const expectedPub = expectedPoint.toRawBytes(false);
  const pubNoPrefix = expectedPub.slice(1);
  const addrHash = keccak256(bytesToHex(pubNoPrefix));
  const expectedAddress = "0x" + addrHash.slice(-40);

  return {
    expectedAddress,
    viewTag,
    match:
      expectedAddress.toLowerCase() === announcedAddress.toLowerCase(),
  };
}

export interface DeriveResult {
  stealthPrivKey: string;
  derivedAddress: string;
  valid: boolean;
}

export function deriveStealthKey(
  ephemeralPubKey: string,
  spendingKey: string,
  viewingKey: string,
  stealthAddress: string
): DeriveResult {
  const viewingKeyBytes = hexToBytes(viewingKey);
  const ephemeralPubBytes = hexToBytes(ephemeralPubKey);

  const sharedPoint = secp.getSharedSecret(
    viewingKeyBytes,
    ephemeralPubBytes,
    true
  );
  const sharedSecretHash = keccak256(bytesToHex(sharedPoint));
  const sharedSecret = hexToBytes(sharedSecretHash);

  const n = secp.CURVE.n;
  const s = BigInt(spendingKey);
  const secret = BigInt("0x" + bytesToHex(sharedSecret).slice(2));
  const stealthPrivKeyBig = ((s + secret) % n + n) % n;
  const stealthPrivKey =
    "0x" + stealthPrivKeyBig.toString(16).padStart(64, "0");

  const stealthPub = secp.getPublicKey(hexToBytes(stealthPrivKey), false);
  const pubNoPrefix = stealthPub.slice(1);
  const addrHash = keccak256(bytesToHex(pubNoPrefix));
  const derivedAddress = "0x" + addrHash.slice(-40);

  return {
    stealthPrivKey,
    derivedAddress,
    valid:
      derivedAddress.toLowerCase() === stealthAddress.toLowerCase(),
  };
}
