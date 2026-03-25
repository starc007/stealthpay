# StealthPay — Design Spec

## Overview

StealthPay is a stealth address protocol for private stablecoin payments on Tempo. It implements EIP-5564 (stealth address announcements) and EIP-6538 (stealth meta-address registry) with Tempo-native features: fee sponsorship, batch transactions, and MPP payment gating.

## Problem

On-chain payments expose sender-recipient links and full payment history. TIP-1022 virtual addresses solve the sweep UX problem but not privacy — the link between sender and recipient remains visible.

## Solution

Stealth addresses via ECDH. Each payment creates a one-time address only the recipient can derive and spend from. The recipient's real wallet is never exposed on-chain.

## Architecture

Bun monorepo with Turborepo. Four packages:

```
stealthpay/
├── apps/
│   ├── api/              # Hono API — scanner + sweep endpoints
│   └── web/              # Landing page (later)
├── packages/
│   ├── sdk/              # stealthpay-tempo npm package
│   └── contracts/        # Foundry — Solidity contracts
├── turbo.json
└── package.json          # Bun workspaces root
```

## Smart Contracts

### StealthRegistry.sol (EIP-6538)

Registry where users register their stealth meta-addresses. A stealth meta-address is a pair of public keys (spending key + viewing key) encoded as bytes.

**Interface:**
```solidity
function registerKeys(uint256 schemeId, bytes calldata stealthMetaAddress) external;
function stealthMetaAddressOf(address registrant, uint256 schemeId) external view returns (bytes memory);
```

- `schemeId = 1` for secp256k1 ECDH (the only scheme we support)
- Emits `StealthMetaAddressSet(address indexed registrant, uint256 indexed schemeId, bytes stealthMetaAddress)`

### StealthAnnouncer.sol (EIP-5564)

Announcer contract where senders publish ephemeral public keys after sending to a stealth address.

**Interface:**
```solidity
function announce(
    uint256 schemeId,
    address stealthAddress,
    bytes calldata ephemeralPubKey,
    bytes calldata metadata
) external;
```

- Emits `Announcement(uint256 indexed schemeId, address indexed stealthAddress, address indexed caller, bytes ephemeralPubKey, bytes metadata)`
- `metadata` can carry token address + amount for the scanner to index

### Deployment

- Target: Tempo testnet first, then mainnet
- Tooling: Foundry with Tempo SDK (`sdk/foundry`)
- Verification: `contracts.tempo.xyz`

## SDK — `stealthpay-tempo`

TypeScript package. Dependencies: `viem`, `@noble/secp256k1`, `@tempo-xyz/viem`.

### Core Functions

```typescript
// Generate stealth meta-address (spending + viewing key pair)
generateStealthMetaAddress(privateKey: Hex) => StealthMetaAddress

// Sender: compute one-time stealth address for recipient
computeStealthAddress(recipientMetaAddress: StealthMetaAddress) => {
  stealthAddress: Address,
  ephemeralPubKey: Hex
}

// Recipient: check if a stealth address belongs to you
checkStealthAddress(ephemeralPubKey: Hex, spendingKey: Hex, viewingKey: Hex) => Hex | null
// Returns stealth private key if match, null otherwise

// Sweep funds from stealth address to destination
sweepStealthAddress(stealthPrivKey: Hex, destination: Address, feePayer?: Address) => TxHash
```

### Key Derivation (ECDH)

Following EIP-5564 scheme 1 (secp256k1):

1. Recipient generates spending key `s` and viewing key `v`, publishes `(S, V)` as meta-address
2. Sender generates ephemeral key `r`, computes shared secret `secret = hash(r * V)`
3. Stealth address = pubToAddress(S + secret * G)
4. Recipient scans: for each ephemeral key `R`, computes `secret = hash(v * R)`, checks if `S + secret * G` matches
5. If match, stealth private key = `s + secret`

### Package Structure

```
packages/sdk/src/
├── index.ts          # Public exports
├── keygen.ts         # generateStealthMetaAddress
├── sender.ts         # computeStealthAddress
├── receiver.ts       # checkStealthAddress
└── sweep.ts          # sweepStealthAddress (batch + fee sponsorship)
```

## Scanner Service (`apps/api`)

Hono API server that polls Tempo blocks for stealth announcements and matches them against registered meta-addresses.

### Components

- **Block poller:** Watches for `Announcement` events from StealthAnnouncer
- **ECDH matcher:** For each announcement, checks against registered viewing keys
- **DB (Turso):** Stores registered meta-addresses, detected payments, sweep status

### API Routes

| Route | Auth | Description |
|---|---|---|
| `POST /register` | Free | Register stealth meta-address |
| `POST /scan` | MPP ($0.001) | Scan for incoming payments |
| `POST /sweep` | MPP ($0.01) | Batch sweep detected addresses |
| `GET /announcements` | Free | Public ephemeral key feed |

### Scanner Flow

1. Poll new blocks from Tempo RPC
2. Extract `Announcement` events from StealthAnnouncer contract
3. For each announcement: try ECDH check against all registered viewing keys
4. On match: store as pending payment in Turso
5. User calls `/scan` to get their pending payments
6. User calls `/sweep` to batch-sweep all pending addresses

## Batch Sweep + Fee Sponsorship

- Uses Tempo's `Handler.feePayer` for gas-free sweeps
- Single batch transaction sweeps all pending stealth addresses to destination
- Service sponsors gas, user pays only the MPP sweep fee ($0.01)
- Atomic: all-or-nothing sweep

## MPP Payment Gating

- `mppx` Hono middleware on `/scan` and `/sweep` routes
- Tempo charge intent: scan = $0.001, sweep = $0.01
- Payment is auth — no API keys needed

## Monetization

| Action | Price | Cost to us | Margin |
|---|---|---|---|
| Register | Free | Negligible | — |
| Scan (100 announcements) | $0.001 | ~0 | ~100% |
| Sweep (batch, any size) | $0.01 | ~$0.001 gas | ~90% |

## Tech Stack

| Layer | Choice |
|---|---|
| Package manager | Bun (workspaces) |
| Build | Turborepo |
| Contracts | Solidity + Foundry |
| SDK | TypeScript, viem, @noble/secp256k1, @tempo-xyz/viem |
| API | Hono on CF Workers or Bun on DO |
| DB | Turso (libSQL) |
| Payment gating | mppx middleware |

## Implementation Phases

1. **Contracts** (Days 1-2): StealthRegistry + StealthAnnouncer on Tempo testnet
2. **SDK** (Days 3-6): `stealthpay-tempo` npm package
3. **Scanner** (Days 7-10): Block polling + ECDH matching + Turso
4. **Batch Sweep** (Days 11-12): Fee-sponsored batch sweep endpoint
5. **MPP Gating** (Days 13-14): Pay-per-use via mppx
6. **Launch** (Days 15-18): Docs, landing page, ecosystem listing

## Open Questions

- Does Tempo's native privacy (private token standard) complement stealth addresses?
- Scanner: self-hostable (OSS) or hosted-only?
- Fee model: flat fee per sweep vs % of amount swept?
