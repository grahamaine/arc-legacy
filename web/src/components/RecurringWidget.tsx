import { useCallback, useEffect, useState } from "react";
import { isAddress, parseEther } from "ethers";
import type { WalletState } from "../hooks/useWallet";
import { useTx } from "../hooks/useTx";
import { TxStatusLine } from "./TxStatusLine";
import {
  STREAMS_ADDRESS,
  fetchStreamsOf,
  getStreamsContract,
  type StreamView,
} from "../lib/streams";
import {
  fmtDuration,
  fmtUsdc,
  getReadProvider,
  shortAddress,
} from "../lib/chain";

// Payout cadences. Short ones make the feature demoable within a hackathon; the
// monthly/weekly ones are the real estate-planning use cases.
const FREQ = [
  { label: "Every 5 minutes", secs: 300 },
  { label: "Hourly", secs: 3_600 },
  { label: "Daily", secs: 86_400 },
  { label: "Weekly", secs: 604_800 },
  { label: "Monthly", secs: 2_592_000 },
] as const;

function useNow(stepMs = 15_000): bigint {
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  useEffect(() => {
    const id = setInterval(
      () => setNow(BigInt(Math.floor(Date.now() / 1000))),
      stepMs
    );
    return () => clearInterval(id);
  }, [stepMs]);
  return now;
}

export function RecurringWidget({ wallet }: { wallet: WalletState }) {
  const { account } = wallet;
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [secs, setSecs] = useState<number>(FREQ[3].secs); // default weekly
  const [periods, setPeriods] = useState("4");
  const [list, setList] = useState<StreamView[] | null>(null);
  const now = useNow();

  const load = useCallback(() => {
    if (!account || !STREAMS_ADDRESS) return;
    fetchStreamsOf(getReadProvider(), account)
      .then(setList)
      .catch(() => setList([]));
  }, [account]);

  useEffect(load, [load]);
  const tx = useTx(load);

  // Not deployed yet — show the same "unlocks on deploy" pattern as the vault.
  if (!STREAMS_ADDRESS) {
    return (
      <section className="card">
        <h3>Recurring</h3>
        <p className="hint">
          Schedule recurring USDC payments — auto-fund your estate or pay an heir
          a fixed allowance on a cadence. Unlocks once the LegacyStreams contract
          is deployed on Arc.
        </p>
        <p className="widget-note">
          <strong>Legacy Streams</strong> — a "recurring order" for estates:
          dollar-cost-average contributions into your vault, or stream an heir a
          scheduled annuity. The autonomous keeper settles each due payment, so
          the money keeps moving with no human in the loop.
        </p>
      </section>
    );
  }

  const amt = Number(amount);
  const periodCount = Math.max(1, Math.floor(Number(periods) || 0));
  const validRecipient = isAddress(recipient);
  const canCreate = !tx.busy && validRecipient && amt > 0 && periodCount >= 1;

  const create = () =>
    tx
      .run("Create recurring payment", async () => {
        const perPeriod = parseEther(amount);
        const value = perPeriod * BigInt(periodCount);
        return getStreamsContract(await wallet.getSigner()).createStream(
          recipient,
          perPeriod,
          secs,
          0,
          { value }
        );
      })
      .then(() => {
        setRecipient("");
        setAmount("");
      });

  const fundOne = (s: StreamView) =>
    tx.run(`Fund stream #${s.id}`, async () =>
      getStreamsContract(await wallet.getSigner()).fund(s.id, {
        value: s.amount,
      })
    );

  const cancel = (s: StreamView) =>
    tx.run(`Cancel stream #${s.id}`, async () =>
      getStreamsContract(await wallet.getSigner()).cancel(s.id)
    );

  const active = (list ?? []).filter((s) => s.active);

  return (
    <section className="card">
      <h3>Recurring</h3>
      <p className="hint">
        Set up a recurring USDC payment — a scheduled contribution or an heir
        annuity. You escrow a few periods up front; the keeper pays each one as
        it comes due.
      </p>

      <input
        placeholder="Recipient address (0x…)"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value.trim())}
      />
      {recipient && !validRecipient && (
        <p className="hint error">That doesn't look like a valid address.</p>
      )}
      <div className="field-row">
        <input
          placeholder="Amount per payment (USDC)"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <select value={secs} onChange={(e) => setSecs(Number(e.target.value))}>
          {FREQ.map((f) => (
            <option key={f.secs} value={f.secs}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field-row">
        <input
          placeholder="Prefund how many payments?"
          inputMode="numeric"
          value={periods}
          onChange={(e) => setPeriods(e.target.value)}
        />
        <button className="primary" disabled={!canCreate} onClick={create}>
          Create
        </button>
      </div>
      {amt > 0 && (
        <p className="hint">
          Escrows {fmtUsdc(parseEther(amount || "0") * BigInt(periodCount))} USDC
          now — {amount} USDC {FREQ.find((f) => f.secs === secs)?.label.toLowerCase()},
          for {periodCount} payment{periodCount === 1 ? "" : "s"}.
        </p>
      )}

      {list === null ? (
        <p className="hint">Loading your streams…</p>
      ) : active.length === 0 ? (
        <p className="hint">No active streams yet.</p>
      ) : (
        <ul className="mini-list">
          {active.map((s) => {
            const remaining = s.nextDue - now;
            const due = remaining <= 0n;
            const funded = s.balance >= s.amount;
            return (
              <li key={s.id.toString()} className="stream-row">
                <div>
                  <strong>{fmtUsdc(s.amount)} USDC</strong> /{" "}
                  {fmtDuration(s.interval)} → {shortAddress(s.recipient)}
                  <br />
                  <span className="hint" style={{ margin: 0 }}>
                    {!funded
                      ? "Underfunded — top up to continue"
                      : due
                        ? "Payment due now"
                        : `Next in ${fmtDuration(remaining)}`}{" "}
                    · {fmtUsdc(s.balance)} USDC escrowed
                  </span>
                </div>
                <div className="field-row" style={{ margin: 0 }}>
                  <button disabled={tx.busy} onClick={() => fundOne(s)}>
                    Fund +1
                  </button>
                  <button className="ghost" disabled={tx.busy} onClick={() => cancel(s)}>
                    Cancel
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <TxStatusLine status={tx.status} />
      <p className="widget-note">
        <strong>Legacy Streams</strong> — recurring USDC on Arc: DCA into your
        estate (each contribution also checks you in) or pay an heir a scheduled
        allowance. Pre-funded and settled by the autonomous keeper, so it runs
        with no human in the loop.
      </p>
    </section>
  );
}
