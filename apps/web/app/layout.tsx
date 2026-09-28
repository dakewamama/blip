import type { Metadata, Viewport } from "next";
import { Manrope, Instrument_Serif, DM_Mono } from "next/font/google";
import { BlipProvider } from "@/lib/store";
import Toast from "@/components/Toast";
import "./globals.css";

const sans = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-sans" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: "italic", variable: "--font-serif" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "blip \u2014 buy memecoins in three taps",
  description:
    "blip reads the chain for you and gives you one honest number before you press buy. Non-custodial, 60-second setup.",
};

export const viewport: Viewport = {
  themeColor: "#08080A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body>
        <BlipProvider>
          {children}
          <Toast />
        </BlipProvider>
      </body>
    </html>
  );
}
