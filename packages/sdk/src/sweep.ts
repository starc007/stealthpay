import {
  createWalletClient,
  http,
  type Address,
  type Hash,
  type Chain,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export interface SweepParams {
  /** Private key for the stealth address */
  stealthPrivKey: `0x${string}`;
  /** Token contract address (TIP-20 / ERC-20) */
  tokenAddress: Address;
  /** Amount to sweep (in token smallest unit) */
  amount: bigint;
  /** Destination address to sweep funds to */
  destination: Address;
  /** RPC URL for the chain */
  rpcUrl: string;
  /** Chain config */
  chain: Chain;
}

export interface SweepResult {
  txHash: Hash;
  from: Address;
  to: Address;
  amount: bigint;
}

const erc20TransferAbi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
]);

/**
 * Sweep funds from a stealth address to a destination.
 *
 * Creates a transaction signed by the stealth address's private key
 * to transfer tokens to the destination.
 */
export async function sweepStealthAddress(
  params: SweepParams,
): Promise<SweepResult> {
  const { stealthPrivKey, tokenAddress, amount, destination, rpcUrl, chain } =
    params;

  const account = privateKeyToAccount(stealthPrivKey);

  const client = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });

  const txHash = await client.writeContract({
    address: tokenAddress,
    abi: erc20TransferAbi,
    functionName: "transfer",
    args: [destination, amount],
  });

  return {
    txHash,
    from: account.address,
    to: destination,
    amount,
  };
}

/**
 * Sweep all tokens from a stealth address (queries balance first).
 */
export async function sweepAllFromStealthAddress(
  params: Omit<SweepParams, "amount"> & { publicClient: any },
): Promise<SweepResult> {
  const {
    stealthPrivKey,
    tokenAddress,
    destination,
    rpcUrl,
    chain,
    publicClient,
  } = params;

  const account = privateKeyToAccount(stealthPrivKey);

  // Get token balance
  const balance = await publicClient.readContract({
    address: tokenAddress,
    abi: erc20TransferAbi,
    functionName: "balanceOf",
    args: [account.address],
  });

  if (balance === 0n) {
    throw new Error(`No token balance at stealth address ${account.address}`);
  }

  return sweepStealthAddress({
    stealthPrivKey,
    tokenAddress,
    amount: balance,
    destination,
    rpcUrl,
    chain,
  });
}
