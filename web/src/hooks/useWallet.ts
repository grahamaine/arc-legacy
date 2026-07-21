import { useCallback, useEffect, useState } from "react";
import { BrowserProvider, type Eip1193Provider, type JsonRpcSigner } from "ethers";
import { ARC_TESTNET } from "../lib/chain";

declare global {
  interface Window {
    ethereum?: Eip1193Provider & {
      on(event: string, handler: (...args: unknown[]) => void): void;
      removeListener(event: string, handler: (...args: unknown[]) => void): void;
    };
  }
}

export interface WalletState {
  hasWallet: boolean;
  account: string | null;
  wrongChain: boolean;
  provider: BrowserProvider | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  getSigner: () => Promise<JsonRpcSigner>;
}

async function ensureArcChain(ethereum: NonNullable<typeof window.ethereum>) {
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ARC_TESTNET.chainIdHex }],
    });
  } catch (err) {
    // 4902 = chain not added to the wallet yet
    if ((err as { code?: number }).code === 4902) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: ARC_TESTNET.chainIdHex,
            chainName: ARC_TESTNET.name,
            rpcUrls: [ARC_TESTNET.rpcUrl],
            blockExplorerUrls: [ARC_TESTNET.explorerUrl],
            nativeCurrency: ARC_TESTNET.nativeCurrency,
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

export function useWallet(): WalletState {
  const ethereum = typeof window !== "undefined" ? window.ethereum : undefined;
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);

  useEffect(() => {
    if (!ethereum) return;

    const browserProvider = new BrowserProvider(ethereum, "any");
    setProvider(browserProvider);

    ethereum
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        const list = accounts as string[];
        if (list.length > 0) setAccount(list[0]);
      })
      .catch(() => {});
    ethereum
      .request({ method: "eth_chainId" })
      .then((id) => setChainId(parseInt(id as string, 16)))
      .catch(() => {});

    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      setAccount(accounts.length > 0 ? accounts[0] : null);
    };
    const onChainChanged = (...args: unknown[]) => {
      setChainId(parseInt(args[0] as string, 16));
    };
    ethereum.on("accountsChanged", onAccountsChanged);
    ethereum.on("chainChanged", onChainChanged);
    return () => {
      ethereum.removeListener("accountsChanged", onAccountsChanged);
      ethereum.removeListener("chainChanged", onChainChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback(async () => {
    if (!ethereum) throw new Error("No wallet found. Install MetaMask.");
    const accounts = (await ethereum.request({
      method: "eth_requestAccounts",
    })) as string[];
    await ensureArcChain(ethereum);
    setAccount(accounts[0] ?? null);
    const id = (await ethereum.request({ method: "eth_chainId" })) as string;
    setChainId(parseInt(id, 16));
  }, [ethereum]);

  const disconnect = useCallback(() => {
    setAccount(null);
  }, []);

  const getSigner = useCallback(async () => {
    if (!provider) throw new Error("No wallet found.");
    if (chainId !== ARC_TESTNET.chainId && ethereum) {
      await ensureArcChain(ethereum);
    }
    return provider.getSigner();
  }, [provider, chainId, ethereum]);

  return {
    hasWallet: Boolean(ethereum),
    account,
    wrongChain: account !== null && chainId !== null && chainId !== ARC_TESTNET.chainId,
    provider,
    connect,
    disconnect,
    getSigner,
  };
}
