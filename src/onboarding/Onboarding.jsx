// =============================================================================
// Etapa 7.2-B: interfaz del onboarding de preferencias y «Mis preferencias».
// =============================================================================
// Diseño aprobado: opción A, tarjetas tipográficas (sin fotos ni íconos
// decorativos). Usa la paleta real de Mi Cava, que App.jsx pasa como `tema`
// (no se duplica ni se redefine acá).
// Persistencia: src/onboarding/preferencias.js (7.2-A). Reglas: flujo.js.
// =============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, X, Loader2 } from "lucide-react";
import { TIPOS_VINO, NIVELES_CONOCIMIENTO, organizarVariedades, etiquetaVariedad } from "./catalogo.js";
import {
  CARGA,
  PASOS,
  leerPreferencias,
  iniciarOnboarding,
  guardarProgreso,
  completarOnboarding,
  omitirOnboarding,
  editarPreferencias,
} from "./preferencias.js";
import {
  SELECCION_TIPOS_VACIA,
  seleccionTiposDesdePreferencias,
  alternarTipo,
  alternarExploracion,
  alternarSinPreferencia,
  respuestaTipos,
  tiposParaPriorizar,
  alternarEnLista,
  alternarNivel,
  cambiosEdicion,
  lecturaConTiempoLimite,
  escrituraConTiempoLimite,
} from "./flujo.js";

export const TEXTOS = Object.freeze({
  bienvenidaTitulo: "Conozcamos un poco tus gustos",
  bienvenidaSubtitulo: "Esto nos va a ayudar a recomendarte qué tomar",
  empezar: "Empezar",
  continuarInvitacion: "Continuar",
  ahoraNoCava: "Ahora no, ir a mi cava",
  ahoraNo: "Ahora no",
  tiposTitulo: "¿Qué tipos de vino te gustan?",
  sinPreferencia: "No tengo preferencia todavía",
  probarTodo: "Me gusta probar de todo",
  variedadesTitulo: "¿Hay alguna variedad que te guste especialmente?",
  verMas: "Ver más variedades",
  conocimientoTitulo: "¿Cómo es tu relación con el vino?",
  cierreTitulo: "Listo. Ya nos conocemos un poco mejor",
  cierreTexto: "Mi Cava va a ir aprendiendo de tus favoritos, tus puntuaciones y tus experiencias.",
  irACava: "Ir a Mi Cava",
  continuar: "Continuar",
  atras: "Atrás",
  guardando: "Guardando...",
  errorGuardar: "No pudimos guardar tus respuestas. Revisá tu conexión y probá de nuevo.",
  misPreferencias: "Mis preferencias",
  guardar: "Guardar",
  cancelar: "Cancelar",
  errorCargar: "No pudimos cargar tus preferencias.",
  reintentar: "Reintentar",
});

function cssOnboarding(t) {
  return `
.onb-page { min-height: 100vh; background: ${t.CREAM}; font-family: ${t.SANS}; color: ${t.INK}; box-sizing: border-box; padding: 20px 16px 40px; }
.onb-col { max-width: 560px; margin: 0 auto; }
.onb-marca { font-family: ${t.SERIF}; color: ${t.BORDEAUX}; font-weight: 700; font-size: 18px; display: inline-block; border-bottom: 2px solid ${t.GOLD}; padding-bottom: 2px; }
.onb-top { display: flex; align-items: center; justify-content: space-between; min-height: 36px; margin-bottom: 18px; }
.onb-back { display: inline-flex; align-items: center; gap: 6px; background: none; border: none; color: ${t.MUTED}; font: inherit; font-size: 14px; cursor: pointer; padding: 6px 2px; }
.onb-back:hover { color: ${t.BORDEAUX}; }
.onb-h1 { font-family: ${t.SERIF}; color: ${t.BORDEAUX}; font-size: 26px; line-height: 1.25; margin: 0 0 8px; font-weight: 700; outline: none; }
.onb-sub { color: ${t.MUTED}; font-size: 15px; line-height: 1.5; margin: 0 0 24px; }
.onb-centro { text-align: center; padding-top: 12vh; }
.onb-centro .onb-sub { margin-bottom: 32px; }
.onb-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.onb-lista { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
.onb-sep { height: 1px; background: ${t.BORDER}; margin: 16px 0; border: 0; }
.onb-card { appearance: none; -webkit-appearance: none; font: inherit; text-align: left; cursor: pointer; box-sizing: border-box; width: 100%; min-height: 52px; padding: 13px 14px; border-radius: 10px; border: 1px solid ${t.BORDER}; background: ${t.CARD_BG}; color: ${t.INK}; display: flex; flex-direction: column; justify-content: center; gap: 3px; transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease; -webkit-tap-highlight-color: transparent; }
.onb-card:hover { border-color: ${t.GOLD}; }
.onb-card:focus-visible { outline: 2px solid ${t.GOLD}; outline-offset: 2px; }
.onb-card-titulo { font-family: ${t.SERIF}; font-size: 16px; line-height: 1.3; overflow-wrap: anywhere; }
.onb-card-desc { font-size: 13px; color: ${t.MUTED}; line-height: 1.35; }
.onb-card[aria-pressed="true"] { background: ${t.BORDEAUX}; border-color: ${t.BORDEAUX}; color: ${t.CREAM}; }
.onb-card[aria-pressed="true"] .onb-card-desc { color: ${t.GOLD_SOFT}; }
.onb-card:disabled { cursor: default; opacity: 0.7; }
.onb-mas { appearance: none; background: none; border: none; font: inherit; color: ${t.BORDEAUX}; font-size: 14px; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; padding: 14px 2px 2px; }
.onb-acciones { margin-top: 28px; display: flex; flex-direction: column; align-items: stretch; gap: 10px; }
.onb-primario { appearance: none; border: none; border-radius: 8px; background: ${t.BORDEAUX}; color: ${t.CREAM}; font: inherit; font-size: 15px; font-weight: 700; padding: 14px 20px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.onb-primario:hover:not(:disabled) { background: ${t.BORDEAUX_DARK}; }
.onb-primario:focus-visible { outline: 2px solid ${t.GOLD}; outline-offset: 2px; }
.onb-primario:disabled { opacity: 0.75; cursor: default; }
.onb-secundario { appearance: none; border: 1px solid ${t.BORDER}; border-radius: 8px; background: transparent; color: ${t.INK}; font: inherit; font-size: 14px; padding: 12px 18px; cursor: pointer; }
.onb-omitir { appearance: none; background: none; border: none; font: inherit; color: ${t.MUTED}; font-size: 13.5px; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; padding: 6px; align-self: center; }
.onb-omitir:hover:not(:disabled) { color: ${t.BORDEAUX}; }
.onb-omitir:disabled { cursor: default; opacity: 0.6; }
.onb-error { margin: 0; background: #F5E6E1; border: 1px solid ${t.DANGER}; color: ${t.DANGER}; padding: 10px 14px; border-radius: 8px; font-size: 13.5px; }
.onb-spin { animation: onb-spin 0.8s linear infinite; }
@keyframes onb-spin { to { transform: rotate(360deg); } }

.onb-invita { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 20px; background: ${t.CARD_BG}; border: 1px solid ${t.BORDER}; border-left: 3px solid ${t.GOLD}; border-radius: 10px; padding: 14px 16px; margin-bottom: 20px; }
.onb-invita-txt { flex: 1 1 260px; min-width: 0; }
.onb-invita h2 { font-family: ${t.SERIF}; color: ${t.BORDEAUX}; font-size: 17px; margin: 0 0 3px; font-weight: 700; }
.onb-invita p { margin: 0; color: ${t.MUTED}; font-size: 13.5px; }
.onb-invita-acc { display: flex; align-items: center; gap: 6px; }
.onb-invita .onb-primario { padding: 10px 18px; font-size: 14px; }

.onb-modal-fondo { position: fixed; inset: 0; background: rgba(43,33,28,0.55); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 55; }
.onb-modal { background: ${t.CARD_BG}; border-radius: 14px; width: 100%; max-width: 600px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(43,33,28,0.35); font-family: ${t.SANS}; color: ${t.INK}; }
.onb-modal-cab { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid ${t.BORDER}; }
.onb-modal-cab h2 { margin: 0; font-family: ${t.SERIF}; font-size: 21px; color: ${t.BORDEAUX}; }
.onb-modal-cuerpo { padding: 18px 20px; overflow-y: auto; }
.onb-modal-cuerpo h3 { font-family: ${t.SERIF}; font-size: 16px; color: ${t.INK}; margin: 0 0 12px; font-weight: 700; }
.onb-modal-seccion + .onb-modal-seccion { border-top: 1px solid ${t.BORDER}; margin-top: 22px; padding-top: 18px; }
.onb-modal-pie { display: flex; flex-direction: column; gap: 10px; padding: 14px 20px; border-top: 1px solid ${t.BORDER}; }
.onb-modal-botones { display: flex; gap: 10px; justify-content: flex-end; }
.onb-cerrar { background: none; border: none; cursor: pointer; color: ${t.MUTED}; padding: 4px; line-height: 0; }

@media (min-width: 600px) {
  .onb-page { padding: 32px 24px 56px; }
  .onb-h1 { font-size: 30px; }
  .onb-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .onb-acciones { align-items: center; }
  .onb-acciones .onb-primario { min-width: 260px; }
}
@media (max-width: 599px) {
  .onb-modal-fondo { padding: 0; align-items: stretch; }
  .onb-modal { max-height: none; height: 100%; border-radius: 0; }
  .onb-modal-botones > button { flex: 1; }
}
`;
}

function Estilos({ tema }) {
  const css = useMemo(() => cssOnboarding(tema), [tema]);
  return <style>{css}</style>;
}

// -----------------------------------------------------------------------------
// Tarjeta tipográfica (selección)
// -----------------------------------------------------------------------------
function Tarjeta({ titulo, descripcion, seleccionada, onClick, disabled, dataId }) {
  return (
    <button type="button" className="onb-card" aria-pressed={seleccionada} onClick={onClick} disabled={disabled} data-id={dataId}>
      <span className="onb-card-titulo">{titulo}</span>
      {descripcion && <span className="onb-card-desc">{descripcion}</span>}
    </button>
  );
}

// -----------------------------------------------------------------------------
// Preguntas (controladas, reutilizadas en el onboarding y en Mis preferencias)
// -----------------------------------------------------------------------------
export function PreguntaTipos({ seleccion, onChange, disabled, etiquetaId }) {
  return (
    <div role="group" aria-labelledby={etiquetaId} data-pregunta="tipos">
      <div className="onb-grid">
        {TIPOS_VINO.map((t) => (
          <Tarjeta
            key={t.id}
            dataId={t.id}
            titulo={t.etiqueta}
            seleccionada={seleccion.tipos.includes(t.id)}
            disabled={disabled}
            onClick={() => onChange(alternarTipo(seleccion, t.id))}
          />
        ))}
      </div>
      <hr className="onb-sep" />
      <div className="onb-lista">
        <Tarjeta
          dataId="probar_todo"
          titulo={TEXTOS.probarTodo}
          seleccionada={seleccion.exploracion}
          disabled={disabled}
          onClick={() => onChange(alternarExploracion(seleccion))}
        />
        <Tarjeta
          dataId="sin_preferencia"
          titulo={TEXTOS.sinPreferencia}
          seleccionada={seleccion.sinPreferencia}
          disabled={disabled}
          onClick={() => onChange(alternarSinPreferencia(seleccion))}
        />
      </div>
    </div>
  );
}

// El orden se calcula al mostrar la pregunta, al cambiar los tipos que la
// priorizan y al pulsar «Ver más variedades»; no al marcar una variedad, para
// que las tarjetas no se muevan bajo el dedo. En cada recálculo las elegidas
// quedan agrupadas primero.
export function PreguntaVariedades({ seleccionadas, tipos, onChange, disabled, etiquetaId }) {
  const [expandido, setExpandido] = useState(false);
  const selRef = useRef(seleccionadas);
  selRef.current = seleccionadas;
  const claveTipos = tipos.join(",");
  const orden = useMemo(
    () => organizarVariedades({ tipos, seleccionadas: selRef.current }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [claveTipos, expandido]
  );
  const visibles = [...orden.seleccionadas, ...orden.sugeridas, ...(expandido ? orden.resto : [])];
  return (
    <div role="group" aria-labelledby={etiquetaId} data-pregunta="variedades">
      <div className="onb-grid">
        {visibles.map((v) => (
          <Tarjeta
            key={v.id}
            dataId={v.id}
            titulo={v.etiqueta ?? etiquetaVariedad(v.id)}
            seleccionada={seleccionadas.includes(v.id)}
            disabled={disabled}
            onClick={() => onChange(alternarEnLista(seleccionadas, v.id))}
          />
        ))}
      </div>
      {!expandido && orden.resto.length > 0 && (
        <button type="button" className="onb-mas" onClick={() => setExpandido(true)} disabled={disabled}>
          {TEXTOS.verMas}
        </button>
      )}
    </div>
  );
}

export function PreguntaConocimiento({ nivel, onChange, disabled, etiquetaId }) {
  return (
    <div role="group" aria-labelledby={etiquetaId} data-pregunta="conocimiento" className="onb-lista">
      {NIVELES_CONOCIMIENTO.map((n) => (
        <Tarjeta
          key={n.id}
          dataId={n.id}
          titulo={n.etiqueta}
          descripcion={n.descripcion}
          seleccionada={nivel === n.id}
          disabled={disabled}
          onClick={() => onChange(alternarNivel(nivel, n.id))}
        />
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Onboarding (cinco pantallas)
// -----------------------------------------------------------------------------
// onSalir({ preferencias, confirmado }) se llama al terminar o al omitir.
// `confirmado` es false solo si «Ahora no» no pudo guardarse: la interfaz
// entra igual a la cava (no se bloquea) y no vuelve a insistir en la sesión.
export function Onboarding({ client, userId, preferencias, pasoInicial = PASOS.BIENVENIDA, iniciarAlAbrir = false, tema, onSalir }) {
  const [paso, setPaso] = useState(pasoInicial);
  const [prefs, setPrefs] = useState(preferencias || null);
  const [selTipos, setSelTipos] = useState(() => seleccionTiposDesdePreferencias(preferencias));
  const [variedades, setVariedades] = useState(() => [...(preferencias?.variedades || [])]);
  const [nivel, setNivel] = useState(preferencias?.nivel ?? null);
  const [guardando, setGuardando] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [error, setError] = useState(null);
  const tituloRef = useRef(null);
  const primeraVez = useRef(true);

  // Abierto desde la invitación: registra el inicio sin bloquear la pantalla.
  // Si falla, el primer «Continuar» crea igual el registro (guardarProgreso).
  useEffect(() => {
    if (!iniciarAlAbrir) return;
    iniciarOnboarding(client, userId).then((r) => {
      if (r.ok && r.preferencias) setPrefs((p) => p ?? r.preferencias);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (primeraVez.current) {
      primeraVez.current = false;
    } else if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
    }
    tituloRef.current?.focus({ preventScroll: true });
  }, [paso]);

  const ocupado = guardando || saliendo;

  async function guardar(operacion, siguiente) {
    setGuardando(true);
    setError(null);
    const r = await escrituraConTiempoLimite(operacion());
    setGuardando(false);
    if (r.ok) {
      if (r.preferencias) setPrefs(r.preferencias);
      setPaso(siguiente);
    } else {
      setError(TEXTOS.errorGuardar);
    }
  }

  const empezar = () => guardar(() => iniciarOnboarding(client, userId), PASOS.TIPOS);
  const continuarTipos = () =>
    guardar(() => guardarProgreso(client, userId, { cambios: { tipos: respuestaTipos(selTipos) }, paso: PASOS.VARIEDADES }), PASOS.VARIEDADES);
  const continuarVariedades = () =>
    guardar(() => guardarProgreso(client, userId, { cambios: { variedades }, paso: PASOS.CONOCIMIENTO }), PASOS.CONOCIMIENTO);
  const continuarConocimiento = () =>
    guardar(async () => {
      const r = await completarOnboarding(client, userId, { cambios: { nivel } });
      // Ya resuelto en otra pestaña: se guarda la respuesta como edición,
      // sin cambiar el estado.
      if (!r.ok && r.error?.tipo === "estado") return editarPreferencias(client, userId, { nivel });
      return r;
    }, PASOS.CIERRE);

  const atras = () => {
    setError(null);
    setPaso((p) => Math.max(PASOS.BIENVENIDA, p - 1));
  };

  async function ahoraNo() {
    setSaliendo(true);
    setError(null);
    const r = await escrituraConTiempoLimite(omitirOnboarding(client, userId));
    setSaliendo(false);
    onSalir({ preferencias: r.ok ? r.preferencias : null, confirmado: r.ok });
  }

  const titulo = (texto) => (
    <h1 className="onb-h1" ref={tituloRef} tabIndex={-1} id="onb-titulo">
      {texto}
    </h1>
  );

  const botonPrimario = (texto, onClick) => (
    <button type="button" className="onb-primario" onClick={onClick} disabled={ocupado} data-accion="primaria">
      {guardando ? (
        <>
          <Loader2 size={16} className="onb-spin" /> {TEXTOS.guardando}
        </>
      ) : (
        texto
      )}
    </button>
  );

  const pie = (texto, onClick) => (
    <div className="onb-acciones">
      {error && (
        <p className="onb-error" role="alert">
          {error}
        </p>
      )}
      {botonPrimario(texto, onClick)}
      {paso !== PASOS.CIERRE && (
        <button type="button" className="onb-omitir" onClick={ahoraNo} disabled={saliendo} data-accion="omitir">
          {saliendo ? TEXTOS.guardando : TEXTOS.ahoraNoCava}
        </button>
      )}
    </div>
  );

  const enPregunta = paso >= PASOS.TIPOS && paso <= PASOS.CONOCIMIENTO;

  return (
    <div className="onb-page" data-onboarding-paso={paso}>
      <Estilos tema={tema} />
      <div className="onb-col">
        <div className="onb-top">
          {enPregunta ? (
            <button type="button" className="onb-back" onClick={atras} disabled={ocupado} data-accion="atras">
              <ArrowLeft size={16} /> {TEXTOS.atras}
            </button>
          ) : (
            <span />
          )}
          <span className="onb-marca">Mi Cava</span>
        </div>

        {paso === PASOS.BIENVENIDA && (
          <div className="onb-centro">
            {titulo(TEXTOS.bienvenidaTitulo)}
            <p className="onb-sub">{TEXTOS.bienvenidaSubtitulo}</p>
            {pie(TEXTOS.empezar, empezar)}
          </div>
        )}

        {paso === PASOS.TIPOS && (
          <>
            {titulo(TEXTOS.tiposTitulo)}
            <div style={{ height: 14 }} />
            <PreguntaTipos seleccion={selTipos} onChange={setSelTipos} disabled={ocupado} etiquetaId="onb-titulo" />
            {pie(TEXTOS.continuar, continuarTipos)}
          </>
        )}

        {paso === PASOS.VARIEDADES && (
          <>
            {titulo(TEXTOS.variedadesTitulo)}
            <div style={{ height: 14 }} />
            <PreguntaVariedades
              seleccionadas={variedades}
              tipos={tiposParaPriorizar(selTipos)}
              onChange={setVariedades}
              disabled={ocupado}
              etiquetaId="onb-titulo"
            />
            {pie(TEXTOS.continuar, continuarVariedades)}
          </>
        )}

        {paso === PASOS.CONOCIMIENTO && (
          <>
            {titulo(TEXTOS.conocimientoTitulo)}
            <div style={{ height: 14 }} />
            <PreguntaConocimiento nivel={nivel} onChange={setNivel} disabled={ocupado} etiquetaId="onb-titulo" />
            {pie(TEXTOS.continuar, continuarConocimiento)}
          </>
        )}

        {paso === PASOS.CIERRE && (
          <div className="onb-centro">
            {titulo(TEXTOS.cierreTitulo)}
            <p className="onb-sub">{TEXTOS.cierreTexto}</p>
            {pie(TEXTOS.irACava, () => onSalir({ preferencias: prefs, confirmado: true }))}
          </div>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Invitación discreta para usuarios existentes (no bloqueante)
// -----------------------------------------------------------------------------
export function InvitacionOnboarding({ tema, enCurso, ocupado, onEmpezar, onAhoraNo }) {
  return (
    <section className="onb-invita" aria-labelledby="onb-invita-titulo" data-invitacion-onboarding>
      <Estilos tema={tema} />
      <div className="onb-invita-txt">
        <h2 id="onb-invita-titulo">{TEXTOS.bienvenidaTitulo}</h2>
        <p>{TEXTOS.bienvenidaSubtitulo}</p>
      </div>
      <div className="onb-invita-acc">
        <button type="button" className="onb-primario" onClick={onEmpezar} disabled={ocupado} data-accion="primaria">
          {enCurso ? TEXTOS.continuarInvitacion : TEXTOS.empezar}
        </button>
        <button type="button" className="onb-omitir" onClick={onAhoraNo} disabled={ocupado} data-accion="omitir">
          {ocupado ? TEXTOS.guardando : TEXTOS.ahoraNo}
        </button>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Mis preferencias (edición posterior). No cambia el estado del onboarding.
// -----------------------------------------------------------------------------
function estadoEdicion(preferencias) {
  return {
    seleccionTipos: preferencias ? seleccionTiposDesdePreferencias(preferencias) : { ...SELECCION_TIPOS_VACIA },
    variedades: [...(preferencias?.variedades || [])],
    nivel: preferencias?.nivel ?? null,
  };
}

export function MisPreferencias({ client, userId, lecturaInicial, tema, onCerrar }) {
  const usable = (l) => l && (l.carga === CARGA.CON_REGISTRO || l.carga === CARGA.SIN_REGISTRO);
  const [lectura, setLectura] = useState(usable(lecturaInicial) ? lecturaInicial : { carga: CARGA.PENDIENTE });
  const [inicial, setInicial] = useState(() => (usable(lecturaInicial) ? estadoEdicion(lecturaInicial.preferencias) : null));
  const [actual, setActual] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function cargar() {
    setLectura({ carga: CARGA.PENDIENTE });
    const l = await lecturaConTiempoLimite(leerPreferencias(client, userId));
    setLectura(l);
    if (usable(l)) {
      const e = estadoEdicion(l.preferencias);
      setInicial(e);
      setActual(e);
    }
  }

  useEffect(() => {
    if (!usable(lecturaInicial)) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !guardando) onCerrar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [guardando, onCerrar]);

  async function guardar() {
    const cambios = cambiosEdicion(inicial, actual);
    if (Object.keys(cambios).length === 0) {
      onCerrar();
      return;
    }
    setGuardando(true);
    setError(null);
    const r = await escrituraConTiempoLimite(editarPreferencias(client, userId, cambios));
    setGuardando(false);
    if (r.ok) onCerrar(r.preferencias);
    else setError(TEXTOS.errorGuardar);
  }

  const listo = usable(lectura) && actual;

  return (
    <div className="onb-modal-fondo" onClick={guardando ? undefined : () => onCerrar()} data-mis-preferencias>
      <Estilos tema={tema} />
      <div className="onb-modal" role="dialog" aria-modal="true" aria-labelledby="onb-mp-titulo" onClick={(e) => e.stopPropagation()}>
        <div className="onb-modal-cab">
          <h2 id="onb-mp-titulo">{TEXTOS.misPreferencias}</h2>
          <button type="button" className="onb-cerrar" onClick={() => onCerrar()} disabled={guardando} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="onb-modal-cuerpo">
          {lectura.carga === CARGA.PENDIENTE && (
            <div style={{ display: "flex", justifyContent: "center", padding: 30 }}>
              <Loader2 size={22} color={tema.MUTED} className="onb-spin" />
            </div>
          )}
          {lectura.carga === CARGA.ERROR && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
              <p className="onb-error" role="alert">
                {TEXTOS.errorCargar}
              </p>
              <button type="button" className="onb-secundario" onClick={cargar}>
                {TEXTOS.reintentar}
              </button>
            </div>
          )}
          {listo && (
            <>
              <section className="onb-modal-seccion">
                <h3 id="onb-mp-tipos">{TEXTOS.tiposTitulo}</h3>
                <PreguntaTipos
                  seleccion={actual.seleccionTipos}
                  onChange={(s) => setActual((a) => ({ ...a, seleccionTipos: s }))}
                  disabled={guardando}
                  etiquetaId="onb-mp-tipos"
                />
              </section>
              <section className="onb-modal-seccion">
                <h3 id="onb-mp-variedades">{TEXTOS.variedadesTitulo}</h3>
                <PreguntaVariedades
                  seleccionadas={actual.variedades}
                  tipos={tiposParaPriorizar(actual.seleccionTipos)}
                  onChange={(v) => setActual((a) => ({ ...a, variedades: v }))}
                  disabled={guardando}
                  etiquetaId="onb-mp-variedades"
                />
              </section>
              <section className="onb-modal-seccion">
                <h3 id="onb-mp-conocimiento">{TEXTOS.conocimientoTitulo}</h3>
                <PreguntaConocimiento
                  nivel={actual.nivel}
                  onChange={(n) => setActual((a) => ({ ...a, nivel: n }))}
                  disabled={guardando}
                  etiquetaId="onb-mp-conocimiento"
                />
              </section>
            </>
          )}
        </div>

        <div className="onb-modal-pie">
          {error && (
            <p className="onb-error" role="alert">
              {error}
            </p>
          )}
          <div className="onb-modal-botones">
            <button type="button" className="onb-secundario" onClick={() => onCerrar()} disabled={guardando} data-accion="cancelar">
              {TEXTOS.cancelar}
            </button>
            <button type="button" className="onb-primario" onClick={guardar} disabled={!listo || guardando} data-accion="guardar">
              {guardando ? TEXTOS.guardando : TEXTOS.guardar}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

