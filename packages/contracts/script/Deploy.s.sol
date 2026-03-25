// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../src/StealthRegistry.sol";
import "../src/StealthAnnouncer.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        StealthRegistry registry = new StealthRegistry();
        StealthAnnouncer announcer = new StealthAnnouncer();

        vm.stopBroadcast();

        console.log("StealthRegistry deployed at:", address(registry));
        console.log("StealthAnnouncer deployed at:", address(announcer));
    }
}
