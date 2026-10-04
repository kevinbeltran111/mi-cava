// ========================================================================
// UX-00A — Supabase Auth "Send Email" Hook → Resend
// ========================================================================
// Esta función reemplaza el envío default de emails de Supabase Auth
// (Invite user / Magic Link / etc.) por un envío propio vía Resend, usando
// el dominio verificado cavavinos.app, con copy en español y la identidad
// de Cava Vinos.
//
// Contrato oficial del Send Email Hook (Supabase):
// - Supabase llama a esta función por HTTPS en cada email de Auth que haya
//   que mandar, con un payload firmado (Standard Webhooks) que contiene
//   `user` y `email_data` (token_hash, email_action_type, redirect_to, etc).
// - La función debe verificar la firma con el secreto que genera Supabase
//   al configurar el hook (SEND_EMAIL_HOOK_SECRET), nunca confiar en el
//   payload sin verificar.
// - La función arma el link de verificación ella misma, apuntando siempre
//   al propio proyecto de Supabase (`${SUPABASE_URL}/auth/v1/verify`) con
//   el token_hash, el tipo de acción y el redirect_to que Supabase ya
//   decidió — esta función NUNCA genera tokens ni decide a dónde redirige
//   después del login; eso sigue siendo responsabilidad exclusiva de
//   Supabase Auth, igual que hoy.
// - Respuesta esperada por Supabase: 200 con body vacío si el email se
//   mandó. Cualquier otro código se interpreta como fallo del hook — por
//   eso un error real de Resend nunca debe devolver 200 (si lo hiciera,
//   Supabase da por enviado un email que en realidad no salió, y el
//   usuario se queda sin acceso sin que nadie se entere).
//
// Variables de entorno / secrets usadas (ninguna hardcodeada):
// - SUPABASE_URL          → inyectada automáticamente por el runtime de
//                            Edge Functions, no hace falta configurarla.
// - RESEND_API_KEY        → secret propio, cargado con `supabase secrets
//                            set`. Nunca se expone en logs ni en la
//                            respuesta HTTP.
// - SEND_EMAIL_HOOK_SECRET → secret propio, generado por Supabase al crear
//                            el hook (formato "v1,whsec_..."). Tampoco se
//                            loguea ni se expone.
// ========================================================================

import { Webhook } from "npm:standardwebhooks@1";
import { Resend } from "npm:resend@4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const HOOK_SECRET = Deno.env.get("SEND_EMAIL_HOOK_SECRET");

const FROM = "Cava Vinos <acceso@cavavinos.app>";

// ---- Paleta tomada de App.jsx, solo para que el email se sienta parte de
// la misma identidad visual — nada de esto es crítico funcionalmente.
const BORDEAUX = "#4A1420";
const GOLD = "#B8934A";
const CREAM = "#F6EFE4";
const INK = "#2B211C";

// UX-00A (alcance deliberado): esta función hoy solo conoce la semántica de
// `invite` y `magiclink`, que son los dos únicos flujos que usa Mi Cava.
// Cualquier otro `email_action_type` (signup, recovery, email_change, y
// cualquiera que Supabase agregue más adelante) se rechaza explícitamente
// más abajo — no se intenta adivinar su semántica. Varios de esos tipos
// tienen requisitos propios (p. ej. `email_change` puede necesitar
// `token_hash_new` y hasta dos emails distintos por "Secure Email Change")
// que esta función no implementa todavía. El `email_action_type` crudo que
// llega en el payload se tipa como `string` a propósito, porque puede ser
// cualquier valor que Supabase decida mandar.
const SUPPORTED_ACTION_TYPES = ["invite", "magiclink"] as const;
type SupportedActionType = (typeof SUPPORTED_ACTION_TYPES)[number];

function isSupportedActionType(value: string): value is SupportedActionType {
  return (SUPPORTED_ACTION_TYPES as readonly string[]).includes(value);
}

interface SendEmailHookPayload {
  user: {
    email: string;
  };
  email_data: {
    token_hash: string;
    token_hash_new?: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
  };
}

// Escapa cualquier dato dinámico que vaya a texto dentro del HTML. Hoy el
// único dato realmente dinámico que insertamos es la URL de verificación
// (como atributo href, vía encodeURI más abajo) — esta función queda lista
// igual por si en el futuro se interpola algo más (nombre, email, etc.),
// para no depender de que cada punto de uso se acuerde de escapar.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Arma el link de verificación según el contrato oficial del hook: siempre
// contra el propio proyecto de Supabase, nunca contra cavavinos.app
// directamente. Usar el constructor URL/URLSearchParams (en vez de
// concatenar strings a mano) deja el escapado de cada parámetro a cargo
// del propio runtime, evitando inyección vía valores inesperados en
// token_hash/redirect_to.
function buildVerifyUrl(params: {
  tokenHash: string;
  actionType: string;
  redirectTo: string;
}): string {
  if (!SUPABASE_URL) {
    throw new Error("Falta SUPABASE_URL en el entorno de la función");
  }
  const url = new URL("/auth/v1/verify", SUPABASE_URL);
  url.searchParams.set("token", params.tokenHash);
  url.searchParams.set("type", params.actionType);
  url.searchParams.set("redirect_to", params.redirectTo);
  return url.toString();
}

interface EmailContent {
  subject: string;
  title: string;
  text: string;
  ctaLabel: string;
}

// Copy aprobado — exactamente el texto acordado, sin agregados. Solo
// existen entradas para los dos tipos soportados (ver
// SUPPORTED_ACTION_TYPES más arriba); no hay rama "default" — cualquier
// otro tipo se corta antes de llegar a necesitar copy.
const COPY: Record<SupportedActionType, EmailContent> = {
  invite: {
    subject: "Tu acceso a Cava Vinos está listo 🍷",
    title: "Tu acceso a Cava Vinos está listo 🍷",
    text: "Ya podés empezar a armar tu cava, tu biblioteca personal de vinos.",
    ctaLabel: "Entrar a Cava Vinos",
  },
  magiclink: {
    subject: "Entrá a tu cava 🍷",
    title: "Entrá a tu cava 🍷",
    text: "Usá este enlace para entrar a Cava Vinos.",
    ctaLabel: "Entrar a Cava Vinos",
  },
};

// Template único, simple, sin imágenes ni logo remoto — a propósito, para
// esta beta. Estilos inline (requisito de los clientes de email, no se
// pueden usar hojas de estilo externas).
function renderEmailHtml(content: EmailContent, verifyUrl: string): string {
  const safeTitle = escapeHtml(content.title);
  const safeText = escapeHtml(content.text);
  const safeCta = escapeHtml(content.ctaLabel);
  // encodeURI protege el atributo href ante caracteres que romperían el
  // HTML (comillas, espacios, etc.) — además de la codificación que ya
  // aplica URLSearchParams en buildVerifyUrl.
  const safeHref = encodeURI(verifyUrl);

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
  </head>
  <body style="margin:0; padding:0; background:${CREAM}; font-family: Georgia, 'Times New Roman', serif; color:${INK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM}; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:480px; background:#FFFCF6; border-radius:14px; padding:32px 28px;">
            <tr>
              <td align="center" style="padding-bottom:8px;">
                <span style="font-size:13px; letter-spacing:0.08em; text-transform:uppercase; color:${GOLD};">Cava Vinos</span>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-bottom:16px;">
                <h1 style="margin:0; font-size:22px; color:${BORDEAUX}; font-weight:700;">${safeTitle}</h1>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-bottom:28px;">
                <p style="margin:0; font-size:15px; line-height:1.6; color:${INK};">${safeText}</p>
              </td>
            </tr>
            <tr>
              <td align="center">
                <a href="${safeHref}" style="display:inline-block; padding:13px 28px; border-radius:8px; background:${BORDEAUX}; color:#F6EFE4; text-decoration:none; font-size:15px; font-weight:600;">${safeCta}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json(
      { error: { http_code: 405, message: "Método no permitido" } },
      { status: 405 },
    );
  }

  if (!HOOK_SECRET) {
    console.error("send-email: falta SEND_EMAIL_HOOK_SECRET en el entorno");
    return Response.json(
      { error: { http_code: 500, message: "Configuración incompleta del servidor" } },
      { status: 500 },
    );
  }

  // El body se lee como texto crudo porque la verificación de firma de
  // standardwebhooks necesita el payload exacto tal cual llegó, antes de
  // cualquier parseo — parsear primero y volver a serializar podría no
  // coincidir byte a byte con lo que se firmó.
  const rawBody = await req.text();
  const headers = Object.fromEntries(req.headers);

  let verified: SendEmailHookPayload;
  try {
    // El secreto que entrega Supabase viene con el prefijo "v1,whsec_"
    // (formato Standard Webhooks). El constructor de `standardwebhooks`
    // espera solo el valor base64, sin ese prefijo — es el mecanismo
    // oficial vigente, tal cual lo hace el ejemplo de Supabase.
    const wh = new Webhook(HOOK_SECRET.replace("v1,whsec_", ""));
    verified = wh.verify(rawBody, headers) as SendEmailHookPayload;
  } catch (err) {
    // No se loguea el payload ni los headers (pueden contener datos del
    // intento de firma) — solo que la verificación falló.
    console.error("send-email: firma de webhook inválida");
    return Response.json(
      { error: { http_code: 401, message: "No se pudo verificar la firma del webhook" } },
      { status: 401 },
    );
  }

  const user = verified?.user;
  const emailData = verified?.email_data;

  if (!user?.email || !emailData?.email_action_type) {
    console.error("send-email: payload verificado pero incompleto");
    return Response.json(
      { error: { http_code: 400, message: "Payload de email incompleto" } },
      { status: 400 },
    );
  }

  // UX-00A (alcance deliberado): solo `invite` y `magiclink` tienen
  // semántica implementada acá. Para cualquier otro tipo no se arma link,
  // no se reutiliza token_hash/email, y no se envía nada — se corta acá
  // con un error explícito. Se loguea únicamente el tipo de acción, nunca
  // el email ni ningún token.
  if (!isSupportedActionType(emailData.email_action_type)) {
    console.error("send-email: email_action_type no soportado:", emailData.email_action_type);
    return Response.json(
      {
        error: {
          http_code: 400,
          message: `Este hook todavía no implementa el tipo de email "${emailData.email_action_type}".`,
        },
      },
      { status: 400 },
    );
  }

  if (!emailData.token_hash || !emailData.redirect_to) {
    console.error("send-email: payload incompleto para", emailData.email_action_type);
    return Response.json(
      { error: { http_code: 400, message: "Payload de email incompleto" } },
      { status: 400 },
    );
  }

  let verifyUrl: string;
  try {
    verifyUrl = buildVerifyUrl({
      tokenHash: emailData.token_hash,
      actionType: emailData.email_action_type,
      redirectTo: emailData.redirect_to,
    });
  } catch (err) {
    console.error("send-email: no se pudo construir el link de verificación");
    return Response.json(
      { error: { http_code: 500, message: "No se pudo construir el link de verificación" } },
      { status: 500 },
    );
  }

  const content = COPY[emailData.email_action_type];
  const html = renderEmailHtml(content, verifyUrl);

  if (!RESEND_API_KEY) {
    console.error("send-email: falta RESEND_API_KEY en el entorno");
    return Response.json(
      { error: { http_code: 500, message: "Configuración incompleta del servidor" } },
      { status: 500 },
    );
  }

  try {
    const resend = new Resend(RESEND_API_KEY);
    const { error: sendError } = await resend.emails.send({
      from: FROM,
      to: [user.email],
      subject: content.subject,
      html,
    });

    if (sendError) {
      // `sendError` de Resend no incluye la API key — es seguro loguear su
      // mensaje para diagnóstico, nunca el objeto completo de la petición.
      console.error("send-email: Resend devolvió un error:", sendError.message || sendError);
      return Response.json(
        { error: { http_code: 502, message: "No se pudo enviar el email" } },
        { status: 502 },
      );
    }
  } catch (err) {
    // Fallo de red/infra al llamar a Resend — tampoco se devuelve 200 acá.
    console.error("send-email: excepción al llamar a Resend:", err instanceof Error ? err.message : "error desconocido");
    return Response.json(
      { error: { http_code: 502, message: "No se pudo enviar el email" } },
      { status: 502 },
    );
  }

  // Éxito: Supabase espera 200 con body vacío.
  return Response.json({});
});
