import { obtenerPuesto, type Candidato, type Puesto } from '@/lib/db';

// ── Requisitos y tareas del puesto ───────────────────────────────────────────
// Único lugar donde se arma lo que la IA evalúa de cada puesto:
//  - la descripción completa (para las preguntas de entrevista), y
//  - la lista de requisitos (con su marca de excluyente) y de tareas, que se
//    evalúan uno por uno en el análisis del CV.

export interface RequisitoPuesto {
  texto: string;
  excluyente: boolean;
}

const MAX_ITEMS = 12;

/** Parte un texto libre ("a; b", una línea por ítem, viñetas) en ítems sueltos. */
export function partirEnItems(texto: string | undefined | null): string[] {
  return (texto || '')
    .split(/\r?\n|;|•/)
    .map((s) => s.replace(/^\s*(?:[-*·]+|\d+[.)])\s+/, '').replace(/[.]\s*$/, '').trim())
    .filter((s) => s.length > 2)
    .slice(0, MAX_ITEMS);
}

/** Requisitos del puesto. Si el reclutador los cargó como lista, se usan esos
 *  (con su marca de excluyente); si no, se parte el texto libre (ninguno
 *  excluyente), así funciona también con los puestos viejos. */
export function listaRequisitos(puesto: Pick<Puesto, 'requisitos' | 'requisitos_lista'>): RequisitoPuesto[] {
  const lista = Array.isArray(puesto.requisitos_lista) ? puesto.requisitos_lista : [];
  const limpios = lista
    .filter((r) => r && typeof r.texto === 'string' && r.texto.trim())
    .map((r) => ({ texto: r.texto.trim(), excluyente: !!r.excluyente }))
    .slice(0, MAX_ITEMS);
  if (limpios.length > 0) return limpios;
  return partirEnItems(puesto.requisitos).map((texto) => ({ texto, excluyente: false }));
}

/** Tareas / responsabilidades del puesto, una por ítem. */
export function listaTareas(puesto: Pick<Puesto, 'actividades'>): string[] {
  return partirEnItems(puesto.actividades);
}

/** Puesto al que se postuló el candidato (o null si ya no existe). */
export async function puestoDelCandidato(candidato: Pick<Candidato, 'puesto_id'>): Promise<Puesto | null> {
  return candidato.puesto_id ? await obtenerPuesto(candidato.puesto_id).catch(() => null) : null;
}

/** Descripción completa del puesto en texto. Si el puesto ya no existe, se usa
 *  sólo su nombre (nunca requisitos de otro puesto). */
export async function requisitosDelCandidato(candidato: Pick<Candidato, 'puesto_id' | 'puesto'>): Promise<string> {
  const puesto = await puestoDelCandidato(candidato);
  if (!puesto) {
    return `Puesto: ${candidato.puesto || 'No especificado'}.`;
  }
  const reqs = listaRequisitos(puesto)
    .map((r) => r.texto + (r.excluyente ? ' (excluyente)' : ''))
    .join('; ');
  return (
    'Puesto: ' + puesto.nombre +
    '. Misión: ' + (puesto.mision || 'No especificada') +
    '. Responsabilidades: ' + (puesto.actividades || 'No especificadas') +
    '. Requisitos: ' + (reqs || 'No especificados') +
    '. Modalidad: ' + (puesto.modalidad || 'No especificada') + '.'
  );
}
