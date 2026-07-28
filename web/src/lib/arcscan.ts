// Arc block-explorer (Blockscout) API helpers.
//
// Arc is unusual: the native gas token is USDC, so every transaction fee an
// account has ever paid is denominated in USDC. We pull the account's tx list
// from the explorer and sum gasUsed * gasPrice to get a real "lifetime gas
// spent in USDC" figure — a stat that is only meaningful on a stablecoin L1.

import { ARC_TESTNET } from "./chain";

const API_BASE = `${ARC_TESTNET.explorerUrl}/api`;

interface RawTx {
  gasUsed: string;
  gasPrice: string;
  isError: string;
  from: string;
  timeStamp: string;
}

export interface GasSummary {
  /** Total fees paid across all outgoing txs, in wei (USDC, 18 decimals). */
  totalFeeWei: bigint;
  /** Number of transactions the account originated. */
  txCount: number;
  /** How many of those reverted (still cost gas). */
  failedCount: number;
  /** Average fee per tx in wei, or 0n when there are no txs. */
  avgFeeWei: bigint;
  /** Unix seconds of the earliest outgoing tx, or null when none. */
  firstTs: number | null;
}

/**
 * Fetch every outgoing transaction for `address` and total the gas it burned.
 * Only counts txs the account sent (fees it actually paid). The public
 * explorer caps a single page at 10 000 rows, which is far more than any demo
 * account will have, so one request suffices.
 */
export async function fetchGasSummary(address: string): Promise<GasSummary> {
  const url =
    `${API_BASE}?module=account&action=txlist&address=${address}` +
    `&page=1&offset=10000&sort=asc`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Explorer API ${res.status}`);
  const body = (await res.json()) as { result?: RawTx[] | string };

  const rows = Array.isArray(body.result) ? body.result : [];
  const lower = address.toLowerCase();

  let totalFeeWei = 0n;
  let txCount = 0;
  let failedCount = 0;
  let firstTs: number | null = null;

  for (const tx of rows) {
    // txlist includes incoming transfers too; only outgoing txs cost us gas.
    if (tx.from?.toLowerCase() !== lower) continue;
    txCount += 1;
    totalFeeWei += BigInt(tx.gasUsed || "0") * BigInt(tx.gasPrice || "0");
    if (tx.isError === "1") failedCount += 1;
    const ts = Number(tx.timeStamp);
    if (ts && (firstTs === null || ts < firstTs)) firstTs = ts;
  }

  return {
    totalFeeWei,
    txCount,
    failedCount,
    avgFeeWei: txCount > 0 ? totalFeeWei / BigInt(txCount) : 0n,
    firstTs,
  };
}
