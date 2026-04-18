<?php
declare(strict_types=1);

session_start();

require_once __DIR__ . '/lib/CrmDatabase.php';

/** Web-Pfad zum CRM-Ordner, z. B. "/crm" oder "" (wenn Document Root = crm/). */
$crmBasePath = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/crm/index.php')), '/');

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

const CRM_LOGIN_ATTEMPTS = 'adlions_crm_login_attempts';
const CRM_LOGIN_LOCK = 'adlions_crm_lock_until';

if (!isset($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

$csrfToken = $_SESSION['csrf_token'];
$loginError = '';

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
    } else {
        unset($_SESSION['crm_user_id']);
    }
}

$lockMap = $_SESSION[CRM_LOGIN_LOCK] ?? [];
if (!is_array($lockMap)) {
    $lockMap = [];
}
$attemptMap = $_SESSION[CRM_LOGIN_ATTEMPTS] ?? [];
if (!is_array($attemptMap)) {
    $attemptMap = [];
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $token = (string) ($_POST['csrf_token'] ?? '');
    if (!hash_equals($csrfToken, $token)) {
        http_response_code(403);
        exit('Ungültige Anfrage.');
    }

    if (isset($_POST['logout'])) {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], (bool) $params['secure'], (bool) $params['httponly']);
        }
        session_destroy();
        header('Location: ' . crm_home_url());
        exit;
    }

    if (isset($_POST['email'], $_POST['password'])) {
        $email = trim((string) $_POST['email']);
        $password = (string) $_POST['password'];
        $lockUntil = (int) ($lockMap[$email] ?? 0);
        $isLocked = $lockUntil > time();

        if (!$isLocked) {
            $user = CrmDatabase::findUserByEmail($email);
            $ok = $user && (int) $user['active'] === 1 && password_verify($password, (string) $user['password_hash']);

            if ($ok) {
                session_regenerate_id(true);
                $_SESSION['crm_user_id'] = (int) $user['id'];
                unset($attemptMap[$email], $lockMap[$email]);
                $_SESSION[CRM_LOGIN_ATTEMPTS] = $attemptMap;
                $_SESSION[CRM_LOGIN_LOCK] = $lockMap;
                header('Location: /crm/');
                exit;
            }

            $attempts = ((int) ($attemptMap[$email] ?? 0)) + 1;
            $attemptMap[$email] = $attempts;

            if ($attempts >= 5) {
                $lockMap[$email] = time() + 600;
                $loginError = 'Zu viele Fehlversuche. Bitte in 10 Minuten erneut versuchen.';
            } else {
                $remaining = 5 - $attempts;
                $loginError = "Login fehlgeschlagen. Noch {$remaining} Versuche.";
            }
        } else {
            $wait = max(1, $lockUntil - time());
            $minutes = (int) ceil($wait / 60);
            $loginError = "Login vorübergehend gesperrt. Bitte in ca. {$minutes} Minute(n) erneut versuchen.";
        }

        $_SESSION[CRM_LOGIN_ATTEMPTS] = $attemptMap;
        $_SESSION[CRM_LOGIN_LOCK] = $lockMap;
    }
}

$isAuthenticated = $sessionUser !== null;
$bootstrap = [
    'csrfToken' => $csrfToken,
    'user' => $sessionUser,
    'basePath' => $crmBasePath,
];
?>
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ADLIONS CRM</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <meta name="color-scheme" content="light only">
  <link href="<?php echo htmlspecialchars(crm_asset_url('assets/crm.css'), ENT_QUOTES, 'UTF-8'); ?>" rel="stylesheet" type="text/css">
</head>
<body class="crm-body">
<?php if (!$isAuthenticated): ?>
  <main class="login-page">
    <section class="login-card">
      <div class="brand-block">
        <span class="brand-pill">ADLIONS CRM</span>
        <h1>Willkommen im Vertriebscockpit</h1>
        <p>Melden Sie sich mit Ihrer geschäftlichen E-Mail und Ihrem Passwort an.</p>
      </div>
      <form method="post" class="login-form" autocomplete="on">
        <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8'); ?>">
        <label for="email">E-Mail</label>
        <input id="email" name="email" type="email" required autofocus autocomplete="username" value="<?php echo htmlspecialchars((string) ($_POST['email'] ?? ''), ENT_QUOTES, 'UTF-8'); ?>">
        <label for="password">Passwort</label>
        <input id="password" name="password" type="password" required autocomplete="current-password">
        <?php if ($loginError !== ''): ?>
          <p class="error-message"><?php echo htmlspecialchars($loginError, ENT_QUOTES, 'UTF-8'); ?></p>
        <?php endif; ?>
        <button type="submit">Anmelden</button>
        <p class="hint-message">Admin-Zugang wird beim ersten Start automatisch angelegt (E-Mail/Passwort per Server-Umgebung überschreibbar).</p>
      </form>
    </section>
  </main>
<?php else: ?>
  <script>
    window.__CRM_BOOTSTRAP__ = <?php echo json_encode($bootstrap, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR); ?>;
  </script>
  <header class="topbar">
    <div class="topbar-left">
      <span class="brand-pill">ADLIONS CRM</span>
      <h1 id="crmPageTitle">Pipeline</h1>
      <span class="user-chip" title="<?php echo htmlspecialchars($sessionUser['email'], ENT_QUOTES, 'UTF-8'); ?>">
        <?php echo htmlspecialchars($sessionUser['displayName'], ENT_QUOTES, 'UTF-8'); ?>
        · <?php echo $sessionUser['role'] === 'admin' ? 'Admin' : 'Nutzer'; ?>
      </span>
    </div>
    <div class="topbar-right">
      <?php if ($sessionUser['role'] === 'admin'): ?>
        <button class="btn btn-secondary" type="button" id="openUsersModal">Nutzer verwalten</button>
      <?php endif; ?>
      <div class="topbar-actions-group" id="toolbarPipeline">
               <button class="btn btn-primary" id="openDealModal" type="button">+ Deal anlegen</button>
        <button class="btn btn-secondary" id="openPhaseModal" type="button">+ Phase anlegen</button>
      </div>
      <div class="topbar-actions-group hidden" id="toolbarLeadLists">
        <button class="btn btn-secondary" type="button" id="llNewList">+ Neue Lead-Liste</button>
        <button class="btn btn-secondary" type="button" id="llOpenImport">CSV importieren</button>
        <?php if ($sessionUser['role'] === 'admin'): ?>
          <button class="btn btn-secondary" type="button" id="llManageFields">Globale Felder</button>
        <?php endif; ?>
        <button class="btn btn-primary" type="button" id="llSaveList">Speichern</button>
        <button class="btn btn-secondary" type="button" id="llExportCsv">CSV exportieren</button>
        <button class="btn btn-ghost btn-danger-text" type="button" id="llDeleteList">Lead-Liste löschen</button>
      </div>
      <form method="post">
        <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8'); ?>">
        <button class="btn btn-ghost" type="submit" name="logout" value="1">Logout</button>
      </form>
    </div>
  </header>

  <nav class="crm-subnav" aria-label="Hauptbereiche">
    <button type="button" class="crm-nav-link is-active" data-crm-view="pipeline">Pipeline</button>
    <button type="button" class="crm-nav-link" data-crm-view="activity">Aktivitätsfeed</button>
    <button type="button" class="crm-nav-link" data-crm-view="leadlists">Leads</button>
  </nav>

  <div id="viewPipeline" class="crm-view">
  <main class="crm-layout" id="crmApp">
    <section class="stats-grid">
      <article class="stat-card">
        <p>Offene Deals</p>
        <strong id="statDealsOpen">0</strong>
      </article>
      <article class="stat-card">
        <p>Pipeline-Wert</p>
        <strong id="statPipelineValue">0 EUR</strong>
      </article>
      <article class="stat-card">
        <p>Gewichtete Forecast</p>
        <strong id="statForecastValue">0 EUR</strong>
      </article>
      <article class="stat-card">
        <p>Gewinnquote</p>
        <strong id="statWinRate">0%</strong>
      </article>
    </section>

    <section class="filter-bar">
      <div class="filter-group">
        <label for="searchInput">Suche</label>
        <input id="searchInput" type="search" placeholder="Deal, Firma, Tag …">
      </div>
      <div class="filter-group">
        <label for="phaseFilter">Phase</label>
        <select id="phaseFilter"></select>
      </div>
      <div class="filter-group">
        <label for="ownerFilter">Owner</label>
        <select id="ownerFilter"></select>
      </div>
      <div class="filter-group">
        <label for="priorityFilter">Priorität</label>
        <select id="priorityFilter">
          <option value="">Alle</option>
          <option value="hoch">Hoch</option>
          <option value="mittel">Mittel</option>
          <option value="niedrig">Niedrig</option>
        </select>
      </div>
      <div class="filter-actions">
        <button class="btn btn-secondary" id="exportJson">Export JSON</button>
        <label class="btn btn-secondary import-label">
          Import JSON
          <input type="file" id="importJson" accept="application/json" hidden>
        </label>
        <button class="btn btn-ghost" id="resetFilters">Filter zurücksetzen</button>
      </div>
    </section>

    <section class="board-section">
      <div id="pipelineBoard" class="pipeline-board"></div>
    </section>
  </main>
  </div>

  <div id="viewActivity" class="crm-view hidden">
    <main class="crm-layout crm-single-panel">
      <article class="panel activity-panel-full">
        <header class="panel-head">
          <h2>Aktivitätsfeed</h2>
        </header>
        <ul class="activity-feed activity-feed-page" id="activityFeed"></ul>
      </article>
    </main>
  </div>

  <div id="viewLeadLists" class="crm-view hidden">
    <main class="crm-layout lead-lists-page">
      <div class="lead-lists-shell">
        <aside class="panel lead-lists-sidebar">
          <header class="panel-head">
            <h2>Ihre Leads</h2>
          </header>
          <p class="muted sidebar-hint">Leads sind pro Nutzer gespeichert. Spalten entsprechen <strong>globalen Feldern</strong> (für alle gleich). CSV-Import: Spalten zuordnen. Felder legt der Admin unter „Globale Felder“ fest. <strong>Telefon:</strong> Antippen öffnet den Anruf auf dem <em>jeweiligen Gerät</em> (Handy → Telefon-App; PC → ggf. Skype, Teams, FaceTime). Für den Handy-Dialog bitte im mobilen Browser dieselbe Nummer antippen.</p>
          <ul class="lead-lists-menu" id="leadListsMenu"></ul>
        </aside>
        <section class="panel lead-lists-workspace">
          <header class="panel-head lead-lists-head">
            <div class="lead-lists-title-row">
              <label class="lead-list-name-label">Name der Lead-Liste
                <input type="text" id="leadListName" class="lead-list-name-input" placeholder="z. B. Messe Leipzig 04/2026" maxlength="200">
              </label>
              <span class="lead-list-meta muted" id="leadListMeta"></span>
            </div>
          </header>
          <div class="lead-lists-toolbar-inner">
            <button type="button" class="btn btn-secondary" id="llAddRow">+ Zeile</button>
            <p class="muted toolbar-hint">Kopfzeilen sind die <strong>globalen Feldnamen</strong> (nur Admin änderbar). Zellen bearbeiten, CSV importieren mit Zuordnung. Mit <strong>Speichern</strong> sichern.</p>
          </div>
          <div class="table-wrap lead-sheet-wrap">
            <table class="lead-sheet-table" id="leadSheetTable">
              <thead id="leadSheetHead"></thead>
              <tbody id="leadSheetBody"></tbody>
            </table>
          </div>
          <p class="muted empty-lead-sheet hidden" id="leadSheetEmpty">Wählen Sie eine Lead-Liste oder legen Sie eine neue an.</p>
        </section>
      </div>
    </main>
  </div>

  <dialog id="llImportModal" class="modal modal-wide">
    <div class="modal-card">
      <header>
        <h3>CSV importieren</h3>
        <p class="muted">Erste Zeile = Spaltenüberschriften. Ordnen Sie jede CSV-Spalte einem <strong>globalen Feld</strong> zu oder wählen Sie „Nicht importieren“.</p>
      </header>
      <div class="import-step-file">
        <label class="full-width">Datei
          <input type="file" id="llImportFile" accept=".csv,text/csv,text/plain">
        </label>
      </div>
      <div id="llImportMappingWrap" class="hidden import-mapping-wrap">
        <div class="table-wrap">
          <table class="import-map-table">
            <thead>
            <tr>
              <th>CSV-Spalte (Datei)</th>
              <th>Vorschau</th>
              <th>Ziel-Feld (global)</th>
            </tr>
            </thead>
            <tbody id="llImportMappingBody"></tbody>
          </table>
        </div>
      </div>
      <footer class="modal-actions">
        <button type="button" class="btn btn-ghost" id="llImportCancel">Abbrechen</button>
        <button type="button" class="btn btn-primary" id="llImportApply" disabled>Import übernehmen</button>
      </footer>
    </div>
  </dialog>

  <?php if ($sessionUser['role'] === 'admin'): ?>
  <dialog id="llFieldsModal" class="modal modal-wide">
    <div class="modal-card">
      <header>
        <h3>Globale Lead-Felder</h3>
        <p class="muted">Diese Felder gelten für <strong>alle Nutzer</strong> (einheitliche Spalten unter „Leads“). Technischer Name bleibt fest, Anzeige und Reihenfolge sind änderbar.</p>
      </header>
      <div class="table-wrap fields-table-wrap">
        <table class="fields-def-table">
          <thead>
          <tr>
            <th>Technischer Name</th>
            <th>Anzeige</th>
            <th>Sortierung</th>
            <th></th>
          </tr>
          </thead>
          <tbody id="llFieldsTableBody"></tbody>
        </table>
      </div>
      <form id="llNewFieldForm" class="modal-grid new-field-form">
        <h4 class="full-width">Neues Feld</h4>
        <label>Technischer Name <span class="muted">(z. B. linkedin)</span>
          <input name="key" id="llNewFieldKey" type="text" pattern="[a-z][a-z0-9_]*" maxlength="64" placeholder="nur_kleinbuchstaben" required autocomplete="off">
        </label>
        <label>Anzeige im CRM
          <input name="label" id="llNewFieldLabel" type="text" maxlength="200" placeholder="LinkedIn-Profil" required autocomplete="off">
        </label>
        <div class="modal-actions full-width">
          <button type="submit" class="btn btn-primary">Feld anlegen</button>
        </div>
      </form>
      <footer class="modal-actions">
        <button type="button" class="btn btn-ghost" id="llFieldsClose">Schließen</button>
      </footer>
    </div>
  </dialog>
  <?php endif; ?>

  <dialog id="dealModal" class="modal">
    <form method="dialog" class="modal-card" id="dealForm">
      <header>
        <h3 id="dealModalTitle">Deal anlegen</h3>
      </header>
      <div class="modal-grid">
        <label>Deal-Name<input name="name" required></label>
        <label>Firma<input name="company"></label>
        <label>Wert (EUR)<input name="value" type="number" min="0" step="100"></label>
        <label>Phase<select name="phaseId" id="dealPhaseSelect"></select></label>
        <label>Owner<input name="owner" placeholder="z. B. Alex"></label>
        <label>Priorität
          <select name="priority">
            <option value="mittel">Mittel</option>
            <option value="hoch">Hoch</option>
            <option value="niedrig">Niedrig</option>
          </select>
        </label>
        <label>Kontakt (optional, aus CRM-Import)<select name="contactId" id="dealContactSelect"></select></label>
        <label>Nächster Schritt<input name="nextStep" placeholder="z. B. Angebot senden"></label>
        <label>Fällig am<input name="dueDate" type="date"></label>
        <label>Abschluss-Wahrscheinlichkeit %<input name="probability" type="number" min="0" max="100" step="5"></label>
        <label class="full-width">Tags (Komma-getrennt)<input name="tags" placeholder="B2B, Social Ads"></label>
        <label class="full-width">Notizen<textarea name="notes" rows="4"></textarea></label>
      </div>
      <div class="deal-comments-panel hidden" id="dealCommentsPanel" aria-live="polite">
        <h4 class="comments-heading">Kommentare &amp; Verlauf</h4>
        <p class="comments-hint">Sichtbar für alle CRM-Nutzer. Jeder Eintrag zeigt Autor und Zeitpunkt.</p>
        <ul class="deal-comments-list" id="dealCommentsList"></ul>
        <label class="full-width">Neuer Kommentar<textarea id="dealNewComment" rows="3" placeholder="Kurz festhalten, was besprochen wurde …"></textarea></label>
        <div class="comments-actions">
          <button class="btn btn-secondary" type="button" id="dealAddCommentBtn">Kommentar speichern</button>
        </div>
      </div>
      <footer class="modal-actions">
        <button class="btn btn-ghost" value="cancel">Abbrechen</button>
        <button class="btn btn-primary" type="submit">Speichern</button>
      </footer>
    </form>
  </dialog>

  <dialog id="contactModal" class="modal">
    <form method="dialog" class="modal-card" id="contactForm">
      <header>
        <h3 id="contactModalTitle">Kontakt anlegen</h3>
      </header>
      <div class="modal-grid">
        <label>Name<input name="name" required></label>
        <label>Firma<input name="company"></label>
        <label>E-Mail<input name="email" type="email"></label>
        <label>Telefon<input name="phone"></label>
        <label>Quelle<input name="source" placeholder="Website, Messe, Referral"></label>
        <label>Status
          <select name="status">
            <option value="neu">Neu</option>
            <option value="qualifiziert">Qualifiziert</option>
            <option value="angebot">Angebot</option>
            <option value="kunde">Kunde</option>
            <option value="inaktiv">Inaktiv</option>
          </select>
        </label>
        <label class="full-width">Notizen<textarea name="notes" rows="3"></textarea></label>
      </div>
      <footer class="modal-actions">
        <button class="btn btn-ghost" value="cancel">Abbrechen</button>
        <button class="btn btn-primary" type="submit">Speichern</button>
      </footer>
    </form>
  </dialog>

  <dialog id="phaseModal" class="modal">
    <form method="dialog" class="modal-card" id="phaseForm">
      <header>
        <h3 id="phaseModalTitle">Phase anlegen</h3>
      </header>
      <div class="modal-grid">
        <label>Phasenname<input name="name" required></label>
        <label>Standard-Wahrscheinlichkeit %<input name="probability" type="number" min="0" max="100" step="5" value="20"></label>
      </div>
      <footer class="modal-actions">
        <button class="btn btn-ghost" value="cancel">Abbrechen</button>
        <button class="btn btn-primary" type="submit">Speichern</button>
      </footer>
    </form>
  </dialog>

  <dialog id="usersModal" class="modal modal-wide">
    <div class="modal-card">
      <header>
        <h3>Nutzer verwalten</h3>
        <p class="muted">Neue Kolleg:innen anlegen, Rollen vergeben und Zugänge bearbeiten.</p>
      </header>
      <div class="users-layout">
        <section class="users-panel">
          <h4>Bestehende Nutzer</h4>
          <div class="table-wrap users-table-wrap">
            <table class="users-table">
              <thead>
              <tr>
                <th>Name</th>
                <th>E-Mail</th>
                <th>Rolle</th>
                <th>Status</th>
                <th></th>
              </tr>
              </thead>
              <tbody id="usersTableBody"></tbody>
            </table>
          </div>
        </section>
        <section class="users-panel">
          <h4 id="userFormTitle">Neuen Nutzer anlegen</h4>
          <form class="modal-grid" id="userAdminForm">
            <input type="hidden" name="userId" id="userEditId" value="">
            <label>E-Mail<input name="email" id="userFormEmail" type="email" required autocomplete="off"></label>
            <label>Anzeigename<input name="displayName" id="userFormName" required autocomplete="off"></label>
            <label>Rolle
              <select name="role" id="userFormRole">
                <option value="user">Nutzer</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label class="checkbox-row">
              <input type="checkbox" name="active" id="userFormActive" checked>
              Zugang aktiv
            </label>
            <label class="full-width">Passwort<input name="password" id="userFormPassword" type="password" autocomplete="new-password" placeholder="Mind. 8 Zeichen"></label>
            <p class="muted full-width" id="userPasswordHint">Pflicht bei neuen Nutzern. Beim Bearbeiten leer lassen, um das Passwort beizubehalten.</p>
            <div class="modal-actions full-width user-form-actions">
              <button class="btn btn-ghost" type="button" id="userFormReset">Zurücksetzen</button>
              <button class="btn btn-primary" type="submit" id="userFormSubmit">Speichern</button>
            </div>
          </form>
        </section>
      </div>
      <footer class="modal-actions">
        <button class="btn btn-ghost" type="button" id="closeUsersModal">Schließen</button>
      </footer>
    </div>
  </dialog>

  <template id="dealCardTemplate">
    <article class="deal-card" draggable="true">
      <header>
        <h4></h4>
        <span class="priority-pill"></span>
      </header>
      <p class="deal-company"></p>
      <p class="deal-meta"></p>
      <p class="deal-next-step"></p>
      <p class="deal-audit"></p>
      <div class="tag-list"></div>
      <footer>
        <button data-action="edit" class="link-btn">Bearbeiten</button>
        <button data-action="delete" class="link-btn danger">Löschen</button>
      </footer>
    </article>
  </template>

  <script src="<?php echo htmlspecialchars(crm_asset_url('assets/crm.js'), ENT_QUOTES, 'UTF-8'); ?>"></script>
  <script src="<?php echo htmlspecialchars(crm_asset_url('assets/lead-lists.js'), ENT_QUOTES, 'UTF-8'); ?>"></script>
<?php endif; ?>
</body>
</html>
