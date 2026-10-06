import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { leerEventos } from '@/lib/eventos';

export const dynamic = 'force-dynamic';

// GET con filtros: ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&puesto=...&tipo_evento=...&granularidad=hora|dia|semana
// Protegido por el proxy Y, además, valida la sesión de admin acá mismo
// (defensa en profundidad). Devuelve métricas agregadas de seguridad,
// experiencia y uso, más los últimos 20 eventos.
export async function GET(request: Request) {
  try {
    // 1) Validar sesión de admin ANTES de cualquier otra cosa. El rol se deduce
    //    del token: solo el ADMIN_SESSION_TOKEN da acceso. No se lee ningún
    //    campo "rol" del valor de la cookie (evita escalada de privilegios).
    const cookieStore = await cookies();
    const sesion = cookieStore.get('sesion')?.value || '';
    if (!sesion || sesion !== process.env.ADMIN_SESSION_TOKEN) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // 2) Parámetros de filtro (con defaults).
    const { searchParams } = new URL(request.url);
    const hoy = new Date();
    const hace7 = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const desde = searchParams.get('desde') || fmt(hace7);
    const hasta = searchParams.get('hasta') || fmt(hoy);
    const puesto = searchParams.get('puesto') || 'todos';
    const tipoEvento = searchParams.get('tipo_evento') || 'todos';
    const granularidad = searchParams.get('granularidad') || 'dia';

    const desdeMs = new Date(desde + 'T00:00:00').getTime();
    const hastaMs = new Date(hasta + 'T23:59:59.999').getTime();

    // 3) Leer TODOS los eventos y aplicar filtros dinámicos.
    const todos = await leerEventos(); // más nuevos primero
    const meta = (e: any): any =>
      e && e.metadata && typeof e.metadata === 'object' ? e.metadata : {};

    const eventos = todos.filter((e) => {
      const t = new Date(e.created_at).getTime();
      if (isNaN(t) || t < desdeMs || t > hastaMs) return false;
      if (puesto !== 'todos' && meta(e).puesto !== puesto) return false;
      if (tipoEvento !== 'todos' && e.tipo !== tipoEvento) return false;
      return true;
    });

    // 4) SEGURIDAD / salud de conexiones.
    const salud = (conexion: string) => {
      const arr = eventos.filter((e) => meta(e).conexion === conexion);
      const totalLlamadas = arr.length;
      const llamadasFallidas = arr.filter((e) => meta(e).exito === false).length;
      const lat = arr
        .map((e) => Number(meta(e).latencia_ms))
        .filter((n) => !isNaN(n) && n >= 0);
      const latenciaPromedio = lat.length
        ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length)
        : 0;
      return {
        totalLlamadas,
        llamadasFallidas,
        porcentajeError: totalLlamadas ? Math.round((llamadasFallidas / totalLlamadas) * 1000) / 10 : 0,
        latenciaPromedio,
      };
    };

    const seguridad = {
      ia: salud('ia'),
      email: salud('email'),
      bdd: salud('bdd'),
      alertasSeguridad: eventos.filter((e) => e.tipo === 'alerta_seguridad').length,
      posiblesInyecciones: eventos.filter(
        (e) => e.tipo === 'postulacion_recibida' && meta(e).posible_inyeccion === true
      ).length,
    };

    // 5) EXPERIENCIA del cliente.
    const paginasVistas = eventos.filter((e) => e.tipo === 'pagina_vista' && e.detalle === 'portal').length;
    const postulacionesEv = eventos.filter((e) => e.tipo === 'postulacion_recibida');
    const postulacionesRecibidas = postulacionesEv.length;
    const tasaConversion = paginasVistas ? Math.round((postulacionesRecibidas / paginasVistas) * 1000) / 10 : 0;
    const tasaAbandono = Math.max(0, Math.round((100 - tasaConversion) * 10) / 10);

    const decisionesEv = eventos.filter((e) => e.tipo === 'decision_reclutador');
    const cuentaEstado = (estado: string) => decisionesEv.filter((e) => e.detalle === estado).length;
    const decisiones = {
      total: decisionesEv.length,
      avanzadosEntrevista: cuentaEstado('en_entrevista'),
      rechazadosCv: cuentaEstado('rechazado_cv'),
      rechazadosEntrevista: cuentaEstado('rechazado_entrevista'),
      seleccionados: cuentaEstado('seleccionado'),
    };

    const experiencia = { paginasVistas, postulacionesRecibidas, tasaConversion, tasaAbandono, decisiones };

    // 6) USO del sistema.
    const postulacionesPorPuesto: Record<string, number> = {};
    const sumaScore: Record<string, number> = {};
    const countScore: Record<string, number> = {};
    for (const e of postulacionesEv) {
      const p = meta(e).puesto || 'Sin puesto';
      postulacionesPorPuesto[p] = (postulacionesPorPuesto[p] || 0) + 1;
      const s = Number(meta(e).score);
      if (!isNaN(s)) {
        sumaScore[p] = (sumaScore[p] || 0) + s;
        countScore[p] = (countScore[p] || 0) + 1;
      }
    }
    const scorePromedioPorPuesto: Record<string, number> = {};
    for (const p of Object.keys(countScore)) {
      scorePromedioPorPuesto[p] = Math.round(sumaScore[p] / countScore[p]);
    }

    const distribucionScores = { bajo: 0, medio: 0, alto: 0 }; // 0-39 / 40-69 / 70-100
    for (const e of postulacionesEv) {
      const s = Number(meta(e).score);
      if (isNaN(s)) continue;
      if (s < 40) distribucionScores.bajo++;
      else if (s < 70) distribucionScores.medio++;
      else distribucionScores.alto++;
    }

    // tiempoPromedioDecision (horas): correlación postulación ↔ decisión por metadata.id.
    const postCreadoPorId: Record<string, string> = {};
    for (const e of postulacionesEv) {
      const pid = meta(e).id;
      if (pid) postCreadoPorId[pid] = e.created_at;
    }
    const tiempos: number[] = [];
    for (const d of decisionesEv) {
      const pid = meta(d).id;
      if (pid && postCreadoPorId[pid]) {
        const ms = new Date(d.created_at).getTime() - new Date(postCreadoPorId[pid]).getTime();
        if (ms >= 0) tiempos.push(ms);
      }
    }
    const tiempoPromedioDecision = tiempos.length
      ? Math.round((tiempos.reduce((a, b) => a + b, 0) / tiempos.length / 3600000) * 10) / 10
      : 0;

    const uso = { postulacionesPorPuesto, scorePromedioPorPuesto, distribucionScores, tiempoPromedioDecision };

    // 7) Últimos 20 eventos (ya vienen DESC desde leerEventos).
    const eventosRecientes = eventos.slice(0, 20).map((e) => ({
      tipo: e.tipo,
      detalle: e.detalle,
      metadata: meta(e),
      created_at: e.created_at,
    }));

    return NextResponse.json({
      seguridad,
      experiencia,
      uso,
      eventosRecientes,
      filtros: { desde, hasta, puesto, tipoEvento, granularidad },
    });
  } catch (e: any) {
    console.error('Error en metricas API:', e);
    return NextResponse.json(
      { error: 'No se pudieron calcular las métricas.', debug: e?.message || String(e) },
      { status: 500 }
    );
  }
}
