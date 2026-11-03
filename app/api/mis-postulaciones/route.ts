import { NextResponse } from 'next/server';
import { obtenerPostulacionesDeUsuario } from '@/lib/db';
import { usuarioDesdeRequest } from '@/lib/auth-candidato';

export const dynamic = 'force-dynamic';

// GET — postulaciones de la cuenta de candidato que hace la request.
// El usuario sale del token de sesión validado: nadie puede ver las de otro.
export async function GET(request: Request) {
  const usuario = await usuarioDesdeRequest(request);
  if (!usuario) {
    return NextResponse.json({ error: 'Tenés que iniciar sesión.' }, { status: 401 });
  }

  try {
    const postulaciones = await obtenerPostulacionesDeUsuario(usuario.id);
    return NextResponse.json({ postulaciones });
  } catch (e: any) {
    console.error('Error en mis-postulaciones GET API:', e);
    return NextResponse.json({ postulaciones: [], error: e.message }, { status: 500 });
  }
}
