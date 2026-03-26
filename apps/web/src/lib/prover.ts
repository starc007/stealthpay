import { poseidon2 } from "./poseidon";
import type { NoteSecrets } from "./pool";

// Paths to circuit artifacts (served from public/)
const WASM_PATH = "/circuits/note_redeem.wasm";
const ZKEY_PATH = "/circuits/note_redeem_final.zkey";

/**
 * Build a Merkle proof for a given leaf index from the list of all note commitments.
 * Uses Poseidon(2) hashing to match the on-chain tree.
 */
export async function buildMerkleProof(
  noteCommitments: bigint[],
  leafIndex: number,
  treeDepth: number = 20
): Promise<{ pathIndices: number[]; siblings: bigint[]; root: bigint }> {
  // Build the full tree
  const maxLeaves = 1 << treeDepth;

  // Compute zero hashes
  const zeros: bigint[] = [];
  zeros[0] = await poseidon2(0n, 0n);
  for (let i = 1; i < treeDepth; i++) {
    zeros[i] = await poseidon2(zeros[i - 1], zeros[i - 1]);
  }

  // Pad leaves to power of 2 with zeros
  const leaves = [...noteCommitments];
  while (leaves.length < maxLeaves) {
    leaves.push(zeros[0]);
  }

  // Build tree level by level
  let currentLevel = leaves;
  const pathIndices: number[] = [];
  const siblings: bigint[] = [];
  let idx = leafIndex;

  for (let level = 0; level < treeDepth; level++) {
    const isRight = idx & 1;
    pathIndices.push(isRight);

    const siblingIdx = isRight ? idx - 1 : idx + 1;
    siblings.push(siblingIdx < currentLevel.length ? currentLevel[siblingIdx] : zeros[level]);

    // Build next level
    const nextLevel: bigint[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : zeros[level];
      nextLevel.push(await poseidon2(left, right));
    }
    currentLevel = nextLevel;
    idx = Math.floor(idx / 2);
  }

  return { pathIndices, siblings, root: currentLevel[0] };
}

/**
 * Generate a Groth16 proof for withdrawing from the pool.
 */
export async function generateWithdrawProof(
  secrets: NoteSecrets,
  noteCommitments: bigint[],
  noteIndex: number,
  recipientAddress: string
): Promise<{
  proof: [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
  nullifier: bigint;
  merkleRoot: bigint;
}> {
  // Dynamic import snarkjs (large library)
  const snarkjs = await import("snarkjs");

  // Build Merkle proof
  const merkle = await buildMerkleProof(noteCommitments, noteIndex);

  // Compute nullifier
  const nullifier = await poseidon2(secrets.noteCommitment, secrets.recipientPubKey);

  // Circuit inputs
  const input = {
    // Public
    nullifier: nullifier.toString(),
    merkleRoot: merkle.root.toString(),
    amount: secrets.amount.toString(),
    asset: secrets.asset.toString(),
    recipient: BigInt(recipientAddress).toString(),

    // Private
    merchantPubKey: secrets.recipientPubKey.toString(),
    blinding: secrets.blinding.toString(),
    noteRandomness: secrets.randomness.toString(),
    channelId: secrets.salt.toString(),
    pathIndices: merkle.pathIndices.map(String),
    siblings: merkle.siblings.map((s) => s.toString()),
  };

  // Generate proof
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    WASM_PATH,
    ZKEY_PATH
  );

  // Convert proof to contract format [pA[0], pA[1], pB[0][0], pB[0][1], pB[1][0], pB[1][1], pC[0], pC[1]]
  const proofFormatted: [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint] = [
    BigInt(proof.pi_a[0]),
    BigInt(proof.pi_a[1]),
    BigInt(proof.pi_b[0][1]), // Note: B point is transposed for Solidity
    BigInt(proof.pi_b[0][0]),
    BigInt(proof.pi_b[1][1]),
    BigInt(proof.pi_b[1][0]),
    BigInt(proof.pi_c[0]),
    BigInt(proof.pi_c[1]),
  ];

  return {
    proof: proofFormatted,
    nullifier,
    merkleRoot: merkle.root,
  };
}
