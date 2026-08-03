/**
 * App Kit's swap / bridge / earn methods don't guarantee the settled
 * transaction hash comes back on a field literally named `txHash`. Depending on
 * the method and version it can arrive as `hash`, `transactionHash`, `id`, a
 * source-chain burn hash, or nested inside a `receipt` / `transaction` object.
 *
 * If a widget reads only `res.txHash` and the SDK used a different key, the run
 * still succeeds on-chain but the UI shows a bare "✓" with no explorer link —
 * so a real demo run leaves no verifiable proof. This helper digs a real 32-byte
 * tx hash out of whatever shape the SDK returned, and (in dev) logs the raw
 * result so a hash is never silently lost.
 */

/** A 32-byte hex transaction hash, e.g. 0x + 64 hex chars. */
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

// Keys, in priority order, that App Kit results are known to carry a hash on.
const HASH_KEYS = [
  "txHash",
  "transactionHash",
  "hash",
  "sourceTxHash",
  "burnTxHash",
  "depositTxHash",
  "settlementTxHash",
  "id",
] as const;

// Nested containers that may themselves hold one of the hash keys.
const NESTED_KEYS = ["receipt", "transaction", "tx", "result", "data", "response"] as const;

function isHash(value: unknown): value is string {
  return typeof value === "string" && TX_HASH_RE.test(value);
}

/**
 * Best-effort extraction of an on-chain tx hash from a loosely-typed App Kit
 * result. Returns a validated 0x… hash, or null if none is present.
 */
export function extractTxHash(result: unknown, depth = 0): string | null {
  if (isHash(result)) return result;
  if (result == null || typeof result !== "object" || depth > 3) return null;

  const obj = result as Record<string, unknown>;

  // 1. Direct, prioritised keys on this object.
  for (const key of HASH_KEYS) {
    if (isHash(obj[key])) return obj[key] as string;
  }

  // 2. Recurse into known nested containers.
  for (const key of NESTED_KEYS) {
    if (obj[key] != null && typeof obj[key] === "object") {
      const nested = extractTxHash(obj[key], depth + 1);
      if (nested) return nested;
    }
  }

  // 3. Last resort: any string value that looks like a tx hash.
  for (const value of Object.values(obj)) {
    if (isHash(value)) return value;
  }

  return null;
}

/**
 * Pull the tx hash from an App Kit result and, in dev, log the raw result so a
 * missing link can always be traced back to the real hash during a demo.
 */
export function txHashFromResult(result: unknown, label: string): string | null {
  const hash = extractTxHash(result);
  if (import.meta.env.DEV && !hash) {
    // eslint-disable-next-line no-console
    console.warn(`[${label}] no tx hash found in App Kit result:`, result);
  } else if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug(`[${label}] tx hash ${hash}`, result);
  }
  return hash;
}
