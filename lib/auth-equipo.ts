import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { rolDeUsuario, type RolEquipo } from "@/lib/roles";

/**
 * Rol del equipo (reclutador / admin) de la sesión que hace la request, leído
 * de las cookies de Supabase Auth y validado contra Supabase. Para usar en
 * rutas de API como segunda barrera además del proxy (defensa en profundidad).
 */
export async function rolEquipoDesdeCookies(): Promise<RolEquipo | null> {
  return (await usuarioEquipoDesdeCookies())?.rol ?? null;
}

/** Cuenta del equipo (id, email y rol) de la sesión, o null si no es del equipo. */
export async function usuarioEquipoDesdeCookies(): Promise<{ id: string; email: string; rol: RolEquipo } | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        // En una ruta de API sólo se lee la sesión; el refresco lo hace el proxy.
        setAll: () => {},
      },
    }
  );
  const { data } = await supabase.auth.getUser();
  const rol = rolDeUsuario(data.user);
  if (!rol || !data.user) return null;
  return { id: data.user.id, email: data.user.email || '', rol };
}
