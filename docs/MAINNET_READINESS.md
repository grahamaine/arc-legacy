# Arc Legacy — Mainnet Readiness & Gap Analysis

**Target:** Circle Arc accelerator — take Arc Legacy from a working testnet
prototype to a production launch on **Arc mainnet (public launch Sep 16 2026)**.

**Status legend:** ✅ done · 🟡 in progress / scaffolded · ⬜ not started · 🔴 blocker

---

## 0. The hard external constraint

Arc **mainnet is not public until Sep 16 2026**. Circle has **not yet published
the mainnet RPC URL or chain ID** — they release those near launch. So no
contract can actually be deployed to mainnet before then. Everything below is
about being able to launch on **day one** with a production-grade product, which
is what the accelerator judges ("ready to take a product toward production").

---

## 1. Contracts & deployment

| Item | Status | Notes |
|---|---|---|
| `arcMainnet` hardhat network (env-driven, no guessed params) | ✅ | Added `hardhat.config.js`; activates when `ARC_MAINNET_RPC_URL` + `ARC_MAINNET_CHAIN_ID` are set. |
| Deploy scripts guard unconfigured mainnet | ✅ | All 3 scripts fail with a clear message instead of an obscure provider error. |
| Real mainnet RPC / chainId | 🔴 | Blocked on Circle (Sep 16). Drop into `.env` → deploy is one command. |
| Funded mainnet deployer wallet | ⬜ | Needs real USDC for gas. Use a dedicated `MAINNET_PRIVATE_KEY`, not the testnet key. |
| **Security audit of contracts** | 🔴 | `ArcLegacyV2` will custody **real inheritances**. An external audit (or at minimum Slither/MythX + a formal review) is table stakes before mainnet. Highest-priority production gap. |
| Drop v1 `ArcLegacy.sol` from mainnet | ⬜ | Superseded by V2 — do **not** deploy it. Consider removing/marking deprecated. |
| Post-deploy verification on Arcscan mainnet | ⬜ | Add contract verification step once the mainnet explorer/etherscan-style API is known. |

### Economic gap — the yield vault is a subsidy, not real yield
`ArcYieldVault` is *honest by construction* (interest only ever paid from a
separately funded reserve; principal is never touched). That's great for a demo,
but the reserve is **manually funded** — on mainnet, "5% APY" would be paid out
of our own pocket. For production this must be backed by a **real yield source**:
- Route deposits into **Circle-native yield / Earn**, or an audited money-market
  (e.g. an Aave-style market on Arc), and pay interest from *actual* yield.
- Until then, cap deposits or clearly label the reserve as promotional.

---

## 2. Web frontend — the biggest concrete code gap

Everything is **hardcoded to Arc testnet**. To support mainnet the app needs a
single network abstraction switched by an env var (`VITE_NETWORK=testnet|mainnet`).

| Hardcoded today | File | Mainnet needs |
|---|---|---|
| `ARC_CHAIN = "Arc_Testnet"` (App Kit chain string) | `web/src/lib/appkit.ts` | `"Arc"` / mainnet chain id string |
| `BRIDGE_SOURCES` = all *Sepolia* testnets | `web/src/lib/appkit.ts` | Ethereum, Base, Arbitrum, OP, Avalanche **mainnet** |
| `ARC_EURC_ADDRESS`, `ARC_EARN_VAULT` (testnet addrs) | `web/src/lib/appkit.ts` | Mainnet token/vault addresses |
| `ARC_TESTNET` config (chainId 5042002, RPC, explorer, hex) | `web/src/lib/chain.ts` | Mainnet chainId, RPC, `arcscan.app` mainnet, native USDC |
| `ARC_LEGACY_TREASURY` operator address | `web/src/lib/chain.ts` | Mainnet treasury (a real, secured wallet — ideally multisig) |
| `ensureArcChain` / `wrongChain` pinned to `ARC_TESTNET` | `web/src/hooks/useWallet.ts` | Network-aware add/switch + wrong-chain detection |
| `web/.env.example` only has `VITE_CONTRACT_ADDRESS` | `web/.env.example` | `VITE_NETWORK`, `VITE_YIELD_VAULT`, `VITE_PAYMENT_ROUTER`, RPC proxy target |
| RPC proxy target | `web/api/rpc.js` | Point at mainnet RPC when `VITE_NETWORK=mainnet` |

**Plan:** introduce `web/src/lib/network.ts` exporting one `NETWORK` object
(chain config + App Kit strings + bridge sources + token addresses) selected by
`VITE_NETWORK`, and refactor the three files above to read from it. This is the
gating change for *any* Circle product working on mainnet.

---

## 3. Autonomous keeper agent

| Item | Status | Notes |
|---|---|---|
| Network parameterization (chainId/RPC/explorer/addresses via env) | 🟡 | Addresses already env-overridable; `CHAIN_ID`, RPC default, and explorer are testnet-pinned — parameterize for mainnet. |
| Graceful shutdown (SIGINT/SIGTERM) | ⬜ | Loop runs `while(true)`; add clean shutdown so a supervisor can stop it mid-cycle. |
| Failure circuit-breaker / alerting | ⬜ | Per-action errors are caught, but repeated failures should back off / alert, not silently retry forever. |
| Structured (JSON) logging option | ⬜ | Current logs are human-readable; add opt-in JSON for log aggregation in production. |
| Process supervision (PM2 / systemd / container) | ⬜ | Ship a service unit so it restarts on crash and survives reboots. |
| **Circle Programmable Wallet identity** | ⬜ | Today the agent = a raw private key. Production agent identity should be a Circle Programmable Wallet (swap the signer; autonomy logic unchanged — see `agent/README.md`). |

---

## 4. Circle developer products — depth for the accelerator

Real integrations today: **CCTP** (BridgeWidget, live `kit.bridge()`), **App Kit**
Send/Swap/StableFX, **USDC-as-gas** meter. To strengthen the mainnet story:

| Product | Status | Opportunity |
|---|---|---|
| **CCTP** | ✅ live (testnet) | Repoint bridge sources to mainnet chains; production error/pending UX. |
| **Circle Paymaster** | ⬜ | Gasless claims — heirs shouldn't need native USDC to claim. High-impact UX win. |
| **Circle Gateway** | 🟡 | Unified cross-chain USDC balance (a widget exists) — wire to Gateway on mainnet. |
| **Programmable Wallets** | ⬜ | Recoverable embedded accounts for non-crypto-native heirs; agent identity. |
| **Circle Mint / Earn** | ⬜ | Fiat on/off-ramp for deposits & heir payouts; real yield source (see §1). |

---

## 5. Recommended sequence

1. **Now (pre-launch):** web `network.ts` abstraction · keeper hardening ·
   Paymaster (gasless claims) · replace subsidized yield with a real source ·
   **contract audit**.
2. **On mainnet params (Sep 16):** set `.env`, fund deployer, deploy all three
   contracts, verify on Arcscan, flip `VITE_NETWORK=mainnet`, redeploy web.
3. **Post-launch:** Programmable Wallet agent identity · Gateway unified balance ·
   Mint on/off-ramp.

---

*Generated as part of mainnet-readiness work. Keep this in sync as items land.*
