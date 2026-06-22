-- =====================================================================
--  MIGRAÇÃO INICIAL — novo modelo (Documento › Capítulo › Pergunta)
--  ---------------------------------------------------------------------
--  O que faz:
--    1. Adiciona as colunas "documento" e "capitulo" (se ainda não existirem).
--    2. Organiza os registros já cadastrados: define o Documento e move o
--       tema que estava em "Classificação" para "Capítulo".
--
--  Como usar:  SQL Editor ▸ New query ▸ cole tudo ▸ Run.
--  É SEGURO: não apaga registros. Roda uma única vez (o passo 2 só afeta
--  linhas ainda não migradas, graças ao "where documento is null").
-- =====================================================================

-- 1) Garante as novas colunas
alter table public.registros add column if not exists documento text;
alter table public.registros add column if not exists capitulo  text;

-- 2) Organiza os registros existentes
update public.registros
set documento     = 'LRCAP 2026 – Armazenamento',  -- nome do documento
    capitulo      = classificacao,                  -- o tema vira o capítulo
    classificacao = null                            -- "Tipo da pergunta" fica livre p/ uso futuro
where documento is null;

-- Conferência (opcional): quantas perguntas por capítulo
-- select capitulo, count(*) from public.registros group by capitulo order by capitulo;
