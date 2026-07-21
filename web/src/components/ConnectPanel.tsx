import { useState } from "react";
import type { WalletState } from "../hooks/useWallet";

type Mode = "wallet" | "email";
type EmailStage = "enter" | "sent" | "verified";

/**
 * Landing-page connect card: browser-wallet connect (real) and an email one-time
 * code flow. Email sign-in is a preview — Circle email/passkey wallets need
 * backend API keys, so this demonstrates the flow without a real session; users
 * connect a browser wallet to actually transact.
 */
export function ConnectPanel({ wallet }: { wallet: WalletState }) {
  const [mode, setMode] = useState<Mode>("wallet");
  const [connectError, setConnectError] = useState<string | null>(null);

  // Email OTP (preview) state
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<EmailStage>("enter");
  const [code, setCode] = useState("");
  const [issued, setIssued] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const connect = () =>
    wallet.connect().catch((err) => setConnectError((err as Error).message));

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const sendCode = () => {
    setEmailError(null);
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    setIssued(otp);
    setStage("sent");
    setCode("");
  };

  const verify = () => {
    if (code.trim() === issued) {
      setStage("verified");
      setEmailError(null);
    } else {
      setEmailError("Incorrect code — try again.");
    }
  };

  return (
    <section className="card connect-card">
      <h3>Get started</h3>

      <div className="connect-tabs">
        <button
          className={mode === "wallet" ? "connect-tab active" : "connect-tab"}
          onClick={() => setMode("wallet")}
        >
          Wallet
        </button>
        <button
          className={mode === "email" ? "connect-tab active" : "connect-tab"}
          onClick={() => setMode("email")}
        >
          Email
        </button>
      </div>

      {mode === "wallet" ? (
        <div className="connect-body">
          <p className="hint">
            Connect a browser wallet (MetaMask) on Arc testnet to manage your
            vault, heirs and transfers.
          </p>
          <button
            className="primary connect-cta"
            onClick={connect}
            disabled={!wallet.hasWallet}
          >
            {wallet.hasWallet ? "Connect wallet" : "No wallet detected"}
          </button>
          {connectError && <p className="hint error">{connectError}</p>}
        </div>
      ) : (
        <div className="connect-body">
          {stage === "enter" && (
            <>
              <p className="hint">
                Sign in with a one-time code sent to your email.
              </p>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && validEmail && sendCode()}
              />
              <button
                className="primary connect-cta"
                disabled={!validEmail}
                onClick={sendCode}
              >
                Send code
              </button>
            </>
          )}

          {stage === "sent" && (
            <>
              <p className="hint">
                Enter the 6-digit code sent to <strong>{email}</strong>.
              </p>
              <p className="otp-preview">Preview code: {issued}</p>
              <input
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && verify()}
              />
              <div className="field-row">
                <button className="primary" onClick={verify} disabled={code.length !== 6}>
                  Verify
                </button>
                <button className="ghost" onClick={() => setStage("enter")}>
                  Change email
                </button>
              </div>
              {emailError && <p className="hint error">{emailError}</p>}
            </>
          )}

          {stage === "verified" && (
            <>
              <p className="hint" style={{ color: "var(--green)" }}>
                Email verified ✓ ({email})
              </p>
              <p className="hint">
                Email wallets are a preview — Circle email/passkey sign-in needs
                backend API keys. Connect a browser wallet to transact now.
              </p>
              <button
                className="primary connect-cta"
                onClick={() => setMode("wallet")}
              >
                Continue with wallet
              </button>
            </>
          )}
        </div>
      )}

      <div className="capability">
        <span className="capability-dot" />
        Unified USDC balance across chains — powered by Circle Gateway
      </div>
    </section>
  );
}
