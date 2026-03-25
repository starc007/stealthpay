import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createDb, initDb } from "./db/index";
import { scanBlocks } from "./scanner/index";
import registerRoute from "./routes/register";
import scanRoute from "./routes/scan";
import sweepRoute from "./routes/sweep";
import announcementsRoute from "./routes/announcements";
import type { Client } from "@libsql/client";
import type { Chain } from "viem";

// ── Config ───────────────────────────────────────

const DB_URL = process.env.DATABASE_URL || "file:local.db";
const DB_AUTH_TOKEN = process.env.DATABASE_AUTH_TOKEN;
const RPC_URL = process.env.RPC_URL || "https://rpc.tempo.xyz/testnet";
const ANNOUNCER_ADDRESS = process.env.ANNOUNCER_ADDRESS || "0x";
const PORT = Number(process.env.PORT || 3000);
const SCAN_INTERVAL_MS = Number(process.env.SCAN_INTERVAL_MS || 10_000);

// Tempo chain config placeholder — update with actual chain config
const tempoChain: Chain = {
  id: 1996, // Tempo testnet chain ID — update as needed
  name: "Tempo Testnet",
  nativeCurrency: { name: "TEMPO", symbol: "TEMPO", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
};

// ── App ──────────────────────────────────────────

const app = new Hono<{
  Variables: {
    db: Client;
    rpcUrl: string;
    chain: Chain;
  };
}>();

app.use("*", logger());
app.use("*", cors());

// Initialize DB
const db = createDb(DB_URL, DB_AUTH_TOKEN);

// Inject DB and config into context
app.use("*", async (c, next) => {
  c.set("db", db);
  c.set("rpcUrl", RPC_URL);
  c.set("chain", tempoChain);
  await next();
});

// ── Routes ───────────────────────────────────────

app.get("/", (c) => {
  return c.json({
    name: "StealthPay API",
    version: "0.1.0",
    routes: [
      "POST /register",
      "POST /scan",
      "POST /sweep",
      "GET /announcements",
    ],
  });
});

app.route("/register", registerRoute);
app.route("/scan", scanRoute);
app.route("/sweep", sweepRoute);
app.route("/announcements", announcementsRoute);

// Health check
app.get("/health", (c) => c.json({ ok: true }));

// ── Start ────────────────────────────────────────

async function main() {
  // Init database tables
  await initDb(db);
  console.log("Database initialized");

  // Start background scanner (only if announcer address is configured)
  if (ANNOUNCER_ADDRESS !== "0x") {
    console.log(`Starting scanner (interval: ${SCAN_INTERVAL_MS}ms)`);
    console.log(`Announcer: ${ANNOUNCER_ADDRESS}`);

    const runScanner = async () => {
      try {
        const matches = await scanBlocks({
          rpcUrl: RPC_URL,
          announcerAddress: ANNOUNCER_ADDRESS as `0x${string}`,
          db,
        });
        if (matches > 0) {
          console.log(`Scanner found ${matches} new matches`);
        }
      } catch (err) {
        console.error("Scanner error:", err);
      }
    };

    // Initial scan
    await runScanner();

    // Periodic scanning
    setInterval(runScanner, SCAN_INTERVAL_MS);
  } else {
    console.log("Scanner disabled — set ANNOUNCER_ADDRESS to enable");
  }

  console.log(`StealthPay API running on port ${PORT}`);
}

main().catch(console.error);

export default {
  port: PORT,
  fetch: app.fetch,
};
