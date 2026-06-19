-- =====================================================================
--  BANCO DE DADOS — Controle de Perguntas e Respostas
--  ---------------------------------------------------------------------
--  Como usar:
--    1. No painel do Supabase, abra  SQL Editor
--    2. Clique em  New query
--    3. Cole TODO este conteúdo e clique em  Run
--  ---------------------------------------------------------------------
--  ATENÇÃO (segurança): as políticas abaixo deixam a tabela ABERTA —
--  qualquer pessoa com o link/chave anon poderá ler, inserir, editar e
--  excluir. Isso atende à escolha "qualquer um com o link pode editar".
--  Se um dia quiser restringir, troque as políticas por regras com
--  autenticação (veja o README).
-- =====================================================================

create extension if not exists "pgcrypto";

create table if not exists public.registros (
  id                uuid primary key default gen_random_uuid(),
  classificacao     text,
  data_protocolo    date,
  item_referente    text,
  orgao_responsavel text,
  status            text,
  pergunta          text,
  resposta          text,
  created_at        timestamptz not null default now()
);

-- Índices úteis para busca/ordenação
create index if not exists idx_registros_created_at on public.registros (created_at desc);
create index if not exists idx_registros_status     on public.registros (status);

-- Habilita Row Level Security
alter table public.registros enable row level security;

-- Políticas abertas (acesso público via chave anon)
drop policy if exists "leitura publica"     on public.registros;
drop policy if exists "insercao publica"    on public.registros;
drop policy if exists "atualizacao publica" on public.registros;
drop policy if exists "exclusao publica"    on public.registros;

create policy "leitura publica"     on public.registros for select using (true);
create policy "insercao publica"    on public.registros for insert with check (true);
create policy "atualizacao publica" on public.registros for update using (true) with check (true);
create policy "exclusao publica"    on public.registros for delete using (true);

-- Atualização em tempo real (Realtime)
do $$
begin
  alter publication supabase_realtime add table public.registros;
exception
  when duplicate_object then null;
end $$;
