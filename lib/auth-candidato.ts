import { createClient } from "@supabase/supabase-js";

// ── Sesión del candidato (Supabase Auth) del lado del servidor ───────────────
// El navegador manda el token de sesión en el header `Authorization: Bearer …`.
// Acá se valida contra Supabase Auth: nunca se confía en un id o email que
// escriba el cliente.

export interface UsuarioCandidato {
  id: string;
  email: string;
  nombre: string;
  telefono: string;
}

/** Devuelve el candidato autenticado de la request, o null si no hay sesión válida. */
export async function usuarioDesdeRequest(request: Request): Promise<UsuarioCandidato | null> {
  const header = request.headers.get("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user || !data.user.email) return null;

    const meta = (data.user.user_metadata || {}) as Record<string, unknown>;
    return {
      id: data.user.id,
      email: data.user.email,
      nombre: typeof meta.nombre === "string" ? meta.nombre : "",
      telefono: typeof meta.telefono === "string" ? meta.telefono : "",
    };
  } catch (e) {
    console.error("No se pudo validar la sesión del candidato:", e);
    return null;
  }
}
