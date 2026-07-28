const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "No deployer account. Set PRIVATE_KEY in .env (see .env.example)."
    );
  }

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Network:  ${network.name} (chainId ${network.config.chainId ?? "local"})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} USDC`);

  if (balance === 0n) {
    throw new Error(
      "Deployer has no gas funds. Get testnet USDC at https://faucet.circle.com"
    );
  }

  const legacy = await ethers.deployContract("ArcLegacyV2");
  await legacy.waitForDeployment();

  const address = await legacy.getAddress();
  console.log(`\nArcLegacyV2 deployed to: ${address}`);
  if (network.name === "arcTestnet") {
    console.log(`Explorer: https://testnet.arcscan.app/address/${address}`);
    console.log(`\nUpdate web/.env and Vercel: VITE_CONTRACT_ADDRESS=${address}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
