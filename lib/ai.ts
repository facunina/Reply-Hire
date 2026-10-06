import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { extraerJSON } from "./prompts";

// ── Proveedor de IA ──────────────────────────────────────────────────────────
// La app soporta dos proveedores. Se elige según qué key esté en .env.local:
//  - GEMINI_API_KEY    → Google Gemini (tiene prioridad; tier gratuito en AI Studio)
//  - ANTHROPIC_API_KEY → Anthropic Claude
type Proveedor = "gemini" | "anthropic";

function keyValida(k: string | undefined): boolean {
  return !!k && k.trim() !== "" && k !== "REEMPLAZAR";
}

function proveedor(): Proveedor {
  if (keyValida(process.env.GEMINI_API_KEY)) return "gemini";
  return "anthropic";
}

// Modelos por tarea y proveedor:
//  - Extracción de perfil → JSON: modelo rápido y económico (tarea mecánica).
//  - Scoring / evaluación → JSON: modelo con razonamiento más profundo para una
//    evaluación rigurosa y no superficial del CV.
//  - Generación de feedback: mayor calidad de redacción.
// En Gemini se usan los alias "-latest" para no depender de versiones que se retiran.
const MODELOS = {
  gemini: {
    analisis: "gemini-flash-lite-latest",
    scoring: "gemini-flash-latest",
    feedback: "gemini-flash-latest",
  },
  anthropic: {
    analisis: "claude-haiku-4-5",
    scoring: "claude-sonnet-4-6",
    feedback: "claude-sonnet-4-6",
  },
} as const;

type Tarea = keyof (typeof MODELOS)["gemini"];

// Modelos de Gemini a los que se pasa si el principal está saturado (503/429).
const MODELOS_RESPALDO_GEMINI = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-flash-lite-latest"];

// Los modelos Flash de Gemini "piensan" antes de responder y ese razonamiento
// consume del límite de tokens de salida; se usa un techo más alto para que la
// respuesta final no quede cortada.
const MAX_TOKENS_GEMINI = 8192;

// ── Clientes lazy ────────────────────────────────────────────────────────────
// Se instancian la primera vez que se usan para que process.env ya esté
// completamente cargado cuando Next.js inicializa las rutas de API.
let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    _gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
  }
  return _gemini;
}

// ── Guards y helpers ─────────────────────────────────────────────────────────

/** Lanza un error claro y accionable si no hay ninguna key configurada. */
function verificarKey(): void {
  if (proveedor() === "gemini") return;
  if (!keyValida(process.env.ANTHROPIC_API_KEY)) {
    throw new Error(
      "No hay ninguna key de IA configurada. Cargá GEMINI_API_KEY " +
      "(gratis en https://aistudio.google.com/apikey) o ANTHROPIC_API_KEY " +
      "(https://console.anthropic.com/settings/keys) en .env.local."
    );
  }
}

/** Traduce errores crudos de los SDKs a mensajes claros en español. */
function traducirErrorIA(error: unknown): Error {
  const msg = error instanceof Error ? error.message : String(error);
  const esGemini = proveedor() === "gemini";
  const nombre = esGemini ? "Gemini" : "Anthropic";

  if (msg.includes("429") || /rate.?limit|quota|overloaded|resource.?exhausted/i.test(msg)) {
    return new Error(
      `${nombre} devolvió 429 (rate limit / cuota agotada). ` +
      "Esperá unos segundos y volvé a intentarlo." +
      (esGemini ? "" : " Revisá el saldo en https://console.anthropic.com/settings/billing.")
    );
  }
  if (msg.includes("401") || msg.includes("403") || /invalid.?api.?key|api.?key.?not.?valid|authentication|permission/i.test(msg)) {
    return new Error(
      `${nombre} rechazó la API key (401/403). ` +
      (esGemini
        ? "Verificá GEMINI_API_KEY en .env.local (se genera en https://aistudio.google.com/apikey)."
        : "Verificá que sea una key válida de la consola de Anthropic (empieza con 'sk-ant-').")
    );
  }
  if (msg.includes("credit balance") || /insufficient.?credits?/i.test(msg)) {
    return new Error(
      "La cuenta de Anthropic no tiene créditos suficientes. " +
      "Recargá el saldo en https://console.anthropic.com/settings/billing."
    );
  }
  if (msg.includes("404") || /not_found|not found|model:/i.test(msg)) {
    return new Error(
      "El modelo de IA solicitado no existe o fue retirado. " +
      "Verificá los IDs de modelo en MODELOS (lib/ai.ts)."
    );
  }
  return new Error(`Error en la llamada de IA (${nombre}): ${msg}`);
}

// ── Llamadas por proveedor ───────────────────────────────────────────────────

const SYSTEM_JSON =
  "Eres un asistente de análisis de CVs. " +
  "Responde ÚNICAMENTE con un objeto JSON válido y sin ningún otro texto, " +
  "sin bloques de código markdown (sin ```json ni ```), sin explicaciones adicionales.";

/**
 * Llama al proveedor activo y devuelve el texto de la respuesta.
 * Si `json` es true, se refuerza la respuesta en JSON puro (system prompt y,
 * en Gemini, responseMimeType).
 */
async function llamarModelo(
  prompt: string,
  tarea: Tarea,
  maxTokens: number,
  json: boolean
): Promise<string> {
  if (proveedor() === "gemini") {
    // El tier gratuito devuelve 503/429 con frecuencia en picos de demanda:
    // se reintenta con backoff y, si el modelo sigue saturado, se pasa al de respaldo.
    const modelos = [MODELOS.gemini[tarea], ...MODELOS_RESPALDO_GEMINI.filter((m) => m !== MODELOS.gemini[tarea])];
    let ultimoError: unknown;
    for (const nombreModelo of modelos) {
      for (let intento = 0; intento < 2; intento++) {
        try {
          const model = getGemini().getGenerativeModel({
            model: nombreModelo,
            ...(json ? { systemInstruction: SYSTEM_JSON } : {}),
            generationConfig: {
              maxOutputTokens: MAX_TOKENS_GEMINI,
              ...(json ? { responseMimeType: "application/json" } : {}),
            },
          });
          const result = await model.generateContent(prompt);
          const texto = result.response.text();
          if (!texto) {
            throw new Error("La respuesta de Gemini no contenía texto.");
          }
          return texto;
        } catch (error) {
          ultimoError = error;
          const msg = error instanceof Error ? error.message : String(error);
          // Modelo retirado o no habilitado para esta key → se pasa directo al siguiente.
          if (/\b404\b|no longer available|not found/i.test(msg)) {
            console.warn(`Gemini ${nombreModelo} no disponible; probando el siguiente modelo…`);
            break;
          }
          if (!/\b(503|429|500)\b|high demand|overloaded|unavailable/i.test(msg)) throw error;
          console.warn(`Gemini ${nombreModelo} saturado (intento ${intento + 1}); reintentando…`);
          await new Promise((r) => setTimeout(r, 1500 * (intento + 1)));
        }
      }
    }
    throw ultimoError;
  }

  const message = await getAnthropic().messages.create({
    model: MODELOS.anthropic[tarea],
    max_tokens: maxTokens,
    ...(json ? { system: SYSTEM_JSON } : {}),
    messages: [{ role: "user", content: prompt }],
  });

  // El contenido puede llegar como array de bloques; tomamos el primer text block.
  const block = message.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("La respuesta de Claude no contenía un bloque de texto.");
  }
  return block.text;
}

/**
 * Helper interno: pide una respuesta en JSON puro. Usa extraerJSON() como
 * fallback por si el modelo devuelve markdown code fences.
 */
async function pedirJSON(prompt: string, tarea: Tarea, maxTokens: number): Promise<any> {
  verificarKey();
  try {
    const texto = await llamarModelo(prompt, tarea, maxTokens, true);
    return extraerJSON(texto);
  } catch (error) {
    console.error("Error en pedirJSON:", error);
    throw traducirErrorIA(error);
  }
}

// ── Funciones exportadas ─────────────────────────────────────────────────────

/**
 * Extracción de perfil (Agente 1). Tarea mecánica → modelo rápido y económico.
 */
export async function analizarJSON(prompt: string): Promise<any> {
  return pedirJSON(prompt, "analisis", 1024);
}

/**
 * Evaluación / scoring del CV (Agente 2). Usa un modelo más capaz y un
 * límite de tokens mayor para producir una evaluación profunda y fundamentada,
 * no superficial.
 */
export async function evaluarJSON(prompt: string): Promise<any> {
  return pedirJSON(prompt, "scoring", 2048);
}

/**
 * Genera un texto libre (sin forzar JSON).
 * Usado por el Agente de Feedback.
 */
export async function generarTexto(prompt: string): Promise<string> {
  verificarKey();
  try {
    const texto = await llamarModelo(prompt, "feedback", 512, false);
    return texto.trim();
  } catch (error) {
    console.error("Error en generarTexto:", error);
    throw traducirErrorIA(error);
  }
}

/** Nombre del proveedor activo (útil para logs y eventos de monitoreo). */
export function proveedorIA(): Proveedor {
  return proveedor();
}
