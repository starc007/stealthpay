import { useState } from "react";
import {
  useAccount,
  usePublicClient,
  useSignMessage,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseAbi, formatUnits, parseAbiItem } from "viem";
import {
  generateStealthKeysFromSignature,
  checkStealthAddress,
  STEALTH_KEY_MESSAGE,
  type StealthKeys,
} from "stealthpay-tempo";
import { ANNOUNCER_ADDRESS, PATHUSD } from "../config";

const erc20Abi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
]);

const announcementEvent = parseAbiItem(
  "event Announcement(uint256 indexed schemeId, address indexed stealthAddress, address indexed caller, bytes ephemeralPubKey, bytes metadata)"
);

interface DetectedPayment {
  stealthAddress: string;
  ephemeralPubKey: string;
  stealthPrivKey: string;
  balance: bigint;
  blockNumber: bigint;
  txHash: string;
}

export function ScanSweep() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { signMessageAsync, isPending: isSigning } = useSignMessage();
  const { writeContractAsync } = useWriteContract();

  const [keys, setKeys] = useState<StealthKeys | null>(null);
  const [payments, setPayments] = useState<DetectedPayment[]>([]);
  const [scanning, setScanning] = useState(false);
  const [sweeping, setSweeping] = useState<string | null>(null);
  const [sweptTxs, setSweptTxs] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [scanComplete, setScanComplete] = useState(false);

  const handleUnlock = async () => {
    setError("");
    try {
      const signature = await signMessageAsync({ message: STEALTH_KEY_MESSAGE });
      const result = generateStealthKeysFromSignature(signature as `0x${string}`);
      setKeys(result);
    } catch (e: any) {
      setError(e.message?.includes("rejected") ? "Signature rejected" : (e.message || "Failed"));
    }
  };

  const handleScan = async () => {
    if (!keys || !publicClient) return;
    setScanning(true);
    setError("");
    setPayments([]);
    setScanComplete(false);

    try {
      const currentBlock = await publicClient.getBlockNumber();
      // Scan last 10000 blocks (adjust as needed)
      const fromBlock = currentBlock > 10000n ? currentBlock - 10000n : 0n;

      const logs = await publicClient.getLogs({
        address: ANNOUNCER_ADDRESS as `0x${string}`,
        event: announcementEvent,
        fromBlock,
        toBlock: currentBlock,
      });

      const found: DetectedPayment[] = [];

      for (const log of logs) {
        const { stealthAddress, ephemeralPubKey } = log.args as {
          stealthAddress: `0x${string}`;
          ephemeralPubKey: `0x${string}`;
        };

        if (!stealthAddress || !ephemeralPubKey) continue;

        // Check if this payment belongs to us
        const stealthPrivKey = checkStealthAddress(
          ephemeralPubKey,
          keys.spendingKey,
          keys.viewingKey,
          stealthAddress
        );

        if (stealthPrivKey) {
          // Check balance
          const balance = await publicClient.readContract({
            address: PATHUSD as `0x${string}`,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [stealthAddress],
          });

          found.push({
            stealthAddress,
            ephemeralPubKey,
            stealthPrivKey,
            balance,
            blockNumber: log.blockNumber,
            txHash: log.transactionHash,
          });
        }
      }

      setPayments(found);
      setScanComplete(true);
    } catch (e: any) {
      setError(e.shortMessage || e.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const handleSweep = async (payment: DetectedPayment) => {
    if (!address) return;
    setSweeping(payment.stealthAddress);
    setError("");

    try {
      // Reserve gas (pathUSD is the fee token)
      const gasReserve = 10000n; // 0.01 pathUSD
      const sweepAmount = payment.balance > gasReserve ? payment.balance - gasReserve : 0n;

      if (sweepAmount === 0n) {
        setError("Balance too low to cover gas");
        setSweeping(null);
        return;
      }

      const txHash = await writeContractAsync({
        address: PATHUSD as `0x${string}`,
        abi: erc20Abi,
        functionName: "transfer",
        args: [address, sweepAmount],
        account: { address: payment.stealthAddress as `0x${string}`, type: "json-rpc" },
      });

      setSweptTxs((prev) => ({ ...prev, [payment.stealthAddress]: txHash }));
      // Update balance
      setPayments((prev) =>
        prev.map((p) =>
          p.stealthAddress === payment.stealthAddress ? { ...p, balance: 0n } : p
        )
      );
    } catch (e: any) {
      // If wagmi can't sign with stealth key directly, we need a different approach
      // For now show the stealth private key so user can sweep manually
      setError(`Auto-sweep not available in browser. Use the API or CLI to sweep with the stealth private key.`);
    } finally {
      setSweeping(null);
    }
  };

  // Step 1: Unlock keys
  if (!keys) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 text-center">
        <div className="w-12 h-12 border border-border-active rounded-xl flex items-center justify-center mx-auto mb-4">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent">
            <path d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-[#e8e8ed] mb-2">Scan for Payments</h3>
        <p className="text-sm text-dim font-light mb-6 max-w-sm mx-auto">
          Sign a message to unlock your stealth keys, then scan the chain for payments sent to you.
        </p>
        <button
          onClick={handleUnlock}
          disabled={isSigning}
          type="button"
          className="border border-accent text-accent font-mono text-sm px-6 py-2.5 rounded-lg hover:bg-accent hover:text-[#0a0a0c] hover:shadow-[0_0_20px_var(--color-accent-glow)] transition-all disabled:opacity-40 cursor-pointer"
        >
          {isSigning ? "Check your wallet..." : "Unlock & Scan"}
        </button>
        {error && <p className="mt-3 text-sm text-danger font-mono">{error}</p>}
      </div>
    );
  }

  // Step 2: Scan & results
  return (
    <div className="space-y-4">
      {/* Scan button */}
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-sm font-medium text-[#e8e8ed]">
          {scanComplete
            ? `${payments.length} payment${payments.length !== 1 ? "s" : ""} found`
            : "Ready to scan"}
        </h3>
        <button
          onClick={handleScan}
          disabled={scanning}
          type="button"
          className="border border-accent text-accent font-mono text-xs px-4 py-2 rounded-lg hover:bg-accent hover:text-[#0a0a0c] transition-all disabled:opacity-40 cursor-pointer"
        >
          {scanning ? "Scanning..." : scanComplete ? "Scan Again" : "Scan Chain"}
        </button>
      </div>

      {scanning && (
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          <div className="animate-pulse text-dim font-mono text-sm">
            Scanning announcements...
          </div>
          <p className="text-[11px] text-muted mt-2">
            Checking each announcement against your viewing key
          </p>
        </div>
      )}

      {/* Payment list */}
      {scanComplete && payments.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          <p className="text-sm text-dim">No stealth payments found.</p>
          <p className="text-[11px] text-muted mt-1">
            Ask someone to send to your meta-address, then scan again.
          </p>
        </div>
      )}

      {payments.map((payment) => {
        const swept = sweptTxs[payment.stealthAddress];
        const isEmpty = payment.balance === 0n;

        return (
          <div
            key={payment.stealthAddress}
            className={`bg-card border rounded-xl p-5 ${
              isEmpty ? "border-border opacity-60" : "border-accent/20"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-sm text-accent">
                {isEmpty ? "Swept" : `${formatUnits(payment.balance, 6)} pathUSD`}
              </span>
              <span className="font-mono text-[10px] text-muted">
                block {payment.blockNumber.toString()}
              </span>
            </div>

            <div className="space-y-2">
              <div>
                <span className="font-mono text-[10px] text-muted block mb-0.5">stealth address</span>
                <span className="font-mono text-[11px] text-dim break-all">{payment.stealthAddress}</span>
              </div>
              <div className="h-px bg-border" />
              <div>
                <span className="font-mono text-[10px] text-muted block mb-0.5">stealth private key</span>
                <span className="font-mono text-[11px] text-warning break-all">{payment.stealthPrivKey}</span>
              </div>
            </div>

            {!isEmpty && !swept && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-[11px] text-dim mb-2">
                  Import this private key into your wallet or use the CLI to sweep funds to your address.
                </p>
              </div>
            )}

            {swept && (
              <div className="mt-3 pt-3 border-t border-border">
                <span className="font-mono text-[10px] text-muted block mb-0.5">sweep tx</span>
                <span className="font-mono text-[11px] text-accent break-all">{swept}</span>
              </div>
            )}
          </div>
        );
      })}

      {error && <p className="text-xs text-danger font-mono">{error}</p>}

      <button
        onClick={() => { setKeys(null); setPayments([]); setScanComplete(false); setError(""); }}
        className="w-full text-xs text-muted hover:text-dim font-mono transition-colors cursor-pointer py-2"
      >
        lock keys
      </button>
    </div>
  );
}
