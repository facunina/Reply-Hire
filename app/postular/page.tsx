"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { normalizarArea } from "@/lib/areas";

interface Puesto {
  id: string;
  nombre: string;
  area?: string;
  modalidad?: string;
}

interface Cuenta {
  nombre: string;
  email: string;
  telefono: string;
}

// Largo máximo del mensaje al reclutador (el servidor aplica el mismo tope).
const MENSAJE_MAX = 1000;

// Estados de carga de la página:
//  - "cargando": todavía se está validando la sesión y buscando el puesto.
//  - "sin-puesto": se entró sin elegir una búsqueda (o la búsqueda ya no existe).
//  - "listo": hay sesión y puesto; se muestra el formulario.
type Estado = "cargando" | "sin-puesto" | "listo";

/**
 * Postulación a UNA búsqueda concreta (/postular?puesto=ID). El candidato ya
 * eligió el puesto en la landing y ya cargó sus datos al crear la cuenta, así
 * que acá sólo adjunta el CV.
 */
export default function PostularPage() {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [puesto, setPuesto] = useState<Puesto | null>(null);
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Registramos la vista del portal (no bloqueante: si falla, se ignora).
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pagina: "portal" }),
    }).catch(() => {});

    (async () => {
      // Sin sesión no se puede postular: se manda a /ingresar y, al volver, se
      // retoma esta misma página (con el puesto que estaba elegido).
      const { data } = await getSupabaseBrowser().auth.getSession();
      const user = data.session?.user;
      if (!user) {
        const volver = window.location.pathname + window.location.search;
        window.location.replace("/ingresar?next=" + encodeURIComponent(volver));
        return;
      }
      const meta = (user.user_metadata || {}) as Record<string, unknown>;
      setCuenta({
        nombre: typeof meta.nombre === "string" ? meta.nombre : "",
        email: user.email || "",
        telefono: typeof meta.telefono === "string" ? meta.telefono : "",
      });

      // El puesto viene en la URL: es el que el candidato eligió en la landing.
      const puestoId = new URLSearchParams(window.location.search).get("puesto");
      if (!puestoId) {
        setEstado("sin-puesto");
        return;
      }
      try {
        const res = await fetch("/api/puestos");
        const json = await res.json();
        const encontrado = ((json.puestos || []) as Puesto[]).find((p) => p.id === puestoId) || null;
        setPuesto(encontrado);
        setEstado(encontrado ? "listo" : "sin-puesto");
      } catch {
        setEstado("sin-puesto");
      }
    })();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError("");
    setArchivo(e.target.files && e.target.files.length > 0 ? e.target.files[0] : null);
  };

  const handleEnviar = async () => {
    setError("");
    if (!puesto) return;

    if (!archivo) {
      setError("Adjuntá tu CV en PDF.");
      return;
    }
    if (!archivo.name.toLowerCase().endsWith(".pdf")) {
      setError("El CV debe ser un PDF.");
      return;
    }

    setEnviando(true);
    try {
      // El token de sesión identifica al candidato en el servidor: nombre,
      // email y teléfono salen de su cuenta, no de este formulario.
      const { data: sesion } = await getSupabaseBrowser().auth.getSession();
      const token = sesion.session?.access_token;
      if (!token) {
        const volver = window.location.pathname + window.location.search;
        window.location.replace("/ingresar?next=" + encodeURIComponent(volver));
        return;
      }

      const formData = new FormData();
      formData.append("cv", archivo);
      formData.append("puesto_id", puesto.id);
      if (mensaje.trim()) formData.append("mensaje", mensaje.trim());

      const res = await fetch("/api/upload-cv", {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
        body: formData,
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || "Ocurrió un error al procesar tu postulación.");
      } else {
        setEnviado(true);
      }
    } catch {
      setError("Error de red: No se pudo conectar con el servidor.");
    } finally {
      setEnviando(false);
    }
  };

  const TARJETA = "bg-white py-8 px-4 shadow-xl rounded-2xl border border-slate-100 sm:px-10";

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 font-sans">
      <SiteHeader />
      <main className="flex-1 py-10 px-4 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <Link href="/#busquedas" className="text-sm font-medium text-brand-700 hover:underline">
            ← Todas las búsquedas
          </Link>

          {estado === "cargando" && (
            <div className={`mt-6 ${TARJETA}`}>
              <div className="animate-pulse space-y-5">
                <div className="h-16 bg-slate-100 rounded-lg" />
                <div className="h-24 bg-slate-100 rounded-lg" />
                <div className="h-10 bg-slate-200 rounded-lg" />
              </div>
            </div>
          )}

          {estado === "sin-puesto" && (
            <div className={`mt-6 text-center ${TARJETA}`}>
              <h1 className="text-2xl font-bold text-slate-900">Elegí una búsqueda</h1>
              <p className="mt-2 text-slate-600 leading-relaxed">
                Para postularte, primero elegí la búsqueda que te interesa. Si llegaste desde un link viejo, puede
                que esa búsqueda ya esté cerrada.
              </p>
              <Link
                href="/#busquedas"
                className="mt-6 flex w-full justify-center py-2.5 px-4 rounded-lg shadow-sm text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors"
              >
                Ver búsquedas activas
              </Link>
            </div>
          )}

          {estado === "listo" && puesto && enviado && (
            <div className={`mt-6 text-center ${TARJETA}`}>
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">¡Postulación enviada!</h1>
              <p className="text-slate-600 mb-6 leading-relaxed">
                Recibimos tu CV para <span className="font-semibold text-slate-900">{puesto.nombre}</span>. Te vamos a
                responder a {cuenta?.email}.
              </p>
              <Link
                href="/#busquedas"
                className="w-full flex justify-center py-2.5 px-4 rounded-lg shadow-sm text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors"
              >
                Ver más búsquedas
              </Link>
            </div>
          )}

          {estado === "listo" && puesto && !enviado && (
            <>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">Enviá tu postulación</h1>

              <div className={`mt-6 ${TARJETA}`}>
                {error && (
                  <div className="mb-5 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600 flex items-start space-x-2">
                    <svg className="w-5 h-5 flex-shrink-0 text-red-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-5">
                  {/* Búsqueda elegida (no se puede cambiar acá) */}
                  <div className="rounded-xl border border-brand-100 bg-brand-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Te postulás a</p>
                    <p className="mt-1 text-lg font-bold leading-snug text-slate-900">{puesto.nombre}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {[normalizarArea(puesto.area), puesto.modalidad].filter(Boolean).join(" · ")}
                    </p>
                  </div>

                  {/* Datos de la cuenta (sólo informativo) */}
                  {cuenta && (
                    <div className="rounded-xl border border-slate-200 p-4 text-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tus datos</p>
                      {cuenta.nombre && <p className="mt-1 font-semibold text-slate-900">{cuenta.nombre}</p>}
                      <p className="text-slate-600">{[cuenta.email, cuenta.telefono].filter(Boolean).join(" · ")}</p>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-slate-700">CV (sólo formato PDF)</label>
                    <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-lg hover:border-brand-400 transition-colors">
                      <div className="space-y-1 text-center">
                        <svg className="mx-auto h-12 w-12 text-slate-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                          <path
                            d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <div className="flex text-sm text-slate-600 justify-center">
                          <label
                            htmlFor="file-upload"
                            className="relative cursor-pointer bg-white rounded-md font-semibold text-brand-600 hover:text-brand-500 focus-within:outline-none"
                          >
                            <span className="hover:underline">{archivo ? "Cambiar archivo" : "Subir un archivo"}</span>
                            <input id="file-upload" name="file-upload" type="file" accept=".pdf" className="sr-only" onChange={handleFileChange} />
                          </label>
                        </div>
                        <p className="text-xs text-slate-500">PDF de hasta 10MB</p>
                        {archivo && (
                          <p className="mt-2 text-sm font-medium text-brand-700 bg-brand-50 py-1 px-2 rounded inline-block">
                            📄 {archivo.name} ({(archivo.size / 1024 / 1024).toFixed(2)} MB)
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="mensaje" className="block text-sm font-medium text-slate-700">
                      Mensaje para el reclutador <span className="font-normal text-slate-400">(opcional)</span>
                    </label>
                    <textarea
                      id="mensaje"
                      rows={4}
                      maxLength={MENSAJE_MAX}
                      value={mensaje}
                      onChange={(e) => setMensaje(e.target.value)}
                      placeholder="Contanos por qué te interesa esta búsqueda, tu disponibilidad o lo que quieras agregar."
                      className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                    />
                    <p className="mt-1 text-right text-xs text-slate-400">
                      {mensaje.length}/{MENSAJE_MAX}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleEnviar}
                    disabled={enviando}
                    className={`w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 ${
                      enviando ? "bg-brand-400 cursor-not-allowed" : "bg-brand-600 hover:bg-brand-700"
                    }`}
                  >
                    {enviando ? (
                      <span className="flex items-center">
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Enviando… puede tardar hasta un minuto
                      </span>
                    ) : (
                      "Enviar postulación"
                    )}
                  </button>
                </div>
              </div>
            </>
          )}

          <p className="mt-4 text-center text-xs text-slate-400 px-4">
            Tus datos y tu CV se utilizan únicamente para este proceso de selección. No se comparten con terceros.
          </p>
        </div>
      </main>
    </div>
  );
}
