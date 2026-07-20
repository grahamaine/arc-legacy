import { useCallback, useState } from "react";
import type { TransactionResponse } from "ethers";

export type TxStatus =
  | { kind: "idle" }
  | { kind: "pending"; label: string }
  | { kind: "confirming"; label: string; hash: string }
  | { kind: "success"; label: string; hash: string }
  | { kind: "error"; message: string };

/** Wraps a contract call with wallet-prompt → confirming → success/error state. */
export function useTx(onConfirmed?: () => void) {
  const [status, setStatus] = useState<TxStatus>({ kind: "idle" });

  const run = useCallback(
    async (label: string, send: () => Promise<TransactionResponse>) => {
      setStatus({ kind: "pending", label });
      try {
        const tx = await send();
        setStatus({ kind: "confirming", label, hash: tx.hash });
        await tx.wait();
        setStatus({ kind: "success", label, hash: tx.hash });
        onConfirmed?.();
      } catch (err) {
        const e = err as { shortMessage?: string; reason?: string; message?: string };
        setStatus({
          kind: "error",
          message: e.shortMessage ?? e.reason ?? e.message ?? "Transaction failed",
        });
      }
    },
    [onConfirmed]
  );

  const reset = useCallback(() => setStatus({ kind: "idle" }), []);
  return { status, run, reset, busy: status.kind === "pending" || status.kind === "confirming" };
}
