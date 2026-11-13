"use client";

import { useState, useEffect } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { nivelPuntaje } from "@/lib/puntaje";

// ─── Tipos de la respuesta de /api/admin/metricas ────────────────────────────
interface Conexion {
  totalLlamadas: number;
  llamadasFallidas: number;
  porcentajeError: number;
  latenciaPromedio: number;
}
interface Metricas {
  seguridad: {
    ia: Conexion;
    email: Conexion;
    bdd: Conexion;
    alertasSeguridad: number;
    posiblesInyecciones: number;
  };
  experiencia: {
    paginasVistas: number;
    postulacionesRecibidas: number;
    tasaConversion: number;
    tasaAbandono: number;
    decisiones: {
      total: number;
      avanzadosEntrevista: number;
      rechazadosCv: number;
      rechazadosEntrevista: number;
      seleccionados: number;
    };
  };
  uso: {
    postulacionesPorPuesto: Record<string, number>;
    scorePromedioPorPuesto: Record<string, number>;
    distribucionScores: { bajo: number; medio: number; alto: number };
    tiempoPromedioDecision: number;
  };
  eventosRecientes: { tipo: string; detalle: string; metadata: any; created_at: string }[];
}

// ─── Helpers de fechas ───────────────────────────────────────────────────────
const fmtFecha = (d: Date) => d.toISOString().slice(0, 10);
const rangoDias = (dias: number) => {
  const hoy = new Date();
  const desde = new Date(hoy.getTime() - dias * 86400000);
  return { desde: fmtFecha(desde), hasta: fmtFecha(hoy) };
};

const TIPOS_EVENTO = [
  { v: "todos", label: "Todos" },
  { v: "postulacion_recibida", label: "Postulación" },
  { v: "feedback_generado", label: "Feedback" },
  { v: "email_feedback", label: "Email feedback" },
  { v: "email_confirmacion", label: "Email confirmación" },
  { v: "decision_reclutador", label: "Decisión" },
  { v: "pagina_vista", label: "Página vista" },
  { v: "alerta_seguridad", label: "Alerta seguridad" },
  { v: "llamada_ia", label: "Llamada IA" },
  { v: "puesto_creado", label: "Puesto creado" },
];

// ─── Diccionario de métricas (contenido del modal de ayuda) ──────────────────
interface DefMetrica {
  nombre: string;
  queCalcula: string;
  comoSeCalcula: string;
  rangoNormal: string;
  ejemplo: string;
}
const DICCIONARIO: { seccion: string; metricas: DefMetrica[] }[] = [
  {
    seccion: "Seguridad y Conexiones",
    metricas: [
      {
        nombre: "Total de llamadas a IA",
        queCalcula: "Cantidad total de veces que se llamó al servicio de IA (extracción, scoring, feedback).",
        comoSeCalcula: 'Conteo de eventos tipo "llamada_ia" en la tabla de eventos.',
        rangoNormal: "> 0. A mayor volumen, mejor uso del sistema.",
        ejemplo: "124 llamadas en 7 días.",
      },
      {
        nombre: "% Error en IA",
        queCalcula: "Porcentaje de llamadas a IA que fallaron.",
        comoSeCalcula: "(llamadas_fallidas_ia / total_llamadas_ia) × 100.",
        rangoNormal: "< 5%. Si supera 10%, hay alerta.",
        ejemplo: "2% de error (2 fallos de 100 llamadas).",
      },
      {
        nombre: "Latencia promedio IA (ms)",
        queCalcula: "Tiempo promedio que tarda una llamada a IA en responder.",
        comoSeCalcula: 'Promedio de latencia_ms registrado en eventos de tipo "llamada_ia".',
        rangoNormal: "500-2000 ms. Mayor latencia = sistema más lento.",
        ejemplo: "850 ms (menos de 1 segundo).",
      },
      {
        nombre: "Total de llamadas a Email",
        queCalcula: "Cantidad total de emails enviados (confirmación + feedback).",
        comoSeCalcula: 'Conteo de eventos tipo "email_confirmacion" y "email_feedback".',
        rangoNormal: "> 0. Debe ser proporcional a postulaciones.",
        ejemplo: "45 emails en 7 días.",
      },
      {
        nombre: "% Error en Email",
        queCalcula: "Porcentaje de emails que no se enviaron correctamente.",
        comoSeCalcula: "(emails_fallidos / total_emails) × 100.",
        rangoNormal: "< 5%. Si supera 10%, hay problema con Resend.",
        ejemplo: "2% de error.",
      },
      {
        nombre: "Total de operaciones en Base de Datos",
        queCalcula: "Cantidad total de operaciones (inserts, updates, reads) en Supabase.",
        comoSeCalcula: 'Conteo de eventos tipo "postulacion_recibida", "feedback_generado", "decision_reclutador", etc.',
        rangoNormal: "> 0. Debe correlacionar con actividad del sistema.",
        ejemplo: "450 operaciones en 7 días.",
      },
      {
        nombre: "% Error en Base de Datos",
        queCalcula: "Porcentaje de operaciones a la base de datos que fallaron.",
        comoSeCalcula: "(operaciones_fallidas / total_operaciones) × 100.",
        rangoNormal: "0% (idealmente). Si > 5%, hay problema crítico.",
        ejemplo: "0% (sin errores).",
      },
      {
        nombre: "Alertas de Seguridad",
        queCalcula: "Cantidad de CVs o acciones marcados como sospechosos.",
        comoSeCalcula: 'Conteo de eventos tipo "alerta_seguridad".',
        rangoNormal: "0 o muy bajo. Si > 0, revisar los eventos recientes.",
        ejemplo: "1 alerta en 7 días.",
      },
      {
        nombre: "Posibles inyecciones detectadas",
        queCalcula: "Cantidad de CVs que contienen patrones típicos de inyección de prompts.",
        comoSeCalcula: "Eventos donde metadata.posible_inyeccion === true.",
        rangoNormal: "0. Si > 0, es un intento de ataque (aunque el sistema está protegido).",
        ejemplo: "0 en 7 días.",
      },
    ],
  },
  {
    seccion: "Experiencia del Cliente",
    metricas: [
      {
        nombre: "Páginas vistas del portal",
        queCalcula: "Cantidad de veces que alguien accedió a /postular.",
        comoSeCalcula: 'Conteo de eventos tipo "pagina_vista" con pagina === "portal".',
        rangoNormal: "> postulaciones. Si pocas vistas, hay problema de difusión.",
        ejemplo: "320 vistas en 7 días.",
      },
      {
        nombre: "Postulaciones recibidas",
        queCalcula: "Cantidad de CVs que se subieron exitosamente.",
        comoSeCalcula: 'Conteo de eventos tipo "postulacion_recibida".',
        rangoNormal: 'Depende del volumen de tráfico. Mínimo 1 es "el sistema funciona".',
        ejemplo: "85 postulaciones en 7 días.",
      },
      {
        nombre: "Tasa de conversión (%)",
        queCalcula: "Porcentaje de visitantes al portal que se postularon.",
        comoSeCalcula: "(postulaciones / vistas) × 100.",
        rangoNormal: "10-40% es saludable. Menos del 10% indica fricción en el portal.",
        ejemplo: "26.6% (de 320 vistas, 85 se postularon).",
      },
      {
        nombre: "Tasa de abandono (%)",
        queCalcula: "Porcentaje de visitantes que NO se postularon.",
        comoSeCalcula: "100 - tasa_conversion.",
        rangoNormal: "60-90%. Si es muy baja, la conversión es muy alta; si es muy alta, hay problema.",
        ejemplo: "73.4% (de 320 vistas, 235 no se postularon).",
      },
      {
        nombre: "Decisiones tomadas (total)",
        queCalcula: "Cantidad total de decisiones que tomó el reclutador.",
        comoSeCalcula: 'Conteo de eventos tipo "decision_reclutador".',
        rangoNormal: "> 0. Idealmente cercano al número de postulaciones.",
        ejemplo: "42 decisiones en 7 días (de 85 postulaciones).",
      },
      {
        nombre: "% Rechazados post-CV",
        queCalcula: "Porcentaje de candidatos rechazados en fase 1 (después de revisar el CV).",
        comoSeCalcula: "(rechazados_fase1 / decisiones_totales) × 100.",
        rangoNormal: "20-50%. Si es muy bajo, el reclutador es muy permisivo; si es muy alto, el sistema es muy restrictivo.",
        ejemplo: "28% (12 de 42 decisiones fueron rechazo en fase 1).",
      },
      {
        nombre: "% Avanzados a entrevista",
        queCalcula: "Porcentaje de candidatos que pasaron fase 1 y avanzan a entrevista.",
        comoSeCalcula: "(avanzados_entrevista / decisiones_totales) × 100.",
        rangoNormal: "30-70%. Si es bajo, muchos rechazos; si es muy alto, bajo filtrado.",
        ejemplo: "67% (28 de 42 candidatos avanzan a entrevista).",
      },
      {
        nombre: "% Rechazados post-entrevista",
        queCalcula: "Porcentaje de candidatos rechazados después de la entrevista (fase 2).",
        comoSeCalcula: "(rechazados_fase2 / decisiones_totales) × 100.",
        rangoNormal: "Variable según la empresa. Entre 0-50%.",
        ejemplo: "5% (2 de 42 fueron rechazados post-entrevista).",
      },
      {
        nombre: "% Seleccionados",
        queCalcula: "Porcentaje de candidatos seleccionados (oferta de trabajo).",
        comoSeCalcula: "(seleccionados / decisiones_totales) × 100.",
        rangoNormal: "0-30%. Si es 0, no hay contrataciones; si es alto, hay demanda.",
        ejemplo: "0% (0 seleccionados en este período).",
      },
    ],
  },
  {
    seccion: "Uso y Segmentación",
    metricas: [
      {
        nombre: "Postulaciones por puesto",
        queCalcula: "Distribución de cuántos CVs llegaron para cada puesto abierto.",
        comoSeCalcula: 'Conteo de eventos tipo "postulacion_recibida" agrupado por metadata.puesto.',
        rangoNormal: "Depende de la difusión de cada puesto. Se muestra por puesto.",
        ejemplo: "Marketing Digital: 45, Desarrollo: 25, Diseño: 15.",
      },
      {
        nombre: "Score promedio por puesto",
        queCalcula: "Calidad promedio de candidatos por puesto (promedio de sus scores).",
        comoSeCalcula: 'Promedio de metadata.score en eventos de "postulacion_recibida" agrupado por puesto.',
        rangoNormal: "0-100. Puestos especializados suelen tener scores más altos.",
        ejemplo: "Marketing: 71, Dev: 68, Diseño: 74.",
      },
      {
        nombre: "Distribución de scores (Bajo/Medio/Alto)",
        queCalcula: "Qué porcentaje de candidatos cae en cada rango de compatibilidad.",
        comoSeCalcula: "Bajo (0-39): conteo / total × 100 · Medio (40-69): conteo / total × 100 · Alto (70-100): conteo / total × 100.",
        rangoNormal: 'Varía según la calidad del mercado. Una distribución "sana" es 20-30% bajo, 50% medio, 20-30% alto.',
        ejemplo: "Bajo: 18%, Medio: 52%, Alto: 30%.",
      },
      {
        nombre: "Tiempo promedio de decisión",
        queCalcula: "Cuánto tarda en promedio el reclutador desde que recibe un CV hasta tomar una decisión.",
        comoSeCalcula: "Promedio de (fecha_decision - fecha_postulacion) para todos los candidatos con decisión.",
        rangoNormal: "1-7 días. Si es muy bajo, el reclutador no revisa bien; si es muy alto, hay embotellamiento.",
        ejemplo: "2.3 días promedio.",
      },
    ],
  },
];

export default function AdminPage() {
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  // Filtros
  const [filtroFechas, setFiltroFechas] = useState("7d"); // 1d | 7d | 30d | custom
  const [fechaDesde, setFechaDesde] = useState(() => rangoDias(7).desde);
  const [fechaHasta, setFechaHasta] = useState(() => rangoDias(7).hasta);
  const [filtroPuesto, setFiltroPuesto] = useState("todos");
  const [filtroTipoEvento, setFiltroTipoEvento] = useState("todos");
  const [granularidad, setGranularidad] = useState("dia"); // hora | dia | semana
  const [puestos, setPuestos] = useState<string[]>([]);
  const [mostrarDiccionario, setMostrarDiccionario] = useState(false);

  const cargarMetricas = async () => {
    setCargando(true);
    setError("");
    try {
      const params = new URLSearchParams({
        desde: fechaDesde,
        hasta: fechaHasta,
        puesto: filtroPuesto,
        tipo_evento: filtroTipoEvento,
        granularidad,
      });
      const res = await fetch(`/api/admin/metricas?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Mostramos el error REAL del backend (no un mensaje genérico).
        setError(
          data.error
            ? `${data.error}${data.debug ? " — " + data.debug : ""}`
            : `Error ${res.status} al cargar las métricas.`
        );
        setMetricas(null);
        return;
      }
      setMetricas(data);
    } catch {
      setError("Error de conexión al cargar las métricas.");
      setMetricas(null);
    } finally {
      setCargando(false);
    }
  };

  // Cargar puestos para el filtro (una sola vez).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/puestos");
        const data = await res.json();
        setPuestos((data.puestos || []).map((p: any) => p.nombre).filter(Boolean));
      } catch {
        setPuestos([]);
      }
    })();
  }, []);

  // Recargar automáticamente al montar y al cambiar cualquier filtro.
  useEffect(() => {
    cargarMetricas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaDesde, fechaHasta, filtroPuesto, filtroTipoEvento, granularidad]);

  // ─── Handlers de filtros ───────────────────────────────────────────────────
  const cambiarFechas = (valor: string) => {
    setFiltroFechas(valor);
    if (valor !== "custom") {
      const dias = valor === "1d" ? 1 : valor === "30d" ? 30 : 7;
      const r = rangoDias(dias);
      setFechaDesde(r.desde);
      setFechaHasta(r.hasta);
    }
  };

  const cerrarSesion = async () => {
    try {
      await getSupabaseBrowser().auth.signOut();
    } catch {
      /* ignorar */
    } finally {
      window.location.href = "/login";
    }
  };

  const exportarCSV = () => {
    if (!metricas) return;
    const filas: string[][] = [["Tipo", "Detalle", "Puesto", "Fecha/Hora"]];
    for (const ev of metricas.eventosRecientes) {
      filas.push([ev.tipo, ev.detalle || "", ev.metadata?.puesto || "", ev.created_at]);
    }
    const csv = filas
      .map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "eventos_replyhire.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const pct = (n: number) => `${Math.max(0, Math.min(100, n))}%`;
  const fechaHora = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  // Modal con el diccionario de métricas. Se define acá adentro para cerrar
  // sobre setMostrarDiccionario.
  const ModalDiccionario = () => (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-4/5 h-[90vh] overflow-y-auto">
        {/* Header del modal */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-bold text-slate-900">📖 Diccionario de Métricas</h2>
          <button
            onClick={() => setMostrarDiccionario(false)}
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Contenido: tarjeta por métrica, agrupadas por sección */}
        <div className="p-6 space-y-8">
          {DICCIONARIO.map((sec) => (
            <div key={sec.seccion}>
              <h3 className="text-sm font-bold uppercase tracking-wider text-blue-700 mb-3">{sec.seccion}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sec.metricas.map((m) => (
                  <div key={m.nombre} className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
                    <h4 className="text-base font-bold text-slate-900 mb-2">{m.nombre}</h4>
                    <dl className="space-y-1.5 text-xs">
                      <div>
                        <dt className="font-semibold text-slate-500">Qué calcula</dt>
                        <dd className="text-slate-700">{m.queCalcula}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-500">Cómo se calcula</dt>
                        <dd className="text-slate-700 font-mono bg-slate-50 rounded px-2 py-1">{m.comoSeCalcula}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-500">Rango normal</dt>
                        <dd className="text-slate-700">{m.rangoNormal}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-500">Ejemplo</dt>
                        <dd className="text-emerald-700 font-medium">{m.ejemplo}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Modal del diccionario de métricas (overlay sobre todo) */}
      {mostrarDiccionario && <ModalDiccionario />}
      {/* ── Header sticky ── */}
      <header className="sticky top-0 z-30 bg-blue-900 text-white py-4 px-4 sm:px-8 flex justify-between items-center gap-4 shadow">
        <h1 className="text-xl md:text-2xl font-extrabold tracking-tight shrink-0">
          Reply<span className="text-blue-300">Hire</span>
        </h1>
        <span className="hidden md:block text-sm font-semibold uppercase tracking-wider text-blue-200">
          Panel de Control
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/api/google/conectar"
            className="text-xs font-semibold text-white bg-blue-700 hover:bg-blue-600 px-3 py-1.5 rounded-lg transition-colors"
            title="Conecta el Google Calendar donde se agendan las entrevistas"
          >
            📅 Conectar Google Calendar
          </a>
          <button
            onClick={() => setMostrarDiccionario(true)}
            className="text-xs font-semibold text-white bg-blue-700 hover:bg-blue-600 px-3 py-1.5 rounded-lg transition-colors"
          >
            📖 Ver diccionario
          </button>
          <button
            onClick={cerrarSesion}
            className="text-xs font-semibold text-white bg-blue-700 hover:bg-blue-600 px-3 py-1.5 rounded-lg transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      {/* ── Barra de filtros ── */}
      <div className="bg-slate-200/70 border-b border-slate-300 px-4 sm:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-end gap-4">
          {/* Rango de fechas */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Rango de fechas</label>
            <div className="flex gap-1">
              {["1d", "7d", "30d", "custom"].map((v) => (
                <button
                  key={v}
                  onClick={() => cambiarFechas(v)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    filtroFechas === v ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-300"
                  }`}
                >
                  {v === "custom" ? "Personalizado" : v}
                </button>
              ))}
            </div>
          </div>

          {/* Pickers si custom */}
          {filtroFechas === "custom" && (
            <div className="flex gap-2 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Desde</label>
                <input
                  type="date"
                  value={fechaDesde}
                  max={fechaHasta}
                  onChange={(e) => setFechaDesde(e.target.value)}
                  className="px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Hasta</label>
                <input
                  type="date"
                  value={fechaHasta}
                  min={fechaDesde}
                  onChange={(e) => setFechaHasta(e.target.value)}
                  className="px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900"
                />
              </div>
            </div>
          )}

          {/* Puesto */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Por puesto</label>
            <select
              value={filtroPuesto}
              onChange={(e) => setFiltroPuesto(e.target.value)}
              className="px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 min-w-[160px]"
            >
              <option value="todos">Todos los puestos</option>
              {puestos.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Tipo de evento */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de evento</label>
            <select
              value={filtroTipoEvento}
              onChange={(e) => setFiltroTipoEvento(e.target.value)}
              className="px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 min-w-[140px]"
            >
              {TIPOS_EVENTO.map((t) => (
                <option key={t.v} value={t.v}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Granularidad */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Granularidad</label>
            <select
              value={granularidad}
              onChange={(e) => setGranularidad(e.target.value)}
              className="px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900"
            >
              <option value="hora">Hora</option>
              <option value="dia">Día</option>
              <option value="semana">Semana</option>
            </select>
          </div>

          {/* Actualizar */}
          <button
            onClick={cargarMetricas}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Actualizar
          </button>
        </div>
      </div>

      {/* ── Contenido ── */}
      <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto space-y-8">
        {cargando ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-3">
            <svg className="animate-spin h-10 w-10 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-lg text-slate-500 font-semibold">Cargando métricas...</span>
          </div>
        ) : error ? (
          <div className="p-5 rounded-xl bg-red-50 border-2 border-red-300 text-sm text-red-700">
            <p className="font-bold mb-1">No se pudieron cargar las métricas</p>
            <p>{error}</p>
          </div>
        ) : metricas ? (
          <>
            {/* ══ SECCIÓN 1 — SALUD DEL SISTEMA ══ */}
            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-4">Salud del Sistema</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {([
                  ["Inteligencia Artificial", metricas.seguridad.ia],
                  ["Email (Resend)", metricas.seguridad.email],
                  ["Base de Datos", metricas.seguridad.bdd],
                ] as [string, Conexion][]).map(([nombre, c]) => {
                  const alerta = c.porcentajeError > 10;
                  return (
                    <div
                      key={nombre}
                      className={`rounded-2xl border shadow-sm p-5 ${alerta ? "bg-red-50 border-red-300" : "bg-white border-slate-200"}`}
                    >
                      <h3 className="text-sm font-bold text-slate-800">{nombre}</h3>
                      <div className="mt-3 space-y-1.5 text-sm">
                        <Linea label="Llamadas" valor={c.totalLlamadas} />
                        <Linea label="Fallos" valor={c.llamadasFallidas} />
                        <div className="flex justify-between">
                          <span className="text-slate-500">% de error</span>
                          <span className={`font-bold ${alerta ? "text-red-600" : "text-slate-900"}`}>{c.porcentajeError}%</span>
                        </div>
                        <Linea label="Latencia prom." valor={`${c.latenciaPromedio} ms`} />
                      </div>
                      {alerta && <p className="mt-3 text-xs font-semibold text-red-600">⚠ Tasa de error elevada</p>}
                    </div>
                  );
                })}

                {/* Alertas de seguridad */}
                <div
                  className={`rounded-2xl border shadow-sm p-5 ${
                    metricas.seguridad.posiblesInyecciones > 0 || metricas.seguridad.alertasSeguridad > 0
                      ? "bg-red-600 border-red-700 text-white"
                      : "bg-white border-slate-200"
                  }`}
                >
                  <h3 className={`text-sm font-bold ${metricas.seguridad.posiblesInyecciones > 0 || metricas.seguridad.alertasSeguridad > 0 ? "text-white" : "text-slate-800"}`}>
                    Alertas de Seguridad
                  </h3>
                  <div className="mt-3 space-y-2">
                    <div>
                      <p className={`text-3xl font-extrabold ${metricas.seguridad.alertasSeguridad > 0 ? "text-white" : "text-slate-900"}`}>
                        {metricas.seguridad.alertasSeguridad}
                      </p>
                      <p className={`text-xs ${metricas.seguridad.alertasSeguridad > 0 ? "text-red-100" : "text-slate-500"}`}>alertas detectadas</p>
                    </div>
                    <div>
                      <p className={`text-2xl font-extrabold ${metricas.seguridad.posiblesInyecciones > 0 ? "text-white" : "text-slate-900"}`}>
                        {metricas.seguridad.posiblesInyecciones}
                      </p>
                      <p className={`text-xs ${metricas.seguridad.posiblesInyecciones > 0 ? "text-red-100" : "text-slate-500"}`}>posibles inyecciones</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ══ SECCIÓN 2 — EXPERIENCIA DEL CLIENTE ══ */}
            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-4">Experiencia del Cliente</h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Tarjeta titulo="Páginas vistas" valor={metricas.experiencia.paginasVistas} />
                <Tarjeta titulo="Postulaciones" valor={metricas.experiencia.postulacionesRecibidas} />
                <Tarjeta titulo="Tasa de conversión" valor={`${metricas.experiencia.tasaConversion}%`} color="text-emerald-600" />
                <Tarjeta titulo="Tasa de abandono" valor={`${metricas.experiencia.tasaAbandono}%`} color="text-amber-600" />
              </div>

              {/* Embudo */}
              <div className="mt-4 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h3 className="text-sm font-bold text-slate-800 mb-3">Embudo de conversión</h3>
                {(() => {
                  const vistas = metricas.experiencia.paginasVistas;
                  const post = metricas.experiencia.postulacionesRecibidas;
                  const dec = metricas.experiencia.decisiones.total;
                  const max = Math.max(vistas, post, dec, 1);
                  const convPct = metricas.experiencia.tasaConversion;
                  const decPct = post ? Math.round((dec / post) * 1000) / 10 : 0;
                  const fila = (label: string, valor: number, sufijo: string, color: string) => (
                    <div className="flex items-center gap-3">
                      <span className="w-32 text-xs text-slate-500 shrink-0">{label}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                        <div className={`h-full ${color}`} style={{ width: pct((valor / max) * 100) }} />
                      </div>
                      <span className="w-24 text-right text-sm font-bold text-slate-900">{valor}{sufijo}</span>
                    </div>
                  );
                  return (
                    <div className="space-y-2">
                      {fila("Páginas vistas", vistas, "", "bg-blue-500")}
                      {fila("Postulaciones", post, ` (${convPct}%)`, "bg-indigo-500")}
                      {fila("Decisiones", dec, ` (${decPct}%)`, "bg-emerald-500")}
                    </div>
                  );
                })()}
              </div>

              {/* Desglose de decisiones */}
              <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Tarjeta titulo="Avanzados a entrevista" valor={metricas.experiencia.decisiones.avanzadosEntrevista} chico />
                <Tarjeta titulo="Rechazados (CV)" valor={metricas.experiencia.decisiones.rechazadosCv} color="text-rose-600" chico />
                <Tarjeta titulo="Rechazados (entrevista)" valor={metricas.experiencia.decisiones.rechazadosEntrevista} color="text-rose-600" chico />
                <Tarjeta titulo="Seleccionados" valor={metricas.experiencia.decisiones.seleccionados} color="text-emerald-600" chico />
              </div>
            </section>

            {/* ══ SECCIÓN 3 — SEGMENTACIÓN Y USO ══ */}
            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-4">Segmentación y Uso</h2>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Postulaciones por puesto */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <h3 className="text-sm font-bold text-slate-800 mb-3">Postulaciones por puesto</h3>
                  {(() => {
                    const ent = Object.entries(metricas.uso.postulacionesPorPuesto);
                    if (ent.length === 0) return <p className="text-xs text-slate-400">Sin datos en este rango.</p>;
                    const max = Math.max(...ent.map(([, n]) => n), 1);
                    return (
                      <div className="space-y-2">
                        {ent.map(([p, n]) => (
                          <div key={p}>
                            <div className="flex justify-between text-xs mb-0.5">
                              <span className="text-slate-600 truncate pr-2">{p}</span>
                              <span className="font-bold text-slate-900">{n}</span>
                            </div>
                            <div className="bg-slate-100 rounded-full h-3 overflow-hidden">
                              <div className="h-full bg-blue-500" style={{ width: pct((n / max) * 100) }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Score promedio por puesto */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <h3 className="text-sm font-bold text-slate-800 mb-3">Score promedio por puesto</h3>
                  {(() => {
                    const ent = Object.entries(metricas.uso.scorePromedioPorPuesto);
                    if (ent.length === 0) return <p className="text-xs text-slate-400">Sin datos en este rango.</p>;
                    return (
                      <div className="space-y-1.5 text-sm">
                        {ent.map(([p, s]) => (
                          <div key={p} className="flex justify-between">
                            <span className="text-slate-600 truncate pr-2">{p}</span>
                            <span className={`font-bold ${{ alto: "text-green-600", medio: "text-yellow-600", bajo: "text-red-600" }[nivelPuntaje(s)]}`}>{s}%</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
                    Tiempo promedio de decisión:{" "}
                    <span className="font-bold text-slate-800">
                      {metricas.uso.tiempoPromedioDecision > 0 ? `${metricas.uso.tiempoPromedioDecision} h` : "—"}
                    </span>
                  </div>
                </div>

                {/* Distribución de scores */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <h3 className="text-sm font-bold text-slate-800 mb-3">Distribución de scores</h3>
                  {(() => {
                    const { bajo, medio, alto } = metricas.uso.distribucionScores;
                    const total = bajo + medio + alto;
                    const fila = (label: string, n: number, color: string) => {
                      const porcentaje = total ? Math.round((n / total) * 100) : 0;
                      return (
                        <div>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-slate-600">{label}</span>
                            <span className="font-bold text-slate-900">{n} ({porcentaje}%)</span>
                          </div>
                          <div className="bg-slate-100 rounded-full h-3 overflow-hidden">
                            <div className={`h-full ${color}`} style={{ width: pct(porcentaje) }} />
                          </div>
                        </div>
                      );
                    };
                    return (
                      <div className="space-y-2">
                        {fila("Bajo (0-39)", bajo, "bg-red-500")}
                        {fila("Medio (40-69)", medio, "bg-yellow-500")}
                        {fila("Alto (70-100)", alto, "bg-green-500")}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </section>

            {/* ══ SECCIÓN 4 — EVENTOS RECIENTES ══ */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-900">Eventos Recientes</h2>
                <button
                  onClick={exportarCSV}
                  className="text-xs font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Exportar a CSV
                </button>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {metricas.eventosRecientes.length === 0 ? (
                  <p className="text-xs text-slate-400 p-5">Sin eventos en este rango.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                        <tr>
                          <th className="text-left font-semibold px-4 py-2.5">Tipo</th>
                          <th className="text-left font-semibold px-4 py-2.5">Detalle</th>
                          <th className="text-left font-semibold px-4 py-2.5">Puesto</th>
                          <th className="text-left font-semibold px-4 py-2.5">Fecha / hora</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {metricas.eventosRecientes.map((ev, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-4 py-2.5"><span className="font-semibold text-slate-800">{ev.tipo}</span></td>
                            <td className="px-4 py-2.5 text-slate-600">{ev.detalle || "—"}</td>
                            <td className="px-4 py-2.5 text-slate-600">{ev.metadata?.puesto || "—"}</td>
                            <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{fechaHora(ev.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

// ─── Subcomponentes ──────────────────────────────────────────────────────────
function Linea({ label, valor }: { label: string; valor: number | string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-bold text-slate-900">{valor}</span>
    </div>
  );
}

function Tarjeta({
  titulo,
  valor,
  color = "text-slate-900",
  chico = false,
}: {
  titulo: string;
  valor: number | string;
  color?: string;
  chico?: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{titulo}</p>
      <p className={`mt-2 font-extrabold ${chico ? "text-2xl" : "text-3xl"} ${color}`}>{valor}</p>
    </div>
  );
}
