"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { brand } from "@/lib/brand";
import { useCustody } from "@/lib/custody";
import { useBlip } from "@/lib/store";

/**
 * Customer support: real system status from the API's /ready probe, an FAQ
 * that tells the truth about what is live vs simulated in this build, and
 * whichever human channels the brand actually has.
 * The chat bubble is the floating widget — this page can pop it open.
 */

function faq(custodial: boolean): { q: string; a: string }[] {
  return [
    custodial
      ? {
          q: "Is my balance real money?",
          a: `Yes. ${brand.name} holds a Solana wallet for you, and your balance is exactly what is in it on-chain: SOL plus any tokens. You fund it by sending SOL to the address on the Add funds page, and you can withdraw SOL or tokens to any address from the same page.`,
        }
      : {
          q: "Is my balance real money?",
          a: "Not in this demo build. The balance is stored on this device only and deposits are simulated, including the card flow. Market data is the real thing: prices, market caps, liquidity, safety scores and quotes all come from the live chain.",
        },
    custodial
      ? {
          q: "Who holds the keys?",
          a: `${brand.name} does — this is a custodial wallet, so there is no seed phrase for you to write down or lose. Every trade is signed server-side only after it is checked against what you asked for: the right token, the right side, no more SOL than you chose to spend.`,
        }
      : {
          q: "Why are fills simulated?",
          a: "This is a demo build with no accounts configured. Buys and sells are priced by a live bonding-curve quote, so fills carry the real fee and real price impact, but nothing is signed or broadcast. The live build signs and sends each trade from the wallet it holds for you.",
        },
    {
      q: "How does the per-trade cap work?",
      a: "Pick a max per trade during onboarding; it's enforced on every buy path — discover, token page and terminal — and checked again server-side before anything is signed. Oversized orders are sized down and you're told, never silently clipped.",
    },
    {
      q: "What does take-profit 2× actually do?",
      a: "Arm it on a buy and the app watches that position against the live market price while it's open in a tab. When the position is worth 2× what you put in, it exits through the same quoted sell path as a manual sell — real exit impact included — and logs it to Activity.",
    },
    {
      q: "How do referrals pay out?",
      a: custodial
        ? "The referral program is not paying out from live wallets yet. Your link and code work, and sign-ups are tracked on this device; rewards will credit once payouts go live."
        : "$10 for every person who signs up through your link and funds, plus a share of their trading fees and tier bonuses as they scale. In this build rewards credit straight to your simulated balance.",
    },
    {
      q: "A price says “—” or a score has an asterisk. Broken?",
      a: "No — that's the honesty policy. A missing SOL price withholds dollar values instead of guessing, and an asterisk means one on-chain lookup timed out so the score is partial. Check the live status below; the public RPC rate-limits under load.",
    },
    {
      q: "Can I trade a token that graduated?",
      a: `Not in ${brand.name} yet. Graduated tokens left the bonding curve and trade on an AMM pool — ${brand.name} only quotes the curve, so it refuses rather than fake a price.${custodial ? " You can withdraw the token to your own wallet and trade it there." : ""}`,
    },
  ];
}

const CHANNELS = [
  brand.support.email && { label: "Email", value: brand.support.email, href: `mailto:${brand.support.email}`, note: "replies within a day, usually faster" },
  brand.support.telegram && { label: "Telegram", value: `@${brand.support.telegram}`, href: `https://t.me/${brand.support.telegram}`, note: "fastest during market hours" },
  brand.support.x && { label: "X / Twitter", value: `@${brand.support.x}`, href: `https://x.com/${brand.support.x}`, note: "status updates and memes" },
].filter((c): c is { label: string; value: string; href: string; note: string } => Boolean(c));

type Status = {
  ok: boolean;
  status?: string;
  dependencies?: Record<string, string>;
  error?: string;
};

export default function Support() {
  const { showToast } = useBlip();
  const custodial = useCustody().enabled;
  const FAQ = faq(custodial);
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
            Instant answers about trading, referrals, balances and withdrawals. Escalates with
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
              <div key={item.q} className="panel-sm" style={{ background: "var(--surface)", border: `1px solid ${on ? "var(--lime-line)" : "var(--hair)"}`, borderRadius: 22, padding: 0, overflow: "hidden" }}>
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
      {CHANNELS.length > 0 && <section style={{ marginTop: 46 }}>
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
      </section>}

      <p style={{ marginTop: 40, fontSize: 13, color: "var(--muted-5)", lineHeight: 1.6, maxWidth: 620 }}>
        {custodial
          ? `${brand.name} holds your wallet and trades from it on your instruction.`
          : `${brand.name} is running as a demo build with simulated settlement.`}{" "}
        Crypto is volatile — trade only what you can afford to lose. <Link href="/app/discover">Back to the feed</Link>.
      </p>
    </div>
  );
}
