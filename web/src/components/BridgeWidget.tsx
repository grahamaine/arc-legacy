import { useState } from "react";
import type { WalletState } from "../hooks/useWallet";
import {
  ARC_CHAIN,
  BRIDGE_SOURCES,
  getAdapter,
  getAppKit,
  kitErrorMessage,
} from "../lib/appkit";
import { txHashFromResult } from "../lib/txhash";
import { KitTxLink } from "./KitTxLink";

type SourceId = (typeof BRIDGE_SOURCES)[number]["id"];

export function BridgeWidget({ wallet }: { wallet: WalletState }) {
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState<SourceId>(BRIDGE_SOURCES[0].id);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const doBridge = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    setTxHash(null);
    try {
      if (!wallet.account) throw new Error("Connect your wallet first.");
      const kit = await getAppKit();
      const adapter = await getAdapter();
      setMessage("Bridging — approve the prompts in your wallet…");
      const res = await kit.bridge({
        from: { adapter, chain: source },
        to: { adapter, chain: ARC_CHAIN },
        amount,
      });
      setTxHash(txHashFromResult(res, "bridge"));
      setMessage(`Bridged ${amount} USDC from ${source.replace(/_/g, " ")} to Arc ✓`);
      setAmount("");
    } catch (err) {
      setMessage(null);
      setError(kitErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h3>Bridge to Arc</h3>
      <p className="hint">
        Move testnet USDC from another chain into Arc via CCTP (Circle App
        Kit). Your wallet will be asked to switch networks during the
        transfer.
      </p>
      <div className="field-row">
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as SourceId)}
        >
          {BRIDGE_SOURCES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <input
          placeholder="Amount (USDC)"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button
          className="primary"
          disabled={busy || !Number(amount)}
          onClick={doBridge}
        >
          {busy ? "Bridging…" : "Bridge"}
        </button>
      </div>
      {message && (
        <p className="hint" style={{ color: "var(--amber)" }}>
          {message}{" "}
          {txHash && (
            <>
              burn tx <KitTxLink hash={txHash} arc={false} />
            </>
          )}
        </p>
      )}
      {error && <p className="hint error">{error}</p>}
      <p className="widget-note">
        <strong>CCTP bridge</strong> — move USDC into Arc from other chains over
        Circle's Cross-Chain Transfer Protocol (App Kit): burn on the source
        chain, mint natively on Arc.
      </p>
    </section>
  );
}
