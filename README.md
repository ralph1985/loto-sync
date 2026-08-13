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

La base de datos unica del proyecto es **Vercel Postgres**. SQLite local esta desactivada.

## Entorno

Copia `.env.example` a `.env.local` y completa:

- `DATABASE_URL` (Postgres de Vercel)
- `DB_SYNC_TOKEN` y `REMOTE_SYNC_BASE_URL` (necesarios para backup remoto)
- Resultados y cache usan tabla `ResultCache` como fuente local principal.

## Prisma

Configura `DATABASE_URL` en `.env.local` (puedes copiar `.env.example`).

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
- `GET/POST/DELETE /api/groups/:groupId/email-recipients` (destinatarios de correo del grupo; solo el owner puede modificar)
- `GET /api/groups/:groupId/movements` (historial de bote, filtro opcional `type`)
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

Nota: la comprobación de resultados se basa en la base de datos local (`ResultCache`). No se consulta API externa.

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
- Los grupos con `balanceTrackingEnabled = false` quedan fuera de este control. Actualmente Bego está configurado así: sus boletos y premios no generan movimientos de saldo, y el saldo no aparece en la interfaz ni en los informes. Los movimientos históricos se conservan.

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

## Backup de base de datos

La copia de seguridad se exporta desde Vercel Postgres mediante la API segura y se guarda localmente:

```bash
npm run backup:db
```

Genera un fichero local `backups/vercel-postgres-YYYYMMDD-HHMMSS.json`. No realiza subidas a OneDrive.

En este PC se ejecuta los martes, viernes y domingos a las 04:30 con cron. La salida queda registrada en `backups/backup-cron.log`.

## Automatización de resultados de Primitiva y Euromillón

El worker local consulta por IMAP los mensajes nuevos del buzón configurado, conserva el `.eml`, usa Codex en modo solo lectura para extraer un JSON validable, importa el resultado en `ResultCache`, recalcula los boletos afectados y envía un informe SMTP independiente por grupo. Admite La Primitiva (lunes, jueves y sábado) y Euromillón (martes y viernes). Para Euromillón también guarda y comprueba el código de El Millón de cada resguardo.

Configuración adicional en `.env.local`:

- `RESULTS_IMAP_HOST`, `RESULTS_IMAP_PORT`, `RESULTS_IMAP_SECURE`, `RESULTS_IMAP_USER`, `RESULTS_IMAP_PASSWORD` y `RESULTS_IMAP_MAILBOX`.
- `RESULTS_IMAP_FROM` y `RESULTS_IMAP_SUBJECT` mantienen la configuración simple existente.
- `RESULTS_IMAP_FILTERS_JSON` permite configurar varios filtros de forma extensible. Cada filtro contiene `id`, `game`, `from`, `subjectIncludes` y `weekdays`. Si no se define, se crean filtros compatibles para Primitiva y Euromillón; el filtro de Euromillón usa por defecto `Resultados y escrutinio de Euromillones`.
- `RESULTS_CODEX_BIN`, `RESULTS_SMTP_HOST`, `RESULTS_SMTP_PORT`, `RESULTS_SMTP_SECURE`, `RESULTS_SMTP_USER`, `RESULTS_SMTP_PASSWORD` (opcional si reutiliza `RESULTS_IMAP_PASSWORD`) y `RESULTS_REPORT_FROM`.
- `RESULTS_RETENTION_DAYS` (por defecto, `90`).

Las contraseñas IMAP/SMTP solo deben estar en `.env.local`. Los destinatarios se gestionan por grupo mediante la API de destinatarios de correo. El proceso ejecuta `npm run backup:db` antes y después de cualquier escritura remota. Si falla una fase, conserva el correo sin marcarlo como procesado para reintentarlo.

La retención local es de 90 días para los correos `.eml`, resultados JSON y logs. El estado de idempotencia se conserva hasta 12 meses y después se compacta.

Ejecución manual:

```bash
npm run results:process
# inspección segura de un correo descargado: sin tocar DB, IMAP ni SMTP
npm run results:inspect -- --file ./resultado.eml
```

## Apuestas recurrentes de Euromillón

Los boletos de Euromillones pueden contener varias líneas y un código de El Millón por línea. La cobertura semanal opcional conserva las mismas líneas y códigos para los sorteos del martes y viernes; los códigos antiguos guardados directamente en el boleto siguen siendo compatibles.

Desde el panel de revisión, un owner puede guardar una combinación fija para un grupo. La aplicación prepara un boleto pendiente para el próximo sorteo de martes o viernes. Tras comprarlo, el owner debe abrir el boleto, introducir el código de El Millón del resguardo y confirmar la compra. La aplicación no realiza compras en SELAE.

La generación se activa automáticamente cada día a las 04:30 mediante cron, con `flock` para evitar ejecuciones simultáneas. La salida queda registrada en `backups/recurring-cron.log`. También puede ejecutarse manualmente:

```bash
npm run recurring-tickets:generate
```

El comando es idempotente y ejecuta backup PRE/POST cuando crea boletos. Los boletos se generan como pendientes y solo entran en la comprobación después de confirmar la compra y guardar el código de El Millón.

Los comandos `db:sync:up` y `db:sync:down` quedan desactivados para evitar sobrescrituras de una base local.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

### Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)

### Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme).
