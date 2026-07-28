import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { listSwitcherInstruments } from "@/lib/analysis/portfolio";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "t212-analyse",
  description: "Trading 212 portfolio analysis",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const instruments = (() => {
    try {
      return listSwitcherInstruments();
    } catch {
      return [];
    }
  })();

  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-page font-sans text-ink">
        <Header instruments={instruments} />
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
