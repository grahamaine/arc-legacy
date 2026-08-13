#!/usr/bin/env node
/**
 * Arc Legacy — Autonomous Agent Keeper
 * ------------------------------------
 * A headless agent that holds its OWN wallet on Arc and transacts in USDC with
 * no human in the loop. It watches its estate and yield position and, on a
 * schedule, executes real on-chain actions to keep everything healthy:
 *
 *   1. Proof-of-life  — calls ArcLegacyV2.checkIn() so the agent's estate never
 *                       trips its dead-man's-switch while the agent is running.
 *   2. Yield sweep    — supplies idle wallet USDC (above a gas floor) into
 *                       ArcYieldVault so capital is never left idle.
 *   3. Interest claim — claims accrued yield once it's worth the gas and the
 *                       vault reserve can cover it.
 *
 * On Arc the native gas token IS USDC, so every action above both moves USDC and
 * pays its fee in USDC — a fully stablecoin-native autonomous agent. Every write
 * prints its transaction hash and an Arcscan link, so a run leaves verifiable
 * on-chain proof for the demo.
 *
 * This is intentionally a plain ethers keeper (the agent's key = the agent's
 * wallet). Swapping in a Circle Programmable Wallet / Agent Stack wallet is a
 * drop-in replacement for the signer; the autonomy logic is unchanged.
 *
 * Usage:
 *   node agent/keeper.js               # loop forever, KEEPER_INTERVAL_SECONDS apart
 *   node agent/keeper.js --once        # run a single cycle and exit
 *   node agent/keeper.js --dry-run     # read state and print decisions, send nothing
 *
 * Config (env, see .env.example):
 *   ARC_RPC_URL, AGENT_PRIVATE_KEY (or PRIVATE_KEY), ARC_LEGACY_ADDRESS,
 *   YIELD_VAULT_ADDRESS, AGENT_ADDRESS (dry-run only), KEEPER_INTERVAL_SECONDS,
 *   KEEPER_YIELD_FLOOR, KEEPER_MIN_SWEEP, KEEPER_MIN_CLAIM,
 *   KEEPER_CHECKIN_LEAD_SECONDS, KEEPER_FORCE_CHECKIN
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
const { JsonRpcProvider, Wallet, Contract, formatEther, parseEther } = require("ethers");

// ----------------------------------------------------------------- config

// Network is parameterized so the same keeper drives testnet or mainnet. Arc
// mainnet (public Sep 16 2026) publishes its RPC/chainId near launch — set
// ARC_RPC_URL, KEEPER_CHAIN_ID and KEEPER_EXPLORER in .env to point at it.
const RPC_URL = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network";
const CHAIN_ID = num(process.env.KEEPER_CHAIN_ID, 5042002);
const EXPLORER = str(process.env.KEEPER_EXPLORER, "https://testnet.arcscan.app");
// Exit the loop after this many consecutive fully-failed cycles (every action
// errored) so a supervisor can restart cleanly instead of spinning forever.
// 0 disables the circuit-breaker (loop indefinitely).
const MAX_FAILED_CYCLES = num(process.env.KEEPER_MAX_FAILED_CYCLES, 10);

// Deployed Arc-testnet addresses (overridable via env).
const ARC_LEGACY_ADDRESS =
  process.env.ARC_LEGACY_ADDRESS ||
  "0x2b56a883c95B8809BE663E01F18af08b37AbC277"; // ArcLegacyV2
const YIELD_VAULT_ADDRESS =
  process.env.YIELD_VAULT_ADDRESS ||
  "0xb5b5CE9C1bD85A68B4fE2F0274d419bE1a3f8761"; // ArcYieldVault
// LegacyStreams (recurring payments). No default — the keeper only runs the
// schedules action when STREAMS_ADDRESS is set, so existing deployments are
// unaffected until the contract is deployed and configured.
const STREAMS_ADDRESS = process.env.STREAMS_ADDRESS || "";
// Cap payouts settled per cycle so one busy cycle can't run unbounded.
const MAX_PAYOUTS_PER_CYCLE = num(process.env.KEEPER_MAX_PAYOUTS_PER_CYCLE, 25);

const INTERVAL_MS = num(process.env.KEEPER_INTERVAL_SECONDS, 60) * 1000;
const YIELD_FLOOR = parseEther(str(process.env.KEEPER_YIELD_FLOOR, "0.5")); // gas buffer kept in wallet
const MIN_SWEEP = parseEther(str(process.env.KEEPER_MIN_SWEEP, "0.1")); // don't sweep dust
// Optional hard cap on a single sweep. Unset = sweep everything above the floor.
// Setting it (e.g. 1) makes each run supply a fixed, repeatable amount — handy
// for re-recording a demo without draining the wallet in one shot.
const SWEEP_AMOUNT =
  process.env.KEEPER_SWEEP_AMOUNT && Number(process.env.KEEPER_SWEEP_AMOUNT) > 0
    ? parseEther(String(process.env.KEEPER_SWEEP_AMOUNT))
    : null;
const MIN_CLAIM = parseEther(str(process.env.KEEPER_MIN_CLAIM, "0.0005")); // don't claim dust
const CHECKIN_LEAD = num(process.env.KEEPER_CHECKIN_LEAD_SECONDS, 3600); // check in with <lead left
const FORCE_CHECKIN = truthy(process.env.KEEPER_FORCE_CHECKIN);

const ONCE = process.argv.includes("--once");
const DRY_RUN = process.argv.includes("--dry-run");

const LEGACY_ABI = [
  "function checkIn()",
  "function isClaimable(address owner) view returns (bool)",
  "function getEstate(address owner) view returns (uint256 balance, uint64 lastCheckIn, uint64 checkInInterval, bool unlocked, uint256 unlockedBalance, uint64 unlockedAt, uint64 vestingDuration, tuple(address account, uint96 shareBps)[] beneficiaries)",
];
const VAULT_ABI = [
  "function supply() payable",
  "function claimInterest()",
  "function reserve() view returns (uint256)",
  "function positionOf(address user) view returns (uint256 principal, uint256 accrued, uint64 lastAccrual)",
];
const STREAMS_ABI = [
  "function streamCount() view returns (uint256)",
  "function isDue(uint256 id) view returns (bool)",
  "function getStream(uint256 id) view returns (address creator, address recipient, uint128 amount, uint64 interval, uint64 nextDue, uint64 endTime, uint128 balance, bool active)",
  "function executeDue(uint256 id) returns (bool)",
];

// ------------------------------------------------------------- utilities

function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
}
function str(v, d) {
  return v == null || v === "" ? d : String(v);
}
function truthy(v) {
  return /^(1|true|yes|on)$/i.test(String(v ?? ""));
}
function usdc(wei) {
  return `${Number(formatEther(wei)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })} USDC`;
}
function txUrl(hash) {
  return `${EXPLORER}/tx/${hash}`;
}
function ts() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}
function log(...args) {
  console.log(`[${ts()}]`, ...args);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Retry a read through Arc's rate-limited public RPC with a short backoff. */
async function read(fn, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = String(err && err.message).toLowerCase();
      const transient =
        msg.includes("limit") ||
        msg.includes("rate") ||
        msg.includes("timeout") ||
        msg.includes("missing revert data") ||
        msg.includes("failed to fetch") ||
        /\b(429|500|502|503|504)\b/.test(msg);
      if (i === attempts - 1 || !transient) throw err;
      await sleep(600 * (i + 1));
    }
  }
  throw lastErr;
}

/** Send a write (unless dry-run), wait for it, and print its Arcscan link. */
async function send(label, run) {
  if (DRY_RUN) {
    log(`  → [dry-run] would ${label}`);
    return null;
  }
  const tx = await run();
  log(`  → ${label}: sent ${tx.hash}`);
  log(`     ${txUrl(tx.hash)}`);
  const receipt = await tx.wait();
  log(`  ✓ ${label}: confirmed in block ${receipt.blockNumber}`);
  return receipt;
}

// --------------------------------------------------------- keeper actions

/**
 * Proof-of-life. Keeps the agent's own estate from tripping its dead-man's
 * switch. Skips if the estate has already unlocked (checkIn would revert).
 */
async function maybeCheckIn(legacy, agent, provider) {
  const estate = await read(() => legacy.getEstate(agent));
  const lastCheckIn = Number(estate.lastCheckIn);
  const interval = Number(estate.checkInInterval);

  if (estate.unlocked) {
    log("proof-of-life: estate already unlocked — nothing to defend.");
    return;
  }

  if (lastCheckIn === 0) {
    log("proof-of-life: no estate yet — first check-in will establish one.");
  } else {
    const now = Math.floor(Date.now() / 1000);
    const deadline = lastCheckIn + interval;
    const remaining = deadline - now;
    // Adaptive lead: never wait longer than half the interval on short (demo)
    // intervals, but cap at CHECKIN_LEAD for long production ones.
    const lead = Math.min(CHECKIN_LEAD, Math.max(60, Math.floor(interval / 2)));
    log(
      `proof-of-life: ${Math.max(0, remaining)}s until deadline ` +
        `(interval ${interval}s, lead ${lead}s).`
    );
    if (!FORCE_CHECKIN && remaining > lead) {
      log("  → healthy, no check-in needed.");
      return;
    }
  }

  await send("check in (proof-of-life)", async () => legacy.checkIn());
}

/**
 * Yield sweep. Moves idle wallet USDC above the gas floor into the yield vault
 * so the agent's capital is always earning.
 */
async function maybeSweep(vault, agent, provider) {
  const balance = await read(() => provider.getBalance(agent));
  const headroom = balance - YIELD_FLOOR;
  // Sweep everything above the floor, unless a fixed cap is configured.
  let amount = headroom;
  if (SWEEP_AMOUNT != null && amount > SWEEP_AMOUNT) amount = SWEEP_AMOUNT;
  log(
    `yield sweep: wallet ${usdc(balance)}, floor ${usdc(YIELD_FLOOR)}, ` +
      `sweeping ${usdc(amount > 0n ? amount : 0n)}` +
      (SWEEP_AMOUNT != null ? ` (capped at ${usdc(SWEEP_AMOUNT)})` : "") +
      "."
  );
  if (amount < MIN_SWEEP) {
    log("  → below min sweep, leaving it as gas buffer.");
    return;
  }
  await send(`supply ${usdc(amount)} to yield vault`, async () =>
    vault.supply({ value: amount })
  );
}

/**
 * Interest claim. Claims accrued yield once it clears the dust threshold and the
 * vault's reserve can actually pay it (the vault reverts otherwise).
 */
async function maybeClaim(vault, agent) {
  const pos = await read(() => vault.positionOf(agent));
  const accrued = pos.accrued;
  const reserve = await read(() => vault.reserve());
  log(
    `interest claim: principal ${usdc(pos.principal)}, accrued ${usdc(accrued)}, ` +
      `vault reserve ${usdc(reserve)}.`
  );
  if (accrued < MIN_CLAIM) {
    log("  → accrued below min claim, letting it compound.");
    return;
  }
  if (reserve < accrued) {
    log("  → vault reserve too low to pay this claim, skipping.");
    return;
  }
  await send(`claim ${usdc(accrued)} interest`, async () => vault.claimInterest());
}

// -------------------------------------------------------------- main loop

/**
 * Scheduled payments. Settles any due recurring payouts in the LegacyStreams
 * contract — the agent (or anyone) can call executeDue, so the estate's
 * recurring contributions and heir annuities keep flowing with no human. Only
 * runs when STREAMS_ADDRESS is configured.
 */
async function maybeRunSchedules(streams) {
  const count = Number(await read(() => streams.streamCount()));
  if (count === 0) {
    log("scheduled payments: no streams created yet.");
    return;
  }
  let due = 0;
  let settled = 0;
  for (let id = 1; id <= count; id++) {
    let isDue;
    try {
      isDue = await read(() => streams.isDue(id));
    } catch {
      continue; // skip a stream whose read blips; next cycle retries
    }
    if (!isDue) continue;
    due++;
    const s = await read(() => streams.getStream(id));
    await send(
      `pay stream #${id} — ${usdc(s.amount)} to ${s.recipient}`,
      async () => streams.executeDue(id)
    );
    settled++;
    if (settled >= MAX_PAYOUTS_PER_CYCLE) {
      log(`  → hit per-cycle payout cap (${MAX_PAYOUTS_PER_CYCLE}); rest next cycle.`);
      break;
    }
  }
  log(`scheduled payments: ${count} stream(s), ${due} due, ${settled} settled.`);
}

/**
 * Run one cycle. Each action is isolated so one failure never blocks the others.
 * Returns { failures, total } so the loop can detect a fully-broken keeper
 * (e.g. RPC down, wallet unfunded) and back off / exit.
 */
async function cycle(ctx) {
  log("── keeper cycle ──────────────────────────────");
  let failures = 0;
  let total = 0;
  const runAction = async (label, fn) => {
    total++;
    try {
      await fn();
    } catch (e) {
      failures++;
      log(`  ! ${label} failed:`, e.shortMessage || e.message);
    }
  };

  await runAction("proof-of-life", () => maybeCheckIn(ctx.legacy, ctx.agent, ctx.provider));
  await runAction("yield sweep", () => maybeSweep(ctx.vault, ctx.agent, ctx.provider));
  await runAction("interest claim", () => maybeClaim(ctx.vault, ctx.agent));
  if (ctx.streams) {
    await runAction("scheduled payments", () => maybeRunSchedules(ctx.streams));
  }
  return { failures, total };
}

async function main() {
  const provider = new JsonRpcProvider(RPC_URL, CHAIN_ID, {
    staticNetwork: true,
    batchMaxCount: 5,
  });

  const key = process.env.AGENT_PRIVATE_KEY || process.env.PRIVATE_KEY;
  let wallet = null;
  let agent;

  if (key) {
    wallet = new Wallet(key, provider);
    agent = wallet.address;
    if (!process.env.AGENT_PRIVATE_KEY) {
      log(
        "WARN: using PRIVATE_KEY as the agent wallet. For a true agent identity, " +
          "set a dedicated AGENT_PRIVATE_KEY."
      );
    }
  } else if (DRY_RUN && process.env.AGENT_ADDRESS) {
    agent = process.env.AGENT_ADDRESS; // read-only dry run, no signer needed
  } else {
    throw new Error(
      "No agent key. Set AGENT_PRIVATE_KEY (or PRIVATE_KEY) in .env, " +
        "or pass --dry-run with AGENT_ADDRESS set."
    );
  }

  const runner = wallet || provider;
  const ctx = {
    provider,
    agent,
    legacy: new Contract(ARC_LEGACY_ADDRESS, LEGACY_ABI, runner),
    vault: new Contract(YIELD_VAULT_ADDRESS, VAULT_ABI, runner),
    // Recurring-payments executor is optional — only wired when configured.
    streams: STREAMS_ADDRESS
      ? new Contract(STREAMS_ADDRESS, STREAMS_ABI, runner)
      : null,
  };

  log("Arc Legacy autonomous keeper starting");
  log(`  mode:       ${DRY_RUN ? "DRY-RUN (no txs)" : ONCE ? "single cycle" : "loop"}`);
  log(`  agent:      ${agent}`);
  log(`  rpc:        ${RPC_URL}`);
  log(`  chainId:    ${CHAIN_ID}`);
  log(`  explorer:   ${EXPLORER}`);
  log(`  estate:     ${ARC_LEGACY_ADDRESS}`);
  log(`  yieldVault: ${YIELD_VAULT_ADDRESS}`);
  log(`  streams:    ${STREAMS_ADDRESS || "(not configured — skipping)"}`);
  if (!DRY_RUN) {
    const bal = await read(() => provider.getBalance(agent));
    log(`  balance:    ${usdc(bal)}`);
  }

  if (ONCE || DRY_RUN) {
    await cycle(ctx);
    log("done.");
    return;
  }

  // Loop until stopped. Errors inside a cycle are already caught, so the keeper
  // rides out transient RPC failures. Two production safeguards:
  //  1. Graceful shutdown: on SIGINT/SIGTERM we finish sleeping and exit cleanly
  //     between cycles (never mid-transaction), so a supervisor can stop it.
  //  2. Circuit-breaker: if MAX_FAILED_CYCLES cycles in a row fail every action
  //     (RPC down, wallet drained), exit non-zero so a supervisor restarts us
  //     rather than spinning silently forever.
  let stopping = false;
  const onSignal = (sig) => {
    if (stopping) return;
    stopping = true;
    log(`received ${sig} — shutting down after this interval…`);
  };
  process.once("SIGINT", () => onSignal("SIGINT"));
  process.once("SIGTERM", () => onSignal("SIGTERM"));

  let consecutiveFailedCycles = 0;
  while (!stopping) {
    const { failures, total } = await cycle(ctx);
    if (total > 0 && failures >= total) {
      consecutiveFailedCycles++;
      log(
        `cycle fully failed (${consecutiveFailedCycles}` +
          (MAX_FAILED_CYCLES ? `/${MAX_FAILED_CYCLES}` : "") +
          " in a row)."
      );
      if (MAX_FAILED_CYCLES && consecutiveFailedCycles >= MAX_FAILED_CYCLES) {
        throw new Error(
          `${consecutiveFailedCycles} consecutive fully-failed cycles — ` +
            "aborting so the supervisor can restart the keeper."
        );
      }
    } else {
      consecutiveFailedCycles = 0;
    }
    if (stopping) break;
    log(`sleeping ${INTERVAL_MS / 1000}s…\n`);
    // Sleep in short slices so a shutdown signal is honoured promptly.
    const until = Date.now() + INTERVAL_MS;
    while (Date.now() < until && !stopping) {
      await sleep(Math.min(1000, until - Date.now()));
    }
  }
  log("keeper stopped cleanly.");
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exitCode = 1;
});
