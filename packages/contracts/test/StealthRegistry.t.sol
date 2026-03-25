// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import "../src/StealthRegistry.sol";

contract StealthRegistryTest is Test {
    StealthRegistry public registry;

    address alice;
    uint256 aliceKey;
    address bob;
    uint256 bobKey;

    uint256 constant SCHEME_ID = 1; // secp256k1

    // Sample stealth meta-address (66 bytes: 33-byte spending pubkey + 33-byte viewing pubkey)
    bytes stealthMetaAddress = hex"02a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b203b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3";

    event StealthMetaAddressSet(
        address indexed registrant,
        uint256 indexed schemeId,
        bytes stealthMetaAddress
    );

    event NonceIncremented(address indexed registrant, uint256 newNonce);

    function setUp() public {
        registry = new StealthRegistry();
        (alice, aliceKey) = makeAddrAndKey("alice");
        (bob, bobKey) = makeAddrAndKey("bob");
    }

    // ── registerKeys ─────────────────────────────

    function test_registerKeys() public {
        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit StealthMetaAddressSet(alice, SCHEME_ID, stealthMetaAddress);
        registry.registerKeys(SCHEME_ID, stealthMetaAddress);

        assertEq(registry.stealthMetaAddressOf(alice, SCHEME_ID), stealthMetaAddress);
    }

    function test_registerKeys_overwrite() public {
        vm.startPrank(alice);
        registry.registerKeys(SCHEME_ID, stealthMetaAddress);

        bytes memory newMeta = hex"02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa03bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
        registry.registerKeys(SCHEME_ID, newMeta);
        vm.stopPrank();

        assertEq(registry.stealthMetaAddressOf(alice, SCHEME_ID), newMeta);
    }

    function test_registerKeys_differentSchemes() public {
        vm.startPrank(alice);
        registry.registerKeys(1, stealthMetaAddress);
        registry.registerKeys(2, hex"deadbeef");
        vm.stopPrank();

        assertEq(registry.stealthMetaAddressOf(alice, 1), stealthMetaAddress);
        assertEq(registry.stealthMetaAddressOf(alice, 2), hex"deadbeef");
    }

    function test_stealthMetaAddressOf_unregistered() public view {
        assertEq(registry.stealthMetaAddressOf(alice, SCHEME_ID).length, 0);
    }

    // ── registerKeysOnBehalf ─────────────────────

    function _signRegistration(
        uint256 signerKey,
        uint256 schemeId,
        bytes memory meta,
        uint256 nonce
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                registry.ERC6538REGISTRY_ENTRY_TYPE_HASH(),
                schemeId,
                keccak256(meta),
                nonce
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", registry.DOMAIN_SEPARATOR(), structHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_registerKeysOnBehalf() public {
        bytes memory sig = _signRegistration(aliceKey, SCHEME_ID, stealthMetaAddress, 0);

        vm.prank(bob);
        registry.registerKeysOnBehalf(alice, SCHEME_ID, sig, stealthMetaAddress);

        assertEq(registry.stealthMetaAddressOf(alice, SCHEME_ID), stealthMetaAddress);
        assertEq(registry.nonceOf(alice), 1);
    }

    function test_registerKeysOnBehalf_invalidSignature() public {
        bytes memory sig = _signRegistration(bobKey, SCHEME_ID, stealthMetaAddress, 0);

        vm.prank(bob);
        vm.expectRevert(StealthRegistry.ERC6538Registry__InvalidSignature.selector);
        registry.registerKeysOnBehalf(alice, SCHEME_ID, sig, stealthMetaAddress);
    }

    function test_registerKeysOnBehalf_replayFails() public {
        bytes memory sig = _signRegistration(aliceKey, SCHEME_ID, stealthMetaAddress, 0);

        registry.registerKeysOnBehalf(alice, SCHEME_ID, sig, stealthMetaAddress);

        vm.expectRevert(StealthRegistry.ERC6538Registry__InvalidSignature.selector);
        registry.registerKeysOnBehalf(alice, SCHEME_ID, sig, stealthMetaAddress);
    }

    function test_registerKeysOnBehalf_badSigLength() public {
        vm.expectRevert(StealthRegistry.ERC6538Registry__InvalidSignature.selector);
        registry.registerKeysOnBehalf(alice, SCHEME_ID, hex"aabb", stealthMetaAddress);
    }

    // ── incrementNonce ───────────────────────────

    function test_incrementNonce() public {
        assertEq(registry.nonceOf(alice), 0);

        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit NonceIncremented(alice, 1);
        registry.incrementNonce();

        assertEq(registry.nonceOf(alice), 1);
    }

    function test_incrementNonce_invalidatesPendingSig() public {
        bytes memory sig = _signRegistration(aliceKey, SCHEME_ID, stealthMetaAddress, 0);

        vm.prank(alice);
        registry.incrementNonce();

        vm.expectRevert(StealthRegistry.ERC6538Registry__InvalidSignature.selector);
        registry.registerKeysOnBehalf(alice, SCHEME_ID, sig, stealthMetaAddress);
    }
}
