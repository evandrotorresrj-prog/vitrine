-- fonte escolhida pelo corretor para os slides de cada carrossel (moderna, impacto, elegante, amigavel, futurista, classica)
alter table public.carrosseis add column if not exists fonte text not null default 'moderna';
