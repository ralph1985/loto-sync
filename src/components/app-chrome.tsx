"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { clearSessionCache, loadSessionClient, type ClientSession } from "@/lib/session-client";

type NavItem = {
  href: string;
  shortLabel: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/review", shortLabel: "Panel" },
  { href: "/create", shortLabel: "Alta" },
  { href: "/results", shortLabel: "Resultados" },
];

const isItemActive = (pathname: string, href: string) => {
  if (pathname === "/" && href === "/review") return true;
  if (href === pathname) return true;
  if (pathname.startsWith(`${href}/`)) return true;
  return false;
};

export function AppChrome({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<ClientSession | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const canCreateTickets =
    session?.memberships?.some((membership) => membership.role === "OWNER") ?? false;
  const visibleNavItems = NAV_ITEMS.filter(
    (item) => item.href !== "/create" || canCreateTickets
  );

  useEffect(() => {
    if (pathname === "/login") return;
    let isActive = true;
    (async () => {
      try {
        const nextSession = await loadSessionClient();
        if (!isActive) return;
        setSession(nextSession);
      } catch {
        if (!isActive) return;
        setUserError("No se pudo inicializar la sesión.");
      }
    })();

    return () => {
      isActive = false;
    };
  }, [pathname]);

  if (pathname === "/login") {
    return <div className="min-h-screen">{children}</div>;
  }

  return (
    <div className="min-h-screen">
      <button
        type="button"
        onClick={() => setPanelOpen((current) => !current)}
        className="fixed left-4 top-4 z-[100] rounded-full border border-slate-300 bg-white/90 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 shadow-[0_10px_30px_rgba(15,23,42,0.25)] backdrop-blur transition hover:border-slate-500"
      >
        {session ? session.name : "Usuario"}
      </button>

      {panelOpen ? (
        <div className="fixed left-4 top-16 z-[100] w-[min(320px,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_20px_50px_rgba(15,23,42,0.25)]">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Sesión activa
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {session?.name ?? "Sin sesión"}
          </p>

          <button
            type="button"
            onClick={async () => {
              await fetch("/api/auth/session", { method: "DELETE" });
              clearSessionCache();
              setPanelOpen(false);
              router.replace("/login");
              router.refresh();
            }}
            className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
          >
            Cerrar sesión
          </button>

          {userError ? (
            <p className="mt-2 text-xs text-rose-600">{userError}</p>
          ) : null}
        </div>
      ) : null}

      <div className="pb-20">{children}</div>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 px-2 py-2 backdrop-blur">
        <div
          className="mx-auto grid max-w-3xl gap-2"
          style={{ gridTemplateColumns: `repeat(${visibleNavItems.length}, minmax(0, 1fr))` }}
        >
          {visibleNavItems.map((item) => {
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
