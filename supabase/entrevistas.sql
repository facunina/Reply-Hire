-- ReplyHire — columnas para las entrevistas agendadas en Google Calendar.
-- Pegar en Supabase → SQL Editor → Run. Es idempotente.
alter table public.candidatos add column if not exists entrevista_inicio timestamptz;
alter table public.candidatos add column if not exists entrevista_evento_id text default '';
alter table public.candidatos add column if not exists entrevista_link text default '';
alter table public.candidatos add column if not exists entrevista_meet text default '';
