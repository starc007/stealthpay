import { createClient, type Client } from "@libsql/client";

export function createDb(url: string, authToken?: string): Client {
  return createClient({
    url,
    authToken,
  });
}

/**
 * Initialize database tables.
 */
export async function initDb(db: Client): Promise<void> {
  await db.batch([
    // Registered users with their stealth meta-addresses and viewing keys
    `CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address TEXT NOT NULL,
      scheme_id INTEGER NOT NULL DEFAULT 1,
      stealth_meta_address TEXT NOT NULL,
      viewing_key TEXT NOT NULL,
      spending_pub_key TEXT NOT NULL,
      viewing_pub_key TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(address, scheme_id)
    )`,

    // Announcements indexed from on-chain events
    `CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      block_number INTEGER NOT NULL,
      tx_hash TEXT NOT NULL,
      scheme_id INTEGER NOT NULL,
      stealth_address TEXT NOT NULL,
      caller TEXT NOT NULL,
      ephemeral_pub_key TEXT NOT NULL,
      metadata TEXT,
      view_tag INTEGER,
      indexed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tx_hash, stealth_address)
    )`,

    // Matched payments — stealth addresses that belong to a registered user
    `CREATE TABLE IF NOT EXISTS matched_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registration_id INTEGER NOT NULL REFERENCES registrations(id),
      announcement_id INTEGER NOT NULL REFERENCES announcements(id),
      stealth_address TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      sweep_tx_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(announcement_id, registration_id)
    )`,

    // Scanner state — tracks last scanned block
    `CREATE TABLE IF NOT EXISTS scanner_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
  ]);
}

/**
 * Get the last scanned block number.
 */
export async function getLastScannedBlock(db: Client): Promise<number> {
  const result = await db.execute({
    sql: "SELECT value FROM scanner_state WHERE key = 'last_block'",
    args: [],
  });
  if (result.rows.length === 0) return 0;
  return Number(result.rows[0].value);
}

/**
 * Update the last scanned block number.
 */
export async function setLastScannedBlock(db: Client, blockNumber: number): Promise<void> {
  await db.execute({
    sql: "INSERT OR REPLACE INTO scanner_state (key, value) VALUES ('last_block', ?)",
    args: [blockNumber.toString()],
  });
}
