// Restaura un backup YA ABIERTO (ver abrir-backup.mjs) en la base de Supabase.
//   Simulación (no escribe nada):  node --env-file=.env.local scripts/restaurar-backup.mjs <carpeta>
//   Restaurar de verdad:           node --env-file=.env.local scripts/restaurar-backup.mjs <carpeta> --confirmar
//
// Hace "upsert" por id: vuelve a crear lo que falte y pisa con la versión del
// backup lo que exista. No borra filas creadas después del backup. Las cuentas
// (Supabase Auth) no se recrean solas: cuentas.json sirve de referencia.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const carpeta = process.argv[2];
const confirmar = process.argv.includes('--confirmar');
if (!carpeta) throw new Error('Uso: restaurar-backup.mjs <carpeta> [--confirmar]');

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// Orden: primero puestos (los candidatos apuntan a ellos).
for (const t of ['puestos', 'candidatos', 'eventos']) {
  const filas = JSON.parse(readFileSync(join(carpeta, `${t}.json`), 'utf8'));
  console.log(`${t}: ${filas.length} filas`);
  if (!confirmar) continue;
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await sb.from(t).upsert(filas.slice(i, i + 500), { onConflict: 'id' });
    if (error) throw new Error(`${t}: ${error.message}`);
  }
}

const pdfs = readdirSync(join(carpeta, 'cvs'));
console.log(`cvs: ${pdfs.length} PDFs`);
if (confirmar) {
  for (const nombre of pdfs) {
    const { error } = await sb.storage.from('cvs')
      .upload(nombre, readFileSync(join(carpeta, 'cvs', nombre)), { contentType: 'application/pdf', upsert: true });
    if (error) throw new Error(`cvs/${nombre}: ${error.message}`);
  }
}
console.log(confirmar ? 'Restauración terminada.' : 'Simulación: no se escribió nada. Agregá --confirmar para restaurar.');
