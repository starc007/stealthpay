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

export const EXPLORER_URL = "https://explore.testnet.tempo.xyz";

export const CONTRACTS = {
  registry: "0x8B73CFf4d49e43A8A2ecf6293807a9499c680aA4" as `0x${string}`,
  announcer: "0x01A1b9dAF1B98e6037AdDFf95639DBfA907A4A88" as `0x${string}`,
  pool: "0xF09BaF55940346C84E439F836Dd686A3102D1cF3" as `0x${string}`,
  verifier: "0x6a701f74126f0D3cED8b1BD85fb9CF0DDd08C371" as `0x${string}`,
  poseidonT3: "0x5029d3168dC40ed0543f4444B386Fa1E8B9ac5a0" as `0x${string}`,
  poseidonT6: "0x845D9Cb9C57AAd0E878783BeA7387209a4DC38C4" as `0x${string}`,
} as const;

// Backwards compat exports
export const REGISTRY_ADDRESS = CONTRACTS.registry;
export const ANNOUNCER_ADDRESS = CONTRACTS.announcer;
export const POOL_ADDRESS = CONTRACTS.pool;
