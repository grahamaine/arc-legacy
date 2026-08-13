// ---------------------------------------------------------------------------
// Single source of truth for which Arc network the web app targets.
//
// Switch with `VITE_NETWORK=mainnet` (default: testnet). Arc mainnet launches
// Sep 16 2026 and Circle publishes its RPC / chainId / token addresses near
// launch — the mainnet fields below read from env vars so they can be filled in
// at that point without touching code. Until then, testnet is the default and
// the app behaves exactly as before.
//
// chain.ts and appkit.ts re-export from here under their existing names, so no
// consumer needs to change.
// ---------------------------------------------------------------------------

const env = import.meta.env as Record<string, string | undefined>;

export const IS_MAINNET = (env.VITE_NETWORK ?? "").toLowerCase() === "mainnet";

// --- Arc chain parameters (RPC, explorer, native USDC gas) -----------------
const TESTNET_CHAIN = {
  chainId: 5042002,
  chainIdHex: "0x4cef52",
  name: "Arc Testnet",
  rpcUrl: "https://rpc.testnet.arc.network",
  explorerUrl: "https://testnet.arcscan.app",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
} as const;

const mainnetChainId = Number(env.VITE_ARC_MAINNET_CHAIN_ID) || 0;
const MAINNET_CHAIN = {
  chainId: mainnetChainId,
  chainIdHex: mainnetChainId ? "0x" + mainnetChainId.toString(16) : "0x0",
  name: "Arc",
  rpcUrl: env.VITE_ARC_MAINNET_RPC_URL ?? "",
  explorerUrl: env.VITE_ARC_EXPLORER_URL ?? "https://arcscan.app",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
} as const;

export const NETWORK = IS_MAINNET ? MAINNET_CHAIN : TESTNET_CHAIN;

// --- Circle App Kit chain identifiers --------------------------------------
// App Kit refers to chains by string. Testnet is "Arc_Testnet"; the mainnet
// string is expected to be "Arc" but is overridable via env in case Circle
// names it differently at launch.
//
// The installed @circle-fin/app-kit SDK's chain unions (SwapChainIdentifier,
// EarnChain, …) predate Arc mainnet and don't yet include "Arc". We assert the
// runtime value as the testnet literal so all App Kit call sites type-check;
// the value is still correct at runtime. Widen/remove this assertion once App
// Kit ships Arc-mainnet chain types.
const appkitChainValue: string = IS_MAINNET
  ? (env.VITE_ARC_APPKIT_CHAIN ?? "Arc")
  : "Arc_Testnet";
export const APPKIT_CHAIN = appkitChainValue as "Arc_Testnet";

// Chains users can bridge USDC from (via CCTP). Testnet sources are Sepolia
// networks; mainnet sources are the CCTP-supported mainnets.
const TESTNET_BRIDGE_SOURCES = [
  { id: "Ethereum_Sepolia", label: "Ethereum Sepolia" },
  { id: "Base_Sepolia", label: "Base Sepolia" },
  { id: "Arbitrum_Sepolia", label: "Arbitrum Sepolia" },
  { id: "Optimism_Sepolia", label: "OP Sepolia" },
  { id: "Avalanche_Fuji", label: "Avalanche Fuji" },
] as const;

const MAINNET_BRIDGE_SOURCES = [
  { id: "Ethereum", label: "Ethereum" },
  { id: "Base", label: "Base" },
  { id: "Arbitrum", label: "Arbitrum" },
  { id: "Optimism", label: "Optimism" },
  { id: "Avalanche", label: "Avalanche" },
] as const;

export const BRIDGE_SOURCES = IS_MAINNET
  ? MAINNET_BRIDGE_SOURCES
  : TESTNET_BRIDGE_SOURCES;

// --- Token / vault addresses (fill mainnet values from env at launch) ------
export const EURC_ADDRESS = IS_MAINNET
  ? (env.VITE_EURC_ADDRESS ?? "")
  : "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

export const EARN_VAULT = IS_MAINNET
  ? (env.VITE_EARN_VAULT ?? "")
  : "0xAabbeF1D3971c710276ed41eC791BbE14CdB8E88";

// Loud dev warning if mainnet is selected but the params Circle publishes at
// launch haven't been supplied yet — prevents a silently broken mainnet build.
if (IS_MAINNET && (!NETWORK.rpcUrl || !NETWORK.chainId)) {
  // eslint-disable-next-line no-console
  console.warn(
    "[network] VITE_NETWORK=mainnet but VITE_ARC_MAINNET_RPC_URL / " +
      "VITE_ARC_MAINNET_CHAIN_ID are not set. Fill these in once Circle " +
      "publishes Arc mainnet params (Sep 16 2026)."
  );
}
