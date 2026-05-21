import type { Metadata } from "next";
import { Geist, Geist_Mono, Lora } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Editorial serif for headings — pairs with Geist for body. Lora has
// good weight range and reads well at title sizes.
const lora = Lora({
  variable: "--font-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WikiCompass — AI learning maps from Wikipedia",
  description:
    "Turn any Wikipedia topic into a structured learning map: prerequisites, core concepts, advanced topics, and a recommended learning path.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${lora.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* Speed Insights: Core Web Vitals (LCP / FID / CLS / TTFB)
            for performance regressions. Analytics: page views + traffic
            volume for usage patterns. Both no-op outside production
            and ship as separate tabs in the Vercel dashboard. */}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
