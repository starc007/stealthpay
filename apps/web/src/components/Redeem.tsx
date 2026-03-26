import { useState } from "react";
import { formatUnits } from "viem";
import {
  loadNotesFromStorage,
  removeNoteFromStorage,
  type NoteSecrets,
} from "../lib/pool";
import { TxLink } from "./TxLink";

interface StoredNote {
  noteIndex: number;
  secrets: NoteSecrets;
  redeemTxHash?: string;
  redeeming?: boolean;
}

export function Redeem() {
  const [notes, setNotes] = useState<StoredNote[]>(() =>
    loadNotesFromStorage().map((n) => ({
      ...n,
      redeemTxHash: undefined,
      redeeming: false,
    }))
  );
  const [error, setError] = useState("");

  const totalAmount = notes
    .filter((n) => !n.redeemTxHash)
    .reduce((sum, n) => sum + n.secrets.amount, 0n);

  const pendingCount = notes.filter((n) => !n.redeemTxHash).length;

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
          Sweep payments to the Privacy Pool first, then come here to withdraw via ZK proof.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-card border border-accent/20 rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-lg text-accent font-medium">
              {formatUnits(totalAmount, 6)} pathUSD
            </p>
            <p className="text-[11px] text-dim mt-0.5">
              {pendingCount} note{pendingCount !== 1 ? "s" : ""} in privacy pool
            </p>
          </div>
        </div>
        <p className="text-[11px] text-dim mt-3">
          ZK withdrawal generates a proof that you own the note without revealing which deposit it came from. Withdraw to any fresh address.
        </p>
        <p className="text-[11px] text-warning mt-2">
          ZK proof generation coming soon — pool contract needs to be deployed first.
        </p>
      </div>

      {/* Note list */}
      {notes.map((note) => (
        <div
          key={note.noteIndex}
          className={`bg-card border rounded-xl p-4 ${
            note.redeemTxHash
              ? "border-[#1a3a2a] opacity-70"
              : "border-border"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {note.redeemTxHash ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent shrink-0">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border border-accent/30 bg-accent/10 shrink-0" />
              )}
              <span className="font-mono text-sm text-[#e8e8ed]">
                {note.redeemTxHash
                  ? "Redeemed"
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
