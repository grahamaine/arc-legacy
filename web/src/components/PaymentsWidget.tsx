import { useState } from "react";
import { hexlify, isAddress, parseEther, randomBytes, ZeroAddress, encodeBytes32String } from "ethers";
import type { WalletState } from "../hooks/useWallet";
import { useTx } from "../hooks/useTx";
import { TxStatusLine } from "./TxStatusLine";
import { ARC_LEGACY_TREASURY } from "../lib/chain";
import { PAYMENT_ROUTER_ADDRESS, getPaymentRouter } from "../lib/paymentRouter";

/**
 * Payments — accept USDC payments in the app. Two real on-chain settlement
 * paths via the PaymentRouter contract on Arc:
 *   • Pay & split — pay the merchant and route a fee to a fee recipient in one
 *     transaction.
 *   • Escrow — fund up front, then release (settle) or refund on condition.
 * Plus a shareable checkout link that opens the prefilled wallet Send flow.
 */
export function PaymentsWidget({ wallet }: { wallet: WalletState }) {
  const [settle, setSettle] = useState(ARC_LEGACY_TREASURY);
  const [fee, setFee] = useState(ARC_LEGACY_TREASURY);
  const [refund, setRefund] = useState(ARC_LEGACY_TREASURY);
  const [feePct, setFeePct] = useState("1");
  const [amount, setAmount] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [escrowId, setEscrowId] = useState<string | null>(null);

  const tx = useTx();
  const onChain = Boolean(PAYMENT_ROUTER_ADDRESS);

  const settleAddr = settle || ARC_LEGACY_TREASURY;
  const feeBps = Math.round((Number(feePct) || 0) * 100);
  const feeAddr = feeBps > 0 ? fee || ARC_LEGACY_TREASURY : ZeroAddress;

  const create = () => {
    setError(null);
    setLink(null);
    if (!isAddress(settleAddr)) return setError("Enter a valid settlement address.");
    if (fee && !isAddress(fee)) return setError("Fee recipient address is invalid.");
    if (refund && !isAddress(refund)) return setError("Refund address is invalid.");
    if (!(Number(amount) > 0)) return setError("Enter an amount greater than 0.");
    const url = new URL(location.origin);
    url.searchParams.set("pay", settleAddr);
    url.searchParams.set("amount", amount);
    setLink(url.toString());
  };

  const copy = () => {
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  /** Validate the shared fields before any on-chain call. */
  const validate = (needRefund = false): string | null => {
    if (!wallet.account) return "Connect your wallet first.";
    if (!isAddress(settleAddr)) return "Enter a valid settlement address.";
    if (feeBps < 0 || feeBps > 10_000) return "Fee must be between 0% and 100%.";
    if (feeBps > 0 && !isAddress(feeAddr)) return "Enter a valid fee recipient.";
    if (needRefund && !isAddress(refund)) return "Enter a valid refund address.";
    if (!(Number(amount) > 0)) return "Enter an amount greater than 0.";
    return null;
  };

  const paySplit = () => {
    const v = validate();
    if (v) return setError(v);
    setError(null);
    const ref = encodeBytes32String(`arc-${Date.now().toString(36)}`.slice(0, 31));
    tx.run("Pay & split", async () =>
      getPaymentRouter(await wallet.getSigner()).payAndSplit(
        settleAddr,
        feeAddr,
        feeBps,
        ref,
        { value: parseEther(amount) }
      )
    );
  };

  const openEscrow = () => {
    const v = validate(true);
    if (v) return setError(v);
    setError(null);
    const id = hexlify(randomBytes(32));
    tx.run("Open escrow", async () =>
      getPaymentRouter(await wallet.getSigner()).openEscrow(
        id,
        settleAddr,
        feeAddr,
        refund,
        feeBps,
        { value: parseEther(amount) }
      )
    ).then(() => setEscrowId(id));
  };

  const releaseEscrow = () => {
    if (!escrowId) return;
    tx.run("Release escrow", async () =>
      getPaymentRouter(await wallet.getSigner()).release(escrowId)
    ).then(() => setEscrowId(null));
  };

  const refundEscrow = () => {
    if (!escrowId) return;
    tx.run("Refund escrow", async () =>
      getPaymentRouter(await wallet.getSigner()).refund(escrowId)
    ).then(() => setEscrowId(null));
  };

  return (
    <section className="card">
      <h3>Payments</h3>
      <p className="hint">
        Accept USDC payments with on-chain fee splitting and conditional escrow,
        or share a checkout link.
      </p>

      <div className="field-row">
        <input
          placeholder="Settlement address (where funds land)"
          value={settle}
          onChange={(e) => setSettle(e.target.value)}
        />
      </div>
      <div className="field-row">
        <input
          placeholder="Fee recipient address"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
        />
        <input
          placeholder="Fee %"
          inputMode="decimal"
          style={{ maxWidth: "5.5rem" }}
          value={feePct}
          onChange={(e) => setFeePct(e.target.value)}
        />
      </div>
      <div className="field-row">
        <input
          placeholder="Refund address (for escrow)"
          value={refund}
          onChange={(e) => setRefund(e.target.value)}
        />
      </div>
      <div className="field-row">
        <input
          placeholder="Amount (USDC)"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      {error && <p className="hint error">{error}</p>}

      {onChain ? (
        <>
          <div className="field-row">
            <button className="primary" disabled={tx.busy} onClick={paySplit}>
              Pay &amp; split on-chain
            </button>
            {!escrowId ? (
              <button disabled={tx.busy} onClick={openEscrow}>
                Open escrow
              </button>
            ) : (
              <>
                <button disabled={tx.busy} onClick={releaseEscrow}>
                  Release
                </button>
                <button disabled={tx.busy} onClick={refundEscrow}>
                  Refund
                </button>
              </>
            )}
          </div>
          {escrowId && (
            <p className="hint">
              Escrow funded and held on-chain — settle it with <strong>Release</strong>{" "}
              (splits to merchant + fee) or return it with <strong>Refund</strong>.
            </p>
          )}
          <TxStatusLine status={tx.status} />
        </>
      ) : (
        <p className="hint">
          On-chain settlement is disabled — set <code>VITE_PAYMENT_ROUTER</code> to
          the deployed PaymentRouter address to enable it.
        </p>
      )}

      <div className="field-row">
        <button className="ghost" onClick={create}>
          Create checkout link
        </button>
      </div>

      {link && (
        <>
          <div className="pay-link">
            <a href={link} target="_blank" rel="noreferrer">
              {link}
            </a>
          </div>
          <div className="field-row">
            <button onClick={copy}>{copied ? "Copied ✓" : "Copy link"}</button>
          </div>
          <p className="hint">
            The link opens the prefilled wallet Send flow, settling USDC directly
            to your settlement address.
          </p>
        </>
      )}
    </section>
  );
}
