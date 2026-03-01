"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { InlineAlert } from "@/components/ui/inline-alert";
import { PageShell } from "@/components/ui/page-shell";
import { SurfaceCard } from "@/components/ui/surface-card";
import { clearSessionCache, loadSessionClient } from "@/lib/session-client";

export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    (async () => {
      try {
        const session = await loadSessionClient();
        if (!isActive) return;
        if (session) {
          router.replace("/review");
          router.refresh();
        }
      } catch {
        // keep login page available when session check fails temporarily
      }
    })();
    return () => {
      isActive = false;
    };
  }, [router]);

  return (
    <PageShell mainClassName="max-w-md px-4 py-10">
      <SurfaceCard>
        <h1 className="text-2xl font-semibold">Iniciar sesión</h1>
        <p className="mt-1 text-sm text-base-content/70">Acceso privado de la aplicación.</p>

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
              clearSessionCache();
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
            <label className="text-xs font-semibold uppercase tracking-wide text-base-content/70">
              Usuario
            </label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="input input-bordered w-full"
              placeholder="Ej: Rafa"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-base-content/70">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="input input-bordered w-full"
              placeholder="••••••"
            />
          </div>

          {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

          <button
            type="submit"
            disabled={saving || !name.trim() || !password}
            className="btn btn-primary"
          >
            {saving ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </SurfaceCard>
    </PageShell>
  );
}
