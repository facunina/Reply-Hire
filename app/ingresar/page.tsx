"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type Modo = "ingresar" | "registro";

/** Sólo se aceptan destinos internos, para que `?next=` no pueda redirigir a otro sitio. */
function destinoSeguro(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}

/** Traduce los errores de Supabase Auth a mensajes claros en español. */
function traducirError(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes("invalid login credentials")) return "Email o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Todavía no confirmaste tu email. Revisá tu casilla y abrí el link que te enviamos.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Ya existe una cuenta con ese email. Iniciá sesión.";
  if (m.includes("password should be at least")) return "La contraseña debe tener al menos 6 caracteres.";
  if (m.includes("rate limit") || m.includes("security purposes")) return "Demasiados intentos seguidos. Esperá un minuto y volvé a probar.";
  if (m.includes("invalid") && m.includes("email")) return "Ingresá un email válido.";
  if (m.includes("signups not allowed")) return "El registro de cuentas está deshabilitado.";
  return "No pudimos completar la operación: " + mensaje;
}

const CAMPO =
  "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30";

export default function IngresarPage() {
  const [modo, setModo] = useState<Modo>("ingresar");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [next, setNext] = useState("/");

  // El formulario se renderiza sólo en el cliente (mismo criterio que /postular:
  // los gestores de contraseñas inyectan nodos en los <input> antes de hidratar).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const destino = destinoSeguro(params.get("next"));
    setNext(destino);
    if (params.get("modo") === "registro") setModo("registro");
    setMounted(true);

    // Si ya hay sesión, no tiene sentido mostrar el formulario.
    getSupabaseBrowser()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) window.location.replace(destino);
      });
  }, []);

  const cambiarModo = (m: Modo) => {
    setModo(m);
    setError("");
    setAviso("");
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setAviso("");

    if (modo === "registro" && !nombre.trim()) return setError("Ingresá tu nombre.");
    if (!email.trim() || !email.includes("@")) return setError("Ingresá un email válido.");
    if (password.length < 6) return setError("La contraseña debe tener al menos 6 caracteres.");

    setEnviando(true);
    const supabase = getSupabaseBrowser();
    try {
      if (modo === "ingresar") {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) return setError(traducirError(err.message));
        window.location.replace(next);
        return;
      }

      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { nombre: nombre.trim(), telefono: telefono.trim() },
          emailRedirectTo: window.location.origin + next,
        },
      });
      if (err) return setError(traducirError(err.message));

      if (data.session) {
        // Confirmación de email desactivada en Supabase: la cuenta queda lista.
        window.location.replace(next);
        return;
      }
      // Con confirmación activada, Supabase no devuelve error si el email ya
      // existía: devuelve un usuario sin identidades.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        return setError("Ya existe una cuenta con ese email. Iniciá sesión.");
      }
      setAviso("¡Cuenta creada! Te enviamos un email para confirmarla. Abrí el link y después iniciá sesión.");
      setModo("ingresar");
      setPassword("");
    } catch {
      setError("Error de red: no se pudo conectar con el servidor.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 font-sans">
      <SiteHeader />
      <main className="flex-1 px-4 py-10 sm:px-6">
        <div className="mx-auto w-full max-w-md">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            {modo === "ingresar" ? "Ingresá a tu cuenta" : "Creá tu cuenta"}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {next.startsWith("/postular")
              ? "Para postularte necesitás una cuenta. Así podés seguir el estado de tus postulaciones."
              : "Con tu cuenta podés postularte y seguir el estado de tus postulaciones."}
          </p>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            {/* Selector ingresar / crear cuenta */}
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
              {(["ingresar", "registro"] as Modo[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => cambiarModo(m)}
                  aria-pressed={modo === m}
                  className={`rounded-lg py-2 transition-colors ${
                    modo === m ? "bg-white text-brand-600 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {m === "ingresar" ? "Iniciar sesión" : "Crear cuenta"}
                </button>
              ))}
            </div>

            {aviso && (
              <div className="mt-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">{aviso}</div>
            )}
            {error && <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

            {!mounted ? (
              <div className="mt-6 animate-pulse space-y-5">
                <div className="h-10 rounded-lg bg-slate-100" />
                <div className="h-10 rounded-lg bg-slate-100" />
                <div className="h-10 rounded-lg bg-slate-200" />
              </div>
            ) : (
              <form onSubmit={enviar} className="mt-6 space-y-5" noValidate>
                {modo === "registro" && (
                  <>
                    <div>
                      <label htmlFor="reg-nombre" className="block text-sm font-medium text-slate-700">
                        Nombre completo
                      </label>
                      <input
                        id="reg-nombre"
                        type="text"
                        autoComplete="name"
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        placeholder="Juan Pérez"
                        className={CAMPO}
                      />
                    </div>
                    <div>
                      <label htmlFor="reg-telefono" className="block text-sm font-medium text-slate-700">
                        Teléfono <span className="font-normal text-slate-400">(opcional)</span>
                      </label>
                      <input
                        id="reg-telefono"
                        type="tel"
                        autoComplete="tel"
                        value={telefono}
                        onChange={(e) => setTelefono(e.target.value)}
                        placeholder="099 123 456"
                        className={CAMPO}
                      />
                    </div>
                  </>
                )}

                <div>
                  <label htmlFor="auth-email" className="block text-sm font-medium text-slate-700">
                    Email
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="juan.perez@ejemplo.com"
                    className={CAMPO}
                  />
                </div>

                <div>
                  <label htmlFor="auth-password" className="block text-sm font-medium text-slate-700">
                    Contraseña
                  </label>
                  <input
                    id="auth-password"
                    type="password"
                    autoComplete={modo === "ingresar" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={modo === "registro" ? "Mínimo 6 caracteres" : "••••••••"}
                    className={CAMPO}
                  />
                </div>

                <button
                  type="submit"
                  disabled={enviando}
                  className={`flex w-full justify-center rounded-xl px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors ${
                    enviando ? "cursor-not-allowed bg-brand-400" : "bg-brand-600 hover:bg-brand-700"
                  }`}
                >
                  {enviando ? "Un momento…" : modo === "ingresar" ? "Iniciar sesión" : "Crear cuenta"}
                </button>
              </form>
            )}
          </div>

          <p className="mt-4 text-center text-sm text-slate-500">
            ¿Sos reclutador?{" "}
            <Link href="/login" className="font-semibold text-brand-600 hover:underline">
              Ingresá por acá
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
