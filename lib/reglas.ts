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
//
// Las pantallas también usan estas funciones para decidir qué botones mostrar:
// la regla se escribe una sola vez y la cumplen el panel y las APIs.

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
export function validarDecision(
  candidato: Pick<Candidato, 'estado' | 'analisis'>,
  nuevo: EstadoDecision
): string | null {
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

/** Decisiones que se pueden tomar desde un estado (sin mirar el análisis). */
export function decisionesPosibles(estado: string | undefined): EstadoDecision[] {
  const actual = estado || 'pendiente';
  return (Object.keys(ESTADO_PREVIO) as EstadoDecision[]).filter((d) => ESTADO_PREVIO[d] === actual);
}

/** ¿Se puede tomar esta decisión AHORA (estado + análisis terminado)? */
export function puedeDecidir(candidato: Pick<Candidato, 'estado' | 'analisis'>, nuevo: EstadoDecision): boolean {
  return validarDecision(candidato, nuevo) === null;
}

/** Etapa 1: revisión del CV (se decide si pasa a entrevista o se rechaza). */
export function enRevisionDeCV(estado: string | undefined): boolean {
  return decisionesPosibles(estado).includes('en_entrevista');
}

/** Etapa 2: entrevista (se agenda, se preparan preguntas y se decide). */
export function enEtapaEntrevista(estado: string | undefined): boolean {
  return decisionesPosibles(estado).includes('seleccionado');
}

/** Estado final: ya no hay decisiones posibles. */
export function esEstadoFinal(estado: string | undefined): boolean {
  return decisionesPosibles(estado).length === 0;
}

/** El rechazo correspondiente a la etapa en la que está la postulación. */
export function rechazoSegunEtapa(estado: string | undefined): 'rechazado_cv' | 'rechazado_entrevista' {
  return enRevisionDeCV(estado) ? 'rechazado_cv' : 'rechazado_entrevista';
}

// ── Límites de la postulación y de las búsquedas ─────────────────────────────
/** Tamaño máximo del CV en PDF. */
export const CV_MAX_MB = 10;
/** Largo máximo del mensaje del candidato al reclutador. */
export const MENSAJE_MAX = 1000;
/** Cantidad máxima de requisitos por búsqueda. */
export const MAX_REQUISITOS = 12;

/** Al seleccionar a alguien se cubrió el puesto: la búsqueda se cierra. */
export function cierraLaBusqueda(nuevo: EstadoDecision): boolean {
  return nuevo === 'seleccionado';
}
