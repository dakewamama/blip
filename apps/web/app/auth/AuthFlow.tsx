"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Logo from "@/components/Logo";
import { brand } from "@/lib/brand";
import { CAP_OPTIONS, FUND_OPTIONS } from "@/lib/data";
import { useCustody } from "@/lib/custody";
import { useBlip } from "@/lib/store";

const QUOTES = (custodial: boolean) => [
  { q: "Three taps. One honest number. That's the whole product.", sub: "Set up in about a minute. No password to invent, no seed phrase to lose." },
  custodial
    ? { q: "The code expires in ten minutes. Take your time.", sub: "We never ask for a password, so there's nothing to leak." }
    : { q: "The code expires in ten minutes. Take your time.", sub: "Any six digits work in this demo build. We never ask for a password, so there's nothing to leak." },
  { q: "Guardrails first, positions second.", sub: "You set a per-trade cap once. It applies to every buy, everywhere in the app." },
  custodial
    ? { q: `${brand.name} holds the wallet. You hold the account.`, sub: "Custodial: no seed phrase to back up. Fund it with SOL, withdraw to any address, any time." }
    : { q: "This is a demo build. Nothing here is real money.", sub: "Balances live on this device and fills are simulated, priced against the live curve." },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const { state, patch, showToast, ready } = useBlip();
  const custody = useCustody();
  const custodial = custody.enabled;
  const quotes = QUOTES(custodial);

  const mode = params.get("mode") === "signin" ? "signin" : "signup";
  const next = params.get("next") === "coaching" ? "/app/coaching" : "/app/discover";
  const ref = params.get("ref");

  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({ email: false, code: false, handle: false });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Back from an OAuth redirect, or a session restored from a previous visit:
  // the identity step is done, carry on from guardrails.
  useEffect(() => {
    if (!custodial || !custody.authed || state.authed || step >= 2) return;
    if (custody.email && !state.email) patch({ email: custody.email });
    setStep(2);
  }, [custodial, custody.authed, custody.email, state.authed, state.email, step, patch]);

  const failed = (e: unknown, fallback: string) =>
    setAuthError(e instanceof Error && e.message ? e.message : fallback);

  // Someone who already finished onboarding should never see the flow again.
  useEffect(() => {
    if (ready && state.authed) router.replace(next);
  }, [ready, state.authed, router, next]);

  const goNext = async () => {
    if (busy) return;
    setAuthError(null);
    if (step === 0) {
      if (!EMAIL_RE.test(state.email)) return setErrors((e) => ({ ...e, email: true }));
      setErrors((e) => ({ ...e, email: false }));
      setBusy(true);
      try {
        await custody.sendCode(state.email.trim());
        setStep(1);
      } catch (e) {
        failed(e, "Could not send the code — try again");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (step === 1) {
      if (code.replace(/\D/g, "").length < 6) return setErrors((e) => ({ ...e, code: true }));
      setErrors((e) => ({ ...e, code: false }));
      setBusy(true);
      try {
        await custody.verifyCode(code);
        setStep(2);
      } catch (e) {
        failed(e, "That code didn't work — check it or resend");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (step === 2) {
      if (state.handle.trim().length < 3) return setErrors((e) => ({ ...e, handle: true }));
      setErrors((e) => ({ ...e, handle: false }));
      return setStep(3);
    }
  };

  const finish = (cash: number, label: string) => {
    patch({
      authed: true,
      mode,
      cash,
      referredBy: ref ? ref.trim() : null,
      activity: [{ title: label, amount: "$" + cash.toFixed(2), time: "just now", dot: "#A78BFA" }],
    });
    router.push(next);
  };

  // A custodial account is funded on-chain, so there is no balance to seed.
  const finishLive = () => {
    patch({ authed: true, mode, referredBy: ref ? ref.trim() : null });
    router.push(next);
  };

  const sso = async (provider: "apple" | "google") => {
    setErrors({ email: false, code: false, handle: false });
    setAuthError(null);
    if (custodial) {
      // Redirects away; the effect above picks the flow back up on return.
      try {
        await custody.oauth(provider);
      } catch (e) {
        failed(e, `${provider === "apple" ? "Apple" : "Google"} sign-in isn't available right now`);
      }
      return;
    }
    patch({ email: provider === "apple" ? "you@icloud.com" : "you@gmail.com" });
    setStep(2);
    showToast("Verified with " + (provider === "apple" ? "Apple" : "Google"));
  };

  const address = custody.account?.address ?? null;

  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <Logo size={28} />
        <div style={{ margin: "auto 0", maxWidth: 400 }}>
          <p className="serif" style={{ fontSize: 46, lineHeight: 1.1, letterSpacing: "-.02em", margin: 0 }}>
            {quotes[step].q}
          </p>
          <p style={{ marginTop: 28, color: "var(--muted-2)", fontSize: 15.5, lineHeight: 1.6 }}>{quotes[step].sub}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }} aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} style={{ height: 4, width: 46, borderRadius: 999, background: i <= step ? "var(--lime)" : "rgba(255,255,255,.12)", transition: ".3s" }} />
          ))}
        </div>
      </aside>

      <div className="auth-form">
        <div style={{ display: "flex", alignItems: "center" }}>
          {step > 0 && (
            <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} className="btn btn-ghost"
              style={{ width: 38, height: 38, padding: 0 }} aria-label="Back">←</button>
          )}
          <span className="mono" style={{ marginLeft: "auto", fontSize: 13.5, color: "var(--muted-4)" }}>
            Step {step + 1} of 4
          </span>
        </div>

        <div key={step} style={{ margin: "auto 0", maxWidth: 420, width: "100%", animation: "blipUp .4s cubic-bezier(.2,.8,.2,1) both" }}>
          {step === 0 && (
            <div>
              <h1 style={{ margin: 0, fontSize: 38, lineHeight: 1.08, letterSpacing: "-.035em", fontWeight: 800 }}>
                {mode === "signin" ? "Welcome back." : "Start with an email."}
              </h1>
              <p style={{ color: "var(--muted)", fontSize: 16, margin: "14px 0 0", lineHeight: 1.6 }}>
                We&apos;ll send a six-digit code. No password to invent, no seed phrase to lose.
              </p>
              <div style={{ marginTop: 34 }}>
                <label className="label" htmlFor="email">Email</label>
                <input id="email" type="email" autoComplete="email" className="field" style={{ marginTop: 10 }}
                  value={state.email} placeholder="you@email.com"
                  onChange={(e) => { patch({ email: e.target.value }); setErrors((x) => ({ ...x, email: false })); }}
                  onKeyDown={(e) => e.key === "Enter" && void goNext()}
                  aria-invalid={errors.email} />
                {errors.email && <p className="error">Enter a valid email address.</p>}
                {authError && <p className="error">{authError}</p>}
              </div>
              <button type="button" onClick={() => void goNext()} disabled={busy} className="btn btn-primary btn-block" style={{ marginTop: 22, padding: 19, fontSize: 16.5 }}>
                {busy ? "Sending…" : "Send code"}
              </button>
              <div style={{ marginTop: 22, display: "flex", gap: 12 }}>
                <button type="button" onClick={() => void sso("apple")} className="btn btn-ghost" style={{ flex: 1, padding: 15, fontSize: 14.5 }}>Continue with Apple</button>
                <button type="button" onClick={() => void sso("google")} className="btn btn-ghost" style={{ flex: 1, padding: 15, fontSize: 14.5 }}>Google</button>
              </div>
              <p style={{ marginTop: 30, fontSize: 13, color: "var(--muted-4)", lineHeight: 1.6 }}>
                By continuing you agree to the terms and confirm you&apos;re trading with money you can afford to lose.
              </p>
            </div>
          )}

          {step === 1 && (
            <div>
              <h1 style={{ margin: 0, fontSize: 38, lineHeight: 1.08, letterSpacing: "-.035em", fontWeight: 800 }}>Check your inbox.</h1>
              <p style={{ color: "var(--muted)", fontSize: 16, margin: "14px 0 0", lineHeight: 1.6 }}>
                Six digits sent to <span style={{ color: "var(--text)", fontWeight: 600 }}>{state.email}</span>.{custodial ? "" : " Any six will do in this demo."}
              </p>
              <label className="sr-only" htmlFor="code">Verification code</label>
              <input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="––––––"
                className="field mono"
                style={{ marginTop: 34, padding: 22, fontSize: 30, letterSpacing: 16, textAlign: "center", borderRadius: 20 }}
                value={code}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setErrors((x) => ({ ...x, code: false })); }}
                onKeyDown={(e) => e.key === "Enter" && void goNext()}
                aria-invalid={errors.code} />
              {errors.code && <p className="error">Enter all six digits.</p>}
              {authError && <p className="error">{authError}</p>}
              <button type="button" onClick={() => void goNext()} disabled={busy} className="btn btn-primary btn-block" style={{ marginTop: 22, padding: 19, fontSize: 16.5 }}>
                {busy ? "Verifying…" : "Verify"}
              </button>
              <button type="button" className="btn-quiet btn-block" style={{ marginTop: 12, padding: 12, fontSize: 14 }}
                onClick={() => {
                  setCode("");
                  custody.sendCode(state.email.trim()).then(
                    () => showToast("New code sent to " + (state.email || "your inbox")),
                    (e) => failed(e, "Could not resend the code"),
                  );
                }}>
                Resend code
              </button>
            </div>
          )}

          {step === 2 && (
            <div>
              <h1 style={{ margin: 0, fontSize: 38, lineHeight: 1.08, letterSpacing: "-.035em", fontWeight: 800 }}>Set your guardrails.</h1>
              <p style={{ color: "var(--muted)", fontSize: 16, margin: "14px 0 0", lineHeight: 1.6 }}>
                Pick a handle and a per-trade cap. We enforce the cap on every buy — you can change it later.
              </p>
              <div style={{ marginTop: 32 }}>
                <label className="label" htmlFor="handle">Handle</label>
                <div style={{ display: "flex", alignItems: "center", marginTop: 10, background: "var(--surface)", border: "1px solid var(--hair-strong)", borderRadius: 18, padding: "0 20px" }}>
                  <span className="mono" style={{ color: "var(--muted-4)", fontSize: 16 }}>@</span>
                  <input id="handle" placeholder="degenerate" value={state.handle}
                    onChange={(e) => { patch({ handle: e.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 18) }); setErrors((x) => ({ ...x, handle: false })); }}
                    onKeyDown={(e) => e.key === "Enter" && void goNext()}
                    aria-invalid={errors.handle}
                    style={{ flex: 1, background: "none", border: "none", padding: "18px 8px", color: "var(--text)", fontSize: 16, outline: "none" }} />
                </div>
                {errors.handle && <p className="error">Three characters or more.</p>}
              </div>
              <fieldset style={{ marginTop: 28, border: "none", padding: 0, margin: "28px 0 0" }}>
                <legend className="label" style={{ padding: 0 }}>Max per trade</legend>
                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  {CAP_OPTIONS.map((cap) => (
                    <button key={cap} type="button" onClick={() => patch({ cap })} data-on={state.cap === cap}
                      className="chip mono" style={{ flex: 1, padding: "15px 0", fontSize: 15, borderRadius: 16 }}
                      aria-pressed={state.cap === cap}>
                      ${cap}
                    </button>
                  ))}
                </div>
              </fieldset>
              <button type="button" onClick={() => void goNext()} className="btn btn-primary btn-block" style={{ marginTop: 30, padding: 19, fontSize: 16.5 }}>
                Create wallet
              </button>
            </div>
          )}

          {step === 3 && custodial && (
            <div>
              <h1 style={{ margin: 0, fontSize: 38, lineHeight: 1.08, letterSpacing: "-.035em", fontWeight: 800 }}>Your wallet is ready.</h1>
              <p style={{ color: "var(--muted)", fontSize: 16, margin: "14px 0 0", lineHeight: 1.6 }}>
                {brand.name} holds this Solana wallet for you. Send SOL to it from any exchange or wallet to start
                trading — it shows up once the transfer confirms.
              </p>
              <div style={{ marginTop: 30, background: "var(--surface)", border: "1px solid var(--hair-strong)", borderRadius: 20, padding: "18px 20px" }}>
                <span className="label" style={{ fontSize: 11 }}>Deposit address · SOL</span>
                <span className="mono" style={{ display: "block", fontSize: 14, marginTop: 8, wordBreak: "break-all" }}>
                  {address ?? (custody.error ? custody.error : "Creating your wallet…")}
                </span>
              </div>
              {address && (
                <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 12, padding: 14, fontSize: 14.5 }}
                  onClick={() => navigator.clipboard.writeText(address).then(() => showToast("Address copied"), () => showToast("Copy failed — select it manually"))}>
                  Copy address
                </button>
              )}
              <button type="button" onClick={finishLive} disabled={!address} className="btn btn-primary btn-block" style={{ marginTop: 22, padding: 19, fontSize: 16.5 }}>
                Go to the app
              </button>
            </div>
          )}

          {step === 3 && !custodial && (
            <div>
              <h1 style={{ margin: 0, fontSize: 38, lineHeight: 1.08, letterSpacing: "-.035em", fontWeight: 800 }}>Fund the wallet.</h1>
              <p style={{ color: "var(--muted)", fontSize: 16, margin: "14px 0 0", lineHeight: 1.6 }}>
                This is a demo build: your paper wallet lives on this device. Add a simulated starting balance.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 30 }}>
                {FUND_OPTIONS.map((f) => (
                  <button key={f} type="button" onClick={() => patch({ fund: f })} data-on={state.fund === f}
                    className="chip mono" style={{ padding: "22px 0", fontSize: 19, borderRadius: 20 }}
                    aria-pressed={state.fund === f}>
                    ${f}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 26, background: "var(--surface)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 20, padding: "20px 22px", display: "flex", alignItems: "center", gap: 16 }}>
                <span style={{ fontSize: 14.5, color: "var(--muted)" }}>Deposit fee</span>
                <span className="mono" style={{ marginLeft: "auto", color: "var(--green)" }}>$0.00</span>
              </div>
              <button type="button" onClick={() => finish(state.fund, "Deposit")} className="btn btn-primary btn-block" style={{ marginTop: 26, padding: 19, fontSize: 16.5 }}>
                Deposit ${state.fund} and start
              </button>
              <button type="button" onClick={() => finish(250, "Demo balance")} className="btn-quiet btn-block" style={{ marginTop: 12, padding: 12, fontSize: 14 }}>
                Skip — explore with a demo balance
              </button>
            </div>
          )}
        </div>

        <p style={{ fontSize: 13, color: "var(--faint)", margin: 0 }}>
          {custodial ? `${brand.name} · custodial wallet` : "Demo build · balances stay on this device"}
        </p>
      </div>
    </div>
  );
}
