"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Logo from "@/components/Logo";
import { CAP_OPTIONS, FUND_OPTIONS } from "@/lib/data";
import { useBlip } from "@/lib/store";

const QUOTES = [
  { q: "Three taps. One honest number. That's the whole product.", sub: "Set up in about a minute. No password to invent, no seed phrase to lose." },
  { q: "The code expires in ten minutes. Take your time.", sub: "Any six digits work in this build. We never ask for a password, so there's nothing to leak." },
  { q: "Guardrails first, positions second.", sub: "You set a per-trade cap once. It applies to every buy, everywhere in the app." },
  { q: "Your balance lives on this device. Nobody else holds the keys.", sub: "Non-custodial. Fills stay simulated until a wallet is connected for signing." },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const { state, patch, showToast, ready } = useBlip();

  const mode = params.get("mode") === "signin" ? "signin" : "signup";
  const next = params.get("next") === "coaching" ? "/app/coaching" : "/app/discover";
  const ref = params.get("ref");

  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({ email: false, code: false, handle: false });
  const [code, setCode] = useState("");

  // Someone who already finished onboarding should never see the flow again.
  useEffect(() => {
    if (ready && state.authed) router.replace(next);
  }, [ready, state.authed, router, next]);

  const goNext = () => {
    if (step === 0) {
      if (!EMAIL_RE.test(state.email)) return setErrors((e) => ({ ...e, email: true }));
      setErrors((e) => ({ ...e, email: false }));
      return setStep(1);
    }
    if (step === 1) {
      if (code.replace(/\D/g, "").length < 6) return setErrors((e) => ({ ...e, code: true }));
      setErrors((e) => ({ ...e, code: false }));
      return setStep(2);
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

  const sso = (provider: "apple" | "google") => {
    patch({ email: provider === "apple" ? "you@icloud.com" : "you@gmail.com" });
    setErrors({ email: false, code: false, handle: false });
    setStep(2);
    showToast("Verified with " + (provider === "apple" ? "Apple" : "Google"));
  };

  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <Logo size={28} />
        <div style={{ margin: "auto 0", maxWidth: 400 }}>
          <p className="serif" style={{ fontSize: 46, lineHeight: 1.1, letterSpacing: "-.02em", margin: 0 }}>
            {QUOTES[step].q}
          </p>
          <p style={{ marginTop: 28, color: "var(--muted-2)", fontSize: 15.5, lineHeight: 1.6 }}>{QUOTES[step].sub}</p>
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
                  onKeyDown={(e) => e.key === "Enter" && goNext()}
                  aria-invalid={errors.email} />
                {errors.email && <p className="error">Enter a valid email address.</p>}
              </div>
              <button type="button" onClick={goNext} className="btn btn-primary btn-block" style={{ marginTop: 22, padding: 19, fontSize: 16.5 }}>
                Send code
              </button>
              <div style={{ marginTop: 22, display: "flex", gap: 12 }}>
                <button type="button" onClick={() => sso("apple")} className="btn btn-ghost" style={{ flex: 1, padding: 15, fontSize: 14.5 }}>Continue with Apple</button>
                <button type="button" onClick={() => sso("google")} className="btn btn-ghost" style={{ flex: 1, padding: 15, fontSize: 14.5 }}>Google</button>
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
                Six digits sent to <span style={{ color: "var(--text)", fontWeight: 600 }}>{state.email}</span>. Any six will do in this demo.
              </p>
              <label className="sr-only" htmlFor="code">Verification code</label>
              <input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="––––––"
                className="field mono"
                style={{ marginTop: 34, padding: 22, fontSize: 30, letterSpacing: 16, textAlign: "center", borderRadius: 20 }}
                value={code}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setErrors((x) => ({ ...x, code: false })); }}
                onKeyDown={(e) => e.key === "Enter" && goNext()}
                aria-invalid={errors.code} />
              {errors.code && <p className="error">Enter all six digits.</p>}
              <button type="button" onClick={goNext} className="btn btn-primary btn-block" style={{ marginTop: 22, padding: 19, fontSize: 16.5 }}>Verify</button>
              <button type="button" className="btn-quiet btn-block" style={{ marginTop: 12, padding: 12, fontSize: 14 }}
                onClick={() => { setCode(""); showToast("New code sent to " + (state.email || "your inbox")); }}>
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
                    onKeyDown={(e) => e.key === "Enter" && goNext()}
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
              <button type="button" onClick={goNext} className="btn btn-primary btn-block" style={{ marginTop: 30, padding: 19, fontSize: 16.5 }}>
                Create wallet
              </button>
            </div>
          )}

          {step === 3 && (
            <div>
              <h1 style={{ margin: 0, fontSize: 38, lineHeight: 1.08, letterSpacing: "-.035em", fontWeight: 800 }}>Fund the wallet.</h1>
              <p style={{ color: "var(--muted)", fontSize: 16, margin: "14px 0 0", lineHeight: 1.6 }}>
                Your paper wallet is ready and the balance lives on this device. Add starting balance.
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

        <p style={{ fontSize: 13, color: "var(--faint)", margin: 0 }}>Demo build · balances stay on this device</p>
      </div>
    </div>
  );
}
