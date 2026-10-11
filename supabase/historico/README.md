# SQL histórico — NO EJECUTAR

Los archivos de esta carpeta son **históricos y están reemplazados (superseded)**. No describen el estado actual de la base de datos y **no deben ejecutarse** en ningún entorno.

| Archivo | Qué fue |
|---|---|
| `schema.sql` | Esquema inicial del proyecto (tablas `profiles`, `wines`, `ratings`; policies y permisos originales). |
| `migration_roles.sql` | Sistema de roles admin / editor / viewer, funciones de rol, auditoría y panel de administración. |

Después de estos archivos, la base de producción recibió otras migraciones que nunca se versionaron. No se reconstruyeron.

El estado vigente de la base está en el **baseline versionado**:

- `supabase/migrations/20261010000000_baseline_produccion.sql`
- `supabase/migrations/20261010000001_baseline_storage.sql`

Ver `supabase/README.md`.
