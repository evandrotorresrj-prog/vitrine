-- Limpeza diária dos assuntos (08/10/2026): o botão "Gerar novas sugestões" cria 6 assuntos por clique.
-- Mantém os 200 mais recentes; os mais antigos usados em algum carrossel só são desativados, os outros são apagados.
create or replace function public.limpar_topicos() returns void
language plpgsql security definer set search_path = public as $$
begin
  with velhos as (select id from public.topicos order by created_at desc offset 200)
  update public.topicos t set ativo = false
   where t.id in (select id from velhos) and t.ativo
     and exists (select 1 from public.carrosseis c where c.topico_id = t.id);
  with velhos as (select id from public.topicos order by created_at desc offset 200)
  delete from public.topicos t
   where t.id in (select id from velhos)
     and not exists (select 1 from public.carrosseis c where c.topico_id = t.id);
end $$;
revoke all on function public.limpar_topicos() from public, anon, authenticated;

select cron.unschedule('limpar-topicos') where exists (select 1 from cron.job where jobname = 'limpar-topicos');
select cron.schedule('limpar-topicos', '17 6 * * *', 'select public.limpar_topicos()');
