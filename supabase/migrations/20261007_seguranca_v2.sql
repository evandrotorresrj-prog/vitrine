-- Revisão de segurança 07/10/2026
-- 1) instagram_contas: o cliente só LÊ. Antes a policy era ALL (o usuário podia gravar status/ID da conta
--    direto pela API REST). Toda escrita já é feita pelas Edge Functions (service role).
drop policy if exists "usuário vê e edita a própria conta do instagram" on public.instagram_contas;
drop policy if exists "usuário vê a própria conta do instagram" on public.instagram_contas;
create policy "usuário vê a própria conta do instagram" on public.instagram_contas
  for select to authenticated using (auth.uid() = corretor_id);
revoke insert, update, delete on public.instagram_contas from anon, authenticated;
-- coluna antiga: o token fica só em instagram_tokens (sem acesso pelo cliente)
update public.instagram_contas set access_token = null where access_token is not null;

-- 2) visitante sem login (anon) nunca escreve em nada; e ninguém pelo cliente usa TRUNCATE/TRIGGER/REFERENCES
revoke insert, update, delete, truncate, trigger, references on all tables in schema public from anon;
revoke truncate, trigger, references on all tables in schema public from authenticated;

-- 3) Storage: só imagens e vídeo, no máximo 50 MB por arquivo (impede hospedar HTML/SVG no bucket público)
update storage.buckets
   set allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4'],
       file_size_limit = 52428800
 where id = 'slides-render';

-- 4) limite de uso da busca de fotos (protege a cota do Unsplash e o custo da IA)
create table if not exists public.buscas_imagens_log (
  id uuid primary key default gen_random_uuid(),
  corretor_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists buscas_imagens_log_corretor_idx on public.buscas_imagens_log (corretor_id, created_at desc);
alter table public.buscas_imagens_log enable row level security;  -- sem policies: só o servidor acessa
revoke all on public.buscas_imagens_log from anon, authenticated;
