import { useState } from "react";
import { usePublicClient, useWriteContract } from "wagmi";
import {
  parseAbi,
  parseAbiItem,
  formatUnits,
} from "viem";
import {
  loadNotesFromStorage,
  removeNoteFromStorage,
  type NoteSecrets,
} from "../lib/pool";
import { generateWithdrawProof } from "../lib/prover";
import { PATHUSD, POOL_ADDRESS } from "../config";
import { TxLink } from "./TxLink";

const poolAbi = parseAbi([
  "function withdraw(uint256[8] calldata proof, uint256 nullifier, uint256 merkleRoot, uint256 amount, address token, address recipient) external",
]);

const depositedEvent = parseAbiItem(
  "event Deposited(uint256 indexed noteIndex, uint256 indexed noteCommitment, address indexed token, address depositor, uint256 amount)"
);

interface StoredNote {
  noteIndex: number;
  secrets: NoteSecrets;
  redeemTxHash?: string;
  redeeming?: boolean;
}

export function Redeem() {
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [notes, setNotes] = useState<StoredNote[]>(() =>
    loadNotesFromStorage().map((n) => ({ ...n }))
  );
  const [recipient, setRecipient] = useState("");
  const [error, setError] = useState("");
  const [proving, setProving] = useState(false);

  const totalAmount = notes
    .filter((n) => !n.redeemTxHash)
    .reduce((sum, n) => sum + n.secrets.amount, 0n);
  const pendingCount = notes.filter((n) => !n.redeemTxHash).length;

  const validRecipient = recipient.match(/^0x[a-fA-F0-9]{40}$/);

  const handleRedeem = async (note: StoredNote) => {
    if (!validRecipient || !publicClient) return;
    setError("");
    setProving(true);

    setNotes((prev) =>
      prev.map((n) =>
        n.noteIndex === note.noteIndex ? { ...n, redeeming: true } : n
      )
    );

    try {
      // 1. Fetch all deposits to build Merkle tree
      const currentBlock = await publicClient.getBlockNumber();
      const logs = await publicClient.getLogs({
        address: POOL_ADDRESS as `0x${string}`,
        event: depositedEvent,
        fromBlock: currentBlock - 50000n,
        toBlock: currentBlock,
      });

      const noteCommitments = logs.map((l) => l.args.noteCommitment!);

      // 2. Generate ZK proof
      const { proof, nullifier, merkleRoot } = await generateWithdrawProof(
        note.secrets,
        noteCommitments,
        note.noteIndex,
        recipient
      );

      // 3. Submit withdrawal tx using connected wallet (pays gas)
      const txHash = await writeContractAsync({
        address: POOL_ADDRESS as `0x${string}`,
        abi: poolAbi,
        functionName: "withdraw",
        args: [
          proof as any,
          nullifier,
          merkleRoot,
          note.secrets.amount,
          PATHUSD as `0x${string}`,
          recipient as `0x${string}`,
        ],
      });

      await publicClient!.waitForTransactionReceipt({ hash: txHash });

      setNotes((prev) =>
        prev.map((n) =>
          n.noteIndex === note.noteIndex
            ? { ...n, redeeming: false, redeemTxHash: txHash }
            : n
        )
      );

      removeNoteFromStorage(note.noteIndex);
    } catch (e: any) {
      setNotes((prev) =>
        prev.map((n) =>
          n.noteIndex === note.noteIndex ? { ...n, redeeming: false } : n
        )
      );
      setError(e.shortMessage || e.message || "Redemption failed");
    } finally {
      setProving(false);
    }
  };

  const handleRedeemAll = async () => {
    const pending = notes.filter((n) => !n.redeemTxHash);
    for (const note of pending) {
      await handleRedeem(note);
      if (error) break;
    }
  };

  if (notes.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 text-center">
        <div className="w-12 h-12 border border-border-active rounded-xl flex items-center justify-center mx-auto mb-4">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent">
            <path d="M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2zm10-10V7a4 4 0 0 0-8 0v4h8z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-[#e8e8ed] mb-2">No Pool Deposits</h3>
        <p className="text-sm text-dim font-light max-w-sm mx-auto">
          Sweep payments to the Privacy Pool in the Scan tab first, then come here to withdraw privately.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-card border border-accent/20 rounded-xl p-5 space-y-4">
        <div>
          <p className="font-mono text-lg text-accent font-medium">
            {formatUnits(totalAmount, 6)} pathUSD
          </p>
          <p className="text-[11px] text-dim mt-0.5">
            {pendingCount} note{pendingCount !== 1 ? "s" : ""} in privacy pool
          </p>
        </div>

        {pendingCount > 0 && (
          <>
            <div>
              <label className="block font-mono text-[10px] text-muted uppercase tracking-wider mb-1.5">
                Withdraw to (use a fresh address for privacy)
              </label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="0x... fresh address"
                className="w-full bg-input border border-border rounded-md px-3 py-2 text-[#e8e8ed] font-mono text-xs outline-none focus:border-accent transition-colors placeholder:text-muted"
              />
              {recipient && !validRecipient && (
                <p className="text-[10px] text-danger mt-1 font-mono">Invalid address</p>
              )}
            </div>

            <button
              onClick={handleRedeemAll}
              disabled={!validRecipient || proving}
              type="button"
              className="w-full border border-accent text-accent font-mono text-sm px-5 py-3 rounded-lg hover:bg-accent hover:text-[#0a0a0c] hover:shadow-[0_0_20px_var(--color-accent-glow)] transition-all disabled:opacity-40 cursor-pointer"
            >
              {proving
                ? "Generating ZK proof..."
                : `Withdraw ${pendingCount} note${pendingCount !== 1 ? "s" : ""} privately`}
            </button>

            <p className="text-[10px] text-dim">
              Generates a ZK proof in your browser proving you own the note, without revealing which deposit it was. Funds are sent to the address above.
            </p>
          </>
        )}
      </div>

      {/* Note list */}
      {notes.map((note) => (
        <div
          key={note.noteIndex}
          className={`bg-card border rounded-xl p-4 ${
            note.redeemTxHash
              ? "border-[#1a3a2a] opacity-70"
              : note.redeeming
                ? "border-accent/40"
                : "border-border"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {note.redeemTxHash ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent shrink-0">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              ) : note.redeeming ? (
                <div className="w-3.5 h-3.5 border-2 border-accent/40 border-t-accent rounded-full animate-spin shrink-0" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border border-accent/30 bg-accent/10 shrink-0" />
              )}
              <span className="font-mono text-sm text-[#e8e8ed]">
                {note.redeemTxHash
                  ? "Redeemed"
                  : note.redeeming
                    ? "Proving..."
                    : `${formatUnits(note.secrets.amount, 6)} pathUSD`}
              </span>
            </div>
            <span className="font-mono text-[10px] text-muted">
              note #{note.noteIndex}
            </span>
          </div>

          {note.redeemTxHash && (
            <div className="mt-2 pl-6">
              <TxLink hash={note.redeemTxHash} />
            </div>
          )}
        </div>
      ))}

      {error && <p className="text-xs text-danger font-mono">{error}</p>}
    </div>
  );
}
