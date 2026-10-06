import { NextResponse } from 'next/server';
import { eliminarCandidato } from '@/lib/db';
import { registrarEvento } from '@/lib/eventos';

// POST { id } — elimina permanentemente un candidato de la base.
export async function POST(request: Request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "El cuerpo de la solicitud debe ser un JSON válido." }, { status: 400 });
    }

    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "Falta el id del candidato." }, { status: 400 });
    }

    await eliminarCandidato(id);
    await registrarEvento("candidato_eliminado", id);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Error en candidato/eliminar API:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
