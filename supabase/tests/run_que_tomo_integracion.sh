#!/usr/bin/env bash
# =============================================================================
# Integración 7.3-A: POST /api/que-tomo y sus módulos (api/_que-tomo/) contra
# PostgreSQL + PostgREST LOCALES, con RLS real, JWT firmados y el supabase-js
# de la app. Datos 100 % sintéticos.
# =============================================================================
# Crea una base DESCARTABLE, aplica shim + migraciones (incluidas 7.1 y 7.2-A),
# carga los datos de tests/que-tomo/seed.sql, levanta PostgREST, corre
# tests/que-tomo/que_tomo.integracion.test.mjs y borra la base.
# NUNCA apuntar a un proyecto Supabase real.
#
# Uso:
#   PGHOST=/ruta/socket PGPORT=54317 PGUSER=postgres \
#   POSTGREST_BIN=/ruta/postgrest ./supabase/tests/run_que_tomo_integracion.sh
#
# Requiere: PostgreSQL 17 con trust local para el rol authenticator,
# PostgREST >= 12, Node >= 20 y `npm ci` hecho.
# =============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
DB="${TEST_DB:-micava_it73a}"
PORT="${PGRST_PORT:-3998}"
: "${POSTGREST_BIN:?Definí POSTGREST_BIN}"

case "${PGHOST:-}" in
  *supabase.co*|*supabase.com*|*pooler*)
    echo "ABORTADO: PGHOST parece un proyecto Supabase remoto." >&2; exit 1 ;;
esac

PSQL=(psql -X -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -d postgres -c "drop database if exists \"$DB\" with (force);"
"${PSQL[@]}" -d postgres -c "create database \"$DB\";"
if "${PSQL[@]}" -d "$DB" -Atc "select 1 from pg_roles where rolname = 'service_role'" | grep -q 1; then
  sed '/^create role /d' "$HERE/local_shim.sql" | "${PSQL[@]}" -d "$DB"
else
  "${PSQL[@]}" -d "$DB" -f "$HERE/local_shim.sql"
fi
for f in "$ROOT"/supabase/migrations/*.sql; do "${PSQL[@]}" -d "$DB" -f "$f"; done

"${PSQL[@]}" -d "$DB" <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
end $$;
grant anon, authenticated, service_role to authenticator;
SQL
"${PSQL[@]}" -d "$DB" -f "$ROOT/tests/que-tomo/seed.sql"

SECRET="secreto-de-prueba-local-no-usar-en-produccion-$(date +%s)"
LOG="$(mktemp)"
PGRST_DB_URI="postgres://authenticator@/$DB?host=$PGHOST&port=$PGPORT" \
PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$SECRET" \
PGRST_SERVER_PORT="$PORT" PGRST_SERVER_HOST=127.0.0.1 PGRST_DB_POOL=3 \
  "$POSTGREST_BIN" >"$LOG" 2>&1 &
PGRST_PID=$!
cleanup() {
  kill "$PGRST_PID" 2>/dev/null || true
  "${PSQL[@]}" -d postgres -c "drop database if exists \"$DB\" with (force);" >/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT TERM

for _ in $(seq 1 50); do
  curl -fs "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break
  sleep 0.2
done
curl -fs "http://127.0.0.1:$PORT/" >/dev/null || { echo "PostgREST no arrancó:" >&2; cat "$LOG" >&2; exit 1; }
echo "== PostgREST $("$POSTGREST_BIN" --version) en :$PORT sobre $DB"

cd "$ROOT"
IT_REST_URL="http://127.0.0.1:$PORT" IT_JWT_SECRET="$SECRET" IT_DB="$DB" \
  node --test tests/que-tomo/que_tomo.integracion.test.mjs
