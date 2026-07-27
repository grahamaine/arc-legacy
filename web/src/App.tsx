import { useWallet } from "./hooks/useWallet";
import { Dashboard } from "./components/Dashboard";
import { Splash } from "./components/Splash";
import { Landing } from "./components/Landing";
import { RainBackground } from "./components/RainBackground";
import { CONTRACT_ADDRESS } from "./lib/contract";
import { ARC_TESTNET, explorerAddress, shortAddress } from "./lib/chain";

export default function App() {
  const wallet = useWallet();

  // Signed out → full-width marketing landing with its own top bar.
  if (!wallet.account) {
    return (
      <div className="app">
        <RainBackground />
        <Splash />
        <Landing wallet={wallet} />
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

  // Signed in → app header + dashboard.
  return (
    <div className="app">
      <RainBackground />
      <Splash />
      <header>
        <div className="brand">
          <img className="logo" src="/logo.png" alt="Arc Legacy medallion" />
          <div>
            <h1>Arc Legacy</h1>
            <p className="tagline">Stablecoin inheritance vaults on Arc</p>
          </div>
        </div>
        <div className="wallet-chip">
          <span className="dot" />
          {shortAddress(wallet.account)}
          {wallet.wrongChain && <span className="pill warning">wrong network</span>}
        </div>
      </header>

      {!CONTRACT_ADDRESS && (
        <p className="banner warning">
          Vault contract not deployed yet — swap and bridge still work. Deploy
          ArcLegacy and set VITE_CONTRACT_ADDRESS to enable estates.
        </p>
      )}

      <Dashboard wallet={wallet} />

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
