import { useState } from "react";
import { isAddress } from "ethers";
import type { Beneficiary } from "../lib/contract";
import { shortAddress } from "../lib/chain";

interface Row {
  account: string;
  /** Percentage as typed by the user, e.g. "33.5". */
  percent: string;
}

function rowsFromChain(beneficiaries: Beneficiary[]): Row[] {
  if (beneficiaries.length === 0) return [{ account: "", percent: "" }];
  return beneficiaries.map((b) => ({
    account: b.account,
    percent: (Number(b.shareBps) / 100).toString(),
  }));
}

function toBps(percent: string): number {
  return Math.round(Number(percent) * 100);
}

export function BeneficiaryEditor({
  current,
  busy,
  onSave,
}: {
  current: Beneficiary[];
  busy: boolean;
  onSave: (accounts: string[], sharesBps: bigint[]) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => rowsFromChain(current));

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const totalBps = rows.reduce(
    (sum, r) => sum + (Number.isFinite(Number(r.percent)) ? toBps(r.percent) : 0),
    0
  );
  const addressesValid = rows.every((r) => isAddress(r.account));
  const noDuplicates =
    new Set(rows.map((r) => r.account.toLowerCase())).size === rows.length;
  const canSave = addressesValid && noDuplicates && totalBps === 10_000 && !busy;

  return (
    <div className="beneficiary-editor">
      {rows.map((row, i) => (
        <div className="beneficiary-row" key={i}>
          <input
            className={row.account && !isAddress(row.account) ? "invalid" : ""}
            placeholder="Heir address (0x…)"
            value={row.account}
            onChange={(e) => setRow(i, { account: e.target.value.trim() })}
          />
          <input
            className="percent"
            placeholder="%"
            inputMode="decimal"
            value={row.percent}
            onChange={(e) => setRow(i, { percent: e.target.value })}
          />
          <button
            className="ghost"
            title="Remove heir"
            disabled={rows.length === 1}
            onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}

      <div className="beneficiary-footer">
        <button
          className="ghost"
          disabled={rows.length >= 20}
          onClick={() => setRows((rs) => [...rs, { account: "", percent: "" }])}
        >
          + Add heir
        </button>
        <span className={totalBps === 10_000 ? "sum ok" : "sum"}>
          Total: {(totalBps / 100).toFixed(2)}%
        </span>
        <button
          className="primary"
          disabled={!canSave}
          onClick={() =>
            onSave(
              rows.map((r) => r.account),
              rows.map((r) => BigInt(toBps(r.percent)))
            )
          }
        >
          Save heirs
        </button>
      </div>

      {!noDuplicates && <p className="hint error">Duplicate heir address.</p>}
      {totalBps !== 10_000 && rows.some((r) => r.percent) && (
        <p className="hint">Shares must add up to exactly 100%.</p>
      )}
      {current.length > 0 && (
        <p className="hint">
          Currently on-chain:{" "}
          {current
            .map((b) => `${shortAddress(b.account)} (${Number(b.shareBps) / 100}%)`)
            .join(", ")}
        </p>
      )}
    </div>
  );
}
