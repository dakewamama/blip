"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AreaChart } from "@/components/Sparkline";
import TokenAvatar from "@/components/TokenAvatar";
import { checkColor, checkIcon, scoreColor } from "@/lib/data";
import { compactUsd, changeOver, money, percent, priceLabel, sol, tokenAmount } from "@/lib/format";
import { useBlip } from "@/lib/store";
import { api, type FeedToken, type HistoryResult, type Quote, type SafetyReport } from "@/lib/api";

const TIMEFRAMES = [
  { id: "minute", label: "1H", limit: 60 },
  { id: "minute", label: "6H", limit: 360 },
  { id: "hour", label: "1W", limit: 168 },
  { id: "day", label: "1M", limit: 30 },
] as const;

export default function TokenDetail({
  token,
  safety,
  history,
}: {
  token: FeedToken;
  safety: SafetyReport | null;
  history: HistoryResult;
}) {
  const { state, buy, pendingMint } = useBlip();

  const [frame, setFrame] = useState(0);
  const [series, setSeries] = useState(history);
  const [takeProfit, setTakeProfit] = useState(false);
  const [amount, setAmount] = useState(() =>
    Math.max(0, Math.min(50, state.cap, Math.floor(state.cash))),
  );
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);

  const solUsd = token.priceSol > 0 ? token.priceUsd / token.priceSol : 0;
  const closes = useMemo(() => series.points.map((p) => p.close), [series]);
  const change = changeOver(closes);
  const trendColor = (change ?? 0) >= 0 ? "#6BE38B" : "#FF6B6B";
  const held = state.holdings.find((h) => h.mint === token.mint);
  const busy = pendingMint === token.mint;

  // Reload history when the range changes.
  useEffect(() => {
    let cancelled = false;
    const tf = TIMEFRAMES[frame];
    api
      .history(token.mint, tf.id, tf.limit)
      .then((next) => { if (!cancelled) setSeries(next); })
      .catch(() => { /* keep whatever is on screen */ });
    return () => { cancelled = true; };
  }, [frame, token.mint]);

  // Live quote, debounced — this is what the user is actually agreeing to.
  useEffect(() => {
    if (amount <= 0 || !solUsd || token.graduated) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    setQuoting(true);
    const timer = setTimeout(async () => {
      try {
        const result = await api.quote(token.mint, "buy", amount / solUsd);
        if (cancelled) return;
        if (result.success && result.data) {
          setQuote(result.data);
          setQuoteError(null);
        } else {
          setQuote(null);
          setQuoteError(result.error ?? "Quote unavailable");
        }
      } catch (error) {
        if (!cancelled) {
          setQuote(null);
          setQuoteError(error instanceof Error ? error.message : "Quote unavailable");
        }
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, 350);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [amount, solUsd, token.mint, token.graduated]);

  const spendable = Math.max(0, Math.floor(Math.min(state.cap, state.cash)));
  const chips = [10, 50, 100, spendable];

  const stats = [
    { k: "Liquidity", v: compactUsd(token.liquidityUsd) },
    { k: "Market cap", v: compactUsd(token.marketCapUsd) },
    { k: "Curve", v: token.graduated ? "Graduated" : percent(token.curveProgress, 0) },
    { k: "Age", v: token.age },
  ];

  return (
    <div>
      <Link href="/app/discover" className="btn btn-ghost" style={{ padding: "10px 18px", fontSize: 14, display: "inline-block" }}>
        ← All tokens
      </Link>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 28, marginTop: 28, alignItems: "start" }}>
        <div className="panel">
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <TokenAvatar src={token.imageUri} symbol={token.symbol} mint={token.mint} size={56} />
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontWeight: 800, fontSize: 24, letterSpacing: "-.02em", margin: 0 }}>{token.name}</h1>
              <p className="mono truncate" style={{ color: "var(--muted-3)", fontSize: 13.5, margin: "3px 0 0" }}>
                {token.symbol} · {token.mint.slice(0, 4)}…{token.mint.slice(-4)}
              </p>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div className="mono" style={{ fontSize: 28, letterSpacing: "-.02em" }}>{priceLabel(token.priceUsd)}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: change === null ? "var(--muted-4)" : trendColor }}>
                {change === null ? "no range data" : `${change >= 0 ? "+" : ""}${percent(change, 1)} this range`}
              </div>
            </div>
          </div>

          <AreaChart values={closes} color={trendColor} gradientId={`fill-${token.mint.slice(0, 8)}`}
            label={series.source === "unavailable" ? "No indexed price history for this token yet" : undefined} />

          <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
            {TIMEFRAMES.map((tf, i) => (
              <button key={tf.label} type="button" onClick={() => setFrame(i)} aria-pressed={frame === i} className="mono"
                style={{
                  background: frame === i ? "rgba(198,242,78,.14)" : "rgba(255,255,255,.04)",
                  border: "none", color: frame === i ? "var(--lime)" : "var(--muted-2)",
                  padding: "9px 18px", borderRadius: 999, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                }}>
                {tf.label}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 12, marginTop: 28 }}>
            {stats.map((s) => (
              <div key={s.k} style={{ background: "var(--surface-deep)", borderRadius: 18, padding: 18 }}>
                <div className="label" style={{ fontSize: 11.5 }}>{s.k}</div>
                <div className="mono" style={{ fontSize: 17, marginTop: 7 }}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          <div className="panel" style={{ padding: 28 }}>
            {token.graduated ? (
              <div>
                <p className="label" style={{ margin: 0 }}>Graduated</p>
                <p style={{ fontSize: 15.5, color: "var(--muted)", margin: "12px 0 0", lineHeight: 1.6 }}>
                  This token left the bonding curve and trades on an AMM pool. blip quotes the curve,
                  so there is nothing to price here — route it through a DEX aggregator instead.
                </p>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span className="label">Amount</span>
                  <span className="mono" style={{ marginLeft: "auto", fontSize: 13, color: "var(--muted-4)" }}>cap ${state.cap}</span>
                </div>
                <p className="mono" style={{ fontSize: 44, letterSpacing: "-.02em", margin: "14px 0 0" }}>{money(amount, 0)}</p>
                <p style={{ fontSize: 14, color: "var(--muted-2)", margin: "6px 0 0", minHeight: 21 }}>
                  {quoting
                    ? "Quoting…"
                    : quote
                      ? `≈ ${tokenAmount(quote.amountOut)} ${token.symbol} · min ${tokenAmount(quote.minAmountOut)}`
                      : quoteError ?? "—"}
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 22 }}>
                  {chips.map((raw, i) => {
                    const value = Math.min(raw, state.cap, spendable);
                    return (
                      <button key={i} type="button" className="chip mono" data-on={amount === value}
                        aria-pressed={amount === value} onClick={() => setAmount(value)}>
                        {i === 3 ? "Max" : "$" + raw}
                      </button>
                    );
                  })}
                </div>

                <div style={{ marginTop: 22, background: "var(--surface-deep)", borderRadius: 18, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                  <Row label="Fee" value={quote ? sol(quote.feeSol, 5) : "—"} />
                  <Row label="Price impact"
                    value={quote ? percent(quote.priceImpact, 2) : "—"}
                    tone={quote?.highImpact ? "bad" : undefined} />
                  <Row label="Slippage floor" value={quote ? `${quote.slippageBps / 100}%` : "—"} />
                </div>

                {quote?.highImpact && (
                  <p className="error" style={{ lineHeight: 1.5 }}>
                    That size moves the curve {percent(quote.priceImpact, 1)}. Buy less, or accept the fill.
                  </p>
                )}

                <button type="button" onClick={() => setTakeProfit((v) => !v)} role="switch" aria-checked={takeProfit}
                  style={{
                    width: "100%", marginTop: 12, display: "flex", alignItems: "center", gap: 14,
                    background: "var(--surface-deep)", border: `1px solid ${takeProfit ? "rgba(198,242,78,.34)" : "var(--hair-soft)"}`,
                    padding: "16px 18px", borderRadius: 18, cursor: "pointer", color: "var(--text)", textAlign: "left", transition: ".18s",
                  }}>
                  <span style={{ fontSize: 14, color: "var(--muted)" }}>Auto take-profit at 2×</span>
                  <span aria-hidden style={{ marginLeft: "auto", width: 40, height: 23, borderRadius: 999, background: takeProfit ? "var(--lime)" : "rgba(255,255,255,.14)", position: "relative", transition: ".2s", flex: "none" }}>
                    <span style={{ position: "absolute", top: 3, left: takeProfit ? 20 : 3, width: 17, height: 17, borderRadius: 999, background: takeProfit ? "var(--lime-ink)" : "var(--muted-2)", transition: ".2s" }} />
                  </span>
                </button>

                <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 20, padding: 20, fontSize: 16.5 }}
                  disabled={amount <= 0 || busy || !quote}
                  onClick={() => buy(token, amount, takeProfit)}>
                  {busy ? "Placing…" : `Buy ${money(amount, 0)} of ${token.symbol}`}
                </button>

                <p style={{ textAlign: "center", marginTop: 12, fontSize: 12.5, color: "var(--muted-4)", lineHeight: 1.5 }}>
                  Quoted live against the bonding curve. Fills are simulated until a wallet is connected.
                </p>
              </>
            )}
          </div>

          <div className="panel" style={{ padding: 28 }}>
            <p className="label" style={{ margin: 0 }}>Safety read</p>
            {safety ? (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 12 }}>
                  <span className="mono" style={{ fontSize: 40, color: scoreColor(safety.score) }}>{safety.score}</span>
                  <span style={{ fontSize: 14, color: "var(--muted-2)" }}>/ 100 · {safety.verdict}</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,.08)", marginTop: 14, overflow: "hidden" }}>
                  <div style={{ width: `${safety.score}%`, height: "100%", borderRadius: 999, background: scoreColor(safety.score) }} />
                </div>
                <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 12, marginTop: 22 }}>
                  {safety.checks.map((chk) => (
                    <li key={chk.id} style={{ display: "flex", gap: 11, alignItems: "flex-start", fontSize: 14.5, color: "var(--text-dim)" }}>
                      <span aria-hidden style={{ color: checkColor(chk.level), fontWeight: 800 }}>{checkIcon(chk.level)}</span>
                      {chk.text}
                    </li>
                  ))}
                </ul>
                {!safety.complete && (
                  <p style={{ marginTop: 18, fontSize: 13, color: "var(--amber, #FFB35C)", lineHeight: 1.5 }}>
                    An on-chain lookup timed out, so this score is partial. Treat it as a floor, not a verdict.
                  </p>
                )}
              </>
            ) : (
              <p style={{ color: "var(--muted-2)", fontSize: 15, marginTop: 12, lineHeight: 1.6 }}>
                Safety scoring is unavailable for this token right now.
              </p>
            )}

            {held && (
              <p style={{ marginTop: 20, fontSize: 13.5, color: "var(--muted-4)", lineHeight: 1.6 }}>
                You hold {tokenAmount(held.qty)} {held.symbol}
                {held.tp ? " · take-profit 2× armed" : ""}. Exit from the portfolio page.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <span style={{ fontSize: 14, color: "var(--muted)" }}>{label}</span>
      <span className="mono" style={{ marginLeft: "auto", fontSize: 14.5, color: tone === "bad" ? "var(--red)" : "var(--text)" }}>
        {value}
      </span>
    </div>
  );
}
