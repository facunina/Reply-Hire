import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ─── Cliente Supabase (lazy) ─────────────────────────────────────────────────
// Se instancia la primera vez que se usa para que process.env ya esté
// completamente cargado cuando Next.js inicializa las rutas de API.
let _client: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    // Aceptamos la anon key (acceso del lado del servidor con RLS desactivada)
    // y, como alternativa, la service key si estuviera configurada.
    const key =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY;

    if (!url || !key) {
      throw new Error(
        'Supabase no está configurado. Definí NEXT_PUBLIC_SUPABASE_URL y ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local (y en las Environment ' +
        'Variables de Vercel).'
      );
    }
    _client = createClient(url, key);
  }
  return _client;
}

// Nombre de la tabla y del bucket de Storage en Supabase.
const TABLA = 'candidatos';
const TABLA_PUESTOS = 'puestos';
const BUCKET_CV = 'cvs';

export interface Candidato {
  id?: string;
  nombre: string;
  email: string;
  telefono?: string;
  puesto?: string;
  puesto_id?: string | null;
  usuario_id?: string | null;   // cuenta (Supabase Auth) del candidato que se postuló
  posible_inyeccion?: boolean;
  mensaje?: string;             // texto libre que el candidato le deja al reclutador
  cv_texto?: string;
  cv_url?: string;
  score?: number;
  // En Supabase se almacenan como texto ("a | b") y se leen de vuelta como
  // string[] tras deserializar; por eso el tipo admite ambas formas.
  skills?: string | string[];
  educacion?: string;
  idiomas?: string | string[];
  resumen_perfil?: string;
  fortalezas?: string | string[];
  brechas?: string | string[];
  resumen_evaluacion?: string;
  resumen?: string;
  estado?: string;
  feedback?: string;
  guardado?: boolean;
  creado_a?: string;
  // Campos legacy / compatibilidad (no se persisten en la tabla nueva)
  años_experiencia?: number;
  fecha_postulacion?: string;
  fecha_decision?: string | null;
  feedback_cv?: string;
  feedback_entrevista?: string;
}

// Columnas reales de la tabla `candidatos` en Supabase.
// Cualquier campo extra del objeto candidato se descarta antes de insertar
// para evitar errores "column ... does not exist".
const COLUMNAS = [
  'nombre',
  'email',
  'telefono',
  'puesto',
  'puesto_id',
  'usuario_id',
  'posible_inyeccion',
  'mensaje',
  'cv_texto',
  'cv_url',
  'score',
  'fortalezas',
  'brechas',
  'resumen',
  'feedback',
  'estado',
  'guardado',
] as const;

// ─── Helpers de serialización ────────────────────────────────────────────────

/** Convierte arrays a texto " | " para almacenar de forma consistente. */
function serializar(v: any): string {
  if (Array.isArray(v)) return v.map(String).join(' | ');
  if (v === null || v === undefined) return '';
  return String(v);
}

function parseArr(v: any): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string' && v.trim()) {
    if (v.includes(' | ')) return v.split(' | ').map(s => s.trim()).filter(Boolean);
    try {
      const p = JSON.parse(v);
      if (Array.isArray(p)) return p.map(String);
    } catch { /* ignorar */ }
    return v.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

/** Normaliza una fila cruda de Supabase al shape que consume el dashboard. */
function deserializar(f: any): Candidato {
  if (!f) return f;
  return {
    ...f,
    score: f.score !== undefined ? Number(f.score) : 0,
    resumen: f.resumen ?? '',
    fortalezas: parseArr(f.fortalezas),
    brechas: parseArr(f.brechas),
    skills: parseArr(f.skills),
    idiomas: parseArr(f.idiomas),
  };
}

/** Toma un objeto candidato (posiblemente con campos extra) y deja solo las
 *  columnas válidas de la tabla, serializando arrays a texto. */
function aFila(c: Partial<Candidato>): Record<string, any> {
  const fila: Record<string, any> = {};

  if (c.nombre !== undefined) fila.nombre = c.nombre || '';
  if (c.email !== undefined) fila.email = c.email || '';
  if (c.telefono !== undefined) fila.telefono = c.telefono || '';
  if (c.puesto !== undefined) fila.puesto = c.puesto || '';
  // FK al puesto (uuid). Si viene vacío lo guardamos como null para no romper
  // la columna de tipo uuid.
  if (c.puesto_id !== undefined) fila.puesto_id = c.puesto_id || null;
  if (c.usuario_id !== undefined) fila.usuario_id = c.usuario_id || null;
  if (c.posible_inyeccion !== undefined) fila.posible_inyeccion = !!c.posible_inyeccion;
  if (c.mensaje !== undefined) fila.mensaje = c.mensaje || '';
  if (c.cv_texto !== undefined) fila.cv_texto = c.cv_texto || '';
  if (c.cv_url !== undefined) fila.cv_url = c.cv_url || '';
  if (c.score !== undefined) {
    const n = Number(c.score);
    fila.score = isNaN(n) ? 0 : n;
  }
  if (c.fortalezas !== undefined) fila.fortalezas = serializar(c.fortalezas);
  if (c.brechas !== undefined) fila.brechas = serializar(c.brechas);
  if (c.feedback !== undefined) fila.feedback = c.feedback || '';
  if (c.estado !== undefined) fila.estado = c.estado || '';
  if (c.guardado !== undefined) fila.guardado = !!c.guardado;

  // El dashboard usa `resumen`; el pipeline produce `resumen_evaluacion`
  // (scoring) o `resumen_perfil` (extracción). Mapeamos a la columna única.
  const resumen = c.resumen ?? c.resumen_evaluacion ?? c.resumen_perfil;
  if (resumen !== undefined) fila.resumen = resumen || '';

  return fila;
}

// ─── Funciones exportadas ────────────────────────────────────────────────────

/** Inserta un candidato nuevo y devuelve la fila persistida (deserializada). */
export async function guardarCandidato(c: Candidato): Promise<Candidato> {
  const fila = aFila(c);
  // Si el caller ya generó un id (uuid), lo respetamos para mantener
  // consistencia con la respuesta; si no, lo genera Supabase.
  if (c.id) fila.id = c.id;

  const { data, error } = await getSupabase()
    .from(TABLA)
    .insert(fila)
    .select()
    .single();

  if (error) {
    throw new Error('No se pudo guardar el candidato en Supabase: ' + error.message);
  }
  return deserializar(data);
}

/** Devuelve todas las filas crudas de la tabla (más recientes primero). */
export async function leerTodo(): Promise<any[]> {
  const { data, error } = await getSupabase()
    .from(TABLA)
    .select('*')
    .order('creado_a', { ascending: false, nullsFirst: false });

  if (error) {
    throw new Error('No se pudieron leer los candidatos de Supabase: ' + error.message);
  }
  return data || [];
}

/** Lista de candidatos lista para el dashboard (arrays deserializados). */
export async function obtenerCandidatos(): Promise<Candidato[]> {
  const filas = await leerTodo();
  return filas.map(deserializar);
}

/** Obtiene un candidato por id, o null si no existe. */
export async function obtenerCandidato(id: string): Promise<Candidato | null> {
  const { data, error } = await getSupabase()
    .from(TABLA)
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return deserializar(data);
}

/** Postulaciones de una cuenta de candidato (más recientes primero). Sólo los
 *  campos que el propio candidato puede ver: no incluye score ni análisis de la IA. */
export async function obtenerPostulacionesDeUsuario(usuarioId: string): Promise<
  { id: string; puesto: string; puesto_id: string | null; estado: string; creado_a: string }[]
> {
  const { data, error } = await getSupabase()
    .from(TABLA)
    .select('id, puesto, puesto_id, estado, creado_a')
    .eq('usuario_id', usuarioId)
    .order('creado_a', { ascending: false });

  if (error) {
    throw new Error('No se pudieron leer las postulaciones de Supabase: ' + error.message);
  }
  return data || [];
}

/** Indica si una cuenta de candidato ya se postuló a un puesto determinado. */
export async function yaSePostulo(usuarioId: string, puestoId: string): Promise<boolean> {
  const { count, error } = await getSupabase()
    .from(TABLA)
    .select('id', { count: 'exact', head: true })
    .eq('usuario_id', usuarioId)
    .eq('puesto_id', puestoId);

  if (error) {
    throw new Error('No se pudo verificar la postulación en Supabase: ' + error.message);
  }
  return (count ?? 0) > 0;
}

/** Aplica cambios parciales a un candidato existente. */
export async function actualizarCandidato(
  id: string,
  cambios: Partial<Candidato>
): Promise<void> {
  const fila = aFila(cambios);

  if (Object.keys(fila).length === 0) {
    // Nada válido para actualizar; evitamos un update vacío.
    return;
  }

  const { error } = await getSupabase()
    .from(TABLA)
    .update(fila)
    .eq('id', id);

  if (error) {
    throw new Error('No se pudo actualizar el candidato en Supabase: ' + error.message);
  }
}

/** Elimina permanentemente un candidato de la base. */
export async function eliminarCandidato(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from(TABLA)
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error('No se pudo eliminar el candidato en Supabase: ' + error.message);
  }
}

/**
 * Sube el PDF original del CV a Supabase Storage y devuelve su URL pública.
 * Requiere un bucket público llamado `cvs` con política de subida para `anon`.
 */
export async function subirCV(id: string, buffer: Buffer): Promise<string> {
  const ruta = `${id}.pdf`;
  const { error } = await getSupabase()
    .storage
    .from(BUCKET_CV)
    .upload(ruta, buffer, { contentType: 'application/pdf', upsert: true });

  if (error) {
    throw new Error(
      `No se pudo subir el PDF a Supabase Storage (bucket "${BUCKET_CV}"): ${error.message}. ` +
      `Verificá que el bucket exista, sea público y tenga políticas de subida/lectura para el rol anon.`
    );
  }

  const { data } = getSupabase().storage.from(BUCKET_CV).getPublicUrl(ruta);
  return data.publicUrl;
}

// ─── Puestos ─────────────────────────────────────────────────────────────────
// Tabla `puestos` creada en Supabase. Cada puesto define la búsqueda contra la
// cual el Agente de scoring evalúa a los candidatos. Sigue el mismo patrón que
// las funciones de candidatos.

export interface Puesto {
  id?: string;
  nombre: string;            // 1. Título del puesto (claro y directo)
  area?: string;             // Área / sección del portal (ver lib/areas.ts)
  sobre_nosotros?: string;   // 2. Sobre nosotros (propuesta de cultura)
  mision?: string;           // 3. Misión del puesto (el "para qué")
  actividades?: string;      // 4. Responsabilidades y tareas (¿qué hará?)
  requisitos?: string;       // 5. Requisitos del perfil (¿qué buscamos?)
  modalidad?: string;        // 6. Modalidad y ubicación
  beneficios?: string;       // 7. Beneficios y propuesta de valor (¿qué ofrecemos?)
  salario?: string;          // (legacy, opcional)
  created_at?: string;       // la tabla `puestos` usa created_at (en inglés)
}

/** Inserta un puesto nuevo y devuelve la fila persistida.
 *  Es resistente al desfasaje de esquema: si la tabla todavía no tiene alguna
 *  columna (falta correr la migración), la descarta y reintenta en vez de
 *  romper la creación. Para guardar TODOS los campos hay que correr la
 *  migración SQL que agrega sobre_nosotros, mision, modalidad y beneficios. */
export async function guardarPuesto(p: Puesto): Promise<Puesto> {
  const fila: Record<string, any> = {
    nombre: p.nombre || '',
    area: p.area || 'Otros',
    sobre_nosotros: p.sobre_nosotros || '',
    mision: p.mision || '',
    actividades: p.actividades || '',
    requisitos: p.requisitos || '',
    modalidad: p.modalidad || '',
    beneficios: p.beneficios || '',
    salario: p.salario || '',
  };
  // Respetamos el id si el caller ya generó uno (uuid); si no, lo genera Supabase.
  if (p.id) fila.id = p.id;

  // Columnas opcionales que pueden no existir si falta la migración. El id,
  // nombre, actividades, requisitos y salario son del esquema original y no se
  // descartan: si fallan, es un error real.
  const descartables = new Set(['area', 'sobre_nosotros', 'mision', 'modalidad', 'beneficios']);

  for (let intento = 0; intento < 6; intento++) {
    const { data, error } = await getSupabase()
      .from(TABLA_PUESTOS)
      .insert(fila)
      .select()
      .single();

    if (!error) return data as Puesto;

    const faltante = error.message.match(/find the '([^']+)' column/i);
    const col = faltante?.[1];
    if (col && descartables.has(col) && col in fila) {
      delete fila[col]; // la tabla no tiene esta columna todavía → la omitimos
      continue;
    }
    throw new Error('No se pudo guardar el puesto en Supabase: ' + error.message);
  }
  throw new Error('No se pudo guardar el puesto en Supabase (faltan demasiadas columnas; corré la migración).');
}

/** Devuelve todos los puestos, los más recientes primero. La tabla `puestos`
 *  usa la columna `created_at`. Si no existiera (esquema distinto), reintenta
 *  sin ordenar para no romper el listado. */
export async function obtenerPuestos(): Promise<Puesto[]> {
  let { data, error } = await getSupabase()
    .from(TABLA_PUESTOS)
    .select('*')
    .order('created_at', { ascending: false, nullsFirst: false });

  // Fallback: la tabla todavía no tiene la columna de fecha.
  if (error && /created_at/.test(error.message)) {
    ({ data, error } = await getSupabase().from(TABLA_PUESTOS).select('*'));
  }

  if (error) {
    throw new Error('No se pudieron leer los puestos de Supabase: ' + error.message);
  }
  return (data || []) as Puesto[];
}

/** Obtiene un puesto por id, o null si no existe. */
export async function obtenerPuesto(id: string): Promise<Puesto | null> {
  const { data, error } = await getSupabase()
    .from(TABLA_PUESTOS)
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return data as Puesto;
}

// Exportamos las columnas por si algún consumidor necesita validar el shape.
export { COLUMNAS };
