# AGENTS.md - loto-sync

Este archivo aplica a todo este repositorio.

## Prioridad e idioma

- El asistente es J.A.R.V.I.S.
- El usuario es Sr. Garcia.
- Responder en espanol conciso y directo salvo peticion contraria.
- Prioridad documental: `AGENTS.md`, `README.md`, `docs/*` y el estado real del repositorio.
- No asumir comportamiento por memoria o por otro proyecto: verificar en este checkout.

## Modo de trabajo

- Clasificar la tarea antes de actuar: alcance, archivos probables, riesgo de datos y validacion necesaria.
- Usar el agente minimo suficiente. No activar revisores transversales por defecto.
- Empezar por busquedas concretas y archivos probables; evitar releer el repositorio completo si no hace falta.
- No tocar credenciales, `.env*`, configuracion de Vercel, dependencias, locks o despliegue sin permiso explicito.

## Contexto tecnico

- `loto-sync` es una app Next.js App Router con Prisma y Postgres.
- La fuente unica de datos es **Vercel Postgres**.
- El despliegue objetivo de la app es Vercel.
- SQLite local esta desactivado para runtime. No volver a `file:./data/dev.db` salvo peticion explicita.
- Los resultados usan `ResultCache` como fuente local principal; no asumir consulta externa sin revisar codigo.

## Entorno

- Usar `.env.local` para secretos/configuracion local.
- `DATABASE_URL` debe apuntar a Postgres remoto de Vercel (`postgres://...` o `postgresql://...`), nunca a SQLite ni a una base local salvo permiso explicito.
- Variables requeridas para backup/export remoto:
  - `DB_SYNC_TOKEN`
  - `REMOTE_SYNC_BASE_URL`
- No imprimir tokens, URLs con credenciales ni contenido sensible de backups.

## Base de datos y backups

- Comando de backup: `npm run backup:db`.
- El backup exporta un snapshot JSON de Vercel Postgres y lo guarda únicamente en `backups/`; no realiza subidas a servicios externos.
- `db:sync:up` y `db:sync:down` estan intencionadamente desactivados para evitar sobrescrituras accidentales.
- Cualquier migracion o cambio de datos debe preservar compatibilidad con los datos actuales de produccion.
- Politica obligatoria al interactuar con Vercel DB:
  - Antes de cualquier escritura (`create`, `update`, `delete`, importacion, backfill, seed o migracion), ejecutar backup **PRE**.
  - Despues de la escritura, ejecutar backup **POST**.
  - En el resumen final registrar operacion prevista, backup PRE, backup POST y resultado.
- Si no se puede completar PRE o POST backup, parar antes de escribir o reportar claramente el bloqueo.

## Seleccion de agentes

- `coordinator`: clasifica tareas y ejecuta cambios simples.
- `db-ops-reviewer`: obligatorio para migraciones, seeds, imports, backups, Prisma schema o cualquier escritura sobre Vercel DB.
- `qa-final-reviewer`: usar en cambios con impacto runtime, configuracion, rutas API, autenticacion, backup o despliegue.
- Cambios solo documentales o de agentes pueden revisarse de forma ligera con `git diff --check`.

## Comandos de desarrollo

- Dev: `npm run dev`
- Typecheck: `npx tsc --noEmit`
- Build: `npm run build`
- Prisma client: `npm run prisma:generate`

## Git y commits

- Antes de cambiar de rama, crear rama, stagear o commitear: revisar `git status --short --branch`.
- Si hay cambios locales ajenos o inesperados, parar y preguntar.
- No usar `git add .`, `git add -A` ni `git add --all`; stagear rutas explicitas.
- No hacer merge, rebase, force push, stash, `reset --hard` ni limpieza destructiva sin permiso explicito.
- Las escrituras en `.git` pueden requerir ejecucion fuera del sandbox desde el primer intento.
- Commits solo si Sr. Garcia lo pide. Mensajes en ingles y estilo Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).
- Push o PR solo por peticion explicita.

## Guia de codigo

- Mantener cambios minimos y dirigidos.
- Preservar arquitectura, nombres y patrones existentes.
- Evitar refactors amplios salvo peticion explicita.
- Anadir comentarios solo para logica no obvia.
- Actualizar `README.md` o docs cuando cambien comportamiento, setup, backups, despliegue, entorno u operativa.

## Validacion

- Ejecutar `npx tsc --noEmit` cuando el cambio afecte codigo TypeScript, runtime, rutas API, Prisma o configuracion importada por la app.
- Ejecutar `npm run build` cuando el cambio impacte runtime, rutas, Prisma, configuracion de Next o despliegue.
- Para cambios solo de documentacion/agentes, ejecutar `git diff --check`.
- Si un check no puede ejecutarse, indicar el motivo exacto.

## Resumen final

Usar este formato cuando haya cambios:

```txt
Rama: <nombre-rama>
Commit: <mensaje o "sin commit">
Archivos tocados:
- ...
Checks:
- ...
Notas:
- ...
```

Si hubo escritura en Vercel DB, incluir tambien:

```txt
Operacion DB: <descripcion>
Backup PRE: <ruta>
Backup POST: <ruta>
Resultado DB: <success/failure>
```
