-- =====================================================================
--  VÍNCULO ENTRE PERGUNTAS E O FLUXOGRAMA LRCAP-2026
--  ---------------------------------------------------------------------
--  Rode no SQL Editor do Supabase (depois do schema.sql e do
--  schema-documentos.sql). Adiciona à tabela "registros" os campos
--  necessários para que o Fluxograma (mapamental/fluxograma_lrcap.html)
--  consiga listar as perguntas de cada etapa, sem criar tabela nova.
--
--    topico_fluxo      -> id do bloco do fluxograma (ex.: "fundiario")
--                         ou do bloco + documento lateral
--                         (ex.: "fundiario__matricula-rgi")
--    numero_protocolo  -> número de protocolo externo da pergunta,
--                         quando existir (texto livre)
--  Seguro: usa ADD COLUMN IF NOT EXISTS.
-- =====================================================================

alter table public.registros add column if not exists topico_fluxo     text;
alter table public.registros add column if not exists numero_protocolo text;

create index if not exists idx_registros_topico_fluxo on public.registros(topico_fluxo);
