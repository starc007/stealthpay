#!/bin/bash
set -e

# ── StealthPay Full Deployment Script ─────────────
#
# Deploys all contracts to Tempo testnet:
# 1. StealthRegistry (EIP-6538)
# 2. StealthAnnouncer (EIP-5564)
# 3. PoseidonT3 library
# 4. PoseidonT6 library
# 5. Groth16Verifier
# 6. StealthPool (linked with Poseidon + Verifier)
#
# Prerequisites:
#   - foundryup -n tempo (Tempo Foundry fork)
#   - Funded deployer wallet
#
# Usage:
#   cd packages/contracts
#   PRIVATE_KEY=0x... ./script/DeployAll.sh

RPC_URL="${RPC_URL:-https://rpc.moderato.tempo.xyz}"

if [ -z "$PRIVATE_KEY" ]; then
  echo "Error: PRIVATE_KEY not set"
  echo "Usage: PRIVATE_KEY=0x... ./script/DeployAll.sh"
  exit 1
fi

echo "═══════════════════════════════════════════════"
echo "  StealthPay — Full Deployment"
echo "  RPC: $RPC_URL"
echo "═══════════════════════════════════════════════"
echo ""

DEPLOYER=$(cast wallet address $PRIVATE_KEY 2>/dev/null || echo "unknown")
echo "Deployer: $DEPLOYER"
echo ""

# ── 1. StealthRegistry ───────────────────────────
echo "[1/6] Deploying StealthRegistry..."
REGISTRY=$(forge create src/StealthRegistry.sol:StealthRegistry \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --json 2>/dev/null | jq -r '.deployedTo')
echo "  StealthRegistry: $REGISTRY"

# ── 2. StealthAnnouncer ──────────────────────────
echo "[2/6] Deploying StealthAnnouncer..."
ANNOUNCER=$(forge create src/StealthAnnouncer.sol:StealthAnnouncer \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --json 2>/dev/null | jq -r '.deployedTo')
echo "  StealthAnnouncer: $ANNOUNCER"

# ── 3. PoseidonT3 ────────────────────────────────
echo "[3/6] Deploying PoseidonT3..."
POSEIDON_T3=$(forge create lib/poseidon-solidity/contracts/PoseidonT3.sol:PoseidonT3 \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --json 2>/dev/null | jq -r '.deployedTo')
echo "  PoseidonT3: $POSEIDON_T3"

# ── 4. PoseidonT6 ────────────────────────────────
echo "[4/6] Deploying PoseidonT6..."
POSEIDON_T6=$(forge create lib/poseidon-solidity/contracts/PoseidonT6.sol:PoseidonT6 \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --json 2>/dev/null | jq -r '.deployedTo')
echo "  PoseidonT6: $POSEIDON_T6"

# ── 5. Groth16Verifier ───────────────────────────
echo "[5/6] Deploying Groth16Verifier..."
VERIFIER=$(forge create src/Groth16Verifier.sol:Groth16Verifier \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --json 2>/dev/null | jq -r '.deployedTo')
echo "  Groth16Verifier: $VERIFIER"

# ── 6. StealthPool ───────────────────────────────
echo "[6/6] Deploying StealthPool..."
POOL=$(forge create src/StealthPool.sol:StealthPool \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --libraries lib/poseidon-solidity/contracts/PoseidonT3.sol:PoseidonT3:$POSEIDON_T3 \
  --libraries lib/poseidon-solidity/contracts/PoseidonT6.sol:PoseidonT6:$POSEIDON_T6 \
  --constructor-args $VERIFIER \
  --json 2>/dev/null | jq -r '.deployedTo')
echo "  StealthPool: $POOL"

# ── Summary ───────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
echo "  Deployment Complete"
echo "═══════════════════════════════════════════════"
echo ""
echo "  StealthRegistry:  $REGISTRY"
echo "  StealthAnnouncer: $ANNOUNCER"
echo "  PoseidonT3:       $POSEIDON_T3"
echo "  PoseidonT6:       $POSEIDON_T6"
echo "  Groth16Verifier:  $VERIFIER"
echo "  StealthPool:      $POOL"
echo ""

# Save to env file
ENV_FILE="../../.env.deployed"
cat > $ENV_FILE <<EOL
# StealthPay Deployed Contracts
# Chain: Tempo Moderato Testnet (42431)
# Deployed: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Deployer: $DEPLOYER

REGISTRY_ADDRESS=$REGISTRY
ANNOUNCER_ADDRESS=$ANNOUNCER
POSEIDON_T3_ADDRESS=$POSEIDON_T3
POSEIDON_T6_ADDRESS=$POSEIDON_T6
VERIFIER_ADDRESS=$VERIFIER
POOL_ADDRESS=$POOL
EOL

echo "  Saved to $ENV_FILE"
