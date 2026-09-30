import { c } from "./theme";

/**
 * Token data now comes from the backend (see lib/api.ts). What remains here is
 * the coaching catalogue, which is product copy rather than market data, and
 * the presentation rules for a safety score.
 */

export type Coach = {
  id: string;
  name: string;
  mono: string;
  color: string;
  focus: string;
  rating: string;
  sessions: string;
};

export type Plan = {
  id: string;
  tag: string;
  price: number;
  cadence: string;
  popular?: boolean;
  cta: string;
  features: string[];
};

export const COACHES: Coach[] = [
  { id: "mara", name: "Mara Okafor", mono: "M", color: "#C6F24E", focus: "Risk sizing \u00b7 entries", rating: "Booking open", sessions: "weekend slots" },
  { id: "dev", name: "Devin Hale", mono: "D", color: "#7DD3FC", focus: "Exits & take-profit ladders", rating: "Booking open", sessions: "weekday evenings" },
  { id: "yuki", name: "Yuki Tanaka", mono: "Y", color: "#A78BFA", focus: "Contract reading for beginners", rating: "Waitlist", sessions: "opens next week" },
];

export const PLANS: Plan[] = [
  {
    id: "single", tag: "One session", price: 49, cadence: "one 45-minute call",
    cta: "Good for one question",
    features: ["Screen-share your first trade", "Walk through one token's safety read", "Written recap afterwards"],
  },
  {
    id: "pair", tag: "Starter", price: 129, cadence: "3 calls over 3 weeks", popular: true,
    cta: "Most people start here",
    features: ["Build a position-sizing rule that fits you", "Two live trades reviewed with you", "Direct chat between sessions"],
  },
  {
    id: "pro", tag: "Ongoing", price: 320, cadence: "weekly, billed monthly",
    cta: "For daily traders",
    features: ["Weekly 45-minute call", "Portfolio reviewed every Friday", "Same-day chat answers", "Pause any month"],
  },
];

export const FILTERS = ["trending", "new", "gainers", "safest"] as const;
export const FILTER_LABELS: Record<string, string> = {
  trending: "Trending",
  new: "New",
  gainers: "Gainers",
  safest: "Safest",
};

export const CAP_OPTIONS = [50, 100, 250, 1000];
export const FUND_OPTIONS = [100, 500, 1000];

/** Mirrors the backend's floor; shown in copy so the filter is not a surprise. */
export const SAFETY_FLOOR = 40;

export function scoreColor(score: number | null): string {
  if (score === null) return c.muted3;
  return score >= 75 ? c.green : score >= 55 ? c.amber : c.red;
}

export function verdictOf(score: number | null): string {
  if (score === null) return "Unscored";
  return score >= 75 ? "Clear" : score >= 55 ? "Watch" : "Risky";
}

export function checkColor(level: "ok" | "warn" | "bad"): string {
  return level === "ok" ? c.green : level === "warn" ? c.amber : c.red;
}

export function checkIcon(level: "ok" | "warn" | "bad"): string {
  return level === "ok" ? "\u2713" : level === "warn" ? "!" : "\u00d7";
}
