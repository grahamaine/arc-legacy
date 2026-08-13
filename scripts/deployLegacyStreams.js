const { ethers, network } = require("hardhat");

async function main() {
  // Guard FIRST — arcMainnet is inert until Circle publishes RPC/chainId.
  if (network.name === "arcMainnet" && !network.config.url) {
    throw new Error(
      "arcMainnet is not configured. Set ARC_MAINNET_RPC_URL and " +
        "ARC_MAINNET_CHAIN_ID in .env once Circle publishes them (Sep 16 2026)."
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

  const streams = await ethers.deployContract("LegacyStreams");
  await streams.waitForDeployment();

  const address = await streams.getAddress();
  console.log(`\nLegacyStreams deployed to: ${address}`);
  if (network.name === "arcTestnet") {
    console.log(`Explorer: https://testnet.arcscan.app/address/${address}`);
    console.log(`\nUpdate web/.env + Vercel: VITE_STREAMS_ADDRESS=${address}`);
    console.log(`Update .env for the keeper:  STREAMS_ADDRESS=${address}`);
  } else if (network.name === "arcMainnet") {
    console.log(`\n⚠ MAINNET deploy. Update web/.env + Vercel: VITE_STREAMS_ADDRESS=${address}`);
    console.log(`Update .env for the keeper:  STREAMS_ADDRESS=${address}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
