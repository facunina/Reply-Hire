import { NextResponse } from 'next/server';
import { guardarPuesto, obtenerPuestos } from '@/lib/db';
import { registrarEvento } from '@/lib/eventos';
import { normalizarArea } from '@/lib/areas';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

// GET — lista de puestos abiertos (los más recientes primero).
export async function GET() {
  try {
    const puestos = await obtenerPuestos();
    return NextResponse.json({ puestos });
  } catch (e: any) {
    console.error("Error en puestos GET API:", e);
    return NextResponse.json({ puestos: [], error: e.message }, { status: 500 });
  }
}

// POST — crea un puesto nuevo. Sólo "nombre" es obligatorio; los demás campos
// se guardan como string vacío si no vienen.
export async function POST(request: Request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "El cuerpo de la solicitud debe ser un JSON válido." }, { status: 400 });
    }

    const { nombre, area, sobre_nosotros, mision, actividades, requisitos, modalidad, beneficios } = body;

    if (!nombre || typeof nombre !== "string" || nombre.trim() === "") {
      return NextResponse.json({ error: "El nombre del puesto es obligatorio." }, { status: 400 });
    }

    // Normaliza un campo opcional de texto a string recortado (o "").
    const limpiar = (v: unknown) => (typeof v === "string" ? v.trim() : "");

    const id = randomUUID();
    const puesto = await guardarPuesto({
      id,
      nombre: nombre.trim(),
      area: normalizarArea(area),
      sobre_nosotros: limpiar(sobre_nosotros),
      mision: limpiar(mision),
      actividades: limpiar(actividades),
      requisitos: limpiar(requisitos),
      modalidad: limpiar(modalidad),
      beneficios: limpiar(beneficios),
    });

    await registrarEvento("puesto_creado", nombre.trim());

    return NextResponse.json({ ok: true, puesto });
  } catch (e: any) {
    console.error("Error en puestos POST API:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
