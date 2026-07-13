// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ArcLegacy — stablecoin inheritance vaults on Arc
/// @notice Each address owns an "estate": a native-USDC balance, a list of
///         beneficiaries with basis-point shares, and a dead-man's-switch.
///         While the owner keeps checking in, only they can move funds.
///         Once the check-in deadline lapses, the estate unlocks and
///         beneficiaries can claim their shares.
/// @dev    On Arc the native gas token is USDC (18 decimals at the EVM
///         level), so deposits/claims use plain value transfers.
contract ArcLegacy {
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint64 public constant MIN_INTERVAL = 1 hours;
    uint64 public constant DEFAULT_INTERVAL = 30 days;
    uint256 public constant MAX_BENEFICIARIES = 20;

    struct Beneficiary {
        address account;
        uint96 shareBps;
    }

    struct Estate {
        uint256 balance;
        uint64 lastCheckIn;
        uint64 checkInInterval;
        bool unlocked;
        uint256 unlockedBalance; // balance snapshot taken when the estate unlocks
        Beneficiary[] beneficiaries;
        mapping(address => bool) claimed;
    }

    mapping(address => Estate) private estates;

    event Deposited(address indexed owner, uint256 amount);
    event Withdrawn(address indexed owner, uint256 amount);
    event CheckedIn(address indexed owner, uint64 nextDeadline);
    event IntervalSet(address indexed owner, uint64 interval);
    event BeneficiariesSet(address indexed owner, uint256 count);
    event EstateUnlocked(address indexed owner, uint256 snapshotBalance);
    event Claimed(address indexed owner, address indexed beneficiary, uint256 amount);

    error ZeroAmount();
    error ZeroAddress();
    error IntervalTooShort();
    error TooManyBeneficiaries();
    error SharesMustSumTo10000();
    error InsufficientBalance();
    error EstateIsUnlocked();
    error EstateNotClaimable();
    error NotABeneficiary();
    error AlreadyClaimed();
    error NoBeneficiaries();
    error TransferFailed();
    error DuplicateBeneficiary();

    /// @dev Owner actions are only valid while the estate is still locked
    ///      (i.e. no beneficiary has triggered the unlock).
    modifier onlyLocked() {
        if (estates[msg.sender].unlocked) revert EstateIsUnlocked();
        _;
    }

    // ---------------------------------------------------------------- owner

    /// @notice Deposit native USDC into your estate. Also counts as a check-in.
    function deposit() external payable onlyLocked {
        if (msg.value == 0) revert ZeroAmount();
        Estate storage e = estates[msg.sender];
        _initIfNeeded(e);
        e.balance += msg.value;
        e.lastCheckIn = uint64(block.timestamp);
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Withdraw from your estate while it is still locked.
    function withdraw(uint256 amount) external onlyLocked {
        Estate storage e = estates[msg.sender];
        if (amount == 0) revert ZeroAmount();
        if (amount > e.balance) revert InsufficientBalance();
        e.balance -= amount;
        e.lastCheckIn = uint64(block.timestamp);
        _send(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Prove you are alive; resets the dead-man's-switch timer.
    function checkIn() external onlyLocked {
        Estate storage e = estates[msg.sender];
        _initIfNeeded(e);
        e.lastCheckIn = uint64(block.timestamp);
        emit CheckedIn(msg.sender, uint64(block.timestamp) + e.checkInInterval);
    }

    /// @notice Set how long you can go silent before the estate unlocks.
    function setCheckInInterval(uint64 interval) external onlyLocked {
        if (interval < MIN_INTERVAL) revert IntervalTooShort();
        Estate storage e = estates[msg.sender];
        e.checkInInterval = interval;
        e.lastCheckIn = uint64(block.timestamp);
        emit IntervalSet(msg.sender, interval);
    }

    /// @notice Replace your full beneficiary list. Shares are in basis points
    ///         and must sum to exactly 10 000.
    function setBeneficiaries(
        address[] calldata accounts,
        uint96[] calldata sharesBps
    ) external onlyLocked {
        if (accounts.length != sharesBps.length || accounts.length == 0) {
            revert SharesMustSumTo10000();
        }
        if (accounts.length > MAX_BENEFICIARIES) revert TooManyBeneficiaries();

        Estate storage e = estates[msg.sender];
        _initIfNeeded(e);
        delete e.beneficiaries;

        uint256 total;
        for (uint256 i = 0; i < accounts.length; i++) {
            if (accounts[i] == address(0)) revert ZeroAddress();
            if (sharesBps[i] == 0) revert ZeroAmount();
            for (uint256 j = 0; j < i; j++) {
                if (accounts[j] == accounts[i]) revert DuplicateBeneficiary();
            }
            e.beneficiaries.push(Beneficiary(accounts[i], sharesBps[i]));
            total += sharesBps[i];
        }
        if (total != BPS_DENOMINATOR) revert SharesMustSumTo10000();

        e.lastCheckIn = uint64(block.timestamp);
        emit BeneficiariesSet(msg.sender, accounts.length);
    }

    // ---------------------------------------------------------- beneficiary

    /// @notice Claim your share of an estate whose owner missed the deadline.
    ///         The first successful claim snapshots the balance and unlocks
    ///         the estate for the remaining beneficiaries.
    function claim(address owner) external {
        Estate storage e = estates[owner];

        if (!e.unlocked) {
            if (!_isPastDeadline(e)) revert EstateNotClaimable();
            if (e.beneficiaries.length == 0) revert NoBeneficiaries();
            e.unlocked = true;
            e.unlockedBalance = e.balance;
            emit EstateUnlocked(owner, e.balance);
        }

        uint96 share = _shareOf(e, msg.sender);
        if (share == 0) revert NotABeneficiary();
        if (e.claimed[msg.sender]) revert AlreadyClaimed();

        e.claimed[msg.sender] = true;
        uint256 amount = (e.unlockedBalance * share) / BPS_DENOMINATOR;
        e.balance -= amount;
        _send(msg.sender, amount);
        emit Claimed(owner, msg.sender, amount);
    }

    // ---------------------------------------------------------------- views

    function getEstate(address owner)
        external
        view
        returns (
            uint256 balance,
            uint64 lastCheckIn,
            uint64 checkInInterval,
            bool unlocked,
            uint256 unlockedBalance,
            Beneficiary[] memory beneficiaries
        )
    {
        Estate storage e = estates[owner];
        return (
            e.balance,
            e.lastCheckIn,
            e.checkInInterval,
            e.unlocked,
            e.unlockedBalance,
            e.beneficiaries
        );
    }

    /// @notice True once the owner has missed their check-in deadline.
    function isClaimable(address owner) external view returns (bool) {
        Estate storage e = estates[owner];
        return (e.unlocked || _isPastDeadline(e)) && e.beneficiaries.length > 0;
    }

    function hasClaimed(address owner, address beneficiary) external view returns (bool) {
        return estates[owner].claimed[beneficiary];
    }

    // ------------------------------------------------------------- internal

    function _initIfNeeded(Estate storage e) private {
        if (e.checkInInterval == 0) {
            e.checkInInterval = DEFAULT_INTERVAL;
        }
    }

    function _isPastDeadline(Estate storage e) private view returns (bool) {
        return
            e.lastCheckIn != 0 &&
            block.timestamp > uint256(e.lastCheckIn) + e.checkInInterval;
    }

    function _shareOf(Estate storage e, address account) private view returns (uint96) {
        uint256 len = e.beneficiaries.length;
        for (uint256 i = 0; i < len; i++) {
            if (e.beneficiaries[i].account == account) {
                return e.beneficiaries[i].shareBps;
            }
        }
        return 0;
    }

    function _send(address to, uint256 amount) private {
        (bool ok, ) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
