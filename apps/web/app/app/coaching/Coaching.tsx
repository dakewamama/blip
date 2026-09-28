"use client";

import { useState } from "react";
import { COACHES, PLANS } from "@/lib/data";
import { money } from "@/lib/format";
import { useBlip } from "@/lib/store";

export default function Coaching() {
  const { state, patch, bookPlan, cancelPlan, showToast } = useBlip();
  const [inRoom, setInRoom] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);

  const activePlan = PLANS.find((p) => p.id === state.activePlan);
  const activeCoach = COACHES.find((c) => c.id === state.activeCoach);
  const selectedPlan = PLANS.find((p) => p.id === state.plan);
  const selectedCoach = COACHES.find((c) => c.id === state.coach);

  return (
    <div>
      <h1 className="h3">Learn from someone who&apos;s done it.</h1>
      <p style={{ color: "var(--muted)", fontSize: 17, margin: "12px 0 0", maxWidth: 560 }}>
        Live 1-on-1 sessions on entries, exits and reading a safety score. Paid from your blip balance — no card, cancel any time.
      </p>

      {activePlan && activeCoach ? (
        <div style={{ marginTop: 38, animation: "blipPop .34s cubic-bezier(.2,.8,.2,1) both" }}>
          <div className="panel" style={{ border: "1px solid rgba(198,242,78,.28)", padding: 34, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 30, alignItems: "center" }}>
            <div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 9, fontSize: 12.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--lime)", background: "rgba(198,242,78,.1)", borderRadius: 999, padding: "7px 14px" }}>
                <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: "var(--lime)" }} />
                Active
              </span>
              <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-.025em", margin: "18px 0 0" }}>{activePlan.tag} coaching</h2>
              <p style={{ fontSize: 15, color: "var(--muted)", margin: "8px 0 0" }}>
                with {activeCoach.name} · {activePlan.cadence}
              </p>
              <button type="button" onClick={cancelPlan} className="btn btn-ghost btn-danger" style={{ marginTop: 24, padding: "13px 24px", fontSize: 14, fontWeight: 600 }}>
                Cancel plan
              </button>
            </div>
            <div style={{ background: "var(--surface-deep)", borderRadius: 24, padding: 26 }}>
              {inRoom ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: "var(--red)", animation: "blipPulse 1.4s ease-in-out infinite" }} />
                    <p className="label" style={{ margin: 0 }}>In the room · demo build</p>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
                    <div style={{ aspectRatio: "4 / 3", borderRadius: 16, background: "var(--surface-alt)", border: "1px solid var(--hair)", display: "grid", placeItems: "center" }}>
                      <span className="avatar" style={{ width: 52, height: 52, background: activeCoach.color, fontSize: 19 }}>{activeCoach.mono}</span>
                    </div>
                    <div style={{ aspectRatio: "4 / 3", borderRadius: 16, background: "var(--surface-alt)", border: `1px solid ${camOn ? "rgba(198,242,78,.4)" : "var(--hair)"}`, display: "grid", placeItems: "center" }}>
                      <span className="mono" style={{ fontSize: 12.5, color: camOn ? "var(--lime)" : "var(--muted-4)" }}>
                        {camOn ? "you" : "camera off"}
                      </span>
                    </div>
                  </div>
                  <p style={{ fontSize: 13.5, color: "var(--muted-2)", margin: "14px 0 0", lineHeight: 1.6 }}>
                    Agenda: reading safety scores. This room is a placeholder in the demo — live
                    video wiring lands with the real sessions.
                  </p>
                  <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                    <button type="button" className="btn btn-ghost" style={{ flex: 1, padding: "13px 0", fontSize: 14 }}
                      aria-pressed={micOn} onClick={() => setMicOn((v) => !v)}>
                      {micOn ? "Mic on" : "Mic off"}
                    </button>
                    <button type="button" className="btn btn-ghost" style={{ flex: 1, padding: "13px 0", fontSize: 14 }}
                      aria-pressed={camOn} onClick={() => setCamOn((v) => !v)}>
                      {camOn ? "Cam on" : "Cam off"}
                    </button>
                  </div>
                  <button type="button" className="btn btn-ghost btn-danger btn-block" style={{ marginTop: 10, padding: 14, fontSize: 14.5 }}
                    onClick={() => { setInRoom(false); showToast("Left the session room"); }}>
                    Leave room
                  </button>
                </>
              ) : (
                <>
                  <p className="label" style={{ margin: 0 }}>Next session</p>
                  <p style={{ fontSize: 22, fontWeight: 700, margin: "12px 0 0" }}>Tomorrow, 6:30 PM</p>
                  <p style={{ fontSize: 14, color: "var(--muted-2)", margin: "6px 0 0" }}>
                    45 minutes · video call · agenda: reading safety scores
                  </p>
                  <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 22, padding: 16, fontSize: 15.5 }}
                    onClick={() => { setInRoom(true); setMicOn(true); setCamOn(false); }}>
                    Join room
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16, marginTop: 38 }}>
            {PLANS.map((p) => {
              const on = state.plan === p.id;
              return (
                <button key={p.id} type="button" onClick={() => patch({ plan: p.id })} aria-pressed={on}
                  style={{
                    textAlign: "left", cursor: "pointer", color: "var(--text)", transition: ".18s",
                    display: "flex", flexDirection: "column", minHeight: 300, padding: 30, borderRadius: 28,
                    background: on ? "linear-gradient(180deg, rgba(198,242,78,.09), rgba(198,242,78,.02))" : "var(--surface)",
                    border: `1px solid ${on ? "rgba(198,242,78,.42)" : "var(--hair)"}`,
                  }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="label" style={{ letterSpacing: ".08em", fontSize: 12.5, color: on ? "var(--lime)" : "var(--muted-3)" }}>{p.tag}</span>
                    {p.popular && (
                      <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", background: "rgba(198,242,78,.16)", color: "var(--lime)", padding: "5px 10px", borderRadius: 999 }}>
                        Most picked
                      </span>
                    )}
                  </span>
                  <span className="mono" style={{ fontSize: 40, letterSpacing: "-.03em", marginTop: 18 }}>${p.price}</span>
                  <span style={{ fontSize: 13.5, color: "var(--muted-2)", marginTop: 4 }}>{p.cadence}</span>
                  <span style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 24 }}>
                    {p.features.map((f) => (
                      <span key={f} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14.5, color: "var(--text-dim)" }}>
                        <span aria-hidden style={{ color: "var(--lime)", fontWeight: 800 }}>✓</span>{f}
                      </span>
                    ))}
                  </span>
                  <span style={{ marginTop: "auto", paddingTop: 24, fontSize: 14.5, fontWeight: 700, color: on ? "var(--lime)" : "var(--muted-4)" }}>
                    {p.cta}
                  </span>
                </button>
              );
            })}
          </div>

          <h2 className="label" style={{ letterSpacing: ".1em", marginTop: 46 }}>Your coach</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginTop: 18 }}>
            {COACHES.map((c) => {
              const on = state.coach === c.id;
              return (
                <button key={c.id} type="button" onClick={() => patch({ coach: c.id })} aria-pressed={on}
                  style={{
                    display: "flex", alignItems: "center", gap: 16, textAlign: "left", cursor: "pointer",
                    color: "var(--text)", padding: 20, borderRadius: 24, transition: ".18s",
                    background: on ? "var(--surface-deep)" : "var(--surface)",
                    border: `1px solid ${on ? "rgba(198,242,78,.42)" : "var(--hair)"}`,
                  }}>
                  <span className="avatar" style={{ width: 46, height: 46, background: c.color, fontSize: 17 }}>{c.mono}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 700, fontSize: 16 }}>{c.name}</span>
                    <span style={{ display: "block", color: "var(--muted-2)", fontSize: 13, marginTop: 3 }}>{c.focus}</span>
                  </span>
                  <span style={{ marginLeft: "auto", textAlign: "right", flex: "none" }}>
                    <span className="mono" style={{ display: "block", fontSize: 14.5, color: "var(--lime)" }}>{c.rating}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: "var(--muted-4)", marginTop: 3 }}>{c.sessions}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 24, marginTop: 34, background: "var(--surface)", border: "1px solid var(--hair)", borderRadius: 28, padding: "26px 30px", flexWrap: "wrap" }}>
            <div style={{ minWidth: 200 }}>
              <p className="label" style={{ margin: 0 }}>Selected</p>
              <p style={{ fontSize: 18, fontWeight: 700, margin: "8px 0 0" }}>
                {selectedPlan?.tag} · {selectedCoach?.name}
              </p>
              <p style={{ fontSize: 13.5, color: "var(--muted-2)", margin: "4px 0 0" }}>{selectedPlan?.cadence}</p>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
              <div style={{ textAlign: "right" }}>
                <p className="mono" style={{ fontSize: 26, margin: 0 }}>{money(selectedPlan?.price ?? 0)}</p>
                <p style={{ fontSize: 12.5, color: "var(--muted-4)", margin: "3px 0 0" }}>from balance {money(state.cash)}</p>
              </div>
              <button type="button" onClick={bookPlan} className="btn btn-primary" style={{ padding: "18px 34px", fontSize: 16 }}>
                {state.cash >= (selectedPlan?.price ?? 0) ? "Pay from balance" : "Deposit to book"}
              </button>
            </div>
          </div>
          <p style={{ marginTop: 14, fontSize: 13, color: "var(--muted-5)" }}>
            Coaching is education, not financial advice. Refunded in full if you cancel before the first session.
          </p>
        </div>
      )}
    </div>
  );
}
