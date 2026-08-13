import { useCallback, useEffect, useState } from "react";
import { Contract, formatUnits } from "ethers";
import type { WalletState } from "../hooks/useWallet";
import { coalescedRead, fmtUsdc, getReadProvider } from "../lib/chain";
import { CONTRACT_ADDRESS, fetchEstate } from "../lib/contract";
import { YIELD_VAULT_ADDRESS, fetchVaultPosition } from "../lib/yieldVault";
import { STREAMS_ADDRESS, fetchStreamsOf } from "../lib/streams";
import { ARC_EURC_ADDRESS } from "../lib/appkit";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

interface Portfolio {
  walletUsdc: bigint;
  estate: bigint;
  lendingPrincipal: bigint;
  lendingAccrued: bigint;
  streamsEscrowed: bigint;
  eurc: bigint;
  eurcDecimals: number;
}

// USDC-denominated slices of net worth (EURC is shown separately since we don't
// hold an FX rate offline). Colours reuse the app's accent palette.
const SLICES: { key: keyof Portfolio; label: string; color: string }[] = [
  { key: "walletUsdc", label: "Wallet", color: "var(--accent)" },
  { key: "estate", label: "Estate vault", color: "var(--green)" },
  { key: "lendingPrincipal", label: "Lending", color: "var(--amber)" },
  { key: "streamsEscrowed", label: "Streams", color: "#a78bfa" },
];

export function PortfolioWidget({ wallet }: { wallet: WalletState }) {
  const { account } = wallet;
  const [p, setP] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!account) return;
    setLoading(true);
    const provider = getReadProvider();
    const guard = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await fn();
      } catch {
        return fallback;
      }
    };

    (async () => {
      const eurcToken = new Contract(ARC_EURC_ADDRESS, ERC20_ABI, provider);
      const [walletUsdc, estate, lending, streamsEscrowed, eurc, eurcDecimals] =
        await Promise.all([
          guard(
            () => coalescedRead(`bal:usdc:${account}`, () => provider.getBalance(account)),
            0n
          ),
          guard(async () => {
            if (!CONTRACT_ADDRESS) return 0n;
            return (await fetchEstate(provider, account)).balance;
          }, 0n),
          guard(async () => {
            if (!YIELD_VAULT_ADDRESS) return { principal: 0n, accrued: 0n };
            const pos = await fetchVaultPosition(provider, account);
            return { principal: pos.principal, accrued: pos.accrued };
          }, { principal: 0n, accrued: 0n }),
          guard(async () => {
            if (!STREAMS_ADDRESS) return 0n;
            const list = await fetchStreamsOf(provider, account);
            return list
              .filter((s) => s.active)
              .reduce((sum, s) => sum + s.balance, 0n);
          }, 0n),
          guard(
            () => coalescedRead(`bal:eurc:${account}`, () => eurcToken.balanceOf(account)),
            0n
          ),
          guard(
            () => coalescedRead("eurc:decimals", () => eurcToken.decimals().then(Number)),
            18
          ),
        ]);
      setP({
        walletUsdc,
        estate,
        lendingPrincipal: lending.principal,
        lendingAccrued: lending.accrued,
        streamsEscrowed,
        eurc,
        eurcDecimals,
      });
      setError(null);
    })()
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [account]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const total = p
    ? p.walletUsdc + p.estate + p.lendingPrincipal + p.lendingAccrued + p.streamsEscrowed
    : 0n;
  const pct = (v: bigint) => (total === 0n ? 0 : Number((v * 10_000n) / total) / 100);

  return (
    <section className="card">
      <h3>Portfolio</h3>
      <p className="hint">
        Your whole position on Arc in one place — wallet, estate, lending and
        recurring streams, totalled in USDC and refreshed every 30s.
      </p>

      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">Net worth on Arc</span>
          <span className="stat-value" style={{ fontSize: "1.6rem" }}>
            {p ? fmtUsdc(total) : loading ? <span className="skel skel-text" /> : "—"}
            <span className="stat-unit"> USDC</span>
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Interest accruing</span>
          <span className="stat-value">
            {p ? fmtUsdc(p.lendingAccrued) : "—"}
            <span className="stat-unit"> USDC</span>
          </span>
        </div>
        {p && p.eurc > 0n && (
          <div className="stat">
            <span className="stat-label">EURC (separate)</span>
            <span className="stat-value">
              {Number(formatUnits(p.eurc, p.eurcDecimals)).toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        )}
      </div>

      {p && total > 0n && (
        <div className="chart-block">
          <div className="chart-head">
            <span className="chart-title">Allocation</span>
            <span className="chart-sub">{fmtUsdc(total)} USDC</span>
          </div>
          <div
            className="stackbar"
            role="img"
            aria-label={SLICES.map((s) => `${s.label} ${pct(p[s.key] as bigint)}%`).join(", ")}
          >
            {SLICES.map((s) =>
              (p[s.key] as bigint) > 0n ? (
                <span
                  key={s.key}
                  className="stackbar-seg"
                  style={{ width: `${pct(p[s.key] as bigint)}%`, background: s.color }}
                />
              ) : null
            )}
          </div>
          <ul className="chart-legend">
            {SLICES.map((s) => (
              <li key={s.key}>
                <span className="legend-dot" style={{ background: s.color }} />{" "}
                {s.label} · {fmtUsdc(p[s.key] as bigint)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {p && total === 0n && (
        <p className="hint">
          No positions yet — fund your wallet or estate to see your portfolio here.
        </p>
      )}
      {error && <p className="hint error">Couldn't load portfolio: {error}</p>}

      <p className="widget-note">
        <strong>Portfolio</strong> — an aggregated net-worth view across every
        Arc Legacy surface (wallet USDC, estate vault, on-chain lending, and
        escrowed recurring streams), the way a DApp's Portfolio tab unifies your
        positions.
      </p>
    </section>
  );
}
