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
    announcerAddress: (process.env.ANNOUNCER_ADDRESS || "0x") as `0x${string}`,
  },

  mpp: {
    secretKey: process.env.MPP_SECRET_KEY || "",
    recipient: (process.env.MPP_RECIPIENT || "0x") as `0x${string}`,
    pathUsdAddress: "0x20c0000000000000000000000000000000000000" as `0x${string}`,
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
  nativeCurrency: { name: "TEMPO", symbol: "TEMPO", decimals: 18 },
  rpcUrls: {
    default: { http: [config.rpc.url] },
  },
};
