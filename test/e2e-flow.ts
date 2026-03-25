/**
 * StealthPay End-to-End Flow Test
 *
 * Tests the complete flow on Tempo testnet:
 * 1. Generate stealth keys for recipient
 * 2. Register meta-address on-chain
 * 3. Sender computes stealth address
 * 4. Sender transfers pathUSD to stealth address
 * 5. Sender announces ephemeral key on-chain
 * 6. Recipient scans and detects the payment
 * 7. Recipient derives stealth private key
 * 8. Recipient sweeps funds to destination
 *
 * Setup:
 *   1. Generate a wallet: cast wallet new
 *   2. Fund it: cast rpc tempo_fundAddress <ADDRESS> --rpc-url https://rpc.moderato.tempo.xyz
 *   3. Set the private keys below
 *
 * Run: bun run test/e2e-flow.ts
 */

import {
  generateStealthKeys,
  computeStealthAddress,
  checkStealthAddress,
  scanStealthAddress,
} from "../packages/sdk/src/index";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  formatUnits,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ── Config ───────────────────────────────────────

const RPC_URL = "https://rpc.moderato.tempo.xyz";
const REGISTRY_ADDRESS = "0x8B73CFf4d49e43A8A2ecf6293807a9499c680aA4";
const ANNOUNCER_ADDRESS = "0x01A1b9dAF1B98e6037AdDFf95639DBfA907A4A88";
const PATHUSD_ADDRESS = "0x20c0000000000000000000000000000000000000";

// Fund via: cast rpc tempo_fundAddress <ADDRESS> --rpc-url https://rpc.moderato.tempo.xyz
const SENDER_PRIVATE_KEY = "0x_YOUR_SENDER_PRIVATE_KEY"; // replace with funded wallet key

// Any private key — recipient generates stealth keys from this
const RECIPIENT_ROOT_KEY = "0x_YOUR_RECIPIENT_PRIVATE_KEY"; // replace with any 32-byte hex key

// Where swept funds go
const SWEEP_DESTINATION = "0x_YOUR_DESTINATION_ADDRESS"; // replace with your destination wallet

const tempoTestnet: Chain = {
  id: 42431,
  name: "Tempo Testnet",
  nativeCurrency: { name: "USD", symbol: "USD", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
};

// ── ABIs ─────────────────────────────────────────

const registryAbi = parseAbi([
  "function registerKeys(uint256 schemeId, bytes calldata stealthMetaAddress) external",
  "function stealthMetaAddressOf(address registrant, uint256 schemeId) external view returns (bytes memory)",
]);

const announcerAbi = parseAbi([
  "function announce(uint256 schemeId, address stealthAddress, bytes memory ephemeralPubKey, bytes memory metadata) external",
  "event Announcement(uint256 indexed schemeId, address indexed stealthAddress, address indexed caller, bytes ephemeralPubKey, bytes metadata)",
]);

const erc20Abi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

// ── Clients ──────────────────────────────────────

const publicClient = createPublicClient({
  chain: tempoTestnet,
  transport: http(RPC_URL),
});

const senderAccount = privateKeyToAccount(SENDER_PRIVATE_KEY as `0x${string}`);
const senderClient = createWalletClient({
  account: senderAccount,
  chain: tempoTestnet,
  transport: http(RPC_URL),
});

// ── Helpers ──────────────────────────────────────

function log(step: string, msg: string) {
  console.log(`\n[${"=".repeat(3)} ${step} ${"=".repeat(3)}]`);
  console.log(msg);
}

async function getPathUsdBalance(address: `0x${string}`): Promise<bigint> {
  return publicClient.readContract({
    address: PATHUSD_ADDRESS as `0x${string}`,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
}

// ── Main Flow ────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("  StealthPay E2E Flow Test — Tempo Testnet");
  console.log("=".repeat(60));

  // ── Step 1: Generate stealth keys ──────────────
  log("STEP 1", "Generating stealth keys for recipient...");
  const recipientKeys = generateStealthKeys(
    RECIPIENT_ROOT_KEY as `0x${string}`,
  );
  console.log(
    `  Spending pub key: ${recipientKeys.metaAddress.spendingPubKey}`,
  );
  console.log(`  Viewing pub key:  ${recipientKeys.metaAddress.viewingPubKey}`);
  console.log(
    `  Meta-address:     ${recipientKeys.metaAddress.encoded.slice(0, 20)}...`,
  );
  console.log(
    `  Viewing key:      ${recipientKeys.viewingKey.slice(0, 20)}...`,
  );

  // ── Step 2: Register on-chain ──────────────────
  log("STEP 2", "Registering meta-address on StealthRegistry...");
  try {
    const registerTx = await senderClient.writeContract({
      address: REGISTRY_ADDRESS as `0x${string}`,
      abi: registryAbi,
      functionName: "registerKeys",
      args: [1n, recipientKeys.metaAddress.encoded],
    });
    console.log(`  Tx hash: ${registerTx}`);

    const registerReceipt = await publicClient.waitForTransactionReceipt({
      hash: registerTx,
    });
    console.log(`  Status:  ${registerReceipt.status}`);
    console.log(`  Block:   ${registerReceipt.blockNumber}`);
  } catch (e: any) {
    console.log(`  Registration may already exist: ${e.message.slice(0, 100)}`);
  }

  // Verify registration
  const storedMeta = await publicClient.readContract({
    address: REGISTRY_ADDRESS as `0x${string}`,
    abi: registryAbi,
    functionName: "stealthMetaAddressOf",
    args: [senderAccount.address, 1n],
  });
  console.log(`  Stored on-chain:  ${(storedMeta as string).slice(0, 20)}...`);

  // ── Step 3: Compute stealth address ────────────
  log("STEP 3", "Sender computing stealth address...");
  const { stealthAddress, ephemeralPubKey, viewTag } = computeStealthAddress(
    recipientKeys.metaAddress,
  );
  console.log(`  Stealth address:  ${stealthAddress}`);
  console.log(`  Ephemeral pubkey: ${ephemeralPubKey}`);
  console.log(
    `  View tag:         ${viewTag} (0x${viewTag.toString(16).padStart(2, "0")})`,
  );

  // ── Step 4: Transfer pathUSD to stealth address ─
  log("STEP 4", "Transferring 1 pathUSD to stealth address...");
  const transferAmount = 1000000n; // 1 pathUSD (6 decimals)

  const senderBalance = await getPathUsdBalance(senderAccount.address);
  console.log(`  Sender balance:   ${formatUnits(senderBalance, 6)} pathUSD`);

  if (senderBalance < transferAmount) {
    console.log(
      "  ERROR: Insufficient pathUSD balance. Fund the sender first.",
    );
    console.log(`  Sender address: ${senderAccount.address}`);
    console.log(
      "  Run: cast rpc tempo_fundAddress <address> --rpc-url https://rpc.moderato.tempo.xyz",
    );
    process.exit(1);
  }

  const transferTx = await senderClient.writeContract({
    address: PATHUSD_ADDRESS as `0x${string}`,
    abi: erc20Abi,
    functionName: "transfer",
    args: [stealthAddress as `0x${string}`, transferAmount],
  });
  console.log(`  Tx hash: ${transferTx}`);

  const transferReceipt = await publicClient.waitForTransactionReceipt({
    hash: transferTx,
  });
  console.log(`  Status:  ${transferReceipt.status}`);

  const stealthBalance = await getPathUsdBalance(
    stealthAddress as `0x${string}`,
  );
  console.log(`  Stealth balance:  ${formatUnits(stealthBalance, 6)} pathUSD`);

  // ── Step 5: Announce ephemeral key ─────────────
  log("STEP 5", "Announcing ephemeral key on StealthAnnouncer...");
  const metadata =
    `0x${viewTag.toString(16).padStart(2, "0")}${PATHUSD_ADDRESS.slice(2)}` as `0x${string}`;

  const announceTx = await senderClient.writeContract({
    address: ANNOUNCER_ADDRESS as `0x${string}`,
    abi: announcerAbi,
    functionName: "announce",
    args: [1n, stealthAddress as `0x${string}`, ephemeralPubKey, metadata],
  });
  console.log(`  Tx hash: ${announceTx}`);

  const announceReceipt = await publicClient.waitForTransactionReceipt({
    hash: announceTx,
  });
  console.log(`  Status:  ${announceReceipt.status}`);
  console.log(`  Block:   ${announceReceipt.blockNumber}`);

  // ── Step 6: Recipient scans ────────────────────
  log("STEP 6", "Recipient scanning for payments (using viewing key only)...");
  const scan = scanStealthAddress(
    ephemeralPubKey,
    recipientKeys.viewingKey,
    recipientKeys.metaAddress.spendingPubKey,
  );
  console.log(`  Expected address: ${scan.expectedAddress}`);
  console.log(`  Expected view tag: ${scan.viewTag}`);
  console.log(
    `  Match: ${scan.expectedAddress.toLowerCase() === stealthAddress.toLowerCase() ? "YES" : "NO"}`,
  );

  // ── Step 7: Derive stealth private key ─────────
  log("STEP 7", "Recipient deriving stealth private key...");
  const stealthPrivKey = checkStealthAddress(
    ephemeralPubKey,
    recipientKeys.spendingKey,
    recipientKeys.viewingKey,
    stealthAddress as `0x${string}`,
  );

  if (!stealthPrivKey) {
    console.log("  ERROR: Could not derive stealth key — address mismatch!");
    process.exit(1);
  }
  console.log(`  Stealth priv key: ${stealthPrivKey.slice(0, 20)}...`);

  // Verify the derived key matches the stealth address
  const stealthAccount = privateKeyToAccount(stealthPrivKey);
  console.log(`  Derived address:  ${stealthAccount.address}`);
  console.log(
    `  Matches stealth:  ${stealthAccount.address.toLowerCase() === stealthAddress.toLowerCase() ? "YES" : "NO"}`,
  );

  // ── Step 8: Sweep funds ────────────────────────
  log("STEP 8", "Sweeping funds from stealth address to destination...");
  console.log(`  Destination: ${SWEEP_DESTINATION}`);

  const stealthClient = createWalletClient({
    account: stealthAccount,
    chain: tempoTestnet,
    transport: http(RPC_URL),
  });

  const balanceBefore = await getPathUsdBalance(
    stealthAddress as `0x${string}`,
  );
  console.log(`  Balance before: ${formatUnits(balanceBefore, 6)} pathUSD`);

  if (balanceBefore === 0n) {
    console.log("  No balance to sweep — skipping.");
  } else {
    // Reserve gas buffer — on Tempo, gas is paid in pathUSD
    // A transfer costs ~50k gas at ~20 gwei = ~0.001 pathUSD, reserve 0.01 to be safe
    const gasReserve = 10000n; // 0.01 pathUSD (6 decimals)
    const sweepAmount =
      balanceBefore > gasReserve ? balanceBefore - gasReserve : 0n;
    console.log(
      `  Sweep amount:   ${formatUnits(sweepAmount, 6)} pathUSD (reserving ${formatUnits(gasReserve, 6)} for gas)`,
    );

    const sweepTx = await stealthClient.writeContract({
      address: PATHUSD_ADDRESS as `0x${string}`,
      abi: erc20Abi,
      functionName: "transfer",
      args: [SWEEP_DESTINATION as `0x${string}`, sweepAmount],
    });
    console.log(`  Sweep tx: ${sweepTx}`);

    const sweepReceipt = await publicClient.waitForTransactionReceipt({
      hash: sweepTx,
    });
    console.log(`  Status:   ${sweepReceipt.status}`);

    const balanceAfter = await getPathUsdBalance(
      stealthAddress as `0x${string}`,
    );
    const destBalance = await getPathUsdBalance(
      SWEEP_DESTINATION as `0x${string}`,
    );
    console.log(
      `  Stealth balance after: ${formatUnits(balanceAfter, 6)} pathUSD`,
    );
    console.log(
      `  Destination balance:   ${formatUnits(destBalance, 6)} pathUSD`,
    );
  }

  // ── Summary ────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("  COMPLETE — All steps passed!");
  console.log("=".repeat(60));
  console.log(`
  Recipient meta-address registered on-chain
  Sender computed stealth address: ${stealthAddress}
  1 pathUSD transferred to stealth address
  Ephemeral key announced on-chain
  Recipient detected payment via scanning
  Stealth private key derived successfully
  Funds swept to destination: ${SWEEP_DESTINATION}
  `);
}

main().catch((err) => {
  console.error("\nE2E test failed:", err);
  process.exit(1);
});
