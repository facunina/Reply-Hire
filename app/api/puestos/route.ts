import { NextResponse } from 'next/server';
import { guardarPuesto, obtenerPuestos, cambiarEstadoPuesto, emailsDeCuentas } from '@/lib/db';
import { rolEquipoDesdeCookies, usuarioEquipoDesdeCookies } from '@/lib/auth-equipo';
import { registrarEvento } from '@/lib/eventos';
import { normalizarArea } from '@/lib/areas';
import { MAX_REQUISITOS } from '@/lib/reglas';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

// GET — lista de puestos abiertos (los más recientes primero). Con ?todas=1 el
// equipo recibe también las búsquedas cerradas (para el panel del reclutador).
export async function GET(request: Request) {
  try {
    const todas = new URL(request.url).searchParams.get('todas') === '1';
    const incluirCerrados = todas && !!(await rolEquipoDesdeCookies());
    const puestos = await obtenerPuestos({ incluirCerrados });
    // Para el equipo se agrega quién creó cada búsqueda (el portal público no lo ve).
    if (incluirCerrados) {
      const emails = await emailsDeCuentas(puestos.map((p) => p.creado_por || ''));
      for (const p of puestos) p.creado_por_email = p.creado_por ? emails[p.creado_por] || '' : '';
    } else {
      for (const p of puestos) delete p.creado_por;
    }
    return NextResponse.json({ puestos });
  } catch (e: any) {
    console.error("Error en puestos GET API:", e);
    return NextResponse.json({ puestos: [], error: e.message }, { status: 500 });
  }
}

// POST — crea un puesto nuevo. Sólo "nombre" es obligatorio; los demás campos
// se guardan como string vacío si no vienen.
export async function POST(request: Request) {
  const autor = await usuarioEquipoDesdeCookies();
  if (!autor) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "El cuerpo de la solicitud debe ser un JSON válido." }, { status: 400 });
    }

    const { nombre, area, sobre_nosotros, mision, actividades, requisitos_lista, modalidad, beneficios } = body;

    if (!nombre || typeof nombre !== "string" || nombre.trim() === "") {
      return NextResponse.json({ error: "El nombre del puesto es obligatorio." }, { status: 400 });
    }

    // El nombre NO identifica a una búsqueda (puede repetirse: dos reclutadores
    // pueden buscar el mismo rol). La identidad es el id; para distinguirlas el
    // panel muestra quién la creó.

    // Normaliza un campo opcional de texto a string recortado (o "").
    const limpiar = (v: unknown) => (typeof v === "string" ? v.trim() : "");

    // Requisitos uno por uno, con su marca de excluyente (máx. MAX_REQUISITOS). Es el
    // ÚNICO lugar donde se guardan: el texto del portal se arma al mostrarlo.
    const listaReq = (Array.isArray(requisitos_lista) ? requisitos_lista : [])
      .filter((r: any) => r && typeof r.texto === "string" && r.texto.trim())
      .slice(0, MAX_REQUISITOS)
      .map((r: any) => ({ texto: r.texto.trim().slice(0, 200), excluyente: !!r.excluyente }));

    const id = randomUUID();
    const puesto = await guardarPuesto({
      id,
      nombre: nombre.trim(),
      area: normalizarArea(area),
      sobre_nosotros: limpiar(sobre_nosotros),
      mision: limpiar(mision),
      actividades: limpiar(actividades),
      requisitos_lista: listaReq,
      modalidad: limpiar(modalidad),
      beneficios: limpiar(beneficios),
      creado_por: autor.id,
    });

    await registrarEvento("puesto_creado", nombre.trim(), { puesto_id: id, creado_por: autor.id });

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
