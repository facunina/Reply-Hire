import { getSupabaseBrowser } from "@/lib/supabase-browser";

// Búsquedas guardadas ("de interés") del candidato. Se guardan en los metadatos
// de su cuenta de Supabase Auth (`user_metadata.favoritos`, lista de ids de
// puesto): no hace falta una tabla y sólo el propio usuario puede modificarlos.

export async function leerFavoritos(): Promise<string[] | null> {
  const { data } = await getSupabaseBrowser().auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  const fav = (user.user_metadata || {}).favoritos;
  return Array.isArray(fav) ? fav.filter((x): x is string => typeof x === "string") : [];
}

/** Agrega o quita un puesto de los guardados. Devuelve la lista actualizada. */
export async function alternarFavorito(puestoId: string): Promise<string[]> {
  const actuales = (await leerFavoritos()) || [];
  const nuevos = actuales.includes(puestoId) ? actuales.filter((id) => id !== puestoId) : [puestoId, ...actuales];
  const { error } = await getSupabaseBrowser().auth.updateUser({ data: { favoritos: nuevos } });
  if (error) throw new Error(error.message);
  return nuevos;
}
