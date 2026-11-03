// Roles del EQUIPO (no de los candidatos). Se guardan en `app_metadata.rol` de
// la cuenta de Supabase Auth. A diferencia de `user_metadata`, el usuario NO
// puede modificar `app_metadata` desde el navegador: sólo se asigna desde el
// panel de Supabase / SQL (ver supabase/roles.sql). Una cuenta sin rol es un
// candidato.
export type RolEquipo = "reclutador" | "admin";

export function rolDeUsuario(user: { app_metadata?: Record<string, unknown> } | null | undefined): RolEquipo | null {
  const rol = user?.app_metadata?.rol;
  return rol === "reclutador" || rol === "admin" ? rol : null;
}
