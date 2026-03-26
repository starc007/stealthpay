import { useState } from "react";
import {
  randomKey,
  truncate,
  generateKeys,
  computeStealth,
  scanPayment,
  deriveStealthKey,
  type KeygenResult,
  type StealthResult,
  type ScanResult,
  type DeriveResult,
} from "./stealth";

const FLOW_STEPS = ["keygen", "register", "send", "announce", "scan", "sweep"];
const STEP_MAP: Record<number, number> = { 1: 0, 2: 2, 3: 4, 4: 5 };

function FlowDiagram({ activeStep }: { activeStep: number }) {
  const activeIdx = STEP_MAP[activeStep] ?? 0;
  return (
    <div className="flex items-center justify-center gap-1.5 py-5 flex-wrap">
      {FLOW_STEPS.map((step, i) => (
        <div key={step} className="flex items-center gap-1.5">
          <span
            className={`font-mono text-[11px] px-2.5 py-1 border rounded transition-all duration-300 ${
              i < activeIdx
                ? "border-[#1a3a2a] text-[#4a8a6a]"
                : i === activeIdx
                  ? "border-accent text-accent bg-accent-dim"
                  : "border-border text-muted"
            }`}
          >
            {step}
          </span>
          {i < FLOW_STEPS.length - 1 && (
            <span className="text-muted text-xs">→</span>
          )}
        </div>
      ))}
    </div>
  );
}

function OutputLine({
  label,
  value,
  type = "value",
}: {
  label: string;
  value: string;
  type?: "value" | "dim" | "accent" | "error" | "info";
}) {
  const colorClass =
    type === "accent"
      ? "text-accent"
      : type === "error"
        ? "text-danger"
        : type === "info"
          ? "text-warning"
          : type === "dim"
            ? "text-[#e8e8ed]"
            : "text-accent";
  return (
    <div className="flex gap-2">
      <span className="text-muted shrink-0">{label}</span>
      <span className={`${colorClass} break-all`}>{value}</span>
    </div>
  );
}

function StepCard({
  num,
  title,
  desc,
  active,
  completed,
  children,
}: {
  num: number;
  title: string;
  desc: string;
  active: boolean;
  completed: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`bg-card border rounded-[10px] p-5 transition-all duration-300 ${
        active
          ? "border-accent shadow-[0_0_24px_var(--color-accent-dim),inset_0_0_24px_var(--color-accent-dim)]"
          : completed
            ? "border-[#1a3a2a]"
            : "border-border"
      }`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className={`w-[26px] h-[26px] border-[1.5px] rounded-md flex items-center justify-center font-mono text-[11px] font-semibold transition-all duration-300 ${
            completed
              ? "bg-accent text-[#0a0a0c] border-accent"
              : "border-border-active text-dim"
          }`}
        >
          {completed ? "✓" : `0${num}`}
        </div>
        <h3 className="font-mono text-sm font-medium text-[#e8e8ed]">
          {title}
        </h3>
      </div>
      <p className="text-[13px] text-dim font-light leading-relaxed mb-4">
        {desc}
      </p>
      {children}
    </div>
  );
}

function OutputBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-input border border-border rounded-md p-3 mt-3 font-mono text-[11px] leading-[1.8] overflow-x-auto animate-[fadeIn_0.4s_ease-out]">
      {children}
    </div>
  );
}

export default function App() {
  const [step, setStep] = useState(1);
  const [rootKey, setRootKey] = useState("");

  const [keys, setKeys] = useState<KeygenResult | null>(null);
  const [stealth, setStealth] = useState<StealthResult | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [derive, setDerive] = useState<DeriveResult | null>(null);
  const [error, setError] = useState("");

  const handleGenerate = () => {
    setError("");
    if (!rootKey.match(/^0x[a-fA-F0-9]{64}$/)) {
      setError("Invalid key — enter a 64-char hex string with 0x prefix");
      return;
    }
    try {
      const result = generateKeys(rootKey as `0x${string}`);
      setKeys(result);
      setStep(2);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleCompute = () => {
    if (!keys) return;
    try {
      const result = computeStealth(keys.spendingPubKey, keys.viewingPubKey);
      setStealth(result);
      setStep(3);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleScan = () => {
    if (!keys || !stealth) return;
    try {
      const result = scanPayment(
        stealth.ephemeralPubKey,
        keys.viewingKey,
        keys.spendingPubKey,
        stealth.stealthAddress
      );
      setScan(result);
      if (result.match) setStep(4);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDerive = () => {
    if (!keys || !stealth) return;
    try {
      const result = deriveStealthKey(
        stealth.ephemeralPubKey,
        keys.spendingKey,
        keys.viewingKey,
        stealth.stealthAddress
      );
      setDerive(result);
      if (result.valid) setStep(5);
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="min-h-screen pb-16">
      {/* Header */}
      <div className="max-w-[960px] mx-auto px-5 pt-8">
        <div className="flex items-center gap-3 mb-1.5">
          <div className="w-7 h-7 border-2 border-accent rounded-md flex items-center justify-center text-accent font-mono text-sm font-bold shadow-[0_0_12px_var(--color-accent-glow)]">
            S
          </div>
          <h1 className="font-mono text-lg font-semibold tracking-tight text-[#e8e8ed]">
            stealth<span className="text-accent">pay</span>
          </h1>
        </div>
        <p className="text-[13px] text-dim font-light tracking-wide mb-6">
          private stablecoin payments on tempo — live demo
        </p>
      </div>

      {/* Main */}
      <div className="max-w-[960px] mx-auto px-5">
        <FlowDiagram activeStep={step} />

        <div className="space-y-3">
          {/* Step 1: Keygen */}
          <StepCard
            num={1}
            title="Generate Stealth Keys"
            desc="Create a spending + viewing key pair. The meta-address is your public stealth identity — share it with anyone."
            active={step === 1}
            completed={step > 1}
          >
            <div className="mb-3">
              <label className="block font-mono text-[10px] text-muted uppercase tracking-wider mb-1.5">
                Root Private Key
              </label>
              <input
                type="text"
                value={rootKey}
                onChange={(e) => setRootKey(e.target.value)}
                placeholder="0x... (any 32-byte hex key)"
                className="w-full bg-input border border-border rounded-md px-3 py-2 text-[#e8e8ed] font-mono text-xs outline-none focus:border-accent transition-colors placeholder:text-muted"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setRootKey(randomKey())}
                className="border border-accent text-accent font-mono text-xs px-4 py-2 rounded-md hover:bg-accent hover:text-[#0a0a0c] hover:shadow-[0_0_16px_var(--color-accent-glow)] transition-all cursor-pointer"
              >
                Generate Random
              </button>
              <button
                onClick={handleGenerate}
                className="border border-accent text-accent font-mono text-xs px-4 py-2 rounded-md hover:bg-accent hover:text-[#0a0a0c] hover:shadow-[0_0_16px_var(--color-accent-glow)] transition-all cursor-pointer"
              >
                Derive Keys
              </button>
            </div>
            {error && step === 1 && (
              <div className="mt-3 font-mono text-[11px] text-danger">
                ✗ {error}
              </div>
            )}
            {keys && (
              <OutputBlock>
                <OutputLine
                  label="spending key"
                  value={truncate(keys.spendingKey, 12)}
                  type="dim"
                />
                <OutputLine
                  label="viewing key "
                  value={truncate(keys.viewingKey, 12)}
                  type="dim"
                />
                <OutputLine
                  label="spending pub"
                  value={truncate(keys.spendingPubKey, 12)}
                />
                <OutputLine
                  label="viewing pub "
                  value={truncate(keys.viewingPubKey, 12)}
                />
                <div className="mt-2 pt-2 border-t border-border">
                  <OutputLine
                    label="meta-address"
                    value={truncate(keys.metaAddress, 16)}
                  />
                </div>
                <div className="mt-1 text-warning text-[10px]">
                  ↑ share this publicly — anyone can send you stealth payments
                </div>
              </OutputBlock>
            )}
          </StepCard>

          {/* Step 2: Compute */}
          <StepCard
            num={2}
            title="Compute Stealth Address"
            desc="The sender uses your meta-address to compute a one-time stealth address. Each payment creates a unique address — unlinkable to your identity."
            active={step === 2}
            completed={step > 2}
          >
            <button
              onClick={handleCompute}
              disabled={step < 2}
              className="border border-accent text-accent font-mono text-xs px-4 py-2 rounded-md hover:bg-accent hover:text-[#0a0a0c] hover:shadow-[0_0_16px_var(--color-accent-glow)] transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-accent disabled:hover:shadow-none cursor-pointer"
            >
              Compute Stealth Address
            </button>
            {stealth && (
              <OutputBlock>
                <OutputLine
                  label="ephemeral key  "
                  value={truncate(stealth.ephemeralPubKey, 12)}
                  type="dim"
                />
                <OutputLine
                  label="shared secret  "
                  value={truncate(stealth.sharedSecretHash, 12)}
                  type="dim"
                />
                <OutputLine
                  label="view tag       "
                  value={`${stealth.viewTag} (0x${stealth.viewTag.toString(16).padStart(2, "0")})`}
                />
                <div className="mt-2 pt-2 border-t border-border">
                  <OutputLine
                    label="stealth address"
                    value={stealth.stealthAddress}
                  />
                </div>
                <div className="mt-1 text-warning text-[10px]">
                  ↑ send tokens here — this address is unlinkable to the
                  recipient
                </div>
              </OutputBlock>
            )}
          </StepCard>

          {/* Step 3: Scan */}
          <StepCard
            num={3}
            title="Scan & Detect Payment"
            desc="The recipient scans announcements using only the viewing key. No spending authority needed — the scanner can detect but never spend."
            active={step === 3}
            completed={step > 3}
          >
            <button
              onClick={handleScan}
              disabled={step < 3}
              className="border border-accent text-accent font-mono text-xs px-4 py-2 rounded-md hover:bg-accent hover:text-[#0a0a0c] hover:shadow-[0_0_16px_var(--color-accent-glow)] transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-accent disabled:hover:shadow-none cursor-pointer"
            >
              Scan for Payment
            </button>
            {scan && (
              <OutputBlock>
                <div className="text-muted text-[10px] mb-2">
                  scanning with viewing key only (no spending authority)
                </div>
                <OutputLine
                  label="view tag check "
                  value={
                    scan.viewTag === stealth?.viewTag
                      ? `✓ MATCH (${scan.viewTag} == ${stealth?.viewTag})`
                      : `✗ MISMATCH`
                  }
                  type={
                    scan.viewTag === stealth?.viewTag ? "accent" : "error"
                  }
                />
                <OutputLine
                  label="expected addr  "
                  value={scan.expectedAddress}
                  type="dim"
                />
                <OutputLine
                  label="announced addr "
                  value={stealth?.stealthAddress ?? ""}
                  type="dim"
                />
                <OutputLine
                  label="address match  "
                  value={scan.match ? "✓ PAYMENT DETECTED" : "✗ NOT OURS"}
                  type={scan.match ? "accent" : "error"}
                />
                {scan.match && (
                  <div className="mt-2 pt-2 border-t border-border text-accent text-[10px]">
                    ▶ this payment belongs to us — proceed to derive stealth
                    key
                  </div>
                )}
              </OutputBlock>
            )}
          </StepCard>

          {/* Step 4: Derive */}
          <StepCard
            num={4}
            title="Derive Key & Sweep"
            desc="Derive the stealth private key using spending + viewing keys. Only the rightful recipient can compute this — proving the payment is theirs."
            active={step === 4}
            completed={step > 4}
          >
            <button
              onClick={handleDerive}
              disabled={step < 4}
              className="border border-accent text-accent font-mono text-xs px-4 py-2 rounded-md hover:bg-accent hover:text-[#0a0a0c] hover:shadow-[0_0_16px_var(--color-accent-glow)] transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-accent disabled:hover:shadow-none cursor-pointer"
            >
              Derive Stealth Key
            </button>
            {derive && (
              <OutputBlock>
                <OutputLine
                  label="stealth privkey"
                  value={truncate(derive.stealthPrivKey, 12)}
                  type="dim"
                />
                <OutputLine
                  label="derived address"
                  value={derive.derivedAddress}
                />
                <OutputLine
                  label="expected addr  "
                  value={stealth?.stealthAddress ?? ""}
                />
                <OutputLine
                  label="verification   "
                  value={derive.valid ? "✓ KEY IS VALID" : "✗ MISMATCH"}
                  type={derive.valid ? "accent" : "error"}
                />
                {derive.valid && (
                  <div className="mt-2 pt-2 border-t border-border space-y-0.5">
                    <div className="text-accent text-[10px]">
                      ▶ stealth private key derived successfully
                    </div>
                    <div className="text-accent text-[10px]">
                      ▶ this key controls the stealth address
                    </div>
                    <div className="text-accent text-[10px]">
                      ▶ use it to sweep funds to your real wallet
                    </div>
                    <div className="mt-2 text-muted text-[10px]">
                      math: stealthKey = spendingKey + keccak256(viewingKey ×
                      ephemeralPub) mod n
                    </div>
                  </div>
                )}
              </OutputBlock>
            )}
          </StepCard>
        </div>
      </div>

      {/* Status bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border px-5 py-2 flex items-center justify-between font-mono text-[11px] text-muted z-50">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_6px_var(--color-accent)] animate-pulse" />
          <span>tempo moderato testnet</span>
          <span className="text-muted">•</span>
          <span>chain 42431</span>
        </div>
        <div className="hidden sm:flex items-center gap-1">
          <span className="text-muted">registry</span>
          <span className="text-dim">0x8B73...0aA4</span>
          <span className="text-muted mx-2">•</span>
          <span className="text-muted">announcer</span>
          <span className="text-dim">0x01A1...4A88</span>
        </div>
      </div>
    </div>
  );
}
