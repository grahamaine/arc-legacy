import { Contract, type ContractRunner } from "ethers";

/** PaymentRouter contract on Arc testnet — set via VITE_PAYMENT_ROUTER. */
export const PAYMENT_ROUTER_ADDRESS: string =
  import.meta.env.VITE_PAYMENT_ROUTER ?? "";

export const PAYMENT_ROUTER_ABI = [
  "function payAndSplit(address payee, address feeRecipient, uint96 feeBps, bytes32 ref) payable",
  "function openEscrow(bytes32 id, address payee, address feeRecipient, address refundTo, uint96 feeBps) payable",
  "function release(bytes32 id)",
  "function refund(bytes32 id)",
  "function getEscrow(bytes32 id) view returns (address payer, address payee, address feeRecipient, address refundTo, uint96 feeBps, uint256 amount, uint8 status)",
  "event PaymentSplit(bytes32 indexed ref, address indexed payer, address indexed payee, address feeRecipient, uint256 netAmount, uint256 feeAmount)",
  "event EscrowOpened(bytes32 indexed id, address indexed payer, address indexed payee, uint256 amount)",
  "event EscrowReleased(bytes32 indexed id, address indexed payee, uint256 netAmount, uint256 feeAmount)",
  "event EscrowRefunded(bytes32 indexed id, address indexed refundTo, uint256 amount)",
] as const;

export function getPaymentRouter(runner: ContractRunner): Contract {
  return new Contract(PAYMENT_ROUTER_ADDRESS, PAYMENT_ROUTER_ABI, runner);
}
