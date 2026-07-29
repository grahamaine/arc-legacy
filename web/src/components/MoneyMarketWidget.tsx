import { useCallback, useEffect, useState } from "react";
import type { WalletState } from "../hooks/useWallet";
import { fmtUsdc, getReadProvider } from "../lib/chain";
import {
  YIELD_VAULT_ADDRESS,
  fetchVaultStats,
  type VaultStats,
} from "../lib/yieldVault";

/**
 * Read-only analytics for the on-chain money market (ArcYieldVault). Lives in
 * the data column: it shows the live rate, market size and how the vault's
 * funds split between supplier principal and the interest reserve that backs
 * it. Everything here is read straight from the contract — no actions.
 */
export function MoneyMarketWidget(_props: { wallet: WalletState }) {
  const [stats, setStats] = useState<VaultStats | null>(null);

  const refresh = useCallback(() => {
    if (!YIELD_VAULT_ADDRESS) return;
    fetchVaultStats(getReadProvider()).then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  if (!YIELD_VAULT_ADDRESS) return null;

  const apy = stats ? stats.rateBps / 100 : null;
  const principal = stats?.totalPrincipal ?? 0n;
  const reserve = stats?.reserve ?? 0n;
  const total = principal + reserve;
  const pct = (part: bigint) =>
    total === 0n ? 0 : Number((part * 10_000n) / total) / 100;

  return (
    <section className="card">
      <h3>Money market</h3>
      <p className="hint">
        Live analytics for the on-chain lending vault — read straight from the
        contract. Supply from the action rail.
      </p>

      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">Supply APY</span>
          <span className="stat-value">
            {apy !== null ? `${apy.toFixed(1)}%` : <span className="skel skel-text" />}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Market size</span>
          <span className="stat-value">
            {stats ? fmtUsdc(principal) : <span className="skel skel-text" />}
            <span className="stat-unit"> USDC</span>
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Interest reserve</span>
          <span className="stat-value">
            {stats ? fmtUsdc(reserve) : <span className="skel skel-text" />}
            <span className="stat-unit"> USDC</span>
          </span>
        </div>
      </div>

      {stats && total > 0n ? (
        <div className="chart-block">
          <div className="chart-head">
            <span className="chart-title">Vault composition</span>
            <span className="chart-sub">{fmtUsdc(total)} USDC pooled</span>
          </div>
          <div
            className="stackbar"
            role="img"
            aria-label={`Vault composition: ${pct(
              principal
            )}% supplier principal, ${pct(reserve)}% interest reserve`}
          >
            {principal > 0n && (
              <span
                className="stackbar-seg seg-principal"
                style={{ width: `${pct(principal)}%` }}
              />
            )}
            {reserve > 0n && (
              <span
                className="stackbar-seg seg-reserve"
                style={{ width: `${pct(reserve)}%` }}
              />
            )}
          </div>
          <ul className="chart-legend">
            <li>
              <span className="legend-dot seg-principal" /> Principal ·{" "}
              {fmtUsdc(principal)}
            </li>
            <li>
              <span className="legend-dot seg-reserve" /> Reserve ·{" "}
              {fmtUsdc(reserve)}
            </li>
          </ul>
        </div>
      ) : stats ? (
        <p className="hint">No deposits in the market yet — be the first to supply.</p>
      ) : null}
    </section>
  );
}
