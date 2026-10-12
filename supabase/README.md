# Base de datos de Mi Cava (Supabase)

Esta carpeta contiene la definición versionada de la base de datos de Mi Cava y el código de la Edge Function de emails.

```
supabase/
├── migrations/      ← fuente versionada del esquema (baseline + migraciones futuras)
├── historico/       ← SQL antiguo, reemplazado. NO EJECUTAR.
└── functions/
    └── send-email/  ← Edge Function del Send Email Hook de Supabase Auth
```

---

## Baseline (punto cero)

El estado de la base de datos de producción al **2026-10-10** está representado por:

| Orden | Archivo | Contenido |
|---|---|---|
| 1 | `migrations/20261010000000_baseline_produccion.sql` | Esquema `public`: tablas, columnas, constraints, foreign keys, índices, funciones, triggers, RLS, policies y privilegios. |
| 2 | `migrations/20261010000001_baseline_storage.sql` | Bucket `etiquetas` y policies de la aplicación sobre `storage.objects`. |

- Se generó a partir de una verificación de solo lectura de los catálogos de producción (PostgreSQL 17.6) y se validó contra esa verificación en una base descartable.
- Representa el **estado vigente**, no la historia de cómo se llegó a él. Las migraciones anteriores al baseline no están versionadas y no se reconstruyeron.
- Reproduce el estado tal cual, incluidos los privilegios. No contiene correcciones ni mejoras.
- **No se aplica sobre producción**, que ya está en este estado. Cada archivo corre en una única transacción y empieza con una guarda que aborta sin cambiar nada si el esquema ya existe.
- Para crear una base nueva equivalente, los dos archivos se aplican **en orden** sobre un proyecto Supabase vacío. Requieren lo que provee Supabase: `auth.users`, `auth.uid()`, el esquema `storage` y los roles `anon`, `authenticated` y `service_role`.

## Regla para cambios futuros

> Todo cambio futuro de base de datos debe quedar representado por una nueva migración versionada. Los archivos de baseline no se modifican. El procedimiento de aplicación de migraciones a producción se define separadamente.

Las migraciones nuevas van en `migrations/`, con un nombre que empiece con un timestamp posterior a `20261010000001`.

### Privilegios de tablas nuevas

En el proyecto de producción, las tablas que crea el rol `postgres` en `public` reciben por defecto, para `anon`, `authenticated` y `service_role`, únicamente `TRUNCATE`, `REFERENCES`, `TRIGGER` y `MAINTAIN`, sin `SELECT`, `INSERT`, `UPDATE` ni `DELETE`. Las funciones nuevas solo son ejecutables por `postgres`.

Por eso, cada migración que cree una tabla o función debe otorgar explícitamente los privilegios que necesite, además de sus policies de RLS. Ni la API ni el código de servidor con `service_role` pueden usar una tabla sin esos privilegios. Esto se verificó el 2026-10-10.

---

## Modelo de datos (resumen)

| Tabla | Propósito |
|---|---|
| `profiles` | Perfil 1:1 de cada usuario de Auth. `role` ∈ admin / editor / viewer. |
| `wines` | Identidad del vino (nombre, bodega, varietal, añada, región, lugar, maridaje, foto). El `id` lo genera el cliente. |
| `wine_privado` | Datos privados del vino (precio, stock, favorito). Relación 1:1 con `wines`. |
| `consumos` | Aperturas y experiencias (fecha, puntuación, comentario, comida). |
| `ratings` | Puntaje por persona y vino. Tabla legado. |
| `access_requests` | Solicitudes de acceso a la beta. |
| `role_audit_log` | Registro de cambios de rol. |

Funciones expuestas como RPC: `registrar_consumo`, `admin_list_users`, `admin_set_role`.
Funciones usadas por las policies: `is_admin`, `can_edit`.

El detalle exacto (RLS, policies, privilegios y triggers) está en el archivo de baseline, que es la fuente de verdad versionada.

---

## Lo que no está representado en SQL

Estos elementos son parte del funcionamiento de la aplicación pero no se definen con migraciones. Se configuran en los dashboards de Supabase y de Vercel.

| Elemento | Dónde se configura | Estado al 2026-10-10 |
|---|---|---|
| Registro abierto de usuarios | Supabase → Authentication | Desactivado. El acceso es por invitación. |
| Proveedores de login | Supabase → Authentication | Solo Email (link mágico). |
| Site URL y Redirect URLs | Supabase → Authentication → URL Configuration | Ver [Previews de Vercel y pruebas](#previews-de-vercel-y-pruebas) (actualizado al 2026-10-12). |
| Send Email Hook | Supabase → Authentication → Hooks | Activo, tipo HTTPS, apunta a la Edge Function `send-email`. |
| Edge Function `send-email` | Supabase → Edge Functions | Desplegada desde `functions/send-email/`. "Verify JWT" desactivado: la función valida la firma del webhook. |
| Secrets de la Edge Function | Supabase → Edge Functions → Secrets | `RESEND_API_KEY`, `SEND_EMAIL_HOOK_SECRET`. `SUPABASE_URL` la provee el runtime. |
| Realtime | Supabase → Database → Publications | La publicación `supabase_realtime` no incluye tablas de este esquema. |
| Esquemas administrados por Supabase | Plataforma | `auth`, internos de `storage`, `realtime`, extensiones, roles y default privileges. |
| Datos | — | Usuarios, perfiles, roles asignados, vinos, solicitudes y archivos del bucket no forman parte del versionado. |
| Primer administrador | — | La asignación del rol `admin` es un dato, no esquema. No hay un procedimiento versionado para hacerla. |
| Variables de entorno del frontend y de `/api` | Vercel | Ver `.env.example` en la raíz del repositorio. Alcance por entorno: ver [Previews de Vercel y pruebas](#previews-de-vercel-y-pruebas). |

Cambiar cualquiera de estos elementos no se registra en `migrations/`.

---

## Previews de Vercel y pruebas

Política vigente desde el 2026-10-12 para probar cambios en Preview deployments de Vercel antes de publicarlos en Producción.

### Un solo proyecto Supabase

Existe **un único proyecto Supabase**, el de Producción. No hay staging ni branches de Supabase. Los Preview deployments de Vercel usan ese mismo proyecto: **las pruebas en Preview operan sobre datos, usuarios, emails y archivos reales.**

### Supabase Auth → URL Configuration

| Campo | Valor |
|---|---|
| Site URL | `https://www.cavavinos.app` |
| Redirect URLs | `http://localhost:5173` |
| | `https://cavavinos.vercel.app/` |
| | `https://www.cavavinos.com.ar/` |
| | `https://www.cavavinos.app` |
| | `https://mi-cava-git-*-cava10.vercel.app` (Previews) |

El patrón de Preview cubre únicamente la URL de branch de este proyecto de Vercel (`mi-cava-git-<branch>-cava10.vercel.app`). En los patrones de Supabase, `*` no incluye `.` ni `/`, así que el patrón no autoriza:

- las URLs por commit (`mi-cava-<hash>-cava10.vercel.app`);
- otros proyectos del team o de otros teams;
- paths (`…vercel.app/algo`) ni `http://`.

El login por link mágico usa `emailRedirectTo: window.location.origin`, por eso el patrón no lleva path.

No se registran URLs de Preview específicas por branch.

Las invitaciones de `api/invite-approved-user.js` no envían `redirectTo`: el invitado siempre llega al Site URL de Producción, también si la aprobación se hizo desde un Preview.

### Convención de nombres de branch

Máximo **40 caracteres**. Vercel recorta la URL de branch cuando supera los 63 caracteres y, en ese caso, la URL puede dejar de coincidir con el patrón de Supabase.

### Variables de entorno en Vercel

| Variable | Production | Preview |
|---|---|---|
| `VITE_SUPABASE_URL` | Sí | Sí |
| `VITE_SUPABASE_ANON_KEY` | Sí | Sí |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | **No** |
| `ANTHROPIC_API_KEY` | Sí | **No** |

Por defecto, un Preview solo recibe `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, que son públicas por diseño.

Sin los secretos, en un Preview fallan con "Faltan variables de entorno en el servidor":

- la subida de fotos (`api/upload-photo.js`);
- la aprobación de solicitudes de acceso (`api/invite-approved-user.js`);
- la identificación de vinos por foto (`api/identify-wine.js`).

Es el comportamiento esperado.

**Secretos privilegiados en Preview, solo por excepción:**

- Se habilitan únicamente cuando la tarea necesita probar esos flujos.
- Siempre que sea posible, se habilitan como variable de Preview limitada a la branch que los necesita (opción *Git branch* de Vercel), no para todo Preview.
- Son temporales: se quitan al cerrar la tarea.
- Cambiar variables en Vercel no afecta a los deployments ya construidos. Un Preview que se construyó con secretos los conserva hasta que se elimina el deployment.

### Protección de los Previews

- **Vercel Authentication:** activa para todos los deployments excepto los dominios propios. Solo se puede abrir un Preview estando logueado en Vercel con acceso al team.
- **Fork protection:** activa. Los PRs desde forks requieren autorización para desplegarse.

### Cambios que no deben probarse en Preview contra Producción

No asumir seguro probar en Preview:

- migraciones o cambios de esquema;
- cambios de RLS, policies, privilegios o funciones SQL;
- backfills, correcciones de datos o borrados masivos;
- cambios en funciones de `/api` que escriben con `service_role`;
- cambios en el Send Email Hook o la Edge Function `send-email`. Las Edge Functions no tienen Preview: se despliegan directamente en Producción;
- cambios de configuración de Auth (providers, URLs, plantillas, hooks) o de Storage (bucket y policies);
- flujos de roles, administración o aprobación que generen emails a terceros.

Para estos casos hace falta otro entorno, por ejemplo una base local con Supabase CLI aplicando las migraciones de `migrations/`. No hay staging definido a la fecha.

### Procedimiento

1. **Branch.** Desde `main` actualizado, con nombre de 40 caracteres o menos.
2. **Preview.** Push. Vercel publica `https://mi-cava-git-<branch>-cava10.vercel.app`. Probar en esa URL, no en la URL por commit, que no está autorizada para el login.
3. **Secretos (solo si hace falta).** Agregar la variable necesaria como variable de Preview limitada a esa branch y volver a desplegar.
4. **Prueba.** Pedir el link mágico desde el Preview, con una cuenta propia de prueba. Usar datos de prueba y borrarlos al terminar. No aprobar solicitudes reales ni invitar a terceros.
5. **PR y merge.** Abrir PR hacia `main` y mergear.
6. **Production.** Esperar que el deployment de Producción quede listo (READY).
7. **Smoke test** en `https://www.cavavinos.app`:
   - login por link mágico;
   - listado;
   - alta y borrado de un vino de prueba;
   - el flujo que tocó la tarea.
8. **Limpieza.**
   - Quitar las variables de Preview limitadas a la branch, si se habían agregado.
   - Eliminar los Preview deployments de la branch en Vercel.
   - Eliminar la branch en GitHub. El borrado automático de branches al mergear no está activado en el repositorio, así que se hace a mano.

---

## Archivos históricos

`historico/schema.sql` e `historico/migration_roles.sql` fueron el esquema inicial y el sistema de roles. Están **reemplazados por el baseline** y **no deben ejecutarse**: crearían un esquema distinto al de producción. Ver `historico/README.md`.
