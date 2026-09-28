"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useBlip } from "@/lib/store";

/**
 * Customer support: real system status from the API's /ready probe, an FAQ
 * that tells the truth about what is live vs simulated, and human channels.
 * The chat bubble is the floating widget — this page can pop it open.
 */

const FAQ: { q: string; a: string }[] = [
  {
    q: "Is my balance real money?",
    a: "The balance is stored on this device only — deposits in this build are simulated, including the card flow. Market data is the real thing: prices, market caps, liquidity, safety scores and quotes all come from the live chain. Nothing you do here can move real funds until a wallet is connected for signing.",
  },
  {
    q: "Why are fills simulated?",
    a: "Buys and sells are priced by a live bonding-curve quote, so fills carry the real 1% fee and real price impact — but the settlement isn't signed or broadcast. Connecting a wallet adapter is the remaining step to live execution; the submit endpoint already exists and is tested.",
  },
  {
    q: "How does the per-trade cap work?",
    a: "Pick a max per trade during onboarding; it's enforced in one place on every buy path — discover, token page and terminal — so no entry point can bypass it. Oversized orders are sized down and you're told, never silently clipped.",
  },
  {
    q: "What does take-profit 2× actually do?",
    a: "Arm it on a buy and the app watches that position against the live market price. When the position is worth 2× what you put in, it exits through the same quoted sell path as a manual sell — real exit impact included — and logs it to Activity.",
  },
  {
    q: "How do referrals pay out?",
    a: "$10 for every person who signs up through your link and funds, plus a share of their trading fees and tier bonuses as they scale. In this build rewards credit straight to your simulated balance; the accounting is the same shape the live program uses.",
  },
  {
    q: "A price says “—” or a score has an asterisk. Broken?",
    a: "No — that's the honesty policy. A missing SOL price withholds dollar values instead of guessing, and an asterisk means one on-chain lookup timed out so the score is partial. Check the live status below; the public RPC rate-limits under load.",
  },
  {
    q: "Can I trade a token that graduated?",
    a: "Not in blip yet. Graduated tokens left the bonding curve and trade on an AMM pool — blip only quotes the curve, so it refuses rather than fake a price. Route those through a DEX aggregator.",
  },
];

const CHANNELS = [
  { label: "Email", value: "support@blip.trade", href: "mailto:support@blip.trade", note: "replies within a day, usually faster" },
  { label: "Telegram", value: "@blipsupport", href: "https://t.me/blipsupport", note: "fastest during market hours" },
  { label: "X / Twitter", value: "@blipdottrade", href: "https://x.com/blipdottrade", note: "status updates and memes" },
];

type Status = {
  ok: boolean;
  status?: string;
  dependencies?: Record<string, string>;
  error?: string;
};

export default function Support() {
  const { showToast } = useBlip();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let cancelled = false;
    const probe = () =>
      api
        .ready()
        .then((r) => { if (!cancelled) setStatus({ ok: true, status: r.status, dependencies: r.dependencies }); })
        .catch((e) => { if (!cancelled) setStatus({ ok: false, error: e.message }); });
    void probe();
    const id = setInterval(probe, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const openChat = () => {
    window.dispatchEvent(new CustomEvent("blip:open-chat"));
    showToast("Chat opened — bottom right");
  };

  return (
    <div>
      <h1 className="h3">Support</h1>
      <p style={{ color: "var(--muted)", fontSize: 17, margin: "12px 0 0", maxWidth: 620 }}>
        Real humans behind this thing. Start with the assistant (bottom-right bubble) or the FAQ —
        it answers most of what lands in the inbox.
      </p>

      <div className="grid-auto" style={{ marginTop: 34 }}>
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <p className="label" style={{ margin: 0 }}>Chat with us</p>
          <p style={{ color: "var(--muted)", fontSize: 14.5, margin: "10px 0 18px", lineHeight: 1.6 }}>
            Instant answers about trading, referrals, balances and what&apos;s simulated. Escalates with
            the full transcript when it can&apos;t help.
          </p>
          <button type="button" className="btn btn-primary" style={{ marginTop: "auto", padding: "14px 22px", fontSize: 14.5 }} onClick={openChat}>
            Open the chat
          </button>
        </div>

        <div className="panel">
          <p className="label" style={{ margin: 0 }}>System status</p>
          {status === null ? (
            <p style={{ color: "var(--muted-2)", fontSize: 14.5, margin: "12px 0 0" }}>Probing the market-data service…</p>
          ) : status.ok ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
                <span aria-hidden style={{ width: 9, height: 9, borderRadius: 999, background: "var(--green)", animation: "blipPulse 1.8s ease-in-out infinite" }} />
                <span style={{ fontSize: 16, fontWeight: 700, color: "var(--green)" }}>API up</span>
                <span className="mono" style={{ fontSize: 13, color: "var(--muted-3)" }}>· {status.status ?? "ok"}</span>
              </div>
              {status.dependencies && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
                  {Object.entries(status.dependencies).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5 }}>
                      <span className="mono" style={{ color: "var(--muted-2)" }}>{k}</span>
                      <span style={{
                        marginLeft: "auto", fontSize: 12, fontWeight: 700, letterSpacing: ".04em",
                        color: /ok|up|healthy|ready/i.test(v) ? "var(--green)" : /degrad|stale|slow/i.test(v) ? "var(--amber, #FFB35C)" : "var(--red)",
                      }}>
                        {v}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p style={{ fontSize: 12, color: "var(--muted-4)", margin: "14px 0 0" }}>Re-checked every 30 seconds.</p>
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
                <span aria-hidden style={{ width: 9, height: 9, borderRadius: 999, background: "var(--red)" }} />
                <span style={{ fontSize: 16, fontWeight: 700, color: "var(--red)" }}>API unreachable</span>
              </div>
              <p style={{ color: "var(--muted-2)", fontSize: 13.5, margin: "10px 0 0", lineHeight: 1.6 }}>
                {status.error} — prices and quotes will be blank until it&apos;s back. Your balance and
                history are safe on this device.
              </p>
            </>
          )}
        </div>
      </div>

      {/* FAQ */}
      <section style={{ marginTop: 46 }}>
        <h2 className="label" style={{ letterSpacing: ".1em", margin: 0 }}>Frequently asked</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
          {FAQ.map((item, i) => {
            const on = openFaq === i;
            return (
              <div key={item.q} className="panel-sm" style={{ background: "var(--surface)", border: `1px solid ${on ? "rgba(198,242,78,.3)" : "var(--hair)"}`, borderRadius: 22, padding: 0, overflow: "hidden" }}>
                <button type="button" onClick={() => setOpenFaq(on ? null : i)} aria-expanded={on}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, textAlign: "left", cursor: "pointer", background: "none", border: "none", color: "var(--text)", padding: "20px 24px" }}>
                  <span style={{ fontWeight: 700, fontSize: 15.5 }}>{item.q}</span>
                  <span aria-hidden style={{ marginLeft: "auto", color: "var(--lime)", fontWeight: 800, fontSize: 18, transform: on ? "rotate(45deg)" : "none", transition: ".2s" }}>+</span>
                </button>
                {on && (
                  <p style={{ color: "var(--muted)", fontSize: 14.5, lineHeight: 1.7, margin: 0, padding: "0 24px 22px" }}>
                    {item.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* human channels */}
      <section style={{ marginTop: 46 }}>
        <h2 className="label" style={{ letterSpacing: ".1em", margin: 0 }}>Talk to a human</h2>
        <div className="grid-auto" style={{ marginTop: 18 }}>
          {CHANNELS.map((c) => (
            <a key={c.label} href={c.href} target={c.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer"
              className="panel" style={{ display: "block", color: "var(--text)" }}>
              <p className="label" style={{ margin: 0 }}>{c.label}</p>
              <p style={{ fontWeight: 700, fontSize: 16.5, margin: "10px 0 0" }}>{c.value}</p>
              <p style={{ color: "var(--muted-3)", fontSize: 13, margin: "6px 0 0" }}>{c.note}</p>
            </a>
          ))}
        </div>
      </section>

      <p style={{ marginTop: 40, fontSize: 13, color: "var(--muted-5)", lineHeight: 1.6, maxWidth: 620 }}>
        blip is a trading interface with simulated settlement in this build. Crypto is volatile —
        trade only what you can afford to lose. <Link href="/app/discover">Back to the feed</Link>.
      </p>
    </div>
  );
}
