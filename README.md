# loto-sync

Web movil para gestionar boletos de Primitiva y Euromillon con grupos.

## MVP
- Pantalla de seleccion de sorteo/grupo.
- Alta de boleto con numeros, tipo de sorteo y resguardo.
- Resguardos en Vercel Blob y metadata en Postgres (Prisma Postgres).

## Docs
- `docs/hito-01-mvp.md`: definición MVP, modelo de datos y validaciones.

## Stack
- Next.js (App Router)
- Tailwind CSS
- Vercel Blob
- Prisma Postgres

## Desarrollo local

```bash
npm install
npm run dev
```

Abre http://localhost:3000 en el navegador.

## Entorno

Copia `.env.example` a `.env` y completa:

- `DATABASE_URL` (SQLite local)
- `LOTERIAS_API_KEY` (API terceros para resultados)
- `LOTERIAS_API_BASE` (opcional, por defecto loteriasapi.com)
- `LOTERIAS_API_FALLBACK` (opcional: `true` para permitir fallback a API externa si falta resultado local)
- Cache local de resultados usa SQLite (`ResultCache`) con TTL de 10 min y rate limit básico.

## Prisma

Configura `DATABASE_URL` en `.env` (puedes copiar `.env.example`).

```bash
npx prisma generate
npx prisma db push
node prisma/seed.js
# opcional: crear movimientos de gasto para tickets historicos
node prisma/backfill-group-movements.js
```

## API local (Next.js)

Endpoints disponibles:

- `POST /api/auth/login` (login con `name` + `password`)
- `GET/DELETE /api/auth/session` (sesion de usuario actual / logout)
- `GET/POST /api/users` (listar/crear usuarios, API interna)
- `GET /api/groups`
- `GET/POST /api/groups/:groupId/members`
- `GET/POST /api/groups/:groupId/invitations`
- `GET /api/draws`
- `GET /api/tickets`
- `POST /api/tickets`
- `POST /api/receipts` (multipart/form-data: `ticketId`, `file`)
- `GET /api/uploads/<path>` (serve ficheros locales)
- `GET /api/results/latest?game=PRIMITIVA|EUROMILLONES`
- `GET /api/results/verify?ticketId=...`
- `POST /api/results/recheck` (recomprueba todas las semanas de un ticket: `ticketId`)
- `POST /api/results/import` (importa resultados locales: `game`, `results[]` y recomputa checks/tickets afectados)
- `POST /api/results/prize` (manual: `ticketId`, `drawDate` opcional, `prizeCents`)

`GET /api/groups` incluye `balanceCents` calculado por grupo.

Gestion de usuarios (local):

- La app exige login para acceder a cualquier pantalla de negocio (`/login` publico).
- Las contraseñas se guardan como hash MD5 (solo para entorno local de este proyecto).
- No hay alta de usuarios desde el frontal de la app.

Ejemplo de payload para crear boleto:

```json
{
  "groupId": "grp_123",
  "drawType": "PRIMITIVA",
  "drawDate": "2026-01-30",
  "priceCents": 1200,
  "playsJoker": true,
  "jokerNumber": "1234567",
  "notes": "Boleto compartido",
  "lines": [
    {
      "mainNumbers": [4, 9, 13, 28, 33, 41],
      "complement": 12,
      "reintegro": 6
    }
  ]
}
```

Notas de saldo (bote):

- Al crear un ticket con `priceCents > 0`, se registra un movimiento `TICKET_EXPENSE`.
- El saldo de cada grupo se calcula sumando movimientos (`OPENING`, `CONTRIBUTION`, `PRIZE`, etc.).
- Al registrar premio manual (`/api/results/prize`), se crea/actualiza movimiento `PRIZE`.

Ejemplo de importación de resultados locales:

```json
{
  "game": "LA_PRIMITIVA",
  "results": [
    {
      "date": "2026-02-21",
      "numbers": [15, 17, 20, 34, 35, 41],
      "complementario": 8,
      "reintegro": 1
    }
  ]
}
```

## Storage local

Los resguardos se guardan en `uploads/` y se sirven via `GET /api/uploads/<path>`.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

### Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)

### Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme).
