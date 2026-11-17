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
  mail, agenda de entrevistas en Google Calendar y aviso automático a quienes quedaron sin
  respuesta cuando se selecciona a alguien.
- **Admin**: panel de métricas (`/admin`) y conexión de Google Calendar.

Pautas del curso: `../Pauta del Artefacto de IET - 2026.pdf` (en Descargas del usuario) y el
**Checklist técnico del Artefacto** (`../Captura de pantalla 2026-11-03 …png`, 10 puntos:
modelo de datos, hosting, autenticación, backup, protección de datos, credenciales, buenas
prácticas, ambientes, escalabilidad, stack). La columna clave del checklist es «Qué debe
entender»: el grupo tiene que poder **explicar** cada punto (ver «Checklist» abajo).

## Stack y servicios

| Pieza | Herramienta |
|---|---|
| Web (front + API) | Next.js 16 (App Router, `proxy.ts` en vez de middleware), React 19, TypeScript, Tailwind 4 |
| Hosting | Vercel, proyecto `reply-hire` (cuenta `facu25`) → https://reply-hire.vercel.app — **cada push a `main` publica solo** |
| Base, auth y archivos | Supabase, proyecto «Obligatorio RRHH» (`bkeyedzbjeumevaghkdw`). Plan gratis: **se pausa a la semana sin uso** (Restore desde el dashboard) |
| IA | Gemini (`GEMINI_API_KEY`), temperatura 0 en evaluaciones; Claude como alternativa ya programada en `lib/ai.ts` |
| Mails | Resend en modo prueba: `EMAIL_PRUEBA_DESTINO=delivered@resend.dev` (todos los mails van a esa casilla; el profesor dijo que alcanza con que se generen/envíen). Para candidatos reales: verificar un dominio |
| Entrevistas | Google Calendar (OAuth; proyecto GCP `replyhire-513623`). App **«En producción»** desde 2026-11-16 → el token **ya no vence a los 7 días**. Al conectar aparece «app no verificada» (normal: Configuración avanzada → Ir a ReplyHire). Token en `.env.local` y en Vercel (`GOOGLE_REFRESH_TOKEN`) |
| Backup | GitHub Actions diario, cifrado (ver «Backup») |
| Código | GitHub `facunina/Reply-Hire` (repo **público**) |

La versión vieja de Santiago (`obligatorio-ia.vercel.app`, repo `Tatonga-art/Obligatorio-IA`) **no es la nuestra**.

## Mapa del código

- `lib/db.ts` — único acceso a datos (service key, sólo servidor). `lib/eventos.ts` — monitoreo.
- **Reglas de negocio (un solo lugar cada una, punto 7):**
  - `lib/reglas.ts` — etapas y transiciones (`decisionesPosibles`, `puedeDecidir`, `enRevisionDeCV`, `enEtapaEntrevista`, `esEstadoFinal`, `rechazoSegunEtapa`), no decidir mientras la IA analiza, `cierraLaBusqueda`, `quedaSinRespuesta`, límites (`CV_MAX_MB`, `MENSAJE_MAX`, `MAX_REQUISITOS`). Las usan las APIs **y** el panel.
  - `lib/puntaje.ts` — **fórmula del puntaje** (70% requisitos / 30% tareas, cumple 1 / parcial 0,5 / no 0, excluyentes ×2) y niveles 70/40; los topes 39 (falta excluyente) y 69 (excluyente parcial) se derivan de los niveles.
  - `lib/estados.ts` — nombres y colores de cada estado, para el equipo y para el candidato («Búsqueda finalizada»).
  - `lib/requisitos.ts` — requisitos (sólo `requisitos_lista`) y tareas del puesto; `textoRequisitos()` arma el texto del portal al vuelo.
- `lib/analisis.ts` — análisis del CV en segundo plano (`after()`), evaluación por requisito.
- `lib/avisos.ts` — aviso por email de «búsqueda cubierta» a quienes quedaron sin respuesta.
- `lib/ai.ts` (proveedor IA, timeouts, respaldo de modelos, temperatura 0 en JSON), `lib/prompts.ts`, `lib/google-calendar.ts`, `lib/email.ts` (`destinoEmail`, `enviarEmail`).
- `lib/roles.ts` + `lib/auth-equipo.ts` (equipo, rol en `app_metadata.rol`; `usuarioEquipoDesdeCookies`), `lib/auth-candidato.ts` (token Bearer).
- `proxy.ts` — protege `/dashboard`, `/prueba`, `/admin` y las APIs del equipo.
- `app/api/candidato/cv` — link firmado de 5 min para abrir un CV (sólo equipo).
- `app/privacidad`, `app/terminos` (+ `components/PaginaLegal.tsx`) — páginas legales (Ley 18.331), enlazadas en el pie.
- `scripts/` — `backup.mjs`, `abrir-backup.mjs`, `restaurar-backup.mjs`, `cifrado-backup.mjs`; `.github/workflows/backup.yml`.
- `supabase/schema.sql` — esquema completo (fuente de verdad); `supabase/roles.sql` — roles del equipo.

## Base de datos

Tablas (RLS activada **sin políticas**: la clave pública no lee nada; la app usa la service key en el servidor):

- **`puestos`**: `id`, nombre (puede repetirse: la identidad es el id), área, sobre_nosotros, misión, actividades (tareas), `requisitos_lista` jsonb `[{texto, excluyente}]` (único lugar de los requisitos), modalidad, beneficios, `activo` + `cerrado_a`, `created_at`, **`creado_por` → auth.users** (el panel muestra «Creada por…»).
- **`candidatos`**: `id`, **`puesto_id` → puestos**, **`usuario_id` → auth.users**, «foto» de nombre/email/teléfono/puesto al postularse, CV (texto + `cv_url` = ruta en el bucket), `score`, `evaluacion` jsonb, `fortalezas`/`brechas`/`preguntas_entrevista` **jsonb (listas)**, resumen, feedback, estado, `analisis`, mensaje, datos de entrevista, guardado, **`aviso_cierre_a`** (cuándo se le avisó que la búsqueda se cubrió).
- **`eventos`**: registro para métricas (tipo, detalle, metadata, fecha).
- Índice único `candidatos (usuario_id, puesto_id)`: no se puede postular dos veces a la misma búsqueda.
- Bucket `cvs` **privado** (links firmados de 5 min).
- Eliminadas el 2026-11-12: `puestos.requisitos` (texto) y `puestos.salario`.
- Cuentas del equipo: `reclutador@replyhire.test` y `admin@replyhire.test` (el usuario tiene las contraseñas).

**Correcciones manuales de datos (log):**
- 2026-11-12: las 3 búsquedas viejas con requisitos en texto se pasaron a `requisitos_lista`; fortalezas/brechas/preguntas convertidas a jsonb.
- 2026-11-17: «Instructor/a de Vela» seguía **abierta** con Joaquin seleccionado. Causa: se lo seleccionó el 08/11, antes de que existiera la regla «seleccionar cierra la búsqueda» (agregada el 10/11). Se cerró a mano. Se verificó que no queda ninguna otra búsqueda abierta con un seleccionado.
- 2026-11-17 (para la presentación): eliminada «Ingeniero en IA» (con sus 2 postulaciones de prueba y CVs; quedó un evento de entrevista del 19/11 en el Google Calendar del usuario). Creadas 7 búsquedas de demo desde el panel: Docente de Programación SSr, Prof. de Educación Física Jr, Analista de Ecommerce Jr, Gerente de Marketing Sr, Analista de RRHH SSr, Desarrollador/a Backend Sr, Asistente Administrativo/a Contable Jr. Abiertas hoy: esas 7 + Analista de Datos Jr.

## Backup

`scripts/backup.mjs` exporta tablas + cuentas + PDFs, comprime y **cifra** (AES-256-GCM, clave
`BACKUP_PASSPHRASE`, sólo en `.env.local` y en GitHub Secrets; el usuario decidió no guardarla en
otro lado). GitHub Actions lo corre todos los días 06:00 UTC y guarda el archivo 30 días
(Actions → «Backup diario»). Restaurar: `abrir-backup.mjs` y `restaurar-backup.mjs` (simulación
salvo `--confirmar`). Probado: abrir con clave correcta OK, clave incorrecta falla, simulación OK.

## Cómo trabajamos (preferencias del usuario)

- Responder **en español rioplatense**, claro y sin tecnicismos innecesarios. El usuario prefiere instrucciones paso a paso muy concretas (qué tocar y dónde).
- **Una tarea a la vez**: implementar → probar (yo y después el usuario) → recién ahí **commit + push**. Nada de juntar muchas cosas sin probar.
- Antes de cada push: `npx tsc --noEmit` y **escaneo de secretos** sobre lo que se sube (`.env*` está en `.gitignore`).
- Cambios de base: por el **SQL Editor de Supabase en el Chrome del usuario** (extensión Claude in Chrome) y anotarlos en `supabase/schema.sql`. Borrar columnas/tablas lo hace el usuario (a mí me lo bloquean): dejarle el SQL en el portapapeles. Lecturas: MCP de Supabase.
- Si un cambio de base rompe la versión publicada, orden: primero subir el código compatible, esperar el deploy, después cambiar la base.
- Claves: nunca pedirlas por chat; copiarlas con el botón «Copy» del servicio → `pbpaste` al `.env.local`, y vaciar el portapapeles. Cargar secretos en GitHub/Vercel lo hace el usuario (a mí me lo bloquean); se le puede dejar el valor en el portapapeles.
- No crear cuentas ni escribir contraseñas por el usuario; pedirle esos pasos.
- **App local**: correr en una pestaña de terminal propia (`npm run dev -- -p 3001`, en esta carpeta), no en el panel de vista previa. Puerto 3000 = otro proyecto (FestivaldeRock).
- Para republicar en Vercel sin cambios de código: commit vacío + push.

## Estado actual (actualizado: 2026-11-17)

**Todo está en GitHub y publicado en Vercel** (último commit: aviso de búsqueda cubierta). No hay
cambios locales pendientes. Hoy (17/11) es la **presentación**.

Funcionalidades: portal público con secciones, cuentas de candidato, Mi cuenta (estados con
mensaje y «Búsqueda finalizada»), login del equipo con Supabase Auth y roles, postulación
instantánea (IA en segundo plano), evaluación requisito por requisito con fórmula (el desglose
del cálculo NO se muestra al reclutador), editor de requisitos con «Excluyente», preguntas de
entrevista con IA (sólo en etapa de entrevista), Google Calendar con Meet, cerrar/reabrir
búsquedas, seleccionar cierra la búsqueda y avisa por mail a quienes quedaron sin respuesta (una
sola vez), CVs privados, backup diario cifrado, páginas de privacidad y términos.

## Checklist técnico — estado y respuesta corta para la entrega

1. **Modelo de datos ✅** — tablas relacionadas por id (`puesto_id`, `usuario_id`, `creado_por`); índice único contra postulaciones duplicadas; cada dato en un solo lugar (requisitos sólo en la lista, listas como jsonb). Redundancias **a propósito**: «foto» de nombre/email/teléfono/puesto al postularse (historial), `score` guardado (ordenar/métricas), `activo` + `cerrado_a` (historial). El nombre de una búsqueda puede repetirse (dos reclutadores pueden buscar el mismo rol). Falta: diagrama.
2. **Hosting ✅** — Vercel (web + APIs), Supabase (base, cuentas, archivos), GitHub (código; push a `main` → Vercel publica solo), GitHub Actions (backup).
3. **Autenticación ✅** — Supabase Auth para candidatos y equipo; rol en `app_metadata` (no lo puede cambiar el usuario); `proxy.ts` + validación en cada API.
4. **Backup ✅** — diario, cifrado, 30 días, probado; se pierde como máximo 1 día. No hay VM (Vercel es serverless); el código está en GitHub y Vercel permite volver a una versión anterior.
5. **Protección de datos ✅** — CVs privados (link de 5 min, sólo equipo), base cerrada a la clave pública, defensa contra inyección de prompts en CVs, política de privacidad (Ley 18.331). Riesgo declarado: Gemini gratis puede usar los datos.
6. **Credenciales 🟡** — claves sólo en `.env.local`, Vercel y GitHub Secrets; nunca en el repo; escaneo antes de cada push; contraseñas viejas eliminadas. **Pendiente del usuario**: rotar claves de Gemini y Resend (pasaron por el chat), activar 2FA en Vercel (Vercel lo ofrece al entrar), borrar en Vercel las variables viejas `RECLUTADOR_*`/`ADMIN_*` si siguen.
7. **Buenas prácticas ✅** — reglas en `lib/` (ver Mapa del código); el front no accede a la base ni tiene reglas propias. Mejora opcional: partir `app/dashboard/page.tsx` (~1.700 líneas).
8. **Ambientes 📝** — decisión: una sola base. DEV = local, QA = prueba local antes de cada push, PROD = Vercel. Al crecer: segundo proyecto Supabase + preview deployments de Vercel. Falta escribirlo.
9. **Escalabilidad 📝** — falta escribir: planes/costos para 100 / 1.000 / 100.000 usuarios y, si hubiera cambio de tecnología, plan de migración de datos.
10. **Stack 📝** — falta escribir (tabla de arriba).

## Próximos pasos (en orden)

1. Hoy: el usuario hace una ronda de prueba completa en Vercel antes de presentar (candidato → reclutador: evaluación, CV, entrevista + Calendar, seleccionar con aviso → admin).
2. Punto 6 (usuario): rotar claves de Gemini y Resend; 2FA en Vercel; borrar variables viejas en Vercel.
3. Dossier técnico: diagramas de arquitectura y de datos, los 10 puntos (usar «Checklist» de arriba), ambientes, escalabilidad y costos, stack; documento de entrega del grupo.
4. Opcional: verificar dominio en Resend (mails reales), automatización con n8n, partir el panel en componentes, limpiar datos de prueba viejos (búsquedas «Analista en Ecommerce» duplicadas, «Prueba borrar», 5 postulaciones sin cuenta).

Riesgos conocidos: Gemini gratis se satura (análisis de 20–30 s) y puede usar los datos de los
CVs; DEV usa la misma base que PROD; Supabase gratis se pausa tras una semana sin uso.
