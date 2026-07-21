import { useCallback, useEffect, useState } from "react";
import type { WalletState } from "../hooks/useWallet";
import { CONTRACT_ADDRESS, fetchEstate, type EstateView } from "../lib/contract";
import { getReadProvider } from "../lib/chain";
import { VaultWidget } from "./VaultWidget";
import { DepositWidget } from "./DepositWidget";
import { WithdrawWidget } from "./WithdrawWidget";
import { HeirsWidget } from "./HeirsWidget";
import { ClaimWidget } from "./ClaimWidget";
import { BalancesWidget } from "./BalancesWidget";
import { UnifiedBalanceWidget } from "./UnifiedBalanceWidget";
import { SwapWidget } from "./SwapWidget";
import { BridgeWidget } from "./BridgeWidget";
import { SendWidget } from "./SendWidget";
import { ActivityWidget } from "./ActivityWidget";
import { YieldWidget } from "./YieldWidget";
import { TreasuryWidget } from "./TreasuryWidget";
import { AgentWidget } from "./AgentWidget";
import { AgentMarketplaceWidget } from "./AgentMarketplaceWidget";

type SectionKey = "estate" | "wallet" | "earn" | "agents";

const SECTIONS: { key: SectionKey; label: string; icon: string }[] = [
  { key: "estate", label: "Estate", icon: "🏛️" },
  { key: "wallet", label: "Wallet", icon: "👛" },
  { key: "earn", label: "Earn", icon: "📈" },
  { key: "agents", label: "Agents", icon: "🤖" },
];

export function Dashboard({ wallet }: { wallet: WalletState }) {
  const { account } = wallet;
  const [estate, setEstate] = useState<EstateView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [section, setSection] = useState<SectionKey>("estate");

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
      <nav className="sidebar" aria-label="Dashboard sections">
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

        <div className="grid" key={section}>
          {section === "estate" &&
            (CONTRACT_ADDRESS ? (
              <>
                <VaultWidget wallet={wallet} estate={estate} refresh={refresh} />
                <DepositWidget wallet={wallet} estate={estate} refresh={refresh} />
                <WithdrawWidget wallet={wallet} estate={estate} refresh={refresh} />
                <HeirsWidget wallet={wallet} estate={estate} refresh={refresh} />
                <ClaimWidget wallet={wallet} />
                <ActivityWidget wallet={wallet} />
              </>
            ) : (
              <section className="card">
                <h3>Vault</h3>
                <p className="hint">
                  The ArcLegacy contract is not deployed yet. Vault features unlock
                  once it's live on Arc testnet.
                </p>
              </section>
            ))}

          {section === "wallet" && (
            <>
              <BalancesWidget wallet={wallet} />
              <UnifiedBalanceWidget wallet={wallet} />
              <SendWidget wallet={wallet} />
              <SwapWidget wallet={wallet} />
              <BridgeWidget wallet={wallet} />
            </>
          )}

          {section === "earn" && (
            <>
              <YieldWidget wallet={wallet} />
              <TreasuryWidget wallet={wallet} />
            </>
          )}

          {section === "agents" && (
            <>
              <AgentWidget wallet={wallet} refresh={refresh} />
              <AgentMarketplaceWidget wallet={wallet} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
