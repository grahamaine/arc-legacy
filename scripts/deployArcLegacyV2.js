const { ethers, network } = require("hardhat");

async function main() {
  // Guard FIRST, before touching the provider — arcMainnet stays inert until
  // Circle publishes the mainnet RPC/chainId and you set them in .env.
  // Otherwise the empty RPC URL fails obscurely inside getSigners().
  if (network.name === "arcMainnet" && !network.config.url) {
    throw new Error(
      "arcMainnet is not configured. Set ARC_MAINNET_RPC_URL and " +
        "ARC_MAINNET_CHAIN_ID in .env once Circle publishes them (mainnet " +
        "launches Sep 16 2026)."
    );
  }

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
    const where =
      network.name === "arcTestnet"
        ? "Get testnet USDC at https://faucet.circle.com"
        : "Fund the deployer wallet with USDC for gas before deploying.";
    throw new Error(`Deployer has no gas funds. ${where}`);
  }

  const legacy = await ethers.deployContract("ArcLegacyV2");
  await legacy.waitForDeployment();

  const address = await legacy.getAddress();
  console.log(`\nArcLegacyV2 deployed to: ${address}`);
  if (network.name === "arcTestnet") {
    console.log(`Explorer: https://testnet.arcscan.app/address/${address}`);
    console.log(`\nUpdate web/.env and Vercel: VITE_CONTRACT_ADDRESS=${address}`);
  } else if (network.name === "arcMainnet") {
    console.log(`\n⚠ MAINNET deploy. Record this address and update web/.env + Vercel:`);
    console.log(`VITE_CONTRACT_ADDRESS=${address}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
