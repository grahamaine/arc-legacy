import { useCallback, useEffect, useState } from "react";
import { parseEther } from "ethers";
import type { WalletState } from "../hooks/useWallet";
import { useTx } from "../hooks/useTx";
import { TxStatusLine } from "./TxStatusLine";
import { BeneficiaryEditor } from "./BeneficiaryEditor";
import { fetchEstate, getContract, type EstateView } from "../lib/contract";
import { fmtDuration, fmtUsdc } from "../lib/chain";

function useNow(): bigint {
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  useEffect(() => {
    const id = setInterval(
      () => setNow(BigInt(Math.floor(Date.now() / 1000))),
      30_000
    );
    return () => clearInterval(id);
  }, []);
  return now;
}

export function EstatePanel({ wallet }: { wallet: WalletState }) {
  const { account, provider } = wallet;
  const [estate, setEstate] = useState<EstateView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [intervalDays, setIntervalDays] = useState("");
  const now = useNow();

  const refresh = useCallback(() => {
    if (!provider || !account) return;
    fetchEstate(provider, account)
      .then((e) => {
        setEstate(e);
        setLoadError(null);
      })
      .catch((err) => setLoadError((err as Error).message));
  }, [provider, account]);

  useEffect(refresh, [refresh]);

  const tx = useTx(refresh);

  if (!account) return null;
  if (loadError) return <p className="hint error">Could not load estate: {loadError}</p>;
  if (!estate) return <p className="hint">Loading your estate…</p>;

  const hasEstate = estate.lastCheckIn !== 0n;
  const deadline = estate.lastCheckIn + estate.checkInInterval;
  const timeLeft = deadline - now;
  const pastDeadline = hasEstate && timeLeft <= 0n;

  const withSigner = (
    label: string,
    call: (c: ReturnType<typeof getContract>) => Promise<any>
  ) => tx.run(label, async () => call(getContract(await wallet.getSigner())));

  return (
    <div className="panel">
      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">Estate balance</span>
          <span className="stat-value">{fmtUsdc(estate.balance)} USDC</span>
        </div>
        <div className="stat">
          <span className="stat-label">Status</span>
          {estate.unlocked ? (
            <span className="pill unlocked">Unlocked — heirs claiming</span>
          ) : !hasEstate ? (
            <span className="pill">No estate yet</span>
          ) : pastDeadline ? (
            <span className="pill warning">Deadline missed — check in now!</span>
          ) : (
            <span className="pill active">Active</span>
          )}
        </div>
        {hasEstate && !estate.unlocked && (
          <div className="stat">
            <span className="stat-label">Next check-in due</span>
            <span className="stat-value">
              {pastDeadline ? "Overdue" : `in ${fmtDuration(timeLeft)}`}
            </span>
          </div>
        )}
      </div>

      {estate.unlocked ? (
        <p className="hint">
          This estate has been unlocked by a beneficiary claim. The remaining
          balance is reserved for heirs; owner actions are disabled.
        </p>
      ) : (
        <>
          <section className="card">
            <h3>Prove you're alive</h3>
            <p className="hint">
              Resets your dead-man's-switch. Deposits, withdrawals and settings
              changes also count as check-ins.
            </p>
            <button
              className="primary"
              disabled={tx.busy}
              onClick={() => withSigner("Check in", (c) => c.checkIn())}
            >
              Check in
            </button>
          </section>

          <section className="card">
            <h3>Funds</h3>
            <div className="field-row">
              <input
                placeholder="Amount (USDC)"
                inputMode="decimal"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
              />
              <button
                disabled={tx.busy || !Number(depositAmount)}
                onClick={() =>
                  withSigner("Deposit", (c) =>
                    c.deposit({ value: parseEther(depositAmount) })
                  ).then(() => setDepositAmount(""))
                }
              >
                Deposit
              </button>
            </div>
            <div className="field-row">
              <input
                placeholder="Amount (USDC)"
                inputMode="decimal"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
              />
              <button
                disabled={tx.busy || !Number(withdrawAmount)}
                onClick={() =>
                  withSigner("Withdraw", (c) =>
                    c.withdraw(parseEther(withdrawAmount))
                  ).then(() => setWithdrawAmount(""))
                }
              >
                Withdraw
              </button>
            </div>
          </section>

          <section className="card">
            <h3>Check-in interval</h3>
            <p className="hint">
              How long you can go silent before the estate unlocks. Currently:{" "}
              {hasEstate ? fmtDuration(estate.checkInInterval) : "30d (default)"}.
            </p>
            <div className="field-row">
              <input
                placeholder="Days"
                inputMode="numeric"
                value={intervalDays}
                onChange={(e) => setIntervalDays(e.target.value)}
              />
              <button
                disabled={tx.busy || !Number(intervalDays)}
                onClick={() =>
                  withSigner("Set interval", (c) =>
                    c.setCheckInInterval(
                      BigInt(Math.round(Number(intervalDays) * 86_400))
                    )
                  ).then(() => setIntervalDays(""))
                }
              >
                Set interval
              </button>
            </div>
          </section>

          <section className="card">
            <h3>Heirs</h3>
            <p className="hint">
              Each heir claims their percentage once the estate unlocks. Shares
              must total exactly 100%.
            </p>
            <BeneficiaryEditor
              key={estate.beneficiaries.map((b) => b.account + b.shareBps).join()}
              current={estate.beneficiaries}
              busy={tx.busy}
              onSave={(accounts, shares) =>
                withSigner("Save heirs", (c) => c.setBeneficiaries(accounts, shares))
              }
            />
          </section>
        </>
      )}

      <TxStatusLine status={tx.status} />
    </div>
  );
}
