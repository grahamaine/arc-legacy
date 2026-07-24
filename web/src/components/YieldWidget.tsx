import { useState } from "react";
import type { WalletState } from "../hooks/useWallet";
import {
  ARC_CHAIN,
  ARC_EARN_VAULT,
  getAdapter,
  getAppKit,
  kitErrorMessage,
} from "../lib/appkit";
import { KitTxLink } from "./KitTxLink";

/** Pull a human-readable amount out of a loosely-typed kit result. */
function pickAmount(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string" || typeof value === "number") return String(value);
  const obj = value as Record<string, unknown>;
  for (const key of ["balance", "assets", "amount", "shares", "value"]) {
    if (obj[key] != null) return pickAmount(obj[key]);
  }
  return JSON.stringify(value);
}

export function YieldWidget({ wallet }: { wallet: WalletState }) {
  const [amount, setAmount] = useState("");
  const [position, setPosition] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    setMessage(null);
    setTxHash(null);
    try {
      await wallet.getSigner(); // ensure we're on Arc
      await fn();
    } catch (err) {
      setError(kitErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const from = async () => ({
    adapter: await getAdapter(),
    chain: ARC_CHAIN,
  });

  const checkPosition = () =>
    run("position", async () => {
      const kit = await getAppKit();
      const pos = await kit.earn.getPosition({
        from: await from(),
        vaultAddress: ARC_EARN_VAULT,
      });
      setPosition(pickAmount(pos));
    });

  const deposit = () =>
    run("deposit", async () => {
      const kit = await getAppKit();
      const res = await kit.earn.deposit({
        from: await from(),
        vaultAddress: ARC_EARN_VAULT,
        amount,
      });
      setTxHash((res as { txHash?: string })?.txHash ?? null);
      setMessage(`Deposited ${amount} USDC into the vault ✓`);
      setAmount("");
    });

  const withdraw = () =>
    run("withdraw", async () => {
      const kit = await getAppKit();
      const res = await kit.earn.withdraw({
        from: await from(),
        vaultAddress: ARC_EARN_VAULT,
        amount,
      });
      setTxHash((res as { txHash?: string })?.txHash ?? null);
      setMessage(`Withdrew ${amount} USDC from the vault ✓`);
      setAmount("");
    });

  return (
    <section className="card">
      <h3>Yield</h3>
      <p className="hint">
        Deposit USDC into a Circle Earn vault on Arc and accrue auto-compounding
        yield (Earn Kit, testnet preview).
      </p>
      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">Your vault position</span>
          <span className="stat-value">{position ?? "—"}</span>
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
          disabled={busy !== null || !Number(amount)}
          onClick={deposit}
        >
          {busy === "deposit" ? "Depositing…" : "Deposit"}
        </button>
        <button
          disabled={busy !== null || !Number(amount)}
          onClick={withdraw}
        >
          {busy === "withdraw" ? "Withdrawing…" : "Withdraw"}
        </button>
      </div>
      <button className="ghost" disabled={busy !== null} onClick={checkPosition}>
        {busy === "position" ? "Loading…" : "Check position"}
      </button>
      {message && (
        <p className="hint" style={{ color: "var(--green)" }}>
          {message} {txHash && <KitTxLink hash={txHash} />}
        </p>
      )}
      {error && <p className="hint error">{error}</p>}
    </section>
  );
}
