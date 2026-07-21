import { useState } from "react";
import type { WalletState } from "../hooks/useWallet";

interface AgentListing {
  key: string;
  icon: string;
  name: string;
  provider: string;
  desc: string;
  price: string;
  tag: string;
}

const LISTINGS: AgentListing[] = [
  {
    key: "notary",
    icon: "🪪",
    name: "Estate Notary",
    provider: "Verite",
    desc: "Verifies heir identity & KYC before a claim can settle.",
    price: "5 USDC/mo",
    tag: "Identity",
  },
  {
    key: "optimizer",
    icon: "📈",
    name: "Yield Optimizer",
    provider: "Arc Labs",
    desc: "Rebalances idle USDC across Circle Earn vaults for best APY.",
    price: "2% perf",
    tag: "Finance",
  },
  {
    key: "sentinel",
    icon: "🛡️",
    name: "Compliance Sentinel",
    provider: "Circle",
    desc: "Screens every transfer against sanctions & risk lists.",
    price: "8 USDC/mo",
    tag: "Compliance",
  },
  {
    key: "reporter",
    icon: "🧾",
    name: "Tax Reporter",
    provider: "Ledgerly",
    desc: "Generates realized gain/loss reports on demand.",
    price: "12 USDC/mo",
    tag: "Reporting",
  },
  {
    key: "concierge",
    icon: "🤝",
    name: "Heir Concierge",
    provider: "Arc Labs",
    desc: "Walks beneficiaries through the claim process step by step.",
    price: "3 USDC/task",
    tag: "Support",
  },
];

/**
 * Circle Agent Marketplace — a directory of USDC-native agents you can hire to
 * act on the estate. Connecting is a local demo (no live subscription API yet).
 */
export function AgentMarketplaceWidget({ wallet }: { wallet: WalletState }) {
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");

  const toggle = (key: string) =>
    setConnected((c) => ({ ...c, [key]: !c[key] }));

  const q = query.trim().toLowerCase();
  const shown = LISTINGS.filter(
    (l) =>
      !q ||
      l.name.toLowerCase().includes(q) ||
      l.tag.toLowerCase().includes(q) ||
      l.provider.toLowerCase().includes(q)
  );
  const activeCount = Object.values(connected).filter(Boolean).length;

  return (
    <section className="card">
      <h3>Agent Marketplace</h3>
      <p className="hint">
        Hire Circle-powered agents that transact in USDC on your behalf. Directory
        preview — connecting is a local demo, not a live subscription.
      </p>

      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">Agents connected</span>
          <span className="stat-value">{activeCount}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Wallet</span>
          <span className="stat-value">{wallet.account ? "Linked" : "—"}</span>
        </div>
      </div>

      <div className="field-row">
        <input
          placeholder="Search agents or categories…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <ul className="market-list">
        {shown.map((l) => (
          <li key={l.key} className="market-item">
            <span className="market-icon">{l.icon}</span>
            <div className="market-body">
              <div className="market-head">
                <span className="market-name">{l.name}</span>
                <span className="pill">{l.tag}</span>
              </div>
              <span className="market-desc">{l.desc}</span>
              <span className="market-meta">
                {l.provider} · {l.price}
              </span>
            </div>
            <button
              className={connected[l.key] ? "" : "primary"}
              onClick={() => toggle(l.key)}
            >
              {connected[l.key] ? "Connected ✓" : "Connect"}
            </button>
          </li>
        ))}
        {shown.length === 0 && (
          <li className="hint">No agents match “{query}”.</li>
        )}
      </ul>
    </section>
  );
}
