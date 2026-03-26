import { useState } from "react";
import { useAccount, useChains, useWriteContract, useSwitchChain } from "wagmi";
import { parseUnits, parseAbi } from "viem";
import { computeStealthAddress, parseMetaAddress } from "stealthpay-tempo";
import { PATHUSD, ANNOUNCER_ADDRESS } from "../config";
import { TxLink } from "./TxLink";

const erc20Abi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
]);

const announcerAbi = parseAbi([
  "function announce(uint256 schemeId, address stealthAddress, bytes memory ephemeralPubKey, bytes memory metadata) external",
]);

type Step = "input" | "sending" | "announcing" | "done";

export function SendPayment() {
  const { chainId } = useAccount();
  const chains = useChains();
  const { switchChain } = useSwitchChain();
  const isSupportedChain = chains.some((c) => c.id === chainId);

  const [metaInput, setMetaInput] = useState("");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<Step>("input");
  const [error, setError] = useState("");
  const [stealthAddr, setStealthAddr] = useState("");
  const [transferHash, setTransferHash] = useState("");
  const [announceHash, setAnnounceHash] = useState("");

  const { writeContractAsync } = useWriteContract();

  const handleSend = async () => {
    setError("");

    if (!metaInput.match(/^0x[a-fA-F0-9]{132}$/)) {
      setError("Invalid meta-address — must be 66 bytes (0x + 132 hex chars)");
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError("Enter a valid amount");
      return;
    }

    try {
      // 1. Compute stealth address from meta-address
      const meta = parseMetaAddress(metaInput as `0x${string}`);
      const result = computeStealthAddress(meta);
      setStealthAddr(result.stealthAddress);

      // 2. Transfer tokens to stealth address
      setStep("sending");
      const amountWei = parseUnits(amount, 6); // pathUSD has 6 decimals

      const txHash = await writeContractAsync({
        address: PATHUSD as `0x${string}`,
        abi: erc20Abi,
        functionName: "transfer",
        args: [result.stealthAddress as `0x${string}`, amountWei],
      });
      setTransferHash(txHash);

      // 3. Announce ephemeral key
      setStep("announcing");
      const metadata =
        `0x${result.viewTag.toString(16).padStart(2, "0")}${PATHUSD.slice(2)}` as `0x${string}`;

      const announceTxHash = await writeContractAsync({
        address: ANNOUNCER_ADDRESS as `0x${string}`,
        abi: announcerAbi,
        functionName: "announce",
        args: [
          1n,
          result.stealthAddress as `0x${string}`,
          result.ephemeralPubKey as `0x${string}`,
          metadata,
        ],
      });
      setAnnounceHash(announceTxHash);

      setStep("done");
    } catch (e: any) {
      setError(e.shortMessage || e.message || "Transaction failed");
      setStep("input");
    }
  };

  const reset = () => {
    setStep("input");
    setMetaInput("");
    setAmount("");
    setError("");
    setStealthAddr("");
    setTransferHash("");
    setAnnounceHash("");
  };

  if (!isSupportedChain) {
    return (
      <div className="bg-card border border-warning/20 rounded-xl p-6 text-center">
        <h3 className="text-lg font-medium text-[#e8e8ed] mb-2">
          Wrong Network
        </h3>
        <p className="text-sm text-dim font-light mb-4">
          Switch to Tempo Testnet to send payments.
        </p>
        <button
          onClick={() =>
            switchChain({
              chainId: chains[0].id,
              addEthereumChainParameter: {
                nativeCurrency: { name: "USD", decimals: 18, symbol: "USD" },
              },
            })
          }
          type="button"
          className="border border-accent text-accent font-mono text-sm px-6 py-2.5 rounded-lg hover:bg-accent hover:text-[#0a0a0c] transition-all cursor-pointer"
        >
          Switch to Tempo Testnet
        </button>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="space-y-4">
        <div className="bg-card border border-accent/20 rounded-xl p-6 text-center">
          <div className="w-12 h-12 border border-accent rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-accent"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-accent mb-2">Payment Sent</h3>
          <p className="text-sm text-dim font-light mb-4">
            {amount} pathUSD sent to a stealth address. The recipient can detect
            and sweep it.
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-mono text-xs text-muted uppercase tracking-wider mb-3">
            Transaction Details
          </h3>
          <div className="space-y-2.5">
            <div>
              <span className="font-mono text-[10px] text-muted block mb-1">
                stealth address
              </span>
              <span className="font-mono text-[11px] text-[#e8e8ed] break-all">
                {stealthAddr}
              </span>
            </div>
            <div className="h-px bg-border" />
            <div>
              <span className="font-mono text-[10px] text-muted block mb-1">
                transfer tx
              </span>
              <TxLink hash={transferHash} />
            </div>
            <div className="h-px bg-border" />
            <div>
              <span className="font-mono text-[10px] text-muted block mb-1">
                announce tx
              </span>
              <TxLink hash={announceHash} />
            </div>
          </div>
        </div>

        <button
          onClick={reset}
          type="button"
          className="w-full border border-border text-dim font-mono text-sm px-5 py-3 rounded-lg hover:border-accent/50 hover:text-[#e8e8ed] transition-all cursor-pointer"
        >
          Send Another
        </button>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <h3 className="text-lg font-medium text-[#e8e8ed] mb-1">
        Send Private Payment
      </h3>
      <p className="text-sm text-dim font-light mb-5">
        Paste the recipient's meta-address to send them a stealth payment.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block font-mono text-[10px] text-muted uppercase tracking-wider mb-1.5">
            Recipient Meta-Address
          </label>
          <input
            type="text"
            value={metaInput}
            onChange={(e) => setMetaInput(e.target.value)}
            placeholder="0x... (66-byte meta-address)"
            disabled={step !== "input"}
            className="w-full bg-input border border-border rounded-md px-3 py-2.5 text-[#e8e8ed] font-mono text-xs outline-none focus:border-accent transition-colors placeholder:text-muted disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block font-mono text-[10px] text-muted uppercase tracking-wider mb-1.5">
            Amount (pathUSD)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1.00"
            step="0.01"
            min="0"
            disabled={step !== "input"}
            className="w-full bg-input border border-border rounded-md px-3 py-2.5 text-[#e8e8ed] font-mono text-xs outline-none focus:border-accent transition-colors placeholder:text-muted disabled:opacity-50"
          />
        </div>

        <button
          onClick={handleSend}
          disabled={step !== "input"}
          type="button"
          className="w-full border border-accent text-accent font-mono text-sm px-5 py-3 rounded-lg hover:bg-accent hover:text-[#0a0a0c] hover:shadow-[0_0_20px_var(--color-accent-glow)] transition-all disabled:opacity-40 cursor-pointer"
        >
          {step === "sending"
            ? "Sending tokens..."
            : step === "announcing"
              ? "Announcing..."
              : "Send Payment"}
        </button>

        {error && <p className="text-xs text-danger font-mono">{error}</p>}
      </div>
    </div>
  );
}
