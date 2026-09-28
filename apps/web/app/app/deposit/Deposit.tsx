"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { money } from "@/lib/format";
import { useBlip } from "@/lib/store";

type Method = "card" | "apple" | "google" | "crypto";
type Step = "amount" | "method" | "review" | "done";

const AMOUNTS = [50, 100, 250, 500];

const METHODS: { id: Method; label: string; sub: string; glyph: string }[] = [
  { id: "card", label: "Debit / credit card", sub: "Visa, Mastercard · instant", glyph: "▭" },
  { id: "apple", label: "Apple Pay", sub: "Face ID / Touch ID", glyph: "" },
  { id: "google", label: "Google Pay", sub: "One-tap checkout", glyph: "G" },
  { id: "crypto", label: "USDC on Solana", sub: "On-chain, non-custodial", glyph: "◎" },
];

export default function Deposit() {
  const { deposit } = useBlip();
  const router = useRouter();

  const [step, setStep] = useState<Step>("amount");
  const [amount, setAmount] = useState(100);
  const [custom, setCustom] = useState("");
  const [method, setMethod] = useState<Method>("card");
  const [card, setCard] = useState({ number: "", exp: "", cvc: "" });
  const [processing, setProcessing] = useState(false);

  const value = custom ? Math.max(0, Math.floor(Number(custom) || 0)) : amount;
  const methodMeta = METHODS.find((m) => m.id === method)!;

  const cardValid =
    method !== "card" ||
    (card.number.replace(/\s/g, "").length >= 12 && card.exp.length >= 4 && card.cvc.length >= 3);

  const confirm = () => {
    if (method === "crypto") {
      router.push("/app/wallet");
      return;
    }
    setProcessing(true);
    // Simulated settlement — a real integration swaps this for a PSP charge that
    // credits on the provider's webhook, the same shape as the crypto watcher.
    setTimeout(() => {
      deposit(value);
      setProcessing(false);
      setStep("done");
    }, 900);
  };

  return (
    <div style={{ maxWidth: 620 }}>
      <h1 className="h3">Deposit</h1>
      <p style={{ color: "var(--muted)", fontSize: 17, margin: "12px 0 0" }}>
        Add to your trading balance. Fee shown before you confirm — no surprises.
      </p>

      {/* stepper */}
      {step !== "done" && (
        <div style={{ display: "flex", gap: 8, marginTop: 26 }} aria-hidden>
          {(["amount", "method", "review"] as Step[]).map((s, i) => {
            const order = ["amount", "method", "review"];
            const active = order.indexOf(step) >= i;
            return (
              <span key={s} style={{ height: 4, flex: 1, borderRadius: 999, background: active ? "var(--lime)" : "rgba(255,255,255,.12)", transition: ".3s" }} />
            );
          })}
        </div>
      )}

      {step === "amount" && (
        <div className="panel" style={{ marginTop: 24 }}>
          <p className="label" style={{ margin: 0 }}>How much?</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 16 }}>
            {AMOUNTS.map((a) => (
              <button key={a} type="button" className="chip mono" data-on={!custom && amount === a}
                aria-pressed={!custom && amount === a}
                onClick={() => { setAmount(a); setCustom(""); }}>
                ${a}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <label className="label" htmlFor="custom">Or enter an amount</label>
            <div style={{ display: "flex", alignItems: "center", marginTop: 10, background: "var(--surface-deep)", border: "1px solid var(--hair-strong)", borderRadius: 16, padding: "0 18px" }}>
              <span className="mono" style={{ color: "var(--muted-3)", fontSize: 20 }}>$</span>
              <input id="custom" inputMode="numeric" placeholder="0" value={custom}
                onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 7))}
                className="mono" style={{ flex: 1, background: "none", border: "none", padding: "16px 10px", color: "var(--text)", fontSize: 22, outline: "none" }} />
            </div>
          </div>
          <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 22, padding: 18, fontSize: 16 }}
            disabled={value <= 0} onClick={() => setStep("method")}>
            Continue with {money(value, 0)}
          </button>
        </div>
      )}

      {step === "method" && (
        <div className="panel" style={{ marginTop: 24 }}>
          <p className="label" style={{ margin: 0 }}>Pay with</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
            {METHODS.map((m) => {
              const on = method === m.id;
              return (
                <button key={m.id} type="button" onClick={() => setMethod(m.id)} aria-pressed={on}
                  style={{ display: "flex", alignItems: "center", gap: 14, textAlign: "left", cursor: "pointer",
                    color: "var(--text)", padding: "16px 18px", borderRadius: 16, transition: ".18s",
                    background: on ? "var(--surface-deep)" : "rgba(255,255,255,.03)",
                    border: `1px solid ${on ? "rgba(198,242,78,.42)" : "var(--hair)"}` }}>
                  <span className="mono" style={{ width: 34, height: 34, display: "grid", placeItems: "center", borderRadius: 10, background: "var(--surface-alt)", fontSize: 16, flex: "none" }}>{m.glyph || m.label[0]}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 700, fontSize: 15 }}>{m.label}</span>
                    <span style={{ display: "block", color: "var(--muted-2)", fontSize: 13, marginTop: 2 }}>{m.sub}</span>
                  </span>
                  <span aria-hidden style={{ marginLeft: "auto", width: 18, height: 18, borderRadius: 999, border: `2px solid ${on ? "var(--lime)" : "var(--muted-5)"}`, background: on ? "var(--lime)" : "transparent", flex: "none" }} />
                </button>
              );
            })}
          </div>

          {method === "card" && (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <input className="field mono" placeholder="Card number" inputMode="numeric" value={card.number}
                onChange={(e) => setCard({ ...card, number: formatCard(e.target.value) })} maxLength={19} />
              <div style={{ display: "flex", gap: 10 }}>
                <input className="field mono" placeholder="MM/YY" value={card.exp} style={{ flex: 1 }}
                  onChange={(e) => setCard({ ...card, exp: formatExp(e.target.value) })} maxLength={5} />
                <input className="field mono" placeholder="CVC" inputMode="numeric" value={card.cvc} style={{ flex: 1 }}
                  onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, "").slice(0, 4) })} maxLength={4} />
              </div>
              <p style={{ fontSize: 12, color: "var(--muted-4)", margin: "2px 0 0" }}>Test checkout — no real card is charged.</p>
            </div>
          )}

          {method === "crypto" && (
            <p style={{ fontSize: 13.5, color: "var(--muted-2)", margin: "16px 0 0", lineHeight: 1.6 }}>
              You’ll get an on-chain deposit address and QR on the next screen. Balance credits once
              the USDC transfer confirms — nothing is custodied.
            </p>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
            <button type="button" className="btn btn-ghost" style={{ padding: "16px 20px" }} onClick={() => setStep("amount")}>Back</button>
            <button type="button" className="btn btn-primary" style={{ flex: 1, padding: 16, fontSize: 16 }}
              disabled={!cardValid} onClick={() => setStep("review")}>
              Review
            </button>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="panel" style={{ marginTop: 24 }}>
          <p className="label" style={{ margin: 0 }}>Review</p>
          <div style={{ marginTop: 16, background: "var(--surface-deep)", borderRadius: 18, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            <Line k="Amount" v={money(value)} />
            <Line k="Method" v={methodMeta.label} />
            <Line k="Fee" v="$0.00" tone="good" />
            <div style={{ height: 1, background: "var(--hair)" }} />
            <Line k="Total" v={money(value)} big />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
            <button type="button" className="btn btn-ghost" style={{ padding: "16px 20px" }} onClick={() => setStep("method")}>Back</button>
            <button type="button" className="btn btn-primary" style={{ flex: 1, padding: 16, fontSize: 16 }}
              disabled={processing} onClick={confirm}>
              {processing ? "Processing…" : method === "crypto" ? "Continue to address" : `Pay ${money(value)}`}
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="panel" style={{ marginTop: 24, textAlign: "center", animation: "blipPop .34s cubic-bezier(.2,.8,.2,1) both" }}>
          <div className="avatar" style={{ width: 60, height: 60, margin: "6px auto 0", background: "rgba(107,227,139,.16)", color: "var(--green)", fontSize: 28 }}>✓</div>
          <p className="serif" style={{ fontSize: 30, margin: "18px 0 0" }}>{money(value)} added.</p>
          <p style={{ color: "var(--muted-2)", fontSize: 15, margin: "10px auto 0", maxWidth: 340, lineHeight: 1.6 }}>
            It’s in your trading balance and ready to deploy.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 24, flexWrap: "wrap" }}>
            <Link href="/app/discover" className="btn btn-primary" style={{ padding: "14px 26px", fontSize: 15 }}>Browse tokens</Link>
            <button type="button" className="btn btn-ghost" style={{ padding: "14px 26px", fontSize: 15 }}
              onClick={() => { setStep("amount"); setCustom(""); }}>
              Deposit again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Line({ k, v, tone, big }: { k: string; v: string; tone?: "good"; big?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <span style={{ fontSize: big ? 15 : 14, color: big ? "var(--text)" : "var(--muted)", fontWeight: big ? 700 : 400 }}>{k}</span>
      <span className="mono" style={{ marginLeft: "auto", fontSize: big ? 20 : 15, color: tone === "good" ? "var(--green)" : "var(--text)" }}>{v}</span>
    </div>
  );
}

function formatCard(v: string): string {
  return v.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
}
function formatExp(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 4);
  return d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}
