import { useState } from "react";
import { parseEther } from "ethers";
import type { WalletState } from "../hooks/useWallet";
import { useTx } from "../hooks/useTx";
import { TxStatusLine } from "./TxStatusLine";
import { getContract, type EstateView } from "../lib/contract";

export function DepositWidget({
  wallet,
  estate,
  refresh,
}: {
  wallet: WalletState;
  estate: EstateView | null;
  refresh: () => void;
}) {
  const [amount, setAmount] = useState("");
  const tx = useTx(refresh);
  const locked = !estate?.unlocked;

  return (
    <section className="card">
      <h3>Deposit</h3>
      <p className="hint">
        Fund your estate with native USDC. Every deposit also counts as a
        check-in.
      </p>
      <div className="field-row">
        <input
          placeholder="Amount (USDC)"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button
          className="primary"
          disabled={tx.busy || !Number(amount) || !locked}
          onClick={() =>
            tx
              .run("Deposit", async () =>
                getContract(await wallet.getSigner()).deposit({
                  value: parseEther(amount),
                })
              )
              .then(() => setAmount(""))
          }
        >
          Deposit
        </button>
      </div>
      {!locked && <p className="hint">Estate is unlocked — deposits disabled.</p>}
      <TxStatusLine status={tx.status} />
    </section>
  );
}
