import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ─── Cliente Supabase (lazy) ─────────────────────────────────────────────────
// Mismo patrón que lib/db.ts: se instancia la primera vez que se usa para que
// process.env ya esté cargado cuando Next.js inicializa las rutas de API.
let _client: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error('Supabase no está configurado para el registro de eventos.');
    }
    _client = createClient(url, key);
  }
  return _client;
}

const TABLA_EVENTOS = 'eventos';

/**
 * Registra un evento en la tabla `eventos` de Supabase.
 *
 * IMPORTANTE: esta función NUNCA lanza. Si el registro falla (config faltante,
 * error de red, columna inexistente, etc.), sólo loguea por consola. El logging
 * jamás debe romper la aplicación.
 */
export async function registrarEvento(
  tipo: string,
  detalle?: string,
  metadata?: object
): Promise<void> {
  try {
    const { error } = await getSupabase()
      .from(TABLA_EVENTOS)
      .insert({
        tipo,
        detalle: detalle ?? '',
        metadata: metadata ?? {},
      });
    if (error) {
      console.error('No se pudo registrar el evento:', error.message);
    }
  } catch (e) {
    console.error('Error al registrar evento:', e);
  }
}

/**
 * Lee todos los eventos (más nuevos primero). Usado por el panel de métricas.
 * A diferencia de registrarEvento, sí puede lanzar: el caller (la ruta de
 * métricas) lo maneja con su propio try/catch.
 */
export async function leerEventos(): Promise<any[]> {
  const { data, error } = await getSupabase()
    .from(TABLA_EVENTOS)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error('No se pudieron leer los eventos de Supabase: ' + error.message);
  }
  return data || [];
}
