/**
 * The personality layer. blip is a memecoin terminal, so the voice lives here
 * in one place and gets placed deliberately — a marquee, toasts, empty states
 * — instead of being sprinkled over market copy where it would erode trust in
 * the numbers. Text only: no emoji next to market data.
 */

/** Marquee lines. Mixed with live-ish energy but never fake prices. */
export const MEME_TICKER: string[] = [
  "gm — the feed is live",
  "the curve decides, not the hype",
  "not financial advice, just a chart",
  "rug checks run before you even see it",
  "an exit plan beats diamond hands",
  "buy the dip, not the dubiously audited",
  "one honest number before you press buy",
  "manage size like it's casino money",
  "the per-trade cap is the adult in the room",
  "gm to everyone who checked the safety score",
  "sell pressure is just someone else's exit",
  "check the liquidity before the chart",
];

/** Toast lines for a fill. One is picked so repeats don't feel stamped out. */
export function buyToast(symbol: string, amount: string): string {
  const lines = [
    `Bought ${amount} of ${symbol}`,
    `${symbol} secured`,
    `In on ${symbol} — ${amount} deployed`,
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

export function sellToast(symbol: string, diff: number): string {
  const sign = diff >= 0 ? "+" : "−";
  return `Sold ${symbol} · ${sign}${"$" + Math.abs(diff).toFixed(2)}`;
}

export function tpToast(symbol: string): string {
  return `Take-profit 2× hit — auto-sold ${symbol}`;
}

/** Empty-state lines, keyed by screen so each gets one wink, not three. */
export const MEME_EMPTY: Record<string, { serif: string; sub: string }> = {
  portfolio: {
    serif: "Nothing here yet.",
    sub: "Paper hands optional. Your first position is one tap from the discover list.",
  },
  activity: {
    serif: "No activity yet.",
    sub: "Deposits, buys and exits land here the moment they settle. History starts with a fill.",
  },
  referrals: {
    serif: "No recruits yet.",
    sub: "Your link is the product. Send it — funded signups pay you on the spot.",
  },
};

/** Terminal `meme` command output. */
export const TERMINAL_MEMES: string[] = [
  "wen moon — the curve does not take appointments",
  "a safety score a day keeps the ruggedness away",
  "you are the exit liquidity until the safety score says otherwise",
  "buy in dollars, panic in every language",
  "the cap is not a suggestion, it is the adult in the room",
  "green candles are just the chain smiling at you",
  "gm. check the score. then gm harder.",
];
export function randomMeme(): string {
  return TERMINAL_MEMES[Math.floor(Math.random() * TERMINAL_MEMES.length)];
}
