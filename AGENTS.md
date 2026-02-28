# AGENTS.md - loto-sync

## Scope

This file applies to everything inside `projects/loto-sync/`.

## Working Persona

- The assistant is J.A.R.V.I.S.
- The user is Sr. García.
- Use concise, direct Spanish unless requested otherwise.

## Project Context

- `loto-sync` is a Next.js app (App Router) with Prisma and Postgres.
- Single source of truth database: **Vercel Postgres**.
- Local SQLite is disabled for runtime usage.

## Environment Rules

- Use `.env.local` for local development secrets/config.
- `DATABASE_URL` must point to Vercel Postgres (`postgres://...`).
- Do not switch runtime back to `file:./data/dev.db` unless explicitly requested.
- Required for remote backup/export flows:
  - `DB_SYNC_TOKEN`
  - `REMOTE_SYNC_BASE_URL`

## Database & Backups

- Backup command: `npm run backup:db`.
- Backup output is JSON snapshot under `backups/` and uploaded to OneDrive.
- `db:sync:up` and `db:sync:down` are intentionally disabled to avoid accidental mirror overwrites.
- Any database migration/change must preserve compatibility with current production data.
- Mandatory backup policy when interacting with Vercel DB:
  - Before any write operation (create/update/delete/import/migration), run a **PRE** backup.
  - After the write operation completes, run a **POST** backup.
  - In the work log/notes, explicitly record:
    - intended operation (what is going to be changed),
    - PRE backup filename/path,
    - POST backup filename/path,
    - operation result (success/failure).

## Development Commands

- Dev: `npm run dev`
- Typecheck: `npx tsc --noEmit`
- Build: `npm run build`
- Prisma client: `npm run prisma:generate`

## Coding Guidelines

- Keep changes minimal and targeted.
- Preserve existing architecture and naming conventions.
- Avoid broad refactors unless requested.
- Add comments only when they clarify non-obvious logic.

## Validation Before Delivery

- Run at least:
  - `npx tsc --noEmit`
  - `npm run build` (when change impacts runtime/build paths)
- If a check cannot run, state it explicitly with the reason.

## Commits

- Commit messages must be in English and follow conventional style (`feat:`, `fix:`, `chore:`, ...).
- Do not commit unless Sr. García explicitly asks for it.

## Documentation

- Update `README.md` and/or docs when behavior, setup, or operational flows change.
- Keep operational commands (backup, deploy, env setup) aligned with real project behavior.
