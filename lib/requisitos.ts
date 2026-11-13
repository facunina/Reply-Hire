import { obtenerPuesto, type Candidato, type Puesto } from '@/lib/db';
import { MAX_REQUISITOS } from '@/lib/reglas';

// ── Requisitos y tareas del puesto ───────────────────────────────────────────
// Único lugar donde se arma lo que la IA evalúa de cada puesto:
//  - la descripción completa (para las preguntas de entrevista), y
//  - la lista de requisitos (con su marca de excluyente) y de tareas, que se
//    evalúan uno por uno en el análisis del CV.

export interface RequisitoPuesto {
  texto: string;
  excluyente: boolean;
}

const MAX_ITEMS = MAX_REQUISITOS;

/** Parte un texto libre ("a; b", una línea por ítem, viñetas) en ítems sueltos. */
export function partirEnItems(texto: string | undefined | null): string[] {
  return (texto || '')
    .split(/\r?\n|;|•/)
    .map((s) => s.replace(/^\s*(?:[-*·]+|\d+[.)])\s+/, '').replace(/[.]\s*$/, '').trim())
    .filter((s) => s.length > 2)
    .slice(0, MAX_ITEMS);
}

/** Requisitos del puesto. Se guardan en UN solo lugar: `requisitos_lista`
 *  (cada uno con su marca de excluyente). No hay copia en texto. */
export function listaRequisitos(puesto: Pick<Puesto, 'requisitos_lista'>): RequisitoPuesto[] {
  const lista = Array.isArray(puesto.requisitos_lista) ? puesto.requisitos_lista : [];
  const limpios = lista
    .filter((r) => r && typeof r.texto === 'string' && r.texto.trim())
    .map((r) => ({ texto: r.texto.trim(), excluyente: !!r.excluyente }))
    .slice(0, MAX_ITEMS);
  return limpios;
}

/** Requisitos en texto, uno por línea (para mostrarlos en el portal). Se arma
 *  al vuelo desde la lista: no se guarda. */
export function textoRequisitos(puesto: Pick<Puesto, 'requisitos_lista'>): string {
  return listaRequisitos(puesto)
    .map((r) => '• ' + r.texto + (r.excluyente ? ' (excluyente)' : ''))
    .join('\n');
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
