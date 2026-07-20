import { useState } from "react";
import { isAddress, parseEther } from "ethers";
import type { WalletState } from "../hooks/useWallet";
import { useTx } from "../hooks/useTx";
import { TxStatusLine } from "./TxStatusLine";

function prefillFromUrl(): { to: string; amount: string } {
  const params = new URLSearchParams(location.search);
  const pay = params.get("pay");
  return {
    to: pay && isAddress(pay) ? pay : "",
    amount: params.get("amount") ?? "",
  };
}

export function SendWidget({ wallet }: { wallet: WalletState }) {
  const [{ to, amount }, setForm] = useState(prefillFromUrl);
  const setTo = (v: string) => setForm((f) => ({ ...f, to: v }));
  const setAmount = (v: string) => setForm((f) => ({ ...f, amount: v }));
  const [copied, setCopied] = useState(false);
  const tx = useTx();

  const copyRequestLink = () => {
    const url = new URL(location.origin);
    url.searchParams.set("pay", wallet.account ?? "");
    if (Number(amount)) url.searchParams.set("amount", amount);
    navigator.clipboard.writeText(url.toString()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <section className="card">
      <h3>Send USDC</h3>
      <p className="hint">
        Pay anyone on Arc directly — native USDC settles in under a second.
      </p>
      <div className="field-row">
        <input
          className={to && !isAddress(to) ? "invalid" : ""}
          placeholder="Recipient (0x…)"
          value={to}
          onChange={(e) => setTo(e.target.value.trim())}
        />
      </div>
      <div className="field-row">
        <input
          placeholder="Amount (USDC)"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button
          className="primary"
          disabled={tx.busy || !isAddress(to) || !Number(amount)}
          onClick={() =>
            tx
              .run("Send", async () =>
                (await wallet.getSigner()).sendTransaction({
                  to,
                  value: parseEther(amount),
                })
              )
              .then(() => setAmount(""))
          }
        >
          Send
        </button>
      </div>
      <p className="hint">
        <button className="ghost" onClick={copyRequestLink}>
          {copied ? "Copied ✓" : "Copy payment request link"}
        </button>{" "}
        — share it and the sender's form is prefilled to pay you
        {Number(amount) ? ` ${amount} USDC` : ""}.
      </p>
      <TxStatusLine status={tx.status} />
    </section>
  );
}
