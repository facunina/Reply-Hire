"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

/**
 * Zona de sesión del candidato en el encabezado: muestra "Ingresar" si no hay
 * sesión, o el nombre y "Salir" si la hay. Se resuelve en el cliente porque la
 * sesión de Supabase Auth vive en el navegador.
 */
export default function AuthNav() {
  // undefined = todavía no se sabe (evita parpadeo); null = sin sesión.
  const [nombre, setNombre] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    const aNombre = (u: { email?: string; user_metadata?: Record<string, unknown> } | null | undefined) => {
      if (!u) return null;
      const n = typeof u.user_metadata?.nombre === "string" ? u.user_metadata.nombre.trim() : "";
      return n ? n.split(" ")[0] : u.email || "Mi cuenta";
    };

    supabase.auth.getSession().then(({ data }) => setNombre(aNombre(data.session?.user)));
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, session) => setNombre(aNombre(session?.user)));
    return () => sub.subscription.unsubscribe();
  }, []);

  const salir = async () => {
    await getSupabaseBrowser().auth.signOut();
    window.location.href = "/";
  };

  if (nombre === undefined) {
    return <span className="h-9 w-24 animate-pulse rounded-lg bg-slate-100" aria-hidden="true" />;
  }

  if (nombre === null) {
    return (
      <Link
        href="/ingresar"
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
      >
        Ingresar
      </Link>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <Link
        href="/mi-cuenta"
        className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        title="Mi cuenta"
      >
        <span className="hidden max-w-[10rem] truncate sm:inline">Hola, {nombre}</span>
        <span className="sm:hidden">Mi cuenta</span>
      </Link>
      <button
        type="button"
        onClick={salir}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:border-brand-600 hover:text-brand-700"
      >
        Salir
      </button>
    </span>
  );
}
