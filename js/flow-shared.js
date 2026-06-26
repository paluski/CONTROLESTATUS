/* =====================================================================
 *  CAMADA COMPARTILHADA — Perguntas × Fluxograma LRCAP-2026
 *  ---------------------------------------------------------------------
 *  Usado pela página de Cadastro (index.html) e pelo Fluxograma
 *  (mapamental/fluxograma_lrcap.html). Não duplica dados: só define a
 *  taxonomia de blocos/documentos do fluxograma e funções utilitárias
 *  que ambas as páginas precisam compartilhar.
 *
 *    window.isAnswered(reg)      -> true se a pergunta tem resposta
 *    window.flowSlug(texto)      -> slug estável (sem acento, kebab-case)
 *    window.FLOW_TOPICS          -> [{id, label, docs:[{id,label}]}, ...]
 *                                   na mesma ordem/rótulos das etapas do
 *                                   fluxograma (ver STEPS em fluxograma_lrcap.html)
 * ===================================================================== */

(function () {
  /* Mesma regra usada no restante do app: respondida = campo resposta preenchido. */
  function isAnswered(r) {
    return !!(r && r.resposta && String(r.resposta).trim());
  }

  function flowSlug(text) {
    return String(text || "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  const RAW_TOPICS = [
    { id: "prospeccao", label: "Prospecção e Análise de Viabilidade",
      docs: ["Identificação da área", "Estudo técnico preliminar", "Ponto de conexão", "Tecnologia SAE"] },
    { id: "juridico", label: "Constituição Jurídica da Empresa / SPE",
      docs: ["Contrato social", "CNPJ", "Representação legal", "Organograma societário"] },
    { id: "fundiario", label: "Processo Fundiário — Área do Empreendimento",
      docs: ["Matrícula RGI", "Georreferenciamento INCRA", "Escritura / Arrendamento", "Certidão inteiro teor", "Declaração Anexo VI"] },
    { id: "ambiental", label: "Licenciamento Ambiental",
      docs: ["Licença Prévia (LP)", "Licença de Instalação (LI)", "Licença de Operação (LO)", "EIA/RAS"] },
    { id: "aneel", label: "Outorga de Autorização (ANEEL)",
      docs: ["DRO-SAE (opc.)", "Qualificação Jurídica", "Qualificação Técnica", "Licença Ambiental", "Outorga 35 anos"] },
    { id: "conexao-distribuicao", label: "Processo de Conexão — Distribuição",
      docs: ["Pedido de acesso", "Estudo distribuidora", "DAL / Orç. Conexão", "CUSD + CCD", "Faixa de servidão"] },
    { id: "conexao-transmissao", label: "Processo de Conexão — Rede Básica / Transmissão",
      docs: ["Pedido ao ONS", "Parecer de Acesso ONS", "CUST", "LT / Subestação", "Faixa de servidão"] },
    { id: "epe-precadastro", label: "Pré-Cadastro EPE — Sistema AEGE",
      docs: ["Adesão AEGE", "Login e senha", "Dados do empreendedor", "Inscrição LRCAP-2026", "Campos azuis"] },
    { id: "epe-cadastro-tecnico", label: "Cadastramento Técnico EPE",
      docs: ["Memorial A — Tecnologia", "Memorial B–F", "Ficha de Dados AEGE", "Doc. Acesso", "Direito de Uso", "Decl. CN"] },
    { id: "epe-habilitacao", label: "Análise Técnica e Habilitação EPE",
      docs: ["Análise EPE", "Complementação (se solicitada)", "Habilitação Técnica", "CEG gerado", "Recurso (se necessário)"] },
    { id: "leilao", label: "Leilão LRCAP-2026",
      docs: ["Data do leilão", "Garantia de proposta", "Lances (leilão)", "CRCAP assinado"] },
    { id: "implantacao", label: "Implantação e Início da Operação Comercial",
      docs: ["Comunicar início de obras", "Marcos de implantação", "Operação em teste", "COD — Operação Comercial", "Fiscalização ANEEL"] },
  ];

  const FLOW_TOPICS = RAW_TOPICS.map((t) => ({
    id: t.id,
    label: t.label,
    docs: t.docs.map((label) => ({ id: `${t.id}__${flowSlug(label)}`, label })),
  }));

  window.isAnswered = isAnswered;
  window.flowSlug = flowSlug;
  window.FLOW_TOPICS = FLOW_TOPICS;
})();
