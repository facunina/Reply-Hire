import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Cliente de Supabase para el NAVEGADOR. Se usa para la sesión (Supabase Auth)
// de candidatos y del equipo (reclutador / admin). Con @supabase/ssr la sesión
// se guarda en cookies, así el servidor (proxy.ts y rutas de API) también puede
// leerla. Los datos se siguen leyendo y escribiendo desde las rutas de API.
let _client: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
    );
  }
  return _client;
}
