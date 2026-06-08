<?php
declare(strict_types=1);

/** URL der Hauptwebsite (für Footer-Links). Bei Bedarf anpassen. */
const INDEXIERUNG_MAIN_SITE = 'https://adlions.de';

session_start();
if (!isset($_SESSION['indexierung_csrf'])) {
    $_SESSION['indexierung_csrf'] = bin2hex(random_bytes(32));
}

$assetBase = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/index.php')), '/');
if ($assetBase === '' || $assetBase === '.') {
    $assetBase = '';
}
function idx_asset(string $path): string
{
    global $assetBase;
    return ($assetBase === '' ? '' : $assetBase) . '/assets/' . ltrim($path, '/');
}
?>
<!DOCTYPE html>
<html lang="de">

<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Indexierung | ADLIONS</title>
  <meta name="robots" content="noindex, nofollow" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,600;0,700;1,400&display=swap"
    rel="stylesheet" />
  <link href="<?php echo htmlspecialchars(idx_asset('favicon.png'), ENT_QUOTES, 'UTF-8'); ?>" rel="icon" type="image/png" />
  <link href="<?php echo htmlspecialchars(idx_asset('indexierung.css'), ENT_QUOTES, 'UTF-8'); ?>" rel="stylesheet" type="text/css" />
  <style>
    :root {
      color-scheme: light;
      --bg: #f8fafc;
      --text: #0f172a;
      --muted: #475569;
      --link: #0369a1;
      --border: #e2e8f0;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      font-size: 17px;
      line-height: 1.65;
      color: var(--text);
      background: var(--bg);
    }
    .site-header { background: #fff; border-bottom: 1px solid var(--border); }
    .site-header-inner {
      max-width: 960px;
      margin: 0 auto;
      padding: 1rem 1.25rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .site-header a.logo { display: flex; align-items: center; text-decoration: none; }
    .site-header img { height: 40px; width: auto; }
    h1 { margin: 0 0 0.5rem; font-size: clamp(1.75rem, 4vw, 2.25rem); font-weight: 700; letter-spacing: -0.02em; }
    .page-intro { margin: 0 0 1.5rem; color: var(--muted); font-size: 16px; }
    .page-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1.25rem; }
    footer {
      border-top: 1px solid var(--border);
      padding: 1.5rem 1.25rem;
      text-align: center;
      font-size: 14px;
      color: var(--muted);
      background: #fff;
    }
    footer a { color: var(--link); font-weight: 600; text-decoration: none; }
    footer a:hover { text-decoration: underline; }
    .muted { color: var(--muted); }
    code { font-size: 0.9em; }
  </style>
</head>

<body>
  <header class="site-header">
    <div class="site-header-inner">
      <a class="logo" href="<?php echo htmlspecialchars(INDEXIERUNG_MAIN_SITE, ENT_QUOTES, 'UTF-8'); ?>">
        <img src="<?php echo htmlspecialchars(idx_asset('logo.webp'), ENT_QUOTES, 'UTF-8'); ?>" alt="ADLIONS" />
      </a>
    </div>
  </header>

  <main class="indexierung-main" style="margin:0 auto;padding:2.5rem 1.25rem 4rem;">
    <h1>Indexierung</h1>
    <p class="page-intro">Kunden-Domains verwalten, Sitemaps importieren und täglich bis zu 10 URLs zur Google-Indexierung anfragen. Bereits eingereichte URLs werden nicht erneut gesendet.</p>

    <div class="page-actions">
      <button type="button" class="btn btn-secondary" id="indexierungRefresh">Aktualisieren</button>
      <button type="button" class="btn btn-primary" id="indexierungRunBatch">Heute senden</button>
    </div>

    <div class="indexierung-app">
      <section class="indexierung-block">
        <h2>Google Search Console</h2>
        <p class="indexierung-subtitle">Zuerst API-Zugang einrichten und jede Property verknüpfen.</p>
        <div id="indexierungConnection" class="indexierung-connection">
          <p class="muted">Verbindungsstatus wird geladen …</p>
        </div>
        <div class="indexierung-oauth-setup" style="margin:1rem 0;">
          <p class="muted" style="font-size:15px;margin-bottom:0.75rem;"><strong>Empfohlen:</strong> OAuth (kein Service-Account-Schlüssel nötig). Funktioniert auch wenn Ihre Organisation JSON-Schlüssel blockiert.</p>
          <form id="indexierungOAuthConfigForm" class="indexierung-limit-form" style="flex-direction:column;align-items:stretch;">
            <label>OAuth Client ID
              <input type="text" id="indexierungOAuthClientId" placeholder="123456789.apps.googleusercontent.com" autocomplete="off">
            </label>
            <label>OAuth Client Secret
              <input type="password" id="indexierungOAuthClientSecret" placeholder="GOCSPX-..." autocomplete="off">
            </label>
            <p class="muted" style="font-size:13px;margin:0;">Redirect-URI in Google Cloud eintragen: <code id="indexierungRedirectUri">…</code></p>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.5rem;">
              <button type="submit" class="btn btn-secondary">Client speichern</button>
              <button type="button" class="btn btn-primary" id="indexierungOAuthConnect">Mit Google verbinden</button>
              <button type="button" class="btn btn-ghost" id="indexierungOAuthDisconnect">Verbindung trennen</button>
            </div>
          </form>
        </div>
        <details class="indexierung-credentials-details">
          <summary>Alternativ: Service-Account JSON (falls erlaubt)</summary>
          <div class="indexierung-credentials-form" style="margin-top:0.75rem;">
            <p class="muted" style="font-size:15px;">Nur wenn Ihre Organisation JSON-Schlüssel erlaubt.</p>
            <label>Service-Account JSON
              <textarea id="indexierungCredentialsJson" rows="6" placeholder='{"type":"service_account", ...}'></textarea>
            </label>
            <p style="margin-top:0.75rem;"><button type="button" class="btn btn-secondary" id="indexierungSaveCredentials">JSON speichern &amp; testen</button></p>
          </div>
        </details>
        <form class="indexierung-limit-form" id="indexierungLimitForm">
          <label>Tageslimit (gesamt, alle Domains)
            <input type="number" id="indexierungDailyLimit" min="1" max="200" value="10">
          </label>
          <button type="submit" class="btn btn-secondary">Limit speichern</button>
        </form>
      </section>

      <section class="indexierung-block">
        <h2>Tageskontingent</h2>
        <div class="indexierung-quota-grid">
          <div class="indexierung-stat-card"><span class="indexierung-stat-label">Heute gesendet</span><strong class="indexierung-stat-value" id="indexierungQuotaSent">0</strong></div>
          <div class="indexierung-stat-card"><span class="indexierung-stat-label">Limit pro Tag</span><strong class="indexierung-stat-value" id="indexierungQuotaLimit">10</strong></div>
          <div class="indexierung-stat-card"><span class="indexierung-stat-label">Ausstehend</span><strong class="indexierung-stat-value" id="indexierungQuotaPending">0</strong></div>
          <div class="indexierung-stat-card"><span class="indexierung-stat-label">Aktive Properties</span><strong class="indexierung-stat-value" id="indexierungQuotaVerified">0</strong></div>
        </div>
      </section>

      <section class="indexierung-block">
        <div class="indexierung-head-row">
          <div>
            <h2>Kunden-Domains</h2>
            <p class="indexierung-subtitle">Sitemap hochladen – bereits eingereichte URLs werden übersprungen.</p>
          </div>
          <button type="button" class="btn btn-secondary" id="indexierungAddDomain">+ Domain</button>
        </div>
        <div class="indexierung-table-wrap">
          <table class="indexierung-domains-table">
            <thead>
              <tr>
                <th>Kunde / Label</th>
                <th>Domain</th>
                <th>Property</th>
                <th>Status</th>
                <th>URLs</th>
                <th>Sitemap</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="indexierungDomainsBody">
              <tr><td colspan="7" class="muted">Laden …</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="indexierung-block">
        <h2>Heutiges Protokoll</h2>
        <ul class="indexierung-log-list" id="indexierungTodayLog">
          <li class="muted">Noch keine Einträge heute.</li>
        </ul>
      </section>
    </div>
  </main>

  <dialog id="indexierungDomainModal" class="indexierung-modal">
    <div class="indexierung-modal-card">
      <header>
        <h3 id="indexierungDomainModalTitle">Domain hinzufügen</h3>
        <p class="muted" style="font-size:14px;">Standard-Property: <code>sc-domain:beispiel.de</code></p>
      </header>
      <form id="indexierungDomainForm" class="indexierung-modal-grid">
        <input type="hidden" id="indexierungDomainId" value="">
        <label>Bezeichnung / Kunde
          <input type="text" id="indexierungDomainLabel" required maxlength="200" placeholder="z. B. Kunde GmbH">
        </label>
        <label>Domain
          <input type="text" id="indexierungDomainHost" required maxlength="255" placeholder="beispiel.de">
        </label>
        <label>GSC-Property (optional)
          <input type="text" id="indexierungDomainProperty" maxlength="500" placeholder="sc-domain:beispiel.de">
        </label>
        <label class="indexierung-checkbox-label">
          <input type="checkbox" id="indexierungDomainActive" checked>
          Aktiv (an Tages-Indexierung teilnehmen)
        </label>
      </form>
      <footer class="indexierung-modal-actions">
        <button type="button" class="btn btn-ghost" id="indexierungDomainCancel">Abbrechen</button>
        <button type="submit" form="indexierungDomainForm" class="btn btn-primary">Speichern</button>
      </footer>
    </div>
  </dialog>

  <dialog id="indexierungSitemapModal" class="indexierung-modal">
    <div class="indexierung-modal-card">
      <header>
        <h3>Sitemap hochladen</h3>
        <p class="muted" id="indexierungSitemapDomainLabel" style="font-size:14px;"></p>
      </header>
      <form id="indexierungSitemapForm" class="indexierung-modal-grid">
        <input type="hidden" id="indexierungSitemapDomainId" value="">
        <label>Sitemap (.xml)
          <input type="file" id="indexierungSitemapFile" accept=".xml,text/xml,application/xml" required>
        </label>
      </form>
      <footer class="indexierung-modal-actions">
        <button type="button" class="btn btn-ghost" id="indexierungSitemapCancel">Abbrechen</button>
        <button type="submit" form="indexierungSitemapForm" class="btn btn-primary">Importieren</button>
      </footer>
    </div>
  </dialog>

  <div id="indexierungToast" class="indexierung-toast hidden" role="status" aria-live="polite"></div>

  <footer>
    <a href="<?php echo htmlspecialchars(INDEXIERUNG_MAIN_SITE, ENT_QUOTES, 'UTF-8'); ?>">ADLIONS Website</a>
  </footer>

  <script src="<?php echo htmlspecialchars(idx_asset('indexierung.js'), ENT_QUOTES, 'UTF-8'); ?>"></script>
</body>

</html>
