<?php
declare(strict_types=1);

session_start();

require_once __DIR__ . '/lib/CrmDatabase.php';

$crmBasePath = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/crm/leads.php')), '/');

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

$activeView = 'leads';
?>
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="format-detection" content="telephone=no,address=no,email=no">
  <title>Leads – ADLIONS CRM</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <meta name="color-scheme" content="light">
  <link href="<?php echo htmlspecialchars(crm_asset_url('assets/crm.css'), ENT_QUOTES, 'UTF-8'); ?>" rel="stylesheet" type="text/css">
  <link href="<?php echo htmlspecialchars(crm_asset_url('assets/crm-saas.css'), ENT_QUOTES, 'UTF-8'); ?>" rel="stylesheet" type="text/css">
  <link href="<?php echo htmlspecialchars(crm_asset_url('assets/leads.css'), ENT_QUOTES, 'UTF-8'); ?>" rel="stylesheet" type="text/css">
</head>
<body class="crm-body leads-page-body" x-apple-data-detectors="false">
  <div class="crm-shell">
  <?php require __DIR__ . '/partials/sidebar.php'; ?>
  <div class="crm-main">
    <header class="crm-page-header">
      <h1 class="crm-page-title">Leads</h1>
      <div class="crm-page-actions leads-page-actions">
        <button type="button" class="btn btn-secondary hidden" id="leadsManageFields">Spalten</button>
        <button type="button" class="btn btn-secondary" id="leadsOpenImport">Import</button>
        <button type="button" class="btn btn-secondary" id="leadsExportCsv">Export</button>
        <button type="button" class="btn btn-secondary" id="leadsAddRow">+ Zeile</button>
        <span class="leads-save-status muted" id="leadsSaveStatus" aria-live="polite"></span>
        <button type="button" class="btn btn-ghost btn-danger-text" id="leadsDeleteList">Löschen</button>
      </div>
    </header>

    <div class="crm-view crm-view--fill">
  <div class="leads-app">
    <aside class="leads-sidebar panel">
      <header class="panel-head panel-head--plain">
        <h2>Listen</h2>
        <p class="panel-subtitle">Importierte Lead-Listen zum Cold Calling.</p>
      </header>

      <div class="leads-filter-block">
        <label class="leads-filter-label" for="leadsListScopeFilter">Listen von</label>
        <select id="leadsListScopeFilter" class="leads-filter-select">
          <option value="mine">Meine Listen</option>
          <option value="all" class="leads-admin-only hidden">Alle Nutzer</option>
          <option value="user" class="leads-admin-only hidden">Bestimmter Nutzer …</option>
        </select>
        <select id="leadsListUserFilter" class="leads-filter-select hidden" aria-label="Nutzer für Listen"></select>
      </div>

      <ul class="leads-list-menu" id="leadsListMenu" aria-label="Lead-Listen"></ul>
      <button type="button" class="btn btn-secondary leads-new-list-btn" id="leadsNewList">+ Neue Liste</button>
    </aside>

    <section class="leads-workspace panel">
      <header class="leads-workspace-head">
        <div class="leads-workspace-title">
          <label class="leads-list-name-label" for="leadsListName">Listenname
            <input type="text" id="leadsListName" class="lead-list-name-input" maxlength="200" autocomplete="off" placeholder="z. B. Import März 2026">
          </label>
          <p class="lead-list-meta muted" id="leadsListMeta"></p>
          <p class="leads-list-owner muted hidden" id="leadsListOwnerLabel"></p>
        </div>

      </header>

      <div class="leads-sheet-panel">
        <div class="leads-sheet-meta">
          <div class="leads-sheet-stats" id="leadsSheetStats"></div>
          <div class="leads-sheet-filters">
            <input type="search" id="leadsSearchInput" class="leads-search-input" placeholder="Suchen …" aria-label="In Tabelle suchen">
          </div>
        </div>
        <div class="leads-sheet-scroll">
          <table class="lead-sheet-table leads-sheet-table" id="leadsSheetTable">
            <colgroup id="leadsSheetColgroup"></colgroup>
            <thead id="leadsSheetHead"></thead>
            <tbody id="leadsSheetBody"></tbody>
          </table>
        </div>
        <p class="empty-hint hidden" id="leadsSheetEmpty">Wählen Sie eine Liste oder legen Sie eine neue an.</p>
      </div>
    </section>
  </div>
    </div>
  </div>
  </div>

  <dialog id="leadsImportModal" class="modal modal-wide">
    <div class="modal-card">
      <header>
        <h3>CSV importieren</h3>
        <p class="muted">Erste Zeile = Spaltenüberschriften. Ordnen Sie jede CSV-Spalte einem Feld zu.</p>
      </header>
      <div class="import-step-file">
        <label class="full-width">Datei
          <input type="file" id="leadsImportFile" accept=".csv,text/csv,text/plain">
        </label>
      </div>
      <div id="leadsImportMappingWrap" class="hidden import-mapping-wrap">
        <div class="table-wrap">
          <table class="import-map-table">
            <thead>
              <tr>
                <th>CSV-Spalte</th>
                <th>Vorschau</th>
                <th>Ziel-Feld</th>
              </tr>
            </thead>
            <tbody id="leadsImportMappingBody"></tbody>
          </table>
        </div>
      </div>
      <footer class="modal-actions">
        <button type="button" class="btn btn-ghost" id="leadsImportCancel">Abbrechen</button>
        <button type="button" class="btn btn-primary" id="leadsImportApply" disabled>Import übernehmen</button>
      </footer>
    </div>
  </dialog>

  <dialog id="leadsFieldsModal" class="modal modal-wide">
    <div class="modal-card">
      <header>
        <h3>Spalten (globale Felder)</h3>
        <p class="muted">Spalten hinzufügen, umbenennen und per ↑/↓ anordnen. Gilt für alle Nutzer.</p>
      </header>
      <div class="table-wrap fields-table-wrap">
        <table class="fields-def-table">
          <thead>
            <tr>
              <th>Technischer Name</th>
              <th>Anzeige</th>
              <th>Reihenfolge</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="leadsFieldsTableBody"></tbody>
        </table>
      </div>
      <form id="leadsNewFieldForm" class="modal-grid new-field-form">
        <h4 class="full-width">Neue Spalte</h4>
        <label>Technischer Name
          <input name="key" id="leadsNewFieldKey" type="text" pattern="[a-z][a-z0-9_]*" maxlength="64" placeholder="z. B. branche" required autocomplete="off">
        </label>
        <label>Anzeige
          <input name="label" id="leadsNewFieldLabel" type="text" maxlength="200" placeholder="Branche" required autocomplete="off">
        </label>
        <div class="modal-actions full-width">
          <button type="submit" class="btn btn-primary">Spalte anlegen</button>
        </div>
      </form>
      <footer class="modal-actions">
        <button type="button" class="btn btn-ghost" id="leadsFieldsClose">Schließen</button>
      </footer>
    </div>
  </dialog>

  <dialog id="incomingCallModal" class="modal modal--intent-announce">
    <div class="modal-card modal-card--intent-announce">
      <header>
        <h3>Rückruf aus Leads</h3>
        <p class="muted">Nummer an alle angemeldeten Geräte. Auf dem Handy: „Anrufen“ für die Telefon-App.</p>
      </header>
      <p class="incoming-call-number crm-no-autolink" id="incomingCallNumber" x-apple-data-detectors="false" translate="no" aria-live="polite"></p>
      <footer class="modal-actions modal-actions--intent-call">
        <button type="button" class="btn btn-ghost" id="incomingCallDismiss">Schließen</button>
        <button type="button" class="btn btn-secondary" id="incomingCallCopy">Nummer kopieren</button>
        <a class="btn btn-primary hidden" id="incomingCallDial" href="#">Anrufen</a>
      </footer>
    </div>
  </dialog>

  <div id="leadsAppToast" class="crm-app-toast hidden" role="status" aria-live="polite"></div>

  <script src="<?php echo htmlspecialchars(crm_asset_url('assets/leads-page.js'), ENT_QUOTES, 'UTF-8'); ?>"></script>
</body>
</html>
