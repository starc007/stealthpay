import { http, createConfig } from "wagmi";
import { tempoModerato } from "viem/chains";
import { metaMask } from "wagmi/connectors";
import { webAuthn, KeyManager } from "wagmi/tempo";

export { tempoModerato };

export const wagmiConfig = createConfig({
  chains: [tempoModerato],
  connectors: [
    webAuthn({
      keyManager: KeyManager.localStorage(),
    }),
    metaMask(),
  ],
  multiInjectedProviderDiscovery: true,
  transports: {
    [tempoModerato.id]: http(),
  },
});

export const REGISTRY_ADDRESS = "0x8B73CFf4d49e43A8A2ecf6293807a9499c680aA4";
export const ANNOUNCER_ADDRESS = "0x01A1b9dAF1B98e6037AdDFf95639DBfA907A4A88";
