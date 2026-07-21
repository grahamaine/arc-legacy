import { useState } from "react";
import { isAddress } from "ethers";
import type { WalletState } from "../hooks/useWallet";

/**
 * Payments — accept payments into the app. Captures the merchant settlement,
 * fee-recipient and refund addresses, then generates a shareable checkout link.
 * Wallet payments via the link are real (they open the prefilled Send flow);
 * hosted exchange checkout and on-chain fee/refund routing need the Circle
 * Payments API / a payments contract, so those are labeled previews.
 */
export function PaymentsWidget({ wallet }: { wallet: WalletState }) {
  const [settle, setSettle] = useState(wallet.account ?? "");
  const [fee, setFee] = useState("");
  const [refund, setRefund] = useState("");
  const [amount, setAmount] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const settleAddr = settle || wallet.account || "";

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

  return (
    <section className="card">
      <h3>Payments</h3>
      <p className="hint">
        Accept payments in your app using exchanges or wallets.
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
          placeholder="Enter Fee Recipient Address"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
        />
      </div>
      <div className="field-row">
        <input
          placeholder="Enter Refund Address"
          value={refund}
          onChange={(e) => setRefund(e.target.value)}
        />
      </div>
      <p className="hint">
        The refund address is used to return funds if a payment fails. It is
        rarely needed, but required.
      </p>

      <div className="field-row">
        <input
          placeholder="Amount (USDC)"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button className="primary" onClick={create}>
          Create payment link
        </button>
      </div>

      {error && <p className="hint error">{error}</p>}

      {link && (
        <>
          <div className="pay-link">
            <a href={link} target="_blank" rel="noreferrer">
              {link}
            </a>
          </div>
          <div className="field-row">
            <button onClick={copy}>{copied ? "Copied ✓" : "Copy link"}</button>
            <button
              className="ghost"
              disabled
              title="Hosted exchange checkout needs the Circle Payments API"
            >
              Pay via exchange (preview)
            </button>
          </div>
          <p className="hint">
            Wallet payments settle directly to your address via this link. On-chain
            fee splitting and refund routing apply when settling through a payments
            processor — preview until Circle Payments API keys are configured.
          </p>
        </>
      )}
    </section>
  );
}
