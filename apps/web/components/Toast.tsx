"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBlip } from "@/lib/store";

export default function Toast() {
  const { toast, state } = useBlip();
  const pathname = usePathname();
  if (!toast) return null;

  const inApp = pathname.startsWith("/app");
  const target = state.activePlan && state.holdings.length === 0 ? "/app/coaching" : "/app/portfolio";

  return (
    <div className="toast" role="status" aria-live="polite">
      <span
        aria-hidden
        style={{
          width: 24, height: 24, borderRadius: 999, background: "var(--lime)",
          color: "var(--lime-ink)", display: "grid", placeItems: "center",
          fontWeight: 800, fontSize: 13, flex: "none",
        }}
      >
        ✓
      </span>
      <span style={{ fontSize: 15, fontWeight: 600 }}>{toast}</span>
      {inApp && (
        <Link href={target} style={{ fontSize: 14.5, fontWeight: 700, flex: "none" }}>
          View
        </Link>
      )}
    </div>
  );
}
