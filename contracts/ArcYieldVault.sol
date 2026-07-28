// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ArcYieldVault — a real native-USDC savings vault on Arc
/// @notice Supply native USDC and earn a fixed simple-interest rate. Unlike a
///         mocked preview, positions live on-chain: your principal and accrued
///         interest persist across sessions and wallets.
/// @dev    Honesty by construction. Interest is only ever paid out of a
///         separately-funded reserve — the contract enforces the invariant
///         `address(this).balance >= totalPrincipal` at all times, so one
///         supplier's principal can never be used to pay another's interest.
///         If the reserve runs dry, interest simply can't be claimed until it
///         is topped up; principal is always withdrawable in full.
contract ArcYieldVault {
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant YEAR = 365 days;
    uint16 public constant MAX_RATE_BPS = 2_000; // 20% cap, sanity bound

    address public immutable owner;
    uint16 public rateBps; // annual simple-interest rate in basis points
    uint256 public totalPrincipal;

    struct Position {
        uint256 principal;
        uint256 accrued; // interest banked but not yet claimed
        uint64 lastAccrual;
    }

    mapping(address => Position) private positions;

    event Supplied(address indexed user, uint256 amount, uint256 principal);
    event Withdrawn(address indexed user, uint256 amount, uint256 principal);
    event InterestClaimed(address indexed user, uint256 amount);
    event ReserveFunded(address indexed from, uint256 amount);
    event RateSet(uint16 rateBps);

    error ZeroAmount();
    error InsufficientPrincipal();
    error InsufficientReserve();
    error RateTooHigh();
    error NotOwner();
    error TransferFailed();

    constructor(uint16 initialRateBps) {
        if (initialRateBps > MAX_RATE_BPS) revert RateTooHigh();
        owner = msg.sender;
        rateBps = initialRateBps;
    }

    // ---------------------------------------------------------------- supply

    /// @notice Supply native USDC to the vault. Accrues any pending interest
    ///         on your existing position first.
    function supply() external payable {
        if (msg.value == 0) revert ZeroAmount();
        Position storage p = positions[msg.sender];
        _accrue(p);
        p.principal += msg.value;
        totalPrincipal += msg.value;
        emit Supplied(msg.sender, msg.value, p.principal);
    }

    /// @notice Withdraw supplied principal. Always fully backed.
    function withdraw(uint256 amount) external {
        Position storage p = positions[msg.sender];
        _accrue(p);
        if (amount == 0) revert ZeroAmount();
        if (amount > p.principal) revert InsufficientPrincipal();
        p.principal -= amount;
        totalPrincipal -= amount;
        _send(msg.sender, amount);
        emit Withdrawn(msg.sender, amount, p.principal);
    }

    /// @notice Claim accrued interest. Paid strictly from the reserve — the
    ///         balance held above `totalPrincipal`.
    function claimInterest() external {
        Position storage p = positions[msg.sender];
        _accrue(p);
        uint256 amount = p.accrued;
        if (amount == 0) revert ZeroAmount();
        // Never dip into anyone's principal to pay interest.
        if (address(this).balance - amount < totalPrincipal) {
            revert InsufficientReserve();
        }
        p.accrued = 0;
        _send(msg.sender, amount);
        emit InterestClaimed(msg.sender, amount);
    }

    /// @notice Add native USDC to the interest reserve (does not earn interest).
    function fundReserve() external payable {
        if (msg.value == 0) revert ZeroAmount();
        emit ReserveFunded(msg.sender, msg.value);
    }

    // ----------------------------------------------------------------- admin

    function setRate(uint16 newRateBps) external {
        if (msg.sender != owner) revert NotOwner();
        if (newRateBps > MAX_RATE_BPS) revert RateTooHigh();
        rateBps = newRateBps;
        emit RateSet(newRateBps);
    }

    // ----------------------------------------------------------------- views

    /// @notice Live position for `user`: principal and interest accrued to now.
    function positionOf(address user)
        external
        view
        returns (uint256 principal, uint256 accrued, uint64 lastAccrual)
    {
        Position storage p = positions[user];
        return (p.principal, p.accrued + _pending(p), p.lastAccrual);
    }

    /// @notice USDC available to pay interest (balance above total principal).
    function reserve() external view returns (uint256) {
        uint256 bal = address(this).balance;
        return bal > totalPrincipal ? bal - totalPrincipal : 0;
    }

    // -------------------------------------------------------------- internal

    function _accrue(Position storage p) private {
        uint256 pending = _pending(p);
        if (pending > 0) p.accrued += pending;
        p.lastAccrual = uint64(block.timestamp);
    }

    function _pending(Position storage p) private view returns (uint256) {
        if (p.principal == 0 || p.lastAccrual == 0) return 0;
        uint256 elapsed = block.timestamp - p.lastAccrual;
        if (elapsed == 0) return 0;
        return (p.principal * rateBps * elapsed) / (BPS_DENOMINATOR * YEAR);
    }

    function _send(address to, uint256 amount) private {
        (bool ok, ) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
