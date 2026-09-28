"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { money } from "@/lib/format";
import { useBlip } from "@/lib/store";

/**
 * Floating support chat. Frontend only: an assistant that answers from a
 * keyword table with real product answers and links, and says so when it
 * can't help. No backend endpoint behind it — don't pretend otherwise.
 */

type Msg = { from: "bot" | "you"; text: string; link?: { href: string; label: string } };

type Rule = {
  match: RegExp;
  reply: (ctx: { cash: number; handle: string }) => Omit<Msg, "from">;
};

const RULES: Rule[] = [
  {
    match: /(balance|cash|money|fund|deposit|add funds)/i,
    reply: ({ cash }) => ({
      text: `Your balance lives on this device: ${money(cash)} cash right now. Deposits are simulated in this build — the Add funds screen walks the full flow, and the crypto route shows a real USDC address + QR.`,
      link: { href: "/app/deposit", label: "Open Add funds" },
    }),
  },
  {
    match: /(refer|referr|invite|affiliate|partner|recruit)/i,
    reply: () => ({
      text: "The partner program: $10 every time someone signs up through your link and funds, plus a cut of their trading fees and tier bonuses as they bring more. The page has your link, share-kit copy and an earnings calculator.",
      link: { href: "/app/referrals", label: "Open Referrals" },
    }),
  },
  {
    match: /(buy|trade|order|fill|cap|limit)/i,
    reply: () => ({
      text: "Buys are quoted live against the bonding curve — fee and price impact shown before you confirm — and your per-trade cap is enforced on every path, terminal included. Fills settle in the app until a wallet is connected.",
      link: { href: "/app/terminal", label: "Open Terminal" },
    }),
  },
  {
    match: /(sell|exit|take.?profit|\btp\b)/i,
    reply: () => ({
      text: "Sell any position from Portfolio — exits are quoted too, so proceeds include real exit impact. If you armed take-profit 2× at buy, the app watches the live price and auto-exits for you when it doubles.",
      link: { href: "/app/portfolio", label: "Open Portfolio" },
    }),
  },
  {
    match: /(safe|rug|score|scam|check)/i,
    reply: () => ({
      text: "Every token is scored before it reaches your feed: mint authority, freeze authority, holder concentration, liquidity. Under 40 is hidden unless you search for it. An asterisk means a lookup timed out and the score is partial.",
      link: { href: "/app/discover", label: "Open Discover" },
    }),
  },
  {
    match: /(coach|coaching|learn|session)/i,
    reply: () => ({
      text: "Coaching books 1-on-1 sessions from your balance, and the session room opens from the coaching page once a plan is active.",
      link: { href: "/app/coaching", label: "Open Coaching" },
    }),
  },
  {
    match: /(wallet|address|connect|phantom|seed)/i,
    reply: () => ({
      text: "blip is non-custodial — you can track any Solana wallet read-only from Portfolio. Full trading from an external wallet (wallet adapter) is the next piece on the roadmap.",
      link: { href: "/app/portfolio", label: "Track a wallet" },
    }),
  },
  {
    match: /(bug|broken|error|crash|down|stuck|fail)/i,
    reply: () => ({
      text: "Sorry about that. If prices say '—' or feeds won't load, it's usually the market-data service being rate-limited — the Support page shows live dependency status. If it keeps happening, send the page and what you tapped to the channels below and a human picks it up.",
      link: { href: "/app/support", label: "Check system status" },
    }),
  },
];

const QUICK = ["How does my balance work?", "How do referrals pay?", "Why are fills simulated?", "Something looks broken"];

export default function SupportChat() {
  const { state, showToast } = useBlip();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      from: "bot",
      text: "gm. blipbot here — meme division, support department. Ask me anything about the app, or pick a shortcut below.",
    },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The Support page can pop the chat open: blip:open-chat
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("blip:open-chat", onOpen);
    return () => window.removeEventListener("blip:open-chat", onOpen);
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, typing, open]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const answer = (text: string) => {
    const rule = RULES.find((r) => r.match.test(text));
    if (rule) return rule.reply({ cash: state.cash, handle: state.handle });
    return {
      text: "That one's beyond my keyword brain, and I won't invent an answer. The Support page has the FAQ, live system status and human channels — they actually read it.",
      link: { href: "/app/support", label: "Open Support" },
    };
  };

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text || typing) return;
    setMsgs((m) => [...m, { from: "you", text }]);
    setInput("");
    setTyping(true);
    timerRef.current = setTimeout(() => {
      setMsgs((m) => [...m, { from: "bot", ...answer(text) }]);
      setTyping(false);
    }, 650);
  };

  const copyTranscript = async () => {
    try {
      await navigator.clipboard.writeText(
        msgs.map((m) => `${m.from === "you" ? "you" : "blipbot"}: ${m.text}`).join("\n"),
      );
      showToast("Transcript copied");
    } catch {
      showToast("Copy failed");
    }
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open support chat"
          style={{
            position: "fixed", right: 26, bottom: 26, zIndex: 80,
            width: 58, height: 58, borderRadius: 999, border: "none", cursor: "pointer",
            background: "var(--lime)", color: "var(--lime-ink)", fontSize: 24, fontWeight: 800,
            boxShadow: "0 16px 40px -12px rgba(198,242,78,.55)", transition: ".18s",
          }}
        >
          ?
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Support chat"
          style={{
            position: "fixed", right: 22, bottom: 22, zIndex: 80,
            width: "min(380px, calc(100vw - 44px))", height: "min(560px, calc(100vh - 44px))",
            background: "var(--surface)", border: "1px solid var(--hair-strong)", borderRadius: 26,
            display: "flex", flexDirection: "column", overflow: "hidden",
            boxShadow: "0 30px 80px -20px rgba(0,0,0,.9)", animation: "blipPop .28s cubic-bezier(.2,.8,.2,1) both",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 20px", borderBottom: "1px solid var(--hair)", background: "var(--surface-deep)" }}>
            <span className="avatar" style={{ width: 36, height: 36, background: "var(--lime)", color: "var(--lime-ink)", fontSize: 16 }}>b</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>blip support</div>
              <div style={{ fontSize: 12, color: "var(--muted-3)" }}>instant answers · humans on the Support page</div>
            </div>
            <button type="button" className="btn-quiet" style={{ marginLeft: "auto", padding: "4px 8px", fontSize: 13 }} onClick={copyTranscript}>
              copy
            </button>
            <button type="button" aria-label="Close chat" onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "var(--muted-2)", fontSize: 18, cursor: "pointer", padding: "0 4px" }}>
              ✕
            </button>
          </div>

          <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.from === "you" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "86%", padding: "12px 15px", borderRadius: 18, fontSize: 14, lineHeight: 1.55,
                  background: m.from === "you" ? "rgba(198,242,78,.14)" : "var(--surface-deep)",
                  border: `1px solid ${m.from === "you" ? "rgba(198,242,78,.3)" : "var(--hair)"}`,
                  borderBottomRightRadius: m.from === "you" ? 6 : undefined,
                  borderBottomLeftRadius: m.from === "you" ? undefined : 6,
                }}>
                  {m.text}
                </div>
                {m.link && (
                  <Link href={m.link.href} onClick={() => setOpen(false)} className="btn btn-ghost"
                    style={{ marginTop: 8, padding: "9px 16px", fontSize: 13 }}>
                    {m.link.label} →
                  </Link>
                )}
              </div>
            ))}
            {typing && (
              <div className="mono" style={{ color: "var(--muted-4)", fontSize: 13 }}>blipbot is typing…</div>
            )}
          </div>

          <div style={{ padding: "0 18px 12px", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {QUICK.map((q) => (
              <button key={q} type="button" className="pill" style={{ padding: "8px 14px", fontSize: 12.5 }} onClick={() => send(q)}>
                {q}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, padding: "12px 18px 18px", borderTop: "1px solid var(--hair)" }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send(input)}
              placeholder="Ask about trading, referrals, support…"
              aria-label="Support message"
              className="mono"
              style={{ flex: 1, background: "var(--surface-deep)", border: "1px solid var(--hair)", borderRadius: 14, padding: "12px 14px", color: "var(--text)", fontSize: 14, outline: "none" }}
            />
            <button type="button" className="btn btn-primary" style={{ padding: "12px 20px", fontSize: 14 }} disabled={typing} onClick={() => send(input)}>
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}
