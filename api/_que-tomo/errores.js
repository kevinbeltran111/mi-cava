// =============================================================================
// Etapa 7.3-A: errores del recomendador «¿Qué tomo?» (código de servidor).
// =============================================================================
// Mismo estilo de la casa que src/onboarding/preferencias.js:
//   { ok: true, ... } | { ok: false, error: { tipo, mensaje, causa } }
//
// tipo:
//   validacion  datos de entrada rechazados antes de consultar nada
//   permiso     RLS / privilegios (42501) o trigger de pertenencia
//   restriccion CHECK, FK o unicidad (23xxx)
//   servidor    otro error informado por PostgreSQL / PostgREST
//   conexion    sin respuesta interpretable (red, timeout). NUNCA significa
//               «no hay datos».
// =============================================================================

export function fallo(tipo, mensaje, causa) {
  return { ok: false, error: { tipo, mensaje, causa: causa ?? null } };
}

export function clasificarError(err, mensaje = "No se pudieron leer o guardar los datos.") {
  const code = typeof err?.code === "string" ? err.code : "";
  if (code === "42501") return fallo("permiso", mensaje, err);
  if (/^23[0-9A-Z]{3}$/.test(code)) return fallo("restriccion", mensaje, err);
  if (/^[0-9A-Z]{5}$/.test(code) || code.startsWith("PGRST")) return fallo("servidor", mensaje, err);
  return fallo("conexion", mensaje, err);
}
