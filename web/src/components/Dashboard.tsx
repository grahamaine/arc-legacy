import { useCallback, useEffect, useState } from "react";
import type { WalletState } from "../hooks/useWallet";
import { CONTRACT_ADDRESS, fetchEstate, type EstateView } from "../lib/contract";
import { VaultWidget } from "./VaultWidget";
import { DepositWidget } from "./DepositWidget";
import { WithdrawWidget } from "./WithdrawWidget";
import { HeirsWidget } from "./HeirsWidget";
import { ClaimWidget } from "./ClaimWidget";
import { BalancesWidget } from "./BalancesWidget";
import { SwapWidget } from "./SwapWidget";
import { BridgeWidget } from "./BridgeWidget";

export function Dashboard({ wallet }: { wallet: WalletState }) {
  const { account, provider } = wallet;
  const [estate, setEstate] = useState<EstateView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!provider || !account || !CONTRACT_ADDRESS) return;
    fetchEstate(provider, account)
      .then((e) => {
        setEstate(e);
        setLoadError(null);
      })
      .catch((err) => setLoadError((err as Error).message));
  }, [provider, account]);

  useEffect(refresh, [refresh]);

  return (
    <>
      {loadError && (
        <p className="banner warning">Could not load estate: {loadError}</p>
      )}
      <div className="grid">
        {CONTRACT_ADDRESS ? (
          <>
            <VaultWidget wallet={wallet} estate={estate} refresh={refresh} />
            <DepositWidget wallet={wallet} estate={estate} refresh={refresh} />
            <WithdrawWidget wallet={wallet} estate={estate} refresh={refresh} />
            <HeirsWidget wallet={wallet} estate={estate} refresh={refresh} />
            <ClaimWidget wallet={wallet} />
          </>
        ) : (
          <section className="card">
            <h3>Vault</h3>
            <p className="hint">
              The ArcLegacy contract is not deployed yet. Vault features unlock
              once it's live on Arc testnet.
            </p>
          </section>
        )}
        <BalancesWidget wallet={wallet} />
        <SwapWidget wallet={wallet} />
        <BridgeWidget wallet={wallet} />
      </div>
    </>
  );
}
