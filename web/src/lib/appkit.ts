import type { AppKit } from "@circle-fin/app-kit";
import type { ViemAdapter } from "@circle-fin/adapter-viem-v2";

/** Chain identifier strings understood by App Kit. */
export const ARC_CHAIN = "Arc_Testnet" as const;

/** Testnets users can bridge USDC from into Arc. */
export const BRIDGE_SOURCES = [
  { id: "Ethereum_Sepolia", label: "Ethereum Sepolia" },
  { id: "Base_Sepolia", label: "Base Sepolia" },
  { id: "Arbitrum_Sepolia", label: "Arbitrum Sepolia" },
  { id: "Optimism_Sepolia", label: "OP Sepolia" },
  { id: "Avalanche_Fuji", label: "Avalanche Fuji" },
] as const;

/** EURC token on Arc testnet (USDC is the native gas token). */
export const ARC_EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

/** Circle Earn demo lending vault on Arc testnet (from App Kit docs). */
export const ARC_EARN_VAULT = "0xAabbeF1D3971c710276ed41eC791BbE14CdB8E88";

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
