import { Hono } from "hono";
import { type Client } from "@libsql/client";

const scan = new Hono<{ Variables: { db: Client } }>();

/**
 * POST /scan
 *
 * Get pending (unswept) stealth payments for a registered address.
 *
 * Body: {
 *   address: string  // registered EOA address
 * }
 *
 * Returns matched payments with announcement details.
 */
scan.post("/", async (c) => {
  const db = c.get("db");
  const body = await c.req.json();
  const { address } = body;

  if (!address) {
    return c.json({ error: "Missing required field: address" }, 400);
  }

  // Get registration
  const reg = await db.execute({
    sql: "SELECT id FROM registrations WHERE address = ?",
    args: [address.toLowerCase()],
  });

  if (reg.rows.length === 0) {
    return c.json({ error: "Address not registered" }, 404);
  }

  const registrationId = reg.rows[0].id;

  // Get pending matched payments with announcement details
  const payments = await db.execute({
    sql: `SELECT
            mp.id,
            mp.stealth_address,
            mp.status,
            mp.created_at,
            a.block_number,
            a.tx_hash,
            a.ephemeral_pub_key,
            a.metadata,
            a.caller
          FROM matched_payments mp
          JOIN announcements a ON a.id = mp.announcement_id
          WHERE mp.registration_id = ? AND mp.status = 'pending'
          ORDER BY a.block_number DESC`,
    args: [registrationId],
  });

  return c.json({
    ok: true,
    address: address.toLowerCase(),
    pendingCount: payments.rows.length,
    payments: payments.rows.map((row) => ({
      id: row.id,
      stealthAddress: row.stealth_address,
      blockNumber: row.block_number,
      txHash: row.tx_hash,
      ephemeralPubKey: row.ephemeral_pub_key,
      metadata: row.metadata,
      caller: row.caller,
      status: row.status,
      detectedAt: row.created_at,
    })),
  });
});

export default scan;
