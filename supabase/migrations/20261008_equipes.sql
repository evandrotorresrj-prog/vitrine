-- Planos para imobiliárias (equipes de corretores) — 08/10/2026
-- O dono da imobiliária assina um plano de equipe e convida os corretores por link.
-- Cada corretor convidado ganha uma linha em `assinaturas` (status 'ativa', equipe_id preenchido),
-- então o resto da plataforma (limites, geração, fotos, agendamento) funciona sem mudança.

-- 1) planos: tipo (individual/equipe) e quantos corretores cabem
alter table public.planos add column if not exists tipo text not null default 'individual';
alter table public.planos add column if not exists max_corretores int not null default 1;

insert into public.planos (slug, nome, preco_mensal, preco_anual, recursos, destaque, ordem, tipo, max_corretores) values
  ('imob-5',  'Imobiliária 5',  447,  4470,  '["Até 5 corretores (você + 4 convidados)", "Tudo do Pro para cada corretor", "Convite dos corretores por link", "Painel da equipe"]'::jsonb, false, 10, 'equipe', 5),
  ('imob-10', 'Imobiliária 10', 797,  7970,  '["Até 10 corretores (você + 9 convidados)", "Tudo do Pro para cada corretor", "Convite dos corretores por link", "Painel da equipe"]'::jsonb, true,  11, 'equipe', 10),
  ('imob-30', 'Imobiliária 30', 1997, 19970, '["Até 30 corretores (você + 29 convidados)", "Tudo do Pro para cada corretor", "Convite dos corretores por link", "Painel da equipe"]'::jsonb, false, 12, 'equipe', 30)
on conflict (slug) do update set
  nome = excluded.nome, preco_mensal = excluded.preco_mensal, preco_anual = excluded.preco_anual,
  recursos = excluded.recursos, destaque = excluded.destaque, ordem = excluded.ordem,
  tipo = excluded.tipo, max_corretores = excluded.max_corretores;

-- o Pro dizia "Até 3 usuários na conta", mas isso nunca existiu: agora equipe é nos planos de imobiliária
update public.planos
   set recursos = '["Tudo do Starter", "Agendamento automático no Instagram", "Geração de imagem + texto prioritária", "1 corretor (equipes: veja os planos para imobiliárias)"]'::jsonb
 where slug = 'pro';

-- 2) equipes e membros (só o servidor acessa; o app conversa pela Edge Function `equipe`)
create table if not exists public.equipes (
  id uuid primary key default gen_random_uuid(),
  dono_id uuid not null unique references auth.users(id) on delete cascade,
  nome text,
  plano_id uuid references public.planos(id),
  max_corretores int not null default 5,
  ativa boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.equipe_membros (
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references public.equipes(id) on delete cascade,
  email text not null,
  corretor_id uuid references auth.users(id) on delete set null,
  status text not null default 'convidado' check (status in ('convidado', 'ativo', 'removido')),
  token text not null unique,
  created_at timestamptz not null default now(),
  aceito_em timestamptz
);
create unique index if not exists equipe_membros_email_uidx on public.equipe_membros (equipe_id, lower(email)) where status <> 'removido';
create unique index if not exists equipe_membros_corretor_uidx on public.equipe_membros (corretor_id) where status = 'ativo';

alter table public.equipes enable row level security;
alter table public.equipe_membros enable row level security;
revoke all on public.equipes, public.equipe_membros from anon, authenticated;

-- 3) a assinatura do corretor convidado aponta pra equipe
alter table public.assinaturas add column if not exists equipe_id uuid references public.equipes(id) on delete set null;
