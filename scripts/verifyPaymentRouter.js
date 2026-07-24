const { ethers, network } = require("hardhat");

// Live smoke test of the deployed PaymentRouter: does one real payAndSplit on
// Arc testnet and prints the tx hash so the flow is verifiable on Arcscan.
const ROUTER = "0x3a210EF428ce1aF1549F0BcF60DA8B608C200630";
const TREASURY = "0x3EEE5c7f94Ba069433b4459a4574764b4ac7B7d6";

async function main() {
  const [signer] = await ethers.getSigners();
  const router = await ethers.getContractAt("PaymentRouter", ROUTER, signer);

  const amount = ethers.parseEther("0.01");
  const feeBps = 250; // 2.5%
  const ref = ethers.encodeBytes32String("smoke-test");

  console.log(`Payer:    ${signer.address}`);
  console.log(`payAndSplit ${ethers.formatEther(amount)} USDC → payee ${TREASURY}, fee ${feeBps} bps → ${signer.address}`);

  const tx = await router.payAndSplit(TREASURY, signer.address, feeBps, ref, {
    value: amount,
  });
  console.log(`\nSubmitted: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`Confirmed in block ${receipt.blockNumber}`);
  if (network.name === "arcTestnet") {
    console.log(`Explorer:  https://testnet.arcscan.app/tx/${tx.hash}`);
  }

  const ev = receipt.logs
    .map((l) => {
      try {
        return router.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((p) => p && p.name === "PaymentSplit");
  if (ev) {
    console.log(
      `PaymentSplit: net ${ethers.formatEther(ev.args.netAmount)} → payee, fee ${ethers.formatEther(ev.args.feeAmount)} → fee recipient ✓`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
