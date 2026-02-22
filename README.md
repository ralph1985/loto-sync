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
- Cache local de resultados usa SQLite (`ResultCache`) con TTL de 10 min y rate limit básico.

## Prisma

Configura `DATABASE_URL` en `.env` (puedes copiar `.env.example`).

```bash
npx prisma generate
```

## API local (Next.js)

Endpoints disponibles:

- `GET /api/groups`
- `GET /api/draws`
- `GET /api/tickets`
- `POST /api/tickets`
- `POST /api/receipts` (multipart/form-data: `ticketId`, `file`)
- `GET /api/uploads/<path>` (serve ficheros locales)
- `GET /api/results/latest?game=PRIMITIVA|EUROMILLONES`
- `GET /api/results/verify?ticketId=...`

Ejemplo de payload para crear boleto:

```json
{
  "groupId": "grp_123",
  "drawId": "draw_123",
  "priceCents": 1200,
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

## Storage local

Los resguardos se guardan en `uploads/` y se sirven via `GET /api/uploads/<path>`.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

### Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)

### Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme).
