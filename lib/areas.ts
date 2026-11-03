// Áreas (secciones) en las que se agrupan las búsquedas del portal público.
// Módulo neutral: se importa tanto en componentes cliente como en el servidor.
export const AREAS = [
  "Tecnología",
  "Marketing",
  "Ventas",
  "Administración y Finanzas",
  "Recursos Humanos",
  "Operaciones",
  "Educación",
  "Otros",
] as const;

export const AREA_POR_DEFECTO = "Otros";

/** Devuelve un área válida del catálogo (o la por defecto si viene vacía/desconocida). */
export function normalizarArea(area: unknown): string {
  if (typeof area !== "string") return AREA_POR_DEFECTO;
  const limpia = area.trim();
  return (AREAS as readonly string[]).includes(limpia) ? limpia : AREA_POR_DEFECTO;
}
