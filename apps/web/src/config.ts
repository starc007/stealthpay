import { QueryClient } from "@tanstack/react-query";
import { tempoModerato } from "viem/chains";
import { createConfig, http } from "wagmi";
import { KeyManager, webAuthn } from "wagmi/tempo";

export const PATHUSD = "0x20c0000000000000000000000000000000000000";

export const queryClient = new QueryClient();

export const wagmiConfig = createConfig({
  connectors: [
    webAuthn({
      keyManager: KeyManager.localStorage(),
    }),
  ],
  chains: [tempoModerato.extend({ feeToken: PATHUSD })],
  multiInjectedProviderDiscovery: true,
  transports: {
    [tempoModerato.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

export const REGISTRY_ADDRESS = "0x8B73CFf4d49e43A8A2ecf6293807a9499c680aA4";
export const ANNOUNCER_ADDRESS = "0x01A1b9dAF1B98e6037AdDFf95639DBfA907A4A88";
