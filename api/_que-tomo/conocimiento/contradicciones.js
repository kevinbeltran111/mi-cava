// =============================================================================
// Etapa 7.3-B: contradicciones entre declaraciones, restricciones,
// conocimiento explícito y comportamiento.
// =============================================================================
// Solo se marcan como 'detectada' las contradicciones que se pueden afirmar
// sin umbrales ni interpretación de texto:
//
//   declaracion_vs_restriccion        onboarding elige X y hay una restricción
//                                     persistente sobre X. Prevalece la
//                                     restricción (es más específica y la
//                                     decisión de 7.1 es respetarlas).
//   restriccion_vs_favorito           un vino marcado favorito cae bajo una
//                                     restricción. Prevalece la restricción.
//   inferencia_vs_restriccion         una inferencia almacenada recae sobre
//                                     un alcance restringido. Prevalece la
//                                     restricción.
//   restriccion_vs_afinidad_calculada solo si hay reglas validadas y la
//                                     agregación resulta positiva.
//   declaracion_vs_afinidad_negativa  ídem, con resultado negativo.
//   senales_mixtas                    reglas validadas dan positiva y
//                                     negativa en el mismo alcance.
//
// Las que requieren interpretar algo que todavía no tiene contrato se
// listan como 'no_evaluable', sin resolverlas:
//   explicita_no_evaluable            preferencia explícita cuya polaridad
//                                     está pendiente (contrato de `value`)
//                                     sobre un alcance que también tiene
//                                     declaración, restricción o evidencia.
// =============================================================================

import { aplicaAVino } from "./explicito.js";
import { TIPOS_EVIDENCIA } from "./evidencias.js";

const misma = (a, tipo, clave) => a.tipo === tipo && a.clave !== null && a.clave === clave;

export function detectarContradicciones({ declaradas, conocimiento, extraccion, cepas, bodegas, fuerza = {} }) {
  const lista = [];
  const decl = declaradas?.registrada ? declaradas : null;
  const variedadesDeclaradas = new Set(decl?.variedades || []);
  const tiposDeclarados = new Set(decl?.tipos?.elegidos || []);

  // 1. Declaración vs restricción persistente.
  for (const r of conocimiento.restriccionesPersistentes) {
    const a = r.alcance;
    if ((a.tipo === "grape" && variedadesDeclaradas.has(a.clave)) || (a.tipo === "wine_type" && tiposDeclarados.has(a.clave))) {
      lista.push({
        tipo: "declaracion_vs_restriccion",
        estado: "detectada",
        alcance: { tipo: a.tipo, clave: a.clave },
        partes: [{ fuente: "onboarding", ref: "user_preferences" }, { fuente: "restriccion", ref: r.id }],
        prevalece: "restriccion",
      });
    }
  }

  // 2. Restricción vs favorito.
  const favoritos = (extraccion?.evidencias || []).filter((e) => e.tipo === TIPOS_EVIDENCIA.FAVORITO);
  for (const r of conocimiento.restriccionesPersistentes) {
    for (const f of favoritos) {
      const vino = extraccion.vinos.get(f.wineId);
      const ap = vino ? aplicaAVino(r.alcance, vino) : "no_evaluable";
      if (ap === "aplica" || ap === "posible") {
        lista.push({
          tipo: "restriccion_vs_favorito",
          estado: ap === "aplica" ? "detectada" : "posible",
          alcance: { tipo: r.alcance.tipo, clave: r.alcance.clave },
          partes: [{ fuente: "restriccion", ref: r.id }, { fuente: "evidencia", ref: f.id }],
          prevalece: "restriccion",
        });
      }
    }
  }

  // 3. Inferencia almacenada vs restricción.
  for (const inf of conocimiento.inferenciasAlmacenadas) {
    for (const r of conocimiento.restriccionesPersistentes) {
      if (misma(inf.alcance, r.alcance.tipo, r.alcance.clave)) {
        lista.push({
          tipo: "inferencia_vs_restriccion",
          estado: "detectada",
          alcance: { tipo: r.alcance.tipo, clave: r.alcance.clave },
          partes: [{ fuente: "inferencia", ref: inf.id }, { fuente: "restriccion", ref: r.id }],
          prevalece: "restriccion",
        });
      }
    }
  }

  // 4. Con reglas validadas: afinidades calculadas.
  const grupos = [
    ...(cepas?.grupos || []).map((g) => ({ tipo: "grape", g })),
    ...(bodegas?.grupos || []).map((g) => ({ tipo: "winery", g })),
  ];
  for (const { tipo, g } of grupos) {
    const f = fuerza[`${tipo}:${g.clave}`];
    if (!f || f.estado !== "evaluada") continue;
    const ref = { fuente: "agregacion", ref: `${tipo}:${g.clave}` };
    if (f.mixta) {
      lista.push({ tipo: "senales_mixtas", estado: "detectada", alcance: { tipo, clave: g.clave }, partes: [ref], prevalece: null });
    }
    if (f.positiva) {
      for (const r of conocimiento.restriccionesPersistentes) {
        if (misma(r.alcance, tipo, g.clave)) {
          lista.push({ tipo: "restriccion_vs_afinidad_calculada", estado: "detectada", alcance: { tipo, clave: g.clave }, partes: [{ fuente: "restriccion", ref: r.id }, ref], prevalece: "restriccion" });
        }
      }
    }
    if (f.negativa && tipo === "grape" && variedadesDeclaradas.has(g.clave)) {
      lista.push({ tipo: "declaracion_vs_afinidad_negativa", estado: "detectada", alcance: { tipo, clave: g.clave }, partes: [{ fuente: "onboarding", ref: "user_preferences" }, ref], prevalece: null });
    }
  }

  // 5. Explícitas sin polaridad interpretable que comparten alcance con algo.
  const clavesConEvidencia = new Set([
    ...(cepas?.grupos || []).map((g) => `grape:${g.clave}`),
    ...(bodegas?.grupos || []).map((g) => `winery:${g.clave}`),
  ]);
  for (const p of conocimiento.preferenciasExplicitas) {
    const a = p.alcance;
    if (!a.normalizado) continue;
    const partes = [{ fuente: "explicita", ref: p.id }];
    if (a.tipo === "grape" && variedadesDeclaradas.has(a.clave)) partes.push({ fuente: "onboarding", ref: "user_preferences" });
    if (a.tipo === "wine_type" && tiposDeclarados.has(a.clave)) partes.push({ fuente: "onboarding", ref: "user_preferences" });
    for (const r of conocimiento.restriccionesPersistentes) if (misma(r.alcance, a.tipo, a.clave)) partes.push({ fuente: "restriccion", ref: r.id });
    if (clavesConEvidencia.has(`${a.tipo}:${a.clave}`)) partes.push({ fuente: "agregacion", ref: `${a.tipo}:${a.clave}` });
    if (partes.length > 1) {
      lista.push({ tipo: "explicita_no_evaluable", estado: "no_evaluable", motivo: p.polaridad.estado, alcance: { tipo: a.tipo, clave: a.clave }, partes, prevalece: null });
    }
  }

  return lista;
}
