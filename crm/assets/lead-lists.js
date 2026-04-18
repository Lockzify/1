(() => {
  const bootstrap = window.__CRM_BOOTSTRAP__;
  if (!bootstrap || !bootstrap.user) return;

  const isAdmin = bootstrap.user.role === "admin";
  const crmBasePath = String(bootstrap.basePath ?? "").replace(/\/$/, "");
  const apiPhpUrl = crmBasePath === "" ? "/api.php" : `${crmBasePath}/api.php`;

  const leadListsMenu = document.getElementById("leadListsMenu");
  const leadListName = document.getElementById("leadListName");
  const leadListMeta = document.getElementById("leadListMeta");
  const leadSheetHead = document.getElementById("leadSheetHead");
  const leadSheetBody = document.getElementById("leadSheetBody");
  const leadSheetEmpty = document.getElementById("leadSheetEmpty");

  const llImportModal = document.getElementById("llImportModal");
  const llImportFile = document.getElementById("llImportFile");
  const llImportMappingWrap = document.getElementById("llImportMappingWrap");
  const llImportMappingBody = document.getElementById("llImportMappingBody");
  const llImportApply = document.getElementById("llImportApply");
  const llImportCancel = document.getElementById("llImportCancel");

  const llFieldsModal = document.getElementById("llFieldsModal");
  const llFieldsTableBody = document.getElementById("llFieldsTableBody");
  const llFieldsClose = document.getElementById("llFieldsClose");
  const llNewFieldForm = document.getElementById("llNewFieldForm");

  /** @type {{ id: number|null, name: string, rows: Record<string,string>[] }} */
  let draft = { id: null, name: "", rows: [] };

  /** @type {{ id:string, key:string, label:string, sortOrder:number}[]} */
  let globalVariables = [];

  /** @type {string[][]|null} */
  let importMatrix = null;

  /** @type {string|null} */
  let importFileBaseName = null;

  async function api(action, options = {}) {
    const q = new URLSearchParams();
    q.set("action", action);
    const query = options.query;
    const rest = { ...options };
    delete rest.query;
    if (query && typeof query === "object") {
      Object.entries(query).forEach(([k, v]) => q.set(k, String(v)));
    }
    const url = `${apiPhpUrl}?${q.toString()}`;
    const init = { credentials: "same-origin", ...rest };
    init.headers = { ...(init.headers || {}), "X-CSRF-Token": bootstrap.csrfToken };
    const res = await fetch(url, init);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Anfrage fehlgeschlagen");
    return data;
  }

  async function loadGlobalVariables() {
    const data = await api("lead_variables", { method: "GET" });
    globalVariables = Array.isArray(data.variables) ? data.variables : [];
    return globalVariables;
  }

  function emptyLine() {
    const line = {};
    globalVariables.forEach((v) => {
      line[v.key] = "";
    });
    return line;
  }

  function emptyDraft() {
    return {
      id: null,
      name: "Neue Lead-Liste",
      rows: globalVariables.length ? [emptyLine()] : [],
    };
  }

  /** Erkennt Spalten, die Telefonnummern enthalten (globaler Feld-Key oder -Label). */
  function isPhoneColumn(col) {
    const k = (col.key || "").toLowerCase();
    const lab = (col.label || "").toLowerCase();
    const keyParts = k.split(/[^a-z0-9]+/).filter(Boolean);
    const keyHints = new Set(["telefon", "phone", "tel", "handy", "mobil", "mobile", "fax", "festnetz"]);
    if (keyParts.some((p) => keyHints.has(p))) return true;
    if (
      k.includes("telefon") ||
      k.includes("handy") ||
      k.includes("mobil") ||
      k.includes("phone") ||
      /(^|[^a-z])tel([^a-z]|$)/.test(k)
    ) {
      return true;
    }
    return /\b(telefon|handy|mobil|festnetz|fax|phone|tel\.)\b/i.test(lab);
  }

  /** Mindestens wählbare Ziffernfolge für tel:-Links (DE/international). */
  function normalizeTelUri(raw) {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return "";
    const hasPlus = trimmed.startsWith("+");
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length < 5) return "";
    let body = (hasPlus ? "+" : "") + digits;
    if (body.startsWith("+00")) body = "+" + body.slice(3);
    else if (!hasPlus && digits.startsWith("00")) body = "+" + digits.slice(2);
    return `tel:${body}`;
  }

  function setupPhoneLeadCell(wrap, input, dialRow, link, editBtn) {
    function syncDialUI() {
      const v = input.value.trim();
      const uri = normalizeTelUri(v);
      const editing = wrap.classList.contains("lead-phone-wrap--editing");
      if (editing || !uri) {
        dialRow.classList.add("hidden");
        return;
      }
      dialRow.classList.remove("hidden");
      link.href = uri;
      link.textContent = v;
      link.setAttribute("aria-label", `Nummer ${v} anrufen`);
    }

    editBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      wrap.classList.add("lead-phone-wrap--editing");
      syncDialUI();
      input.focus();
      input.select();
    });
    input.addEventListener("focus", () => {
      wrap.classList.add("lead-phone-wrap--editing");
      syncDialUI();
    });
    input.addEventListener("blur", () => {
      wrap.classList.remove("lead-phone-wrap--editing");
      syncDialUI();
    });
    input.addEventListener("input", syncDialUI);
    syncDialUI();
  }

  function onLeadListsTabShown() {
    loadGlobalVariables()
      .then(() => {
        alignDraftRowsToVariables();
        renderSheet();
        return refreshListMenu();
      })
      .catch(console.error);
  }

  document.addEventListener("crm-main-view", (ev) => {
    if (ev.detail?.view === "leadlists") {
      onLeadListsTabShown();
    }
  });

  function alignDraftRowsToVariables() {
    const keys = globalVariables.map((v) => v.key);
    if (!keys.length) {
      draft.rows = [];
      return;
    }
    draft.rows = draft.rows.map((r) => {
      const line = {};
      keys.forEach((k) => {
        line[k] = r && r[k] != null ? String(r[k]) : "";
      });
      return line;
    });
    if (draft.rows.length === 0) {
      draft.rows = [emptyLine()];
    }
  }

  function detectDelimiter(line) {
    const commas = (line.match(/,/g) || []).length;
    const semis = (line.match(/;/g) || []).length;
    return semis > commas ? ";" : ",";
  }

  function parseCsvLine(line, delim) {
    const out = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
            continue;
          }
          q = false;
          continue;
        }
        cur += c;
        continue;
      }
      if (c === '"') {
        q = true;
        continue;
      }
      if (c === delim) {
        out.push(cur);
        cur = "";
        continue;
      }
      cur += c;
    }
    out.push(cur);
    return out;
  }

  function parseCsv(text) {
    const normalized = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const rawLines = normalized.split("\n");
    const lines = rawLines.map((l) => l.trimEnd()).filter((l) => l.length > 0);
    if (!lines.length) throw new Error("Die Datei enthält keine Zeilen.");
    const delim = detectDelimiter(lines[0]);
    return lines.map((l) => parseCsvLine(l, delim));
  }

  function normHeader(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/ß/g, "ss");
  }

  function suggestVariableKeyForHeader(headerText) {
    const h = normHeader(headerText);
    if (!h) return "";
    for (const v of globalVariables) {
      const l = normHeader(v.label);
      if (l && (h === l || h.includes(l) || l.includes(h))) {
        return v.key;
      }
    }
    return "";
  }

  function buildMappingSelects(headerRow) {
    if (!llImportMappingBody) return;
    llImportMappingBody.innerHTML = "";
    headerRow.forEach((rawHeader, colIdx) => {
      const tr = document.createElement("tr");
      const tdName = document.createElement("td");
      tdName.textContent = String(rawHeader).trim() || `(Spalte ${colIdx + 1})`;
      const tdSample = document.createElement("td");
      tdSample.className = "import-sample";
      if (importMatrix && importMatrix.length > 1) {
        const samples = importMatrix.slice(1, 4).map((row) => row[colIdx] ?? "").filter(Boolean);
        tdSample.textContent = samples.join(" · ") || "—";
      } else {
        tdSample.textContent = "—";
      }
      const tdMap = document.createElement("td");
      const sel = document.createElement("select");
      sel.className = "import-map-select";
      sel.dataset.colIndex = String(colIdx);
      const optSkip = document.createElement("option");
      optSkip.value = "";
      optSkip.textContent = "— nicht importieren —";
      sel.appendChild(optSkip);
      globalVariables.forEach((v) => {
        const o = document.createElement("option");
        o.value = v.key;
        o.textContent = `${v.label} (${v.key})`;
        sel.appendChild(o);
      });
      const guess = suggestVariableKeyForHeader(rawHeader);
      sel.value = guess;
      sel.addEventListener("change", validateImportMapping);
      tdMap.appendChild(sel);
      tr.append(tdName, tdSample, tdMap);
      llImportMappingBody.appendChild(tr);
    });
    validateImportMapping();
  }

  function validateImportMapping() {
    if (!llImportApply || !llImportMappingBody) return;
    const sels = llImportMappingBody.querySelectorAll("select.import-map-select");
    const chosen = [...sels].map((s) => s.value).filter(Boolean);
    const duplicate = new Set(chosen).size < chosen.length;
    const any = chosen.length > 0;
    llImportApply.disabled = !any || duplicate || !importMatrix;
    llImportApply.title = duplicate ? "Jedes Ziel-Feld nur einmal zuordnen." : "";
  }

  function openImportModal() {
    if (!globalVariables.length) {
      alert("Es sind keine globalen Felder definiert. Bitte einen Administrator – dieser kann unter „Globale Felder“ die Spalten für alle anlegen.");
      return;
    }
    importMatrix = null;
    importFileBaseName = null;
    if (llImportFile) llImportFile.value = "";
    if (llImportMappingWrap) llImportMappingWrap.classList.add("hidden");
    if (llImportApply) llImportApply.disabled = true;
    if (llImportModal && typeof llImportModal.showModal === "function") llImportModal.showModal();
  }

  function closeImportModal() {
    if (llImportModal && typeof llImportModal.close === "function") llImportModal.close();
  }

  function applyCsvImport() {
    if (!importMatrix || importMatrix.length < 2) {
      alert("Keine Datenzeilen nach der Kopfzeile.");
      return;
    }
    const header = importMatrix[0];
    const sels = llImportMappingBody?.querySelectorAll("select.import-map-select");
    if (!sels) return;
    const mapping = [];
    sels.forEach((s) => mapping.push(s.value || null));
    const usedKeys = mapping.filter(Boolean);
    if (new Set(usedKeys).size !== usedKeys.length) {
      alert("Jedes Ziel-Feld darf nur einer CSV-Spalte zugeordnet werden.");
      return;
    }
    const rows = [];
    for (let r = 1; r < importMatrix.length; r++) {
      const line = emptyLine();
      mapping.forEach((varKey, j) => {
        if (varKey && importMatrix[r][j] != null) {
          line[varKey] = String(importMatrix[r][j]);
        }
      });
      rows.push(line);
    }
    if (rows.length > 8000) {
      alert("Maximal 8000 Zeilen.");
      return;
    }
    draft = {
      id: null,
      name: importFileBaseName || "CSV-Import",
      rows,
    };
    if (leadListName) leadListName.value = draft.name;
    if (leadListMeta) leadListMeta.textContent = `${rows.length} Zeilen importiert · bitte speichern`;
    renderSheet();
    closeImportModal();
    refreshListMenu().catch(console.error);
  }

  function syncDraftFromInputs() {
    if (!leadSheetBody) return;
    leadSheetBody.querySelectorAll("tr[data-row-index]").forEach((tr) => {
      const ri = Number(tr.getAttribute("data-row-index"));
      if (!Number.isFinite(ri) || !draft.rows[ri]) return;
      tr.querySelectorAll("input.lead-cell").forEach((input) => {
        const k = input.getAttribute("data-col-key");
        if (k) draft.rows[ri][k] = input.value;
      });
    });
    if (leadListName) draft.name = leadListName.value.trim();
  }

  function renderSheet() {
    if (!leadSheetHead || !leadSheetBody || !leadSheetEmpty) return;
    const hasVars = globalVariables.length > 0;
    leadSheetEmpty.classList.toggle("hidden", hasVars);
    document.getElementById("leadSheetTable")?.classList.toggle("hidden", !hasVars);
    if (!hasVars) {
      leadSheetEmpty.textContent =
        "Noch keine globalen Felder vorhanden. Ein Admin kann unter „Globale Felder“ die einheitlichen Spalten für alle Nutzer anlegen.";
      leadSheetHead.innerHTML = "";
      leadSheetBody.innerHTML = "";
      return;
    }
    leadSheetEmpty.textContent = "Wählen Sie eine Lead-Liste oder legen Sie eine neue an.";

    const trh = document.createElement("tr");
    globalVariables.forEach((col) => {
      const th = document.createElement("th");
      th.setAttribute("data-col-key", col.key);
      const wrap = document.createElement("div");
      wrap.className = "lead-th-wrap lead-th-readonly";
      const lab = document.createElement("span");
      lab.className = "lead-col-label-readonly";
      lab.textContent = col.label;
      lab.title = `Technischer Name: ${col.key}`;
      wrap.appendChild(lab);
      th.appendChild(wrap);
      trh.appendChild(th);
    });
    leadSheetHead.innerHTML = "";
    leadSheetHead.appendChild(trh);

    leadSheetBody.innerHTML = "";
    draft.rows.forEach((row, ri) => {
      const tr = document.createElement("tr");
      tr.setAttribute("data-row-index", String(ri));
      globalVariables.forEach((col) => {
        const td = document.createElement("td");
        if (isPhoneColumn(col)) {
          const wrap = document.createElement("div");
          wrap.className = "lead-phone-wrap";
          const input = document.createElement("input");
          input.type = "tel";
          input.inputMode = "tel";
          input.autocomplete = "tel";
          input.className = "lead-cell lead-cell-phone-input";
          input.setAttribute("data-col-key", col.key);
          input.value = row[col.key] ?? "";
          const dialRow = document.createElement("div");
          dialRow.className = "lead-phone-dial-row";
          const link = document.createElement("a");
          link.className = "lead-tel-dial";
          const editBtn = document.createElement("button");
          editBtn.type = "button";
          editBtn.className = "lead-phone-edit-btn";
          editBtn.textContent = "\u270E";
          editBtn.title = "Nummer bearbeiten";
          editBtn.setAttribute("aria-label", "Nummer bearbeiten");
          dialRow.append(link, editBtn);
          wrap.append(input, dialRow);
          setupPhoneLeadCell(wrap, input, dialRow, link, editBtn);
          td.appendChild(wrap);
        } else {
          const input = document.createElement("input");
          input.type = "text";
          input.className = "lead-cell";
          input.setAttribute("data-col-key", col.key);
          input.value = row[col.key] ?? "";
          td.appendChild(input);
        }
        tr.appendChild(td);
      });
      leadSheetBody.appendChild(tr);
    });
  }

  function addRow() {
    if (!globalVariables.length) return;
    syncDraftFromInputs();
    draft.rows.push(emptyLine());
    renderSheet();
  }

  async function refreshListMenu() {
    if (!leadListsMenu) return;
    const data = await api("lead_lists", { method: "GET" });
    leadListsMenu.innerHTML = "";
    data.lists.forEach((item) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lead-list-menu-btn";
      btn.textContent = item.name;
      const meta = document.createElement("span");
      meta.className = "lead-list-menu-meta";
      meta.textContent = `${item.rowCount} Zeilen`;
      if (draft.id === item.id) btn.classList.add("is-active");
      btn.addEventListener("click", () => loadList(item.id));
      li.append(btn, meta);
      leadListsMenu.appendChild(li);
    });
  }

  function formatMeta(updatedAt, rowCount) {
    if (!updatedAt) return "";
    try {
      const d = new Date(updatedAt);
      const dt = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(d);
      return `${rowCount} Zeilen · zuletzt ${dt}`;
    } catch {
      return "";
    }
  }

  async function loadList(id) {
    const data = await api("lead_list", { method: "GET", query: { id } }).catch((e) => {
      alert(e.message);
      throw e;
    });
    if (data.variables) globalVariables = data.variables;
    const list = data.list;
    if (!list || list.id !== id) return;
    draft = {
      id: list.id,
      name: list.name,
      rows: Array.isArray(list.rows) ? list.rows : [],
    };
    alignDraftRowsToVariables();
    if (leadListName) leadListName.value = draft.name;
    if (leadListMeta) leadListMeta.textContent = formatMeta(list.updatedAt, draft.rows.length);
    renderSheet();
    await refreshListMenu();
  }

  function newList() {
    draft = emptyDraft();
    if (leadListName) leadListName.value = draft.name;
    if (leadListMeta) leadListMeta.textContent = "Noch nicht gespeichert";
    renderSheet();
  }

  async function saveList() {
    syncDraftFromInputs();
    if (!draft.name.trim()) {
      alert("Bitte einen Namen für die Lead-Liste eingeben.");
      return;
    }
    if (!globalVariables.length) {
      alert("Keine globalen Felder – Speichern nicht möglich.");
      return;
    }
    try {
      const body = {
        name: draft.name.trim(),
        rows: draft.rows,
      };
      if (draft.id) body.id = draft.id;
      const res = await api("lead_list_save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      draft.id = res.id;
      const fresh = await api("lead_list", { method: "GET", query: { id: draft.id } }).catch(() => null);
      if (fresh?.variables) globalVariables = fresh.variables;
      if (fresh?.list && leadListMeta) {
        leadListMeta.textContent = formatMeta(fresh.list.updatedAt, draft.rows.length);
      }
      alignDraftRowsToVariables();
      renderSheet();
      await refreshListMenu();
      alert("Gespeichert.");
    } catch (e) {
      alert(e.message);
    }
  }

  async function deleteList() {
    if (!draft.id) {
      alert("Diese Lead-Liste ist nur lokal – zum Löschen muss sie zuerst gespeichert werden.");
      return;
    }
    if (!window.confirm("Diese Lead-Liste dauerhaft löschen?")) return;
    try {
      await api("lead_list_delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: draft.id }),
      });
      await loadGlobalVariables();
      newList();
      if (leadListMeta) leadListMeta.textContent = "";
      await refreshListMenu();
    } catch (e) {
      alert(e.message);
    }
  }

  function escapeCsvField(s) {
    const t = String(s ?? "");
    if (/[;\n\r"]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
    return t;
  }

  function exportCsv() {
    syncDraftFromInputs();
    if (!globalVariables.length) return;
    const delim = ";";
    const header = globalVariables.map((c) => escapeCsvField(c.label));
    const lines = [header.join(delim)];
    draft.rows.forEach((r) => {
      lines.push(globalVariables.map((c) => escapeCsvField(r[c.key] ?? "")).join(delim));
    });
    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(draft.name || "lead-liste").replace(/[^\w\-äöüÄÖÜß]+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function refreshFieldsTable() {
    if (!isAdmin || !llFieldsTableBody) return;
    const data = await api("lead_variables", { method: "GET" });
    const vars = data.variables || [];
    llFieldsTableBody.innerHTML = "";
    vars.forEach((v) => {
      const tr = document.createElement("tr");
      tr.dataset.fieldId = String(v.id);
      const tdKey = document.createElement("td");
      tdKey.textContent = v.key;
      tdKey.className = "field-key-cell";
      const tdLabel = document.createElement("td");
      const inLabel = document.createElement("input");
      inLabel.type = "text";
      inLabel.className = "field-edit-label";
      inLabel.value = v.label;
      inLabel.maxLength = 200;
      tdLabel.appendChild(inLabel);
      const tdSort = document.createElement("td");
      const inSort = document.createElement("input");
      inSort.type = "number";
      inSort.className = "field-edit-sort";
      inSort.value = String(v.sortOrder);
      tdSort.appendChild(inSort);
      const tdAct = document.createElement("td");
      tdAct.className = "field-actions";
      const btnSave = document.createElement("button");
      btnSave.type = "button";
      btnSave.className = "link-btn";
      btnSave.textContent = "Speichern";
      btnSave.addEventListener("click", async () => {
        try {
          await api("lead_variable_update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: v.id,
              label: inLabel.value.trim(),
              sortOrder: Number(inSort.value) || 0,
            }),
          });
          await loadGlobalVariables();
          alignDraftRowsToVariables();
          renderSheet();
          await refreshFieldsTable();
        } catch (e) {
          alert(e.message);
        }
      });
      const btnUp = document.createElement("button");
      btnUp.type = "button";
      btnUp.className = "link-btn";
      btnUp.textContent = "↑";
      btnUp.title = "Nach oben";
      btnUp.addEventListener("click", async () => {
        try {
          await api("lead_variable_move", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: v.id, direction: "up" }),
          });
          await loadGlobalVariables();
          alignDraftRowsToVariables();
          renderSheet();
          await refreshFieldsTable();
        } catch (e) {
          alert(e.message);
        }
      });
      const btnDown = document.createElement("button");
      btnDown.type = "button";
      btnDown.className = "link-btn";
      btnDown.textContent = "↓";
      btnDown.title = "Nach unten";
      btnDown.addEventListener("click", async () => {
        try {
          await api("lead_variable_move", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: v.id, direction: "down" }),
          });
          await loadGlobalVariables();
          alignDraftRowsToVariables();
          renderSheet();
          await refreshFieldsTable();
        } catch (e) {
          alert(e.message);
        }
      });
      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "link-btn danger";
      btnDel.textContent = "Löschen";
      btnDel.addEventListener("click", async () => {
        if (!window.confirm(`Feld „${v.label}“ wirklich löschen? Werte in allen Lead-Listen gehen in dieser Spalte verloren.`)) return;
        try {
          await api("lead_variable_delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: v.id }),
          });
          await loadGlobalVariables();
          alignDraftRowsToVariables();
          renderSheet();
          await refreshFieldsTable();
        } catch (e) {
          alert(e.message);
        }
      });
      tdAct.append(btnSave, document.createTextNode(" "), btnUp, btnDown, document.createTextNode(" "), btnDel);
      tr.append(tdKey, tdLabel, tdSort, tdAct);
      llFieldsTableBody.appendChild(tr);
    });
  }

  async function openFieldsModal() {
    if (!isAdmin || !llFieldsModal) return;
    await refreshFieldsTable();
    if (typeof llFieldsModal.showModal === "function") llFieldsModal.showModal();
  }

  document.getElementById("llNewList")?.addEventListener("click", () => newList());
  document.getElementById("llSaveList")?.addEventListener("click", () => saveList().catch(console.error));
  document.getElementById("llDeleteList")?.addEventListener("click", () => deleteList().catch(console.error));
  document.getElementById("llExportCsv")?.addEventListener("click", () => exportCsv());
  document.getElementById("llAddRow")?.addEventListener("click", () => addRow());
  document.getElementById("llOpenImport")?.addEventListener("click", () => openImportModal());
  document.getElementById("llManageFields")?.addEventListener("click", () => openFieldsModal().catch(console.error));

  llImportFile?.addEventListener("change", (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    importFileBaseName = file.name.replace(/\.csv$/i, "") || "Import";
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importMatrix = parseCsv(String(reader.result || ""));
        if (importMatrix.length < 2) {
          alert("Die CSV-Datei braucht eine Kopfzeile und mindestens eine Datenzeile.");
          importMatrix = null;
          return;
        }
        if (llImportMappingWrap) {
          llImportMappingWrap.classList.remove("hidden");
          buildMappingSelects(importMatrix[0]);
        }
      } catch (e) {
        alert(e.message);
        importMatrix = null;
      }
    };
    reader.readAsText(file, "UTF-8");
  });

  llImportCancel?.addEventListener("click", () => closeImportModal());
  llImportApply?.addEventListener("click", () => applyCsvImport());

  llFieldsClose?.addEventListener("click", () => {
    if (llFieldsModal && typeof llFieldsModal.close === "function") llFieldsModal.close();
  });

  llNewFieldForm?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const keyEl = document.getElementById("llNewFieldKey");
    const labelEl = document.getElementById("llNewFieldLabel");
    if (!keyEl || !labelEl) return;
    try {
      await api("lead_variable_create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: keyEl.value.trim(), label: labelEl.value.trim() }),
      });
      keyEl.value = "";
      labelEl.value = "";
      await loadGlobalVariables();
      alignDraftRowsToVariables();
      renderSheet();
      await refreshFieldsTable();
    } catch (e) {
      alert(e.message);
    }
  });

  (async function init() {
    await loadGlobalVariables();
    newList();
  })();
})();
