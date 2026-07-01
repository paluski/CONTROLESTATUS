# Controle de Perguntas e Respostas

Site para **controlar perguntas, protocolos, status e respostas**, com **importação de Excel**, abas de **Cadastro** e **Visualização**, **modal** para textos longos e visual **premium responsivo** (computador e celular).

- ✅ Importação de planilha Excel (`.xlsx`, `.xls`, `.csv`)
- ✅ Exportação para Excel e download de modelo
- ✅ **Duas visões:** Tabela e **Leitura** (sanfona agrupada por tema — clica na pergunta e a resposta abre)
- ✅ **Painel de resumo** (total, respondidas, pendentes, % concluído) e **filtros rápidos** (Todas / Respondidas / Pendentes)
- ✅ Busca com **destaque** (ignora acentos/maiúsculas) e **ordenação natural** (1.1, 1.2 … 1.10)
- ✅ **Imprimir / Salvar em PDF** e **link direto** para um item específico (`#item=…`)
- ✅ Tema claro/escuro
- ✅ Dados compartilhados online (Supabase) **ou** modo local de demonstração

> **Como o "respondida / pendente" é calculado:** um registro conta como **Respondida** quando o campo *Resposta* está preenchido, e **Pendente** quando está vazio. O painel mostra sempre a visão geral; os chips filtram a lista.

---

## 🚀 Começo rápido (modo local, sem configurar nada)

Basta abrir o arquivo **`index.html`** no navegador (duplo clique).
O site já funciona — neste modo os dados ficam **salvos apenas no seu navegador**
(ótimo para testar). O selo no topo mostrará **"Modo local"**.

> Para que **todas as pessoas vejam os mesmos dados**, siga a configuração do Supabase abaixo.

---

## 🌐 Ativar o compartilhamento online (Supabase — grátis)

### 1. Criar o projeto
1. Crie uma conta em **https://supabase.com** (plano grátis).
2. Clique em **New project**, dê um nome e defina uma senha de banco.
3. Aguarde alguns minutos até o projeto ficar pronto.

### 2. Criar a tabela
1. No menu lateral, abra **SQL Editor → New query**.
2. Copie todo o conteúdo de **`supabase/schema.sql`** e clique em **Run**.

### 3. Pegar as credenciais
1. Vá em **Project Settings → API**.
2. Copie:
   - **Project URL** (ex.: `https://abcd1234.supabase.co`)
   - **anon public** (a chave longa)

### 4. Colar no site
Abra **`js/config.js`** e preencha:

```js
SUPABASE_URL: "https://abcd1234.supabase.co",
SUPABASE_ANON_KEY: "eyJhbGciOi....(sua chave anon)",
```

Pronto! Ao recarregar, o selo no topo mostrará **"● Online"** e os dados passam a
ser compartilhados em tempo real entre todos que acessarem o site.

---

## 🔗 Publicar (deixar o site com um link compartilhável)

O site é estático (só HTML/CSS/JS), então pode ser hospedado de graça em vários lugares.
A forma mais simples:

### Opção A — Netlify (arrastar e soltar)
1. Acesse **https://app.netlify.com/drop**.
2. Arraste a **pasta inteira** do projeto para a página.
3. Em segundos você recebe um link público (ex.: `https://seu-site.netlify.app`).
4. Para atualizar depois, arraste a pasta novamente.

### Opção B — Vercel
1. Instale o app/CLI da Vercel ou conecte um repositório.
2. Faça o deploy da pasta — é detectado como site estático automaticamente.

### Opção C — GitHub Pages
1. Crie um repositório, envie os arquivos.
2. Em **Settings → Pages**, selecione o branch e a raiz (`/`).

> ⚠️ Lembre-se de **configurar o Supabase antes de publicar** (passo acima),
> senão cada visitante verá apenas os próprios dados locais.

---

## 📥 Como importar do Excel

1. Vá na aba **Cadastro → Importar Excel**.
2. (Opcional) Clique em **Baixar modelo** para obter a planilha já com as colunas certas.
3. Arraste o arquivo ou clique para selecionar.
4. Confira a **prévia** e clique em **Confirmar importação**.

A planilha deve ter as colunas (a ordem não importa; acentos e maiúsculas são ignorados):

| Coluna na planilha            | Campo            |
|-------------------------------|------------------|
| Classificação da pergunta     | classificação    |
| Data de protocolo             | data             |
| Item referente                | item             |
| Órgão responsável             | órgão            |
| Status                        | status           |
| Status Resposta               | status_resposta  |
| Pergunta                      | pergunta         |
| Resposta                      | resposta         |

Datas são reconhecidas nos formatos `dd/mm/aaaa` e `aaaa-mm-dd`.

---

## 🗂️ Estrutura dos arquivos

```
controlestatus/
├─ index.html            ← página principal
├─ css/
│  └─ styles.css         ← visual (tema claro/escuro, responsivo)
├─ js/
│  ├─ config.js          ← onde você cola as credenciais do Supabase
│  ├─ data.js            ← camada de dados (Supabase ou local)
│  └─ app.js             ← lógica da aplicação
├─ supabase/
│  └─ schema.sql         ← script para criar a tabela no banco
└─ README.md
```

---

## 🧪 Testar o Supabase localmente (opcional)

Abrir `index.html` por duplo clique funciona para o **modo local**. Para testar a
conexão com o Supabase **na sua máquina**, sirva a pasta por um servidor local
(alguns navegadores bloqueiam chamadas externas em `file://`):

```powershell
# Dentro da pasta do projeto, com Python instalado:
python -m http.server 5500
# depois abra http://localhost:5500
```

---

## 🔒 Sobre segurança

A configuração atual segue sua escolha: **qualquer pessoa com o link pode cadastrar
e editar**. A chave `anon` fica visível no código do site — isso é normal no
Supabase; quem controla o acesso são as *políticas* do banco (em `schema.sql`).

Se no futuro quiser que **só você edite** e os demais apenas visualizem, dá para:
- ativar **Authentication** no Supabase e trocar as políticas de escrita para exigir
  usuário logado (mantendo a leitura pública), ou
- restringir por uma senha simples na aba de cadastro.

É só pedir que eu ajusto.
