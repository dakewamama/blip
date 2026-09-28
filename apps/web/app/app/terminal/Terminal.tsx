"use client";

import { useEffect, useRef, useState } from "react";
import { money, priceLabel, tokenAmount } from "@/lib/format";
import { liveValue, referralCode, useBlip } from "@/lib/store";
import { randomMeme } from "@/lib/memes";
import { api, type FeedToken } from "@/lib/api";

type Line = { kind: "in" | "out" | "err" | "sys"; text: string };

const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const HELP = [
  "commands:",
  "  help                 this list",
  "  feed [filter]        trending | new | gainers | safest",
  "  search <q>           find tokens by name/ticker",
  "  price  <sym|mint>    last price",
  "  score  <sym|mint>    safety read + checks",
  "  buy    <sym|mint> <$amt>   quote + book a paper fill",
  "  sell   <sym|mint>    exit a position",
  "  balance              cash + live position value",
  "  positions            list your holdings",
  "  deposit <$amt>       add to your balance",
  "  referral             your invite link",
  "  meme                 wisdom from the meme division",
  "  clear                wipe the screen",
];

export default function Terminal() {
  const { state, ready, buy, sell, deposit, showToast, prices } = useBlip();
  const [lines, setLines] = useState<Line[]>([
    { kind: "sys", text: "blip terminal · type `help` to start" },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [hIndex, setHIndex] = useState(-1);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines, busy]);

  const push = (...items: Line[]) => setLines((l) => [...l, ...items]);
  const out = (text: string) => push({ kind: "out", text });
  const err = (text: string) => push({ kind: "err", text });

  async function resolve(q: string): Promise<FeedToken | null> {
    const t = q.trim();
    if (MINT_RE.test(t)) {
      try {
        return (await api.token(t)).token;
      } catch {
        return null;
      }
    }
    try {
      const r = await api.search(t, 5);
      return r.tokens[0] ?? null;
    } catch {
      return null;
    }
  }

  async function run(raw: string) {
    const cmd = raw.trim();
    if (!cmd) return;
    push({ kind: "in", text: cmd });
    setHistory((h) => [cmd, ...h].slice(0, 50));
    setHIndex(-1);

    const [name, ...args] = cmd.split(/\s+/);
    const rest = args.join(" ");

    switch (name.toLowerCase()) {
      case "help":
        push(...HELP.map((text) => ({ kind: "out" as const, text })));
        return;

      case "clear":
        setLines([]);
        return;

      case "whoami":
        out(state.handle ? `@${state.handle}` : "@you (no handle set)");
        out(`cash ${money(state.cash)} · ${state.holdings.length} position(s)`);
        return;

      case "balance": {
        const marked = state.holdings.reduce((a, h) => a + (liveValue(h, prices) ?? 0), 0);
        const basis = state.holdings.reduce((a, h) => a + h.usd, 0);
        const unmarked = state.holdings.filter((h) => liveValue(h, prices) === null).length;
        out(`cash        ${money(state.cash)}`);
        out(`positions   ${state.holdings.length} · live ${money(marked)} vs ${money(basis)} in${unmarked > 0 ? ` · ${unmarked} unpriced` : ""}`);
        out("marked at the live market price — `positions` for the breakdown");
        return;
      }

      case "meme":
        out(randomMeme());
        return;

      case "positions":
      case "holdings": {
        if (state.holdings.length === 0) return void out("no open positions");
        for (const h of state.holdings) {
          out(`${pad(h.symbol, 8)} ${pad(tokenAmount(h.qty), 12)} ${money(h.usd)}${h.tp ? " · TP 2×" : ""}`);
        }
        return;
      }

      case "activity": {
        if (state.activity.length === 0) return void out("no activity yet");
        for (const a of state.activity.slice(0, 12)) out(`${pad(a.time, 10)} ${pad(a.title, 26)} ${a.amount}`);
        return;
      }

      case "referral":
      case "ref": {
        const code = referralCode(state.handle);
        if (!code) return void err("set a handle first");
        out(`code ${code}`);
        out(`${window.location.origin}/auth?mode=signup&ref=${code}`);
        return;
      }

      case "deposit": {
        const amt = parseAmount(rest);
        if (!amt || amt <= 0) return void err("usage: deposit <$amt>");
        deposit(amt);
        out(`added ${money(amt)} — cash now ${money(state.cash + amt)}`);
        return;
      }

      case "feed": {
        const filter = (["trending", "new", "gainers", "safest"] as const).find((f) => f === rest) ?? "trending";
        setBusy(true);
        try {
          const r = await api.feed(filter, 8);
          out(`${filter} · SOL ${r.solUsd > 0 ? money(r.solUsd) : "—"}`);
          for (const t of r.tokens) {
            out(`${pad(t.symbol, 8)} ${pad(priceLabel(t.priceUsd), 12)} score ${t.score ?? "—"}${t.safetyComplete ? "" : "*"}`);
          }
        } catch {
          err("feed unavailable — is the backend up?");
        } finally {
          setBusy(false);
        }
        return;
      }

      case "search": {
        if (!rest) return void err("usage: search <query>");
        setBusy(true);
        try {
          const r = await api.search(rest, 8);
          if (r.tokens.length === 0) out("no matches");
          for (const t of r.tokens) out(`${pad(t.symbol, 8)} ${pad(t.name, 20)} ${priceLabel(t.priceUsd)}`);
        } catch {
          err("search failed");
        } finally {
          setBusy(false);
        }
        return;
      }

      case "price": {
        if (!rest) return void err("usage: price <sym|mint>");
        setBusy(true);
        try {
          const t = await resolve(rest);
          if (!t) return void err(`no token for "${rest}"`);
          out(`${t.symbol}  ${priceLabel(t.priceUsd)}  (${t.priceSol.toFixed(9)} SOL) · ${t.graduated ? "graduated" : `curve ${Math.round(t.curveProgress * 100)}%`}`);
        } finally {
          setBusy(false);
        }
        return;
      }

      case "score": {
        if (!rest) return void err("usage: score <sym|mint>");
        setBusy(true);
        try {
          const base = await resolve(rest);
          if (!base) return void err(`no token for "${rest}"`);
          const { token, safety } = await api.token(base.mint);
          if (!safety) return void out(`${token.symbol}: safety unavailable`);
          out(`${token.symbol}  ${safety.score}/100 · ${safety.verdict}${safety.complete ? "" : " (partial)"}`);
          for (const c of safety.checks.slice(0, 6)) out(`  ${c.level === "ok" ? "✓" : c.level === "warn" ? "!" : "×"} ${c.text}`);
        } catch {
          err("score lookup failed");
        } finally {
          setBusy(false);
        }
        return;
      }

      case "buy": {
        const amt = parseAmount(args[args.length - 1] ?? "");
        const query = args.slice(0, -1).join(" ") || args[0];
        if (!query || !amt || amt <= 0) return void err("usage: buy <sym|mint> <$amt>");
        if (state.cash <= 0) return void err("no cash — run `deposit <$amt>`");
        setBusy(true);
        try {
          const t = await resolve(query);
          if (!t) return void err(`no token for "${query}"`);
          if (t.graduated) return void err(`${t.symbol} graduated — trade it on a DEX`);
          out(`buying ${money(Math.min(amt, state.cap, state.cash))} of ${t.symbol}…`);
          await buy(t, amt, false);
          out("done — `balance` / `positions` for the fill");
        } finally {
          setBusy(false);
        }
        return;
      }

      case "sell": {
        if (!rest) return void err("usage: sell <sym|mint>");
        const q = rest.toLowerCase();
        const holding = state.holdings.find(
          (h) => h.symbol.toLowerCase() === q || h.mint.toLowerCase() === q,
        );
        if (!holding) return void err(`no open position in "${rest}"`);
        setBusy(true);
        try {
          out(`selling ${holding.symbol}…`);
          await sell(holding);
          out("done — `balance` for proceeds");
        } finally {
          setBusy(false);
        }
        return;
      }

      default:
        err(`unknown command: ${name} — try \`help\``);
    }
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !busy) {
      const v = input;
      setInput("");
      void run(v);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length) {
        const i = Math.min(hIndex + 1, history.length - 1);
        setHIndex(i);
        setInput(history[i]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const i = hIndex - 1;
      if (i < 0) { setHIndex(-1); setInput(""); }
      else { setHIndex(i); setInput(history[i]); }
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 className="h3">Terminal</h1>
        <span style={{ color: "var(--muted-3)", fontSize: 14 }}>trade and inspect the chain by keyboard</span>
      </div>

      <div
        onClick={() => inputRef.current?.focus()}
        style={{
          marginTop: 24, background: "#0A0A0E", border: "1px solid var(--hair)", borderRadius: 20,
          padding: 0, overflow: "hidden", cursor: "text",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid var(--hair-soft)", background: "var(--surface)" }}>
          <span style={{ width: 11, height: 11, borderRadius: 999, background: "#FF6B6B" }} />
          <span style={{ width: 11, height: 11, borderRadius: 999, background: "#FFB35C" }} />
          <span style={{ width: 11, height: 11, borderRadius: 999, background: "#6BE38B" }} />
          <span className="mono" style={{ marginLeft: 10, fontSize: 12.5, color: "var(--muted-3)" }}>
            {state.handle ? `@${state.handle}` : "guest"} — blip
          </span>
        </div>

        <div ref={scrollRef} className="mono"
          style={{ height: "min(58vh, 560px)", overflowY: "auto", padding: 18, fontSize: 13.5, lineHeight: 1.7 }}>
          {lines.map((l, i) => (
            <div key={i} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", color: colorFor(l.kind) }}>
              {l.kind === "in" ? <span style={{ color: "var(--lime)" }}>▸ </span> : null}
              {l.text}
            </div>
          ))}
          {busy && <div style={{ color: "var(--muted-3)" }}>…</div>}

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <span style={{ color: "var(--lime)" }}>▸</span>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              disabled={!ready}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              aria-label="Terminal input"
              className="mono"
              style={{ flex: 1, background: "none", border: "none", color: "var(--text)", fontSize: 13.5, outline: "none", padding: 0 }}
            />
          </div>
        </div>
      </div>

      <p style={{ color: "var(--muted-5)", fontSize: 12.5, marginTop: 14 }}>
        Quotes and scores are live from the backend. Fills are simulated, priced against the real curve —
        the same engine the buttons use. ↑/↓ recalls history.
      </p>
    </div>
  );
}

function colorFor(kind: Line["kind"]): string {
  return kind === "in" ? "var(--text)" : kind === "err" ? "var(--red)" : kind === "sys" ? "var(--muted-3)" : "var(--text-dim)";
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function parseAmount(s: string): number {
  const n = Number(String(s).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? Math.floor(n) : 0;
}
