// Cómo se le muestra al CANDIDATO el estado de su postulación: una etiqueta y
// un mensaje. Los dos rechazos se presentan igual: el candidato no necesita
// saber en qué etapa se decidió.
interface EstadoVisible {
  texto: string;
  clase: string;
  mensaje: string;
}

export const ESTADO_CANDIDATO: Record<string, EstadoVisible> = {
  pendiente: {
    texto: "En revisión",
    clase: "bg-amber-50 text-amber-800 border-amber-200",
    mensaje: "Estamos revisando tu CV. Te vamos a avisar por mail.",
  },
  en_entrevista: {
    texto: "Entrevista",
    clase: "bg-brand-50 text-brand-700 border-brand-200",
    mensaje: "¡Avanzaste a la etapa de entrevista!",
  },
  seleccionado: {
    texto: "Seleccionado/a",
    clase: "bg-green-50 text-green-800 border-green-200",
    mensaje: "¡Felicitaciones! Quedaste seleccionado/a. Nos vamos a contactar con vos.",
  },
  rechazado_cv: {
    texto: "No avanzó",
    clase: "bg-slate-100 text-slate-600 border-slate-200",
    mensaje: "Esta vez no avanzaste. Te enviamos una devolución por mail.",
  },
  rechazado_entrevista: {
    texto: "No avanzó",
    clase: "bg-slate-100 text-slate-600 border-slate-200",
    mensaje: "Esta vez no avanzaste. Te enviamos una devolución por mail.",
  },
};

// La búsqueda se cubrió con otra persona y esta postulación había quedado sin
// decisión: no se la deja "en revisión" para siempre.
const BUSQUEDA_FINALIZADA: EstadoVisible = {
  texto: "Búsqueda finalizada",
  clase: "bg-slate-100 text-slate-600 border-slate-200",
  mensaje: "Esta búsqueda ya se cubrió. ¡Gracias por postularte! Tu perfil puede encajar en otras oportunidades.",
};

export function estadoCandidato(estado: string, busquedaCerrada = false): EstadoVisible {
  if (busquedaCerrada && (estado === "pendiente" || estado === "en_entrevista")) {
    return BUSQUEDA_FINALIZADA;
  }
  return ESTADO_CANDIDATO[estado] || ESTADO_CANDIDATO.pendiente;
}
