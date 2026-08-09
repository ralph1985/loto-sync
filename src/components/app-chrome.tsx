"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { clearSessionCache, loadSessionClient, type ClientSession } from "@/lib/session-client";

type NavItem = { href: string; label: string; description: string };

const NAV_ITEMS: NavItem[] = [
  { href: "/review", label: "Panel", description: "Boletos y grupos" },
  { href: "/create", label: "Nuevo boleto", description: "Guardar una apuesta" },
  { href: "/results", label: "Resultados", description: "Consultar sorteos" },
];

const isItemActive = (pathname: string, href: string) => {
  if (pathname === "/" && href === "/review") return true;
  return pathname === href || pathname.startsWith(`${href}/`);
};

export function AppChrome({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<ClientSession | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const canCreateTickets = session?.memberships?.some((membership) => membership.role === "OWNER") ?? false;
  const visibleNavItems = NAV_ITEMS.filter((item) => item.href !== "/create" || canCreateTickets);

  useEffect(() => {
    if (pathname === "/login") return;
    let isActive = true;
    (async () => {
      try {
        const nextSession = await loadSessionClient();
        if (isActive) setSession(nextSession);
      } catch {
        if (isActive) setUserError("No se pudo inicializar la sesión.");
      }
    })();
    return () => { isActive = false; };
  }, [pathname]);

  if (pathname === "/login") return <div className="min-h-[100dvh]">{children}</div>;

  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-40 border-b border-base-300 bg-base-100/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] w-full max-w-7xl items-center gap-8 px-4 sm:px-6 lg:px-10">
          <Link href="/review" className="group flex min-w-fit items-center gap-3" aria-label="Loto Sync, ir al panel">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-content shadow-sm">LS</span>
            <span className="hidden sm:block">
              <span className="block text-sm font-bold tracking-tight text-base-content">Loto Sync</span>
              <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-base-content/50">Gestión de boletos</span>
            </span>
          </Link>

          <nav className="hidden min-w-0 flex-1 items-center gap-1 md:flex" aria-label="Navegación principal">
            {visibleNavItems.map((item) => {
              const active = isItemActive(pathname, item.href);
              return (
                <Link key={item.href} href={item.href} className={`rounded-xl px-3 py-2 text-sm font-semibold ${active ? "bg-base-300 text-base-content" : "text-base-content/60 hover:bg-base-300/70 hover:text-base-content"}`}>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="relative ml-auto">
            <button type="button" onClick={() => setPanelOpen((current) => !current)} className="flex items-center gap-2 rounded-xl border border-base-300 bg-base-100 px-3 py-2 text-sm font-semibold text-base-content hover:bg-base-300" aria-expanded={panelOpen}>
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-primary/10 text-[10px] font-bold text-primary">{session?.name?.slice(0, 1).toUpperCase() ?? "?"}</span>
              <span className="hidden max-w-28 truncate sm:block">{session?.name ?? "Usuario"}</span>
            </button>
            {panelOpen ? (
              <div className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-base-300 bg-base-100 p-4 shadow-xl">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-base-content/50">Sesión activa</p>
                <p className="mt-2 truncate font-semibold">{session?.name ?? "Sin sesión"}</p>
                <button type="button" onClick={async () => { await fetch("/api/auth/session", { method: "DELETE" }); clearSessionCache(); setPanelOpen(false); router.replace("/login"); router.refresh(); }} className="mt-4 w-full rounded-xl border border-base-300 px-3 py-2 text-sm font-semibold text-base-content/70 hover:border-primary hover:text-primary">Cerrar sesión</button>
                {userError ? <p className="mt-2 text-xs text-error">{userError}</p> : null}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="pb-20 md:pb-0">{children}</div>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-base-300 bg-base-100/95 px-2 py-2 backdrop-blur-xl md:hidden" aria-label="Navegación móvil">
        <div className="mx-auto grid max-w-lg gap-1" style={{ gridTemplateColumns: `repeat(${visibleNavItems.length}, minmax(0, 1fr))` }}>
          {visibleNavItems.map((item) => {
            const active = isItemActive(pathname, item.href);
            return <Link key={`mobile-${item.href}`} href={item.href} className={`rounded-xl px-2 py-2 text-center text-[11px] font-semibold ${active ? "bg-primary text-primary-content" : "text-base-content/60"}`}>{item.label}</Link>;
          })}
        </div>
      </nav>
    </div>
  );
}
