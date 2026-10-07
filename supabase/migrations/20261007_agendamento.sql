-- Publicação automática dos carrosséis agendados (07/10/2026)
-- 1) trava para não publicar o mesmo carrossel duas vezes
alter table public.carrosseis add column if not exists publicando_em timestamptz;

-- 2) a cada 5 minutos o banco chama a Edge Function publicar-agendados
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

do $$ begin
  perform cron.unschedule('publicar-agendados');
exception when others then null; end $$;

select cron.schedule(
  'publicar-agendados',
  '*/5 * * * *',
  $$ select net.http_post(
       url := 'https://qbfmozumntequvecttfs.supabase.co/functions/v1/publicar-agendados',
       headers := '{"Content-Type":"application/json"}'::jsonb,
       body := '{}'::jsonb,
       timeout_milliseconds := 120000
     ); $$
);
