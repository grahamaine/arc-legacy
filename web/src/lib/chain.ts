import { formatEther, JsonRpcProvider } from "ethers";

// Arc Legacy treasury wallet — the app's default destination for payments and
// the default refund address. Editable per-payment in the Payments widget.
// This is the active operator wallet (MetaMask "Aine Testnet Wallet").
export const ARC_LEGACY_TREASURY = "0x3EEE5c7f94Ba069433b4459a4574764b4ac7B7d6";

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

/**
 * The Arc public RPC rate-limits hard. Under a burst of reads (a section with
 * several widgets mounting at once) it returns "request limit reached" or an
 * empty eth_call result, which ethers surfaces as a CALL_EXCEPTION with
 * "missing revert data". Those are transient, not real reverts — so treat them
 * as retryable rather than genuine contract failures.
 */
export function isTransientRpcError(err: unknown): boolean {
  const e = err as { code?: string | number; message?: string; error?: { code?: number } };
  const code = e?.code;
  const msg = (e?.message ?? "").toLowerCase();
  return (
    code === "CALL_EXCEPTION" && msg.includes("missing revert data")
    || code === -32011
    || e?.error?.code === -32011
    || msg.includes("request limit")
    || msg.includes("rate limit")
    || code === "TIMEOUT"
    || code === "NETWORK_ERROR"
  );
}

/**
 * Run a read, retrying transient RPC failures with a short backoff. Genuine
 * contract reverts (real "missing revert data" is rare here) throw on the last
 * attempt so callers can still surface them.
 */
export async function readWithRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 600
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1 || !isTransientRpcError(err)) throw err;
      await new Promise((r) => setTimeout(r, baseDelayMs * (i + 1)));
    }
  }
  throw lastErr;
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
