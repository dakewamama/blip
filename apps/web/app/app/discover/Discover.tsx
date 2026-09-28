"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import BackendDown from "@/components/BackendDown";
import FundCard from "@/components/FundCard";
import TokenAvatar from "@/components/TokenAvatar";
import { FILTERS, FILTER_LABELS, SAFETY_FLOOR, scoreColor, verdictOf } from "@/lib/data";
import { compactUsd, money, percent, priceLabel } from "@/lib/format";
import { verdictEmoji } from "@/lib/memes";
import { useBlip } from "@/lib/store";
import type { FeedFilter, FeedResult } from "@/lib/api";

export default function Discover({
  result,
  error,
  filter,
  query,
}: {
  result: FeedResult | null;
  error: string | null;
  filter: FeedFilter;
  query: string;
}) {
  const { state, buy, pendingMint } = useBlip();
  const router = useRouter();

  const heading = query
    ? `Results for “${query}”`
    : state.handle
      ? `gm @${state.handle}.`
      : "gm. live from the curve.";

  const lowCash = state.cash < 25;
  const openTopUp = () => window.dispatchEvent(new CustomEvent("blip:open-topup"));

  return (
    <div>
      <h1 className="h3">{heading}</h1>
      <p style={{ color: "var(--muted)", fontSize: 17, margin: "12px 0 0" }}>
        {result
          ? <>
            {result.tokens.length} token{result.tokens.length === 1 ? "" : "s"} shown
            {result.hiddenByFloor > 0 && ` · ${result.hiddenByFloor} hidden below a safety score of ${SAFETY_FLOOR}`}
            {result.solUsd > 0
              ? ` · SOL ${compactUsd(result.solUsd)}`
              : " · SOL price unavailable, showing SOL amounts only"}
          </>
          : "Market data is offline — the rest of your dashboard still works."}
      </p>

      {result?.solPriceStale && result.solUsd > 0 && (
        <p style={{ color: "var(--amber, #FFB35C)", fontSize: 13.5, marginTop: 8 }}>
          SOL price is stale — dollar values may lag the market.
        </p>
      )}

      {/* dashboard: direct deposit lane, hidden while searching */}
      {!query && <FundCard />}

      {/* low-funds gate: surface the top-up before a trade dead-ends */}
      {lowCash && (
        <div style={{
          marginTop: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
          background: "linear-gradient(90deg, rgba(255,179,92,.10), rgba(255,179,92,.02))",
          border: "1px solid rgba(255,179,92,.32)", borderRadius: 18, padding: "14px 20px",
        }}>
          <span aria-hidden style={{ fontSize: 18 }}>⚠️</span>
          <span style={{ fontSize: 14.5, color: "var(--text-dim)" }}>
            Balance is running low — <span className="mono">{money(state.cash)}</span> cash. Top up to keep the loop going.
          </span>
          <button type="button" className="btn btn-ghost" style={{ marginLeft: "auto", padding: "10px 18px", fontSize: 13.5 }} onClick={openTopUp}>
            Top up
          </button>
        </div>
      )}

      {!query && result && (
        <div style={{ display: "flex", gap: 10, marginTop: 30, flexWrap: "wrap" }}>
          {FILTERS.map((f) => (
            <button key={f} type="button" className="pill" data-on={filter === f}
              aria-pressed={filter === f}
              onClick={() => router.push(`/app/discover?filter=${f}`)}>
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      )}

      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 26 }}>
          {result.tokens.map((t) => {
            const busy = pendingMint === t.mint;
            return (
              <div key={t.mint} className="token-row">
                <Link href={`/app/token/${t.mint}`} style={{ display: "contents", color: "inherit" }}>
                  <TokenAvatar src={t.imageUri} symbol={t.symbol} mint={t.mint} size={46} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="truncate" style={{ display: "block", fontWeight: 700, fontSize: 16.5, color: "var(--text)" }}>{t.name}</span>
                    <span className="truncate mono" style={{ display: "block", color: "var(--muted-3)", fontSize: 13, marginTop: 3 }}>
                      {t.symbol} · {t.age} old · {compactUsd(t.liquidityUsd)} liq
                    </span>
                  </span>
                </Link>

                <div style={{ textAlign: "right" }}>
                  <div className="mono" style={{ fontSize: 16 }}>{priceLabel(t.priceUsd)}</div>
                  <div style={{ fontSize: 13, color: "var(--muted-3)", marginTop: 3 }}>
                    {t.graduated ? "graduated" : `curve ${percent(t.curveProgress, 0)}`}
                  </div>
                </div>

                <div style={{ width: 78, textAlign: "right" }}>
                  <div className="mono" style={{ fontSize: 16, color: scoreColor(t.score) }}>
                    {t.score ?? "—"} <span aria-hidden>{verdictEmoji(t.score)}</span>
                  </div>
                  <div className="label" style={{ fontSize: 11.5, color: "var(--muted-4)", marginTop: 3 }}>
                    {verdictOf(t.score)}{t.score !== null && !t.safetyComplete ? "*" : ""}
                  </div>
                </div>

                <button type="button" className="btn" disabled={busy || t.graduated}
                  title={t.graduated ? "Graduated — trade this on a DEX" : undefined}
                  style={{ flex: "none", background: "rgba(198,242,78,.12)", borderColor: "rgba(198,242,78,.32)", color: "var(--lime)", padding: "12px 22px", fontSize: 14 }}
                  onClick={() => buy(t, Math.min(50, state.cap), false)}>
                  {busy ? "Quoting…" : "Buy"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {result && result.tokens.length === 0 && (
        <div className="empty" style={{ marginTop: 26 }}>
          <p className="serif" style={{ fontSize: 30, margin: 0 }}>Nothing matches that.</p>
          <p style={{ color: "var(--muted-2)", fontSize: 15.5, margin: "12px auto 0", maxWidth: 340, lineHeight: 1.6 }}>
            Try a ticker, or paste a full mint address to look it up directly.
          </p>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 26 }}>
          <BackendDown message={error} />
        </div>
      )}

      <p style={{ marginTop: 30, fontSize: 13.5, color: "var(--muted-5)", textAlign: "center", lineHeight: 1.6 }}>
        Scores below {SAFETY_FLOOR} are hidden; search a ticker to override.<br />
        An asterisk means an on-chain lookup timed out and the score is partial.
      </p>
    </div>
  );
}
