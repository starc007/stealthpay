import { Hono } from "hono";
import { type Client } from "@libsql/client";
import {
  checkStealthAddress,
  sweepStealthAddress,
} from "stealthpay-tempo";
import {
  createPublicClient,
  http,
  parseAbi,
  type Address,
  type Chain,
} from "viem";

const sweep = new Hono<{
  Variables: {
    db: Client;
    rpcUrl: string;
    chain: Chain;
  };
}>();

const erc20Abi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);

/**
 * POST /sweep
 *
 * Sweep all pending stealth payments to a destination address.
 * User must provide their spending key to derive stealth private keys.
 *
 * Body: {
 *   address: string,       // registered EOA address
 *   spendingKey: string,   // 32-byte spending private key
 *   destination: string,   // where to send swept funds
 *   tokenAddress: string,  // TIP-20 token to sweep
 * }
 */
sweep.post("/", async (c) => {
  const db = c.get("db");
  const rpcUrl = c.get("rpcUrl");
  const chain = c.get("chain");
  const body = await c.req.json();

  const { address, spendingKey, destination, tokenAddress } = body;

  if (!address || !spendingKey || !destination || !tokenAddress) {
    return c.json(
      { error: "Missing required fields: address, spendingKey, destination, tokenAddress" },
      400
    );
  }

  // Get registration + viewing key
  const reg = await db.execute({
    sql: "SELECT id, viewing_key FROM registrations WHERE address = ?",
    args: [address.toLowerCase()],
  });

  if (reg.rows.length === 0) {
    return c.json({ error: "Address not registered" }, 404);
  }

  const registrationId = reg.rows[0].id;
  const viewingKey = reg.rows[0].viewing_key as string;

  // Get pending payments
  const payments = await db.execute({
    sql: `SELECT mp.id, mp.stealth_address, a.ephemeral_pub_key
          FROM matched_payments mp
          JOIN announcements a ON a.id = mp.announcement_id
          WHERE mp.registration_id = ? AND mp.status = 'pending'`,
    args: [registrationId],
  });

  if (payments.rows.length === 0) {
    return c.json({ ok: true, message: "No pending payments to sweep", swept: [] });
  }

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  const results: Array<{
    stealthAddress: string;
    txHash: string;
    amount: string;
  }> = [];

  const errors: Array<{
    stealthAddress: string;
    error: string;
  }> = [];

  for (const payment of payments.rows) {
    const stealthAddr = payment.stealth_address as string;
    const ephemeralPubKey = payment.ephemeral_pub_key as string;
    const paymentId = payment.id;

    try {
      // Derive stealth private key
      const stealthPrivKey = checkStealthAddress(
        ephemeralPubKey as `0x${string}`,
        spendingKey as `0x${string}`,
        viewingKey as `0x${string}`,
        stealthAddr as `0x${string}`
      );

      if (!stealthPrivKey) {
        errors.push({ stealthAddress: stealthAddr, error: "Could not derive stealth key" });
        continue;
      }

      // Check token balance at stealth address
      const balance = await publicClient.readContract({
        address: tokenAddress as Address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [stealthAddr as Address],
      });

      if (balance === 0n) {
        // Mark as swept (no balance)
        await db.execute({
          sql: "UPDATE matched_payments SET status = 'empty' WHERE id = ?",
          args: [paymentId],
        });
        continue;
      }

      // Sweep tokens
      const result = await sweepStealthAddress({
        stealthPrivKey,
        tokenAddress: tokenAddress as Address,
        amount: balance,
        destination: destination as Address,
        rpcUrl,
        chain,
      });

      // Mark as swept
      await db.execute({
        sql: "UPDATE matched_payments SET status = 'swept', sweep_tx_hash = ? WHERE id = ?",
        args: [result.txHash, paymentId],
      });

      results.push({
        stealthAddress: stealthAddr,
        txHash: result.txHash,
        amount: balance.toString(),
      });
    } catch (err: any) {
      errors.push({ stealthAddress: stealthAddr, error: err.message });
    }
  }

  return c.json({
    ok: true,
    swept: results,
    errors: errors.length > 0 ? errors : undefined,
    totalSwept: results.length,
    totalErrors: errors.length,
  });
});

export default sweep;
