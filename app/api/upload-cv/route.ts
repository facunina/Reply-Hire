import { NextResponse, after } from 'next/server';
import { destinoEmail } from '@/lib/email';
import { Resend } from 'resend';
import { generarTexto } from '@/lib/ai';
import { analizarCandidato } from '@/lib/analisis';
import { guardarCandidato, subirCV, obtenerPuesto, yaSePostulo } from '@/lib/db';
import { usuarioDesdeRequest } from '@/lib/auth-candidato';
import { PROMPT_CONFIRMACION, detectarInyeccion } from '@/lib/prompts';
import { registrarEvento } from '@/lib/eventos';
import { randomUUID } from 'crypto';
import { CV_MAX_MB, MENSAJE_MAX } from '@/lib/reglas';

const pdfParse = require('pdf-parse/lib/pdf-parse')


export async function POST(request: Request) {
  try {
    // Postularse exige una cuenta de candidato (Supabase Auth). El email sale
    // de la sesión validada, no de lo que mande el formulario.
    const usuario = await usuarioDesdeRequest(request);
    if (!usuario) {
      return NextResponse.json(
        { error: "Para postularte tenés que iniciar sesión con tu cuenta." },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const cv = formData.get('cv');
    // Nombre, email y teléfono salen de la cuenta: el formulario ya no los pide.
    const nombre = usuario.nombre.trim();
    const email = usuario.email;
    const telefono = usuario.telefono.trim();
    const puestoId = formData.get('puesto_id') as string | null;
    // Mensaje opcional para el reclutador. Es texto libre del candidato: se
    // guarda y se le muestra al reclutador, pero NO se le pasa a la IA (así no
    // puede usarse para manipular el puntaje).
    const mensaje = ((formData.get('mensaje') as string | null) || "").trim().slice(0, MENSAJE_MAX);

    // VALIDACIONES
    if (!cv || !(cv instanceof File)) {
      return NextResponse.json({ error: "No se adjuntó ningún archivo." }, { status: 400 });
    }

    if (!cv.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: "El archivo debe ser un PDF." }, { status: 400 });
    }

    if (cv.size > CV_MAX_MB * 1024 * 1024) {
      return NextResponse.json({ error: `El archivo supera el tamaño máximo de ${CV_MAX_MB}MB.` }, { status: 400 });
    }

    // Una misma cuenta no puede postularse dos veces a la misma búsqueda. Se
    // verifica antes de guardar nada.
    if (puestoId) {
      let repetida = false;
      try {
        repetida = await yaSePostulo(usuario.id, puestoId);
      } catch (e) {
        // Si el id no es un uuid válido o la consulta falla, no bloqueamos acá:
        // más abajo se valida el puesto contra la tabla.
        console.warn("No se pudo verificar postulación repetida:", e);
      }
      if (repetida) {
        return NextResponse.json({ error: "Ya te postulaste a esta búsqueda." }, { status: 409 });
      }
    }

    // Extracción de texto del PDF
    const archivo = cv;
    const arrayBuffer = await archivo.arrayBuffer()
    const buffer = Buffer.from(new Uint8Array(arrayBuffer))
    let texto = ""
    try {
      const data = await pdfParse(buffer)
      texto = (data.text || "").trim()
    } catch (pdfError: any) {
      return NextResponse.json(
        { error: "No pudimos leer el PDF. Verificá que no esté dañado y que contenga texto seleccionable (no una imagen escaneada)." },
        { status: 400 }
      )
    }

    // ── Detección de CV vacío / ilegible / escaneado ──────────────────────────
    // Medimos CONTENIDO REAL, no solo cantidad de bytes: colapsamos los espacios
    // y contamos palabras y caracteres alfanuméricos. Así rechazamos PDFs en
    // blanco, escaneados (imagen sin texto) o con texto basura mínimo, que antes
    // pasaban el umbral simple de 50 caracteres.
    const textoNormalizado = texto.replace(/\s+/g, ' ').trim();
    const palabras = textoNormalizado.split(' ').filter((p) => p.length > 1);
    const caracteresAlfa = (textoNormalizado.match(/[\p{L}\p{N}]/gu) || []).length;

    if (textoNormalizado.length < 120 || palabras.length < 20 || caracteresAlfa < 100) {
      await registrarEvento("cv_rechazado", "pdf_vacio_o_escaneado", {
        caracteres_alfa: caracteresAlfa,
        palabras: palabras.length,
      });
      return NextResponse.json(
        { error: "El CV parece vacío, demasiado corto o ser una imagen escaneada. Subí un PDF con texto seleccionable y contenido real (experiencia, formación, etc.)." },
        { status: 400 }
      );
    }

    // ── Detección de posible inyección de prompts ─────────────────────────────
    // Se corre sobre el texto ORIGINAL (sin tocar) para marcar el candidato. El
    // saneado (lo que ve la IA) se hace en lib/analisis.ts.
    const posibleInyeccion = detectarInyeccion(texto);

    // ── Puesto elegido ────────────────────────────────────────────────────────
    let puestoNombre = "Puesto general";
    let puestoIdGuardado: string | null = null;
    if (puestoId) {
      const puesto = await obtenerPuesto(puestoId);
      if (puesto && puesto.activo === false) {
        return NextResponse.json(
          { error: "Esta búsqueda ya está cerrada y no recibe más postulaciones." },
          { status: 409 }
        );
      }
      if (puesto) {
        puestoNombre = puesto.nombre;
        puestoIdGuardado = puestoId;
      }
    }

    const id = randomUUID();

    // Subir el PDF original a Supabase Storage (no fatal: si Storage no está
    // configurado, guardamos igual el candidato sin cv_url).
    let cv_url = "";
    try {
      cv_url = await subirCV(id, buffer);
    } catch (storageError: any) {
      console.warn("No se pudo subir el PDF a Storage:", storageError.message);
    }

    // Armar objeto candidato (fortalezas y brechas las completa la IA después)
    const candidato = {
      id,
      nombre: nombre || "Sin nombre",
      email,
      telefono: telefono || "",
      puesto: puestoNombre,
      puesto_id: puestoIdGuardado,
      usuario_id: usuario.id,
      mensaje,
      // Se guarda texto suficiente para poder reintentar el análisis más tarde.
      cv_texto: texto.substring(0, 15000),
      cv_url,
      score: 0,
      // La IA completa score, fortalezas, brechas y resumen después de responder.
      analisis: "procesando",
      posible_inyeccion: posibleInyeccion,
      estado: "pendiente",
      feedback: "",
      fecha_postulacion: new Date().toLocaleString()
    };

    // Guardado en la base de datos, midiendo la salud de la conexión "bdd".
    const bddInicio = Date.now();
    try {
      await guardarCandidato(candidato);
      await registrarEvento("guardado_candidato", candidato.nombre, { conexion: "bdd", exito: true, latencia_ms: Date.now() - bddInicio });
    } catch (dbError: any) {
      // La base tiene un índice UNIQUE (usuario_id, puesto_id): si dos pedidos de
      // la misma cuenta llegan casi juntos, el segundo choca acá aunque haya
      // pasado la verificación previa. Se responde lo mismo que en ese caso.
      if (/duplicate key|candidatos_usuario_puesto_unico/i.test(dbError?.message || "")) {
        return NextResponse.json({ error: "Ya te postulaste a esta búsqueda." }, { status: 409 });
      }
      await registrarEvento("guardado_candidato", candidato.nombre, { conexion: "bdd", exito: false, latencia_ms: Date.now() - bddInicio });
      throw dbError; // lo maneja el catch general (status 500)
    }

    // Postulación válida y persistida.
    await registrarEvento("postulacion_recibida", candidato.nombre, {
      id: candidato.id,
      puesto: candidato.puesto,
      posible_inyeccion: candidato.posible_inyeccion,
    });

    // Alerta de seguridad si se detectó una posible inyección en el CV.
    if (candidato.posible_inyeccion) {
      await registrarEvento("alerta_seguridad", "posible inyeccion en CV", { candidato: candidato.nombre });
    }

    // ── Análisis con IA en segundo plano ──────────────────────────────────────
    // El candidato no espera a la IA: se responde ya y el análisis corre después.
    // Se le pasa el texto completo del PDF (en la base queda recortado).
    after(() => analizarCandidato(id, texto).then(() => undefined));

    // ── Email de confirmación de recepción al candidato ───────────────────────
    // Se manda con after(): corre DESPUÉS de responder, así el candidato no
    // espera a que la IA redacte el mail ni a que Resend lo envíe. Va dentro de
    // su propio try/catch: si falla (IA, Resend, red) la postulación ya quedó
    // guardada igual.
    after(async () => {
      try {
        let textoConfirmacion: string;
        try {
          textoConfirmacion = await generarTexto(
            PROMPT_CONFIRMACION(candidato.nombre, candidato.puesto)
          );
        } catch (genError) {
          console.error("No se pudo generar el texto de confirmación con IA:", genError);
          textoConfirmacion =
            "Hola " + candidato.nombre +
            ", queríamos informarte que recibimos tu CV con éxito. Lo evaluaremos y te contactaremos con novedades. ¡Gracias por postularte!";
        }

        const apiKey = process.env.RESEND_API_KEY;
        if (apiKey && apiKey !== "REEMPLAZAR" && candidato.email && candidato.email.includes("@")) {
          const resend = new Resend(apiKey);
          const { error: sendError } = await resend.emails.send({
            from: 'ReplyHire <onboarding@resend.dev>',
            ...destinoEmail(candidato.email, "Recibimos tu postulación — " + candidato.puesto),
            html: `<div style="font-family: Arial, sans-serif; line-height:1.6; color:#333;">
              <p>${textoConfirmacion.replace(/\n/g, '<br>')}</p>
              <p style="margin-top:20px; color:#888;">El equipo de ReplyHire</p>
            </div>`,
          });
          await registrarEvento("email_confirmacion", candidato.email, { conexion: "email", exito: !sendError });
        }
      } catch (emailError) {
        console.error("No se pudo enviar el email de confirmación:", emailError);
        await registrarEvento("email_confirmacion", candidato.email, { conexion: "email", exito: false });
      }
    });

    return NextResponse.json({ ok: true, candidato });

  } catch (e: any) {
    console.error("Error general en upload-cv:", e);
    return NextResponse.json({ error: "Error procesando el CV: " + e.message }, { status: 500 });
  }
}
