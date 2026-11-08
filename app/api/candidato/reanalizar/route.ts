import { NextResponse } from 'next/server';
import { actualizarCandidato, obtenerCandidato } from '@/lib/db';
import { analizarCandidato } from '@/lib/analisis';
import { rolEquipoDesdeCookies } from '@/lib/auth-equipo';

export const dynamic = 'force-dynamic';

// POST { id } — vuelve a correr el análisis con IA de una postulación cuyo
// análisis falló. Espera el resultado (lo pide el reclutador a propósito).
export async function POST(request: Request) {
  if (!(await rolEquipoDesdeCookies())) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  let id: unknown;
  try {
    ({ id } = await request.json());
  } catch {
    return NextResponse.json({ error: 'El cuerpo de la solicitud debe ser un JSON válido.' }, { status: 400 });
  }
  if (typeof id !== 'string' || !id) {
    return NextResponse.json({ error: 'Falta el id del candidato.' }, { status: 400 });
  }
  if (!(await obtenerCandidato(id))) {
    return NextResponse.json({ error: 'No se encontró el candidato.' }, { status: 404 });
  }

  await actualizarCandidato(id, { analisis: 'procesando' });
  const analisis = await analizarCandidato(id);
  const candidato = await obtenerCandidato(id);
  return NextResponse.json({ analisis, candidato });
}
