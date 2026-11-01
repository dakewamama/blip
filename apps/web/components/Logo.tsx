import Link from "next/link";
import { brand } from "@/lib/brand";

export default function Logo({ href = "/", size = 30 }: { href?: string; size?: number }) {
  return (
    <Link href={href} aria-label={`${brand.name} — home`} style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text)" }}>
      <span
        aria-hidden
        style={{
          width: size, height: size, borderRadius: 999, background: "var(--lime)",
          display: "grid", placeItems: "center", color: "var(--lime-ink)",
          fontWeight: 800, fontSize: size * 0.52, lineHeight: 1, paddingBottom: 1,
        }}
      >
        {brand.name.charAt(0)}
      </span>
      <span style={{ fontWeight: 800, fontSize: size * 0.63, letterSpacing: "-.02em" }}>{brand.name}</span>
    </Link>
  );
}
