// Cómo se le muestra al CANDIDATO cada estado interno de su postulación.
// Los dos rechazos se presentan igual: el candidato no necesita saber en qué
// etapa se decidió.
export const ESTADO_CANDIDATO: Record<string, { texto: string; clase: string }> = {
  pendiente: { texto: "En revisión", clase: "bg-amber-50 text-amber-800 border-amber-200" },
  en_entrevista: { texto: "Entrevista", clase: "bg-brand-50 text-brand-700 border-brand-200" },
  seleccionado: { texto: "Seleccionado/a", clase: "bg-green-50 text-green-800 border-green-200" },
  rechazado_cv: { texto: "No avanzó", clase: "bg-slate-100 text-slate-600 border-slate-200" },
  rechazado_entrevista: { texto: "No avanzó", clase: "bg-slate-100 text-slate-600 border-slate-200" },
};

export function estadoCandidato(estado: string) {
  return ESTADO_CANDIDATO[estado] || ESTADO_CANDIDATO.pendiente;
}
