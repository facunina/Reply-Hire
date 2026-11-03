import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JobsExplorer, { type PuestoPublico } from "@/components/JobsExplorer";
import { obtenerPuestos } from "@/lib/db";
import { normalizarArea } from "@/lib/areas";

// La raíz del sitio es la landing pública: cualquiera puede ver las búsquedas
// activas sin iniciar sesión. El reclutador usa una interfaz separada en /dashboard.
// Se lee de Supabase en cada visita para que una búsqueda nueva aparezca al instante.
export const dynamic = "force-dynamic";

const PASOS = [
  {
    titulo: "Elegí una búsqueda",
    texto: "Explorá las oportunidades abiertas por área y leé el detalle de cada puesto.",
  },
  {
    titulo: "Enviá tu CV",
    texto: "Postulate en un par de minutos subiendo tu CV en PDF.",
  },
  {
    titulo: "Recibí una respuesta",
    texto: "Nuestro equipo revisa cada postulación y siempre te responde, avances o no.",
  },
];

export default async function Home() {
  let puestos: PuestoPublico[] = [];
  let errorCarga = false;
  try {
    // Sólo se pasan al navegador los campos que la landing muestra.
    puestos = (await obtenerPuestos()).map((p) => ({
      id: p.id as string,
      nombre: p.nombre,
      area: p.area,
      mision: p.mision,
      modalidad: p.modalidad,
      created_at: p.created_at,
    }));
  } catch (e) {
    console.error("No se pudieron cargar las búsquedas en la landing:", e);
    errorCarga = true;
  }

  const cantidadAreas = new Set(puestos.map((p) => normalizarArea(p.area))).size;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-900">
      <SiteHeader />

      <main className="flex-1">
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-gradient-to-br from-brand-600 via-brand-600 to-brand-500 text-white">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:28px_28px]"
          />
          <div aria-hidden="true" className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-sky-400/20 blur-3xl" />

          <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-sm font-medium">
              <span className="h-2 w-2 rounded-full bg-sky-300" />
              {puestos.length > 0
                ? `${puestos.length} ${puestos.length === 1 ? "búsqueda activa" : "búsquedas activas"}`
                : "Portal de empleos"}
            </span>

            <h1 className="mt-6 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
              Tu próximo trabajo empieza acá
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-brand-50/90">
              Mirá las oportunidades abiertas, elegí la que va con vos y postulate en minutos. Todas las
              postulaciones reciben una respuesta.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="#busquedas"
                className="rounded-xl bg-white px-6 py-3 text-sm font-bold text-brand-800 shadow-lg transition-transform hover:-translate-y-0.5"
              >
                Ver búsquedas activas
              </Link>
              <Link
                href="#como-funciona"
                className="rounded-xl border border-white/40 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
              >
                Cómo funciona
              </Link>
            </div>

            <dl className="mt-12 grid max-w-xl grid-cols-3 gap-6 border-t border-white/20 pt-8">
              <div>
                <dt className="text-sm text-brand-100/80">Búsquedas</dt>
                <dd className="text-3xl font-extrabold">{puestos.length}</dd>
              </div>
              <div>
                <dt className="text-sm text-brand-100/80">Áreas</dt>
                <dd className="text-3xl font-extrabold">{cantidadAreas}</dd>
              </div>
              <div>
                <dt className="text-sm text-brand-100/80">Respuesta</dt>
                <dd className="text-3xl font-extrabold">100%</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* ── Búsquedas activas (por área) ─────────────────────────────────── */}
        <section id="busquedas" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-700">Oportunidades</p>
            <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Búsquedas activas</h2>
            <p className="mt-2 text-slate-600">Filtrá por área o buscá por nombre del puesto.</p>
          </div>

          {errorCarga ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
              No pudimos cargar las búsquedas en este momento. Probá recargar la página en unos segundos.
            </div>
          ) : (
            <JobsExplorer puestos={puestos} />
          )}
        </section>

        {/* ── Cómo funciona ────────────────────────────────────────────────── */}
        <section id="como-funciona" className="scroll-mt-20 border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-700">El proceso</p>
            <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Cómo funciona</h2>

            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {PASOS.map((paso, i) => (
                <li key={paso.titulo} className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-lg font-extrabold text-white">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-slate-900">{paso.titulo}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{paso.texto}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
