-- ReplyHire — esquema completo de Supabase
-- Reconstruido a partir de lib/db.ts, lib/eventos.ts y DOCUMENTACION.md.
-- Uso: Supabase → SQL Editor → pegar todo este archivo → Run.
-- Es idempotente: se puede correr más de una vez sin romper nada.

create extension if not exists pgcrypto;

-- ─── Tabla puestos ───────────────────────────────────────────────────────────
create table if not exists public.puestos (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null default '',
  area           text not null default 'Otros',   -- sección del portal (lib/areas.ts)
  activo         boolean not null default true,    -- false = búsqueda cerrada
  cerrado_a      timestamptz,
  sobre_nosotros text default '',
  mision         text default '',
  actividades    text default '',
  modalidad      text default '',
  beneficios     text default '',
  created_at     timestamptz not null default now()
);

-- Bases creadas antes de que existiera la columna `area`.
alter table public.puestos add column if not exists area text not null default 'Otros';
alter table public.puestos add column if not exists activo boolean not null default true;
alter table public.puestos add column if not exists cerrado_a timestamptz;
-- Columnas viejas eliminadas (los requisitos viven sólo en requisitos_lista).
alter table public.puestos drop column if exists requisitos, drop column if exists salario;
-- Requisitos uno por uno: [{ "texto": "...", "excluyente": true|false }]
alter table public.puestos add column if not exists requisitos_lista jsonb not null default '[]'::jsonb;
-- Quién creó la búsqueda (cuenta del reclutador). El NOMBRE de una búsqueda puede
-- repetirse a propósito: la identidad es el id y se distinguen por su creador.
alter table public.puestos add column if not exists creado_por uuid references auth.users(id) on delete set null;
create index if not exists puestos_creado_por_idx on public.puestos (creado_por);

-- ─── Tabla candidatos ────────────────────────────────────────────────────────
-- Estados: pendiente → en_entrevista → seleccionado | rechazado_cv | rechazado_entrevista
create table if not exists public.candidatos (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null default '',
  email             text not null default '',
  telefono          text default '',
  puesto            text default '',
  puesto_id         uuid references public.puestos(id) on delete set null,
  usuario_id        uuid references auth.users(id) on delete set null,  -- cuenta del candidato (Supabase Auth)
  posible_inyeccion boolean not null default false,
  mensaje           text default '',   -- texto libre del candidato para el reclutador
  preguntas_entrevista jsonb,            -- lista de preguntas sugeridas por la IA
  analisis             text not null default 'listo',  -- procesando | listo | sin_datos | error
  entrevista_inicio    timestamptz,       -- entrevista agendada en Google Calendar
  entrevista_evento_id text default '',
  entrevista_link      text default '',
  entrevista_meet      text default '',
  cv_texto          text default '',
  cv_url            text default '',
  score             numeric default 0,
  fortalezas        jsonb default '[]'::jsonb,  -- lista de textos (un valor por elemento)
  brechas           jsonb default '[]'::jsonb,  -- lista de textos
  resumen           text default '',
  feedback          text default '',
  estado            text not null default 'pendiente',
  guardado          boolean not null default false,
  creado_a          timestamptz not null default now()
);

-- Bases creadas antes de que existiera la columna `usuario_id`.
alter table public.candidatos add column if not exists usuario_id uuid references auth.users(id) on delete set null;
alter table public.candidatos add column if not exists mensaje text default '';
alter table public.candidatos add column if not exists preguntas_entrevista jsonb;
alter table public.candidatos add column if not exists analisis text not null default 'listo';
alter table public.candidatos add column if not exists entrevista_inicio timestamptz;
alter table public.candidatos add column if not exists entrevista_evento_id text default '';
alter table public.candidatos add column if not exists entrevista_link text default '';
alter table public.candidatos add column if not exists entrevista_meet text default '';
-- Evaluación requisito por requisito: { requisitos: [...], tareas: [...], puntaje: {...} } (lib/puntaje.ts)
alter table public.candidatos add column if not exists evaluacion jsonb;
create index if not exists candidatos_usuario_id_idx on public.candidatos (usuario_id);
-- Una cuenta no puede postularse dos veces a la misma búsqueda (lo garantiza la
-- base, no sólo la app). Las postulaciones viejas sin cuenta (NULL) no chocan.
create unique index if not exists candidatos_usuario_puesto_unico on public.candidatos (usuario_id, puesto_id);

create index if not exists candidatos_creado_a_idx on public.candidatos (creado_a desc);
create index if not exists candidatos_puesto_id_idx on public.candidatos (puesto_id);

-- ─── Tabla eventos (monitoreo del panel admin) ──────────────────────────────
create table if not exists public.eventos (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null,
  detalle    text default '',
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists eventos_created_at_idx on public.eventos (created_at desc);
create index if not exists eventos_tipo_idx on public.eventos (tipo);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- RLS ACTIVADA y sin políticas: con la clave pública (anon) no se puede leer ni
-- escribir ninguna tabla. La app accede SÓLO desde el servidor con la
-- service_role key (SUPABASE_SERVICE_KEY), que no se expone al navegador.
alter table public.puestos    enable row level security;
alter table public.candidatos enable row level security;
alter table public.eventos    enable row level security;

-- ─── Storage: bucket PRIVADO "cvs" para los PDF ─────────────────────────────
-- Nadie puede abrir un CV por URL directa. Subir lo hace sólo el servidor
-- (service_role) y para verlo el panel pide un link firmado que vence en
-- 5 minutos (GET /api/candidato/cv, sólo equipo).
insert into storage.buckets (id, name, public)
values ('cvs', 'cvs', false)
on conflict (id) do update set public = false;

drop policy if exists "cvs_select_anon" on storage.objects;
drop policy if exists "cvs_insert_anon" on storage.objects;
drop policy if exists "cvs_update_anon" on storage.objects;

-- ─── Puesto de ejemplo (opcional, para poder postular apenas se levanta) ────
insert into public.puestos (nombre, area, sobre_nosotros, mision, actividades, requisitos_lista, modalidad, beneficios)
select
  'Desarrollador/a Full Stack Jr',
  'Tecnología',
  'Somos una startup uruguaya de tecnología para RRHH.',
  'Construir y mantener las funcionalidades de nuestra plataforma web.',
  'Desarrollar features en Next.js/React; crear APIs; escribir tests; participar en code reviews.',
  '[{"texto":"1+ año con JavaScript/TypeScript","excluyente":true},{"texto":"React","excluyente":false},{"texto":"Nociones de SQL","excluyente":false},{"texto":"Git","excluyente":false},{"texto":"Inglés intermedio","excluyente":false}]'::jsonb,
  'Híbrido — Montevideo',
  'Capacitación, horario flexible, cobertura médica.'
where not exists (select 1 from public.puestos);
