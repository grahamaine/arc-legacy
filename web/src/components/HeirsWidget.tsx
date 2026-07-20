import { useState } from "react";
import type { WalletState } from "../hooks/useWallet";
import { useTx } from "../hooks/useTx";
import { TxStatusLine } from "./TxStatusLine";
import { BeneficiaryEditor } from "./BeneficiaryEditor";
import { getContract, type EstateView } from "../lib/contract";

export function HeirsWidget({
  wallet,
  estate,
  refresh,
}: {
  wallet: WalletState;
  estate: EstateView | null;
  refresh: () => void;
}) {
  const tx = useTx(refresh);
  const [copied, setCopied] = useState(false);

  const copyClaimLink = () => {
    navigator.clipboard
      .writeText(`${location.origin}/?owner=${wallet.account}`)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      });
  };

  return (
    <section className="card">
      <h3>Heirs</h3>
      <p className="hint">
        Each heir claims their percentage once the estate unlocks. Shares must
        total exactly 100%.
      </p>
      {estate?.unlocked ? (
        <p className="hint">Estate is unlocked — the heir list is final.</p>
      ) : (
        <BeneficiaryEditor
          key={
            estate
              ? estate.beneficiaries.map((b) => b.account + b.shareBps).join()
              : "loading"
          }
          current={estate?.beneficiaries ?? []}
          busy={tx.busy}
          onSave={(accounts, shares) =>
            tx.run("Save heirs", async () =>
              getContract(await wallet.getSigner()).setBeneficiaries(
                accounts,
                shares
              )
            )
          }
        />
      )}
      {(estate?.beneficiaries.length ?? 0) > 0 && (
        <p className="hint">
          <button className="ghost" onClick={copyClaimLink}>
            {copied ? "Copied ✓" : "Copy claim link for your heirs"}
          </button>{" "}
          — they open it, connect their wallet, and your estate is already
          filled in.
        </p>
      )}
      <TxStatusLine status={tx.status} />
    </section>
  );
}
