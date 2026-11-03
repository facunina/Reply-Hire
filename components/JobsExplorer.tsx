"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AREAS, normalizarArea } from "@/lib/areas";

export interface PuestoPublico {
  id: string;
  nombre: string;
  area?: string;
  mision?: string;
  modalidad?: string;
  created_at?: string;
}

const TODAS = "Todas";

/** Fecha corta con zona fija, para que servidor y cliente rendericen lo mismo. */
function fechaCorta(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-UY", {
    day: "numeric",
    month: "short",
    timeZone: "America/Montevideo",
  });
}

/**
 * Listado público de búsquedas activas: buscador + filtro por área, con las
 * búsquedas agrupadas en una sección por área.
 */
export default function JobsExplorer({ puestos }: { puestos: PuestoPublico[] }) {
  const [texto, setTexto] = useState("");
  const [areaActiva, setAreaActiva] = useState(TODAS);

  // Sólo se ofrecen como filtro las áreas que tienen al menos una búsqueda.
  const areasConPuestos = useMemo(
    () => AREAS.filter((a) => puestos.some((p) => normalizarArea(p.area) === a)),
    [puestos]
  );

  const filtrados = useMemo(() => {
    const q = texto.trim().toLowerCase();
    return puestos.filter((p) => {
      if (areaActiva !== TODAS && normalizarArea(p.area) !== areaActiva) return false;
      if (!q) return true;
      return [p.nombre, p.mision, p.modalidad, p.area].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [puestos, texto, areaActiva]);

  const secciones = AREAS.map((area) => ({
    area,
    items: filtrados.filter((p) => normalizarArea(p.area) === area),
  })).filter((s) => s.items.length > 0);

  if (puestos.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-lg font-semibold text-slate-900">Por el momento no hay búsquedas abiertas</p>
        <p className="mt-1 text-sm text-slate-500">Volvé a visitarnos pronto: publicamos nuevas oportunidades seguido.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Buscador + filtros por área */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
          </svg>
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por puesto, área o modalidad…"
            aria-label="Buscar búsquedas"
            suppressHydrationWarning
            className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {[TODAS, ...areasConPuestos].map((a) => {
            const activa = a === areaActiva;
            return (
              <button
                key={a}
                type="button"
                onClick={() => setAreaActiva(a)}
                aria-pressed={activa}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  activa
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-brand-500 hover:text-brand-700"
                }`}
              >
                {a}
              </button>
            );
          })}
        </div>
      </div>

      {secciones.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="font-semibold text-slate-900">No encontramos búsquedas con ese filtro</p>
          <button
            type="button"
            onClick={() => {
              setTexto("");
              setAreaActiva(TODAS);
            }}
            className="mt-2 text-sm font-semibold text-brand-700 hover:underline"
          >
            Ver todas las búsquedas
          </button>
        </div>
      ) : (
        <div className="mt-10 space-y-12">
          {secciones.map(({ area, items }) => (
            <section key={area} aria-labelledby={`area-${area}`}>
              <div className="mb-4 flex items-center gap-3">
                <h3 id={`area-${area}`} className="text-xl font-bold text-slate-900">
                  {area}
                </h3>
                <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-800">
                  {items.length} {items.length === 1 ? "búsqueda" : "búsquedas"}
                </span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((p) => (
                  <Link
                    key={p.id}
                    href={`/puestos/${p.id}`}
                    className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-500 hover:shadow-lg"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="rounded-md bg-brand-50 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700">
                        {area}
                      </span>
                      {p.created_at && <span className="text-xs text-slate-400">{fechaCorta(p.created_at)}</span>}
                    </div>

                    <h4 className="mt-4 text-lg font-bold leading-snug text-slate-900 group-hover:text-brand-700">
                      {p.nombre}
                    </h4>

                    {p.mision && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600">{p.mision}</p>}

                    <div className="mt-auto flex items-center justify-between pt-5">
                      {p.modalidad ? (
                        <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                          <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          {p.modalidad}
                        </span>
                      ) : (
                        <span />
                      )}
                      <span className="text-sm font-semibold text-brand-700">
                        Ver más <span aria-hidden="true" className="inline-block transition-transform group-hover:translate-x-1">→</span>
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
