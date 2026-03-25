import { describe, it, expect } from "bun:test";
import { generateStealthKeys, parseMetaAddress } from "./keygen";

describe("keygen", () => {
  // A valid 32-byte hex private key
  const rootKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;

  it("generates valid stealth keys from root key", () => {
    const keys = generateStealthKeys(rootKey);

    // Spending key should equal root key
    expect(keys.spendingKey).toBe(rootKey);

    // Viewing key should be different (derived via keccak256)
    expect(keys.viewingKey).not.toBe(rootKey);
    expect(keys.viewingKey).toMatch(/^0x[a-f0-9]{64}$/);

    // Public keys should be 33-byte compressed (66 hex chars + 0x)
    expect(keys.metaAddress.spendingPubKey).toMatch(/^0x(02|03)[a-f0-9]{64}$/);
    expect(keys.metaAddress.viewingPubKey).toMatch(/^0x(02|03)[a-f0-9]{64}$/);

    // Encoded meta-address should be 66 bytes (132 hex chars + 0x)
    expect(keys.metaAddress.encoded.length).toBe(134); // 0x + 132
  });

  it("is deterministic", () => {
    const keys1 = generateStealthKeys(rootKey);
    const keys2 = generateStealthKeys(rootKey);

    expect(keys1.spendingKey).toBe(keys2.spendingKey);
    expect(keys1.viewingKey).toBe(keys2.viewingKey);
    expect(keys1.metaAddress.encoded).toBe(keys2.metaAddress.encoded);
  });

  it("different root keys produce different meta-addresses", () => {
    const keys1 = generateStealthKeys(rootKey);
    const keys2 = generateStealthKeys(
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as `0x${string}`
    );

    expect(keys1.metaAddress.encoded).not.toBe(keys2.metaAddress.encoded);
  });
});

describe("parseMetaAddress", () => {
  it("correctly parses an encoded meta-address", () => {
    const rootKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;
    const keys = generateStealthKeys(rootKey);

    const parsed = parseMetaAddress(keys.metaAddress.encoded);

    expect(parsed.spendingPubKey).toBe(keys.metaAddress.spendingPubKey);
    expect(parsed.viewingPubKey).toBe(keys.metaAddress.viewingPubKey);
    expect(parsed.encoded).toBe(keys.metaAddress.encoded);
  });

  it("throws on invalid length", () => {
    expect(() => parseMetaAddress("0xdeadbeef" as `0x${string}`)).toThrow(
      "Invalid meta-address length"
    );
  });
});
