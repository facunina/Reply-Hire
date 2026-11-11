// Cifrado de los backups (AES-256-GCM, clave derivada con scrypt).
// Formato del archivo: "RHBK1" | sal (16) | iv (12) | tag (16) | datos cifrados.
import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const MAGIA = Buffer.from('RHBK1');

function clave(frase, sal) {
  if (!frase || frase.length < 20) {
    throw new Error('Falta BACKUP_PASSPHRASE (mínimo 20 caracteres).');
  }
  return scryptSync(frase, sal, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

export function cifrar(datos, frase) {
  const sal = randomBytes(16);
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', clave(frase, sal), iv);
  const cuerpo = Buffer.concat([c.update(datos), c.final()]);
  return Buffer.concat([MAGIA, sal, iv, c.getAuthTag(), cuerpo]);
}

export function descifrar(archivo, frase) {
  if (!archivo.subarray(0, 5).equals(MAGIA)) throw new Error('No es un backup de ReplyHire.');
  const sal = archivo.subarray(5, 21);
  const iv = archivo.subarray(21, 33);
  const tag = archivo.subarray(33, 49);
  const d = createDecipheriv('aes-256-gcm', clave(frase, sal), iv);
  d.setAuthTag(tag);
  try {
    return Buffer.concat([d.update(archivo.subarray(49)), d.final()]);
  } catch {
    throw new Error('La clave no es correcta o el archivo está dañado.');
  }
}
