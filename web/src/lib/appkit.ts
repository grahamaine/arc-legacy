import type { AppKit } from "@circle-fin/app-kit";
import type { ViemAdapter } from "@circle-fin/adapter-viem-v2";
import {
  APPKIT_CHAIN,
  BRIDGE_SOURCES as NETWORK_BRIDGE_SOURCES,
  EARN_VAULT,
  EURC_ADDRESS,
} from "./network";

// Network-aware Circle App Kit identifiers. These now switch with VITE_NETWORK
// (see network.ts); the names are kept for backward compatibility.

/** Chain identifier string understood by App Kit (Arc_Testnet or Arc). */
export const ARC_CHAIN = APPKIT_CHAIN;

/** Chains users can bridge USDC from into Arc (via CCTP). */
export const BRIDGE_SOURCES = NETWORK_BRIDGE_SOURCES;

/** EURC token address on the active Arc network (USDC is the native gas token). */
export const ARC_EURC_ADDRESS = EURC_ADDRESS;

/** Circle Earn lending vault on the active Arc network. */
export const ARC_EARN_VAULT = EARN_VAULT;

// The kit and its deps are heavy, so they are imported lazily the first time
// a swap/bridge widget actually needs them.
let kitPromise: Promise<AppKit> | null = null;
export function getAppKit(): Promise<AppKit> {
  if (!kitPromise) {
    kitPromise = import("@circle-fin/app-kit").then((m) => new m.AppKit());
  }
  return kitPromise;
}

let adapterPromise: Promise<ViemAdapter> | null = null;
export function getAdapter(): Promise<ViemAdapter> {
  if (!adapterPromise) {
    if (!window.ethereum) {
      return Promise.reject(new Error("No wallet found. Install MetaMask."));
    }
    adapterPromise = import("@circle-fin/adapter-viem-v2").then((m) =>
      m.createViemAdapterFromProvider({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        provider: window.ethereum as any,
      })
    );
  }
  return adapterPromise;
}

export function kitErrorMessage(err: unknown): string {
  const e = err as { shortMessage?: string; message?: string };
  return e.shortMessage ?? e.message ?? "Operation failed";
}
