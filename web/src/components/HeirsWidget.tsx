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
      <TxStatusLine status={tx.status} />
    </section>
  );
}
