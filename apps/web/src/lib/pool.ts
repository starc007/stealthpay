import { poseidon2, poseidon5, randomFieldElement } from "./poseidon";

/**
 * Note secrets — the private inputs needed to generate a ZK proof later.
 * These must be stored securely by the recipient.
 */
export interface NoteSecrets {
  recipientPubKey: bigint;
  blinding: bigint;
  randomness: bigint;
  salt: bigint;
  asset: bigint;
  amount: bigint;
  noteCommitment: bigint;
  recipientCommitment: bigint;
}

/**
 * Generate note secrets and compute the note commitment for a pool deposit.
 *
 * The recipient generates these before sweeping into the pool:
 * - recipientPubKey + blinding → recipientCommitment
 * - noteCommitment = Poseidon(asset, amount, recipientCommitment, salt, randomness)
 *
 * Store the NoteSecrets — you'll need them to withdraw later.
 */
export async function createNoteSecrets(
  tokenAddress: string,
  amount: bigint
): Promise<NoteSecrets> {
  const recipientPubKey = randomFieldElement();
  const blinding = randomFieldElement();
  const randomness = randomFieldElement();
  const salt = randomFieldElement();
  const asset = BigInt(tokenAddress);

  const recipientCommitment = await poseidon2(recipientPubKey, blinding);
  const noteCommitment = await poseidon5(
    asset,
    amount,
    recipientCommitment,
    salt,
    randomness
  );

  return {
    recipientPubKey,
    blinding,
    randomness,
    salt,
    asset,
    amount,
    noteCommitment,
    recipientCommitment,
  };
}

/**
 * Compute the nullifier for a note (used to prevent double-spend).
 * nullifier = Poseidon(noteCommitment, recipientPubKey)
 */
export async function computeNullifier(
  noteCommitment: bigint,
  recipientPubKey: bigint
): Promise<bigint> {
  return poseidon2(noteCommitment, recipientPubKey);
}

/**
 * Serialize NoteSecrets to a JSON string for localStorage.
 */
export function serializeSecrets(secrets: NoteSecrets): string {
  return JSON.stringify({
    recipientPubKey: secrets.recipientPubKey.toString(),
    blinding: secrets.blinding.toString(),
    randomness: secrets.randomness.toString(),
    salt: secrets.salt.toString(),
    asset: secrets.asset.toString(),
    amount: secrets.amount.toString(),
    noteCommitment: secrets.noteCommitment.toString(),
    recipientCommitment: secrets.recipientCommitment.toString(),
  });
}

/**
 * Deserialize NoteSecrets from a JSON string.
 */
export function deserializeSecrets(json: string): NoteSecrets {
  const obj = JSON.parse(json);
  return {
    recipientPubKey: BigInt(obj.recipientPubKey),
    blinding: BigInt(obj.blinding),
    randomness: BigInt(obj.randomness),
    salt: BigInt(obj.salt),
    asset: BigInt(obj.asset),
    amount: BigInt(obj.amount),
    noteCommitment: BigInt(obj.noteCommitment),
    recipientCommitment: BigInt(obj.recipientCommitment),
  };
}

const STORAGE_KEY = "stealthpay_pool_notes";

/** Save note secrets to localStorage */
export function saveNoteToStorage(secrets: NoteSecrets, noteIndex: number) {
  const stored = localStorage.getItem(STORAGE_KEY);
  const notes: Array<{ noteIndex: number; secrets: string }> = stored
    ? JSON.parse(stored)
    : [];
  notes.push({ noteIndex, secrets: serializeSecrets(secrets) });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

/** Load all note secrets from localStorage */
export function loadNotesFromStorage(): Array<{
  noteIndex: number;
  secrets: NoteSecrets;
}> {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  const notes: Array<{ noteIndex: number; secrets: string }> = JSON.parse(stored);
  return notes.map((n) => ({
    noteIndex: n.noteIndex,
    secrets: deserializeSecrets(n.secrets),
  }));
}

/** Remove a note from localStorage after redemption */
export function removeNoteFromStorage(noteIndex: number) {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return;
  const notes: Array<{ noteIndex: number; secrets: string }> = JSON.parse(stored);
  const filtered = notes.filter((n) => n.noteIndex !== noteIndex);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}
