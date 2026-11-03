import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Cliente de Supabase para el NAVEGADOR. Se usa únicamente para la sesión de
// los candidatos (Supabase Auth): registrarse, iniciar sesión y cerrar sesión.
// Los datos se siguen leyendo y escribiendo desde las rutas de API del servidor.
let _client: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
    );
  }
  return _client;
}
