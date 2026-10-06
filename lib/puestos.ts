// Catálogo de puestos abiertos. Cada puesto tiene sus propios requisitos,
// que el Agente 2 (scoring) usa para evaluar al candidato contra ESE puesto.
// Es un módulo neutral (sin imports de servidor) para poder importarlo tanto
// en componentes cliente (postular, dashboard) como en las rutas de API.

export interface Puesto {
  id: string;
  nombre: string;
  requisitos: string;
}

export const PUESTOS: Puesto[] = [
  {
    id: "analista-marketing-digital",
    nombre: "Analista de Marketing Digital",
    requisitos:
      "Puesto: Analista de Marketing Digital. Requisitos: 2 años de experiencia en marketing digital, manejo de Google Ads y Meta Ads, conocimiento de analytics y métricas (GA4), inglés intermedio, perfil proactivo y orientado a resultados.",
  },
  {
    id: "profesor-educacion-fisica",
    nombre: "Profesor de Educación Física",
    requisitos:
      "Puesto: Profesor de Educación Física. Requisitos: título docente o estudiante avanzado de Educación Física, experiencia dictando clases a distintos grupos etarios, planificación de actividades deportivas, conocimientos de primeros auxilios y buena capacidad de trabajo en equipo.",
  },
  {
    id: "desarrollador-fullstack",
    nombre: "Desarrollador Full-Stack",
    requisitos:
      "Puesto: Desarrollador Full-Stack. Requisitos: 2+ años con JavaScript/TypeScript, experiencia con React y Node.js, manejo de bases de datos SQL, control de versiones con Git e inglés técnico de lectura.",
  },
  {
    id: "administrativo-contable",
    nombre: "Administrativo Contable",
    requisitos:
      "Puesto: Administrativo Contable. Requisitos: estudiante o graduado de Contador Público / Administración, manejo de Excel intermedio-avanzado, experiencia en conciliaciones bancarias y facturación, atención al detalle y organización.",
  },
];

// Puesto por defecto cuando no se especifica uno válido (p. ej. datos legacy).
export const PUESTO_POR_DEFECTO = PUESTOS[0].nombre;

/** Devuelve los requisitos del puesto indicado (por nombre o id). */
export function getRequisitos(nombrePuesto: string | null | undefined): string {
  const p = PUESTOS.find((x) => x.nombre === nombrePuesto || x.id === nombrePuesto);
  return (p ?? PUESTOS[0]).requisitos;
}

/** True si el nombre corresponde a un puesto del catálogo. */
export function esPuestoValido(nombrePuesto: string | null | undefined): boolean {
  return PUESTOS.some((x) => x.nombre === nombrePuesto);
}
