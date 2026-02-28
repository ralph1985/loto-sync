const mode = process.argv[2] ?? 'unknown';

console.error(
  `db:sync:${mode} desactivado: la base de datos unica es Vercel Postgres.`
);
console.error(
  'Usa `npm run backup:db` para exportar una copia remota y subirla a OneDrive.'
);
process.exit(1);
