import { NextResponse } from 'next/server';
import { destinoEmail } from '@/lib/email';
import { Resend } from 'resend';
import { analizarJSON, evaluarJSON, generarTexto } from '@/lib/ai';
import { guardarCandidato, subirCV, obtenerPuesto } from '@/lib/db';
import {
  PROMPT_EXTRACCION,
  PROMPT_SCORING,
  PROMPT_CONFIRMACION,
  detectarInyeccion,
  sanitizarTextoCV,
  REQUISITOS_PUESTO,
} from '@/lib/prompts';
import { registrarEvento } from '@/lib/eventos';
import { randomUUID } from 'crypto';

const pdfParse = require('pdf-parse/lib/pdf-parse')

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const cv = formData.get('cv');
    const nombre = formData.get('nombre') as string | null;
    const email = formData.get('email') as string | null;
    const telefono = formData.get('telefono') as string | null;
    const puestoId = formData.get('puesto_id') as string | null;

    // VALIDACIONES
    if (!cv || !(cv instanceof File)) {
      return NextResponse.json({ error: "No se adjuntó ningún archivo." }, { status: 400 });
    }

    if (!cv.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: "El archivo debe ser un PDF." }, { status: 400 });
    }

    if (cv.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "El archivo supera el tamaño máximo de 10MB." }, { status: 400 });
    }

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: "Ingresá un email válido." }, { status: 400 });
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
    // Se corre sobre el texto ORIGINAL (sin tocar) para marcar el candidato.
    const posibleInyeccion = detectarInyeccion(texto);

    // Texto saneado: solo lo que se le envía al modelo. Reemplaza las frases de
    // inyección por un marcador. El texto ORIGINAL se sigue guardando en la BD.
    const textoSaneado = sanitizarTextoCV(texto);

    // ── Requisitos dinámicos según el puesto elegido ──────────────────────────
    // Si llega un puesto_id válido, evaluamos contra ESE puesto; si no, usamos
    // el requisito por defecto y el nombre genérico.
    let requisitos = REQUISITOS_PUESTO;
    let puestoNombre = "Puesto general";
    let puestoIdGuardado: string | null = null;

    if (puestoId) {
      const puesto = await obtenerPuesto(puestoId);
      if (puesto) {
        requisitos =
          "Puesto: " + puesto.nombre +
          ". Misión: " + (puesto.mision || "No especificada") +
          ". Responsabilidades: " + (puesto.actividades || "No especificadas") +
          ". Requisitos: " + (puesto.requisitos || "No especificados") +
          ". Modalidad: " + (puesto.modalidad || "No especificada") + ".";
        puestoNombre = puesto.nombre;
        puestoIdGuardado = puestoId;
      }
    }

    const id = randomUUID();

    // Medimos la salud de la conexión con la IA alrededor de extracción + scoring.
    const iaInicio = Date.now();

    // ── Agente 2.a — Extracción de perfil con IA ──────────────────────────────
    // NO swallowing: si la IA falla (p. ej. 429 por cuota), devolvemos el error
    // real en vez de guardar un candidato con columnas vacías.
    let perfil: any;
    try {
      perfil = await analizarJSON(PROMPT_EXTRACCION(textoSaneado));
    } catch (aiExtractionError: any) {
      console.error("Error al extraer perfil con IA:", aiExtractionError);
      await registrarEvento("llamada_ia", "extraccion_scoring", { conexion: "ia", exito: false, latencia_ms: Date.now() - iaInicio });
      return NextResponse.json(
        { error: "La IA no pudo analizar el CV (extracción). " + aiExtractionError.message },
        { status: 502 }
      );
    }

    // Sanity check post-extracción: si la IA no logró extraer NINGÚN dato
    // profesional (ni nombre, ni skills, ni educación, ni experiencia), tratamos
    // el CV como vacío/ilegible en vez de evaluar un perfil inventado.
    const sinNombre = !perfil?.nombre || String(perfil.nombre).trim() === "";
    const sinSkills = !Array.isArray(perfil?.skills) || perfil.skills.length === 0;
    const sinEducacion = !perfil?.educacion || String(perfil.educacion).trim() === "";
    const sinExperiencia = !perfil?.años_experiencia || Number(perfil.años_experiencia) === 0;
    if (sinNombre && sinSkills && sinEducacion && sinExperiencia) {
      await registrarEvento("cv_rechazado", "sin_datos_profesionales");
      return NextResponse.json(
        { error: "No pudimos extraer información profesional del CV. Verificá que el PDF sea un currículum real con texto seleccionable." },
        { status: 400 }
      );
    }

    // ── Agente 2.b — Scoring contra los requisitos DEL PUESTO elegido ─────────
    // Le pasamos el perfil estructurado Y el texto completo del CV como evidencia
    // (evaluarJSON usa el modelo de scoring con más tokens) para una evaluación profunda.
    let analisis: any;
    try {
      analisis = await evaluarJSON(PROMPT_SCORING(JSON.stringify(perfil), requisitos, textoSaneado.substring(0, 12000)));
    } catch (aiScoringError: any) {
      console.error("Error al calificar perfil con IA:", aiScoringError);
      await registrarEvento("llamada_ia", "extraccion_scoring", { conexion: "ia", exito: false, latencia_ms: Date.now() - iaInicio });
      return NextResponse.json(
        { error: "La IA no pudo evaluar el CV (scoring). " + aiScoringError.message },
        { status: 502 }
      );
    }

    // Ambas llamadas a la IA fueron exitosas.
    await registrarEvento("llamada_ia", "extraccion_scoring", { conexion: "ia", exito: true, latencia_ms: Date.now() - iaInicio });

    // Normalización del score (0–100)
    let score = Number(analisis.score);
    if (isNaN(score)) {
      score = 0;
    }
    score = Math.max(0, Math.min(100, score));

    // ── Límite duro de longitud (red de seguridad para el dashboard) ──────────
    // Se aplica SIEMPRE, sin importar lo que devuelva la IA, para que la UI nunca
    // reciba texto excesivamente largo aunque el modelo no respete el prompt.
    // Reglas: máx. 4 fortalezas/brechas, 120 caracteres c/u; resumen máx. 250.
    const recortar = (s: any, max: number): string => {
      const t = String(s ?? "").trim();
      return t.length > max ? t.slice(0, max) + "..." : t;
    };
    const limitarLista = (arr: any): string[] =>
      (Array.isArray(arr) ? arr : []).slice(0, 4).map((x) => recortar(x, 120));

    const fortalezasLimitadas = limitarLista(analisis.fortalezas);
    const brechasLimitadas = limitarLista(analisis.brechas);
    const resumenLimitado = recortar(analisis.resumen_evaluacion, 480);

    // Subir el PDF original a Supabase Storage (no fatal: si Storage no está
    // configurado, guardamos igual el candidato sin cv_url).
    let cv_url = "";
    try {
      cv_url = await subirCV(id, buffer);
    } catch (storageError: any) {
      console.warn("No se pudo subir el PDF a Storage:", storageError.message);
    }

    // Armar objeto candidato — arrays pre-serializados con " | " para la BD
    const candidato = {
      id,
      nombre: nombre || perfil.nombre || "Sin nombre",
      email: email || perfil.email || "",
      telefono: telefono || "",
      puesto: puestoNombre,
      puesto_id: puestoIdGuardado,
      cv_texto: texto.substring(0, 3000),
      cv_url,
      score: score,
      skills: Array.isArray(perfil.skills) ? perfil.skills.join(" | ") : "",
      educacion: perfil.educacion || "",
      idiomas: Array.isArray(perfil.idiomas) ? perfil.idiomas.join(" | ") : "",
      resumen_perfil: perfil.resumen || "",
      fortalezas: fortalezasLimitadas.join(" | "),
      brechas: brechasLimitadas.join(" | "),
      resumen_evaluacion: resumenLimitado,
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
      await registrarEvento("guardado_candidato", candidato.nombre, { conexion: "bdd", exito: false, latencia_ms: Date.now() - bddInicio });
      throw dbError; // lo maneja el catch general (status 500)
    }

    // Postulación válida y persistida.
    await registrarEvento("postulacion_recibida", candidato.nombre, {
      id: candidato.id,
      puesto: candidato.puesto,
      score: candidato.score,
      posible_inyeccion: candidato.posible_inyeccion,
    });

    // Alerta de seguridad si se detectó una posible inyección en el CV.
    if (candidato.posible_inyeccion) {
      await registrarEvento("alerta_seguridad", "posible inyeccion en CV", { candidato: candidato.nombre });
    }

    // ── Email de confirmación de recepción al candidato ───────────────────────
    // Todo dentro de su propio try/catch: si falla (IA, Resend, red), NO debe
    // romper la respuesta de la postulación, que ya se guardó con éxito.
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

    return NextResponse.json({ ok: true, candidato });

  } catch (e: any) {
    console.error("Error general en upload-cv:", e);
    return NextResponse.json({ error: "Error procesando el CV: " + e.message }, { status: 500 });
  }
}
