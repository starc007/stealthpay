# StealthPay

Private stablecoin payments on Tempo — stealth addresses with batch sweep and fee sponsorship.

## What is StealthPay?

When someone pays you on-chain, everyone can see your wallet and payment history. StealthPay fixes this — every payment creates a one-time address only you can spend from. Your real wallet is never exposed.

Built on [Tempo](https://tempo.xyz) with:
- **Fee sponsorship** — sweep funds without holding gas
- **Sub-$0.001 fees** — dust collection is economical
- **MPP payment gating** — pay per scan/sweep, no API keys
- **Stablecoin-native** — works with any TIP-20 token

## Architecture

```
stealthpay/
├── packages/
│   ├── sdk/              # stealthpay-tempo — npm package
│   └── contracts/        # StealthRegistry + StealthAnnouncer (Foundry)
├── apps/
│   ├── api/              # Hono scanner + sweep API
│   └── web/              # Landing page (coming soon)
```

| Component | Description |
|---|---|
| **StealthRegistry.sol** | EIP-6538 — on-chain stealth meta-address registry |
| **StealthAnnouncer.sol** | EIP-5564 — on-chain ephemeral key announcements |
| **stealthpay-tempo** | TypeScript SDK — keygen, send, receive, sweep |
| **API** | Scanner service + sweep endpoint, MPP-gated |

## Quick Start

### Install

```bash
git clone https://github.com/starc007/stealthpay
cd stealthpay
bun install
```

### Run the API locally

```bash
bun dev --filter=stealthpay-api
```

### Run SDK tests

```bash
bun test --filter=stealthpay-tempo
```

### Run contract tests

```bash
cd packages/contracts
forge test
```

## Usage

### Send a private payment

```typescript
import {
  generateStealthKeys,
  computeStealthAddress,
} from "stealthpay-tempo";

// Recipient generates keys (once)
const recipientKeys = generateStealthKeys("0xRECIPIENT_PRIVATE_KEY");
// Share recipientKeys.metaAddress.encoded publicly

// Sender computes stealth address
const { stealthAddress, ephemeralPubKey, viewTag } = computeStealthAddress(
  recipientKeys.metaAddress
);

// 1. Transfer tokens to stealthAddress
// 2. Call StealthAnnouncer.announce(1, stealthAddress, ephemeralPubKey, metadata)
```

### Receive and sweep

```typescript
import { checkStealthAddress, sweepStealthAddress } from "stealthpay-tempo";

// Check if a payment is yours
const stealthPrivKey = checkStealthAddress(
  ephemeralPubKey,
  myKeys.spendingKey,
  myKeys.viewingKey,
  announcedStealthAddress
);

if (stealthPrivKey) {
  // Sweep to your wallet
  await sweepStealthAddress({
    stealthPrivKey,
    tokenAddress: "0xUSDC",
    amount: balance,
    destination: "0xMY_WALLET",
    rpcUrl: "https://rpc.moderato.tempo.xyz",
    chain: tempoChain,
  });
}
```

### Use the hosted API

```bash
# Register for scanning (free)
curl -X POST http://localhost:3000/register \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0xYOUR_ADDRESS",
    "stealthMetaAddress": "0x...",
    "viewingKey": "0x..."
  }'

# Check for pending payments (MPP-gated: $0.001)
curl -X POST http://localhost:3000/scan \
  -H "Content-Type: application/json" \
  -d '{ "address": "0xYOUR_ADDRESS" }'

# Sweep all pending payments (MPP-gated: $0.01)
curl -X POST http://localhost:3000/sweep \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0xYOUR_ADDRESS",
    "spendingKey": "0x...",
    "destination": "0xDESTINATION",
    "tokenAddress": "0xUSDC_ADDRESS"
  }'
```

## API Routes

| Route | Auth | Price | Description |
|---|---|---|---|
| `POST /register` | Free | — | Register stealth meta-address for scanning |
| `POST /scan` | MPP | $0.001 | Get pending stealth payments |
| `POST /sweep` | MPP | $0.01 | Sweep all pending payments to destination |
| `GET /announcements` | Free | — | Public ephemeral key feed |
| `GET /health` | Free | — | Health check |

## Contract Addresses (Tempo Testnet)

| Contract | Address |
|---|---|
| StealthRegistry | `0x8B73CFf4d49e43A8A2ecf6293807a9499c680aA4` |
| StealthAnnouncer | `0x01A1b9dAF1B98e6037AdDFf95639DBfA907A4A88` |

Chain: Tempo Moderato Testnet (ID: 42431)

## Environment Variables

Create `.env` in `apps/api/`:

```env
# Database (Turso or local SQLite)
DATABASE_URL=file:local.db
DATABASE_AUTH_TOKEN=

# Tempo RPC
RPC_URL=https://rpc.moderato.tempo.xyz

# Contract addresses (defaults to deployed testnet contracts)
REGISTRY_ADDRESS=0x8B73CFf4d49e43A8A2ecf6293807a9499c680aA4
ANNOUNCER_ADDRESS=0x01A1b9dAF1B98e6037AdDFf95639DBfA907A4A88

# MPP payment gating (optional — passthrough if not set)
MPP_SECRET_KEY=
MPP_RECIPIENT=0x...

# Server
PORT=3000
SCAN_INTERVAL_MS=10000
```

## Deploy Contracts

Requires Tempo's Foundry fork:

```bash
# Install Tempo Foundry fork
foundryup -n tempo

cd packages/contracts

# Generate a deployer wallet and fund it
cast wallet new
cast rpc tempo_fundAddress <YOUR_ADDRESS> --rpc-url https://rpc.moderato.tempo.xyz

# Deploy contracts
forge create src/StealthRegistry.sol:StealthRegistry \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --private-key <YOUR_PRIVATE_KEY> \
  --broadcast

forge create src/StealthAnnouncer.sol:StealthAnnouncer \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --private-key <YOUR_PRIVATE_KEY> \
  --broadcast
```

## E2E Test

Run the full stealth payment flow on testnet:

```bash
# 1. Set your keys in test/e2e-flow.ts
# 2. Run the test
bun run test/e2e-flow.ts
```

## How It Works

1. **Recipient** registers a stealth meta-address (two public keys: spending + viewing)
2. **Sender** computes a one-time stealth address using ECDH, sends tokens, announces ephemeral key
3. **Scanner** polls blocks, checks announcements against registered viewing keys
4. **Recipient** calls sweep — derives stealth private key, transfers tokens to real wallet

The on-chain observer sees transfers to random addresses but cannot link sender to recipient.

### Security Model

| Role | Knows | Can Do | Cannot Do |
|---|---|---|---|
| Sender | Recipient's meta-address (public) | Send to stealth address | Detect other payments |
| Scanner | Viewing keys | Detect payments | Spend funds |
| Recipient | Spending + viewing keys | Detect and spend | — |
| Observer | Stealth addresses | See transfers happened | Link sender to recipient |

## Tech Stack

- **Contracts**: Solidity + Foundry (EIP-5564, EIP-6538)
- **SDK**: TypeScript, viem, @noble/secp256k1
- **API**: Hono + Bun
- **DB**: Turso (libSQL)
- **Payments**: MPP (mppx)
- **Monorepo**: Bun workspaces + Turborepo

## License

MIT
