// Backup de ReplyHire: tablas + cuentas + PDFs de los CVs, comprimido y CIFRADO.
// Lo corre GitHub Actions todos los días (.github/workflows/backup.yml) y se
// puede correr a mano:  node --env-file=.env.local scripts/backup.mjs
//
// Variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY, BACKUP_PASSPHRASE.
// Resultado: backups/replyhire-AAAA-MM-DD_HHMM.rhbk (gitignored).
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cifrar } from './cifrado-backup.mjs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const frase = process.env.BACKUP_PASSPHRASE;
if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_KEY.');
if (!frase) throw new Error('Falta BACKUP_PASSPHRASE.');

const sb = createClient(url, key, { auth: { persistSession: false } });
const TABLAS = ['puestos', 'candidatos', 'eventos'];
const BUCKET = 'cvs';

async function tablaCompleta(nombre) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.from(nombre).select('*').range(desde, desde + 999);
    if (error) throw new Error(`Tabla ${nombre}: ${error.message}`);
    filas.push(...data);
    if (data.length < 1000) return filas;
  }
}

async function cuentas() {
  // Sin contraseñas (Supabase no las expone): sirve para saber quién era quién
  // y qué rol tenía cada cuenta del equipo.
  const todas = [];
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error('Cuentas: ' + error.message);
    todas.push(...data.users.map((u) => ({
      id: u.id, email: u.email, created_at: u.created_at,
      user_metadata: u.user_metadata, app_metadata: u.app_metadata,
    })));
    if (data.users.length < 1000) return todas;
  }
}

async function archivosDelBucket() {
  const nombres = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from(BUCKET).list('', { limit: 1000, offset });
    if (error) throw new Error('Storage: ' + error.message);
    nombres.push(...data.filter((f) => f.id).map((f) => f.name));
    if (data.length < 1000) return nombres;
  }
}

const inicio = Date.now();
const sello = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
const carpeta = join(tmpdir(), `replyhire-backup-${sello}`);
rmSync(carpeta, { recursive: true, force: true });
mkdirSync(join(carpeta, 'cvs'), { recursive: true });

const resumen = { fecha: new Date().toISOString(), tablas: {}, cuentas: 0, cvs: 0, cvs_fallidos: [] };

for (const t of TABLAS) {
  const filas = await tablaCompleta(t);
  writeFileSync(join(carpeta, `${t}.json`), JSON.stringify(filas));
  resumen.tablas[t] = filas.length;
}
const users = await cuentas();
writeFileSync(join(carpeta, 'cuentas.json'), JSON.stringify(users));
resumen.cuentas = users.length;

for (const nombre of await archivosDelBucket()) {
  const { data, error } = await sb.storage.from(BUCKET).download(nombre);
  if (error) { resumen.cvs_fallidos.push(nombre); continue; }
  writeFileSync(join(carpeta, 'cvs', nombre), Buffer.from(await data.arrayBuffer()));
  resumen.cvs++;
}
writeFileSync(join(carpeta, 'resumen.json'), JSON.stringify(resumen, null, 2));

// Comprimir y cifrar. El .tar.gz sin cifrar nunca sale de la carpeta temporal.
const tgz = carpeta + '.tar.gz';
execFileSync('tar', ['-czf', tgz, '-C', carpeta, '.']);
mkdirSync('backups', { recursive: true });
const destino = join('backups', `replyhire-${sello}.rhbk`);
writeFileSync(destino, cifrar(readFileSync(tgz), frase));
rmSync(carpeta, { recursive: true, force: true });
rmSync(tgz, { force: true });

console.log(JSON.stringify(resumen, null, 2));
console.log(`Backup cifrado: ${destino} (${(readFileSync(destino).length / 1024).toFixed(0)} KB) en ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
if (resumen.cvs_fallidos.length) process.exitCode = 1;
