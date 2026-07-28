// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ArcLegacy v2 — streamed inheritance + guardian attestation on Arc
/// @notice Each address owns an "estate": a native-USDC balance, a list of
///         beneficiaries with basis-point shares, and a dead-man's-switch.
///         v2 adds two things over v1:
///
///           1. Vesting. Instead of a lump sum, a beneficiary's share can vest
///              linearly over a configurable duration once the estate unlocks,
///              so heirs receive a stream (e.g. "20% per year") rather than
///              everything at once. A duration of 0 keeps the v1 lump-sum
///              behaviour.
///
///           2. M-of-N guardians. The owner can nominate trusted guardians and
///              a threshold; when that many guardians attest, the estate
///              unlocks immediately — a credible alternative to waiting out the
///              full dead-man's-switch interval. Any proof-of-life action by
///              the owner clears pending attestations (a false alarm resets).
///
/// @dev    On Arc the native gas token is USDC (18 decimals at the EVM level),
///         so deposits/claims use plain value transfers.
contract ArcLegacyV2 {
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint64 public constant MIN_INTERVAL = 1 hours;
    uint64 public constant DEFAULT_INTERVAL = 30 days;
    uint256 public constant MAX_BENEFICIARIES = 20;
    uint256 public constant MAX_GUARDIANS = 10;
    uint64 public constant MAX_VESTING = 3650 days; // 10 years

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
        uint64 unlockedAt; // timestamp of unlock; vesting is measured from here
        uint64 vestingDuration; // 0 = lump sum, else linear vest window
        Beneficiary[] beneficiaries;
        mapping(address => uint256) claimedAmount; // cumulative paid per heir
        // ---- guardian config ----
        address[] guardians;
        uint8 guardianThreshold; // 0 = guardians disabled
        uint64 attestEpoch; // bumped on every proof-of-life to void attestations
        mapping(address => uint64) attestedEpoch; // guardian => epoch they attested
    }

    mapping(address => Estate) private estates;

    event Deposited(address indexed owner, uint256 amount);
    event Withdrawn(address indexed owner, uint256 amount);
    event CheckedIn(address indexed owner, uint64 nextDeadline);
    event IntervalSet(address indexed owner, uint64 interval);
    event VestingSet(address indexed owner, uint64 duration);
    event BeneficiariesSet(address indexed owner, uint256 count);
    event GuardiansSet(address indexed owner, uint256 count, uint8 threshold);
    event GuardianAttested(address indexed owner, address indexed guardian, uint256 count);
    event EstateUnlocked(address indexed owner, uint256 snapshotBalance);
    event Claimed(address indexed owner, address indexed beneficiary, uint256 amount);

    error ZeroAmount();
    error ZeroAddress();
    error IntervalTooShort();
    error VestingTooLong();
    error TooManyBeneficiaries();
    error TooManyGuardians();
    error SharesMustSumTo10000();
    error InsufficientBalance();
    error EstateIsUnlocked();
    error EstateNotClaimable();
    error NotABeneficiary();
    error NothingToClaim();
    error NoBeneficiaries();
    error TransferFailed();
    error DuplicateBeneficiary();
    error DuplicateGuardian();
    error InvalidThreshold();
    error NotAGuardian();

    /// @dev Owner actions are only valid while the estate is still locked
    ///      (i.e. no unlock has been triggered).
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
        _touch(e);
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Withdraw from your estate while it is still locked.
    function withdraw(uint256 amount) external onlyLocked {
        Estate storage e = estates[msg.sender];
        if (amount == 0) revert ZeroAmount();
        if (amount > e.balance) revert InsufficientBalance();
        e.balance -= amount;
        _touch(e);
        _send(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Prove you are alive; resets the timer and clears any pending
    ///         guardian attestations.
    function checkIn() external onlyLocked {
        Estate storage e = estates[msg.sender];
        _initIfNeeded(e);
        _touch(e);
        emit CheckedIn(msg.sender, uint64(block.timestamp) + e.checkInInterval);
    }

    /// @notice Set how long you can go silent before the estate unlocks.
    function setCheckInInterval(uint64 interval) external onlyLocked {
        if (interval < MIN_INTERVAL) revert IntervalTooShort();
        Estate storage e = estates[msg.sender];
        e.checkInInterval = interval;
        _touch(e);
        emit IntervalSet(msg.sender, interval);
    }

    /// @notice Set the linear vesting window applied to each heir's share once
    ///         the estate unlocks. 0 means an immediate lump sum.
    function setVesting(uint64 duration) external onlyLocked {
        if (duration > MAX_VESTING) revert VestingTooLong();
        Estate storage e = estates[msg.sender];
        _initIfNeeded(e);
        e.vestingDuration = duration;
        _touch(e);
        emit VestingSet(msg.sender, duration);
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

        _touch(e);
        emit BeneficiariesSet(msg.sender, accounts.length);
    }

    /// @notice Nominate guardians and how many of them must attest to unlock
    ///         the estate early. Pass an empty list / threshold 0 to disable.
    function setGuardians(address[] calldata guardians, uint8 threshold)
        external
        onlyLocked
    {
        if (guardians.length > MAX_GUARDIANS) revert TooManyGuardians();
        if (threshold > guardians.length) revert InvalidThreshold();
        // Either fully disabled (empty + 0) or a positive threshold with members.
        if (guardians.length > 0 && threshold == 0) revert InvalidThreshold();

        Estate storage e = estates[msg.sender];
        _initIfNeeded(e);
        delete e.guardians;

        for (uint256 i = 0; i < guardians.length; i++) {
            if (guardians[i] == address(0)) revert ZeroAddress();
            if (guardians[i] == msg.sender) revert ZeroAddress();
            for (uint256 j = 0; j < i; j++) {
                if (guardians[j] == guardians[i]) revert DuplicateGuardian();
            }
            e.guardians.push(guardians[i]);
        }
        e.guardianThreshold = threshold;
        // New guardian set ⇒ prior attestations no longer meaningful.
        _touch(e);
        emit GuardiansSet(msg.sender, guardians.length, threshold);
    }

    // ---------------------------------------------------------- beneficiary

    /// @notice A guardian attests that `owner`'s estate should unlock. Once the
    ///         owner's threshold of distinct guardians attest (in the current
    ///         epoch), the estate unlocks immediately.
    function attestUnlock(address owner) external {
        Estate storage e = estates[owner];
        if (e.unlocked) revert EstateIsUnlocked();
        uint8 threshold = e.guardianThreshold;
        if (threshold == 0) revert NotAGuardian();
        if (!_isGuardian(e, msg.sender)) revert NotAGuardian();

        e.attestedEpoch[msg.sender] = e.attestEpoch + 1; // +1 so 0 means "never"

        uint256 count = _attestationCount(e);
        emit GuardianAttested(owner, msg.sender, count);

        if (count >= threshold) {
            if (e.beneficiaries.length == 0) revert NoBeneficiaries();
            _unlock(owner, e);
        }
    }

    /// @notice Unlock an estate whose owner has missed their deadline, without
    ///         claiming. This snapshots the balance and starts the vesting
    ///         clock. Anyone may call it (heirs typically do); `claim` also
    ///         auto-unlocks, but a vesting estate pays nothing at t0, so the
    ///         clock must be started explicitly here first.
    function triggerUnlock(address owner) public {
        Estate storage e = estates[owner];
        if (e.unlocked) revert EstateIsUnlocked();
        if (!_isPastDeadline(e)) revert EstateNotClaimable();
        if (e.beneficiaries.length == 0) revert NoBeneficiaries();
        _unlock(owner, e);
    }

    /// @notice Claim the vested-so-far portion of your share of an estate that
    ///         has unlocked (or is now past its deadline). Callable repeatedly
    ///         as more of your share vests.
    function claim(address owner) external {
        Estate storage e = estates[owner];

        if (!e.unlocked) {
            if (!_isPastDeadline(e)) revert EstateNotClaimable();
            if (e.beneficiaries.length == 0) revert NoBeneficiaries();
            _unlock(owner, e);
        }

        uint96 share = _shareOf(e, msg.sender);
        if (share == 0) revert NotABeneficiary();

        uint256 entitlement = (e.unlockedBalance * share) / BPS_DENOMINATOR;
        uint256 vested = _vestedAmount(e, entitlement);
        uint256 already = e.claimedAmount[msg.sender];
        if (vested <= already) revert NothingToClaim();

        uint256 amount = vested - already;
        e.claimedAmount[msg.sender] = vested;
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
            uint64 unlockedAt,
            uint64 vestingDuration,
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
            e.unlockedAt,
            e.vestingDuration,
            e.beneficiaries
        );
    }

    /// @notice Guardian roster, required threshold, and how many have attested
    ///         in the current (still-valid) epoch.
    function getGuardians(address owner)
        external
        view
        returns (address[] memory guardians, uint8 threshold, uint256 attested)
    {
        Estate storage e = estates[owner];
        return (e.guardians, e.guardianThreshold, _attestationCount(e));
    }

    /// @notice The amount `beneficiary` could withdraw from `owner`'s estate
    ///         right now (0 if the estate isn't claimable yet).
    function claimable(address owner, address beneficiary)
        external
        view
        returns (uint256)
    {
        Estate storage e = estates[owner];
        uint96 share = _shareOf(e, beneficiary);
        if (share == 0) return 0;

        uint256 snapshot;
        uint64 startedAt;
        if (e.unlocked) {
            snapshot = e.unlockedBalance;
            startedAt = e.unlockedAt;
        } else if (_isPastDeadline(e)) {
            // Not yet unlocked on-chain, but the deadline has passed: the first
            // claim would unlock with this timestamp, so vesting starts now.
            snapshot = e.balance;
            startedAt = uint64(block.timestamp);
        } else {
            return 0;
        }

        uint256 entitlement = (snapshot * share) / BPS_DENOMINATOR;
        uint256 vested = _vestedFrom(startedAt, e.vestingDuration, entitlement);
        uint256 already = e.claimedAmount[beneficiary];
        return vested > already ? vested - already : 0;
    }

    /// @notice True once the owner has missed their check-in deadline or
    ///         guardians have unlocked the estate.
    function isClaimable(address owner) external view returns (bool) {
        Estate storage e = estates[owner];
        return (e.unlocked || _isPastDeadline(e)) && e.beneficiaries.length > 0;
    }

    /// @notice Cumulative amount a beneficiary has already withdrawn.
    function claimedOf(address owner, address beneficiary)
        external
        view
        returns (uint256)
    {
        return estates[owner].claimedAmount[beneficiary];
    }

    // ------------------------------------------------------------- internal

    function _initIfNeeded(Estate storage e) private {
        if (e.checkInInterval == 0) {
            e.checkInInterval = DEFAULT_INTERVAL;
        }
    }

    /// @dev Proof-of-life: reset the timer and void any pending attestations by
    ///      advancing the epoch.
    function _touch(Estate storage e) private {
        e.lastCheckIn = uint64(block.timestamp);
        unchecked {
            e.attestEpoch += 1;
        }
    }

    function _unlock(address owner, Estate storage e) private {
        e.unlocked = true;
        e.unlockedBalance = e.balance;
        e.unlockedAt = uint64(block.timestamp);
        emit EstateUnlocked(owner, e.balance);
    }

    function _isPastDeadline(Estate storage e) private view returns (bool) {
        return
            e.lastCheckIn != 0 &&
            block.timestamp > uint256(e.lastCheckIn) + e.checkInInterval;
    }

    function _isGuardian(Estate storage e, address who) private view returns (bool) {
        uint256 len = e.guardians.length;
        for (uint256 i = 0; i < len; i++) {
            if (e.guardians[i] == who) return true;
        }
        return false;
    }

    function _attestationCount(Estate storage e) private view returns (uint256) {
        uint64 current = e.attestEpoch + 1;
        uint256 len = e.guardians.length;
        uint256 count;
        for (uint256 i = 0; i < len; i++) {
            if (e.attestedEpoch[e.guardians[i]] == current) count += 1;
        }
        return count;
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

    function _vestedAmount(Estate storage e, uint256 entitlement)
        private
        view
        returns (uint256)
    {
        return _vestedFrom(e.unlockedAt, e.vestingDuration, entitlement);
    }

    function _vestedFrom(uint64 startedAt, uint64 duration, uint256 entitlement)
        private
        view
        returns (uint256)
    {
        if (duration == 0) return entitlement; // lump sum
        if (startedAt == 0) return 0;
        uint256 elapsed = block.timestamp - startedAt;
        if (elapsed >= duration) return entitlement;
        return (entitlement * elapsed) / duration;
    }

    function _send(address to, uint256 amount) private {
        (bool ok, ) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
