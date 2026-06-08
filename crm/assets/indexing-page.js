(() => {
  const bootstrap = window.__INDEXING_BOOTSTRAP__ || {};
  let csrfToken = bootstrap.csrfToken || "";
  const isAdmin = !!bootstrap.isAdmin;
  const apiPhpHref = new URL("api.php", window.location.href).href.split("?")[0];

  const indexingConnection = document.getElementById("indexingConnection");
  const indexingDomainsBody = document.getElementById("indexingDomainsBody");
  const indexingTodayLog = document.getElementById("indexingTodayLog");
  const indexingQuotaSent = document.getElementById("indexingQuotaSent");
  const indexingQuotaLimit = document.getElementById("indexingQuotaLimit");
  const indexingQuotaPending = document.getElementById("indexingQuotaPending");
  const indexingQuotaVerified = document.getElementById("indexingQuotaVerified");
  const indexingDailyLimit = document.getElementById("indexingDailyLimit");
  const indexingToast = document.getElementById("indexingToast");

  const indexingDomainModal = document.getElementById("indexingDomainModal");
  const indexingDomainForm = document.getElementById("indexingDomainForm");
  const indexingDomainId = document.getElementById("indexingDomainId");
  const indexingDomainLabel = document.getElementById("indexingDomainLabel");
  const indexingDomainHost = document.getElementById("indexingDomainHost");
  const indexingDomainProperty = document.getElementById("indexingDomainProperty");
  const indexingDomainActive = document.getElementById("indexingDomainActive");
  const indexingDomainModalTitle = document.getElementById("indexingDomainModalTitle");

  const indexingSitemapModal = document.getElementById("indexingSitemapModal");
  const indexingSitemapForm = document.getElementById("indexingSitemapForm");
  const indexingSitemapDomainId = document.getElementById("indexingSitemapDomainId");
  const indexingSitemapDomainLabel = document.getElementById("indexingSitemapDomainLabel");
  const indexingSitemapFile = document.getElementById("indexingSitemapFile");

  let statusData = null;
  let toastTimer = null;

  function showToast(message, isError = false) {
    if (!indexingToast) return;
    indexingToast.textContent = message;
    indexingToast.classList.remove("hidden");
    indexingToast.style.background = isError ? "#991b1b" : "#0f172a";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => indexingToast.classList.add("hidden"), 4000);
  }

  async function api(action, options = {}) {
    const { method = "GET", body, query, headers, ...rest } = options;
    const q = new URLSearchParams();
    q.set("action", action);
    if (query) {
      Object.entries(query).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
      });
    }
    const url = `${apiPhpHref}?${q.toString()}`;
    const init = { credentials: "same-origin", method, ...rest };
    init.headers = { ...(headers || {}), "X-CSRF-Token": csrfToken };
    if (body !== undefined && !(body instanceof FormData)) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    } else if (body instanceof FormData) {
      init.body = body;
    }
    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `Anfrage fehlgeschlagen (${res.status})`);
    }
    return data;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderConnection(connection) {
    if (!indexingConnection) return;
    const ok = connection.configured && connection.apiOk;
    indexingConnection.className = "indexing-connection " + (ok ? "is-ok" : "is-error");
    let html = "";
    if (!connection.configured) {
      html = "<strong>API nicht konfiguriert</strong><span>Bitte Service-Account JSON hinterlegen.</span>";
    } else if (!connection.apiOk) {
      html = `<strong>API-Fehler</strong><span>${escapeHtml(connection.apiMessage)}</span>`;
    } else {
      html = `<strong>API verbunden</strong>
        <span>Service Account: <code>${escapeHtml(connection.clientEmail || "")}</code></span>
        <span>${connection.sitesAccessible} Property(s) in der Search Console erreichbar.</span>`;
    }
    indexingConnection.innerHTML = html;
  }

  function renderQuota(data) {
    const quota = data.quota || {};
    const stats = data.stats || {};
    if (indexingQuotaSent) indexingQuotaSent.textContent = String(quota.submittedToday ?? 0);
    if (indexingQuotaLimit) indexingQuotaLimit.textContent = String(quota.dailyLimit ?? 10);
    if (indexingQuotaPending) indexingQuotaPending.textContent = String(stats.pendingUrls ?? 0);
    if (indexingQuotaVerified) indexingQuotaVerified.textContent = String(stats.verifiedDomainCount ?? 0);
    if (indexingDailyLimit && data.settings) {
      indexingDailyLimit.value = String(data.settings.dailyLimit ?? 10);
    }
  }

  function statusBadge(domain) {
    if (!domain.active) {
      return '<span class="indexing-badge indexing-badge--off">Inaktiv</span>';
    }
    if (domain.propertyVerified) {
      return '<span class="indexing-badge indexing-badge--ok">Verknüpft</span>';
    }
    return '<span class="indexing-badge indexing-badge--warn">Nicht verifiziert</span>';
  }

  function renderDomains(domains) {
    if (!indexingDomainsBody) return;
    if (!domains || domains.length === 0) {
      indexingDomainsBody.innerHTML = '<tr><td colspan="7" class="muted">Noch keine Domains angelegt.</td></tr>';
      return;
    }
    indexingDomainsBody.innerHTML = domains
      .map((d) => {
        const sitemap = d.sitemapFilename
          ? `${escapeHtml(d.sitemapFilename)}<br><small class="muted">${escapeHtml(d.sitemapUploadedAt || "")}</small>`
          : '<span class="muted">—</span>';
        const urlStats = `<div class="indexing-url-stats">
          <span>${d.pendingCount} ausstehend</span><br>
          <span>${d.submittedCount} eingereicht</span><br>
          <span>${d.failedCount} fehlgeschlagen</span>
        </div>`;
        return `<tr>
          <td><strong>${escapeHtml(d.label)}</strong></td>
          <td>${escapeHtml(d.domain)}</td>
          <td><code>${escapeHtml(d.gscProperty)}</code></td>
          <td>${statusBadge(d)}</td>
          <td>${urlStats}</td>
          <td>${sitemap}</td>
          <td>
            <div class="indexing-domain-actions">
              <button type="button" class="btn btn-secondary" data-action="verify" data-id="${d.id}">Prüfen</button>
              <button type="button" class="btn btn-secondary" data-action="sitemap" data-id="${d.id}" data-label="${escapeHtml(d.label)}">Sitemap</button>
              <button type="button" class="btn btn-ghost" data-action="edit" data-id="${d.id}">Bearbeiten</button>
              <button type="button" class="btn btn-ghost btn-danger-text" data-action="delete" data-id="${d.id}">Löschen</button>
            </div>
          </td>
        </tr>`;
      })
      .join("");
  }

  function renderLog(entries) {
    if (!indexingTodayLog) return;
    if (!entries || entries.length === 0) {
      indexingTodayLog.innerHTML = '<li class="muted">Noch keine Einträge heute.</li>';
      return;
    }
    indexingTodayLog.innerHTML = entries
      .map((e) => {
        const cls = e.success ? "indexing-log-ok" : "indexing-log-err";
        const icon = e.success ? "✓" : "✗";
        return `<li class="${cls}">${icon} <strong>${escapeHtml(e.domainLabel)}</strong> — ${escapeHtml(e.url)}<br><small>${escapeHtml(e.message)}</small></li>`;
      })
      .join("");
  }

  async function loadStatus() {
    const data = await api("indexing_status", { method: "GET" });
    statusData = data;
    renderConnection(data.connection || {});
    renderQuota(data);
    renderDomains(data.domains || []);
    renderLog(data.todayLog || []);
    return data;
  }

  function openDomainModal(domain = null) {
    if (!indexingDomainModal) return;
    if (domain) {
      indexingDomainModalTitle.textContent = "Domain bearbeiten";
      indexingDomainId.value = String(domain.id);
      indexingDomainLabel.value = domain.label || "";
      indexingDomainHost.value = domain.domain || "";
      indexingDomainProperty.value = domain.gscProperty || "";
      indexingDomainActive.checked = !!domain.active;
    } else {
      indexingDomainModalTitle.textContent = "Domain hinzufügen";
      indexingDomainId.value = "";
      indexingDomainForm.reset();
      indexingDomainActive.checked = true;
    }
    indexingDomainModal.showModal();
  }

  document.getElementById("indexingAddDomain")?.addEventListener("click", () => openDomainModal());

  document.getElementById("indexingDomainCancel")?.addEventListener("click", () => indexingDomainModal?.close());

  indexingDomainForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = indexingDomainId.value ? parseInt(indexingDomainId.value, 10) : null;
    try {
      await api("indexing_domain_save", {
        method: "POST",
        body: {
          id,
          label: indexingDomainLabel.value.trim(),
          domain: indexingDomainHost.value.trim(),
          gscProperty: indexingDomainProperty.value.trim(),
          active: indexingDomainActive.checked,
        },
      });
      indexingDomainModal?.close();
      showToast("Domain gespeichert.");
      await loadStatus();
    } catch (err) {
      showToast(err.message, true);
    }
  });

  indexingDomainsBody?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const id = parseInt(btn.dataset.id, 10);
    const action = btn.dataset.action;
    if (!id) return;

    if (action === "edit") {
      const domain = (statusData?.domains || []).find((d) => d.id === id);
      if (domain) openDomainModal(domain);
      return;
    }

    if (action === "delete") {
      if (!confirm("Domain und alle zugehörigen URLs wirklich löschen?")) return;
      try {
        await api("indexing_domain_delete", { method: "POST", body: { id } });
        showToast("Domain gelöscht.");
        await loadStatus();
      } catch (err) {
        showToast(err.message, true);
      }
      return;
    }

    if (action === "verify") {
      try {
        const res = await api("indexing_domain_verify", { method: "POST", body: { id } });
        showToast(res.verification?.message || "Prüfung abgeschlossen.", !res.verification?.verified);
        await loadStatus();
      } catch (err) {
        showToast(err.message, true);
      }
      return;
    }

    if (action === "sitemap") {
      indexingSitemapDomainId.value = String(id);
      indexingSitemapDomainLabel.textContent = btn.dataset.label || "";
      indexingSitemapFile.value = "";
      indexingSitemapModal?.showModal();
    }
  });

  document.getElementById("indexingSitemapCancel")?.addEventListener("click", () => indexingSitemapModal?.close());

  indexingSitemapForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const domainId = indexingSitemapDomainId.value;
    const file = indexingSitemapFile.files?.[0];
    if (!file) {
      showToast("Bitte eine Sitemap-Datei wählen.", true);
      return;
    }
    const form = new FormData();
    form.append("domainId", domainId);
    form.append("sitemap", file);
    try {
      const res = await api("indexing_sitemap_upload", { method: "POST", body: form });
      const imp = res.import || {};
      showToast(`${imp.added ?? 0} neue URL(s), ${imp.skipped ?? 0} bereits bekannt.`);
      indexingSitemapModal?.close();
      await loadStatus();
    } catch (err) {
      showToast(err.message, true);
    }
  });

  document.getElementById("indexingSaveCredentials")?.addEventListener("click", async () => {
    const json = document.getElementById("indexingCredentialsJson")?.value?.trim();
    if (!json) {
      showToast("JSON-Inhalt fehlt.", true);
      return;
    }
    try {
      const res = await api("indexing_credentials", { method: "POST", body: { serviceAccountJson: json } });
      showToast(`API gespeichert (${res.clientEmail || "OK"}).`);
      await loadStatus();
    } catch (err) {
      showToast(err.message, true);
    }
  });

  document.getElementById("indexingLimitForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    try {
      await api("indexing_settings_save", {
        method: "POST",
        body: { dailyLimit: parseInt(indexingDailyLimit.value, 10) || 10 },
      });
      showToast("Tageslimit gespeichert.");
      await loadStatus();
    } catch (err) {
      showToast(err.message, true);
    }
  });

  document.getElementById("indexingRunBatch")?.addEventListener("click", async () => {
    const btn = document.getElementById("indexingRunBatch");
    if (btn) btn.disabled = true;
    try {
      const res = await api("indexing_run_batch", { method: "POST", body: {} });
      const batch = res.batch || {};
      showToast(batch.message || "Batch ausgeführt.");
      await loadStatus();
    } catch (err) {
      showToast(err.message, true);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  document.getElementById("indexingRefresh")?.addEventListener("click", () => {
    loadStatus().catch((err) => showToast(err.message, true));
  });

  loadStatus().catch((err) => showToast(err.message, true));
})();
