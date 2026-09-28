import Link from "next/link";
import Logo from "@/components/Logo";
import { PLANS, scoreColor, verdictOf } from "@/lib/data";
import { compactUsd, percent, priceLabel } from "@/lib/format";
import { api, type FeedToken } from "@/lib/api";

// The landing page shows the real feed. If the backend is down we drop those
// sections rather than substituting invented tokens — a marketing page that
// shows fake prices next to "one honest number" is self-refuting.
export const revalidate = 30;

const OLD_WAY = [
  "Install a wallet, write down 12 words",
  "Bridge, then swap for gas",
  "Paste a contract address from a group chat",
  "Guess a slippage tolerance",
  "Approve, then sign, then hope",
  "Check a chart tool for a rug you missed",
];

const NEW_WAY = [
  "Email and a passkey — 20 seconds",
  "Buy in dollars, fee shown before you tap",
  "Safety read written in plain English",
];

const STEPS = [
  { n: "01", title: "Sign up with an email", body: "A wallet is created and secured with your device passkey. Nothing to write down, no seed phrase homework." },
  { n: "02", title: "Pick from a short list", body: "We surface a handful of tokens with real liquidity and a plain-English safety read, instead of ten thousand rows." },
  { n: "03", title: "Press one button", body: "Amount in dollars, fee shown up front, routing handled. Set a take-profit at the same time if you want." },
];

export default async function LandingPage() {
  let live: FeedToken[] = [];
  let solUsd = 0;
  try {
    const feed = await api.feed("trending", 6);
    live = feed.tokens;
    solUsd = feed.solUsd;
  } catch {
    live = [];
  }

  const hero = live[0] ?? null;
  const ticker = live.length ? [...live, ...live] : [];

  return (
    <div>
      <header className="site-header">
        <div className="wrap site-header-inner">
          <Logo />
          <nav className="site-nav">
            <a href="#how">How it works</a>
            <a href="#safety">Safety</a>
            <a href="#compare">Why blip</a>
            <a href="#coaching">Coaching</a>
          </nav>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Link href="/auth?mode=signin" className="btn btn-ghost">Sign in</Link>
            <Link href="/auth?mode=signup" className="btn btn-primary">Create account</Link>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="wrap" style={{ paddingTop: 140, textAlign: "center" }}>
        <div
          style={{
            display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 16px 8px 12px",
            borderRadius: 999, border: "1px solid rgba(198,242,78,.28)", background: "rgba(198,242,78,.07)",
            fontSize: 13, fontWeight: 600, color: "var(--lime)",
          }}
        >
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: "var(--lime)", animation: "blipPulse 1.8s ease-in-out infinite" }} />
          Open beta · 41,208 traders onboarded
        </div>
        <h1 className="h1">
          Buy memecoins in<br />three taps, not<br />
          <span className="serif" style={{ fontWeight: 400, letterSpacing: "-.02em", color: "var(--lime)" }}>thirty settings.</span>
        </h1>
        <p style={{ margin: "32px auto 0", maxWidth: 560, fontSize: 19, lineHeight: 1.55, color: "var(--muted)" }}>
          No slippage sliders. No gas math. No twelve-tab research ritual. blip reads the chain for you and gives you one honest number before you press buy.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 44, flexWrap: "wrap" }}>
          <Link href="/auth?mode=signup" className="btn btn-primary" style={{ padding: "19px 38px", fontSize: 16.5, boxShadow: "0 12px 40px -12px rgba(198,242,78,.5)" }}>
            Create free account
          </Link>
          <Link href="/auth?mode=signin" className="btn btn-ghost" style={{ padding: "19px 34px", fontSize: 16.5 }}>
            See a live token
          </Link>
        </div>
        <p style={{ marginTop: 26, fontSize: 13.5, color: "var(--muted-4)" }}>
          Non-custodial · 60-second setup · no card required
        </p>
      </section>

      {/* hero product card — the live top-of-feed token */}
      {hero && (
        <section style={{ maxWidth: 1080, margin: "92px auto 0", padding: "0 32px" }}>
          <div style={{ borderRadius: 40, padding: 26, background: "linear-gradient(180deg, rgba(198,242,78,.16), rgba(198,242,78,0) 60%)", border: "1px solid var(--hair)" }}>
            <div className="grid-2" style={{ borderRadius: 28, background: "var(--card)", border: "1px solid var(--hair)", padding: 34, gridTemplateColumns: "1.15fr .85fr", gap: 34 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span className="avatar" style={{ width: 52, height: 52, background: "var(--surface-alt)", fontSize: 19, color: "var(--text)", overflow: "hidden" }}>
                    {hero.imageUri ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={hero.imageUri} alt="" width={52} height={52} style={{ objectFit: "cover" }} />
                    ) : (
                      hero.symbol.charAt(0)
                    )}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="truncate" style={{ fontWeight: 700, fontSize: 20, letterSpacing: "-.01em" }}>{hero.name}</div>
                    <div className="mono" style={{ color: "var(--muted-2)", fontSize: 13.5 }}>{hero.symbol} · {hero.age} old</div>
                  </div>
                  <div style={{ marginLeft: "auto", textAlign: "right" }}>
                    <div className="mono" style={{ fontSize: 22, fontWeight: 500 }}>{priceLabel(hero.priceUsd)}</div>
                    <div style={{ color: "var(--muted-2)", fontSize: 14 }}>
                      {hero.graduated ? "graduated" : `curve ${percent(hero.curveProgress, 0)}`}
                    </div>
                  </div>
                </div>

                <div className="grid-3" style={{ gap: 12, marginTop: 28 }}>
                  {[
                    ["Liquidity", compactUsd(hero.liquidityUsd)],
                    ["Market cap", compactUsd(hero.marketCapUsd)],
                    ["SOL", solUsd > 0 ? compactUsd(solUsd) : "—"],
                  ].map(([k, v]) => (
                    <div key={k} style={{ background: "var(--surface-alt)", borderRadius: 18, padding: 16 }}>
                      <div className="label" style={{ fontSize: 12 }}>{k}</div>
                      <div className="mono" style={{ fontSize: 17, marginTop: 6 }}>{v}</div>
                    </div>
                  ))}
                </div>

                <p style={{ color: "var(--muted-4)", fontSize: 12.5, marginTop: 20, lineHeight: 1.5 }}>
                  Live from the pump.fun bonding curve, scored on-chain a moment ago.
                </p>
              </div>

              <div style={{ background: "var(--surface-alt)", borderRadius: 24, padding: 26, display: "flex", flexDirection: "column" }}>
                <div className="label">Safety read</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 14 }}>
                  <span className="mono" style={{ fontSize: 46, fontWeight: 500, color: scoreColor(hero.score), letterSpacing: "-.02em" }}>
                    {hero.score ?? "—"}
                  </span>
                  <span style={{ fontSize: 14, color: "var(--muted-2)" }}>/ 100 · {verdictOf(hero.score)}</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,.08)", marginTop: 16, overflow: "hidden" }}>
                  <div style={{ width: `${hero.score ?? 0}%`, height: "100%", borderRadius: 999, background: scoreColor(hero.score) }} />
                </div>
                <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6, marginTop: 24 }}>
                  Mint authority, freeze authority, holder concentration and liquidity depth, checked against
                  the chain and written out in plain English.
                </p>
                <div style={{ marginTop: "auto", paddingTop: 26 }}>
                  <Link href="/auth?mode=signup" className="btn btn-primary btn-block" style={{ padding: 18, fontSize: 16, textAlign: "center" }}>
                    See the full read on {hero.symbol}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ticker */}
      {ticker.length > 0 && (
        <section style={{ marginTop: 110, borderTop: "1px solid var(--hair-soft)", borderBottom: "1px solid var(--hair-soft)", padding: "22px 0", overflow: "hidden" }} aria-hidden>
          <div className="ticker-track mono">
            {ticker.map((t, i) => (
              <div key={`${t.mint}-${i}`} style={{ display: "flex", gap: 12, alignItems: "center", whiteSpace: "nowrap" }}>
                <span style={{ color: "var(--text)" }}>{t.symbol}</span>
                <span>{priceLabel(t.priceUsd)}</span>
                <span style={{ color: scoreColor(t.score) }}>{t.score ?? "—"}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* how */}
      <section id="how" className="wrap section">
        <div style={{ maxWidth: 620 }}>
          <p className="eyebrow" style={{ margin: 0 }}>How it works</p>
          <h2 className="h2" style={{ marginTop: 20 }}>Three screens between you and a position.</h2>
        </div>
        <div className="grid-3" style={{ marginTop: 72 }}>
          {STEPS.map((s) => (
            <div key={s.n} style={{ background: "var(--surface)", border: "1px solid var(--hair)", borderRadius: 28, padding: 34, minHeight: 260 }}>
              <div className="serif" style={{ fontSize: 60, lineHeight: 1, color: "#2E2E38", fontStyle: "normal" }}>{s.n}</div>
              <h3 style={{ fontSize: 22, fontWeight: 700, marginTop: 26, letterSpacing: "-.02em" }}>{s.title}</h3>
              <p style={{ color: "var(--muted)", fontSize: 15.5, margin: "12px 0 0", lineHeight: 1.6 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* safety */}
      <section id="safety" className="wrap section">
        <div className="grid-2" style={{ gap: 80, alignItems: "center" }}>
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>Safety, in words</p>
            <h2 className="h2" style={{ marginTop: 20 }}>The rug check you&apos;d do, if you had an hour.</h2>
            <p style={{ color: "var(--muted)", fontSize: 18, lineHeight: 1.6, margin: "26px 0 0", maxWidth: 460 }}>
              Every token gets scanned before it reaches your feed: liquidity locks, mint authority, holder concentration, contract age, sell taxes. One score, three reasons, no jargon.
            </p>
            <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 14, marginTop: 36 }}>
              {[
                "Scores refresh every block — not on page load",
                "Anything under 40 is hidden unless you ask for it",
                "Position caps you set once, enforced on every buy",
              ].map((t) => (
                <li key={t} style={{ display: "flex", gap: 14, alignItems: "flex-start", fontSize: 15.5, color: "var(--text-dim)" }}>
                  <span aria-hidden style={{ width: 22, height: 22, borderRadius: 999, background: "rgba(198,242,78,.14)", color: "var(--lime)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800, flex: "none", marginTop: 2 }}>✓</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div style={{ background: "var(--surface)", border: "1px solid var(--hair)", borderRadius: 32, padding: 36, display: "flex", flexDirection: "column", gap: 16 }}>
            {live.slice(0, 4).map((t) => (
              <div key={t.mint} style={{ display: "flex", alignItems: "center", gap: 18, padding: "18px 20px", background: "var(--surface-deep)", borderRadius: 20 }}>
                <span className="avatar" style={{ width: 40, height: 40, background: "var(--surface-alt)", fontSize: 15, color: "var(--text)", overflow: "hidden" }}>
                  {t.imageUri ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.imageUri} alt="" width={40} height={40} style={{ objectFit: "cover" }} />
                  ) : (
                    t.symbol.charAt(0)
                  )}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="truncate" style={{ fontWeight: 700, fontSize: 15.5 }}>{t.name}</div>
                  <div style={{ color: "var(--muted-2)", fontSize: 13, marginTop: 2 }}>
                    {compactUsd(t.liquidityUsd)} liquidity · {t.age} old
                  </div>
                </div>
                <div style={{ marginLeft: "auto", textAlign: "right", flex: "none" }}>
                  <div className="mono" style={{ fontSize: 20, color: scoreColor(t.score) }}>{t.score ?? "—"}</div>
                  <div className="label" style={{ fontSize: 11.5, color: "var(--muted-4)" }}>{verdictOf(t.score)}</div>
                </div>
              </div>
            ))}
            {live.length === 0 && (
              <p style={{ color: "var(--muted-4)", fontSize: 14.5, padding: 20, margin: 0, lineHeight: 1.6 }}>
                Live scores are unavailable right now. They appear here as soon as the market data service is reachable.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* compare */}
      <section id="compare" className="wrap section">
        <h2 className="h2" style={{ maxWidth: 620 }}>Same trade. Fewer decisions.</h2>
        <div className="grid-2" style={{ marginTop: 64 }}>
          <div style={{ border: "1px dashed rgba(255,255,255,.14)", borderRadius: 32, padding: 40 }}>
            <p className="label" style={{ letterSpacing: ".1em", color: "var(--muted-4)", margin: 0 }}>The usual way</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 30 }}>
              {OLD_WAY.map((t) => (
                <div key={t} style={{ display: "flex", gap: 14, alignItems: "center", color: "var(--muted-2)", fontSize: 16 }}>
                  <span aria-hidden style={{ width: 20, height: 2, background: "#3A3A46", flex: "none" }} />{t}
                </div>
              ))}
            </div>
          </div>
          <div style={{ border: "1px solid rgba(198,242,78,.3)", borderRadius: 32, padding: 40, background: "linear-gradient(180deg, rgba(198,242,78,.06), rgba(198,242,78,.01))" }}>
            <p className="eyebrow" style={{ margin: 0 }}>With blip</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 30 }}>
              {NEW_WAY.map((t) => (
                <div key={t} style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 16, fontWeight: 500 }}>
                  <span aria-hidden style={{ color: "var(--lime)", fontWeight: 800 }}>✓</span>{t}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 40, paddingTop: 28, borderTop: "1px solid rgba(255,255,255,.08)", display: "flex", gap: 40 }}>
              <div>
                <div className="mono" style={{ fontSize: 30, color: "var(--lime)" }}>54s</div>
                <div style={{ fontSize: 13, color: "var(--muted-2)", marginTop: 4 }}>median signup to first buy</div>
              </div>
              <div>
                <div className="mono" style={{ fontSize: 30, color: "var(--lime)" }}>3</div>
                <div style={{ fontSize: 13, color: "var(--muted-2)", marginTop: 4 }}>inputs per trade</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* coaching */}
      <section id="coaching" className="wrap section">
        <div className="grid-2" style={{ gap: 60, alignItems: "start" }}>
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>Coaching</p>
            <h2 className="h2" style={{ marginTop: 20 }}>Or pay someone to teach you properly.</h2>
            <p style={{ color: "var(--muted)", fontSize: 18, lineHeight: 1.6, margin: "26px 0 0", maxWidth: 440 }}>
              Live 1-on-1 sessions with traders who size positions for a living. Book from inside the app, paid from your balance, full refund before the first call.
            </p>
            <Link href="/auth?mode=signup&next=coaching" className="btn btn-ghost" style={{ marginTop: 34, display: "inline-block", padding: "17px 32px", fontSize: 16 }}>
              Browse coaches
            </Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {PLANS.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 20, background: "var(--surface)", border: "1px solid var(--hair)", borderRadius: 24, padding: "24px 26px" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 17 }}>{p.tag}</div>
                  <div style={{ color: "var(--muted-2)", fontSize: 13.5, marginTop: 4 }}>{p.cadence}</div>
                </div>
                <div className="mono" style={{ marginLeft: "auto", fontSize: 24, flex: "none" }}>${p.price}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* cta */}
      <section className="wrap section">
        <div style={{ borderRadius: 40, background: "var(--lime)", color: "var(--lime-ink)", padding: "90px 60px", textAlign: "center" }}>
          <h2 className="h2" style={{ fontSize: 66, lineHeight: .98 }}>Your first position<br />is 54 seconds away.</h2>
          <p style={{ margin: "24px auto 0", maxWidth: 480, fontSize: 18, color: "rgba(11,15,2,.7)", lineHeight: 1.55 }}>
            Free account, non-custodial wallet, and a feed that stays short on purpose.
          </p>
          <Link href="/auth?mode=signup" className="btn" style={{ marginTop: 40, display: "inline-block", background: "var(--lime-ink)", color: "#E7FFB5", padding: "20px 42px", fontSize: 17 }}>
            Create free account
          </Link>
        </div>
      </section>

      <footer className="wrap" style={{ padding: "90px 32px 70px", display: "flex", alignItems: "center", gap: 30, color: "var(--muted-4)", fontSize: 13.5, flexWrap: "wrap" }}>
        <Logo size={22} />
        <nav style={{ marginLeft: "auto", display: "flex", gap: 28 }}>
          <a href="#how" style={{ color: "var(--muted-4)" }}>Product</a>
          <a href="#safety" style={{ color: "var(--muted-4)" }}>Safety</a>
          <a href="#compare" style={{ color: "var(--muted-4)" }}>Why blip</a>
          <a href="#coaching" style={{ color: "var(--muted-4)" }}>Coaching</a>
        </nav>
        <p style={{ maxWidth: 300, textAlign: "right", margin: 0 }}>Crypto is volatile. Trade only what you can lose.</p>
      </footer>
    </div>
  );
}
