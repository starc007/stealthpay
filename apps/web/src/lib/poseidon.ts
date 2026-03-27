let poseidonInstance: any = null;

async function getPoseidon() {
  if (!poseidonInstance) {
    // Ensure Buffer polyfill is available before loading circomlibjs
    if (typeof globalThis.Buffer === "undefined") {
      const { Buffer } = await import("buffer");
      globalThis.Buffer = Buffer;
    }
    const { buildPoseidon } = await import("circomlibjs");
    poseidonInstance = await buildPoseidon();
  }
  return poseidonInstance;
}

/** Poseidon hash of 2 inputs (returns bigint) */
export async function poseidon2(a: bigint, b: bigint): Promise<bigint> {
  const poseidon = await getPoseidon();
  const hash = poseidon([a, b]);
  return poseidon.F.toObject(hash);
}

/** Poseidon hash of 5 inputs (returns bigint) */
export async function poseidon5(
  a: bigint,
  b: bigint,
  c: bigint,
  d: bigint,
  e: bigint
): Promise<bigint> {
  const poseidon = await getPoseidon();
  const hash = poseidon([a, b, c, d, e]);
  return poseidon.F.toObject(hash);
}

/** Generate a random field element (< BN254 scalar field order) */
export function randomFieldElement(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let n = 0n;
  for (const b of bytes) {
    n = (n << 8n) | BigInt(b);
  }
  const FIELD_ORDER =
    21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  return n % FIELD_ORDER;
}
