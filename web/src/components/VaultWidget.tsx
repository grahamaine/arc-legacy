import { useEffect, useState } from "react";
import type { WalletState } from "../hooks/useWallet";
import { useTx } from "../hooks/useTx";
import { TxStatusLine } from "./TxStatusLine";
import { getContract, type EstateView } from "../lib/contract";
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

export function VaultWidget({
  wallet,
  estate,
  refresh,
}: {
  wallet: WalletState;
  estate: EstateView | null;
  refresh: () => void;
}) {
  const [intervalDays, setIntervalDays] = useState("");
  const [vestDays, setVestDays] = useState("");
  const now = useNow();
  const tx = useTx(refresh);

  if (!estate) {
    return (
      <section className="card">
        <h3>Vault</h3>
        <p className="hint">Loading your estate…</p>
      </section>
    );
  }

  const hasEstate = estate.lastCheckIn !== 0n;
  const deadline = estate.lastCheckIn + estate.checkInInterval;
  const timeLeft = deadline - now;
  const pastDeadline = hasEstate && timeLeft <= 0n;

  return (
    <section className="card">
      <h3>Vault</h3>
      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">Balance</span>
          <span className="stat-value">{fmtUsdc(estate.balance)} USDC</span>
        </div>
        <div className="stat">
          <span className="stat-label">Status</span>
          {estate.unlocked ? (
            <span className="pill unlocked">Unlocked — heirs claiming</span>
          ) : !hasEstate ? (
            <span className="pill">No estate yet</span>
          ) : pastDeadline ? (
            <span className="pill warning">Deadline missed!</span>
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
        {hasEstate && (
          <div className="stat">
            <span className="stat-label">Payout</span>
            <span className="stat-value" style={{ fontSize: "1rem" }}>
              {estate.vestingDuration > 0n
                ? `Streamed over ${fmtDuration(estate.vestingDuration)}`
                : "Lump sum"}
            </span>
          </div>
        )}
      </div>

      {hasEstate && !estate.unlocked && (
        <div
          className="progress"
          title="Time elapsed since your last check-in"
        >
          <div
            className={
              pastDeadline
                ? "progress-fill danger"
                : timeLeft < estate.checkInInterval / 4n
                  ? "progress-fill warn"
                  : "progress-fill"
            }
            style={{
              width: `${Math.min(
                100,
                Number(((now - estate.lastCheckIn) * 100n) / estate.checkInInterval)
              )}%`,
            }}
          />
        </div>
      )}

      {estate.unlocked ? (
        <p className="hint">
          A beneficiary claim has unlocked this estate; owner actions are
          disabled.
        </p>
      ) : (
        <>
          <p className="hint">
            Check in to reset your dead-man's-switch. Deposits, withdrawals and
            settings changes also count.
          </p>
          <button
            className="primary"
            disabled={tx.busy}
            onClick={() =>
              tx.run("Check in", async () =>
                getContract(await wallet.getSigner()).checkIn()
              )
            }
          >
            Check in
          </button>
          <div className="field-row">
            <input
              placeholder={`Interval — now ${
                hasEstate ? fmtDuration(estate.checkInInterval) : "30d (default)"
              }`}
              inputMode="numeric"
              value={intervalDays}
              onChange={(e) => setIntervalDays(e.target.value)}
            />
            <button
              disabled={tx.busy || !Number(intervalDays)}
              onClick={() =>
                tx
                  .run("Set interval", async () =>
                    getContract(await wallet.getSigner()).setCheckInInterval(
                      BigInt(Math.round(Number(intervalDays) * 86_400))
                    )
                  )
                  .then(() => setIntervalDays(""))
              }
            >
              Set days
            </button>
          </div>
          <p className="hint" style={{ marginTop: "0.6rem" }}>
            Vesting — stream each heir's share over this many days after unlock
            (0 = immediate lump sum). Now:{" "}
            {estate.vestingDuration > 0n
              ? fmtDuration(estate.vestingDuration)
              : "lump sum"}
            .
          </p>
          <div className="field-row">
            <input
              placeholder="Vesting days (0 = lump sum)"
              inputMode="numeric"
              value={vestDays}
              onChange={(e) => setVestDays(e.target.value)}
            />
            <button
              disabled={tx.busy || vestDays === ""}
              onClick={() =>
                tx
                  .run("Set vesting", async () =>
                    getContract(await wallet.getSigner()).setVesting(
                      BigInt(Math.round(Number(vestDays) * 86_400))
                    )
                  )
                  .then(() => setVestDays(""))
              }
            >
              Set vesting
            </button>
          </div>
        </>
      )}
      <TxStatusLine status={tx.status} />
    </section>
  );
}
