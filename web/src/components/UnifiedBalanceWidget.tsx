import { useState } from "react";
import type { WalletState } from "../hooks/useWallet";
import { getAppKit, kitErrorMessage } from "../lib/appkit";

/** Pull a human-readable amount out of a loosely-typed kit result. */
function pickAmount(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string" || typeof value === "number") return String(value);
  const obj = value as Record<string, unknown>;
  for (const key of ["amount", "balance", "value", "total"]) {
    if (obj[key] != null) return pickAmount(obj[key]);
  }
  return JSON.stringify(value);
}

/**
 * Unified USDC balance across chains via Circle Gateway
 * (`kit.unifiedBalance.getBalances`). Gateway is a testnet preview, so the call
 * can be unavailable on some chains — errors are surfaced, not hidden.
 */
export function UnifiedBalanceWidget({ wallet }: { wallet: WalletState }) {
  const { account } = wallet;
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!account) return;
    setBusy(true);
    setError(null);
    try {
      const kit = await getAppKit();
      const res = (await kit.unifiedBalance.getBalances({
        token: "USDC",
        sources: { address: account },
        includePending: true,
      })) as { totalConfirmedBalance?: unknown; totalPendingBalance?: unknown };
      setConfirmed(pickAmount(res.totalConfirmedBalance));
      setPending(pickAmount(res.totalPendingBalance));
    } catch (err) {
      setError(kitErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h3>Unified balance</h3>
      <p className="hint">
        Your total USDC across chains, aggregated by Circle Gateway (testnet
        preview).
      </p>
      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">Confirmed USDC</span>
          <span className="stat-value">{confirmed ?? "—"}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Pending</span>
          <span className="stat-value">{pending ?? "—"}</span>
        </div>
      </div>
      <button className="primary" disabled={busy || !account} onClick={load}>
        {busy ? "Aggregating…" : "Refresh unified balance"}
      </button>
      {error && <p className="hint error">{error}</p>}
    </section>
  );
}
