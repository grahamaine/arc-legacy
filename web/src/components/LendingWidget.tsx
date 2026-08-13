import { useCallback, useEffect, useState } from "react";
import { parseEther } from "ethers";
import type { WalletState } from "../hooks/useWallet";
import { useTx } from "../hooks/useTx";
import { TxStatusLine } from "./TxStatusLine";
import { fmtUsdc, getReadProvider, isTransientRpcError } from "../lib/chain";
import {
  YIELD_VAULT_ADDRESS,
  fetchVaultPosition,
  fetchVaultStats,
  getYieldVault,
  type VaultPosition,
  type VaultStats,
} from "../lib/yieldVault";

/**
 * Lending — supply native USDC to the on-chain ArcYieldVault and earn interest.
 * This is real: your principal and accrued interest are read live from the
 * deployed contract, so they persist across sessions and wallets. Interest is
 * paid strictly from the vault's reserve, so principal is always fully backed.
 */
export function LendingWidget({ wallet }: { wallet: WalletState }) {
  const { account } = wallet;
  const [stats, setStats] = useState<VaultStats | null>(null);
  const [pos, setPos] = useState<VaultPosition | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!YIELD_VAULT_ADDRESS) return;
    const provider = getReadProvider();
    fetchVaultStats(provider).then(setStats).catch(() => {});
    if (account) {
      fetchVaultPosition(provider, account)
        .then((p) => {
          setPos(p);
          setError(null);
        })
        .catch((e) => {
          // Transient RPC hiccups (rate limits) are retried internally; if one
          // still slips through, keep the last-known position instead of
          // flashing a scary error.
          if (!isTransientRpcError(e)) setError((e as Error).message);
        });
    }
  }, [account]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const tx = useTx(refresh);

  if (!YIELD_VAULT_ADDRESS) {
    return (
      <section className="card">
        <h3>Lending</h3>
        <p className="hint">
          The ArcYieldVault contract is not configured. Set VITE_YIELD_VAULT to
          enable on-chain lending.
        </p>
      </section>
    );
  }

  const apy = stats ? stats.rateBps / 100 : null;
  const principal = pos?.principal ?? 0n;
  const accrued = pos?.accrued ?? 0n;
  let num = 0n;
  try {
    num = amount ? parseEther(amount) : 0n;
  } catch {
    num = 0n;
  }
  const busy = tx.busy;
  const canSupply = !!account && num > 0n && !busy;
  const canWithdraw = !!account && num > 0n && num <= principal && !busy;
  const canClaim = !!account && accrued > 0n && !busy;

  return (
    <section className="card">
      <h3>Lending</h3>
      <p className="hint">
        Supply USDC to the on-chain money market and earn interest
        {apy !== null ? ` (${apy.toFixed(1)}% APY)` : ""}. Real vault — positions
        live on-chain; principal is always fully backed by the contract.
      </p>

      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">Your principal</span>
          <span className="stat-value">{fmtUsdc(principal)} USDC</span>
        </div>
        <div className="stat">
          <span className="stat-label">Interest earned</span>
          <span className="stat-value">{fmtUsdc(accrued)} USDC</span>
        </div>
        <div className="stat">
          <span className="stat-label">Supply APY</span>
          <span className="stat-value">{apy !== null ? `${apy.toFixed(1)}%` : "—"}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Market size</span>
          <span className="stat-value">
            {stats ? fmtUsdc(stats.totalPrincipal) : "—"}
            <span className="stat-unit"> USDC</span>
          </span>
        </div>
      </div>

      <div className="field-row">
        <input
          placeholder="Amount (USDC)"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button
          className="primary"
          disabled={!canSupply}
          onClick={() =>
            tx
              .run("Supply USDC", async () =>
                getYieldVault(await wallet.getSigner()).supply({ value: num })
              )
              .then(() => setAmount(""))
          }
        >
          Supply
        </button>
        <button
          disabled={!canWithdraw}
          onClick={() =>
            tx
              .run("Withdraw USDC", async () =>
                getYieldVault(await wallet.getSigner()).withdraw(num)
              )
              .then(() => setAmount(""))
          }
        >
          Withdraw
        </button>
      </div>

      <button className="ghost" disabled={!canClaim} onClick={() =>
        tx.run("Claim interest", async () =>
          getYieldVault(await wallet.getSigner()).claimInterest()
        )
      }>
        {accrued > 0n ? `Claim ${fmtUsdc(accrued)} USDC interest` : "No interest yet"}
      </button>

      {stats && stats.reserve === 0n && accrued > 0n && (
        <p className="hint">
          Interest reserve is empty right now, so claims are paused until it's
          topped up — your principal stays fully withdrawable.
        </p>
      )}
      {error && <p className="hint error">{error}</p>}
      <TxStatusLine status={tx.status} />
      <p className="widget-note">
        <strong>Lending</strong> — supply USDC to the on-chain ArcYieldVault and
        earn interest. Real vault: positions persist on-chain and principal is
        always fully backed by a separately-funded reserve.
      </p>
    </section>
  );
}
