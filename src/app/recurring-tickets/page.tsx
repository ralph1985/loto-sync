"use client";

import { useEffect, useState } from "react";

import { RecurringTicketsPanel } from "@/components/review/recurring-tickets-panel";
import type { Group } from "@/features/tickets/types";

export default function RecurringTicketsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/groups")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "No se pudieron cargar los grupos.");
        if (active) setGroups(payload.data ?? []);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los grupos.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-16 pt-7 md:px-10 md:pt-10">
      <header className="border-b border-base-300 pb-5 sm:pb-6">
        <p className="text-sm font-semibold text-base-content/60">Configuración compartida</p>
        <h1 className="mt-1 text-3xl font-bold tracking-[-0.04em] text-base-content sm:text-4xl">Apuestas recurrentes</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-base-content/65">Consulta las apuestas automáticas de tus grupos. Los owners pueden crear, activar o pausar; el resto de miembros puede consultarlas.</p>
      </header>
      {loading ? <div className="rounded-2xl border border-base-300 bg-base-100 p-5 text-sm text-base-content/60">Cargando apuestas recurrentes...</div> : error ? <p className="rounded-2xl border border-error/30 bg-error/5 p-4 text-sm text-error">{error}</p> : <RecurringTicketsPanel groups={groups} />}
    </main>
  );
}
