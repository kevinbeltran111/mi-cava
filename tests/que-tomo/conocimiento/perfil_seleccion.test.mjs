// 7.3-B: perfil explicable, criterios de aceptación y selección por consulta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { construirConocimiento, responderCriterios } from "../../../api/_que-tomo/conocimiento/perfil.js";
import { seleccionarParaConsulta, MAX_COMENTARIO } from "../../../api/_que-tomo/conocimiento/seleccion.js";
import { MODOS_PERMITIDOS } from "../../../api/_que-tomo/motor.js";
import { contexto, conocimiento, preferencias, U, OTRO } from "./datos.mjs";

function escenario() {
  return contexto({
    preferencias: preferencias({ preferred_grapes: ["malbec", "cabernet_franc"], exploration_open: true }),
    vinos: [
      { id: "fav", nombre: "Uno", varietal: "Malbec", bodega: "Bodega A", stock: 2, favorito: true, precio: 18000,
        consumos: [{ id: "c1", fecha: "2026-10-10T21:00:00Z", puntuacion: 4.5, comida: "Asado", comentario: "Ideal con el asado de los domingos" }] },
      { id: "cf", nombre: "Dos", varietal: "Cabernet Franc", bodega: "Bodega B", stock: 6 },
      { id: "torr", nombre: "Tres", varietal: "Torrontés", bodega: "Bodega C", stock: 1,
        consumos: [{ id: "c2", fecha: "2026-09-10T21:00:00Z", puntuacion: 1.5, comida: "Pescado al horno", comentario: "No me gustó nada, muy dulce" }] },
      { id: "vacio", nombre: "Cuatro", varietal: "Pinot Noir", stock: 0,
        consumos: [{ id: "c3", fecha: "2026-08-10T21:00:00Z", puntuacion: null, comida: "Pastas", comentario: "Lo abrimos en el cumpleaños de mi hermana" }] },
    ],
    conocimiento: [
      conocimiento({ id: "ocasion", knowledge_type: "explicit", scope_type: "wine", wine_id: "fav", wine_snapshot: { nombre: "Uno" }, meaning: "Lo guardo para ocasiones especiales" }),
      conocimiento({ id: "no-torr", knowledge_type: "restriction", scope_type: "grape", scope_value: "torrontes", meaning: "No me recomiendes Torrontés" }),
    ],
  });
}

const sel = (ctx, consulta) => {
  const k = construirConocimiento(ctx);
  const r = seleccionarParaConsulta({ contexto: ctx, ...k }, consulta);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.seleccion;
};

test("usuario nuevo sin historial ni preferencias: perfil vacío y sin inventar nada", () => {
  const ctx = contexto();
  const { perfil } = construirConocimiento(ctx);
  assert.deepEqual(perfil.declarado, { registrada: false });
  assert.equal(perfil.hechos.vinos, 0);
  assert.deepEqual(perfil.inferencias.calculadas.cepas.grupos, []);
  assert.deepEqual(perfil.contradicciones, []);
  const s = sel(ctx, { modo: "food", temporal: { comida: "asado" } });
  assert.deepEqual([s.candidatos, s.afinidades, s.experiencias], [[], [], []]);
  assert.deepEqual(s.declarado, { registrada: false });
});

test("preferencias declaradas sin comportamiento: se informan como declaradas, sin afinidades", () => {
  const ctx = contexto({ preferencias: preferencias({ preferred_grapes: ["malbec"] }) });
  const { perfil } = construirConocimiento(ctx);
  assert.deepEqual(perfil.declarado.variedadesEtiquetas, ["Malbec"]);
  assert.deepEqual(perfil.inferencias.calculadas.cepas.grupos, []);
  const s = sel(ctx, { modo: "discovery" });
  assert.deepEqual(s.declarado.variedades, ["Malbec"]);
  assert.deepEqual(s.afinidades, []);
});

test("perfil: separa declarado, hechos, explícito, restricciones, inferencias y temporal", () => {
  const { perfil } = construirConocimiento(escenario());
  assert.deepEqual(Object.keys(perfil).sort(), ["contradicciones", "declarado", "explicito", "hechos", "inferencias", "restricciones", "temporal", "usuarioId", "version", "versionContexto"].sort());
  assert.equal(perfil.temporal, null);
  assert.deepEqual([perfil.hechos.vinos, perfil.hechos.disponibles, perfil.hechos.favoritos, perfil.hechos.consumos, perfil.hechos.consumosPuntuados], [4, 3, 1, 3, 2]);
  assert.equal(perfil.explicito.conocimientoDeVinos[0].explicacion.vinoObjetivo.estado, "vigente");
  assert.equal(perfil.inferencias.calculadas.reglas.estado, "sin_regla_validada");
});

test("criterios de aceptación: las siete preguntas tienen respuesta", () => {
  const ctx = escenario();
  const { perfil, extraccion } = construirConocimiento(ctx);
  const s = seleccionarParaConsulta({ contexto: ctx, perfil, extraccion }, { modo: "cellar", temporal: { restricciones: [{ alcance: { tipo: "grape", valor: "malbec" }, texto: "hoy no quiero Malbec" }] } }).seleccion;
  const r = responderCriterios(perfil, s);
  assert.deepEqual(r.queDeclaro.variedades, ["malbec", "cabernet_franc"]);
  assert.equal(r.queHechosRegistro.vinos, 4);
  assert.deepEqual(r.queSePuedeInferir.calculadas, []); // sin reglas validadas, nada se afirma
  assert.equal(r.queSePuedeInferir.reglas.estado, "sin_regla_validada");
  const malbec = r.conQueEvidencias.find((e) => e.clave === "malbec");
  assert.deepEqual(malbec.evidencias.monovarietal, ["consumo:c1", "favorito:fav"]);
  assert.deepEqual(malbec.fuerza, { estado: "sin_regla_validada" });
  assert.deepEqual(r.restriccionesPersistentes.map((x) => x.significado), ["No me recomiendes Torrontés"]);
  assert.equal(r.queSeEnviariaAlRecomendador.modo, "cellar");
  assert.deepEqual(r.ocasionalVsPermanente.temporalesDeLaConsulta.map((t) => t.persistente), [false]);
  assert.equal(r.ocasionalVsPermanente.perfilTemporal, null);
});

test("restricción persistente y temporal excluyen candidatos, con su motivo", () => {
  const s = sel(escenario(), { modo: "cellar", temporal: { restricciones: [{ alcance: { tipo: "grape", valor: "malbec" } }] } });
  assert.deepEqual(s.candidatos.map((c) => c.wineId), ["cf"]);
  assert.deepEqual(s.excluidos.map((x) => [x.wineId, x.motivos[0].origen]).sort(), [["fav", "temporal"], ["torr", "persistente"]]);
  // la restricción temporal no aparece como persistente
  assert.deepEqual(s.restricciones.persistentes.map((r) => r.alcance.clave), ["torrontes"]);
  assert.deepEqual(s.restricciones.temporales.map((r) => [r.alcance.clave, r.persistente]), [["malbec", false]]);
  // y marca las afinidades del mismo alcance
  assert.deepEqual(s.afinidades.find((a) => a.clave === "malbec").restringida, ["temporal"]);
});

test("sin restricción temporal, el mismo vino vuelve a ser candidato (no se recuerda)", () => {
  const ctx = escenario();
  sel(ctx, { modo: "cellar", temporal: { restricciones: [{ alcance: { tipo: "grape", valor: "malbec" } }] } });
  const s = sel(ctx, { modo: "cellar" });
  assert.ok(s.candidatos.some((c) => c.wineId === "fav"));
  const { perfil } = construirConocimiento(ctx);
  assert.equal(JSON.stringify(perfil).includes("temporal:"), false);
});

test("food: solo experiencias con comida coincidente; comentarios recortados", () => {
  const ctx = contexto({
    vinos: [
      { id: "a", varietal: "Malbec", stock: 1, consumos: [{ id: "x1", comida: "Asado del domingo", comentario: "z".repeat(1000), puntuacion: 5 }] },
      { id: "b", varietal: "Syrah", stock: 1, consumos: [{ id: "x2", comida: "Pescado", comentario: "privado: no corresponde" }] },
    ],
  });
  const s = sel(ctx, { modo: "food", temporal: { comida: "un asado" } });
  assert.deepEqual(s.experiencias.map((e) => e.vino.wineId), ["a"]);
  assert.equal(s.experiencias[0].comentario.length, MAX_COMENTARIO);
  assert.equal(JSON.stringify(s).includes("privado: no corresponde"), false);
  assert.deepEqual([s.omitido.experienciasNoEnviadas, s.omitido.comentariosNoEnviados], [1, 1]);
});

test("food: las experiencias de vinos excluidos no se envían", () => {
  const s = sel(escenario(), { modo: "food", temporal: { comida: "asado", restricciones: [{ alcance: { tipo: "grape", valor: "malbec" } }] } });
  assert.deepEqual(s.experiencias, []);
});

test("cellar: solo vinos disponibles y con su conocimiento específico", () => {
  const s = sel(escenario(), { modo: "cellar" });
  assert.deepEqual(s.candidatos.map((c) => c.wineId).sort(), ["cf", "fav"]);
  assert.deepEqual(s.candidatos.find((c) => c.wineId === "fav").conocimiento, ["Lo guardo para ocasiones especiales"]);
  assert.equal(s.omitido.vinosNoDisponibles, 1);
  // el comentario del vino no disponible no viaja
  assert.equal(JSON.stringify(s).includes("cumpleaños de mi hermana"), false);
});

test("discovery: sin candidatos ni experiencias de la biblioteca, con afinidades agregadas", () => {
  const s = sel(escenario(), { modo: "discovery" });
  assert.deepEqual([s.candidatos, s.experiencias], [[], []]);
  assert.ok(s.afinidades.length > 0);
  assert.equal(JSON.stringify(s).match(/asado de los domingos|muy dulce|cumpleaños/i), null);
  // la capa admite discovery, pero el endpoint de 7.3-A sigue sin admitirlo
  assert.equal(MODOS_PERMITIDOS.includes("discovery"), false);
});

test("modo y temporal inválidos se rechazan", () => {
  const ctx = escenario();
  const k = construirConocimiento(ctx);
  assert.equal(seleccionarParaConsulta({ contexto: ctx, ...k }, { modo: "otro" }).ok, false);
  assert.equal(seleccionarParaConsulta({ contexto: ctx, ...k }, { modo: "food", temporal: { comida: 1 } }).ok, false);
});

test("privacidad: sin id de usuario, precio pagado ni comentarios no pertinentes", () => {
  const s = sel(escenario(), { modo: "cellar" });
  const texto = JSON.stringify(s);
  assert.equal(texto.includes(U), false);
  assert.equal(texto.includes("18000"), false);
  assert.equal(texto.includes("precio"), false);
  assert.equal(texto.includes("muy dulce"), false); // vino excluido por restricción
});

test("aislamiento: el perfil y la selección solo contienen datos del contexto recibido", () => {
  const deU = escenario();
  const deOtro = contexto({ vinos: [{ id: "ajeno", nombre: "Ajeno", varietal: "Malbec", stock: 3, favorito: true, consumos: [{ id: "cx", comida: "Asado", comentario: "secreto del otro" }] }] }, OTRO);
  const pU = construirConocimiento(deU);
  const pO = construirConocimiento(deOtro);
  const sU = JSON.stringify([pU.perfil, seleccionarParaConsulta({ contexto: deU, ...pU }, { modo: "food", temporal: { comida: "asado" } })]);
  assert.equal(sU.includes("\"ajeno\""), false);
  assert.equal(sU.includes("secreto del otro"), false);
  assert.equal(sU.includes(OTRO), false);
  assert.equal(pO.perfil.usuarioId, OTRO);
  assert.equal(JSON.stringify(pO.perfil).includes('"fav"'), false);
  assert.equal(JSON.stringify(pO.perfil).includes("Ideal con el asado"), false);
});
