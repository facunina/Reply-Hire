import { NextResponse } from 'next/server';
import { actualizarCandidato, obtenerCandidato, obtenerPuesto, cambiarEstadoPuesto } from '@/lib/db';
import { validarDecision, cierraLaBusqueda } from '@/lib/reglas';
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

    const candidato = await obtenerCandidato(id);
    if (!candidato) {
      return NextResponse.json({ error: "Candidato no encontrado." }, { status: 404 });
    }

    // Reglas de negocio (lib/reglas.ts): no decidir mientras la IA analiza y
    // respetar el orden del proceso.
    const motivo = validarDecision(candidato, estado);
    if (motivo) {
      return NextResponse.json({ error: motivo }, { status: 409 });
    }

    // Actualizar candidato
    await actualizarCandidato(id, {
      estado,
      fecha_decision: new Date().toISOString()
    });

    // Registramos la decisión del reclutador para las métricas.
    await registrarEvento("decision_reclutador", estado, { id });

    // Al seleccionar a alguien se cierra la búsqueda (deja de recibir postulaciones).
    let busquedaCerrada: { id: string; nombre: string } | null = null;
    if (cierraLaBusqueda(estado) && candidato.puesto_id) {
      const puesto = await obtenerPuesto(candidato.puesto_id);
      if (puesto && puesto.activo !== false) {
        await cambiarEstadoPuesto(candidato.puesto_id, false);
        await registrarEvento("puesto_cerrado", puesto.nombre, { motivo: "candidato_seleccionado" });
        busquedaCerrada = { id: candidato.puesto_id, nombre: puesto.nombre };
      }
    }

    return NextResponse.json({ ok: true, busquedaCerrada });

  } catch (e: any) {
    console.error("Error en estado API:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
