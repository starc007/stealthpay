import { useState } from "react";
import { useAccount } from "wagmi";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { ConnectWallet } from "./components/ConnectWallet";
import { GenerateKeys } from "./components/GenerateKeys";
import { SendPayment } from "./components/SendPayment";
import { ScanSweep } from "./components/ScanSweep";
import { Redeem } from "./components/Redeem";
import { WalletHeader } from "./components/WalletHeader";

type Tab = "receive" | "send" | "scan" | "redeem";

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={`flex-1 font-mono text-sm py-2 rounded-md transition-all cursor-pointer ${
        active
          ? "bg-accent/10 text-accent border border-accent/20"
          : "text-muted hover:text-dim border border-transparent"
      }`}
    >
      {children}
    </button>
  );
}

function Dashboard() {
  const [tab, setTab] = useState<Tab>("receive");

  return (
    <div className="space-y-6">
      <WalletHeader />

      <div className="flex gap-1 bg-card border border-border rounded-lg p-1">
        <TabButton active={tab === "receive"} onClick={() => setTab("receive")}>
          Receive
        </TabButton>
        <TabButton active={tab === "send"} onClick={() => setTab("send")}>
          Send
        </TabButton>
        <TabButton active={tab === "scan"} onClick={() => setTab("scan")}>
          Scan
        </TabButton>
        <TabButton active={tab === "redeem"} onClick={() => setTab("redeem")}>
          Redeem
        </TabButton>
      </div>

      {tab === "receive" && <GenerateKeys />}
      {tab === "send" && <SendPayment />}
      {tab === "scan" && <ScanSweep />}
      {tab === "redeem" && <Redeem />}
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
