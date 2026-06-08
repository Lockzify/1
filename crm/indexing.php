<?php
declare(strict_types=1);

session_start();

require_once __DIR__ . '/lib/CrmDatabase.php';

$crmBasePath = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/crm/indexing.php')), '/');

function crm_home_url(): string
{
    global $crmBasePath;
    return $crmBasePath === '' ? '/' : $crmBasePath . '/';
}

function crm_asset_url(string $relative): string
{
    global $crmBasePath;
    $relative = ltrim($relative, '/');
    return ($crmBasePath === '' ? '' : $crmBasePath) . '/' . $relative;
}

if (!isset($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

$csrfToken = $_SESSION['csrf_token'];
$sessionUser = null;

if (isset($_SESSION['crm_user_id'])) {
    $row = CrmDatabase::findUserById((int) $_SESSION['crm_user_id']);
    if ($row && (int) $row['active'] === 1) {
        $sessionUser = [
            'id' => (int) $row['id'],
            'email' => (string) $row['email'],
            'displayName' => (string) $row['display_name'],
            'role' => (string) $row['role'],
        ];
    }
}

if ($sessionUser === null) {
    header('Location: ' . crm_home_url());
    exit;
}

if (!CrmDatabase::canAccessFulfilmentViews($sessionUser)) {
    header('Location: ' . crm_home_url());
    exit;
}

$activeView = 'indexing';
$isAdmin = ($sessionUser['role'] ?? '') === 'admin';
?>
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Indexierung – ADLIONS CRM</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <meta name="color-scheme" content="light">
  <link href="<?php echo htmlspecialchars(crm_asset_url('assets/crm.css'), ENT_QUOTES, 'UTF-8'); ?>" rel="stylesheet" type="text/css">
  <link href="<?php echo htmlspecialchars(crm_asset_url('assets/crm-saas.css'), ENT_QUOTES, 'UTF-8'); ?>" rel="stylesheet" type="text/css">
  <link href="<?php echo htmlspecialchars(crm_asset_url('assets/indexing.css'), ENT_QUOTES, 'UTF-8'); ?>" rel="stylesheet" type="text/css">
</head>
<body class="crm-body indexing-page-body">
  <div class="crm-shell">
  <?php require __DIR__ . '/partials/sidebar.php'; ?>
  <div class="crm-main">
    <header class="crm-page-header">
      <h1 class="crm-page-title">Indexierung</h1>
      <div class="crm-page-actions indexing-page-actions">
        <button type="button" class="btn btn-secondary" id="indexingRefresh">Aktualisieren</button>
        <button type="button" class="btn btn-primary" id="indexingRunBatch">Heute senden</button>
      </div>
    </header>

    <div class="crm-view">
      <div class="indexing-app">
        <section class="panel indexing-setup-panel" id="indexingSetupPanel">
          <header class="panel-head panel-head--plain">
            <h2>Google Search Console</h2>
            <p class="panel-subtitle">Zuerst API-Zugang einrichten und jede Property verknüpfen, bevor URLs indexiert werden.</p>
          </header>
          <div class="indexing-connection" id="indexingConnection">
            <p class="muted">Verbindungsstatus wird geladen …</p>
          </div>
          <?php if ($isAdmin): ?>
          <details class="indexing-credentials-details">
            <summary>Service-Account JSON hochladen</summary>
            <div class="indexing-credentials-form">
              <p class="muted">Erstellen Sie in der Google Cloud einen Service Account mit Search Console API und Indexing API. Fügen Sie die E-Mail-Adresse des Accounts in jeder Search-Console-Property als Nutzer (Eigentümer) hinzu.</p>
              <label class="full-width">Service-Account JSON
                <textarea id="indexingCredentialsJson" rows="8" placeholder='{"type":"service_account", ...}'></textarea>
              </label>
              <button type="button" class="btn btn-primary" id="indexingSaveCredentials">Speichern &amp; testen</button>
            </div>
          </details>
          <form class="indexing-limit-form" id="indexingLimitForm">
            <label>Tageslimit (gesamt, alle Domains)
              <input type="number" id="indexingDailyLimit" min="1" max="200" value="10">
            </label>
            <button type="submit" class="btn btn-secondary">Limit speichern</button>
          </form>
          <?php else: ?>
          <p class="muted indexing-admin-hint">API-Zugang kann nur von Admins konfiguriert werden.</p>
          <?php endif; ?>
        </section>

        <section class="panel indexing-quota-panel">
          <header class="panel-head panel-head--plain">
            <h2>Tageskontingent</h2>
          </header>
          <div class="indexing-quota-grid" id="indexingQuota">
            <div class="indexing-stat-card">
              <span class="indexing-stat-label">Heute gesendet</span>
              <strong class="indexing-stat-value" id="indexingQuotaSent">0</strong>
            </div>
            <div class="indexing-stat-card">
              <span class="indexing-stat-label">Limit pro Tag</span>
              <strong class="indexing-stat-value" id="indexingQuotaLimit">10</strong>
            </div>
            <div class="indexing-stat-card">
              <span class="indexing-stat-label">Ausstehend</span>
              <strong class="indexing-stat-value" id="indexingQuotaPending">0</strong>
            </div>
            <div class="indexing-stat-card">
              <span class="indexing-stat-label">Aktive Properties</span>
              <strong class="indexing-stat-value" id="indexingQuotaVerified">0</strong>
            </div>
          </div>
        </section>

        <section class="panel indexing-domains-panel">
          <header class="panel-head panel-head--split">
            <div>
              <h2>Kunden-Domains</h2>
              <p class="panel-subtitle">Sitemap hochladen – bereits eingereichte URLs werden nicht erneut angefragt.</p>
            </div>
            <button type="button" class="btn btn-secondary" id="indexingAddDomain">+ Domain</button>
          </header>
          <div class="table-wrap">
            <table class="indexing-domains-table">
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
              <tbody id="indexingDomainsBody">
                <tr><td colspan="7" class="muted">Laden …</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="panel indexing-log-panel">
          <header class="panel-head panel-head--plain">
            <h2>Heutiges Protokoll</h2>
          </header>
          <ul class="indexing-log-list" id="indexingTodayLog">
            <li class="muted">Noch keine Einträge heute.</li>
          </ul>
        </section>
      </div>
    </div>
  </div>
  </div>

  <dialog id="indexingDomainModal" class="modal">
    <div class="modal-card">
      <header>
        <h3 id="indexingDomainModalTitle">Domain hinzufügen</h3>
        <p class="muted">Die GSC-Property wird standardmäßig als Domain-Property (sc-domain:) angelegt.</p>
      </header>
      <form id="indexingDomainForm" class="modal-grid">
        <input type="hidden" id="indexingDomainId" value="">
        <label class="full-width">Bezeichnung / Kunde
          <input type="text" id="indexingDomainLabel" required maxlength="200" placeholder="z. B. Albrecht Dachtechnik">
        </label>
        <label class="full-width">Domain
          <input type="text" id="indexingDomainHost" required maxlength="255" placeholder="beispiel.de">
        </label>
        <label class="full-width">GSC-Property (optional)
          <input type="text" id="indexingDomainProperty" maxlength="500" placeholder="sc-domain:beispiel.de oder https://beispiel.de/">
        </label>
        <label class="full-width indexing-checkbox-label">
          <input type="checkbox" id="indexingDomainActive" checked>
          Aktiv (an Tages-Indexierung teilnehmen)
        </label>
      </form>
      <footer class="modal-actions">
        <button type="button" class="btn btn-ghost" id="indexingDomainCancel">Abbrechen</button>
        <button type="submit" form="indexingDomainForm" class="btn btn-primary">Speichern</button>
      </footer>
    </div>
  </dialog>

  <dialog id="indexingSitemapModal" class="modal">
    <div class="modal-card">
      <header>
        <h3>Sitemap hochladen</h3>
        <p class="muted" id="indexingSitemapDomainLabel"></p>
      </header>
      <form id="indexingSitemapForm">
        <input type="hidden" id="indexingSitemapDomainId" value="">
        <label class="full-width">Sitemap (.xml)
          <input type="file" id="indexingSitemapFile" accept=".xml,text/xml,application/xml" required>
        </label>
      </form>
      <footer class="modal-actions">
        <button type="button" class="btn btn-ghost" id="indexingSitemapCancel">Abbrechen</button>
        <button type="submit" form="indexingSitemapForm" class="btn btn-primary">Importieren</button>
      </footer>
    </div>
  </dialog>

  <div id="indexingToast" class="crm-app-toast hidden" role="status" aria-live="polite"></div>

  <script>
    window.__INDEXING_BOOTSTRAP__ = <?php echo json_encode([
        'csrfToken' => $csrfToken,
        'user' => $sessionUser,
        'isAdmin' => $isAdmin,
    ], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR); ?>;
  </script>
  <script src="<?php echo htmlspecialchars(crm_asset_url('assets/indexing-page.js'), ENT_QUOTES, 'UTF-8'); ?>"></script>
</body>
</html>
