import { NextResponse } from 'next/server';
import { destinoEmail } from '@/lib/email';
import { Resend } from 'resend';
import { obtenerCandidato, actualizarCandidato } from '@/lib/db';
import { validarDecision } from '@/lib/reglas';
import { registrarEvento } from '@/lib/eventos';

export async function POST(request: Request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "El cuerpo de la solicitud debe ser un JSON válido." }, { status: 400 });
    }

    const { id, feedback, estadoFinal } = body;

    // VALIDACIONES
    if (!id) {
      return NextResponse.json({ error: "Falta el id del candidato." }, { status: 400 });
    }

    if (!feedback || feedback.trim() === "") {
      return NextResponse.json({ error: "No hay mensaje de feedback para enviar." }, { status: 400 });
    }

    const candidato = await obtenerCandidato(id);
    if (!candidato) {
      return NextResponse.json({ error: "Candidato no encontrado." }, { status: 404 });
    }

    if (!candidato.email || !candidato.email.includes("@")) {
      return NextResponse.json({ error: "El candidato no tiene un email válido." }, { status: 400 });
    }

    // Reglas de negocio ANTES de mandar el mail: un rechazo sólo es válido desde
    // la etapa que corresponde y con el análisis de IA terminado.
    const estadoRechazo = estadoFinal === "rechazado_entrevista" ? "rechazado_entrevista" : "rechazado_cv";
    const motivo = validarDecision(candidato, estadoRechazo);
    if (motivo) {
      return NextResponse.json({ error: motivo }, { status: 409 });
    }

    // Crear Resend
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey || apiKey === "REEMPLAZAR") {
      return NextResponse.json({ error: "La API Key de Resend no está configurada." }, { status: 500 });
    }
    const resend = new Resend(apiKey);

    // Enviar el email
    try {
      const { error: sendError } = await resend.emails.send({
        from: 'ReplyHire <onboarding@resend.dev>',
        ...destinoEmail(candidato.email, `Respuesta a tu postulación — ${candidato.puesto || 'Analista de Marketing Digital'}`),
        html: `<div style="font-family: Arial, sans-serif; line-height:1.6; color:#333;">
          <p>${feedback.replace(/\n/g, '<br>')}</p>
          <p style="margin-top:20px; color:#888;">Saludos,<br>El equipo de Empresa Demo</p>
        </div>`
      });

      if (sendError) {
        await registrarEvento("email_feedback", candidato.email, { conexion: "email", exito: false });
        return NextResponse.json({ error: "No se pudo enviar el email: " + sendError.message }, { status: 500 });
      }
      await registrarEvento("email_feedback", candidato.email, { conexion: "email", exito: true });
    } catch (sendErrorAny: any) {
      await registrarEvento("email_feedback", candidato.email, { conexion: "email", exito: false });
      return NextResponse.json({ error: "No se pudo enviar el email: " + sendErrorAny.message }, { status: 500 });
    }

    // Actualizar candidato
    const estadoFinalReal = estadoRechazo;
    await actualizarCandidato(id, {
      estado: estadoFinalReal,
      feedback,
      fecha_decision: new Date().toISOString()
    });

    // Registramos la decisión (rechazo) para las métricas de experiencia.
    await registrarEvento("decision_reclutador", estadoFinalReal, { id });

    return NextResponse.json({
      ok: true,
      mensaje: "Email enviado correctamente a " + candidato.email
    });

  } catch (e: any) {
    console.error("Error general en send-email API:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
