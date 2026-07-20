import { useState } from "react";
import { useWallet } from "./hooks/useWallet";
import { EstatePanel } from "./components/EstatePanel";
import { ClaimPanel } from "./components/ClaimPanel";
import { CONTRACT_ADDRESS } from "./lib/contract";
import { ARC_TESTNET, explorerAddress, shortAddress } from "./lib/chain";

type Tab = "estate" | "claim";

export default function App() {
  const wallet = useWallet();
  const [tab, setTab] = useState<Tab>("estate");
  const [connectError, setConnectError] = useState<string | null>(null);

  const connect = () =>
    wallet.connect().catch((err) => setConnectError((err as Error).message));

  return (
    <div className="app">
      <header>
        <div className="brand">
          <h1>Arc Legacy</h1>
          <p className="tagline">Stablecoin inheritance vaults on Arc</p>
        </div>
        {wallet.account ? (
          <div className="wallet-chip">
            <span className="dot" />
            {shortAddress(wallet.account)}
            {wallet.wrongChain && <span className="pill warning">wrong network</span>}
          </div>
        ) : (
          <button className="primary" onClick={connect} disabled={!wallet.hasWallet}>
            {wallet.hasWallet ? "Connect wallet" : "No wallet detected"}
          </button>
        )}
      </header>

      {!CONTRACT_ADDRESS && (
        <p className="banner warning">
          No contract address configured. Deploy ArcLegacy and set
          VITE_CONTRACT_ADDRESS in web/.env.
        </p>
      )}
      {connectError && <p className="banner warning">{connectError}</p>}

      {wallet.account ? (
        <>
          <nav className="tabs">
            <button
              className={tab === "estate" ? "tab active" : "tab"}
              onClick={() => setTab("estate")}
            >
              My estate
            </button>
            <button
              className={tab === "claim" ? "tab active" : "tab"}
              onClick={() => setTab("claim")}
            >
              Claim an inheritance
            </button>
          </nav>
          {tab === "estate" ? (
            <EstatePanel wallet={wallet} />
          ) : (
            <ClaimPanel wallet={wallet} />
          )}
        </>
      ) : (
        <div className="hero">
          <h2>On-chain estate planning, settled in dollars.</h2>
          <ol>
            <li>Deposit USDC into your vault.</li>
            <li>Name your heirs and their shares.</li>
            <li>Check in to prove you're alive.</li>
            <li>If you go silent, your heirs claim directly — no probate.</li>
          </ol>
          <p className="hint">
            Runs on {ARC_TESTNET.name} (chain {ARC_TESTNET.chainId}), where USDC
            is the native gas token.
          </p>
        </div>
      )}

      <footer>
        {CONTRACT_ADDRESS && (
          <a href={explorerAddress(CONTRACT_ADDRESS)} target="_blank" rel="noreferrer">
            Contract: {shortAddress(CONTRACT_ADDRESS)}
          </a>
        )}
        <a href={ARC_TESTNET.explorerUrl} target="_blank" rel="noreferrer">
          Arc explorer
        </a>
        <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">
          USDC faucet
        </a>
      </footer>
    </div>
  );
}
