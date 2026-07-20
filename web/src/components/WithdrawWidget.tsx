import { useState } from "react";
import { parseEther } from "ethers";
import type { WalletState } from "../hooks/useWallet";
import { useTx } from "../hooks/useTx";
import { TxStatusLine } from "./TxStatusLine";
import { getContract, type EstateView } from "../lib/contract";
import { fmtUsdc } from "../lib/chain";

export function WithdrawWidget({
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
      <h3>Withdraw</h3>
      <p className="hint">
        Pull USDC back out while your estate is still locked
        {estate ? ` — ${fmtUsdc(estate.balance)} USDC available` : ""}.
      </p>
      <div className="field-row">
        <input
          placeholder="Amount (USDC)"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button
          disabled={tx.busy || !Number(amount) || !locked}
          onClick={() =>
            tx
              .run("Withdraw", async () =>
                getContract(await wallet.getSigner()).withdraw(parseEther(amount))
              )
              .then(() => setAmount(""))
          }
        >
          Withdraw
        </button>
      </div>
      {!locked && <p className="hint">Estate is unlocked — withdrawals disabled.</p>}
      <TxStatusLine status={tx.status} />
    </section>
  );
}
