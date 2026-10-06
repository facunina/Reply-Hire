"use client";

import { useState, useEffect } from "react";

interface Puesto {
  id: string;
  nombre: string;
  actividades?: string;
  requisitos?: string;
  salario?: string;
}

export default function PostularPage() {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [puestoId, setPuestoId] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState("");

  // El formulario se renderiza sólo en el cliente (después de montar). Esto
  // evita el "Hydration failed": las extensiones del navegador (autorrelleno,
  // gestores de contraseñas) inyectan nodos/atributos en los <input> antes de
  // que React hidrate, y suppressHydrationWarning no alcanza a los hijos
  // profundos. Al no renderizar el form en el servidor, no hay HTML que
  // discrepe.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    // Registramos la vista del portal (no bloqueante: si falla, se ignora).
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pagina: "portal" }),
    }).catch(() => {});
    // Cargamos las búsquedas abiertas desde la tabla `puestos`.
    (async () => {
      try {
        const res = await fetch("/api/puestos");
        const data = await res.json();
        setPuestos(data.puestos || []);
      } catch {
        setPuestos([]);
      }
    })();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setArchivo(e.target.files[0]);
    } else {
      setArchivo(null);
    }
  };

  const handleEnviar = async () => {
    setError("");

    // Validaciones del cliente
    if (!puestoId) {
      setError("Elegí el puesto al que te querés postular.");
      return;
    }
    if (!nombre.trim()) {
      setError("Ingresá tu nombre.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError("Ingresá un email válido.");
      return;
    }
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
      const formData = new FormData();
      formData.append("cv", archivo);
      formData.append("nombre", nombre.trim());
      formData.append("email", email.trim());
      formData.append("telefono", telefono.trim());
      formData.append("puesto_id", puestoId);

      const res = await fetch("/api/upload-cv", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || "Ocurrió un error al procesar tu postulación.");
      } else {
        setEnviado(true);
      }
    } catch (err: any) {
      setError("Error de red: No se pudo conectar con el servidor.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Encabezado con Logo */}
        <h1 className="text-4xl font-extrabold tracking-tight">
          <span className="text-slate-900">Reply</span>
          <span className="text-blue-600">Hire</span>
        </h1>
        <p className="mt-2 text-sm text-slate-600 font-medium">
          Elegí el puesto y enviá tu CV — <span className="text-blue-700">Empresa Demo</span>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        {!mounted ? (
          /* Placeholder idéntico en server y primer render de cliente */
          <div className="bg-white py-8 px-4 shadow-xl rounded-2xl border border-slate-100 sm:px-10">
            <div className="animate-pulse space-y-5">
              <div className="h-10 bg-slate-100 rounded-lg" />
              <div className="h-10 bg-slate-100 rounded-lg" />
              <div className="h-10 bg-slate-100 rounded-lg" />
              <div className="h-24 bg-slate-100 rounded-lg" />
              <div className="h-10 bg-slate-200 rounded-lg" />
            </div>
          </div>
        ) : enviado ? (
          <div className="bg-white py-8 px-4 shadow-xl rounded-2xl border border-slate-100 sm:px-10 text-center transition-all duration-300">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">¡Postulación enviada!</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              Gracias por postularte. Te contactaremos por email con la respuesta.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              Postular otro CV
            </button>
          </div>
        ) : (
          <div className="bg-white py-8 px-4 shadow-xl rounded-2xl border border-slate-100 sm:px-10">
            {error && (
              <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600 flex items-start space-x-2">
                <svg className="w-5 h-5 flex-shrink-0 text-red-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-5">
              <div>
                <label htmlFor="puesto" className="block text-sm font-medium text-slate-700">
                  Puesto al que te postulás
                </label>
                <div className="mt-1">
                  {puestos.length === 0 ? (
                    <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                      Por el momento no hay búsquedas abiertas.
                    </p>
                  ) : (
                    <select
                      id="puesto"
                      value={puestoId}
                      onChange={(e) => setPuestoId(e.target.value)}
                      className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm text-slate-900 bg-white"
                    >
                      <option value="">Seleccioná un puesto…</option>
                      {puestos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="nombre" className="block text-sm font-medium text-slate-700">
                  Nombre completo
                </label>
                <div className="mt-1">
                  <input
                    id="nombre"
                    type="text"
                    required
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Juan Pérez"
                    className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                  Email
                </label>
                <div className="mt-1">
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="juan.perez@ejemplo.com"
                    className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="telefono" className="block text-sm font-medium text-slate-700">
                  Teléfono (opcional)
                </label>
                <div className="mt-1">
                  <input
                    id="telefono"
                    type="tel"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    placeholder="+54 9 11 1234-5678"
                    className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  CV (sólo formato PDF)
                </label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-lg hover:border-blue-400 transition-colors">
                  <div className="space-y-1 text-center">
                    <svg
                      className="mx-auto h-12 w-12 text-slate-400"
                      stroke="currentColor"
                      fill="none"
                      viewBox="0 0 48 48"
                      aria-hidden="true"
                    >
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
                        className="relative cursor-pointer bg-white rounded-md font-semibold text-blue-600 hover:text-blue-500 focus-within:outline-none"
                      >
                        <span className="hover:underline">Subir un archivo</span>
                        <input
                          id="file-upload"
                          name="file-upload"
                          type="file"
                          accept=".pdf"
                          className="sr-only"
                          onChange={handleFileChange}
                        />
                      </label>
                    </div>
                    <p className="text-xs text-slate-500">PDF de hasta 10MB</p>
                    {archivo && (
                      <p className="mt-2 text-sm font-medium text-blue-700 bg-blue-50 py-1 px-2 rounded inline-block">
                        📄 {archivo.name} ({(archivo.size / 1024 / 1024).toFixed(2)} MB)
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={handleEnviar}
                  disabled={enviando || puestos.length === 0}
                  className={`w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                    enviando || puestos.length === 0 ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  {enviando ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Enviando...
                    </span>
                  ) : (
                    "Enviar postulación"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Aviso de privacidad */}
        <p className="mt-4 text-center text-xs text-slate-400 px-4">
          Tus datos y tu CV se utilizan únicamente para este proceso de selección. No se comparten con terceros.
        </p>
      </div>
    </main>
  );
}
