import { obtenerCandidatosDelPuesto, actualizarCandidato, type Candidato } from '@/lib/db';
import { quedaSinRespuesta } from '@/lib/reglas';
import { enviarEmail } from '@/lib/email';
import { registrarEvento } from '@/lib/eventos';

// ── Aviso de búsqueda cubierta ───────────────────────────────────────────────
// Cuando el reclutador selecciona a alguien, a las demás personas de esa
// búsqueda que todavía no tenían respuesta se les avisa por email que el puesto
// se cubrió. Así nadie queda esperando sin saber nada. A cada una se le avisa
// UNA sola vez (queda la fecha en candidatos.aviso_cierre_a).

const escapar = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function htmlAviso(nombre: string, puesto: string): string {
  return `<div style="font-family: Arial, sans-serif; line-height:1.6; color:#333;">
    <p>Hola ${escapar(nombre || '')},</p>
    <p>Te escribimos por tu postulación a <strong>${escapar(puesto)}</strong>. Queríamos contarte que la búsqueda
    ya se cubrió: seleccionamos a otra persona para el puesto.</p>
    <p>Gracias por tu interés y por el tiempo que le dedicaste. Tu perfil puede encajar en otras oportunidades:
    te invitamos a seguir atento/a a nuestras próximas búsquedas.</p>
    <p style="margin-top:20px; color:#888;">Saludos,<br>El equipo de ReplyHire</p>
  </div>`;
}

/** Postulaciones de la búsqueda que quedaron sin respuesta (sin contar a la persona seleccionada). */
export async function candidatosSinRespuesta(puestoId: string, seleccionadoId: string): Promise<Candidato[]> {
  const todos = await obtenerCandidatosDelPuesto(puestoId);
  return todos.filter((c) => quedaSinRespuesta({ ...c, id: c.id as string }, seleccionadoId));
}

/** Envía el aviso a cada persona sin respuesta y lo deja registrado. */
export async function avisarBusquedaCubierta(
  puestoId: string,
  puestoNombre: string,
  seleccionadoId: string
): Promise<{ enviados: number; fallidos: number }> {
  let enviados = 0;
  let fallidos = 0;
  for (const c of await candidatosSinRespuesta(puestoId, seleccionadoId)) {
    const r = await enviarEmail(c.email, `La búsqueda "${puestoNombre}" ya se cubrió`, htmlAviso(c.nombre, puestoNombre));
    if (r.ok) {
      await actualizarCandidato(c.id as string, { aviso_cierre_a: new Date().toISOString() });
      enviados++;
    } else {
      console.error(`No se pudo avisar a ${c.email}:`, r.error);
      fallidos++;
    }
    await registrarEvento('email_busqueda_cubierta', c.email, { conexion: 'email', exito: r.ok, puesto_id: puestoId });
  }
  await registrarEvento('aviso_busqueda_cubierta', puestoNombre, { puesto_id: puestoId, enviados, fallidos });
  return { enviados, fallidos };
}
