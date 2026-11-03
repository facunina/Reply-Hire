import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { rolEquipoDesdeCookies } from '@/lib/auth-equipo';
import { obtenerRefreshToken } from '@/lib/google-calendar';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const escapar = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function pagina(titulo: string, cuerpo: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapar(titulo)}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:680px;margin:48px auto;padding:0 16px;color:#0f172a;line-height:1.6">
<h1 style="font-size:22px">${escapar(titulo)}</h1>${cuerpo}
<p><a href="/admin">← Volver al panel de control</a></p></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  );
}

// GET — Google vuelve acá después del consentimiento. Se muestra el refresh
// token UNA vez para que el admin lo cargue como GOOGLE_REFRESH_TOKEN (en
// .env.local y en Vercel). No se guarda en la base: así no queda expuesto.
export async function GET(request: Request) {
  if ((await rolEquipoDesdeCookies()) !== 'admin') {
    return pagina('Acceso denegado', '<p>Sólo un administrador puede conectar Google Calendar.</p>', 403);
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieStore = await cookies();
  const esperado = cookieStore.get('google_oauth_state')?.value;

  if (url.searchParams.get('error')) {
    return pagina('Conexión cancelada', `<p>Google respondió: ${escapar(url.searchParams.get('error') || '')}</p>`, 400);
  }
  if (!code || !state || !esperado || state !== esperado) {
    return pagina('Conexión inválida', '<p>El pedido no es válido o venció. Volvé a intentar desde el panel de control.</p>', 400);
  }

  try {
    const refresh = await obtenerRefreshToken(code, url.origin + '/api/google/callback');

    // En desarrollo se guarda solo en .env.local y queda activo sin reiniciar.
    let guardadoLocal = false;
    if (process.env.NODE_ENV === 'development') {
      try {
        const archivo = path.join(process.cwd(), '.env.local');
        const actual = fs.existsSync(archivo) ? fs.readFileSync(archivo, 'utf8') : '';
        const linea = `GOOGLE_REFRESH_TOKEN=${refresh}`;
        const nuevo = /^GOOGLE_REFRESH_TOKEN=.*$/m.test(actual)
          ? actual.replace(/^GOOGLE_REFRESH_TOKEN=.*$/m, linea)
          : actual.replace(/\n?$/, '\n') + linea + '\n';
        fs.writeFileSync(archivo, nuevo);
        process.env.GOOGLE_REFRESH_TOKEN = refresh;
        guardadoLocal = true;
      } catch (err) {
        console.error('No se pudo escribir GOOGLE_REFRESH_TOKEN en .env.local:', err);
      }
    }

    const res = pagina(
      '¡Google Calendar conectado!',
      `${guardadoLocal ? '<p>✅ Ya quedó guardado en <code>.env.local</code> y activo. Ya podés agendar entrevistas.</p>' : ''}
<p>${guardadoLocal ? 'Cuando publiquen en Vercel, cargá' : 'Copiá'} esta línea en ${guardadoLocal ? 'sus variables de entorno' : '<code>.env.local</code> (y en las variables de entorno de Vercel) y reiniciá el servidor'}:</p>
<pre style="background:#f1f5f9;padding:12px;border-radius:8px;white-space:pre-wrap;word-break:break-all">GOOGLE_REFRESH_TOKEN=${escapar(refresh)}</pre>
<p style="color:#b91c1c"><strong>Es una credencial secreta:</strong> no la compartas ni la subas a GitHub.</p>`
    );
    res.cookies.set('google_oauth_state', '', { path: '/', maxAge: 0 });
    return res;
  } catch (e: any) {
    return pagina('No se pudo conectar', `<p>${escapar(e.message)}</p>`, 500);
  }
}
