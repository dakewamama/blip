"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { money } from "@/lib/format";
import { useBlip } from "@/lib/store";

const QUICK = [50, 100, 250];

/**
 * The balance chip doubles as the quick top-up. When cash runs dry mid-loop
 * the buy path sends the user here (blip:open-topup) instead of dead-ending:
 * one tap credits the simulated balance and trading continues.
 */
export default function TopUpChip() {
  const { state, deposit, showToast } = useBlip();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("blip:open-topup", onOpen);
    return () => window.removeEventListener("blip:open-topup", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const add = (amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    deposit(Math.floor(amount));
    setCustom("");
    setOpen(false);
  };

  const value = Math.max(0, Math.floor(Number(custom) || 0));

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Balance — tap to top up"
        style={{
          background: "var(--surface)", border: `1px solid ${open ? "rgba(198,242,78,.4)" : "rgba(255,255,255,.08)"}`,
          borderRadius: 999, padding: "10px 22px", textAlign: "right", cursor: "pointer", color: "var(--text)",
        }}
      >
        <span style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 12.5, color: "var(--muted-3)", fontWeight: 600 }}>Balance</span>
          <span className="mono" style={{ fontSize: 16.5 }}>{money(state.cash)}</span>
          <span aria-hidden style={{ fontSize: 10, color: "var(--muted-4)" }}>▼</span>
        </span>
        <span className="mono" style={{ display: "block", fontSize: 11.5, color: "var(--muted-4)", marginTop: 1 }}>
          cash · tap to add
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Quick top-up"
          style={{
            position: "absolute", top: "calc(100% + 10px)", right: 0, zIndex: 70,
            width: 320, background: "var(--surface)", border: "1px solid var(--hair-strong)", borderRadius: 22,
            padding: 22, boxShadow: "0 30px 80px -20px rgba(0,0,0,.9)", animation: "blipPop .22s cubic-bezier(.2,.8,.2,1) both",
          }}
        >
          <p className="label" style={{ margin: 0 }}>Quick top-up</p>
          <p className="mono" style={{ fontSize: 30, letterSpacing: "-.03em", margin: "10px 0 0" }}>{money(state.cash)}</p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 16 }}>
            {QUICK.map((a) => (
              <button key={a} type="button" className="chip mono" onClick={() => add(a)}>
                +${a}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input
              inputMode="numeric"
              placeholder="Custom amount"
              aria-label="Custom top-up amount"
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && value > 0 && add(value)}
              className="mono"
              style={{ flex: 1, background: "var(--surface-deep)", border: "1px solid var(--hair)", borderRadius: 12, padding: "11px 14px", color: "var(--text)", fontSize: 14, outline: "none" }}
            />
            <button type="button" className="btn btn-primary" style={{ padding: "11px 18px", fontSize: 14 }} disabled={value <= 0} onClick={() => add(value)}>
              Add
            </button>
          </div>

          <p style={{ fontSize: 11.5, color: "var(--muted-5)", margin: "12px 0 0", lineHeight: 1.5 }}>
            Simulated card top-up — nothing is charged in this build.
          </p>
          <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 13.5 }}>
            <Link href="/app/deposit" onClick={() => setOpen(false)}>Card flow</Link>
            <Link href="/app/wallet" onClick={() => setOpen(false)}>Deposit with QR</Link>
          </div>
          <button type="button" className="btn-quiet" style={{ padding: 0, marginTop: 8, fontSize: 12 }}
            onClick={() => { setOpen(false); showToast("Balance stays on this device"); }}>
            close
          </button>
        </div>
      )}
    </div>
  );
}
