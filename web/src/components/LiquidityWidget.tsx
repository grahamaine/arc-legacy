import { useState } from "react";
import type { WalletState } from "../hooks/useWallet";

const POOL_TVL = 250_000; // simulated pool depth (USDC)
const APR = 0.084; // simulated APR

/**
 * Provide liquidity to the USDC/EURC pool — an interactive preview. No AMM
 * contract is deployed on Arc yet, so the pool depth and your position are
 * simulated locally to demonstrate share and yield mechanics.
 */
export function LiquidityWidget({ wallet }: { wallet: WalletState }) {
  const [provided, setProvided] = useState(0);
  const [amount, setAmount] = useState("");

  const num = Number(amount) || 0;
  const share = provided > 0 ? (provided / (POOL_TVL + provided)) * 100 : 0;
  const dailyYield = (provided * APR) / 365;
  const disabled = !wallet.account || num <= 0;

  return (
    <section className="card">
      <h3>Liquidity</h3>
      <p className="hint">
        Supply USDC/EURC to earn swap fees ({(APR * 100).toFixed(1)}% APR).
        Preview — pool depth and position are simulated until an AMM is live on
        Arc.
      </p>

      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">Your liquidity</span>
          <span className="stat-value">{provided.toFixed(2)} USDC</span>
        </div>
        <div className="stat">
          <span className="stat-label">Pool share</span>
          <span className="stat-value">{share.toFixed(3)}%</span>
        </div>
        <div className="stat">
          <span className="stat-label">Est. daily fees</span>
          <span className="stat-value">{dailyYield.toFixed(4)} USDC</span>
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
          disabled={disabled}
          onClick={() => {
            setProvided((p) => p + num);
            setAmount("");
          }}
        >
          Add
        </button>
        <button
          disabled={disabled || provided <= 0}
          onClick={() => {
            setProvided((p) => Math.max(0, p - num));
            setAmount("");
          }}
        >
          Remove
        </button>
      </div>
      <p className="widget-note">
        <strong>Liquidity</strong> — provide to the USDC/EURC pool and earn swap
        fees, with live share and yield math. Preview: pool depth is simulated
        until an AMM is live on Arc.
      </p>
    </section>
  );
}
