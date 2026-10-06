import { NextResponse } from 'next/server';
import { obtenerCandidatos } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const candidatos = await obtenerCandidatos();
    return NextResponse.json({ candidatos });
  } catch (e: any) {
    console.error("Error en candidatos GET API:", e);
    return NextResponse.json(
      { candidatos: [], error: e.message },
      { status: 500 }
    );
  }
}
