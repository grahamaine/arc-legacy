import { Contract, type ContractRunner } from "ethers";

export const CONTRACT_ADDRESS: string =
  import.meta.env.VITE_CONTRACT_ADDRESS ?? "";

export const ARC_LEGACY_ABI = [
  // owner actions
  "function deposit() payable",
  "function withdraw(uint256 amount)",
  "function checkIn()",
  "function setCheckInInterval(uint64 interval)",
  "function setBeneficiaries(address[] accounts, uint96[] sharesBps)",
  // beneficiary actions
  "function claim(address owner)",
  // views
  "function getEstate(address owner) view returns (uint256 balance, uint64 lastCheckIn, uint64 checkInInterval, bool unlocked, uint256 unlockedBalance, tuple(address account, uint96 shareBps)[] beneficiaries)",
  "function isClaimable(address owner) view returns (bool)",
  "function hasClaimed(address owner, address beneficiary) view returns (bool)",
  // events
  "event Deposited(address indexed owner, uint256 amount)",
  "event Withdrawn(address indexed owner, uint256 amount)",
  "event CheckedIn(address indexed owner, uint64 nextDeadline)",
  "event IntervalSet(address indexed owner, uint64 interval)",
  "event BeneficiariesSet(address indexed owner, uint256 count)",
  "event EstateUnlocked(address indexed owner, uint256 snapshotBalance)",
  "event Claimed(address indexed owner, address indexed beneficiary, uint256 amount)",
] as const;

export interface Beneficiary {
  account: string;
  shareBps: bigint;
}

export interface EstateView {
  balance: bigint;
  lastCheckIn: bigint;
  checkInInterval: bigint;
  unlocked: boolean;
  unlockedBalance: bigint;
  beneficiaries: Beneficiary[];
}

export function getContract(runner: ContractRunner): Contract {
  return new Contract(CONTRACT_ADDRESS, ARC_LEGACY_ABI, runner);
}

export async function fetchEstate(
  runner: ContractRunner,
  owner: string
): Promise<EstateView> {
  const raw = await getContract(runner).getEstate(owner);
  return {
    balance: raw.balance,
    lastCheckIn: raw.lastCheckIn,
    checkInInterval: raw.checkInInterval,
    unlocked: raw.unlocked,
    unlockedBalance: raw.unlockedBalance,
    beneficiaries: raw.beneficiaries.map(
      (b: { account: string; shareBps: bigint }) => ({
        account: b.account,
        shareBps: b.shareBps,
      })
    ),
  };
}
