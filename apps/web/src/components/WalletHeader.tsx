import { useAccount, useDisconnect, useReadContract } from "wagmi";
import { formatUnits, parseAbi } from "viem";
import { PATHUSD } from "../config";

const erc20Abi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);

function truncate(hex: string, n = 6): string {
  if (hex.length <= n * 2 + 4) return hex;
  return hex.slice(0, n + 2) + "..." + hex.slice(-n);
}

export function WalletHeader() {
  const { address } = useAccount();
  const { disconnect } = useDisconnect();

  const { data: balance } = useReadContract({
    address: PATHUSD as `0x${string}`,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });

  const formattedBalance =
    balance !== undefined ? formatUnits(balance, 6) : "...";

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]" />
        <span className="font-mono text-sm text-dim">
          {truncate(address || "", 6)}
        </span>
        <span className="font-mono text-sm text-accent">
          {formattedBalance} pathUSD
        </span>
      </div>
      <button
        onClick={() => disconnect()}
        className="text-xs text-muted hover:text-danger font-mono transition-colors cursor-pointer"
      >
        disconnect
      </button>
    </div>
  );
}
