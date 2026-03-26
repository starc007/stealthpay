// ── Key Generation ───────────────────────────────
export {
  generateStealthKeys,
  generateStealthKeysFromSignature,
  STEALTH_KEY_MESSAGE,
  parseMetaAddress,
  type StealthMetaAddress,
  type StealthKeys,
} from "./keygen";

// ── Sender (compute stealth address) ────────────
export {
  computeStealthAddress,
  computeStealthAddressWithKey,
  type StealthAddressResult,
} from "./sender";

// ── Receiver (check + derive stealth key) ────────
export {
  checkStealthAddress,
  scanStealthAddress,
} from "./receiver";

// ── Sweep (recover funds) ────────────────────────
export {
  sweepStealthAddress,
  sweepAllFromStealthAddress,
  type SweepParams,
  type SweepResult,
} from "./sweep";

// ── Privacy Pool (deposit + ZK withdraw) ─────────
export {
  depositToPool,
  withdrawFromPool,
  getPoolRoot,
  getPoolDeposits,
  type PoolDepositParams,
  type PoolDepositResult,
  type PoolWithdrawParams,
  type PoolWithdrawResult,
  type NoteInputs,
} from "./pool";
