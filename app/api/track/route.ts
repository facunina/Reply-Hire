import { NextResponse } from 'next/server';
import { registrarEvento } from '@/lib/eventos';

// Endpoint público de seguimiento de páginas vistas.
export async function POST(request: Request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "El cuerpo de la solicitud debe ser un JSON válido." }, { status: 400 });
    }

    const { pagina } = body;
    await registrarEvento("pagina_vista", typeof pagina === "string" ? pagina : "");

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // registrarEvento nunca lanza, pero por las dudas no rompemos el tracking.
    console.error("Error en track API:", e);
    return NextResponse.json({ ok: true });
  }
}
