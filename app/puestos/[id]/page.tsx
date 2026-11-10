import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import AccionesPuesto from "@/components/AccionesPuesto";
import { obtenerPuesto } from "@/lib/db";
import { normalizarArea } from "@/lib/areas";

// Detalle público de una búsqueda. No requiere sesión.
export const dynamic = "force-dynamic";

function Bloque({ titulo, texto }: { titulo: string; texto?: string }) {
  if (!texto || !texto.trim()) return null;
  return (
    <section className="border-t border-slate-200 pt-6 first:border-t-0 first:pt-0">
      <h2 className="text-lg font-bold text-slate-900">{titulo}</h2>
      {/* whitespace-pre-line respeta los saltos de línea y viñetas que cargó el reclutador */}
      <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-slate-700">{texto.trim()}</p>
    </section>
  );
}

export default async function PuestoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const puesto = await obtenerPuesto(id);
  if (!puesto) notFound();

  const area = normalizarArea(puesto.area);
  const publicado = puesto.created_at
    ? new Date(puesto.created_at).toLocaleDateString("es-UY", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "America/Montevideo",
      })
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-900">
      <SiteHeader />

      <main className="flex-1">
        <div className="bg-gradient-to-br from-brand-600 via-brand-600 to-brand-500 text-white">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
            <Link href="/#busquedas" className="text-sm font-medium text-brand-100 hover:text-white">
              ← Todas las búsquedas
            </Link>
            <h1 className="mt-4 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
              {puesto.nombre}
            </h1>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <span className="rounded-full bg-white/15 px-3 py-1 font-medium">{area}</span>
              {puesto.modalidad && <span className="rounded-full bg-white/15 px-3 py-1 font-medium">{puesto.modalidad}</span>}
              {publicado && <span className="rounded-full bg-white/15 px-3 py-1 font-medium">Publicado el {publicado}</span>}
            </div>
          </div>
        </div>

        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-3">
          <article className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 lg:col-span-2">
            <Bloque titulo="Sobre nosotros" texto={puesto.sobre_nosotros} />
            <Bloque titulo="Misión del puesto" texto={puesto.mision} />
            <Bloque titulo="Qué vas a hacer" texto={puesto.actividades} />
            <Bloque titulo="Qué buscamos" texto={puesto.requisitos} />
            <Bloque titulo="Qué ofrecemos" texto={puesto.beneficios} />
          </article>

          <aside className="lg:col-span-1">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:sticky lg:top-24">
              {puesto.activo !== false && (
                <>
                  <h2 className="text-lg font-bold text-slate-900">¿Te interesa esta búsqueda?</h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    Postulate subiendo tu CV en PDF. Te lleva un par de minutos y siempre vas a recibir una respuesta.
                  </p>
                </>
              )}
              {puesto.activo === false ? (
                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <p className="font-semibold text-slate-900">Esta búsqueda está cerrada</p>
                  <p className="mt-1">Ya no recibe postulaciones. Mirá las otras búsquedas activas.</p>
                  <Link href="/#busquedas" className="mt-3 inline-block font-semibold text-brand-600 hover:underline">
                    Ver búsquedas activas →
                  </Link>
                </div>
              ) : (
                <AccionesPuesto puestoId={puesto.id as string} />
              )}
              <dl className="mt-6 space-y-3 border-t border-slate-200 pt-5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Área</dt>
                  <dd className="text-right font-medium text-slate-900">{area}</dd>
                </div>
                {puesto.modalidad && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Modalidad</dt>
                    <dd className="text-right font-medium text-slate-900">{puesto.modalidad}</dd>
                  </div>
                )}
              </dl>
            </div>
          </aside>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
