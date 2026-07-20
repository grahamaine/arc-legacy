import type { TxStatus } from "../hooks/useTx";
import { explorerTx } from "../lib/chain";

export function TxStatusLine({ status }: { status: TxStatus }) {
  if (status.kind === "idle") return null;
  if (status.kind === "pending") {
    return <p className="tx tx-pending">Confirm “{status.label}” in your wallet…</p>;
  }
  if (status.kind === "confirming") {
    return (
      <p className="tx tx-pending">
        {status.label} — waiting for confirmation…{" "}
        <a href={explorerTx(status.hash)} target="_blank" rel="noreferrer">view tx</a>
      </p>
    );
  }
  if (status.kind === "success") {
    return (
      <p className="tx tx-success">
        {status.label} confirmed ✓{" "}
        <a href={explorerTx(status.hash)} target="_blank" rel="noreferrer">view tx</a>
      </p>
    );
  }
  return <p className="tx tx-error">{status.message}</p>;
}
