export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="max-w-lg mx-auto px-5 py-3 flex items-center justify-between font-mono text-[10px] text-muted">
        <span>private payments on tempo</span>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_4px_var(--color-accent)] animate-pulse" />
          <span>chain 42431</span>
        </div>
      </div>
    </footer>
  );
}
