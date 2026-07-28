import { useCallback, useEffect, useState } from "react";
import type { WalletState } from "../hooks/useWallet";
import { fetchGasSummary, type GasSummary } from "../lib/arcscan";
import { fmtUsdc } from "../lib/chain";

/**
 * Lifetime gas spent — in USDC. On most chains gas is paid in a volatile
 * native token; on Arc it's USDC, so this is a real, dollar-denominated tally
 * of everything the connected wallet has ever spent on fees. It reads the
 * explorer's tx list directly, so it reflects on-chain history, not just this
 * session.
 */
export function GasMeterWidget({ wallet }: { wallet: WalletState }) {
  const { account } = wallet;
  const [summary, setSummary] = useState<GasSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    if (!account) return;
    setLoading(true);
    fetchGasSummary(account)
      .then((s) => {
        setSummary(s);
        setError(null);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [account]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  const since =
    summary?.firstTs != null
      ? new Date(summary.firstTs * 1000).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : null;

  return (
    <section className="card">
      <h3>Gas spent — in USDC</h3>
      <p className="hint">
        Arc pays gas in USDC, so your lifetime fees are a real dollar figure —
        pulled from on-chain history.
      </p>

      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">Lifetime gas</span>
          <span className="stat-value">
            {summary ? `${fmtUsdc(summary.totalFeeWei)}` : loading ? "…" : "—"}
            <span className="stat-unit"> USDC</span>
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Transactions</span>
          <span className="stat-value">{summary ? summary.txCount : "—"}</span>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">Avg fee / tx</span>
          <span className="stat-value">
            {summary ? fmtUsdc(summary.avgFeeWei) : "—"}
            <span className="stat-unit"> USDC</span>
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Reverted</span>
          <span className="stat-value">
            {summary ? summary.failedCount : "—"}
          </span>
        </div>
      </div>

      {since && (
        <p className="hint" style={{ marginTop: "0.5rem" }}>
          Active on Arc since {since}.
        </p>
      )}
      {error && <p className="banner warning">Couldn't load gas history: {error}</p>}
    </section>
  );
}
