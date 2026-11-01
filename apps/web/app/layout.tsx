import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { Manrope, Instrument_Serif, DM_Mono } from "next/font/google";
import { BlipProvider } from "@/lib/store";
import { CustodyProvider } from "@/lib/custody";
import { brand } from "@/lib/brand";
import Toast from "@/components/Toast";
import "./globals.css";

const sans = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-sans" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: "italic", variable: "--font-serif" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  // Pages set a bare title ("coaching") and the template brands it.
  title: { default: `${brand.name} \u2014 ${brand.tagline}`, template: `${brand.name} \u2014 %s` },
  description: brand.description,
};

export const viewport: Viewport = {
  themeColor: brand.themeColor,
  width: "device-width",
  initialScale: 1,
};

// Set on <html> so the accent is in place on the first paint; globals.css
// derives the hover shade and tints from --lime.
const brandVars = {
  "--lime": brand.accent,
  "--lime-ink": brand.accentInk,
  "--lime-soft": brand.accentSoft,
} as CSSProperties;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`} style={brandVars}>
      <body>
        <CustodyProvider>
          <BlipProvider>
            {children}
            <Toast />
          </BlipProvider>
        </CustodyProvider>
      </body>
    </html>
  );
}
