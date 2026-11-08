import { analizarJSON, evaluarJSON } from '@/lib/ai';
import { obtenerCandidato, obtenerPuesto, actualizarCandidato } from '@/lib/db';
import { PROMPT_EXTRACCION, PROMPT_SCORING, sanitizarTextoCV, REQUISITOS_PUESTO } from '@/lib/prompts';
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

  let requisitos = REQUISITOS_PUESTO;
  if (candidato.puesto_id) {
    const puesto = await obtenerPuesto(candidato.puesto_id).catch(() => null);
    if (puesto) {
      requisitos =
        'Puesto: ' + puesto.nombre +
        '. Misión: ' + (puesto.mision || 'No especificada') +
        '. Responsabilidades: ' + (puesto.actividades || 'No especificadas') +
        '. Requisitos: ' + (puesto.requisitos || 'No especificados') +
        '. Modalidad: ' + (puesto.modalidad || 'No especificada') + '.';
    }
  }

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

    // Agente 2.b — scoring contra los requisitos del puesto elegido.
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
    });
    await registrarEvento('postulacion_analizada', candidato.nombre, { id, puesto: candidato.puesto, score });
    return estado;
  } catch (e) {
    console.error(`Falló el análisis con IA del candidato ${id}:`, e);
    await registrarEvento('llamada_ia', 'extraccion_scoring', { conexion: 'ia', exito: false, latencia_ms: Date.now() - iaInicio });
    return marcar('error');
  }
}
