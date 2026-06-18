(() => {
  const STORAGE_KEY = "adlions_crm_v1";
  const MAX_ACTIVITY_ENTRIES = 220;

  const bootstrap = window.__CRM_BOOTSTRAP__ || {};
  const csrfToken = bootstrap.csrfToken || "";
  let currentUser = bootstrap.user || null;
  const crmBasePath = String(bootstrap.basePath ?? "").replace(/\/$/, "");
  const apiPhpUrl = crmBasePath === "" ? "/api.php" : `${crmBasePath}/api.php`;

  const boardEl = document.getElementById("pipelineBoard");
  const activityFeed = document.getElementById("activityFeed");
  const dealTemplate = document.getElementById("dealCardTemplate");

  const searchInput = document.getElementById("searchInput");
  const phaseFilter = document.getElementById("phaseFilter");
  const ownerFilter = document.getElementById("ownerFilter");
  const priorityFilter = document.getElementById("priorityFilter");
  const dealModal = document.getElementById("dealModal");
  const contactModal = document.getElementById("contactModal");
  const customerModal = document.getElementById("customerModal");
  const projectModal = document.getElementById("projectModal");
  const phaseModal = document.getElementById("phaseModal");
  const usersModal = document.getElementById("usersModal");
  const dealForm = document.getElementById("dealForm");
  const contactForm = document.getElementById("contactForm");
  const customerForm = document.getElementById("customerForm");
  const projectForm = document.getElementById("projectForm");
  const phaseForm = document.getElementById("phaseForm");
  const userAdminForm = document.getElementById("userAdminForm");

  const dealPhaseSelect = document.getElementById("dealPhaseSelect");
  const dealContactSelect = document.getElementById("dealContactSelect");
  const projectCustomerSelect = document.getElementById("projectCustomerSelect");
  const customersTableBody = document.getElementById("customersTableBody");
  const customersStats = document.getElementById("customersStats");
  const customersEmptyHint = document.getElementById("customersEmptyHint");
  const customerSearchInput = document.getElementById("customerSearchInput");
  const projectsTableBody = document.getElementById("projectsTableBody");
  const projectsStats = document.getElementById("projectsStats");
  const activeProjectsGrid = document.getElementById("activeProjectsGrid");
  const activeProjectsEmpty = document.getElementById("activeProjectsEmpty");
  const projectsEmptyHint = document.getElementById("projectsEmptyHint");
  const projectSearchInput = document.getElementById("projectSearchInput");
  const projectStatusFilter = document.getElementById("projectStatusFilter");
  const customerModalTitle = document.getElementById("customerModalTitle");
  const customerProjectsPanel = document.getElementById("customerProjectsPanel");
  const customerWorkflowPanel = document.getElementById("customerWorkflowPanel");
  const customerWorkflowList = document.getElementById("customerWorkflowList");
  const customerWorkflowProgressText = document.getElementById("customerWorkflowProgressText");
  const customerWorkflowProgressBar = document.getElementById("customerWorkflowProgressBar");
  const customerLinkedProjectsList = document.getElementById("customerLinkedProjectsList");
  const customerProjectsEmpty = document.getElementById("customerProjectsEmpty");
  const linkProjectToCustomerSelect = document.getElementById("linkProjectToCustomerSelect");
  const linkProjectToCustomerBtn = document.getElementById("linkProjectToCustomerBtn");
  const addProjectForCustomerBtn = document.getElementById("addProjectForCustomerBtn");
  const projectModalTitle = document.getElementById("projectModalTitle");

  const dealModalTitle = document.getElementById("dealModalTitle");
  const contactModalTitle = document.getElementById("contactModalTitle");
  const phaseModalTitle = document.getElementById("phaseModalTitle");

  const dealCommentsPanel = document.getElementById("dealCommentsPanel");
  const dealCommentsList = document.getElementById("dealCommentsList");
  const dealNewComment = document.getElementById("dealNewComment");
  const dealAddCommentBtn = document.getElementById("dealAddCommentBtn");

  const usersTableBody = document.getElementById("usersTableBody");
  const userFormTitle = document.getElementById("userFormTitle");
  const userEditId = document.getElementById("userEditId");
  const userFormEmail = document.getElementById("userFormEmail");
  const userFormName = document.getElementById("userFormName");
  const userFormRole = document.getElementById("userFormRole");
  const userFormActive = document.getElementById("userFormActive");
  const userFormPassword = document.getElementById("userFormPassword");
  const userPasswordHint = document.getElementById("userPasswordHint");
  const userFormSubmit = document.getElementById("userFormSubmit");

  const statDealsOpen = document.getElementById("statDealsOpen");
  const statPipelineValue = document.getElementById("statPipelineValue");
  const statForecastValue = document.getElementById("statForecastValue");
  const statWinRate = document.getElementById("statWinRate");

  const uiState = {
    editingDealId: null,
    editingContactId: null,
    editingCustomerId: null,
    editingProjectId: null,
    editingPhaseId: null,
  };

  const CUSTOMER_WORKFLOW_TEMPLATE = [
    { key: "cc", label: "CC", duration: "5min" },
    { key: "qc", label: "QC", duration: "15min" },
    { key: "sc", label: "SC", duration: "60min" },
    { key: "onboarding", label: "Onboarding", duration: "30min" },
    { key: "drehtag", label: "Drehtag", duration: "5h" },
    { key: "weekly_calls_1", label: "Weekly Calls", duration: "15min" },
    { key: "upsell", label: "Upsell", duration: "30min" },
    { key: "weekly_calls_2", label: "Weekly Calls", duration: "15min" },
  ];

  const baseState = {
    phases: [
      { id: uid(), name: "Lead", probability: 15 },
      { id: uid(), name: "Qualifiziert", probability: 35 },
      { id: uid(), name: "Gewonnen", probability: 100 },
      { id: uid(), name: "Verloren", probability: 0 },
      { id: uid(), name: "Follow up", probability: 0 },
    ],
    contacts: [],
    customers: [],
    projects: [],
    deals: [],
    activities: [],
  };

  let state = structuredClone(baseState);

  async function apiFetch(action, options = {}) {
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
    init.headers = { ...(init.headers || {}), "X-CSRF-Token": csrfToken };
    const res = await fetch(url, init);
    let data;
    try {
      data = await res.json();
    } catch (error) {
      throw new Error("Ungültige Serverantwort.");
    }
    if (!data.ok) {
      throw new Error(data.error || "API-Fehler");
    }
    return data;
  }

  function phaseNameKey(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function isFollowUpPhaseName(name) {
    const key = phaseNameKey(name);
    return key === "follow up" || key === "follow-up";
  }

  function isVerlorenPhaseName(name) {
    return phaseNameKey(name) === "verloren";
  }

  const PIPELINE_PHASE_ORDER = ["lead", "qualifiziert", "gewonnen", "verloren", "follow up"];

  function pipelinePhaseSortKey(name) {
    const key = phaseNameKey(name);
    if (key === "follow-up") {
      return "follow up";
    }
    return key;
  }

  function ensureVerlorenPhase(phases) {
    const list = [...phases];
    if (list.some((phase) => isVerlorenPhaseName(phase.name))) {
      return list;
    }
    const verlorenPhase = { id: uid(), name: "Verloren", probability: 0 };
    const followUpIndex = list.findIndex((phase) => isFollowUpPhaseName(phase.name));
    if (followUpIndex >= 0) {
      list.splice(followUpIndex, 0, verlorenPhase);
      return list;
    }
    const gewonnenIndex = list.findIndex((phase) => phaseNameKey(phase.name) === "gewonnen");
    if (gewonnenIndex >= 0) {
      list.splice(gewonnenIndex + 1, 0, verlorenPhase);
      return list;
    }
    list.push(verlorenPhase);
    return list;
  }

  function ensureFollowUpPhase(phases) {
    const list = [...phases];
    if (list.some((phase) => isFollowUpPhaseName(phase.name))) {
      return list;
    }
    const followUpPhase = { id: uid(), name: "Follow up", probability: 0 };
    const verlorenIndex = list.findIndex((phase) => isVerlorenPhaseName(phase.name));
    if (verlorenIndex >= 0) {
      list.splice(verlorenIndex + 1, 0, followUpPhase);
      return list;
    }
    list.push(followUpPhase);
    return list;
  }

  function sortPipelinePhases(phases) {
    const known = [];
    const unknown = [];
    for (const phase of phases) {
      const key = pipelinePhaseSortKey(phase.name);
      const idx = PIPELINE_PHASE_ORDER.indexOf(key);
      if (idx >= 0) {
        known.push({ phase, idx });
      } else {
        unknown.push(phase);
      }
    }
    known.sort((a, b) => a.idx - b.idx);
    return [...known.map((item) => item.phase), ...unknown];
  }

  function migratePipelinePhases(phases, deals) {
    const removedNames = new Set(["angebot", "verhandlung"]);
    let nextPhases = Array.isArray(phases) ? [...phases] : [];

    const removedPhaseIds = new Set();
    nextPhases = nextPhases.filter((phase) => {
      if (removedNames.has(phaseNameKey(phase.name))) {
        removedPhaseIds.add(phase.id);
        return false;
      }
      return true;
    });

    if (!nextPhases.length) {
      nextPhases = structuredClone(baseState).phases;
    } else {
      nextPhases = ensureVerlorenPhase(nextPhases);
      nextPhases = ensureFollowUpPhase(nextPhases);
      nextPhases = sortPipelinePhases(nextPhases);
    }

    const fallbackPhase =
      nextPhases.find((phase) => phaseNameKey(phase.name) === "qualifiziert") || nextPhases[0];
    const fallbackPhaseId = fallbackPhase?.id || "";

    const phaseIds = new Set(nextPhases.map((phase) => phase.id));
    const nextDeals = (Array.isArray(deals) ? deals : []).map((deal) => {
      let phaseId = deal.phaseId;
      if (removedPhaseIds.has(phaseId) || !phaseIds.has(phaseId)) {
        phaseId = fallbackPhaseId;
      }
      return phaseId === deal.phaseId ? deal : { ...deal, phaseId };
    });

    return { phases: nextPhases, deals: nextDeals };
  }

  function normalizeState(raw) {
    if (!raw || typeof raw !== "object") {
      return structuredClone(baseState);
    }
    const defaultPhases = structuredClone(baseState).phases;
    const rawPhases = Array.isArray(raw.phases) && raw.phases.length ? raw.phases : defaultPhases;
    const rawDeals = Array.isArray(raw.deals)
      ? raw.deals.map((deal) => ({
          ...deal,
          comments: Array.isArray(deal.comments) ? deal.comments : [],
        }))
      : [];
    const normalizedCustomers = (Array.isArray(raw.customers) ? raw.customers : []).map((customer) =>
      normalizeCustomerRecord(customer)
    );
    const migrated = migratePipelinePhases(rawPhases, rawDeals);
    return {
      phases: migrated.phases,
      contacts: Array.isArray(raw.contacts) ? raw.contacts : [],
      customers: normalizedCustomers,
      projects: Array.isArray(raw.projects)
        ? raw.projects.map((project) => ({
            ...project,
            workItems: Array.isArray(project.workItems) ? project.workItems : [],
          }))
        : [],
      deals: migrated.deals,
      activities: Array.isArray(raw.activities) ? raw.activities : [],
    };
  }

  function buildDefaultCustomerWorkflow() {
    return CUSTOMER_WORKFLOW_TEMPLATE.map((step) => ({
      key: step.key,
      label: step.label,
      duration: step.duration,
      done: false,
      doneAt: null,
    }));
  }

  function normalizeCustomerWorkflow(items) {
    const incomingByKey = new Map(
      (Array.isArray(items) ? items : [])
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => [String(entry.key || ""), entry])
    );
    return CUSTOMER_WORKFLOW_TEMPLATE.map((step) => {
      const existing = incomingByKey.get(step.key);
      return {
        key: step.key,
        label: step.label,
        duration: step.duration,
        done: Boolean(existing?.done),
        doneAt: existing?.doneAt || null,
      };
    });
  }

  function normalizeCustomerRecord(customer) {
    const normalized = customer && typeof customer === "object" ? { ...customer } : {};
    normalized.status = normalized.status === "inaktiv" ? "inaktiv" : "aktiv";
    const runtime = Number.parseInt(String(normalized.runtimeMonths ?? "12"), 10);
    normalized.runtimeMonths = Number.isFinite(runtime) && runtime > 0 ? Math.min(runtime, 60) : 12;
    normalized.workflow = normalizeCustomerWorkflow(normalized.workflow);
    return normalized;
  }

  async function hydrateFromServer() {
    try {
      const data = await apiFetch("state", { method: "GET" });
      if (data.state && typeof data.state === "object") {
        state = normalizeState(data.state);
      }
    } catch (error) {
      console.error(error);
      try {
        const fallback = localStorage.getItem(STORAGE_KEY);
        if (fallback) {
          state = normalizeState(JSON.parse(fallback));
        }
      } catch (e) {
        console.error(e);
      }
      alert("Server nicht erreichbar – es wird ein lokaler Zwischenspeicher genutzt, falls vorhanden.");
    }
  }

  async function pushStateToServer() {
    await apiFetch("state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }),
    });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn(error);
    }
  }

  function actorLabel() {
    return currentUser?.displayName || "Unbekannt";
  }

  function stampContact(contact, isNew) {
    const now = new Date().toISOString();
    contact.updatedAt = now;
    contact.updatedById = currentUser?.id ?? null;
    contact.updatedByName = actorLabel();
    if (isNew) {
      contact.createdAt = contact.createdAt || now;
      contact.createdById = currentUser?.id ?? null;
      contact.createdByName = actorLabel();
    }
  }

  function stampCustomer(customer, isNew) {
    const now = new Date().toISOString();
    customer.updatedAt = now;
    customer.updatedById = currentUser?.id ?? null;
    customer.updatedByName = actorLabel();
    if (isNew) {
      customer.createdAt = customer.createdAt || now;
      customer.createdById = currentUser?.id ?? null;
      customer.createdByName = actorLabel();
    }
  }

  function stampProject(project, isNew) {
    const now = new Date().toISOString();
    project.updatedAt = now;
    project.updatedById = currentUser?.id ?? null;
    project.updatedByName = actorLabel();
    if (isNew) {
      project.createdAt = project.createdAt || now;
      project.createdById = currentUser?.id ?? null;
      project.createdByName = actorLabel();
    }
  }

  function stampDeal(deal, isNew) {
    const now = new Date().toISOString();
    deal.updatedAt = now;
    deal.updatedById = currentUser?.id ?? null;
    deal.updatedByName = actorLabel();
    if (isNew) {
      deal.createdAt = deal.createdAt || now;
      deal.createdById = currentUser?.id ?? null;
      deal.createdByName = actorLabel();
    }
  }

  function logActivity(type, message) {
    state.activities.unshift({
      id: uid(),
      type,
      message,
      timestamp: new Date().toISOString(),
      userId: currentUser?.id ?? null,
      userName: actorLabel(),
      userEmail: currentUser?.email ?? null,
    });
    state.activities = state.activities.slice(0, MAX_ACTIVITY_ENTRIES);
  }

  async function persistAndRerender() {
    try {
      await pushStateToServer();
    } catch (error) {
      alert(`Speichern fehlgeschlagen: ${error.message}`);
      return;
    }
    renderApp();
  }

  const incomingCallModal = document.getElementById("incomingCallModal");
  const incomingCallNumber = document.getElementById("incomingCallNumber");
  const incomingCallCopy = document.getElementById("incomingCallCopy");
  const incomingCallDial = document.getElementById("incomingCallDial");
  const incomingCallDismiss = document.getElementById("incomingCallDismiss");

  /** Server-Markierung: nur Text (Firmenname), kein Telefon-Intent */
  const CRM_INTENT_TEXT_ONLY_URI = "tel:00000000000";

  const incomingCallQueue = [];
  let incomingCallDialogBusy = false;
  let lastCallIntentPollSince = "";
  const CALL_INTENT_POLL_MS = 800;
  /** Sofort nach erfolgreichem dismiss: blockiert Race mit noch laufendem Poll. */
  const clientDismissedIntentIds = new Set();
  /** Modal + OS-Benachrichtigung je Intent-ID nur einmal pro Tab/Sitzung. */
  const intentShownOnceOnDevice = new Set();

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

  /** Nummer optisch gleich, technisch ohne durchgehende Ziffernfolge (weniger Auto-Linking). */
  function crmPhoneDisplayForUi(raw) {
    const s = String(raw || "");
    if (!s) return "";
    return s.split("").join("\u200b\u2060");
  }

  function showCrmGlobalToast(msg) {
    const el = document.getElementById("crmAppToast");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(showCrmGlobalToast._t);
    showCrmGlobalToast._t = window.setTimeout(() => {
      el.classList.add("hidden");
    }, 3200);
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

  /** Echte tel:-Intents: auf Touch/kleinem Viewport nur „Anrufen“, sonst Kopieren + Anrufen. */
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

  /** Pro Browser-Sitzung: Intent aus der Poll-Liste nehmen (ohne globales Beenden). */
  function fireCallIntentAck(intentId) {
    if (!Number.isFinite(intentId) || intentId <= 0) {
      return;
    }
    void apiFetch("call_intent_ack", {
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
    if (!currentUser) {
      return;
    }
    try {
      const pollOpts = { method: "GET" };
      if (lastCallIntentPollSince) {
        pollOpts.query = { since: lastCallIntentPollSince };
      }
      const data = await apiFetch("call_intent_poll", pollOpts);
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
      /* offline / nicht angemeldet */
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
    /* Festes Intervall auch bei inaktivem Tab, damit andere Geräte die Nummer zeitnah bekommen. */
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
                await apiFetch("call_intent_dismiss", {
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
              await apiFetch("call_intent_dismiss", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
              });
            } catch (_) {
              showCrmGlobalToast(
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
              showCrmGlobalToast("Kopiert.");
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
                await apiFetch("call_intent_dismiss", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id }),
                });
              } catch (_) {
                showCrmGlobalToast(
                  "Hier geschlossen. Andere Geräte aktualisieren sich, sobald die Verbindung wieder steht.",
                );
              }
            })();
          }
        })();
      });
    }
  }

  async function boot() {
    await hydrateFromServer();
    if (!state.deals.length && !state.contacts.length) {
      seedDemoData();
      try {
        await pushStateToServer();
      } catch (error) {
        console.error(error);
      }
    }
    bindEvents();
    renderApp();
    startCallIntentPoller();
  }

  boot().catch(console.error);

  function bindEvents() {
    document.body.addEventListener(
      "click",
      () => {
        if (!("Notification" in window) || Notification.permission !== "default") {
          return;
        }
        void Notification.requestPermission();
      },
      { once: true, capture: true },
    );

    const pipelineTopbarDetails = document.getElementById("pipelineTopbarDetails");
    if (pipelineTopbarDetails) {
      pipelineTopbarDetails.open = false;
    }

    document.getElementById("openDealModal").addEventListener("click", () => openDealModal());
    const openContactBtn = document.getElementById("openContactModal");
    if (openContactBtn) {
      openContactBtn.addEventListener("click", () => openContactModal());
    }
    document.getElementById("openPhaseModal").addEventListener("click", () => openPhaseModal());
    const openCustomerBtn = document.getElementById("openCustomerModal");
    if (openCustomerBtn) openCustomerBtn.addEventListener("click", () => openCustomerModal());
    const openProjectBtn = document.getElementById("openProjectModal");
    if (openProjectBtn) openProjectBtn.addEventListener("click", () => openProjectModal());
    document.getElementById("resetFilters").addEventListener("click", resetFilters);
    document.getElementById("exportJson").addEventListener("click", exportJson);
    document.getElementById("importJson").addEventListener("change", importJson);

    const openUsersBtn = document.getElementById("openUsersModal");
    if (openUsersBtn) {
      openUsersBtn.addEventListener("click", () => openUsersModal());
    }
    const closeUsersBtn = document.getElementById("closeUsersModal");
    if (closeUsersBtn) {
      closeUsersBtn.addEventListener("click", () => {
        if (usersModal && typeof usersModal.close === "function") usersModal.close();
        resetUserAdminForm();
      });
    }
    const userFormReset = document.getElementById("userFormReset");
    if (userFormReset) {
      userFormReset.addEventListener("click", () => resetUserAdminForm());
    }
    if (userAdminForm) {
      userAdminForm.addEventListener("submit", handleUserAdminSubmit);
    }

    searchInput.addEventListener("input", renderBoard);
    phaseFilter.addEventListener("change", renderBoard);
    ownerFilter.addEventListener("change", renderBoard);
    if (priorityFilter) {
      priorityFilter.addEventListener("change", renderBoard);
    }
    dealForm.addEventListener("submit", handleDealSubmit);
    contactForm.addEventListener("submit", handleContactSubmit);
    if (customerForm) customerForm.addEventListener("submit", handleCustomerSubmit);
    if (projectForm) projectForm.addEventListener("submit", handleProjectSubmit);
    phaseForm.addEventListener("submit", handlePhaseSubmit);
    if (customerSearchInput) customerSearchInput.addEventListener("input", renderCustomers);
    if (projectSearchInput) projectSearchInput.addEventListener("input", renderProjects);
    if (projectStatusFilter) projectStatusFilter.addEventListener("change", renderProjects);
    if (linkProjectToCustomerBtn) {
      linkProjectToCustomerBtn.addEventListener("click", () => linkSelectedProjectToCurrentCustomer());
    }
    if (addProjectForCustomerBtn) {
      addProjectForCustomerBtn.addEventListener("click", () => {
        const customerId = uiState.editingCustomerId;
        if (!customerId) {
          alert("Bitte Kunden zuerst speichern, dann ein Projekt anlegen.");
          return;
        }
        if (customerModal && typeof customerModal.close === "function") customerModal.close();
        openProjectModal(null, customerId);
      });
    }
    if (customerWorkflowList) {
      customerWorkflowList.addEventListener("change", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (!target.matches('input[type="checkbox"][data-workflow-key]')) return;
        const stepKey = String(target.dataset.workflowKey || "");
        if (!stepKey) return;
        void toggleCustomerWorkflowStep(stepKey, target.checked);
      });
    }
    if (dealAddCommentBtn) {
      dealAddCommentBtn.addEventListener("click", () => addDealCommentFromForm());
    }

    initTracking();
    bindMainNav();
  }

  const VIEW_TITLES = {
    pipeline: "Deals",
    customers: "Kunden",
    projects: "Projekte",
    activity: "Aktivitäten",
    tracking: "Tracking",
  };

  const trackingDateInput = document.getElementById("trackingDate");
  const trackingTableBody = document.getElementById("trackingTableBody");
  const trackingDateLabel = document.getElementById("trackingDateLabel");
  const trackingSaveHint = document.getElementById("trackingSaveHint");
  const trackingEmptyHint = document.getElementById("trackingEmptyHint");
  const trackingTotalCalls = document.getElementById("trackingTotalCalls");
  const trackingTotalResults = document.getElementById("trackingTotalResults");
  const trackingTotalSalesCalls = document.getElementById("trackingTotalSalesCalls");
  const trackingTotalClosures = document.getElementById("trackingTotalClosures");
  const trackingReadOnlyHint = document.getElementById("trackingReadOnlyHint");
  const trackingPieCanvas = document.getElementById("trackingPieChart");
  const trackingClosuresCanvas = document.getElementById("trackingClosuresChart");
  const trackingPieEmpty = document.getElementById("trackingPieEmpty");
  const trackingClosuresEmpty = document.getElementById("trackingClosuresEmpty");
  const trackingPieSubtitle = document.getElementById("trackingPieSubtitle");
  const trackingClosuresRangeLabel = document.getElementById("trackingClosuresRangeLabel");
  const trackingEditBanner = document.getElementById("trackingEditBanner");
  const trackingSaveAllBtn = document.getElementById("trackingSaveAll");
  const trackingToolbarHint = document.getElementById("trackingToolbarHint");
  const trackingOpenEntryBtn = document.getElementById("trackingOpenEntry");
  const trackingEntryModal = document.getElementById("trackingEntryModal");
  const trackingEntryModalBody = document.getElementById("trackingEntryModalBody");
  const trackingEntryModalDate = document.getElementById("trackingEntryModalDate");
  const trackingEntryModalEmpty = document.getElementById("trackingEntryModalEmpty");
  const trackingEntryForm = document.getElementById("trackingEntryForm");
  const trackingEntryClose = document.getElementById("trackingEntryClose");
  const trackingEntryModalSaveHint = document.getElementById("trackingEntryModalSaveHint");

  const TRACKING_SERIES_DAYS = 30;
  const TRACKING_CHART_COLORS = [
    "#0091ae",
    "#3bcc9d",
    "#5c6bc0",
    "#ff7043",
    "#ab47bc",
    "#26a69a",
    "#ffa726",
    "#78909c",
  ];

  let trackingPieChart = null;
  let trackingClosuresChart = null;
  let trackingPieRefreshTimer = null;
  let trackingModalSaveTimer = null;

  function trackingTodayIso() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  let trackingDate = trackingTodayIso();
  let trackingCanEdit = isCrmAdmin();
  let trackingLoadSeq = 0;
  let currentMainView = "pipeline";
  const trackingSaveTimers = new Map();

  function trackingIsoFromDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function trackingChartRange(endIso) {
    const end = new Date(`${endIso}T12:00:00`);
    const start = new Date(end);
    start.setDate(start.getDate() - (TRACKING_SERIES_DAYS - 1));
    return { from: trackingIsoFromDate(start), to: trackingIsoFromDate(end) };
  }

  function formatTrackingShortDate(iso) {
    try {
      const d = new Date(`${iso}T12:00:00`);
      return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(d);
    } catch {
      return iso;
    }
  }

  function destroyTrackingChart(chart) {
    if (chart) {
      chart.destroy();
    }
    return null;
  }

  function readTrackingRowsFromDom() {
    const rows = [];
    trackingTableBody?.querySelectorAll("tr[data-user-id]").forEach((tr) => {
      const metrics = readTrackingRowMetrics(tr);
      rows.push({
        userId: Number.parseInt(tr.getAttribute("data-user-id") || "0", 10),
        displayName: tr.querySelector(".tracking-user-cell")?.textContent?.trim() || "Nutzer",
        ...metrics,
      });
    });
    return rows;
  }

  function updateTrackingTotalsFromDom() {
    const rows = readTrackingRowsFromDom();
    const totals = rows.reduce(
      (acc, row) => {
        acc.calls += row.calls;
        acc.results += row.results;
        acc.salesCalls += row.salesCalls;
        acc.closures += row.closures;
        return acc;
      },
      { calls: 0, results: 0, salesCalls: 0, closures: 0 }
    );
    updateTrackingTotals(totals);
  }

  function scheduleTrackingPieRefresh() {
    if (trackingPieRefreshTimer) {
      clearTimeout(trackingPieRefreshTimer);
    }
    trackingPieRefreshTimer = window.setTimeout(() => {
      trackingPieRefreshTimer = null;
      renderTrackingPieChart(readTrackingRowsFromDom());
      updateTrackingTotalsFromDom();
    }, 220);
  }

  function renderTrackingPieChart(rows) {
    if (!trackingPieCanvas || typeof Chart === "undefined") {
      return;
    }
    const slices = (rows || [])
      .map((row) => ({
        label: row.displayName,
        value: Math.max(0, Number(row.results) || 0),
      }))
      .filter((slice) => slice.value > 0);
    const total = slices.reduce((sum, slice) => sum + slice.value, 0);
    if (trackingPieSubtitle) {
      trackingPieSubtitle.textContent = `Verteilung nach Nutzer · ${formatTrackingDateLabel(trackingDate)}`;
    }
    trackingPieEmpty?.classList.toggle("hidden", total > 0);
    trackingPieCanvas.classList.toggle("hidden", total === 0);
    trackingPieChart = destroyTrackingChart(trackingPieChart);
    if (total === 0) {
      return;
    }
    trackingPieChart = new Chart(trackingPieCanvas, {
      type: "pie",
      data: {
        labels: slices.map((slice) => slice.label),
        datasets: [
          {
            data: slices.map((slice) => slice.value),
            backgroundColor: slices.map((_, index) => TRACKING_CHART_COLORS[index % TRACKING_CHART_COLORS.length]),
            borderWidth: 2,
            borderColor: "#ffffff",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const value = Number(ctx.parsed) || 0;
                const pct = total ? Math.round((value / total) * 100) : 0;
                return ` ${ctx.label}: ${value} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }

  async function renderTrackingClosuresChart(loadId) {
    if (!trackingClosuresCanvas || typeof Chart === "undefined") {
      return;
    }
    if (loadId != null && loadId !== trackingLoadSeq) {
      return;
    }
    const range = trackingChartRange(trackingDate);
    if (trackingClosuresRangeLabel) {
      trackingClosuresRangeLabel.textContent = `${formatTrackingShortDate(range.from)} – ${formatTrackingShortDate(range.to)}`;
    }
    try {
      const data = await apiFetch("tracking_series", {
        method: "GET",
        query: { from: range.from, to: range.to },
      });
      if (loadId != null && loadId !== trackingLoadSeq) {
        return;
      }
      const days = Array.isArray(data.days) ? data.days : [];
      const labels = days.map((day) => formatTrackingShortDate(day.date));
      const values = days.map((day) => Math.max(0, Number(day.results) || 0));
      const hasAny = values.some((v) => v > 0);
      trackingClosuresEmpty?.classList.toggle("hidden", hasAny);
      trackingClosuresCanvas.classList.toggle("hidden", !hasAny);
      trackingClosuresChart = destroyTrackingChart(trackingClosuresChart);
      if (!hasAny) {
        return;
      }
      trackingClosuresChart = new Chart(trackingClosuresCanvas, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Gelegte Termine",
              data: values,
              borderColor: "#0091ae",
              backgroundColor: "rgba(0, 145, 174, 0.12)",
              fill: true,
              tension: 0.3,
              pointRadius: 3,
              pointHoverRadius: 5,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              ticks: { precision: 0 },
            },
          },
          plugins: {
            legend: { display: false },
          },
        },
      });
    } catch (err) {
      trackingClosuresChart = destroyTrackingChart(trackingClosuresChart);
      trackingClosuresEmpty?.classList.remove("hidden");
      if (trackingClosuresEmpty) {
        trackingClosuresEmpty.textContent =
          err instanceof Error ? err.message : "Verlauf konnte nicht geladen werden.";
      }
      trackingClosuresCanvas?.classList.add("hidden");
    }
  }

  async function refreshTrackingCharts(rows, loadId) {
    if (loadId != null && loadId !== trackingLoadSeq) {
      return;
    }
    renderTrackingPieChart(rows);
    await renderTrackingClosuresChart(loadId);
  }

  function openTrackingDatePicker() {
    if (!trackingDateInput) return;
    if (typeof trackingDateInput.showPicker === "function") {
      try {
        trackingDateInput.showPicker();
        return;
      } catch (_) {
        /* showPicker kann ohne User-Geste fehlschlagen */
      }
    }
    trackingDateInput.focus();
    trackingDateInput.click();
  }

  function formatTrackingDateLabel(iso) {
    try {
      const d = new Date(`${iso}T12:00:00`);
      return new Intl.DateTimeFormat("de-DE", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(d);
    } catch {
      return iso;
    }
  }

  function setTrackingSaveHint(text, isError) {
    if (!trackingSaveHint) return;
    trackingSaveHint.textContent = text || "";
    trackingSaveHint.classList.toggle("hidden", !text);
    trackingSaveHint.classList.toggle("tracking-save-hint--error", Boolean(isError));
  }

  function updateTrackingTotals(totals) {
    if (trackingTotalCalls) trackingTotalCalls.textContent = String(totals?.calls ?? 0);
    if (trackingTotalResults) trackingTotalResults.textContent = String(totals?.results ?? 0);
    if (trackingTotalSalesCalls) trackingTotalSalesCalls.textContent = String(totals?.salesCalls ?? 0);
    if (trackingTotalClosures) trackingTotalClosures.textContent = String(totals?.closures ?? 0);
  }

  function isCrmAdmin() {
    return (currentUser?.role || "") === "admin";
  }

  function canAccessFulfilmentViews() {
    const role = (currentUser?.role || "").toLowerCase();
    return role === "admin" || role === "fulfilment";
  }

  function getMainViews() {
    const all = ["pipeline", "customers", "projects", "activity", "tracking"];
    if (canAccessFulfilmentViews()) {
      return all;
    }
    return all.filter((view) => view !== "customers" && view !== "projects");
  }

  function userRoleLabel(role) {
    if (role === "admin") return "Admin";
    if (role === "fulfilment") return "Fulfilment";
    return "Nutzer";
  }

  function trackingRoleLabel(role) {
    return userRoleLabel(role || "user");
  }

  function updateTrackingDateSummary(dateIso, userCount) {
    if (!trackingDateLabel) return;
    if (userCount == null) {
      trackingDateLabel.textContent = `${formatTrackingDateLabel(dateIso)} · Tabelle wird geladen …`;
      return;
    }
    const count = Number.isFinite(userCount) ? userCount : 0;
    const countLabel = count === 1 ? "1 Nutzer" : `${count} Nutzer`;
    trackingDateLabel.textContent = `${formatTrackingDateLabel(dateIso)} · ${countLabel} in der Tabelle`;
  }

  function canEditTrackingRow() {
    return Boolean(trackingCanEdit);
  }

  function updateTrackingEditUi() {
    trackingReadOnlyHint?.classList.toggle("hidden", trackingCanEdit);
    trackingEditBanner?.classList.toggle("hidden", !trackingCanEdit);
    trackingOpenEntryBtn?.classList.toggle("hidden", !trackingCanEdit);
  }

  function setTrackingEntryModalHint(text, isError) {
    if (!trackingEntryModalSaveHint) return;
    trackingEntryModalSaveHint.textContent = text || "";
    trackingEntryModalSaveHint.classList.toggle("hidden", !text);
    trackingEntryModalSaveHint.classList.toggle("tracking-save-hint--error", Boolean(isError));
  }

  function renderTrackingEntryModalRow(row) {
    const tr = document.createElement("tr");
    tr.dataset.userId = String(row.userId);
    const tdName = document.createElement("td");
    tdName.textContent = row.displayName;
    tr.appendChild(tdName);
    const fields = [
      { key: "calls", label: "Anrufe" },
      { key: "results", label: "Termine" },
      { key: "salesCalls", label: "Sales Calls" },
      { key: "closures", label: "Abschlüsse" },
    ];
    fields.forEach(({ key, label }) => {
      const td = document.createElement("td");
      const inp = document.createElement("input");
      inp.type = "number";
      inp.inputMode = "numeric";
      inp.min = "0";
      inp.max = "99999";
      inp.step = "1";
      inp.className = "tracking-metric-input tracking-entry-input";
      inp.dataset.field = key;
      inp.setAttribute("aria-label", `${label} für ${row.displayName}`);
      const num = Math.max(0, Number(row[key]) || 0);
      inp.value = num > 0 ? String(num) : "";
      inp.placeholder = "0";
      inp.addEventListener("input", () => {
        scheduleTrackingModalSave();
      });
      td.appendChild(inp);
      tr.appendChild(td);
    });
    return tr;
  }

  function scheduleTrackingModalSave() {
    if (!trackingCanEdit) {
      return;
    }
    if (trackingModalSaveTimer) {
      clearTimeout(trackingModalSaveTimer);
    }
    setTrackingEntryModalHint("Speichern …");
    setTrackingSaveHint("Speichern …");
    trackingModalSaveTimer = window.setTimeout(() => {
      trackingModalSaveTimer = null;
      void saveTrackingEntryModal({ keepOpen: true, silent: true });
    }, 450);
  }

  async function flushTrackingModalSave() {
    if (trackingModalSaveTimer) {
      clearTimeout(trackingModalSaveTimer);
      trackingModalSaveTimer = null;
      await saveTrackingEntryModal({ keepOpen: true, silent: true });
    }
  }

  function readTrackingEntryModalRows() {
    const rows = [];
    trackingEntryModalBody?.querySelectorAll("tr[data-user-id]").forEach((tr) => {
      const read = (field) => {
        const inp = tr.querySelector(`input[data-field="${field}"]`);
        return Math.max(0, Number.parseInt(inp?.value || "0", 10) || 0);
      };
      rows.push({
        userId: Number.parseInt(tr.getAttribute("data-user-id") || "0", 10),
        calls: read("calls"),
        results: read("results"),
        salesCalls: read("salesCalls"),
        closures: read("closures"),
      });
    });
    return rows;
  }

  async function openTrackingEntryModal() {
    if (!trackingCanEdit) {
      window.alert("Nur Administratoren können Tracking-Daten erfassen.");
      return;
    }
    if (!trackingEntryModal || !trackingEntryModalBody) {
      return;
    }
    setTrackingSaveHint("");
    try {
      const data = await apiFetch("tracking_daily", { method: "GET", query: { date: trackingDate } });
      const rows = data.rows || [];
      if (trackingEntryModalDate) {
        trackingEntryModalDate.textContent = `Tag: ${formatTrackingDateLabel(data.date || trackingDate)}`;
      }
      trackingEntryModalBody.innerHTML = "";
      trackingEntryModalEmpty?.classList.toggle("hidden", rows.length > 0);
      rows.forEach((row) => {
        trackingEntryModalBody.appendChild(renderTrackingEntryModalRow(row));
      });
      if (rows.length === 0) {
        window.alert("Es sind keine aktiven Nutzer vorhanden. Bitte zuerst unter „Nutzer“ anlegen.");
        return;
      }
      if (typeof trackingEntryModal.showModal === "function") {
        trackingEntryModal.showModal();
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Tracking konnte nicht geladen werden.");
    }
  }

  async function saveTrackingEntryModal(opts = {}) {
    const keepOpen = opts.keepOpen === true;
    const silent = opts.silent === true;
    if (!trackingCanEdit) {
      return;
    }
    const rows = readTrackingEntryModalRows();
    if (!rows.length) {
      return;
    }
    try {
      for (const row of rows) {
        await apiFetch("tracking_daily", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: row.userId,
            date: trackingDate,
            calls: row.calls,
            results: row.results,
            salesCalls: row.salesCalls,
            closures: row.closures,
          }),
        });
      }
      if (!keepOpen && typeof trackingEntryModal?.close === "function") {
        trackingEntryModal.close();
      }
      setTrackingSaveHint("Gespeichert.");
      setTrackingEntryModalHint("Gespeichert");
      await loadTracking();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Speichern fehlgeschlagen.";
      setTrackingSaveHint(msg, true);
      setTrackingEntryModalHint(msg, true);
      if (!silent) {
        window.alert(msg);
      }
    }
  }

  function renderTrackingMetricInput(userId, field, value, editable) {
    const num = Math.max(0, Number(value) || 0);
    if (!editable) {
      const span = document.createElement("span");
      span.className = "tracking-metric-readonly";
      span.textContent = String(num);
      span.title = "Nur für Administratoren bearbeitbar";
      return span;
    }
    const inp = document.createElement("input");
    inp.type = "number";
    inp.inputMode = "numeric";
    inp.min = "0";
    inp.max = "99999";
    inp.step = "1";
    inp.className = "tracking-metric-input";
    inp.placeholder = "0";
    inp.value = num > 0 ? String(num) : "";
    inp.dataset.userId = String(userId);
    inp.dataset.field = field;
    inp.setAttribute("aria-label", field);
    inp.addEventListener("input", () => {
      scheduleTrackingSave(userId, inp.closest("tr"));
      scheduleTrackingPieRefresh();
    });
    inp.addEventListener("blur", () => {
      if (inp.value.trim() === "") {
        inp.value = "";
      }
    });
    return inp;
  }

  function readTrackingRowMetrics(tr) {
    const read = (field) => {
      const inp = tr?.querySelector(`input[data-field="${field}"]`);
      return Math.max(0, Number.parseInt(inp?.value || "0", 10) || 0);
    };
    return {
      calls: read("calls"),
      results: read("results"),
      salesCalls: read("salesCalls"),
      closures: read("closures"),
    };
  }

  function scheduleTrackingSave(userId, tr) {
    if (!trackingCanEdit) {
      return;
    }
    const key = String(userId);
    if (trackingSaveTimers.has(key)) {
      clearTimeout(trackingSaveTimers.get(key));
    }
    setTrackingSaveHint("Speichern …");
    trackingSaveTimers.set(
      key,
      window.setTimeout(() => {
        trackingSaveTimers.delete(key);
        void saveTrackingRow(userId, readTrackingRowMetrics(tr));
      }, 450)
    );
  }

  async function saveAllTrackingRows() {
    if (!trackingCanEdit) {
      setTrackingSaveHint("Keine Berechtigung zum Speichern.", true);
      return;
    }
    const rows = readTrackingRowsFromDom();
    if (!rows.length) {
      setTrackingSaveHint("Keine Nutzer zum Speichern.", true);
      return;
    }
    setTrackingSaveHint("Speichere alle …");
    try {
      for (const row of rows) {
        await apiFetch("tracking_daily", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: row.userId,
            date: trackingDate,
            calls: row.calls,
            results: row.results,
            salesCalls: row.salesCalls,
            closures: row.closures,
          }),
        });
      }
      setTrackingSaveHint("Alle Einträge gespeichert.");
      await refreshTrackingCharts(readTrackingRowsFromDom(), trackingLoadSeq);
    } catch (err) {
      setTrackingSaveHint(err instanceof Error ? err.message : "Speichern fehlgeschlagen.", true);
    }
  }

  async function saveTrackingRow(userId, metrics) {
    try {
      await apiFetch("tracking_daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          date: trackingDate,
          calls: metrics.calls,
          results: metrics.results,
          salesCalls: metrics.salesCalls,
          closures: metrics.closures,
        }),
      });
      setTrackingSaveHint("Gespeichert.");
      await refreshTrackingCharts(readTrackingRowsFromDom(), trackingLoadSeq);
    } catch (err) {
      setTrackingSaveHint(err instanceof Error ? err.message : "Speichern fehlgeschlagen.", true);
    }
  }

  function renderTrackingTable(rows) {
    if (!trackingTableBody) return;
    trackingTableBody.innerHTML = "";
    const hasRows = Array.isArray(rows) && rows.length > 0;
    trackingEmptyHint?.classList.toggle("hidden", hasRows);
    if (!hasRows) return;
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.dataset.userId = String(row.userId);
      const isActive = row.active !== false;
      if (!isActive) {
        tr.classList.add("tracking-row--inactive");
      }
      const tdName = document.createElement("td");
      tdName.className = "tracking-user-cell";
      const nameWrap = document.createElement("div");
      nameWrap.className = "tracking-user-name";
      const nameStrong = document.createElement("strong");
      nameStrong.textContent = row.displayName || "Nutzer";
      nameWrap.appendChild(nameStrong);
      const meta = document.createElement("span");
      meta.className = "tracking-user-meta muted";
      const metaParts = [trackingRoleLabel(row.role)];
      if (!isActive) {
        metaParts.push("Inaktiv");
      }
      meta.textContent = metaParts.join(" · ");
      nameWrap.appendChild(meta);
      tdName.appendChild(nameWrap);
      tr.appendChild(tdName);
      const editable = canEditTrackingRow() && isActive;
      ["calls", "results", "salesCalls", "closures"].forEach((field) => {
        const td = document.createElement("td");
        td.className = "tracking-metric-cell";
        if (editable) {
          td.classList.add("tracking-metric-cell--editable");
        }
        td.appendChild(renderTrackingMetricInput(row.userId, field, row[field] ?? 0, editable));
        tr.appendChild(td);
      });
      trackingTableBody.appendChild(tr);
    });
  }

  function syncTrackingDateInput() {
    if (trackingDateInput) {
      trackingDateInput.value = trackingDate;
    }
  }

  function isTrackingTodaySelected() {
    return trackingDate === trackingTodayIso();
  }

  function goTrackingToday() {
    trackingDate = trackingTodayIso();
    syncTrackingDateInput();
    void loadTracking({ forceReload: true });
  }

  function activateTrackingView() {
    if (isTrackingTodaySelected()) {
      trackingDate = trackingTodayIso();
      syncTrackingDateInput();
    }
    void loadTracking();
  }

  async function loadTracking(options = {}) {
    if (!trackingTableBody) return;

    const loadId = ++trackingLoadSeq;
    if (options.preferToday) {
      trackingDate = trackingTodayIso();
      syncTrackingDateInput();
    }

    setTrackingSaveHint("Laden …");
    trackingTableBody.innerHTML = "";
    trackingEmptyHint?.classList.add("hidden");
    if (trackingEmptyHint) {
      trackingEmptyHint.textContent = "Keine Nutzer im System – bitte zuerst unter „Nutzer“ anlegen.";
    }

    updateTrackingDateSummary(trackingDate, null);

    try {
      const data = await apiFetch("tracking_daily", { method: "GET", query: { date: trackingDate } });
      if (loadId !== trackingLoadSeq) {
        return;
      }
      trackingCanEdit = Boolean(data.canEdit ?? data.canEditAll) || isCrmAdmin();
      if (data.date) {
        trackingDate = data.date;
        syncTrackingDateInput();
      }
      updateTrackingEditUi();
      const rows = data.rows || [];
      updateTrackingDateSummary(trackingDate, data.userCount ?? rows.length);
      renderTrackingTable(rows);
      updateTrackingTotals(data.totals || {});
      setTrackingSaveHint("");
      await refreshTrackingCharts(rows, loadId);
    } catch (err) {
      if (loadId !== trackingLoadSeq) {
        return;
      }
      trackingTableBody.innerHTML = "";
      trackingEmptyHint?.classList.remove("hidden");
      if (trackingEmptyHint) {
        trackingEmptyHint.textContent = err instanceof Error ? err.message : "Laden fehlgeschlagen.";
      }
      setTrackingSaveHint(err instanceof Error ? err.message : "Laden fehlgeschlagen.", true);
      trackingPieChart = destroyTrackingChart(trackingPieChart);
      trackingClosuresChart = destroyTrackingChart(trackingClosuresChart);
    }
  }

  function shiftTrackingDate(deltaDays) {
    const d = new Date(`${trackingDate}T12:00:00`);
    d.setDate(d.getDate() + deltaDays);
    trackingDate = trackingIsoFromDate(d);
    syncTrackingDateInput();
    void loadTracking();
  }

  function applyTrackingDateFromInput() {
    const next = trackingDateInput?.value?.trim();
    if (!next || next === trackingDate) {
      if (next === trackingDate && isTrackingTodaySelected()) {
        void loadTracking({ forceReload: true });
      }
      return;
    }
    trackingDate = next;
    void loadTracking();
  }

  function initTracking() {
    updateTrackingEditUi();
    trackingDate = trackingTodayIso();
    syncTrackingDateInput();
    document.getElementById("trackingPrevDay")?.addEventListener("click", () => shiftTrackingDate(-1));
    document.getElementById("trackingNextDay")?.addEventListener("click", () => shiftTrackingDate(1));
    document.getElementById("trackingToday")?.addEventListener("click", () => {
      goTrackingToday();
    });
    document.getElementById("trackingOpenCalendar")?.addEventListener("click", (e) => {
      e.preventDefault();
      openTrackingDatePicker();
    });
    trackingDateInput?.addEventListener("change", () => {
      applyTrackingDateFromInput();
    });
    trackingDateInput?.addEventListener("input", () => {
      applyTrackingDateFromInput();
    });
    trackingDateInput?.addEventListener("click", () => {
      if (typeof trackingDateInput.showPicker === "function") {
        try {
          trackingDateInput.showPicker();
        } catch (_) {
          /* ignore */
        }
      }
    });
    trackingOpenEntryBtn?.addEventListener("click", () => {
      void openTrackingEntryModal();
    });
    trackingEntryClose?.addEventListener("click", () => {
      void (async () => {
        await flushTrackingModalSave();
        if (typeof trackingEntryModal?.close === "function") {
          trackingEntryModal.close();
        }
      })();
    });
    trackingEntryForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      void (async () => {
        await flushTrackingModalSave();
        if (typeof trackingEntryModal?.close === "function") {
          trackingEntryModal.close();
        }
      })();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible" || currentMainView !== "tracking") {
        return;
      }
      if (isTrackingTodaySelected()) {
        trackingDate = trackingTodayIso();
        syncTrackingDateInput();
        void loadTracking({ forceReload: true });
      }
    });
  }

  function updateToolbarForView(view) {
    const toolbarPipeline = document.getElementById("toolbarPipeline");
    const toolbarCustomers = document.getElementById("toolbarCustomers");
    const toolbarProjects = document.getElementById("toolbarProjects");
    const toolbarTracking = document.getElementById("toolbarTracking");
    if (toolbarPipeline) toolbarPipeline.classList.toggle("hidden", view !== "pipeline");
    if (toolbarCustomers) toolbarCustomers.classList.toggle("hidden", view !== "customers");
    if (toolbarProjects) toolbarProjects.classList.toggle("hidden", view !== "projects");
    if (toolbarTracking) toolbarTracking.classList.toggle("hidden", view !== "tracking");
    if (trackingOpenEntryBtn) {
      trackingOpenEntryBtn.classList.toggle("hidden", view !== "tracking" || !trackingCanEdit);
    }
  }

  function getInitialMainView() {
    const allowed = getMainViews();
    const params = new URLSearchParams(window.location.search);
    const v = params.get("view");
    return allowed.includes(v) ? v : "pipeline";
  }

  function syncMainViewUrl(view) {
    const url = new URL(window.location.href);
    if (view === "pipeline") {
      url.searchParams.delete("view");
    } else {
      url.searchParams.set("view", view);
    }
    const qs = url.searchParams.toString();
    const next = url.pathname + (qs ? `?${qs}` : "") + url.hash;
    window.history.replaceState(null, "", next);
  }

  function setMainView(view) {
    const allowed = getMainViews();
    const v = allowed.includes(view) ? view : "pipeline";
    const viewPipeline = document.getElementById("viewPipeline");
    const viewCustomers = document.getElementById("viewCustomers");
    const viewProjects = document.getElementById("viewProjects");
    const viewActivity = document.getElementById("viewActivity");
    const viewTracking = document.getElementById("viewTracking");
    const titleEl = document.getElementById("crmPageTitle");

    if (viewPipeline) viewPipeline.classList.toggle("hidden", v !== "pipeline");
    if (viewCustomers) viewCustomers.classList.toggle("hidden", v !== "customers");
    if (viewProjects) viewProjects.classList.toggle("hidden", v !== "projects");
    if (viewActivity) viewActivity.classList.toggle("hidden", v !== "activity");
    if (viewTracking) viewTracking.classList.toggle("hidden", v !== "tracking");

    document.querySelectorAll(".crm-sidebar-link[data-crm-view]").forEach((link) => {
      link.classList.toggle("is-active", link.getAttribute("data-crm-view") === v);
    });

    if (titleEl) {
      titleEl.textContent = VIEW_TITLES[v] || "ADLIONS CRM";
    }

    updateToolbarForView(v);
    currentMainView = v;
    if (v === "tracking") {
      activateTrackingView();
    }
    document.dispatchEvent(new CustomEvent("crm-main-view", { detail: { view: v } }));
  }

  function bindMainNav() {
    const hasSpaViews = Boolean(document.getElementById("viewPipeline"));
    document.querySelectorAll(".crm-sidebar-link[data-crm-view]").forEach((link) => {
      link.addEventListener("click", (e) => {
        const view = link.getAttribute("data-crm-view") || "pipeline";
        if (!getMainViews().includes(view)) {
          return;
        }
        if (hasSpaViews) {
          e.preventDefault();
          setMainView(view);
          syncMainViewUrl(view);
        }
      });
    });
    if (hasSpaViews) {
      setMainView(getInitialMainView());
    }
  }

  function renderApp() {
    ensureDealsUseExistingPhases();
    renderFilters();
    renderBoard();
    if (canAccessFulfilmentViews()) {
      renderCustomers();
      renderProjects();
    }
    renderActivities();
    renderStats();
  }

  function renderFilters() {
    const prevPhase = phaseFilter.value;
    const prevOwner = ownerFilter.value;

    replaceSelectOptions(phaseFilter, [
      { value: "", label: "Alle" },
      ...state.phases.map((phase) => ({ value: phase.id, label: phase.name })),
    ]);
    phaseFilter.value = state.phases.some((phase) => phase.id === prevPhase) ? prevPhase : "";

    const owners = [...new Set(state.deals.map((deal) => deal.owner).filter(Boolean))];
    replaceSelectOptions(ownerFilter, [{ value: "", label: "Alle" }, ...owners.map((owner) => ({ value: owner, label: owner }))]);
    ownerFilter.value = owners.includes(prevOwner) ? prevOwner : "";

    replaceSelectOptions(dealPhaseSelect, state.phases.map((phase) => ({ value: phase.id, label: phase.name })));
    replaceSelectOptions(dealContactSelect, [{ value: "", label: "Kein Kontakt" }, ...state.contacts.map((contact) => ({ value: contact.id, label: `${contact.name} (${contact.company || "ohne Firma"})` }))]);
  }

  function renderBoard() {
    boardEl.innerHTML = "";
    const deals = filteredDeals();
    const phaseMap = new Map(state.phases.map((phase) => [phase.id, []]));

    for (const deal of deals) {
      if (phaseMap.has(deal.phaseId)) phaseMap.get(deal.phaseId).push(deal);
    }

    for (const phase of state.phases) {
      const column = document.createElement("section");
      column.className = "phase-column";
      column.dataset.phaseId = phase.id;

      const head = document.createElement("div");
      head.className = "phase-head";

      const titleWrap = document.createElement("div");
      const name = document.createElement("div");
      name.className = "phase-name";
      name.textContent = phase.name;
      const meta = document.createElement("p");
      meta.className = "phase-meta";
      meta.textContent = `${(phaseMap.get(phase.id) || []).length} Deal(s) · ${phase.probability || 0}%`;
      titleWrap.append(name, meta);

      const actions = document.createElement("div");
      actions.className = "phase-actions";
      actions.append(
        phaseActionButton("Phase bearbeiten", () => openPhaseModal(phase.id), "✎", "phase-action-edit"),
        phaseActionButton("Phase löschen", () => removePhase(phase.id), "✕", "phase-action-delete")
      );

      head.append(titleWrap, actions);
      column.appendChild(head);

      const dropzone = document.createElement("div");
      dropzone.className = "phase-dropzone";
      dropzone.dataset.phaseId = phase.id;
      bindDropzone(dropzone);

      const dealsInPhase = phaseMap.get(phase.id) || [];
      dealsInPhase
        .sort((a, b) => (b.value || 0) - (a.value || 0))
        .forEach((deal) => dropzone.appendChild(renderDealCard(deal)));

      column.appendChild(dropzone);
      boardEl.appendChild(column);
    }
  }

  function renderDealCard(deal) {
    const fragment = dealTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".deal-card");
    const title = fragment.querySelector("h4");
    const company = fragment.querySelector(".deal-company");
    const meta = fragment.querySelector(".deal-meta");
    const nextStep = fragment.querySelector(".deal-next-step");
    const audit = fragment.querySelector(".deal-audit");
    const tagList = fragment.querySelector(".tag-list");

    title.textContent = deal.name;
    company.textContent = deal.company ? `${deal.company}` : "Keine Firma angegeben";

    const contact = state.contacts.find((item) => item.id === deal.contactId);
    const dueText = deal.dueDate ? ` · Fällig: ${formatDate(deal.dueDate)}` : "";
    const ownerText = deal.owner ? `Owner: ${deal.owner}` : "Owner: -";
    const contactText = contact ? ` · Kontakt: ${contact.name}` : "";
    meta.textContent = `${formatMoney(deal.value || 0)} · ${ownerText}${contactText}${dueText}`;
    nextStep.textContent = deal.nextStep ? `Nächster Schritt: ${deal.nextStep}` : "Nächster Schritt: -";

    const commentCount = (deal.comments || []).length;
    const auditPieces = [];
    if (deal.updatedByName) {
      auditPieces.push(`Zuletzt bearbeitet von ${deal.updatedByName}`);
    } else {
      auditPieces.push("Zuletzt bearbeitet: –");
    }
    auditPieces.push(formatDateTime(deal.updatedAt));
    if (commentCount) {
      auditPieces.push(`${commentCount} Kommentar(e)`);
    }
    audit.textContent = auditPieces.join(" · ");

    card.dataset.dealId = deal.id;
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", deal.id);
      card.style.opacity = "0.6";
    });
    card.addEventListener("dragend", () => {
      card.style.opacity = "1";
    });

    tagList.innerHTML = "";
    (deal.tags || []).forEach((tag) => {
      const chip = document.createElement("span");
      chip.className = "tag";
      chip.textContent = tag;
      tagList.appendChild(chip);
    });

    fragment.querySelector('[data-action="edit"]').addEventListener("click", () => openDealModal(deal.id));

    return fragment;
  }

  function renderActivities() {
    activityFeed.innerHTML = "";
    state.activities.slice(0, 30).forEach((activity) => {
      const li = document.createElement("li");
      const time = document.createElement("span");
      time.className = "activity-time";
      const who = activity.userName ? `${activity.userName} · ` : "";
      time.textContent = `${who}${formatDateTime(activity.timestamp)} · ${activity.type}`;
      const body = document.createElement("span");
      body.className = "activity-body";
      body.textContent = activity.message;
      li.append(time, body);
      activityFeed.appendChild(li);
    });
  }

  function renderStats() {
    const wonIds = state.phases
      .filter((phase) => phase.name.toLowerCase().includes("gewonnen"))
      .map((phase) => phase.id);
    const verlorenIds = state.phases.filter((phase) => isVerlorenPhaseName(phase.name)).map((phase) => phase.id);
    const followUpIds = state.phases.filter((phase) => isFollowUpPhaseName(phase.name)).map((phase) => phase.id);
    const closedIds = new Set([...wonIds, ...verlorenIds, ...followUpIds]);

    const openDeals = state.deals.filter((deal) => !closedIds.has(deal.phaseId));
    const wonDeals = state.deals.filter((deal) => wonIds.includes(deal.phaseId));
    const lostDeals = state.deals.filter((deal) => verlorenIds.includes(deal.phaseId));

    const pipelineValue = openDeals.reduce((sum, deal) => sum + (deal.value || 0), 0);
    const forecast = openDeals.reduce((sum, deal) => {
      const phase = state.phases.find((item) => item.id === deal.phaseId);
      const probability = Number.isFinite(deal.probability) ? deal.probability : (phase?.probability || 0);
      return sum + ((deal.value || 0) * probability) / 100;
    }, 0);
    const winRate = wonDeals.length + lostDeals.length > 0 ? (wonDeals.length / (wonDeals.length + lostDeals.length)) * 100 : 0;

    statDealsOpen.textContent = `${openDeals.length}`;
    statPipelineValue.textContent = formatMoney(pipelineValue);
    statForecastValue.textContent = formatMoney(Math.round(forecast));
    statWinRate.textContent = `${winRate.toFixed(1)}%`;
  }

  function customerLabel(customer) {
    if (!customer) return "—";
    const company = customer.company || "Ohne Firma";
    const person = customer.contactName ? ` (${customer.contactName})` : "";
    return `${company}${person}`;
  }

  function projectStatusLabel(status) {
    const map = {
      aktiv: "Aktiv",
      geplant: "Geplant",
      pausiert: "Pausiert",
      abgeschlossen: "Abgeschlossen",
    };
    return map[status] || status || "—";
  }

  function isProjectActive(project) {
    return project.status === "aktiv" || project.status === "geplant";
  }

  function projectProgress(project) {
    const items = project.workItems || [];
    if (!items.length) return null;
    const done = items.filter((item) => item.done).length;
    return { done, total: items.length, pct: Math.round((done / items.length) * 100) };
  }

  function parseWorkItemsText(text) {
    return String(text || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({ id: uid(), text: line, done: false }));
  }

  function workItemsToText(items) {
    return (items || []).map((item) => item.text || "").filter(Boolean).join("\n");
  }

  function mergeWorkItemsFromText(existingItems, text) {
    const lines = String(text || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const oldByText = new Map((existingItems || []).map((item) => [item.text, item]));
    return lines.map((line) => {
      const prev = oldByText.get(line);
      if (prev) return { ...prev, text: line };
      return { id: uid(), text: line, done: false };
    });
  }

  function countProjectsForCustomer(customerId) {
    return state.projects.filter((p) => p.customerId === customerId).length;
  }

  function projectsForCustomer(customerId) {
    return state.projects.filter((p) => p.customerId === customerId);
  }

  function customerForProject(project) {
    if (!project?.customerId) return null;
    return state.customers.find((c) => c.id === project.customerId) || null;
  }

  function projectsAvailableToLink(customerId) {
    return state.projects.filter((p) => p.customerId !== customerId);
  }

  function filteredCustomers() {
    const q = (customerSearchInput?.value || "").trim().toLowerCase();
    const sorted = [...state.customers].sort((a, b) => (a.company || "").localeCompare(b.company || "", "de"));
    if (!q) return sorted;
    return sorted.filter((c) => {
      const hay = [c.company, c.contactName, c.email, c.phone, c.city, c.notes].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  function filteredProjects() {
    const q = (projectSearchInput?.value || "").trim().toLowerCase();
    const status = projectStatusFilter?.value || "";
    let list = [...state.projects].sort((a, b) => {
      const da = a.startDate || "";
      const db = b.startDate || "";
      return db.localeCompare(da);
    });
    if (status) list = list.filter((p) => p.status === status);
    if (!q) return list;
    return list.filter((p) => {
      const customer = state.customers.find((c) => c.id === p.customerId);
      const hay = [p.name, p.description, p.documentation, p.owner, customer?.company, workItemsToText(p.workItems)]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  function renderCustomers() {
    if (!customersTableBody) return;
    const list = filteredCustomers();
    customersTableBody.innerHTML = "";

    if (customersStats) {
      const active = state.customers.filter((c) => c.status !== "inaktiv").length;
      customersStats.innerHTML = `
        <article class="stat-card"><p>Kunden gesamt</p><strong>${state.customers.length}</strong></article>
        <article class="stat-card"><p>Aktive Kunden</p><strong>${active}</strong></article>
        <article class="stat-card"><p>Projekte gesamt</p><strong>${state.projects.length}</strong></article>
      `;
    }

    if (customersEmptyHint) {
      customersEmptyHint.classList.toggle("hidden", list.length > 0);
    }

    list.forEach((customer) => {
      const row = document.createElement("tr");
      const projectCount = countProjectsForCustomer(customer.id);
      const contactParts = [customer.email, customer.phone].filter(Boolean).join(" · ") || "—";
      const workflowSteps = Array.isArray(customer.workflow) ? customer.workflow : [];
      const doneCount = workflowSteps.filter((step) => step.done).length;
      const progressText = workflowSteps.length ? `${doneCount}/${workflowSteps.length}` : "0/0";
      const runtimeText = `${customer.runtimeMonths || 12} Mon.`;
      row.innerHTML = `
        <td><strong>${escapeHtml(customer.company || "—")}</strong></td>
        <td>${escapeHtml(customer.contactName || "—")}</td>
        <td>${escapeHtml(contactParts)}</td>
        <td><span class="status-pill status-${escapeHtml(customer.status || "aktiv")}">${customer.status === "inaktiv" ? "Inaktiv" : "Aktiv"}</span></td>
        <td class="customer-project-count">${projectCount} Projekt(e)<br><span class="table-sub">Ablauf: ${progressText} · ${runtimeText}</span></td>
        <td class="table-actions"></td>
      `;
      row.classList.toggle("customer-row-inaktiv", customer.status === "inaktiv");
      const actions = row.querySelector(".table-actions");
      const projectBtn = document.createElement("button");
      projectBtn.type = "button";
      projectBtn.className = "link-btn";
      projectBtn.textContent = "Projekte";
      projectBtn.addEventListener("click", () => openCustomerModal(customer.id));
      const newProjectBtn = document.createElement("button");
      newProjectBtn.type = "button";
      newProjectBtn.className = "link-btn";
      newProjectBtn.textContent = "+ Projekt";
      newProjectBtn.addEventListener("click", () => openProjectModal(null, customer.id));
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "link-btn";
      editBtn.textContent = "Bearbeiten";
      editBtn.addEventListener("click", () => openCustomerModal(customer.id));
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "link-btn danger";
      delBtn.textContent = "Löschen";
      delBtn.addEventListener("click", () => removeCustomer(customer.id));
      actions.append(projectBtn, newProjectBtn, editBtn, delBtn);
      customersTableBody.appendChild(row);
    });
  }

  function renderProjects() {
    if (!projectsTableBody) return;
    const activeList = state.projects.filter(isProjectActive).sort((a, b) => (a.endDate || "9999").localeCompare(b.endDate || "9999"));
    const allList = filteredProjects();

    if (projectsStats) {
      const aktiv = state.projects.filter((p) => p.status === "aktiv").length;
      const geplant = state.projects.filter((p) => p.status === "geplant").length;
      const endingSoon = state.projects.filter((p) => {
        if (!p.endDate || !isProjectActive(p)) return false;
        const end = new Date(p.endDate);
        const now = new Date();
        const diff = (end - now) / (1000 * 60 * 60 * 24);
        return diff >= 0 && diff <= 30;
      }).length;
      projectsStats.innerHTML = `
        <article class="stat-card"><p>Aktive Projekte</p><strong>${aktiv}</strong></article>
        <article class="stat-card"><p>Geplant</p><strong>${geplant}</strong></article>
        <article class="stat-card"><p>Ende in 30 Tagen</p><strong>${endingSoon}</strong></article>
        <article class="stat-card"><p>Gesamt</p><strong>${state.projects.length}</strong></article>
      `;
    }

    if (activeProjectsGrid) {
      activeProjectsGrid.innerHTML = "";
      activeList.forEach((project) => {
        activeProjectsGrid.appendChild(renderActiveProjectCard(project));
      });
    }
    if (activeProjectsEmpty) {
      activeProjectsEmpty.classList.toggle("hidden", activeList.length > 0);
    }

    projectsTableBody.innerHTML = "";
    if (projectsEmptyHint) {
      projectsEmptyHint.classList.toggle("hidden", state.projects.length > 0);
    }

    allList.forEach((project) => {
      const customer = state.customers.find((c) => c.id === project.customerId);
      const progress = projectProgress(project);
      const range = formatProjectRange(project.startDate, project.endDate);
      const row = document.createElement("tr");
      row.innerHTML = `
        <td><strong>${escapeHtml(project.name)}</strong><br><span class="table-sub">${escapeHtml((project.description || "").slice(0, 80))}${(project.description || "").length > 80 ? "…" : ""}</span></td>
        <td class="project-customer-cell">${escapeHtml(customer?.company || "—")}</td>
        <td>${escapeHtml(range)}</td>
        <td><span class="status-pill status-project-${escapeHtml(project.status)}">${escapeHtml(projectStatusLabel(project.status))}</span></td>
        <td>${progress ? `${progress.pct}% (${progress.done}/${progress.total})` : "—"}</td>
        <td class="table-actions"></td>
      `;
      const actions = row.querySelector(".table-actions");
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "link-btn";
      editBtn.textContent = "Dokumentation";
      editBtn.addEventListener("click", () => openProjectModal(project.id));
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "link-btn danger";
      delBtn.textContent = "Löschen";
      delBtn.addEventListener("click", () => removeProject(project.id));
      const customerBtn = document.createElement("button");
      customerBtn.type = "button";
      customerBtn.className = "link-btn";
      customerBtn.textContent = customer ? "Kunde" : "Verknüpfen";
      customerBtn.addEventListener("click", () => openProjectModal(project.id));
      actions.prepend(customerBtn);
      actions.append(editBtn, delBtn);
      projectsTableBody.appendChild(row);

      const customerCell = row.querySelector(".project-customer-cell");
      if (customerCell && customer) {
        customerCell.classList.add("is-linked");
        customerCell.title = "Klicken, um Kunden zu öffnen";
        customerCell.style.cursor = "pointer";
        customerCell.addEventListener("click", () => openCustomerModal(customer.id));
      } else if (customerCell) {
        customerCell.classList.add("is-unlinked");
        customerCell.title = "Klicken, um Kunde zu verknüpfen";
        customerCell.style.cursor = "pointer";
        customerCell.addEventListener("click", () => openProjectModal(project.id));
      }
    });

    refreshProjectCustomerSelect();
  }

  function renderActiveProjectCard(project) {
    const customer = state.customers.find((c) => c.id === project.customerId);
    const progress = projectProgress(project);
    const card = document.createElement("article");
    card.className = "active-project-card";
    const items = (project.workItems || []).slice(0, 5);
    card.innerHTML = `
      <header>
        <h3>${escapeHtml(project.name)}</h3>
        <span class="status-pill status-project-${escapeHtml(project.status)}">${escapeHtml(projectStatusLabel(project.status))}</span>
      </header>
      <p class="active-project-customer">${escapeHtml(customer?.company || "Kein Kunde")}</p>
      <p class="active-project-range">${escapeHtml(formatProjectRange(project.startDate, project.endDate))}</p>
      ${progress ? `<div class="project-progress-bar" role="progressbar" aria-valuenow="${progress.pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${progress.pct}%"></span></div><p class="active-project-progress">${progress.pct}% erledigt</p>` : ""}
      <ul class="active-project-tasks"></ul>
      <button type="button" class="link-btn deal-open-btn">Projekt öffnen</button>
    `;
    const list = card.querySelector(".active-project-tasks");
    if (items.length) {
      items.forEach((item) => {
        const li = document.createElement("li");
        li.className = item.done ? "is-done" : "";
        li.textContent = item.text;
        list.appendChild(li);
      });
      if ((project.workItems || []).length > 5) {
        const more = document.createElement("li");
        more.className = "is-more";
        more.textContent = `+${project.workItems.length - 5} weitere …`;
        list.appendChild(more);
      }
    } else {
      const li = document.createElement("li");
      li.className = "is-muted";
      li.textContent = "Noch keine Leistungen erfasst";
      list.appendChild(li);
    }
    card.querySelector("button").addEventListener("click", () => openProjectModal(project.id));
    const customerEl = card.querySelector(".active-project-customer");
    if (customerEl && customer) {
      customerEl.classList.add("is-clickable");
      customerEl.addEventListener("click", () => openCustomerModal(customer.id));
    }
    return card;
  }

  function formatProjectRange(start, end) {
    if (!start && !end) return "Zeitraum offen";
    if (start && end) return `${formatDate(start)} – ${formatDate(end)}`;
    if (start) return `ab ${formatDate(start)}`;
    return `bis ${formatDate(end)}`;
  }

  function refreshProjectCustomerSelect() {
    if (!projectCustomerSelect) return;
    const prev = projectCustomerSelect.value;
    replaceSelectOptions(projectCustomerSelect, [
      { value: "", label: "— Kein Kunde —" },
      ...state.customers.map((c) => ({ value: c.id, label: c.company || "Ohne Firma" })),
    ]);
    if (state.customers.some((c) => c.id === prev)) {
      projectCustomerSelect.value = prev;
    }
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function handleCustomerSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      company: String(data.get("company") || "").trim(),
      contactName: String(data.get("contactName") || "").trim(),
      email: String(data.get("email") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
      street: String(data.get("street") || "").trim(),
      zip: String(data.get("zip") || "").trim(),
      city: String(data.get("city") || "").trim(),
      status: String(data.get("status") || "aktiv"),
      runtimeMonths: Math.max(1, Math.min(60, Number.parseInt(String(data.get("runtimeMonths") || "12"), 10) || 12)),
      notes: String(data.get("notes") || "").trim(),
    };
    if (!payload.company) return;

    const isNewCustomer = !uiState.editingCustomerId;

    if (uiState.editingCustomerId) {
      const idx = state.customers.findIndex((c) => c.id === uiState.editingCustomerId);
      if (idx >= 0) {
        const merged = { ...state.customers[idx], ...payload };
        merged.workflow = normalizeCustomerWorkflow(merged.workflow);
        stampCustomer(merged, false);
        state.customers[idx] = merged;
        logActivity("Kunde", `Kunde „${payload.company}“ wurde von ${actorLabel()} bearbeitet.`);
      }
    } else {
      const customer = { id: uid(), ...payload, workflow: buildDefaultCustomerWorkflow() };
      stampCustomer(customer, true);
      state.customers.unshift(customer);
      uiState.editingCustomerId = customer.id;
      logActivity("Kunde", `Kunde „${payload.company}“ wurde von ${actorLabel()} angelegt.`);
    }
    await persistAndRerender();
    if (uiState.editingCustomerId && isNewCustomer) {
      renderCustomerProjectsPanel(uiState.editingCustomerId);
      if (customerModalTitle) customerModalTitle.textContent = "Kunde bearbeiten";
      showCrmGlobalToast("Kunde gespeichert – jetzt Projekte verknüpfen oder anlegen.");
      return;
    }
    closeDialog(customerModal, form);
  }

  async function handleProjectSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    if (!name) return;

    const workItemsText = String(data.get("workItemsText") || "");
    const payload = {
      name,
      customerId: String(data.get("customerId") || ""),
      startDate: String(data.get("startDate") || ""),
      endDate: String(data.get("endDate") || ""),
      status: String(data.get("status") || "geplant"),
      owner: String(data.get("owner") || "").trim(),
      description: String(data.get("description") || "").trim(),
      documentation: String(data.get("documentation") || "").trim(),
    };

    if (uiState.editingProjectId) {
      const idx = state.projects.findIndex((p) => p.id === uiState.editingProjectId);
      if (idx >= 0) {
        const workItems = mergeWorkItemsFromText(state.projects[idx].workItems, workItemsText);
        const merged = { ...state.projects[idx], ...payload, workItems };
        stampProject(merged, false);
        state.projects[idx] = merged;
        logActivity("Projekt", `Projekt „${name}“ wurde von ${actorLabel()} bearbeitet.`);
      }
    } else {
      const project = {
        id: uid(),
        ...payload,
        workItems: parseWorkItemsText(workItemsText),
      };
      stampProject(project, true);
      state.projects.unshift(project);
      logActivity("Projekt", `Projekt „${name}“ wurde von ${actorLabel()} angelegt.`);
    }
    await persistAndRerender();
    closeDialog(projectModal, form);
  }

  function renderCustomerWorkflowPanel(customerId) {
    if (!customerWorkflowPanel || !customerWorkflowList) return;
    if (!customerId) {
      customerWorkflowPanel.classList.add("hidden");
      return;
    }
    const customer = state.customers.find((c) => c.id === customerId);
    if (!customer) {
      customerWorkflowPanel.classList.add("hidden");
      return;
    }
    customerWorkflowPanel.classList.remove("hidden");
    customer.workflow = normalizeCustomerWorkflow(customer.workflow);
    const total = customer.workflow.length;
    const done = customer.workflow.filter((step) => step.done).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    if (customerWorkflowProgressText) {
      customerWorkflowProgressText.textContent = `${done} von ${total} Schritten erledigt (${pct}%)`;
    }
    if (customerWorkflowProgressBar) {
      customerWorkflowProgressBar.style.width = `${pct}%`;
    }

    customerWorkflowList.innerHTML = "";
    customer.workflow.forEach((step) => {
      const li = document.createElement("li");
      li.className = "customer-workflow-item";
      li.innerHTML = `
        <label>
          <input type="checkbox" data-workflow-key="${escapeHtml(step.key)}" ${step.done ? "checked" : ""}>
          <span>${escapeHtml(step.label)}</span>
        </label>
        <span class="customer-workflow-duration">${escapeHtml(step.duration)}</span>
      `;
      customerWorkflowList.appendChild(li);
    });
  }

  async function toggleCustomerWorkflowStep(stepKey, checked) {
    const customerId = uiState.editingCustomerId;
    if (!customerId) return;
    const customer = state.customers.find((c) => c.id === customerId);
    if (!customer) return;
    customer.workflow = normalizeCustomerWorkflow(customer.workflow);
    const step = customer.workflow.find((item) => item.key === stepKey);
    if (!step) return;
    step.done = Boolean(checked);
    step.doneAt = step.done ? new Date().toISOString() : null;
    stampCustomer(customer, false);
    logActivity(
      "Kunde",
      `Ablauf bei „${customer.company || "Kunde"}“: ${step.label} ${step.done ? "erledigt" : "offen"} (${actorLabel()}).`
    );
    renderCustomerWorkflowPanel(customerId);
    await persistAndRerender();
  }

  function renderCustomerProjectsPanel(customerId) {
    if (!customerProjectsPanel) return;
    if (!customerId) {
      customerProjectsPanel.classList.add("hidden");
      return;
    }
    customerProjectsPanel.classList.remove("hidden");
    const linked = projectsForCustomer(customerId);
    if (customerLinkedProjectsList) {
      customerLinkedProjectsList.innerHTML = "";
      linked.forEach((project) => {
        const li = document.createElement("li");
        li.className = "customer-linked-project-item";
        const info = document.createElement("div");
        info.className = "customer-linked-project-info";
        const title = document.createElement("strong");
        title.textContent = project.name;
        const meta = document.createElement("span");
        meta.className = "customer-linked-project-meta";
        meta.textContent = `${projectStatusLabel(project.status)} · ${formatProjectRange(project.startDate, project.endDate)}`;
        info.append(title, meta);
        const actions = document.createElement("div");
        actions.className = "customer-linked-project-actions";
        const openBtn = document.createElement("button");
        openBtn.type = "button";
        openBtn.className = "link-btn";
        openBtn.textContent = "Öffnen";
        openBtn.addEventListener("click", () => {
          if (customerModal && typeof customerModal.close === "function") customerModal.close();
          openProjectModal(project.id);
        });
        const unlinkBtn = document.createElement("button");
        unlinkBtn.type = "button";
        unlinkBtn.className = "link-btn danger";
        unlinkBtn.textContent = "Lösen";
        unlinkBtn.addEventListener("click", () => unlinkProjectFromCustomer(project.id));
        actions.append(openBtn, unlinkBtn);
        li.append(info, actions);
        customerLinkedProjectsList.appendChild(li);
      });
    }
    if (customerProjectsEmpty) {
      customerProjectsEmpty.classList.toggle("hidden", linked.length > 0);
    }
    if (linkProjectToCustomerSelect) {
      const available = projectsAvailableToLink(customerId);
      replaceSelectOptions(linkProjectToCustomerSelect, [
        { value: "", label: available.length ? "— Projekt wählen —" : "Keine weiteren Projekte" },
        ...available.map((p) => {
          const other = p.customerId ? state.customers.find((c) => c.id === p.customerId) : null;
          const suffix = other ? ` (aktuell: ${other.company})` : " (ohne Kunde)";
          return { value: p.id, label: `${p.name}${suffix}` };
        }),
      ]);
      linkProjectToCustomerSelect.disabled = available.length === 0;
      if (linkProjectToCustomerBtn) linkProjectToCustomerBtn.disabled = available.length === 0;
    }
  }

  async function linkSelectedProjectToCurrentCustomer() {
    const customerId = uiState.editingCustomerId;
    if (!customerId) {
      alert("Bitte zuerst den Kunden speichern.");
      return;
    }
    const projectId = linkProjectToCustomerSelect?.value || "";
    if (!projectId) {
      alert("Bitte ein Projekt auswählen.");
      return;
    }
    await linkProjectToCustomer(projectId, customerId);
  }

  async function linkProjectToCustomer(projectId, customerId) {
    const project = state.projects.find((p) => p.id === projectId);
    const customer = state.customers.find((c) => c.id === customerId);
    if (!project || !customer) return;
    if (project.customerId === customerId) return;
    const prev = project.customerId ? state.customers.find((c) => c.id === project.customerId) : null;
    if (prev && prev.id !== customerId) {
      const ok = window.confirm(
        `Projekt „${project.name}“ ist mit „${prev.company}“ verknüpft. Stattdessen mit „${customer.company}“ verknüpfen?`
      );
      if (!ok) return;
    }
    project.customerId = customerId;
    stampProject(project, false);
    logActivity("Projekt", `Projekt „${project.name}“ wurde mit Kunde „${customer.company}“ von ${actorLabel()} verknüpft.`);
    await persistAndRerender();
    renderCustomerProjectsPanel(customerId);
  }

  async function unlinkProjectFromCustomer(projectId) {
    const project = state.projects.find((p) => p.id === projectId);
    if (!project || !project.customerId) return;
    const customer = state.customers.find((c) => c.id === project.customerId);
    if (!window.confirm(`Verknüpfung von „${project.name}“ mit „${customer?.company || "Kunde"}“ aufheben?`)) return;
    project.customerId = "";
    stampProject(project, false);
    logActivity("Projekt", `Verknüpfung von Projekt „${project.name}“ wurde von ${actorLabel()} gelöst.`);
    await persistAndRerender();
    if (uiState.editingCustomerId) renderCustomerProjectsPanel(uiState.editingCustomerId);
  }

  function openCustomerModal(customerId = null) {
    uiState.editingCustomerId = customerId;
    if (!customerForm) return;
    customerForm.reset();
    if (customerId) {
      customerForm.dataset.hadCustomerId = "1";
    } else {
      delete customerForm.dataset.hadCustomerId;
    }
    if (customerModalTitle) {
      customerModalTitle.textContent = customerId ? "Kunde bearbeiten" : "Kunde anlegen";
    }
    if (customerId) {
      const customer = state.customers.find((c) => c.id === customerId);
      if (customer) {
        setFormValue(customerForm, "company", customer.company);
        setFormValue(customerForm, "contactName", customer.contactName || "");
        setFormValue(customerForm, "email", customer.email || "");
        setFormValue(customerForm, "phone", customer.phone || "");
        setFormValue(customerForm, "street", customer.street || "");
        setFormValue(customerForm, "zip", customer.zip || "");
        setFormValue(customerForm, "city", customer.city || "");
        setFormValue(customerForm, "status", customer.status || "aktiv");
        setFormValue(customerForm, "runtimeMonths", String(customer.runtimeMonths || 12));
        setFormValue(customerForm, "notes", customer.notes || "");
      }
      renderCustomerWorkflowPanel(customerId);
      renderCustomerProjectsPanel(customerId);
    } else if (customerProjectsPanel) {
      customerProjectsPanel.classList.add("hidden");
      if (customerWorkflowPanel) customerWorkflowPanel.classList.add("hidden");
      setFormValue(customerForm, "runtimeMonths", "12");
    }
    openDialog(customerModal);
  }

  function openProjectModal(projectId = null, preselectedCustomerId = null) {
    uiState.editingProjectId = projectId;
    refreshProjectCustomerSelect();
    if (!projectForm) return;
    projectForm.reset();
    if (projectModalTitle) {
      projectModalTitle.textContent = projectId ? "Projekt bearbeiten" : "Projekt anlegen";
    }
    if (projectId) {
      const project = state.projects.find((p) => p.id === projectId);
      if (project) {
        setFormValue(projectForm, "name", project.name);
        setFormValue(projectForm, "customerId", project.customerId || "");
        setFormValue(projectForm, "startDate", project.startDate || "");
        setFormValue(projectForm, "endDate", project.endDate || "");
        setFormValue(projectForm, "status", project.status || "geplant");
        setFormValue(projectForm, "owner", project.owner || "");
        setFormValue(projectForm, "description", project.description || "");
        setFormValue(projectForm, "documentation", project.documentation || "");
        setFormValue(projectForm, "workItemsText", workItemsToText(project.workItems));
      }
    } else {
      setFormValue(projectForm, "status", "geplant");
      if (preselectedCustomerId) {
        setFormValue(projectForm, "customerId", preselectedCustomerId);
      }
    }
    openDialog(projectModal);
  }

  async function removeCustomer(customerId) {
    const customer = state.customers.find((c) => c.id === customerId);
    if (!customer) return;
    if (!window.confirm(`Kunde „${customer.company}“ wirklich löschen? Verknüpfte Projekte bleiben ohne Kundenzuordnung.`)) return;
    state.customers = state.customers.filter((c) => c.id !== customerId);
    state.projects = state.projects.map((p) => (p.customerId === customerId ? { ...p, customerId: "" } : p));
    logActivity("Kunde", `Kunde „${customer.company}“ wurde von ${actorLabel()} gelöscht.`);
    await persistAndRerender();
  }

  async function removeProject(projectId) {
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return;
    if (!window.confirm(`Projekt „${project.name}“ wirklich löschen?`)) return;
    state.projects = state.projects.filter((p) => p.id !== projectId);
    logActivity("Projekt", `Projekt „${project.name}“ wurde von ${actorLabel()} gelöscht.`);
    await persistAndRerender();
  }

  function filteredDeals() {
    const text = searchInput.value.trim().toLowerCase();
    const phase = phaseFilter.value;
    const owner = ownerFilter.value;
    const priority = priorityFilter ? priorityFilter.value : "";

    return state.deals.filter((deal) => {
      if (phase && deal.phaseId !== phase) return false;
      if (owner && deal.owner !== owner) return false;
      if (priority && deal.priority !== priority) return false;
      if (!text) return true;
      const contact = state.contacts.find((item) => item.id === deal.contactId);
      const haystack = [
        deal.name,
        deal.company,
        deal.owner,
        deal.nextStep,
        deal.notes,
        ...(deal.tags || []),
        contact?.name,
        contact?.email,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(text);
    });
  }

  async function handleDealSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    const payload = {
      name: String(data.get("name") || "").trim(),
      company: String(data.get("company") || "").trim(),
      value: Number(data.get("value") || 0),
      phaseId: String(data.get("phaseId") || ""),
      owner: String(data.get("owner") || "").trim(),
      priority: String(data.get("priority") || "mittel"),
      contactId: String(data.get("contactId") || ""),
      nextStep: String(data.get("nextStep") || "").trim(),
      dueDate: String(data.get("dueDate") || ""),
      probability: Number(data.get("probability") || 0),
      tags: String(data.get("tags") || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      notes: String(data.get("notes") || "").trim(),
    };

    if (!payload.name) return;
    if (!payload.phaseId) payload.phaseId = state.phases[0]?.id || "";
    if (!payload.owner) payload.owner = "Team";

    if (uiState.editingDealId) {
      const idx = state.deals.findIndex((deal) => deal.id === uiState.editingDealId);
      if (idx >= 0) {
        const merged = { ...state.deals[idx], ...payload, comments: state.deals[idx].comments || [] };
        stampDeal(merged, false);
        state.deals[idx] = merged;
        logActivity("Deal", `Deal „${payload.name}“ wurde von ${actorLabel()} bearbeitet.`);
      }
    } else {
      const deal = { id: uid(), comments: [], ...payload };
      stampDeal(deal, true);
      state.deals.unshift(deal);
      logActivity("Deal", `Deal „${payload.name}“ wurde von ${actorLabel()} angelegt.`);
    }

    await persistAndRerender();
    closeDialog(dealModal, form);
  }

  async function handleContactSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      name: String(data.get("name") || "").trim(),
      company: String(data.get("company") || "").trim(),
      email: String(data.get("email") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
      source: String(data.get("source") || "").trim(),
      status: String(data.get("status") || "neu"),
      notes: String(data.get("notes") || "").trim(),
    };

    if (!payload.name) return;

    if (uiState.editingContactId) {
      const idx = state.contacts.findIndex((contact) => contact.id === uiState.editingContactId);
      if (idx >= 0) {
        const merged = { ...state.contacts[idx], ...payload };
        stampContact(merged, false);
        state.contacts[idx] = merged;
        logActivity("Kontakt", `Kontakt „${payload.name}“ wurde von ${actorLabel()} bearbeitet.`);
      }
    } else {
      const contact = { id: uid(), ...payload };
      stampContact(contact, true);
      state.contacts.unshift(contact);
      logActivity("Kontakt", `Kontakt „${payload.name}“ wurde von ${actorLabel()} angelegt.`);
    }

    await persistAndRerender();
    closeDialog(contactModal, form);
  }

  async function handlePhaseSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const probability = Math.max(0, Math.min(100, Number(data.get("probability") || 0)));

    if (!name) return;

    if (uiState.editingPhaseId) {
      const idx = state.phases.findIndex((phase) => phase.id === uiState.editingPhaseId);
      if (idx >= 0) {
        state.phases[idx] = { ...state.phases[idx], name, probability };
        logActivity("Phase", `Phase wurde von ${actorLabel()} in „${name}“ umbenannt.`);
      }
    } else {
      state.phases.push({ id: uid(), name, probability });
      logActivity("Phase", `Neue Phase „${name}“ von ${actorLabel()} angelegt.`);
    }

    await persistAndRerender();
    closeDialog(phaseModal, form);
  }

  function renderDealComments(dealId) {
    if (!dealCommentsList) return;
    dealCommentsList.innerHTML = "";
    const deal = state.deals.find((item) => item.id === dealId);
    if (!deal) return;
    const items = [...(deal.comments || [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    items.forEach((comment) => {
      const li = document.createElement("li");
      li.className = "deal-comment-item";
      const head = document.createElement("div");
      head.className = "deal-comment-head";
      head.textContent = `${comment.authorName || "Nutzer"} · ${formatDateTime(comment.createdAt)}`;
      const text = document.createElement("p");
      text.className = "deal-comment-text";
      text.textContent = comment.text || "";
      li.append(head, text);
      dealCommentsList.appendChild(li);
    });
  }

  async function addDealCommentFromForm() {
    const dealId = uiState.editingDealId;
    if (!dealId) {
      alert("Bitte Deal zuerst speichern, bevor Kommentare hinzugefügt werden.");
      return;
    }
    const text = (dealNewComment?.value || "").trim();
    if (!text) {
      alert("Bitte Kommentar eingeben.");
      return;
    }
    const deal = state.deals.find((item) => item.id === dealId);
    if (!deal) return;
    if (!Array.isArray(deal.comments)) deal.comments = [];
    deal.comments.push({
      id: uid(),
      authorId: currentUser?.id ?? null,
      authorName: actorLabel(),
      text,
      createdAt: new Date().toISOString(),
    });
    stampDeal(deal, false);
    dealNewComment.value = "";
    logActivity("Kommentar", `${actorLabel()} hat einen Kommentar bei „${deal.name}“ hinterlassen.`);
    renderDealComments(dealId);
    await persistAndRerender();
  }

  function openDealModal(dealId = null) {
    uiState.editingDealId = dealId;
    renderFilters();
    dealForm.reset();
    dealModalTitle.textContent = dealId ? "Deal bearbeiten" : "Deal anlegen";

    if (dealCommentsPanel) {
      if (dealId) {
        dealCommentsPanel.classList.remove("hidden");
        if (dealNewComment) dealNewComment.value = "";
        renderDealComments(dealId);
      } else {
        dealCommentsPanel.classList.add("hidden");
        if (dealCommentsList) dealCommentsList.innerHTML = "";
        if (dealNewComment) dealNewComment.value = "";
      }
    }

    if (dealId) {
      const deal = state.deals.find((item) => item.id === dealId);
      if (deal) {
        setFormValue(dealForm, "name", deal.name);
        setFormValue(dealForm, "company", deal.company);
        setFormValue(dealForm, "value", deal.value || 0);
        setFormValue(dealForm, "phaseId", deal.phaseId);
        setFormValue(dealForm, "owner", deal.owner);
        setFormValue(dealForm, "priority", deal.priority || "mittel");
        setFormValue(dealForm, "contactId", deal.contactId || "");
        setFormValue(dealForm, "nextStep", deal.nextStep);
        setFormValue(dealForm, "dueDate", deal.dueDate || "");
        setFormValue(dealForm, "probability", Number.isFinite(deal.probability) ? deal.probability : "");
        setFormValue(dealForm, "tags", (deal.tags || []).join(", "));
        setFormValue(dealForm, "notes", deal.notes || "");
      }
    } else {
      setFormValue(dealForm, "phaseId", state.phases[0]?.id || "");
      setFormValue(dealForm, "priority", "mittel");
    }

    openDialog(dealModal);
  }

  function openContactModal(contactId = null) {
    uiState.editingContactId = contactId;
    contactForm.reset();
    contactModalTitle.textContent = contactId ? "Kontakt bearbeiten" : "Kontakt anlegen";

    if (contactId) {
      const contact = state.contacts.find((item) => item.id === contactId);
      if (contact) {
        setFormValue(contactForm, "name", contact.name);
        setFormValue(contactForm, "company", contact.company || "");
        setFormValue(contactForm, "email", contact.email || "");
        setFormValue(contactForm, "phone", contact.phone || "");
        setFormValue(contactForm, "source", contact.source || "");
        setFormValue(contactForm, "status", contact.status || "neu");
        setFormValue(contactForm, "notes", contact.notes || "");
      }
    }

    openDialog(contactModal);
  }

  function openPhaseModal(phaseId = null) {
    uiState.editingPhaseId = phaseId;
    phaseForm.reset();
    phaseModalTitle.textContent = phaseId ? "Phase bearbeiten" : "Phase anlegen";

    if (phaseId) {
      const phase = state.phases.find((item) => item.id === phaseId);
      if (phase) {
        setFormValue(phaseForm, "name", phase.name);
        setFormValue(phaseForm, "probability", phase.probability || 0);
      }
    } else {
      setFormValue(phaseForm, "probability", 20);
    }

    openDialog(phaseModal);
  }

  async function openUsersModal() {
    if (!usersModal) return;
    resetUserAdminForm();
    await refreshUsersTable();
    openDialog(usersModal);
  }

  function resetUserAdminForm() {
    if (!userAdminForm) return;
    userAdminForm.reset();
    userEditId.value = "";
    userFormTitle.textContent = "Neuen Nutzer anlegen";
    if (userFormSubmit) userFormSubmit.textContent = "Nutzer anlegen";
    userPasswordHint.textContent = "Pflicht bei neuen Nutzern. Beim Bearbeiten leer lassen, um das Passwort beizubehalten.";
    userFormActive.checked = true;
  }

  async function refreshUsersTable() {
    if (!usersTableBody) return;
    usersTableBody.innerHTML = "";
    try {
      const data = await apiFetch("users", { method: "GET" });
      data.users.forEach((user) => {
        const tr = document.createElement("tr");
        tr.append(
          td(user.displayName),
          td(user.email),
          td(userRoleLabel(user.role)),
          td(user.active ? "Aktiv" : "Inaktiv")
        );
        const actions = document.createElement("td");
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "link-btn";
        editBtn.textContent = "Bearbeiten";
        editBtn.addEventListener("click", () => populateUserForm(user));
        actions.append(editBtn);
        tr.append(actions);
        usersTableBody.append(tr);
      });
    } catch (error) {
      console.error(error);
      const tr = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 5;
      cell.textContent = `Nutzerliste konnte nicht geladen werden: ${error.message}`;
      tr.append(cell);
      usersTableBody.append(tr);
    }
  }

  function populateUserForm(user) {
    userFormTitle.textContent = `Nutzer bearbeiten: ${user.displayName}`;
    if (userFormSubmit) userFormSubmit.textContent = "Änderungen speichern";
    userEditId.value = String(user.id);
    userFormEmail.value = user.email;
    userFormName.value = user.displayName;
    userFormRole.value = user.role;
    userFormActive.checked = user.active;
    userFormPassword.value = "";
    userPasswordHint.textContent = "Nur ausfüllen, wenn ein neues Passwort gesetzt werden soll.";
  }

  async function handleUserAdminSubmit(event) {
    event.preventDefault();
    if (!userAdminForm) return;
    const formData = new FormData(userAdminForm);
    const editingId = String(formData.get("userId") || "").trim();
    const payloadBase = {
      email: String(formData.get("email") || "").trim(),
      displayName: String(formData.get("displayName") || "").trim(),
      role: String(formData.get("role") || "user"),
      active: userFormActive.checked,
      password: String(formData.get("password") || ""),
    };

    try {
      if (!editingId && payloadBase.password.length < 8) {
        alert("Bitte ein Passwort mit mindestens 8 Zeichen für den neuen Nutzer vergeben.");
        return;
      }
      if (!editingId) {
        await apiFetch("users_create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadBase),
        });
        alert(`Nutzer ${payloadBase.email} wurde angelegt.`);
      } else {
        const body = {
          id: Number(editingId),
          email: payloadBase.email,
          displayName: payloadBase.displayName,
          role: payloadBase.role,
          active: payloadBase.active,
        };
        if (payloadBase.password) {
          body.password = payloadBase.password;
        }
        await apiFetch("users_update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        alert("Nutzer wurde aktualisiert.");
      }
      resetUserAdminForm();
      await refreshUsersTable();
    } catch (error) {
      alert(error.message);
    }
  }

  async function deleteDeal(dealId) {
    const deal = state.deals.find((item) => item.id === dealId);
    if (!deal) return;
    if (!window.confirm(`Deal „${deal.name}“ wirklich löschen?`)) return;
    state.deals = state.deals.filter((item) => item.id !== dealId);
    logActivity("Deal", `Deal „${deal.name}“ wurde von ${actorLabel()} gelöscht.`);
    await persistAndRerender();
  }

  async function deleteContact(contactId) {
    const contact = state.contacts.find((item) => item.id === contactId);
    if (!contact) return;
    if (!window.confirm(`Kontakt „${contact.name}“ wirklich löschen?`)) return;
    state.contacts = state.contacts.filter((item) => item.id !== contactId);
    state.deals = state.deals.map((deal) => (deal.contactId === contactId ? { ...deal, contactId: "" } : deal));
    logActivity("Kontakt", `Kontakt „${contact.name}“ wurde von ${actorLabel()} gelöscht.`);
    await persistAndRerender();
  }

  async function removePhase(phaseId) {
    if (state.phases.length <= 1) {
      alert("Mindestens eine Phase muss bestehen bleiben.");
      return;
    }
    const phase = state.phases.find((item) => item.id === phaseId);
    if (!phase) return;
    const targetPhase = state.phases.find((item) => item.id !== phaseId);
    if (!window.confirm(`Phase „${phase.name}“ löschen und Deals in „${targetPhase.name}“ verschieben?`)) return;

    state.deals = state.deals.map((deal) => (deal.phaseId === phaseId ? { ...deal, phaseId: targetPhase.id } : deal));
    state.phases = state.phases.filter((item) => item.id !== phaseId);
    logActivity("Phase", `Phase „${phase.name}“ wurde von ${actorLabel()} gelöscht.`);
    await persistAndRerender();
  }

  async function movePhase(phaseId, targetIndex) {
    const fromIndex = state.phases.findIndex((phase) => phase.id === phaseId);
    if (fromIndex < 0) return;
    if (targetIndex < 0 || targetIndex >= state.phases.length) return;
    const [moved] = state.phases.splice(fromIndex, 1);
    state.phases.splice(targetIndex, 0, moved);
    logActivity("Phase", `Phase „${moved.name}“ wurde von ${actorLabel()} neu sortiert.`);
    await persistAndRerender();
  }

  function bindDropzone(dropzone) {
    dropzone.addEventListener("dragover", (event) => {
      event.preventDefault();
      dropzone.classList.add("drag-over");
    });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
    dropzone.addEventListener("drop", async (event) => {
      event.preventDefault();
      dropzone.classList.remove("drag-over");
      const dealId = event.dataTransfer.getData("text/plain");
      if (!dealId) return;
      const deal = state.deals.find((item) => item.id === dealId);
      const phaseId = dropzone.dataset.phaseId;
      if (!deal || !phaseId || deal.phaseId === phaseId) return;
      deal.phaseId = phaseId;
      stampDeal(deal, false);
      const phase = state.phases.find((item) => item.id === phaseId);
      logActivity("Deal", `Deal „${deal.name}“ wurde von ${actorLabel()} nach „${phase?.name || "Phase"}“ verschoben.`);
      await persistAndRerender();
    });
  }

  function resetFilters() {
    searchInput.value = "";
    phaseFilter.value = "";
    ownerFilter.value = "";
    if (priorityFilter) {
      priorityFilter.value = "";
    }
    renderBoard();
  }

  function exportJson() {
    const content = JSON.stringify(state, null, 2);
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `adlions-crm-backup-${date}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function importJson(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      (async () => {
        try {
          const payload = JSON.parse(String(reader.result));
          if (!Array.isArray(payload.phases) || !payload.phases.length) throw new Error("phases");
          if (!Array.isArray(payload.deals)) throw new Error("deals");
          if (!Array.isArray(payload.contacts)) throw new Error("contacts");

          state = {
            phases: payload.phases,
            deals: payload.deals,
            contacts: payload.contacts,
            customers: Array.isArray(payload.customers) ? payload.customers : [],
            projects: Array.isArray(payload.projects) ? payload.projects : [],
            activities: Array.isArray(payload.activities) ? payload.activities : [],
          };
          state = normalizeState(state);
          logActivity("System", `CRM-Daten aus „${file.name}“ von ${actorLabel()} importiert.`);
          await persistAndRerender();
        } catch (error) {
          console.error(error);
          alert("Import fehlgeschlagen: Bitte gültige CRM-JSON-Datei wählen.");
        } finally {
          event.target.value = "";
        }
      })();
    };
    reader.readAsText(file);
  }

  function ensureDealsUseExistingPhases() {
    const phaseIds = new Set(state.phases.map((phase) => phase.id));
    const fallback = state.phases[0]?.id || "";
    state.deals = state.deals.map((deal) => (phaseIds.has(deal.phaseId) ? deal : { ...deal, phaseId: fallback }));
  }

  function seedDemoData() {
    const lead = state.phases.find((phase) => phaseNameKey(phase.name) === "lead");
    const qualifiziert = state.phases.find((phase) => phaseNameKey(phase.name) === "qualifiziert");
    const gewonnen = state.phases.find((phase) => phaseNameKey(phase.name) === "gewonnen");
    if (!lead || !qualifiziert || !gewonnen) {
      return;
    }
    const contactA = {
      id: uid(),
      name: "Svenja Albrecht",
      company: "Albrecht Dachtechnik",
      email: "svenja@albrecht-dach.de",
      phone: "+49 171 909090",
      source: "Website",
      status: "qualifiziert",
      notes: "Interesse an Mitarbeitergewinnungskampagne.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdByName: actorLabel(),
      updatedByName: actorLabel(),
    };
    const contactB = {
      id: uid(),
      name: "Nico Berger",
      company: "Berger Heizung GmbH",
      email: "nico@berger-heizung.de",
      phone: "+49 171 404040",
      source: "Empfehlung",
      status: "angebot",
      notes: "Braucht volle Vertriebsstruktur inkl. Follow-up.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdByName: actorLabel(),
      updatedByName: actorLabel(),
    };
    state.contacts.push(contactA, contactB);

    const demoAuthor = actorLabel();
    const now = new Date().toISOString();

    state.deals.push(
      {
        id: uid(),
        name: "Pilotprojekt Ads Q2",
        company: "Albrecht Dachtechnik",
        value: 8200,
        phaseId: lead.id,
        owner: "Alex",
        priority: "hoch",
        contactId: contactA.id,
        nextStep: "Kennenlerncall durchführen",
        dueDate: inDays(2),
        probability: 20,
        tags: ["Lead", "Neukunden"],
        notes: "Empfänglich für Performance-Reporting.",
        createdAt: now,
        updatedAt: now,
        createdByName: demoAuthor,
        updatedByName: demoAuthor,
        comments: [
          {
            id: uid(),
            authorName: demoAuthor,
            text: "Lead kam über Website-Formular, Rückruf für Dienstag vormittags geplant.",
            createdAt: now,
          },
        ],
      },
      {
        id: uid(),
        name: "Retainer Recruiting",
        company: "Berger Heizung GmbH",
        value: 14500,
        phaseId: qualifiziert.id,
        owner: "Mira",
        priority: "mittel",
        contactId: contactB.id,
        nextStep: "Angebot final abstimmen",
        dueDate: inDays(4),
        probability: 70,
        tags: ["Recruiting", "Retainer"],
        notes: "Vergleich mit Agenturangebot liegt vor.",
        createdAt: now,
        updatedAt: now,
        createdByName: demoAuthor,
        updatedByName: demoAuthor,
        comments: [],
      },
      {
        id: uid(),
        name: "Cross-Sell Funnel",
        company: "Wolff Elektrotechnik",
        value: 11600,
        phaseId: qualifiziert.id,
        owner: "Alex",
        priority: "hoch",
        contactId: "",
        nextStep: "Freigabe vom Geschäftsführer einholen",
        dueDate: inDays(3),
        probability: 85,
        tags: ["Upsell", "Funnel"],
        notes: "Potenzial für weitere Standorte.",
        createdAt: now,
        updatedAt: now,
        createdByName: demoAuthor,
        updatedByName: demoAuthor,
        comments: [],
      },
      {
        id: uid(),
        name: "Website-Relaunch Paket",
        company: "Keller Bau",
        value: 6200,
        phaseId: gewonnen.id,
        owner: "Mira",
        priority: "niedrig",
        contactId: "",
        nextStep: "Kickoff-Termin",
        dueDate: inDays(7),
        probability: 100,
        tags: ["Gewonnen"],
        notes: "Projektstart nächsten Monat.",
        createdAt: now,
        updatedAt: now,
        createdByName: demoAuthor,
        updatedByName: demoAuthor,
        comments: [],
      },
      {
        id: uid(),
        name: "Branding Komplettpaket",
        company: "Meyer Fensterbau",
        value: 9200,
        phaseId: qualifiziert.id,
        owner: "Team",
        priority: "mittel",
        contactId: "",
        nextStep: "Bedarfsanalyse Fragebogen",
        dueDate: inDays(5),
        probability: 40,
        tags: ["Branding"],
        notes: "",
        createdAt: now,
        updatedAt: now,
        createdByName: demoAuthor,
        updatedByName: demoAuthor,
        comments: [],
      }
    );

    const customerA = {
      id: uid(),
      company: "Albrecht Dachtechnik",
      contactName: "Svenja Albrecht",
      email: "svenja@albrecht-dach.de",
      phone: "+49 171 909090",
      street: "Industriestr. 12",
      zip: "10115",
      city: "Berlin",
      status: "aktiv",
      notes: "Langjähriger Bestandskunde, Fokus Performance-Marketing.",
      createdAt: now,
      updatedAt: now,
      createdByName: demoAuthor,
      updatedByName: demoAuthor,
    };
    const customerB = {
      id: uid(),
      company: "Berger Heizung GmbH",
      contactName: "Nico Berger",
      email: "nico@berger-heizung.de",
      phone: "+49 171 404040",
      street: "Werkstraße 4",
      zip: "80331",
      city: "München",
      status: "aktiv",
      notes: "Recruiting und Employer Branding.",
      createdAt: now,
      updatedAt: now,
      createdByName: demoAuthor,
      updatedByName: demoAuthor,
    };
    state.customers.push(customerA, customerB);

    state.projects.push(
      {
        id: uid(),
        name: "Social Ads Kampagne Q2",
        customerId: customerA.id,
        startDate: new Date().toISOString().slice(0, 10),
        endDate: inDays(90),
        status: "aktiv",
        owner: "Alex",
        description: "Leadgenerierung für Dachdecker-Stellen über Meta & Google.",
        documentation:
          "Kickoff am 02.04. Zielgruppen-Workshop durchgeführt. Creatives in Freigabe beim Kunden. Wöchentliches Reporting freitags.",
        workItems: [
          { id: uid(), text: "Zielgruppen-Definition", done: true },
          { id: uid(), text: "Creative-Produktion", done: true },
          { id: uid(), text: "Kampagnen-Setup", done: false },
          { id: uid(), text: "A/B-Tests Landingpage", done: false },
          { id: uid(), text: "Monatsreporting", done: false },
        ],
        createdAt: now,
        updatedAt: now,
        createdByName: demoAuthor,
        updatedByName: demoAuthor,
      },
      {
        id: uid(),
        name: "Recruiting Funnel 2026",
        customerId: customerB.id,
        startDate: inDays(-14),
        endDate: inDays(120),
        status: "aktiv",
        owner: "Mira",
        description: "End-to-end Funnel für Gesellen- und Meister-Stellen.",
        documentation:
          "Angebotsfreigabe erhalten. Funnel-Struktur mit 4 Stufen. Integration mit HR-Tool geplant.",
        workItems: [
          { id: uid(), text: "Funnel-Konzeption", done: true },
          { id: uid(), text: "Stellenanzeigen", done: false },
          { id: uid(), text: "Bewerber-Nurturing", done: false },
        ],
        createdAt: now,
        updatedAt: now,
        createdByName: demoAuthor,
        updatedByName: demoAuthor,
      },
      {
        id: uid(),
        name: "Website Relaunch",
        customerId: "",
        startDate: inDays(30),
        endDate: inDays(150),
        status: "geplant",
        owner: "Team",
        description: "Neuer Webauftritt inkl. SEO-Basis.",
        documentation: "Wartet auf finale Freigabe des Sitemap-Konzepts.",
        workItems: [
          { id: uid(), text: "Sitemap & Wireframes", done: false },
          { id: uid(), text: "Design System", done: false },
          { id: uid(), text: "Entwicklung", done: false },
        ],
        createdAt: now,
        updatedAt: now,
        createdByName: demoAuthor,
        updatedByName: demoAuthor,
      }
    );

    logActivity("System", `Demo-Daten wurden von ${actorLabel()} erstellt.`);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn(error);
    }
  }

  function replaceSelectOptions(selectEl, options) {
    selectEl.innerHTML = "";
    options.forEach((option) => {
      const item = document.createElement("option");
      item.value = option.value;
      item.textContent = option.label;
      selectEl.append(item);
    });
  }

  function openDialog(dialog) {
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      alert("Dialoge werden in diesem Browser nicht unterstützt.");
    }
  }

  function closeDialog(dialog, form) {
    if (typeof dialog.close === "function") dialog.close();
    if (form) form.reset();
    uiState.editingDealId = null;
    uiState.editingContactId = null;
    uiState.editingCustomerId = null;
    uiState.editingProjectId = null;
    uiState.editingPhaseId = null;
    if (dealCommentsPanel) {
      dealCommentsPanel.classList.add("hidden");
    }
  }

  function setFormValue(form, name, value) {
    const field = form.elements.namedItem(name);
    if (!field) return;
    field.value = value;
  }

  function phaseActionButton(label, handler, text, extraClass = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.textContent = text;
    if (extraClass) button.classList.add(extraClass);
    button.addEventListener("click", handler);
    return button;
  }

  function td(text) {
    const item = document.createElement("td");
    item.textContent = text;
    return item;
  }

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `id-${Math.random().toString(36).slice(2, 11)}-${Date.now()}`;
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value || 0);
  }

  function formatDate(value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("de-DE").format(new Date(value));
  }

  function formatDateTime(value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  }

  function inDays(days) {
    const dt = new Date();
    dt.setDate(dt.getDate() + days);
    return dt.toISOString().slice(0, 10);
  }
})();
