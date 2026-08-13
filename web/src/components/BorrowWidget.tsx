import { useState } from "react";
import type { WalletState } from "../hooks/useWallet";

const MAX_LTV = 0.75; // borrow up to 75% of collateral value
const LIQ_THRESHOLD = 0.8; // liquidation at 80%

/**
 * Borrow against USDC collateral — an interactive preview. No lending market is
 * deployed on Arc yet, so balances are simulated locally to demonstrate the
 * collateral / LTV / health-factor mechanics.
 */
export function BorrowWidget({ wallet }: { wallet: WalletState }) {
  const [collateral, setCollateral] = useState(0);
  const [borrowed, setBorrowed] = useState(0);
  const [amount, setAmount] = useState("");

  const num = Number(amount) || 0;
  const available = Math.max(0, collateral * MAX_LTV - borrowed);
  const health = borrowed > 0 ? (collateral * LIQ_THRESHOLD) / borrowed : Infinity;
  const healthLabel = health === Infinity ? "—" : health.toFixed(2);
  const healthClass = health === Infinity || health >= 1.5 ? "active" : health >= 1.15 ? "warning" : "unlocked";

  const disabled = !wallet.account || num <= 0;

  return (
    <section className="card">
      <h3>Borrow · Collateral</h3>
      <p className="hint">
        Post USDC as collateral and borrow against it (up to {MAX_LTV * 100}% LTV).
        Preview — balances are simulated until a lending market is live on Arc.
      </p>

      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">Collateral</span>
          <span className="stat-value">{collateral.toFixed(2)} USDC</span>
        </div>
        <div className="stat">
          <span className="stat-label">Borrowed</span>
          <span className="stat-value">{borrowed.toFixed(2)} USDC</span>
        </div>
        <div className="stat">
          <span className="stat-label">Available</span>
          <span className="stat-value">{available.toFixed(2)} USDC</span>
        </div>
        <div className="stat">
          <span className="stat-label">Health factor</span>
          <span className={`pill ${healthClass}`}>{healthLabel}</span>
        </div>
      </div>

      <div className="field-row">
        <input
          placeholder="Amount (USDC)"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="field-row">
        <button disabled={disabled} onClick={() => setCollateral((c) => c + num)}>
          Add collateral
        </button>
        <button
          disabled={disabled}
          onClick={() => setCollateral((c) => Math.max(borrowed / MAX_LTV, c - num))}
        >
          Withdraw
        </button>
      </div>
      <div className="field-row">
        <button
          className="primary"
          disabled={disabled || num > available}
          onClick={() => setBorrowed((b) => b + num)}
        >
          Borrow
        </button>
        <button
          disabled={disabled || borrowed <= 0}
          onClick={() => setBorrowed((b) => Math.max(0, b - num))}
        >
          Repay
        </button>
      </div>
      {num > available && borrowed + num > collateral * MAX_LTV && (
        <p className="hint error">Exceeds your borrow limit at {MAX_LTV * 100}% LTV.</p>
      )}
      <p className="widget-note">
        <strong>Borrow</strong> — post USDC collateral and borrow against it with
        live LTV and health-factor mechanics. Preview: balances are simulated
        until a lending market is live on Arc.
      </p>
    </section>
  );
}
