// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Mock verifier that always returns true — for testing only
contract MockVerifier {
    bool public shouldPass = true;

    function setShouldPass(bool _pass) external {
        shouldPass = _pass;
    }

    function verifyProof(
        uint[2] calldata,
        uint[2][2] calldata,
        uint[2] calldata,
        uint[5] calldata
    ) external view returns (bool) {
        return shouldPass;
    }
}
