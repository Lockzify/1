(() => {
  const CRM_INTENT_TEXT_ONLY_URI = "tel:00000000000";

  /** @type {string} */
  let csrfToken = "";
  /** @type {{ id:number, email:string, displayName:string, role:string }|null} */
  let currentUser = null;
  let isAdmin = false;

  const apiPhpHref = new URL("api.php", window.location.href).href.split("?")[0];

  const ROW_COLOR_KEY = "__rowColor";

  const ROW_COLOR_PRESETS = [
    { value: "", label: "Keine Markierung", swatch: null },
    { value: "#fde8e8", label: "Bastard", swatch: "#d32f2f" },
    { value: "#e8f5e9", label: "Terminiert", swatch: "#388e3c" },
    { value: "#eceff1", label: "Nicht erreicht", swatch: "#78909c" },
    { value: "#e3f2fd", label: "Follow up", swatch: "#1976d2" },
  ];

  /** @type {HTMLElement|null} */
  let rowColorMenuEl = null;
  /** @type {number|null} */
  let rowColorMenuRowIndex = null;

  const leadsListMenu = document.getElementById("leadsListMenu");
  const leadsListName = document.getElementById("leadsListName");
  const leadsListMeta = document.getElementById("leadsListMeta");
  const leadsListOwnerLabel = document.getElementById("leadsListOwnerLabel");
  const leadsListScopeFilter = document.getElementById("leadsListScopeFilter");
  const leadsListUserFilter = document.getElementById("leadsListUserFilter");
  const leadsSearchInput = document.getElementById("leadsSearchInput");
  const leadsSheetStats = document.getElementById("leadsSheetStats");
  const leadsSheetHead = document.getElementById("leadsSheetHead");
  const leadsSheetBody = document.getElementById("leadsSheetBody");
  const leadsSheetColgroup = document.getElementById("leadsSheetColgroup");
  const leadsSheetEmpty = document.getElementById("leadsSheetEmpty");
  const leadsSheetTable = document.getElementById("leadsSheetTable");

  const leadsImportModal = document.getElementById("leadsImportModal");
  const leadsImportFile = document.getElementById("leadsImportFile");
  const leadsImportMappingWrap = document.getElementById("leadsImportMappingWrap");
  const leadsImportMappingBody = document.getElementById("leadsImportMappingBody");
  const leadsImportApply = document.getElementById("leadsImportApply");
  const leadsImportCancel = document.getElementById("leadsImportCancel");
  const leadsSaveStatus = document.getElementById("leadsSaveStatus");

  const incomingCallModal = document.getElementById("incomingCallModal");
  const incomingCallNumber = document.getElementById("incomingCallNumber");
  const incomingCallCopy = document.getElementById("incomingCallCopy");
  const incomingCallDial = document.getElementById("incomingCallDial");
  const incomingCallDismiss = document.getElementById("incomingCallDismiss");

  /** @type {{ id: number|null, name: string, rows: Record<string,string>[], listOwnerUserId: number }} */
  let draft = { id: null, name: "", rows: [], listOwnerUserId: 0 };

  /** @type {{ id:number, displayName:string }[]} */
  let teamUsers = [];

  let listScope = "mine";
  let listScopeUserId = 0;

  /** @type {{ id:string, key:string, label:string, sortOrder:number}[]} */
  let globalVariables = [];

  /** @type {string[][]|null} */
  let importMatrix = null;

  /** @type {string|null} */
  let importFileBaseName = null;

  const incomingCallQueue = [];
  let incomingCallDialogBusy = false;
  let lastCallIntentPollSince = "";
  const CALL_INTENT_POLL_MS = 800;
  const clientDismissedIntentIds = new Set();
  const intentShownOnceOnDevice = new Set();

  let leadsAutoSaveTimer = null;
  let leadsAutoSaveInFlight = false;

  function callIntentDoneStorageKey() {
    const id = currentUser && currentUser.id != null ? String(currentUser.id) : "";
    return id ? `adl_crm_intent_done_${id}` : "adl_crm_intent_done";
  }

  function loadPersistedDismissedIntentIds() {
    try {
      const raw = sessionStorage.getItem(callIntentDoneStorageKey());
      if (!raw) {
        return;
      }
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) {
        return;
      }
      arr.forEach((x) => {
        const n = Number(x);
        if (Number.isFinite(n) && n > 0) {
          clientDismissedIntentIds.add(n);
        }
      });
    } catch (_) {
      /* sessionStorage / JSON */
    }
  }

  function persistDismissedIntentIdLocal(id) {
    if (!Number.isFinite(id) || id <= 0) {
      return;
    }
    try {
      const key = callIntentDoneStorageKey();
      const raw = sessionStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(arr) ? arr : [];
      if (!list.includes(id)) {
        list.push(id);
      }
      while (list.length > 120) {
        list.shift();
      }
      sessionStorage.setItem(key, JSON.stringify(list));
    } catch (_) {
      /* private mode o.Ä. */
    }
  }

  const leadsFieldsModal = document.getElementById("leadsFieldsModal");
  const leadsFieldsTableBody = document.getElementById("leadsFieldsTableBody");
  const leadsFieldsClose = document.getElementById("leadsFieldsClose");
  const leadsNewFieldForm = document.getElementById("leadsNewFieldForm");

  async function api(action, options = {}) {
    const q = new URLSearchParams();
    q.set("action", action);
    const query = options.query;
    const rest = { ...options };
    delete rest.query;
    if (query && typeof query === "object") {
      Object.entries(query).forEach(([k, v]) => q.set(k, String(v)));
    }
    const url = `${apiPhpHref}?${q.toString()}`;
    const init = { credentials: "same-origin", ...rest };
    init.headers = { ...(init.headers || {}), "X-CSRF-Token": csrfToken };
    const res = await fetch(url, init);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Anfrage fehlgeschlagen");
    return data;
  }

  function showLeadsToast(msg) {
    const el = document.getElementById("leadsAppToast");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(showLeadsToast._t);
    showLeadsToast._t = window.setTimeout(() => {
      el.classList.add("hidden");
    }, 4200);
  }

  function setLeadsSaveStatus(text, isError) {
    if (!leadsSaveStatus) return;
    leadsSaveStatus.textContent = text || "";
    leadsSaveStatus.classList.toggle("leads-save-status--error", Boolean(isError));
  }

  function scheduleLeadsAutoSave() {
    if (leadsAutoSaveTimer) {
      clearTimeout(leadsAutoSaveTimer);
    }
    setLeadsSaveStatus("Wird gespeichert …");
    leadsAutoSaveTimer = window.setTimeout(() => {
      leadsAutoSaveTimer = null;
      void flushLeadsAutoSave();
    }, 550);
  }

  async function flushLeadsAutoSave() {
    if (leadsAutoSaveInFlight) {
      scheduleLeadsAutoSave();
      return;
    }
    if (!draft.name.trim()) {
      draft.name = (leadsListName?.value || "").trim() || "Neue Lead-Liste";
      if (leadsListName) leadsListName.value = draft.name;
    }
    if (!globalVariables.length) {
      setLeadsSaveStatus("");
      return;
    }
    leadsAutoSaveInFlight = true;
    try {
      await saveList({ silent: true });
      setLeadsSaveStatus("Gespeichert");
    } catch (e) {
      setLeadsSaveStatus(e instanceof Error ? e.message : "Speichern fehlgeschlagen", true);
    } finally {
      leadsAutoSaveInFlight = false;
    }
  }

  function crmPhoneDisplayForUi(raw) {
    const s = String(raw || "");
    if (!s) return "";
    return s.split("").join("\u200b\u2060");
  }

  async function crmCopyPlainText(text) {
    const t = String(text || "");
    if (!t) return;
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(t);
      return;
    }
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
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
      listOwnerUserId: currentUser?.id ?? 0,
    };
  }

  async function loadTeamUsers() {
    const data = await api("lead_team_users", { method: "GET" });
    teamUsers = Array.isArray(data.users) ? data.users : [];
    populateUserSelects();
  }

  function populateUserSelects() {
    const opts = teamUsers.map((u) => ({ value: String(u.id), label: u.displayName }));
    if (leadsListUserFilter) {
      const prev = leadsListUserFilter.value;
      replaceSelectOptions(leadsListUserFilter, opts);
      if (teamUsers.some((u) => String(u.id) === prev)) leadsListUserFilter.value = prev;
    }
    document.querySelectorAll(".leads-admin-only").forEach((el) => {
      el.classList.toggle("hidden", !isAdmin);
    });
  }

  function replaceSelectOptions(selectEl, options) {
    if (!selectEl) return;
    selectEl.innerHTML = "";
    options.forEach((option) => {
      const item = document.createElement("option");
      item.value = option.value;
      item.textContent = option.label;
      selectEl.append(item);
    });
  }

  function listScopeApiQuery() {
    if (listScope === "all" && isAdmin) return { scope: "all" };
    if (listScope === "user" && listScopeUserId > 0) {
      return { scope: "user", userId: listScopeUserId };
    }
    return { scope: "mine" };
  }

  function userNameById(id) {
    const u = teamUsers.find((x) => x.id === Number(id));
    return u?.displayName || "Unbekannt";
  }

  function rowColorPreset(value) {
    const v = normalizeRowColor(value);
    return ROW_COLOR_PRESETS.find((p) => p.value === v) || ROW_COLOR_PRESETS[0];
  }

  function normalizeRowColor(color) {
    const s = String(color || "").trim().toLowerCase();
    if (!s) return "";
    const allowed = new Set(ROW_COLOR_PRESETS.map((p) => p.value).filter(Boolean));
    return allowed.has(s) ? s : "";
  }

  function closeRowColorMenu() {
    rowColorMenuRowIndex = null;
    rowColorMenuEl?.classList.add("hidden");
    rowColorMenuEl?.setAttribute("aria-hidden", "true");
  }

  function ensureRowColorMenu() {
    if (rowColorMenuEl) return rowColorMenuEl;
    const menu = document.createElement("div");
    menu.id = "leadsRowColorMenu";
    menu.className = "leads-row-color-menu hidden";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Zeilenstatus");
    menu.setAttribute("aria-hidden", "true");
    ROW_COLOR_PRESETS.forEach((preset) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "leads-row-color-menu__option";
      btn.setAttribute("role", "menuitemradio");
      btn.dataset.value = preset.value;
      const swatch = document.createElement("span");
      swatch.className = "leads-row-color-menu__swatch";
      if (!preset.value) {
        swatch.classList.add("leads-row-color-menu__swatch--empty");
      } else {
        swatch.style.backgroundColor = preset.swatch || preset.value;
      }
      const label = document.createElement("span");
      label.className = "leads-row-color-menu__label";
      label.textContent = preset.label;
      btn.append(swatch, label);
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ri = rowColorMenuRowIndex;
        if (ri == null || ri < 0 || !draft.rows[ri]) {
          closeRowColorMenu();
          return;
        }
        const value = normalizeRowColor(btn.dataset.value);
        draft.rows[ri][ROW_COLOR_KEY] = value;
        const tr = leadsSheetBody?.querySelector(`tr[data-row-index="${ri}"]`);
        applyRowColorStyle(tr, value);
        renderSheetStats();
        closeRowColorMenu();
        scheduleLeadsAutoSave();
      });
      menu.appendChild(btn);
    });
    document.body.appendChild(menu);
    rowColorMenuEl = menu;
    return menu;
  }

  function openRowColorMenu(anchorBtn, rowIndex) {
    const menu = ensureRowColorMenu();
    rowColorMenuRowIndex = rowIndex;
    const current = normalizeRowColor(draft.rows[rowIndex]?.[ROW_COLOR_KEY]);
    menu.querySelectorAll(".leads-row-color-menu__option").forEach((opt) => {
      const v = normalizeRowColor(opt.dataset.value);
      const active = v === current;
      opt.classList.toggle("is-active", active);
      opt.setAttribute("aria-checked", active ? "true" : "false");
    });
    const rect = anchorBtn.getBoundingClientRect();
    menu.classList.remove("hidden");
    menu.setAttribute("aria-hidden", "false");
    const menuRect = menu.getBoundingClientRect();
    let top = rect.bottom + 4;
    let left = rect.left;
    if (left + menuRect.width > window.innerWidth - 8) {
      left = window.innerWidth - menuRect.width - 8;
    }
    if (top + menuRect.height > window.innerHeight - 8) {
      top = rect.top - menuRect.height - 4;
    }
    menu.style.top = `${Math.max(8, top)}px`;
    menu.style.left = `${Math.max(8, left)}px`;
  }

  function applyRowColorStyle(tr, color) {
    if (!tr) return;
    const c = normalizeRowColor(color);
    const preset = rowColorPreset(c);
    if (c) {
      tr.dataset.rowColor = c;
      tr.style.setProperty("--leads-row-bg", c);
      tr.classList.add("leads-row--colored");
    } else {
      delete tr.dataset.rowColor;
      tr.style.removeProperty("--leads-row-bg");
      tr.classList.remove("leads-row--colored");
    }
    const btn = tr.querySelector(".leads-row-color-btn");
    if (btn) {
      const swatch = preset.swatch || c || "";
      btn.style.backgroundColor = swatch;
      btn.classList.toggle("leads-row-color-btn--empty", !c);
      btn.title = c ? preset.label : "Status wählen";
      btn.setAttribute("aria-label", c ? `Status: ${preset.label}` : "Status wählen");
    }
  }

  function rowMatchesSearch(row) {
    const q = (leadsSearchInput?.value || "").trim().toLowerCase();
    if (!q) return true;
    const hay = globalVariables
      .map((c) => row[c.key])
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  }

  function getVisibleRowEntries() {
    return draft.rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => rowMatchesSearch(row));
  }

  function updateListOwnerLabel() {
    if (!leadsListOwnerLabel) return;
    if (!draft.listOwnerUserId || draft.listOwnerUserId === currentUser?.id) {
      leadsListOwnerLabel.classList.add("hidden");
      return;
    }
    leadsListOwnerLabel.textContent = `Listen-Inhaber: ${userNameById(draft.listOwnerUserId)}`;
    leadsListOwnerLabel.classList.remove("hidden");
  }

  function renderSheetStats() {
    if (!leadsSheetStats) return;
    const visible = getVisibleRowEntries().length;
    const total = draft.rows.length;
    const colored = draft.rows.filter((r) => normalizeRowColor(r[ROW_COLOR_KEY])).length;
    leadsSheetStats.innerHTML = `
      <span><strong>${visible}</strong> angezeigt</span>
      <span><strong>${total}</strong> gesamt</span>
      <span><strong>${colored}</strong> mit Status</span>
    `;
  }

  function isPhoneBroadcastColumn(col) {
    const k = (col.key || "").toLowerCase();
    const lab = String(col.label || "").trim().toLowerCase();
    if (
      k === "telefon" ||
      k === "phone" ||
      k === "tel" ||
      k === "mobil" ||
      k === "handy" ||
      k === "rufnummer" ||
      k === "mobile" ||
      k === "festnetz"
    ) {
      return true;
    }
    if (/\b(telefon|rufnummer|mobilfunk|festnetz|handy)\b/.test(lab)) return true;
    if (lab === "phone" || lab === "mobile") return true;
    return false;
  }

  function normHeader(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/ß/g, "ss");
  }

  /** Spaltenbreite in rem für table-layout: fixed */
  function columnWidthRem(col) {
    if (isPhoneBroadcastColumn(col)) {
      return 14;
    }
    const k = (col.key || "").toLowerCase();
    const lab = normHeader(col.label);
    if (/e-?mail|mail/.test(k) || /\b(e-?mail|mail)\b/.test(lab)) {
      return 14;
    }
    if (/firma|company|unternehmen|organisation/.test(k) || /\bfirma\b/.test(lab)) {
      return 12;
    }
    if (/web|url|homepage|website/.test(k) || /\bweb\b/.test(lab)) {
      return 12;
    }
    if (/notiz|note|bemerkung|kommentar/.test(k)) {
      return 16;
    }
    if (/adresse|straße|strasse|street|stadt|ort|plz|zip/.test(k)) {
      return 11;
    }
    if (/name|nachname|vorname|ansprech/.test(k)) {
      return 10;
    }
    return 10;
  }

  function rebuildSheetColgroup() {
    if (!leadsSheetColgroup || !leadsSheetTable) {
      return;
    }
    leadsSheetColgroup.replaceChildren();
    let totalRem = 0;
    const addCol = (className, rem) => {
      const col = document.createElement("col");
      if (className) {
        col.className = className;
      }
      col.style.width = `${rem}rem`;
      leadsSheetColgroup.appendChild(col);
      totalRem += rem;
    };
    addCol("leads-col-num", 2.5);
    globalVariables.forEach((col) => {
      const rem = columnWidthRem(col);
      const colEl = document.createElement("col");
      colEl.className = "leads-col-field";
      colEl.dataset.colKey = col.key;
      colEl.style.width = `${rem}rem`;
      leadsSheetColgroup.appendChild(colEl);
      totalRem += rem;
    });
    addCol("leads-col-actions", 3.5);
    const tableWidthRem = Math.ceil(totalRem * 100) / 100;
    leadsSheetTable.style.width = `${tableWidthRem}rem`;
    leadsSheetTable.style.minWidth = `${tableWidthRem}rem`;
  }

  function getPhoneBroadcastColumnKey() {
    const byKey = globalVariables.find((v) => (v.key || "").toLowerCase() === "telefon");
    if (byKey) return byKey.key;
    const c = globalVariables.find((v) => isPhoneBroadcastColumn(v));
    if (c) return c.key;
    const sorted = [...globalVariables].sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
    const fuzzy = sorted.find((v) => {
      const L = normHeader(v.label);
      const K = (v.key || "").toLowerCase();
      return (
        L.includes("telefon") ||
        L.includes("rufnummer") ||
        L.includes("mobil") ||
        K.includes("telefon") ||
        K.includes("phone") ||
        K.includes("mobil")
      );
    });
    return fuzzy ? fuzzy.key : null;
  }

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
      if (r && r[ROW_COLOR_KEY] != null) {
        line[ROW_COLOR_KEY] = normalizeRowColor(r[ROW_COLOR_KEY]);
      }
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
    if (!leadsImportMappingBody) return;
    leadsImportMappingBody.innerHTML = "";
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
      leadsImportMappingBody.appendChild(tr);
    });
    validateImportMapping();
  }

  function validateImportMapping() {
    if (!leadsImportApply || !leadsImportMappingBody) return;
    const sels = leadsImportMappingBody.querySelectorAll("select.import-map-select");
    const chosen = [...sels].map((s) => s.value).filter(Boolean);
    const duplicate = new Set(chosen).size < chosen.length;
    const any = chosen.length > 0;
    leadsImportApply.disabled = !any || duplicate || !importMatrix;
    leadsImportApply.title = duplicate ? "Jedes Ziel-Feld nur einmal zuordnen." : "";
  }

  function openImportModal() {
    if (!globalVariables.length) {
      alert("Es sind keine globalen Felder definiert. Bitte einen Administrator im CRM unter „Leads“ → „Globale Felder“.");
      return;
    }
    importMatrix = null;
    importFileBaseName = null;
    if (leadsImportFile) leadsImportFile.value = "";
    if (leadsImportMappingWrap) leadsImportMappingWrap.classList.add("hidden");
    if (leadsImportApply) leadsImportApply.disabled = true;
    if (leadsImportModal && typeof leadsImportModal.showModal === "function") leadsImportModal.showModal();
  }

  function closeImportModal() {
    if (leadsImportModal && typeof leadsImportModal.close === "function") leadsImportModal.close();
  }

  async function applyCsvImport() {
    if (!importMatrix || importMatrix.length < 2) {
      alert("Keine Datenzeilen nach der Kopfzeile.");
      return;
    }
    const sels = leadsImportMappingBody?.querySelectorAll("select.import-map-select");
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
    const keepId = draft.id;
    const keepName = (draft.name || "").trim();
    const nameFromFile = (importFileBaseName || "").trim();
    draft = {
      id: keepId,
      name: nameFromFile || keepName || "CSV-Import",
      rows,
    };
    if (leadsListName) leadsListName.value = draft.name;
    if (leadsListMeta) leadsListMeta.textContent = `${rows.length} Zeilen · speichern…`;
    renderSheet();
    closeImportModal();
    await refreshListMenu().catch(console.error);
    try {
      await saveList({ silent: true });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    }
  }

  function collectRowsFromDom() {
    if (!leadsSheetBody) return;
    const trs = [...leadsSheetBody.querySelectorAll("tr[data-row-index]")];
    const next = [...draft.rows];
    trs.forEach((tr) => {
      const ri = Number.parseInt(tr.getAttribute("data-row-index") || "-1", 10);
      if (ri < 0 || ri >= next.length) return;
      const line = { ...next[ri] };
      globalVariables.forEach((col) => {
        const inp = tr.querySelector(`input[data-col-key="${CSS.escape(col.key)}"]`);
        if (inp) line[col.key] = inp.value;
      });
      if (draft.rows[ri] && draft.rows[ri][ROW_COLOR_KEY] != null) {
        line[ROW_COLOR_KEY] = normalizeRowColor(draft.rows[ri][ROW_COLOR_KEY]);
      }
      next[ri] = line;
    });
    draft.rows = next.length ? next : [emptyLine()];
  }

  let phoneBroadcastCooldownUntil = 0;
  let phoneBroadcastInFlight = false;

  /** @returns {{ phoneDisplay: string, phoneUri: string }|null} */
  function buildCallIntentPayloadFromPhoneInput(raw) {
    const display = String(raw || "").trim();
    if (!display) return null;
    if ([...display].length > 280) {
      return null;
    }
    const digits = display.replace(/\D/g, "");
    if (digits.length < 5) {
      return null;
    }
    return { phoneDisplay: display, phoneUri: `tel:${digits}` };
  }

  /**
   * @param {string} rawPhone
   * @param {HTMLButtonElement|null} [triggerBtn]
   */
  async function sendPhoneBroadcast(rawPhone, triggerBtn) {
    const built = buildCallIntentPayloadFromPhoneInput(rawPhone);
    if (!built) {
      alert("Bitte eine gültige Telefonnummer eingeben (mindestens 5 Ziffern).");
      return;
    }
    if (phoneBroadcastInFlight) {
      return;
    }
    const now = Date.now();
    if (now < phoneBroadcastCooldownUntil) {
      return;
    }
    phoneBroadcastInFlight = true;
    if (triggerBtn) {
      triggerBtn.disabled = true;
    }
    let sendOk = false;
    try {
      await api("call_intent_send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneDisplay: built.phoneDisplay,
          phoneUri: built.phoneUri,
        }),
      });
      sendOk = true;
      showLeadsToast("Nummer an alle angemeldeten CRM-Sitzungen gesendet.");
    } catch (err) {
      phoneBroadcastCooldownUntil = 0;
      alert(err instanceof Error ? err.message : "Senden fehlgeschlagen.");
    } finally {
      phoneBroadcastInFlight = false;
      if (triggerBtn) {
        triggerBtn.disabled = false;
      }
      if (sendOk) {
        phoneBroadcastCooldownUntil = Date.now() + 750;
      }
    }
  }

  function setIntentModalActionsEnabled(enabled) {
    if (incomingCallDismiss) incomingCallDismiss.disabled = !enabled;
    if (incomingCallCopy) incomingCallCopy.disabled = !enabled;
    if (incomingCallDial) {
      if (enabled) {
        incomingCallDial.removeAttribute("aria-disabled");
        incomingCallDial.style.pointerEvents = "";
      } else {
        incomingCallDial.setAttribute("aria-disabled", "true");
        incomingCallDial.style.pointerEvents = "none";
      }
    }
  }

  function preferDialIntentPrimary() {
    try {
      if (window.matchMedia("(pointer: coarse)").matches) {
        return true;
      }
      if (window.matchMedia("(max-width: 640px)").matches) {
        return true;
      }
    } catch (_) {
      /* matchMedia */
    }
    return false;
  }

  function syncIncomingCallModalActions(uri) {
    const dialable =
      typeof uri === "string" && uri.startsWith("tel:") && uri !== CRM_INTENT_TEXT_ONLY_URI;
    const preferDial = dialable && preferDialIntentPrimary();
    if (incomingCallDial) {
      if (dialable) {
        incomingCallDial.setAttribute("href", uri);
        incomingCallDial.classList.remove("hidden");
      } else {
        incomingCallDial.setAttribute("href", "#");
        incomingCallDial.classList.add("hidden");
      }
    }
    if (incomingCallCopy) {
      if (!dialable) {
        incomingCallCopy.classList.remove("hidden");
      } else if (preferDial) {
        incomingCallCopy.classList.add("hidden");
      } else {
        incomingCallCopy.classList.remove("hidden");
      }
    }
  }

  function purgeIntentIdFromQueue(intentId) {
    if (!Number.isFinite(intentId) || intentId <= 0) {
      return;
    }
    for (let i = incomingCallQueue.length - 1; i >= 0; i--) {
      if (Number(incomingCallQueue[i].id) === intentId) {
        incomingCallQueue.splice(i, 1);
      }
    }
  }

  function isLeadFirmaIntent(it) {
    return String(it?.phoneUri || "") === CRM_INTENT_TEXT_ONLY_URI;
  }

  function fireCallIntentAck(intentId) {
    if (!Number.isFinite(intentId) || intentId <= 0) {
      return;
    }
    void api("call_intent_ack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: intentId }),
    }).catch(() => {});
  }

  function collapseLegacyTextLeadIntentsInBatch(intents) {
    const nonFirma = intents.filter((it) => !isLeadFirmaIntent(it));
    const firmas = intents.filter((it) => isLeadFirmaIntent(it));
    if (firmas.length <= 1) {
      return intents;
    }
    const sorted = [...firmas].sort((a, b) => Number(a.id) - Number(b.id));
    for (let i = 0; i < sorted.length - 1; i++) {
      const oid = Number(sorted[i].id);
      if (oid > 0) {
        fireCallIntentAck(oid);
      }
    }
    return [...nonFirma, sorted[sorted.length - 1]];
  }

  function collapseSameTelUriInBatch(intents) {
    const fixed = [];
    const byUri = new Map();
    for (const it of intents) {
      const u = String(it?.phoneUri || "");
      if (!u.startsWith("tel:") || u === CRM_INTENT_TEXT_ONLY_URI) {
        fixed.push(it);
        continue;
      }
      const id = Number(it.id);
      const prev = byUri.get(u);
      if (!prev || id > Number(prev.id)) {
        if (prev) {
          fireCallIntentAck(Number(prev.id));
        }
        byUri.set(u, it);
      } else if (id > 0) {
        fireCallIntentAck(id);
      }
    }
    return fixed.concat([...byUri.values()]);
  }

  function normalizeLeadIntentPollBatch(intents) {
    return collapseSameTelUriInBatch(collapseLegacyTextLeadIntentsInBatch(intents));
  }

  function pumpIncomingCallQueue() {
    if (incomingCallDialogBusy || incomingCallQueue.length === 0 || !incomingCallModal) {
      return;
    }
    if (incomingCallModal.open) {
      return;
    }
    incomingCallDialogBusy = true;
    const it = incomingCallQueue.shift();
    const intentId = Number(it?.id);
    if (!Number.isFinite(intentId) || intentId <= 0) {
      incomingCallDialogBusy = false;
      pumpIncomingCallQueue();
      return;
    }
    if (intentShownOnceOnDevice.has(intentId)) {
      incomingCallDialogBusy = false;
      pumpIncomingCallQueue();
      return;
    }
    intentShownOnceOnDevice.add(intentId);
    setIntentModalActionsEnabled(true);
    incomingCallModal.dataset.pendingIntentId = String(it.id);
    const raw = String(it.phoneDisplay || "");
    const uri = String(it.phoneUri || "");
    const DISPLAY_SEP = "\u001f";
    let copyPlain;
    let modalText;
    let notifBody;
    if (uri === CRM_INTENT_TEXT_ONLY_URI) {
      copyPlain = raw;
      modalText = raw;
      notifBody = raw;
    } else {
      const si = raw.indexOf(DISPLAY_SEP);
      if (si >= 0) {
        const firm = raw.slice(0, si).trim();
        copyPlain = raw.slice(si + 1).trim();
        modalText = firm && copyPlain ? `${firm}\n${copyPlain}` : raw.replace(DISPLAY_SEP, "\n");
        notifBody = firm && copyPlain ? `${firm} · ${copyPlain}` : raw.replace(DISPLAY_SEP, " · ");
      } else {
        copyPlain = raw;
        modalText = raw;
        notifBody = raw;
      }
    }
    const dialable = uri.startsWith("tel:") && uri !== CRM_INTENT_TEXT_ONLY_URI;
    incomingCallModal.dataset.phonePlain = copyPlain;
    if (incomingCallNumber) {
      incomingCallNumber.textContent = crmPhoneDisplayForUi(modalText);
      incomingCallNumber.classList.toggle("incoming-call-firma-text", uri === CRM_INTENT_TEXT_ONLY_URI);
      incomingCallNumber.classList.toggle("incoming-call-tel-display", dialable);
    }
    syncIncomingCallModalActions(uri);
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(dialable ? "ADLIONS CRM – Rückruf" : "ADLIONS CRM – Leads", {
          body: notifBody,
          tag: `crm-call-${it.id}`,
        });
      } catch (_) {
        /* ignore */
      }
    }
    try {
      if (typeof incomingCallModal.showModal === "function" && !incomingCallModal.open) {
        incomingCallModal.showModal();
      }
    } catch (_) {
      intentShownOnceOnDevice.delete(intentId);
      incomingCallDialogBusy = false;
      pumpIncomingCallQueue();
      return;
    }
    fireCallIntentAck(intentId);
  }

  function enqueueIncomingCalls(intents) {
    if (!Array.isArray(intents) || intents.length === 0) {
      return;
    }
    intents = normalizeLeadIntentPollBatch(intents);
    const queuedIds = new Set(incomingCallQueue.map((x) => Number(x.id)));
    const pendingRaw = incomingCallModal?.dataset.pendingIntentId;
    const pendingId = pendingRaw ? Number.parseInt(pendingRaw, 10) : NaN;
    const modalOpen = Boolean(incomingCallModal?.open);
    for (const it of intents) {
      const id = Number(it?.id);
      if (!Number.isFinite(id) || id <= 0) {
        continue;
      }
      if (clientDismissedIntentIds.has(id)) {
        continue;
      }
      if (intentShownOnceOnDevice.has(id)) {
        continue;
      }
      if (modalOpen && id === pendingId) {
        continue;
      }
      if (queuedIds.has(id)) {
        continue;
      }
      const telU = String(it.phoneUri || "");
      if (telU.startsWith("tel:") && telU !== CRM_INTENT_TEXT_ONLY_URI) {
        for (let i = incomingCallQueue.length - 1; i >= 0; i--) {
          const qu = String(incomingCallQueue[i].phoneUri || "");
          if (qu === telU) {
            const oldId = Number(incomingCallQueue[i].id);
            incomingCallQueue.splice(i, 1);
            queuedIds.delete(oldId);
            if (oldId > 0) {
              fireCallIntentAck(oldId);
            }
          }
        }
      }
      if (isLeadFirmaIntent(it)) {
        for (let i = incomingCallQueue.length - 1; i >= 0; i--) {
          const q = incomingCallQueue[i];
          if (!isLeadFirmaIntent(q)) {
            continue;
          }
          const oldId = Number(q.id);
          incomingCallQueue.splice(i, 1);
          queuedIds.delete(oldId);
          if (oldId > 0) {
            fireCallIntentAck(oldId);
          }
        }
      }
      incomingCallQueue.push(it);
      queuedIds.add(id);
    }
    pumpIncomingCallQueue();
  }

  function handleDismissedCallIntents(ids) {
    if (!Array.isArray(ids) || ids.length === 0) {
      return;
    }
    const dismissed = new Set(ids.map((x) => Number(x)));
    for (let i = incomingCallQueue.length - 1; i >= 0; i--) {
      if (dismissed.has(Number(incomingCallQueue[i].id))) {
        incomingCallQueue.splice(i, 1);
      }
    }
    const pendingRaw = incomingCallModal?.dataset.pendingIntentId;
    if (pendingRaw && dismissed.has(Number.parseInt(pendingRaw, 10)) && incomingCallModal) {
      incomingCallModal.dataset.intentClosedRemotely = "1";
      if (typeof incomingCallModal.close === "function") {
        incomingCallModal.close();
      }
    }
  }

  async function pollIncomingCalls() {
    if (!currentUser) return;
    try {
      const q = new URLSearchParams({ action: "call_intent_poll" });
      if (lastCallIntentPollSince) {
        q.set("since", lastCallIntentPollSince);
      }
      const res = await fetch(`${apiPhpHref}?${q.toString()}`, {
        method: "GET",
        credentials: "same-origin",
        headers: { "X-CSRF-Token": csrfToken },
      });
      const data = await res.json();
      if (!data.ok) return;
      if (Array.isArray(data.dismissedIntentIds) && data.dismissedIntentIds.length) {
        handleDismissedCallIntents(data.dismissedIntentIds);
      }
      if (typeof data.serverTime === "string" && data.serverTime) {
        lastCallIntentPollSince = data.serverTime;
      }
      if (data.intents && data.intents.length) {
        enqueueIncomingCalls(data.intents);
      }
    } catch (_) {
      /* offline */
    }
  }

  function startCallIntentPoller() {
    if (startCallIntentPoller._started) {
      return;
    }
    if (!currentUser) {
      return;
    }
    startCallIntentPoller._started = true;
    loadPersistedDismissedIntentIds();
    void pollIncomingCalls();
    window.setInterval(() => {
      void pollIncomingCalls();
    }, CALL_INTENT_POLL_MS);
    if (incomingCallModal) {
      incomingCallModal.addEventListener("close", () => {
        void (async () => {
          const closedRemotely = incomingCallModal.dataset.intentClosedRemotely === "1";
          const skipDismissInCloseHandler = incomingCallModal.dataset.skipDismissInCloseHandler === "1";
          delete incomingCallModal.dataset.intentClosedRemotely;
          delete incomingCallModal.dataset.skipDismissInCloseHandler;
          delete incomingCallModal.dataset.phonePlain;
          const raw = incomingCallModal.dataset.pendingIntentId;
          let closedId = 0;
          if (raw) {
            delete incomingCallModal.dataset.pendingIntentId;
            const id = Number.parseInt(raw, 10);
            closedId = id > 0 ? id : 0;
            if (closedId > 0) {
              clientDismissedIntentIds.add(closedId);
              intentShownOnceOnDevice.add(closedId);
              purgeIntentIdFromQueue(closedId);
              fireCallIntentAck(closedId);
              persistDismissedIntentIdLocal(closedId);
            }
            if (closedId > 0 && !closedRemotely && !skipDismissInCloseHandler) {
              try {
                await api("call_intent_dismiss", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: closedId }),
                });
              } catch (_) {
                /* offline — lokal bereits blockiert */
              }
            }
          }
          incomingCallDialogBusy = false;
          pumpIncomingCallQueue();
        })();
      });
    }
    if (incomingCallDismiss && incomingCallModal) {
      incomingCallDismiss.addEventListener("click", (e) => {
        e.preventDefault();
        if (incomingCallDismiss.disabled) {
          return;
        }
        const raw = incomingCallModal.dataset.pendingIntentId;
        const id = raw ? Number.parseInt(raw, 10) : 0;
        setIntentModalActionsEnabled(false);
        if (id > 0) {
          purgeIntentIdFromQueue(id);
          clientDismissedIntentIds.add(id);
        }
        incomingCallModal.dataset.skipDismissInCloseHandler = "1";
        if (typeof incomingCallModal.close === "function") {
          incomingCallModal.close();
        }
        if (id > 0) {
          void (async () => {
            try {
              await api("call_intent_dismiss", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
              });
            } catch (_) {
              showLeadsToast(
                "Hier geschlossen. Andere Geräte aktualisieren sich, sobald die Verbindung wieder steht.",
              );
            }
          })();
        }
      });
    }
    if (incomingCallCopy && incomingCallModal) {
      incomingCallCopy.addEventListener("click", () => {
        void (async () => {
          if (incomingCallCopy.disabled || incomingCallCopy.classList.contains("hidden")) {
            return;
          }
          const raw = incomingCallModal.dataset.pendingIntentId;
          const id = raw ? Number.parseInt(raw, 10) : 0;
          setIntentModalActionsEnabled(false);
          const plain = incomingCallModal.dataset.phonePlain || "";
          try {
            if (plain) {
              await crmCopyPlainText(plain);
              showLeadsToast("Kopiert.");
            }
          } catch (_) {
            setIntentModalActionsEnabled(true);
            alert("Kopieren fehlgeschlagen. Bitte Text manuell übernehmen oder „Schließen“ nutzen.");
            return;
          }
          if (id > 0) {
            purgeIntentIdFromQueue(id);
            clientDismissedIntentIds.add(id);
          }
          incomingCallModal.dataset.skipDismissInCloseHandler = "1";
          if (typeof incomingCallModal.close === "function") {
            incomingCallModal.close();
          }
          if (id > 0) {
            void (async () => {
              try {
                await api("call_intent_dismiss", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id }),
                });
              } catch (_) {
                showLeadsToast(
                  "Hier geschlossen. Andere Geräte aktualisieren sich, sobald die Verbindung wieder steht.",
                );
              }
            })();
          }
        })();
      });
    }
  }

  function moveColumn(colId, direction) {
    if (!isAdmin) return;
    void api("lead_variable_move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: colId, direction }),
    })
      .then(() => loadGlobalVariables())
      .then(() => {
        alignDraftRowsToVariables();
        renderSheet();
      })
      .catch((e) => alert(e instanceof Error ? e.message : "Fehler"));
  }

  function renderSheet() {
    if (!leadsSheetHead || !leadsSheetBody || !leadsSheetEmpty) return;
    const hasVars = globalVariables.length > 0;
    leadsSheetTable?.classList.toggle("hidden", !hasVars);
    if (!hasVars) {
      leadsSheetEmpty.textContent =
        "Noch keine Spalten vorhanden. Ein Admin kann unter „Spalten verwalten“ Felder anlegen.";
      leadsSheetEmpty.classList.remove("hidden");
      leadsSheetHead.innerHTML = "";
      leadsSheetBody.innerHTML = "";
      if (leadsSheetColgroup) {
        leadsSheetColgroup.replaceChildren();
      }
      if (leadsSheetTable) {
        leadsSheetTable.style.width = "";
        leadsSheetTable.style.minWidth = "";
      }
      return;
    }

    const visibleEntries = getVisibleRowEntries();
    leadsSheetEmpty.classList.toggle("hidden", visibleEntries.length > 0);
    if (!visibleEntries.length) {
      leadsSheetEmpty.textContent = "Keine Zeilen für den aktuellen Filter.";
      leadsSheetEmpty.classList.remove("hidden");
    }

    rebuildSheetColgroup();

    const trh = document.createElement("tr");
    const thNum = document.createElement("th");
    thNum.className = "leads-col-num";
    thNum.scope = "col";
    thNum.textContent = "#";
    thNum.title = "Statusfarbe";
    trh.appendChild(thNum);

    globalVariables.forEach((col) => {
      const th = document.createElement("th");
      th.className = "leads-col-field";
      th.scope = "col";
      th.dataset.colKey = col.key;
      th.title = col.label;
      const inner = document.createElement("div");
      inner.className = "leads-th-inner";
      const lab = document.createElement("span");
      lab.className = "leads-th-label";
      lab.textContent = col.label;
      inner.appendChild(lab);
      if (isAdmin) {
        const sort = document.createElement("div");
        sort.className = "leads-th-sort";
        const up = document.createElement("button");
        up.type = "button";
        up.className = "leads-th-sort-btn";
        up.textContent = "↑";
        up.title = "Spalte nach links";
        up.setAttribute("aria-label", `${col.label}: nach links`);
        up.addEventListener("click", () => moveColumn(col.id, "up"));
        const down = document.createElement("button");
        down.type = "button";
        down.className = "leads-th-sort-btn";
        down.textContent = "↓";
        down.title = "Spalte nach rechts";
        down.setAttribute("aria-label", `${col.label}: nach rechts`);
        down.addEventListener("click", () => moveColumn(col.id, "down"));
        sort.append(up, down);
        inner.appendChild(sort);
      }
      th.appendChild(inner);
      trh.appendChild(th);
    });
    const thAct = document.createElement("th");
    thAct.className = "leads-col-actions";
    thAct.scope = "col";
    thAct.setAttribute("aria-label", "Aktionen");
    trh.appendChild(thAct);
    leadsSheetHead.innerHTML = "";
    leadsSheetHead.appendChild(trh);

    leadsSheetBody.innerHTML = "";
    const phoneBroadcastKey = getPhoneBroadcastColumnKey();

    visibleEntries.forEach(({ row, index: ri }, displayIndex) => {
      const tr = document.createElement("tr");
      tr.setAttribute("data-row-index", String(ri));

      const tdNum = document.createElement("td");
      tdNum.className = "leads-col-num";
      const numInner = document.createElement("div");
      numInner.className = "leads-col-num-inner";
      const colorBtn = document.createElement("button");
      colorBtn.type = "button";
      colorBtn.className = "leads-row-color-btn";
      colorBtn.setAttribute("aria-haspopup", "menu");
      const numSpan = document.createElement("span");
      numSpan.className = "leads-row-num";
      numSpan.textContent = String(displayIndex + 1);
      numInner.append(colorBtn, numSpan);
      tdNum.appendChild(numInner);
      tr.appendChild(tdNum);

      globalVariables.forEach((col) => {
        const td = document.createElement("td");
        td.className = "leads-col-field";
        td.dataset.colKey = col.key;
        const rawVal = row[col.key] ?? "";
        const isPhone = phoneBroadcastKey && col.key === phoneBroadcastKey;
        if (isPhone) {
          td.classList.add("leads-col-phone");
          const wrap = document.createElement("div");
          wrap.className = "leads-phone-cell crm-no-autolink";
          const inp = document.createElement("input");
          inp.type = "tel";
          inp.className = "leads-phone-input crm-no-autolink";
          inp.setAttribute("data-col-key", col.key);
          inp.value = String(rawVal);
          const copyBtn = document.createElement("button");
          copyBtn.type = "button";
          copyBtn.className = "leads-phone-copy-btn";
          copyBtn.title = "Nummer kopieren";
          copyBtn.setAttribute("aria-label", "Telefonnummer kopieren");
          copyBtn.innerHTML =
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
          wrap.append(inp, copyBtn);
          td.appendChild(wrap);
        } else {
          const inp = document.createElement("input");
          inp.type = "text";
          inp.className = "lead-cell-input crm-no-autolink";
          inp.setAttribute("data-col-key", col.key);
          inp.value = String(rawVal);
          td.appendChild(inp);
        }
        tr.appendChild(td);
      });

      const tdDel = document.createElement("td");
      tdDel.className = "leads-col-actions";
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn-ghost btn-danger-text leads-row-del";
      delBtn.setAttribute("data-row-index", String(ri));
      delBtn.textContent = "×";
      tdDel.appendChild(delBtn);
      tr.appendChild(tdDel);
      applyRowColorStyle(tr, row[ROW_COLOR_KEY]);
      leadsSheetBody.appendChild(tr);
    });

    renderSheetStats();
    updateListOwnerLabel();
  }

  async function refreshListMenu() {
    if (!leadsListMenu) return;
    const data = await api("lead_lists", { method: "GET", query: listScopeApiQuery() });
    leadsListMenu.innerHTML = "";
    data.lists.forEach((item) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "leads-list-menu-btn";
      btn.textContent = item.name;
      const meta = document.createElement("span");
      meta.className = "leads-list-menu-meta";
      meta.textContent = `${item.rowCount} Zeilen`;
      if (draft.id === item.id) btn.classList.add("is-active");
      btn.addEventListener("click", () => void loadList(item.id).catch(console.error));
      if (isAdmin && item.ownerName && listScope === "all") {
        const owner = document.createElement("span");
        owner.className = "leads-list-menu-owner";
        owner.textContent = item.ownerName;
        li.append(btn, meta, owner);
      } else {
        li.append(btn, meta);
      }
      leadsListMenu.appendChild(li);
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
      listOwnerUserId: list.userId || currentUser?.id || 0,
    };
    alignDraftRowsToVariables();
    if (leadsListName) leadsListName.value = draft.name;
    if (leadsListMeta) leadsListMeta.textContent = formatMeta(list.updatedAt, draft.rows.length);
    renderSheet();
    await refreshListMenu();
  }

  function newList() {
    draft = emptyDraft();
    if (leadsListName) leadsListName.value = draft.name;
    if (leadsListMeta) leadsListMeta.textContent = "Noch nicht gespeichert";
    renderSheet();
  }

  async function saveList(opts = {}) {
    const silent = opts.silent === true;
    collectRowsFromDom();
    if (!draft.name.trim()) {
      if (!silent) {
        alert("Bitte einen Listen-Namen angeben.");
      }
      return;
    }
    if (!globalVariables.length) {
      if (!silent) {
        alert("Keine globalen Felder – Speichern nicht möglich.");
      }
      return;
    }
    try {
      const body = {
        name: draft.name.trim(),
        rows: draft.rows,
        ownerUserId: draft.listOwnerUserId || currentUser?.id || 0,
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
      if (fresh?.list && leadsListMeta) {
        leadsListMeta.textContent = formatMeta(fresh.list.updatedAt, draft.rows.length);
      }
      alignDraftRowsToVariables();
      renderSheet();
      await refreshListMenu();
      if (!silent) {
        showLeadsToast("Gespeichert.");
      }
    } catch (e) {
      if (!silent) {
        alert(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
      }
      throw e;
    }
  }

  async function deleteList() {
    if (!draft.id) {
      alert("Diese Liste ist noch nicht auf dem Server gespeichert.");
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
      if (leadsListMeta) leadsListMeta.textContent = "";
      await refreshListMenu();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Löschen fehlgeschlagen.");
    }
  }

  function escapeCsvField(s) {
    const t = String(s ?? "");
    if (/[;\n\r"]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
    return t;
  }

  function exportCsv() {
    collectRowsFromDom();
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

  function addRow() {
    collectRowsFromDom();
    draft.rows.push(emptyLine());
    renderSheet();
    scheduleLeadsAutoSave();
  }

  function removeRowAt(ri) {
    collectRowsFromDom();
    if (draft.rows.length <= 1) {
      draft.rows = [emptyLine()];
    } else {
      draft.rows.splice(ri, 1);
    }
    renderSheet();
    scheduleLeadsAutoSave();
  }

  function wireRowColorMenuDismiss() {
    document.addEventListener("click", (e) => {
      if (!rowColorMenuEl || rowColorMenuEl.classList.contains("hidden")) {
        return;
      }
      if (rowColorMenuEl.contains(e.target)) {
        return;
      }
      if (e.target.closest(".leads-row-color-btn")) {
        return;
      }
      closeRowColorMenu();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeRowColorMenu();
      }
    });
    window.addEventListener("scroll", closeRowColorMenu, true);
    window.addEventListener("resize", closeRowColorMenu);
  }

  function wireTableDelegation() {
    leadsSheetBody?.addEventListener("click", (e) => {
      const del = e.target.closest("button.leads-row-del");
      if (del && leadsSheetBody.contains(del)) {
        const ri = Number.parseInt(del.getAttribute("data-row-index") || "-1", 10);
        if (ri >= 0) removeRowAt(ri);
        return;
      }
      const colorBtn = e.target.closest("button.leads-row-color-btn");
      if (colorBtn && leadsSheetBody.contains(colorBtn)) {
        e.preventDefault();
        e.stopPropagation();
        const tr = colorBtn.closest("tr[data-row-index]");
        const ri = Number.parseInt(tr?.getAttribute("data-row-index") || "-1", 10);
        if (ri >= 0 && draft.rows[ri]) {
          if (rowColorMenuEl && !rowColorMenuEl.classList.contains("hidden") && rowColorMenuRowIndex === ri) {
            closeRowColorMenu();
          } else {
            openRowColorMenu(colorBtn, ri);
          }
        }
        return;
      }
      const copyBtn = e.target.closest("button.leads-phone-copy-btn");
      if (copyBtn && leadsSheetBody.contains(copyBtn)) {
        e.preventDefault();
        e.stopPropagation();
        const row = copyBtn.closest("tr[data-row-index]");
        const fk = getPhoneBroadcastColumnKey();
        const inp = fk && row ? row.querySelector(`input[data-col-key="${CSS.escape(fk)}"]`) : null;
        const num = (inp ? inp.value : "").trim();
        if (!num) {
          showLeadsToast("Keine Nummer zum Kopieren.");
          return;
        }
        void (async () => {
          try {
            await crmCopyPlainText(num);
            showLeadsToast("Nummer kopiert.");
          } catch (_) {
            alert("Kopieren fehlgeschlagen.");
          }
        })();
      }
    });
    leadsSheetBody?.addEventListener("input", (e) => {
      if (e.target.matches("input[data-col-key]")) {
        scheduleLeadsAutoSave();
      }
    });
    leadsSheetBody?.addEventListener("change", (e) => {
      if (e.target.matches("input[data-col-key]")) {
        scheduleLeadsAutoSave();
      }
    });
  }

  async function refreshFieldsTable() {
    if (!isAdmin || !leadsFieldsTableBody) return;
    const data = await api("lead_variables", { method: "GET" });
    const vars = data.variables || [];
    leadsFieldsTableBody.innerHTML = "";
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
          alert(e instanceof Error ? e.message : "Fehler");
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
          alert(e instanceof Error ? e.message : "Fehler");
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
          alert(e instanceof Error ? e.message : "Fehler");
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
          alert(e instanceof Error ? e.message : "Fehler");
        }
      });
      tdAct.append(btnSave, document.createTextNode(" "), btnUp, btnDown, document.createTextNode(" "), btnDel);
      tr.append(tdKey, tdLabel, tdSort, tdAct);
      leadsFieldsTableBody.appendChild(tr);
    });
  }

  async function openFieldsModal() {
    if (!isAdmin || !leadsFieldsModal) return;
    await refreshFieldsTable();
    if (typeof leadsFieldsModal.showModal === "function") leadsFieldsModal.showModal();
  }

  function wireAdminFields() {
    document.getElementById("leadsManageFields")?.addEventListener("click", () => void openFieldsModal().catch(console.error));
    leadsFieldsClose?.addEventListener("click", () => {
      if (leadsFieldsModal && typeof leadsFieldsModal.close === "function") leadsFieldsModal.close();
    });
    leadsNewFieldForm?.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const keyEl = document.getElementById("leadsNewFieldKey");
      const labelEl = document.getElementById("leadsNewFieldLabel");
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
        alert(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function wireFilters() {
    leadsListScopeFilter?.addEventListener("change", () => {
      listScope = leadsListScopeFilter.value || "mine";
      leadsListUserFilter?.classList.toggle("hidden", listScope !== "user");
      if (listScope === "user" && leadsListUserFilter && !leadsListUserFilter.value && teamUsers[0]) {
        leadsListUserFilter.value = String(teamUsers[0].id);
      }
      listScopeUserId = listScope === "user" ? Number(leadsListUserFilter?.value || 0) : 0;
      void refreshListMenu().catch(console.error);
    });
    leadsListUserFilter?.addEventListener("change", () => {
      listScopeUserId = Number(leadsListUserFilter.value || 0);
      void refreshListMenu().catch(console.error);
    });
    leadsSearchInput?.addEventListener("input", () => renderSheet());
  }

  function wireToolbar() {
    wireFilters();
    document.getElementById("leadsNewList")?.addEventListener("click", () => {
      newList();
      void refreshListMenu().catch(console.error);
    });
    document.getElementById("leadsAddRow")?.addEventListener("click", () => addRow());
    document.getElementById("leadsOpenImport")?.addEventListener("click", () => openImportModal());
    document.getElementById("leadsExportCsv")?.addEventListener("click", () => exportCsv());
    document.getElementById("leadsDeleteList")?.addEventListener("click", () => void deleteList().catch(console.error));

    leadsListName?.addEventListener("input", () => {
      draft.name = leadsListName.value;
      scheduleLeadsAutoSave();
    });

    leadsImportFile?.addEventListener("change", (ev) => {
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
          if (leadsImportMappingWrap) {
            leadsImportMappingWrap.classList.remove("hidden");
            buildMappingSelects(importMatrix[0]);
          }
        } catch (e) {
          alert(e instanceof Error ? e.message : "CSV-Fehler");
          importMatrix = null;
        }
      };
      reader.readAsText(file, "UTF-8");
    });

    leadsImportCancel?.addEventListener("click", () => closeImportModal());
    leadsImportApply?.addEventListener("click", () => void applyCsvImport().catch(console.error));
  }

  async function boot() {
    const meUrl = `${apiPhpHref}?action=me`;
    const res = await fetch(meUrl, { credentials: "same-origin" });
    let data;
    try {
      data = await res.json();
    } catch {
      window.location.assign(new URL("index.php", window.location.href).href);
      return;
    }
    if (!data.ok) {
      window.location.assign(new URL("index.php", window.location.href).href);
      return;
    }
    csrfToken = data.csrfToken || "";
    currentUser = data.user || null;
    isAdmin = currentUser?.role === "admin";
    const manageBtn = document.getElementById("leadsManageFields");
    if (manageBtn) {
      manageBtn.classList.toggle("hidden", !isAdmin);
    }
    const chip = document.getElementById("leadsUserChip");
    if (chip && currentUser) {
      const roleLabel =
        currentUser.role === "admin" ? "Admin" : currentUser.role === "fulfilment" ? "Fulfilment" : "Nutzer";
      chip.textContent = `${currentUser.displayName} · ${roleLabel}`;
    }
    const logoutCsrf = document.getElementById("logoutCsrf");
    if (logoutCsrf) logoutCsrf.value = csrfToken;

    wireTableDelegation();
    wireRowColorMenuDismiss();
    wireToolbar();
    wireAdminFields();
    startCallIntentPoller();

    await loadGlobalVariables();
    await loadTeamUsers();
    const listsData = await api("lead_lists", { method: "GET", query: listScopeApiQuery() });
    const lists = listsData.lists || [];
    if (lists.length) {
      await loadList(lists[0].id);
    } else {
      newList();
      await refreshListMenu();
    }
  }

  void boot().catch((err) => {
    console.error(err);
    alert(err instanceof Error ? err.message : "Start fehlgeschlagen.");
  });
})();
