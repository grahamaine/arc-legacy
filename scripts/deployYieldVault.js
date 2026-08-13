const { ethers, network } = require("hardhat");

// 5% APY, seed a small interest reserve so the demo can actually pay out.
const RATE_BPS = 500;
const RESERVE_USDC = "2";

async function main() {
  // Guard FIRST — arcMainnet is inert until Circle publishes RPC/chainId.
  if (network.name === "arcMainnet" && !network.config.url) {
    throw new Error(
      "arcMainnet is not configured. Set ARC_MAINNET_RPC_URL and " +
        "ARC_MAINNET_CHAIN_ID in .env once Circle publishes them (Sep 16 2026)."
    );
  }

  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployer. Set PRIVATE_KEY in .env.");

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Network:  ${network.name} (chainId ${network.config.chainId ?? "local"})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} USDC`);
  if (balance === 0n) {
    throw new Error("Deployer has no gas. Faucet: https://faucet.circle.com");
  }

  const vault = await ethers.deployContract("ArcYieldVault", [RATE_BPS]);
  await vault.waitForDeployment();
  const address = await vault.getAddress();
  console.log(`\nArcYieldVault (${RATE_BPS / 100}% APY) deployed to: ${address}`);

  const tx = await vault.fundReserve({ value: ethers.parseEther(RESERVE_USDC) });
  await tx.wait();
  console.log(`Seeded reserve with ${RESERVE_USDC} USDC (tx ${tx.hash})`);

  if (network.name === "arcTestnet") {
    console.log(`Explorer: https://testnet.arcscan.app/address/${address}`);
    console.log(`\nUpdate web/.env and Vercel: VITE_YIELD_VAULT=${address}`);
  } else if (network.name === "arcMainnet") {
    console.log(`\n⚠ MAINNET deploy. Reserve seeded with REAL USDC.`);
    console.log(`Update web/.env + Vercel: VITE_YIELD_VAULT=${address}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
