/* =====================================================================
 *  APLICAÇÃO
 * ===================================================================== */
(function () {
  "use strict";

  /* ---------- Campos (usados em tabela, formulário e importação) ------- */
  const FIELDS = [
    { key: "classificacao",     label: "Classificação da pergunta", match: ["classificacao da pergunta", "classificacao", "classificacao pergunta", "classif"] },
    { key: "data_protocolo",    label: "Data de protocolo",         match: ["data de protocolo", "data protocolo", "data do protocolo", "protocolo", "data"] },
    { key: "item_referente",    label: "Item referente",            match: ["item referente", "item", "referente"] },
    { key: "orgao_responsavel", label: "Órgão responsável",         match: ["orgao responsavel", "orgao", "responsavel", "orgao responsavel pela resposta"] },
    { key: "status",            label: "Status",                    match: ["status", "situacao", "situacao atual"] },
    { key: "pergunta",          label: "Pergunta",                  match: ["pergunta", "questao", "duvida"] },
    { key: "resposta",          label: "Resposta",                  match: ["resposta", "retorno"] },
  ];

  /* ---------- Atalhos ------------------------------------------------- */
  const $ = (id) => document.getElementById(id);
  const cfg = window.APP_CONFIG || {};

  /* ---------- Estado -------------------------------------------------- */
  let records = [];
  let pendingImport = [];
  let editingId = null;
  let currentDetailId = null;
  let hashChecked = false;
  const state = { search: "", classificacao: "", orgao: "", status: "", sortKey: null, sortDir: "asc", viewMode: "table", groupBy: "classificacao", answered: "" };

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
      records = await DataStore.list();
    } catch (e) {
      console.error(e);
      toast("Erro ao carregar dados: " + (e.message || e), "error");
    } finally {
      $("loading").hidden = true;
    }
    populateFilters();
    populateDatalists();
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
    fillSelect($("filterClass"), distinct("classificacao"), "Classificação: todas", state.classificacao);
    fillSelect($("filterOrgao"), distinct("orgao_responsavel"), "Órgão: todos", state.orgao);
    fillSelect($("filterStatus"), distinct("status"), "Status: todos", state.status);
  }
  function populateDatalists() {
    $("dl_class").innerHTML = distinct("classificacao").map((v) => `<option value="${txt(v)}"></option>`).join("");
    $("dl_orgao").innerHTML = distinct("orgao_responsavel").map((v) => `<option value="${txt(v)}"></option>`).join("");
  }

  /* ---------- Aplicar busca / filtro / ordenação --------------------- */
  function getBaseFiltered() {
    const q = normalize(state.search);
    return records.filter((r) => {
      if (state.classificacao && (r.classificacao || "") !== state.classificacao) return false;
      if (state.orgao && (r.orgao_responsavel || "") !== state.orgao) return false;
      if (state.status && (r.status || "") !== state.status) return false;
      if (q) {
        const hay = normalize(FIELDS.map((f) => r[f.key]).join(" "));
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

    const reading = state.viewMode === "reading";
    $("groupByWrap").hidden = !reading;
    $("expandCtl").hidden = !reading;
    document.querySelectorAll(".vt").forEach((b) => b.classList.toggle("active", (b.dataset.view === "reading") === reading));

    const empty = list.length === 0;
    $("emptyState").hidden = !empty;
    if (empty) {
      $("tableWrap").style.display = "none";
      $("readingView").hidden = true;
      return;
    }
    if (reading) {
      $("tableWrap").style.display = "none";
      renderReading(list);
      $("readingView").hidden = false;
    } else {
      $("readingView").hidden = true;
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
    $("tableBody").innerHTML = list.map((r) => `
      <tr data-id="${txt(r.id)}">
        <td data-label="Classificação" class="cell-class">${cellH(r.classificacao)}</td>
        <td data-label="Data protocolo" class="cell-date">${cellOr(formatDate(r.data_protocolo))}</td>
        <td data-label="Item referente">${cellH(r.item_referente)}</td>
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
      </tr>`).join("");
  }

  function renderReading(list) {
    const q = state.search;
    const gkey = state.groupBy;
    const groups = {};
    list.forEach((r) => {
      const key = (r[gkey] || "").trim() || "(não informado)";
      (groups[key] = groups[key] || []).push(r);
    });
    const keys = Object.keys(groups).sort(naturalCompare);
    $("readingView").innerHTML = keys.map((k) => {
      const items = groups[k].slice().sort((a, b) => naturalCompare(a.item_referente, b.item_referente));
      const ans = items.filter(isAnswered).length;
      return `<div class="rgroup">
        <div class="rgroup-head">
          <h3>${highlight(k, q)}</h3>
          <span class="rgroup-meta">${items.length} item(ns) · ${ans} respondida(s)</span>
        </div>
        <div class="rgroup-items">
          ${items.map((r) => {
            const meta = [
              r.data_protocolo ? "📅 " + formatDate(r.data_protocolo) : "",
              r.orgao_responsavel ? "🏛️ " + r.orgao_responsavel : "",
            ].filter(Boolean).map((x) => `<span>${txt(x)}</span>`).join("");
            return `<div class="qa" data-id="${txt(r.id)}">
              <button class="qa-q" type="button">
                <span class="qa-num">${r.item_referente ? txt(r.item_referente) : "•"}</span>
                <span class="qa-text">${r.pergunta ? highlight(r.pergunta, q) : "<i>(sem pergunta)</i>"}</span>
                <span class="qa-badges">${readingStatus(r)}</span>
                <svg class="qa-chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
              </button>
              <div class="qa-a" hidden>
                <div class="qa-ameta">${meta}</div>
                <div class="qa-atext">${r.resposta ? highlight(r.resposta, q) : "<i>Sem resposta cadastrada.</i>"}</div>
                <div class="qa-actions">
                  <button class="btn btn-ghost btn-sm" data-act="open" type="button">Abrir detalhes</button>
                  <button class="btn btn-ghost btn-sm" data-act="copy" type="button">Copiar</button>
                </div>
              </div>
            </div>`;
          }).join("")}
        </div>
      </div>`;
    }).join("");
  }

  /* ---------- Modal de detalhe -------------------------------------- */
  function openDetail(id) {
    const r = records.find((x) => x.id == id);
    if (!r) return;
    currentDetailId = r.id;
    const q = state.search;
    $("modalBadges").innerHTML = readingStatus(r);
    $("modalMeta").innerHTML = [
      ["Classificação", r.classificacao],
      ["Data de protocolo", formatDate(r.data_protocolo)],
      ["Item referente", r.item_referente],
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
    return [
      r.classificacao ? "Classificação: " + r.classificacao : "",
      r.item_referente ? "Item referente: " + r.item_referente : "",
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
    const gkey = state.groupBy;
    const groups = {};
    list.forEach((r) => { const k = (r[gkey] || "").trim() || "(não informado)"; (groups[k] = groups[k] || []).push(r); });
    const keys = Object.keys(groups).sort(naturalCompare);
    const body = keys.map((k) => {
      const items = groups[k].slice().sort((a, b) => naturalCompare(a.item_referente, b.item_referente));
      return `<section class="g"><h2>${txt(k)}</h2>` + items.map((r) => `
        <div class="qa">
          <div class="q"><b>${txt(r.item_referente || "")}</b> ${txt(r.pergunta || "")}</div>
          <div class="meta">${[formatDate(r.data_protocolo), r.orgao_responsavel, r.status].filter(Boolean).map(txt).join(" · ")}</div>
          <div class="a">${txt(r.resposta || "(sem resposta)")}</div>
        </div>`).join("") + `</section>`;
    }).join("");
    const title = cfg.APP_TITLE || "Controle de Perguntas";
    const win = window.open("", "_blank");
    if (!win) { toast("Permita pop-ups para gerar o PDF.", "error"); return; }
    win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${txt(title)}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#111;max-width:820px;margin:24px auto;padding:0 20px;line-height:1.5}
        h1{font-size:20px;margin:0 0 4px}.sub{color:#666;font-size:12px;margin-bottom:18px}
        section.g{margin-bottom:18px}h2{font-size:15px;background:#f1f1f4;padding:8px 12px;border-radius:6px;border-left:4px solid #4f46e5}
        .qa{padding:10px 4px;border-bottom:1px solid #e5e5ea;break-inside:avoid;page-break-inside:avoid}
        .q{font-weight:600;margin-bottom:4px}.q b{color:#4f46e5;margin-right:6px}
        .meta{font-size:11px;color:#777;margin-bottom:6px}
        .a{white-space:pre-wrap;background:#fafafb;border-left:3px solid #4f46e5;padding:8px 12px;border-radius:6px;font-size:13px}
        @media print{body{margin:0}}
      </style></head><body>
      <h1>${txt(title)}</h1>
      <div class="sub">Gerado em ${txt(formatDate(ymd(new Date())))} · ${list.length} registro(s)${state.search ? ' · busca: "' + txt(state.search) + '"' : ""}</div>
      ${body}
      <scr` + `ipt>window.onload=function(){setTimeout(function(){window.print();},250);}</scr` + `ipt>
      </body></html>`);
    win.document.close();
  }

  /* ---------- Formulário (criar / editar) --------------------------- */
  function readForm() {
    return {
      classificacao: $("f_classificacao").value.trim(),
      data_protocolo: $("f_data").value || "",
      item_referente: $("f_item").value.trim(),
      orgao_responsavel: $("f_orgao").value.trim(),
      status: $("f_status").value.trim(),
      pergunta: $("f_pergunta").value.trim(),
      resposta: $("f_resposta").value.trim(),
    };
  }
  function resetForm() {
    $("recordForm").reset();
    editingId = null;
    $("recordId").value = "";
    $("formTitle").textContent = "Novo registro";
    $("saveBtnLabel").textContent = "Salvar registro";
    $("cancelEdit").hidden = true;
    updateCounters();
  }
  function startEdit(r) {
    editingId = r.id;
    $("recordId").value = r.id;
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
    $("f_classificacao").focus();
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
        <td>${cellOr(r.classificacao)}</td>
        <td class="cell-date">${cellOr(formatDate(r.data_protocolo))}</td>
        <td>${cellOr(r.item_referente)}</td>
        <td>${cellOr(r.orgao_responsavel)}</td>
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
    const rows = list.map((r) => ({
      "Classificação da pergunta": r.classificacao || "",
      "Data de protocolo": formatDate(r.data_protocolo),
      "Item referente": r.item_referente || "",
      "Órgão responsável": r.orgao_responsavel || "",
      "Status": r.status || "",
      "Pergunta": r.pergunta || "",
      "Resposta": r.resposta || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 22 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 50 }, { wch: 50 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Registros");
    XLSX.writeFile(wb, `controle-perguntas-${ymd(new Date())}.xlsx`);
    toast("Exportado com sucesso.", "success");
  }
  function downloadTemplate() {
    if (typeof XLSX === "undefined") { toast("A biblioteca de planilha não carregou.", "error"); return; }
    const headers = FIELDS.map((f) => f.label);
    const example = ["Dúvida", "2026-06-19", "Item 4.2 do edital", "Secretaria de Administração", "Pendente", "Texto da pergunta de exemplo…", "Texto da resposta de exemplo…"];
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    ws["!cols"] = headers.map((_, i) => ({ wch: i >= 5 ? 50 : 22 }));
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
    $("filterClass").onchange = (e) => { state.classificacao = e.target.value; render(); };
    $("filterOrgao").onchange = (e) => { state.orgao = e.target.value; render(); };
    $("filterStatus").onchange = (e) => { state.status = e.target.value; render(); };
    $("clearFilters").onclick = () => {
      state.search = state.classificacao = state.orgao = state.status = state.answered = "";
      $("search").value = "";
      populateFilters();
      render();
    };
    $("refreshBtn").onclick = () => load();
    $("exportBtn").onclick = exportExcel;
    $("printBtn").onclick = printView;

    // Chips de status (todas / respondidas / pendentes)
    document.querySelectorAll(".chip").forEach((c) => (c.onclick = () => { state.answered = c.dataset.ans; render(); }));

    // Alternância de visão (tabela / leitura) e agrupamento
    document.querySelectorAll(".vt").forEach((b) => (b.onclick = () => { state.viewMode = b.dataset.view; render(); }));
    $("groupBy").onchange = (e) => { state.groupBy = e.target.value; if (state.viewMode === "reading") render(); };
    $("expandAll").onclick = () => document.querySelectorAll("#readingView .qa").forEach((qa) => { qa.classList.add("open"); qa.querySelector(".qa-a").hidden = false; });
    $("collapseAll").onclick = () => document.querySelectorAll("#readingView .qa").forEach((qa) => { qa.classList.remove("open"); qa.querySelector(".qa-a").hidden = true; });

    // Modo leitura: expandir / abrir detalhes / copiar
    $("readingView").addEventListener("click", (e) => {
      const qaEl = e.target.closest(".qa"); if (!qaEl) return;
      const id = qaEl.dataset.id;
      const act = e.target.closest("[data-act]");
      if (act) {
        e.stopPropagation();
        if (act.dataset.act === "open") openDetail(id);
        else copyItem(id);
        return;
      }
      if (e.target.closest(".qa-q")) {
        const bodyEl = qaEl.querySelector(".qa-a");
        const open = qaEl.classList.toggle("open");
        bodyEl.hidden = !open;
      }
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
    $("f_pergunta").addEventListener("input", updateCounters);
    $("f_resposta").addEventListener("input", updateCounters);

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

    // ESC fecha modais
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
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
