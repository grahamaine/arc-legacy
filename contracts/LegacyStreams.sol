// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title LegacyStreams — recurring native-USDC payments on Arc
/// @notice Schedule a fixed USDC amount to a recipient every `interval` seconds:
///         a "Recurring" order for estates. Two headline uses:
///           1. Recurring contributions — drip USDC into an estate/savings on a
///              cadence (dollar-cost-average your legacy).
///           2. Scheduled payouts — an on-chain annuity/allowance that pays an
///              heir a fixed amount on a schedule instead of one lump sum.
/// @dev    Native USDC is the gas token on Arc and has no ERC-20 allowance, so a
///         stream is *pre-funded*: the creator escrows a balance up front and
///         each due payment is pulled from it. `executeDue` pays exactly one
///         period per call (gas-bounded) and is permissionless, so the
///         autonomous keeper — or anyone — can settle due payments. The creator
///         can top up (`fund`) or `cancel` for a refund of the unspent balance.
///         Checks-effects-interactions ordering keeps every payout reentrancy-safe.
contract LegacyStreams {
    struct Stream {
        address creator; // funds the stream and can cancel/top up
        address recipient; // receives each payout
        uint128 amount; // payout per period (wei, USDC has 18 decimals on Arc)
        uint64 interval; // seconds between payouts
        uint64 nextDue; // timestamp the next payout becomes claimable
        uint64 endTime; // 0 = open-ended; no payouts scheduled after this
        uint128 balance; // escrowed funds remaining
        bool active;
    }

    uint256 public streamCount;
    mapping(uint256 => Stream) private streams;
    mapping(address => uint256[]) private createdBy;

    event StreamCreated(
        uint256 indexed id,
        address indexed creator,
        address indexed recipient,
        uint128 amount,
        uint64 interval,
        uint64 endTime,
        uint256 initialBalance
    );
    event StreamFunded(uint256 indexed id, address indexed from, uint256 amount, uint128 balance);
    event StreamExecuted(
        uint256 indexed id,
        address indexed recipient,
        uint256 amount,
        uint64 nextDue,
        uint128 balance
    );
    event StreamCompleted(uint256 indexed id, uint256 refunded);
    event StreamCancelled(uint256 indexed id, uint256 refunded);

    error ZeroAmount();
    error ZeroAddress();
    error ZeroInterval();
    error AmountTooLarge();
    error BadEndTime();
    error UnknownStream();
    error StreamInactive();
    error NotCreator();
    error NotDue();
    error InsufficientStreamBalance();
    error TransferFailed();

    // --------------------------------------------------------------- create

    /// @notice Create a recurring payment to `recipient` of `amount` every
    ///         `interval` seconds, funded by the attached value. The first
    ///         payout becomes due one interval from now.
    /// @param endTime Optional unix time after which no further payouts are
    ///        scheduled (0 = open-ended). Must be in the future when set.
    /// @return id The new stream id.
    function createStream(
        address recipient,
        uint128 amount,
        uint64 interval,
        uint64 endTime
    ) external payable returns (uint256 id) {
        if (recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (interval == 0) revert ZeroInterval();
        if (msg.value == 0) revert ZeroAmount();
        if (msg.value > type(uint128).max) revert AmountTooLarge();
        if (endTime != 0 && endTime <= block.timestamp) revert BadEndTime();

        id = ++streamCount;
        streams[id] = Stream({
            creator: msg.sender,
            recipient: recipient,
            amount: amount,
            interval: interval,
            nextDue: uint64(block.timestamp) + interval,
            endTime: endTime,
            balance: uint128(msg.value),
            active: true
        });
        createdBy[msg.sender].push(id);

        emit StreamCreated(id, msg.sender, recipient, amount, interval, endTime, msg.value);
    }

    /// @notice Top up a stream's escrowed balance so it can keep paying out.
    ///         Anyone may fund a stream (e.g. a family member topping up).
    function fund(uint256 id) external payable {
        Stream storage s = streams[id];
        if (s.creator == address(0)) revert UnknownStream();
        if (!s.active) revert StreamInactive();
        if (msg.value == 0) revert ZeroAmount();
        if (msg.value > type(uint128).max) revert AmountTooLarge();
        s.balance += uint128(msg.value); // checked arithmetic reverts on overflow
        emit StreamFunded(id, msg.sender, msg.value, s.balance);
    }

    // -------------------------------------------------------------- execute

    /// @notice Settle one due payout for stream `id`, paying `amount` to the
    ///         recipient and advancing the schedule by one interval.
    ///         Permissionless — the keeper (or anyone) can call it. Reverts if
    ///         the stream isn't due yet or lacks the balance for this payout; if
    ///         the schedule has ended, it finalizes and refunds the remainder.
    /// @return paid True if a payout was made, false if the stream just completed.
    function executeDue(uint256 id) external returns (bool paid) {
        Stream storage s = streams[id];
        if (s.creator == address(0)) revert UnknownStream();
        if (!s.active) revert StreamInactive();

        // Schedule finished: no payout beyond endTime. Finalize and refund.
        if (s.endTime != 0 && s.nextDue > s.endTime) {
            _finish(id, s, false);
            return false;
        }

        if (block.timestamp < s.nextDue) revert NotDue();
        if (s.balance < s.amount) revert InsufficientStreamBalance();

        // Effects before interaction (reentrancy-safe).
        uint128 amount = s.amount;
        s.balance -= amount;
        s.nextDue += s.interval;

        // If this payout was the last one on the schedule, mark complete after.
        bool completedAfter = s.endTime != 0 && s.nextDue > s.endTime;

        _send(s.recipient, amount);
        emit StreamExecuted(id, s.recipient, amount, s.nextDue, s.balance);

        if (completedAfter) _finish(id, s, true);
        return true;
    }

    // --------------------------------------------------------------- cancel

    /// @notice Cancel a stream and refund its unspent balance to the creator.
    function cancel(uint256 id) external {
        Stream storage s = streams[id];
        if (s.creator == address(0)) revert UnknownStream();
        if (!s.active) revert StreamInactive();
        if (msg.sender != s.creator) revert NotCreator();

        uint256 refund = s.balance;
        s.balance = 0;
        s.active = false;
        if (refund > 0) _send(s.creator, refund);
        emit StreamCancelled(id, refund);
    }

    // ----------------------------------------------------------------- views

    function getStream(uint256 id)
        external
        view
        returns (
            address creator,
            address recipient,
            uint128 amount,
            uint64 interval,
            uint64 nextDue,
            uint64 endTime,
            uint128 balance,
            bool active
        )
    {
        Stream storage s = streams[id];
        if (s.creator == address(0)) revert UnknownStream();
        return (
            s.creator,
            s.recipient,
            s.amount,
            s.interval,
            s.nextDue,
            s.endTime,
            s.balance,
            s.active
        );
    }

    /// @notice True when `executeDue(id)` would pay out right now.
    function isDue(uint256 id) external view returns (bool) {
        Stream storage s = streams[id];
        if (!s.active) return false;
        if (s.endTime != 0 && s.nextDue > s.endTime) return false;
        return block.timestamp >= s.nextDue && s.balance >= s.amount;
    }

    /// @notice The stream ids created by `creator`, newest last.
    function streamsOf(address creator) external view returns (uint256[] memory) {
        return createdBy[creator];
    }

    // -------------------------------------------------------------- internal

    /// @dev Finalize a completed/ended stream, refunding any unspent balance to
    ///      the creator. `paidThisCall` only changes which event detail is emitted.
    function _finish(uint256 id, Stream storage s, bool /* paidThisCall */) private {
        uint256 refund = s.balance;
        s.balance = 0;
        s.active = false;
        if (refund > 0) _send(s.creator, refund);
        emit StreamCompleted(id, refund);
    }

    function _send(address to, uint256 amount) private {
        (bool ok, ) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
