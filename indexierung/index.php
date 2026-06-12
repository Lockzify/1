<?php
declare(strict_types=1);

/** URL der Hauptwebsite (für Footer-Links). Bei Bedarf anpassen. */
const INDEXIERUNG_MAIN_SITE = 'https://adlions.de';

require_once __DIR__ . '/lib/GoogleApiAuth.php';
GoogleApiAuth::ensureOAuthConfigFromDefaults();
$oauthDefaults = GoogleApiAuth::loadOAuthConfig();

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
<html lang="de" class="idx-page">

<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Indexierung | ADLIONS</title>
  <meta name="robots" content="noindex, nofollow" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link href="<?php echo htmlspecialchars(idx_asset('favicon.png'), ENT_QUOTES, 'UTF-8'); ?>" rel="icon" type="image/png" />
  <link href="<?php echo htmlspecialchars(idx_asset('indexierung.css'), ENT_QUOTES, 'UTF-8'); ?>" rel="stylesheet" type="text/css" />
</head>

<body>
  <header class="idx-header">
    <div class="idx-header-inner">
      <a class="logo" href="<?php echo htmlspecialchars(INDEXIERUNG_MAIN_SITE, ENT_QUOTES, 'UTF-8'); ?>">
        <img src="<?php echo htmlspecialchars(idx_asset('logo.webp'), ENT_QUOTES, 'UTF-8'); ?>" alt="ADLIONS" />
      </a>
      <span class="idx-header-badge">Indexierung</span>
    </div>
  </header>

  <main class="idx-main">
    <section class="idx-hero">
      <span class="idx-eyebrow">Google Search Console</span>
      <h1>Automatische Indexierung für Kunden-Domains.</h1>
      <p class="idx-lead">Sitemaps importieren, Properties verknüpfen und täglich bis zu 10 URLs zur Google-Indexierung anfragen — bereits eingereichte URLs werden nicht erneut gesendet.</p>
      <div class="idx-hero-actions">
        <button type="button" class="btn btn-primary" id="indexierungRunBatch">Heute senden</button>
        <button type="button" class="btn btn-secondary" id="indexierungRefresh">Aktualisieren</button>
      </div>
    </section>

    <section class="idx-stats" aria-label="Tageskontingent">
      <div class="idx-stat-card">
        <span class="idx-stat-label">Heute gesendet</span>
        <strong class="idx-stat-value" id="indexierungQuotaSent">0</strong>
      </div>
      <div class="idx-stat-card">
        <span class="idx-stat-label">Limit pro Tag</span>
        <strong class="idx-stat-value" id="indexierungQuotaLimit">10</strong>
      </div>
      <div class="idx-stat-card">
        <span class="idx-stat-label">Ausstehend</span>
        <strong class="idx-stat-value" id="indexierungQuotaPending">0</strong>
      </div>
      <div class="idx-stat-card">
        <span class="idx-stat-label">Aktive Properties</span>
        <strong class="idx-stat-value" id="indexierungQuotaVerified">0</strong>
      </div>
    </section>

    <div class="indexierung-app">
      <section class="indexierung-block">
        <h2>API-Verbindung</h2>
        <p class="indexierung-subtitle">OAuth einrichten und jede Search-Console-Property verknüpfen.</p>
        <div id="indexierungConnection" class="indexierung-connection">
          <p class="muted">Verbindungsstatus wird geladen …</p>
        </div>
        <div class="indexierung-oauth-setup">
          <p class="indexierung-oauth-hint"><strong>Empfohlen:</strong> OAuth — kein Service-Account-Schlüssel nötig. Funktioniert auch wenn Ihre Organisation JSON-Schlüssel blockiert.</p>
          <form id="indexierungOAuthConfigForm">
            <label>OAuth Client ID
              <input type="text" id="indexierungOAuthClientId" placeholder="123456789.apps.googleusercontent.com" autocomplete="off" value="<?php echo htmlspecialchars((string) ($oauthDefaults['clientId'] ?? ''), ENT_QUOTES, 'UTF-8'); ?>">
            </label>
            <label>OAuth Client Secret
              <input type="password" id="indexierungOAuthClientSecret" placeholder="GOCSPX-..." autocomplete="off" value="<?php echo htmlspecialchars((string) ($oauthDefaults['clientSecret'] ?? ''), ENT_QUOTES, 'UTF-8'); ?>">
            </label>
            <p class="indexierung-redirect-uri">Redirect-URI in Google Cloud: <code id="indexierungRedirectUri">…</code></p>
            <div class="indexierung-oauth-actions">
              <button type="submit" class="btn btn-secondary">Client speichern</button>
              <button type="button" class="btn btn-primary" id="indexierungOAuthConnect">Mit Google verbinden</button>
              <button type="button" class="btn btn-ghost" id="indexierungOAuthDisconnect">Verbindung trennen</button>
            </div>
          </form>
        </div>
        <details class="indexierung-credentials-details">
          <summary>Alternativ: Service-Account JSON (falls erlaubt)</summary>
          <div class="indexierung-credentials-form" style="margin-top:0.75rem;">
            <p class="muted" style="font-size:14px;">Nur wenn Ihre Organisation JSON-Schlüssel erlaubt.</p>
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
        <div class="indexierung-head-row">
          <div>
            <h2>Kunden-Domains</h2>
            <p class="indexierung-subtitle">Sitemap hochladen — bereits eingereichte URLs werden übersprungen.</p>
          </div>
          <button type="button" class="btn btn-primary" id="indexierungAddDomain">+ Domain</button>
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
        <p class="indexierung-subtitle">Alle Indexierungsanfragen von heute auf einen Blick.</p>
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

  <footer class="idx-footer">
    <a href="<?php echo htmlspecialchars(INDEXIERUNG_MAIN_SITE, ENT_QUOTES, 'UTF-8'); ?>">ADLIONS Website</a>
  </footer>

  <script src="<?php echo htmlspecialchars(idx_asset('indexierung.js'), ENT_QUOTES, 'UTF-8'); ?>"></script>
</body>

</html>
