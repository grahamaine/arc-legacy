import { useState } from "react";
import { isAddress, parseEther } from "ethers";
import type { WalletState } from "../hooks/useWallet";
import { useTx } from "../hooks/useTx";
import { TxStatusLine } from "./TxStatusLine";

export function SendWidget({ wallet }: { wallet: WalletState }) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const tx = useTx();

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
      <TxStatusLine status={tx.status} />
    </section>
  );
}
