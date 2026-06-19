/* =====================================================================
 *  CONFIGURAÇÃO
 *  ---------------------------------------------------------------------
 *  Para ATIVAR o compartilhamento online (todos veem os mesmos dados),
 *  preencha os dois campos abaixo com os dados do seu projeto Supabase:
 *
 *    1. Crie uma conta grátis em https://supabase.com
 *    2. Crie um projeto (New project)
 *    3. Vá em  Project Settings ▸ API
 *    4. Copie a "Project URL" para SUPABASE_URL
 *    5. Copie a chave "anon public" para SUPABASE_ANON_KEY
 *    6. Rode o conteúdo de  supabase/schema.sql  no SQL Editor do Supabase
 *
 *  Enquanto estes campos estiverem vazios, o site funciona em MODO LOCAL
 *  (os dados ficam salvos apenas no navegador de quem está usando).
 * ===================================================================== */

window.APP_CONFIG = {
  // Cole aqui a URL do projeto (ex.: "https://abcdxyz.supabase.co")
  SUPABASE_URL: "https://whymkugcxklgeefghpok.supabase.co",

  // Cole aqui a chave "anon public"
  SUPABASE_ANON_KEY: "sb_publishable_FUi97JZ7rdkaZ4P15svGBg_u4v-vMCI",

  // Nome da tabela no banco (não precisa alterar)
  TABLE: "registros",

  // Nome que aparece no topo do site
  APP_TITLE: "Controle de Perguntas",
  APP_SUBTITLE: "Protocolos, status e respostas",
};
