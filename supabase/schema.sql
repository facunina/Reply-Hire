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
  sobre_nosotros text default '',
  mision         text default '',
  actividades    text default '',
  requisitos     text default '',
  modalidad      text default '',
  beneficios     text default '',
  salario        text default '',
  created_at     timestamptz not null default now()
);

-- Bases creadas antes de que existiera la columna `area`.
alter table public.puestos add column if not exists area text not null default 'Otros';

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
  preguntas_entrevista text default '',  -- JSON con las preguntas sugeridas por la IA
  cv_texto          text default '',
  cv_url            text default '',
  score             numeric default 0,
  fortalezas        text default '',   -- items separados por " | "
  brechas           text default '',   -- items separados por " | "
  resumen           text default '',
  feedback          text default '',
  estado            text not null default 'pendiente',
  guardado          boolean not null default false,
  creado_a          timestamptz not null default now()
);

-- Bases creadas antes de que existiera la columna `usuario_id`.
alter table public.candidatos add column if not exists usuario_id uuid references auth.users(id) on delete set null;
alter table public.candidatos add column if not exists mensaje text default '';
alter table public.candidatos add column if not exists preguntas_entrevista text default '';
create index if not exists candidatos_usuario_id_idx on public.candidatos (usuario_id);

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
-- La app accede SOLO desde el servidor (API routes) con la anon key, igual que
-- el proyecto original ("RLS desactivada"). Ver limitaciones en DOCUMENTACION.md §14.
alter table public.puestos    disable row level security;
alter table public.candidatos disable row level security;
alter table public.eventos    disable row level security;

-- ─── Storage: bucket público "cvs" para los PDF ─────────────────────────────
insert into storage.buckets (id, name, public)
values ('cvs', 'cvs', true)
on conflict (id) do update set public = true;

drop policy if exists "cvs_select_anon" on storage.objects;
drop policy if exists "cvs_insert_anon" on storage.objects;
drop policy if exists "cvs_update_anon" on storage.objects;

create policy "cvs_select_anon" on storage.objects
  for select to anon, authenticated using (bucket_id = 'cvs');

create policy "cvs_insert_anon" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'cvs');

-- upsert: true en subirCV() necesita también UPDATE
create policy "cvs_update_anon" on storage.objects
  for update to anon, authenticated using (bucket_id = 'cvs') with check (bucket_id = 'cvs');

-- ─── Puesto de ejemplo (opcional, para poder postular apenas se levanta) ────
insert into public.puestos (nombre, area, sobre_nosotros, mision, actividades, requisitos, modalidad, beneficios)
select
  'Desarrollador/a Full Stack Jr',
  'Tecnología',
  'Somos una startup uruguaya de tecnología para RRHH.',
  'Construir y mantener las funcionalidades de nuestra plataforma web.',
  'Desarrollar features en Next.js/React; crear APIs; escribir tests; participar en code reviews.',
  '1+ año con JavaScript/TypeScript; React; nociones de SQL; Git; inglés intermedio.',
  'Híbrido — Montevideo',
  'Capacitación, horario flexible, cobertura médica.'
where not exists (select 1 from public.puestos);
