#!/usr/bin/env bash
set -u

max_attempts="${1:?Falta el número máximo de intentos.}"
delay_seconds="${2:?Falta el retraso inicial en segundos.}"
shift 2

if (( $# == 0 )); then
  echo "Falta el comando que se debe ejecutar." >&2
  exit 2
fi

for ((attempt = 1; attempt <= max_attempts; attempt += 1)); do
  "$@" && exit 0
  status=$?

  if (( attempt == max_attempts )); then
    printf 'Comando fallido tras %d intento(s), código %d.\n' "$attempt" "$status" >&2
    exit "$status"
  fi

  delay=$((delay_seconds * attempt))
  printf 'Intento %d/%d fallido, reintentando en %d segundo(s).\n' "$attempt" "$max_attempts" "$delay" >&2
  sleep "$delay"
done
