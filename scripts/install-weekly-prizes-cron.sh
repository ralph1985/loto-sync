#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/var/weekly-prizes"
BALANCE_LOG_DIR="$ROOT_DIR/var/weekly-balance"
NPM_BIN="$(command -v npm)"
if [[ -z "$NPM_BIN" ]]; then
  echo "No se encontró npm en PATH." >&2
  exit 1
fi
mkdir -p "$LOG_DIR"
mkdir -p "$BALANCE_LOG_DIR"

BEGIN_MARKER="# BEGIN LOTO-SYNC WEEKLY PRIZES"
END_MARKER="# END LOTO-SYNC WEEKLY PRIZES"

{ crontab -l 2>/dev/null || true; } | awk -v begin="$BEGIN_MARKER" -v end="$END_MARKER" '$0 == begin { skip = 1; next } $0 == end { skip = 0; next } !skip { print }' > "$LOG_DIR/crontab.current"
{
  cat "$LOG_DIR/crontab.current"
  printf '%s\n' "$BEGIN_MARKER"
  printf 'CRON_TZ=Europe/Madrid\n'
  printf '0 14 * * 2 /usr/bin/flock -n %s/worker.lock /usr/bin/env bash -lc '\''cd %s && %s run weekly-prizes:process -- --scheduled --game PRIMITIVA >> %s/worker.log 2>&1'\''\n' "$LOG_DIR" "$ROOT_DIR" "$NPM_BIN" "$LOG_DIR"
  printf '0 14 * * 3 /usr/bin/flock -n %s/worker.lock /usr/bin/env bash -lc '\''cd %s && %s run weekly-prizes:process -- --scheduled --game EUROMILLONES >> %s/worker.log 2>&1'\''\n' "$LOG_DIR" "$ROOT_DIR" "$NPM_BIN" "$LOG_DIR"
  printf '0 14 * * 5 /usr/bin/flock -n %s/worker.lock /usr/bin/env bash -lc '\''cd %s && %s run weekly-prizes:process -- --scheduled --game PRIMITIVA >> %s/worker.log 2>&1'\''\n' "$LOG_DIR" "$ROOT_DIR" "$NPM_BIN" "$LOG_DIR"
  printf '0 14 * * 6 /usr/bin/flock -n %s/worker.lock /usr/bin/env bash -lc '\''cd %s && %s run weekly-prizes:process -- --scheduled --game EUROMILLONES >> %s/worker.log 2>&1'\''\n' "$LOG_DIR" "$ROOT_DIR" "$NPM_BIN" "$LOG_DIR"
  printf '0 14 * * 0 /usr/bin/flock -n %s/worker.lock /usr/bin/env bash -lc '\''cd %s && %s run weekly-prizes:process -- --scheduled --game PRIMITIVA >> %s/worker.log 2>&1'\''\n' "$LOG_DIR" "$ROOT_DIR" "$NPM_BIN" "$LOG_DIR"
  printf '# BEGIN LOTO-SYNC WEEKLY BALANCE\n'
  printf '0 15 * * 0 /usr/bin/flock -n %s/worker.lock /usr/bin/env bash -lc '\''cd %s && %s run weekly-balance:send >> %s/worker.log 2>&1'\''\n' "$BALANCE_LOG_DIR" "$ROOT_DIR" "$NPM_BIN" "$BALANCE_LOG_DIR"
  printf '# END LOTO-SYNC WEEKLY BALANCE\n'
  printf '%s\n' "$END_MARKER"
} | crontab -
rm -f "$LOG_DIR/crontab.current"
echo "Cron de premios instalado: sorteos procesados al día siguiente a las 14:00 Europe/Madrid"
