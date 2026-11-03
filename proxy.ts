import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { rolDeUsuario } from '@/lib/roles';

// En Next.js 16 "middleware" pasó a llamarse "proxy" (mismo comportamiento).
// Usar el archivo `middleware.ts` deprecado rompe Turbopack en dev (genera un
// shim que apunta a proxy.ts), por eso este archivo se llama proxy.ts.

// Autenticación del EQUIPO con Supabase Auth. El rol sale de `app_metadata.rol`
// de la cuenta (no lo puede editar el usuario):
//  - /dashboard, /prueba y las APIs de gestión de candidatos → reclutador o admin
//  - /admin y /api/admin → SOLO admin
// El portal público (/, /puestos, /postular, /ingresar, /mi-cuenta) y las APIs
// del candidato (/api/upload-cv, /api/mis-postulaciones, /api/track y el GET de
// /api/puestos) NO pasan por acá o quedan libres: el candidato se valida en cada
// API con su token.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const esApi = pathname.startsWith('/api');

  // Ver las búsquedas es público; crearlas (POST) es del equipo.
  if (pathname === '/api/puestos' && request.method === 'GET') {
    return NextResponse.next();
  }

  // Cliente de Supabase que lee la sesión de las cookies y, si el token venció,
  // lo renueva y escribe las cookies nuevas en la respuesta.
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // getUser() valida el token contra Supabase (no confía en la cookie a ciegas).
  const { data } = await supabase.auth.getUser();
  const rol = rolDeUsuario(data.user);

  // Las redirecciones conservan las cookies renovadas.
  const redirigir = (destino: string) => {
    const url = request.nextUrl.clone();
    url.pathname = destino;
    url.search = destino === '/login' ? `?next=${encodeURIComponent(pathname)}` : '';
    const r = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  // Sin rol de equipo (sin sesión, o sesión de candidato) → 401 / login.
  if (!rol) {
    if (esApi) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }
    return redirigir('/login');
  }

  // Zonas de administración: exigen rol "admin" exclusivamente.
  const esZonaAdmin = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
  if (esZonaAdmin && rol !== 'admin') {
    if (esApi) {
      return NextResponse.json({ error: 'Requiere rol de administrador.' }, { status: 403 });
    }
    return redirigir('/dashboard');
  }

  return response;
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/prueba/:path*',
    '/admin/:path*',
    '/api/admin/:path*',
    '/api/candidatos/:path*',
    '/api/candidato/:path*',
    '/api/feedback/:path*',
    '/api/send-email/:path*',
    '/api/estado/:path*',
    '/api/preguntas/:path*',
    '/api/puestos',
  ],
};
