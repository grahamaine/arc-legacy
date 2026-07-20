import { useEffect, useState } from "react";
import { EventLog } from "ethers";
import type { WalletState } from "../hooks/useWallet";
import { getContract } from "../lib/contract";
import { explorerTx, fmtUsdc, shortAddress } from "../lib/chain";

interface Item {
  key: string;
  label: string;
  block: number;
  hash: string;
}

function describe(ev: EventLog, account: string): string {
  const a = ev.args;
  switch (ev.eventName) {
    case "Deposited":
      return `Deposited ${fmtUsdc(a.amount)} USDC`;
    case "Withdrawn":
      return `Withdrew ${fmtUsdc(a.amount)} USDC`;
    case "CheckedIn":
      return "Checked in";
    case "IntervalSet":
      return `Check-in interval set to ${Number(a.interval) / 86_400} days`;
    case "BeneficiariesSet":
      return `Named ${a.count} heir${a.count === 1n ? "" : "s"}`;
    case "EstateUnlocked":
      return `Estate unlocked at ${fmtUsdc(a.snapshotBalance)} USDC`;
    case "Claimed":
      return a.beneficiary.toLowerCase() === account.toLowerCase()
        ? `Claimed ${fmtUsdc(a.amount)} USDC from ${shortAddress(a.owner)}`
        : `${shortAddress(a.beneficiary)} claimed ${fmtUsdc(a.amount)} USDC`;
    default:
      return ev.eventName;
  }
}

export function ActivityWidget({ wallet }: { wallet: WalletState }) {
  const { account, provider } = wallet;
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!provider || !account) return;
    const contract = getContract(provider);
    const filters = [
      contract.filters.Deposited(account),
      contract.filters.Withdrawn(account),
      contract.filters.CheckedIn(account),
      contract.filters.IntervalSet(account),
      contract.filters.BeneficiariesSet(account),
      contract.filters.EstateUnlocked(account),
      contract.filters.Claimed(account),
      contract.filters.Claimed(null, account),
    ];
    Promise.all(filters.map((f) => contract.queryFilter(f, 0)))
      .then((results) => {
        const seen = new Set<string>();
        const list = results
          .flat()
          .filter((ev): ev is EventLog => ev instanceof EventLog)
          .sort(
            (x, y) => y.blockNumber - x.blockNumber || y.index - x.index
          )
          .filter((ev) => {
            const key = `${ev.transactionHash}:${ev.index}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(0, 12)
          .map((ev) => ({
            key: `${ev.transactionHash}:${ev.index}`,
            label: describe(ev, account),
            block: ev.blockNumber,
            hash: ev.transactionHash,
          }));
        setItems(list);
        setError(null);
      })
      .catch((err) => setError((err as Error).message));
  }, [provider, account]);

  return (
    <section className="card">
      <h3>Activity</h3>
      {error ? (
        <p className="hint error">Could not load history: {error}</p>
      ) : items === null ? (
        <p className="hint">Loading your estate history…</p>
      ) : items.length === 0 ? (
        <p className="hint">
          No activity yet — your deposits, check-ins and claims will appear
          here.
        </p>
      ) : (
        <ul className="activity">
          {items.map((it) => (
            <li key={it.key}>
              <span>{it.label}</span>
              <a href={explorerTx(it.hash)} target="_blank" rel="noreferrer">
                block {it.block}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
