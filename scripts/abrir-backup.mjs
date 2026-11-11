// Abre (descifra y descomprime) un backup para revisarlo o restaurarlo.
//   node --env-file=.env.local scripts/abrir-backup.mjs backups/replyhire-XXXX.rhbk [carpeta-destino]
// No toca la base: sólo deja los archivos en la carpeta destino.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, basename } from 'node:path';
import { descifrar } from './cifrado-backup.mjs';

const archivo = process.argv[2];
if (!archivo) throw new Error('Uso: node scripts/abrir-backup.mjs <archivo.rhbk> [destino]');
const destino = process.argv[3] || join('backups', basename(archivo, '.rhbk'));

const tgz = descifrar(readFileSync(archivo), process.env.BACKUP_PASSPHRASE);
mkdirSync(destino, { recursive: true });
const tmp = join(destino, '..', basename(destino) + '.tar.gz');
writeFileSync(tmp, tgz);
execFileSync('tar', ['-xzf', tmp, '-C', destino]);
rmSync(tmp, { force: true });

console.log(readFileSync(join(destino, 'resumen.json'), 'utf8'));
console.log('Backup abierto en: ' + destino);
