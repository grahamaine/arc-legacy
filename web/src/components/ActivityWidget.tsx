import { useEffect, useState } from "react";
import { Interface, type LogDescription } from "ethers";
import type { WalletState } from "../hooks/useWallet";
import { ARC_LEGACY_ABI, CONTRACT_ADDRESS } from "../lib/contract";
import { ARC_TESTNET, explorerTx, fmtUsdc, shortAddress } from "../lib/chain";

interface ExplorerLog {
  topics: string[];
  data: string;
  blockNumber: string;
  logIndex: string;
  transactionHash: string;
}

interface Item {
  key: string;
  label: string;
  block: number;
  hash: string;
}

function describe(ev: LogDescription, account: string): string {
  const a = ev.args;
  switch (ev.name) {
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
      return ev.name;
  }
}

/** True when the event belongs on this account's feed. */
function involves(ev: LogDescription, account: string): boolean {
  const me = account.toLowerCase();
  const owner = (ev.args.owner as string | undefined)?.toLowerCase();
  if (owner === me) return true;
  if (ev.name === "Claimed") {
    return (ev.args.beneficiary as string).toLowerCase() === me;
  }
  return false;
}

export function ActivityWidget({ wallet }: { wallet: WalletState }) {
  const { account } = wallet;
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;
    const iface = new Interface(ARC_LEGACY_ABI);
    // The public RPC caps eth_getLogs at a 10k-block range, so the full
    // history comes from the explorer's indexed logs API instead.
    fetch(
      `${ARC_TESTNET.explorerUrl}/api?module=logs&action=getLogs` +
        `&address=${CONTRACT_ADDRESS}&fromBlock=0&toBlock=latest`
    )
      .then((res) => res.json())
      .then((json: { result?: ExplorerLog[] | string }) => {
        if (!Array.isArray(json.result)) {
          throw new Error(String(json.result ?? "explorer API error"));
        }
        const list = json.result
          .map((log) => ({
            log,
            parsed: iface.parseLog({ topics: log.topics, data: log.data }),
          }))
          .filter(
            (x): x is { log: ExplorerLog; parsed: LogDescription } =>
              x.parsed !== null && involves(x.parsed, account)
          )
          .map(({ log, parsed }) => ({
            key: `${log.transactionHash}:${Number(log.logIndex)}`,
            label: describe(parsed, account),
            block: Number(log.blockNumber),
            index: Number(log.logIndex),
            hash: log.transactionHash,
          }))
          .sort((a, b) => b.block - a.block || b.index - a.index)
          .slice(0, 12);
        setItems(list);
        setError(null);
      })
      .catch((err) => setError((err as Error).message));
  }, [account]);

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
