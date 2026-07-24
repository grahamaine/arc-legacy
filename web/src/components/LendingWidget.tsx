import { useState } from "react";
import type { WalletState } from "../hooks/useWallet";

const SUPPLY_APY = 0.052; // simulated supply APY
const UTILIZATION = 0.68; // simulated market utilization
const MARKET_SIZE = 1_240_000; // simulated total USDC supplied

/**
 * Lend USDC into a money market and earn interest — an interactive preview.
 * This is the supply side of the Borrow widget's market; no lending pool is
 * deployed on Arc yet, so the market stats and your position are simulated
 * locally to demonstrate supply / APY / interest-accrual mechanics.
 */
export function LendingWidget({ wallet }: { wallet: WalletState }) {
  const [supplied, setSupplied] = useState(0);
  const [amount, setAmount] = useState("");

  const num = Number(amount) || 0;
  const dailyInterest = (supplied * SUPPLY_APY) / 365;
  const share = supplied > 0 ? (supplied / (MARKET_SIZE + supplied)) * 100 : 0;
  const disabled = !wallet.account || num <= 0;

  return (
    <section className="card">
      <h3>Lending</h3>
      <p className="hint">
        Supply USDC to the money market and earn interest (
        {(SUPPLY_APY * 100).toFixed(1)}% APY at {(UTILIZATION * 100).toFixed(0)}%
        utilization). Preview — market and position are simulated until a lending
        pool is live on Arc.
      </p>

      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">Supplied</span>
          <span className="stat-value">{supplied.toFixed(2)} USDC</span>
        </div>
        <div className="stat">
          <span className="stat-label">Supply APY</span>
          <span className="stat-value">{(SUPPLY_APY * 100).toFixed(1)}%</span>
        </div>
        <div className="stat">
          <span className="stat-label">Est. daily interest</span>
          <span className="stat-value">{dailyInterest.toFixed(4)} USDC</span>
        </div>
        <div className="stat">
          <span className="stat-label">Market share</span>
          <span className="stat-value">{share.toFixed(3)}%</span>
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
            setSupplied((s) => s + num);
            setAmount("");
          }}
        >
          Supply
        </button>
        <button
          disabled={disabled || supplied <= 0}
          onClick={() => {
            setSupplied((s) => Math.max(0, s - num));
            setAmount("");
          }}
        >
          Withdraw
        </button>
      </div>
    </section>
  );
}
