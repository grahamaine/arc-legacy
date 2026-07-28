import { useEffect, useRef, useState } from "react";
import { isAddress } from "ethers";
import type { WalletState } from "../hooks/useWallet";
import { useTx } from "../hooks/useTx";
import { TxStatusLine } from "./TxStatusLine";
import { fetchEstate, getContract, type EstateView } from "../lib/contract";
import { fmtDuration, fmtUsdc, getReadProvider, shortAddress } from "../lib/chain";

interface ClaimState {
  estate: EstateView;
  isClaimable: boolean;
  claimableNow: bigint; // vested & unclaimed, available right now
  claimed: bigint; // cumulative already withdrawn
}

export function ClaimWidget({ wallet }: { wallet: WalletState }) {
  const { account } = wallet;
  const [ownerInput, setOwnerInput] = useState("");
  const [owner, setOwner] = useState<string | null>(null);
  const [data, setData] = useState<ClaimState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (address: string) => {
    if (!account) return;
    setLoading(true);
    setError(null);
    try {
      const provider = getReadProvider();
      const contract = getContract(provider);
      const [estate, isClaimable, claimableNow, claimed] = await Promise.all([
        fetchEstate(provider, address),
        contract.isClaimable(address),
        contract.claimable(address, account),
        contract.claimedOf(address, account),
      ]);
      setOwner(address);
      setData({ estate, isClaimable, claimableNow, claimed });
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

  const estate = data?.estate;
  const myShare =
    account && estate
      ? estate.beneficiaries.find(
          (b) => b.account.toLowerCase() === account.toLowerCase()
        )?.shareBps ?? 0n
      : 0n;

  const vesting = estate?.vestingDuration ?? 0n;
  const pool = estate ? (estate.unlocked ? estate.unlockedBalance : estate.balance) : 0n;
  const fullShare = (pool * myShare) / 10_000n;
  const claimableNow = data?.claimableNow ?? 0n;
  const claimed = data?.claimed ?? 0n;

  return (
    <section className="card">
      <h3>Claim an inheritance</h3>
      <p className="hint">
        Enter the estate owner's address. If they missed their check-in
        deadline (or guardians unlocked the estate) and named you as an heir,
        claim your share here.
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
              {data?.isClaimable ? (
                <span className="pill unlocked">Claimable</span>
              ) : (
                <span className="pill active">Locked</span>
              )}
              <span className="stat-value" style={{ fontSize: "1rem" }}>
                {Number(myShare) / 100}%
                {myShare > 0n && ` · ${fmtUsdc(fullShare)} USDC total`}
              </span>
            </div>
          </div>

          {vesting > 0n && myShare > 0n && (
            <p className="hint">
              This estate streams inheritances over {fmtDuration(vesting)}. You
              can claim the vested portion repeatedly as it accrues.
              {claimed > 0n && ` Claimed so far: ${fmtUsdc(claimed)} USDC.`}
            </p>
          )}

          {myShare === 0n ? (
            <p className="hint">You are not named as an heir of this estate.</p>
          ) : !data?.isClaimable ? (
            <p className="hint">
              The estate is still locked — the owner is checking in on time.
            </p>
          ) : claimableNow === 0n && claimed > 0n ? (
            <p className="hint">
              You've claimed all that has vested so far. Check back as more of
              your share unlocks. ✓
            </p>
          ) : (
            <button
              className="primary"
              disabled={claimableNow === 0n || tx.busy}
              onClick={() =>
                tx.run("Claim inheritance", async () =>
                  getContract(await wallet.getSigner()).claim(owner)
                )
              }
            >
              Claim {fmtUsdc(claimableNow)} USDC
              {vesting > 0n ? " available now" : ""}
            </button>
          )}
        </>
      )}
      <TxStatusLine status={tx.status} />
    </section>
  );
}
