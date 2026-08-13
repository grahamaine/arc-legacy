require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    arcTestnet: {
      url: process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network",
      chainId: 5042002,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    // Arc mainnet — public launch Sep 16 2026. Circle has not yet published the
    // mainnet RPC URL or chain ID, so this network stays inert until you set
    // ARC_MAINNET_RPC_URL and ARC_MAINNET_CHAIN_ID in .env. No values are
    // guessed here; the moment Circle publishes them, deploying is one command:
    //   npx hardhat run scripts/deployArcLegacyV2.js --network arcMainnet
    // Use a dedicated MAINNET_PRIVATE_KEY (falls back to PRIVATE_KEY) so the
    // mainnet deployer is a deliberate, separately-funded wallet.
    arcMainnet: {
      url: process.env.ARC_MAINNET_RPC_URL || "",
      chainId: process.env.ARC_MAINNET_CHAIN_ID
        ? Number(process.env.ARC_MAINNET_CHAIN_ID)
        : undefined,
      accounts: (process.env.MAINNET_PRIVATE_KEY || process.env.PRIVATE_KEY)
        ? [process.env.MAINNET_PRIVATE_KEY || process.env.PRIVATE_KEY]
        : [],
    },
  },
};
