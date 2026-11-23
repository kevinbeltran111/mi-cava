// =============================================================================
// Etapa 7.4-B4: pantalla «Elegir de mi cava».
// =============================================================================
// Pide la primera tanda al abrirse; permite evitar una variedad hoy (filtro
// temporal de la consulta), guardar un vino para una ocasión especial (con
// «Deshacer») y abrir una botella con el flujo de apertura existente (ficha
// del vino). Mide shown / selected / bottle_opened / new_batch sin bloquear
// nada. Un solo pedido en curso a la vez; las respuestas de una consulta
// anterior (o de la pantalla ya cerrada) se descartan.
// =============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { X, Wine, Loader2, Bookmark, RotateCcw, Info } from "lucide-react";
import { pedirPrimeraTanda, refinarPorVariedad, reservarVino, quitarReserva, registrarEvento } from "./api.js";
import { FASES, variedadesParaEvitar, avisoIncierto, estadoSinCandidatos, crearSecuencia, claveTanda } from "./flujo.js";

const ERROR_GENERICO = "No pudimos preparar tu recomendación. Revisá tu conexión y probá de nuevo.";

export function ElegirDeMiCava({ accessToken, tema, vinos, onCerrar, onAgregarVino, onAbrirBotella, Botella, fetchImpl }) {
  const { BORDEAUX, BORDEAUX_DARK, GOLD, CREAM, CARD_BG, INK, MUTED, BORDER, DANGER, SERIF, SANS } = tema;
  const opciones = fetchImpl ? { fetchImpl } : undefined;
  const [fase, setFase] = useState(FASES.CARGANDO);
  const [datos, setDatos] = useState(null); // { sesionId, tanda, filtros, recomendaciones, motivo }
  const [enCurso, setEnCurso] = useState(null); // null | 'inicio' | 'refinar' | 'reservar' | 'deshacer'
  const [errorAccion, setErrorAccion] = useState(null);
  const [errorInicio, setErrorInicio] = useState(null);
  const [reserva, setReserva] = useState(null); // { wineId, itemId, nombre, previo, pendienteTanda }
  const [aviso, setAviso] = useState(null);
  const [abiertos, setAbiertos] = useState(() => new Set());
  const secuencia = useRef(crearSecuencia());
  const medidas = useRef(new Set());
  const pedidoRef = useRef(null); // marca del pedido en curso (null = libre)
  const [itemEnCurso, setItemEnCurso] = useState(null);
  const vinosPorId = useMemo(() => new Map((vinos || []).map((w) => [w.id, w])), [vinos]);

  const evento = (e) => { registrarEvento(accessToken, e, opciones); };

  // Un pedido a la vez (el ref evita el doble toque antes del re-render).
  // Solo el pedido dueño de la marca la libera: si una consulta nueva tomó
  // el control, el pedido viejo termina sin tocar el estado.
  async function conPedido(tipo, fn, itemId = null) {
    if (pedidoRef.current) return;
    const marca = {};
    pedidoRef.current = marca;
    setEnCurso(tipo);
    setItemEnCurso(itemId);
    setErrorAccion(null);
    try {
      await fn();
    } finally {
      if (pedidoRef.current === marca) { pedidoRef.current = null; setEnCurso(null); setItemEnCurso(null); }
    }
  }

  function aplicarTanda(cuerpo) {
    if (cuerpo?.estado === "ok") {
      setDatos({ sesionId: cuerpo.sesionId, tanda: cuerpo.tanda, filtros: cuerpo.filtros || [], recomendaciones: cuerpo.recomendaciones || [], motivo: null });
      setFase(FASES.OK);
      return true;
    }
    if (cuerpo?.estado === "sin_candidatos") {
      setDatos((d) => ({ sesionId: cuerpo.sesionId ?? d?.sesionId ?? null, tanda: d?.tanda ?? null, filtros: cuerpo.filtros || [], recomendaciones: [], motivo: cuerpo.motivo }));
      setFase(FASES.SIN_CANDIDATOS);
      return true;
    }
    return false;
  }

  function iniciar() {
    const n = secuencia.current.nueva();
    pedidoRef.current = null; // la consulta nueva reemplaza cualquier pedido en curso
    setFase(FASES.CARGANDO);
    setDatos(null);
    setReserva(null);
    setAviso(null);
    setErrorAccion(null);
    setErrorInicio(null);
    return conPedido("inicio", async () => {
      const r = await pedirPrimeraTanda(accessToken, opciones);
      if (!secuencia.current.vigente(n)) return;
      if (r.status !== 200 || !aplicarTanda(r.cuerpo)) {
        setErrorInicio(r.cuerpo?.error || ERROR_GENERICO);
        setFase(FASES.ERROR);
      }
    });
  }

  useEffect(() => {
    iniciar();
    const s = secuencia.current;
    return () => { s.nueva(); }; // al cerrar, toda respuesta pendiente queda vieja
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // shown: una vez por tanda visible (el servidor también descarta duplicados).
  useEffect(() => {
    if (fase !== FASES.OK || !datos?.recomendaciones?.length) return;
    const k = claveTanda(datos.sesionId, datos.tanda);
    if (medidas.current.has(k)) return;
    medidas.current.add(k);
    evento({ sesionId: datos.sesionId, tipo: "shown", itemIds: datos.recomendaciones.map((r) => r.itemId) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, datos]);

  const medirTanda = (origen, cuerpo, filtros) => {
    if (!cuerpo?.sesionId) return;
    evento(cuerpo.estado === "ok"
      ? { sesionId: cuerpo.sesionId, tipo: "new_batch", origen, tanda: cuerpo.tanda, resultado: "ok", filtros }
      : { sesionId: cuerpo.sesionId, tipo: "new_batch", origen, tanda: null, resultado: "sin_candidatos", motivo: cuerpo.motivo, filtros });
  };

  const refinar = (variedad) => conPedido("refinar", async () => {
    const n = secuencia.current.nueva();
    const r = await refinarPorVariedad(accessToken, datos.sesionId, variedad.id, opciones);
    if (!secuencia.current.vigente(n)) return;
    if (r.status === 200 && aplicarTanda(r.cuerpo)) {
      setAviso(null);
      medirTanda("refinamiento", r.cuerpo, (r.cuerpo.filtros || []).map((f) => f.clave));
    } else {
      setErrorAccion(r.cuerpo?.error || "No pudimos actualizar la recomendación. Probá de nuevo.");
    }
  });

  const reservar = (rec, previo = { fase, datos }) => conPedido("reservar", async () => {
    const n = secuencia.current.nueva();
    const r = await reservarVino(accessToken, previo.datos?.sesionId ?? datos.sesionId, rec.itemId, opciones);
    if (!secuencia.current.vigente(n)) return;
    const nombre = rec.vino?.nombre || "El vino";
    if (r.cuerpo?.reserva && (r.status === 200 || r.cuerpo.estado === "reserva_guardada_sin_tanda")) {
      setReserva({ wineId: r.cuerpo.reserva.wineId, itemId: rec.itemId, rec, nombre, previo, pendienteTanda: r.status !== 200 });
      setAviso(`«${nombre}» quedó guardado para una ocasión especial. No lo vamos a recomendar hasta que quites la reserva.`);
      if (r.status === 200 && aplicarTanda(r.cuerpo)) {
        medirTanda("reserva", r.cuerpo, (r.cuerpo.filtros || []).map((f) => f.clave));
      } else {
        setFase(FASES.RESERVA_SIN_TANDA);
      }
      return;
    }
    setErrorAccion(r.cuerpo?.error || "No pudimos guardar la reserva. Probá de nuevo.");
  }, rec.itemId);

  const deshacer = () => conPedido("deshacer", async () => {
    const n = secuencia.current.nueva();
    const r = await quitarReserva(accessToken, reserva.wineId, opciones);
    if (!secuencia.current.vigente(n)) return;
    if (r.status === 200) {
      // Se vuelve a la tanda anterior: sus ítems siguen siendo válidos.
      setDatos(reserva.previo.datos);
      setFase(reserva.previo.fase);
      setAviso(`Quitaste la reserva de «${reserva.nombre}».`);
      setReserva(null);
    } else {
      setErrorAccion(r.cuerpo?.error || "No pudimos quitar la reserva. Probá de nuevo.");
    }
  });

  const abrir = (rec) => {
    evento({ sesionId: datos.sesionId, tipo: "selected", itemId: rec.itemId });
    onAbrirBotella(rec.wineId, {
      alConfirmar: (consumoId, stock) => {
        if (consumoId) evento({ sesionId: datos.sesionId, tipo: "bottle_opened", itemId: rec.itemId, consumoId });
        setAbiertos((s) => new Set(s).add(rec.itemId));
        // El stock que muestra la tarjeta es el que devolvió registrar_consumo.
        if (Number.isInteger(stock)) {
          setDatos((d) => (d ? { ...d, recomendaciones: d.recomendaciones.map((r) => (r.wineId === rec.wineId ? { ...r, stock } : r)) } : d));
        }
      },
    });
  };

  const resolver = (accion) => {
    if (accion === "agregar_vino") onAgregarVino();
    else if (accion === "nueva_consulta") iniciar();
    else if (accion === "deshacer_reserva") deshacer();
    else onCerrar();
  };

  // ---------------------------------------------------------------- estilos
  const botonPrimario = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "11px 16px", borderRadius: 10, border: "none", background: GOLD, color: BORDEAUX_DARK, fontWeight: 700, fontSize: 14.5, cursor: "pointer" };
  const botonContorno = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "9px 14px", borderRadius: 8, border: `1px solid ${BORDEAUX}`, background: "transparent", color: BORDEAUX, fontWeight: 600, fontSize: 13.5, cursor: "pointer" };
  const botonTexto = { display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: MUTED, textDecoration: "underline", cursor: "pointer", padding: 0, fontSize: 13 };
  const caja = (color, fondo) => ({ background: fondo, border: `1px solid ${color}`, color, padding: "10px 12px", borderRadius: 8, fontSize: 13 });
  const ocupado = enCurso !== null;
  const deshabilitado = (base) => (ocupado ? { ...base, opacity: 0.55, cursor: "default" } : base);

  // Foto 4:5 enmarcada, como en las tarjetas de Mi Cava; sin foto, el mismo
  // BottlePlaceholder de la app (lo pasa App como `Botella`).
  function Foto({ wineId, ancho }) {
    const foto = vinosPorId.get(wineId)?.foto;
    const marco = { width: ancho, height: Math.round((ancho * 5) / 4), alignSelf: "flex-start", borderRadius: 8, overflow: "hidden", border: `1px solid ${BORDER}`, flexShrink: 0 };
    return (
      <div style={marco}>
        {foto
          ? <img src={foto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : Botella ? <Botella size={Math.round(ancho / 3)} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: BORDEAUX }}><Wine size={ancho / 3} color={GOLD} strokeWidth={1.3} /></div>}
      </div>
    );
  }

  function Tarjeta({ rec, principal }) {
    const v = rec.vino || {};
    const meta = [v.bodega, v.varietal, v.anada].filter(Boolean).join(" · ");
    const incierto = avisoIncierto(rec, datos.filtros);
    const abierto = abiertos.has(rec.itemId);
    return (
      <div data-testid={principal ? "rec-principal" : "rec-alternativa"} style={{ display: "flex", gap: 14, padding: principal ? 16 : 14, background: CARD_BG, border: `1px solid ${principal ? GOLD : BORDER}`, borderRadius: 12 }}>
        <Foto wineId={rec.wineId} ancho={principal ? 84 : 60} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
            {rec.exploracion && <span style={{ fontSize: 11, fontWeight: 700, color: BORDEAUX, background: CREAM, border: `1px solid ${GOLD}`, borderRadius: 999, padding: "1px 8px" }}>Para explorar</span>}
            <span style={{ fontSize: 12, color: MUTED }}>Tenés {rec.stock} {rec.stock === 1 ? "botella" : "botellas"}</span>
          </div>
          <h3 style={{ margin: 0, fontFamily: SERIF, fontSize: principal ? 21 : 17, color: BORDEAUX, overflowWrap: "anywhere" }}>{v.nombre}</h3>
          {meta && <p style={{ margin: "2px 0 0", fontSize: 13, color: MUTED }}>{meta}</p>}
          <p style={{ margin: "10px 0 0", fontSize: 14, color: INK, lineHeight: 1.45 }}>{rec.explicacion}</p>
          {incierto && (
            <p style={{ margin: "8px 0 0", fontSize: 12.5, color: MUTED, display: "flex", gap: 6, alignItems: "flex-start" }}>
              <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {incierto}
            </p>
          )}
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
            {abierto ? (
              <span style={{ fontSize: 13.5, fontWeight: 700, color: BORDEAUX }}>🍷 Abriste una botella</span>
            ) : (
              <button disabled={ocupado} onClick={() => abrir(rec)} style={deshabilitado(principal ? botonPrimario : botonContorno)}>
                <Wine size={16} /> Abrir esta botella
              </button>
            )}
            <button disabled={ocupado} onClick={() => reservar(rec)} style={deshabilitado(botonTexto)}>
              {enCurso === "reservar" && itemEnCurso === rec.itemId ? <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} /> : <Bookmark size={13} />}
              Guardar para una ocasión especial
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- vistas
  const filtros = datos?.filtros || [];
  const paraEvitar = datos?.sesionId ? variedadesParaEvitar(vinos, filtros) : [];
  const recs = datos?.recomendaciones || [];

  let cuerpo;
  if (fase === FASES.CARGANDO) {
    cuerpo = (
      <div data-testid="estado-cargando" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "56px 0", color: MUTED }}>
        <Loader2 size={26} style={{ animation: "spin 0.8s linear infinite" }} />
        <span style={{ fontSize: 14 }}>Buscando en tu cava…</span>
      </div>
    );
  } else if (fase === FASES.ERROR) {
    cuerpo = (
      <div data-testid="estado-error" style={{ textAlign: "center", padding: "40px 10px" }}>
        <div style={{ ...caja(DANGER, "#F5E6E1"), marginBottom: 16 }}>{errorInicio}</div>
        <button onClick={iniciar} style={botonPrimario}><RotateCcw size={15} /> Reintentar</button>
      </div>
    );
  } else if (fase === FASES.SIN_CANDIDATOS) {
    const e = estadoSinCandidatos(datos?.motivo, { hayReservaReciente: Boolean(reserva) });
    cuerpo = (
      <div data-testid={`estado-${datos?.motivo}`} style={{ textAlign: "center", padding: "36px 16px", border: `1px dashed ${BORDER}`, borderRadius: 12, background: CARD_BG }}>
        <Wine size={34} color={GOLD} strokeWidth={1.2} style={{ marginBottom: 10 }} />
        <h3 style={{ fontFamily: SERIF, fontSize: 19, margin: "0 0 6px", color: BORDEAUX }}>{e.titulo}</h3>
        {e.detalle && <p style={{ color: MUTED, fontSize: 14, margin: "0 auto 18px", maxWidth: 380 }}>{e.detalle}</p>}
        <button disabled={ocupado} onClick={() => resolver(e.accion)} style={deshabilitado(botonPrimario)}>{e.etiquetaAccion}</button>
      </div>
    );
  } else if (fase === FASES.RESERVA_SIN_TANDA) {
    cuerpo = (
      <div data-testid="estado-reserva-sin-tanda" style={{ padding: "8px 0" }}>
        <div style={{ ...caja(DANGER, "#F5E6E1"), marginBottom: 14 }}>No pudimos actualizar la recomendación. Tu reserva sí quedó guardada.</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button disabled={ocupado} onClick={() => reservar(reserva.rec, reserva.previo)} style={deshabilitado(botonPrimario)}>
            {enCurso === "reservar" ? <Loader2 size={15} style={{ animation: "spin 0.8s linear infinite" }} /> : <RotateCcw size={15} />} Reintentar la recomendación
          </button>
        </div>
      </div>
    );
  } else {
    cuerpo = (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: MUTED }}>Te recomendamos</p>
        {recs[0] && <Tarjeta rec={recs[0]} principal />}
        {recs.length === 1 && <p style={{ margin: 0, fontSize: 13, color: MUTED }}>Es el único vino disponible que cumple lo de hoy.</p>}
        {recs.length > 1 && <p style={{ margin: "8px 0 0", fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: MUTED }}>También podrías abrir</p>}
        {recs.slice(1).map((r) => <Tarjeta key={r.itemId} rec={r} />)}
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(43,33,28,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 12px", zIndex: 40, overflowY: "auto" }} onClick={onCerrar}>
      <div role="dialog" aria-label="Elegir de mi cava" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 640, background: CREAM, borderRadius: 14, overflow: "hidden", fontFamily: SANS, color: INK, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
        <div style={{ background: `linear-gradient(135deg, ${BORDEAUX} 0%, ${BORDEAUX_DARK} 100%)`, padding: "18px 20px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: SERIF, fontSize: 24, color: CREAM }}>Elegir de mi cava</h2>
            <p style={{ margin: "4px 0 0", color: "#E6D3A8", fontSize: 13 }}>Elegimos entre los vinos que tenés disponibles.</p>
          </div>
          <button aria-label="Cerrar" onClick={onCerrar} style={{ background: "none", border: "none", color: CREAM, cursor: "pointer", padding: 4 }}><X size={22} /></button>
        </div>

        <div style={{ padding: "18px 18px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
          {aviso && (
            <div data-testid="aviso-reserva" style={{ ...caja(BORDEAUX, CARD_BG), display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
              <span>{aviso}</span>
              {reserva && fase !== FASES.SIN_CANDIDATOS && (
                <button disabled={ocupado} onClick={deshacer} style={deshabilitado({ ...botonTexto, color: BORDEAUX, fontWeight: 700 })}>
                  {enCurso === "deshacer" ? <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} /> : null} Deshacer
                </button>
              )}
            </div>
          )}
          {errorAccion && <div data-testid="error-accion" style={caja(DANGER, "#F5E6E1")}>{errorAccion}</div>}

          {filtros.length > 0 && fase !== FASES.CARGANDO && (
            <div data-testid="filtros-aplicados" style={{ fontSize: 13, color: INK }}>
              <span style={{ fontWeight: 600 }}>Hoy sin: </span>
              {filtros.map((f) => (
                <span key={f.clave} style={{ display: "inline-block", margin: "2px 6px 2px 0", padding: "2px 10px", borderRadius: 999, background: CARD_BG, border: `1px solid ${BORDER}` }}>{f.etiqueta}</span>
              ))}
              <p style={{ margin: "4px 0 0", fontSize: 12, color: MUTED }}>Excluimos los vinos registrados con esas variedades.</p>
            </div>
          )}

          {cuerpo}

          {fase === FASES.OK && paraEvitar.length > 0 && (
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
              <p style={{ margin: "0 0 8px", fontSize: 13.5, fontWeight: 600, color: INK }}>¿Hoy preferís evitar alguna variedad?</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {paraEvitar.map((x) => (
                  <button key={x.id} disabled={ocupado} onClick={() => refinar(x)} style={deshabilitado({ padding: "7px 12px", borderRadius: 999, border: `1px solid ${BORDER}`, background: "#FFFDFA", color: INK, fontSize: 13, cursor: "pointer" })}>
                    Hoy no quiero {x.etiqueta}
                  </button>
                ))}
              </div>
              {enCurso === "refinar" && <p style={{ margin: "8px 0 0", fontSize: 12.5, color: MUTED, display: "flex", gap: 6, alignItems: "center" }}><Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} /> Actualizando la recomendación…</p>}
            </div>
          )}

          {(fase === FASES.OK || fase === FASES.SIN_CANDIDATOS || fase === FASES.RESERVA_SIN_TANDA) && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
              <button disabled={enCurso === "inicio"} onClick={iniciar} style={{ ...botonTexto, color: INK }}><RotateCcw size={13} /> Nueva consulta</button>
              <button onClick={onCerrar} style={{ ...botonTexto, color: INK }}>Volver a Mi Cava</button>
            </div>
          )}
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  );
}
