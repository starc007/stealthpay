import { EXPLORER_URL } from "../config";

export function TxLink({ hash, label }: { hash: string; label?: string }) {
  const short = hash.slice(0, 10) + "..." + hash.slice(-8);
  return (
    <a
      href={`${EXPLORER_URL}/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-[11px] text-accent hover:underline break-all"
    >
      {label || short} ↗
    </a>
  );
}
