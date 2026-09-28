"use client";

import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useBlip } from "@/lib/store";
import { api, ApiError, type DepositAddress, type FundingDeposit } from "@/lib/api";

const SOL_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const short = (s: string) => (s.length > 12 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s);

export default function Wallet() {
  const { state, patch, showToast } = useBlip();
  const owner = state.walletAddress;

  const [input, setInput] = useState(owner ?? "");
  const [address, setAddress] = useState<DepositAddress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [deposits, setDeposits] = useState<FundingDeposit[]>([]);

  // Resolve the deposit address whenever the funding wallet changes.
  useEffect(() => {
    if (!owner) {
      setAddress(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .fundingAddress(owner)
      .then((a) => { if (!cancelled) setAddress(a); })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Could not reach the funding service.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [owner]);

  // Poll the durably-credited balance + deposit history while a wallet is set.
  const refresh = useCallback(async () => {
    if (!owner) return;
    try {
      const [b, d] = await Promise.all([api.fundingBalance(owner), api.fundingDeposits(owner)]);
      setBalance(b.usdc);
      setDeposits(d.deposits);
    } catch {
      /* keep whatever is on screen; the watcher is authoritative, not this poll */
    }
  }, [owner]);

  useEffect(() => {
    if (!owner) { setBalance(null); setDeposits([]); return; }
    void refresh();
    const timer = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(timer);
  }, [owner, refresh]);

  const setWallet = () => {
    const next = input.trim();
    if (!SOL_ADDRESS.test(next)) {
      setError("Enter a valid Solana wallet address.");
      return;
    }
    setError(null);
    patch({ walletAddress: next });
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast(`${label} copied`);
    } catch {
      showToast("Copy failed — select and copy manually");
    }
  };

  return (
    <div>
      <h1 className="h3">Add funds</h1>
      <p style={{ color: "var(--muted)", fontSize: 17, margin: "12px 0 0", maxWidth: 620 }}>
        Send USDC on Solana to your own wallet. blip watches the chain and credits the deposit
        once it confirms — non-custodial, so nobody but you ever holds the keys.
      </p>

      {!owner ? (
        <div className="panel" style={{ marginTop: 34, maxWidth: 620 }}>
          <p className="label" style={{ margin: 0 }}>Your Solana wallet</p>
          <p style={{ color: "var(--muted-2)", fontSize: 14.5, margin: "10px 0 0", lineHeight: 1.6 }}>
            Paste the wallet you’ll fund from. This is where deposits land and what blip watches —
            it is never stored server-side beyond the address itself.
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <input className="field mono" style={{ flex: 1, minWidth: 260, fontSize: 14 }}
              placeholder="Solana address" value={input} aria-label="Solana wallet address"
              onChange={(e) => { setInput(e.target.value); setError(null); }}
              onKeyDown={(e) => e.key === "Enter" && setWallet()} />
            <button type="button" className="btn btn-primary" onClick={setWallet}>Use this wallet</button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, marginTop: 34, alignItems: "start" }}>
            {/* Deposit address + QR */}
            <div className="panel">
              <p className="label" style={{ margin: 0 }}>Deposit address</p>
              {loading && !address && (
                <p style={{ color: "var(--muted-2)", fontSize: 15, marginTop: 16 }}>Resolving address…</p>
              )}
              {error && !address && <p className="error">{error}</p>}
              {address && (
                <>
                  <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
                    <div style={{ background: "#fff", padding: 14, borderRadius: 18, lineHeight: 0 }}>
                      <QRCodeSVG value={address.qr} size={168} bgColor="#ffffff" fgColor="#08080A" level="M" />
                    </div>
                  </div>
                  <p style={{ textAlign: "center", color: "var(--muted-3)", fontSize: 12.5, marginTop: 12 }}>
                    Scan with any Solana wallet · USDC only
                  </p>

                  <button type="button" onClick={() => copy(address.owner, "Address")}
                    title="Copy address"
                    style={{ width: "100%", marginTop: 18, background: "var(--surface-deep)", border: "1px solid var(--hair)", borderRadius: 16, padding: "14px 16px", cursor: "pointer", color: "var(--text)", textAlign: "left" }}>
                    <span className="label" style={{ fontSize: 11 }}>Wallet · tap to copy</span>
                    <span className="mono" style={{ display: "block", fontSize: 13.5, marginTop: 6, wordBreak: "break-all" }}>{address.owner}</span>
                  </button>

                  <div style={{ marginTop: 14, background: "var(--surface-deep)", borderRadius: 16, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                    <Row label="USDC token account" value={short(address.usdcAta)} onCopy={() => copy(address.usdcAta, "Token account")} />
                    <Row label="USDC mint" value={short(address.mint)} onCopy={() => copy(address.mint, "Mint")} />
                    <Row label="Credited at" value={address.requiredCommitment} />
                  </div>
                </>
              )}
            </div>

            {/* Credited balance + deposits */}
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <div className="panel">
                <p className="label" style={{ margin: 0 }}>Credited balance</p>
                <p className="mono" style={{ fontSize: 46, letterSpacing: "-.03em", margin: "12px 0 0" }}>
                  {balance === null ? "—" : `${balance}`}<span style={{ fontSize: 18, color: "var(--muted-3)", marginLeft: 8 }}>USDC</span>
                </p>
                <p style={{ fontSize: 12.5, color: "var(--muted-4)", margin: "8px 0 0", lineHeight: 1.5 }}>
                  Summed from on-chain deposits that reached <span className="mono">{address?.requiredCommitment ?? "confirmed"}</span>.
                  Updates within a poll of landing on-chain.
                </p>
                <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-ghost" style={{ padding: "11px 18px", fontSize: 14 }} onClick={() => void refresh()}>
                    Refresh
                  </button>
                  <button type="button" className="btn-quiet" style={{ padding: "11px 12px", fontSize: 14 }}
                    onClick={() => { patch({ walletAddress: null }); setInput(""); setAddress(null); }}>
                    Use a different wallet
                  </button>
                </div>
              </div>

              <div className="panel">
                <p className="label" style={{ margin: 0 }}>Deposits</p>
                {deposits.length === 0 ? (
                  <p style={{ color: "var(--muted-2)", fontSize: 14.5, margin: "14px 0 0", lineHeight: 1.6 }}>
                    No confirmed deposits yet. Send USDC to the address and it appears here once it confirms.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
                    {deposits.map((d) => (
                      <div key={d.signature} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: "1px solid var(--hair-soft)" }}>
                        <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: "var(--green)", flex: "none" }} />
                        <a href={`https://solscan.io/tx/${d.signature}`} target="_blank" rel="noopener noreferrer"
                          className="mono truncate" style={{ fontSize: 13, color: "var(--muted-2)", flex: 1, minWidth: 0 }}>
                          {short(d.signature)}
                        </a>
                        <span className="mono" style={{ fontSize: 14, color: "var(--green)" }}>+{d.usdc} USDC</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {error && address && <p className="error" style={{ marginTop: 16 }}>{error}</p>}
        </>
      )}

      {/* Reference */}
      <div className="panel" style={{ marginTop: 40, maxWidth: 820 }}>
        <p className="eyebrow" style={{ margin: 0 }}>How funding works</p>
        <p style={{ color: "var(--muted)", fontSize: 15, margin: "14px 0 0", lineHeight: 1.7 }}>
          The deposit address is your own wallet — blip never takes custody. A background watcher
          polls the chain for USDC arriving at your USDC token account and credits the balance{" "}
          <em>only</em> after the transfer reaches the required commitment on-chain, idempotently
          keyed on the transaction signature so a deposit is never counted twice. The credit ledger
          is the source of truth; this screen just reads it.
        </p>
        <p style={{ color: "var(--muted-3)", fontSize: 13.5, margin: "16px 0 0", lineHeight: 1.6 }}>
          Ported from the reference implementation at{" "}
          <a href="https://github.com/dakewamama/onboarding" target="_blank" rel="noopener noreferrer">
            github.com/dakewamama/onboarding
          </a>{" "}
          (<span className="mono">payments/src/funding</span>).
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ fontSize: 13.5, color: "var(--muted)" }}>{label}</span>
      <span className="mono" style={{ marginLeft: "auto", fontSize: 13.5 }}>{value}</span>
      {onCopy && (
        <button type="button" className="btn-quiet" style={{ padding: "0 6px", fontSize: 12.5 }} onClick={onCopy} aria-label={`Copy ${label}`}>
          copy
        </button>
      )}
    </div>
  );
}
