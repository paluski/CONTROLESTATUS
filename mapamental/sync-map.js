/* =====================================================================
 *  VÍNCULO CHECKLIST × MAPA MENTAL
 *  ---------------------------------------------------------------------
 *  Tabela única de correspondência entre as etapas do Checklist
 *  (mapamental/checklist_lrcap.html, ids como "f8", "i20"...) e os nós
 *  do Mapa Mental (mapamental/mapa_mental_requisitos_SAE.html, ids como
 *  "fundiario/regimob/d0"). Uma etapa do checklist pode alimentar mais
 *  de um nó do mapa mental (ex.: um mesmo requisito aparece em dois
 *  ramos). Quando vários itens do checklist alimentam o mesmo nó, o
 *  nó só fica "concluído" quando todos estiverem concluídos.
 *
 *  Compartilhado pelas duas páginas via localStorage (mesma origem):
 *  o Checklist grava o estado agregado; o Mapa Mental só lê.
 * ===================================================================== */
(function (global) {
  var STORAGE_KEY = 'lrcap_mm_sync_v1';

  var MAP = {
    // Jurídico / SPE
    ia0: ['juridico/spe/d2', 'epe/aege'],
    ia1: ['epe/aege', 'epe/decl/d3'],
    i20: ['juridico/jur2/d0', 'aneel/jur/d0', 'aneel/dro/d2'],
    i21: ['juridico/jur2/d1', 'aneel/jur/d1'],
    i22: ['juridico/jur2/d2', 'aneel/jur/d2'],
    i23: ['juridico/jur2/d3', 'aneel/jur/d3'],
    i24: ['juridico/jur2/d4', 'aneel/jur/d4'],

    // Fundiário
    f3: ['fundiario/regimob/d1'],
    f4: ['fundiario/regimob/d1'],
    f5: ['fundiario/regimob/d1'],
    f7: ['fundiario/georref/d0'],
    f8: ['fundiario/regimob/d0'],
    f18: ['fundiario/aquisicao/d0', 'fundiario/aquisicao/d1'],
    f19: ['fundiario/georref/d1', 'fundiario/georref/d2', 'fundiario/decldir/d1'],
    f20: ['fundiario/aquisicao/d2'],

    // Ambiental (o checklist trata as 3 licenças num único item pós-leilão)
    i27: ['ambiental/enquadraamb', 'ambiental/lp', 'ambiental/li', 'ambiental/lo', 'aneel/adoc/d0'],

    // ANEEL — DRO-SAE, qualificação técnica e documentos adicionais
    i32: ['aneel/dro/d0', 'prazos/prazo1/d0'],
    i33: ['aneel/dro/d1', 'prazos/prazo1/d0'],
    i25: ['aneel/tecbat/d0'],
    i26: ['aneel/tecbat/d1', 'aneel/tecbat/d2', 'aneel/tecbat/d3', 'epe/mema/d5'],
    i28: ['aneel/adoc/d1', 'epe/acesso/d3', 'conn/dist/d2'],
    i29: ['aneel/adoc/d1', 'epe/acesso/d3', 'conn/dist/d2'],
    i34: ['aneel/adoc/d2', 'epe/acesso/d0', 'conn/rb/d0'],
    i30: ['aneel/adoc/d3'],
    i31: ['aneel/adoc/d4', 'epe/decl/d1'],

    // EPE — Memorial A (tecnologia)
    i2: ['epe/mema/d1'],
    i3: ['epe/mema/d0'],
    i4: ['epe/mema/d2', 'epe/mema/d4'],
    i8: ['epe/mema/d2'],
    i13: ['epe/mema/d3'],

    // EPE — Memorial B-F (localização e docs)
    i10: ['epe/memb/d2'],
    i14: ['epe/memb/d0', 'epe/memb/d1', 'epe/memb/d4'],

    // EPE — Docs de acesso e contratos
    i35: ['epe/acesso/d3'],
    i36: ['epe/acesso/d3'],
    i37: ['epe/acesso/d4'],
    i38: ['epe/acesso/d3', 'conn/dist/d2'],
    i39: ['epe/acesso/d3', 'conn/dist/d2'],

    // EPE — Declarações
    i17: ['epe/decl/d2'],
    i18: ['epe/decl/d2'],
    i19: ['epe/decl/d2'],

    // Prazos — implantação pós-outorga
    i45: ['prazos/prazo1/d2', 'prazos/prazo2'],
  };

  /* Conjunto de todos os nós do mapa mental alimentados pelo checklist. */
  var SYNCED_NODES = {};
  Object.keys(MAP).forEach(function (cid) {
    MAP[cid].forEach(function (nodeId) { SYNCED_NODES[nodeId] = true; });
  });

  function read() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch (e) { return {}; }
  }

  /* getState(checklistId) -> 'pending'|'partial'|'done'|undefined. Agrega por nó
     do mapa mental e grava o resultado no localStorage compartilhado. */
  function publish(getState) {
    var byNode = {};
    Object.keys(MAP).forEach(function (cid) {
      var st = getState(cid);
      if (!st) return;
      MAP[cid].forEach(function (nodeId) {
        (byNode[nodeId] = byNode[nodeId] || []).push(st);
      });
    });
    var merged = {};
    Object.keys(byNode).forEach(function (nodeId) {
      var states = byNode[nodeId];
      var allDone = states.every(function (s) { return s === 'done'; });
      var allPending = states.every(function (s) { return s === 'pending'; });
      merged[nodeId] = allDone ? 'done' : (allPending ? 'pending' : 'partial');
    });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch (e) {}
    return merged;
  }

  global.LRCAP_SYNC = {
    STORAGE_KEY: STORAGE_KEY,
    MAP: MAP,
    SYNCED_NODES: SYNCED_NODES,
    read: read,
    publish: publish,
  };
})(window);
