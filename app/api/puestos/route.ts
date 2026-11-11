import { NextResponse } from 'next/server';
import { guardarPuesto, obtenerPuestos, cambiarEstadoPuesto } from '@/lib/db';
import { rolEquipoDesdeCookies } from '@/lib/auth-equipo';
import { registrarEvento } from '@/lib/eventos';
import { normalizarArea } from '@/lib/areas';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

// GET — lista de puestos abiertos (los más recientes primero). Con ?todas=1 el
// equipo recibe también las búsquedas cerradas (para el panel del reclutador).
export async function GET(request: Request) {
  try {
    const todas = new URL(request.url).searchParams.get('todas') === '1';
    const incluirCerrados = todas && !!(await rolEquipoDesdeCookies());
    const puestos = await obtenerPuestos({ incluirCerrados });
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

    const { nombre, area, sobre_nosotros, mision, actividades, requisitos, requisitos_lista, modalidad, beneficios } = body;

    if (!nombre || typeof nombre !== "string" || nombre.trim() === "") {
      return NextResponse.json({ error: "El nombre del puesto es obligatorio." }, { status: 400 });
    }

    // No se permiten dos búsquedas ABIERTAS con el mismo nombre: confunde al
    // candidato en el portal y al reclutador en el panel.
    const abiertas = await obtenerPuestos();
    const repetida = abiertas.find((p) => p.nombre.trim().toLowerCase() === nombre.trim().toLowerCase());
    if (repetida) {
      return NextResponse.json(
        { error: `Ya hay una búsqueda abierta llamada "${repetida.nombre}". Cambiá el nombre o cerrá la anterior.` },
        { status: 409 }
      );
    }

    // Normaliza un campo opcional de texto a string recortado (o "").
    const limpiar = (v: unknown) => (typeof v === "string" ? v.trim() : "");

    // Requisitos uno por uno, con su marca de excluyente (máx. 12). Si vienen,
    // el texto libre `requisitos` se arma a partir de ellos (para el portal).
    const listaReq = (Array.isArray(requisitos_lista) ? requisitos_lista : [])
      .filter((r: any) => r && typeof r.texto === "string" && r.texto.trim())
      .slice(0, 12)
      .map((r: any) => ({ texto: r.texto.trim().slice(0, 200), excluyente: !!r.excluyente }));
    const textoRequisitos = listaReq.length
      ? listaReq.map((r: { texto: string; excluyente: boolean }) => r.texto + (r.excluyente ? " (excluyente)" : "")).join("\n")
      : limpiar(requisitos);

    const id = randomUUID();
    const puesto = await guardarPuesto({
      id,
      nombre: nombre.trim(),
      area: normalizarArea(area),
      sobre_nosotros: limpiar(sobre_nosotros),
      mision: limpiar(mision),
      actividades: limpiar(actividades),
      requisitos: textoRequisitos,
      requisitos_lista: listaReq,
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

// PATCH { id, activo } — cierra (activo=false) o reabre una búsqueda. Sólo el
// equipo (además del proxy, se valida acá).
export async function PATCH(request: Request) {
  if (!(await rolEquipoDesdeCookies())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo de la solicitud debe ser un JSON válido." }, { status: 400 });
  }
  const { id, activo } = body || {};
  if (typeof id !== "string" || !id || typeof activo !== "boolean") {
    return NextResponse.json({ error: "Faltan datos: id de la búsqueda y si queda abierta o cerrada." }, { status: 400 });
  }
  try {
    const puesto = await cambiarEstadoPuesto(id, activo);
    await registrarEvento(activo ? "puesto_reabierto" : "puesto_cerrado", puesto.nombre);
    return NextResponse.json({ ok: true, puesto });
  } catch (e: any) {
    console.error("Error en puestos PATCH API:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
