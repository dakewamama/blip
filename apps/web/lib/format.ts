export function money(n: number, dp = 2): string {
  if (!Number.isFinite(n)) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** Compact dollars for market caps and liquidity. */
export function compactUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(2);
}

/** Memecoin prices span many orders of magnitude; fixed decimals lose them. */
export function priceLabel(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "—";
  if (p < 1e-6) return "$" + p.toExponential(2);
  if (p < 0.001) return "$" + p.toFixed(8);
  if (p < 1) return "$" + p.toFixed(5);
  return "$" + p.toFixed(3);
}

export function tokenAmount(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function percent(fraction: number, dp = 2): string {
  if (!Number.isFinite(fraction)) return "—";
  return (fraction * 100).toFixed(dp) + "%";
}

export function signedMoney(n: number): string {
  return (n >= 0 ? "+" : "\u2212") + money(Math.abs(n));
}

export function sol(n: number, dp = 4): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(dp) + " SOL";
}

/**
 * Turns a series of real closes into an SVG polyline.
 * The seeded random-walk generator that used to live here was removed — it
 * drew a chart that looked like history but was invented.
 */
export function polyline(values: number[], w: number, h: number, pad = 4): string {
  if (values.length === 0) return "";
  if (values.length === 1) return `0,${h / 2} ${w},${h / 2}`;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || Math.abs(max) || 1;

  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** Percentage change across a series, or null when there isn't enough data. */
export function changeOver(values: number[]): number | null {
  if (values.length < 2) return null;
  const first = values[0];
  const last = values[values.length - 1];
  if (!first) return null;
  return (last - first) / first;
}
