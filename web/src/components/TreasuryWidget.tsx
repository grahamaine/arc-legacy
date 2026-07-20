import { useState } from "react";
import type { WalletState } from "../hooks/useWallet";
import { getAdapter, getAppKit, kitErrorMessage } from "../lib/appkit";

interface Row {
  chain: string;
  amount: string;
}

/** Flatten the loosely-typed getBalances result into chain/amount rows. */
function toRows(result: unknown): Row[] {
  const list = Array.isArray(result)
    ? result
    : ((result as Record<string, unknown>)?.balances as unknown[]) ?? [];
  return list
    .map((item) => {
      const o = item as Record<string, unknown>;
      const chain = String(o.chain ?? o.blockchain ?? o.network ?? "?").replace(
        /_/g,
        " "
      );
      const amount = String(o.balance ?? o.amount ?? o.value ?? "0");
      return { chain, amount };
    })
    .filter((r) => Number(r.amount) > 0);
}

export function TreasuryWidget({ wallet }: { wallet: WalletState }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!wallet.account) throw new Error("Connect your wallet first.");
      const kit = await getAppKit();
      const adapter = await getAdapter();
      const result = await kit.unifiedBalance.getBalances({
        token: "USDC",
        sources: { adapter },
      });
      setRows(toRows(result));
    } catch (err) {
      setError(kitErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const total = rows?.reduce((sum, r) => sum + Number(r.amount), 0) ?? 0;

  return (
    <section className="card">
      <h3>Treasury</h3>
      <p className="hint">
        Your USDC across every chain as one treasury balance (Circle Gateway
        unified balance).
      </p>
      {rows !== null && (
        <div className="stat-row">
          <div className="stat">
            <span className="stat-label">Total USDC</span>
            <span className="stat-value">
              {total.toLocaleString(undefined, { maximumFractionDigits: 6 })}
            </span>
          </div>
        </div>
      )}
      {rows !== null &&
        (rows.length === 0 ? (
          <p className="hint">No unified balance deposits found.</p>
        ) : (
          <ul className="activity">
            {rows.map((r) => (
              <li key={r.chain}>
                <span>{r.chain}</span>
                <span>{Number(r.amount).toLocaleString()} USDC</span>
              </li>
            ))}
          </ul>
        ))}
      <button className="primary" disabled={busy} onClick={load}>
        {busy ? "Loading…" : rows === null ? "Load balances" : "Refresh"}
      </button>
      {error && <p className="hint error">{error}</p>}
    </section>
  );
}
