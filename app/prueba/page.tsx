import { obtenerCandidatos, type Candidato } from "@/lib/db";

// Página de prueba: lista los registros de la tabla `candidatos` de Supabase.
// Se lee directo desde el servidor en cada visita (sin caché).
export const dynamic = "force-dynamic";

function fecha(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-UY", { dateStyle: "short", timeStyle: "short" });
}

export default async function PruebaPage() {
  let candidatos: Candidato[] = [];
  let error: string | null = null;

  try {
    candidatos = await obtenerCandidatos();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold text-slate-900">Prueba — tabla candidatos</h1>
        <p className="mt-1 text-sm text-slate-600">
          {error ? "No se pudo leer la tabla." : `${candidatos.length} registro(s) en Supabase.`}
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        {!error && candidatos.length === 0 && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
            La tabla está vacía.
          </div>
        )}

        {!error && candidatos.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Teléfono</th>
                  <th className="px-4 py-3">Puesto</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Alerta</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">CV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {candidatos.map((c) => (
                  <tr key={c.id} className="text-slate-800">
                    <td className="px-4 py-3 font-medium">{c.nombre}</td>
                    <td className="px-4 py-3">{c.email}</td>
                    <td className="px-4 py-3">{c.telefono || "—"}</td>
                    <td className="px-4 py-3">{c.puesto || "—"}</td>
                    <td className="px-4 py-3">{c.score ?? "—"}</td>
                    <td className="px-4 py-3">{c.estado || "—"}</td>
                    <td className="px-4 py-3">{c.posible_inyeccion ? "⚠️ Inyección" : "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{fecha(c.creado_a)}</td>
                    <td className="px-4 py-3">
                      {c.cv_url ? (
                        <a href={`/api/candidato/cv?id=${c.id}`} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                          PDF
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
