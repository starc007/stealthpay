# StealthPay Integration Guide

How to send and receive private stealth payments on Tempo.

## Overview

A stealth payment has 4 steps:

```
Recipient: generate keys → register meta-address
Sender:    look up meta-address → compute stealth address → transfer tokens → announce
Recipient: scan announcements → detect payment → derive stealth key → sweep
```

This guide walks through each step with code examples.

---

## Step 1: Recipient Setup

The recipient generates stealth keys and registers on-chain.

### Generate keys

```typescript
import { generateStealthKeys } from "stealthpay-tempo";

// Use a secure private key — this is your root secret
const keys = generateStealthKeys("0xYOUR_ROOT_PRIVATE_KEY");

// Save these securely:
// keys.spendingKey — needed to sweep funds (KEEP SECRET)
// keys.viewingKey  — give to scanner service (can detect but not spend)

// Share this publicly:
// keys.metaAddress.encoded — 66-byte public meta-address
```

**Key separation:**

- **Spending key** = root private key. Needed to sweep funds. Keep in cold storage.
- **Viewing key** = keccak256(root key). Can detect payments but NOT spend them. Safe to share with the scanner service.

### Register on-chain

Call `StealthRegistry.registerKeys()` to publish your meta-address:

```typescript
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount("0xYOUR_KEY");
const client = createWalletClient({
  account,
  chain: tempoChain,
  transport: http(RPC_URL),
});

await client.writeContract({
  address: REGISTRY_ADDRESS,
  abi: [
    {
      name: "registerKeys",
      type: "function",
      inputs: [
        { name: "schemeId", type: "uint256" },
        { name: "stealthMetaAddress", type: "bytes" },
      ],
      outputs: [],
      stateMutability: "nonpayable",
    },
  ],
  functionName: "registerKeys",
  args: [1n, keys.metaAddress.encoded], // schemeId 1 = secp256k1
});
```

### Register with the scanner API

If using the hosted scanner, also register your viewing key:

```bash
curl -X POST https://your-api.com/register \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0xYOUR_ADDRESS",
    "stealthMetaAddress": "0x<66-byte-encoded-meta-address>",
    "viewingKey": "0x<32-byte-viewing-key>"
  }'
```

The scanner needs the viewing key to detect payments on your behalf. It cannot spend your funds.

---

## Step 2: Sending a Payment

The sender only needs the recipient's public meta-address.

### Look up the recipient's meta-address

```typescript
import { createPublicClient, http } from "viem";

const publicClient = createPublicClient({
  chain: tempoChain,
  transport: http(RPC_URL),
});

const metaAddressBytes = await publicClient.readContract({
  address: REGISTRY_ADDRESS,
  abi: [
    {
      name: "stealthMetaAddressOf",
      type: "function",
      inputs: [
        { name: "registrant", type: "address" },
        { name: "schemeId", type: "uint256" },
      ],
      outputs: [{ type: "bytes" }],
      stateMutability: "view",
    },
  ],
  functionName: "stealthMetaAddressOf",
  args: [recipientAddress, 1n],
});
```

### Compute the stealth address

```typescript
import { computeStealthAddress, parseMetaAddress } from "stealthpay-tempo";

const recipientMeta = parseMetaAddress(metaAddressBytes);
const { stealthAddress, ephemeralPubKey, viewTag } =
  computeStealthAddress(recipientMeta);
```

### Transfer tokens + announce (two transactions)

```typescript
// 1. Transfer tokens to the stealth address
const transferTx = await walletClient.writeContract({
  address: TOKEN_ADDRESS,
  abi: erc20Abi,
  functionName: "transfer",
  args: [stealthAddress, amount],
});

// 2. Announce the ephemeral key so the recipient can detect this payment
// metadata: first byte = view tag, rest = token address + amount
const metadata = `0x${viewTag.toString(16).padStart(2, "0")}${TOKEN_ADDRESS.slice(2)}`;

const announceTx = await walletClient.writeContract({
  address: ANNOUNCER_ADDRESS,
  abi: [
    {
      name: "announce",
      type: "function",
      inputs: [
        { name: "schemeId", type: "uint256" },
        { name: "stealthAddress", type: "address" },
        { name: "ephemeralPubKey", type: "bytes" },
        { name: "metadata", type: "bytes" },
      ],
      outputs: [],
      stateMutability: "nonpayable",
    },
  ],
  functionName: "announce",
  args: [1n, stealthAddress, ephemeralPubKey, metadata],
});
```

> **Important:** Both the transfer and announcement should happen. If you transfer but don't announce, the recipient's scanner won't detect the payment.

---

## Step 3: Detecting Payments

### Option A: Use the hosted scanner API

```bash
# Returns all pending (unswept) payments for your address
curl -X POST https://your-api.com/scan \
  -H "Content-Type: application/json" \
  -d '{ "address": "0xYOUR_ADDRESS" }'
```

Response:

```json
{
  "ok": true,
  "pendingCount": 2,
  "payments": [
    {
      "stealthAddress": "0x...",
      "ephemeralPubKey": "0x...",
      "blockNumber": 12345,
      "txHash": "0x..."
    }
  ]
}
```

### Option B: Scan locally with the SDK

```typescript
import { scanStealthAddress } from "stealthpay-tempo";

// For each Announcement event from StealthAnnouncer:
const { expectedAddress, viewTag: expectedViewTag } = scanStealthAddress(
  announcement.ephemeralPubKey,
  myKeys.viewingKey,
  myKeys.metaAddress.spendingPubKey,
);

// Quick filter: check view tag first (cheap byte comparison)
if (expectedViewTag !== announcement.viewTag) continue;

// Full check: compare addresses
if (
  expectedAddress.toLowerCase() === announcement.stealthAddress.toLowerCase()
) {
  console.log("Payment detected!", announcement.stealthAddress);
}
```

---

## Step 4: Sweeping Funds

### Option A: Use the hosted sweep API

```bash
curl -X POST https://your-api.com/sweep \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0xYOUR_ADDRESS",
    "spendingKey": "0xYOUR_SPENDING_KEY",
    "destination": "0xYOUR_REAL_WALLET",
    "tokenAddress": "0xUSDC_ADDRESS"
  }'
```

The API derives the stealth private key for each pending payment and transfers tokens to your destination.

### Option B: Sweep locally with the SDK

```typescript
import { checkStealthAddress, sweepStealthAddress } from "stealthpay-tempo";

// For each detected payment:
const stealthPrivKey = checkStealthAddress(
  payment.ephemeralPubKey,
  myKeys.spendingKey,
  myKeys.viewingKey,
  payment.stealthAddress,
);

if (stealthPrivKey) {
  const result = await sweepStealthAddress({
    stealthPrivKey,
    tokenAddress: USDC_ADDRESS,
    amount: tokenBalance,
    destination: MY_WALLET,
    rpcUrl: RPC_URL,
    chain: tempoChain,
  });
  console.log("Swept:", result.txHash);
}
```

---

## Full End-to-End Example

```typescript
import {
  generateStealthKeys,
  computeStealthAddress,
  checkStealthAddress,
  sweepStealthAddress,
} from "stealthpay-tempo";

// ── RECIPIENT SETUP ──
const recipientKeys = generateStealthKeys("0xRECIPIENT_ROOT_KEY");
// Register recipientKeys.metaAddress.encoded on-chain...

// ── SENDER ──
const { stealthAddress, ephemeralPubKey, viewTag } = computeStealthAddress(
  recipientKeys.metaAddress,
);
// Transfer tokens to stealthAddress...
// Call announcer.announce(1, stealthAddress, ephemeralPubKey, metadata)...

// ── RECIPIENT DETECTS ──
const stealthPrivKey = checkStealthAddress(
  ephemeralPubKey,
  recipientKeys.spendingKey,
  recipientKeys.viewingKey,
  stealthAddress,
);
// stealthPrivKey is not null — this payment is ours!

// ── RECIPIENT SWEEPS ──
const result = await sweepStealthAddress({
  stealthPrivKey: stealthPrivKey!,
  tokenAddress: USDC_ADDRESS,
  amount: 1000000n,
  destination: "0xMY_REAL_WALLET",
  rpcUrl: "https://rpc.moderato.tempo.xyz",
  chain: tempoChain,
});
console.log("Done:", result.txHash);
```

---

## Agent Integration

For autonomous agents using MPP:

```typescript
import { Client } from "mppx";

const mpp = Client.create();

// Scan — pays $0.001 automatically via MPP
const scanResult = await mpp.fetch("https://your-api.com/scan", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ address: agentAddress }),
});

// Sweep — pays $0.01 automatically via MPP
const sweepResult = await mpp.fetch("https://your-api.com/sweep", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    address: agentAddress,
    spendingKey: agentSpendingKey,
    destination: agentWallet,
    tokenAddress: USDC_ADDRESS,
  }),
});
```

No API keys needed — the agent pays per request via Tempo micropayments.

---

## Contract Addresses

| Contract         | Testnet (Moderato, chain 42431)              | Mainnet |
| ---------------- | -------------------------------------------- | ------- |
| StealthRegistry  | `0x8B73CFf4d49e43A8A2ecf6293807a9499c680aA4` | TBD     |
| StealthAnnouncer | `0x01A1b9dAF1B98e6037AdDFf95639DBfA907A4A88` | TBD     |
| pathUSD          | `0x20c0000000000000000000000000000000000000` | —       |

## Scheme IDs

| ID  | Scheme         | Status    |
| --- | -------------- | --------- |
| 1   | secp256k1 ECDH | Supported |

## Common Issues

**Payment not detected by scanner:**

- Ensure you called `announce()` after transferring tokens
- Check that the recipient registered with the scanner API (not just on-chain)
- View tag in metadata must match: first byte of `keccak256(sharedSecret)`

**Sweep fails with "Could not derive stealth key":**

- The spending key doesn't match the registered meta-address
- The announcement's ephemeral pubkey might be corrupted

**Sweep reverts with insufficient balance:**

- On Tempo, gas fees are paid in pathUSD (not a separate native token)
- When sweeping, reserve ~0.01 pathUSD for gas: `sweepAmount = balance - 10000n`
- A transfer costs ~0.005 pathUSD in gas at current rates

**Zero balance at stealth address:**

- Tokens were already swept or never arrived
- Check the token address is correct
