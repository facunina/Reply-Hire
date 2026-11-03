import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { rolEquipoDesdeCookies } from '@/lib/auth-equipo';
import { credencialesOAuthCargadas, urlConsentimiento } from '@/lib/google-calendar';

export const dynamic = 'force-dynamic';

// GET — inicia la conexión con Google Calendar (sólo admin). Redirige a la
// pantalla de consentimiento de Google; vuelve a /api/google/callback.
export async function GET(request: Request) {
  if ((await rolEquipoDesdeCookies()) !== 'admin') {
    return NextResponse.json({ error: 'Requiere rol de administrador.' }, { status: 403 });
  }
  if (!credencialesOAuthCargadas()) {
    return NextResponse.json(
      { error: 'Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env.local.' },
      { status: 500 }
    );
  }

  const origen = new URL(request.url).origin;
  // `state` protege el callback contra CSRF: tiene que volver igual al de la cookie.
  const state = randomUUID();
  const res = NextResponse.redirect(urlConsentimiento(origen + '/api/google/callback', state));
  res.cookies.set('google_oauth_state', state, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600 });
  return res;
}
