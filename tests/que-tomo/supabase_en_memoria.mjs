// 7.4-B1: doble EN MEMORIA de supabase-js para recorrer POST /api/que-tomo
// sin base. Solo implementa lo que usa el endpoint:
//   lectura   from(t).select(c).eq(k, v)[.order()][.range(a, b)|.maybeSingle()]
//   escritura from(t).insert(filas).select(c)[.single()]
//             from(t).update(v).eq(k, v).eq(k, v).select(c)
// 7.4-B2: además
//   from(t).update(v)...is(k, null) y filtros sobre JSON ("context->>revision")
//   RLS en lecturas de recommendation_sessions con el cliente del usuario
//   (cualquier clave distinta de la service_role): solo ve las propias.
//   barrera(n): las primeras n actualizaciones de recommendation_sessions
//   esperan a que lleguen todas, para forzar pedidos simultáneos que leyeron
//   la misma revisión.
// 7.4-B3: upsert(filas, { onConflict: "id" }); RLS de recommendation_items
//   (solo de sesiones propias) con el cliente del usuario; fallar("tabla:op")
//   hace fallar esa operación (p. ej. "recommendation_items:insert").
// Registra cada escritura en `escrituras` para verificar qué tablas se tocan.
import crypto from "node:crypto";

export const USUARIO = "00000000-0000-0000-0000-00000000c741";

// Escenario: { rol, preferencias, vinos: [{ id, nombre, bodega, varietal, stock, favorito, precio, puntuaciones: [n|null], created_at }], conocimiento }
export function crearBase(escenario) {
  const e = { rol: "editor", preferencias: null, vinos: [], conocimiento: [], ...escenario };
  const tablas = {
    profiles: [{ id: USUARIO, role: e.rol }],
    user_preferences: e.preferencias ? [{ user_id: USUARIO, ...e.preferencias }] : [],
    user_knowledge: e.conocimiento.map((k) => ({ user_id: USUARIO, status: "active", created_at: "2026-11-01T00:00:00Z", ...k })),
    wines: e.vinos.map((v, i) => ({
      id: v.id, nombre: v.nombre, bodega: v.bodega ?? null, varietal: v.varietal ?? null, anada: v.anada ?? null,
      region: null, lugar: null, maridaje: null, user_id: USUARIO,
      created_at: v.created_at ?? `2026-10-${String(28 - i).padStart(2, "0")}T00:00:00Z`,
    })),
    wine_privado: e.vinos.filter((v) => v.stock !== undefined).map((v) => ({
      wine_id: v.id, user_id: USUARIO, precio: v.precio ?? null, stock: v.stock, favorito: Boolean(v.favorito),
    })),
    consumos: e.vinos.flatMap((v) => (v.puntuaciones || []).map((p, j) => ({
      id: `${v.id}-c${j + 1}`, wine_id: v.id, user_id: USUARIO, fecha: `2026-09-${String(10 + j).padStart(2, "0")}T21:00:00Z`,
      puntuacion: p, comida: null, comentario: null,
    }))),
    recommendation_sessions: [],
    recommendation_items: [],
    recommendation_events: [],
  };
  const escrituras = [];
  const control = { barrera: null, fallas: new Set() };
  return {
    tablas, escrituras,
    fallar(clave) { control.fallas.add(clave); },
    reparar(clave) { control.fallas.delete(clave); },
    barrera(n) {
      let liberar;
      const abierta = new Promise((r) => { liberar = r; });
      control.barrera = { faltan: n, abierta, liberar };
    },
    crearCliente: (_url, clave) => clienteFalso(tablas, escrituras, { admin: clave === ENTORNO.SUPABASE_SERVICE_ROLE_KEY, control }),
  };
}

function valorDe(fila, k) {
  const m = /^(\w+)->>(\w+)$/.exec(k);
  if (!m) return fila[k];
  const v = fila[m[1]]?.[m[2]];
  return v === undefined || v === null ? null : String(v);
}

function proyectar(fila, cols) {
  if (!cols || cols === "*") return { ...fila };
  return Object.fromEntries(cols.split(",").map((c) => c.trim()).map((c) => [c, fila[c] ?? null]));
}

function clienteFalso(tablas, escrituras, { admin, control }) {
  return {
    auth: {
      async getUser(t) {
        // "token-bueno" o, para el E2E en navegador, un JWT de prueba cuyo sub
        // sea el usuario del escenario.
        let sub = null;
        try { sub = JSON.parse(Buffer.from(String(t).split(".")[1], "base64url").toString()).sub; } catch { sub = null; }
        return t === "token-bueno" || sub === USUARIO ? { data: { user: { id: USUARIO } }, error: null } : { data: { user: null }, error: { message: "invalid" } };
      },
    },
    from(tabla) {
      const filtros = [];
      let cols = "*";
      let op = "select";
      let carga = null;
      let rango = null;
      let ignorar = false;
      const q = {
        select(c) { cols = c; return q; },
        eq(k, v) { filtros.push([k, v]); return q; },
        is(k, v) { filtros.push([k, v]); return q; },
        order() { return q; },
        range(a, b) { rango = [a, b]; return q; },
        insert(filas) { op = "insert"; carga = Array.isArray(filas) ? filas : [filas]; return q; },
        update(v) { op = "update"; carga = v; return q; },
        upsert(filas, opciones = {}) { op = "upsert"; ignorar = Boolean(opciones.ignoreDuplicates); carga = Array.isArray(filas) ? filas : [filas]; return q; },
        async maybeSingle() { const { data, error } = await ejecutar(); return { data: data[0] ?? null, error }; },
        async single() { const { data, error } = await ejecutar(); return { data: data[0] ?? null, error }; },
        then(ok, mal) { return ejecutar().then(ok, mal); },
      };
      async function ejecutar() {
        const t = tablas[tabla];
        if (!t) return { data: null, error: { code: "42P01", message: `sin tabla ${tabla}` } };
        if (control.fallas.has(`${tabla}:${op}`)) return { data: null, error: { code: "XX000", message: `falla simulada ${tabla}:${op}` } };
        if (op === "upsert") {
          await Promise.resolve();
          const filas = carga.map((f) => {
            const existente = t.find((x) => x.id === f.id);
            if (existente && ignorar) return null; // ON CONFLICT DO NOTHING: no se devuelve
            if (existente) { Object.assign(existente, structuredClone(f), { updated_at: new Date().toISOString() }); return existente; }
            const nueva = { created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...structuredClone(f) };
            t.push(nueva);
            return nueva;
          });
          const nuevas = filas.filter(Boolean);
          escrituras.push({ tabla, op, filas: nuevas });
          return { data: nuevas.map((f) => proyectar(f, cols)), error: null };
        }
        if (op === "insert") {
          const nuevas = carga.map((f) => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), started_at: new Date().toISOString(), ...f }));
          t.push(...nuevas);
          escrituras.push({ tabla, op, filas: nuevas });
          return { data: nuevas.map((f) => proyectar(f, cols)), error: null };
        }
        if (op === "update" && tabla === "recommendation_sessions" && control.barrera && control.barrera.faltan > 0) {
          const b = control.barrera;
          b.faltan -= 1;
          if (b.faltan === 0) b.liberar();
          await b.abierta;
        }
        let coinciden = t.filter((f) => filtros.every(([k, v]) => valorDe(f, k) === v));
        if (!admin && op === "select" && tabla === "recommendation_sessions") coinciden = coinciden.filter((f) => f.user_id === USUARIO);
        if (!admin && op === "select" && tabla === "recommendation_items") {
          const propias = new Set(tablas.recommendation_sessions.filter((x) => x.user_id === USUARIO).map((x) => x.id));
          coinciden = coinciden.filter((f) => propias.has(f.session_id));
        }
        if (op === "update") {
          for (const f of coinciden) Object.assign(f, structuredClone(carga));
          escrituras.push({ tabla, op, filas: coinciden });
          return { data: coinciden.map((f) => proyectar(f, cols)), error: null };
        }
        const filas = rango ? coinciden.slice(rango[0], rango[1] + 1) : coinciden;
        return { data: filas.map((f) => proyectar(f, cols)), error: null };
      }
      return q;
    },
  };
}

export function resFalsa() {
  return { codigo: null, cuerpo: null, status(c) { this.codigo = c; return this; }, json(b) { this.cuerpo = b; return this; } };
}

export const ENTORNO = { VITE_SUPABASE_URL: "http://memoria.local", VITE_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "srv" };
