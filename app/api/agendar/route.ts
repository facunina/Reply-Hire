import { NextResponse } from 'next/server';
import { obtenerCandidato, actualizarCandidato } from '@/lib/db';
import { rolEquipoDesdeCookies } from '@/lib/auth-equipo';
import { agendarEntrevista, calendarioConfigurado } from '@/lib/google-calendar';
import { registrarEvento } from '@/lib/eventos';

export const dynamic = 'force-dynamic';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST { id, inicio: "YYYY-MM-DDTHH:mm", duracion, conMeet, invitados: string[] }
// Agenda (o reprograma) la entrevista del candidato en el Google Calendar de la
// empresa e invita al candidato y a los emails extra (p. ej. otro reclutador).
export async function POST(request: Request) {
  if (!(await rolEquipoDesdeCookies())) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  if (!calendarioConfigurado()) {
    return NextResponse.json(
      { error: 'Google Calendar todavía no está conectado. Un admin tiene que conectarlo desde el panel de control.' },
      { status: 503 }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'El cuerpo de la solicitud debe ser un JSON válido.' }, { status: 400 });
  }

  const { id, inicio, conMeet } = body;
  const duracion = Number(body.duracion) || 45;
  const extra: string[] = Array.isArray(body.invitados)
    ? body.invitados.map((x: unknown) => String(x).trim().toLowerCase()).filter((x: string) => EMAIL.test(x))
    : [];

  if (typeof id !== 'string' || !id) {
    return NextResponse.json({ error: 'Falta el id del candidato.' }, { status: 400 });
  }
  if (typeof inicio !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(inicio)) {
    return NextResponse.json({ error: 'Elegí fecha y hora de la entrevista.' }, { status: 400 });
  }
  if (new Date(inicio + ':00-03:00').getTime() < Date.now()) {
    return NextResponse.json({ error: 'La entrevista tiene que ser en el futuro.' }, { status: 400 });
  }
  if (duracion < 15 || duracion > 180) {
    return NextResponse.json({ error: 'La duración tiene que estar entre 15 y 180 minutos.' }, { status: 400 });
  }

  const candidato = await obtenerCandidato(id);
  if (!candidato) {
    return NextResponse.json({ error: 'No se encontró el candidato.' }, { status: 404 });
  }
  if (candidato.estado !== 'en_entrevista') {
    return NextResponse.json({ error: 'Sólo se pueden agendar candidatos en etapa de entrevista.' }, { status: 409 });
  }
  if (!candidato.email || !EMAIL.test(candidato.email)) {
    return NextResponse.json({ error: 'El candidato no tiene un email válido para invitarlo.' }, { status: 400 });
  }

  try {
    const evento = await agendarEntrevista({
      eventoId: candidato.entrevista_evento_id || null,
      titulo: `Entrevista — ${candidato.nombre} · ${candidato.puesto || 'ReplyHire'}`,
      descripcion:
        `Entrevista para la búsqueda "${candidato.puesto || ''}".\n` +
        `Candidato: ${candidato.nombre} (${candidato.email}${candidato.telefono ? ' · ' + candidato.telefono : ''}).\n\n` +
        'Agendada desde ReplyHire.',
      inicioLocal: inicio,
      duracionMin: duracion,
      invitados: Array.from(new Set([candidato.email.toLowerCase(), ...extra])),
      conMeet: conMeet !== false,
    });

    await actualizarCandidato(id, {
      entrevista_inicio: inicio + ':00-03:00',
      entrevista_evento_id: evento.id,
      entrevista_link: evento.link,
      entrevista_meet: evento.meet,
    });
    await registrarEvento('entrevista_agendada', candidato.nombre, { conexion: 'calendar', exito: true, puesto: candidato.puesto });

    return NextResponse.json({ ok: true, reprogramada: !!candidato.entrevista_evento_id, ...evento, inicio: inicio + ':00-03:00' });
  } catch (e: any) {
    console.error('Error al agendar entrevista:', e);
    await registrarEvento('entrevista_agendada', candidato.nombre, { conexion: 'calendar', exito: false });
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
