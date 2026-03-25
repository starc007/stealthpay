import { describe, it, expect } from "bun:test";
import * as secp from "@noble/secp256k1";
import { generateStealthKeys } from "./keygen";
import { computeStealthAddress, computeStealthAddressWithKey } from "./sender";
import { checkStealthAddress, scanStealthAddress } from "./receiver";

describe("stealth address end-to-end", () => {
  const recipientRootKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;
  const recipientKeys = generateStealthKeys(recipientRootKey);

  it("sender computes stealth address, recipient detects and derives key", () => {
    // Sender computes a stealth address for the recipient
    const result = computeStealthAddress(recipientKeys.metaAddress);

    expect(result.stealthAddress).toMatch(/^0x[a-f0-9]{40}$/);
    expect(result.ephemeralPubKey).toMatch(/^0x(02|03)[a-f0-9]{64}$/);
    expect(result.viewTag).toBeGreaterThanOrEqual(0);
    expect(result.viewTag).toBeLessThanOrEqual(255);

    // Recipient checks if this stealth address belongs to them
    const stealthPrivKey = checkStealthAddress(
      result.ephemeralPubKey,
      recipientKeys.spendingKey,
      recipientKeys.viewingKey,
      result.stealthAddress
    );

    // Should find a match
    expect(stealthPrivKey).not.toBeNull();
    expect(stealthPrivKey).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it("deterministic stealth address with known ephemeral key", () => {
    const ephemeralPrivKey = secp.utils.randomPrivateKey();

    const result1 = computeStealthAddressWithKey(recipientKeys.metaAddress, ephemeralPrivKey);
    const result2 = computeStealthAddressWithKey(recipientKeys.metaAddress, ephemeralPrivKey);

    expect(result1.stealthAddress).toBe(result2.stealthAddress);
    expect(result1.ephemeralPubKey).toBe(result2.ephemeralPubKey);
    expect(result1.viewTag).toBe(result2.viewTag);
  });

  it("different recipients get different stealth addresses", () => {
    const otherRootKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as `0x${string}`;
    const otherKeys = generateStealthKeys(otherRootKey);

    const ephemeralPrivKey = secp.utils.randomPrivateKey();

    const result1 = computeStealthAddressWithKey(recipientKeys.metaAddress, ephemeralPrivKey);
    const result2 = computeStealthAddressWithKey(otherKeys.metaAddress, ephemeralPrivKey);

    expect(result1.stealthAddress).not.toBe(result2.stealthAddress);
  });

  it("wrong recipient cannot detect the payment", () => {
    const otherRootKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as `0x${string}`;
    const otherKeys = generateStealthKeys(otherRootKey);

    const result = computeStealthAddress(recipientKeys.metaAddress);

    // Other person tries to check — should return null
    const stealthPrivKey = checkStealthAddress(
      result.ephemeralPubKey,
      otherKeys.spendingKey,
      otherKeys.viewingKey,
      result.stealthAddress
    );

    expect(stealthPrivKey).toBeNull();
  });

  it("derived stealth private key corresponds to the stealth address", () => {
    const result = computeStealthAddress(recipientKeys.metaAddress);

    const stealthPrivKey = checkStealthAddress(
      result.ephemeralPubKey,
      recipientKeys.spendingKey,
      recipientKeys.viewingKey,
      result.stealthAddress
    );

    expect(stealthPrivKey).not.toBeNull();

    // Verify: derive public key from stealth private key and check it produces the same address
    const { keccak256 } = require("viem");
    const privKeyBytes = hexToBytes(stealthPrivKey!);
    const pubKey = secp.getPublicKey(privKeyBytes, false); // uncompressed
    const pubKeyNoPrefix = pubKey.slice(1);
    const addressHash = keccak256(bytesToHex(pubKeyNoPrefix));
    const derivedAddress = `0x${addressHash.slice(-40)}`;

    expect(derivedAddress.toLowerCase()).toBe(result.stealthAddress.toLowerCase());
  });

  it("scanStealthAddress works with viewing key only", () => {
    const ephemeralPrivKey = secp.utils.randomPrivateKey();
    const result = computeStealthAddressWithKey(recipientKeys.metaAddress, ephemeralPrivKey);

    // Scanner uses only viewing key + spending pubkey (no spending key)
    const scan = scanStealthAddress(
      result.ephemeralPubKey,
      recipientKeys.viewingKey,
      recipientKeys.metaAddress.spendingPubKey
    );

    expect(scan.expectedAddress.toLowerCase()).toBe(result.stealthAddress.toLowerCase());
    expect(scan.viewTag).toBe(result.viewTag);
  });
});

// ── Helpers ──────────────────────────────────────

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
