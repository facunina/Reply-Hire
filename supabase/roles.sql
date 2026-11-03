-- ReplyHire — cuentas del EQUIPO (reclutador / admin) con Supabase Auth
--
-- PASO 1 (en el panel de Supabase, no acá):
--   Authentication → Users → Add user → Create new user
--   Crear dos cuentas (email + contraseña, con "Auto Confirm User" marcado):
--     · reclutador@replyhire.test
--     · admin@replyhire.test
--   (Si usan otros emails, cámbienlos también abajo.)
--
-- PASO 2: pegar TODO este archivo en Supabase → SQL Editor → Run.
--
-- El rol queda en app_metadata, que el usuario NO puede modificar desde la app.
-- Una cuenta sin rol es un candidato. Es idempotente: se puede correr de nuevo.

-- Columna para guardar las preguntas de entrevista que genera la IA.
alter table public.candidatos add column if not exists preguntas_entrevista text default '';

-- Roles del equipo.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"rol": "reclutador"}'
where email = 'reclutador@replyhire.test';

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"rol": "admin"}'
where email = 'admin@replyhire.test';

-- Verificación: tienen que aparecer las dos cuentas con su rol.
select email, raw_app_meta_data ->> 'rol' as rol
from auth.users
where raw_app_meta_data ? 'rol';
