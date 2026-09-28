"use client";

import { MEME_TICKER } from "@/lib/memes";

/**
 * The one place the meme energy is allowed to be loud: a slow, silent marquee
 * above the app. aria-hidden and decorative — no data, no links, nothing to
 * misread as market information.
 */
export default function MemeTicker() {
  const line = (key: string) => (
    <span key={key} className="mono" style={{ display: "flex", gap: 56, whiteSpace: "nowrap" }}>
      {MEME_TICKER.map((m, i) => (
        <span key={i} style={{ color: i % 3 === 0 ? "var(--lime)" : "var(--muted-4)", fontSize: 13 }}>
          {m}
        </span>
      ))}
    </span>
  );

  return (
    <div
      aria-hidden
      style={{
        overflow: "hidden",
        borderBottom: "1px solid var(--hair-soft)",
        padding: "9px 0",
        marginBottom: 24,
        // Pause on hover so a line can actually be read.
        maskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget.querySelector(".ticker-track") as HTMLElement | null)?.style.setProperty("animation-play-state", "paused");
      }}
      onMouseLeave={(e) => {
        (e.currentTarget.querySelector(".ticker-track") as HTMLElement | null)?.style.setProperty("animation-play-state", "running");
      }}
    >
      <div className="ticker-track" style={{ animationDuration: "60s" }}>
        {line("a")}
        {line("b")}
      </div>
    </div>
  );
}
