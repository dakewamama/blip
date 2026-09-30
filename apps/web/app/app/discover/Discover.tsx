"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import BackendDown from "@/components/BackendDown";
import FundCard from "@/components/FundCard";
import TokenAvatar from "@/components/TokenAvatar";
import { FILTERS, FILTER_LABELS, SAFETY_FLOOR, scoreColor, verdictOf } from "@/lib/data";
import { compactUsd, money, percent, priceLabel } from "@/lib/format";
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

  // Cold-start recovery: on a sleeping free-tier backend the server render
  // fails, but by the time the user presses "Try again" the API is usually
  // awake. Refetch client-side and swap the live data in without a reload.
  const [retried, setRetried] = useState<{ result: FeedResult | null; error: string | null } | null>(null);
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    setRetrying(true);
    try {
      const url = query
        ? `/api/feed/search?q=${encodeURIComponent(query)}&limit=25`
        : `/api/feed?filter=${filter}&limit=25&includeUnsafe=false`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Request failed with ${res.status}`);
      setRetried({ result: await res.json(), error: null });
    } catch (e) {
      setRetried({ result: null, error: e instanceof Error ? e.message : "Still unreachable" });
    } finally {
      setRetrying(false);
    }
  };

  const shown = retried?.result ?? result;
  const shownError = retried?.error ?? error;

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
        {shown
          ? <>
            {shown.tokens.length} token{shown.tokens.length === 1 ? "" : "s"} shown
            {shown.hiddenByFloor > 0 && ` · ${shown.hiddenByFloor} hidden below a safety score of ${SAFETY_FLOOR}`}
            {shown.solUsd > 0
              ? ` · SOL ${compactUsd(shown.solUsd)}`
              : " · SOL price unavailable, showing SOL amounts only"}
          </>
          : "Market data is offline — the rest of your dashboard still works."}
      </p>

      {shown?.solPriceStale && shown.solUsd > 0 && (
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
          <span
            aria-hidden
            style={{
              width: 20, height: 20, borderRadius: 999, flex: "none", display: "grid", placeItems: "center",
              background: "rgba(255,179,92,.16)", color: "var(--amber, #FFB35C)", fontSize: 12, fontWeight: 800,
            }}
          >
            !
          </span>
          <span style={{ fontSize: 14.5, color: "var(--text-dim)" }}>
            Balance is running low — <span className="mono">{money(state.cash)}</span> cash. Top up to keep the loop going.
          </span>
          <button type="button" className="btn btn-ghost" style={{ marginLeft: "auto", padding: "10px 18px", fontSize: 13.5 }} onClick={openTopUp}>
            Top up
          </button>
        </div>
      )}

      {!query && shown && (
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

      {shown && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 26 }}>
          {shown.tokens.map((t) => {
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
                    {t.score ?? "—"}
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

      {shown && shown.tokens.length === 0 && (
        <div className="empty" style={{ marginTop: 26 }}>
          <p className="serif" style={{ fontSize: 30, margin: 0 }}>Nothing matches that.</p>
          <p style={{ color: "var(--muted-2)", fontSize: 15.5, margin: "12px auto 0", maxWidth: 340, lineHeight: 1.6 }}>
            Try a ticker, or paste a full mint address to look it up directly.
          </p>
        </div>
      )}

      {shownError && (
        <div style={{ marginTop: 26 }}>
          <BackendDown message={shownError} />
          <div style={{ textAlign: "center", marginTop: 18 }}>
            <button type="button" className="btn btn-primary" style={{ padding: "14px 30px", fontSize: 15 }} disabled={retrying} onClick={() => void retry()}>
              {retrying ? "Waking the API…" : "Try again"}
            </button>
            <p style={{ color: "var(--muted-4)", fontSize: 12.5, marginTop: 10 }}>
              The backend may be asleep — the first try wakes it, the second usually lands.
            </p>
          </div>
        </div>
      )}

      <p style={{ marginTop: 30, fontSize: 13.5, color: "var(--muted-5)", textAlign: "center", lineHeight: 1.6 }}>
        Scores below {SAFETY_FLOOR} are hidden; search a ticker to override.<br />
        An asterisk means an on-chain lookup timed out and the score is partial.
      </p>
    </div>
  );
}
