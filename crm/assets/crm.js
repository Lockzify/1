(() => {
  const STORAGE_KEY = "adlions_crm_v1";
  const MAX_ACTIVITY_ENTRIES = 220;

  const boardEl = document.getElementById("pipelineBoard");
  const contactTableBody = document.getElementById("contactTableBody");
  const activityFeed = document.getElementById("activityFeed");
  const dealTemplate = document.getElementById("dealCardTemplate");

  const searchInput = document.getElementById("searchInput");
  const phaseFilter = document.getElementById("phaseFilter");
  const ownerFilter = document.getElementById("ownerFilter");
  const priorityFilter = document.getElementById("priorityFilter");
  const contactSearchInput = document.getElementById("contactSearchInput");

  const dealModal = document.getElementById("dealModal");
  const contactModal = document.getElementById("contactModal");
  const phaseModal = document.getElementById("phaseModal");
  const dealForm = document.getElementById("dealForm");
  const contactForm = document.getElementById("contactForm");
  const phaseForm = document.getElementById("phaseForm");

  const dealPhaseSelect = document.getElementById("dealPhaseSelect");
  const dealContactSelect = document.getElementById("dealContactSelect");

  const dealModalTitle = document.getElementById("dealModalTitle");
  const contactModalTitle = document.getElementById("contactModalTitle");
  const phaseModalTitle = document.getElementById("phaseModalTitle");

  const statDealsOpen = document.getElementById("statDealsOpen");
  const statPipelineValue = document.getElementById("statPipelineValue");
  const statForecastValue = document.getElementById("statForecastValue");
  const statContactCount = document.getElementById("statContactCount");
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

  let state = loadState();
  if (!state.deals.length && !state.contacts.length) {
    seedDemoData();
  }

  bindEvents();
  renderApp();

  function bindEvents() {
    document.getElementById("openDealModal").addEventListener("click", () => openDealModal());
    document.getElementById("openContactModal").addEventListener("click", () => openContactModal());
    document.getElementById("openPhaseModal").addEventListener("click", () => openPhaseModal());
    document.getElementById("resetFilters").addEventListener("click", resetFilters);
    document.getElementById("exportJson").addEventListener("click", exportJson);
    document.getElementById("importJson").addEventListener("change", importJson);

    searchInput.addEventListener("input", renderBoard);
    phaseFilter.addEventListener("change", renderBoard);
    ownerFilter.addEventListener("change", renderBoard);
    priorityFilter.addEventListener("change", renderBoard);
    contactSearchInput.addEventListener("input", renderContacts);

    dealForm.addEventListener("submit", handleDealSubmit);
    contactForm.addEventListener("submit", handleContactSubmit);
    phaseForm.addEventListener("submit", handlePhaseSubmit);
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(baseState);
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.phases) || !parsed.phases.length) return structuredClone(baseState);
      return {
        phases: parsed.phases,
        contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
        deals: Array.isArray(parsed.deals) ? parsed.deals : [],
        activities: Array.isArray(parsed.activities) ? parsed.activities : [],
      };
    } catch (error) {
      console.error(error);
      return structuredClone(baseState);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function renderApp() {
    ensureDealsUseExistingPhases();
    renderFilters();
    renderBoard();
    renderContacts();
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
        phaseActionButton("Umbenennen", () => openPhaseModal(phase.id), "✎"),
        phaseActionButton("Nach links", () => movePhase(phase.id, phaseIndex - 1), "←"),
        phaseActionButton("Nach rechts", () => movePhase(phase.id, phaseIndex + 1), "→"),
        phaseActionButton("Löschen", () => removePhase(phase.id), "🗑")
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

  function renderContacts() {
    const needle = contactSearchInput.value.trim().toLowerCase();
    contactTableBody.innerHTML = "";

    const rows = state.contacts.filter((contact) => {
      if (!needle) return true;
      const haystack = [contact.name, contact.company, contact.email, contact.phone, contact.source, contact.status].join(" ").toLowerCase();
      return haystack.includes(needle);
    });

    rows.forEach((contact) => {
      const tr = document.createElement("tr");
      tr.append(
        td(contact.name),
        td(contact.company || "-"),
        td(contact.email || "-"),
        td(contact.phone || "-"),
        statusTd(contact.status || "neu")
      );

      const actions = document.createElement("td");
      const editBtn = document.createElement("button");
      editBtn.className = "link-btn";
      editBtn.textContent = "Bearbeiten";
      editBtn.addEventListener("click", () => openContactModal(contact.id));
      const delBtn = document.createElement("button");
      delBtn.className = "link-btn danger";
      delBtn.textContent = "Löschen";
      delBtn.addEventListener("click", () => deleteContact(contact.id));

      actions.append(editBtn, document.createTextNode(" "), delBtn);
      tr.append(actions);
      contactTableBody.append(tr);
    });

    if (!rows.length) {
      const tr = document.createElement("tr");
      const noData = document.createElement("td");
      noData.colSpan = 6;
      noData.textContent = "Keine Kontakte gefunden.";
      tr.append(noData);
      contactTableBody.append(tr);
    }
  }

  function renderActivities() {
    activityFeed.innerHTML = "";
    state.activities.slice(0, 30).forEach((activity) => {
      const li = document.createElement("li");
      const time = document.createElement("span");
      time.className = "activity-time";
      time.textContent = `${formatDateTime(activity.timestamp)} · ${activity.type}`;
      li.append(time, document.createTextNode(activity.message));
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
    statContactCount.textContent = `${state.contacts.length}`;
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

  function handleDealSubmit(event) {
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
      updatedAt: new Date().toISOString(),
    };

    if (!payload.name) return;
    if (!payload.phaseId) payload.phaseId = state.phases[0]?.id || "";
    if (!payload.owner) payload.owner = "Team";

    if (uiState.editingDealId) {
      const idx = state.deals.findIndex((deal) => deal.id === uiState.editingDealId);
      if (idx >= 0) {
        state.deals[idx] = { ...state.deals[idx], ...payload };
        logActivity("Deal", `Deal "${payload.name}" wurde bearbeitet.`);
      }
    } else {
      state.deals.unshift({ id: uid(), createdAt: new Date().toISOString(), ...payload });
      logActivity("Deal", `Deal "${payload.name}" wurde angelegt.`);
    }

    persistAndRerender();
    closeDialog(dealModal, form);
  }

  function handleContactSubmit(event) {
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
      updatedAt: new Date().toISOString(),
    };

    if (!payload.name) return;

    if (uiState.editingContactId) {
      const idx = state.contacts.findIndex((contact) => contact.id === uiState.editingContactId);
      if (idx >= 0) {
        state.contacts[idx] = { ...state.contacts[idx], ...payload };
        logActivity("Kontakt", `Kontakt "${payload.name}" wurde bearbeitet.`);
      }
    } else {
      state.contacts.unshift({ id: uid(), createdAt: new Date().toISOString(), ...payload });
      logActivity("Kontakt", `Kontakt "${payload.name}" wurde angelegt.`);
    }

    persistAndRerender();
    closeDialog(contactModal, form);
  }

  function handlePhaseSubmit(event) {
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
        logActivity("Phase", `Phase in "${name}" umbenannt.`);
      }
    } else {
      state.phases.push({ id: uid(), name, probability });
      logActivity("Phase", `Neue Phase "${name}" angelegt.`);
    }

    persistAndRerender();
    closeDialog(phaseModal, form);
  }

  function openDealModal(dealId = null) {
    uiState.editingDealId = dealId;
    renderFilters();
    dealForm.reset();
    dealModalTitle.textContent = dealId ? "Deal bearbeiten" : "Deal anlegen";

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

  function deleteDeal(dealId) {
    const deal = state.deals.find((item) => item.id === dealId);
    if (!deal) return;
    if (!window.confirm(`Deal "${deal.name}" wirklich löschen?`)) return;
    state.deals = state.deals.filter((item) => item.id !== dealId);
    logActivity("Deal", `Deal "${deal.name}" wurde gelöscht.`);
    persistAndRerender();
  }

  function deleteContact(contactId) {
    const contact = state.contacts.find((item) => item.id === contactId);
    if (!contact) return;
    if (!window.confirm(`Kontakt "${contact.name}" wirklich löschen?`)) return;
    state.contacts = state.contacts.filter((item) => item.id !== contactId);
    state.deals = state.deals.map((deal) => (deal.contactId === contactId ? { ...deal, contactId: "" } : deal));
    logActivity("Kontakt", `Kontakt "${contact.name}" wurde gelöscht.`);
    persistAndRerender();
  }

  function removePhase(phaseId) {
    if (state.phases.length <= 1) {
      alert("Mindestens eine Phase muss bestehen bleiben.");
      return;
    }
    const phase = state.phases.find((item) => item.id === phaseId);
    if (!phase) return;
    const targetPhase = state.phases.find((item) => item.id !== phaseId);
    if (!window.confirm(`Phase "${phase.name}" löschen und Deals in "${targetPhase.name}" verschieben?`)) return;

    state.deals = state.deals.map((deal) => (deal.phaseId === phaseId ? { ...deal, phaseId: targetPhase.id } : deal));
    state.phases = state.phases.filter((item) => item.id !== phaseId);
    logActivity("Phase", `Phase "${phase.name}" wurde gelöscht.`);
    persistAndRerender();
  }

  function movePhase(phaseId, targetIndex) {
    const fromIndex = state.phases.findIndex((phase) => phase.id === phaseId);
    if (fromIndex < 0) return;
    if (targetIndex < 0 || targetIndex >= state.phases.length) return;
    const [moved] = state.phases.splice(fromIndex, 1);
    state.phases.splice(targetIndex, 0, moved);
    logActivity("Phase", `Phase "${moved.name}" wurde neu sortiert.`);
    persistAndRerender();
  }

  function bindDropzone(dropzone) {
    dropzone.addEventListener("dragover", (event) => {
      event.preventDefault();
      dropzone.classList.add("drag-over");
    });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
    dropzone.addEventListener("drop", (event) => {
      event.preventDefault();
      dropzone.classList.remove("drag-over");
      const dealId = event.dataTransfer.getData("text/plain");
      if (!dealId) return;
      const deal = state.deals.find((item) => item.id === dealId);
      const phaseId = dropzone.dataset.phaseId;
      if (!deal || !phaseId || deal.phaseId === phaseId) return;
      deal.phaseId = phaseId;
      deal.updatedAt = new Date().toISOString();
      const phase = state.phases.find((item) => item.id === phaseId);
      logActivity("Deal", `Deal "${deal.name}" nach "${phase?.name || "Phase"}" verschoben.`);
      persistAndRerender();
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
        logActivity("System", `CRM-Daten aus "${file.name}" importiert.`);
        persistAndRerender();
      } catch (error) {
        console.error(error);
        alert("Import fehlgeschlagen: Bitte gültige CRM-JSON-Datei wählen.");
      } finally {
        event.target.value = "";
      }
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
    };
    state.contacts.push(contactA, contactB);

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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    );

    logActivity("System", "Demo-Daten wurden erstellt.");
    saveState();
  }

  function logActivity(type, message) {
    state.activities.unshift({
      id: uid(),
      type,
      message,
      timestamp: new Date().toISOString(),
    });
    state.activities = state.activities.slice(0, MAX_ACTIVITY_ENTRIES);
  }

  function persistAndRerender() {
    saveState();
    renderApp();
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
    form.reset();
    uiState.editingDealId = null;
    uiState.editingContactId = null;
    uiState.editingPhaseId = null;
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

  function statusTd(status) {
    const cell = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = "status-badge";
    badge.textContent = status;
    cell.append(badge);
    return cell;
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
