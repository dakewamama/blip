"use client";

import Link from "next/link";
import { useBlip } from "@/lib/store";
import { MEME_EMPTY } from "@/lib/memes";

export default function Activity() {
  const { state } = useBlip();

  return (
    <div>
      <h1 className="h3">Activity</h1>
      <p style={{ color: "var(--muted)", fontSize: 17, margin: "12px 0 0" }}>
        Every deposit, buy and exit, newest first.
      </p>

      {state.activity.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 34 }}>
          {state.activity.map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 4px", borderBottom: "1px solid var(--hair-soft)" }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: a.dot, flex: "none" }} />
              <span style={{ fontSize: 15, fontWeight: 600 }}>{a.title}</span>
              <span className="mono" style={{ marginLeft: "auto", fontSize: 14, color: "var(--muted)" }}>{a.amount}</span>
              <span className="mono" style={{ width: 90, textAlign: "right", fontSize: 13, color: "var(--muted-4)" }}>{a.time}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty" style={{ marginTop: 34 }}>
          <p className="serif" style={{ fontSize: 30, margin: 0 }}>{MEME_EMPTY.activity.serif}</p>
          <p style={{ color: "var(--muted-2)", fontSize: 15.5, margin: "12px auto 0", maxWidth: 380, lineHeight: 1.6 }}>
            {MEME_EMPTY.activity.sub}
          </p>
          <Link href="/app/discover" className="btn btn-primary" style={{ marginTop: 26, display: "inline-block", padding: "15px 30px", fontSize: 15 }}>
            Browse tokens
          </Link>
        </div>
      )}
    </div>
  );
}
