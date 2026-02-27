"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavItem = {
  href: string;
  shortLabel: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", shortLabel: "Alta" },
  { href: "/review", shortLabel: "Review" },
  { href: "/results", shortLabel: "Resultados" },
];

const isItemActive = (pathname: string, href: string) => {
  if (href === pathname) return true;
  if (href !== "/" && pathname.startsWith(`${href}/`)) return true;
  return false;
};

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <div className="pb-20">{children}</div>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 px-2 py-2 backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-3 gap-2">
          {NAV_ITEMS.map((item) => {
            const active = isItemActive(pathname, item.href);
            return (
              <Link
                key={`mobile-${item.href}-${item.shortLabel}`}
                href={item.href}
                className={`rounded-xl px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide ${
                  active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {item.shortLabel}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
