import { useCallback, useEffect, useState } from "react";
import { Contract, formatUnits } from "ethers";
import type { WalletState } from "../hooks/useWallet";
import { ARC_EURC_ADDRESS } from "../lib/appkit";
import { fmtUsdc } from "../lib/chain";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

export function BalancesWidget({ wallet }: { wallet: WalletState }) {
  const { account, provider } = wallet;
  const [usdc, setUsdc] = useState<bigint | null>(null);
  const [eurc, setEurc] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!provider || !account) return;
    provider.getBalance(account).then(setUsdc).catch(() => {});
    const token = new Contract(ARC_EURC_ADDRESS, ERC20_ABI, provider);
    Promise.all([token.balanceOf(account), token.decimals()])
      .then(([bal, dec]) => setEurc(formatUnits(bal, dec)))
      .catch(() => setEurc(null));
  }, [provider, account]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <section className="card">
      <h3>Wallet balances</h3>
      <p className="hint">Your funds on Arc testnet, refreshed every 30s.</p>
      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">USDC (gas)</span>
          <span className="stat-value">
            {usdc === null ? "—" : fmtUsdc(usdc)}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">EURC</span>
          <span className="stat-value">
            {eurc === null
              ? "—"
              : Number(eurc).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 6,
                })}
          </span>
        </div>
      </div>
    </section>
  );
}
