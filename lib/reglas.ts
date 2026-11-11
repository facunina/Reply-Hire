import type { Candidato } from '@/lib/db';

// ── Reglas de negocio del proceso de selección ───────────────────────────────
// Único lugar donde se define qué decisiones se pueden tomar sobre una
// postulación. Lo usan todas las APIs que cambian el estado (/api/estado y
// /api/send-email), así la regla se cumple aunque alguien llame a la API sin
// pasar por el panel.
//
//   pendiente ──► en_entrevista ──► seleccionado
//       │               │
//       ▼               ▼
//  rechazado_cv   rechazado_entrevista

export type EstadoDecision = 'en_entrevista' | 'seleccionado' | 'rechazado_cv' | 'rechazado_entrevista';

/** Desde qué estado se puede llegar a cada decisión. */
const ESTADO_PREVIO: Record<EstadoDecision, string> = {
  en_entrevista: 'pendiente',
  rechazado_cv: 'pendiente',
  seleccionado: 'en_entrevista',
  rechazado_entrevista: 'en_entrevista',
};

export function esEstadoDecision(v: unknown): v is EstadoDecision {
  return typeof v === 'string' && v in ESTADO_PREVIO;
}

/**
 * Devuelve el motivo por el que NO se puede tomar la decisión, o null si se
 * puede. Las postulaciones viejas sin `analisis` se consideran analizadas.
 */
export function validarDecision(candidato: Candidato, nuevo: EstadoDecision): string | null {
  // La IA asiste pero no decide; tampoco se decide a ciegas: hay que esperar
  // a que termine el análisis del CV.
  if ((candidato.analisis || 'listo') === 'procesando') {
    return 'Todavía se está analizando el CV con IA. Esperá a que termine para decidir.';
  }

  const actual = candidato.estado || 'pendiente';
  if (actual !== ESTADO_PREVIO[nuevo]) {
    return `No se puede pasar de "${actual}" a "${nuevo}".`;
  }
  return null;
}

/** Al seleccionar a alguien se cubrió el puesto: la búsqueda se cierra. */
export function cierraLaBusqueda(nuevo: EstadoDecision): boolean {
  return nuevo === 'seleccionado';
}
