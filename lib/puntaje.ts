// ── Puntaje de compatibilidad (fórmula determinística) ───────────────────────
// La IA evalúa cada requisito y cada tarea (cumple / parcial / no cumple, con
// evidencia del CV). El PUNTAJE no lo inventa la IA: lo calcula esta fórmula,
// así es explicable y da siempre lo mismo para la misma evaluación.
//
//  · Cada ítem vale: cumple = 1 · parcial = 0,5 · no cumple = 0
//  · Los requisitos excluyentes pesan el doble que los deseables.
//  · Puntaje = 70% requisitos + 30% experiencia en las tareas del puesto
//    (si el puesto no tiene tareas cargadas, 100% requisitos).
//  · Si NO cumple un requisito excluyente, el puntaje tiene un tope de 39.
//    Si lo cumple sólo parcialmente, el tope es 69.

export type Cumple = 'si' | 'parcial' | 'no';

export interface ItemEvaluado {
  texto: string;
  cumple: Cumple;
  evidencia: string;
  excluyente?: boolean;
}

export interface Puntaje {
  score: number;
  requisitos_pct: number;
  tareas_pct: number | null;
  tope: number | null;
  motivo_tope: string | null;
}

const VALOR: Record<Cumple, number> = { si: 1, parcial: 0.5, no: 0 };

// Niveles del puntaje (los usan el panel y las métricas para los colores).
// Los topes por excluyentes quedan justo debajo de cada nivel: si falta un
// excluyente el candidato nunca llega a "medio"; si es parcial, nunca a "alto".
export const NIVEL_ALTO = 70;
export const NIVEL_MEDIO = 40;
export type Nivel = 'alto' | 'medio' | 'bajo';
export function nivelPuntaje(score: number): Nivel {
  if (score >= NIVEL_ALTO) return 'alto';
  if (score >= NIVEL_MEDIO) return 'medio';
  return 'bajo';
}
const TOPE_SIN_EXCLUYENTE = NIVEL_MEDIO - 1; // 39
const TOPE_EXCLUYENTE_PARCIAL = NIVEL_ALTO - 1; // 69
export const PESO_REQUISITOS = 0.7;
export const PESO_EXCLUYENTE = 2;

function promedio(items: ItemEvaluado[], peso: (i: ItemEvaluado) => number): number | null {
  const total = items.reduce((s, i) => s + peso(i), 0);
  if (total === 0) return null;
  return items.reduce((s, i) => s + peso(i) * VALOR[i.cumple], 0) / total;
}

export function calcularPuntaje(requisitos: ItemEvaluado[], tareas: ItemEvaluado[]): Puntaje {
  const req = promedio(requisitos, (i) => (i.excluyente ? PESO_EXCLUYENTE : 1));
  const tar = promedio(tareas, () => 1);

  let base: number;
  if (req !== null && tar !== null) base = PESO_REQUISITOS * req + (1 - PESO_REQUISITOS) * tar;
  else base = req ?? tar ?? 0;

  let score = Math.round(base * 100);
  let tope: number | null = null;
  let motivo: string | null = null;

  const excluyentes = requisitos.filter((r) => r.excluyente);
  const noCumple = excluyentes.find((r) => r.cumple === 'no');
  const parcial = excluyentes.find((r) => r.cumple === 'parcial');
  if (noCumple) {
    tope = TOPE_SIN_EXCLUYENTE;
    motivo = `No cumple un requisito excluyente: "${noCumple.texto}".`;
  } else if (parcial) {
    tope = TOPE_EXCLUYENTE_PARCIAL;
    motivo = `Cumple sólo parcialmente un requisito excluyente: "${parcial.texto}".`;
  }
  if (tope !== null) score = Math.min(score, tope);

  return {
    score,
    requisitos_pct: req === null ? 0 : Math.round(req * 100),
    tareas_pct: tar === null ? null : Math.round(tar * 100),
    tope,
    motivo_tope: motivo,
  };
}
