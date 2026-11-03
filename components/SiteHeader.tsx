import Link from "next/link";
import AuthNav from "@/components/AuthNav";

/** Encabezado del portal público (landing, detalle de búsqueda y postulación). */
export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="text-2xl font-extrabold tracking-tight">
          <span className="text-brand-400">Reply</span>
          <span className="text-brand-600">Hire</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm font-medium sm:gap-2">
          <Link href="/#busquedas" className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900">
            Búsquedas
          </Link>
          <Link
            href="/#como-funciona"
            className="hidden rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 sm:block"
          >
            Cómo funciona
          </Link>
          <Link
            href="/login"
            className="hidden rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 md:block"
          >
            Soy reclutador
          </Link>
          <AuthNav />
        </nav>
      </div>
    </header>
  );
}
