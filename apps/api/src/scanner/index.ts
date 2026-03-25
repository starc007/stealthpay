import { type Client } from "@libsql/client";
import {
  createPublicClient,
  http,
  parseAbiItem,
  type Address,
  type Log,
} from "viem";
import { scanStealthAddress } from "stealthpay-tempo";
import { getLastScannedBlock, setLastScannedBlock } from "../db/index";

const ANNOUNCEMENT_EVENT = parseAbiItem(
  "event Announcement(uint256 indexed schemeId, address indexed stealthAddress, address indexed caller, bytes ephemeralPubKey, bytes metadata)"
);

export interface ScannerConfig {
  rpcUrl: string;
  announcerAddress: Address;
  db: Client;
  /** Number of blocks to scan per batch */
  batchSize?: number;
}

interface Registration {
  id: number;
  address: string;
  viewing_key: string;
  spending_pub_key: string;
  viewing_pub_key: string;
}

/**
 * Scan new blocks for stealth announcements and match against registered users.
 */
export async function scanBlocks(config: ScannerConfig): Promise<number> {
  const { rpcUrl, announcerAddress, db, batchSize = 100 } = config;

  const client = createPublicClient({
    transport: http(rpcUrl),
  });

  const lastScanned = await getLastScannedBlock(db);
  const currentBlock = Number(await client.getBlockNumber());

  if (lastScanned >= currentBlock) {
    return 0; // Nothing new to scan
  }

  const fromBlock = BigInt(lastScanned + 1);
  const toBlock = BigInt(Math.min(lastScanned + batchSize, currentBlock));

  // Fetch announcement events
  const logs = await client.getLogs({
    address: announcerAddress,
    event: ANNOUNCEMENT_EVENT,
    fromBlock,
    toBlock,
  });

  if (logs.length === 0) {
    await setLastScannedBlock(db, Number(toBlock));
    return 0;
  }

  // Get all registered users
  const registrations = await db.execute({
    sql: "SELECT id, address, viewing_key, spending_pub_key, viewing_pub_key FROM registrations",
    args: [],
  });

  const users = registrations.rows as unknown as Registration[];

  let matchCount = 0;

  for (const log of logs) {
    const { schemeId, stealthAddress, caller } = log.args as {
      schemeId: bigint;
      stealthAddress: Address;
      caller: Address;
    };

    // Decode ephemeral pub key and metadata from log data
    const ephemeralPubKey = decodeEphemeralPubKey(log);
    const metadata = decodeMetadata(log);
    const viewTag = metadata && metadata.length > 0 ? parseInt(metadata.slice(2, 4), 16) : undefined;

    // Store announcement
    await db.execute({
      sql: `INSERT OR IGNORE INTO announcements
            (block_number, tx_hash, scheme_id, stealth_address, caller, ephemeral_pub_key, metadata, view_tag)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        Number(log.blockNumber),
        log.transactionHash,
        Number(schemeId),
        stealthAddress,
        caller,
        ephemeralPubKey,
        metadata ?? null,
        viewTag ?? null,
      ],
    });

    // Get the announcement ID
    const announcementResult = await db.execute({
      sql: "SELECT id FROM announcements WHERE tx_hash = ? AND stealth_address = ?",
      args: [log.transactionHash, stealthAddress],
    });
    const announcementId = Number(announcementResult.rows[0].id);

    // Try to match against registered users
    for (const user of users) {
      // Quick view tag filter — skip ECDH if view tag doesn't match
      if (viewTag !== undefined) {
        const scan = scanStealthAddress(
          ephemeralPubKey as `0x${string}`,
          user.viewing_key as `0x${string}`,
          user.spending_pub_key as `0x${string}`
        );

        if (scan.viewTag !== viewTag) {
          continue; // View tag mismatch — skip expensive ECDH
        }

        // View tag matches — check full address
        if (scan.expectedAddress.toLowerCase() === stealthAddress.toLowerCase()) {
          await db.execute({
            sql: `INSERT OR IGNORE INTO matched_payments
                  (registration_id, announcement_id, stealth_address, status)
                  VALUES (?, ?, ?, 'pending')`,
            args: [user.id, announcementId, stealthAddress],
          });
          matchCount++;
        }
      } else {
        // No view tag — must do full ECDH check
        const scan = scanStealthAddress(
          ephemeralPubKey as `0x${string}`,
          user.viewing_key as `0x${string}`,
          user.spending_pub_key as `0x${string}`
        );

        if (scan.expectedAddress.toLowerCase() === stealthAddress.toLowerCase()) {
          await db.execute({
            sql: `INSERT OR IGNORE INTO matched_payments
                  (registration_id, announcement_id, stealth_address, status)
                  VALUES (?, ?, ?, 'pending')`,
            args: [user.id, announcementId, stealthAddress],
          });
          matchCount++;
        }
      }
    }
  }

  await setLastScannedBlock(db, Number(toBlock));
  return matchCount;
}

// ── Log decoding helpers ─────────────────────────

function decodeEphemeralPubKey(log: Log): string {
  // ephemeralPubKey is the first non-indexed bytes parameter in the log data
  const args = (log as any).args;
  if (args?.ephemeralPubKey) return args.ephemeralPubKey;
  // Fallback: return empty
  return "0x";
}

function decodeMetadata(log: Log): string | undefined {
  const args = (log as any).args;
  if (args?.metadata) return args.metadata;
  return undefined;
}
