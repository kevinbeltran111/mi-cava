import { useState, useEffect, useRef } from "react";
import {
  Plus,
  X,
  Search,
  Wine,
  Trash2,
  Camera,
  UtensilsCrossed,
  Loader2,
  User,
  LogIn,
  LogOut,
  Mail,
  Shield,
  MapPin,
  Package,
  SlidersHorizontal,
  Heart,
} from "lucide-react";
import { supabase } from "./supabaseClient";

// Expone el cliente para poder probar cosas desde la consola del navegador
// mientras no tenemos el botón de Administración visible en pantalla.
if (typeof window !== "undefined") window.supabase = supabase;

// ---- Palette ----
const BORDEAUX = "#4A1420";
const BORDEAUX_DARK = "#38101A";
const GOLD = "#B8934A";
const GOLD_SOFT = "#D9C9A3";
const CREAM = "#F6EFE4";
const CARD_BG = "#FFFCF6";
const INK = "#2B211C";
const MUTED = "#8B7355";
const BORDER = "#E4D9C8";
const DANGER = "#8B3A3A";

const STAR_PATH =
  "M12 .587l3.668 7.568L24 9.423l-6 5.847L19.335 24 12 19.897 4.665 24 6 15.27 0 9.423l8.332-1.268z";

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const PHOTOS_BUCKET = "etiquetas";

function uid() {
  return crypto.randomUUID();
}

function compressImageToBlob(file, maxDim = 700, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) {
          height = Math.round(height * (maxDim / width));
          width = maxDim;
        } else if (height >= width && height > maxDim) {
          width = Math.round(width * (maxDim / height));
          height = maxDim;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function StarIcon({ fillPercent, size }) {
  return (
    <span style={{ position: "relative", display: "inline-block", width: size, height: size, flexShrink: 0 }}>
      <svg viewBox="0 0 24 24" width={size} height={size} style={{ position: "absolute", top: 0, left: 0 }}>
        <path d={STAR_PATH} fill={BORDER} />
      </svg>
      <span style={{ position: "absolute", top: 0, left: 0, width: `${fillPercent}%`, height: "100%", overflow: "hidden" }}>
        <svg viewBox="0 0 24 24" width={size} height={size}>
          <path d={STAR_PATH} fill={GOLD} />
        </svg>
      </span>
    </span>
  );
}

function StarRating({ value, onChange, size = 24, readOnly = false }) {
  const handleClick = (e, starIndex) => {
    if (readOnly) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const half = clickX < rect.width / 2;
    onChange(half ? starIndex - 0.5 : starIndex);
  };
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fillPercent = Math.max(0, Math.min(1, value - (i - 1))) * 100;
        return (
          <div key={i} onClick={(e) => handleClick(e, i)} style={{ cursor: readOnly ? "default" : "pointer" }}>
            <StarIcon fillPercent={fillPercent} size={size} />
          </div>
        );
      })}
    </div>
  );
}

function BottlePlaceholder() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(160deg, ${BORDEAUX} 0%, ${BORDEAUX_DARK} 100%)`,
      }}
    >
      <Wine size={36} color={GOLD_SOFT} strokeWidth={1.3} />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <span style={{ display: "block", fontSize: 13, color: MUTED, marginBottom: 6, fontFamily: SANS }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  fontSize: 15,
  borderRadius: 8,
  border: `1px solid ${BORDER}`,
  background: "#FFFDFA",
  color: INK,
  fontFamily: SANS,
  outline: "none",
};

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function avgOf(ratings) {
  const values = Object.values(ratings || {}).map((r) => r.valor);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ---------- Login (link mágico) ----------
function LoginModal({ onClose }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [notAuthorized, setNotAuthorized] = useState(false);

  const [showRequest, setShowRequest] = useState(false);
  const [reqNombre, setReqNombre] = useState("");
  const [reqEmail, setReqEmail] = useState("");
  const [reqSending, setReqSending] = useState(false);
  const [reqSent, setReqSent] = useState(false);
  const [reqError, setReqError] = useState(null);

  const handleSend = async () => {
    setSending(true);
    setError(null);
    setNotAuthorized(false);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
    });
    setSending(false);
    if (error) {
      if (/rate limit/i.test(error.message || "")) {
        setError("Ya pediste un link hace poco — esperá un minuto y probá de nuevo.");
      } else {
        setNotAuthorized(true);
        setReqEmail(email.trim());
      }
      return;
    }
    setSent(true);
  };

  const handleSendRequest = async () => {
    setReqSending(true);
    setReqError(null);
    const { error } = await supabase.from("access_requests").insert({
      nombre: reqNombre.trim(),
      email: reqEmail.trim(),
    });
    setReqSending(false);
    if (error) {
      if (error.code === "23505") {
        setReqError("Ya hay una solicitud pendiente con ese mail — esperá a que la revisemos.");
      } else {
        setReqError("No se pudo enviar la solicitud. Probá de nuevo en un momento.");
      }
      return;
    }
    setReqSent(true);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(43,33,28,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: CARD_BG, borderRadius: 14, padding: 28, maxWidth: 360, width: "100%", boxShadow: "0 20px 60px rgba(43,33,28,0.35)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontFamily: SERIF, fontSize: 20, color: BORDEAUX }}>Iniciar sesión</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED }}>
            <X size={20} />
          </button>
        </div>

        {sent ? (
          <p style={{ color: INK, fontSize: 14, lineHeight: 1.6 }}>
            Te mandamos un link a <strong>{email}</strong>. Abrilo desde este mismo dispositivo para entrar.
          </p>
        ) : reqSent ? (
          <div>
            <p style={{ color: INK, fontSize: 14, fontWeight: 600, margin: "0 0 6px" }}>Solicitud enviada</p>
            <p style={{ color: MUTED, fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
              Recibimos tu solicitud. Cuando sea aprobada, vas a poder ingresar a CavaVinos.
            </p>
          </div>
        ) : showRequest ? (
          <>
            <p style={{ color: MUTED, fontSize: 13.5, marginBottom: 14 }}>Dejanos tu nombre y tu mail para solicitar acceso.</p>
            <input
              style={{ ...inputStyle, marginBottom: 10 }}
              placeholder="Tu nombre"
              value={reqNombre}
              onChange={(e) => setReqNombre(e.target.value)}
            />
            <div style={{ position: "relative", marginBottom: 12 }}>
              <Mail size={15} color={MUTED} style={{ position: "absolute", left: 12, top: 12 }} />
              <input
                style={{ ...inputStyle, paddingLeft: 34 }}
                type="email"
                placeholder="tu@mail.com"
                value={reqEmail}
                onChange={(e) => setReqEmail(e.target.value)}
              />
            </div>
            {reqError && <p style={{ color: DANGER, fontSize: 13, marginBottom: 10 }}>{reqError}</p>}
            <button
              disabled={!reqNombre.trim() || !reqEmail.trim() || reqSending}
              onClick={handleSendRequest}
              style={{ width: "100%", padding: "11px 0", borderRadius: 8, border: "none", background: reqNombre.trim() && reqEmail.trim() ? BORDEAUX : BORDER, color: reqNombre.trim() && reqEmail.trim() ? CREAM : MUTED, fontWeight: 700, fontSize: 14, cursor: reqNombre.trim() && reqEmail.trim() ? "pointer" : "not-allowed" }}
            >
              {reqSending ? "Enviando..." : "Solicitar acceso"}
            </button>
            <button
              onClick={() => setShowRequest(false)}
              style={{ background: "none", border: "none", color: MUTED, textDecoration: "underline", cursor: "pointer", fontSize: 12.5, padding: "10px 0 0", display: "block", width: "100%", textAlign: "center" }}
            >
              Volver
            </button>
          </>
        ) : (
          <>
            <p style={{ color: MUTED, fontSize: 13.5, marginBottom: 14 }}>
              Solo pueden entrar quienes fueron invitados. Ingresá tu mail y te mandamos un link para entrar (sin contraseña).
            </p>
            <div style={{ position: "relative", marginBottom: 12 }}>
              <Mail size={15} color={MUTED} style={{ position: "absolute", left: 12, top: 12 }} />
              <input
                style={{ ...inputStyle, paddingLeft: 34 }}
                type="email"
                placeholder="tu@mail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && email.trim() && handleSend()}
              />
            </div>
            {error && <p style={{ color: DANGER, fontSize: 13, marginBottom: 10 }}>{error}</p>}
            <button
              disabled={!email.trim() || sending}
              onClick={handleSend}
              style={{ width: "100%", padding: "11px 0", borderRadius: 8, border: "none", background: email.trim() ? BORDEAUX : BORDER, color: email.trim() ? CREAM : MUTED, fontWeight: 700, fontSize: 14, cursor: email.trim() ? "pointer" : "not-allowed" }}
            >
              {sending ? "Enviando..." : "Enviar link"}
            </button>

            {notAuthorized && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${BORDER}`, textAlign: "center" }}>
                <p style={{ color: INK, fontSize: 13.5, margin: "0 0 4px", fontWeight: 600 }}>Todavía no tenés acceso a CavaVinos.</p>
                <p style={{ color: MUTED, fontSize: 13, margin: "0 0 10px" }}>Si querés probar la aplicación, podés solicitar acceso.</p>
                <button
                  onClick={() => setShowRequest(true)}
                  style={{ background: "none", border: `1px solid ${GOLD}`, color: BORDEAUX, borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontSize: 13.5, fontWeight: 600 }}
                >
                  Solicitar acceso
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Elegir nombre la primera vez (después de loguearse) ----------
function ProfileSetup({ onSubmit }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <div style={{ minHeight: "100vh", background: CREAM, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: SANS }}>
      <div style={{ background: CARD_BG, borderRadius: 14, padding: 30, maxWidth: 360, width: "100%", textAlign: "center", boxShadow: "0 10px 30px rgba(74,20,32,0.12)" }}>
        <h2 style={{ fontFamily: SERIF, color: BORDEAUX, margin: "0 0 6px", fontSize: 22 }}>¡Ya estás dentro!</h2>
        <p style={{ color: MUTED, fontSize: 13.5, margin: "0 0 18px" }}>¿Cómo querés que aparezca tu nombre en la cava?</p>
        <input
          style={{ ...inputStyle, marginBottom: 12, textAlign: "center" }}
          placeholder="Tu nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          disabled={!name.trim() || saving}
          onClick={async () => {
            setSaving(true);
            await onSubmit(name.trim());
          }}
          style={{ width: "100%", padding: "11px 0", borderRadius: 8, border: "none", background: name.trim() ? BORDEAUX : BORDER, color: name.trim() ? CREAM : MUTED, fontWeight: 700, fontSize: 14, cursor: name.trim() ? "pointer" : "not-allowed" }}
        >
          {saving ? "Guardando..." : "Continuar"}
        </button>
      </div>
    </div>
  );
}

// ---------- Wine form/detail modal ----------
function WineModal({ wine, myUserId, myName, canEdit, accessToken, onSave, onDelete, onRate, onCancel }) {
  const isNew = !wine;
  const isAuthor = isNew || (wine.userId === myUserId && canEdit);
  const [entryMode, setEntryMode] = useState(isNew ? null : "manual"); // null | 'manual' | 'photo'
  const [identifyBlob, setIdentifyBlob] = useState(null);
  const [identifyPreview, setIdentifyPreview] = useState(null);
  const [identifying, setIdentifying] = useState(false);
  const [identifyError, setIdentifyError] = useState(null);
  const [techNotes, setTechNotes] = useState(null);
  const identifyFileRef = useRef(null);
  const [draft, setDraft] = useState(
    wine
      ? { ...wine }
      : { id: uid(), nombre: "", bodega: "", varietal: "", anada: "", precio: "", maridaje: "", region: "", lugar: "", stock: 1, favorito: false, foto: null, userId: myUserId }
  );
  const [photoBlob, setPhotoBlob] = useState(null);
  const [myRating, setMyRating] = useState(wine?.ratings?.[myUserId]?.valor || 0);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const update = (key, val) => setDraft((w) => ({ ...w, [key]: val }));
  const setStock = (val) => setDraft((w) => ({ ...w, stock: Math.max(0, Math.round(Number(val) || 0)) }));

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessingPhoto(true);
    try {
      const blob = await compressImageToBlob(file);
      setPhotoBlob(blob);
      update("foto", URL.createObjectURL(blob));
    } finally {
      setProcessingPhoto(false);
    }
  };

  const handleIdentifyPhotoPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIdentifyError(null);
    const blob = await compressImageToBlob(file);
    setIdentifyBlob(blob);
    setIdentifyPreview(URL.createObjectURL(blob));
  };

  const runIdentify = async () => {
    if (!identifyBlob) return;
    setIdentifying(true);
    setIdentifyError(null);
    try {
      const base64 = await blobToBase64(identifyBlob);
      const resp = await fetch("/api/identify-wine", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || "No se pudo identificar la etiqueta");

      const r = result.result || {};
      setDraft((w) => ({
        ...w,
        nombre: r.nombre || w.nombre,
        bodega: r.bodega || w.bodega,
        varietal: r.varietal || w.varietal,
        anada: r.anada || w.anada,
        region: r.region || w.region,
        lugar: r.lugar || w.lugar,
        precio: r.precio != null ? r.precio : w.precio,
        maridaje: r.maridaje || w.maridaje,
      }));
      setTechNotes(r.notas_tecnicas || null);
      // La foto usada para identificar queda también como foto del vino,
      // así no hay que sacarla dos veces (no se guarda nada todavía —
      // recién se sube si el usuario confirma "Guardar" más abajo).
      setPhotoBlob(identifyBlob);
      update("foto", identifyPreview);
      if (r.advertencia) setIdentifyError(r.advertencia);
      setEntryMode("manual");
    } catch (err) {
      setIdentifyError(err.message || "No se pudo identificar la etiqueta");
    } finally {
      setIdentifying(false);
    }
  };

  const canSave = draft.nombre.trim().length > 0 && !processingPhoto && !saving;
  const ratingsEntries = Object.entries(wine?.ratings || {}).filter(([id]) => id !== myUserId);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSave(draft, photoBlob);
      await onRate(draft.id, myRating);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(43,33,28,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: CARD_BG, borderRadius: 14, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(43,33,28,0.35)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: `1px solid ${BORDER}` }}>
          <h2 style={{ margin: 0, fontFamily: SERIF, fontSize: 22, color: BORDEAUX, fontWeight: 700 }}>{isNew ? "Agregar vino" : draft.nombre || "Vino"}</h2>
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 4 }} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: 20 }}>
          {entryMode === null && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 0 4px" }}>
              <p style={{ color: MUTED, fontSize: 13.5, margin: "0 0 4px", textAlign: "center" }}>¿Cómo querés cargar este vino?</p>
              <button
                onClick={() => setEntryMode("manual")}
                style={{ padding: "14px 16px", borderRadius: 10, border: `1px solid ${BORDER}`, background: "#FFFDFA", color: INK, fontSize: 15, fontWeight: 600, cursor: "pointer", textAlign: "left" }}
              >
                Cargar manualmente
              </button>
              <button
                onClick={() => setEntryMode("photo")}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderRadius: 10, border: `1px solid ${GOLD}`, background: CREAM, color: BORDEAUX, fontSize: 15, fontWeight: 700, cursor: "pointer", textAlign: "left" }}
              >
                <Camera size={18} /> Identificar con foto
              </button>
            </div>
          )}

          {entryMode === "photo" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "6px 0" }}>
              <p style={{ color: MUTED, fontSize: 13, margin: 0 }}>
                Sacá o subí una foto de la etiqueta. La IA va a proponer los datos, pero vos los revisás y confirmás antes de guardar nada.
              </p>
              <div
                onClick={() => !identifying && identifyFileRef.current?.click()}
                style={{ width: 170, aspectRatio: "4 / 5", margin: "0 auto", borderRadius: 10, overflow: "hidden", cursor: identifying ? "default" : "pointer", border: `1px dashed ${GOLD}`, position: "relative" }}
              >
                {identifyPreview ? (
                  <img src={identifyPreview} alt="Etiqueta a identificar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: MUTED, background: CREAM }}>
                    <Camera size={26} strokeWidth={1.4} />
                    <span style={{ fontSize: 13 }}>Sacar o subir foto</span>
                  </div>
                )}
                <input ref={identifyFileRef} type="file" accept="image/*" capture="environment" onChange={handleIdentifyPhotoPick} style={{ display: "none" }} />
              </div>

              {identifyError && (
                <div style={{ background: "#F5E6E1", border: `1px solid ${DANGER}`, color: DANGER, padding: "9px 12px", borderRadius: 8, fontSize: 13 }}>
                  {identifyError}
                </div>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => { setEntryMode(null); setIdentifyBlob(null); setIdentifyPreview(null); setIdentifyError(null); }}
                  style={{ flex: 1, padding: "11px 0", borderRadius: 8, border: `1px solid ${BORDER}`, background: "none", color: INK, cursor: "pointer", fontSize: 14 }}
                >
                  Volver
                </button>
                <button
                  disabled={!identifyBlob || identifying}
                  onClick={runIdentify}
                  style={{ flex: 1, padding: "11px 0", borderRadius: 8, border: "none", background: identifyBlob && !identifying ? BORDEAUX : BORDER, color: identifyBlob && !identifying ? CREAM : MUTED, cursor: identifyBlob && !identifying ? "pointer" : "not-allowed", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                >
                  {identifying ? (
                    <>
                      <Loader2 size={16} style={{ animation: "spin 0.8s linear infinite" }} /> Analizando etiqueta...
                    </>
                  ) : (
                    "Analizar"
                  )}
                </button>
              </div>
              <button
                onClick={() => { setEntryMode("manual"); }}
                style={{ background: "none", border: "none", color: MUTED, textDecoration: "underline", cursor: "pointer", fontSize: 12.5, padding: 0 }}
              >
                Prefiero cargar los datos a mano
              </button>
            </div>
          )}

          {entryMode === "manual" && (
          <>
          {techNotes && (
            <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", fontSize: 12.5, color: MUTED, marginBottom: 16 }}>
              <strong style={{ color: INK }}>Revisá la información identificada antes de guardar.</strong> Info técnica detectada: {techNotes}
            </div>
          )}
          {isAuthor ? (
            <>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{ width: 170, aspectRatio: "4 / 5", margin: "0 auto 18px", borderRadius: 10, overflow: "hidden", cursor: "pointer", border: `1px dashed ${GOLD}`, position: "relative" }}
              >
                {processingPhoto ? (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: CREAM }}>
                    <Loader2 size={22} color={MUTED} style={{ animation: "spin 0.8s linear infinite" }} />
                  </div>
                ) : draft.foto ? (
                  <img src={draft.foto} alt="Etiqueta" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: MUTED, background: CREAM }}>
                    <Camera size={26} strokeWidth={1.4} />
                    <span style={{ fontSize: 13 }}>Subir foto de la etiqueta</span>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display: "none" }} />
              </div>

              <Field label="Nombre del vino">
                <input style={inputStyle} value={draft.nombre} onChange={(e) => update("nombre", e.target.value)} placeholder="Ej: Rutini Cabernet Malbec" />
              </Field>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <Field label="Bodega">
                    <input style={inputStyle} value={draft.bodega} onChange={(e) => update("bodega", e.target.value)} placeholder="Ej: Rutini Wines" />
                  </Field>
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="Varietal">
                    <input style={inputStyle} value={draft.varietal} onChange={(e) => update("varietal", e.target.value)} placeholder="Ej: Malbec" />
                  </Field>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <Field label="Añada">
                    <input style={inputStyle} type="number" value={draft.anada} onChange={(e) => update("anada", e.target.value)} placeholder="Ej: 2020" />
                  </Field>
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="Precio de compra">
                    <input style={inputStyle} type="number" value={draft.precio} onChange={(e) => update("precio", e.target.value)} placeholder="Ej: 12000" />
                  </Field>
                </div>
              </div>
              <Field label="Maridaje sugerido">
                <input style={inputStyle} value={draft.maridaje} onChange={(e) => update("maridaje", e.target.value)} placeholder="Ej: Carnes rojas, quesos curados" />
              </Field>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <Field label="Región">
                    <input style={inputStyle} value={draft.region || ""} onChange={(e) => update("region", e.target.value)} placeholder="Ej: Valle de Uco" />
                  </Field>
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="Lugar / localidad">
                    <input style={inputStyle} value={draft.lugar || ""} onChange={(e) => update("lugar", e.target.value)} placeholder="Ej: Gualtallary" />
                  </Field>
                </div>
              </div>
              <Field label="Stock (botellas)">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setStock((draft.stock ?? 0) - 1)}
                    style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${BORDER}`, background: "#FFFDFA", color: INK, fontSize: 18, cursor: "pointer", flexShrink: 0 }}
                  >
                    −
                  </button>
                  <input
                    style={{ ...inputStyle, textAlign: "center" }}
                    type="number"
                    min="0"
                    step="1"
                    value={draft.stock ?? 0}
                    onChange={(e) => setStock(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setStock((draft.stock ?? 0) + 1)}
                    style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${BORDER}`, background: "#FFFDFA", color: INK, fontSize: 18, cursor: "pointer", flexShrink: 0 }}
                  >
                    +
                  </button>
                </div>
              </Field>

              <button
                type="button"
                onClick={() => update("favorito", !draft.favorito)}
                style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: "4px 0 16px", color: draft.favorito ? DANGER : MUTED, fontSize: 13.5 }}
              >
                <Heart size={17} fill={draft.favorito ? DANGER : "none"} />
                {draft.favorito ? "Favorito" : "Marcar como favorito"}
              </button>
            </>
          ) : (
            <div style={{ marginBottom: 18, fontSize: 14, color: INK, lineHeight: 1.9 }}>
              {draft.foto && <img src={draft.foto} alt={draft.nombre} style={{ width: 170, aspectRatio: "4 / 5", objectFit: "cover", borderRadius: 10, display: "block", margin: "0 auto 12px" }} />}
              <div><strong>Bodega / varietal:</strong> {[draft.bodega, draft.varietal].filter(Boolean).join(" · ") || "—"}</div>
              <div><strong>Añada:</strong> {draft.anada || "—"}</div>
              <div><strong>Precio:</strong> {draft.precio ? `$${Number(draft.precio).toLocaleString("es-AR")}` : "—"}</div>
              <div><strong>Maridaje:</strong> {draft.maridaje || "—"}</div>
              <div><strong>Región / lugar:</strong> {[draft.region, draft.lugar].filter(Boolean).join(" · ") || "—"}</div>
              <div><strong>Stock:</strong> {draft.stock ?? 0} botella{(draft.stock ?? 0) === 1 ? "" : "s"}</div>
            </div>
          )}

          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 16, marginTop: 4 }}>
            <Field label="Tu puntaje">
              <StarRating value={myRating} onChange={setMyRating} size={28} />
            </Field>

            {ratingsEntries.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <span style={{ fontSize: 13, color: MUTED, display: "block", marginBottom: 8 }}>Puntajes de los demás</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {ratingsEntries.map(([id, r]) => (
                    <div key={id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13.5, color: INK }}>{r.nombre}</span>
                      <StarRating value={r.valor} onChange={() => {}} size={15} readOnly />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          </>
          )}
        </div>

        {entryMode === "manual" && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderTop: `1px solid ${BORDER}` }}>
          <div>
            {!isNew && isAuthor && (
              <button onClick={() => onDelete(draft.id)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: DANGER, cursor: "pointer", fontSize: 14, padding: "8px 4px" }}>
                <Trash2 size={16} /> Eliminar
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onCancel} style={{ padding: "10px 18px", borderRadius: 8, border: `1px solid ${BORDER}`, background: "none", color: INK, cursor: "pointer", fontSize: 14 }}>
              Cancelar
            </button>
            <button
              disabled={isAuthor && !canSave}
              onClick={handleSubmit}
              style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: !isAuthor || canSave ? BORDEAUX : BORDER, color: !isAuthor || canSave ? CREAM : MUTED, cursor: !isAuthor || canSave ? "pointer" : "not-allowed", fontSize: 14, fontWeight: 600 }}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

// ---------- Confirmación genérica ----------
function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(43,33,28,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 70 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: CARD_BG, borderRadius: 14, padding: 24, maxWidth: 360, width: "100%", boxShadow: "0 20px 60px rgba(43,33,28,0.35)" }}>
        <p style={{ color: INK, fontSize: 14.5, lineHeight: 1.6, margin: "0 0 20px" }}>{message}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onCancel} style={{ padding: "9px 16px", borderRadius: 8, border: `1px solid ${BORDER}`, background: "none", color: INK, cursor: "pointer", fontSize: 14 }}>
            Cancelar
          </button>
          <button onClick={onConfirm} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: BORDEAUX, color: CREAM, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

const ROLE_LABEL = { admin: "Admin", editor: "Editor", viewer: "Viewer" };

// ---------- Panel de administración (solo ADMIN) ----------
function AdminPanel({ myUserId, accessToken, onClose }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [pendingChange, setPendingChange] = useState(null); // { id, nombre, from, to }
  const [saving, setSaving] = useState(false);

  const [requests, setRequests] = useState(null);
  const [reqError, setReqError] = useState(null);
  const [reqActionId, setReqActionId] = useState(null);

  const loadUsers = async () => {
    setError(null);
    const { data, error } = await supabase.rpc("admin_list_users");
    if (error) {
      setError(error.message);
      return;
    }
    setUsers(data || []);
  };

  const loadRequests = async () => {
    setReqError(null);
    const { data, error } = await supabase
      .from("access_requests")
      .select("id, nombre, email, status, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      setReqError(error.message);
      return;
    }
    setRequests(data || []);
  };

  useEffect(() => {
    loadUsers();
    loadRequests();
  }, []);

  const applyChange = async () => {
    if (!pendingChange) return;
    setSaving(true);
    const { error } = await supabase.rpc("admin_set_role", {
      target_id: pendingChange.id,
      new_role: pendingChange.to,
    });
    setSaving(false);
    setPendingChange(null);
    if (error) {
      setError(error.message);
      return;
    }
    await loadUsers();
  };

  const approveRequest = async (r) => {
    setReqActionId(r.id);
    setReqError(null);
    try {
      const resp = await fetch("/api/invite-approved-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ request_id: r.id }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || "No se pudo aprobar la solicitud");
      await loadRequests();
    } catch (err) {
      setReqError(err.message || "No se pudo aprobar la solicitud");
    } finally {
      setReqActionId(null);
    }
  };

  const rejectRequest = async (r) => {
    setReqActionId(r.id);
    setReqError(null);
    const { error } = await supabase.from("access_requests").update({ status: "rejected", updated_at: new Date().toISOString() }).eq("id", r.id);
    setReqActionId(null);
    if (error) {
      setReqError(error.message);
      return;
    }
    await loadRequests();
  };

  const pendingRequests = (requests || []).filter((r) => r.status === "pending");
  const otherRequests = (requests || []).filter((r) => r.status !== "pending");
  const STATUS_LABEL = { pending: "Pendiente", approved: "Aprobada", rejected: "Rechazada" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(43,33,28,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: CARD_BG, borderRadius: 14, width: "100%", maxWidth: 560, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(43,33,28,0.35)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: `1px solid ${BORDER}` }}>
          <h2 style={{ margin: 0, fontFamily: SERIF, fontSize: 22, color: BORDEAUX, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            <Shield size={19} /> Administración
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 4 }} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: 20 }}>
          <h3 style={{ fontFamily: SERIF, fontSize: 16, color: INK, margin: "0 0 12px" }}>Usuarios</h3>

          {error && (
            <div style={{ background: "#F5E6E1", border: `1px solid ${DANGER}`, color: DANGER, padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 14 }}>
              {error}
            </div>
          )}

          {users === null ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "30px 0", color: MUTED }}>
              <Loader2 size={22} style={{ animation: "spin 0.8s linear infinite" }} />
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {users.map((u) => (
                <div
                  key={u.id}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", border: `1px solid ${BORDER}`, borderRadius: 10, background: "#FFFDFA" }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, color: INK, fontWeight: 600 }}>
                      {u.nombre} {u.id === myUserId && <span style={{ color: MUTED, fontWeight: 400 }}>(vos)</span>}
                    </div>
                    <div style={{ fontSize: 12.5, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                  </div>
                  <select
                    value={u.role}
                    disabled={u.id === myUserId}
                    onChange={(e) => setPendingChange({ id: u.id, nombre: u.nombre, from: u.role, to: e.target.value })}
                    style={{ ...inputStyle, width: "auto", padding: "7px 10px", fontSize: 13.5, cursor: u.id === myUserId ? "not-allowed" : "pointer", opacity: u.id === myUserId ? 0.6 : 1 }}
                  >
                    <option value="admin">Admin</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
              ))}
            </div>
          )}

          <p style={{ color: MUTED, fontSize: 12.5, marginTop: 14 }}>
            No podés cambiar tu propio rol — pedile a otro administrador que lo haga.
          </p>

          <h3 style={{ fontFamily: SERIF, fontSize: 16, color: INK, margin: "24px 0 12px", paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
            Solicitudes de acceso {pendingRequests.length > 0 && `(${pendingRequests.length})`}
          </h3>

          {reqError && (
            <div style={{ background: "#F5E6E1", border: `1px solid ${DANGER}`, color: DANGER, padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 14 }}>
              {reqError}
            </div>
          )}

          {requests === null ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "20px 0", color: MUTED }}>
              <Loader2 size={20} style={{ animation: "spin 0.8s linear infinite" }} />
            </div>
          ) : requests.length === 0 ? (
            <p style={{ color: MUTED, fontSize: 13 }}>No hay solicitudes todavía.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[...pendingRequests, ...otherRequests].map((r) => (
                <div key={r.id} style={{ padding: "10px 12px", border: `1px solid ${BORDER}`, borderRadius: 10, background: "#FFFDFA" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: INK, fontWeight: 600 }}>{r.nombre}</div>
                      <div style={{ fontSize: 12.5, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.email}</div>
                      <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>
                        {new Date(r.created_at).toLocaleDateString("es-AR")} · {STATUS_LABEL[r.status]}
                      </div>
                    </div>
                    {r.status === "pending" && (
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button
                          disabled={reqActionId === r.id}
                          onClick={() => approveRequest(r)}
                          style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: BORDEAUX, color: CREAM, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
                        >
                          {reqActionId === r.id ? "..." : "Aprobar"}
                        </button>
                        <button
                          disabled={reqActionId === r.id}
                          onClick={() => rejectRequest(r)}
                          style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${BORDER}`, background: "none", color: DANGER, fontSize: 12.5, cursor: "pointer" }}
                        >
                          Rechazar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {pendingChange && (
        <ConfirmDialog
          message={`¿Confirmás cambiar a ${pendingChange.nombre} de ${ROLE_LABEL[pendingChange.from]} a ${ROLE_LABEL[pendingChange.to]}?`}
          onConfirm={applyChange}
          onCancel={() => setPendingChange(null)}
        />
      )}
      {saving && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(43,33,28,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 80 }}>
          <Loader2 size={26} color="#fff" style={{ animation: "spin 0.8s linear infinite" }} />
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

function WineCard({ wine, onClick, clickable }) {
  const avg = avgOf(wine.ratings);
  const count = Object.keys(wine.ratings || {}).length;
  return (
    <div
      onClick={clickable ? onClick : undefined}
      style={{ background: CARD_BG, borderRadius: 12, border: `1px solid ${BORDER}`, overflow: "hidden", cursor: clickable ? "pointer" : "default", transition: "box-shadow 0.15s ease, border-color 0.15s ease", display: "flex", flexDirection: "column" }}
      onMouseEnter={(e) => {
        if (!clickable) return;
        e.currentTarget.style.boxShadow = "0 8px 20px rgba(74,20,32,0.12)";
        e.currentTarget.style.borderColor = GOLD;
      }}
      onMouseLeave={(e) => {
        if (!clickable) return;
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.borderColor = BORDER;
      }}
    >
      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ width: "62%", margin: "0 auto", aspectRatio: "4 / 5", borderRadius: 8, overflow: "hidden", border: `1px solid ${BORDER}`, boxShadow: "0 3px 10px rgba(74,20,32,0.08)", position: "relative" }}>
          {wine.foto ? <img src={wine.foto} alt={wine.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <BottlePlaceholder />}
          {(() => {
            const stock = wine.stock ?? 0;
            if (stock === 0) {
              return (
                <span style={{ position: "absolute", top: 6, right: 6, background: "#8B8578", color: "#fff", fontSize: 10.5, fontWeight: 700, padding: "3px 7px", borderRadius: 999 }}>
                  ⚪ Tomado
                </span>
              );
            }
            return (
              <span style={{ position: "absolute", top: 6, right: 6, background: stock <= 2 ? GOLD : "#4A8B5C", color: stock <= 2 ? BORDEAUX_DARK : "#fff", fontSize: 10.5, fontWeight: 700, padding: "3px 7px", borderRadius: 999 }}>
                🟢 Tengo {stock}
              </span>
            );
          })()}
        </div>
      </div>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        <div>
          <h3 style={{ margin: 0, fontFamily: SERIF, fontSize: 17, color: INK, lineHeight: 1.25, display: "flex", alignItems: "center", gap: 6 }}>
            {wine.nombre}
            {wine.favorito && <Heart size={14} fill={DANGER} color={DANGER} />}
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: MUTED }}>
            {[wine.bodega, wine.varietal].filter(Boolean).join(" · ") || "Sin datos de bodega"}
            {wine.anada ? ` · ${wine.anada}` : ""}
          </p>
          {(wine.region || wine.lugar) && (
            <p style={{ margin: "2px 0 0", fontSize: 12, color: MUTED, display: "flex", alignItems: "center", gap: 4 }}>
              <MapPin size={11} />
              {[wine.region, wine.lugar].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: MUTED }}>
          {wine.maridaje && (
            <>
              <UtensilsCrossed size={12} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wine.maridaje}</span>
            </>
          )}
        </div>
        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <StarRating value={avg || 0} onChange={() => {}} size={15} readOnly />
            {count > 0 && <span style={{ fontSize: 11.5, color: MUTED }}>({count})</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {(wine.stock ?? 0) > 2 && (
              <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11.5, color: MUTED }}>
                <Package size={12} /> {wine.stock}
              </span>
            )}
            {wine.precio != null && wine.precio !== "" && (
              <span style={{ fontFamily: SERIF, fontSize: 14, color: GOLD, fontWeight: 700 }}>${Number(wine.precio).toLocaleString("es-AR")}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = todavía no sabemos
  const [profile, setProfile] = useState(undefined);
  const [wines, setWines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("reciente");
  const [showFilters, setShowFilters] = useState(false);
  const [filterRegion, setFilterRegion] = useState("");
  const [filterLugar, setFilterLugar] = useState("");
  const [filterBodega, setFilterBodega] = useState("");
  const [filterVarietal, setFilterVarietal] = useState("");
  const [filterAnada, setFilterAnada] = useState("");
  const [filterStock, setFilterStock] = useState("todos");
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) {
      setProfile(null);
      loadWines();
      return;
    }
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      setProfile(data || null);
      loadWines();
    })();
  }, [session]);

  useEffect(() => {
    const channel = supabase
      .channel("cava-cambios")
      .on("postgres_changes", { event: "*", schema: "public", table: "wines" }, loadWines)
      .on("postgres_changes", { event: "*", schema: "public", table: "ratings" }, loadWines)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  async function loadWines() {
    if (!session) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("wines")
      .select("*, profiles(nombre), ratings(user_id, valor, profiles(nombre))")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setSaveError(true);
      setLoading(false);
      return;
    }

    const { data: privados, error: privError } = await supabase
      .from("wine_privado")
      .select("wine_id, precio, stock, favorito")
      .eq("user_id", session.user.id);

    if (privError) {
      console.error(privError);
      setSaveError(true);
      setLoading(false);
      return;
    }

    const privadoPorVino = Object.fromEntries((privados || []).map((p) => [p.wine_id, p]));

    setWines(
      (data || []).map((w) => {
        const priv = privadoPorVino[w.id] || {};
        return {
          id: w.id,
          nombre: w.nombre,
          bodega: w.bodega,
          varietal: w.varietal,
          anada: w.anada,
          precio: priv.precio ?? null,
          maridaje: w.maridaje,
          region: w.region,
          lugar: w.lugar,
          stock: priv.stock ?? 0,
          favorito: priv.favorito ?? false,
          foto: w.foto_url,
          userId: w.user_id,
          fechaAgregado: w.created_at,
          ratings: Object.fromEntries(
            (w.ratings || []).map((r) => [r.user_id, { valor: Number(r.valor), nombre: r.profiles?.nombre || "—" }])
          ),
        };
      })
    );
    setLoading(false);
  }

  const handleCreateProfile = async (nombre) => {
    const { data, error } = await supabase.from("profiles").insert({ id: session.user.id, nombre }).select().single();
    if (!error) setProfile(data);
  };

  const handleSave = async (draft, photoBlob) => {
    try {
      let foto_url = draft.foto && draft.foto.startsWith("http") ? draft.foto : null;
      if (photoBlob) {
        const base64 = await blobToBase64(photoBlob);
        const resp = await fetch("/api/upload-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ wineId: draft.id, imageBase64: base64 }),
        });
        const result = await resp.json();
        if (!resp.ok) throw new Error(result.error || "No se pudo subir la foto");
        foto_url = result.url;
      }

      const winePayload = {
        id: draft.id,
        nombre: draft.nombre,
        bodega: draft.bodega || null,
        varietal: draft.varietal || null,
        anada: draft.anada ? Number(draft.anada) : null,
        maridaje: draft.maridaje || null,
        region: draft.region || null,
        lugar: draft.lugar || null,
        foto_url,
        user_id: draft.userId,
      };
      const { error: wineError } = await supabase.from("wines").upsert(winePayload);
      if (wineError) throw wineError;

      const privadoPayload = {
        wine_id: draft.id,
        user_id: draft.userId,
        precio: draft.precio ? Number(draft.precio) : null,
        stock: Math.max(0, Math.round(Number(draft.stock) || 0)),
        favorito: Boolean(draft.favorito),
      };
      const { error: privError } = await supabase.from("wine_privado").upsert(privadoPayload);
      if (privError) throw privError;

      setSaveError(false);
      await loadWines();
    } catch (err) {
      console.error(err);
      setSaveError(true);
    }
    setShowForm(false);
    setEditing(null);
  };

  const handleRate = async (wineId, valor) => {
    try {
      if (valor > 0) {
        const { error } = await supabase.from("ratings").upsert({ wine_id: wineId, user_id: session.user.id, valor }, { onConflict: "wine_id,user_id" });
        if (error) throw error;
      } else {
        await supabase.from("ratings").delete().eq("wine_id", wineId).eq("user_id", session.user.id);
      }
      await loadWines();
    } catch (err) {
      console.error(err);
      setSaveError(true);
    }
  };

  const handleDelete = async (id) => {
    try {
      const { error } = await supabase.from("wines").delete().eq("id", id);
      if (error) throw error;
      await loadWines();
    } catch (err) {
      console.error(err);
      setSaveError(true);
    }
    // Borrar la foto del bucket es solo prolijidad — si falla, no importa,
    // el vino ya se borró igual.
    supabase.storage.from(PHOTOS_BUCKET).remove([`${id}.jpg`]).catch(() => {});
    setShowForm(false);
    setEditing(null);
  };

  const uniqueValues = (key) =>
    Array.from(new Set(wines.map((w) => w[key]).filter((v) => v != null && String(v).trim() !== ""))).sort((a, b) =>
      String(a).localeCompare(String(b))
    );

  const regionOptions = uniqueValues("region");
  const lugarOptions = uniqueValues("lugar");
  const bodegaOptions = uniqueValues("bodega");
  const varietalOptions = uniqueValues("varietal");
  const anadaOptions = Array.from(new Set(wines.map((w) => w.anada).filter((v) => v != null && String(v).trim() !== "")))
    .sort((a, b) => Number(b) - Number(a));

  const hasActiveFilters =
    search.trim() !== "" ||
    filterRegion !== "" ||
    filterLugar !== "" ||
    filterBodega !== "" ||
    filterVarietal !== "" ||
    filterAnada !== "" ||
    filterStock !== "todos";

  const clearFilters = () => {
    setSearch("");
    setFilterRegion("");
    setFilterLugar("");
    setFilterBodega("");
    setFilterVarietal("");
    setFilterAnada("");
    setFilterStock("todos");
  };

  const filtered = wines.filter((w) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      q === "" ||
      w.nombre.toLowerCase().includes(q) ||
      (w.bodega || "").toLowerCase().includes(q) ||
      (w.varietal || "").toLowerCase().includes(q) ||
      (w.region || "").toLowerCase().includes(q) ||
      (w.lugar || "").toLowerCase().includes(q) ||
      String(w.anada || "").toLowerCase().includes(q);

    const matchesRegion = !filterRegion || w.region === filterRegion;
    const matchesLugar = !filterLugar || w.lugar === filterLugar;
    const matchesBodega = !filterBodega || w.bodega === filterBodega;
    const matchesVarietal = !filterVarietal || w.varietal === filterVarietal;
    const matchesAnada = !filterAnada || String(w.anada) === String(filterAnada);
    const stock = w.stock ?? 0;
    const matchesStock = filterStock === "todos" || (filterStock === "con" ? stock > 0 : stock === 0);

    return matchesSearch && matchesRegion && matchesLugar && matchesBodega && matchesVarietal && matchesAnada && matchesStock;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case "nombre": return a.nombre.localeCompare(b.nombre);
      case "nombre-desc": return b.nombre.localeCompare(a.nombre);
      case "precio-desc": return (Number(b.precio) || 0) - (Number(a.precio) || 0);
      case "precio-asc": return (Number(a.precio) || 0) - (Number(b.precio) || 0);
      case "stock-desc": return (Number(b.stock) || 0) - (Number(a.stock) || 0);
      case "rating-desc": return (avgOf(b.ratings) || 0) - (avgOf(a.ratings) || 0);
      case "anada-desc": return (Number(b.anada) || 0) - (Number(a.anada) || 0);
      default: return new Date(b.fechaAgregado) - new Date(a.fechaAgregado);
    }
  });

  const role = profile?.role || "editor";
  const hasProfile = Boolean(session && profile);
  const canEdit = hasProfile && (role === "admin" || role === "editor");
  const isAdmin = hasProfile && role === "admin";
  const hasCava = hasProfile && role !== "viewer";
  const totalVinos = wines.length;
  const disponibles = wines.filter((w) => (w.stock ?? 0) > 0).length;
  const tomados = totalVinos - disponibles;

  if (session && profile === null) {
    return <ProfileSetup onSubmit={handleCreateProfile} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: CREAM, fontFamily: SANS, color: INK }}>
      <div style={{ background: `linear-gradient(135deg, ${BORDEAUX} 0%, ${BORDEAUX_DARK} 100%)`, padding: "24px 24px 20px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: 32, color: CREAM, fontWeight: 700, borderBottom: `2px solid ${GOLD}`, display: "inline-block", paddingBottom: 4 }}>Mi Cava</h1>
            {hasCava && (
              <p style={{ margin: "6px 0 0", color: GOLD_SOFT, fontSize: 13, opacity: 0.9 }}>
                {totalVinos} {totalVinos === 1 ? "vino registrado" : "vinos registrados"}
                {totalVinos > 0 && <> · {disponibles} disponible{disponibles === 1 ? "" : "s"} · {tomados} tomado{tomados === 1 ? "" : "s"}</>}
              </p>
            )}
            <p style={{ margin: "8px 0 0", color: GOLD_SOFT, fontSize: 13.5 }}>
              {hasProfile ? (
                <>
                  Entraste como <strong>{profile.nombre}</strong> ·{" "}
                  <button onClick={() => supabase.auth.signOut()} style={{ background: "none", border: "none", color: GOLD_SOFT, textDecoration: "underline", cursor: "pointer", padding: 0, fontSize: 13.5 }}>
                    cerrar sesión
                  </button>
                </>
              ) : (
                "Viendo la cava"
              )}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {isAdmin && (
              <button
                onClick={() => setShowAdmin(true)}
                style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", color: GOLD_SOFT, border: `1px solid ${GOLD_SOFT}`, borderRadius: 8, padding: "12px 16px", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}
              >
                <Shield size={15} /> Administración
              </button>
            )}
            {canEdit ? (
              <button
                onClick={() => { setEditing(null); setShowForm(true); }}
                style={{ display: "flex", alignItems: "center", gap: 8, background: GOLD, color: BORDEAUX_DARK, border: "none", borderRadius: 8, padding: "12px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                <Plus size={17} /> Agregar vino
              </button>
            ) : !hasProfile ? (
              <button
                onClick={() => setShowLogin(true)}
                style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", color: GOLD_SOFT, border: `1px solid ${GOLD_SOFT}`, borderRadius: 8, padding: "10px 16px", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}
              >
                <LogIn size={15} /> Iniciar sesión
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 24px 60px" }}>
        {!hasCava && hasProfile ? (
          <div style={{ textAlign: "center", padding: "80px 20px", border: `1px dashed ${BORDER}`, borderRadius: 12, background: CARD_BG }}>
            <Wine size={38} color={GOLD} strokeWidth={1.2} style={{ marginBottom: 14 }} />
            <h3 style={{ fontFamily: SERIF, fontSize: 20, margin: "0 0 6px", color: BORDEAUX }}>Todavía no tenés tu propia Cava</h3>
            <p style={{ color: MUTED, fontSize: 14, maxWidth: 360, margin: "0 auto" }}>
              Por ahora podés ingresar a CavaVinos, pero cargar y armar tu propia biblioteca de vinos es para cuentas Editor. Descubrir (ver y seguir las cavas de otras personas) todavía no está disponible.
            </p>
          </div>
        ) : !hasProfile ? (
          <div style={{ textAlign: "center", padding: "80px 20px", border: `1px dashed ${BORDER}`, borderRadius: 12, background: CARD_BG }}>
            <Wine size={38} color={GOLD} strokeWidth={1.2} style={{ marginBottom: 14 }} />
            <h3 style={{ fontFamily: SERIF, fontSize: 20, margin: "0 0 6px", color: BORDEAUX }}>Mi Cava es personal</h3>
            <p style={{ color: MUTED, fontSize: 14, margin: "0 0 20px" }}>Iniciá sesión para ver y armar tu propia biblioteca de vinos.</p>
            <button
              onClick={() => setShowLogin(true)}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, background: BORDEAUX, color: CREAM, border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              <LogIn size={16} /> Iniciar sesión
            </button>
          </div>
        ) : (
        <>
        {wines.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ position: "relative", flex: "1 1 240px" }}>
                <Search size={16} color={MUTED} style={{ position: "absolute", left: 12, top: 12 }} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, bodega, varietal, región, lugar o añada..." style={{ ...inputStyle, paddingLeft: 36 }} />
              </div>
              <button
                onClick={() => setShowFilters((v) => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 7, padding: "10px 14px", borderRadius: 8,
                  border: `1px solid ${showFilters || hasActiveFilters ? GOLD : BORDER}`,
                  background: showFilters || hasActiveFilters ? CREAM : "#FFFDFA",
                  color: INK, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                <SlidersHorizontal size={15} /> Filtros
                {hasActiveFilters && (
                  <span style={{ background: GOLD, color: BORDEAUX_DARK, borderRadius: 999, fontSize: 11, fontWeight: 700, padding: "1px 6px" }}>●</span>
                )}
              </button>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ ...inputStyle, width: "auto", cursor: "pointer" }}>
                <option value="reciente">Más recientes</option>
                <option value="nombre">Nombre (A-Z)</option>
                <option value="nombre-desc">Nombre (Z-A)</option>
                <option value="rating-desc">Mejor puntuados</option>
                <option value="precio-desc">Precio: mayor a menor</option>
                <option value="precio-asc">Precio: menor a mayor</option>
                <option value="stock-desc">Stock: mayor a menor</option>
                <option value="anada-desc">Añada más nueva</option>
              </select>
            </div>

            {showFilters && (
              <div style={{ marginTop: 12, padding: 14, border: `1px solid ${BORDER}`, borderRadius: 10, background: CARD_BG, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
                <select value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                  <option value="">Región: todas</option>
                  {regionOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <select value={filterLugar} onChange={(e) => setFilterLugar(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                  <option value="">Lugar: todos</option>
                  {lugarOptions.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                <select value={filterBodega} onChange={(e) => setFilterBodega(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                  <option value="">Bodega: todas</option>
                  {bodegaOptions.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
                <select value={filterVarietal} onChange={(e) => setFilterVarietal(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                  <option value="">Varietal: todos</option>
                  {varietalOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
                <select value={filterAnada} onChange={(e) => setFilterAnada(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                  <option value="">Añada: todas</option>
                  {anadaOptions.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <select value={filterStock} onChange={(e) => setFilterStock(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                  <option value="todos">Todos</option>
                  <option value="con">Tengo</option>
                  <option value="sin">Tomé</option>
                </select>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
              <span style={{ fontSize: 12.5, color: MUTED }}>
                {sorted.length} {sorted.length === 1 ? "vino" : "vinos"}
              </span>
              {hasActiveFilters && (
                <button onClick={clearFilters} style={{ background: "none", border: "none", color: MUTED, textDecoration: "underline", cursor: "pointer", fontSize: 12.5, padding: 0 }}>
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>
        )}

        {saveError && (
          <div style={{ background: "#F5E6E1", border: `1px solid ${DANGER}`, color: DANGER, padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 18 }}>
            Algo no se pudo guardar o cargar. Revisá tu conexión y probá de nuevo.
          </div>
        )}

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "80px 0", color: MUTED }}>
            <Loader2 size={26} style={{ animation: "spin 0.8s linear infinite" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        ) : wines.length === 0 ? (
          <div style={{ textAlign: "center", padding: "70px 20px", border: `1px dashed ${BORDER}`, borderRadius: 12, background: CARD_BG }}>
            <Wine size={38} color={GOLD} strokeWidth={1.2} style={{ marginBottom: 14 }} />
            <h3 style={{ fontFamily: SERIF, fontSize: 20, margin: "0 0 6px", color: BORDEAUX }}>{canEdit ? "Empiecen la cava" : "Todavía no hay vinos cargados"}</h3>
            {canEdit ? (
              <>
                <p style={{ color: MUTED, fontSize: 14, margin: "0 0 20px" }}>Sé el primero en cargar un vino para que los demás lo puntúen.</p>
                <button
                  onClick={() => { setEditing(null); setShowForm(true); }}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, background: BORDEAUX, color: CREAM, border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                >
                  <Plus size={16} /> Agregar vino
                </button>
              </>
            ) : (
              <p style={{ color: MUTED, fontSize: 14 }}>Volvé más adelante.</p>
            )}
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <p style={{ color: MUTED, margin: "0 0 10px" }}>No encontramos vinos que coincidan con tu búsqueda.</p>
            <button onClick={clearFilters} style={{ background: "none", border: `1px solid ${BORDER}`, color: INK, borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13.5 }}>
              Limpiar filtros
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 16 }}>
            {sorted.map((wine) => (
              <WineCard
                key={wine.id}
                wine={wine}
                clickable={hasProfile}
                onClick={() => { setEditing(wine); setShowForm(true); }}
              />
            ))}
          </div>
        )}
        </>
        )}
      </div>

      {showForm && hasProfile && (
        <WineModal
          wine={editing}
          myUserId={session.user.id}
          myName={profile.nombre}
          canEdit={canEdit}
          accessToken={session.access_token}
          onSave={handleSave}
          onDelete={handleDelete}
          onRate={handleRate}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {showAdmin && isAdmin && <AdminPanel myUserId={session.user.id} accessToken={session.access_token} onClose={() => setShowAdmin(false)} />}

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  );
}
