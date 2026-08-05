# Arc Legacy — Autonomous Agent Keeper

An autonomous agent for the **Agentic Economy** track. It holds its **own wallet**
on Arc and transacts in USDC **with no human in the loop** — every cycle it reads
on-chain state and, when needed, sends real transactions to keep the estate and
yield position healthy.

Because Arc's native gas token *is* USDC, every action both moves USDC and pays
its fee in USDC. This is a fully stablecoin-native autonomous agent.

## What it does each cycle

| Action | Contract | When it fires |
| --- | --- | --- |
| **Proof-of-life** | `ArcLegacyV2.checkIn()` | The agent's own estate is within its check-in lead window (or `KEEPER_FORCE_CHECKIN=1`) |
| **Yield sweep** | `ArcYieldVault.supply()` | Idle wallet USDC sits above the gas floor |
| **Interest claim** | `ArcYieldVault.claimInterest()` | Accrued interest clears the dust threshold and the vault reserve can pay it |

Every write prints its transaction hash and an Arcscan link, so a run leaves
verifiable on-chain proof for the demo.

## Setup

1. Fund the agent wallet with a little Arc testnet USDC from
   [faucet.circle.com](https://faucet.circle.com).
2. In the repo-root `.env` (copy from `.env.example`), set:
   ```
   AGENT_PRIVATE_KEY=0x...   # the agent's own wallet
   ```
   If you skip it, the keeper falls back to `PRIVATE_KEY`. Contract addresses and
   thresholds have working defaults — see `.env.example` to tune them.

## Run

```bash
# Inspect what it WOULD do — reads only, sends nothing (no key required if
# AGENT_ADDRESS is set):
node agent/keeper.js --dry-run

# Run a single autonomous cycle and exit:
node agent/keeper.js --once

# Run continuously (KEEPER_INTERVAL_SECONDS between cycles):
node agent/keeper.js
```

For a lively demo, run with `KEEPER_FORCE_CHECKIN=1` so it lands a proof-of-life
transaction every cycle, and set `KEEPER_SWEEP_AMOUNT=1` (with a low
`KEEPER_YIELD_FLOOR`) so each run supplies a fixed 1 USDC — repeatable across
retakes instead of draining the wallet in one shot.

You can launch it from any directory with an absolute path (the keeper resolves
`.env` from the repo root regardless of the current folder):

```bash
node "C:/Users/Lenovo/Desktop/Arc Legacy/agent/keeper.js" --once
```

## Design note

This is a plain [ethers](https://docs.ethers.org) keeper — the agent's key is the
agent's wallet. To move to a managed **Circle Programmable Wallet / Agent Stack**
identity, swap the signer in `keeper.js` (`new Wallet(key, provider)`) for the
Circle wallet adapter; the autonomy logic is unchanged.
