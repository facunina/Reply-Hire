import { NextResponse } from 'next/server';
import { obtenerCandidato, obtenerPuesto, actualizarCandidato } from '@/lib/db';
import { evaluarJSON } from '@/lib/ai';
import { PROMPT_PREGUNTAS, sanitizarTextoCV } from '@/lib/prompts';
import { registrarEvento } from '@/lib/eventos';
import { rolEquipoDesdeCookies } from '@/lib/auth-equipo';

export const dynamic = 'force-dynamic';

const TIPOS = ['técnica', 'experiencia', 'conductual'];

export interface PreguntaEntrevista {
  pregunta: string;
  objetivo: string;
  tipo: string;
}

const aLista = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

// POST { id } — genera preguntas para la entrevista del candidato indicado,
// a partir del CV, el puesto y las fortalezas/brechas que ya detectó la IA.
// Protegido por el proxy (equipo) y, además, acá mismo.
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

  const candidato = await obtenerCandidato(id);
  if (!candidato) {
    return NextResponse.json({ error: 'No se encontró el candidato.' }, { status: 404 });
  }

  const puesto = candidato.puesto_id ? await obtenerPuesto(candidato.puesto_id) : null;
  const requisitos = puesto
    ? `Puesto: ${puesto.nombre}. Responsabilidades: ${puesto.actividades || 'No especificadas'}. Requisitos: ${puesto.requisitos || 'No especificados'}.`
    : `Puesto: ${candidato.puesto || 'No especificado'}.`;

  const inicio = Date.now();
  let respuesta: any;
  try {
    respuesta = await evaluarJSON(
      PROMPT_PREGUNTAS(
        requisitos,
        aLista(candidato.fortalezas),
        aLista(candidato.brechas),
        sanitizarTextoCV(candidato.cv_texto || '')
      )
    );
    await registrarEvento('llamada_ia', 'preguntas_entrevista', { conexion: 'ia', exito: true, latencia_ms: Date.now() - inicio });
  } catch (e: any) {
    await registrarEvento('llamada_ia', 'preguntas_entrevista', { conexion: 'ia', exito: false, latencia_ms: Date.now() - inicio });
    return NextResponse.json({ error: 'La IA no pudo generar las preguntas. ' + e.message }, { status: 502 });
  }

  // Red de seguridad: se normaliza lo que devuelve la IA (máx. 8 preguntas).
  const preguntas: PreguntaEntrevista[] = (Array.isArray(respuesta?.preguntas) ? respuesta.preguntas : [])
    .filter((p: any) => p && typeof p.pregunta === 'string' && p.pregunta.trim())
    .slice(0, 8)
    .map((p: any) => ({
      pregunta: String(p.pregunta).trim().slice(0, 300),
      objetivo: typeof p.objetivo === 'string' ? p.objetivo.trim().slice(0, 150) : '',
      tipo: TIPOS.includes(p.tipo) ? p.tipo : 'experiencia',
    }));

  if (preguntas.length === 0) {
    return NextResponse.json({ error: 'La IA no devolvió preguntas válidas. Probá de nuevo.' }, { status: 502 });
  }

  // Se guardan para no tener que regenerarlas. Si la base todavía no tiene la
  // columna (falta correr la migración), se devuelven igual sin guardar.
  let guardadas = true;
  try {
    await actualizarCandidato(id, { preguntas_entrevista: JSON.stringify(preguntas) });
  } catch (e: any) {
    guardadas = false;
    console.warn('No se pudieron guardar las preguntas de entrevista:', e.message);
  }

  return NextResponse.json({ preguntas, guardadas });
}
