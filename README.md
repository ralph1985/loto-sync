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

- `DATABASE_URL` (Postgres)
- `BLOB_READ_WRITE_TOKEN` (Vercel Blob)

## Prisma

Configura `DATABASE_URL` en `.env` (puedes copiar `.env.example`).

```bash
npx prisma generate
```

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

### Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)

### Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme).
