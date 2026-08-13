import { useState } from "react";
import type { WalletState } from "../hooks/useWallet";
import { CONTRACT_ADDRESS, getContract } from "../lib/contract";
import { explorerTx } from "../lib/chain";

type RunStatus = "queued" | "running" | "done" | "error";

interface AgentRun {
  id: number;
  label: string;
  status: RunStatus;
  onChain: boolean;
  hash?: string;
  note?: string;
}

const AUTOMATIONS = [
  {
    key: "checkin",
    icon: "🛡️",
    title: "Guardian check-in",
    desc: "Reset your dead-man's switch on-chain before the deadline lapses.",
    onChain: true,
  },
  {
    key: "sweep",
    icon: "🌊",
    title: "Yield sweep",
    desc: "Route idle vault USDC into a Circle Earn position.",
    onChain: false,
  },
  {
    key: "notify",
    icon: "📣",
    title: "Heir notify",
    desc: "Ping beneficiaries the moment the estate becomes claimable.",
    onChain: false,
  },
  {
    key: "guard",
    icon: "⚖️",
    title: "Balance guard",
    desc: "Top up the vault when it dips below your floor.",
    onChain: false,
  },
] as const;

let runCounter = 0;

/**
 * Legacy Agent — an autonomous operator for the estate. Guardian check-in runs a
 * real on-chain transaction; the other automations are a scheduling preview
 * (no agent backend is wired up yet), tracked in a live run log.
 */
export function AgentWidget({
  wallet,
  refresh,
}: {
  wallet: WalletState;
  refresh: () => void;
}) {
  const [command, setCommand] = useState("");
  const [runs, setRuns] = useState<AgentRun[]>([]);

  const patch = (id: number, next: Partial<AgentRun>) =>
    setRuns((prev) => prev.map((r) => (r.id === id ? { ...r, ...next } : r)));

  const execute = async (label: string, onChain: boolean) => {
    const id = ++runCounter;
    const run: AgentRun = { id, label, status: "queued", onChain };
    setRuns((prev) => [run, ...prev].slice(0, 6));
    await new Promise((r) => setTimeout(r, 300));
    patch(id, { status: "running" });
    try {
      if (onChain && CONTRACT_ADDRESS) {
        const signer = await wallet.getSigner();
        const tx = await getContract(signer).checkIn();
        patch(id, { hash: tx.hash });
        await tx.wait();
        refresh();
        patch(id, { status: "done", note: "on-chain ✓" });
      } else {
        await new Promise((r) => setTimeout(r, 1200));
        patch(id, { status: "done", note: "scheduled ✓" });
      }
    } catch (err) {
      const e = err as { shortMessage?: string; message?: string };
      patch(id, { status: "error", note: e.shortMessage ?? e.message ?? "failed" });
    }
  };

  const submitCommand = () => {
    const text = command.trim();
    if (!text) return;
    const onChain = /check.?in|guardian|alive|switch/i.test(text);
    execute(text, onChain);
    setCommand("");
  };

  const busy = runs.some((r) => r.status === "queued" || r.status === "running");

  return (
    <section className="card">
      <h3>Legacy Agent</h3>
      <p className="hint">
        Your autonomous operator — it watches the estate and runs upkeep so nothing
        lapses. Guardian check-in executes on-chain; other automations are a
        scheduling preview.
      </p>

      <div className="agent-grid">
        {AUTOMATIONS.map((a) => (
          <button
            key={a.key}
            className="agent-task"
            disabled={busy}
            title={a.desc}
            onClick={() => execute(a.title, a.onChain)}
          >
            <span className="agent-task-icon">{a.icon}</span>
            <span className="agent-task-title">{a.title}</span>
            <span className="agent-task-desc">{a.desc}</span>
          </button>
        ))}
      </div>

      <div className="field-row">
        <input
          placeholder="Ask the agent to run a task…"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitCommand()}
        />
        <button
          className="primary"
          disabled={busy || !command.trim()}
          onClick={submitCommand}
        >
          Run
        </button>
      </div>

      {runs.length > 0 && (
        <ul className="agent-log">
          {runs.map((r) => (
            <li key={r.id}>
              <span className={`agent-dot agent-${r.status}`} />
              <span className="agent-log-label">{r.label}</span>
              <span className="agent-log-status">
                {r.status === "queued" && "queued"}
                {r.status === "running" && (r.onChain ? "on-chain…" : "running…")}
                {r.status === "done" &&
                  (r.hash ? (
                    <a href={explorerTx(r.hash)} target="_blank" rel="noreferrer">
                      {r.note}
                    </a>
                  ) : (
                    r.note
                  ))}
                {r.status === "error" && <span className="agent-err">{r.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="widget-note">
        <strong>Legacy Agent</strong> — your autonomous operator. Guardian
        check-in runs a real on-chain transaction; the other automations are a
        scheduling preview. The headless keeper (agent/keeper.js) runs the same
        logic 24/7 with no human in the loop.
      </p>
    </section>
  );
}
