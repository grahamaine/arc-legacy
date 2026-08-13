import { Contract, type ContractRunner } from "ethers";
import { coalescedRead } from "./chain";

// LegacyStreams — recurring native-USDC payments. Empty until the contract is
// deployed and VITE_STREAMS_ADDRESS is set (the widget shows a deploy hint).
export const STREAMS_ADDRESS: string = import.meta.env.VITE_STREAMS_ADDRESS ?? "";

export const LEGACY_STREAMS_ABI = [
  "function createStream(address recipient, uint128 amount, uint64 interval, uint64 endTime) payable returns (uint256 id)",
  "function fund(uint256 id) payable",
  "function executeDue(uint256 id) returns (bool)",
  "function cancel(uint256 id)",
  "function streamCount() view returns (uint256)",
  "function isDue(uint256 id) view returns (bool)",
  "function getStream(uint256 id) view returns (address creator, address recipient, uint128 amount, uint64 interval, uint64 nextDue, uint64 endTime, uint128 balance, bool active)",
  "function streamsOf(address creator) view returns (uint256[])",
] as const;

export interface StreamView {
  id: bigint;
  creator: string;
  recipient: string;
  amount: bigint;
  interval: bigint;
  nextDue: bigint;
  endTime: bigint;
  balance: bigint;
  active: boolean;
}

export function getStreamsContract(runner: ContractRunner): Contract {
  return new Contract(STREAMS_ADDRESS, LEGACY_STREAMS_ABI, runner);
}

/** All streams created by `creator`, with full detail, newest last. */
export async function fetchStreamsOf(
  runner: ContractRunner,
  creator: string
): Promise<StreamView[]> {
  const ids: bigint[] = await coalescedRead(`streamsOf:${creator}`, () =>
    getStreamsContract(runner).streamsOf(creator)
  );
  return Promise.all(
    ids.map(async (id) => {
      const s = await coalescedRead(`stream:${id}`, () =>
        getStreamsContract(runner).getStream(id)
      );
      return {
        id,
        creator: s.creator,
        recipient: s.recipient,
        amount: s.amount,
        interval: s.interval,
        nextDue: s.nextDue,
        endTime: s.endTime,
        balance: s.balance,
        active: s.active,
      };
    })
  );
}
