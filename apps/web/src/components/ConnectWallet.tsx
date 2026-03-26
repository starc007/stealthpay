import { useConnect, useConnectors } from "wagmi";

export function ConnectWallet() {
  const connectors = useConnectors();
  const { connect, isPending, error } = useConnect();

  // Separate passkey (webAuthn) from injected/metamask connectors
  const passkeyConnector = connectors.find((c) => c.id === "webAuthn");
  const walletConnectors = connectors.filter((c) => c.id !== "webAuthn");

  return (
    <div className="flex flex-col items-center gap-6 py-12">
      <div className="w-16 h-16 border-2 border-accent/30 rounded-2xl flex items-center justify-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent">
          <path d="M12 11c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zm-6 8a6 6 0 0 1 12 0H6zm6-14a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
        </svg>
      </div>
      <div className="text-center">
        <h2 className="text-xl font-medium text-[#e8e8ed] mb-2">Welcome to StealthPay</h2>
        <p className="text-sm text-dim font-light max-w-xs">
          Connect your wallet to generate a stealth meta-address for receiving private payments.
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        {/* Tempo Passkey */}
        {passkeyConnector && (
          <>
            <button
              onClick={() => connect({ connector: passkeyConnector, capabilities: { type: "sign-up" } as Record<string, unknown> })}
              disabled={isPending}
              className="w-full border border-accent text-accent font-mono text-sm px-5 py-3 rounded-lg hover:bg-accent hover:text-[#0a0a0c] hover:shadow-[0_0_20px_var(--color-accent-glow)] transition-all disabled:opacity-40 cursor-pointer"
            >
              {isPending ? "Check your device..." : "Sign up with Passkey"}
            </button>
            <button
              onClick={() => connect({ connector: passkeyConnector })}
              disabled={isPending}
              className="w-full border border-border text-dim font-mono text-sm px-5 py-3 rounded-lg hover:border-accent/50 hover:text-[#e8e8ed] transition-all disabled:opacity-40 cursor-pointer"
            >
              {isPending ? "Check your device..." : "Sign in with Passkey"}
            </button>
          </>
        )}

        {/* Divider */}
        {passkeyConnector && walletConnectors.length > 0 && (
          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] text-muted font-mono">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>
        )}

        {/* MetaMask / Injected wallets */}
        {walletConnectors.map((connector) => (
          <button
            key={connector.uid}
            onClick={() => connect({ connector })}
            disabled={isPending}
            className="w-full border border-border text-dim font-mono text-sm px-5 py-3 rounded-lg hover:border-accent/50 hover:text-[#e8e8ed] transition-all disabled:opacity-40 cursor-pointer"
          >
            {isPending ? "Connecting..." : connector.name}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-xs text-danger font-mono max-w-xs text-center">
          {error.message.includes("denied") ? "Authentication cancelled" : error.message.slice(0, 100)}
        </p>
      )}
    </div>
  );
}
