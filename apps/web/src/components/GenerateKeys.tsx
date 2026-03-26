import { useState } from "react";
import { useConnection, useDisconnect, useSignMessage } from "wagmi";
import {
  generateStealthKeysFromSignature,
  STEALTH_KEY_MESSAGE,
  type StealthKeys,
} from "stealthpay-tempo";
import { CopyButton } from "./CopyButton";

function truncate(hex: string, n = 8): string {
  if (hex.length <= n * 2 + 4) return hex;
  return hex.slice(0, n + 2) + "..." + hex.slice(-n);
}

export function GenerateKeys() {
  const { address } = useConnection();
  const { disconnect } = useDisconnect();
  const { signMessageAsync, isPending: isSigning } = useSignMessage();
  const [keys, setKeys] = useState<StealthKeys | null>(null);
  const [error, setError] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);

  const handleGenerate = async () => {
    setError("");
    try {
      const signature = await signMessageAsync({ message: STEALTH_KEY_MESSAGE });
      const result = generateStealthKeysFromSignature(signature as `0x${string}`);
      setKeys(result);
    } catch (e: any) {
      if (e.message?.includes("User rejected")) {
        setError("Signature rejected");
      } else {
        setError(e.message || "Failed to sign message");
      }
    }
  };

  const handleRegister = async () => {
    if (!keys) return;
    setIsRegistering(true);
    setError("");
    try {
      const res = await fetch("http://localhost:3000/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          stealthMetaAddress: keys.metaAddress.encoded,
          viewingKey: keys.viewingKey,
        }),
      });
      if (res.ok) {
        setRegistered(true);
      } else {
        const data = await res.json();
        setError(data.error || "Registration failed");
      }
    } catch {
      setError("Could not reach scanner API");
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Connected header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]" />
          <span className="font-mono text-sm text-dim">{truncate(address || "", 6)}</span>
        </div>
        <button
          onClick={() => disconnect()}
          className="text-xs text-muted hover:text-danger font-mono transition-colors cursor-pointer"
        >
          disconnect
        </button>
      </div>

      {!keys ? (
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          <div className="w-12 h-12 border border-border-active rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent">
              <path d="M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2zm10-10V7a4 4 0 0 0-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-[#e8e8ed] mb-2">Generate Your Stealth Identity</h3>
          <p className="text-sm text-dim font-light mb-6 max-w-sm mx-auto">
            Sign a message with your wallet to derive your stealth keys. Your private key never leaves your wallet.
          </p>
          <button
            onClick={handleGenerate}
            disabled={isSigning}
            className="border border-accent text-accent font-mono text-sm px-6 py-2.5 rounded-lg hover:bg-accent hover:text-[#0a0a0c] hover:shadow-[0_0_20px_var(--color-accent-glow)] transition-all disabled:opacity-40 cursor-pointer"
          >
            {isSigning ? "Check your wallet..." : "Sign & Generate Keys"}
          </button>
          {error && <p className="mt-3 text-sm text-danger font-mono">{error}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Meta address card */}
          <div className="bg-card border border-accent/20 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-mono text-sm font-medium text-accent">Your Meta-Address</h3>
              <CopyButton text={keys.metaAddress.encoded} />
            </div>
            <p className="font-mono text-[11px] text-[#e8e8ed] break-all leading-relaxed bg-input rounded-lg p-3 border border-border">
              {keys.metaAddress.encoded}
            </p>
            <p className="text-[11px] text-dim mt-3 font-light">
              Share this with anyone who wants to send you a private payment. It cannot be used to see your balance or transaction history.
            </p>
          </div>

          {/* Key details */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="font-mono text-xs text-muted uppercase tracking-wider mb-3">Key Details</h3>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-muted">spending pubkey</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-dim">{truncate(keys.metaAddress.spendingPubKey, 10)}</span>
                  <CopyButton text={keys.metaAddress.spendingPubKey} />
                </div>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-muted">viewing pubkey</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-dim">{truncate(keys.metaAddress.viewingPubKey, 10)}</span>
                  <CopyButton text={keys.metaAddress.viewingPubKey} />
                </div>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-muted">viewing key</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-warning">{truncate(keys.viewingKey, 10)}</span>
                  <CopyButton text={keys.viewingKey} />
                </div>
              </div>
            </div>
          </div>

          {/* Register with scanner */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-mono text-sm font-medium text-[#e8e8ed] mb-1">Register with Scanner</h3>
                <p className="text-[11px] text-dim font-light">
                  Register your viewing key with the scanner API to auto-detect incoming payments.
                </p>
              </div>
              {registered ? (
                <span className="font-mono text-xs text-accent flex items-center gap-1.5 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" /> registered
                </span>
              ) : (
                <button
                  onClick={handleRegister}
                  disabled={isRegistering}
                  className="border border-border text-dim font-mono text-xs px-4 py-2 rounded-lg hover:border-accent hover:text-accent transition-all disabled:opacity-40 cursor-pointer shrink-0"
                >
                  {isRegistering ? "..." : "Register"}
                </button>
              )}
            </div>
            {error && <p className="mt-2 text-xs text-danger font-mono">{error}</p>}
          </div>

          {/* Regenerate */}
          <button
            onClick={() => { setKeys(null); setRegistered(false); setError(""); }}
            className="w-full text-xs text-muted hover:text-dim font-mono transition-colors cursor-pointer py-2"
          >
            regenerate keys
          </button>
        </div>
      )}
    </div>
  );
}
