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
| Site URL y Redirect URLs | Supabase → Authentication → URL Configuration | Dominios de la app, más `http://localhost:5173` para desarrollo. |
| Send Email Hook | Supabase → Authentication → Hooks | Activo, tipo HTTPS, apunta a la Edge Function `send-email`. |
| Edge Function `send-email` | Supabase → Edge Functions | Desplegada desde `functions/send-email/`. "Verify JWT" desactivado: la función valida la firma del webhook. |
| Secrets de la Edge Function | Supabase → Edge Functions → Secrets | `RESEND_API_KEY`, `SEND_EMAIL_HOOK_SECRET`. `SUPABASE_URL` la provee el runtime. |
| Realtime | Supabase → Database → Publications | La publicación `supabase_realtime` no incluye tablas de este esquema. |
| Esquemas administrados por Supabase | Plataforma | `auth`, internos de `storage`, `realtime`, extensiones, roles y default privileges. |
| Datos | — | Usuarios, perfiles, roles asignados, vinos, solicitudes y archivos del bucket no forman parte del versionado. |
| Primer administrador | — | La asignación del rol `admin` es un dato, no esquema. No hay un procedimiento versionado para hacerla. |
| Variables de entorno del frontend y de `/api` | Vercel | Ver `.env.example` en la raíz del repositorio. |

Cambiar cualquiera de estos elementos no se registra en `migrations/`.

---

## Archivos históricos

`historico/schema.sql` e `historico/migration_roles.sql` fueron el esquema inicial y el sistema de roles. Están **reemplazados por el baseline** y **no deben ejecutarse**: crearían un esquema distinto al de producción. Ver `historico/README.md`.
