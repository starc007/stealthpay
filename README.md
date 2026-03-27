# StealthPay

Private stablecoin payments on Tempo — stealth addresses + ZK privacy pool.

## What is StealthPay?

When someone pays you on-chain, everyone can see who paid who. StealthPay fixes this with two layers of privacy:

1. **Stealth addresses** — every payment creates a one-time address via ECDH. Your real wallet is never exposed.
2. **Privacy pool** — sweep stealth funds into a ZK pool and withdraw to any fresh address with a Groth16 proof. No on-chain link between deposit and withdrawal.

Built on [Tempo](https://tempo.xyz) where gas is paid in stablecoins, fees are under $0.001, and the protocol supports fee sponsorship natively.

## Architecture

```
stealthpay/
├── apps/
│   ├── web/              # React + Vite + Tailwind + wagmi (4 tabs)
│   └── api/              # Hono scanner + sweep API (MPP-gated)
├── packages/
│   ├── sdk/              # stealthpay-tempo — npm package
│   ├── contracts/        # Solidity — Registry, Announcer, StealthPool, Verifier
│   └── circuits/         # circom ZK circuit (Groth16)
```

| Component | Description |
|---|---|
| **Web App** | Connect wallet, send, receive, scan, sweep (direct or privacy pool), ZK redeem |
| **StealthRegistry.sol** | EIP-6538 — on-chain stealth meta-address registry |
| **StealthAnnouncer.sol** | EIP-5564 — on-chain ephemeral key announcements |
| **StealthPool.sol** | Privacy pool — Poseidon Merkle tree + Groth16 ZK withdrawals |
| **stealthpay-tempo** | TypeScript SDK — keygen, send, receive, sweep, pool deposit/withdraw |
| **API** | Scanner service + sweep endpoint, MPP-gated |

## Quick Start

### Install

```bash
git clone https://github.com/starc007/stealthpay
cd stealthpay
bun install
```

### Run the web app

```bash
cd apps/web && npx vite
```

Open http://localhost:5173 — connect your Tempo passkey or MetaMask wallet.

### Run the API

```bash
cd apps/api && bun run src/index.ts
```

### Run tests

```bash
# SDK tests (14 tests)
cd packages/sdk && bun test

# Contract tests (27 tests — requires: foundryup -n tempo)
cd packages/contracts && forge test

# E2E stealth flow on testnet
bun run test/e2e-flow.ts

# E2E privacy pool flow on testnet (use Node — snarkjs crashes Bun)
npx tsx test/e2e-pool-flow.ts
```

## Web App

Four tabs:

| Tab | What it does |
|---|---|
| **Receive** | Connect wallet → sign message → generate stealth meta-address → share it |
| **Send** | Paste a meta-address → enter amount → sends pathUSD to a stealth address + announces |
| **Scan** | Scan chain for payments → sweep directly or deposit into privacy pool |
| **Redeem** | Enter fresh address → generate ZK proof in browser → withdraw from pool privately |

- Works with Tempo passkey wallets (WebAuthn) and MetaMask
- Uses the `stealthpay-tempo` SDK directly
- Two sweep modes: **Direct** (to any address) or **Privacy Pool** (ZK withdrawal later)

## How It Works

### Basic Flow (stealth addresses)
```
Sender → stealth address → sweep → recipient wallet
```

### Full Privacy Flow (+ privacy pool)
```
Sender → stealth address → privacy pool → ZK proof → fresh address
```

1. **Recipient** connects wallet, signs a message to derive stealth keys, shares meta-address
2. **Sender** pastes meta-address, computes a one-time stealth address via ECDH, sends tokens + announces
3. **Recipient** scans chain, detects payment, sweeps into privacy pool with a Poseidon note commitment
4. **Recipient** generates a Groth16 ZK proof in browser, withdraws to any fresh address — no on-chain link

## SDK Usage

### Generate stealth keys

```typescript
import { generateStealthKeysFromSignature, STEALTH_KEY_MESSAGE } from "stealthpay-tempo";

const signature = await walletClient.signMessage({ message: STEALTH_KEY_MESSAGE });
const keys = generateStealthKeysFromSignature(signature);
// Share keys.metaAddress.encoded publicly
```

### Send a private payment

```typescript
import { computeStealthAddress, parseMetaAddress } from "stealthpay-tempo";

const meta = parseMetaAddress(recipientMetaAddress);
const { stealthAddress, ephemeralPubKey, viewTag } = computeStealthAddress(meta);

// 1. Transfer tokens to stealthAddress
// 2. Call StealthAnnouncer.announce(1, stealthAddress, ephemeralPubKey, metadata)
```

### Detect and sweep

```typescript
import { checkStealthAddress, sweepStealthAddress } from "stealthpay-tempo";

const stealthPrivKey = checkStealthAddress(
  ephemeralPubKey, myKeys.spendingKey, myKeys.viewingKey, announcedStealthAddress
);

if (stealthPrivKey) {
  await sweepStealthAddress({
    stealthPrivKey,
    tokenAddress: PATHUSD_ADDRESS,
    amount: balance,
    destination: "0xFRESH_WALLET",
    rpcUrl: "https://rpc.moderato.tempo.xyz",
    chain: tempoTestnet,
  });
}
```

### Deposit to privacy pool

```typescript
import { depositToPool } from "stealthpay-tempo";

await depositToPool({
  stealthPrivKey,
  tokenAddress: PATHUSD_ADDRESS,
  amount: depositAmount,
  poolAddress: POOL_ADDRESS,
  noteCommitment, // Poseidon hash computed off-chain
  rpcUrl: "https://rpc.moderato.tempo.xyz",
  chain: tempoTestnet,
});
```

## Contract Addresses (Tempo Testnet)

| Contract | Address |
|---|---|
| StealthRegistry | `0x8B73CFf4d49e43A8A2ecf6293807a9499c680aA4` |
| StealthAnnouncer | `0x01A1b9dAF1B98e6037AdDFf95639DBfA907A4A88` |
| StealthPool | `0xb82D999AD58Fe74BfA800D9975d7a22922D0AaA4` |
| Groth16Verifier | `0x6a701f74126f0D3cED8b1BD85fb9CF0DDd08C371` |
| pathUSD | `0x20c0000000000000000000000000000000000000` |

Chain: Tempo Moderato Testnet (ID: 42431) | RPC: `https://rpc.moderato.tempo.xyz`

## Deploy Contracts

```bash
# Install Tempo Foundry fork
foundryup -n tempo

cd packages/contracts

# Generate and fund a deployer wallet
cast wallet new
cast rpc tempo_fundAddress <YOUR_ADDRESS> --rpc-url https://rpc.moderato.tempo.xyz

# Deploy all contracts (Registry, Announcer, Poseidon libs, Verifier, Pool)
PRIVATE_KEY=0x... ./script/DeployAll.sh
```

## Security Model

| Role | Knows | Can Do | Cannot Do |
|---|---|---|---|
| Sender | Recipient's meta-address (public) | Send to stealth address | Detect other payments |
| Scanner | Viewing keys | Detect payments | Spend funds |
| Recipient | Spending + viewing keys + note secrets | Detect, sweep, and withdraw | — |
| Observer | Stealth addresses, pool activity | See money moved | Link sender to recipient |

> **Privacy note:** Direct sweep links stealth address → destination. For full privacy, use the privacy pool — deposit into pool, then ZK withdraw to a fresh address.

## Tech Stack

- **Contracts**: Solidity 0.8.24 + Foundry (Tempo fork), Poseidon libraries
- **ZK**: circom 2.2.3, snarkjs, Groth16 (BN254), 5,731 constraints
- **SDK**: TypeScript, viem, @noble/secp256k1
- **Web**: React 19, Vite 8, Tailwind 4, wagmi 3 (webAuthn + injected), circomlibjs, snarkjs
- **API**: Hono, Bun, @libsql/client (Turso), mppx
- **Monorepo**: Bun workspaces + Turborepo

## License

MIT
