"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { rolDeUsuario } from "@/lib/roles";

/** Sólo se aceptan destinos internos, para que `?next=` no pueda redirigir a otro sitio. */
function destinoSeguro(next: string | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}

/**
 * Login del EQUIPO (reclutador / admin) con Supabase Auth. Es la misma
 * autenticación que usan los candidatos; lo que cambia es el rol de la cuenta
 * (`app_metadata.rol`). Una cuenta sin rol de equipo no puede entrar acá.
 */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [next, setNext] = useState<string | null>(null);

  useEffect(() => {
    setNext(destinoSeguro(new URLSearchParams(window.location.search).get("next")));
  }, []);

  const handleIngresar = async () => {
    setError("");
    if (!email.trim() || !password) {
      setError("Completá email y contraseña.");
      return;
    }
    setEnviando(true);
    try {
      const supabase = getSupabaseBrowser();
      const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err || !data.user) {
        setError(
          err?.message.toLowerCase().includes("invalid login credentials")
            ? "Email o contraseña incorrectos."
            : "No pudimos iniciar sesión: " + (err?.message || "error desconocido")
        );
        return;
      }

      const rol = rolDeUsuario(data.user);
      if (!rol) {
        // Cuenta de candidato: no tiene acceso al panel del equipo.
        await supabase.auth.signOut();
        setError("Esta cuenta no tiene acceso de reclutador. Si sos candidato, ingresá desde el portal.");
        return;
      }

      const inicio = rol === "admin" ? "/admin" : "/dashboard";
      // El reclutador no puede volver a una zona de admin.
      const destino = next && !(rol !== "admin" && next.startsWith("/admin")) ? next : inicio;
      window.location.href = destino;
    } catch {
      setError("Error de red: no se pudo conectar con el servidor.");
    } finally {
      setEnviando(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleIngresar();
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <h1 className="text-4xl font-extrabold tracking-tight">
          <span className="text-slate-900">Reply</span>
          <span className="text-blue-600">Hire</span>
        </h1>
        <p className="mt-2 text-sm text-slate-600 font-medium">Acceso para el equipo de reclutamiento</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl rounded-2xl border border-slate-100 sm:px-10">
          {error && (
            <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600 flex items-start space-x-2">
              <svg className="w-5 h-5 flex-shrink-0 text-red-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Email
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoComplete="username"
                  placeholder="reclutador@empresa.com"
                  className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm text-slate-900"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Contraseña
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm text-slate-900"
                />
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={handleIngresar}
                disabled={enviando}
                className={`w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                  enviando ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {enviando ? "Ingresando..." : "Ingresar"}
              </button>
            </div>
          </div>
        </div>
        <p className="mt-4 text-center text-sm text-slate-500">
          ¿Sos candidato?{" "}
          <a href="/ingresar" className="font-semibold text-blue-600 hover:underline">
            Ingresá desde el portal
          </a>
        </p>
      </div>
    </main>
  );
}
