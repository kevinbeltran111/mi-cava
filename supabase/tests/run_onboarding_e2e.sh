#!/usr/bin/env bash
# =============================================================================
# E2E 7.2-B: la app real (build de Vite) en Chrome contra PostgreSQL +
# PostgREST LOCALES y un gateway que imita la URL de Supabase. Base
# DESCARTABLE. NUNCA apuntar a un proyecto Supabase real.
#
# Uso:
#   PGHOST=/ruta/socket PGPORT=54317 PGUSER=postgres \
#   POSTGREST_BIN=/ruta/postgrest PLAYWRIGHT_CORE=/ruta/node_modules/playwright-core/index.mjs \
#   CHROME_BIN=/ruta/chrome ./supabase/tests/run_onboarding_e2e.sh
#
# playwright-core no es dependencia del proyecto: instalarlo aparte
# (p. ej. `npm i playwright-core` en otra carpeta) y pasar su ruta.
# Capturas: SHOTS_DIR (default /tmp/onboarding-shots).
# APP_SRC=/ruta compila la app desde otra copia del repo (p. ej. un
# `git worktree` del frontend publicado) en lugar de este checkout.
# =============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
DB="${TEST_DB:-micava_e2e72b}"
PGRST_PORT="${PGRST_PORT:-3998}"
GW_PORT="${GW_PORT:-54398}"
APP_PORT="${APP_PORT:-4198}"
: "${POSTGREST_BIN:?Definí POSTGREST_BIN}"
: "${PLAYWRIGHT_CORE:?Definí PLAYWRIGHT_CORE}"

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
# HASTA_71=1 simula Producción sin 7.2-A (como un Preview de Vercel):
# aplica solo hasta 7.1 y corre preview_sin_72a.e2e.mjs.
for f in "$ROOT"/supabase/migrations/*.sql; do
  if [[ "${HASTA_71:-0}" == "1" && ! "$(basename "$f")" < "20261110000000" ]]; then continue; fi
  "${PSQL[@]}" -d "$DB" -f "$f"
done
"${PSQL[@]}" -d "$DB" <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
end $$;
grant anon, authenticated, service_role to authenticator;
SQL
"${PSQL[@]}" -d "$DB" -f "$ROOT/tests/onboarding/e2e/seed.sql"
[[ "${HASTA_71:-0}" == "1" ]] || "${PSQL[@]}" -d "$DB" -f "$ROOT/tests/onboarding/e2e/seed_preferencias.sql"

SECRET="secreto-e2e-local-no-usar-en-produccion-$(date +%s)"
LOGDIR="$(mktemp -d)"
PIDS=()
cleanup() {
  for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null || true; done
  "${PSQL[@]}" -d postgres -c "drop database if exists \"$DB\" with (force);" >/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT TERM  # Ctrl+C o kill también limpian

PGRST_DB_URI="postgres://authenticator@/$DB?host=$PGHOST&port=$PGPORT" \
PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$SECRET" \
PGRST_SERVER_PORT="$PGRST_PORT" PGRST_SERVER_HOST=127.0.0.1 PGRST_DB_POOL=5 \
  "$POSTGREST_BIN" >"$LOGDIR/postgrest.log" 2>&1 &
PIDS+=($!)
GW_PORT="$GW_PORT" PGRST_URL="http://127.0.0.1:$PGRST_PORT" node "$ROOT/tests/onboarding/e2e/gateway.mjs" >"$LOGDIR/gateway.log" 2>&1 &
PIDS+=($!)

# Anon key de prueba (JWT role=anon firmado con el secreto local)
ANON="$(SECRET="$SECRET" node -e '
const c=require("crypto");const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const h=b({alg:"HS256",typ:"JWT"}),p=b({role:"anon",exp:Math.floor(Date.now()/1000)+86400});
console.log(`${h}.${p}.${c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url")}`)')"

OUT="$(mktemp -d)"
APP_SRC="${APP_SRC:-$ROOT}"
( cd "$APP_SRC" && VITE_SUPABASE_URL="http://127.0.0.1:$GW_PORT" VITE_SUPABASE_ANON_KEY="$ANON" \
    npx vite build --outDir "$OUT" --emptyOutDir >"$LOGDIR/build.log" 2>&1 )
echo "== App compilada desde $APP_SRC ($(git -C "$APP_SRC" rev-parse --short HEAD 2>/dev/null || echo '?'))"
# Un solo proceso (sin npx/sh intermedios) para que el cierre lo termine;
# si el puerto está ocupado (p. ej. un servidor de otra corrida) se aborta:
# nunca se prueba una app distinta de la recién compilada.
if curl -fs "http://127.0.0.1:$APP_PORT/" >/dev/null 2>&1; then
  echo "ABORTADO: el puerto $APP_PORT ya está en uso." >&2; exit 1
fi
( cd "$APP_SRC" && exec node "$APP_SRC"/node_modules/vite/bin/vite.js preview --outDir "$OUT" --port "$APP_PORT" --strictPort --host 127.0.0.1 >"$LOGDIR/preview.log" 2>&1 ) &
PIDS+=($!)

for url in "http://127.0.0.1:$PGRST_PORT/" "http://127.0.0.1:$GW_PORT/rest/v1/" "http://127.0.0.1:$APP_PORT/"; do
  for _ in $(seq 1 75); do curl -fs "$url" >/dev/null 2>&1 && break; sleep 0.2; done
  curl -fs "$url" >/dev/null || { echo "No respondió $url" >&2; tail -20 "$LOGDIR"/*.log >&2; exit 1; }
done
curl -fsS "http://127.0.0.1:$APP_PORT/" | diff -q - "$OUT/index.html" >/dev/null \
  || { echo "ABORTADO: la app servida en :$APP_PORT no es la recién compilada." >&2; exit 1; }
echo "== PostgREST :$PGRST_PORT · gateway :$GW_PORT · app :$APP_PORT · base $DB"

cd "$ROOT"
APP_URL="http://127.0.0.1:$APP_PORT" GW_URL="http://127.0.0.1:$GW_PORT" PGRST_URL="http://127.0.0.1:$PGRST_PORT" \
IT_JWT_SECRET="$SECRET" PLAYWRIGHT_CORE="$PLAYWRIGHT_CORE" CHROME_BIN="${CHROME_BIN:-/usr/bin/google-chrome}" \
SHOTS_DIR="${SHOTS_DIR:-/tmp/onboarding-shots}" \
  node --test --test-concurrency=1 \
    "${E2E_FILE:-tests/onboarding/e2e/$([[ "${HASTA_71:-0}" == "1" ]] && echo preview_sin_72a || echo onboarding).e2e.mjs}"
