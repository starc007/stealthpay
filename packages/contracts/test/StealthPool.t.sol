// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/StealthPool.sol";
import "../src/mocks/MockVerifier.sol";
import "../src/mocks/MockERC20.sol";

contract StealthPoolTest is Test {
    StealthPool public pool;
    MockVerifier public verifier;
    MockERC20 public token;

    address depositor = makeAddr("depositor");
    address recipient = makeAddr("recipient");

    uint256 constant DEPOSIT_AMOUNT = 1000e6; // 1000 MUSD
    uint256 constant NOTE_COMMITMENT = 12345678; // dummy commitment

    function setUp() public {
        verifier = new MockVerifier();
        pool = new StealthPool(address(verifier));
        token = new MockERC20();

        // Fund depositor
        token.mint(depositor, DEPOSIT_AMOUNT);

        // Approve pool
        vm.prank(depositor);
        token.approve(address(pool), type(uint256).max);
    }

    // ── Deposit ──────────────────────────────────

    function test_deposit() public {
        vm.prank(depositor);
        pool.deposit(address(token), DEPOSIT_AMOUNT, NOTE_COMMITMENT);

        assertEq(token.balanceOf(address(pool)), DEPOSIT_AMOUNT);
        assertEq(token.balanceOf(depositor), 0);
        assertEq(pool.getNoteCount(), 1);
    }

    function test_deposit_updatesRoot() public {
        uint256 rootBefore = pool.currentRoot();

        vm.prank(depositor);
        pool.deposit(address(token), DEPOSIT_AMOUNT, NOTE_COMMITMENT);

        uint256 rootAfter = pool.currentRoot();
        assertTrue(rootBefore != rootAfter);
        assertTrue(pool.knownRoots(rootAfter));
    }

    function test_deposit_emitsEvent() public {
        vm.prank(depositor);
        vm.expectEmit(true, true, true, true);
        emit StealthPool.Deposited(0, NOTE_COMMITMENT, address(token), depositor, DEPOSIT_AMOUNT);
        pool.deposit(address(token), DEPOSIT_AMOUNT, NOTE_COMMITMENT);
    }

    function test_deposit_multipleNotes() public {
        token.mint(depositor, DEPOSIT_AMOUNT); // mint more

        vm.startPrank(depositor);
        pool.deposit(address(token), DEPOSIT_AMOUNT, NOTE_COMMITMENT);
        pool.deposit(address(token), DEPOSIT_AMOUNT, NOTE_COMMITMENT + 1);
        vm.stopPrank();

        assertEq(pool.getNoteCount(), 2);
        assertEq(token.balanceOf(address(pool)), DEPOSIT_AMOUNT * 2);
    }

    function test_deposit_revertsZeroAmount() public {
        vm.prank(depositor);
        vm.expectRevert(StealthPool.ZeroAmount.selector);
        pool.deposit(address(token), 0, NOTE_COMMITMENT);
    }

    function test_deposit_revertsNoApproval() public {
        address noApproval = makeAddr("noApproval");
        token.mint(noApproval, DEPOSIT_AMOUNT);

        vm.prank(noApproval);
        vm.expectRevert(StealthPool.TransferFailed.selector);
        pool.deposit(address(token), DEPOSIT_AMOUNT, NOTE_COMMITMENT);
    }

    // ── Withdraw ─────────────────────────────────

    function test_withdraw() public {
        // Deposit first
        vm.prank(depositor);
        pool.deposit(address(token), DEPOSIT_AMOUNT, NOTE_COMMITMENT);

        uint256 root = pool.currentRoot();
        uint256 nullifier = 99999;
        uint256[8] memory proof; // mock verifier doesn't check proof data

        pool.withdraw(proof, nullifier, root, DEPOSIT_AMOUNT, address(token), recipient);

        assertEq(token.balanceOf(recipient), DEPOSIT_AMOUNT);
        assertEq(token.balanceOf(address(pool)), 0);
        assertTrue(pool.spentNullifiers(nullifier));
    }

    function test_withdraw_emitsEvent() public {
        vm.prank(depositor);
        pool.deposit(address(token), DEPOSIT_AMOUNT, NOTE_COMMITMENT);

        uint256 root = pool.currentRoot();
        uint256 nullifier = 99999;
        uint256[8] memory proof;

        vm.expectEmit(true, true, true, true);
        emit StealthPool.Withdrawn(nullifier, recipient, address(token), DEPOSIT_AMOUNT);
        pool.withdraw(proof, nullifier, root, DEPOSIT_AMOUNT, address(token), recipient);
    }

    function test_withdraw_revertsDoubleSpend() public {
        vm.prank(depositor);
        pool.deposit(address(token), DEPOSIT_AMOUNT, NOTE_COMMITMENT);

        uint256 root = pool.currentRoot();
        uint256 nullifier = 99999;
        uint256[8] memory proof;

        pool.withdraw(proof, nullifier, root, DEPOSIT_AMOUNT, address(token), recipient);

        // Second withdraw with same nullifier should fail
        token.mint(address(pool), DEPOSIT_AMOUNT); // re-fund pool for the attempt
        vm.expectRevert(StealthPool.NullifierAlreadySpent.selector);
        pool.withdraw(proof, nullifier, root, DEPOSIT_AMOUNT, address(token), recipient);
    }

    function test_withdraw_revertsUnknownRoot() public {
        vm.prank(depositor);
        pool.deposit(address(token), DEPOSIT_AMOUNT, NOTE_COMMITMENT);

        uint256 fakeRoot = 111111;
        uint256 nullifier = 99999;
        uint256[8] memory proof;

        vm.expectRevert(StealthPool.UnknownRoot.selector);
        pool.withdraw(proof, nullifier, fakeRoot, DEPOSIT_AMOUNT, address(token), recipient);
    }

    function test_withdraw_revertsInvalidProof() public {
        vm.prank(depositor);
        pool.deposit(address(token), DEPOSIT_AMOUNT, NOTE_COMMITMENT);

        // Make verifier reject
        verifier.setShouldPass(false);

        uint256 root = pool.currentRoot();
        uint256 nullifier = 99999;
        uint256[8] memory proof;

        vm.expectRevert(StealthPool.InvalidProof.selector);
        pool.withdraw(proof, nullifier, root, DEPOSIT_AMOUNT, address(token), recipient);
    }

    // ── Merkle tree ──────────────────────────────

    function test_merkleRoot_changesPerDeposit() public {
        token.mint(depositor, DEPOSIT_AMOUNT * 3);
        vm.startPrank(depositor);

        uint256 root1 = pool.currentRoot();
        pool.deposit(address(token), DEPOSIT_AMOUNT, 111);
        uint256 root2 = pool.currentRoot();
        pool.deposit(address(token), DEPOSIT_AMOUNT, 222);
        uint256 root3 = pool.currentRoot();

        vm.stopPrank();

        assertTrue(root1 != root2);
        assertTrue(root2 != root3);
        assertTrue(root1 != root3);

        // All roots are known
        assertTrue(pool.knownRoots(root1));
        assertTrue(pool.knownRoots(root2));
        assertTrue(pool.knownRoots(root3));
    }

    function test_withdrawWithOlderRoot() public {
        token.mint(depositor, DEPOSIT_AMOUNT * 2);
        vm.startPrank(depositor);

        pool.deposit(address(token), DEPOSIT_AMOUNT, 111);
        uint256 rootAfterFirst = pool.currentRoot();

        pool.deposit(address(token), DEPOSIT_AMOUNT, 222);
        vm.stopPrank();

        // Withdraw using the older root (still valid)
        uint256 nullifier = 55555;
        uint256[8] memory proof;
        pool.withdraw(proof, nullifier, rootAfterFirst, DEPOSIT_AMOUNT, address(token), recipient);

        assertEq(token.balanceOf(recipient), DEPOSIT_AMOUNT);
    }
}
