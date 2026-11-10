#!/usr/bin/env bash
# =============================================================================
# Validación local de migraciones sobre una base PostgreSQL 17 DESCARTABLE.
# =============================================================================
# Crea una base nueva, aplica el shim de Supabase, los baselines SIN MODIFICAR,
# las migraciones posteriores y las pruebas de Etapa 7 y 7.2-A (esta última
# incluye una segunda base descartable, <TEST_DB>_compat72).
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

# Huella de los objetos de Etapa 7.1 (tablas, columnas, constraints,
# índices, triggers, policies, funciones intel_*, secuencia).
fingerprint_e7() {
  "${PSQL[@]}" -d "$DB" -At -f "$HERE/etapa7_fingerprint.sql"
}

echo "== Migraciones"
for f in "$ROOT"/supabase/migrations/*.sql; do
  name="$(basename "$f")"
  if [[ "$name" == 20261025000000_* ]]; then
    fingerprint > /tmp/etapa7_fp_before.txt
  fi
  if [[ "$name" == 20261110000000_* ]]; then
    fingerprint_e7 > /tmp/etapa72_e7fp_before.txt
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

# =============================================================================
# ETAPA 7.2-A (20261110000000)
# =============================================================================
M72="$ROOT/supabase/migrations/20261110000000_etapa7_2_onboarding_respuesta_tipos.sql"

echo "== 7.2-A: objetos de 7.1 sin cambios salvo la columna y el CHECK nuevos"
# (la huella "después" se toma antes de las pruebas de 7.1, que borran datos
# pero no objetos; se recalcula acá porque la migración ya estaba aplicada)
fingerprint_e7 > /tmp/etapa72_e7fp_after.txt
diff /tmp/etapa72_e7fp_before.txt /tmp/etapa72_e7fp_after.txt > /tmp/etapa72_e7fp.diff || true
removed="$(grep -c '^<' /tmp/etapa72_e7fp.diff || true)"
added="$(grep '^>' /tmp/etapa72_e7fp.diff || true)"
expected_added="> column|user_preferences|wine_types_answer|text|notnull=false|default=|acl=
> constraint|user_preferences|user_preferences_wine_types_answer_check|CHECK (((wine_types_answer IS NULL) OR ((wine_types_answer = ANY (ARRAY['skipped'::text, 'no_preference'::text])) AND (cardinality(preferred_wine_types) = 0) AND (exploration_open = false)) OR ((wine_types_answer = 'answered'::text) AND ((cardinality(preferred_wine_types) > 0) OR (exploration_open = true)))))"
if [[ "$removed" == "0" && "$added" == "$expected_added" ]]; then
  echo "   OK: solo se agregaron la columna wine_types_answer y su CHECK"
else
  echo "FALLA: la migración 7.2-A cambió otros objetos de 7.1:" >&2
  cat /tmp/etapa72_e7fp.diff >&2; exit 1
fi

echo "== Pruebas Etapa 7.2-A"
"${PSQL[@]}" -d "$DB" -f "$HERE/etapa7_2_onboarding_test.sql"

echo "== Guarda: re-aplicar la migración 7.2-A debe abortar sin cambios"
if "${PSQL[@]}" -d "$DB" -f "$M72" 2>/tmp/etapa72_guard.err; then
  echo "FALLA: la migración 7.2-A se re-aplicó" >&2; exit 1
fi
grep -q "wine_types_answer ya existe" /tmp/etapa72_guard.err \
  && echo "   OK: abortó por la guarda" \
  || { echo "FALLA: abortó por otro motivo:" >&2; cat /tmp/etapa72_guard.err >&2; exit 1; }

echo "== 7.2-A sobre filas preexistentes de 7.1 (base aparte: ${DB}_compat72)"
DBC="${DB}_compat72"
"${PSQL[@]}" -d postgres -c "drop database if exists \"$DBC\" with (force);"
"${PSQL[@]}" -d postgres -c "create database \"$DBC\";"
sed '/^create role /d' "$HERE/local_shim.sql" | "${PSQL[@]}" -d "$DBC"
for f in "$ROOT"/supabase/migrations/*.sql; do
  [[ "$(basename "$f")" < "20261110000000" ]] || continue
  "${PSQL[@]}" -d "$DBC" -f "$f"
done
"${PSQL[@]}" -d "$DBC" -f "$HERE/etapa7_2_compat_seed.sql"
snap_before="$("${PSQL[@]}" -d "$DBC" -At -f "$HERE/etapa7_2_compat_snapshot.sql")"
"${PSQL[@]}" -d "$DBC" -f "$M72"
snap_after="$("${PSQL[@]}" -d "$DBC" -At -f "$HERE/etapa7_2_compat_snapshot.sql")"
nulls="$("${PSQL[@]}" -d "$DBC" -At -c "select count(*) from public.user_preferences where wine_types_answer is null")"
valid="$("${PSQL[@]}" -d "$DBC" -At -c "select convalidated from pg_constraint where conname = 'user_preferences_wine_types_answer_check'")"
echo "   antes:   $snap_before"
echo "   después: $snap_after"
if [[ "$snap_before" == "$snap_after" && "$snap_before" == *"filas=4" && "$nulls" == "4" && "$valid" == "t" ]]; then
  echo "   OK: 4 filas (never/started/completed/skipped) sin cambios, respuesta NULL, CHECK validado"
else
  echo "FALLA: la migración 7.2-A alteró filas existentes o no validó (nulls=$nulls, validado=$valid)" >&2; exit 1
fi
"${PSQL[@]}" -d postgres -c "drop database if exists \"$DBC\" with (force);"
