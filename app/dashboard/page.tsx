"use client";

import { useState, useEffect } from "react";
import { AREAS, AREA_POR_DEFECTO } from "@/lib/areas";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

interface Candidato {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  puesto: string;
  puesto_id?: string | null;
  cv_texto: string;
  cv_url: string;
  score: number;
  fortalezas: string[];
  brechas: string[];
  resumen: string;
  resumen_evaluacion?: string;
  estado: string;
  feedback: string;
  posible_inyeccion?: boolean;
  mensaje?: string;
  preguntas_entrevista?: string;
  analisis?: string; // procesando | listo | sin_datos | error
  entrevista_inicio?: string | null;
  entrevista_link?: string;
  entrevista_meet?: string;
  guardado?: boolean;
  creado_a?: string;
  fecha_postulacion: string;
  fecha_decision: string | null;
}

/** El análisis con IA corre después de recibir la postulación. Las postulaciones
 *  viejas no tienen este campo: se consideran analizadas. */
const analisisDe = (c: { analisis?: string }) => c.analisis || "listo";

/**
 * Lee la respuesta de una API del panel SIN lanzar nunca, y deja en `error` un
 * mensaje claro para el reclutador según lo que pasó (sesión vencida, permisos,
 * error del servidor con su detalle, respuesta inesperada).
 */
async function leerJSON(res: Response): Promise<any> {
  let data: any = {};
  try {
    data = await res.json();
  } catch {
    // El servidor no devolvió JSON (p. ej. una página de error).
    data = {};
  }
  if (res.ok) return data;

  const detalle = typeof data.error === "string" && data.error ? data.error : "";
  if (res.status === 401) {
    data.error = "Tu sesión venció o no es válida. Volvé a iniciar sesión (Cerrar sesión → Ingresar).";
  } else if (res.status === 403) {
    data.error = "Tu usuario no tiene permiso para hacer esto." + (detalle ? ` (${detalle})` : "");
  } else if (res.status >= 500) {
    data.error = detalle
      ? `Error del servidor: ${detalle}`
      : `Error del servidor (código ${res.status}). Revisá la consola del servidor para ver el detalle.`;
  } else {
    data.error = detalle || `La solicitud no se pudo completar (código ${res.status}).`;
  }
  return data;
}

interface PreguntaEntrevista {
  pregunta: string;
  objetivo: string;
  tipo: string;
}

/** Lee las preguntas guardadas en el candidato (texto JSON) sin romper si viene vacío o mal formado. */
function leerPreguntas(texto?: string): PreguntaEntrevista[] {
  if (!texto) return [];
  try {
    const v = JSON.parse(texto);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

interface Puesto {
  id: string;
  nombre: string;
  activo?: boolean;
  sobre_nosotros?: string;
  mision?: string;
  actividades?: string;
  requisitos?: string;
  modalidad?: string;
  beneficios?: string;
  salario?: string;
}

// Formulario de creación de puesto en blanco (las 7 secciones de la búsqueda).
const PUESTO_VACIO = {
  nombre: "",
  area: AREA_POR_DEFECTO as string,
  sobre_nosotros: "",
  mision: "",
  actividades: "",
  requisitos: "",
  modalidad: "",
  beneficios: "",
};

export default function DashboardPage() {
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [seleccionado, setSeleccionado] = useState<Candidato | null>(null);
  const [feedback, setFeedback] = useState("");
  const [generando, setGenerando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [mensajeOk, setMensajeOk] = useState("");
  const [cargando, setCargando] = useState(true);
  // Id del puesto cuya pestaña está abierta ("" hasta que cargan los puestos).
  // Se usa el id (no el nombre) porque puede haber búsquedas con el mismo nombre.
  const [puestoActivo, setPuestoActivo] = useState<string>("");

  // Formulario para agendar la entrevista en Google Calendar.
  const [agenda, setAgenda] = useState({ fecha: "", hora: "10:00", duracion: "45", conMeet: true, invitados: "" });
  const [agendando, setAgendando] = useState(false);

  const [reanalizando, setReanalizando] = useState(false);

  // Preguntas de entrevista generadas por la IA, por id de candidato.
  const [preguntas, setPreguntas] = useState<Record<string, PreguntaEntrevista[]>>({});
  const [generandoPreguntas, setGenerandoPreguntas] = useState(false);

  // Puestos (búsquedas) y formulario de creación
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [nuevoPuesto, setNuevoPuesto] = useState(PUESTO_VACIO);
  const [guardandoPuesto, setGuardandoPuesto] = useState(false);
  const [errorPuesto, setErrorPuesto] = useState("");
  const [okPuesto, setOkPuesto] = useState("");

  // Vista de candidatos: 'todos' (principales, no guardados) o 'guardados'.
  // todos = búsquedas abiertas · guardados = candidatos guardados · cerradas = búsquedas cerradas (histórico)
  const [vista, setVista] = useState<"todos" | "guardados" | "cerradas">("todos");
  const [candidatosGuardados, setCandidatosGuardados] = useState<Candidato[]>([]);
  // Mensaje flash (verde/rojo) que se autodescarta a los 3 segundos.
  const [flash, setFlash] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);

  const cargarCandidatos = async () => {
    try {
      const res = await fetch("/api/candidatos");
      const data = await leerJSON(res);
      const lista: Candidato[] = data.candidatos || [];
      // Separamos: la vista principal sólo muestra los NO guardados.
      setCandidatos(lista.filter((c) => !c.guardado));
      setCandidatosGuardados(lista.filter((c) => c.guardado === true));
    } catch (error) {
      console.error("Error al cargar candidatos:", error);
    } finally {
      setCargando(false);
    }
  };

  const mostrarFlash = (texto: string, tipo: "ok" | "error") => {
    setFlash({ texto, tipo });
    setTimeout(() => setFlash(null), 3000);
  };

  const cargarPuestos = async () => {
    try {
      const res = await fetch("/api/puestos?todas=1");
      const data = await leerJSON(res);
      const lista: Puesto[] = data.puestos || [];
      setPuestos(lista);
      // Si la pestaña abierta ya no corresponde a una búsqueda vigente (o es la
      // primera carga), se abre la primera búsqueda.
      setPuestoActivo((actual) =>
        lista.some((p) => p.id === actual) ? actual : lista.find((p) => p.activo !== false)?.id || ""
      );
    } catch (error) {
      console.error("Error al cargar puestos:", error);
    }
  };

  // Mientras haya postulaciones en análisis, se recarga la lista cada 4 s para
  // mostrar el resultado de la IA apenas esté (y el detalle abierto también).
  const hayAnalizando = candidatos.some((c) => analisisDe(c) === "procesando");
  useEffect(() => {
    if (!hayAnalizando) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch("/api/candidatos");
        const data = await leerJSON(res);
        const lista: Candidato[] = data.candidatos || [];
        setCandidatos(lista.filter((c) => !c.guardado));
        setCandidatosGuardados(lista.filter((c) => c.guardado === true));
        setSeleccionado((prev) => (prev ? lista.find((c) => c.id === prev.id) || prev : prev));
      } catch {
        /* se reintenta en el próximo ciclo */
      }
    }, 4000);
    return () => clearInterval(t);
  }, [hayAnalizando]);

  useEffect(() => {
    cargarCandidatos();
    cargarPuestos();
    // Registramos la vista del dashboard (no bloqueante).
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pagina: "dashboard" }),
    }).catch(() => {});
  }, []);

  const agendarEntrevista = async (id: string) => {
    if (!agenda.fecha || !agenda.hora) {
      mostrarFlash("Elegí fecha y hora de la entrevista.", "error");
      return;
    }
    setAgendando(true);
    try {
      const res = await fetch("/api/agendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          inicio: `${agenda.fecha}T${agenda.hora}`,
          duracion: Number(agenda.duracion),
          conMeet: agenda.conMeet,
          invitados: agenda.invitados.split(/[,;\s]+/).filter(Boolean),
        }),
      });
      const data = await leerJSON(res);
      if (!res.ok || data.error) {
        mostrarFlash(data.error || "No se pudo agendar la entrevista.", "error");
        return;
      }
      const cambios = { entrevista_inicio: data.inicio, entrevista_link: data.link, entrevista_meet: data.meet };
      setCandidatos((prev) => prev.map((c) => (c.id === id ? { ...c, ...cambios } : c)));
      setSeleccionado((prev) => (prev && prev.id === id ? { ...prev, ...cambios } : prev));
      mostrarFlash(
        data.reprogramada ? "Entrevista reprogramada: se avisó por mail a los invitados." : "Entrevista agendada: se envió la invitación por mail.",
        "ok"
      );
    } catch {
      mostrarFlash("Error de red al agendar la entrevista.", "error");
    } finally {
      setAgendando(false);
    }
  };

  const reanalizar = async (id: string) => {
    setReanalizando(true);
    try {
      const res = await fetch("/api/candidato/reanalizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await leerJSON(res);
      if (!res.ok || data.error) {
        mostrarFlash(data.error || "No se pudo reintentar el análisis.", "error");
        return;
      }
      await cargarCandidatos();
      if (data.candidato) setSeleccionado((prev) => (prev && prev.id === id ? data.candidato : prev));
      mostrarFlash(data.analisis === "listo" ? "Análisis completado." : "La IA volvió a fallar. Probá de nuevo en un rato.", data.analisis === "listo" ? "ok" : "error");
    } catch {
      mostrarFlash("Error de red al reintentar el análisis.", "error");
    } finally {
      setReanalizando(false);
    }
  };

  const generarPreguntas = async (id: string) => {
    setGenerandoPreguntas(true);
    try {
      const res = await fetch("/api/preguntas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await leerJSON(res);
      if (!res.ok || data.error) {
        mostrarFlash(data.error || "No se pudieron generar las preguntas.", "error");
        return;
      }
      setPreguntas((prev) => ({ ...prev, [id]: data.preguntas }));
      if (!data.guardadas) {
        mostrarFlash("Preguntas generadas (no se guardaron: falta actualizar la base).", "error");
      }
    } catch {
      mostrarFlash("Error de red al generar las preguntas.", "error");
    } finally {
      setGenerandoPreguntas(false);
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

  // Guarda un candidato para futuras búsquedas (guardado = true).
  const guardarCandidato = async (id: string) => {
    try {
      const res = await fetch("/api/candidato/actualizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, guardado: true }),
      });
      const data = await leerJSON(res);
      if (res.ok && data.ok) {
        await cargarCandidatos();
        setSeleccionado((prev) => (prev && prev.id === id ? { ...prev, guardado: true } : prev));
        mostrarFlash("Candidato guardado para futuras búsquedas", "ok");
      } else {
        mostrarFlash(data.error || "No se pudo guardar el candidato.", "error");
      }
    } catch (error) {
      console.error("Error al guardar candidato:", error);
      mostrarFlash("Error de conexión al guardar.", "error");
    }
  };

  // Elimina un candidato de forma permanente (con confirmación).
  const eliminarCandidato = async (id: string) => {
    if (!window.confirm("¿Eliminás este candidato permanentemente? Esta acción no se puede deshacer.")) {
      return;
    }
    try {
      const res = await fetch("/api/candidato/eliminar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await leerJSON(res);
      if (res.ok && data.ok) {
        await cargarCandidatos();
        setSeleccionado((prev) => (prev && prev.id === id ? null : prev));
        mostrarFlash("Candidato eliminado", "error");
      } else {
        mostrarFlash("No se pudo eliminar el candidato.", "error");
      }
    } catch (error) {
      console.error("Error al eliminar candidato:", error);
      mostrarFlash("Error de conexión al eliminar.", "error");
    }
  };

  const cambiarVista = (v: "todos" | "guardados" | "cerradas") => {
    setVista(v);
    // Al pasar entre abiertas y cerradas se abre la primera búsqueda de esa lista.
    if (v !== "guardados") {
      const lista = puestos.filter((p) => (v === "cerradas" ? p.activo === false : p.activo !== false));
      setPuestoActivo(lista[0]?.id || "");
    }
    setSeleccionado(null);
    setFeedback("");
    setMensajeOk("");
  };

  const cambiarEstadoBusqueda = async (puesto: Puesto, activo: boolean) => {
    const pregunta = activo
      ? `¿Reabrir "${puesto.nombre}"? Va a volver a verse en el portal y a recibir postulaciones.`
      : `¿Cerrar "${puesto.nombre}"? Deja de verse en el portal y nadie más se puede postular. Los candidatos quedan guardados en "Cerradas".`;
    if (!window.confirm(pregunta)) return;
    try {
      const res = await fetch("/api/puestos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: puesto.id, activo }),
      });
      const data = await leerJSON(res);
      if (!res.ok || data.error) {
        mostrarFlash(data.error || "No se pudo actualizar la búsqueda.", "error");
        return;
      }
      setPuestos((prev) => prev.map((p) => (p.id === puesto.id ? { ...p, activo } : p)));
      setSeleccionado(null);
      // Se vuelve a la lista donde quedó la búsqueda, con esa pestaña abierta.
      setVista(activo ? "todos" : "cerradas");
      setPuestoActivo(puesto.id);
      mostrarFlash(activo ? `"${puesto.nombre}" se reabrió.` : `"${puesto.nombre}" se cerró. La encontrás en "Cerradas".`, "ok");
    } catch {
      mostrarFlash("No se pudo conectar con el servidor.", "error");
    }
  };

  const crearPuesto = async () => {
    setErrorPuesto("");
    if (!nuevoPuesto.nombre.trim()) {
      setErrorPuesto("El nombre del puesto es obligatorio.");
      return;
    }
    setGuardandoPuesto(true);
    try {
      const res = await fetch("/api/puestos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nuevoPuesto),
      });
      const data = await leerJSON(res);
      if (res.ok && data.ok) {
        setModalAbierto(false);
        setNuevoPuesto(PUESTO_VACIO);
        await cargarPuestos();
        setOkPuesto(`Puesto "${data.puesto?.nombre || nuevoPuesto.nombre}" creado correctamente.`);
      } else {
        setErrorPuesto(data.error || "No se pudo crear el puesto.");
      }
    } catch (error) {
      console.error("Error al crear puesto:", error);
      setErrorPuesto("No se pudo conectar con el servidor. Verificá que la app esté corriendo y volvé a intentar.");
    } finally {
      setGuardandoPuesto(false);
    }
  };

  const seleccionarCandidato = (c: Candidato) => {
    setSeleccionado(c);
    setFeedback(c.feedback || "");
    setMensajeOk("");
  };

  const generarFeedback = async (tipo: "cv" | "entrevista") => {
    if (!seleccionado) return;
    setGenerando(true);
    setFeedback("");
    setMensajeOk("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: seleccionado.id, tipo }),
      });
      const data = await leerJSON(res);
      if (data.feedback) {
        setFeedback(data.feedback);
      } else if (data.error) {
        setFeedback("Error de IA: " + data.error);
      }
    } catch (error) {
      console.error("Error al generar feedback:", error);
      setFeedback("Ocurrió un error de conexión al generar el feedback.");
    } finally {
      setGenerando(false);
    }
  };

  const enviarFeedback = async (estadoFinal: "rechazado_cv" | "rechazado_entrevista") => {
    if (!seleccionado) return;
    // Confirmación antes de una acción irreversible (envío de email al candidato).
    if (!window.confirm("¿Confirmás el envío de este email al candidato? Esta acción no se puede deshacer.")) {
      return;
    }
    setEnviando(true);
    setMensajeOk("");
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: seleccionado.id, feedback, estadoFinal }),
      });
      const data = await leerJSON(res);
      if (res.ok && data.ok) {
        setMensajeOk(data.mensaje || "Email enviado correctamente.");
        await cargarCandidatos();
        setSeleccionado((prev) => (prev ? { ...prev, estado: estadoFinal, feedback } : null));
      } else {
        setMensajeOk("Error: " + (data.error || "No se pudo enviar el correo."));
      }
    } catch (error) {
      console.error("Error al enviar email:", error);
      setMensajeOk("Error: Ocurrió un error de conexión al enviar el correo.");
    } finally {
      setEnviando(false);
    }
  };

  const cambiarEstado = async (nuevoEstado: "en_entrevista" | "seleccionado") => {
    if (!seleccionado) return;
    // Al seleccionar a alguien, la búsqueda se cierra: ya se cubrió el puesto.
    const puestoDelCandidato = puestos.find((p) => esDelPuesto(seleccionado, p));
    if (
      nuevoEstado === "seleccionado" &&
      !window.confirm(
        `Vas a seleccionar a ${seleccionado.nombre}.` +
          (puestoDelCandidato && puestoDelCandidato.activo !== false
            ? `\n\nLa búsqueda "${puestoDelCandidato.nombre}" se va a cerrar: deja de verse en el portal y no recibe más postulaciones. Si necesitás más personas, la podés reabrir desde "Cerradas".`
            : "")
      )
    ) {
      return;
    }
    setMensajeOk("");
    try {
      const res = await fetch("/api/estado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: seleccionado.id, estado: nuevoEstado }),
      });
      const data = await leerJSON(res);
      if (res.ok && data.ok) {
        const msg = nuevoEstado === "en_entrevista"
          ? "Candidato avanzado a fase de entrevista."
          : "Candidato marcado como Seleccionado exitosamente.";
        setMensajeOk(msg);
        await cargarCandidatos();
        setSeleccionado((prev) => (prev ? { ...prev, estado: nuevoEstado } : null));
        if (nuevoEstado === "seleccionado" && puestoDelCandidato && puestoDelCandidato.activo !== false) {
          const cerrado = await fetch("/api/puestos", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: puestoDelCandidato.id, activo: false }),
          });
          const r = await leerJSON(cerrado);
          if (cerrado.ok && !r.error) {
            setPuestos((prev) => prev.map((p) => (p.id === puestoDelCandidato.id ? { ...p, activo: false } : p)));
            // La búsqueda pasa a "Cerradas": se sigue mostrando ahí, con el candidato abierto.
            setVista("cerradas");
            setMensajeOk(`Candidato seleccionado. La búsqueda "${puestoDelCandidato.nombre}" quedó cerrada y ya no recibe postulaciones.`);
          } else {
            setMensajeOk(`Candidato seleccionado, pero no se pudo cerrar la búsqueda: ${r.error}`);
          }
        }
      } else {
        setMensajeOk("Error: " + (data.error || "No se pudo actualizar el estado."));
      }
    } catch (error) {
      console.error("Error al cambiar estado:", error);
      setMensajeOk("Error: Ocurrió un error de conexión.");
    }
  };

  const colorBarra = (score: number) => {
    if (score >= 70) return "bg-green-500";
    if (score >= 40) return "bg-yellow-500";
    return "bg-red-500";
  };

  const colorTexto = (score: number) => {
    if (score >= 70) return "text-green-600";
    if (score >= 40) return "text-yellow-600";
    return "text-red-600";
  };

  const etiquetaEstado = (estado: string) => {
    switch (estado) {
      case "pendiente": return "Pendiente de revisión";
      case "en_entrevista": return "En entrevista";
      case "seleccionado": return "Seleccionado";
      case "rechazado_cv": return "Rechazado (CV)";
      case "rechazado_entrevista": return "Rechazado (entrevista)";
      default: return estado;
    }
  };

  const colorBadge = (estado: string) => {
    switch (estado) {
      case "pendiente": return "bg-amber-50 text-amber-700 border-amber-200";
      case "en_entrevista": return "bg-blue-50 text-blue-700 border-blue-200";
      case "seleccionado": return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "rechazado_cv":
      case "rechazado_entrevista":
        return "bg-rose-50 text-rose-700 border-rose-200";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  // Pestañas: sólo las búsquedas vigentes de la tabla `puestos` (las mismas a
  // las que un candidato se puede postular hoy desde el portal).
  const puestosAbiertos = puestos.filter((p) => p.activo !== false);
  const puestosCerrados = puestos.filter((p) => p.activo === false);
  const puestosTabs = vista === "cerradas" ? puestosCerrados : puestosAbiertos;
  const puestoActual = puestos.find((p) => p.id === puestoActivo);

  // Una postulación pertenece a un puesto por su id; las muy viejas (sin
  // puesto_id) se asocian por nombre.
  const esDelPuesto = (c: Candidato, p: Puesto) => (c.puesto_id ? c.puesto_id === p.id : c.puesto === p.nombre);

  // Candidatos del puesto activo.
  const candidatosFiltrados = puestoActual ? candidatos.filter((c) => esDelPuesto(c, puestoActual)) : [];

  const contarPorPuesto = (p: Puesto) => candidatos.filter((c) => esDelPuesto(c, p)).length;

  // Lista que se muestra en la columna izquierda según la vista activa.
  // Principales: filtrada por el puesto activo. Guardados: todos los guardados.
  const listaVisible = vista === "guardados" ? candidatosGuardados : candidatosFiltrados;

  const seleccionarPuesto = (p: string) => {
    setPuestoActivo(p);
    setSeleccionado(null);
    setFeedback("");
    setMensajeOk("");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Mensaje flash (verde al guardar, rojo al eliminar) */}
      {flash && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-lg shadow-lg text-sm font-semibold ${
            flash.tipo === "ok" ? "bg-green-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {flash.texto}
        </div>
      )}

      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 py-4 px-6 md:px-8 flex justify-between items-center gap-4">
        <h1 className="text-2xl font-extrabold tracking-tight shrink-0">
          <span className="text-white">Reply</span>
          <span className="text-blue-400">Hire</span>
        </h1>

        {/* Toggle de vista: principales vs guardados */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => cambiarVista("todos")}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
              vista === "todos" ? "bg-blue-700 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            Candidatos principales ({candidatos.length})
          </button>
          <button
            onClick={() => cambiarVista("guardados")}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
              vista === "guardados" ? "bg-blue-700 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            Guardados ({candidatosGuardados.length})
          </button>
          <button
            onClick={() => cambiarVista("cerradas")}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
              vista === "cerradas" ? "bg-blue-700 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            Cerradas ({puestosCerrados.length})
          </button>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              setErrorPuesto("");
              setNuevoPuesto(PUESTO_VACIO);
              setModalAbierto(true);
            }}
            className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            Crear puesto
          </button>
          <button
            onClick={cargarCandidatos}
            className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Actualizar
          </button>
          <span className="hidden sm:inline text-xs font-semibold uppercase tracking-wider text-slate-400">
            Panel del Reclutador
          </span>
          <button
            onClick={cerrarSesion}
            className="text-xs font-semibold text-slate-200 bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      {/* Pestañas por puesto — solo en la vista principal (los guardados son
          transversales a los puestos, para futuras búsquedas). */}
      {vista !== "guardados" && (
        <div className="bg-white border-b border-slate-200 px-6 md:px-8">
          {vista === "cerradas" && puestosCerrados.length === 0 && (
            <p className="max-w-7xl mx-auto py-3 text-sm text-slate-500">
              No hay búsquedas cerradas. Cuando cierres una, sus candidatos y CVs quedan acá.
            </p>
          )}
          <div className="max-w-7xl mx-auto flex gap-1 overflow-x-auto">
            {puestosTabs.map((p) => {
              const activo = p.id === puestoActivo;
              return (
                <button
                  key={p.id}
                  onClick={() => seleccionarPuesto(p.id)}
                  className={`whitespace-nowrap px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                    activo
                      ? "border-blue-600 text-blue-700"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {p.nombre}
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      activo ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {contarPorPuesto(p)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Barra de la búsqueda abierta: nombre, estado y acciones sobre la búsqueda. */}
      {vista !== "guardados" && puestoActual && (
        <div className="px-6 md:px-8 pt-6">
          <div
            className={`max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border px-5 py-4 ${
              puestoActual.activo === false ? "bg-slate-100 border-slate-200" : "bg-white border-slate-200"
            }`}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 truncate">{puestoActual.nombre}</h2>
                <span
                  className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                    puestoActual.activo === false
                      ? "bg-slate-200 text-slate-600 border-slate-300"
                      : "bg-green-50 text-green-700 border-green-200"
                  }`}
                >
                  {puestoActual.activo === false ? "Cerrada" : "Abierta · recibe postulaciones"}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {contarPorPuesto(puestoActual)} postulación{contarPorPuesto(puestoActual) === 1 ? "" : "es"}
                {puestoActual.activo === false
                  ? " · No se ve en el portal. Los candidatos y CVs quedan guardados acá."
                  : " · Visible en el portal público."}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {puestoActual.activo !== false && (
                <a
                  href={`/puestos/${puestoActual.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-slate-600 hover:text-blue-700 px-3 py-2"
                >
                  Ver en el portal ↗
                </a>
              )}
              <button
                onClick={() => cambiarEstadoBusqueda(puestoActual, puestoActual.activo === false)}
                className={`text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${
                  puestoActual.activo === false
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-red-50 hover:bg-red-100 text-red-700 border border-red-200"
                }`}
              >
                {puestoActual.activo === false ? "Reabrir búsqueda" : "Cerrar búsqueda"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Banner de éxito al crear un puesto */}
      {okPuesto && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-6 md:px-8 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <span className="text-sm font-medium text-emerald-700">{okPuesto}</span>
            <button
              onClick={() => setOkPuesto("")}
              className="text-emerald-600 hover:text-emerald-800 text-xs font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Content Area */}
      <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Candidates List */}
        <section className="lg:col-span-5 bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col h-[calc(100vh-190px)] overflow-hidden">
          <h2 className="text-lg font-bold text-slate-900 mb-4 border-b border-slate-100 pb-3">
            {vista === "guardados"
              ? `Candidatos guardados (${candidatosGuardados.length})`
              : `Candidatos principales (${listaVisible.length})`}
          </h2>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {cargando ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-sm text-slate-500 font-medium">Cargando postulaciones...</span>
              </div>
            ) : listaVisible.length === 0 ? (
              <div className="text-center py-12 px-4">
                <svg className="mx-auto h-12 w-12 text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                {vista === "guardados" ? (
                  <p className="text-slate-600 font-medium text-sm leading-relaxed">
                    No hay candidatos guardados todavía.
                  </p>
                ) : (
                  <>
                    <p className="text-slate-600 font-medium text-sm leading-relaxed">
                      No hay postulaciones para {puestoActual?.nombre || "esta búsqueda"}.
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Compartí el link del portal para recibir CVs de esta búsqueda.
                    </p>
                  </>
                )}
              </div>
            ) : (
              listaVisible.map((c) => {
                const isSelected = seleccionado?.id === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => seleccionarCandidato(c)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                      isSelected
                        ? "bg-blue-50/70 border-blue-300 border-l-4 border-l-blue-600 shadow-sm"
                        : "border-slate-100 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-200"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-semibold text-slate-800 text-sm">{c.nombre}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">{c.email}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${colorBadge(c.estado)}`}>
                        {etiquetaEstado(c.estado)}
                      </span>
                    </div>

                    {c.posible_inyeccion && (
                      <div className="mb-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border bg-red-100 text-red-700 border-red-300">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Revisar: posible contenido manipulado en el CV
                      </div>
                    )}

                    {analisisDe(c) === "listo" ? (
                      <div className="flex items-center space-x-3 mt-3">
                        <div className="flex-1 bg-slate-200 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${colorBarra(c.score)}`}
                            style={{ width: `${c.score}%` }}
                          />
                        </div>
                        <span className={`text-xs font-bold w-8 text-right ${colorTexto(c.score)}`}>
                          {c.score}%
                        </span>
                      </div>
                    ) : (
                      <p
                        className={`mt-3 text-xs font-semibold ${
                          analisisDe(c) === "procesando" ? "text-blue-700 animate-pulse" : "text-amber-700"
                        }`}
                      >
                        {analisisDe(c) === "procesando"
                          ? "⏳ Analizando CV con IA…"
                          : analisisDe(c) === "sin_datos"
                          ? "⚠️ CV sin datos profesionales"
                          : "⚠️ Análisis pendiente"}
                      </p>
                    )}

                    {/* En la vista de guardados: puesto y fecha de postulación */}
                    {vista === "guardados" && (
                      <p className="text-[11px] text-slate-500 mt-2">
                        Puesto: <span className="font-medium text-slate-700">{c.puesto || "—"}</span>
                        {c.creado_a ? ` · Postulado: ${new Date(c.creado_a).toLocaleDateString()}` : ""}
                      </p>
                    )}

                    {/* Botones Guardar / Eliminar (no disparan la selección) */}
                    <div className="flex gap-2 mt-3 justify-end" onClick={(e) => e.stopPropagation()}>
                      {vista === "todos" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); guardarCandidato(c.id); }}
                          className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                        >
                          💾 Guardar
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); eliminarCandidato(c.id); }}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                      >
                        🗑️ Eliminar
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Right Column: Candidate Detail */}
        <section className="lg:col-span-7 bg-white rounded-2xl shadow-sm border border-slate-100 p-6 h-[calc(100vh-190px)] overflow-y-auto flex flex-col">
          {!seleccionado ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <svg className="h-16 w-16 text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
              </svg>
              <h3 className="text-slate-800 font-bold text-lg mb-1">
                Detalle del candidato
              </h3>
              <p className="text-slate-500 text-sm max-w-sm">
                Seleccioná un candidato para ver el detalle y tomar decisiones.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Header Info */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{seleccionado.nombre}</h2>
                  <p className="text-sm text-slate-500">{seleccionado.email} {seleccionado.telefono ? `• ${seleccionado.telefono}` : ""}</p>
                </div>
                <div className="flex flex-col items-start sm:items-end gap-2">
                  <span className={`text-xs font-bold px-3 py-1 rounded-full border ${colorBadge(seleccionado.estado)}`}>
                    {etiquetaEstado(seleccionado.estado)}
                  </span>
                  {seleccionado.guardado && (
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200 whitespace-nowrap">
                      💾 Guardado para futuras búsquedas
                    </span>
                  )}
                </div>
              </div>

              {/* Alerta de posible inyección de prompts en el CV */}
              {seleccionado.posible_inyeccion && (
                <div className="bg-red-50 border border-red-300 rounded-xl p-4 flex items-start gap-3">
                  <svg className="w-5 h-5 flex-shrink-0 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <h4 className="text-sm font-bold text-red-800">Revisar: posible contenido manipulado en el CV</h4>
                    <p className="text-xs text-red-700 mt-1 leading-relaxed">
                      Se detectaron patrones que podrían ser un intento de manipular la evaluación automática
                      (inyección de instrucciones). Revisá el CV original antes de tomar una decisión.
                    </p>
                  </div>
                </div>
              )}

              {/* Compatibility Score — o estado del análisis con IA si todavía no terminó */}
              {analisisDe(seleccionado) === "listo" ? (
                <div className="bg-slate-50 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
                  <span className={`text-5xl font-extrabold ${colorTexto(seleccionado.score)}`}>
                    {seleccionado.score}%
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-1">
                    Compatibilidad
                  </span>
                </div>
              ) : analisisDe(seleccionado) === "procesando" ? (
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 text-center">
                  <p className="text-sm font-bold text-blue-900 animate-pulse">⏳ La IA está analizando este CV…</p>
                  <p className="mt-1 text-xs text-blue-800">
                    El score, las fortalezas y las brechas aparecen solos en unos segundos.
                  </p>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
                  <p className="text-sm font-bold text-amber-900">
                    {analisisDe(seleccionado) === "sin_datos"
                      ? "La IA no encontró información profesional en este CV."
                      : "No se pudo completar el análisis con IA."}
                  </p>
                  <p className="mt-1 text-xs text-amber-800">Revisá el PDF original o volvé a intentar el análisis.</p>
                  <button
                    onClick={() => reanalizar(seleccionado.id)}
                    disabled={reanalizando}
                    className="mt-3 text-xs font-semibold text-amber-900 bg-white border border-amber-300 hover:bg-amber-100 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg px-3 py-1.5 transition-colors"
                  >
                    {reanalizando ? "Analizando…" : "Reintentar análisis"}
                  </button>
                </div>
              )}

              {/* Mensaje que el candidato dejó al postularse (texto libre, no pasa por la IA) */}
              {seleccionado.mensaje && seleccionado.mensaje.trim() && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <h4 className="text-sm font-bold text-slate-800 mb-1">Mensaje del candidato</h4>
                  <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{seleccionado.mensaje.trim()}</p>
                </div>
              )}

              {/* Strengths & Weaknesses */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Strengths */}
                <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4">
                  <h4 className="text-sm font-bold text-emerald-800 mb-2 flex items-center">
                    <svg className="w-4 h-4 mr-1 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Fortalezas
                  </h4>
                  {seleccionado.fortalezas && seleccionado.fortalezas.length > 0 ? (
                    <ul className="text-xs text-slate-700 space-y-1.5 list-disc list-inside">
                      {seleccionado.fortalezas.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </div>

                {/* Brechas */}
                <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-4">
                  <h4 className="text-sm font-bold text-rose-800 mb-2 flex items-center">
                    <svg className="w-4 h-4 mr-1 text-rose-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    Áreas de mejora
                  </h4>
                  {seleccionado.brechas && seleccionado.brechas.length > 0 ? (
                    <ul className="text-xs text-slate-700 space-y-1.5 list-disc list-inside">
                      {seleccionado.brechas.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </div>
              </div>

              {/* Summary */}
              {seleccionado.resumen_evaluacion && (
                <div className="bg-slate-100/70 border border-slate-200 rounded-xl p-4">
                  <h4 className="text-sm font-bold text-slate-700 mb-2">Resumen de la evaluación</h4>
                  <div className="text-xs text-slate-600 leading-relaxed space-y-2">
                    {seleccionado.resumen_evaluacion.split('\n\n').map((parrafo, idx) => (
                      <p key={idx}>{parrafo}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* CV original — el reclutador abre o descarga el PDF real */}
              {seleccionado.cv_url ? (
                <a
                  href={seleccionado.cv_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold py-2.5 px-4 rounded-lg text-sm transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Ver / descargar CV (PDF)
                </a>
              ) : seleccionado.cv_texto ? (
                <details className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <summary className="text-sm font-bold text-slate-700 cursor-pointer select-none">
                    Leer CV (texto extraído)
                  </summary>
                  <pre className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-xs text-slate-600 leading-relaxed bg-white border border-slate-100 rounded-lg p-3 font-sans">
                    {seleccionado.cv_texto}
                  </pre>
                </details>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-400">
                  El CV no está disponible para este candidato.
                </div>
              )}

              {/* Preguntas para la entrevista (IA) — desde que el candidato avanza a entrevista */}
              {(() => {
                const lista = preguntas[seleccionado.id] || leerPreguntas(seleccionado.preguntas_entrevista);
                const enEntrevista = seleccionado.estado === "en_entrevista";
                if (!enEntrevista && lista.length === 0) return null;
                return (
                  <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <h4 className="text-sm font-bold text-blue-900">Preguntas para la entrevista</h4>
                      {enEntrevista && (
                        <button
                          onClick={() => generarPreguntas(seleccionado.id)}
                          disabled={generandoPreguntas}
                          className="text-xs font-semibold text-blue-700 bg-white border border-blue-200 hover:bg-blue-100 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg px-3 py-1.5 transition-colors"
                        >
                          {generandoPreguntas ? "Generando…" : lista.length ? "Regenerar con IA" : "Generar con IA"}
                        </button>
                      )}
                    </div>
                    {lista.length === 0 ? (
                      <p className="text-sm text-slate-600">
                        La IA arma preguntas a medida según el CV, el puesto y las brechas detectadas.
                      </p>
                    ) : (
                      <ol className="space-y-3 list-decimal list-inside">
                        {lista.map((p, i) => (
                          <li key={i} className="text-sm text-slate-800 leading-relaxed">
                            <span className="font-medium">{p.pregunta}</span>
                            <div className="ml-5 mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              <span className="rounded bg-white border border-slate-200 px-1.5 py-0.5 capitalize">{p.tipo}</span>
                              {p.objetivo && <span>{p.objetivo}</span>}
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                );
              })()}

              <hr className="border-slate-100" />

              {/* ACTIONS SECTION */}
              <div className="space-y-3">
                {seleccionado.estado === "pendiente" && analisisDe(seleccionado) === "procesando" && (
                  <p className="text-sm text-slate-500 text-center">
                    Podés decidir cuando termine el análisis con IA.
                  </p>
                )}

                {seleccionado.estado === "pendiente" && analisisDe(seleccionado) !== "procesando" && (
                  <div>
                    <h4 className="text-sm font-bold text-slate-700 mb-3">Fase 1 — Revisión de CV</h4>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={() => cambiarEstado("en_entrevista")}
                        disabled={generando || enviando}
                        className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                      >
                        Avanzar a entrevista
                      </button>
                      <button
                        onClick={() => generarFeedback("cv")}
                        disabled={generando || enviando}
                        className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                      >
                        Rechazar
                      </button>
                    </div>
                  </div>
                )}

                {seleccionado.estado === "en_entrevista" && (
                  <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                    <h4 className="text-sm font-bold text-slate-700">Agendar entrevista (Google Calendar)</h4>
                    {seleccionado.entrevista_inicio && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-900">
                        <p className="font-semibold">
                          📅{" "}
                          {new Date(seleccionado.entrevista_inicio).toLocaleString("es-UY", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "America/Montevideo",
                          })}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-3">
                          {seleccionado.entrevista_link && (
                            <a href={seleccionado.entrevista_link} target="_blank" rel="noreferrer" className="font-semibold underline">
                              Ver en Calendar
                            </a>
                          )}
                          {seleccionado.entrevista_meet && (
                            <a href={seleccionado.entrevista_meet} target="_blank" rel="noreferrer" className="font-semibold underline">
                              Link de Meet
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <label className="text-xs font-medium text-slate-600">
                        Fecha
                        <input
                          type="date"
                          value={agenda.fecha}
                          onChange={(e) => setAgenda({ ...agenda, fecha: e.target.value })}
                          className="mt-1 block w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-900"
                        />
                      </label>
                      <label className="text-xs font-medium text-slate-600">
                        Hora
                        <input
                          type="time"
                          value={agenda.hora}
                          onChange={(e) => setAgenda({ ...agenda, hora: e.target.value })}
                          className="mt-1 block w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-900"
                        />
                      </label>
                      <label className="text-xs font-medium text-slate-600">
                        Duración
                        <select
                          value={agenda.duracion}
                          onChange={(e) => setAgenda({ ...agenda, duracion: e.target.value })}
                          className="mt-1 block w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white"
                        >
                          <option value="30">30 min</option>
                          <option value="45">45 min</option>
                          <option value="60">1 hora</option>
                          <option value="90">1 h 30</option>
                        </select>
                      </label>
                    </div>
                    <label className="block text-xs font-medium text-slate-600">
                      Invitar también a <span className="font-normal text-slate-400">(opcional, emails separados por coma)</span>
                      <input
                        type="text"
                        value={agenda.invitados}
                        onChange={(e) => setAgenda({ ...agenda, invitados: e.target.value })}
                        placeholder="otro.reclutador@empresa.com"
                        className="mt-1 block w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-900"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={agenda.conMeet}
                        onChange={(e) => setAgenda({ ...agenda, conMeet: e.target.checked })}
                      />
                      Agregar link de Google Meet
                    </label>
                    <button
                      onClick={() => agendarEntrevista(seleccionado.id)}
                      disabled={agendando}
                      className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg text-sm transition-colors"
                    >
                      {agendando ? "Agendando…" : seleccionado.entrevista_inicio ? "Reprogramar entrevista" : "Agendar e invitar al candidato"}
                    </button>
                    <p className="text-xs text-slate-400">
                      Se crea en el Google Calendar del reclutador y Google le envía la invitación por mail al candidato.
                    </p>
                  </div>
                )}

                {seleccionado.estado === "en_entrevista" && (
                  <div>
                    <h4 className="text-sm font-bold text-slate-700 mb-3">Fase 2 — Post-entrevista</h4>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={() => cambiarEstado("seleccionado")}
                        disabled={generando || enviando}
                        className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                      >
                        Seleccionar candidato
                      </button>
                      <button
                        onClick={() => generarFeedback("entrevista")}
                        disabled={generando || enviando}
                        className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                      >
                        Rechazar tras entrevista
                      </button>
                    </div>
                  </div>
                )}

                {(seleccionado.estado === "seleccionado" ||
                  seleccionado.estado === "rechazado_cv" ||
                  seleccionado.estado === "rechazado_entrevista") && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
                    <p className="text-sm font-semibold text-slate-600">
                      Este proceso ya fue cerrado:{" "}
                      <span className="text-slate-800 font-bold">{etiquetaEstado(seleccionado.estado)}</span>
                    </p>
                  </div>
                )}
              </div>

              {/* FEEDBACK BLOCK */}
              {generando && (
                <div className="flex items-center space-x-2 text-blue-600 py-2">
                  <svg className="animate-spin h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="text-xs font-semibold">Generando feedback con IA...</span>
                </div>
              )}

              {feedback && !generando && (
                <div className="space-y-3 bg-blue-50/30 border border-blue-100 rounded-xl p-4 animate-fade-in">
                  <label htmlFor="feedback-textarea" className="block text-sm font-bold text-blue-900">
                    Feedback para el candidato (Editable)
                  </label>
                  <textarea
                    id="feedback-textarea"
                    rows={6}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    disabled={enviando}
                    className="block w-full rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-xs text-slate-800 p-3 bg-white"
                  />
                  <button
                    onClick={() =>
                      enviarFeedback(
                        seleccionado.estado === "pendiente" ? "rechazado_cv" : "rechazado_entrevista"
                      )
                    }
                    disabled={enviando || !feedback.trim()}
                    className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                      enviando ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
                    }`}
                  >
                    {enviando ? "Enviando..." : "Enviar feedback por email"}
                  </button>
                </div>
              )}

              {/* Status/OK message */}
              {mensajeOk && (
                <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-xs font-medium text-green-700">
                  {mensajeOk}
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      {/* Modal — Crear puesto */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Crear nuevo puesto</h3>
              <button
                onClick={() => setModalAbierto(false)}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-500">
                Sólo el <span className="font-semibold text-slate-700">Título del puesto</span> es obligatorio. El resto de las secciones son opcionales, pero cuanto más completes, mejor evalúa la IA a los candidatos.
              </p>

              {errorPuesto && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
                  {errorPuesto}
                </div>
              )}

              {/* 1. Título del Puesto */}
              <div>
                <label htmlFor="np-nombre" className="block text-sm font-medium text-slate-700">
                  Título del Puesto <span className="text-red-500">*</span>
                  <span className="text-slate-400 font-normal"> — claro y directo</span>
                </label>
                <input
                  id="np-nombre"
                  type="text"
                  value={nuevoPuesto.nombre}
                  onChange={(e) => setNuevoPuesto({ ...nuevoPuesto, nombre: e.target.value })}
                  placeholder="Ej.: Analista de Marketing Digital"
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm text-slate-900"
                />
              </div>

              {/* Área: define en qué sección del portal público aparece la búsqueda */}
              <div>
                <label htmlFor="np-area" className="block text-sm font-medium text-slate-700">
                  Área <span className="text-slate-400 font-normal">— sección del portal donde se muestra</span>
                </label>
                <select
                  id="np-area"
                  value={nuevoPuesto.area}
                  onChange={(e) => setNuevoPuesto({ ...nuevoPuesto, area: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm text-slate-900 bg-white"
                >
                  {AREAS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Sobre Nosotros */}
              <div>
                <label htmlFor="np-sobre-nosotros" className="block text-sm font-medium text-slate-700">
                  Sobre Nosotros <span className="text-slate-400 font-normal">— la propuesta de cultura</span>
                </label>
                <textarea
                  id="np-sobre-nosotros"
                  rows={3}
                  value={nuevoPuesto.sobre_nosotros}
                  onChange={(e) => setNuevoPuesto({ ...nuevoPuesto, sobre_nosotros: e.target.value })}
                  placeholder="Quiénes somos, cómo trabajamos, qué nos hace distintos…"
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm text-slate-900"
                />
              </div>

              {/* 3. Misión del Puesto */}
              <div>
                <label htmlFor="np-mision" className="block text-sm font-medium text-slate-700">
                  Misión del Puesto <span className="text-slate-400 font-normal">— el “para qué”</span>
                </label>
                <textarea
                  id="np-mision"
                  rows={2}
                  value={nuevoPuesto.mision}
                  onChange={(e) => setNuevoPuesto({ ...nuevoPuesto, mision: e.target.value })}
                  placeholder="El propósito principal del rol y el impacto que se espera…"
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm text-slate-900"
                />
              </div>

              {/* 4. Responsabilidades y Tareas */}
              <div>
                <label htmlFor="np-actividades" className="block text-sm font-medium text-slate-700">
                  Responsabilidades y Tareas <span className="text-slate-400 font-normal">— ¿qué hará?</span>
                </label>
                <textarea
                  id="np-actividades"
                  rows={3}
                  value={nuevoPuesto.actividades}
                  onChange={(e) => setNuevoPuesto({ ...nuevoPuesto, actividades: e.target.value })}
                  placeholder="Principales responsabilidades y tareas del día a día…"
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm text-slate-900"
                />
              </div>

              {/* 5. Requisitos del Perfil */}
              <div>
                <label htmlFor="np-requisitos" className="block text-sm font-medium text-slate-700">
                  Requisitos del Perfil <span className="text-slate-400 font-normal">— ¿qué buscamos?</span>
                </label>
                <textarea
                  id="np-requisitos"
                  rows={3}
                  value={nuevoPuesto.requisitos}
                  onChange={(e) => setNuevoPuesto({ ...nuevoPuesto, requisitos: e.target.value })}
                  placeholder="Experiencia, habilidades técnicas, idiomas, formación…"
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm text-slate-900"
                />
              </div>

              {/* 6. Modalidad y Ubicación */}
              <div>
                <label htmlFor="np-modalidad" className="block text-sm font-medium text-slate-700">
                  Modalidad y Ubicación
                </label>
                <input
                  id="np-modalidad"
                  type="text"
                  value={nuevoPuesto.modalidad}
                  onChange={(e) => setNuevoPuesto({ ...nuevoPuesto, modalidad: e.target.value })}
                  placeholder="Ej.: Híbrido — Montevideo / Remoto / Presencial"
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm text-slate-900"
                />
              </div>

              {/* 7. Beneficios y Propuesta de Valor */}
              <div>
                <label htmlFor="np-beneficios" className="block text-sm font-medium text-slate-700">
                  Beneficios y Propuesta de Valor <span className="text-slate-400 font-normal">— ¿qué ofrecemos?</span>
                </label>
                <textarea
                  id="np-beneficios"
                  rows={3}
                  value={nuevoPuesto.beneficios}
                  onChange={(e) => setNuevoPuesto({ ...nuevoPuesto, beneficios: e.target.value })}
                  placeholder="Salario, bonos, beneficios, crecimiento, flexibilidad…"
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm text-slate-900"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button
                onClick={() => setModalAbierto(false)}
                disabled={guardandoPuesto}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={crearPuesto}
                disabled={guardandoPuesto}
                className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 ${
                  guardandoPuesto ? "bg-emerald-400 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {guardandoPuesto ? "Guardando…" : "Crear puesto"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
