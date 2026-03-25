// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import "../src/StealthAnnouncer.sol";

contract StealthAnnouncerTest is Test {
    StealthAnnouncer public announcer;

    address sender;
    address stealthAddr;

    uint256 constant SCHEME_ID = 1;

    // 33-byte compressed ephemeral pubkey
    bytes ephemeralPubKey = hex"02abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab";

    // Metadata: first byte = view tag, rest = arbitrary data
    bytes metadata = abi.encodePacked(
        bytes1(0x42), // view tag
        address(0xdead)
    );

    event Announcement(
        uint256 indexed schemeId,
        address indexed stealthAddress,
        address indexed caller,
        bytes ephemeralPubKey,
        bytes metadata
    );

    function setUp() public {
        announcer = new StealthAnnouncer();
        sender = makeAddr("sender");
        stealthAddr = makeAddr("stealth");
    }

    function test_announce_emitsEvent() public {
        vm.prank(sender);

        vm.expectEmit(true, true, true, true);
        emit Announcement(SCHEME_ID, stealthAddr, sender, ephemeralPubKey, metadata);

        announcer.announce(SCHEME_ID, stealthAddr, ephemeralPubKey, metadata);
    }

    function test_announce_anyoneCanCall() public {
        address anyone = makeAddr("anyone");
        vm.prank(anyone);
        announcer.announce(SCHEME_ID, stealthAddr, ephemeralPubKey, metadata);
    }

    function test_announce_emptyMetadata() public {
        vm.prank(sender);
        announcer.announce(SCHEME_ID, stealthAddr, ephemeralPubKey, "");
    }

    function test_announce_multipleAnnouncements() public {
        vm.startPrank(sender);

        address stealth1 = makeAddr("stealth1");
        address stealth2 = makeAddr("stealth2");

        announcer.announce(SCHEME_ID, stealth1, ephemeralPubKey, metadata);
        announcer.announce(SCHEME_ID, stealth2, ephemeralPubKey, metadata);

        vm.stopPrank();
    }
}
