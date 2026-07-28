import { Contract, type ContractRunner } from "ethers";

/** ArcYieldVault contract on Arc testnet — set via VITE_YIELD_VAULT. */
export const YIELD_VAULT_ADDRESS: string =
  import.meta.env.VITE_YIELD_VAULT ?? "";

export const YIELD_VAULT_ABI = [
  "function supply() payable",
  "function withdraw(uint256 amount)",
  "function claimInterest()",
  "function fundReserve() payable",
  "function rateBps() view returns (uint16)",
  "function totalPrincipal() view returns (uint256)",
  "function reserve() view returns (uint256)",
  "function positionOf(address user) view returns (uint256 principal, uint256 accrued, uint64 lastAccrual)",
  "event Supplied(address indexed user, uint256 amount, uint256 principal)",
  "event Withdrawn(address indexed user, uint256 amount, uint256 principal)",
  "event InterestClaimed(address indexed user, uint256 amount)",
] as const;

export interface VaultPosition {
  principal: bigint;
  accrued: bigint;
  lastAccrual: bigint;
}

export interface VaultStats {
  rateBps: number;
  totalPrincipal: bigint;
  reserve: bigint;
}

export function getYieldVault(runner: ContractRunner): Contract {
  return new Contract(YIELD_VAULT_ADDRESS, YIELD_VAULT_ABI, runner);
}

export async function fetchVaultPosition(
  runner: ContractRunner,
  user: string
): Promise<VaultPosition> {
  const raw = await getYieldVault(runner).positionOf(user);
  return { principal: raw.principal, accrued: raw.accrued, lastAccrual: raw.lastAccrual };
}

export async function fetchVaultStats(runner: ContractRunner): Promise<VaultStats> {
  const c = getYieldVault(runner);
  const [rateBps, totalPrincipal, reserve] = await Promise.all([
    c.rateBps(),
    c.totalPrincipal(),
    c.reserve(),
  ]);
  return { rateBps: Number(rateBps), totalPrincipal, reserve };
}
