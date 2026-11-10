# Prueba del onboarding (7.2) con Magic Link real, sin Producción

Procedimiento reproducible para probar el flujo completo —invitación, Magic Link, perfil, onboarding, «Mis preferencias»— con la **autenticación real de Supabase (GoTrue)** sobre una **base local descartable que incluye la migración 7.2-A**. No usa el proyecto de Producción ni usuarios reales: los emails los recibe un buzón SMTP local.

Script: `supabase/tests/run_magic_link_local.sh`.

## Qué es real y qué no

| Componente | En esta prueba |
|---|---|
| Autenticación | **GoTrue v2.186.0** (el servicio de Auth de Supabase), con sus propias migraciones y su `auth.users` |
| Magic Link | Real: `signInWithOtp` de la app → email → `/verify` de GoTrue → redirección con sesión |
| Datos | PostgreSQL 17 con **todas** las migraciones del repo (baselines, 7.1, 7.2-A), RLS real vía PostgREST |
| App | El build de Vite de este checkout |
| Email | Buzón SMTP local (no Resend, no la Edge Function `send-email`: su plantilla ya se verificó en Producción el 2026-10-10) |
| Invitaciones | Usuarios creados con la API de administración de GoTrue, como una invitación; signups cerrados como en Producción |

No cubre: el hook de email de Producción, la configuración de Auth del dashboard (Site URL, Redirect URLs), Storage ni `/api/*` de Vercel.

## Verificado

En Linux (2026-11-10) con PostgreSQL 17.6, PostgREST 12.2.3, GoTrue v2.186.0, Node 22 y Chrome:

- ML0: un email no invitado no recibe link («Todavía no tenés acceso a CavaVinos.»).
- ML1 (escritorio): usuaria nueva → Magic Link → «¿Cómo querés que aparezca tu nombre?» → onboarding completo → datos guardados con el token real de GoTrue → cerrar sesión → nuevo Magic Link → no se repite el onboarding.
- ML2 (celular): usuaria existente → Magic Link → invitación → «Ahora no» → «Mis preferencias» → guardado sin alterar `skipped` → no vuelve la invitación.

**No verificado:** la ejecución en Windows (WSL2) ni la variante con Supabase CLI (más abajo).

## Requisitos

Linux (o WSL2 en Windows, no probado) con:

1. **PostgreSQL 17** (el shim usa el privilegio `MAINTAIN`, que no existe en 16), con un cluster de prueba propio que acepte TCP en `127.0.0.1` con autenticación `trust`:
   ```bash
   initdb -D ~/micava-pg -U postgres --auth=trust -E UTF8 --locale=C.UTF-8
   pg_ctl -D ~/micava-pg -o "-k /tmp -p 54317 -c listen_addresses=localhost" -l ~/micava-pg.log start
   ```
2. **PostgREST 12** y **GoTrue** desde GitHub Releases:
   ```bash
   curl -LO https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz
   curl -LO https://github.com/supabase/auth/releases/download/v2.186.0/auth-v2.186.0-x86.tar.gz
   tar xJf postgrest-v12.2.3-linux-static-x64.tar.xz
   mkdir gotrue && tar xzf auth-v2.186.0-x86.tar.gz -C gotrue   # deja gotrue/auth y gotrue/migrations
   ```
3. **Node 22** y `npm ci` en el repo.
4. **Chrome** y **playwright-core** instalado **fuera** del repo (no es dependencia del proyecto):
   ```bash
   mkdir ~/e2e-tools && cd ~/e2e-tools && npm init -y && npm i playwright-core
   ```

## Ejecución automática

```bash
PGHOST=/tmp PGPORT=54317 PGUSER=postgres \
POSTGREST_BIN=~/postgrest GOTRUE_BIN=~/gotrue/auth \
PLAYWRIGHT_CORE=~/e2e-tools/node_modules/playwright-core/index.mjs \
CHROME_BIN=/usr/bin/google-chrome \
./supabase/tests/run_magic_link_local.sh
```

Resultado esperado: `# pass 3`, `# fail 0`. Capturas en `SHOTS_DIR` (default `/tmp/onboarding-shots`).

El script:

1. crea la base `micava_magiclink`;
2. corre las migraciones de GoTrue y las del repo;
3. levanta el buzón SMTP, GoTrue, PostgREST, un gateway que imita la URL de Supabase (`/rest/v1`, `/auth/v1`) y la app;
4. crea `nueva.real@test.local` (sin perfil) y `existente.real@test.local` (perfil editor y un vino), y corre las pruebas.

Al terminar, o ante Ctrl+C, detiene todo y borra la base.

Salvaguardas:

- aborta si `PGHOST` parece un proyecto de Supabase;
- aborta si el puerto de la app está ocupado;
- aborta si la app servida no es la recién compilada.

## Ejecución manual (navegar a mano)

```bash
MODO=manual ./supabase/tests/run_magic_link_local.sh   # mismas variables que arriba
```

Deja todo levantado e imprime los pasos:

1. Abrí `http://127.0.0.1:4197` y pedí el link para `nueva.real@test.local` o `existente.real@test.local`.
2. Obtené el link con:
   ```bash
   node tests/onboarding/e2e/ultimo_link.mjs <buzón> nueva.real@test.local
   ```
3. Abrilo en el mismo navegador.

Ctrl+C termina y borra la base.

## Alternativa sin verificar: Supabase CLI local (Docker, Windows)

`supabase start` levanta el stack completo con Mailpit (`http://127.0.0.1:54324`) para leer los Magic Links. Hace falta un `config.toml`, que el repo no tiene: crearlo con `supabase init` en una **copia** del repo. Para registrar usuarios, usar Studio local (Authentication → Add user) con email confirmado, y después:

- `profiles`: SQL en Studio;
- app: `VITE_SUPABASE_URL=http://127.0.0.1:54321` y la `anon key` que imprime `supabase status`.

No se probó acá. Además, aplicar los baselines con `supabase db reset` sobre el stack local no se verificó: el runner de 7.1 (`run_supabase_local.ps1`) trabajó sin aplicar ni resetear migraciones.
