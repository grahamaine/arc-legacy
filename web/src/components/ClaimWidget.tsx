import { useEffect, useRef, useState } from "react";
import { isAddress } from "ethers";
import type { WalletState } from "../hooks/useWallet";
import { useTx } from "../hooks/useTx";
import { TxStatusLine } from "./TxStatusLine";
import { fetchEstate, getContract, type EstateView } from "../lib/contract";
import { fmtUsdc, getReadProvider, shortAddress } from "../lib/chain";

export function ClaimWidget({ wallet }: { wallet: WalletState }) {
  const { account } = wallet;
  const [ownerInput, setOwnerInput] = useState("");
  const [owner, setOwner] = useState<string | null>(null);
  const [estate, setEstate] = useState<EstateView | null>(null);
  const [claimable, setClaimable] = useState(false);
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (address: string) => {
    if (!account) return;
    setLoading(true);
    setError(null);
    try {
      const provider = getReadProvider();
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

  // Prefill from a shared claim link: /?owner=0x…
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !account) return;
    const param = new URLSearchParams(location.search).get("owner");
    if (param && isAddress(param)) {
      prefilled.current = true;
      setOwnerInput(param);
      load(param);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  const myShare =
    account && estate
      ? estate.beneficiaries.find(
          (b) => b.account.toLowerCase() === account.toLowerCase()
        )?.shareBps ?? 0n
      : 0n;
  const pool = estate
    ? estate.unlocked
      ? estate.unlockedBalance
      : estate.balance
    : 0n;
  const myAmount = (pool * myShare) / 10_000n;

  return (
    <section className="card">
      <h3>Claim an inheritance</h3>
      <p className="hint">
        Enter the estate owner's address. If they missed their check-in
        deadline and named you as an heir, claim your share here.
      </p>
      <div className="field-row">
        <input
          placeholder="Owner address (0x…)"
          value={ownerInput}
          onChange={(e) => setOwnerInput(e.target.value.trim())}
        />
        <button
          disabled={!isAddress(ownerInput) || loading}
          onClick={() => load(ownerInput)}
        >
          {loading ? "Loading…" : "Look up"}
        </button>
      </div>
      {error && <p className="hint error">{error}</p>}

      {estate && owner && (
        <>
          <div className="stat-row" style={{ marginTop: "0.8rem" }}>
            <div className="stat">
              <span className="stat-label">{shortAddress(owner)}</span>
              <span className="stat-value">{fmtUsdc(estate.balance)} USDC</span>
            </div>
            <div className="stat">
              <span className="stat-label">Status · your share</span>
              {claimable ? (
                <span className="pill unlocked">Claimable</span>
              ) : (
                <span className="pill active">Locked</span>
              )}
              <span className="stat-value" style={{ fontSize: "1rem" }}>
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
        </>
      )}
      <TxStatusLine status={tx.status} />
    </section>
  );
}
