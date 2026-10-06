import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// En Next.js 16 "middleware" pasó a llamarse "proxy" (mismo comportamiento).
// Usar el archivo `middleware.ts` deprecado rompe Turbopack en dev (genera un
// shim que apunta a proxy.ts), por eso este archivo se llama proxy.ts.

// Protege /dashboard y /prueba (reclutador o admin), /admin y /api/admin (SOLO admin).
// El portal del candidato (/postular), la raíz (/) y /api/upload-cv quedan
// PÚBLICOS porque NO están en el matcher.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const esApi = pathname.startsWith('/api');

  // El rol se DEDUCE de cuál token de sesión coincide; NUNCA se lee de un campo
  // que escriba el cliente. La cookie guarda únicamente el token opaco, así un
  // usuario no puede editarla para hacerse pasar por admin.
  const cookie = request.cookies.get('sesion')?.value || '';
  let rol: 'admin' | 'reclutador' | null = null;
  if (cookie && cookie === process.env.ADMIN_SESSION_TOKEN) {
    rol = 'admin';
  } else if (cookie && cookie === process.env.RECLUTADOR_SESSION_TOKEN) {
    rol = 'reclutador';
  }

  // Sin sesión válida → 401 para APIs, redirección a /login para páginas.
  if (!rol) {
    if (esApi) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Zonas de administración: exigen rol "admin" exclusivamente.
  const esZonaAdmin = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
  if (esZonaAdmin && rol !== 'admin') {
    if (esApi) {
      return NextResponse.json({ error: 'Requiere rol de administrador.' }, { status: 403 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/prueba/:path*', '/admin/:path*', '/api/admin/:path*'],
};
