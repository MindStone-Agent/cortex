"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { Brand } from "../lib/theme";
import { SettingsPanel } from "./SettingsPanel";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/services", label: "Services" },
];

export function Header({ hostname, brand }: { hostname: string; brand: Brand }) {
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Drive the NVIDIA logo from client state so the toggle hides it instantly;
  // the server prop (brand) seeds it and persistence is handled in the panel.
  const [showNvidiaLogo, setShowNvidiaLogo] = useState(brand.showNvidiaLogo);
  return (
    <header className="sticky top-0 z-50 w-full border-b border-ink-800 bg-ink-950/85 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between gap-6">
        <div className="flex items-center gap-4 min-w-0">
          {brand.logo && (
            <Image
              src={brand.logo}
              alt={brand.name}
              width={36}
              height={36}
              priority
              className="rounded shrink-0"
            />
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-ink-100 truncate">
              {brand.name}
              <span className="ml-2 text-ink-400 font-normal text-sm">
                · {brand.tagline}
              </span>
            </h1>
            <p className="text-xs text-ink-400 font-mono mt-0.5 truncate">
              {hostname} · NVIDIA DGX Spark · GB10
            </p>
          </div>
        </div>
        <nav className="hidden md:flex items-center gap-1 shrink-0">
          {navItems.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  "px-3 py-1.5 text-sm rounded-md transition-colors " +
                  (active
                    ? "text-gold-500 bg-gold-500/10 ring-1 ring-gold-500/30"
                    : "text-ink-300 hover:text-ink-100 hover:bg-ink-800/60")
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            title="Settings"
            className="p-1.5 rounded-md text-ink-400 hover:text-ink-100 hover:bg-ink-800/60 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          {showNvidiaLogo && (
            <Image
              src="/logos/nvidia-horz-white.svg"
              alt="NVIDIA"
              width={84}
              height={20}
              className="shrink-0"
            />
          )}
        </div>
      </div>
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        showNvidiaLogo={showNvidiaLogo}
        onShowNvidiaLogoChange={setShowNvidiaLogo}
      />
    </header>
  );
}
