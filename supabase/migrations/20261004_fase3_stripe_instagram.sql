-- ============================================================
-- Vitrine · Fase 3 — Stripe + Instagram (Meta Graph API)
-- Rodar no SQL Editor do Supabase (idempotente: pode rodar 2x).
-- IMPORTANTE: segredos (Stripe Secret Key, Meta App Secret) NÃO vão em tabela —
-- ficam em Supabase > Edge Functions > Secrets.
-- ============================================================

-- ---------- STRIPE ----------
alter table public.assinaturas
  add column if not exists stripe_customer_id         text,
  add column if not exists stripe_subscription_id     text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists periodo                    text,
  add column if not exists periodo_fim                timestamptz;

create unique index if not exists assinaturas_stripe_sub_uidx
  on public.assinaturas (stripe_subscription_id) where stripe_subscription_id is not null;

-- cliente Stripe fica no perfil pra ser reaproveitado em novas assinaturas
alter table public.profiles
  add column if not exists stripe_customer_id text;

-- log de eventos (idempotência: o Stripe pode reenviar o mesmo evento)
create table if not exists public.stripe_webhooks (
  id           text primary key,            -- event.id do Stripe
  tipo         text not null,
  payload      jsonb not null,
  processado   boolean not null default false,
  erro         text,
  created_at   timestamptz not null default now()
);
alter table public.stripe_webhooks enable row level security;   -- sem policies: só service role acessa

-- ---------- INSTAGRAM ----------
-- tokens ficam numa tabela separada, SEM acesso pelo cliente (o frontend só lê instagram_contas)
alter table public.instagram_contas
  add column if not exists connected_at     timestamptz,
  add column if not exists token_expires_at timestamptz,
  add column if not exists facebook_page_id text;

create table if not exists public.instagram_tokens (
  corretor_id      uuid primary key references public.profiles(id) on delete cascade,
  access_token     text not null,          -- token de página (long-lived) usado pra publicar
  user_token       text,                   -- token de usuário long-lived (60 dias)
  expires_at       timestamptz,
  updated_at       timestamptz not null default now()
);
alter table public.instagram_tokens enable row level security;  -- sem policies: só service role

-- state anti-CSRF do OAuth (gerado antes do redirect, validado no callback)
create table if not exists public.instagram_oauth_states (
  state       text primary key,
  corretor_id uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);
alter table public.instagram_oauth_states enable row level security;

create table if not exists public.instagram_webhooks (
  id          bigserial primary key,
  objeto      text,
  payload     jsonb not null,
  created_at  timestamptz not null default now()
);
alter table public.instagram_webhooks enable row level security;

-- id do post no Instagram no carrossel publicado
alter table public.carrosseis
  add column if not exists instagram_media_id text,
  add column if not exists instagram_permalink text,
  add column if not exists erro_publicacao text;

-- imagem final (JPEG público) de cada slide — o Instagram só aceita imagem, não HTML.
-- preenchida quando o frontend renderiza os slides e sobe pro Storage (bucket público "slides-render").
alter table public.slides
  add column if not exists render_url text;
insert into storage.buckets (id, name, public)
  values ('slides-render', 'slides-render', true)
  on conflict (id) do nothing;
-- dono pode subir arquivos na pasta com o próprio id: slides-render/<uid>/...
drop policy if exists "slides-render upload dono" on storage.objects;
create policy "slides-render upload dono" on storage.objects for insert to authenticated
  with check (bucket_id = 'slides-render' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- STATUS DA ASSINATURA ----------
-- libera os novos status usados pelo webhook ('cancelada', 'inadimplente').
-- remove qualquer CHECK antigo sobre assinaturas.status e recria com a lista completa.
do $$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.assinaturas'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%status%'
  loop execute format('alter table public.assinaturas drop constraint %I', r.conname); end loop;
end $$;
alter table public.assinaturas
  add constraint assinaturas_status_check check (status in ('trial','ativa','inadimplente','cancelada')) not valid;
-- "not valid" = não quebra se já existirem linhas antigas com outro status; vale para as novas.
