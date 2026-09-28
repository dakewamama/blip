"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useBlip } from "@/lib/store";
import { api, ApiError, type DepositAddress } from "@/lib/api";

const SOL_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const short = (s: string) => (s.length > 12 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s);

/**
 * The dashboard's direct deposit lane: your USDC-on-Solana address with a QR,
 * for when the card flow is not what you want. Same non-custodial funding
 * service the Add funds screen uses — the address is the user's own wallet
 * and blip only watches the chain for confirmed transfers.
 */
export default function FundCard() {
  const { state, patch, showToast } = useBlip();
  const owner = state.walletAddress;

  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [address, setAddress] = useState<DepositAddress | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Resolve the deposit address whenever the tracked wallet changes.
  useEffect(() => {
    if (!owner) {
      setAddress(null);
      setBalance(null);
      setError(null);
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

  const refreshBalance = useCallback(async () => {
    if (!owner) return;
    try {
      const b = await api.fundingBalance(owner);
      setBalance(b.usdc);
    } catch {
      /* keep the last known credited balance */
    }
  }, [owner]);

  useEffect(() => {
    if (!owner) return;
    void refreshBalance();
    const id = setInterval(() => void refreshBalance(), 15_000);
    return () => clearInterval(id);
  }, [owner, refreshBalance]);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast(`${label} copied`);
    } catch {
      showToast("Copy failed — select and copy manually");
    }
  };

  const setWallet = () => {
    const next = input.trim();
    if (!SOL_ADDRESS.test(next)) {
      setInputError("Enter a valid Solana wallet address.");
      return;
    }
    setInputError(null);
    patch({ walletAddress: next });
  };

  return (
    <div className="panel" style={{ marginTop: 26, display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap", padding: 24 }}>
      {owner && address ? (
        <div style={{ background: "#fff", padding: 9, borderRadius: 14, lineHeight: 0, flex: "none" }}>
          <QRCodeSVG value={address.qr} size={96} bgColor="#ffffff" fgColor="#08080A" level="M" />
        </div>
      ) : (
        <div
          aria-hidden
          style={{
            width: 96, height: 96, borderRadius: 14, flex: "none", display: "grid", placeItems: "center",
            background: "var(--surface-deep)", border: "1px dashed var(--hair-strong)", fontSize: 30, color: "var(--muted-4)",
          }}
        >
          ◎
        </div>
      )}

      <div style={{ flex: 1, minWidth: 240 }}>
        <p className="label" style={{ margin: 0 }}>Add funds — deposit straight to your wallet</p>

        {!owner ? (
          <>
            <p style={{ color: "var(--muted-2)", fontSize: 13.5, margin: "8px 0 0", lineHeight: 1.55 }}>
              Paste the Solana wallet you fund from and your USDC deposit QR appears right here —
              no card flow needed.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <input className="field mono" style={{ flex: 1, minWidth: 220, padding: "12px 16px", fontSize: 13.5 }}
                placeholder="Solana address" value={input} aria-label="Solana wallet address"
                onChange={(e) => { setInput(e.target.value); setInputError(null); }}
                onKeyDown={(e) => e.key === "Enter" && setWallet()} />
              <button type="button" className="btn btn-primary" style={{ padding: "12px 20px", fontSize: 14 }} onClick={setWallet}>
                Show my QR
              </button>
            </div>
            {inputError && <p className="error">{inputError}</p>}
          </>
        ) : loading && !address ? (
          <p style={{ color: "var(--muted-2)", fontSize: 13.5, margin: "8px 0 0" }}>Resolving deposit address…</p>
        ) : error && !address ? (
          <>
            <p className="error" style={{ margin: "8px 0 0" }}>{error}</p>
            <button type="button" className="btn-quiet" style={{ padding: 0, marginTop: 8, fontSize: 13 }} onClick={() => patch({ walletAddress: owner })}>
              retry
            </button>
          </>
        ) : address ? (
          <>
            <button type="button" onClick={() => copy(address.owner, "Address")} title="Copy address"
              style={{ display: "block", marginTop: 8, background: "var(--surface-deep)", border: "1px solid var(--hair)", borderRadius: 12, padding: "10px 14px", cursor: "pointer", color: "var(--text)", textAlign: "left", maxWidth: 460 }}>
              <span className="label" style={{ fontSize: 10.5 }}>USDC · Solana — tap to copy</span>
              <span className="mono" style={{ display: "block", fontSize: 13, marginTop: 4, wordBreak: "break-all" }}>{address.owner}</span>
            </button>
            <p style={{ fontSize: 12.5, color: "var(--muted-4)", margin: "8px 0 0" }}>
              Credited balance: <span className="mono" style={{ color: balance === null ? undefined : "var(--green)" }}>{balance === null ? "—" : `${balance} USDC`}</span>
              {" "}· credits once the transfer confirms on-chain.
            </p>
          </>
        ) : null}
      </div>

      <Link href="/app/wallet" className="btn btn-ghost" style={{ flex: "none", padding: "12px 20px", fontSize: 13.5 }}>
        Full Add funds →
      </Link>
    </div>
  );
}
