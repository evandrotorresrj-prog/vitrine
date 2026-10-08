-- Memória das fotos já usadas por corretor (08/10/2026): a função buscar-imagens não repete
-- as últimas 400 fotos que o corretor já recebeu, mesmo em carrosséis diferentes.
create table if not exists public.fotos_usadas (
  id bigint generated always as identity primary key,
  corretor_id uuid not null references auth.users(id) on delete cascade,
  foto_id text not null,              -- "u<id>" (Unsplash) ou "p<id>" (Pexels)
  created_at timestamptz not null default now()
);
create index if not exists fotos_usadas_corretor_idx on public.fotos_usadas (corretor_id, created_at desc);
alter table public.fotos_usadas enable row level security;
revoke all on public.fotos_usadas from anon, authenticated;

-- limpeza: guarda só 90 dias
select cron.unschedule('limpar-fotos-usadas') where exists (select 1 from cron.job where jobname = 'limpar-fotos-usadas');
select cron.schedule('limpar-fotos-usadas', '23 6 * * *', $$delete from public.fotos_usadas where created_at < now() - interval '90 days'$$);
