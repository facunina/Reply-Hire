@AGENTS.md

# ReplyHire — contexto del proyecto

> **Mantener este archivo al día.** Al terminar cada tarea, actualizar «Estado actual» y
> «Próximos pasos». Es lo primero que lee una conversación nueva para saber por dónde vamos.

## Qué es

Obligatorio de **Incorporación Estratégica de Tecnología** (ORT Uruguay, Lic. en Negocios
Digitales, 2026). Artefacto del catálogo «7. RRHH»: plataforma de reclutamiento con IA.

- **Candidato**: ve las búsquedas sin cuenta; para postularse crea cuenta, sube el CV (PDF) y
  sigue el estado en «Mi cuenta» (también guarda búsquedas de interés).
- **IA**: extrae el perfil del CV, lo evalúa **requisito por requisito y tarea por tarea** con
  evidencia, genera preguntas de entrevista y redacta el feedback. La IA **no decide**: asiste.
- **Reclutador**: panel con búsquedas (abiertas/cerradas), candidatos, decisiones, feedback por
  mail y agenda de entrevistas en Google Calendar.
- **Admin**: panel de métricas (`/admin`) y conexión de Google Calendar.

Pautas del curso: `../Pauta del Artefacto de IET - 2026.pdf` (en Descargas del usuario) y el
**Checklist técnico del Artefacto** (`../Captura de pantalla 2026-11-03 …png`, 10 puntos:
modelo de datos, hosting, autenticación, backup, protección de datos, credenciales, buenas
prácticas, ambientes, escalabilidad, stack).

## Stack y servicios

| Pieza | Herramienta |
|---|---|
| Web (front + API) | Next.js 16 (App Router, `proxy.ts` en vez de middleware), React 19, TypeScript, Tailwind 4 |
| Hosting | Vercel, proyecto `reply-hire` (cuenta `facu25`) → https://reply-hire.vercel.app — **cada push a `main` publica solo** |
| Base, auth y archivos | Supabase, proyecto «Obligatorio RRHH» (`bkeyedzbjeumevaghkdw`). Plan gratis: **se pausa a la semana sin uso** (Restore desde el dashboard) |
| IA | Gemini (`GEMINI_API_KEY`); Claude como alternativa ya programada en `lib/ai.ts` |
| Mails | Resend en modo prueba: `EMAIL_PRUEBA_DESTINO=delivered@resend.dev` (verificar dominio para mandar a candidatos reales) |
| Entrevistas | Google Calendar (OAuth; proyecto GCP `replyhire-513623`, app en modo prueba → el token vence cada 7 días: reconectar desde `/admin`) |
| Código | GitHub `facunina/Reply-Hire` |

La versión vieja de Santiago (`obligatorio-ia.vercel.app`, repo `Tatonga-art/Obligatorio-IA`) **no es la nuestra**.

## Mapa del código

- `lib/db.ts` — único acceso a datos (service key, sólo servidor). `lib/eventos.ts` — monitoreo.
- `lib/analisis.ts` — análisis del CV en segundo plano (`after()`); `lib/requisitos.ts` — requisitos y tareas del puesto; `lib/puntaje.ts` — **fórmula del puntaje** (70% requisitos / 30% tareas, excluyentes ×2, tope 39 si falta un excluyente, 69 si es parcial).
- `lib/reglas.ts` — reglas del proceso (transiciones de estado, no decidir mientras la IA analiza, cerrar búsqueda al seleccionar).
- `lib/ai.ts` (proveedor IA, timeouts y respaldo de modelos), `lib/prompts.ts`, `lib/google-calendar.ts`, `lib/email.ts`.
- `lib/roles.ts` + `lib/auth-equipo.ts` (equipo, rol en `app_metadata.rol`), `lib/auth-candidato.ts` (token Bearer).
- `proxy.ts` — protege `/dashboard`, `/prueba`, `/admin` y las APIs del equipo.
- `supabase/schema.sql` — esquema completo (fuente de verdad); `supabase/roles.sql` — roles del equipo.

## Base de datos

Tablas `puestos`, `candidatos`, `eventos` con **RLS activada sin políticas**: la clave pública
no lee nada; la app usa la service key en el servidor. Bucket `cvs` **privado** (links firmados de 5 min).
Índice único `candidatos (usuario_id, puesto_id)`.
Cuentas del equipo: `reclutador@replyhire.test` y `admin@replyhire.test` (el usuario tiene las contraseñas).

## Cómo trabajamos (preferencias del usuario)

- Responder **en español rioplatense**, claro y sin tecnicismos innecesarios.
- **Una tarea a la vez**: implementar → probar (yo y después el usuario) → recién ahí **commit + push**. Nada de juntar muchas cosas sin probar.
- Antes de cada push: `npx tsc --noEmit` y **escaneo de secretos** sobre lo que se sube (`.env*` está en `.gitignore`).
- Cambios de base: por el **SQL Editor de Supabase en el Chrome del usuario** (extensión Claude in Chrome) y anotarlos en `supabase/schema.sql`. Si Chrome no responde, copiar el SQL al portapapeles (`pbcopy`) y abrir el editor con `open`.
- Claves: nunca pedirlas por chat; copiarlas con el botón «Copy» del servicio → `pbpaste` al `.env.local`, y vaciar el portapapeles.
- No crear cuentas ni escribir contraseñas por el usuario; pedirle esos pasos.
- **App local**: correr en una pestaña de terminal propia (`npm run dev -- -p 3001`, en esta carpeta), no en el panel de vista previa (se apaga al cerrarse). Puerto 3000 = otro proyecto (FestivaldeRock).

## Estado actual (actualizado: 2026-11-10)

En GitHub y publicado: portal público, cuentas de candidato, Mi cuenta, login del equipo con
Supabase Auth, preguntas de entrevista con IA, Google Calendar, postulación instantánea (IA en
segundo plano), cerrar/reabrir búsquedas, base asegurada (RLS + service key), UNIQUE contra
duplicados, reglas de negocio en el servidor.

También subido (commit 8156c25): evaluación requisito por requisito con fórmula de puntaje
(`lib/puntaje.ts`, 70/30 — el desglose NO se muestra al reclutador; temperatura 0; práctica
académica = «parcial» en tareas), editor de requisitos con «Excluyente», «Búsqueda finalizada»
en Mi cuenta, limpieza de credenciales viejas y **CVs privados**: bucket `cvs` con
`public=false` (aplicado en Supabase 2026-11-10) y links firmados de 5 min vía
`GET /api/candidato/cv` (sólo equipo, evento `cv_abierto`).

Modelo de datos revisado (punto 1, 2026-11-12, commit 9c15ad0): nombre de búsqueda repetible
(identidad = id) + `puestos.creado_por` → auth.users (el panel muestra «Creada por…»);
requisitos SÓLO en `requisitos_lista` (columnas `requisitos` y `salario` eliminadas);
`fortalezas`, `brechas`, `preguntas_entrevista` ahora jsonb (listas). Redundancias que se
JUSTIFICAN en el dossier: «foto» de nombre/email/teléfono/puesto en candidatos, `score` guardado
(ordenar/métricas), `activo` + `cerrado_a` (historial).

## Próximos pasos (en orden)

0. Checklist punto por punto (en curso): 1 ✅ → 7 ✅ (reglas centralizadas: `lib/reglas.ts` transiciones/etapas/límites, `lib/estados.ts` nombres y colores de estados para equipo y candidato, `lib/puntaje.ts` niveles 70/40 y topes derivados; las pantallas no tienen reglas propias) → 6 (usuario) → 8/9/10 (documento).
1. ~~Backup diario~~ HECHO y funcionando en GitHub Actions (primer run 2026-11-11 OK, descargado y abierto con la clave local). Scripts en `scripts/` (backup, abrir, restaurar con `--confirmar`); artifact cifrado, 30 días; secrets cargados por el usuario.
2. Ambientes: DECISIÓN del usuario (2026-11-11): NO crear una base aparte; se mantiene una sola base y se **documenta** en el dossier (DEV = local, PROD = Vercel, QA = local antes del push; cómo se separaría al crecer: segundo proyecto Supabase + preview deployments de Vercel).
3. Revisar en Vercel si quedaron las variables viejas `RECLUTADOR_*`/`ADMIN_*` y borrarlas.
4. Ronda 3 (usuario): rotar claves de Gemini y Resend (quedaron en el chat); activar 2FA en Vercel.
5. Ronda 4: dossier técnico (diagramas de arquitectura y de datos, los 10 puntos del checklist, ambientes DEV/QA/PROD, escalabilidad, costos para 100/1.000/100.000 usuarios) y documento de entrega del grupo.
6. Si sobra tiempo: automatización con n8n, partir `app/dashboard/page.tsx` (~1.700 líneas).

Riesgos conocidos: Gemini gratis se satura (análisis de 20–30 s) y en plan gratis Google puede
usar los datos de los CVs; DEV usa la misma base que PROD.
