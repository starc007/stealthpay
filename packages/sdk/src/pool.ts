import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  parseAbiItem,
  type Address,
  type Hash,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ── ABIs ─────────────────────────────────────────

const poolAbi = parseAbi([
  "function deposit(address token, uint256 amount, uint256 noteCommitment) external",
  "function withdraw(uint256[8] calldata proof, uint256 nullifier, uint256 merkleRoot, uint256 amount, address token, address recipient) external",
  "function getMerkleRoot() external view returns (uint256)",
  "function getNoteCount() external view returns (uint256)",
  "function knownRoots(uint256) external view returns (bool)",
  "function spentNullifiers(uint256) external view returns (bool)",
]);

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
]);

const depositedEvent = parseAbiItem(
  "event Deposited(uint256 indexed noteIndex, uint256 indexed noteCommitment, address indexed token, address depositor, uint256 amount)"
);

// ── Types ────────────────────────────────────────

export interface PoolDepositParams {
  /** Private key for the stealth address */
  stealthPrivKey: `0x${string}`;
  /** Token to deposit */
  tokenAddress: Address;
  /** Amount to deposit */
  amount: bigint;
  /** StealthPool contract address */
  poolAddress: Address;
  /** Note commitment (Poseidon hash computed off-chain) */
  noteCommitment: bigint;
  /** RPC URL */
  rpcUrl: string;
  /** Chain config */
  chain: Chain;
}

export interface PoolDepositResult {
  /** Approve tx hash */
  approveTxHash: Hash;
  /** Deposit tx hash */
  depositTxHash: Hash;
  /** Note index in the Merkle tree */
  noteIndex: bigint;
  /** The Merkle root after deposit */
  merkleRoot: bigint;
}

export interface PoolWithdrawParams {
  /** Groth16 proof (8 uint256s) */
  proof: [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
  /** Nullifier (prevents double-spend) */
  nullifier: bigint;
  /** Merkle root the proof was computed against */
  merkleRoot: bigint;
  /** Amount to withdraw */
  amount: bigint;
  /** Token address */
  tokenAddress: Address;
  /** Recipient address (bound in the ZK proof) */
  recipient: Address;
  /** StealthPool contract address */
  poolAddress: Address;
  /** RPC URL */
  rpcUrl: string;
  /** Chain config */
  chain: Chain;
}

export interface PoolWithdrawResult {
  txHash: Hash;
  recipient: Address;
  amount: bigint;
}

export interface NoteInputs {
  /** Token address as uint256 */
  asset: bigint;
  /** Deposit amount */
  amount: bigint;
  /** Poseidon(recipientPubKey, blinding) */
  recipientCommitment: bigint;
  /** Unique salt per deposit (e.g. channelId or random) */
  salt: bigint;
  /** Random nonce */
  randomness: bigint;
}

// ── Deposit ──────────────────────────────────────

/**
 * Deposit tokens from a stealth address into the privacy pool.
 *
 * Two transactions:
 * 1. Approve the pool to spend tokens
 * 2. Call pool.deposit() with the note commitment
 *
 * The note commitment should be computed off-chain using Poseidon:
 *   noteCommitment = Poseidon(asset, amount, recipientCommitment, salt, randomness)
 */
export async function depositToPool(
  params: PoolDepositParams
): Promise<PoolDepositResult> {
  const {
    stealthPrivKey,
    tokenAddress,
    amount,
    poolAddress,
    noteCommitment,
    rpcUrl,
    chain,
  } = params;

  const account = privateKeyToAccount(stealthPrivKey);

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  // 1. Approve pool to spend tokens
  const approveTxHash = await walletClient.writeContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "approve",
    args: [poolAddress, amount],
  });

  await publicClient.waitForTransactionReceipt({ hash: approveTxHash });

  // 2. Deposit into pool
  const depositTxHash = await walletClient.writeContract({
    address: poolAddress,
    abi: poolAbi,
    functionName: "deposit",
    args: [tokenAddress, amount, noteCommitment],
  });

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: depositTxHash,
  });

  // Extract noteIndex from event
  const logs = await publicClient.getLogs({
    address: poolAddress,
    event: depositedEvent,
    fromBlock: receipt.blockNumber,
    toBlock: receipt.blockNumber,
  });

  const depositLog = logs.find(
    (l) => l.transactionHash === depositTxHash
  );

  const noteIndex = depositLog?.args?.noteIndex ?? 0n;

  // Get updated Merkle root
  const merkleRoot = await publicClient.readContract({
    address: poolAddress,
    abi: poolAbi,
    functionName: "getMerkleRoot",
  });

  return {
    approveTxHash,
    depositTxHash,
    noteIndex,
    merkleRoot: merkleRoot as bigint,
  };
}

// ── Withdraw ─────────────────────────────────────

/**
 * Withdraw tokens from the privacy pool using a Groth16 ZK proof.
 *
 * The proof must be generated off-chain using snarkjs with the
 * note_redeem circuit. Anyone can call this — the proof binds
 * the recipient address so funds go to the right place.
 */
export async function withdrawFromPool(
  params: PoolWithdrawParams
): Promise<PoolWithdrawResult> {
  const {
    proof,
    nullifier,
    merkleRoot,
    amount,
    tokenAddress,
    recipient,
    poolAddress,
    rpcUrl,
    chain,
  } = params;

  // Anyone can submit the withdrawal — no private key needed
  // In practice the recipient or a relayer calls this
  const walletClient = createWalletClient({
    chain,
    transport: http(rpcUrl),
  });

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  const txHash = await walletClient.writeContract({
    address: poolAddress,
    abi: poolAbi,
    functionName: "withdraw",
    args: [proof, nullifier, merkleRoot, amount, tokenAddress, recipient],
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return {
    txHash,
    recipient,
    amount,
  };
}

// ── Helpers ──────────────────────────────────────

/**
 * Get the current Merkle root of the pool.
 */
export async function getPoolRoot(
  poolAddress: Address,
  rpcUrl: string,
  chain: Chain
): Promise<bigint> {
  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  return client.readContract({
    address: poolAddress,
    abi: poolAbi,
    functionName: "getMerkleRoot",
  }) as Promise<bigint>;
}

/**
 * Get all deposit events from the pool for building Merkle proofs.
 */
export async function getPoolDeposits(
  poolAddress: Address,
  rpcUrl: string,
  chain: Chain,
  fromBlock: bigint = 0n
): Promise<Array<{ noteIndex: bigint; noteCommitment: bigint; token: Address; depositor: Address; amount: bigint }>> {
  const client = createPublicClient({ chain, transport: http(rpcUrl) });

  const logs = await client.getLogs({
    address: poolAddress,
    event: depositedEvent,
    fromBlock,
  });

  return logs.map((log) => ({
    noteIndex: log.args.noteIndex!,
    noteCommitment: log.args.noteCommitment!,
    token: log.args.token!,
    depositor: log.args.depositor!,
    amount: log.args.amount!,
  }));
}
