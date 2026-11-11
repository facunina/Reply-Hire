"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { alternarFavorito } from "@/lib/favoritos";
import { estadoCandidato } from "@/lib/estados";
import { normalizarArea } from "@/lib/areas";

interface Postulacion {
  id: string;
  puesto: string;
  puesto_id: string | null;
  estado: string;
  creado_a: string;
  entrevista_inicio?: string | null;
  entrevista_meet?: string | null;
  busqueda_cerrada?: boolean;
}

interface Puesto {
  id: string;
  nombre: string;
  area?: string;
  modalidad?: string;
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-UY", { day: "numeric", month: "short", year: "numeric" });
}

const CAMPO =
  "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30";
const TARJETA = "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm";

/** Panel del candidato: sus datos, sus postulaciones y las búsquedas que guardó. */
export default function MiCuentaPage() {
  const [cargando, setCargando] = useState(true);
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [guardandoDatos, setGuardandoDatos] = useState(false);
  const [avisoDatos, setAvisoDatos] = useState("");
  const [postulaciones, setPostulaciones] = useState<Postulacion[]>([]);
  const [errorPostulaciones, setErrorPostulaciones] = useState("");
  const [favoritos, setFavoritos] = useState<string[]>([]);
  const [puestos, setPuestos] = useState<Puesto[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await getSupabaseBrowser().auth.getSession();
      const session = data.session;
      if (!session) {
        window.location.replace("/ingresar?next=" + encodeURIComponent("/mi-cuenta"));
        return;
      }
      const meta = (session.user.user_metadata || {}) as Record<string, unknown>;
      setEmail(session.user.email || "");
      setNombre(typeof meta.nombre === "string" ? meta.nombre : "");
      setTelefono(typeof meta.telefono === "string" ? meta.telefono : "");
      setFavoritos(Array.isArray(meta.favoritos) ? meta.favoritos.filter((x): x is string => typeof x === "string") : []);

      const [resPost, resPuestos] = await Promise.allSettled([
        fetch("/api/mis-postulaciones", { headers: { Authorization: "Bearer " + session.access_token } }).then((r) => r.json()),
        fetch("/api/puestos").then((r) => r.json()),
      ]);
      if (resPost.status === "fulfilled" && !resPost.value.error) {
        setPostulaciones(resPost.value.postulaciones || []);
      } else {
        setErrorPostulaciones("No pudimos cargar tus postulaciones. Probá recargar la página.");
      }
      if (resPuestos.status === "fulfilled") setPuestos(resPuestos.value.puestos || []);
      setCargando(false);
    })();
  }, []);

  const guardarDatos = async (e: React.FormEvent) => {
    e.preventDefault();
    setAvisoDatos("");
    if (!nombre.trim()) {
      setAvisoDatos("El nombre no puede quedar vacío.");
      return;
    }
    setGuardandoDatos(true);
    const { error } = await getSupabaseBrowser().auth.updateUser({
      data: { nombre: nombre.trim(), telefono: telefono.trim() },
    });
    setGuardandoDatos(false);
    setAvisoDatos(error ? "No se pudieron guardar los cambios: " + error.message : "Datos actualizados.");
  };

  const quitarFavorito = async (id: string) => {
    try {
      setFavoritos(await alternarFavorito(id));
    } catch {
      // Si falla, la lista queda como estaba.
    }
  };

  // Los guardados que ya no están publicados se omiten.
  const puestosGuardados = favoritos
    .map((id) => puestos.find((p) => p.id === id))
    .filter((p): p is Puesto => !!p);
  const puestosAbiertos = new Set(puestos.map((p) => p.id));

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-900">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <h1 className="text-3xl font-extrabold tracking-tight">Mi cuenta</h1>
          <p className="mt-1 text-slate-600">Seguí tus postulaciones y las búsquedas que guardaste.</p>

          {cargando ? (
            <div className="mt-8 grid gap-6 lg:grid-cols-3">
              <div className="h-64 animate-pulse rounded-2xl bg-slate-200/60 lg:col-span-2" />
              <div className="h-64 animate-pulse rounded-2xl bg-slate-200/60" />
            </div>
          ) : (
            <div className="mt-8 grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                {/* ── Mis postulaciones ─────────────────────────────────── */}
                <section className={TARJETA} aria-labelledby="t-postulaciones">
                  <h2 id="t-postulaciones" className="text-lg font-bold">
                    Mis postulaciones
                  </h2>
                  {errorPostulaciones ? (
                    <p className="mt-3 text-sm text-red-600">{errorPostulaciones}</p>
                  ) : postulaciones.length === 0 ? (
                    <div className="mt-3 text-sm text-slate-600">
                      Todavía no te postulaste a ninguna búsqueda.{" "}
                      <Link href="/#busquedas" className="font-semibold text-brand-600 hover:underline">
                        Ver búsquedas activas
                      </Link>
                    </div>
                  ) : (
                    <ul className="mt-4 divide-y divide-slate-100">
                      {postulaciones.map((p) => {
                        const est = estadoCandidato(p.estado, p.busqueda_cerrada);
                        const finalizada = est.texto === "Búsqueda finalizada";
                        const abierta = p.puesto_id && puestosAbiertos.has(p.puesto_id);
                        return (
                          <li key={p.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              {abierta ? (
                                <Link href={`/puestos/${p.puesto_id}`} className="font-semibold hover:text-brand-600">
                                  {p.puesto || "Búsqueda"}
                                </Link>
                              ) : (
                                <p className="font-semibold">{p.puesto || "Búsqueda"}</p>
                              )}
                              <p className="text-sm text-slate-500">Postulado el {fecha(p.creado_a)}</p>
                              <p className="mt-1 text-sm text-slate-600">
                                {est.mensaje}
                                {finalizada && (
                                  <>
                                    {" "}
                                    <Link href="/#busquedas" className="font-semibold text-brand-600 hover:underline">
                                      Ver búsquedas activas →
                                    </Link>
                                  </>
                                )}
                              </p>
                              {p.estado === "en_entrevista" && !finalizada && p.entrevista_inicio && (
                                <p className="mt-1 text-sm font-medium text-brand-700">
                                  📅 Entrevista:{" "}
                                  {new Date(p.entrevista_inicio).toLocaleString("es-UY", {
                                    weekday: "long",
                                    day: "numeric",
                                    month: "long",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    timeZone: "America/Montevideo",
                                  })}
                                  {p.entrevista_meet && (
                                    <>
                                      {" · "}
                                      <a href={p.entrevista_meet} target="_blank" rel="noreferrer" className="underline">
                                        Unirse por Meet
                                      </a>
                                    </>
                                  )}
                                </p>
                              )}
                            </div>
                            <span className={`self-start rounded-full border px-3 py-1 text-xs font-semibold sm:self-center ${est.clase}`}>
                              {est.texto}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                {/* ── Búsquedas guardadas ───────────────────────────────── */}
                <section className={TARJETA} aria-labelledby="t-guardadas">
                  <h2 id="t-guardadas" className="text-lg font-bold">
                    Búsquedas guardadas
                  </h2>
                  {puestosGuardados.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-600">
                      No guardaste búsquedas. En el detalle de cada búsqueda tocá <strong>Guardar búsqueda</strong> para
                      tenerla a mano acá.
                    </p>
                  ) : (
                    <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                      {puestosGuardados.map((p) => (
                        <li key={p.id} className="rounded-xl border border-slate-200 p-4">
                          <Link href={`/puestos/${p.id}`} className="font-semibold leading-snug hover:text-brand-600">
                            {p.nombre}
                          </Link>
                          <p className="mt-1 text-sm text-slate-500">
                            {[normalizarArea(p.area), p.modalidad].filter(Boolean).join(" · ")}
                          </p>
                          <div className="mt-3 flex gap-3 text-sm font-semibold">
                            <Link href={`/postular?puesto=${p.id}`} className="text-brand-600 hover:underline">
                              Postularme
                            </Link>
                            <button type="button" onClick={() => quitarFavorito(p.id)} className="text-slate-500 hover:text-red-600">
                              Quitar
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>

              {/* ── Mis datos ─────────────────────────────────────────────── */}
              <section className={`${TARJETA} h-fit`} aria-labelledby="t-datos">
                <h2 id="t-datos" className="text-lg font-bold">
                  Mis datos
                </h2>
                <form onSubmit={guardarDatos} className="mt-4 space-y-4">
                  <div>
                    <label htmlFor="mc-email" className="block text-sm font-medium text-slate-700">
                      Email
                    </label>
                    <input id="mc-email" type="email" value={email} readOnly className={`${CAMPO} cursor-not-allowed bg-slate-50 text-slate-500`} />
                  </div>
                  <div>
                    <label htmlFor="mc-nombre" className="block text-sm font-medium text-slate-700">
                      Nombre completo
                    </label>
                    <input id="mc-nombre" type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} className={CAMPO} />
                  </div>
                  <div>
                    <label htmlFor="mc-telefono" className="block text-sm font-medium text-slate-700">
                      Teléfono
                    </label>
                    <input
                      id="mc-telefono"
                      type="tel"
                      value={telefono}
                      onChange={(e) => setTelefono(e.target.value)}
                      placeholder="099 123 456"
                      className={CAMPO}
                    />
                  </div>
                  {avisoDatos && <p className="text-sm text-slate-600">{avisoDatos}</p>}
                  <button
                    type="submit"
                    disabled={guardandoDatos}
                    className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-400"
                  >
                    {guardandoDatos ? "Guardando…" : "Guardar cambios"}
                  </button>
                  <p className="text-xs text-slate-400">
                    Los cambios se usan en tus próximas postulaciones; las ya enviadas conservan los datos de ese momento.
                  </p>
                </form>
              </section>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
