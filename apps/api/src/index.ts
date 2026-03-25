import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { Mppx, tempo } from "mppx/hono";
import { config, tempoChain } from "./config";
import { createDb, initDb } from "./db/index";
import { scanBlocks } from "./scanner/index";
import registerRoute from "./routes/register";
import scanRoute from "./routes/scan";
import sweepRoute from "./routes/sweep";
import announcementsRoute from "./routes/announcements";
import type { Client } from "@libsql/client";
import type { Chain } from "viem";

// ── MPP Payment Gating ───────────────────────────

const mppx = config.mpp.enabled
  ? Mppx.create({
      secretKey: config.mpp.secretKey,
      methods: [
        tempo({
          testnet: true,
          currency: config.mpp.pathUsdAddress,
          recipient: config.mpp.recipient,
        }),
      ],
    })
  : null;

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

const db = createDb(config.db.url, config.db.authToken);

app.use("*", async (c, next) => {
  c.set("db", db);
  c.set("rpcUrl", config.rpc.url);
  c.set("chain", tempoChain);
  await next();
});

// ── Routes ───────────────────────────────────────

app.get("/", (c) => {
  return c.json({
    name: "StealthPay API",
    version: "0.1.0",
    routes: [
      "POST /register — free",
      "POST /scan — $0.001 (MPP-gated)",
      "POST /sweep — $0.01 (MPP-gated)",
      "GET /announcements — free",
    ],
  });
});

// Free routes
app.route("/register", registerRoute);
app.route("/announcements", announcementsRoute);

// MPP-gated routes
if (mppx) {
  app.use(
    "/scan",
    mppx.charge({ amount: "0.001", description: "Scan for stealth payments" }),
  );
  app.use(
    "/sweep",
    mppx.charge({ amount: "0.01", description: "Sweep stealth payments" }),
  );
}

app.route("/scan", scanRoute);
app.route("/sweep", sweepRoute);

// Health check
app.get("/health", (c) => c.json({ ok: true }));

// ── Start ────────────────────────────────────────

async function main() {
  await initDb(db);
  console.log("Database initialized");

  if (config.contracts.announcerAddress !== "0x") {
    console.log(`Starting scanner (interval: ${config.server.scanIntervalMs}ms)`);
    console.log(`Announcer: ${config.contracts.announcerAddress}`);

    const runScanner = async () => {
      try {
        const matches = await scanBlocks({
          rpcUrl: config.rpc.url,
          announcerAddress: config.contracts.announcerAddress,
          db,
        });
        if (matches > 0) {
          console.log(`Scanner found ${matches} new matches`);
        }
      } catch (err) {
        console.error("Scanner error:", err);
      }
    };

    await runScanner();
    setInterval(runScanner, config.server.scanIntervalMs);
  } else {
    console.log("Scanner disabled — set ANNOUNCER_ADDRESS to enable");
  }

  console.log(`StealthPay API running on port ${config.server.port}`);
}

main().catch(console.error);

export default {
  port: config.server.port,
  fetch: app.fetch,
};
