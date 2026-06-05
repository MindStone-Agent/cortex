"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Brand } from "../lib/theme";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/services", label: "Services" },
];

export function Header({ hostname, brand }: { hostname: string; brand: Brand }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-50 w-full border-b border-ink-800 bg-ink-950/85 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between gap-6">
        <div className="flex items-center gap-4 min-w-0">
          <Image
            src={brand.logo}
            alt={brand.name}
            width={36}
            height={36}
            priority
            className="rounded shrink-0"
          />
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
        <Image
          src="/logos/nvidia-horz-white.svg"
          alt="NVIDIA"
          width={84}
          height={20}
          className="shrink-0"
        />
      </div>
    </header>
  );
}
