#!/usr/bin/env bash
# =============================================================================
# 7.2: flujo completo con AUTENTICACIÓN REAL (GoTrue de Supabase + Magic Link)
# sobre una base LOCAL DESCARTABLE con todas las migraciones del repo
# (incluida 7.2-A). No toca Producción ni usuarios reales: los emails los
# recibe un buzón SMTP local.
#
#   PostgreSQL 17 (base nueva) ← GoTrue (auth real)  ← gateway :GW ← app (build de Vite)
#                              ← PostgREST (RLS real) ←
#
# Uso:
#   PGHOST=/ruta/socket PGPORT=54317 PGUSER=postgres \
#   POSTGREST_BIN=/ruta/postgrest GOTRUE_BIN=/ruta/auth \
#   PLAYWRIGHT_CORE=/ruta/playwright-core/index.mjs CHROME_BIN=/ruta/chrome \
#   ./supabase/tests/run_magic_link_local.sh
#
# GOTRUE_BIN: binario `auth` de https://github.com/supabase/auth/releases
# (probado con v2.186.0, auth-v2.186.0-x86.tar.gz); su carpeta `migrations`
# debe estar junto al binario. PostgreSQL debe aceptar TCP en 127.0.0.1:PGPORT
# (GoTrue se conecta por TCP) con autenticación trust o PGPASSWORD.
# MODO=manual deja todo levantado para probar a mano en el navegador (ver
# instrucciones que imprime); por defecto corre la prueba automática.
# =============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
DB="${TEST_DB:-micava_magiclink}"
PGRST_PORT="${PGRST_PORT:-3997}"
GOTRUE_PORT="${GOTRUE_PORT:-9997}"
GW_PORT="${GW_PORT:-54397}"
APP_PORT="${APP_PORT:-4197}"
SMTP_PORT="${SMTP_PORT:-2597}"
: "${POSTGREST_BIN:?Definí POSTGREST_BIN}"
: "${GOTRUE_BIN:?Definí GOTRUE_BIN}"

case "${PGHOST:-}" in
  *supabase.co*|*supabase.com*|*pooler*)
    echo "ABORTADO: PGHOST parece un proyecto Supabase remoto." >&2; exit 1 ;;
esac

PSQL=(psql -X -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -d postgres -c "drop database if exists \"$DB\" with (force);"
"${PSQL[@]}" -d postgres -c "create database \"$DB\";"

# 1) Roles de la API (globales) y esquema auth vacío para GoTrue
"${PSQL[@]}" -d "$DB" <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
create schema auth;
SQL

SECRET="secreto-magic-link-local-no-usar-en-produccion-$(date +%s)"
LOGDIR="$(mktemp -d)"
BUZON="$(mktemp -d)"
PIDS=()
cleanup() {
  for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null || true; done
  "${PSQL[@]}" -d postgres -c "drop database if exists \"$DB\" with (force);" >/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT TERM  # Ctrl+C o kill también limpian

GOTRUE_DIR="$(cd "$(dirname "$GOTRUE_BIN")" && pwd)"
export GOTRUE_DB_DRIVER=postgres
export GOTRUE_DB_DATABASE_URL="postgres://${PGUSER:-postgres}@127.0.0.1:$PGPORT/$DB?sslmode=disable&search_path=auth"  # como el rol supabase_auth_admin
export GOTRUE_DB_MIGRATIONS_PATH="$GOTRUE_DIR/migrations"
export GOTRUE_DB_NAMESPACE=auth
export GOTRUE_API_HOST=127.0.0.1 GOTRUE_API_PORT="$GOTRUE_PORT" PORT="$GOTRUE_PORT"
export API_EXTERNAL_URL="http://127.0.0.1:$GW_PORT"
export GOTRUE_SITE_URL="http://127.0.0.1:$APP_PORT"
export GOTRUE_URI_ALLOW_LIST="http://127.0.0.1:$APP_PORT/**"
export GOTRUE_DISABLE_SIGNUP=true            # como Producción: solo invitados
export GOTRUE_JWT_SECRET="$SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated
export GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role
export GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=false
export GOTRUE_SMTP_HOST=127.0.0.1 GOTRUE_SMTP_PORT="$SMTP_PORT" GOTRUE_SMTP_ADMIN_EMAIL=acceso@test.local
export GOTRUE_SMTP_SENDER_NAME="Cava Vinos (prueba local)" GOTRUE_SMTP_MAX_FREQUENCY=1s
export GOTRUE_RATE_LIMIT_EMAIL_SENT=1000
export GOTRUE_MAILER_URLPATHS_MAGIC_LINK=/auth/v1/verify GOTRUE_MAILER_URLPATHS_INVITE=/auth/v1/verify
export GOTRUE_MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify GOTRUE_MAILER_URLPATHS_RECOVERY=/auth/v1/verify
export GOTRUE_LOG_LEVEL=warn

# 2) Esquema de GoTrue (auth.users real, auth.uid() real)
( cd "$GOTRUE_DIR" && "$GOTRUE_BIN" migrate >"$LOGDIR/gotrue-migrate.log" 2>&1 ) \
  || { echo "GoTrue migrate falló:" >&2; tail -20 "$LOGDIR/gotrue-migrate.log" >&2; exit 1; }

# 3) Resto del shim (storage, privilegios por defecto) y migraciones del repo
{
  echo "grant usage on schema auth to anon, authenticated, service_role;"
  echo "grant execute on function auth.uid() to anon, authenticated, service_role;"
  sed -n '/^create schema storage;/,$p' "$HERE/local_shim.sql"
} | "${PSQL[@]}" -d "$DB"
for f in "$ROOT"/supabase/migrations/*.sql; do "${PSQL[@]}" -d "$DB" -f "$f"; done
echo "== Migraciones aplicadas: $(ls "$ROOT"/supabase/migrations/*.sql | xargs -n1 basename | tr '\n' ' ')"

# 4) Servicios
SMTP_PORT="$SMTP_PORT" BUZON_DIR="$BUZON" node "$ROOT/tests/onboarding/e2e/smtp_buzon.mjs" >"$LOGDIR/smtp.log" 2>&1 &
PIDS+=($!)
( cd "$GOTRUE_DIR" && exec "$GOTRUE_BIN" serve ) >"$LOGDIR/gotrue.log" 2>&1 &
PIDS+=($!)
PGRST_DB_URI="postgres://authenticator@/$DB?host=$PGHOST&port=$PGPORT" \
PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$SECRET" \
PGRST_SERVER_PORT="$PGRST_PORT" PGRST_SERVER_HOST=127.0.0.1 PGRST_DB_POOL=5 \
  "$POSTGREST_BIN" >"$LOGDIR/postgrest.log" 2>&1 &
PIDS+=($!)
GW_PORT="$GW_PORT" PGRST_URL="http://127.0.0.1:$PGRST_PORT" GOTRUE_URL="http://127.0.0.1:$GOTRUE_PORT" \
  node "$ROOT/tests/onboarding/e2e/gateway.mjs" >"$LOGDIR/gateway.log" 2>&1 &
PIDS+=($!)

jwt() { SECRET="$SECRET" ROLE="$1" node -e '
const c=require("crypto");const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const h=b({alg:"HS256",typ:"JWT"}),p=b({role:process.env.ROLE,exp:Math.floor(Date.now()/1000)+86400});
console.log(`${h}.${p}.${c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url")}`)'; }
ANON="$(jwt anon)"
SERVICE="$(jwt service_role)"

for url in "http://127.0.0.1:$GOTRUE_PORT/health" "http://127.0.0.1:$PGRST_PORT/" "http://127.0.0.1:$GW_PORT/auth/v1/health"; do
  for _ in $(seq 1 75); do curl -fs "$url" >/dev/null 2>&1 && break; sleep 0.2; done
  curl -fs "$url" >/dev/null || { echo "No respondió $url" >&2; tail -20 "$LOGDIR"/*.log >&2; exit 1; }
done

# 5) Usuarios como los crea una invitación (API de administración de GoTrue)
crear_usuario() {
  local resp
  resp="$(curl -sS -X POST "http://127.0.0.1:$GOTRUE_PORT/admin/users" \
    -H "Authorization: Bearer $SERVICE" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"email_confirm\":true}")"
  echo "$resp" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(!j.id){console.error(s);process.exit(1)}console.log(j.id)})' \
    || { echo "GoTrue no creó $1" >&2; tail -15 "$LOGDIR/gotrue.log" >&2; exit 1; }
}
ID_NUEVO="$(crear_usuario nueva.real@test.local)"
ID_EXISTENTE="$(crear_usuario existente.real@test.local)"
"${PSQL[@]}" -d "$DB" <<SQL
-- existente: perfil editor y un vino (beta); nueva: sin perfil (pasa por ProfileSetup)
insert into public.profiles (id, nombre, role) values ('$ID_EXISTENTE', 'Rita Real', 'editor');
insert into public.wines (id, nombre, bodega, varietal, user_id)
  values ('b0000000-0000-0000-0000-000000000001', 'Malbec de la Beta', 'Bodega Real', 'Malbec', '$ID_EXISTENTE');
insert into public.wine_privado (wine_id, user_id, stock) values ('b0000000-0000-0000-0000-000000000001', '$ID_EXISTENTE', 1);
SQL
echo "== Usuarios: nueva.real@test.local ($ID_NUEVO), existente.real@test.local ($ID_EXISTENTE)"

# 6) App
OUT="$(mktemp -d)"
( cd "$ROOT" && VITE_SUPABASE_URL="http://127.0.0.1:$GW_PORT" VITE_SUPABASE_ANON_KEY="$ANON" \
    npx vite build --outDir "$OUT" --emptyOutDir >"$LOGDIR/build.log" 2>&1 )
# Un solo proceso (sin npx/sh intermedios) para que el cierre lo termine;
# si el puerto está ocupado (p. ej. un servidor de otra corrida) se aborta:
# nunca se prueba una app distinta de la recién compilada.
if curl -fs "http://127.0.0.1:$APP_PORT/" >/dev/null 2>&1; then
  echo "ABORTADO: el puerto $APP_PORT ya está en uso." >&2; exit 1
fi
( cd "$ROOT" && exec node "$ROOT"/node_modules/vite/bin/vite.js preview --outDir "$OUT" --port "$APP_PORT" --strictPort --host 127.0.0.1 >"$LOGDIR/preview.log" 2>&1 ) &
PIDS+=($!)
for _ in $(seq 1 75); do curl -fs "http://127.0.0.1:$APP_PORT/" >/dev/null 2>&1 && break; sleep 0.2; done
curl -fsS "http://127.0.0.1:$APP_PORT/" | diff -q - "$OUT/index.html" >/dev/null \
  || { echo "ABORTADO: la app servida en :$APP_PORT no es la recién compilada." >&2; exit 1; }
echo "== GoTrue $("$GOTRUE_BIN" version 2>/dev/null | head -1) · PostgREST · gateway :$GW_PORT · app http://127.0.0.1:$APP_PORT · buzón $BUZON"

if [[ "${MODO:-auto}" == "manual" ]]; then
  cat <<TXT

Entorno listo para prueba manual (Ctrl+C para terminar y borrar la base):
  1. Abrí http://127.0.0.1:$APP_PORT → «Iniciar sesión» → nueva.real@test.local
     (usuaria nueva) o existente.real@test.local (usuaria de la beta) → «Enviar link».
  2. Obtené el Magic Link recibido en el buzón local:
       node "$ROOT/tests/onboarding/e2e/ultimo_link.mjs" "$BUZON" nueva.real@test.local
  3. Abrilo en el MISMO navegador. Para volver a empezar, Ctrl+C y correr de nuevo.
TXT
  wait
  exit 0
fi

cd "$ROOT"
APP_URL="http://127.0.0.1:$APP_PORT" PGRST_URL="http://127.0.0.1:$PGRST_PORT" BUZON_DIR="$BUZON" \
PLAYWRIGHT_CORE="${PLAYWRIGHT_CORE:?Definí PLAYWRIGHT_CORE}" CHROME_BIN="${CHROME_BIN:-/usr/bin/google-chrome}" \
SHOTS_DIR="${SHOTS_DIR:-/tmp/onboarding-shots}" \
  node --test --test-concurrency=1 tests/onboarding/e2e/magic_link.e2e.mjs
