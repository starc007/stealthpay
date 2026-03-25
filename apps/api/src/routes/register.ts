import { Hono } from "hono";
import { type Client } from "@libsql/client";
import { parseMetaAddress } from "stealthpay-tempo";

const register = new Hono<{ Variables: { db: Client } }>();

/**
 * POST /register
 *
 * Register a stealth meta-address + viewing key for scanner service.
 * The viewing key is needed server-side to scan on behalf of the user.
 *
 * Body: {
 *   address: string,        // user's EOA address
 *   stealthMetaAddress: string, // 66-byte encoded meta-address (hex)
 *   viewingKey: string,     // 32-byte private viewing key (hex)
 *   schemeId?: number       // default 1 (secp256k1)
 * }
 */
register.post("/", async (c) => {
  const db = c.get("db");
  const body = await c.req.json();

  const { address, stealthMetaAddress, viewingKey, schemeId = 1 } = body;

  if (!address || !stealthMetaAddress || !viewingKey) {
    return c.json({ error: "Missing required fields: address, stealthMetaAddress, viewingKey" }, 400);
  }

  // Parse and validate meta-address
  try {
    const meta = parseMetaAddress(stealthMetaAddress as `0x${string}`);

    await db.execute({
      sql: `INSERT OR REPLACE INTO registrations
            (address, scheme_id, stealth_meta_address, viewing_key, spending_pub_key, viewing_pub_key)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        address.toLowerCase(),
        schemeId,
        stealthMetaAddress,
        viewingKey,
        meta.spendingPubKey,
        meta.viewingPubKey,
      ],
    });

    return c.json({
      ok: true,
      message: "Stealth meta-address registered for scanning",
      address: address.toLowerCase(),
      schemeId,
    });
  } catch (err: any) {
    return c.json({ error: `Invalid meta-address: ${err.message}` }, 400);
  }
});

export default register;
