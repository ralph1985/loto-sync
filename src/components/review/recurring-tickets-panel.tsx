"use client";

import { useEffect, useState } from "react";

import type { Group } from "@/features/tickets/types";

type RecurringTicket = {
  id: string;
  groupId: string;
  active: boolean;
  startDate: string;
  mainNumbers: number[];
  starNumbers: number[];
  group: { name: string };
};

const nextDraw = () => {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  while (![2, 5].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

export function RecurringTicketsPanel({ groups }: { groups: Group[] }) {
  const [rows, setRows] = useState<RecurringTicket[]>([]);
  const [groupId, setGroupId] = useState("");
  const [startDate, setStartDate] = useState(nextDraw);
  const [mainNumbers, setMainNumbers] = useState("");
  const [starNumbers, setStarNumbers] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const owners = groups.filter((group) => group.role === "OWNER");

  const load = async () => {
    const response = await fetch("/api/recurring-tickets");
    const payload = await response.json();
    if (response.ok) setRows(payload.data ?? []);
  };

  useEffect(() => { load(); }, []);

  if (owners.length === 0 && rows.length === 0) return null;

  const parseNumbers = (value: string) => value.split(/[\s,.-]+/).filter(Boolean).map(Number);
  const create = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/recurring-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, startDate, mainNumbers: parseNumbers(mainNumbers), starNumbers: parseNumbers(starNumbers) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.issues?.join(" ") || payload?.error || "No se pudo guardar.");
      setRows((current) => [...current, payload.data]);
      setMainNumbers("");
      setStarNumbers("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar.");
    } finally { setSaving(false); }
  };

  const toggle = async (row: RecurringTicket) => {
    const response = await fetch(`/api/recurring-tickets/${row.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !row.active }),
    });
    if (response.ok) setRows((current) => current.map((item) => item.id === row.id ? { ...item, active: !row.active } : item));
  };

  return <section className="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm sm:p-6">
    <div className="mb-4"><h2 className="text-lg font-bold">Apuestas recurrentes</h2><p className="text-sm text-slate-600">Euromillón se prepara cada martes y viernes. Confirma después la compra y el código de El Millón.</p></div>
    {rows.map((row) => <div key={row.id} className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-base-200 p-3 text-sm"><span><strong>{row.group.name}</strong> · {row.mainNumbers.join(", ")} + {row.starNumbers.join(", ")}</span><button type="button" onClick={() => toggle(row)} className="btn btn-sm">{row.active ? "Pausar" : "Activar"}</button></div>)}
    {owners.length > 0 && <div className="grid gap-3 md:grid-cols-4">
      <select className="select select-bordered" value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="">Grupo</option>{owners.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
      <input className="input input-bordered" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
      <input className="input input-bordered" placeholder="5 números" value={mainNumbers} onChange={(event) => setMainNumbers(event.target.value)} />
      <input className="input input-bordered" placeholder="2 estrellas" value={starNumbers} onChange={(event) => setStarNumbers(event.target.value)} />
      <button type="button" className="btn btn-primary md:col-span-4" disabled={saving || !groupId} onClick={create}>{saving ? "Guardando…" : "Guardar recurrencia"}</button>
    </div>}
    {error && <p className="mt-3 text-sm text-error">{error}</p>}
  </section>;
}
