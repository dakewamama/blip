"use client";

import { useEffect, useMemo, useState } from "react";
import { money } from "@/lib/format";
import { REFERRAL_REWARD_USD, referralCode, useBlip, type Referral } from "@/lib/store";
import { MEME_EMPTY } from "@/lib/memes";

/**
 * The partner program. Referrals are the growth engine of the business:
 * users bring us customers, blip pays for them. Signup bonus + a share of the
 * trading fee on everything a referred trader does, for their first year.
 * All accounting is frontend-local in this build — clearly labelled as demo.
 */

type Tier = {
  id: string;
  name: string;
  fundedNeeded: number;
  /** Share of blip's 1% trading fee earned from referred volume. */
  feeShare: number;
  /** One-time bonus paid when the tier is reached. */
  bonus: number;
};

const FEE_BPS = 0.01; // blip's trading fee

const TIERS: Tier[] = [
  { id: "starter", name: "Starter", fundedNeeded: 0, feeShare: 0.10, bonus: 0 },
  { id: "partner", name: "Partner", fundedNeeded: 5, feeShare: 0.15, bonus: 50 },
  { id: "og", name: "OG", fundedNeeded: 25, feeShare: 0.20, bonus: 250 },
  { id: "whale", name: "Whale", fundedNeeded: 100, feeShare: 0.25, bonus: 1000 },
];

const SHARE_KIT = [
  {
    label: "X / Twitter",
    text: "stop pasting contract addresses from group chats. blip scores every memecoin before you see it and shows one honest number before you buy. 60-second setup:\n",
  },
  {
    label: "Telegram",
    text: "found a memecoin app that actually tells you what it's about to buy: live curve quotes, plain-english rug checks, per-trade caps. you get in fast, no seed phrase homework:\n",
  },
  {
    label: "Discord",
    text: "if you're trading pump.fun manually you're doing 5 tabs of work for one tap. blip does the rug check + quote in one screen. sign up here and we both get $10 when you fund:\n",
  },
];

const DEMO_REFERRALS: Referral[] = [
  { handle: "moonjenny", joinedAt: "12 days ago", funded: true, rewardUsd: REFERRAL_REWARD_USD, volumeUsd: 1840 },
  { handle: "gmcarlos", joinedAt: "9 days ago", funded: true, rewardUsd: REFERRAL_REWARD_USD, volumeUsd: 3210 },
  { handle: "shillqueen", joinedAt: "6 days ago", funded: true, rewardUsd: REFERRAL_REWARD_USD, volumeUsd: 940 },
  { handle: "rugproofray", joinedAt: "3 days ago", funded: true, rewardUsd: REFERRAL_REWARD_USD, volumeUsd: 620 },
  { handle: "wenlambo_liam", joinedAt: "2 days ago", funded: false, rewardUsd: REFERRAL_REWARD_USD },
  { handle: "cryptokim", joinedAt: "1 day ago", funded: false, rewardUsd: REFERRAL_REWARD_USD },
];

function tierFor(fundedCount: number): { current: Tier; next: Tier | null } {
  let current = TIERS[0];
  for (const t of TIERS) if (fundedCount >= t.fundedNeeded) current = t;
  const next = TIERS.find((t) => t.fundedNeeded > fundedCount) ?? null;
  return { current, next };
}

export default function Referrals() {
  const { state, showToast, seedReferrals } = useBlip();

  const code = referralCode(state.handle);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const link = code ? `${origin}/auth?mode=signup&ref=${code}` : "";

  const [calc, setCalc] = useState({ perMonth: 10, fundRate: 60, volume: 1500 });

  const funded = useMemo(() => state.referrals.filter((r) => r.funded), [state.referrals]);
  const { current: tier, next } = tierFor(funded.length);
  const volume = useMemo(() => state.referrals.reduce((a, r) => a + (r.volumeUsd ?? 0), 0), [state.referrals]);
  const feeEarned = volume * FEE_BPS * tier.feeShare;
  const signupEarned = funded.reduce((a, r) => a + r.rewardUsd, 0);
  const earned = signupEarned + feeEarned;
  const pending = state.referrals.length - funded.length;

  // calculator: monthly = new funded × (signup bonus + a month of their fee share)
  const fundedPerMonth = Math.round(calc.perMonth * (calc.fundRate / 100));
  const monthly = fundedPerMonth * (REFERRAL_REWARD_USD + calc.volume * FEE_BPS * tier.feeShare);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast(`${label} copied`);
    } catch {
      showToast("Copy failed — select and copy manually");
    }
  };

  const share = async () => {
    if (navigator.share && link) {
      try {
        await navigator.share({ title: "blip partners", text: "Trade memecoins with one honest number before you buy. Join with my link — we both get $10 when you fund:", url: link });
        return;
      } catch {
        /* user dismissed the sheet */
      }
    }
    void copy(link, "Invite link");
  };

  return (
    <div>
      <p className="eyebrow" style={{ margin: 0 }}>blip partner program</p>
      <h1 className="h3" style={{ marginTop: 10 }}>You bring the traders.<br />We pay you for them.</h1>
      <p style={{ color: "var(--muted)", fontSize: 17, margin: "14px 0 0", maxWidth: 640, lineHeight: 1.6 }}>
        This isn&apos;t a badge — it&apos;s a revenue share. {money(REFERRAL_REWARD_USD, 0)} every time someone
        funds through your link, plus <strong style={{ color: "var(--text)" }}>{Math.round(tier.feeShare * 100)}% of blip&apos;s
        1% trading fee</strong> on everything they trade for their first year. Bring more, climb tiers, earn more.
      </p>

      {/* stats + tier */}
      <div className="grid-auto" style={{ marginTop: 34 }}>
        <Stat big label="Earned so far" value={money(earned)} note={`${money(signupEarned, 0)} signups + ${money(feeEarned)} fee share`} accent />
        <Stat label="Your crew" value={String(state.referrals.length)} note={pending > 0 ? `${funded.length} funded · ${pending} pending` : `${funded.length} funded`} />
        <div className="panel">
          <p className="label" style={{ margin: 0 }}>Tier</p>
          <p className="mono" style={{ fontSize: 32, letterSpacing: "-.03em", margin: "12px 0 0", color: "var(--lime)" }}>{tier.name}</p>
          {next ? (
            <>
              <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,.08)", marginTop: 12, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, (funded.length / next.fundedNeeded) * 100)}%`, height: "100%", background: "var(--lime)", borderRadius: 999 }} />
              </div>
              <p style={{ fontSize: 12.5, color: "var(--muted-4)", margin: "8px 0 0" }}>
                {next.fundedNeeded - funded.length} funded to {next.name} — {Math.round(next.feeShare * 100)}% fee share + {money(next.bonus, 0)} bonus
              </p>
            </>
          ) : (
            <p style={{ fontSize: 12.5, color: "var(--muted-4)", margin: "8px 0 0" }}>Top of the ladder. It pays to know people.</p>
          )}
        </div>
      </div>

      {/* link */}
      <div className="panel" style={{ marginTop: 24 }}>
        <p className="label" style={{ margin: 0 }}>Your link — this is the product</p>
        {code ? (
          <>
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <div className="mono" style={{ flex: 1, minWidth: 260, background: "var(--surface-deep)", border: "1px solid var(--hair)", borderRadius: 14, padding: "14px 16px", fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {link}
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => copy(link, "Invite link")}>Copy</button>
              <button type="button" className="btn btn-primary" onClick={share}>Share</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
              <span style={{ fontSize: 13.5, color: "var(--muted)" }}>Referral code</span>
              <span className="mono" style={{ fontSize: 14, color: "var(--lime)" }}>{code}</span>
              <button type="button" className="btn-quiet" style={{ padding: "0 6px", fontSize: 12.5 }} onClick={() => copy(code, "Code")}>copy</button>
            </div>
          </>
        ) : (
          <p style={{ color: "var(--muted-2)", fontSize: 14.5, margin: "12px 0 0", lineHeight: 1.6 }}>
            Set a handle in onboarding to generate your referral link.
          </p>
        )}
      </div>

      {/* share kit */}
      <section style={{ marginTop: 40 }}>
        <h2 className="label" style={{ letterSpacing: ".1em", margin: 0 }}>Share kit — steal these</h2>
        <div className="grid-auto" style={{ marginTop: 18 }}>
          {SHARE_KIT.map((s) => (
            <div key={s.label} className="panel-sm" style={{ background: "var(--surface)", border: "1px solid var(--hair)", borderRadius: 22, display: "flex", flexDirection: "column" }}>
              <p className="label" style={{ margin: 0 }}>{s.label}</p>
              <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.65, margin: "12px 0 16px" }}>{s.text}</p>
              <button type="button" className="btn btn-ghost" style={{ marginTop: "auto", padding: "11px 18px", fontSize: 13.5 }}
                onClick={() => copy(s.text + link, `${s.label} blurb`)}>
                Copy with my link
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* earnings calculator */}
      <section style={{ marginTop: 46 }}>
        <h2 className="label" style={{ letterSpacing: ".1em", margin: 0 }}>What the ladder pays</h2>
        <div className="panel" style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 34, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <Slider label="Referrals you bring" value={calc.perMonth} min={1} max={100} step={1} format={(v) => `${v}/mo`}
              onChange={(v) => setCalc((c) => ({ ...c, perMonth: v }))} />
            <Slider label="Share that fund" value={calc.fundRate} min={10} max={100} step={5} format={(v) => `${v}%`}
              onChange={(v) => setCalc((c) => ({ ...c, fundRate: v }))} />
            <Slider label="Their monthly volume" value={calc.volume} min={100} max={10000} step={100} format={(v) => money(v, 0)}
              onChange={(v) => setCalc((c) => ({ ...c, volume: v }))} />
          </div>
          <div style={{ background: "var(--surface-deep)", borderRadius: 22, padding: 28, textAlign: "center" }}>
            <p className="label" style={{ margin: 0 }}>Projected monthly</p>
            <p className="mono" style={{ fontSize: 46, letterSpacing: "-.03em", margin: "12px 0 0", color: "var(--lime)" }}>{money(monthly, 0)}</p>
            <p style={{ fontSize: 13.5, color: "var(--muted-2)", margin: "10px 0 0", lineHeight: 1.6 }}>
              ≈ {money(monthly * 12, 0)} over a year at {tier.name} rates
              {next ? ` — ${next.name} pays better` : " — already top tier"}.
            </p>
          </div>
        </div>
      </section>

      {/* the ladder */}
      <section style={{ marginTop: 46 }}>
        <h2 className="label" style={{ letterSpacing: ".1em", margin: 0 }}>The ladder</h2>
        <div className="grid-auto" style={{ marginTop: 18 }}>
          {TIERS.map((t) => {
            const on = t.id === tier.id;
            return (
              <div key={t.id} className="panel-sm" style={{ background: on ? "linear-gradient(180deg, rgba(198,242,78,.09), rgba(198,242,78,.02))" : "var(--surface)", border: `1px solid ${on ? "rgba(198,242,78,.42)" : "var(--hair)"}`, borderRadius: 24, padding: 26 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <p className="label" style={{ margin: 0, color: on ? "var(--lime)" : undefined }}>{t.name}</p>
                  {on && <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--lime)", background: "rgba(198,242,78,.16)", padding: "4px 10px", borderRadius: 999 }}>you</span>}
                </div>
                <p style={{ fontSize: 13, color: "var(--muted-2)", margin: "8px 0 0" }}>
                  {t.fundedNeeded === 0 ? "from your first share" : `${t.fundedNeeded}+ funded referrals`}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16, fontSize: 14 }}>
                  <Row k="Signup bonus" v={money(REFERRAL_REWARD_USD, 0)} />
                  <Row k="Fee share" v={`${Math.round(t.feeShare * 100)}%`} />
                  <Row k="Tier bonus" v={t.bonus > 0 ? money(t.bonus, 0) : "—"} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* referral list */}
      <section style={{ marginTop: 46 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <h2 className="label" style={{ letterSpacing: ".1em", margin: 0 }}>Your recruits</h2>
          {state.referrals.length === 0 && (
            <button type="button" className="btn-quiet" style={{ padding: 0, fontSize: 12.5 }}
              onClick={() => seedReferrals(DEMO_REFERRALS)}>
              demo: load sample referrals to see the machine run
            </button>
          )}
        </div>
        {state.referrals.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 18 }}>
            {state.referrals.map((r, i) => {
              const commission = (r.volumeUsd ?? 0) * FEE_BPS * tier.feeShare;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 4px", borderBottom: "1px solid var(--hair-soft)", flexWrap: "wrap" }}>
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: r.funded ? "var(--green)" : "var(--muted-4)", flex: "none" }} />
                  <span style={{ fontSize: 15, fontWeight: 600 }}>@{r.handle}</span>
                  <span style={{ fontSize: 13, color: "var(--muted-3)" }}>{r.joinedAt}</span>
                  <span style={{ fontSize: 13, color: "var(--muted-3)" }}>
                    {r.funded ? `funded · ${money(r.volumeUsd ?? 0, 0)} traded` : "signed up, not funded"}
                  </span>
                  <span className="mono" style={{ marginLeft: "auto", fontSize: 14, color: r.funded ? "var(--green)" : "var(--muted-4)" }}>
                    {r.funded ? `+${money(r.rewardUsd + commission)}` : "pending"}
                  </span>
                </div>
              );
            })}
            <p style={{ fontSize: 12.5, color: "var(--muted-4)", margin: "14px 0 0", lineHeight: 1.6 }}>
              Earnings per recruit = {money(REFERRAL_REWARD_USD, 0)} signup bonus + {Math.round(tier.feeShare * 100)}% of the 1% fee on their volume.
            </p>
          </div>
        ) : (
          <div className="empty" style={{ marginTop: 18 }}>
            <p className="serif" style={{ fontSize: 28, margin: 0 }}>{MEME_EMPTY.referrals.serif}</p>
            <p style={{ color: "var(--muted-2)", fontSize: 15, margin: "12px auto 0", maxWidth: 400, lineHeight: 1.6 }}>
              {MEME_EMPTY.referrals.sub}
            </p>
          </div>
        )}
      </section>

      {/* terms */}
      <div className="panel" style={{ marginTop: 40, maxWidth: 820 }}>
        <p className="eyebrow" style={{ margin: 0 }}>How it works</p>
        <ol style={{ color: "var(--muted)", fontSize: 15, margin: "14px 0 0", paddingLeft: 20, lineHeight: 1.9 }}>
          <li>Share your link — it carries your code and credits you for every signup.</li>
          <li>They fund their account — {money(REFERRAL_REWARD_USD, 0)} lands for each of you, on the spot.</li>
          <li>They trade — you keep earning your fee share on their volume for 12 months.</li>
          <li>Hit tier thresholds — the one-time bonus credits automatically.</li>
        </ol>
        <p style={{ color: "var(--muted-4)", fontSize: 13, margin: "16px 0 0", lineHeight: 1.6 }}>
          Rewards credit to your balance on Add funds. Self-referrals and unfunded signups don&apos;t earn.
          This is a demo build: referral tracking and rewards are simulated on-device — the live
          program pays the same shape of numbers from real fee revenue.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, note, big, accent }: { label: string; value: string; note: string; big?: boolean; accent?: boolean }) {
  return (
    <div className="panel">
      <p className="label" style={{ margin: 0 }}>{label}</p>
      <p className="mono" style={{ fontSize: big ? 44 : 32, letterSpacing: "-.03em", margin: "12px 0 0", color: accent ? "var(--lime)" : "var(--text)" }}>{value}</p>
      <p style={{ fontSize: 12.5, color: "var(--muted-4)", margin: "8px 0 0" }}>{note}</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <span style={{ color: "var(--muted-2)" }}>{k}</span>
      <span className="mono" style={{ marginLeft: "auto", fontWeight: 600 }}>{v}</span>
    </div>
  );
}

function Slider({ label, value, min, max, step, format, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "flex", alignItems: "baseline", fontSize: 14, color: "var(--muted)" }}>
        {label}
        <span className="mono" style={{ marginLeft: "auto", color: "var(--text)", fontWeight: 600 }}>{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", marginTop: 8, accentColor: "var(--lime)", cursor: "pointer" }} />
    </label>
  );
}
