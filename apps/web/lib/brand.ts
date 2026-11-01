/**
 * One codebase, several brands. Each Next instance is built with
 * NEXT_PUBLIC_BRAND set to one of these ids. Everything that differs between
 * brands lives here, so renaming or recolouring one is a single edit.
 */

export type BrandId = "blip" | "flick" | "kite";

export interface Brand {
  id: BrandId;
  name: string;
  tagline: string;
  description: string;
  /** Primary accent. Becomes --lime; globals.css derives the hover shade and tints from it. */
  accent: string;
  /** Text colour on top of the accent (--lime-ink). */
  accentInk: string;
  /** Low-alpha tint of the accent, the fill behind accent-coloured badges (--lime-soft). */
  accentSoft: string;
  /** Browser chrome colour. Matches --bg so mobile toolbars blend into the page. */
  themeColor: string;
  /** Human support channels. Leave one out rather than guess it — unset channels are not shown. */
  support: { email?: string; telegram?: string; x?: string };
}

export const BRANDS: Record<BrandId, Brand> = {
  blip: {
    id: "blip",
    name: "blip",
    tagline: "buy memecoins in three taps",
    description:
      "blip reads the chain for you and gives you one honest number before you press buy. Custodial wallet, 60-second setup.",
    accent: "#C6F24E",
    accentInk: "#0B0F02",
    accentSoft: "rgba(198,242,78,.14)",
    themeColor: "#08080A",
    support: { email: "support@blip.trade", telegram: "blipsupport", x: "blipdottrade" },
  },
  flick: {
    id: "flick",
    name: "flick",
    tagline: "buy memecoins without the busywork",
    description:
      "flick reads the chain for you and gives you one honest number before you press buy. Custodial wallet, 60-second setup.",
    accent: "#FF8456",
    accentInk: "#1E0B03",
    // Coral and sky are darker than lime, so their tints need a little more alpha to read the same.
    accentSoft: "rgba(255,132,86,.16)",
    themeColor: "#08080A",
    support: {},
  },
  kite: {
    id: "kite",
    name: "kite",
    tagline: "memecoins with the safety read up front",
    description:
      "kite reads the chain for you and gives you one honest number before you press buy. Custodial wallet, 60-second setup.",
    accent: "#5BB8FF",
    accentInk: "#02111E",
    accentSoft: "rgba(91,184,255,.16)",
    themeColor: "#08080A",
    support: {},
  },
};

function isBrandId(value: string | undefined): value is BrandId {
  return value !== undefined && Object.hasOwn(BRANDS, value);
}

// Must stay a literal `process.env.NEXT_PUBLIC_BRAND`: Next inlines it at build
// time, and a computed lookup would be undefined in the browser bundle.
const requested = process.env.NEXT_PUBLIC_BRAND?.trim().toLowerCase();

if (requested && !isBrandId(requested) && typeof window === "undefined") {
  console.warn(`[brand] unknown NEXT_PUBLIC_BRAND "${requested}", falling back to "blip"`);
}

export const brand: Brand = isBrandId(requested) ? BRANDS[requested] : BRANDS.blip;
