import { useState } from "react";
import type { WalletState } from "../hooks/useWallet";
import { ARC_CHAIN, getAdapter, getAppKit, kitErrorMessage } from "../lib/appkit";

type Direction = "USDC->EURC" | "EURC->USDC";

export function SwapWidget({ wallet }: { wallet: WalletState }) {
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<Direction>("USDC->EURC");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tokenIn, tokenOut] =
    direction === "USDC->EURC" ? (["USDC", "EURC"] as const) : (["EURC", "USDC"] as const);

  const doSwap = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await wallet.getSigner(); // make sure we're connected on Arc
      const kit = await getAppKit();
      const adapter = await getAdapter();
      await kit.swap({
        from: { adapter, chain: ARC_CHAIN },
        tokenIn,
        tokenOut,
        amountIn: amount,
      });
      setMessage(`Swapped ${amount} ${tokenIn} → ${tokenOut} ✓`);
      setAmount("");
    } catch (err) {
      setError(kitErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h3>Swap</h3>
      <p className="hint">
        Same-chain stablecoin FX on Arc via Circle App Kit — swap between
        dollars (USDC) and euros (EURC).
      </p>
      <div className="field-row">
        <input
          placeholder={`Amount (${tokenIn})`}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button
          className="ghost"
          title="Flip direction"
          onClick={() =>
            setDirection(direction === "USDC->EURC" ? "EURC->USDC" : "USDC->EURC")
          }
        >
          {tokenIn} → {tokenOut} ⇄
        </button>
        <button
          className="primary"
          disabled={busy || !Number(amount)}
          onClick={doSwap}
        >
          {busy ? "Swapping…" : "Swap"}
        </button>
      </div>
      {message && <p className="hint" style={{ color: "var(--green)" }}>{message}</p>}
      {error && <p className="hint error">{error}</p>}
    </section>
  );
}
