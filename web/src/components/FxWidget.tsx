import { useEffect, useState } from "react";
import type { WalletState } from "../hooks/useWallet";
import { ARC_CHAIN, getAdapter, getAppKit, kitErrorMessage } from "../lib/appkit";

type Direction = "USDC->EURC" | "EURC->USDC";

const LOCK_SECONDS = 30; // how long a quoted FX rate is held

interface LockedQuote {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  rate: string;
  expiresAt: number;
}

/**
 * StableFX — cross-currency stablecoin conversion (USDC ⇄ EURC) on Arc.
 * A rate is quoted via Circle App Kit, held for a short lock window, and then
 * settled in a second step — a two-step FX settlement flow rather than an
 * instant spot swap.
 */
export function FxWidget({ wallet }: { wallet: WalletState }) {
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<Direction>("USDC->EURC");
  const [busy, setBusy] = useState<"quote" | "settle" | null>(null);
  const [locked, setLocked] = useState<LockedQuote | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tokenIn, tokenOut] =
    direction === "USDC->EURC"
      ? (["USDC", "EURC"] as const)
      : (["EURC", "USDC"] as const);

  // Countdown for the locked rate; clears the lock when it expires.
  useEffect(() => {
    if (!locked) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((locked.expiresAt - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) setLocked(null);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [locked]);

  const getRate = async () => {
    setBusy("quote");
    setError(null);
    setMessage(null);
    setLocked(null);
    try {
      const kit = await getAppKit();
      const adapter = await getAdapter();
      const est = await kit.estimateSwap({
        from: { adapter, chain: ARC_CHAIN },
        tokenIn,
        tokenOut,
        amountIn: amount,
      });
      const out = est.estimatedOutput;
      if (!out) {
        setError("No FX rate available for this pair right now.");
        return;
      }
      setLocked({
        tokenIn,
        tokenOut,
        amountIn: amount,
        amountOut: out.amount,
        rate: (Number(out.amount) / Number(amount)).toFixed(4),
        expiresAt: Date.now() + LOCK_SECONDS * 1000,
      });
    } catch (err) {
      setError(kitErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const settle = async () => {
    if (!locked) return;
    setBusy("settle");
    setError(null);
    setMessage(null);
    try {
      await wallet.getSigner(); // ensure we're connected on Arc
      const kit = await getAppKit();
      const adapter = await getAdapter();
      await kit.swap({
        from: { adapter, chain: ARC_CHAIN },
        tokenIn: locked.tokenIn,
        tokenOut: locked.tokenOut,
        amountIn: locked.amountIn,
      });
      setMessage(
        `Settled ${locked.amountIn} ${locked.tokenIn} → ${locked.amountOut} ${locked.tokenOut} at ${locked.rate} ✓`
      );
      setLocked(null);
      setAmount("");
    } catch (err) {
      setError(kitErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card">
      <h3>StableFX</h3>
      <p className="hint">
        Cross-currency stablecoin FX on Arc — convert dollars (USDC) and euros
        (EURC) at a quoted rate that's locked for {LOCK_SECONDS}s, then settled in
        a second step.
      </p>

      <div className="field-row">
        <input
          placeholder={`Amount (${tokenIn})`}
          inputMode="decimal"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setLocked(null);
          }}
        />
        <button
          className="ghost"
          title="Flip direction"
          onClick={() => {
            setDirection(
              direction === "USDC->EURC" ? "EURC->USDC" : "USDC->EURC"
            );
            setLocked(null);
          }}
        >
          {tokenIn} → {tokenOut} ⇄
        </button>
      </div>

      {locked && (
        <div className="stat-row">
          <div className="stat">
            <span className="stat-label">Rate</span>
            <span className="stat-value">
              1 {locked.tokenIn} = {locked.rate} {locked.tokenOut}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">You receive</span>
            <span className="stat-value">
              {locked.amountOut} {locked.tokenOut}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Rate locked</span>
            <span className={`pill ${remaining > 6 ? "active" : "warning"}`}>
              {remaining}s
            </span>
          </div>
        </div>
      )}

      <div className="field-row">
        <button disabled={busy !== null || !Number(amount)} onClick={getRate}>
          {busy === "quote" ? "Quoting…" : locked ? "Re-quote" : "Get rate"}
        </button>
        <button
          className="primary"
          disabled={busy !== null || !locked}
          onClick={settle}
        >
          {busy === "settle" ? "Settling…" : "Settle FX"}
        </button>
      </div>

      {message && (
        <p className="hint" style={{ color: "var(--green)" }}>
          {message}
        </p>
      )}
      {error && <p className="hint error">{error}</p>}
    </section>
  );
}
