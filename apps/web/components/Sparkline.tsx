import { polyline } from "@/lib/format";

/** Renders real closes, or nothing at all — never a placeholder shape. */
export function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) {
    return <span className="spark" style={{ width: 96, flex: "0 1 96px" }} aria-hidden />;
  }
  return (
    <svg className="spark" viewBox="0 0 120 34" preserveAspectRatio="none" aria-hidden
      style={{ width: 96, height: 34, flex: "0 1 96px", minWidth: 0 }}>
      <polyline points={polyline(values, 120, 34)} fill="none" stroke={color}
        strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function AreaChart({
  values, color, height = 220, gradientId, label,
}: {
  values: number[]; color: string; height?: number; gradientId: string; label?: string;
}) {
  if (values.length < 2) {
    return (
      <div style={{
        height, marginTop: 28, display: "grid", placeItems: "center",
        background: "var(--surface-deep)", borderRadius: 20, color: "var(--muted-4)", fontSize: 14,
      }}>
        {label ?? "No price history available for this token yet"}
      </div>
    );
  }

  const line = polyline(values, 600, 200, 8);
  return (
    <svg viewBox="0 0 600 200" preserveAspectRatio="none" role="img"
      aria-label={label ?? "Price history"}
      style={{ width: "100%", height, marginTop: 28, display: "block" }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".26" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,200 ${line} 600,200`} fill={`url(#${gradientId})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={2.5}
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
