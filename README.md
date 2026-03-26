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
├── apps/
│   ├── web/              # Web app — connect wallet, send, receive, scan & sweep
│   └── api/              # Hono scanner + sweep API (MPP-gated)
├── packages/
│   ├── sdk/              # stealthpay-tempo — npm package
│   └── contracts/        # StealthRegistry + StealthAnnouncer (Foundry)
```

| Component | Description |
|---|---|
| **Web App** | Connect wallet, generate meta-address, send/receive/sweep stealth payments |
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
# SDK tests
cd packages/sdk && bun test

# Contract tests (requires Tempo Foundry fork: foundryup -n tempo)
cd packages/contracts && forge test

# E2E flow on testnet
bun run test/e2e-flow.ts
```

## Web App

The web app has three tabs:

| Tab | What it does |
|---|---|
| **Receive** | Connect wallet → sign message → generate stealth meta-address → share it |
| **Send** | Paste a meta-address → enter amount → sends pathUSD to a stealth address + announces |
| **Scan** | Sign to unlock keys → scan chain for payments → one-click sweep to any address |

- Works with Tempo passkey wallets (WebAuthn) and MetaMask
- Uses the `stealthpay-tempo` SDK directly — no custom crypto code
- Optional destination address for sweep (for better privacy, sweep to a fresh wallet)

## SDK Usage

### Generate stealth keys (from wallet signature)

```typescript
import {
  generateStealthKeysFromSignature,
  STEALTH_KEY_MESSAGE,
} from "stealthpay-tempo";

// User signs a deterministic message — same wallet always produces same keys
const signature = await walletClient.signMessage({ message: STEALTH_KEY_MESSAGE });
const keys = generateStealthKeysFromSignature(signature);

// Share keys.metaAddress.encoded publicly
```

### Send a private payment

```typescript
import { computeStealthAddress, parseMetaAddress } from "stealthpay-tempo";

// Compute stealth address from recipient's meta-address
const meta = parseMetaAddress(recipientMetaAddress);
const { stealthAddress, ephemeralPubKey, viewTag } = computeStealthAddress(meta);

// 1. Transfer tokens to stealthAddress
// 2. Call StealthAnnouncer.announce(1, stealthAddress, ephemeralPubKey, metadata)
```

### Detect and sweep payments

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
  await sweepStealthAddress({
    stealthPrivKey,
    tokenAddress: PATHUSD_ADDRESS,
    amount: balance,
    destination: "0xFRESH_WALLET", // use a fresh address for privacy
    rpcUrl: "https://rpc.moderato.tempo.xyz",
    chain: tempoTestnet,
  });
}
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
| pathUSD | `0x20c0000000000000000000000000000000000000` |

Chain: Tempo Moderato Testnet (ID: 42431) | RPC: `https://rpc.moderato.tempo.xyz`

## Environment Variables

Create `.env` in `apps/api/`:

```env
DATABASE_URL=file:local.db
DATABASE_AUTH_TOKEN=
RPC_URL=https://rpc.moderato.tempo.xyz
REGISTRY_ADDRESS=0x8B73CFf4d49e43A8A2ecf6293807a9499c680aA4
ANNOUNCER_ADDRESS=0x01A1b9dAF1B98e6037AdDFf95639DBfA907A4A88
MPP_SECRET_KEY=
MPP_RECIPIENT=0x...
PORT=3000
SCAN_INTERVAL_MS=10000
```

## Deploy Contracts

```bash
# Install Tempo Foundry fork
foundryup -n tempo

cd packages/contracts

# Generate and fund a deployer wallet
cast wallet new
cast rpc tempo_fundAddress <YOUR_ADDRESS> --rpc-url https://rpc.moderato.tempo.xyz

# Deploy
forge create src/StealthRegistry.sol:StealthRegistry \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --private-key <YOUR_PRIVATE_KEY> \
  --broadcast

forge create src/StealthAnnouncer.sol:StealthAnnouncer \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --private-key <YOUR_PRIVATE_KEY> \
  --broadcast
```

## How It Works

1. **Recipient** connects wallet, signs a message to derive stealth keys, shares meta-address
2. **Sender** pastes meta-address, computes a one-time stealth address via ECDH, sends tokens + announces
3. **Recipient** scans chain for announcements matching their viewing key
4. **Recipient** sweeps funds from stealth addresses to their wallet (or a fresh address for privacy)

The on-chain observer sees transfers to random addresses but cannot link sender to recipient.

### Security Model

| Role | Knows | Can Do | Cannot Do |
|---|---|---|---|
| Sender | Recipient's meta-address (public) | Send to stealth address | Detect other payments |
| Scanner | Viewing keys | Detect payments | Spend funds |
| Recipient | Spending + viewing keys | Detect and spend | — |
| Observer | Stealth addresses | See transfers happened | Link sender to recipient |

> **Privacy note:** When sweeping, the tx links the stealth address to the destination. For maximum privacy, sweep to a fresh wallet — not your main address.

## Tech Stack

- **Contracts**: Solidity + Foundry (EIP-5564, EIP-6538)
- **SDK**: TypeScript, viem, @noble/secp256k1
- **Web**: React + Vite + Tailwind + wagmi
- **API**: Hono + Bun
- **DB**: Turso (libSQL)
- **Payments**: MPP (mppx)
- **Monorepo**: Bun workspaces + Turborepo

## License

MIT
