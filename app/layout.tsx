import type { Metadata } from "next";
import os from "node:os";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "./components/Header";
import { loadTheme, themeStyle } from "./lib/theme";
import "./globals.css";

// Render at runtime so theme.json edits (e.g. from Settings) apply without a rebuild.
export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const { brand } = loadTheme();
  return {
    title: `${brand.name} — ${brand.tagline}`,
    description: `${brand.name} — a command center for your local AI stack on NVIDIA GB10.`,
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const hostname = os.hostname();
  const theme = loadTheme();
  const style = themeStyle(theme);
  return (
    <html
      lang="en"
      className={geistSans.variable + " " + geistMono.variable + " h-full antialiased"}
    >
      <body className="min-h-full flex flex-col font-sans">
        {style ? <style dangerouslySetInnerHTML={{ __html: style }} /> : null}
        <Header hostname={hostname} brand={theme.brand} />
        <main className="flex-1 w-full">{children}</main>
        <footer className="mt-auto border-t border-ink-800 bg-ink-950/60 backdrop-blur-sm">
          <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between text-xs text-ink-400">
            <span className="font-mono">{theme.brand.name} · {theme.brand.tagline}</span>
            <span className="font-mono">running on NVIDIA GB10</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
