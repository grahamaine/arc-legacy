import { useCallback, useEffect, useState } from "react";
import type { WalletState } from "../hooks/useWallet";
import { CONTRACT_ADDRESS, fetchEstate, type EstateView } from "../lib/contract";
import { getReadProvider } from "../lib/chain";
import { VaultWidget } from "./VaultWidget";
import { DepositWidget } from "./DepositWidget";
import { WithdrawWidget } from "./WithdrawWidget";
import { HeirsWidget } from "./HeirsWidget";
import { GuardiansWidget } from "./GuardiansWidget";
import { ClaimWidget } from "./ClaimWidget";
import { RecurringWidget } from "./RecurringWidget";
import { BalancesWidget } from "./BalancesWidget";
import { GasMeterWidget } from "./GasMeterWidget";
import { UnifiedBalanceWidget } from "./UnifiedBalanceWidget";
import { PaymentsWidget } from "./PaymentsWidget";
import { SwapWidget } from "./SwapWidget";
import { BridgeWidget } from "./BridgeWidget";
import { SendWidget } from "./SendWidget";
import { ActivityWidget } from "./ActivityWidget";
import { FxWidget } from "./FxWidget";
import { YieldWidget } from "./YieldWidget";
import { TreasuryWidget } from "./TreasuryWidget";
import { LendingWidget } from "./LendingWidget";
import { BorrowWidget } from "./BorrowWidget";
import { LiquidityWidget } from "./LiquidityWidget";
import { AgentWidget } from "./AgentWidget";
import { AgentMarketplaceWidget } from "./AgentMarketplaceWidget";
import { MoneyMarketWidget } from "./MoneyMarketWidget";
import { PortfolioWidget } from "./PortfolioWidget";

type SectionKey = "portfolio" | "estate" | "wallet" | "earn" | "agents";

const SECTIONS: { key: SectionKey; label: string; icon: string }[] = [
  { key: "portfolio", label: "Portfolio", icon: "📊" },
  { key: "estate", label: "Estate", icon: "🏛️" },
  { key: "wallet", label: "Wallet", icon: "👛" },
  { key: "earn", label: "DeFi", icon: "📈" },
  { key: "agents", label: "Agents", icon: "🤖" },
];

// Short caption shown under each section's data column heading.
const SECTION_META: Record<SectionKey, { title: string; blurb: string; aside: string }> = {
  portfolio: {
    title: "Portfolio at a glance",
    blurb: "Your whole position on Arc — wallet, estate, lending and streams.",
    aside: "",
  },
  estate: {
    title: "Estate overview",
    blurb: "Vault balance, heir allocation and on-chain activity.",
    aside: "Manage vault",
  },
  wallet: {
    title: "Wallet & balances",
    blurb: "Unified USDC balances, gas and account analytics.",
    aside: "Move money",
  },
  earn: {
    title: "DeFi positions",
    blurb: "Live money-market and treasury analytics on Arc.",
    aside: "Earn & borrow",
  },
  agents: {
    title: "Agent marketplace",
    blurb: "Autonomous agents that act on your estate and wallet.",
    aside: "Run an agent",
  },
};

export function Dashboard({ wallet }: { wallet: WalletState }) {
  const { account } = wallet;
  const [estate, setEstate] = useState<EstateView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [section, setSection] = useState<SectionKey>("portfolio");

  const refresh = useCallback(() => {
    if (!account || !CONTRACT_ADDRESS) return;
    const attempt = (retriesLeft: number) =>
      fetchEstate(getReadProvider(), account)
        .then((e) => {
          setEstate(e);
          setLoadError(null);
        })
        .catch((err) => {
          if (retriesLeft > 0) {
            setTimeout(() => attempt(retriesLeft - 1), 2000);
          } else {
            setLoadError((err as Error).message);
          }
        });
    attempt(2);
  }, [account]);

  useEffect(refresh, [refresh]);

  return (
    <div className="dash-layout">
      <nav className="topnav" aria-label="Dashboard sections">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            className={section === s.key ? "nav-item active" : "nav-item"}
            aria-current={section === s.key ? "page" : undefined}
            onClick={() => setSection(s.key)}
          >
            <span className="nav-icon">{s.icon}</span>
            {s.label}
          </button>
        ))}
        <button
          className="nav-item nav-disconnect"
          onClick={wallet.disconnect}
          title="Disconnect this wallet from the app"
        >
          <span className="nav-icon">⏻</span>
          Disconnect
        </button>
      </nav>

      <div className="dash-main">
        {loadError && (
          <p className="banner warning">Could not load estate: {loadError}</p>
        )}

        {section === "portfolio" ? (
          <div className="dash-primary" key="portfolio">
            <header className="split-head">
              <h2>{SECTION_META.portfolio.title}</h2>
              <p>{SECTION_META.portfolio.blurb}</p>
            </header>
            <div className="primary-grid">
              <PortfolioWidget wallet={wallet} />
            </div>
          </div>
        ) : section === "estate" && !CONTRACT_ADDRESS ? (
          <section className="card">
            <h3>Vault</h3>
            <p className="hint">
              The ArcLegacy contract is not deployed yet. Vault features unlock
              once it's live on Arc testnet.
            </p>
          </section>
        ) : (
          <div className="dash-split" key={section}>
            {/* Left / center: data, analytics and portfolio widgets */}
            <div className="dash-primary">
              <header className="split-head">
                <h2>{SECTION_META[section].title}</h2>
                <p>{SECTION_META[section].blurb}</p>
              </header>
              <div className="primary-grid">
                {section === "estate" && (
                  <>
                    <VaultWidget wallet={wallet} estate={estate} refresh={refresh} />
                    <ActivityWidget wallet={wallet} />
                  </>
                )}

                {section === "wallet" && (
                  <>
                    <UnifiedBalanceWidget wallet={wallet} />
                    <BalancesWidget wallet={wallet} />
                    <GasMeterWidget wallet={wallet} />
                  </>
                )}

                {section === "earn" && (
                  <>
                    <MoneyMarketWidget wallet={wallet} />
                    <TreasuryWidget wallet={wallet} />
                  </>
                )}

                {section === "agents" && (
                  <AgentMarketplaceWidget wallet={wallet} />
                )}
              </div>
            </div>

            {/* Right: sticky action rail */}
            <aside className="dash-aside" aria-label={SECTION_META[section].aside}>
              <p className="aside-label">{SECTION_META[section].aside}</p>

              {section === "estate" && (
                <>
                  <DepositWidget wallet={wallet} estate={estate} refresh={refresh} />
                  <WithdrawWidget wallet={wallet} estate={estate} refresh={refresh} />
                  <HeirsWidget wallet={wallet} estate={estate} refresh={refresh} />
                  <GuardiansWidget wallet={wallet} estate={estate} refresh={refresh} />
                  <RecurringWidget wallet={wallet} />
                  <ClaimWidget wallet={wallet} />
                </>
              )}

              {section === "wallet" && (
                <>
                  <SendWidget wallet={wallet} />
                  <SwapWidget wallet={wallet} />
                  <FxWidget wallet={wallet} />
                  <BridgeWidget wallet={wallet} />
                  <PaymentsWidget wallet={wallet} />
                </>
              )}

              {section === "earn" && (
                <>
                  <LendingWidget wallet={wallet} />
                  <YieldWidget wallet={wallet} />
                  <BorrowWidget wallet={wallet} />
                  <LiquidityWidget wallet={wallet} />
                </>
              )}

              {section === "agents" && (
                <AgentWidget wallet={wallet} refresh={refresh} />
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
