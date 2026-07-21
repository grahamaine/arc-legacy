import { formatEther, JsonRpcProvider } from "ethers";

// Arc Legacy treasury wallet — the app's default destination for payments and
// the default refund address. Editable per-payment in the Payments widget.
export const ARC_LEGACY_TREASURY = "0xD2965d3c68a1C43ac06e336813912742D852415c";

export const ARC_TESTNET = {
  chainId: 5042002,
  chainIdHex: "0x4cef52",
  name: "Arc Testnet",
  rpcUrl: "https://rpc.testnet.arc.network",
  explorerUrl: "https://testnet.arcscan.app",
  // On Arc the native gas token is USDC (18 decimals at the EVM level).
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
} as const;

// The public Arc RPC rate-limits aggressively, so all reads go through one
// shared provider with small request batches; the wallet is only used to sign.
let readProvider: JsonRpcProvider | null = null;
export function getReadProvider(): JsonRpcProvider {
  if (!readProvider) {
    readProvider = new JsonRpcProvider(ARC_TESTNET.rpcUrl, ARC_TESTNET.chainId, {
      staticNetwork: true,
      batchMaxCount: 5,
    });
  }
  return readProvider;
}

export function explorerTx(hash: string): string {
  return `${ARC_TESTNET.explorerUrl}/tx/${hash}`;
}

export function explorerAddress(address: string): string {
  return `${ARC_TESTNET.explorerUrl}/address/${address}`;
}

export function fmtUsdc(wei: bigint): string {
  const value = Number(formatEther(wei));
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const DAY = 86_400n;
const HOUR = 3_600n;
const MINUTE = 60n;

/** "3d 4h" / "2h 10m" / "5m" style duration for countdowns. */
export function fmtDuration(seconds: bigint): string {
  if (seconds <= 0n) return "0m";
  const d = seconds / DAY;
  const h = (seconds % DAY) / HOUR;
  const m = (seconds % HOUR) / MINUTE;
  if (d > 0n) return `${d}d ${h}h`;
  if (h > 0n) return `${h}h ${m}m`;
  return `${m > 0n ? m : 1n}m`;
}
