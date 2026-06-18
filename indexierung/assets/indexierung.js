(() => {
  let csrfToken = "";
  const apiHref = new URL("api.php", window.location.href).href.split("?")[0];

  const els = {
    connection: document.getElementById("indexierungConnection"),
    domainsBody: document.getElementById("indexierungDomainsBody"),
    todayLog: document.getElementById("indexierungTodayLog"),
    quotaSent: document.getElementById("indexierungQuotaSent"),
    quotaLimit: document.getElementById("indexierungQuotaLimit"),
    quotaPending: document.getElementById("indexierungQuotaPending"),
    quotaVerified: document.getElementById("indexierungQuotaVerified"),
    dailyLimit: document.getElementById("indexierungDailyLimit"),
    toast: document.getElementById("indexierungToast"),
    domainModal: document.getElementById("indexierungDomainModal"),
    domainForm: document.getElementById("indexierungDomainForm"),
    domainId: document.getElementById("indexierungDomainId"),
    domainLabel: document.getElementById("indexierungDomainLabel"),
    domainHost: document.getElementById("indexierungDomainHost"),
    domainProperty: document.getElementById("indexierungDomainProperty"),
    domainActive: document.getElementById("indexierungDomainActive"),
    domainModalTitle: document.getElementById("indexierungDomainModalTitle"),
    sitemapModal: document.getElementById("indexierungSitemapModal"),
    sitemapForm: document.getElementById("indexierungSitemapForm"),
    sitemapDomainId: document.getElementById("indexierungSitemapDomainId"),
    sitemapDomainLabel: document.getElementById("indexierungSitemapDomainLabel"),
    sitemapFile: document.getElementById("indexierungSitemapFile"),
  };

  let statusData = null;
  let toastTimer = null;

  function showToast(message, isError = false) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.remove("hidden");
    els.toast.style.background = isError ? "#991b1b" : "#0f172a";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.add("hidden"), 4000);
  }

  async function api(action, options = {}) {
    const { method = "GET", body, ...rest } = options;
    const q = new URLSearchParams({ action });
    const init = { credentials: "same-origin", method, ...rest };
    init.headers = { ...(init.headers || {}), "X-CSRF-Token": csrfToken };
    if (body !== undefined && !(body instanceof FormData)) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    } else if (body instanceof FormData) {
      init.body = body;
    }
    const res = await fetch(`${apiHref}?${q}`, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `Fehler (${res.status})`);
    return data;
  }

  function esc(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function renderConnection(c) {
    if (!els.connection) return;
    const ok = c.configured && c.apiOk;
    els.connection.className = "indexierung-connection " + (ok ? "is-ok" : "is-error");
    const mode = c.authMode === "oauth" ? "OAuth" : c.authMode === "service_account" ? "Service Account" : "";
    if (!c.configured) {
      els.connection.innerHTML = `<strong>Nicht verbunden</strong><span>${esc(c.apiMessage || "OAuth Client eintragen und mit Google verbinden.")}</span>`;
    } else if (!c.apiOk) {
      els.connection.innerHTML = `<strong>Verbindungsfehler</strong><span>${esc(c.apiMessage)}</span>`;
    } else {
      els.connection.innerHTML = `<strong>API verbunden</strong><span>Modus: ${esc(mode)} · <code>${esc(c.clientEmail || "")}</code></span><span>${c.sitesAccessible} Property(s) erreichbar.</span>`;
    }
    const uriEl = document.getElementById("indexierungRedirectUri");
    if (uriEl && c.redirectUri) uriEl.textContent = c.redirectUri;
  }

  function renderAutoSchedule(data) {
    const s = data.autoSchedule || {};
    const enabled = document.getElementById("indexierungAutoEnabled");
    const hour = document.getElementById("indexierungAutoHour");
    const status = document.getElementById("indexierungAutoStatus");
    if (enabled) enabled.checked = !!s.enabled;
    if (hour && s.hour !== undefined) hour.value = String(s.hour);
    if (!status) return;
    const hh = String(s.hour ?? 8).padStart(2, "0");
    if (!s.enabled) {
      status.textContent = "Automatik ist aus. Nur manuell über „Heute senden“.";
      return;
    }
    if (s.ranNow) {
      status.textContent = `Gerade automatisch ausgeführt (geplant täglich ab ${hh}:00 Uhr).`;
      return;
    }
    if (s.lastRunDate) {
      status.textContent = `Heute bereits gelaufen (${s.lastRunDate}). Nächster Lauf morgen ab ${hh}:00 Uhr beim Seitenbesuch.`;
      return;
    }
    status.textContent = `Wartet auf heutigen Lauf — startet automatisch ab ${hh}:00 Uhr, wenn du diese Seite öffnest.`;
  }

  function renderQuota(data) {
    const q = data.quota || {};
    const s = data.stats || {};
    if (els.quotaSent) els.quotaSent.textContent = String(q.submittedToday ?? 0);
    if (els.quotaLimit) els.quotaLimit.textContent = String(q.dailyLimit ?? 10);
    if (els.quotaPending) els.quotaPending.textContent = String(s.pendingUrls ?? 0);
    if (els.quotaVerified) els.quotaVerified.textContent = String(s.verifiedDomainCount ?? 0);
    if (els.dailyLimit && data.settings) els.dailyLimit.value = String(data.settings.dailyLimit ?? 10);
  }

  function badge(d) {
    if (!d.active) return '<span class="indexierung-badge indexierung-badge--off">Inaktiv</span>';
    if (d.propertyVerified) return '<span class="indexierung-badge indexierung-badge--ok">Verknüpft</span>';
    return '<span class="indexierung-badge indexierung-badge--warn">Nicht verifiziert</span>';
  }

  function renderDomains(domains) {
    if (!els.domainsBody) return;
    if (!domains?.length) {
      els.domainsBody.innerHTML = '<tr><td colspan="7" class="muted">Noch keine Domains angelegt.</td></tr>';
      return;
    }
    els.domainsBody.innerHTML = domains.map((d) => {
      const sm = d.sitemapFilename ? `${esc(d.sitemapFilename)}<br><small>${esc(d.sitemapUploadedAt || "")}</small>` : '<span class="muted">—</span>';
      return `<tr>
        <td><strong>${esc(d.label)}</strong></td>
        <td>${esc(d.domain)}</td>
        <td><code>${esc(d.gscProperty)}</code></td>
        <td>${badge(d)}</td>
        <td><div class="indexierung-url-stats">${d.pendingCount} ausstehend<br>${d.submittedCount} eingereicht<br>${d.failedCount} fehlgeschlagen</div></td>
        <td>${sm}</td>
        <td><div class="indexierung-domain-actions">
          <button type="button" class="btn btn-secondary" data-action="verify" data-id="${d.id}">Prüfen</button>
          <button type="button" class="btn btn-secondary" data-action="sitemap" data-id="${d.id}" data-label="${esc(d.label)}">Sitemap</button>
          <button type="button" class="btn btn-ghost" data-action="edit" data-id="${d.id}">Bearbeiten</button>
          <button type="button" class="btn btn-ghost btn-danger-text" data-action="delete" data-id="${d.id}">Löschen</button>
        </div></td>
      </tr>`;
    }).join("");
  }

  function renderLog(entries) {
    if (!els.todayLog) return;
    if (!entries?.length) {
      els.todayLog.innerHTML = '<li class="muted">Noch keine Einträge heute.</li>';
      return;
    }
    els.todayLog.innerHTML = entries.map((e) => {
      const cls = e.success ? "indexierung-log-ok" : "indexierung-log-err";
      return `<li class="${cls}">${e.success ? "✓" : "✗"} <strong>${esc(e.domainLabel)}</strong> — ${esc(e.url)}<br><small>${esc(e.message)}</small></li>`;
    }).join("");
  }

  async function loadStatus() {
    const data = await api("status");
    statusData = data;
    renderConnection(data.connection || {});
    renderQuota(data);
    renderAutoSchedule(data);
    renderDomains(data.domains || []);
    renderLog(data.todayLog || []);
  }

  function openDomainModal(domain = null) {
    if (!els.domainModal) return;
    if (domain) {
      els.domainModalTitle.textContent = "Domain bearbeiten";
      els.domainId.value = String(domain.id);
      els.domainLabel.value = domain.label || "";
      els.domainHost.value = domain.domain || "";
      els.domainProperty.value = domain.gscProperty || "";
      els.domainActive.checked = !!domain.active;
    } else {
      els.domainModalTitle.textContent = "Domain hinzufügen";
      els.domainId.value = "";
      els.domainForm.reset();
      els.domainActive.checked = true;
    }
    els.domainModal.showModal();
  }

  document.getElementById("indexierungAddDomain")?.addEventListener("click", () => openDomainModal());
  document.getElementById("indexierungDomainCancel")?.addEventListener("click", () => els.domainModal?.close());
  document.getElementById("indexierungSitemapCancel")?.addEventListener("click", () => els.sitemapModal?.close());
  document.getElementById("indexierungRefresh")?.addEventListener("click", () => loadStatus().catch((e) => showToast(e.message, true)));

  els.domainForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = els.domainId.value ? parseInt(els.domainId.value, 10) : null;
    try {
      await api("domain_save", {
        method: "POST",
        body: {
          id,
          label: els.domainLabel.value.trim(),
          domain: els.domainHost.value.trim(),
          gscProperty: els.domainProperty.value.trim(),
          active: els.domainActive.checked,
        },
      });
      els.domainModal.close();
      showToast("Domain gespeichert.");
      await loadStatus();
    } catch (err) {
      showToast(err.message, true);
    }
  });

  els.domainsBody?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const id = parseInt(btn.dataset.id, 10);
    const action = btn.dataset.action;
    if (!id) return;
    if (action === "edit") {
      const d = (statusData?.domains || []).find((x) => x.id === id);
      if (d) openDomainModal(d);
      return;
    }
    if (action === "delete") {
      if (!confirm("Domain und alle URLs wirklich löschen?")) return;
      try {
        await api("domain_delete", { method: "POST", body: { id } });
        showToast("Domain gelöscht.");
        await loadStatus();
      } catch (err) {
        showToast(err.message, true);
      }
      return;
    }
    if (action === "verify") {
      try {
        const res = await api("domain_verify", { method: "POST", body: { id } });
        showToast(res.verification?.message || "Prüfung abgeschlossen.", !res.verification?.verified);
        await loadStatus();
      } catch (err) {
        showToast(err.message, true);
      }
      return;
    }
    if (action === "sitemap") {
      els.sitemapDomainId.value = String(id);
      els.sitemapDomainLabel.textContent = btn.dataset.label || "";
      els.sitemapFile.value = "";
      els.sitemapModal.showModal();
    }
  });

  els.sitemapForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = els.sitemapFile.files?.[0];
    if (!file) return showToast("Bitte Sitemap wählen.", true);
    const form = new FormData();
    form.append("domainId", els.sitemapDomainId.value);
    form.append("sitemap", file);
    try {
      const res = await api("sitemap_upload", { method: "POST", body: form });
      showToast(`${res.import?.added ?? 0} neue URL(s), ${res.import?.skipped ?? 0} bereits bekannt.`);
      els.sitemapModal.close();
      await loadStatus();
    } catch (err) {
      showToast(err.message, true);
    }
  });

  document.getElementById("indexierungOAuthConfigForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("oauth_config", {
        method: "POST",
        body: {
          clientId: document.getElementById("indexierungOAuthClientId")?.value?.trim() || "",
          clientSecret: document.getElementById("indexierungOAuthClientSecret")?.value?.trim() || "",
        },
      });
      showToast("OAuth-Client gespeichert.");
      await loadStatus();
    } catch (err) {
      showToast(err.message, true);
    }
  });

  document.getElementById("indexierungOAuthConnect")?.addEventListener("click", async () => {
    try {
      const res = await api("oauth_url");
      if (res.url) window.location.href = res.url;
    } catch (err) {
      showToast(err.message, true);
    }
  });

  document.getElementById("indexierungOAuthDisconnect")?.addEventListener("click", async () => {
    if (!confirm("Google-Verbindung wirklich trennen?")) return;
    try {
      await api("oauth_disconnect", { method: "POST", body: {} });
      showToast("Verbindung getrennt.");
      await loadStatus();
    } catch (err) {
      showToast(err.message, true);
    }
  });

  document.getElementById("indexierungSaveCredentials")?.addEventListener("click", async () => {
    const json = document.getElementById("indexierungCredentialsJson")?.value?.trim();
    if (!json) return showToast("JSON fehlt.", true);
    try {
      const res = await api("credentials", { method: "POST", body: { serviceAccountJson: json } });
      showToast(`API gespeichert (${res.clientEmail || "OK"}).`);
      await loadStatus();
    } catch (err) {
      showToast(err.message, true);
    }
  });

  document.getElementById("indexierungLimitForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("settings_save", { method: "POST", body: { dailyLimit: parseInt(els.dailyLimit.value, 10) || 10 } });
      showToast("Tageslimit gespeichert.");
      await loadStatus();
    } catch (err) {
      showToast(err.message, true);
    }
  });

  document.getElementById("indexierungAutoForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("auto_schedule_save", {
        method: "POST",
        body: {
          enabled: !!document.getElementById("indexierungAutoEnabled")?.checked,
          hour: parseInt(document.getElementById("indexierungAutoHour")?.value || "8", 10),
        },
      });
      showToast("Automatik gespeichert.");
      await loadStatus();
    } catch (err) {
      showToast(err.message, true);
    }
  });

  async function loadCronInfo() {
    const input = document.getElementById("indexierungCronUrl");
    if (!input) return;
    try {
      const res = await api("cron_info");
      input.value = res.cronUrl || "";
    } catch (err) {
      input.value = "";
      showToast(err.message, true);
    }
  }

  document.getElementById("indexierungCronCopy")?.addEventListener("click", async () => {
    const input = document.getElementById("indexierungCronUrl");
    const url = input?.value?.trim();
    if (!url) return showToast("Cron-URL noch nicht geladen.", true);
    try {
      await navigator.clipboard.writeText(url);
      showToast("Cron-URL kopiert.");
    } catch {
      input.select();
      document.execCommand("copy");
      showToast("Cron-URL kopiert.");
    }
  });

  document.getElementById("indexierungRunBatch")?.addEventListener("click", async () => {
    const btn = document.getElementById("indexierungRunBatch");
    if (btn) btn.disabled = true;
    try {
      const res = await api("run_batch", { method: "POST", body: {} });
      showToast(res.batch?.message || "Batch ausgeführt.");
      await loadStatus();
    } catch (err) {
      showToast(err.message, true);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  const params = new URLSearchParams(window.location.search);
  if (params.get("oauth") === "ok") {
    showToast("Google erfolgreich verbunden.");
    window.history.replaceState({}, "", window.location.pathname);
  } else if (params.get("oauth") === "error") {
    showToast(decodeURIComponent(params.get("msg") || "OAuth fehlgeschlagen."), true);
    window.history.replaceState({}, "", window.location.pathname);
  }

  api("csrf").then((d) => {
    csrfToken = d.csrfToken || "";
    return Promise.all([loadStatus(), loadCronInfo()]);
  }).catch((e) => showToast(e.message, true));
})();
