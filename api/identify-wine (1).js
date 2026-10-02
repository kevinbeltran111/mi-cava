import { createClient } from "@supabase/supabase-js";

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `Sos un asistente que lee etiquetas de botellas de vino a partir de una foto.
Tu única fuente de información es la imagen que te dan — nunca uses conocimiento externo,
nunca busques en internet, nunca completes un dato "porque suele ser así".

Devolvé ÚNICAMENTE un objeto JSON (sin texto antes ni después, sin bloques de código) con esta forma exacta:

{
  "multiples_vinos": boolean,
  "nombre": string o null,
  "bodega": string o null,
  "varietal": string o null,
  "anada": string o null,
  "region": string o null,
  "lugar": string o null,
  "precio": number o null,
  "maridaje": string o null,
  "notas_tecnicas": string o null,
  "confidence": {
    "nombre": "high" | "medium" | "low" | null,
    "bodega": "high" | "medium" | "low" | null,
    "varietal": "high" | "medium" | "low" | null,
    "anada": "high" | "medium" | "low" | null,
    "region": "high" | "medium" | "low" | null,
    "lugar": "high" | "medium" | "low" | null
  },
  "advertencia": string o null
}

Reglas estrictas:
- Esta app identifica un único vino por foto. "multiples_vinos": true SOLO si la imagen muestra más de una botella o más de una etiqueta de vino distintas, Y ninguna de ellas es inequívocamente la principal (por ejemplo, una mucho más grande, centrada o enfocada que las demás).
- Si "multiples_vinos" es true, dejá TODOS los demás campos (nombre, bodega, varietal, anada, region, lugar, precio, maridaje, notas_tecnicas, confidence) en null. No elijas arbitrariamente ninguna de las botellas.
- Si la imagen muestra una sola botella/etiqueta, o varias pero una es claramente la protagonista de la foto, "multiples_vinos" debe ser false, e identificá esa botella principal con normalidad.
- Si un dato no se lee con claridad en la etiqueta, va en null. Nunca inventes ni completes por suposición.
- "precio": solo si el número aparece impreso en la imagen. Si no aparece, null.
- "maridaje": es siempre una SUGERENCIA tuya, no un dato leído.
- "notas_tecnicas": info técnica extra legible en la etiqueta, o null.
- Si la imagen no muestra una etiqueta de vino legible, dejá todos los campos en null (incluido "multiples_vinos": false) y explicá el motivo en "advertencia".
- No incluyas ningún campo de stock ni de cantidad.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ error: "Falta el token de sesión" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!supabaseUrl || !anonKey || !anthropicKey) {
    return res.status(500).json({ error: "Faltan variables de entorno en el servidor" });
  }

  const authClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: "Sesión inválida" });
  }

  const { data: profile, error: profileError } = await authClient
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || !["admin", "editor"].includes(profile.role)) {
    return res.status(403).json({ error: "No autorizado para usar esta función" });
  }

  const { imageBase64 } = req.body || {};
  if (!imageBase64) {
    return res.status(400).json({ error: "Falta la imagen" });
  }

  const commaIdx = imageBase64.indexOf(",");
  const mediaType = imageBase64.startsWith("data:") ? imageBase64.slice(5, imageBase64.indexOf(";")) : "image/jpeg";
  const base64Data = commaIdx !== -1 ? imageBase64.slice(commaIdx + 1) : imageBase64;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } }, { type: "text", text: "Analizá la etiqueta de esta botella de vino y devolvé el JSON pedido." }] }],
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      return res.status(502).json({ error: "El servicio de identificación no respondió correctamente", detail: errBody.slice(0, 300) });
    }

    const data = await response.json();
    const text = (data.content || []).map((b) => (b.type === "text" ? b.text : "")).join("").trim();

    let parsed;
    try {
      const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return res.status(502).json({ error: "No se pudo interpretar la respuesta de la IA" });
    }

    return res.status(200).json({ result: parsed });
  } catch (err) {
    if (err.name === "AbortError") {
      return res.status(504).json({ error: "La identificación tardó demasiado, probá de nuevo" });
    }
    return res.status(500).json({ error: "Error inesperado al identificar la etiqueta" });
  }
}
