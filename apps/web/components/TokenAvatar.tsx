"use client";

import { useMemo, useState } from "react";

/**
 * Token art lives on arbitrary user uploads (IPFS gateways, Twitter CDN) that
 * are slow, rate-limited or dead. This avatar never shows a broken image:
 * the gradient + initial is painted underneath immediately, the real art
 * fades in over it only once it has actually decoded, and any load error
 * just keeps the fallback. Lazy + async so a 25-row feed doesn't block.
 */

function hueFrom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export default function TokenAvatar({
  src,
  symbol,
  mint,
  size = 46,
}: {
  src?: string;
  symbol: string;
  mint: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const hue = useMemo(() => hueFrom(mint || symbol || "blip"), [mint, symbol]);
  const letter = (symbol || "?").charAt(0).toUpperCase();
  const showImg = Boolean(src) && !failed;

  return (
    <span
      aria-hidden
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        position: "relative",
        overflow: "hidden",
        flex: "none",
        background: `linear-gradient(135deg, hsl(${hue} 65% 24%), hsl(${(hue + 45) % 360} 70% 14%))`,
        color: `hsl(${hue} 95% 80%)`,
      }}
    >
      <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontWeight: 800 }}>
        {letter}
      </span>
      {showImg && (
        // Remote token art is arbitrary user upload; plain img avoids
        // configuring next/image for every IPFS gateway in existence.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: loaded ? 1 : 0,
            transition: "opacity .25s ease",
          }}
        />
      )}
    </span>
  );
}
