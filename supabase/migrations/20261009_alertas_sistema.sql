-- Alertas do sistema pro dono da plataforma (09/10/2026).
-- Ex.: "ia_sem_credito" quando a conta da Anthropic fica sem saldo. As edge functions gravam aqui
-- (service role) e o painel Admin mostra uma faixa vermelha até o problema ser resolvido.
create table if not exists public.alertas_sistema (
  id bigint generated always as identity primary key,
  tipo text not null,                 -- ia_sem_credito, ia_config, ...
  mensagem text not null,
  origem text,                        -- nome da função que detectou
  ocorrencias int not null default 1,
  created_at timestamptz not null default now(),
  ultima_em timestamptz not null default now(),
  resolvido_em timestamptz
);
-- no máximo 1 alerta aberto por tipo (os repetidos só somam "ocorrencias")
create unique index if not exists alertas_sistema_aberto_uk on public.alertas_sistema (tipo) where resolvido_em is null;
alter table public.alertas_sistema enable row level security;
revoke all on public.alertas_sistema from anon, authenticated;

-- grava ou soma no alerta aberto do mesmo tipo
create or replace function public.registrar_alerta(p_tipo text, p_mensagem text, p_origem text)
returns void language sql security definer set search_path = public as $$
  insert into alertas_sistema (tipo, mensagem, origem) values (p_tipo, p_mensagem, p_origem)
  on conflict (tipo) where resolvido_em is null
  do update set ocorrencias = alertas_sistema.ocorrencias + 1, ultima_em = now(), mensagem = excluded.mensagem, origem = excluded.origem;
$$;
-- fecha alertas abertos de um tipo (chamado quando a IA volta a responder)
create or replace function public.resolver_alerta(p_tipo text)
returns void language sql security definer set search_path = public as $$
  update alertas_sistema set resolvido_em = now() where tipo = p_tipo and resolvido_em is null;
$$;
revoke all on function public.registrar_alerta(text, text, text) from public, anon, authenticated;
revoke all on function public.resolver_alerta(text) from public, anon, authenticated;

-- limpeza: alertas resolvidos há mais de 90 dias
select cron.unschedule('limpar-alertas') where exists (select 1 from cron.job where jobname = 'limpar-alertas');
select cron.schedule('limpar-alertas', '29 6 * * *', $$delete from public.alertas_sistema where resolvido_em < now() - interval '90 days'$$);
