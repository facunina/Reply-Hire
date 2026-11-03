// ── Integración con Google Calendar (API REST, sin SDK) ──────────────────────
// La empresa conecta UNA cuenta de Google (la del reclutador) mediante OAuth.
// Con el refresh token guardado en GOOGLE_REFRESH_TOKEN, el servidor crea las
// entrevistas en ese calendario e invita al candidato: Google le envía la
// invitación por mail a cualquier dirección y agrega un link de Google Meet.

const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const ZONA = "America/Montevideo";

export function calendarioConfigurado(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
}

export function credencialesOAuthCargadas(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** URL de la pantalla de consentimiento de Google (paso único de conexión). */
export function urlConsentimiento(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID as string,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline", // para recibir un refresh token
    prompt: "consent", // fuerza a Google a devolver el refresh token
    state,
  });
  return "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString();
}

/** Canjea el código del callback por tokens. Devuelve el refresh token. */
export async function obtenerRefreshToken(code: string, redirectUri: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID as string,
      client_secret: process.env.GOOGLE_CLIENT_SECRET as string,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.refresh_token) {
    throw new Error(data.error_description || data.error || "Google no devolvió un refresh token.");
  }
  return data.refresh_token as string;
}

async function accessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID as string,
      client_secret: process.env.GOOGLE_CLIENT_SECRET as string,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN as string,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    if (data.error === "invalid_grant") {
      throw new Error(
        "La conexión con Google Calendar venció o fue revocada. El admin tiene que volver a conectarla desde el panel de control."
      );
    }
    throw new Error("No se pudo autenticar con Google Calendar: " + (data.error_description || data.error));
  }
  return data.access_token as string;
}

export interface DatosEntrevista {
  eventoId?: string | null; // si existe, se reprograma ese evento en vez de crear otro
  titulo: string;
  descripcion: string;
  inicioLocal: string; // "YYYY-MM-DDTHH:mm" en hora de Montevideo
  duracionMin: number;
  invitados: string[];
  conMeet: boolean;
}

export interface EventoCreado {
  id: string;
  link: string; // enlace al evento en Google Calendar
  meet: string; // enlace de Google Meet ("" si no tiene)
}

/** "YYYY-MM-DDTHH:mm" + minutos → mismo formato. Montevideo no tiene horario de verano. */
function sumarMinutos(local: string, minutos: number): string {
  const d = new Date(local + ":00-03:00");
  d.setMinutes(d.getMinutes() + minutos);
  const uy = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return uy.toISOString().slice(0, 16);
}

/** Crea (o reprograma) la entrevista y envía las invitaciones por mail. */
export async function agendarEntrevista(e: DatosEntrevista): Promise<EventoCreado> {
  const token = await accessToken();
  const calendario = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID || "primary");

  const cuerpo: Record<string, unknown> = {
    summary: e.titulo,
    description: e.descripcion,
    start: { dateTime: e.inicioLocal + ":00", timeZone: ZONA },
    end: { dateTime: sumarMinutos(e.inicioLocal, e.duracionMin) + ":00", timeZone: ZONA },
    attendees: e.invitados.map((email) => ({ email })),
    reminders: { useDefault: true },
  };
  if (e.conMeet) {
    cuerpo.conferenceData = {
      createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } },
    };
  }

  // sendUpdates=all → Google manda la invitación (o el aviso de cambio) por mail.
  const base = `https://www.googleapis.com/calendar/v3/calendars/${calendario}/events`;
  const url = e.eventoId
    ? `${base}/${encodeURIComponent(e.eventoId)}?sendUpdates=all&conferenceDataVersion=1`
    : `${base}?sendUpdates=all&conferenceDataVersion=1`;

  const res = await fetch(url, {
    method: e.eventoId ? "PATCH" : "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error("Google Calendar rechazó el evento: " + (data.error?.message || res.status));
  }

  const meet =
    data.hangoutLink ||
    (data.conferenceData?.entryPoints || []).find((p: { entryPointType?: string }) => p.entryPointType === "video")?.uri ||
    "";
  return { id: data.id, link: data.htmlLink || "", meet };
}
