/* =====================================================================
 *  CAMADA DE DADOS
 *  ---------------------------------------------------------------------
 *  Expõe window.DataStore com uma API única, independente de onde os
 *  dados estão guardados:
 *    - "supabase" : banco online compartilhado (quando configurado)
 *    - "local"    : localStorage do navegador (modo de demonstração)
 *
 *  API:
 *    DataStore.mode                -> "supabase" | "local"
 *    await DataStore.list()        -> [registro, ...]
 *    await DataStore.create(reg)   -> registro criado
 *    await DataStore.update(id,reg)-> registro atualizado
 *    await DataStore.remove(id)
 *    await DataStore.bulkCreate([reg, ...]) -> qtd inserida
 *    DataStore.onChange(cb)        -> avisa quando os dados mudam
 * ===================================================================== */

(function () {
  const cfg = window.APP_CONFIG || {};
  const LOCAL_KEY = "controle_registros_v1";

  const hasSupabase =
    !!cfg.SUPABASE_URL &&
    !!cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes("SEU-PROJETO") &&
    typeof window.supabase !== "undefined";

  const listeners = new Set();
  function emitChange() {
    listeners.forEach((cb) => {
      try { cb(); } catch (e) { console.error(e); }
    });
  }

  /* Garante que campos de data vazios virem null (a coluna é do tipo date) */
  function sanitize(reg) {
    const out = { ...reg };
    if (!out.data_protocolo) out.data_protocolo = null;
    if ("documento_id" in out && !out.documento_id) out.documento_id = null;
    if ("item_id" in out && !out.item_id) out.item_id = null;
    delete out.id;          // o id é gerado pelo banco / storage
    delete out.created_at;  // gerenciado automaticamente
    // campos de texto legados não usados no modelo relacional
    delete out.documento;
    delete out.capitulo;
    return out;
  }

  /* ------------------------------------------------------------------ *
   *  MODO SUPABASE
   * ------------------------------------------------------------------ */
  function supabaseStore() {
    const client = window.supabase.createClient(
      cfg.SUPABASE_URL,
      cfg.SUPABASE_ANON_KEY
    );
    const TABLE = cfg.TABLE || "registros";

    // Atualização em tempo real entre todos os usuários
    try {
      client
        .channel("realtime-controle")
        .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, () => emitChange())
        .on("postgres_changes", { event: "*", schema: "public", table: "documentos" }, () => emitChange())
        .on("postgres_changes", { event: "*", schema: "public", table: "itens" }, () => emitChange())
        .subscribe();
    } catch (e) {
      console.warn("Realtime indisponível:", e);
    }

    return {
      mode: "supabase",
      async list() {
        const { data, error } = await client
          .from(TABLE)
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      },
      async create(reg) {
        const { data, error } = await client
          .from(TABLE)
          .insert(sanitize(reg))
          .select()
          .single();
        if (error) throw error;
        return data;
      },
      async update(id, reg) {
        const { data, error } = await client
          .from(TABLE)
          .update(sanitize(reg))
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return data;
      },
      async remove(id) {
        const { error } = await client.from(TABLE).delete().eq("id", id);
        if (error) throw error;
      },
      async bulkCreate(regs) {
        const rows = regs.map(sanitize);
        const { data, error } = await client.from(TABLE).insert(rows).select();
        if (error) throw error;
        return (data || []).length;
      },
      async listDocumentos() {
        const { data, error } = await client.from("documentos").select("*").order("nome");
        if (error) throw error;
        return data || [];
      },
      async listItens() {
        const { data, error } = await client.from("itens").select("*").order("ordem");
        if (error) throw error;
        return data || [];
      },
      async createDocumento(doc) {
        const { data, error } = await client.from("documentos").insert(doc).select().single();
        if (error) throw error;
        return data;
      },
      async updateDocumento(id, doc) {
        const { data, error } = await client.from("documentos").update(doc).eq("id", id).select().single();
        if (error) throw error;
        return data;
      },
      async removeDocumento(id) {
        const { error } = await client.from("documentos").delete().eq("id", id);
        if (error) throw error;
      },
      async createItem(item) {
        const { data, error } = await client.from("itens").insert(item).select().single();
        if (error) throw error;
        return data;
      },
      async removeItem(id) {
        const { error } = await client.from("itens").delete().eq("id", id);
        if (error) throw error;
      },
      async updateItem(id, item) {
        const patch = {};
        if ("codigo" in item) patch.codigo = item.codigo;
        if ("titulo" in item) patch.titulo = item.titulo;
        const { data, error } = await client.from("itens").update(patch).eq("id", id).select().single();
        if (error) throw error;
        return data;
      },
    };
  }

  /* ------------------------------------------------------------------ *
   *  MODO LOCAL (localStorage)
   * ------------------------------------------------------------------ */
  function localStore() {
    function read() {
      try {
        return JSON.parse(localStorage.getItem(LOCAL_KEY)) || [];
      } catch {
        return [];
      }
    }
    function write(arr) {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(arr));
      emitChange();
    }
    function uid() {
      return (crypto.randomUUID && crypto.randomUUID()) ||
        "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    }

    return {
      mode: "local",
      async list() {
        return read().sort((a, b) =>
          (b.created_at || "").localeCompare(a.created_at || "")
        );
      },
      async create(reg) {
        const arr = read();
        const row = { ...sanitize(reg), id: uid(), created_at: new Date().toISOString() };
        arr.push(row);
        write(arr);
        return row;
      },
      async update(id, reg) {
        const arr = read();
        const i = arr.findIndex((r) => r.id === id);
        if (i === -1) throw new Error("Registro não encontrado");
        arr[i] = { ...arr[i], ...sanitize(reg) };
        write(arr);
        return arr[i];
      },
      async remove(id) {
        write(read().filter((r) => r.id !== id));
      },
      async bulkCreate(regs) {
        const arr = read();
        const now = Date.now();
        regs.forEach((reg, idx) => {
          arr.push({
            ...sanitize(reg),
            id: uid(),
            created_at: new Date(now + idx).toISOString(),
          });
        });
        write(arr);
        return regs.length;
      },
      // documentos / itens (modo local)
      async listDocumentos() { try { return JSON.parse(localStorage.getItem("controle_documentos_v1")) || []; } catch { return []; } },
      async listItens() { try { return JSON.parse(localStorage.getItem("controle_itens_v1")) || []; } catch { return []; } },
      async createDocumento(doc) {
        const a = await this.listDocumentos(); const row = { ...doc, id: uid(), created_at: new Date().toISOString() };
        a.push(row); localStorage.setItem("controle_documentos_v1", JSON.stringify(a)); emitChange(); return row;
      },
      async updateDocumento(id, doc) {
        const a = await this.listDocumentos(); const i = a.findIndex((x) => x.id === id);
        if (i > -1) { a[i] = { ...a[i], ...doc }; localStorage.setItem("controle_documentos_v1", JSON.stringify(a)); emitChange(); return a[i]; }
      },
      async removeDocumento(id) {
        let a = await this.listDocumentos(); a = a.filter((x) => x.id !== id);
        localStorage.setItem("controle_documentos_v1", JSON.stringify(a));
        let it = await this.listItens(); it = it.filter((x) => x.documento_id !== id);
        localStorage.setItem("controle_itens_v1", JSON.stringify(it)); emitChange();
      },
      async createItem(item) {
        const a = await this.listItens(); const row = { ...item, id: uid(), created_at: new Date().toISOString() };
        a.push(row); localStorage.setItem("controle_itens_v1", JSON.stringify(a)); emitChange(); return row;
      },
      async removeItem(id) {
        let a = await this.listItens(); a = a.filter((x) => x.id !== id && x.parent_id !== id);
        localStorage.setItem("controle_itens_v1", JSON.stringify(a)); emitChange();
      },
      async updateItem(id, item) {
        let a = await this.listItens();
        const i = a.findIndex((x) => x.id === id);
        if (i > -1) {
          if ("codigo" in item) a[i].codigo = item.codigo;
          if ("titulo" in item) a[i].titulo = item.titulo;
          localStorage.setItem("controle_itens_v1", JSON.stringify(a));
          emitChange();
          return a[i];
        }
      },
    };
  }

  const store = hasSupabase ? supabaseStore() : localStore();
  store.onChange = (cb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  };

  window.DataStore = store;
})();
