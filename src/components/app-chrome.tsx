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
        className="btn btn-sm btn-outline fixed left-4 top-4 z-[100] rounded-full"
      >
        {session ? session.name : "Usuario"}
      </button>

      {panelOpen ? (
        <div className="card fixed left-4 top-16 z-[100] w-[min(320px,calc(100vw-2rem))] border border-base-300 bg-base-100 shadow-xl">
          <div className="card-body gap-2 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-base-content/70">
              Sesión activa
            </p>
            <p className="mt-1 text-sm font-semibold text-base-content">
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
              className="btn btn-sm btn-outline mt-2 w-full"
            >
              Cerrar sesión
            </button>

            {userError ? <p className="mt-2 text-xs text-error">{userError}</p> : null}
          </div>
        </div>
      ) : null}

      <div className="pb-20">{children}</div>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-base-300 bg-base-100/95 px-2 py-2 backdrop-blur">
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
                  active ? "bg-primary text-primary-content" : "bg-base-200 text-base-content/70"
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
