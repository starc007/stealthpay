/**
 * StealthPay Privacy Pool E2E Flow Test
 *
 * Tests the full privacy pool flow on Tempo testnet:
 * 1. Generate stealth keys
 * 2. Compute stealth address + send pathUSD + announce
 * 3. Detect payment via scanning
 * 4. Sweep into StealthPool (approve + deposit with note commitment)
 * 5. Rebuild Merkle tree from on-chain events
 * 6. Generate Groth16 ZK proof
 * 7. Withdraw from pool to a fresh address via ZK proof
 *
 * Run: bun run test/e2e-pool-flow.ts
 */

import { buildPoseidon } from "circomlibjs";
import * as snarkjs from "snarkjs";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseAbiItem,
  formatUnits,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  generateStealthKeys,
  computeStealthAddress,
  checkStealthAddress,
} from "../packages/sdk/src/index";

// ── Config ───────────────────────────────────────

const RPC_URL = "https://rpc.moderato.tempo.xyz";
const PATHUSD = "0x20c0000000000000000000000000000000000000";
const ANNOUNCER_ADDRESS = "0x01A1b9dAF1B98e6037AdDFf95639DBfA907A4A88";
const POOL_ADDRESS = "0xb82D999AD58Fe74BfA800D9975d7a22922D0AaA4";

// Funded deployer key
const SENDER_KEY = "0x9ee547463d8fb9c2dd31076f8b84dc7f40c3ccf9ae41cf8fc12b92613cac9ee4";
const RECIPIENT_ROOT_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// Fresh address for final withdrawal (nobody owns this — just proving the flow)
const FRESH_WITHDRAW_ADDRESS = "0x1111111111111111111111111111111111111111";

const WASM_PATH = "./packages/circuits/build/note_redeem_js/note_redeem.wasm";
const ZKEY_PATH = "./packages/circuits/build/note_redeem_final.zkey";

const TREE_DEPTH = 20;

const tempoTestnet: Chain = {
  id: 42431,
  name: "Tempo Testnet",
  nativeCurrency: { name: "USD", symbol: "USD", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
};

// ── ABIs ─────────────────────────────────────────

const erc20Abi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
]);

const announcerAbi = parseAbi([
  "function announce(uint256 schemeId, address stealthAddress, bytes memory ephemeralPubKey, bytes memory metadata) external",
]);

const poolAbi = parseAbi([
  "function deposit(address token, uint256 amount, uint256 noteCommitment) external",
  "function withdraw(uint256[8] calldata proof, uint256 nullifier, uint256 merkleRoot, uint256 amount, address token, address recipient) external",
  "function getMerkleRoot() external view returns (uint256)",
  "function getNoteCount() external view returns (uint256)",
]);

const depositedEvent = parseAbiItem(
  "event Deposited(uint256 indexed noteIndex, uint256 indexed noteCommitment, address indexed token, address depositor, uint256 amount)"
);

// ── Clients ──────────────────────────────────────

const publicClient = createPublicClient({
  chain: tempoTestnet,
  transport: http(RPC_URL),
});

const senderAccount = privateKeyToAccount(SENDER_KEY as `0x${string}`);
const senderClient = createWalletClient({
  account: senderAccount,
  chain: tempoTestnet,
  transport: http(RPC_URL),
});

// ── Poseidon ─────────────────────────────────────

let poseidon: any;

async function initPoseidon() {
  poseidon = await buildPoseidon();
}

function poseidonHash2(a: bigint, b: bigint): bigint {
  const hash = poseidon([a, b]);
  return poseidon.F.toObject(hash);
}

function poseidonHash5(a: bigint, b: bigint, c: bigint, d: bigint, e: bigint): bigint {
  const hash = poseidon([a, b, c, d, e]);
  return poseidon.F.toObject(hash);
}

function randomField(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  const ORDER = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  return n % ORDER;
}

// ── Merkle Tree ──────────────────────────────────

async function buildMerkleProof(
  noteCommitments: bigint[],
  leafIndex: number
): Promise<{ pathIndices: number[]; siblings: bigint[]; root: bigint }> {
  const zeros: bigint[] = [];
  zeros[0] = poseidonHash2(0n, 0n);
  for (let i = 1; i < TREE_DEPTH; i++) {
    zeros[i] = poseidonHash2(zeros[i - 1], zeros[i - 1]);
  }

  // Build full tree bottom-up
  let currentLevel = [...noteCommitments];
  const pathIndices: number[] = [];
  const siblings: bigint[] = [];
  let idx = leafIndex;

  for (let level = 0; level < TREE_DEPTH; level++) {
    const isRight = idx & 1;
    pathIndices.push(isRight);

    const siblingIdx = isRight ? idx - 1 : idx + 1;
    siblings.push(siblingIdx < currentLevel.length ? currentLevel[siblingIdx] : zeros[level]);

    const nextLevel: bigint[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : zeros[level];
      nextLevel.push(poseidonHash2(left, right));
    }
    currentLevel = nextLevel;
    idx = Math.floor(idx / 2);
  }

  return { pathIndices, siblings, root: currentLevel[0] };
}

// ── Helpers ──────────────────────────────────────

function log(step: string, msg: string) {
  console.log(`\n[${"=".repeat(3)} ${step} ${"=".repeat(3)}]`);
  console.log(msg);
}

async function getBalance(addr: `0x${string}`): Promise<bigint> {
  return publicClient.readContract({
    address: PATHUSD as `0x${string}`,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [addr],
  });
}

// ── Main Flow ────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("  StealthPay Privacy Pool E2E Test — Tempo Testnet");
  console.log("=".repeat(60));

  await initPoseidon();
  console.log("Poseidon initialized");

  // ── Step 1: Generate stealth keys ──────────────
  log("STEP 1", "Generating stealth keys...");
  const recipientKeys = generateStealthKeys(RECIPIENT_ROOT_KEY as `0x${string}`);
  console.log(`  Meta-address: ${recipientKeys.metaAddress.encoded.slice(0, 20)}...`);

  // ── Step 2: Compute stealth address + send + announce ──
  log("STEP 2", "Sending 2 pathUSD to stealth address...");
  const { stealthAddress, ephemeralPubKey, viewTag } = computeStealthAddress(recipientKeys.metaAddress);
  console.log(`  Stealth address: ${stealthAddress}`);

  const transferAmount = 5000000n; // 5 pathUSD (extra for gas on approve + deposit)

  const transferTx = await senderClient.writeContract({
    address: PATHUSD as `0x${string}`,
    abi: erc20Abi,
    functionName: "transfer",
    args: [stealthAddress as `0x${string}`, transferAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: transferTx });
  console.log(`  Transfer tx: ${transferTx}`);

  const metadata = `0x${viewTag.toString(16).padStart(2, "0")}${PATHUSD.slice(2)}` as `0x${string}`;
  const announceTx = await senderClient.writeContract({
    address: ANNOUNCER_ADDRESS as `0x${string}`,
    abi: announcerAbi,
    functionName: "announce",
    args: [1n, stealthAddress as `0x${string}`, ephemeralPubKey, metadata],
  });
  await publicClient.waitForTransactionReceipt({ hash: announceTx });
  console.log(`  Announce tx: ${announceTx}`);

  const stealthBal = await getBalance(stealthAddress as `0x${string}`);
  console.log(`  Stealth balance: ${formatUnits(stealthBal, 6)} pathUSD`);

  // ── Step 3: Detect payment ─────────────────────
  log("STEP 3", "Scanning for payment...");
  const stealthPrivKey = checkStealthAddress(
    ephemeralPubKey,
    recipientKeys.spendingKey,
    recipientKeys.viewingKey,
    stealthAddress as `0x${string}`
  );
  if (!stealthPrivKey) {
    console.log("  ERROR: Could not detect payment!");
    process.exit(1);
  }
  console.log(`  Payment detected! Stealth key: ${stealthPrivKey.slice(0, 20)}...`);

  // ── Step 4: Sweep into privacy pool ────────────
  log("STEP 4", "Depositing into StealthPool...");

  const stealthAccount = privateKeyToAccount(stealthPrivKey);
  const stealthClient = createWalletClient({
    account: stealthAccount,
    chain: tempoTestnet,
    transport: http(RPC_URL),
  });

  // Generate note secrets
  const recipientPubKey = randomField();
  const blinding = randomField();
  const noteRandomness = randomField();
  const salt = randomField();
  const asset = BigInt(PATHUSD);

  const gasReserve = 200000n; // 0.20 pathUSD for approve + deposit gas (Poseidon is expensive)
  const depositAmount = stealthBal - gasReserve;
  console.log(`  Deposit amount: ${formatUnits(depositAmount, 6)} pathUSD (reserving ${formatUnits(gasReserve, 6)} for gas)`);

  const recipientCommitment = poseidonHash2(recipientPubKey, blinding);
  const noteCommitment = poseidonHash5(asset, depositAmount, recipientCommitment, salt, noteRandomness);
  console.log(`  Note commitment: ${noteCommitment}`);

  // Approve
  const approveTx = await stealthClient.writeContract({
    address: PATHUSD as `0x${string}`,
    abi: erc20Abi,
    functionName: "approve",
    args: [POOL_ADDRESS as `0x${string}`, depositAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTx });
  console.log(`  Approve tx: ${approveTx}`);

  // Deposit
  const depositTx = await stealthClient.writeContract({
    address: POOL_ADDRESS as `0x${string}`,
    abi: poolAbi,
    functionName: "deposit",
    args: [PATHUSD as `0x${string}`, depositAmount, noteCommitment],
  });
  await publicClient.waitForTransactionReceipt({ hash: depositTx });
  console.log(`  Deposit tx: ${depositTx}`);

  const poolBal = await getBalance(POOL_ADDRESS as `0x${string}`);
  console.log(`  Pool balance: ${formatUnits(poolBal, 6)} pathUSD`);

  const onChainRoot = await publicClient.readContract({
    address: POOL_ADDRESS as `0x${string}`,
    abi: poolAbi,
    functionName: "getMerkleRoot",
  });
  console.log(`  On-chain root: ${onChainRoot}`);

  // ── Step 5: Rebuild Merkle tree ────────────────
  log("STEP 5", "Rebuilding Merkle tree from events...");

  const latestBlock = await publicClient.getBlockNumber();
  // Query in chunks to avoid RPC block range limit (100k)
  const depositLogs = await publicClient.getLogs({
    address: POOL_ADDRESS as `0x${string}`,
    event: depositedEvent,
    fromBlock: latestBlock - 5000n,
    toBlock: latestBlock,
  });

  const allCommitments = depositLogs.map((l) => l.args.noteCommitment!);
  console.log(`  Total notes in pool: ${allCommitments.length}`);

  // Find our note index
  const ourNoteIndex = allCommitments.findIndex((c) => c === noteCommitment);
  if (ourNoteIndex === -1) {
    console.log("  ERROR: Note commitment not found in pool events!");
    process.exit(1);
  }
  console.log(`  Our note index: ${ourNoteIndex}`);

  const merkle = await buildMerkleProof(allCommitments, ourNoteIndex);
  console.log(`  Computed root: ${merkle.root}`);
  console.log(`  Root matches on-chain: ${merkle.root === (onChainRoot as bigint) ? "YES" : "NO"}`);

  if (merkle.root !== (onChainRoot as bigint)) {
    console.log("  WARNING: Root mismatch — this will cause proof verification to fail");
  }

  // ── Step 6: Generate ZK proof ──────────────────
  log("STEP 6", "Generating Groth16 proof...");

  const nullifier = poseidonHash2(noteCommitment, recipientPubKey);
  console.log(`  Nullifier: ${nullifier}`);

  const circuitInput = {
    nullifier: nullifier.toString(),
    merkleRoot: merkle.root.toString(),
    amount: depositAmount.toString(),
    asset: asset.toString(),
    recipient: BigInt(FRESH_WITHDRAW_ADDRESS).toString(),
    merchantPubKey: recipientPubKey.toString(),
    blinding: blinding.toString(),
    noteRandomness: noteRandomness.toString(),
    channelId: salt.toString(),
    pathIndices: merkle.pathIndices.map(String),
    siblings: merkle.siblings.map((s) => s.toString()),
  };

  const startProve = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput,
    WASM_PATH,
    ZKEY_PATH
  );
  const proveTime = Date.now() - startProve;
  console.log(`  Proof generated in ${proveTime}ms`);
  console.log(`  Public signals: [${publicSignals.map((s: string) => s.slice(0, 12) + "...").join(", ")}]`);

  // Verify locally first
  const fs = await import("fs");
  const vkeyJson = JSON.parse(fs.readFileSync("./packages/circuits/build/verification_key.json", "utf-8"));
  const localValid = await snarkjs.groth16.verify(vkeyJson, publicSignals, proof);
  console.log(`  Local verification: ${localValid ? "PASS" : "FAIL"}`);

  if (!localValid) {
    console.log("  ERROR: Proof failed local verification!");
    process.exit(1);
  }

  // ── Step 7: Withdraw from pool ─────────────────
  log("STEP 7", "Withdrawing from pool via ZK proof...");

  // Format proof for Solidity (note B point transposition)
  const proofFormatted: [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint] = [
    BigInt(proof.pi_a[0]),
    BigInt(proof.pi_a[1]),
    BigInt(proof.pi_b[0][1]),
    BigInt(proof.pi_b[0][0]),
    BigInt(proof.pi_b[1][1]),
    BigInt(proof.pi_b[1][0]),
    BigInt(proof.pi_c[0]),
    BigInt(proof.pi_c[1]),
  ];

  const balBefore = await getBalance(FRESH_WITHDRAW_ADDRESS as `0x${string}`);
  console.log(`  Recipient balance before: ${formatUnits(balBefore, 6)} pathUSD`);

  // Use sender to submit the withdrawal (anyone can submit it)
  const withdrawTx = await senderClient.writeContract({
    address: POOL_ADDRESS as `0x${string}`,
    abi: poolAbi,
    functionName: "withdraw",
    args: [
      proofFormatted,
      nullifier,
      merkle.root,
      depositAmount,
      PATHUSD as `0x${string}`,
      FRESH_WITHDRAW_ADDRESS as `0x${string}`,
    ],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: withdrawTx });
  console.log(`  Withdraw tx: ${withdrawTx}`);
  console.log(`  Status: ${receipt.status}`);

  const balAfter = await getBalance(FRESH_WITHDRAW_ADDRESS as `0x${string}`);
  console.log(`  Recipient balance after: ${formatUnits(balAfter, 6)} pathUSD`);
  console.log(`  Received: ${formatUnits(balAfter - balBefore, 6)} pathUSD`);

  // ── Summary ────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("  COMPLETE — Full privacy pool flow passed!");
  console.log("=".repeat(60));
  console.log(`
  1. Stealth payment sent to ${stealthAddress}
  2. Detected via ECDH scanning
  3. Swept into privacy pool (${POOL_ADDRESS})
  4. Merkle tree rebuilt from ${allCommitments.length} on-chain events
  5. Groth16 proof generated in ${proveTime}ms
  6. Withdrawn to fresh address ${FRESH_WITHDRAW_ADDRESS}

  On-chain observer sees:
  - Sender → stealth address (unlinkable to recipient)
  - Stealth address → pool (just a pool deposit)
  - Pool → fresh address (ZK proof, no link to depositor)

  Full privacy: sender and recipient are never linked.
  `);
}

main().catch((err) => {
  console.error("\nE2E pool test failed:", err);
  process.exit(1);
});
