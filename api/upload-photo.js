import { createClient } from "@supabase/supabase-js";

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
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return res.status(500).json({ error: "Faltan variables de entorno en el servidor" });
  }

  // Verificamos que el token pertenezca a un usuario real logueado
  // (así cualquiera no puede llamar a esta función sin haber iniciado sesión).
  const authClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: "Sesión inválida" });
  }

  const { wineId, imageBase64 } = req.body || {};
  if (!wineId || !imageBase64) {
    return res.status(400).json({ error: "Faltan datos (wineId o imagen)" });
  }

  const base64Data = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
  const buffer = Buffer.from(base64Data, "base64");

  // Este cliente usa la clave service_role: solo existe en el servidor
  // (nunca llega al navegador) y puede escribir en Storage sin depender
  // de las políticas de RLS.
  const adminClient = createClient(supabaseUrl, serviceKey);
  const path = `${wineId}.jpg`;
  const { error: uploadError } = await adminClient.storage
    .from("etiquetas")
    .upload(path, buffer, { upsert: true, contentType: "image/jpeg" });

  if (uploadError) {
    return res.status(500).json({ error: uploadError.message });
  }

  const { data: pub } = adminClient.storage.from("etiquetas").getPublicUrl(path);
  return res.status(200).json({ url: pub.publicUrl });
}
