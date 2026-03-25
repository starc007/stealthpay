import type { Chain } from "viem";

// ── Environment Variables ────────────────────────

export const config = {
  db: {
    url: process.env.DATABASE_URL || "file:local.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },

  rpc: {
    url: process.env.RPC_URL || "https://rpc.moderato.tempo.xyz",
  },

  contracts: {
    registryAddress: (process.env.REGISTRY_ADDRESS ||
      "0x8B73CFf4d49e43A8A2ecf6293807a9499c680aA4") as `0x${string}`,
    announcerAddress: (process.env.ANNOUNCER_ADDRESS ||
      "0x01A1b9dAF1B98e6037AdDFf95639DBfA907A4A88") as `0x${string}`,
  },

  mpp: {
    secretKey: process.env.MPP_SECRET_KEY || "",
    recipient: (process.env.MPP_RECIPIENT || "0x") as `0x${string}`,
    pathUsdAddress:
      "0x20c0000000000000000000000000000000000000" as `0x${string}`,
    get enabled() {
      return !!this.secretKey && this.recipient !== "0x";
    },
  },

  server: {
    port: Number(process.env.PORT || 3000),
    scanIntervalMs: Number(process.env.SCAN_INTERVAL_MS || 10_000),
  },
} as const;

// ── Tempo Chain Config ───────────────────────────

export const tempoChain: Chain = {
  id: 42431, // Tempo testnet chain ID
  name: "Tempo Testnet",
  nativeCurrency: { name: "USD", symbol: "USD", decimals: 18 },
  rpcUrls: {
    default: { http: [config.rpc.url] },
  },
};
