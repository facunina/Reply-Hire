import { NextResponse } from 'next/server';
import { actualizarCandidato } from '@/lib/db';
import { registrarEvento } from '@/lib/eventos';

export async function POST(request: Request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "El cuerpo de la solicitud debe ser un JSON válido." }, { status: 400 });
    }

    const { id, estado } = body;

    // VALIDACIONES
    if (!id || !estado) {
      return NextResponse.json({ error: "Faltan datos (id o estado)." }, { status: 400 });
    }

    const estadosPermitidos = ["en_entrevista", "seleccionado"];
    if (!estadosPermitidos.includes(estado)) {
      return NextResponse.json({ error: "Estado no permitido." }, { status: 400 });
    }

    // Actualizar candidato
    await actualizarCandidato(id, {
      estado,
      fecha_decision: new Date().toISOString()
    });

    // Registramos la decisión del reclutador para las métricas.
    await registrarEvento("decision_reclutador", estado, { id });

    return NextResponse.json({ ok: true });

  } catch (e: any) {
    console.error("Error en estado API:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
