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
