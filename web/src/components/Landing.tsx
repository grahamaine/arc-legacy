import { useState } from "react";
import type { WalletState } from "../hooks/useWallet";
import { ConnectPanel } from "./ConnectPanel";
import { ARC_TESTNET } from "../lib/chain";

type Mode = "wallet" | "email";

/** Feature tiles shown below the fold — grouped to mirror the dashboard sections. */
const FEATURE_GROUPS: {
  key: string;
  label: string;
  icon: string;
  features: { icon: string; name: string; desc: string }[];
}[] = [
  {
    key: "estate",
    label: "Estate",
    icon: "🏛️",
    features: [
      { icon: "🏛️", name: "Vault", desc: "Your on-chain estate — balance, check-in status and the dead-man's-switch timer." },
      { icon: "⬇️", name: "Deposit", desc: "Fund your vault with USDC in a single click." },
      { icon: "⬆️", name: "Withdraw", desc: "Pull funds back out any time while you're active." },
      { icon: "👪", name: "Heirs", desc: "Name beneficiaries and split shares to the basis point." },
      { icon: "🎟️", name: "Claim", desc: "Heirs claim their share directly once the switch trips — no probate." },
      { icon: "📜", name: "Activity", desc: "Live on-chain history of every vault event." },
    ],
  },
  {
    key: "wallet",
    label: "Wallet",
    icon: "👛",
    features: [
      { icon: "💰", name: "Balances", desc: "All your Arc token balances at a glance." },
      { icon: "🌐", name: "Unified balance", desc: "One USDC balance across chains, powered by Circle Gateway." },
      { icon: "✈️", name: "Send", desc: "Transfer USDC to any address instantly." },
      { icon: "🔗", name: "Payments", desc: "Create shareable USDC payment-request links." },
      { icon: "🔄", name: "Swap", desc: "Swap tokens with best-route FX pricing." },
      { icon: "🌉", name: "Bridge", desc: "Move USDC across chains with Circle CCTP." },
    ],
  },
  {
    key: "earn",
    label: "DeFi",
    icon: "📈",
    features: [
      { icon: "📈", name: "Yield", desc: "Earn on idle USDC with Circle Earn." },
      { icon: "🏦", name: "Borrow", desc: "Borrow against your vault collateral." },
      { icon: "💧", name: "Liquidity", desc: "Provide liquidity and collect fees." },
      { icon: "🏦", name: "Treasury", desc: "Programmable treasury flows for teams." },
    ],
  },
  {
    key: "agents",
    label: "Agents",
    icon: "🤖",
    features: [
      { icon: "🤖", name: "Legacy Agent", desc: "Automate check-ins and estate tasks on your behalf." },
      { icon: "🛒", name: "Agent Marketplace", desc: "Install agents that act on your vault." },
    ],
  },
];

export function Landing({ wallet }: { wallet: WalletState }) {
  const [mode, setMode] = useState<Mode>("wallet");

  const openAuth = (next: Mode) => {
    setMode(next);
    document
      .getElementById("connect")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="landing-page">
      {/* Top bar: auth on the upper-left, logo on the upper-right */}
      <header className="landing-bar">
        <div className="landing-auth-cta">
          <button
            className={mode === "wallet" ? "auth-link active" : "auth-link"}
            onClick={() => openAuth("wallet")}
          >
            Log in
          </button>
          <button
            className={mode === "email" ? "auth-link primary active" : "auth-link primary"}
            onClick={() => openAuth("email")}
          >
            Sign up
          </button>
        </div>
        <div className="landing-logo">
          <div className="landing-logo-text">
            <strong>Arc Legacy</strong>
            <span>Inheritance vaults on Arc</span>
          </div>
          <img src="/logo.png" alt="Arc Legacy" />
        </div>
      </header>

      {/* Upper region: connect card (left) + Arc Legacy info (middle) */}
      <div className="landing-main">
        <div className="landing-connect">
          <ConnectPanel wallet={wallet} mode={mode} onModeChange={setMode} />
        </div>

        <div className="landing-hero">
          <span className="landing-eyebrow">On-chain estate planning</span>
          <h1>
            Your stablecoins, <em>settled to the people you love.</em>
          </h1>
          <p className="landing-sub">
            Arc Legacy is a stablecoin inheritance vault. Deposit USDC, name your
            heirs and their shares, and check in to prove you're alive. If you go
            silent, your heirs claim directly on-chain — no lawyers, no probate,
            no waiting.
          </p>

          <ol className="landing-steps">
            <li><span>1</span>Deposit USDC into your vault.</li>
            <li><span>2</span>Name your heirs and their shares.</li>
            <li><span>3</span>Check in to prove you're alive.</li>
            <li><span>4</span>Go silent → heirs claim directly.</li>
          </ol>

          <div className="landing-stats">
            <div className="landing-stat">
              <strong>USDC</strong>
              <span>native gas token</span>
            </div>
            <div className="landing-stat">
              <strong>Up to 20</strong>
              <span>heirs per vault</span>
            </div>
            <div className="landing-stat">
              <strong>0</strong>
              <span>probate, no middlemen</span>
            </div>
          </div>

          <p className="landing-net">
            Runs on {ARC_TESTNET.name} (chain {ARC_TESTNET.chainId}), where USDC
            is the native gas token.
          </p>
        </div>
      </div>

      {/* Feature widgets showcase */}
      <section className="feature-showcase">
        <div className="showcase-head">
          <h2>Everything in one vault</h2>
          <p>
            A full onchain toolkit — estate, wallet, DeFi and autonomous agents —
            all settled in dollars.
          </p>
        </div>

        {FEATURE_GROUPS.map((group) => (
          <div className="feature-group" key={group.key}>
            <h3 className="feature-group-title">
              <span className="feature-group-icon">{group.icon}</span>
              {group.label}
            </h3>
            <div className="feature-grid">
              {group.features.map((f) => (
                <article className="feature-tile" key={f.name}>
                  <span className="feature-tile-icon">{f.icon}</span>
                  <div className="feature-tile-body">
                    <h4>{f.name}</h4>
                    <p>{f.desc}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}

        <div className="showcase-cta">
          <button className="primary" onClick={() => openAuth("wallet")}>
            Get started
          </button>
          <p className="hint">Connect a wallet or sign up with email to open your vault.</p>
        </div>
      </section>

      {/* Partner / tech strip */}
      <section className="landing-partners">
        <span className="partners-label">Built on Circle's stablecoin stack</span>
        <div className="partners-row">
          {["Circle", "Arc", "USDC", "CCTP", "Gateway", "App Kit"].map((name) => (
            <span className="partner-mark" key={name}>
              {name}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
