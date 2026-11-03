"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { alternarFavorito, leerFavoritos } from "@/lib/favoritos";

/**
 * Botones del detalle de una búsqueda: "Postularme" (o "Ya te postulaste" si la
 * cuenta ya lo hizo) y "Guardar búsqueda". Sin sesión, guardar lleva a /ingresar.
 */
export default function AccionesPuesto({ puestoId }: { puestoId: string }) {
  const [logueado, setLogueado] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [yaPostulado, setYaPostulado] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await getSupabaseBrowser().auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      setLogueado(true);
      const fav = await leerFavoritos();
      setGuardado(!!fav?.includes(puestoId));
      try {
        const res = await fetch("/api/mis-postulaciones", { headers: { Authorization: "Bearer " + token } });
        const json = await res.json();
        setYaPostulado(((json.postulaciones || []) as { puesto_id: string | null }[]).some((p) => p.puesto_id === puestoId));
      } catch {
        // Si falla, se muestra "Postularme"; el servidor igual bloquea la postulación repetida.
      }
    })();
  }, [puestoId]);

  const guardar = async () => {
    if (!logueado) {
      window.location.href = "/ingresar?next=" + encodeURIComponent(window.location.pathname);
      return;
    }
    setOcupado(true);
    try {
      const lista = await alternarFavorito(puestoId);
      setGuardado(lista.includes(puestoId));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="mt-5 space-y-2">
      {yaPostulado ? (
        <Link
          href="/mi-cuenta"
          className="flex w-full justify-center rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-800"
        >
          ✓ Ya te postulaste — ver estado
        </Link>
      ) : (
        <Link
          href={`/postular?puesto=${puestoId}`}
          className="flex w-full justify-center rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-700"
        >
          Postularme
        </Link>
      )}
      <button
        type="button"
        onClick={guardar}
        disabled={ocupado}
        aria-pressed={guardado}
        className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
          guardado
            ? "border-brand-200 bg-brand-50 text-brand-700"
            : "border-slate-300 bg-white text-slate-700 hover:border-brand-500 hover:text-brand-700"
        }`}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill={guardado ? "currentColor" : "none"} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
        {guardado ? "Búsqueda guardada" : "Guardar búsqueda"}
      </button>
    </div>
  );
}
