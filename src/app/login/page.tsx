"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    (async () => {
      const response = await fetch("/api/auth/session");
      if (!isActive) return;
      if (response.ok) {
        router.replace("/review");
        router.refresh();
      }
    })();
    return () => {
      isActive = false;
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-[#f7f2ea] px-4 py-10 text-slate-900">
      <main className="mx-auto w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.1)]">
        <h1 className="text-2xl font-semibold text-slate-900">Iniciar sesión</h1>
        <p className="mt-1 text-sm text-slate-500">
          Acceso privado de la aplicación.
        </p>

        <form
          className="mt-5 flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (saving) return;
            setSaving(true);
            setError(null);
            try {
              const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ name: name.trim(), password }),
              });
              const payload = await response.json();
              if (!response.ok) {
                throw new Error(payload?.error || "No se pudo iniciar sesión.");
              }
              router.replace("/review");
              router.refresh();
            } catch (loginError) {
              setError(
                loginError instanceof Error
                  ? loginError.message
                  : "No se pudo iniciar sesión."
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Usuario
            </label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
              placeholder="Ej: Rafa"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
              placeholder="••••••"
            />
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={saving || !name.trim() || !password}
            className={`rounded-full px-6 py-3 text-sm font-semibold uppercase tracking-wide ${
              saving || !name.trim() || !password
                ? "cursor-not-allowed bg-slate-200 text-slate-500"
                : "bg-slate-900 text-white"
            }`}
          >
            {saving ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </main>
    </div>
  );
}
