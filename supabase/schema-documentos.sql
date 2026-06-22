-- =====================================================================
--  MODELO RELACIONAL — Documentos cadastráveis com itens/subitens
--  ---------------------------------------------------------------------
--  Rode no SQL Editor do Supabase (depois do schema.sql principal).
--  Cria as tabelas "documentos" e "itens" (árvore com profundidade
--  livre) e adiciona o vínculo nas perguntas (documento_id, item_id).
--  Seguro: usa IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- DOCUMENTOS ----------
create table if not exists public.documentos (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,        -- ex.: "Instruções de Cadastramento (SAE)"
  sigla      text,                 -- ex.: "EPE-DEE-RE-079/2024-R2"
  tipo       text,                 -- ex.: Instruções / Portaria / Resolução
  orgao      text,                 -- ex.: EPE / MME / ANEEL / ONS
  ano        int,
  created_at timestamptz not null default now()
);

-- ---------- ITENS (árvore: item › subitem › … ) ----------
create table if not exists public.itens (
  id           uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.documentos(id) on delete cascade,
  parent_id    uuid references public.itens(id) on delete cascade,
  codigo       text,               -- "4.1", "Art. 16", "ANEXO I"
  titulo       text,
  ordem        int default 0,
  created_at   timestamptz not null default now()
);
create index if not exists idx_itens_documento on public.itens(documento_id);
create index if not exists idx_itens_parent    on public.itens(parent_id);

-- ---------- VÍNCULO NAS PERGUNTAS ----------
alter table public.registros add column if not exists documento_id uuid references public.documentos(id) on delete set null;
alter table public.registros add column if not exists item_id      uuid references public.itens(id)      on delete set null;
create index if not exists idx_registros_documento_id on public.registros(documento_id);
create index if not exists idx_registros_item_id      on public.registros(item_id);

-- ---------- RLS (abertas, como nas demais tabelas) ----------
alter table public.documentos enable row level security;
alter table public.itens      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['documentos','itens'] loop
    execute format('drop policy if exists "leitura publica" on public.%I', t);
    execute format('drop policy if exists "insercao publica" on public.%I', t);
    execute format('drop policy if exists "atualizacao publica" on public.%I', t);
    execute format('drop policy if exists "exclusao publica" on public.%I', t);
    execute format('create policy "leitura publica" on public.%I for select using (true)', t);
    execute format('create policy "insercao publica" on public.%I for insert with check (true)', t);
    execute format('create policy "atualizacao publica" on public.%I for update using (true) with check (true)', t);
    execute format('create policy "exclusao publica" on public.%I for delete using (true)', t);
  end loop;
end $$;

-- ---------- Realtime ----------
do $$
begin
  alter publication supabase_realtime add table public.documentos;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.itens;
exception when duplicate_object then null; end $$;
