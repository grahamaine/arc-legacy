import { Contract, type ContractRunner } from "ethers";

export const CONTRACT_ADDRESS: string =
  import.meta.env.VITE_CONTRACT_ADDRESS ?? "";

export const ARC_LEGACY_ABI = [
  // owner actions
  "function deposit() payable",
  "function withdraw(uint256 amount)",
  "function checkIn()",
  "function setCheckInInterval(uint64 interval)",
  "function setVesting(uint64 duration)",
  "function setBeneficiaries(address[] accounts, uint96[] sharesBps)",
  "function setGuardians(address[] guardians, uint8 threshold)",
  // beneficiary / guardian actions
  "function triggerUnlock(address owner)",
  "function claim(address owner)",
  "function attestUnlock(address owner)",
  // views
  "function getEstate(address owner) view returns (uint256 balance, uint64 lastCheckIn, uint64 checkInInterval, bool unlocked, uint256 unlockedBalance, uint64 unlockedAt, uint64 vestingDuration, tuple(address account, uint96 shareBps)[] beneficiaries)",
  "function getGuardians(address owner) view returns (address[] guardians, uint8 threshold, uint256 attested)",
  "function claimable(address owner, address beneficiary) view returns (uint256)",
  "function claimedOf(address owner, address beneficiary) view returns (uint256)",
  "function isClaimable(address owner) view returns (bool)",
  // events
  "event Deposited(address indexed owner, uint256 amount)",
  "event Withdrawn(address indexed owner, uint256 amount)",
  "event CheckedIn(address indexed owner, uint64 nextDeadline)",
  "event IntervalSet(address indexed owner, uint64 interval)",
  "event VestingSet(address indexed owner, uint64 duration)",
  "event BeneficiariesSet(address indexed owner, uint256 count)",
  "event GuardiansSet(address indexed owner, uint256 count, uint8 threshold)",
  "event GuardianAttested(address indexed owner, address indexed guardian, uint256 count)",
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
  unlockedAt: bigint;
  vestingDuration: bigint;
  beneficiaries: Beneficiary[];
}

export interface GuardianView {
  guardians: string[];
  threshold: number;
  attested: number;
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
    unlockedAt: raw.unlockedAt,
    vestingDuration: raw.vestingDuration,
    beneficiaries: raw.beneficiaries.map(
      (b: { account: string; shareBps: bigint }) => ({
        account: b.account,
        shareBps: b.shareBps,
      })
    ),
  };
}

export async function fetchGuardians(
  runner: ContractRunner,
  owner: string
): Promise<GuardianView> {
  const raw = await getContract(runner).getGuardians(owner);
  return {
    guardians: [...raw.guardians],
    threshold: Number(raw.threshold),
    attested: Number(raw.attested),
  };
}
