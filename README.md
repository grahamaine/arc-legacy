# Arc Legacy 🏛️

**Stablecoin inheritance vaults on [Arc](https://docs.arc.io)** — Circle's stablecoin-native L1 where USDC is the gas token.

Built for the **Build on Arc** hackathon (DeFi track).

**Live app:** https://arc-legacy-eight.vercel.app
**Contract (Arc testnet):** [`0x4DB6268FC91E941Cb67f465639fAf540d52Eee57`](https://testnet.arcscan.app/address/0x4DB6268FC91E941Cb67f465639fAf540d52Eee57)

## The idea

Billions in crypto are lost forever when holders die or lose access — there is no "next of kin" for a wallet. Arc Legacy is on-chain estate planning:

1. **Create an estate** — deposit USDC into your vault.
2. **Name your heirs** — assign each beneficiary a percentage share (basis points summing to 100%).
3. **Stay alive** — check in before your dead-man's-switch deadline (default 30 days, configurable). Any deposit, withdrawal, or settings change also counts as a check-in.
4. **Legacy executes itself** — if you miss the deadline, the estate unlocks and each heir can claim their share directly. No custodian, no probate, sub-second settlement in USDC.

## Why Arc

- **USDC as native gas** means heirs receive real dollars, not a volatile token — and pay fees in the same asset they inherit.
- **Sub-second finality** makes claims instant.
- **Predictable, dollar-denominated fees** suit a product for non-crypto-native families.

## Project layout

| Path | Purpose |
|---|---|
| `contracts/ArcLegacy.sol` | Estate vault: deposits, beneficiaries, check-ins, claims |
| `test/ArcLegacy.test.js` | Full unit test suite (Hardhat + ethers v6) |
| `scripts/deploy.js` | Deploys to Arc testnet |
| `web/` | React webapp (Vite + ethers v6): create estate, manage heirs, check in, claim |

## Getting started

```bash
npm install
npx hardhat test          # run the test suite
```

### Run the webapp

```bash
cd web
npm install
cp .env.example .env      # set VITE_CONTRACT_ADDRESS to the deployed address
npm run dev               # http://localhost:5173
```

### Deploy to Arc testnet

1. Copy `.env.example` to `.env` and set `PRIVATE_KEY`.
2. Fund the deployer with testnet USDC: https://faucet.circle.com (select Arc Testnet).
3. Deploy:

```bash
npx hardhat run scripts/deploy.js --network arcTestnet
```

### Arc testnet details

| | |
|---|---|
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| Gas token | USDC (18 decimals at EVM level) |
| Explorer | https://testnet.arcscan.app |
| Faucet | https://faucet.circle.com |

## Roadmap (hackathon checkpoints)

- [x] **Checkpoint 1 (Jul 19)** — idea, team, project page
- [x] **Checkpoint 2 (Jul 26)** — core contract deployed to Arc testnet, repo public, web UI started
- [ ] **Checkpoint 3 (Aug 9)** — full MVP: web app (create estate, manage heirs, check in, claim), demo video, deck
- [ ] Stretch: check-in reminders, ERC-20 EURC support, guardian-based social recovery, agentic executor
