// =============================================================================
// Etapa 7.3-B: punto de entrada del motor de conocimiento personal.
// =============================================================================
// Uso previsto (7.4, dentro de api/que-tomo.js, después del paso 3):
//
//   const ctx = await construirContexto(userClient, userId);   // 7.3-A
//   const { perfil, extraccion } = construirConocimiento(ctx.contexto);
//   const sel = seleccionarParaConsulta({ contexto: ctx.contexto, perfil, extraccion },
//                                       { modo, temporal });
//
// Este módulo no lee ni escribe la base y no llama a ningún proveedor de IA.
// =============================================================================

export { construirConocimiento, responderCriterios, VERSION_PERFIL } from "./perfil.js";
export { seleccionarParaConsulta, MODOS_CONOCIMIENTO } from "./seleccion.js";
export { normalizarContextoTemporal } from "./temporal.js";
export { prepararCambios, prepararRevocacion, ESCRITURA_HABILITADA } from "./persistencia.js";
export { REGLAS_VALIDADAS, validarReglas, evaluarFuerza } from "./fuerza.js";
export { reconstruir } from "./explicar.js";
export { clasificarVarietal, claveBodega } from "./normalizacion.js";
