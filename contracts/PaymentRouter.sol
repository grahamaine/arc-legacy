// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title PaymentRouter — programmable USDC payments on Arc
/// @notice Two settlement primitives in native USDC:
///         1. `payAndSplit` — pay a merchant and route a fee to a fee
///            recipient atomically, in a single transaction.
///         2. Escrow (`openEscrow` / `release` / `refund`) — a payer funds an
///            escrow up front; the payment settles (split to merchant + fee)
///            only on `release`, or is routed back to a refund address on
///            `refund`. This is a conditional, multi-step settlement flow.
/// @dev    On Arc the native gas token is USDC (18 decimals at the EVM level),
///         so all amounts are plain value transfers.
contract PaymentRouter {
    uint256 public constant BPS_DENOMINATOR = 10_000;

    enum Status {
        None,
        Funded,
        Released,
        Refunded
    }

    struct Escrow {
        address payer;
        address payee;
        address feeRecipient;
        address refundTo;
        uint96 feeBps;
        uint256 amount;
        Status status;
    }

    mapping(bytes32 => Escrow) public escrows;

    event PaymentSplit(
        bytes32 indexed ref,
        address indexed payer,
        address indexed payee,
        address feeRecipient,
        uint256 netAmount,
        uint256 feeAmount
    );
    event EscrowOpened(
        bytes32 indexed id,
        address indexed payer,
        address indexed payee,
        uint256 amount
    );
    event EscrowReleased(
        bytes32 indexed id,
        address indexed payee,
        uint256 netAmount,
        uint256 feeAmount
    );
    event EscrowRefunded(
        bytes32 indexed id,
        address indexed refundTo,
        uint256 amount
    );

    error ZeroAmount();
    error ZeroAddress();
    error FeeTooHigh();
    error EscrowExists();
    error EscrowNotFunded();
    error NotAuthorized();
    error TransferFailed();

    // --------------------------------------------------------- instant split

    /// @notice Pay `payee` and route a `feeBps` cut to `feeRecipient` in one
    ///         transaction. `ref` is an arbitrary reference (e.g. an invoice id)
    ///         echoed in the event so a payment can be reconciled off-chain.
    function payAndSplit(
        address payee,
        address feeRecipient,
        uint96 feeBps,
        bytes32 ref
    ) external payable {
        if (msg.value == 0) revert ZeroAmount();
        if (payee == address(0)) revert ZeroAddress();
        if (feeBps > BPS_DENOMINATOR) revert FeeTooHigh();

        uint256 fee;
        if (feeBps > 0) {
            if (feeRecipient == address(0)) revert ZeroAddress();
            fee = (msg.value * feeBps) / BPS_DENOMINATOR;
        }
        uint256 net = msg.value - fee;

        if (fee > 0) _send(feeRecipient, fee);
        _send(payee, net);

        emit PaymentSplit(ref, msg.sender, payee, feeRecipient, net, fee);
    }

    // -------------------------------------------------------------- escrow

    /// @notice Fund an escrow for invoice `id`. The sender is the payer; funds
    ///         are held until `release` (settles to payee + fee) or `refund`
    ///         (returns to `refundTo`).
    function openEscrow(
        bytes32 id,
        address payee,
        address feeRecipient,
        address refundTo,
        uint96 feeBps
    ) external payable {
        if (escrows[id].status != Status.None) revert EscrowExists();
        if (msg.value == 0) revert ZeroAmount();
        if (payee == address(0) || refundTo == address(0)) revert ZeroAddress();
        if (feeBps > BPS_DENOMINATOR) revert FeeTooHigh();
        if (feeBps > 0 && feeRecipient == address(0)) revert ZeroAddress();

        escrows[id] = Escrow({
            payer: msg.sender,
            payee: payee,
            feeRecipient: feeRecipient,
            refundTo: refundTo,
            feeBps: feeBps,
            amount: msg.value,
            status: Status.Funded
        });

        emit EscrowOpened(id, msg.sender, payee, msg.value);
    }

    /// @notice Settle a funded escrow: split to payee and fee recipient.
    ///         Callable by either the payer (releasing on delivery) or the payee.
    function release(bytes32 id) external {
        Escrow storage e = escrows[id];
        if (e.status != Status.Funded) revert EscrowNotFunded();
        if (msg.sender != e.payer && msg.sender != e.payee) revert NotAuthorized();

        e.status = Status.Released;
        uint256 fee = e.feeBps > 0 ? (e.amount * e.feeBps) / BPS_DENOMINATOR : 0;
        uint256 net = e.amount - fee;

        if (fee > 0) _send(e.feeRecipient, fee);
        _send(e.payee, net);

        emit EscrowReleased(id, e.payee, net, fee);
    }

    /// @notice Route a funded escrow back to its refund address.
    ///         Callable by either the payer or the payee.
    function refund(bytes32 id) external {
        Escrow storage e = escrows[id];
        if (e.status != Status.Funded) revert EscrowNotFunded();
        if (msg.sender != e.payer && msg.sender != e.payee) revert NotAuthorized();

        e.status = Status.Refunded;
        uint256 amount = e.amount;
        _send(e.refundTo, amount);

        emit EscrowRefunded(id, e.refundTo, amount);
    }

    // -------------------------------------------------------------- views

    function getEscrow(bytes32 id)
        external
        view
        returns (
            address payer,
            address payee,
            address feeRecipient,
            address refundTo,
            uint96 feeBps,
            uint256 amount,
            Status status
        )
    {
        Escrow storage e = escrows[id];
        return (
            e.payer,
            e.payee,
            e.feeRecipient,
            e.refundTo,
            e.feeBps,
            e.amount,
            e.status
        );
    }

    // ------------------------------------------------------------- internal

    function _send(address to, uint256 amount) private {
        (bool ok, ) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
