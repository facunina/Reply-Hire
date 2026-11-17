import { Resend } from 'resend';

// ── Modo de prueba de emails ─────────────────────────────────────────────────
// Con el remitente de prueba de Resend (onboarding@resend.dev) sólo se puede
// enviar al email dueño de la cuenta. Si EMAIL_PRUEBA_DESTINO está definido en
// .env.local, TODOS los emails se redirigen a esa casilla y el asunto indica a
// quién iba dirigido originalmente. Para producción (dominio verificado en
// Resend) basta con dejar la variable vacía.

export function destinoEmail(emailCandidato: string, asunto: string): { to: string; subject: string } {
  const destinoPrueba = process.env.EMAIL_PRUEBA_DESTINO?.trim();
  if (!destinoPrueba) {
    return { to: emailCandidato, subject: asunto };
  }
  return { to: destinoPrueba, subject: `[PRUEBA → ${emailCandidato}] ${asunto}` };
}

/**
 * Envía un email con Resend (respetando el modo de prueba de arriba).
 * Nunca lanza: devuelve si se pudo enviar y, si no, el motivo.
 */
export async function enviarEmail(
  para: string,
  asunto: string,
  html: string
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === 'REEMPLAZAR') return { ok: false, error: 'Falta RESEND_API_KEY.' };
  if (!para || !para.includes('@')) return { ok: false, error: 'Email inválido.' };
  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: 'ReplyHire <onboarding@resend.dev>',
      ...destinoEmail(para, asunto),
      html,
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
