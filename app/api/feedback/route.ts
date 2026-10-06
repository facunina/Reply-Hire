import { NextResponse } from 'next/server';
import { generarTexto } from '@/lib/ai';
import { obtenerCandidato, actualizarCandidato } from '@/lib/db';
import { PROMPT_FEEDBACK } from '@/lib/prompts';
import { registrarEvento } from '@/lib/eventos';

export async function POST(request: Request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "El cuerpo de la solicitud debe ser un JSON válido." }, { status: 400 });
    }

    const { id, tipo = "cv" } = body;

    if (!id) {
      return NextResponse.json({ error: "Falta el id del candidato." }, { status: 400 });
    }

    const candidato = await obtenerCandidato(id);
    if (!candidato) {
      return NextResponse.json({ error: "Candidato no encontrado." }, { status: 404 });
    }

    let feedback = "";
    const iaInicio = Date.now();
    try {
      feedback = await generarTexto(PROMPT_FEEDBACK({
        nombre: candidato.nombre,
        puesto: candidato.puesto || "el puesto al que te postulaste",
        empresa: "Empresa Demo",
        fortalezas: Array.isArray(candidato.fortalezas) ? candidato.fortalezas : [],
        brechas: Array.isArray(candidato.brechas) ? candidato.brechas : [],
        tipo: tipo === "entrevista" ? "entrevista" : "cv"
      }));
      await registrarEvento("feedback_generado", candidato.nombre, { conexion: "ia", exito: true, latencia_ms: Date.now() - iaInicio });
    } catch (error) {
      console.error("Error al generar feedback con IA:", error);
      await registrarEvento("feedback_generado", candidato.nombre, { conexion: "ia", exito: false, latencia_ms: Date.now() - iaInicio });
      const puestoTxt = candidato.puesto || "el puesto al que te postulaste";
      feedback = `Hola ${candidato.nombre}, gracias por tu interés en la posición de ${puestoTxt}. En esta oportunidad avanzamos con otros perfiles que se ajustaban más a los requisitos del puesto. Valoramos el tiempo que dedicaste a tu postulación y te deseamos mucho éxito en tu búsqueda.`;
    }

    await actualizarCandidato(id, { feedback });

    return NextResponse.json({ ok: true, feedback });

  } catch (e: any) {
    console.error("Error general en feedback API:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
