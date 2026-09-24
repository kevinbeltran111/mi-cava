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

  // 1) Verificar, contra Supabase (nunca confiando en lo que mande el
  // navegador), que el token es válido y pertenece a un admin real.
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

  if (profileError || !profile || profile.role !== "admin") {
    return res.status(403).json({ error: "No autorizado para aprobar solicitudes" });
  }

  const { request_id } = req.body || {};
  if (!request_id) {
    return res.status(400).json({ error: "Falta request_id" });
  }

  // A partir de acá se usa la clave service_role — nunca llega al
  // navegador, solo existe en esta función.
  const adminClient = createClient(supabaseUrl, serviceKey);

  // 2) "Reclamar" la solicitud de forma atómica: el update solo tiene
  // efecto si TODAVÍA está pending. Si dos admins aprueban casi al mismo
  // tiempo, solo uno de los dos va a lograr este paso — el otro recibe
  // "ya fue procesada" y no llega a invitar a nadie dos veces.
  const { data: claimed, error: claimError } = await adminClient
    .from("access_requests")
    .update({ status: "approved", updated_at: new Date().toISOString() })
    .eq("id", request_id)
    .eq("status", "pending")
    .select()
    .maybeSingle();

  if (claimError) {
    return res.status(500).json({ error: claimError.message });
  }
  if (!claimed) {
    return res.status(409).json({ error: "Esta solicitud ya fue procesada" });
  }

  try {
    // 3) Invitar al usuario en Supabase Auth (esto SÍ requiere service_role).
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(claimed.email);

    let userId = inviteData?.user?.id;

    if (inviteError) {
      const alreadyExists = /already registered|already been registered/i.test(inviteError.message || "");
      if (!alreadyExists) throw inviteError;
      // Ya existía como usuario de Auth (caso raro) — lo buscamos para
      // poder igual crearle/confirmar su perfil como viewer.
      const { data: existing } = await adminClient.auth.admin.listUsers();
      const found = existing?.users?.find((u) => u.email?.toLowerCase() === claimed.email);
      if (!found) throw new Error("No se pudo localizar al usuario existente");
      userId = found.id;
    }

    // 4) Crear su perfil directamente como VIEWER — sin pasar por la
    // pantalla de "elegí tu nombre" ni por la policy de auto-creación que
    // usan las invitaciones manuales (esas siguen intactas, sin tocar).
    const { error: profileInsertError } = await adminClient
      .from("profiles")
      .upsert({ id: userId, nombre: claimed.nombre, role: "viewer" }, { onConflict: "id", ignoreDuplicates: true });

    if (profileInsertError) throw profileInsertError;

    return res.status(200).json({ ok: true });
  } catch (err) {
    // Si algo falla después de reclamar la solicitud, la devolvemos a
    // 'pending' para que se pueda reintentar en vez de quedar en un
    // estado "aprobada" sin usuario real.
    await adminClient.from("access_requests").update({ status: "pending", updated_at: new Date().toISOString() }).eq("id", request_id);
    return res.status(502).json({ error: err.message || "No se pudo completar la aprobación" });
  }
}
