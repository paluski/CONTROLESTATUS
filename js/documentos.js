/* =====================================================================
 *  MÓDULO: Controle por Documentos
 * ===================================================================== */

(function () {
  /* ---------- estado ---------- */
  let docs          = [];
  let allItens      = [];
  let allRegs       = [];
  let currentDocId  = null;
  let editingDocId  = null;
  let editingItemId = null;
  const collapsed   = new Set(); // números de itens colapsados

  const $ = id => document.getElementById(id);

  /* ===================== INIT ===================== */
  function init() {
    document.querySelector('[data-tab="docs"]').addEventListener("click", onTabActivated);

    /* painel principal */
    $("addDocBtn").addEventListener("click", () => openDocModal());

    /* modal detalhe do documento */
    $("docDetailModalClose").addEventListener("click", closeDetailModal);
    $("docDetailModal").addEventListener("click", e => { if (e.target === $("docDetailModal")) closeDetailModal(); });
    $("ddAddItemBtn").addEventListener("click",  () => openItemModal());
    $("ddEditDocBtn").addEventListener("click",  () => openDocModal(docs.find(d => d.id === currentDocId)));
    $("ddDeleteDocBtn").addEventListener("click", confirmDeleteDoc);
    $("ddExpandAll").addEventListener("click",   () => { collapsed.clear(); renderDetailTree(); });
    $("ddCollapseAll").addEventListener("click", () => {
      getParentNums().forEach(n => collapsed.add(n));
      renderDetailTree();
    });

    /* modal documento (criar/editar) */
    $("docModalClose").addEventListener("click",  closeDocModal);
    $("docModalCancel").addEventListener("click", closeDocModal);
    $("docModalSave").addEventListener("click",   saveDoc);
    $("docModal").addEventListener("click", e => { if (e.target === $("docModal")) closeDocModal(); });

    /* modal item */
    $("itemModalClose").addEventListener("click",  closeItemModal);
    $("itemModalCancel").addEventListener("click", closeItemModal);
    $("itemModalSave").addEventListener("click",   saveItem);
    $("itemModal").addEventListener("click", e => { if (e.target === $("itemModal")) closeItemModal(); });

    /* Enter nos inputs */
    $("f_doc_titulo").addEventListener("keydown",  e => { if (e.key === "Enter") { e.preventDefault(); saveDoc(); } });
    $("f_item_numero").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("f_item_titulo").focus(); } });
    $("f_item_titulo").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); saveItem(); } });
  }

  /* ===================== CARREGAMENTO ===================== */
  async function load() {
    try {
      [docs, allItens, allRegs] = await Promise.all([
        DocumentStore.listDocs(),
        DocumentStore.listItens(null),
        DataStore.list(),
      ]);
      populateItemDatalist();
    } catch (e) {
      console.error("Erro ao carregar documentos:", e);
    }
  }

  async function onTabActivated() {
    await load();
    renderDocList();
  }

  /* datalist do campo "item referente" no form de registro */
  function populateItemDatalist() {
    const dl = $("dl_item");
    if (!dl) return;
    dl.innerHTML = "";
    allItens.forEach(it => {
      const opt = document.createElement("option");
      opt.value = it.numero;
      opt.label = it.titulo;
      dl.appendChild(opt);
    });
  }

  /* ===================== LISTA DE DOCUMENTOS ===================== */
  function renderDocList() {
    const list  = $("docsList");
    const empty = $("docsEmpty");

    if (!docs.length) { list.innerHTML = ""; empty.hidden = false; return; }
    empty.hidden = true;

    list.innerHTML = docs.map(doc => {
      const itemCount = allItens.filter(it => it.documento_id === doc.id).length;
      const qCount    = countQuestionsForDoc(doc.id);
      return `
        <div class="doc-card" data-id="${doc.id}">
          <div class="doc-card-title">${esc(doc.titulo)}</div>
          ${doc.descricao ? `<div class="doc-card-desc">${esc(doc.descricao)}</div>` : ""}
          <div class="doc-card-meta">
            <span>📋 ${itemCount} ${itemCount === 1 ? "item" : "itens"}</span>
            <span>❓ ${qCount} ${qCount === 1 ? "pergunta" : "perguntas"}</span>
          </div>
          <div class="doc-card-actions">
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); DocumentUI.editDoc('${doc.id}')">Editar</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="event.stopPropagation(); DocumentUI.deleteDoc('${doc.id}')">Excluir</button>
          </div>
        </div>`;
    }).join("");

    list.querySelectorAll(".doc-card").forEach(card => {
      card.addEventListener("click", () => openDetailModal(card.dataset.id));
    });
  }

  function countQuestionsForDoc(docId) {
    const nums = new Set(allItens.filter(it => it.documento_id === docId).map(it => it.numero));
    return allRegs.filter(r => nums.has((r.item_referente || "").trim())).length;
  }

  /* ===================== MODAL DE DETALHE ===================== */
  async function openDetailModal(docId) {
    currentDocId = docId;
    collapsed.clear();
    await load();
    const doc = docs.find(d => d.id === docId);
    if (!doc) return;

    $("docDetailModalTitle").textContent = doc.titulo;
    $("docDetailModalDesc").textContent  = doc.descricao || "";
    $("docDetailModalDesc").hidden       = !doc.descricao;
    $("docDetailModal").hidden = false;
    renderDetailTree();
  }

  function closeDetailModal() {
    $("docDetailModal").hidden = true;
    currentDocId = null;
  }

  /* obtém os números de nível raiz que têm filhos (candidatos a colapso) */
  function getParentNums() {
    const itens = allItens.filter(it => it.documento_id === currentDocId);
    const hasChild = new Set();
    itens.forEach(it => {
      const parts = it.numero.split(".");
      if (parts.length > 1) hasChild.add(parts.slice(0, -1).join("."));
    });
    return hasChild;
  }

  function renderDetailTree() {
    const itens = allItens
      .filter(it => it.documento_id === currentDocId)
      .sort((a, b) => a.numero.localeCompare(b.numero, undefined, { numeric: true }));

    const tree  = $("ddItemsTree");
    const empty = $("ddItemsEmpty");
    const colBar = $("ddCollapseBar");

    if (!itens.length) { tree.innerHTML = ""; empty.hidden = false; colBar.hidden = true; return; }
    empty.hidden = false; // keep space
    empty.hidden = true;

    const parentNums = getParentNums();
    colBar.hidden = parentNums.size === 0;

    /* determina quais itens ficam visíveis (pai colapsado oculta filhos) */
    function isHidden(numero) {
      const parts = numero.split(".");
      for (let i = 1; i < parts.length; i++) {
        if (collapsed.has(parts.slice(0, i).join("."))) return true;
      }
      return false;
    }

    tree.innerHTML = itens.map(it => {
      const level    = it.numero.split(".").length;
      const isParent = parentNums.has(it.numero);
      const hidden   = isHidden(it.numero);
      const open     = isParent && !collapsed.has(it.numero);
      const qCount   = allRegs.filter(r => (r.item_referente || "").trim() === it.numero).length;

      const qBadge = qCount > 0
        ? `<span class="item-qcount has-questions" title="Ver perguntas" onclick="DocumentUI.filterByItem('${esc(it.numero)}')">${qCount} ${qCount === 1 ? "pergunta" : "perguntas"}</span>`
        : `<span class="item-qcount no-questions">sem perguntas</span>`;

      const chevron = isParent
        ? `<button class="dd-toggle" data-num="${esc(it.numero)}" title="${open ? "Recolher" : "Expandir"}" aria-expanded="${open}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(${open ? 0 : -90}deg);transition:transform .2s"><path d="m6 9 6 6 6-6"/></svg>
           </button>`
        : `<span class="dd-toggle-spacer"></span>`;

      return `<div class="dd-item" data-level="${Math.min(level, 4)}" data-num="${esc(it.numero)}" ${hidden ? 'style="display:none"' : ''}>
        ${chevron}
        <span class="item-numero">${esc(it.numero)}</span>
        <span class="item-titulo">${esc(it.titulo)}</span>
        ${qBadge}
        <div class="item-actions">
          <button class="row-btn" title="Editar item" onclick="DocumentUI.editItem('${it.id}')">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
          </button>
          <button class="row-btn danger" title="Excluir item" onclick="DocumentUI.deleteItem('${it.id}')">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </div>`;
    }).join("");

    /* eventos dos botões de colapso */
    tree.querySelectorAll(".dd-toggle").forEach(btn => {
      btn.addEventListener("click", () => {
        const num = btn.dataset.num;
        if (collapsed.has(num)) collapsed.delete(num);
        else collapsed.add(num);
        renderDetailTree();
      });
    });
  }

  /* ===================== MODAL: DOCUMENTO (criar/editar) ===================== */
  function openDocModal(doc) {
    editingDocId = doc ? doc.id : null;
    $("docModalTitle").textContent = doc ? "Editar documento" : "Novo documento";
    $("f_doc_titulo").value    = doc ? doc.titulo : "";
    $("f_doc_descricao").value = doc ? (doc.descricao || "") : "";
    $("docModal").hidden = false;
    setTimeout(() => $("f_doc_titulo").focus(), 60);
  }

  function closeDocModal() {
    $("docModal").hidden = true;
    editingDocId = null;
  }

  async function saveDoc() {
    const titulo    = $("f_doc_titulo").value.trim();
    const descricao = $("f_doc_descricao").value.trim();
    if (!titulo) { $("f_doc_titulo").focus(); return; }

    try {
      if (editingDocId) {
        await DocumentStore.updateDoc(editingDocId, { titulo, descricao });
        toast("Documento atualizado.", "success");
      } else {
        await DocumentStore.createDoc({ titulo, descricao });
        toast("Documento criado.", "success");
      }
      closeDocModal();
      await load();
      renderDocList();
      /* atualiza cabeçalho do modal de detalhe se estiver aberto */
      if (editingDocId && currentDocId === editingDocId && !$("docDetailModal").hidden) {
        const doc = docs.find(d => d.id === editingDocId);
        if (doc) {
          $("docDetailModalTitle").textContent = doc.titulo;
          $("docDetailModalDesc").textContent  = doc.descricao || "";
          $("docDetailModalDesc").hidden       = !doc.descricao;
        }
      }
    } catch (e) {
      toast("Erro ao salvar documento: " + e.message, "error");
    }
  }

  /* ===================== MODAL: ITEM ===================== */
  function openItemModal(item) {
    editingItemId = item ? item.id : null;
    $("itemModalTitle").textContent = item ? "Editar item" : "Novo item";
    $("f_item_numero").value = item ? item.numero : "";
    $("f_item_titulo").value = item ? item.titulo : "";
    $("itemModal").hidden = false;
    setTimeout(() => $("f_item_numero").focus(), 60);
  }

  function closeItemModal() {
    $("itemModal").hidden = true;
    editingItemId = null;
  }

  async function saveItem() {
    const numero = $("f_item_numero").value.trim();
    const titulo = $("f_item_titulo").value.trim();
    if (!numero) { $("f_item_numero").focus(); return; }
    if (!titulo) { $("f_item_titulo").focus(); return; }

    try {
      if (editingItemId) {
        await DocumentStore.updateItem(editingItemId, { numero, titulo });
        toast("Item atualizado.", "success");
      } else {
        await DocumentStore.createItem({ documento_id: currentDocId, numero, titulo });
        toast("Item adicionado.", "success");
      }
      closeItemModal();
      await load();
      renderDetailTree();
    } catch (e) {
      toast("Erro ao salvar item: " + e.message, "error");
    }
  }

  /* ===================== EXCLUSÕES ===================== */
  function confirmDeleteDoc() {
    const doc = docs.find(d => d.id === currentDocId);
    if (!doc) return;
    if (!confirm(`Excluir o documento "${doc.titulo}" e todos os seus itens?\nEsta ação não pode ser desfeita.`)) return;
    deleteDocById(currentDocId);
  }

  async function deleteDocById(id) {
    try {
      await DocumentStore.removeDoc(id);
      toast("Documento excluído.", "success");
      closeDetailModal();
      await load();
      renderDocList();
    } catch (e) {
      toast("Erro ao excluir: " + e.message, "error");
    }
  }

  async function deleteItemById(id) {
    const item = allItens.find(it => it.id === id);
    if (!item) return;
    if (!confirm(`Excluir o item "${item.numero} — ${item.titulo}"?`)) return;
    try {
      await DocumentStore.removeItem(id);
      toast("Item excluído.", "success");
      await load();
      renderDetailTree();
    } catch (e) {
      toast("Erro ao excluir item: " + e.message, "error");
    }
  }

  /* ===================== NAVEGAÇÃO ===================== */
  function filterByItem(numero) {
    closeDetailModal();
    document.querySelector('[data-tab="view"]').click();
    const el = $("search");
    if (el) { el.value = numero; el.dispatchEvent(new Event("input")); }
  }

  /* ===================== UTILS ===================== */
  function esc(str) {
    return (str || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function toast(msg, type) {
    if (window.showToast) { window.showToast(msg, type); return; }
    const t = document.createElement("div");
    t.className = `toast ${type}`;
    t.innerHTML = `<span class="dot"></span>${esc(msg)}`;
    $("toasts").appendChild(t);
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 300); }, 3200);
  }

  /* ===================== API PÚBLICA ===================== */
  window.DocumentUI = {
    init,
    editDoc:      id => openDocModal(docs.find(d => d.id === id)),
    deleteDoc:    id => { currentDocId = id; confirmDeleteDoc(); },
    editItem:     id => openItemModal(allItens.find(it => it.id === id)),
    deleteItem:   id => deleteItemById(id),
    filterByItem,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
