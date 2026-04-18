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
  const phaseModal = document.getElementById("phaseModal");
  const usersModal = document.getElementById("usersModal");
  const dealForm = document.getElementById("dealForm");
  const contactForm = document.getElementById("contactForm");
  const phaseForm = document.getElementById("phaseForm");
  const userAdminForm = document.getElementById("userAdminForm");

  const dealPhaseSelect = document.getElementById("dealPhaseSelect");
  const dealContactSelect = document.getElementById("dealContactSelect");

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
    editingPhaseId: null,
  };

  const baseState = {
    phases: [
      { id: uid(), name: "Lead", probability: 15 },
      { id: uid(), name: "Qualifiziert", probability: 35 },
      { id: uid(), name: "Angebot", probability: 65 },
      { id: uid(), name: "Verhandlung", probability: 80 },
      { id: uid(), name: "Gewonnen", probability: 100 },
      { id: uid(), name: "Verloren", probability: 0 },
    ],
    contacts: [],
    deals: [],
    activities: [],
  };

  let state = structuredClone(baseState);

  async function apiFetch(action, options = {}) {
    const url = `${apiPhpUrl}?action=${encodeURIComponent(action)}`;
    const init = { credentials: "same-origin", ...options };
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

  function normalizeState(raw) {
    if (!raw || typeof raw !== "object") {
      return structuredClone(baseState);
    }
    const phases = Array.isArray(raw.phases) && raw.phases.length ? raw.phases : structuredClone(baseState).phases;
    return {
      phases,
      contacts: Array.isArray(raw.contacts) ? raw.contacts : [],
      deals: Array.isArray(raw.deals)
        ? raw.deals.map((deal) => ({
            ...deal,
            comments: Array.isArray(deal.comments) ? deal.comments : [],
          }))
        : [],
      activities: Array.isArray(raw.activities) ? raw.activities : [],
    };
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
  const incomingCallDial = document.getElementById("incomingCallDial");
  const incomingCallDismiss = document.getElementById("incomingCallDismiss");

  const incomingCallQueue = [];
  let incomingCallDialogBusy = false;

  function pumpIncomingCallQueue() {
    if (incomingCallDialogBusy || incomingCallQueue.length === 0 || !incomingCallModal) {
      return;
    }
    incomingCallDialogBusy = true;
    const it = incomingCallQueue.shift();
    incomingCallModal.dataset.pendingIntentId = String(it.id);
    if (incomingCallNumber) {
      incomingCallNumber.textContent = it.phoneDisplay || "";
    }
    if (incomingCallDial) {
      incomingCallDial.href = it.phoneUri || "#";
      incomingCallDial.setAttribute("aria-label", `Nummer ${it.phoneDisplay} anrufen`);
    }
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("ADLIONS CRM – Anruf", {
          body: String(it.phoneDisplay || ""),
          tag: `crm-call-${it.id}`,
        });
      } catch (_) {
        /* ignore */
      }
    }
    if (typeof incomingCallModal.showModal === "function") {
      incomingCallModal.showModal();
    }
  }

  function enqueueIncomingCalls(intents) {
    if (!Array.isArray(intents) || intents.length === 0) {
      return;
    }
    incomingCallQueue.push(...intents);
    pumpIncomingCallQueue();
  }

  async function pollIncomingCalls() {
    if (!currentUser) {
      return;
    }
    try {
      const data = await apiFetch("call_intent_poll", { method: "GET" });
      if (data.intents && data.intents.length) {
        enqueueIncomingCalls(data.intents);
      }
    } catch (_) {
      /* offline / nicht angemeldet */
    }
  }

  function startCallIntentPoller() {
    if (!currentUser) {
      return;
    }
    void pollIncomingCalls();
    window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void pollIncomingCalls();
      }
    }, 3000);
    if (incomingCallModal) {
      incomingCallModal.addEventListener("close", () => {
        void (async () => {
          const raw = incomingCallModal.dataset.pendingIntentId;
          if (raw) {
            delete incomingCallModal.dataset.pendingIntentId;
            const id = Number.parseInt(raw, 10);
            if (id > 0) {
              try {
                await apiFetch("call_intent_ack", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id }),
                });
              } catch (_) {
                /* offline */
              }
            }
          }
          incomingCallDialogBusy = false;
          pumpIncomingCallQueue();
        })();
      });
    }
    if (incomingCallDismiss && incomingCallModal) {
      incomingCallDismiss.addEventListener("click", () => {
        if (typeof incomingCallModal.close === "function") {
          incomingCallModal.close();
        }
      });
    }
    if (incomingCallDial && incomingCallModal) {
      incomingCallDial.addEventListener("click", () => {
        window.setTimeout(() => {
          if (typeof incomingCallModal.close === "function") {
            incomingCallModal.close();
          }
        }, 400);
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

    document.getElementById("openDealModal").addEventListener("click", () => openDealModal());
    const openContactBtn = document.getElementById("openContactModal");
    if (openContactBtn) {
      openContactBtn.addEventListener("click", () => openContactModal());
    }
    document.getElementById("openPhaseModal").addEventListener("click", () => openPhaseModal());
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
    priorityFilter.addEventListener("change", renderBoard);
    dealForm.addEventListener("submit", handleDealSubmit);
    contactForm.addEventListener("submit", handleContactSubmit);
    phaseForm.addEventListener("submit", handlePhaseSubmit);
    if (dealAddCommentBtn) {
      dealAddCommentBtn.addEventListener("click", () => addDealCommentFromForm());
    }

    bindMainNav();
  }

  const VIEW_TITLES = {
    pipeline: "Pipeline",
    activity: "Aktivitätsfeed",
    leadlists: "Leads",
  };

  function setMainView(view) {
    const v = ["pipeline", "leadlists", "activity"].includes(view) ? view : "pipeline";
    const viewPipeline = document.getElementById("viewPipeline");
    const viewLeadLists = document.getElementById("viewLeadLists");
    const viewActivity = document.getElementById("viewActivity");
    const toolbarPipeline = document.getElementById("toolbarPipeline");
    const toolbarLeadLists = document.getElementById("toolbarLeadLists");
    const titleEl = document.getElementById("crmPageTitle");

    if (viewPipeline) viewPipeline.classList.toggle("hidden", v !== "pipeline");
    if (viewLeadLists) viewLeadLists.classList.toggle("hidden", v !== "leadlists");
    if (viewActivity) viewActivity.classList.toggle("hidden", v !== "activity");

    const isLeadLists = v === "leadlists";
    if (toolbarPipeline) toolbarPipeline.classList.toggle("hidden", isLeadLists);
    if (toolbarLeadLists) toolbarLeadLists.classList.toggle("hidden", !isLeadLists);

    document.querySelectorAll(".crm-nav-link").forEach((link) => {
      link.classList.toggle("is-active", link.getAttribute("data-crm-view") === v);
    });

    if (titleEl) {
      titleEl.textContent = VIEW_TITLES[v] || "ADLIONS CRM";
    }

    document.dispatchEvent(new CustomEvent("crm-main-view", { detail: { view: v } }));
  }

  function bindMainNav() {
    document.querySelectorAll("[data-crm-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setMainView(btn.getAttribute("data-crm-view") || "pipeline");
      });
    });
    setMainView("pipeline");
  }

  function renderApp() {
    ensureDealsUseExistingPhases();
    renderFilters();
    renderBoard();
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

    for (const [phaseIndex, phase] of state.phases.entries()) {
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
        phaseActionButton("Umbenennen", () => openPhaseModal(phase.id), "\u270E"),
        phaseActionButton("Nach links", () => movePhase(phase.id, phaseIndex - 1), "←"),
        phaseActionButton("Nach rechts", () => movePhase(phase.id, phaseIndex + 1), "→"),
        phaseActionButton("Löschen", () => removePhase(phase.id), "\uD83D\uDDD1")
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
    const priority = fragment.querySelector(".priority-pill");
    const company = fragment.querySelector(".deal-company");
    const meta = fragment.querySelector(".deal-meta");
    const nextStep = fragment.querySelector(".deal-next-step");
    const audit = fragment.querySelector(".deal-audit");
    const tagList = fragment.querySelector(".tag-list");

    title.textContent = deal.name;
    priority.textContent = deal.priority || "mittel";
    priority.classList.add(`priority-${deal.priority || "mittel"}`);
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
    fragment.querySelector('[data-action="delete"]').addEventListener("click", () => deleteDeal(deal.id));

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
    const wonIds = state.phases.filter((phase) => phase.name.toLowerCase().includes("gewonnen")).map((phase) => phase.id);
    const lostIds = state.phases.filter((phase) => phase.name.toLowerCase().includes("verloren")).map((phase) => phase.id);

    const openDeals = state.deals.filter((deal) => !wonIds.includes(deal.phaseId) && !lostIds.includes(deal.phaseId));
    const wonDeals = state.deals.filter((deal) => wonIds.includes(deal.phaseId));
    const lostDeals = state.deals.filter((deal) => lostIds.includes(deal.phaseId));

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

  function filteredDeals() {
    const text = searchInput.value.trim().toLowerCase();
    const phase = phaseFilter.value;
    const owner = ownerFilter.value;
    const priority = priorityFilter.value;

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
          td(user.role === "admin" ? "Admin" : "Nutzer"),
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
    priorityFilter.value = "";
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
    const [lead, qualifiziert, angebot, verhandlung, gewonnen] = state.phases;
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
        phaseId: angebot.id,
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
        phaseId: verhandlung.id,
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

  function phaseActionButton(label, handler, text) {
    const button = document.createElement("button");
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.textContent = text;
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
