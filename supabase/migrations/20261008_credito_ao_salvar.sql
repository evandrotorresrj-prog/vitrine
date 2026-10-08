-- Teste grátis: o crédito é gasto quando o carrossel é SALVO, não a cada geração da IA (08/10/2026).
-- Antes, cada "Gerar novamente" gastava 1 dos 3 carrosséis grátis.
-- Este gatilho roda no servidor em todo insert de carrossel, então o app não consegue pular o limite.
create or replace function public.debitar_credito_teste() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_usado int;
  v_limite int;
begin
  select status::text into v_status from assinaturas
   where corretor_id = new.corretor_id and status::text in ('trial', 'ativa')
   order by (status::text = 'ativa') desc limit 1;
  if v_status = 'ativa' then
    return new;                       -- assinante: sem limite
  end if;
  select trial_usado, trial_limite into v_usado, v_limite from profiles where id = new.corretor_id for update;
  if coalesce(v_usado, 0) >= coalesce(v_limite, 3) then
    raise exception 'Você já usou os % carrosséis do teste grátis. Assine um plano para continuar criando.', coalesce(v_limite, 3)
      using errcode = 'P0001';
  end if;
  update profiles set trial_usado = coalesce(trial_usado, 0) + 1 where id = new.corretor_id;
  return new;
end $$;
revoke all on function public.debitar_credito_teste() from public, anon, authenticated;

drop trigger if exists carrosseis_debitar_teste on public.carrosseis;
create trigger carrosseis_debitar_teste before insert on public.carrosseis
  for each row execute function public.debitar_credito_teste();
