import { NextResponse } from 'next/server';
import { obtenerCandidato, linkTemporalCV } from '@/lib/db';
import { rolEquipoDesdeCookies } from '@/lib/auth-equipo';
import { registrarEvento } from '@/lib/eventos';

export const dynamic = 'force-dynamic';

// GET ?id=<candidato> — abre el CV en PDF. Sólo el equipo (lo verifica también
// proxy.ts). Los PDFs están en un bucket PRIVADO: acá se genera un link firmado
// que vence en 5 minutos y se redirige a él. Cada apertura queda registrada.
export async function GET(request: Request) {
  const rol = await rolEquipoDesdeCookies();
  if (!rol) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Falta el id del candidato.' }, { status: 400 });
  }

  const candidato = await obtenerCandidato(id).catch(() => null);
  if (!candidato || !candidato.cv_url) {
    return NextResponse.json({ error: 'Este candidato no tiene un CV en PDF guardado.' }, { status: 404 });
  }

  try {
    const link = await linkTemporalCV(id);
    await registrarEvento('cv_abierto', candidato.nombre, { candidato_id: id, rol });
    return NextResponse.redirect(link);
  } catch (e: any) {
    console.error('Error generando link del CV:', e);
    return NextResponse.json({ error: 'No se pudo abrir el CV. Probá de nuevo en unos segundos.' }, { status: 500 });
  }
}
