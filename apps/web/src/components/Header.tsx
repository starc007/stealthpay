export function Header() {
  return (
    <header className="border-b border-border">
      <div className="max-w-lg mx-auto px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 border-2 border-accent rounded-md flex items-center justify-center text-accent font-mono text-xs font-bold shadow-[0_0_12px_var(--color-accent-glow)]">
            S
          </div>
          <span className="font-mono text-sm font-semibold tracking-tight text-[#e8e8ed]">
            stealth<span className="text-accent">pay</span>
          </span>
        </div>
        <span className="font-mono text-[10px] text-muted">tempo testnet</span>
      </div>
    </header>
  );
}
