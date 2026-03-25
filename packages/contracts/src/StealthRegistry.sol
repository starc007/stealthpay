// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @title ERC-6538 Stealth Meta-Address Registry
/// @notice A contract for registering stealth meta-addresses, allowing users to
/// be discovered by senders who want to pay them via stealth addresses.
contract StealthRegistry {
    // ──────────────────────────────────────────────
    // Errors
    // ──────────────────────────────────────────────

    /// @notice Thrown when an invalid signature is provided to `registerKeysOnBehalf`.
    error ERC6538Registry__InvalidSignature();

    // ──────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when a registrant updates their stealth meta-address.
    event StealthMetaAddressSet(
        address indexed registrant,
        uint256 indexed schemeId,
        bytes stealthMetaAddress
    );

    /// @notice Emitted when a registrant increments their nonce.
    event NonceIncremented(address indexed registrant, uint256 newNonce);

    // ──────────────────────────────────────────────
    // Constants
    // ──────────────────────────────────────────────

    /// @notice EIP-712 domain separator, computed at deployment.
    bytes32 public immutable DOMAIN_SEPARATOR;

    /// @notice EIP-712 typehash for registerKeysOnBehalf.
    bytes32 public constant ERC6538REGISTRY_ENTRY_TYPE_HASH =
        keccak256("ERC6538RegistryEntry(uint256 schemeId,bytes stealthMetaAddress,uint256 nonce)");

    // ──────────────────────────────────────────────
    // Storage
    // ──────────────────────────────────────────────

    /// @notice Maps registrant => schemeId => stealth meta-address.
    mapping(address => mapping(uint256 => bytes)) private _stealthMetaAddresses;

    /// @notice Maps registrant => nonce (for registerKeysOnBehalf replay protection).
    mapping(address => uint256) private _nonces;

    // ──────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("ERC6538Registry"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    // ──────────────────────────────────────────────
    // External Functions
    // ──────────────────────────────────────────────

    /// @notice Register or update your stealth meta-address for a given scheme.
    /// @param schemeId The stealth address scheme identifier (1 = secp256k1 ECDH).
    /// @param stealthMetaAddress The stealth meta-address (spending pubkey || viewing pubkey).
    function registerKeys(uint256 schemeId, bytes calldata stealthMetaAddress) external {
        _stealthMetaAddresses[msg.sender][schemeId] = stealthMetaAddress;
        emit StealthMetaAddressSet(msg.sender, schemeId, stealthMetaAddress);
    }

    /// @notice Register stealth meta-address on behalf of another account using EIP-712 signature.
    /// @param registrant The account to register for.
    /// @param schemeId The stealth address scheme identifier.
    /// @param signature EIP-712 signature from the registrant.
    /// @param stealthMetaAddress The stealth meta-address to register.
    function registerKeysOnBehalf(
        address registrant,
        uint256 schemeId,
        bytes memory signature,
        bytes calldata stealthMetaAddress
    ) external {
        uint256 nonce = _nonces[registrant];

        bytes32 structHash = keccak256(
            abi.encode(
                ERC6538REGISTRY_ENTRY_TYPE_HASH,
                schemeId,
                keccak256(stealthMetaAddress),
                nonce
            )
        );

        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );

        // Decode signature
        if (signature.length != 65) revert ERC6538Registry__InvalidSignature();

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 0x20))
            s := mload(add(signature, 0x40))
            v := byte(0, mload(add(signature, 0x60)))
        }

        address recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0) || recovered != registrant) {
            revert ERC6538Registry__InvalidSignature();
        }

        _nonces[registrant] = nonce + 1;
        _stealthMetaAddresses[registrant][schemeId] = stealthMetaAddress;
        emit StealthMetaAddressSet(registrant, schemeId, stealthMetaAddress);
    }

    /// @notice Increment the nonce of the caller, invalidating any pending `registerKeysOnBehalf` signatures.
    function incrementNonce() external {
        uint256 newNonce = _nonces[msg.sender] + 1;
        _nonces[msg.sender] = newNonce;
        emit NonceIncremented(msg.sender, newNonce);
    }

    // ──────────────────────────────────────────────
    // View Functions
    // ──────────────────────────────────────────────

    /// @notice Returns the stealth meta-address for a given registrant and scheme.
    /// @param registrant The account to look up.
    /// @param schemeId The stealth address scheme identifier.
    /// @return The stealth meta-address bytes, or empty if not registered.
    function stealthMetaAddressOf(
        address registrant,
        uint256 schemeId
    ) external view returns (bytes memory) {
        return _stealthMetaAddresses[registrant][schemeId];
    }

    /// @notice Returns the current nonce for a registrant.
    /// @param registrant The account to look up.
    /// @return The current nonce.
    function nonceOf(address registrant) external view returns (uint256) {
        return _nonces[registrant];
    }
}
