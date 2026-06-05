import type { Metadata } from "next";
import os from "node:os";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "./components/Header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cortex — MindStone Command Center",
  description: "Command center for MindStone Agent running on DGX Spark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const hostname = os.hostname();
  return (
    <html
      lang="en"
      className={geistSans.variable + " " + geistMono.variable + " h-full antialiased"}
    >
      <body className="min-h-full flex flex-col font-sans">
        <Header hostname={hostname} />
        <main className="flex-1 w-full">{children}</main>
        <footer className="mt-auto border-t border-ink-800 bg-ink-950/60 backdrop-blur-sm">
          <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between text-xs text-ink-400">
            <span className="font-mono">cortex v0.1 · the MindStone command center</span>
            <span className="font-mono">running on NVIDIA DGX Spark</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
