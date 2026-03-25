# stealthpay-tempo

Private stablecoin payments on Tempo using stealth addresses (EIP-5564 / EIP-6538).

## Install

```bash
bun add stealthpay-tempo
# or
npm install stealthpay-tempo
```

## Quickstart

### 1. Generate stealth keys (recipient does this once)

```typescript
import { generateStealthKeys } from "stealthpay-tempo";

const keys = generateStealthKeys("0xYOUR_PRIVATE_KEY");

// Register on-chain or share your meta-address with senders
console.log(keys.metaAddress.encoded); // 66-byte public meta-address
console.log(keys.viewingKey);          // give to scanner service
// keys.spendingKey — keep secret, needed to sweep funds
```

### 2. Send to a stealth address (sender does this)

```typescript
import { computeStealthAddress } from "stealthpay-tempo";

const { stealthAddress, ephemeralPubKey, viewTag } = computeStealthAddress(
  recipientMetaAddress // from step 1
);

// Transfer tokens to stealthAddress
// Then announce on-chain so the recipient can detect it
```

### 3. Detect incoming payments (recipient or scanner)

```typescript
import { scanStealthAddress, checkStealthAddress } from "stealthpay-tempo";

// Scanner (viewing key only — cannot spend)
const { expectedAddress, viewTag } = scanStealthAddress(
  ephemeralPubKey,
  viewingKey,
  spendingPubKey
);

// Recipient (derives spendable private key)
const stealthPrivKey = checkStealthAddress(
  ephemeralPubKey,
  spendingKey,
  viewingKey,
  announcedStealthAddress
);
// Returns the private key if it's yours, null otherwise
```

### 4. Sweep funds

```typescript
import { sweepStealthAddress } from "stealthpay-tempo";

const result = await sweepStealthAddress({
  stealthPrivKey,
  tokenAddress: "0xUSDC_ADDRESS",
  amount: 1000000n, // 1 USDC
  destination: "0xYOUR_WALLET",
  rpcUrl: "https://rpc.moderato.tempo.xyz",
  chain: tempoChain,
});

console.log(result.txHash);
```

## API Reference

### Key Generation

#### `generateStealthKeys(rootPrivateKey)`

Generates a spending/viewing key pair from a root private key.

- `rootPrivateKey` — `0x${string}`, 32-byte hex private key
- Returns `StealthKeys`:
  - `spendingKey` — private spending key (same as root key)
  - `viewingKey` — private viewing key (derived via keccak256)
  - `metaAddress.spendingPubKey` — 33-byte compressed public key
  - `metaAddress.viewingPubKey` — 33-byte compressed public key
  - `metaAddress.encoded` — 66-byte concatenated meta-address for on-chain registration

#### `parseMetaAddress(encoded)`

Parses a 66-byte encoded meta-address into its component public keys.

### Sender

#### `computeStealthAddress(recipientMetaAddress)`

Computes a one-time stealth address for the recipient.

- `recipientMetaAddress` — `StealthMetaAddress` object
- Returns `StealthAddressResult`:
  - `stealthAddress` — the one-time address to send funds to
  - `ephemeralPubKey` — publish this on-chain so recipient can detect the payment
  - `viewTag` — first byte of shared secret, for fast scanning

#### `computeStealthAddressWithKey(recipientMetaAddress, ephemeralPrivKey)`

Same as above but with a deterministic ephemeral key (for testing).

### Receiver

#### `checkStealthAddress(ephemeralPubKey, spendingKey, viewingKey, announcedStealthAddress)`

Checks if a stealth address belongs to you and derives the private key.

- Returns `0x${string}` (stealth private key) if match, `null` otherwise

#### `scanStealthAddress(ephemeralPubKey, viewingKey, spendingPubKey)`

Scan-only check using viewing key (no spending authority).

- Returns `{ expectedAddress, viewTag }`

### Sweep

#### `sweepStealthAddress(params)`

Transfers tokens from a stealth address to a destination.

- `stealthPrivKey` — private key for the stealth address
- `tokenAddress` — ERC-20 token contract
- `amount` — amount in smallest unit
- `destination` — where to send
- `rpcUrl` — chain RPC URL
- `chain` — viem Chain config

#### `sweepAllFromStealthAddress(params)`

Queries balance first, then sweeps the full amount.

## How It Works

Stealth addresses use ECDH (Elliptic Curve Diffie-Hellman) to create one-time addresses:

1. **Recipient** publishes a meta-address `(S, V)` — spending and viewing public keys
2. **Sender** generates ephemeral key `r`, computes shared secret `keccak256(r * V)`
3. **Stealth address** = `address(S + secret * G)` — a fresh address only the recipient can spend from
4. **Recipient** scans announcements, computes `keccak256(v * R)` for each, checks for matches
5. **Stealth private key** = `s + secret (mod n)` — only computable with the spending key

The sender-recipient link is never visible on-chain.

## License

MIT
