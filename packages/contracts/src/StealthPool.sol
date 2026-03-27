// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";
import {PoseidonT6} from "poseidon-solidity/PoseidonT6.sol";

/// @dev Groth16 verifier interface (same as PMPP)
interface IVerifier {
    function verifyProof(
        uint[2] calldata pA,
        uint[2][2] calldata pB,
        uint[2] calldata pC,
        uint[5] calldata pubSignals
    ) external view returns (bool);
}

/// @title StealthPool
/// @notice A privacy pool for stealth address sweeps. Stealth addresses deposit
/// tokens into this pool, and recipients withdraw via Groth16 ZK proofs —
/// breaking the on-chain link between stealth address and recipient.
contract StealthPool {

    // ================================================================
    // Constants
    // ================================================================

    uint256 internal constant TREE_DEPTH = 20;
    uint256 internal constant MAX_LEAVES = 1 << TREE_DEPTH;

    // ================================================================
    // State
    // ================================================================

    IVerifier public immutable verifier;

    uint256 public noteCount;
    uint256[TREE_DEPTH] internal _filledSubtrees;
    uint256[TREE_DEPTH] internal _zeros;
    uint256 public currentRoot;
    mapping(uint256 => bool) public knownRoots;
    mapping(uint256 => bool) public spentNullifiers;

    // ================================================================
    // Events
    // ================================================================

    event Deposited(
        uint256 indexed noteIndex,
        uint256 indexed noteCommitment,
        address indexed token,
        address depositor,
        uint256 amount
    );

    event Withdrawn(
        uint256 indexed nullifier,
        address indexed recipient,
        address indexed token,
        uint256 amount
    );

    // ================================================================
    // Errors
    // ================================================================

    error ZeroAmount();
    error TransferFailed();
    error NullifierAlreadySpent();
    error InvalidProof();
    error UnknownRoot();
    error TreeFull();

    // ================================================================
    // Constructor
    // ================================================================

    constructor(address _verifier) {
        verifier = IVerifier(_verifier);

        // Pre-compute Poseidon zero hashes for each level
        uint256 z = PoseidonT3.hash([uint256(0), uint256(0)]);
        _zeros[0] = z;
        for (uint256 i = 1; i < TREE_DEPTH; i++) {
            z = PoseidonT3.hash([z, z]);
            _zeros[i] = z;
        }

        currentRoot = PoseidonT3.hash([z, z]);
        knownRoots[currentRoot] = true;
    }

    // ================================================================
    // Deposit — stealth address sweeps tokens into the pool
    // ================================================================

    /// @notice Deposit tokens into the privacy pool with a note commitment.
    /// @dev The depositor computes the note commitment off-chain:
    ///      noteCommitment = Poseidon(asset, amount, recipientCommitment, salt, randomness)
    ///      where recipientCommitment = Poseidon(recipientPubKey, blinding)
    /// @param token The ERC-20 token to deposit
    /// @param amount Amount to deposit
    /// @param noteCommitment The Poseidon note commitment (computed off-chain)
    function deposit(
        address token,
        uint256 amount,
        uint256 noteCommitment
    ) external {
        if (amount == 0) revert ZeroAmount();

        // Transfer tokens from depositor (stealth address) to pool
        // Use low-level call for TIP-20 compatibility (may not return bool)
        _safeTransferFrom(token, msg.sender, address(this), amount);

        // Insert note into Merkle tree
        uint256 noteIndex = _insertLeaf(noteCommitment);

        emit Deposited(noteIndex, noteCommitment, token, msg.sender, amount);
    }

    // ================================================================
    // Withdraw — recipient proves note ownership via ZK proof
    // ================================================================

    /// @notice Withdraw tokens using a Groth16 ZK proof.
    /// @param proof Groth16 proof [pA[0], pA[1], pB[0][0], pB[0][1], pB[1][0], pB[1][1], pC[0], pC[1]]
    /// @param nullifier Prevents double-spend (public input)
    /// @param merkleRoot The Merkle root the proof was computed against
    /// @param amount The note amount (public input)
    /// @param token The token address (public input)
    /// @param recipient Where to send funds (public input, bound in proof)
    function withdraw(
        uint256[8] calldata proof,
        uint256 nullifier,
        uint256 merkleRoot,
        uint256 amount,
        address token,
        address recipient
    ) external {
        if (spentNullifiers[nullifier]) revert NullifierAlreadySpent();
        if (!knownRoots[merkleRoot]) revert UnknownRoot();

        // Public signals: [nullifier, merkleRoot, amount, asset, recipient]
        uint[5] memory pubSignals = [
            nullifier,
            merkleRoot,
            amount,
            uint256(uint160(token)),
            uint256(uint160(recipient))
        ];

        bool valid = verifier.verifyProof(
            [proof[0], proof[1]],
            [[proof[2], proof[3]], [proof[4], proof[5]]],
            [proof[6], proof[7]],
            pubSignals
        );
        if (!valid) revert InvalidProof();

        spentNullifiers[nullifier] = true;

        _safeTransfer(token, recipient, amount);

        emit Withdrawn(nullifier, recipient, token, amount);
    }

    // ================================================================
    // View helpers
    // ================================================================

    function getMerkleRoot() external view returns (uint256) {
        return currentRoot;
    }

    function getNoteCount() external view returns (uint256) {
        return noteCount;
    }

    // ================================================================
    // Internal — Safe ERC20 (TIP-20 compatible)
    // ================================================================

    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool success, ) = token.call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount)
        );
        if (!success) revert TransferFailed();
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool success, ) = token.call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        if (!success) revert TransferFailed();
    }

    // ================================================================
    // Internal — Poseidon Merkle tree
    // ================================================================

    function _insertLeaf(uint256 leaf) internal returns (uint256 idx) {
        idx = noteCount;
        if (idx >= MAX_LEAVES) revert TreeFull();

        uint256 node = leaf;
        uint256 currentIdx = idx;

        for (uint256 i = 0; i < TREE_DEPTH; i++) {
            if (currentIdx & 1 == 0) {
                _filledSubtrees[i] = node;
                node = PoseidonT3.hash([node, _zeros[i]]);
            } else {
                node = PoseidonT3.hash([_filledSubtrees[i], node]);
            }
            currentIdx >>= 1;
        }

        currentRoot = node;
        knownRoots[node] = true;
        noteCount = idx + 1;
    }
}
