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
} from "lucide-react";
import { supabase } from "./supabaseClient";

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

  const handleSend = async () => {
    setSending(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
    });
    setSending(false);
    if (error) {
      setError("No se pudo enviar el link. Si tu mail no fue invitado, pedile a quien administra la cava que te invite desde Supabase.");
      return;
    }
    setSent(true);
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
        ) : (
          <>
            <p style={{ color: MUTED, fontSize: 13.5, marginBottom: 14 }}>
              Solo pueden cargar y editar quienes fueron invitados. Ingresá tu mail y te mandamos un link para entrar (sin contraseña).
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
function WineModal({ wine, myUserId, myName, onSave, onDelete, onRate, onCancel }) {
  const isNew = !wine;
  const isAuthor = isNew || wine.userId === myUserId;
  const [draft, setDraft] = useState(
    wine
      ? { ...wine }
      : { id: uid(), nombre: "", bodega: "", varietal: "", anada: "", precio: "", maridaje: "", foto: null, userId: myUserId }
  );
  const [photoBlob, setPhotoBlob] = useState(null);
  const [myRating, setMyRating] = useState(wine?.ratings?.[myUserId]?.valor || 0);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const update = (key, val) => setDraft((w) => ({ ...w, [key]: val }));

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
          {!isNew && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: MUTED, marginBottom: 16 }}>
              <User size={13} /> Cargado por {wine.autorNombre}
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
            </>
          ) : (
            <div style={{ marginBottom: 18, fontSize: 14, color: INK, lineHeight: 1.9 }}>
              {draft.foto && <img src={draft.foto} alt={draft.nombre} style={{ width: 170, aspectRatio: "4 / 5", objectFit: "cover", borderRadius: 10, display: "block", margin: "0 auto 12px" }} />}
              <div><strong>Bodega / varietal:</strong> {[draft.bodega, draft.varietal].filter(Boolean).join(" · ") || "—"}</div>
              <div><strong>Añada:</strong> {draft.anada || "—"}</div>
              <div><strong>Precio:</strong> {draft.precio ? `$${Number(draft.precio).toLocaleString("es-AR")}` : "—"}</div>
              <div><strong>Maridaje:</strong> {draft.maridaje || "—"}</div>
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
        </div>

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
      </div>
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
        <div style={{ width: "62%", margin: "0 auto", aspectRatio: "4 / 5", borderRadius: 8, overflow: "hidden", border: `1px solid ${BORDER}`, boxShadow: "0 3px 10px rgba(74,20,32,0.08)" }}>
          {wine.foto ? <img src={wine.foto} alt={wine.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <BottlePlaceholder />}
        </div>
      </div>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        <div>
          <h3 style={{ margin: 0, fontFamily: SERIF, fontSize: 17, color: INK, lineHeight: 1.25 }}>{wine.nombre}</h3>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: MUTED }}>
            {[wine.bodega, wine.varietal].filter(Boolean).join(" · ") || "Sin datos de bodega"}
            {wine.anada ? ` · ${wine.anada}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: MUTED }}>
          <User size={12} />
          <span>{wine.autorNombre}</span>
          {wine.maridaje && (
            <>
              <span style={{ color: BORDER }}>|</span>
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
          {wine.precio != null && wine.precio !== "" && (
            <span style={{ fontFamily: SERIF, fontSize: 14, color: GOLD, fontWeight: 700 }}>${Number(wine.precio).toLocaleString("es-AR")}</span>
          )}
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
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

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
    setLoading(true);
    const { data, error } = await supabase
      .from("wines")
      .select("*, profiles(nombre), ratings(user_id, valor, profiles(nombre))")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setSaveError(true);
      setLoading(false);
      return;
    }

    setWines(
      (data || []).map((w) => ({
        id: w.id,
        nombre: w.nombre,
        bodega: w.bodega,
        varietal: w.varietal,
        anada: w.anada,
        precio: w.precio,
        maridaje: w.maridaje,
        foto: w.foto_url,
        userId: w.user_id,
        autorNombre: w.profiles?.nombre || "—",
        fechaAgregado: w.created_at,
        ratings: Object.fromEntries(
          (w.ratings || []).map((r) => [r.user_id, { valor: Number(r.valor), nombre: r.profiles?.nombre || "—" }])
        ),
      }))
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
      const payload = {
        id: draft.id,
        nombre: draft.nombre,
        bodega: draft.bodega || null,
        varietal: draft.varietal || null,
        anada: draft.anada ? Number(draft.anada) : null,
        precio: draft.precio ? Number(draft.precio) : null,
        maridaje: draft.maridaje || null,
        foto_url,
        user_id: draft.userId,
      };
      const { error } = await supabase.from("wines").upsert(payload);
      if (error) throw error;
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

  const filtered = wines.filter((w) => {
    const q = search.toLowerCase();
    return w.nombre.toLowerCase().includes(q) || (w.bodega || "").toLowerCase().includes(q) || (w.varietal || "").toLowerCase().includes(q);
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case "nombre": return a.nombre.localeCompare(b.nombre);
      case "precio-desc": return (Number(b.precio) || 0) - (Number(a.precio) || 0);
      case "precio-asc": return (Number(a.precio) || 0) - (Number(b.precio) || 0);
      case "rating-desc": return (avgOf(b.ratings) || 0) - (avgOf(a.ratings) || 0);
      case "anada-desc": return (Number(b.anada) || 0) - (Number(a.anada) || 0);
      default: return new Date(b.fechaAgregado) - new Date(a.fechaAgregado);
    }
  });

  const isEditor = Boolean(session && profile);

  if (session && profile === null) {
    return <ProfileSetup onSubmit={handleCreateProfile} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: CREAM, fontFamily: SANS, color: INK }}>
      <div style={{ background: `linear-gradient(135deg, ${BORDEAUX} 0%, ${BORDEAUX_DARK} 100%)`, padding: "24px 24px 20px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: 32, color: CREAM, fontWeight: 700, borderBottom: `2px solid ${GOLD}`, display: "inline-block", paddingBottom: 4 }}>Mi Cava</h1>
            <p style={{ margin: "8px 0 0", color: GOLD_SOFT, fontSize: 13.5 }}>
              {isEditor ? (
                <>
                  Entraste como <strong>{profile.nombre}</strong> ·{" "}
                  <button onClick={() => supabase.auth.signOut()} style={{ background: "none", border: "none", color: GOLD_SOFT, textDecoration: "underline", cursor: "pointer", padding: 0, fontSize: 13.5 }}>
                    cerrar sesión
                  </button>
                </>
              ) : (
                "Viendo la cava · solo lectura"
              )}
            </p>
          </div>
          {isEditor ? (
            <button
              onClick={() => { setEditing(null); setShowForm(true); }}
              style={{ display: "flex", alignItems: "center", gap: 8, background: GOLD, color: BORDEAUX_DARK, border: "none", borderRadius: 8, padding: "12px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              <Plus size={17} /> Agregar vino
            </button>
          ) : (
            <button
              onClick={() => setShowLogin(true)}
              style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", color: GOLD_SOFT, border: `1px solid ${GOLD_SOFT}`, borderRadius: 8, padding: "10px 16px", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}
            >
              <LogIn size={15} /> Iniciar sesión
            </button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 24px 60px" }}>
        {wines.length > 0 && (
          <div style={{ display: "flex", gap: 10, marginBottom: 22, flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "1 1 240px" }}>
              <Search size={16} color={MUTED} style={{ position: "absolute", left: 12, top: 12 }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, bodega o varietal..." style={{ ...inputStyle, paddingLeft: 36 }} />
            </div>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ ...inputStyle, width: "auto", cursor: "pointer" }}>
              <option value="reciente">Más recientes</option>
              <option value="nombre">Nombre (A-Z)</option>
              <option value="rating-desc">Mejor puntuados</option>
              <option value="precio-desc">Precio: mayor a menor</option>
              <option value="precio-asc">Precio: menor a mayor</option>
              <option value="anada-desc">Añada más nueva</option>
            </select>
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
            <h3 style={{ fontFamily: SERIF, fontSize: 20, margin: "0 0 6px", color: BORDEAUX }}>{isEditor ? "Empiecen la cava" : "Todavía no hay vinos cargados"}</h3>
            {isEditor ? (
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
          <p style={{ color: MUTED, textAlign: "center", padding: "40px 0" }}>Ningún vino coincide con "{search}".</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 16 }}>
            {sorted.map((wine) => (
              <WineCard
                key={wine.id}
                wine={wine}
                clickable={isEditor}
                onClick={() => { setEditing(wine); setShowForm(true); }}
              />
            ))}
          </div>
        )}
      </div>

      {showForm && isEditor && (
        <WineModal
          wine={editing}
          myUserId={session.user.id}
          myName={profile.nombre}
          onSave={handleSave}
          onDelete={handleDelete}
          onRate={handleRate}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  );
}
