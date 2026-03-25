// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @title ERC-5564 Stealth Address Announcer
/// @notice A contract for announcing stealth address payments. When a sender pays
/// to a stealth address, they call `announce` to publish the ephemeral public key
/// so the recipient can detect and claim the payment.
contract StealthAnnouncer {
    /// @notice Emitted when a sender announces a payment to a stealth address.
    /// @param schemeId The stealth address scheme identifier (1 = secp256k1 ECDH).
    /// @param stealthAddress The one-time stealth address that received funds.
    /// @param caller The address that called `announce` (typically the sender).
    /// @param ephemeralPubKey The ephemeral public key the recipient needs to derive the stealth private key.
    /// @param metadata Arbitrary metadata. First byte MUST be the view tag for fast filtering.
    event Announcement(
        uint256 indexed schemeId,
        address indexed stealthAddress,
        address indexed caller,
        bytes ephemeralPubKey,
        bytes metadata
    );

    /// @notice Announce a stealth address payment.
    /// @dev Senders call this after transferring tokens to the stealth address.
    /// The recipient's scanner watches for these events to detect incoming payments.
    /// @param schemeId The stealth address scheme identifier.
    /// @param stealthAddress The computed stealth address for the recipient.
    /// @param ephemeralPubKey The ephemeral public key used in the ECDH computation.
    /// @param metadata Arbitrary metadata — first byte MUST be the view tag.
    function announce(
        uint256 schemeId,
        address stealthAddress,
        bytes memory ephemeralPubKey,
        bytes memory metadata
    ) external {
        emit Announcement(schemeId, stealthAddress, msg.sender, ephemeralPubKey, metadata);
    }
}
