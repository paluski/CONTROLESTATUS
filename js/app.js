/* =====================================================================
 *  APLICAÇÃO
 * ===================================================================== */
(function () {
  "use strict";

  /* ---------- Campos (usados em tabela, formulário e importação) ------- */
  const FIELDS = [
    { key: "documento",         label: "Documento",                 match: ["documento", "doc", "livro", "edital", "lei", "norma", "processo", "leilao", "leilão"] },
    { key: "capitulo",          label: "Capítulo",                  match: ["capitulo", "capítulo", "tema", "secao", "seção", "assunto", "caminho", "estrutura", "item pai"] },
    { key: "item_referente",    label: "Item referente",            match: ["item referente", "item", "referente", "numero", "número", "codigo", "código", "n"] },
    { key: "classificacao",     label: "Tipo da pergunta",          match: ["tipo da pergunta", "tipo", "classificacao da pergunta", "classificacao", "classificação", "classif"] },
    { key: "data_protocolo",    label: "Data de protocolo",         match: ["data de protocolo", "data protocolo", "data do protocolo", "protocolo", "data"] },
    { key: "orgao_responsavel", label: "Órgão responsável",         match: ["orgao responsavel", "orgao", "responsavel", "orgao responsavel pela resposta"] },
    { key: "status",            label: "Status",                    match: ["status", "situacao", "situacao atual"] },
    { key: "pergunta",          label: "Pergunta",                  match: ["pergunta", "questao", "duvida"] },
    { key: "resposta",          label: "Resposta",                  match: ["resposta", "retorno"] },
  ];
  const PATH_SEP = /\s*[>›]\s*/; // separadores de nível (caminho de texto, usado na importação): ">" ou "›"
  function splitPath(capitulo) {
    return String(capitulo || "").split(PATH_SEP).map((s) => s.trim()).filter(Boolean);
  }
  function pathDisplay(capitulo) { return splitPath(capitulo).join(" › "); }

  /* ---------- Atalhos ------------------------------------------------- */
  const $ = (id) => document.getElementById(id);
  const cfg = window.APP_CONFIG || {};

  /* ---------- Estado -------------------------------------------------- */
  let records = [];
  let documentos = [];
  let itens = [];
  let pendingImport = [];
  let editingId = null;
  let currentDetailId = null;
  let hashChecked = false;
  let docModalDocId = null;
  const docModalCollapsed = new Set();
  const state = { search: "", classificacao: "", orgao: "", status: "", documento: "", sortKey: null, sortDir: "asc", viewMode: "navigate", answered: "", navDoc: null, navItems: [] };

  /* ---------- Utilidades --------------------------------------------- */
  function normalize(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
  }
  function txt(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const pad = (n) => String(n).padStart(2, "0");
  function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

  function toISODate(value) {
    if (value == null || value === "") return "";
    if (value instanceof Date && !isNaN(value)) return ymd(value);
    if (typeof value === "number" && isFinite(value)) {
      const d = new Date(Math.round((value - 25569) * 86400000));
      return isNaN(d) ? "" : ymd(d);
    }
    const s = String(value).trim();
    let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (m) { let y = m[3]; if (y.length === 2) y = "20" + y; return `${y}-${pad(m[2])}-${pad(m[1])}`; }
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    const d = new Date(s);
    return isNaN(d) ? "" : ymd(d);
  }
  function formatDate(v) {
    if (!v) return "";
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v);
  }
  function statusClass(status) {
    const n = normalize(status);
    if (!n) return "";
    if (n.includes("pend")) return "s-pendente";
    if (n.includes("andamento") || n.includes("analise") || n.includes("process")) return "s-andamento";
    if (n.includes("respond")) return "s-respondida";
    if (n.includes("conclu") || n.includes("finaliz")) return "s-concluida";
    if (n.includes("cancel") || n.includes("indefer")) return "s-cancelada";
    return "";
  }
  function debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }
  function isAnswered(r) { return !!(r.resposta && String(r.resposta).trim()); }
  function naturalCompare(a, b) {
    return String(a == null ? "" : a).localeCompare(String(b == null ? "" : b), "pt", { numeric: true, sensitivity: "base" });
  }
  const ACCENT_MAP = { a: "aáàâãä", e: "eéèêë", i: "iíìîï", o: "oóòôõö", u: "uúùûü", c: "cç", n: "nñ" };
  function accentPattern(q) {
    return q.split("").map((ch) => {
      const low = ch.toLowerCase();
      if (ACCENT_MAP[low]) { const set = ACCENT_MAP[low]; return "[" + set + set.toUpperCase() + "]"; }
      return ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("");
  }
  function highlight(text, q) {
    const s = String(text == null ? "" : text);
    const qn = (q || "").trim();
    if (!qn) return txt(s);
    let re;
    try { re = new RegExp(accentPattern(qn), "gi"); } catch (e) { return txt(s); }
    let out = "", last = 0, m;
    while ((m = re.exec(s)) !== null) {
      if (m.index === re.lastIndex) { re.lastIndex++; continue; }
      out += txt(s.slice(last, m.index)) + "<mark>" + txt(m[0]) + "</mark>";
      last = m.index + m[0].length;
    }
    out += txt(s.slice(last));
    return out;
  }

  /* ---------- Toasts ------------------------------------------------- */
  function toast(msg, type = "info", ms = 3400) {
    const t = document.createElement("div");
    t.className = `toast ${type}`;
    t.innerHTML = `<span class="dot"></span><span>${txt(msg)}</span>`;
    $("toasts").appendChild(t);
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 260); }, ms);
  }

  /* ---------- Confirmação (promise) ---------------------------------- */
  function confirmDialog(title, text, yesLabel = "Confirmar") {
    return new Promise((resolve) => {
      $("confirmTitle").textContent = title;
      $("confirmText").textContent = text;
      $("confirmYes").textContent = yesLabel;
      const modal = $("confirmModal");
      modal.hidden = false;
      const done = (val) => {
        modal.hidden = true;
        $("confirmYes").onclick = null;
        $("confirmNo").onclick = null;
        resolve(val);
      };
      $("confirmYes").onclick = () => done(true);
      $("confirmNo").onclick = () => done(false);
    });
  }

  /* ---------- Tema --------------------------------------------------- */
  function initTheme() {
    const saved = localStorage.getItem("theme");
    const theme = saved || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
    $("themeToggle").onclick = () => {
      const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
    };
  }

  /* ---------- Abas --------------------------------------------------- */
  function switchTab(tab) {
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === tab));
  }

  /* ---------- Modo (online / local) --------------------------------- */
  function initModeBadge() {
    const badge = $("modeBadge");
    if (DataStore.mode === "supabase") {
      badge.textContent = "● Online";
      badge.className = "mode-badge online";
      badge.title = "Conectado ao banco — dados compartilhados entre todos.";
      $("footerMode").textContent = "Conectado ao banco online · dados compartilhados em tempo real.";
    } else {
      badge.textContent = "Modo local";
      badge.className = "mode-badge local";
      badge.title = "Os dados ficam apenas neste navegador. Configure o Supabase em js/config.js para compartilhar.";
      $("footerMode").textContent = "Modo local — os dados ficam só neste navegador. Configure o Supabase (js/config.js) para compartilhar.";
    }
  }

  /* ---------- Carregar dados ----------------------------------------- */
  async function load() {
    try {
      if (!records.length) { $("loading").hidden = false; }
      const [recs, docs, its] = await Promise.all([
        DataStore.list(),
        DataStore.listDocumentos ? DataStore.listDocumentos() : [],
        DataStore.listItens ? DataStore.listItens() : [],
      ]);
      records = recs; documentos = docs; itens = its;
    } catch (e) {
      console.error(e);
      toast("Erro ao carregar dados: " + (e.message || e), "error");
    } finally {
      $("loading").hidden = true;
    }
    populateFilters();
    populateDatalists();
    renderDocumentosTab();
    render();
    maybeOpenFromHash();
  }
  const reload = debounce(load, 180);

  /* ---------- Filtros e sugestões ------------------------------------ */
  function distinct(key) {
    return [...new Set(records.map((r) => (r[key] || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt"));
  }
  function fillSelect(sel, values, placeholder, current) {
    sel.innerHTML = `<option value="">${placeholder}</option>` + values.map((v) => `<option value="${txt(v)}">${txt(v)}</option>`).join("");
    sel.value = values.includes(current) ? current : "";
  }
  function populateFilters() {
    const docNames = documentos.slice().sort((a, b) => naturalCompare(a.nome, b.nome)).map((d) => d.nome);
    fillSelect($("filterDoc"), docNames, "Documento: todos", state.documento);
    fillSelect($("filterClass"), distinct("classificacao"), "Tipo: todos", state.classificacao);
    fillSelect($("filterOrgao"), distinct("orgao_responsavel"), "Órgão: todos", state.orgao);
    fillSelect($("filterStatus"), distinct("status"), "Status: todos", state.status);
  }
  function populateDatalists() {
    $("dl_class").innerHTML = distinct("classificacao").map((v) => `<option value="${txt(v)}"></option>`).join("");
    $("dl_orgao").innerHTML = distinct("orgao_responsavel").map((v) => `<option value="${txt(v)}"></option>`).join("");
    const curDoc = $("f_documento").value, curItem = $("f_item_link").value;
    fillDocSelect();
    fillItemSelect(curDoc, curItem);
  }

  /* ---------- Aplicar busca / filtro / ordenação --------------------- */
  function getBaseFiltered() {
    const q = normalize(state.search);
    return records.filter((r) => {
      if (state.classificacao && (r.classificacao || "") !== state.classificacao) return false;
      if (state.orgao && (r.orgao_responsavel || "") !== state.orgao) return false;
      if (state.status && (r.status || "") !== state.status) return false;
      if (state.documento) {
        const docNome = r.documento_id ? (docById(r.documento_id) || {}).nome || "" : "";
        if (docNome !== state.documento) return false;
      }
      if (q) {
        const docNome = r.documento_id ? (docById(r.documento_id) || {}).nome || "" : "";
        const itemTxt = r.item_id && itemById(r.item_id) ? itemLabel(itemById(r.item_id)) : "";
        const hay = normalize([r.item_referente, r.classificacao, r.orgao_responsavel, r.status, r.pergunta, r.resposta, docNome, itemTxt].join(" "));
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }
  function applyAnswered(list) {
    if (state.answered === "yes") return list.filter(isAnswered);
    if (state.answered === "no") return list.filter((r) => !isAnswered(r));
    return list;
  }
  function sortList(list) {
    if (!state.sortKey) return list;
    const k = state.sortKey, dir = state.sortDir === "asc" ? 1 : -1;
    return list.slice().sort((a, b) => {
      const va = (a[k] || "").toString(), vb = (b[k] || "").toString();
      if (!va && !vb) return 0;
      if (!va) return 1;
      if (!vb) return -1;
      return naturalCompare(va, vb) * dir;
    });
  }
  function getFiltered() { return sortList(applyAnswered(getBaseFiltered())); }

  /* ---------- Renderização ------------------------------------------ */
  function statusBadge(status) {
    if (!status) return '<span class="cell-empty">—</span>';
    return `<span class="badge ${statusClass(status)}">${txt(status)}</span>`;
  }
  function readingStatus(r) {
    if (r.status) return `<span class="badge ${statusClass(r.status)}">${txt(r.status)}</span>`;
    return isAnswered(r)
      ? '<span class="badge s-respondida">Respondida</span>'
      : '<span class="badge s-pendente">Pendente</span>';
  }
  function cellOr(v) { return v ? txt(v) : '<span class="cell-empty">—</span>'; }
  function cellH(v) { return v ? highlight(v, state.search) : '<span class="cell-empty">—</span>'; }

  function render() {
    const base = getBaseFiltered();
    renderSummary(base);

    const list = sortList(applyAnswered(base));
    const total = records.length;
    $("resultCount").innerHTML = list.length === total
      ? `<b>${total}</b> registro(s)`
      : `<b>${list.length}</b> de ${total} registro(s)`;

    document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.ans === state.answered));
    document.querySelectorAll("th.sortable").forEach((th) => {
      th.classList.toggle("asc", state.sortKey === th.dataset.sort && state.sortDir === "asc");
      th.classList.toggle("desc", state.sortKey === th.dataset.sort && state.sortDir === "desc");
    });

    const navigating = state.viewMode === "navigate";
    document.querySelectorAll(".vt").forEach((b) => b.classList.toggle("active", b.dataset.view === state.viewMode));

    const empty = list.length === 0;
    $("emptyState").hidden = !empty;
    if (empty) {
      $("tableWrap").style.display = "none";
      $("navView").hidden = true;
      return;
    }
    if (navigating) {
      $("tableWrap").style.display = "none";
      renderNavigate(list);
      $("navView").hidden = false;
    } else {
      $("navView").hidden = true;
      $("tableWrap").style.display = "";
      renderTable(list);
    }
  }

  function renderSummary(base) {
    const total = base.length;
    const ans = base.filter(isAnswered).length;
    const pend = total - ans;
    const pct = total ? Math.round((ans / total) * 100) : 0;
    $("summary").innerHTML = `
      <div class="sum-card"><div class="sum-k">Total</div><div class="sum-v">${total}</div></div>
      <div class="sum-card ans"><div class="sum-k">Respondidas</div><div class="sum-v">${ans}</div></div>
      <div class="sum-card pend"><div class="sum-k">Pendentes</div><div class="sum-v">${pend}</div></div>
      <div class="sum-card pct"><div class="sum-k">Concluído</div><div class="sum-v">${pct}%</div><div class="sum-bar"><span style="width:${pct}%"></span></div></div>`;
    $("cnt-all").textContent = total;
    $("cnt-yes").textContent = ans;
    $("cnt-no").textContent = pend;
  }

  function renderTable(list) {
    $("tableBody").innerHTML = list.map((r) => {
      const docNome = r.documento_id ? (docById(r.documento_id) || {}).nome : "";
      const itemTxt = r.item_id && itemById(r.item_id) ? itemLabel(itemById(r.item_id)) : "";
      return `
      <tr data-id="${txt(r.id)}">
        <td data-label="Documento" class="cell-class">${cellH(docNome)}</td>
        <td data-label="Item do doc.">${cellH(itemTxt)}</td>
        <td data-label="Item">${cellH(r.item_referente)}</td>
        <td data-label="Tipo">${cellH(r.classificacao)}</td>
        <td data-label="Data protocolo" class="cell-date">${cellOr(formatDate(r.data_protocolo))}</td>
        <td data-label="Órgão responsável">${cellH(r.orgao_responsavel)}</td>
        <td data-label="Status">${statusBadge(r.status)}</td>
        <td data-label="Pergunta"><div class="cell-text">${cellH(r.pergunta)}</div></td>
        <td data-label="Resposta"><div class="cell-text">${cellH(r.resposta)}</div></td>
        <td class="col-actions">
          <div class="row-actions">
            <button class="row-btn" data-action="edit" title="Editar" aria-label="Editar">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </button>
            <button class="row-btn danger" data-action="del" title="Excluir" aria-label="Excluir">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
    }).join("");
  }

  /* ---------- Navegação relacional (Documentos › Itens › Perguntas) --- */
  function docById(id) { return documentos.find((d) => d.id === id); }
  function itemById(id) { return itens.find((i) => i.id === id); }
  function itemLabel(it) { return ((it.codigo ? it.codigo + " " : "") + (it.titulo || "")).trim() || "(item)"; }
  function itemAncestry(itemId) {
    const parts = []; let it = itemById(itemId), g = 0;
    while (it && g++ < 30) { parts.unshift(it); it = it.parent_id ? itemById(it.parent_id) : null; }
    return parts;
  }
  function buildItemNodes(docId, list) {
    const byId = {};
    itens.filter((i) => i.documento_id === docId).forEach((i) => { byId[i.id] = { ...i, children: [], direct: 0, dans: 0, total: 0, ans: 0 }; });
    const roots = [];
    Object.values(byId).forEach((n) => { if (n.parent_id && byId[n.parent_id]) byId[n.parent_id].children.push(n); else roots.push(n); });
    list.forEach((r) => { if (r.documento_id === docId && r.item_id && byId[r.item_id]) { byId[r.item_id].direct++; if (isAnswered(r)) byId[r.item_id].dans++; } });
    (function agg(n) { let t = n.direct, a = n.dans; n.children.forEach((c) => { agg(c); t += c.total; a += c.ans; }); n.total = t; n.ans = a; })({ children: roots, direct: 0, dans: 0 });
    return { byId, roots };
  }
  function crumbBtn(label, level, current) {
    return `<button class="crumb${current ? " current" : ""}" data-level="${level}" type="button">${label}</button>`;
  }
  function breadcrumbHTML() {
    let s = `<nav class="breadcrumb">` + crumbBtn("📚 Documentos", "root", state.navDoc == null);
    if (state.navDoc != null) {
      const d = state.navDoc === "__none__" ? { nome: "(Sem documento)" } : docById(state.navDoc);
      s += `<span class="crumb-sep">›</span>` + crumbBtn(txt(d ? d.nome : "?"), "doc", state.navItems.length === 0);
      state.navItems.forEach((iid, i) => {
        const it = itemById(iid);
        s += `<span class="crumb-sep">›</span>` + crumbBtn(txt(it ? itemLabel(it) : "?"), String(i), i === state.navItems.length - 1);
      });
    }
    return s + `</nav>`;
  }
  function docCardHTML(d, total, ans, q) {
    const pend = total - ans;
    const pct = total ? Math.round((ans / total) * 100) : 0;
    const statusTxt = total === 0
      ? `<span class="nc-empty">sem perguntas</span>`
      : pend ? `<span class="nc-pend">${pend} pendente${pend > 1 ? "s" : ""}</span>` : `<span class="nc-ok">tudo respondido</span>`;
    return `<button class="nav-card nc-doc" type="button" data-doc="${txt(d.id)}">
      <span class="nc-icon">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
      </span>
      <span class="nc-body">
        <span class="nc-name">${highlight(d.nome, q)}</span>
        <span class="nc-desc">${d.sigla ? txt(d.sigla) + " · " : ""}${statusTxt}</span>
        ${total > 0 ? `<span class="nc-bar"><span style="width:${pct}%"></span></span>` : ""}
      </span>
      <span class="nc-footer">
        <span class="nc-count-txt">${total}</span>
        <svg class="nc-arrow" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </span>
    </button>`;
  }
  function itemCardHTML(n) {
    const pend = n.total - n.ans;
    const isFolder = n.children.length > 0;
    const folderIcon = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
    const fileIcon = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
    const statusTxt = n.total === 0 ? "" : pend
      ? `<span class="nc-pend">${pend} pend.</span>`
      : `<span class="nc-ok">ok</span>`;
    const subInfo = isFolder ? `${n.children.length} sub · ` : "";
    return `<button class="nav-card nc-item" type="button" data-item="${txt(n.id)}">
      <span class="nc-icon${isFolder ? " nc-folder" : " nc-file"}">${isFolder ? folderIcon : fileIcon}</span>
      <span class="nc-body">
        <span class="nc-name">${n.codigo ? `<b class="nc-badge">${txt(n.codigo)}</b> ` : ""}${txt(n.titulo || "")}</span>
        <span class="nc-desc">${subInfo}${n.total} pergunta${n.total !== 1 ? "s" : ""}${n.total ? " · " + statusTxt : ""}</span>
      </span>
      <span class="nc-footer">
        <span class="nc-count-txt">${n.total}</span>
        <svg class="nc-arrow" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </span>
    </button>`;
  }
  function questionRowHTML(r) {
    const q = state.search;
    const answered = isAnswered(r);
    const dotClass = answered ? "dot-ok" : "dot-pend";
    return `<button class="qrow" type="button" data-id="${txt(r.id)}">
      <span class="qrow-dot ${dotClass}"></span>
      <span class="qrow-num">${r.item_referente ? txt(r.item_referente) : "·"}</span>
      <span class="qrow-title">${r.pergunta ? highlight(r.pergunta, q) : "<i>(sem pergunta)</i>"}</span>
      <span class="qrow-badges">${readingStatus(r)}</span>
      <svg class="qrow-arrow" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
    </button>`;
  }
  function qlistHTML(qs, headLabel) {
    if (!qs.length) return "";
    const sorted = qs.slice().sort((a, b) => naturalCompare(a.item_referente, b.item_referente));
    return `<div class="qlist-head">${headLabel} (${qs.length})</div><div class="qlist">` + sorted.map(questionRowHTML).join("") + `</div>`;
  }
  function pathOf(r) {
    const d = docById(r.documento_id);
    const parts = [d ? d.nome : (r.documento_id ? "?" : "(sem documento)")];
    if (r.item_id) itemAncestry(r.item_id).forEach((it) => parts.push(itemLabel(it)));
    return parts.join(" › ");
  }
  function renderSearchResults(list) {
    const q = state.search;
    const sorted = list.slice().sort((a, b) => naturalCompare(pathOf(a) + (a.item_referente || ""), pathOf(b) + (b.item_referente || "")));
    $("navView").innerHTML =
      `<div class="search-head">${list.length} resultado(s) para “${txt(q)}”</div><div class="qlist">` +
      sorted.map((r) => `<button class="qrow qrow-search" type="button" data-id="${txt(r.id)}">
          <span class="qrow-dot ${isAnswered(r) ? "dot-ok" : "dot-pend"}"></span>
          <span class="qrow-num">${r.item_referente ? txt(r.item_referente) : "·"}</span>
          <span class="qrow-main">
            <span class="qrow-path">${highlight(pathOf(r), q)}</span>
            <span class="qrow-title">${r.pergunta ? highlight(r.pergunta, q) : "<i>(sem pergunta)</i>"}</span>
          </span>
          <span class="qrow-badges">${readingStatus(r)}</span>
        </button>`).join("") + `</div>`;
  }
  function renderNavigate(list) {
    if (state.search.trim()) { renderSearchResults(list); return; }
    if (state.navDoc == null) { renderDocList(list); return; }
    renderDocContents(list);
  }
  function renderDocList(list) {
    let html = breadcrumbHTML();
    const cards = documentos.map((d) => {
      const qs = list.filter((r) => r.documento_id === d.id);
      return { html: docCardHTML(d, qs.length, qs.filter(isAnswered).length, ""), nome: d.nome };
    }).sort((a, b) => naturalCompare(a.nome, b.nome));
    let cardsHtml = cards.map((c) => c.html).join("");
    const noneQs = list.filter((r) => !r.documento_id);
    if (noneQs.length) {
      cardsHtml += `<button class="nav-card none" type="button" data-doc="__none__">
        <span class="nav-ic">❓</span>
        <span class="nav-main"><span class="nav-name">(Sem documento)</span>
        <span class="nav-meta">${noneQs.length} pergunta(s) sem vínculo</span></span>
        <span class="nav-count">${noneQs.length}</span></button>`;
    }
    html += `<div class="nav-grid">` + (cardsHtml || `<div class="nav-empty">Nenhum documento cadastrado. Use a aba <b>Documentos</b>.</div>`) + `</div>`;
    $("navView").innerHTML = html;
  }
  function renderDocContents(list) {
    let html = breadcrumbHTML();
    if (state.navDoc === "__none__") {
      const qs = list.filter((r) => !r.documento_id);
      html += qlistHTML(qs, "Perguntas sem documento") || `<div class="nav-empty">Nada aqui.</div>`;
      $("navView").innerHTML = html; return;
    }
    const docId = state.navDoc;
    const { byId, roots } = buildItemNodes(docId, list);
    const curId = state.navItems[state.navItems.length - 1] || null;
    let nodes, qs;
    if (!curId) {
      nodes = roots;
      qs = list.filter((r) => r.documento_id === docId && !r.item_id);
    } else {
      const cur = byId[curId];
      if (!cur) { state.navItems = []; render(); return; }
      nodes = cur.children;
      qs = list.filter((r) => r.item_id === curId);
    }
    nodes = nodes.slice().sort((a, b) => naturalCompare((a.codigo || "") + (a.titulo || ""), (b.codigo || "") + (b.titulo || "")) || (a.ordem - b.ordem));
    if (nodes.length) html += `<div class="nav-grid">` + nodes.map(itemCardHTML).join("") + `</div>`;
    html += qlistHTML(qs, "Perguntas neste item");
    if (!nodes.length && !qs.length) html += `<div class="nav-empty">Nada cadastrado aqui ainda.</div>`;
    $("navView").innerHTML = html;
  }

  /* ---------- Aba Documentos (cadastro de documentos e itens) -------- */
  function itemTreeRoots(docId) {
    const its = itens.filter((i) => i.documento_id === docId);
    const byId = {}; its.forEach((i) => (byId[i.id] = { ...i, children: [] }));
    const roots = []; Object.values(byId).forEach((n) => { if (n.parent_id && byId[n.parent_id]) byId[n.parent_id].children.push(n); else roots.push(n); });
    return roots;
  }
  const itemSort = (a, b) => naturalCompare((a.codigo || "") + (a.titulo || ""), (b.codigo || "") + (b.titulo || "")) || (a.ordem - b.ordem);
  function fillParentSelect(docId, selected) {
    const sel = $("i_parent"); if (!sel) return;
    let opts = `<option value="">— Raiz —</option>`;
    const walk = (n, d) => { opts += `<option value="${txt(n.id)}">${"  ".repeat(d)}${txt(itemLabel(n))}</option>`; n.children.slice().sort(itemSort).forEach((c) => walk(c, d + 1)); };
    if (docId) itemTreeRoots(docId).sort(itemSort).forEach((n) => walk(n, 0));
    sel.innerHTML = opts; sel.value = selected || "";
  }
  function renderDocumentosTab() {
    const docSel = $("i_doc");
    if (docSel) {
      const cur = docSel.value;
      docSel.innerHTML = documentos.length
        ? documentos.slice().sort((a, b) => naturalCompare(a.nome, b.nome)).map((d) => `<option value="${txt(d.id)}">${txt(d.nome)}</option>`).join("")
        : `<option value="">(crie um documento primeiro)</option>`;
      if (cur && documentos.find((d) => d.id === cur)) docSel.value = cur;
      fillParentSelect(docSel.value, "");
    }
    const wrap = $("docsList"); if (!wrap) return;
    if (!documentos.length) { wrap.innerHTML = `<div class="nav-empty">Nenhum documento ainda. Crie ao lado.</div>`; return; }
    wrap.innerHTML = documentos.slice().sort((a, b) => naturalCompare(a.nome, b.nome)).map((d) => {
      const its = itens.filter((i) => i.documento_id === d.id);
      const qn = records.filter((r) => r.documento_id === d.id).length;
      return `<div class="doc-block">
        <div class="doc-block-head">
          <div><div class="doc-block-nome">${txt(d.nome)}</div><div class="doc-block-meta">${d.sigla ? txt(d.sigla) + " · " : ""}${d.orgao ? txt(d.orgao) + " · " : ""}${its.length} item(ns) · ${qn} pergunta(s)</div></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <button class="btn btn-primary btn-sm" data-open-doc="${txt(d.id)}" type="button">Ver itens</button>
            <button class="btn btn-ghost btn-sm" data-del-doc="${txt(d.id)}" type="button">Excluir</button>
          </div>
        </div>
      </div>`;
    }).join("");
  }

  /* ---------- Modal de documento (árvore de itens) ------------------- */
  function openDocModal(docId) {
    docModalDocId = docId;
    docModalCollapsed.clear();
    const doc = documentos.find((d) => d.id === docId);
    if (!doc) return;
    $("dmTitle").textContent = doc.nome;
    $("dmMeta").textContent = [doc.sigla, doc.tipo, doc.orgao, doc.ano].filter(Boolean).join(" · ");
    $("dmMeta").hidden = ![doc.sigla, doc.tipo, doc.orgao, doc.ano].some(Boolean);
    $("docModal").hidden = false;
    renderDocModalTree();
  }
  function closeDocModal() {
    $("docModal").hidden = true;
    docModalDocId = null;
    docModalCollapsed.clear();
  }
  function renderDocModalTree() {
    const docId = docModalDocId;
    const its = itens.filter((i) => i.documento_id === docId);
    const tree = $("dmTree");
    const empty = $("dmEmpty");
    const colbar = $("dmColBar");
    if (!its.length) { tree.innerHTML = ""; empty.hidden = false; colbar.hidden = true; return; }
    empty.hidden = true;

    const byId = {}; its.forEach((i) => (byId[i.id] = { ...i, children: [] }));
    const roots = []; Object.values(byId).forEach((n) => { if (n.parent_id && byId[n.parent_id]) byId[n.parent_id].children.push(n); else roots.push(n); });
    const hasChildren = new Set(Object.values(byId).filter((n) => n.children.length).map((n) => n.id));
    colbar.hidden = hasChildren.size === 0;

    function isHidden(node) {
      let cur = node;
      while (cur.parent_id && byId[cur.parent_id]) {
        if (docModalCollapsed.has(cur.parent_id)) return true;
        cur = byId[cur.parent_id];
      }
      return false;
    }
    function depth(node) {
      let d = 0, cur = node;
      while (cur.parent_id && byId[cur.parent_id]) { d++; cur = byId[cur.parent_id]; }
      return d;
    }
    const flat = [];
    const walk = (n) => { flat.push(n); n.children.slice().sort(itemSort).forEach(walk); };
    roots.slice().sort(itemSort).forEach(walk);

    tree.innerHTML = flat.map((n) => {
      const isParent = hasChildren.has(n.id);
      const open = isParent && !docModalCollapsed.has(n.id);
      const hidden = isHidden(n);
      const qn = records.filter((r) => r.item_id === n.id).length;
      const qBadge = qn > 0
        ? `<span class="dm-qbadge has-q">${qn}q</span>`
        : `<span class="dm-qbadge no-q">0q</span>`;
      const chevron = isParent
        ? `<button class="dd-toggle" data-dm-toggle="${txt(n.id)}" aria-expanded="${open}" title="${open ? "Recolher" : "Expandir"}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(${open ? 0 : -90}deg);transition:transform .2s"><path d="m6 9 6 6 6-6"/></svg>
           </button>`
        : `<span class="dd-toggle-spacer"></span>`;
      return `<div class="dd-item" data-depth="${Math.min(depth(n), 4)}"${hidden ? ' style="display:none"' : ''}>
        ${chevron}
        ${n.codigo ? `<span class="item-codigo">${txt(n.codigo)}</span>` : ""}
        <span class="item-titulo">${txt(n.titulo || "")}</span>
        ${qBadge}
        <div class="item-actions">
          <button class="row-btn" title="Editar item" data-dm-edit-item="${txt(n.id)}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
          </button>
          <button class="row-btn danger" title="Excluir item" data-del-item="${txt(n.id)}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </div>`;
    }).join("");
  }
  function openAddItemModal() {
    $("i_doc").value = docModalDocId;
    fillParentSelect(docModalDocId, "");
    $("i_codigo").value = "";
    $("i_titulo").value = "";
    $("addItemModal").hidden = false;
    setTimeout(() => $("i_codigo").focus(), 60);
  }
  function openEditItemModal(itemId) {
    const item = itens.find((i) => i.id === itemId);
    if (!item) return;
    $("eiCodigo").value = item.codigo || "";
    $("eiTitulo").value = item.titulo || "";
    $("editItemModal").dataset.itemId = itemId;
    $("editItemModal").hidden = false;
    $("eiCodigo").focus();
  }
  async function saveEditItem() {
    const id = $("editItemModal").dataset.itemId;
    const codigo = $("eiCodigo").value.trim() || null;
    const titulo = $("eiTitulo").value.trim();
    if (!titulo && !codigo) { toast("Informe código ou título.", "error"); return; }
    try {
      await DataStore.updateItem(id, { codigo, titulo });
      toast("Item atualizado.", "success");
      $("editItemModal").hidden = true;
      await load();
      renderDocModalTree();
      renderDocumentosTab();
    } catch (e) { toast("Erro: " + (e.message || e), "error"); }
  }

  /* ---------- Modal de detalhe -------------------------------------- */
  function openDetail(id) {
    const r = records.find((x) => x.id == id);
    if (!r) return;
    currentDetailId = r.id;
    const q = state.search;
    $("modalBadges").innerHTML = readingStatus(r);
    const docNome = r.documento_id ? (docById(r.documento_id) || {}).nome : "";
    const itemTxt = r.item_id ? (itemById(r.item_id) ? itemLabel(itemById(r.item_id)) : "") : "";
    $("modalMeta").innerHTML = [
      ["Documento", docNome],
      ["Item do documento", itemTxt],
      ["Item referente", r.item_referente],
      ["Tipo da pergunta", r.classificacao],
      ["Data de protocolo", formatDate(r.data_protocolo)],
      ["Órgão responsável", r.orgao_responsavel],
    ].map(([k, v]) => `<div class="meta-item"><div class="k">${k}</div><div class="v">${v ? txt(v) : "—"}</div></div>`).join("");
    $("modalPergunta").innerHTML = r.pergunta ? highlight(r.pergunta, q) : "";
    $("modalResposta").innerHTML = r.resposta ? highlight(r.resposta, q) : "";
    $("modalEdit").onclick = () => { closeDetail(); startEdit(r); };
    $("modalDelete").onclick = () => { closeDetail(); removeRecord(r); };
    $("modal").hidden = false;
    try { history.replaceState(null, "", "#item=" + encodeURIComponent(r.id)); } catch (e) {}
  }
  function closeDetail() {
    $("modal").hidden = true;
    currentDetailId = null;
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  }
  function maybeOpenFromHash() {
    if (hashChecked) return;
    hashChecked = true;
    const m = location.hash.match(/item=([^&]+)/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (records.find((x) => x.id == id)) openDetail(id);
    }
  }

  /* ---------- Copiar / compartilhar --------------------------------- */
  function recordToText(r) {
    const docNome = r.documento_id ? (docById(r.documento_id) || {}).nome : "";
    const itemTxt = r.item_id && itemById(r.item_id) ? itemLabel(itemById(r.item_id)) : "";
    return [
      docNome ? "Documento: " + docNome : "",
      itemTxt ? "Item do documento: " + itemTxt : "",
      r.item_referente ? "Item referente: " + r.item_referente : "",
      r.classificacao ? "Tipo: " + r.classificacao : "",
      r.data_protocolo ? "Data de protocolo: " + formatDate(r.data_protocolo) : "",
      r.orgao_responsavel ? "Órgão responsável: " + r.orgao_responsavel : "",
      r.status ? "Status: " + r.status : "",
      "",
      "PERGUNTA:",
      r.pergunta || "(sem pergunta)",
      "",
      "RESPOSTA:",
      r.resposta || "(sem resposta)",
    ].filter((l) => l !== "").join("\n");
  }
  async function copyText(str, okMsg) {
    try {
      await navigator.clipboard.writeText(str);
      toast(okMsg || "Copiado.", "success");
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = str; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); toast(okMsg || "Copiado.", "success"); }
      catch (_) { toast("Não foi possível copiar.", "error"); }
      ta.remove();
    }
  }
  function copyItem(id) {
    const r = records.find((x) => x.id == id);
    if (r) copyText(recordToText(r), "Texto copiado para a área de transferência.");
  }
  function copyLink(id) {
    const url = location.origin + location.pathname + location.search + "#item=" + encodeURIComponent(id);
    copyText(url, "Link copiado.");
  }

  /* ---------- Imprimir / PDF ---------------------------------------- */
  function printView() {
    const list = getFiltered();
    if (!list.length) { toast("Não há registros para imprimir.", "error"); return; }
    const docs = {};
    list.forEach((r) => {
      const d = r.documento_id ? ((docById(r.documento_id) || {}).nome || "?") : "(Sem documento)";
      const c = r.item_id && itemById(r.item_id) ? itemAncestry(r.item_id).map(itemLabel).join(" › ") : "(Sem item)";
      docs[d] = docs[d] || {};
      (docs[d][c] = docs[d][c] || []).push(r);
    });
    const body = Object.keys(docs).sort(naturalCompare).map((d) => {
      const caps = docs[d];
      const capsHtml = Object.keys(caps).sort(naturalCompare).map((c) => {
        const items = caps[c].slice().sort((a, b) => naturalCompare(a.item_referente, b.item_referente));
        return `<section class="g"><h2>${txt(c)}</h2>` + items.map((r) => `
          <div class="qa">
            <div class="q"><b>${txt(r.item_referente || "")}</b> ${txt(r.pergunta || "")}</div>
            <div class="meta">${[r.classificacao, formatDate(r.data_protocolo), r.orgao_responsavel, r.status].filter(Boolean).map(txt).join(" · ")}</div>
            <div class="a">${txt(r.resposta || "(sem resposta)")}</div>
          </div>`).join("") + `</section>`;
      }).join("");
      return `<div class="docblock"><h1 class="docname">${txt(d)}</h1>${capsHtml}</div>`;
    }).join("");
    const title = cfg.APP_TITLE || "Controle de Perguntas";
    const win = window.open("", "_blank");
    if (!win) { toast("Permita pop-ups para gerar o PDF.", "error"); return; }
    win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${txt(title)}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#111;max-width:820px;margin:24px auto;padding:0 20px;line-height:1.5}
        .apptitle{font-size:13px;color:#4f46e5;font-weight:700;letter-spacing:.04em;text-transform:uppercase;margin:0}
        .sub{color:#666;font-size:12px;margin-bottom:18px}
        .docblock{margin-bottom:26px}
        .docname{font-size:19px;margin:0 0 10px;padding-bottom:6px;border-bottom:2px solid #4f46e5}
        section.g{margin-bottom:14px}h2{font-size:14px;background:#f1f1f4;padding:7px 12px;border-radius:6px;border-left:4px solid #4f46e5}
        .qa{padding:10px 4px;border-bottom:1px solid #e5e5ea;break-inside:avoid;page-break-inside:avoid}
        .q{font-weight:600;margin-bottom:4px}.q b{color:#4f46e5;margin-right:6px}
        .meta{font-size:11px;color:#777;margin-bottom:6px}
        .a{white-space:pre-wrap;background:#fafafb;border-left:3px solid #4f46e5;padding:8px 12px;border-radius:6px;font-size:13px}
        @media print{body{margin:0}}
      </style></head><body>
      <p class="apptitle">${txt(title)}</p>
      <div class="sub">Gerado em ${txt(formatDate(ymd(new Date())))} · ${list.length} registro(s)${state.search ? ' · busca: "' + txt(state.search) + '"' : ""}</div>
      ${body}
      <scr` + `ipt>window.onload=function(){setTimeout(function(){window.print();},250);}</scr` + `ipt>
      </body></html>`);
    win.document.close();
  }

  /* ---------- Formulário (criar / editar) --------------------------- */
  function readForm() {
    return {
      documento_id: $("f_documento").value || null,
      item_id: $("f_item_link").value || null,
      item_referente: $("f_item").value.trim(),
      classificacao: $("f_classificacao").value.trim(),
      data_protocolo: $("f_data").value || "",
      orgao_responsavel: $("f_orgao").value.trim(),
      status: $("f_status").value.trim(),
      pergunta: $("f_pergunta").value.trim(),
      resposta: $("f_resposta").value.trim(),
    };
  }
  function fillDocSelect() {
    const sel = $("f_documento"); const cur = sel.value;
    sel.innerHTML = `<option value="">— Sem documento —</option>` +
      documentos.slice().sort((a, b) => naturalCompare(a.nome, b.nome)).map((d) => `<option value="${txt(d.id)}">${txt(d.nome)}</option>`).join("");
    sel.value = cur;
  }
  function fillItemSelect(docId, selected) {
    const sel = $("f_item_link");
    let opts = `<option value="">— Documento inteiro —</option>`;
    if (docId) {
      const its = itens.filter((i) => i.documento_id === docId);
      const byId = {}; its.forEach((i) => (byId[i.id] = { ...i, children: [] }));
      const roots = []; Object.values(byId).forEach((n) => { if (n.parent_id && byId[n.parent_id]) byId[n.parent_id].children.push(n); else roots.push(n); });
      const sortf = (a, b) => naturalCompare((a.codigo || "") + (a.titulo || ""), (b.codigo || "") + (b.titulo || "")) || (a.ordem - b.ordem);
      const walk = (n, depth) => { opts += `<option value="${txt(n.id)}">${"  ".repeat(depth)}${txt(itemLabel(n))}</option>`; n.children.slice().sort(sortf).forEach((c) => walk(c, depth + 1)); };
      roots.slice().sort(sortf).forEach((n) => walk(n, 0));
    }
    sel.innerHTML = opts;
    sel.value = selected || "";
  }
  function resetForm() {
    editingId = null;
    $("recordId").value = "";
    $("f_documento").value = "";
    $("f_item_link").value = "";
    $("f_item").value = "";
    $("f_classificacao").value = "";
    $("f_data").value = "";
    $("f_orgao").value = "";
    $("f_status").value = "";
    $("f_pergunta").value = "";
    $("f_resposta").value = "";
    fillItemSelect("", "");
    $("formTitle").textContent = "Novo registro";
    $("saveBtnLabel").textContent = "Salvar registro";
    $("cancelEdit").hidden = true;
    updateCounters();
  }
  function startEdit(r) {
    editingId = r.id;
    $("recordId").value = r.id;
    $("f_documento").value = r.documento_id || "";
    fillItemSelect(r.documento_id, r.item_id);
    $("f_classificacao").value = r.classificacao || "";
    $("f_data").value = r.data_protocolo || "";
    $("f_item").value = r.item_referente || "";
    $("f_orgao").value = r.orgao_responsavel || "";
    $("f_status").value = r.status || "";
    $("f_pergunta").value = r.pergunta || "";
    $("f_resposta").value = r.resposta || "";
    $("formTitle").textContent = "Editar registro";
    $("saveBtnLabel").textContent = "Salvar alterações";
    $("cancelEdit").hidden = false;
    updateCounters();
    switchTab("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
    $("f_documento").focus();
  }
  async function submitForm(e) {
    e.preventDefault();
    const rec = readForm();
    if (!rec.pergunta) { toast("Informe ao menos a pergunta.", "error"); $("f_pergunta").focus(); return; }
    const btn = $("saveBtn"); btn.disabled = true;
    try {
      if (editingId) {
        await DataStore.update(editingId, rec);
        toast("Registro atualizado.", "success");
      } else {
        await DataStore.create(rec);
        toast("Registro cadastrado.", "success");
      }
      resetForm();
      await load();
      switchTab("view");
    } catch (err) {
      console.error(err);
      toast("Erro ao salvar: " + (err.message || err), "error");
    } finally {
      btn.disabled = false;
    }
  }
  async function removeRecord(r) {
    const ok = await confirmDialog("Excluir registro", "Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.", "Excluir");
    if (!ok) return;
    try {
      await DataStore.remove(r.id);
      toast("Registro excluído.", "success");
      await load();
    } catch (e) {
      console.error(e);
      toast("Erro ao excluir: " + (e.message || e), "error");
    }
  }
  function updateCounters() {
    $("cnt_pergunta").textContent = $("f_pergunta").value.length + " caracteres";
    $("cnt_resposta").textContent = $("f_resposta").value.length + " caracteres";
  }

  /* ---------- Importação de Excel ------------------------------------ */
  function buildMapping(sampleRow) {
    const keys = Object.keys(sampleRow);
    const map = {};
    FIELDS.forEach((f) => {
      const found = keys.find((k) => f.match.includes(normalize(k)));
      if (found) map[f.key] = found;
    });
    return map;
  }
  async function handleFile(file) {
    if (typeof XLSX === "undefined") { toast("A biblioteca de planilha não carregou (verifique a internet).", "error"); return; }
    $("importFileName").hidden = false;
    $("importFileName").innerHTML = `📄 ${txt(file.name)}`;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false, dateNF: "yyyy-mm-dd" });
      if (!json.length) { toast("A planilha está vazia.", "error"); return; }
      const mapping = buildMapping(json[0]);
      if (!Object.keys(mapping).length) { toast("Não reconheci nenhuma coluna. Baixe e use o modelo.", "error"); return; }
      const rows = json.map((r) => {
        const rec = {};
        FIELDS.forEach((f) => {
          const raw = mapping[f.key] != null ? r[mapping[f.key]] : "";
          rec[f.key] = f.key === "data_protocolo" ? toISODate(raw) : String(raw == null ? "" : raw).trim();
        });
        return rec;
      }).filter((rec) => Object.values(rec).some((v) => v && String(v).trim() !== ""));
      if (!rows.length) { toast("Nenhuma linha com dados encontrada.", "error"); return; }
      pendingImport = rows;
      showImportPreview(rows, mapping);
    } catch (e) {
      console.error(e);
      toast("Erro ao ler o arquivo: " + (e.message || e), "error");
    }
  }
  function showImportPreview(rows, mapping) {
    const missing = FIELDS.filter((f) => !mapping[f.key]).map((f) => f.label);
    $("importSummary").innerHTML =
      `Foram encontradas <b>${rows.length}</b> linha(s) prontas para importar.` +
      (missing.length ? `<br><span style="color:var(--muted)">Colunas não encontradas (ficarão em branco): ${txt(missing.join(", "))}</span>` : "");
    $("importPreviewBody").innerHTML = rows.slice(0, 8).map((r) => `
      <tr>
        <td>${cellOr(r.documento)}</td>
        <td>${cellOr(pathDisplay(r.capitulo))}</td>
        <td>${cellOr(r.item_referente)}</td>
        <td>${cellOr(r.classificacao)}</td>
        <td>${statusBadge(r.status)}</td>
        <td><div class="cell-text">${cellOr(r.pergunta)}</div></td>
        <td><div class="cell-text">${cellOr(r.resposta)}</div></td>
      </tr>`).join("") + (rows.length > 8 ? `<tr><td colspan="7" style="text-align:center;color:var(--muted)">… e mais ${rows.length - 8} linha(s)</td></tr>` : "");
    $("importModal").hidden = false;
  }
  async function confirmImport() {
    if (!pendingImport.length) return;
    const btn = $("importConfirm"); btn.disabled = true;
    try {
      const n = await DataStore.bulkCreate(pendingImport);
      $("importModal").hidden = true;
      $("importFileName").hidden = true;
      toast(`${n} registro(s) importado(s) com sucesso.`, "success");
      pendingImport = [];
      await load();
      switchTab("view");
    } catch (e) {
      console.error(e);
      toast("Erro ao importar: " + (e.message || e), "error");
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------- Exportar / Modelo ------------------------------------- */
  function exportExcel() {
    if (typeof XLSX === "undefined") { toast("A biblioteca de planilha não carregou.", "error"); return; }
    const list = getFiltered();
    if (!list.length) { toast("Não há registros para exportar.", "error"); return; }
    const headers = FIELDS.map((f) => f.label);
    const rows = list.map((r) => {
      const o = {};
      FIELDS.forEach((f) => { o[f.label] = f.key === "data_protocolo" ? formatDate(r[f.key]) : (r[f.key] || ""); });
      return o;
    });
    const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
    ws["!cols"] = FIELDS.map((f) => ({ wch: (f.key === "pergunta" || f.key === "resposta") ? 50 : (f.key === "capitulo" ? 28 : 20) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Registros");
    XLSX.writeFile(wb, `controle-perguntas-${ymd(new Date())}.xlsx`);
    toast("Exportado com sucesso.", "success");
  }
  function downloadTemplate() {
    if (typeof XLSX === "undefined") { toast("A biblioteca de planilha não carregou.", "error"); return; }
    const headers = FIELDS.map((f) => f.label);
    const example = {
      documento: "LRCAP 2026 – Armazenamento",
      capitulo: "Área > Georreferenciamento",
      item_referente: "1.1",
      classificacao: "Dúvida",
      data_protocolo: "2026-06-16",
      orgao_responsavel: "EPE",
      status: "Pendente",
      pergunta: "Texto da pergunta de exemplo…",
      resposta: "Texto da resposta de exemplo…",
    };
    const exampleRow = FIELDS.map((f) => example[f.key] || "");
    const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
    ws["!cols"] = FIELDS.map((f) => ({ wch: (f.key === "pergunta" || f.key === "resposta") ? 50 : (f.key === "capitulo" ? 28 : 20) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");
    XLSX.writeFile(wb, "modelo-importacao.xlsx");
  }

  /* ---------- Ligação de eventos ------------------------------------ */
  function bind() {
    // Abas
    document.querySelectorAll(".tab").forEach((b) => (b.onclick = () => switchTab(b.dataset.tab)));
    document.querySelectorAll("[data-goto]").forEach((b) => (b.onclick = () => switchTab(b.dataset.goto)));

    // Busca / filtros
    $("search").addEventListener("input", debounce((e) => { state.search = e.target.value; render(); }, 180));
    $("filterDoc").onchange = (e) => { state.documento = e.target.value; render(); };
    $("filterClass").onchange = (e) => { state.classificacao = e.target.value; render(); };
    $("filterOrgao").onchange = (e) => { state.orgao = e.target.value; render(); };
    $("filterStatus").onchange = (e) => { state.status = e.target.value; render(); };
    $("clearFilters").onclick = () => {
      state.search = state.classificacao = state.orgao = state.status = state.answered = state.documento = "";
      state.navDoc = null;
      state.navItems = [];
      $("search").value = "";
      populateFilters();
      render();
    };
    $("refreshBtn").onclick = () => load();
    $("exportBtn").onclick = exportExcel;
    $("printBtn").onclick = printView;

    // Chips de status (todas / respondidas / pendentes)
    document.querySelectorAll(".chip").forEach((c) => (c.onclick = () => { state.answered = c.dataset.ans; render(); }));

    // Alternância de visão (Navegar / Tabela)
    document.querySelectorAll(".vt").forEach((b) => (b.onclick = () => { state.viewMode = b.dataset.view; render(); }));

    // Navegação: migalhas (breadcrumb), cartões (documento/item) e perguntas
    $("navView").addEventListener("click", (e) => {
      const crumb = e.target.closest(".crumb");
      if (crumb) {
        const lvl = crumb.dataset.level;
        if (lvl === "root") { state.navDoc = null; state.navItems = []; }
        else if (lvl === "doc") { state.navItems = []; }
        else { state.navItems = state.navItems.slice(0, parseInt(lvl, 10) + 1); }
        render(); return;
      }
      const dc = e.target.closest(".nav-card[data-doc]");
      if (dc) { state.navDoc = dc.dataset.doc; state.navItems = []; render(); return; }
      const ic = e.target.closest(".nav-card[data-item]");
      if (ic) { state.navItems = state.navItems.concat(ic.dataset.item); render(); return; }
      const qrow = e.target.closest(".qrow");
      if (qrow) { openDetail(qrow.dataset.id); return; }
    });

    // Ordenação
    document.querySelectorAll("th.sortable").forEach((th) => {
      th.onclick = () => {
        const k = th.dataset.sort;
        if (state.sortKey === k) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        else { state.sortKey = k; state.sortDir = "asc"; }
        render();
      };
    });

    // Tabela: clique na linha abre detalhe; botões agem sobre o registro
    $("tableBody").addEventListener("click", (e) => {
      const tr = e.target.closest("tr"); if (!tr) return;
      const id = tr.dataset.id;
      const btn = e.target.closest(".row-btn");
      if (btn) {
        e.stopPropagation();
        const r = records.find((x) => x.id == id);
        if (!r) return;
        if (btn.dataset.action === "edit") startEdit(r);
        else removeRecord(r);
        return;
      }
      openDetail(id);
    });

    // Formulário
    $("recordForm").addEventListener("submit", submitForm);
    $("recordForm").addEventListener("reset", () => setTimeout(resetForm, 0));
    $("cancelEdit").onclick = resetForm;
    $("f_documento").addEventListener("change", (e) => fillItemSelect(e.target.value, ""));
    $("f_pergunta").addEventListener("input", updateCounters);
    $("f_resposta").addEventListener("input", updateCounters);

    // Aba Documentos
    $("docForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const nome = $("d_nome").value.trim();
      if (!nome) { toast("Informe o nome do documento.", "error"); return; }
      try {
        await DataStore.createDocumento({ nome, sigla: $("d_sigla").value.trim() || null, tipo: $("d_tipo").value.trim() || null, orgao: $("d_orgao").value.trim() || null, ano: $("d_ano").value ? parseInt($("d_ano").value, 10) : null });
        toast("Documento criado.", "success"); $("docForm").reset(); $("newDocModal").hidden = true; await load();
      } catch (err) { console.error(err); toast("Erro ao criar documento: " + (err.message || err), "error"); }
    });
    $("itemForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const docId = $("i_doc").value;
      if (!docId) { toast("Selecione um documento.", "error"); return; }
      const codigo = $("i_codigo").value.trim(), titulo = $("i_titulo").value.trim();
      if (!codigo && !titulo) { toast("Informe código ou título do item.", "error"); return; }
      try {
        await DataStore.createItem({ documento_id: docId, parent_id: $("i_parent").value || null, codigo: codigo || null, titulo: titulo || null, ordem: itens.filter((i) => i.documento_id === docId).length });
        toast("Item adicionado.", "success"); $("i_codigo").value = ""; $("i_titulo").value = ""; $("addItemModal").hidden = true; await load(); renderDocModalTree(); renderDocumentosTab();
      } catch (err) { console.error(err); toast("Erro ao adicionar item: " + (err.message || err), "error"); }
    });
    $("docsList").addEventListener("click", async (e) => {
      const od = e.target.closest("[data-open-doc]");
      if (od) { openDocModal(od.dataset.openDoc); return; }
      const di = e.target.closest("[data-del-item]");
      if (di) {
        if (await confirmDialog("Excluir item", "Excluir este item e seus subitens? As perguntas vinculadas ficarão sem item.", "Excluir")) {
          try { await DataStore.removeItem(di.dataset.delItem); toast("Item excluído.", "success"); await load(); }
          catch (err) { toast("Erro: " + (err.message || err), "error"); }
        }
        return;
      }
      const dd = e.target.closest("[data-del-doc]");
      if (dd) {
        if (await confirmDialog("Excluir documento", "Excluir este documento, todos os seus itens e desvincular as perguntas?", "Excluir")) {
          try { await DataStore.removeDocumento(dd.dataset.delDoc); toast("Documento excluído.", "success"); await load(); }
          catch (err) { toast("Erro: " + (err.message || err), "error"); }
        }
        return;
      }
    });

    // Modal de detalhe
    $("modalClose").onclick = closeDetail;
    $("modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeDetail(); });
    $("modalCopy").onclick = () => { if (currentDetailId) copyItem(currentDetailId); };
    $("modalCopyLink").onclick = () => { if (currentDetailId) copyLink(currentDetailId); };

    // Importação
    const dz = $("dropzone"), fi = $("fileInput");
    fi.addEventListener("change", (e) => { if (e.target.files[0]) handleFile(e.target.files[0]); fi.value = ""; });
    ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("dragover"); }));
    ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("dragover"); }));
    dz.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) handleFile(f); });
    $("templateBtn").onclick = downloadTemplate;
    $("importClose").onclick = () => ($("importModal").hidden = true);
    $("importCancel").onclick = () => ($("importModal").hidden = true);
    $("importConfirm").onclick = confirmImport;

    // Modal de documento
    $("dmClose").onclick = closeDocModal;
    $("docModal").addEventListener("click", (e) => { if (e.target.id === "docModal") closeDocModal(); });
    $("dmTree").addEventListener("click", async (e) => {
      const tog = e.target.closest("[data-dm-toggle]");
      if (tog) {
        const id = tog.dataset.dmToggle;
        if (docModalCollapsed.has(id)) docModalCollapsed.delete(id); else docModalCollapsed.add(id);
        renderDocModalTree(); return;
      }
      const ed = e.target.closest("[data-dm-edit-item]");
      if (ed) { openEditItemModal(ed.dataset.dmEditItem); return; }
      const del = e.target.closest("[data-del-item]");
      if (del) {
        if (await confirmDialog("Excluir item", "Excluir este item e seus subitens? As perguntas vinculadas ficarão sem item.", "Excluir")) {
          try { await DataStore.removeItem(del.dataset.delItem); toast("Item excluído.", "success"); await load(); renderDocModalTree(); renderDocumentosTab(); }
          catch (err) { toast("Erro: " + (err.message || err), "error"); }
        }
        return;
      }
    });
    $("dmExpandAll").onclick = () => { docModalCollapsed.clear(); renderDocModalTree(); };
    $("dmCollapseAll").onclick = () => {
      itens.filter((i) => i.documento_id === docModalDocId && itens.some((j) => j.parent_id === i.id)).forEach((i) => docModalCollapsed.add(i.id));
      renderDocModalTree();
    };

    $("dmAddItemBtn").onclick = openAddItemModal;

    // Modal editar item
    $("editItemClose").onclick = () => ($("editItemModal").hidden = true);
    $("editItemCancel").onclick = () => ($("editItemModal").hidden = true);
    $("editItemSave").onclick = saveEditItem;
    $("editItemModal").addEventListener("click", (e) => { if (e.target.id === "editItemModal") $("editItemModal").hidden = true; });

    // Modal adicionar item
    $("addItemClose").onclick = () => ($("addItemModal").hidden = true);
    $("addItemCancel").onclick = () => ($("addItemModal").hidden = true);
    $("addItemModal").addEventListener("click", (e) => { if (e.target.id === "addItemModal") $("addItemModal").hidden = true; });

    // Modal novo documento
    $("newDocBtn").onclick = () => { $("newDocModal").hidden = false; setTimeout(() => $("d_nome").focus(), 60); };
    $("newDocClose").onclick = () => ($("newDocModal").hidden = true);
    $("newDocCancel").onclick = () => ($("newDocModal").hidden = true);
    $("newDocModal").addEventListener("click", (e) => { if (e.target.id === "newDocModal") $("newDocModal").hidden = true; });

    // ESC fecha modais
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!$("editItemModal").hidden) { $("editItemModal").hidden = true; return; }
        if (!$("addItemModal").hidden) { $("addItemModal").hidden = true; return; }
        if (!$("newDocModal").hidden) { $("newDocModal").hidden = true; return; }
        if (!$("docModal").hidden) { closeDocModal(); return; }
        $("modal").hidden = true;
        $("importModal").hidden = true;
        $("confirmModal").hidden = true;
      }
    });
  }

  /* ---------- Início ------------------------------------------------- */
  function init() {
    $("appTitle").textContent = cfg.APP_TITLE || "Controle de Perguntas";
    $("appSubtitle").textContent = cfg.APP_SUBTITLE || "";
    document.title = (cfg.APP_TITLE || "Controle de Perguntas") + " — Controle";
    initTheme();
    initModeBadge();
    bind();
    updateCounters();
    DataStore.onChange(reload);
    load();
  }

  init();
})();
