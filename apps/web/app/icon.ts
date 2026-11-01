import { brand } from "@/lib/brand";

// Generated rather than a static icon.svg so each brand gets its own mark.
export const contentType = "image/svg+xml";

export default function Icon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#08080A"/>
  <circle cx="32" cy="32" r="21" fill="${brand.accent}"/>
  <text x="32" y="44" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="800" text-anchor="middle" fill="${brand.accentInk}">${brand.name.charAt(0)}</text>
</svg>`;
  return new Response(svg, { headers: { "Content-Type": contentType } });
}
