import { NextResponse } from 'next/server';
import { actualizarCandidato } from '@/lib/db';

// POST { id, guardado } — marca/desmarca un candidato como guardado para
// futuras búsquedas.
export async function POST(request: Request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "El cuerpo de la solicitud debe ser un JSON válido." }, { status: 400 });
    }

    const { id, guardado } = body;

    if (!id) {
      return NextResponse.json({ error: "Falta el id del candidato." }, { status: 400 });
    }

    await actualizarCandidato(id, { guardado: !!guardado });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Error en candidato/actualizar API:", e);
    // Mensaje accionable si todavía no se corrió la migración.
    const msg = /guardado/.test(e.message || "") && /column|find/i.test(e.message || "")
      ? "Falta la columna 'guardado' en la tabla candidatos. Corré en Supabase: alter table candidatos add column if not exists guardado boolean default false;"
      : e.message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
