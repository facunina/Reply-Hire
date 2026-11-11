import { analizarJSON, evaluarJSON } from '@/lib/ai';
import { obtenerCandidato, actualizarCandidato } from '@/lib/db';
import { requisitosDelCandidato, puestoDelCandidato, listaRequisitos, listaTareas } from '@/lib/requisitos';
import { calcularPuntaje, type Cumple, type ItemEvaluado } from '@/lib/puntaje';
import { PROMPT_EXTRACCION, PROMPT_SCORING, PROMPT_EVALUACION, sanitizarTextoCV } from '@/lib/prompts';
import { registrarEvento } from '@/lib/eventos';

// ── Análisis del CV con IA (en segundo plano) ────────────────────────────────
// La postulación se guarda primero con analisis = 'procesando' y el candidato
// recibe la confirmación al instante. Este módulo corre DESPUÉS (con after() en
// /api/upload-cv, o a pedido del reclutador con "Reintentar análisis") y
// completa score, fortalezas, brechas y resumen.
//
// Estados de la columna `analisis`:
//   procesando → la IA está trabajando
//   listo      → análisis completo; el reclutador puede decidir
//   sin_datos  → la IA no encontró información profesional en el CV
//   error      → la IA falló; el reclutador puede reintentar

export type EstadoAnalisis = 'procesando' | 'listo' | 'sin_datos' | 'error';

const recortar = (s: unknown, max: number): string => {
  const t = String(s ?? '').trim();
  return t.length > max ? t.slice(0, max) + '...' : t;
};
// Red de seguridad para el dashboard: máx. 4 fortalezas/brechas de 120 caracteres.
const limitarLista = (arr: unknown): string[] =>
  (Array.isArray(arr) ? arr : []).slice(0, 4).map((x) => recortar(x, 120));

/**
 * Analiza el CV del candidato y guarda el resultado. Nunca lanza: cualquier
 * falla queda registrada como analisis = 'error'.
 * @param textoCV texto completo del CV; si no viene, se usa el guardado en la base.
 */
export async function analizarCandidato(id: string, textoCV?: string): Promise<EstadoAnalisis> {
  const candidato = await obtenerCandidato(id).catch(() => null);
  if (!candidato) return 'error';

  const marcar = async (estado: EstadoAnalisis, extra: Record<string, unknown> = {}) => {
    try {
      await actualizarCandidato(id, { analisis: estado, ...extra });
    } catch (e) {
      console.error(`No se pudo guardar el análisis (${estado}) del candidato ${id}:`, e);
    }
    return estado;
  };

  // El texto saneado es lo único que ve la IA (las frases de inyección se
  // reemplazan por un marcador); el original queda guardado en la base.
  const textoSaneado = sanitizarTextoCV(textoCV ?? candidato.cv_texto ?? '');

  const requisitos = await requisitosDelCandidato(candidato);

  const iaInicio = Date.now();
  try {
    // Agente 2.a — extracción de perfil.
    const perfil: any = await analizarJSON(PROMPT_EXTRACCION(textoSaneado));

    // Si la IA no encontró NINGÚN dato profesional, no se evalúa un perfil
    // inventado: se marca para que el reclutador lo revise a mano.
    const sinNombre = !perfil?.nombre || String(perfil.nombre).trim() === '';
    const sinSkills = !Array.isArray(perfil?.skills) || perfil.skills.length === 0;
    const sinEducacion = !perfil?.educacion || String(perfil.educacion).trim() === '';
    const sinExperiencia = !perfil?.años_experiencia || Number(perfil.años_experiencia) === 0;
    if (sinNombre && sinSkills && sinEducacion && sinExperiencia) {
      await registrarEvento('cv_rechazado', 'sin_datos_profesionales', { id });
      return marcar('sin_datos', {
        score: 0,
        resumen: 'La IA no encontró información profesional en el CV. Revisá el PDF manualmente.',
      });
    }

    // Agente 2.b — evaluación REQUISITO POR REQUISITO (si el puesto los tiene).
    // La IA dictamina cada ítem con evidencia y el puntaje sale de la fórmula de
    // lib/puntaje.ts. Si el puesto no tiene requisitos ni tareas cargados, se
    // usa la evaluación global de abajo.
    const puesto = await puestoDelCandidato(candidato);
    const reqs = puesto ? listaRequisitos(puesto) : [];
    const tareas = puesto ? listaTareas(puesto) : [];
    if (puesto && (reqs.length > 0 || tareas.length > 0)) {
      const r: any = await evaluarJSON(
        PROMPT_EVALUACION(puesto.nombre, reqs, tareas, JSON.stringify(perfil), textoSaneado.substring(0, 12000))
      );
      await registrarEvento('llamada_ia', 'extraccion_scoring', { conexion: 'ia', exito: true, latencia_ms: Date.now() - iaInicio });

      // Se normaliza lo que devuelve la IA: cada ítem del puesto tiene que tener
      // dictamen; si falta, se toma como "no" (nunca se asume que cumple).
      const dictamen = (lista: unknown, idx: number, prefijo: string) => {
        const arr = Array.isArray(lista) ? lista : [];
        const item = arr.find((x: any) => String(x?.id || '').toUpperCase() === `${prefijo}${idx + 1}`) ?? arr[idx];
        const cumple: Cumple = ['si', 'parcial', 'no'].includes(item?.cumple) ? item.cumple : 'no';
        return { cumple, evidencia: recortar(item?.evidencia || 'La IA no encontró evidencia en el CV.', 200) };
      };
      const reqEval: ItemEvaluado[] = reqs.map((q, i) => ({ texto: q.texto, excluyente: q.excluyente, ...dictamen(r.requisitos, i, 'R') }));
      const tarEval: ItemEvaluado[] = tareas.map((t, i) => ({ texto: t, ...dictamen(r.tareas, i, 'T') }));
      const puntaje = calcularPuntaje(reqEval, tarEval);

      const estado = await marcar('listo', {
        score: puntaje.score,
        fortalezas: limitarLista(r.fortalezas),
        brechas: limitarLista(r.brechas),
        resumen: recortar(r.resumen_evaluacion, 480),
        evaluacion: { requisitos: reqEval, tareas: tarEval, puntaje },
      });
      await registrarEvento('postulacion_analizada', candidato.nombre, { id, puesto: candidato.puesto, score: puntaje.score });
      return estado;
    }

    // Evaluación global (puestos sin requisitos ni tareas cargados).
    const analisis: any = await evaluarJSON(
      PROMPT_SCORING(JSON.stringify(perfil), requisitos, textoSaneado.substring(0, 12000))
    );
    await registrarEvento('llamada_ia', 'extraccion_scoring', { conexion: 'ia', exito: true, latencia_ms: Date.now() - iaInicio });

    let score = Number(analisis.score);
    if (isNaN(score)) score = 0;
    score = Math.max(0, Math.min(100, score));

    const estado = await marcar('listo', {
      score,
      fortalezas: limitarLista(analisis.fortalezas),
      brechas: limitarLista(analisis.brechas),
      resumen: recortar(analisis.resumen_evaluacion, 480),
      evaluacion: null,
    });
    await registrarEvento('postulacion_analizada', candidato.nombre, { id, puesto: candidato.puesto, score });
    return estado;
  } catch (e) {
    console.error(`Falló el análisis con IA del candidato ${id}:`, e);
    await registrarEvento('llamada_ia', 'extraccion_scoring', { conexion: 'ia', exito: false, latencia_ms: Date.now() - iaInicio });
    return marcar('error');
  }
}
