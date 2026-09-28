"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import TokenAvatar from "@/components/TokenAvatar";
import { compactUsd, money, percent, priceLabel, signedMoney, tokenAmount } from "@/lib/format";
import { liveValue, useBlip } from "@/lib/store";
import { api, type Portfolio as LiveWallet } from "@/lib/api";

export default function Portfolio() {
  const { state, sell, patch, pendingMint, prices, refreshPrices, showToast } = useBlip();

  const [wallet, setWallet] = useState<LiveWallet | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [addressInput, setAddressInput] = useState(state.walletAddress ?? "");

  useEffect(() => {
    if (!state.walletAddress) { setWallet(null); return; }
    let cancelled = false;
    api
      .portfolio(state.walletAddress)
      .then((w) => { if (!cancelled) { setWallet(w); setWalletError(null); } })
      .catch((e) => { if (!cancelled) { setWallet(null); setWalletError(e.message); } });
    return () => { cancelled = true; };
  }, [state.walletAddress]);

  /**
   * Positions are marked on-device from the live feed — real market price ×
   * tokens held, refreshed in the background every 15s. Selling still quotes
   * the curve, so the fill carries real exit impact even though the mark is
   * computed locally.
   */
  const marked = state.holdings.reduce((a, h) => a + (liveValue(h, prices) ?? 0), 0);
  const basis = state.holdings.reduce((a, h) => a + h.usd, 0);
  const unmarked = state.holdings.filter((h) => liveValue(h, prices) === null).length;
  const pnl = marked - basis;

  return (
    <div>
      <h1 className="h3">Portfolio</h1>

      <div className="grid-auto" style={{ marginTop: 34 }}>
        <div className="panel">
          <p className="label" style={{ margin: 0 }}>Total value</p>
          <p className="mono" style={{ fontSize: 50, letterSpacing: "-.03em", margin: "12px 0 0" }}>
            {money(state.cash + marked)}
          </p>
          <p style={{ fontSize: 15, fontWeight: 600, color: pnl >= 0 ? "var(--green)" : "var(--red)", margin: "6px 0 0" }}>
            {signedMoney(pnl)} against {money(basis)} in
          </p>
          <p style={{ fontSize: 12.5, color: "var(--muted-4)", margin: "10px 0 0", lineHeight: 1.5 }}>
            Marked on-device at the live market price, refreshed every 15s.
            {unmarked > 0 && ` ${unmarked} position${unmarked === 1 ? "" : "s"} without a live price are excluded.`}
          </p>
        </div>

        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {[
            ["Cash", money(state.cash)],
            ["In positions", money(marked)],
            ["Open positions", String(state.holdings.length)],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", alignItems: "center" }}>
              <span style={{ fontSize: 14.5, color: "var(--muted)" }}>{k}</span>
              <span className="mono" style={{ marginLeft: "auto", fontSize: 16 }}>{v}</span>
            </div>
          ))}
          <button type="button" className="btn btn-ghost" onClick={() => { void refreshPrices(); showToast("Refreshing live prices…"); }}
            style={{ marginTop: "auto", padding: "12px 20px", fontSize: 14 }}>
            Refresh prices
          </button>
        </div>
      </div>

      {state.holdings.length > 0 ? (
        <section style={{ marginTop: 40 }}>
          <h2 className="label" style={{ letterSpacing: ".1em", margin: 0 }}>Paper positions</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 18 }}>
            {state.holdings.map((h) => {
              const price = prices[h.mint];
              const value = liveValue(h, prices);
              const delta = value === null ? null : value - h.usd;
              const busy = pendingMint === h.mint;
              return (
                <div key={h.mint} style={{ display: "flex", alignItems: "center", gap: 20, background: "var(--surface)", border: "1px solid var(--hair)", borderRadius: 24, padding: "20px 24px", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, width: 260, flex: "none", minWidth: 0 }}>
                    <TokenAvatar src={h.imageUri} symbol={h.symbol} mint={h.mint} size={42} />
                    <div style={{ minWidth: 0 }}>
                      <Link href={`/app/token/${h.mint}`} style={{ fontWeight: 700, fontSize: 16, color: "var(--text)" }}>{h.name}</Link>
                      <div className="mono truncate" style={{ color: "var(--muted-3)", fontSize: 13, marginTop: 3 }}>
                        {tokenAmount(h.qty)} {h.symbol}{h.tp ? " · TP 2× armed" : ""}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right", minWidth: 130 }}>
                    <div className="mono" style={{ fontSize: 16 }}>{value === null ? "—" : money(value)}</div>
                    <div style={{ fontSize: 13, marginTop: 3, color: delta === null ? "var(--muted-4)" : delta >= 0 ? "var(--green)" : "var(--red)" }}>
                      {delta === null
                        ? "no live price"
                        : `${signedMoney(delta)} · avg in ${priceLabel(h.qty > 0 ? h.usd / h.qty : 0)}`}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="label" style={{ fontSize: 11 }}>Market cap</div>
                    <div className="mono" style={{ fontSize: 14.5, marginTop: 3 }}>{price ? compactUsd(price.marketCapUsd) : "—"}</div>
                  </div>
                  <button type="button" className="btn btn-ghost btn-danger" disabled={busy}
                    style={{ flex: "none", padding: "12px 22px", fontSize: 14 }}
                    onClick={() => sell(h)}>
                    {busy ? "Selling…" : "Sell all"}
                  </button>
                </div>
              );
            })}
          </div>
          <p style={{ marginTop: 16, fontSize: 13, color: "var(--muted-5)", lineHeight: 1.6 }}>
            Selling quotes the live bonding curve, so your fill includes the real fee and exit impact —
            the mark above is the market price, not a promise.
          </p>
        </section>
      ) : (
        <div className="empty" style={{ marginTop: 40 }}>
          <p className="serif" style={{ fontSize: 30, margin: 0 }}>Nothing here yet.</p>
          <p style={{ color: "var(--muted-2)", fontSize: 15.5, margin: "12px auto 0", maxWidth: 340, lineHeight: 1.6 }}>
            Your first position takes one tap from the discover list.
          </p>
          <Link href="/app/discover" className="btn btn-primary" style={{ marginTop: 26, display: "inline-block", padding: "15px 30px", fontSize: 15 }}>
            Browse tokens
          </Link>
        </div>
      )}

      {/* Read-only view of a real wallet, separate from the paper book so the
          two can never be confused for one another. */}
      <section style={{ marginTop: 46 }}>
        <h2 className="label" style={{ letterSpacing: ".1em", margin: 0 }}>Track a real wallet</h2>
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <input className="field mono" style={{ flex: 1, minWidth: 260, fontSize: 14 }}
            placeholder="Solana address" value={addressInput} aria-label="Solana wallet address"
            onChange={(e) => setAddressInput(e.target.value)} />
          <button type="button" className="btn btn-ghost"
            onClick={() => patch({ walletAddress: addressInput.trim() || null })}>
            {state.walletAddress ? "Update" : "Track"}
          </button>
          {state.walletAddress && (
            <button type="button" className="btn-quiet" style={{ padding: "0 12px" }}
              onClick={() => { patch({ walletAddress: null }); setAddressInput(""); }}>
              Clear
            </button>
          )}
        </div>

        {walletError && <p className="error">{walletError}</p>}

        {wallet && (
          <div className="panel" style={{ marginTop: 18 }}>
            <div style={{ display: "flex", gap: 30, flexWrap: "wrap" }}>
              <Stat label="SOL" value={wallet.solBalance.toFixed(4)} />
              <Stat label="Cash value" value={wallet.solUsd > 0 ? money(wallet.cashUsd) : "—"} />
              <Stat label="Positions" value={compactUsd(wallet.positionsUsd)} />
              <Stat label="Total" value={compactUsd(wallet.totalUsd)} />
            </div>
            {wallet.positions.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
                {wallet.positions.slice(0, 8).map((p) => (
                  <div key={p.mint} style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 14.5 }}>
                    <span className="truncate" style={{ fontWeight: 600 }}>{p.symbol}</span>
                    <span className="mono" style={{ color: "var(--muted-3)" }}>{tokenAmount(p.amount)}</span>
                    <span className="mono" style={{ marginLeft: "auto" }}>{money(p.exitValueUsd)}</span>
                    <span className="mono" style={{ width: 80, textAlign: "right", color: "var(--muted-4)", fontSize: 13 }}>
                      {percent(p.priceImpactOnExit, 1)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {wallet.unpriced.length > 0 && (
              <p style={{ fontSize: 13, color: "var(--muted-4)", marginTop: 18 }}>
                {wallet.unpriced.length} token account{wallet.unpriced.length === 1 ? "" : "s"} could not be priced — not pump.fun tokens, most likely.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label" style={{ fontSize: 11.5 }}>{label}</div>
      <div className="mono" style={{ fontSize: 20, marginTop: 6 }}>{value}</div>
    </div>
  );
}
