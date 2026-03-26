import { useAccount } from "wagmi";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { ConnectWallet } from "./components/ConnectWallet";
import { GenerateKeys } from "./components/GenerateKeys";

export default function App() {
  const account = useAccount();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-lg mx-auto w-full px-5 py-8">
        {account.isConnected ? <GenerateKeys /> : <ConnectWallet />}
      </main>
      <Footer />
    </div>
  );
}
