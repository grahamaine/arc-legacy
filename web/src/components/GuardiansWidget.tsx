import { useCallback, useEffect, useState } from "react";
import { isAddress } from "ethers";
import type { WalletState } from "../hooks/useWallet";
import { useTx } from "../hooks/useTx";
import { TxStatusLine } from "./TxStatusLine";
import {
  fetchGuardians,
  getContract,
  type EstateView,
  type GuardianView,
} from "../lib/contract";
import { getReadProvider, shortAddress } from "../lib/chain";

/**
 * Guardians — an M-of-N social-recovery style trigger. The owner nominates
 * trusted addresses and a threshold; when that many guardians attest, the
 * estate unlocks immediately rather than waiting out the full dead-man's-switch
 * interval. Any owner check-in clears pending attestations (a false alarm).
 */
export function GuardiansWidget({
  wallet,
  estate,
  refresh,
}: {
  wallet: WalletState;
  estate: EstateView | null;
  refresh: () => void;
}) {
  const { account } = wallet;
  const [config, setConfig] = useState<GuardianView | null>(null);
  const [addrText, setAddrText] = useState("");
  const [threshold, setThreshold] = useState("");

  // Guardian mode — attest on someone else's estate.
  const [wardInput, setWardInput] = useState("");

  const loadConfig = useCallback(() => {
    if (!account) return;
    fetchGuardians(getReadProvider(), account)
      .then(setConfig)
      .catch(() => setConfig(null));
  }, [account]);

  useEffect(loadConfig, [loadConfig]);

  const tx = useTx(() => {
    refresh();
    loadConfig();
  });
  const attestTx = useTx();

  const parsedAddrs = addrText
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const allValid = parsedAddrs.every((a) => isAddress(a));
  const thresholdNum = Number(threshold);
  const canSave =
    !tx.busy &&
    parsedAddrs.length > 0 &&
    allValid &&
    thresholdNum >= 1 &&
    thresholdNum <= parsedAddrs.length;

  const save = () =>
    tx
      .run("Set guardians", async () =>
        getContract(await wallet.getSigner()).setGuardians(
          parsedAddrs,
          thresholdNum
        )
      )
      .then(() => {
        setAddrText("");
        setThreshold("");
      });

  const disable = () =>
    tx.run("Disable guardians", async () =>
      getContract(await wallet.getSigner()).setGuardians([], 0)
    );

  const attest = () =>
    attestTx.run("Attest unlock", async () =>
      getContract(await wallet.getSigner()).attestUnlock(wardInput)
    );

  const hasGuardians = (config?.guardians.length ?? 0) > 0;

  return (
    <section className="card">
      <h3>Guardians</h3>
      <p className="hint">
        Nominate M-of-N trusted guardians who can jointly unlock your estate if
        something happens to you — faster and more credible than waiting out the
        timer alone.
      </p>

      {estate?.unlocked ? (
        <p className="hint">Estate is unlocked — guardian settings are final.</p>
      ) : (
        <>
          {config && hasGuardians && (
            <div className="stat-row" style={{ marginBottom: "0.6rem" }}>
              <div className="stat">
                <span className="stat-label">Current roster</span>
                <span className="stat-value" style={{ fontSize: "1rem" }}>
                  {config.threshold}-of-{config.guardians.length}
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Attested now</span>
                <span className="stat-value" style={{ fontSize: "1rem" }}>
                  {config.attested} / {config.threshold}
                </span>
              </div>
            </div>
          )}
          {config && hasGuardians && (
            <ul className="mini-list">
              {config.guardians.map((g) => (
                <li key={g}>{shortAddress(g)}</li>
              ))}
            </ul>
          )}

          <p className="hint">
            Guardian addresses (comma or newline separated):
          </p>
          <textarea
            rows={3}
            placeholder="0xabc…, 0xdef…"
            value={addrText}
            onChange={(e) => setAddrText(e.target.value)}
          />
          {addrText && !allValid && (
            <p className="hint error">One or more addresses are invalid.</p>
          )}
          <div className="field-row">
            <input
              placeholder={`Threshold (1–${Math.max(1, parsedAddrs.length)})`}
              inputMode="numeric"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
            <button disabled={!canSave} onClick={save}>
              Save guardians
            </button>
          </div>
          {hasGuardians && (
            <button className="ghost" disabled={tx.busy} onClick={disable}>
              Disable guardians
            </button>
          )}
        </>
      )}

      <hr className="divider" />
      <p className="hint">
        <strong>Are you a guardian?</strong> Enter the estate you protect and
        attest that it should unlock. It unlocks once the owner's threshold of
        guardians agree.
      </p>
      <div className="field-row">
        <input
          placeholder="Owner address you guard (0x…)"
          value={wardInput}
          onChange={(e) => setWardInput(e.target.value.trim())}
        />
        <button
          disabled={!isAddress(wardInput) || attestTx.busy}
          onClick={attest}
        >
          Attest unlock
        </button>
      </div>
      <TxStatusLine status={attestTx.status} />
      <TxStatusLine status={tx.status} />
      <p className="widget-note">
        <strong>M-of-N guardians</strong> — trusted addresses who can jointly
        unlock your estate early (social recovery). Any proof-of-life you make
        voids pending attestations, so a false alarm costs nothing.
      </p>
    </section>
  );
}
