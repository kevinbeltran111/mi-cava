#!/usr/bin/env bash
# =============================================================================
# Validación local de migraciones sobre una base PostgreSQL 17 DESCARTABLE.
# =============================================================================
# Crea una base nueva, aplica el shim de Supabase, los baselines SIN MODIFICAR,
# las migraciones posteriores y las pruebas de Etapa 7.
#
# NUNCA apuntar este script a un proyecto Supabase real.
#
# Uso:
#   PGHOST=/ruta/socket PGPORT=54317 PGUSER=postgres ./supabase/tests/run_local.sh
#
# Variables opcionales:
#   TEST_DB  nombre de la base descartable (default: micava_test). Se BORRA y
#            se recrea en cada corrida.
# =============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
DB="${TEST_DB:-micava_test}"

case "${PGHOST:-}" in
  *supabase.co*|*supabase.com*|*pooler*)
    echo "ABORTADO: PGHOST parece un proyecto Supabase remoto." >&2; exit 1 ;;
esac

PSQL=(psql -X -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -d postgres -c "drop database if exists \"$DB\" with (force);"
"${PSQL[@]}" -d postgres -c "create database \"$DB\";"

# Los roles son globales al cluster: si ya existen de una corrida anterior,
# el shim se aplica sin la parte de roles.
if "${PSQL[@]}" -d "$DB" -Atc "select 1 from pg_roles where rolname = 'service_role'" | grep -q 1; then
  sed '/^create role /d' "$HERE/local_shim.sql" | "${PSQL[@]}" -d "$DB"
else
  "${PSQL[@]}" -d "$DB" -f "$HERE/local_shim.sql"
fi

# Huella del catálogo de los objetos del baseline (tablas, columnas,
# constraints, índices, policies, grants, triggers, funciones y Storage).
# Debe ser idéntica antes y después de la migración de Etapa 7.
fingerprint() {
  "${PSQL[@]}" -d "$DB" -At -f "$HERE/baseline_fingerprint.sql"
}

echo "== Migraciones"
for f in "$ROOT"/supabase/migrations/*.sql; do
  name="$(basename "$f")"
  if [[ "$name" == 20261025000000_* ]]; then
    fingerprint > /tmp/etapa7_fp_before.txt
  fi
  echo "   $name"
  "${PSQL[@]}" -d "$DB" -f "$f"
done

echo "== Objetos del baseline sin cambios tras Etapa 7"
fingerprint > /tmp/etapa7_fp_after.txt
if diff -u /tmp/etapa7_fp_before.txt /tmp/etapa7_fp_after.txt; then
  echo "   OK: huella idéntica ($(wc -l < /tmp/etapa7_fp_after.txt) líneas)"
else
  echo "FALLA: la migración alteró objetos del baseline" >&2; exit 1
fi

echo "== Pruebas Etapa 7"
"${PSQL[@]}" -d "$DB" -f "$HERE/etapa7_modelo_inteligencia_test.sql"

echo "== Guarda: re-aplicar la migración de Etapa 7 debe abortar sin cambios"
if "${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/20261025000000_etapa7_modelo_inteligencia.sql" 2>/tmp/etapa7_guard.err; then
  echo "FALLA: la migración se re-aplicó" >&2; exit 1
fi
grep -q "alguna de las tablas de Etapa 7 ya existe" /tmp/etapa7_guard.err \
  && echo "   OK: abortó por la guarda" \
  || { echo "FALLA: abortó por otro motivo:" >&2; cat /tmp/etapa7_guard.err >&2; exit 1; }
