"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import Logo from "@/components/Logo";
import MemeTicker from "@/components/MemeTicker";
import SupportChat from "@/components/SupportChat";
import SearchBar from "@/components/SearchBar";
import TopUpChip from "@/components/TopUpChip";
import { useBlip } from "@/lib/store";

const NAV = [
  { href: "/app/discover", label: "Discover" },
  { href: "/app/terminal", label: "Terminal" },
  { href: "/app/portfolio", label: "Portfolio" },
  { href: "/app/deposit", label: "Add funds" },
  { href: "/app/referrals", label: "Referrals" },
  { href: "/app/activity", label: "Activity" },
  { href: "/app/coaching", label: "Coaching" },
  { href: "/app/support", label: "Support" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { state, ready } = useBlip();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && !state.authed) router.replace("/auth?mode=signup");
  }, [ready, state.authed, router]);

  // Avoid flashing an empty wallet before localStorage has been read.
  if (!ready || !state.authed) return <div style={{ minHeight: "100vh" }} />;

  const handle = state.handle ? "@" + state.handle : "@you";

  return (
    <div className="app-shell">
      <aside className="app-aside">
        <Logo size={28} />
        <nav className="app-nav">
          {NAV.map((item) => {
            const active =
              pathname === item.href ||
              (item.href === "/app/discover" && pathname.startsWith("/app/token")) ||
              (item.href === "/app/deposit" && pathname.startsWith("/app/wallet"));
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>
                <span className="dot" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hide-mobile" style={{ marginTop: "auto", background: "var(--surface)", border: "1px solid var(--hair)", borderRadius: 22, padding: 20 }}>
          <p className="label" style={{ margin: 0, fontSize: 12 }}>Per-trade cap</p>
          <p className="mono" style={{ fontSize: 24, margin: "8px 0 0" }}>${state.cap}</p>
          <p style={{ fontSize: 12.5, color: "var(--muted-4)", margin: "6px 0 0", lineHeight: 1.5 }}>Enforced on every buy.</p>
        </div>

        <Link
          href="/app/deposit"
          title="Your wallet — manage balance"
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 8px", color: "var(--text)", borderRadius: 14 }}
        >
          <span className="avatar" style={{ width: 34, height: 34, background: "var(--violet, #A78BFA)", color: "#16091F", fontSize: 14 }}>
            {(state.handle || "y").charAt(0).toUpperCase()}
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="truncate" style={{ fontSize: 14, fontWeight: 700 }}>{handle}</div>
            <div className="mono" style={{ fontSize: 12, color: "var(--muted-4)" }}>7xQd…4Kp2</div>
          </div>
        </Link>
      </aside>

      <main className="app-main">
        <MemeTicker />
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 44, flexWrap: "wrap" }}>
          <SearchBar />
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
            <TopUpChip />
            <button type="button" onClick={() => router.push("/app/deposit")} className="btn btn-primary" style={{ padding: "13px 24px", fontSize: 14.5 }}>
              Deposit
            </button>
          </div>
        </div>
        {children}
      </main>

      <SupportChat />
    </div>
  );
}
