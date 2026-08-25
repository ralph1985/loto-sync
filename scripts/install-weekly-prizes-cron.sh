#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/var/weekly-prizes"
mkdir -p "$LOG_DIR"

BEGIN_MARKER="# BEGIN LOTO-SYNC WEEKLY PRIZES"
END_MARKER="# END LOTO-SYNC WEEKLY PRIZES"

{ crontab -l 2>/dev/null || true; } | awk -v begin="$BEGIN_MARKER" -v end="$END_MARKER" '$0 == begin { skip = 1; next } $0 == end { skip = 0; next } !skip { print }' > "$LOG_DIR/crontab.current"
{
  cat "$LOG_DIR/crontab.current"
  printf '%s\n' "$BEGIN_MARKER"
  printf 'CRON_TZ=Europe/Madrid\n'
  printf '0 10 * * 0 /usr/bin/flock -n %s/worker.lock /usr/bin/env bash -lc '\''cd %s && /usr/bin/npm run weekly-prizes:process >> %s/worker.log 2>&1'\''\n' "$LOG_DIR" "$ROOT_DIR" "$LOG_DIR"
  printf '%s\n' "$END_MARKER"
} | crontab -
rm -f "$LOG_DIR/crontab.current"
echo "Cron dominical instalado: domingo 10:00 Europe/Madrid"
