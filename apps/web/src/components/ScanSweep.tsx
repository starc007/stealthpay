import { useState } from "react";
import { useAccount, usePublicClient, useSignMessage } from "wagmi";
import {
  createWalletClient,
  http,
  parseAbi,
  formatUnits,
  parseAbiItem,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { tempoModerato } from "viem/chains";
import {
  generateStealthKeysFromSignature,
  checkStealthAddress,
  STEALTH_KEY_MESSAGE,
  type StealthKeys,
} from "stealthpay-tempo";
import { ANNOUNCER_ADDRESS, PATHUSD } from "../config";
import { TxLink } from "./TxLink";
import { createNoteSecrets, saveNoteToStorage } from "../lib/pool";

const POOL_ADDRESS = "0xF09BaF55940346C84E439F836Dd686A3102D1cF3";

const erc20Abi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
]);

const poolAbi = parseAbi([
  "function deposit(address token, uint256 amount, uint256 noteCommitment) external",
]);

const announcementEvent = parseAbiItem(
  "event Announcement(uint256 indexed schemeId, address indexed stealthAddress, address indexed caller, bytes ephemeralPubKey, bytes metadata)"
);

type SweepMode = "direct" | "pool";

interface DetectedPayment {
  stealthAddress: string;
  ephemeralPubKey: string;
  stealthPrivKey: string;
  balance: bigint;
  blockNumber: bigint;
  txHash: string;
  sweepTxHash?: string;
  sweeping?: boolean;
}

export function ScanSweep() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { signMessageAsync, isPending: isSigning } = useSignMessage();

  const [keys, setKeys] = useState<StealthKeys | null>(null);
  const [payments, setPayments] = useState<DetectedPayment[]>([]);
  const [scanning, setScanning] = useState(false);
  const [sweepingAll, setSweepingAll] = useState(false);
  const [error, setError] = useState("");
  const [scanComplete, setScanComplete] = useState(false);
  const [destination, setDestination] = useState("");
  const [sweepMode, setSweepMode] = useState<SweepMode>("direct");

  const sweepTo: Address | undefined =
    destination.match(/^0x[a-fA-F0-9]{40}$/)
      ? (destination as Address)
      : address;

  const poolEnabled = !!POOL_ADDRESS;

  const handleUnlockAndScan = async () => {
    setError("");
    try {
      const signature = await signMessageAsync({ message: STEALTH_KEY_MESSAGE });
      const result = generateStealthKeysFromSignature(signature as `0x${string}`);
      setKeys(result);
      await scanChain(result);
    } catch (e: any) {
      setError(e.message?.includes("rejected") ? "Signature rejected" : (e.message || "Failed"));
    }
  };

  const scanChain = async (stealthKeys: StealthKeys) => {
    if (!publicClient) return;
    setScanning(true);
    setError("");
    setPayments([]);
    setScanComplete(false);

    try {
      const currentBlock = await publicClient.getBlockNumber();
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

        const stealthPrivKey = checkStealthAddress(
          ephemeralPubKey,
          stealthKeys.spendingKey,
          stealthKeys.viewingKey,
          stealthAddress
        );

        if (stealthPrivKey) {
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

  const sweepDirect = async (payment: DetectedPayment, to: Address): Promise<string | null> => {
    const gasReserve = 10000n;
    const sweepAmount = payment.balance > gasReserve ? payment.balance - gasReserve : 0n;
    if (sweepAmount === 0n) return null;

    const stealthAccount = privateKeyToAccount(payment.stealthPrivKey as `0x${string}`);
    const stealthClient = createWalletClient({
      account: stealthAccount,
      chain: tempoModerato,
      transport: http(),
    });

    return stealthClient.writeContract({
      address: PATHUSD as `0x${string}`,
      abi: erc20Abi,
      functionName: "transfer",
      args: [to, sweepAmount],
    });
  };

  const sweepToPool = async (payment: DetectedPayment): Promise<string | null> => {
    const gasReserve = 20000n; // slightly more for approve + deposit (2 txs)
    const depositAmount = payment.balance > gasReserve ? payment.balance - gasReserve : 0n;
    if (depositAmount === 0n) return null;

    const stealthAccount = privateKeyToAccount(payment.stealthPrivKey as `0x${string}`);
    const stealthClient = createWalletClient({
      account: stealthAccount,
      chain: tempoModerato,
      transport: http(),
    });

    // Generate note secrets
    const secrets = await createNoteSecrets(PATHUSD, depositAmount);

    // Approve pool
    const approveTx = await stealthClient.writeContract({
      address: PATHUSD as `0x${string}`,
      abi: erc20Abi,
      functionName: "approve",
      args: [POOL_ADDRESS as `0x${string}`, depositAmount],
    });

    if (publicClient) {
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
    }

    // Deposit into pool
    const depositTx = await stealthClient.writeContract({
      address: POOL_ADDRESS as `0x${string}`,
      abi: poolAbi,
      functionName: "deposit",
      args: [PATHUSD as `0x${string}`, depositAmount, secrets.noteCommitment],
    });

    // Save secrets for later withdrawal
    // noteIndex is approximate — will be refined from events
    const noteCount = payments.indexOf(payment);
    saveNoteToStorage(secrets, noteCount);

    return depositTx;
  };

  const handleSweepAll = async () => {
    if (sweepMode === "direct" && !sweepTo) return;
    if (sweepMode === "pool" && !poolEnabled) return;
    setSweepingAll(true);
    setError("");

    const sweepable = payments.filter((p) => p.balance > 10000n && !p.sweepTxHash);

    for (const payment of sweepable) {
      setPayments((prev) =>
        prev.map((p) =>
          p.stealthAddress === payment.stealthAddress ? { ...p, sweeping: true } : p
        )
      );

      try {
        const txHash =
          sweepMode === "pool"
            ? await sweepToPool(payment)
            : await sweepDirect(payment, sweepTo!);

        setPayments((prev) =>
          prev.map((p) =>
            p.stealthAddress === payment.stealthAddress
              ? { ...p, sweeping: false, sweepTxHash: txHash || undefined, balance: 0n }
              : p
          )
        );
      } catch (e: any) {
        setPayments((prev) =>
          prev.map((p) =>
            p.stealthAddress === payment.stealthAddress ? { ...p, sweeping: false } : p
          )
        );
        setError(e.shortMessage || e.message || "Sweep failed");
        break;
      }
    }

    setSweepingAll(false);
  };

  const totalBalance = payments.reduce((sum, p) => sum + p.balance, 0n);
  const sweepableCount = payments.filter((p) => p.balance > 10000n && !p.sweepTxHash).length;

  // Step 1: Unlock + scan
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
          Sign to unlock your stealth keys and scan for incoming payments.
        </p>
        <button
          onClick={handleUnlockAndScan}
          disabled={isSigning}
          type="button"
          className="border border-accent text-accent font-mono text-sm px-6 py-2.5 rounded-lg hover:bg-accent hover:text-[#0a0a0c] hover:shadow-[0_0_20px_var(--color-accent-glow)] transition-all disabled:opacity-40 cursor-pointer"
        >
          {isSigning ? "Check your wallet..." : "Scan for Payments"}
        </button>
        {error && <p className="mt-3 text-sm text-danger font-mono">{error}</p>}
      </div>
    );
  }

  // Step 2: Results
  return (
    <div className="space-y-4">
      {scanning && (
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          <div className="animate-pulse text-dim font-mono text-sm">Scanning the chain...</div>
          <p className="text-[11px] text-muted mt-2">Checking announcements against your viewing key</p>
        </div>
      )}

      {scanComplete && payments.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          <p className="text-sm text-dim">No payments found.</p>
          <p className="text-[11px] text-muted mt-1">
            Share your meta-address in the Receive tab, then come back here.
          </p>
        </div>
      )}

      {/* Summary + sweep options */}
      {scanComplete && payments.length > 0 && (
        <div className="bg-card border border-accent/20 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-lg text-accent font-medium">
                {formatUnits(totalBalance, 6)} pathUSD
              </p>
              <p className="text-[11px] text-dim mt-0.5">
                {payments.length} payment{payments.length !== 1 ? "s" : ""} detected
              </p>
            </div>
          </div>

          {sweepableCount > 0 && (
            <>
              {/* Sweep mode toggle */}
              <div className="flex gap-1 bg-input border border-border rounded-lg p-1">
                <button
                  onClick={() => setSweepMode("direct")}
                  type="button"
                  className={`flex-1 font-mono text-xs py-1.5 rounded-md transition-all cursor-pointer ${
                    sweepMode === "direct"
                      ? "bg-accent/10 text-accent border border-accent/20"
                      : "text-muted hover:text-dim border border-transparent"
                  }`}
                >
                  Direct Sweep
                </button>
                <button
                  onClick={() => setSweepMode("pool")}
                  disabled={!poolEnabled}
                  type="button"
                  className={`flex-1 font-mono text-xs py-1.5 rounded-md transition-all cursor-pointer disabled:opacity-30 ${
                    sweepMode === "pool"
                      ? "bg-accent/10 text-accent border border-accent/20"
                      : "text-muted hover:text-dim border border-transparent"
                  }`}
                >
                  Privacy Pool {!poolEnabled && "(soon)"}
                </button>
              </div>

              {sweepMode === "direct" && (
                <div>
                  <label className="block font-mono text-[10px] text-muted uppercase tracking-wider mb-1.5">
                    Sweep to (optional — defaults to connected wallet)
                  </label>
                  <input
                    type="text"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder={address || "0x..."}
                    className="w-full bg-input border border-border rounded-md px-3 py-2 text-[#e8e8ed] font-mono text-xs outline-none focus:border-accent transition-colors placeholder:text-muted"
                  />
                  {destination && !destination.match(/^0x[a-fA-F0-9]{40}$/) && (
                    <p className="text-[10px] text-danger mt-1 font-mono">Invalid address</p>
                  )}
                </div>
              )}

              {sweepMode === "pool" && poolEnabled && (
                <p className="text-[11px] text-dim">
                  Funds will be deposited into the privacy pool. Withdraw later via ZK proof to any address — fully private.
                </p>
              )}

              {/* Sweep button */}
              <button
                onClick={handleSweepAll}
                disabled={
                  sweepingAll ||
                  (sweepMode === "direct" && !!destination && !destination.match(/^0x[a-fA-F0-9]{40}$/)) ||
                  (sweepMode === "pool" && !poolEnabled)
                }
                type="button"
                className="w-full border border-accent text-accent font-mono text-sm px-5 py-3 rounded-lg hover:bg-accent hover:text-[#0a0a0c] hover:shadow-[0_0_20px_var(--color-accent-glow)] transition-all disabled:opacity-40 cursor-pointer"
              >
                {sweepingAll
                  ? "Sweeping..."
                  : sweepMode === "pool"
                    ? `Deposit ${sweepableCount} payment${sweepableCount !== 1 ? "s" : ""} to Privacy Pool`
                    : `Sweep ${sweepableCount} payment${sweepableCount !== 1 ? "s" : ""} to ${
                        destination
                          ? destination.slice(0, 8) + "..." + destination.slice(-4)
                          : "connected wallet"
                      }`}
              </button>
            </>
          )}
        </div>
      )}

      {/* Payment list */}
      {payments.map((payment) => (
        <div
          key={payment.stealthAddress}
          className={`bg-card border rounded-xl p-4 ${
            payment.sweepTxHash
              ? "border-[#1a3a2a] opacity-70"
              : payment.sweeping
                ? "border-accent/40"
                : "border-border"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {payment.sweepTxHash ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent shrink-0">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              ) : payment.sweeping ? (
                <div className="w-3.5 h-3.5 border-2 border-accent/40 border-t-accent rounded-full animate-spin shrink-0" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border border-border shrink-0" />
              )}
              <span className="font-mono text-sm text-[#e8e8ed]">
                {payment.sweepTxHash
                  ? "Swept"
                  : payment.sweeping
                    ? "Sweeping..."
                    : `${formatUnits(payment.balance, 6)} pathUSD`}
              </span>
            </div>
            <span className="font-mono text-[10px] text-muted">
              {payment.stealthAddress.slice(0, 8)}...{payment.stealthAddress.slice(-6)}
            </span>
          </div>

          {payment.sweepTxHash && (
            <div className="mt-2 pl-6">
              <TxLink hash={payment.sweepTxHash} />
            </div>
          )}
        </div>
      ))}

      {error && <p className="text-xs text-danger font-mono">{error}</p>}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => keys && scanChain(keys)}
          disabled={scanning}
          type="button"
          className="flex-1 text-xs text-muted hover:text-dim font-mono transition-colors cursor-pointer py-2 border border-border rounded-lg hover:border-border-active"
        >
          {scanning ? "Scanning..." : "Rescan"}
        </button>
        <button
          onClick={() => { setKeys(null); setPayments([]); setScanComplete(false); setError(""); setDestination(""); }}
          type="button"
          className="flex-1 text-xs text-muted hover:text-dim font-mono transition-colors cursor-pointer py-2 border border-border rounded-lg hover:border-border-active"
        >
          Lock
        </button>
      </div>
    </div>
  );
}
