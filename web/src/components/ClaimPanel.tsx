import { useState } from "react";
import { isAddress } from "ethers";
import type { WalletState } from "../hooks/useWallet";
import { useTx } from "../hooks/useTx";
import { TxStatusLine } from "./TxStatusLine";
import { fetchEstate, getContract, type EstateView } from "../lib/contract";
import { fmtUsdc, shortAddress } from "../lib/chain";

export function ClaimPanel({ wallet }: { wallet: WalletState }) {
  const { account, provider } = wallet;
  const [ownerInput, setOwnerInput] = useState("");
  const [owner, setOwner] = useState<string | null>(null);
  const [estate, setEstate] = useState<EstateView | null>(null);
  const [claimable, setClaimable] = useState(false);
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (address: string) => {
    if (!provider || !account) return;
    setLoading(true);
    setError(null);
    try {
      const contract = getContract(provider);
      const [estateView, isClaimable, hasClaimed] = await Promise.all([
        fetchEstate(provider, address),
        contract.isClaimable(address),
        contract.hasClaimed(address, account),
      ]);
      setOwner(address);
      setEstate(estateView);
      setClaimable(isClaimable);
      setAlreadyClaimed(hasClaimed);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const tx = useTx(() => owner && load(owner));

  if (!account) return null;

  const myShare =
    estate?.beneficiaries.find(
      (b) => b.account.toLowerCase() === account.toLowerCase()
    )?.shareBps ?? 0n;
  const pool = estate
    ? estate.unlocked
      ? estate.unlockedBalance
      : estate.balance
    : 0n;
  const myAmount = (pool * myShare) / 10_000n;

  return (
    <div className="panel">
      <section className="card">
        <h3>Look up an estate</h3>
        <p className="hint">
          Enter the estate owner's address. If they missed their check-in
          deadline and named you as an heir, you can claim your share here.
        </p>
        <div className="field-row">
          <input
            placeholder="Owner address (0x…)"
            value={ownerInput}
            onChange={(e) => setOwnerInput(e.target.value.trim())}
          />
          <button
            className="primary"
            disabled={!isAddress(ownerInput) || loading}
            onClick={() => load(ownerInput)}
          >
            {loading ? "Loading…" : "Look up"}
          </button>
        </div>
        {error && <p className="hint error">{error}</p>}
      </section>

      {estate && owner && (
        <section className="card">
          <h3>Estate of {shortAddress(owner)}</h3>
          <div className="stat-row">
            <div className="stat">
              <span className="stat-label">Balance</span>
              <span className="stat-value">{fmtUsdc(estate.balance)} USDC</span>
            </div>
            <div className="stat">
              <span className="stat-label">Status</span>
              {claimable ? (
                <span className="pill unlocked">Claimable</span>
              ) : (
                <span className="pill active">Locked — owner is active</span>
              )}
            </div>
            <div className="stat">
              <span className="stat-label">Your share</span>
              <span className="stat-value">
                {Number(myShare) / 100}%
                {myShare > 0n && ` · ${fmtUsdc(myAmount)} USDC`}
              </span>
            </div>
          </div>

          {myShare === 0n ? (
            <p className="hint">You are not named as an heir of this estate.</p>
          ) : alreadyClaimed ? (
            <p className="hint">You have already claimed your share. ✓</p>
          ) : (
            <button
              className="primary"
              disabled={!claimable || tx.busy}
              onClick={() =>
                tx.run("Claim inheritance", async () =>
                  getContract(await wallet.getSigner()).claim(owner)
                )
              }
            >
              Claim {fmtUsdc(myAmount)} USDC
            </button>
          )}
        </section>
      )}

      <TxStatusLine status={tx.status} />
    </div>
  );
}
