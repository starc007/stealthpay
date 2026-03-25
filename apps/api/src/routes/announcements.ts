import { Hono } from "hono";
import { type Client } from "@libsql/client";

const announcements = new Hono<{ Variables: { db: Client } }>();

/**
 * GET /announcements
 *
 * Public feed of recent stealth address announcements.
 * Query params:
 *   - limit: max results (default 50, max 500)
 *   - from_block: only announcements from this block onwards
 */
announcements.get("/", async (c) => {
  const db = c.get("db");
  const limit = Math.min(Number(c.req.query("limit") || 50), 500);
  const fromBlock = Number(c.req.query("from_block") || 0);

  const result = await db.execute({
    sql: `SELECT
            scheme_id,
            stealth_address,
            caller,
            ephemeral_pub_key,
            metadata,
            view_tag,
            block_number,
            tx_hash,
            indexed_at
          FROM announcements
          WHERE block_number >= ?
          ORDER BY block_number DESC
          LIMIT ?`,
    args: [fromBlock, limit],
  });

  return c.json({
    ok: true,
    count: result.rows.length,
    announcements: result.rows.map((row) => ({
      schemeId: row.scheme_id,
      stealthAddress: row.stealth_address,
      caller: row.caller,
      ephemeralPubKey: row.ephemeral_pub_key,
      metadata: row.metadata,
      viewTag: row.view_tag,
      blockNumber: row.block_number,
      txHash: row.tx_hash,
      indexedAt: row.indexed_at,
    })),
  });
});

export default announcements;
