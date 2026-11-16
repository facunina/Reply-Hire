import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

/** Marco común de las páginas legales (privacidad y términos). */
export default function PaginaLegal({
  titulo,
  actualizada,
  children,
}: {
  titulo: string;
  actualizada: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteHeader />
      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{titulo}</h1>
          <p className="mt-1 text-sm text-slate-500">Última actualización: {actualizada}</p>
          <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-slate-700 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-slate-900 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
            {children}
          </div>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
