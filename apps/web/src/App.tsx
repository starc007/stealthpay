import { useState } from "react";
import { useAccount } from "wagmi";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { ConnectWallet } from "./components/ConnectWallet";
import { GenerateKeys } from "./components/GenerateKeys";
import { SendPayment } from "./components/SendPayment";
import { ScanSweep } from "./components/ScanSweep";
import { WalletHeader } from "./components/WalletHeader";

type Tab = "receive" | "send" | "scan";

function Dashboard() {
  const [tab, setTab] = useState<Tab>("receive");

  return (
    <div className="space-y-6">
      <WalletHeader />

      {/* Tabs */}
      <div className="flex gap-1 bg-card border border-border rounded-lg p-1">
        <button
          onClick={() => setTab("receive")}
          type="button"
          className={`flex-1 font-mono text-sm py-2 rounded-md transition-all cursor-pointer ${
            tab === "receive"
              ? "bg-accent/10 text-accent border border-accent/20"
              : "text-muted hover:text-dim border border-transparent"
          }`}
        >
          Receive
        </button>
        <button
          onClick={() => setTab("send")}
          type="button"
          className={`flex-1 font-mono text-sm py-2 rounded-md transition-all cursor-pointer ${
            tab === "send"
              ? "bg-accent/10 text-accent border border-accent/20"
              : "text-muted hover:text-dim border border-transparent"
          }`}
        >
          Send
        </button>
        <button
          onClick={() => setTab("scan")}
          type="button"
          className={`flex-1 font-mono text-sm py-2 rounded-md transition-all cursor-pointer ${
            tab === "scan"
              ? "bg-accent/10 text-accent border border-accent/20"
              : "text-muted hover:text-dim border border-transparent"
          }`}
        >
          Scan
        </button>
      </div>

      {tab === "receive" ? <GenerateKeys /> : tab === "send" ? <SendPayment /> : <ScanSweep />}
    </div>
  );
}

export default function App() {
  const account = useAccount();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-lg mx-auto w-full px-5 py-8">
        {account.isConnected ? <Dashboard /> : <ConnectWallet />}
      </main>
      <Footer />
    </div>
  );
}
