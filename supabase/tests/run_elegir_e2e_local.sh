#!/usr/bin/env bash
# =============================================================================
# E2E 7.4-B4: «Elegir de mi cava» en Chrome (escritorio y celular) con la app
# real compilada y el handler real de /api/que-tomo sobre el doble EN MEMORIA
# (tests/que-tomo/e2e/servidor_memoria.mjs). No usa ninguna base de datos ni
# Supabase real. Deja las capturas en SHOTS_DIR.
#   PLAYWRIGHT_CORE=/ruta/playwright-core/index.mjs [CHROME_BIN=...] \
#   [SHOTS_DIR=...] bash supabase/tests/run_elegir_e2e_local.sh
# =============================================================================
set -euo pipefail
: "${PLAYWRIGHT_CORE:?Definí PLAYWRIGHT_CORE}"
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
PUERTO="${E2E_PORT:-54398}"
DIST="$(mktemp -d)"
trap 'rm -rf "$DIST"' EXIT
( cd "$RAIZ" && VITE_SUPABASE_URL="http://127.0.0.1:$PUERTO" VITE_SUPABASE_ANON_KEY="anon-de-prueba" \
    npx vite build --outDir "$DIST" --emptyOutDir >/dev/null )
cd "$RAIZ"
APP_DIST="$DIST" E2E_PORT="$PUERTO" PLAYWRIGHT_CORE="$PLAYWRIGHT_CORE" CHROME_BIN="${CHROME_BIN:-/usr/bin/google-chrome}" \
  SHOTS_DIR="${SHOTS_DIR:-/tmp/elegir-shots}" node --test --test-concurrency=1 tests/que-tomo/e2e/elegir_de_mi_cava.e2e.mjs
