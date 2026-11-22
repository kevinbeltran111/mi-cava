// =============================================================================
// Etapa 7.3-B: fuerza de las inferencias (mecanismo, SIN reglas por defecto).
// =============================================================================
// Los niveles son los del esquema 7.1: 'indication' | 'relevant' | 'strong'.
//
// 7.3-B NO define umbrales. REGLAS_VALIDADAS es null: mientras siga así,
// toda agregación devuelve { nivel: null, estado: 'sin_regla_validada' } y
// no se propone ninguna inferencia. La calibración (con datos reales y
// autorización) debe producir un objeto de reglas con este formato:
//
//   {
//     version: "texto",                    // se registra en cada resultado
//     positiva: { strong: [cond], relevant: [cond], indication: [cond] },
//     negativa: { strong: [cond], relevant: [cond], indication: [cond] },
//   }
//   cond = { indicador: "monovarietal.favoritos", op: ">=", valor: 2 }
//
// Cada nivel se cumple si TODAS sus condiciones se cumplen; se evalúa de
// strong a indication. Un nivel ausente o vacío no se asigna nunca.
//
// validarReglas() impone, por principio (no por número), que:
//   * ningún nivel dependa solo de frecuencia de consumo
//     (consumosTotales / consumosSinPuntuar / diasConConsumo): frecuencia no
//     es satisfacción;
//   * 'relevant' y 'strong' exijan al menos dos observaciones independientes
//     (una condición >= 2 sobre vinosConEvidencia o experienciasPuntuadas):
//     una puntuación aislada no es preferencia consolidada.
// =============================================================================

export const NIVELES = Object.freeze(["strong", "relevant", "indication"]);
export const POLARIDADES = Object.freeze(["positiva", "negativa"]);

export const REGLAS_VALIDADAS = null;

const OPS = {
  ">=": (a, b) => a >= b,
  ">": (a, b) => a > b,
  "<=": (a, b) => a <= b,
  "<": (a, b) => a < b,
  "==": (a, b) => a === b,
};

const INDICADORES = new Set([
  "vinosEnBiblioteca", "vinosConEvidencia", "favoritos", "experienciasPuntuadas",
  "consumosSinPuntuar", "consumosTotales", "diasConConsumo",
  "puntuacion.n", "puntuacion.promedio", "puntuacion.min", "puntuacion.max",
]);
const SOLO_FRECUENCIA = new Set(["consumosTotales", "consumosSinPuntuar", "diasConConsumo", "vinosEnBiblioteca"]);
const INDEPENDENCIA = new Set(["vinosConEvidencia", "experienciasPuntuadas"]);

function partir(indicador) {
  const i = indicador.indexOf(".");
  const bloque = indicador.slice(0, i);
  const resto = indicador.slice(i + 1);
  return { bloque, resto };
}

function leer(bloques, indicador) {
  const { bloque, resto } = partir(indicador);
  const b = bloques?.[bloque];
  if (!b) return null;
  const v = resto.split(".").reduce((o, k) => (o == null ? null : o[k]), b);
  return typeof v === "number" ? v : null;
}

export function validarReglas(reglas) {
  const errores = [];
  if (reglas === null || reglas === undefined) return { ok: true, vacias: true, errores };
  if (typeof reglas !== "object" || typeof reglas.version !== "string" || !reglas.version.trim()) {
    return { ok: false, errores: ["Las reglas deben tener una versión."] };
  }
  for (const pol of Object.keys(reglas)) {
    if (pol !== "version" && !POLARIDADES.includes(pol)) errores.push(`Polaridad desconocida: ${pol}.`);
  }
  for (const pol of POLARIDADES) {
    const porNivel = reglas[pol] || {};
    for (const nivel of Object.keys(porNivel)) {
      if (!NIVELES.includes(nivel)) { errores.push(`Nivel desconocido: ${pol}.${nivel}.`); continue; }
      const conds = porNivel[nivel];
      if (!Array.isArray(conds) || !conds.length) { errores.push(`${pol}.${nivel}: sin condiciones.`); continue; }
      for (const c of conds) {
        const { resto } = partir(String(c?.indicador || ""));
        if (!INDICADORES.has(resto)) errores.push(`${pol}.${nivel}: indicador desconocido ${c?.indicador}.`);
        if (!OPS[c?.op]) errores.push(`${pol}.${nivel}: operador desconocido ${c?.op}.`);
        if (typeof c?.valor !== "number" || !Number.isFinite(c.valor)) errores.push(`${pol}.${nivel}: valor no numérico.`);
      }
      const nombres = conds.map((c) => partir(String(c?.indicador || "")).resto);
      if (nombres.every((n) => SOLO_FRECUENCIA.has(n))) {
        errores.push(`${pol}.${nivel}: depende solo de frecuencia de consumo.`);
      }
      if (nivel !== "indication") {
        const independiente = conds.some((c) => {
          const n = partir(String(c?.indicador || "")).resto;
          return INDEPENDENCIA.has(n) && (c.op === ">=" ? c.valor >= 2 : c.op === ">" ? c.valor >= 1 : false);
        });
        if (!independiente) errores.push(`${pol}.${nivel}: no exige al menos dos observaciones independientes.`);
      }
    }
  }
  return { ok: errores.length === 0, vacias: false, errores };
}

// bloques: indicadores de un grupo (agregacion.js → grupo.bloques).
// Devuelve, por polaridad, el nivel alcanzado o null, con trazabilidad.
export function evaluarFuerza(bloques, reglas = REGLAS_VALIDADAS) {
  if (reglas === null || reglas === undefined) {
    return { estado: "sin_regla_validada", version: null, positiva: null, negativa: null, mixta: false };
  }
  const v = validarReglas(reglas);
  if (!v.ok) return { estado: "reglas_invalidas", version: reglas?.version ?? null, errores: v.errores, positiva: null, negativa: null, mixta: false };

  const resultado = { estado: "evaluada", version: reglas.version, positiva: null, negativa: null, mixta: false };
  for (const pol of POLARIDADES) {
    for (const nivel of NIVELES) {
      const conds = reglas[pol]?.[nivel];
      if (!Array.isArray(conds) || !conds.length) continue;
      const cumple = conds.every((c) => {
        const val = leer(bloques, c.indicador);
        return val !== null && OPS[c.op](val, c.valor);
      });
      if (cumple) {
        resultado[pol] = { nivel, condiciones: conds.map((c) => ({ ...c, observado: leer(bloques, c.indicador) })) };
        break;
      }
    }
  }
  // Señales en ambos sentidos sobre el mismo alcance: no se resuelve acá.
  resultado.mixta = Boolean(resultado.positiva && resultado.negativa);
  return resultado;
}
