import { NextResponse } from 'next/server';

// Duración de la sesión: 8 horas.
const MAX_AGE = 60 * 60 * 8;

export async function POST(request: Request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "El cuerpo de la solicitud debe ser un JSON válido." }, { status: 400 });
    }

    const { usuario, password } = body;

    // Resolución del rol según las credenciales (env vars, nunca hardcodeadas).
    // La cookie guarda ÚNICAMENTE el token correspondiente al rol, SIN concatenar
    // el rol. El rol se deduce luego (en el proxy) según cuál token coincide, así
    // nadie puede editar el valor de la cookie para escalar de reclutador a admin.
    let rol: "reclutador" | "admin" | null = null;
    let tokenSesion: string | undefined;
    if (usuario === process.env.RECLUTADOR_USUARIO && password === process.env.RECLUTADOR_PASSWORD) {
      rol = "reclutador";
      tokenSesion = process.env.RECLUTADOR_SESSION_TOKEN;
    } else if (usuario === process.env.ADMIN_USUARIO && password === process.env.ADMIN_PASSWORD) {
      rol = "admin";
      tokenSesion = process.env.ADMIN_SESSION_TOKEN;
    }

    if (!rol || !tokenSesion) {
      return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true, rol });
    res.cookies.set("sesion", tokenSesion, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE,
    });
    return res;
  } catch (e: any) {
    console.error("Error en login API:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
