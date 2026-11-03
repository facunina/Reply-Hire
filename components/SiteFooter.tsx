import Link from "next/link";

/** Pie del portal público. */
export default function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          <span className="font-bold text-brand-400">Reply</span>
          <span className="font-bold text-brand-600">Hire</span> — Empresa Demo
        </p>
        <p>
          Tus datos y tu CV se usan únicamente para el proceso de selección.{" "}
          <Link href="/login" className="font-medium text-slate-700 underline hover:text-brand-700">
            Acceso reclutadores
          </Link>
        </p>
      </div>
    </footer>
  );
}
