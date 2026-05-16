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
                header('Location: ' . crm_home_url());
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
  <meta name="format-detection" content="telephone=no,address=no,email=no">
  <title>ADLIONS CRM</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <meta name="color-scheme" content="light">
  <link href="<?php echo htmlspecialchars(crm_asset_url('assets/crm.css'), ENT_QUOTES, 'UTF-8'); ?>" rel="stylesheet" type="text/css">
  <link href="<?php echo htmlspecialchars(crm_asset_url('assets/crm-saas.css'), ENT_QUOTES, 'UTF-8'); ?>" rel="stylesheet" type="text/css">
  <link href="<?php echo htmlspecialchars(crm_asset_url('assets/tracking.css'), ENT_QUOTES, 'UTF-8'); ?>" rel="stylesheet" type="text/css">
</head>
<body class="crm-body" x-apple-data-detectors="false">
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
  <div class="crm-shell">
  <?php
    $canAccessFulfilmentViews = CrmDatabase::canAccessFulfilmentViews($sessionUser);
    $crmMainViews = ['pipeline', 'customers', 'projects', 'activity', 'tracking'];
    if (!$canAccessFulfilmentViews) {
        $crmMainViews = array_values(array_filter(
            $crmMainViews,
            static fn (string $view): bool => $view !== 'customers' && $view !== 'projects'
        ));
    }
    $activeView = isset($_GET['view']) && in_array((string) $_GET['view'], $crmMainViews, true)
        ? (string) $_GET['view']
        : 'pipeline';
    require __DIR__ . '/partials/sidebar.php';
  ?>
  <div class="crm-main">
    <header class="crm-page-header">
      <h1 class="crm-page-title" id="crmPageTitle">Deals</h1>
      <div class="crm-page-actions">
        <div class="crm-page-actions-group hidden" id="toolbarCustomers">
          <button class="btn btn-primary" id="openCustomerModal" type="button">Kunde anlegen</button>
        </div>
        <div class="crm-page-actions-group hidden" id="toolbarProjects">
          <button class="btn btn-primary" id="openProjectModal" type="button">Projekt anlegen</button>
        </div>
        <div class="crm-page-actions-group" id="toolbarPipeline">
          <button class="btn btn-secondary" id="openPhaseModal" type="button">Phase</button>
          <button class="btn btn-primary" id="openDealModal" type="button">Deal</button>
        </div>
        <div class="crm-page-actions-group hidden" id="toolbarTracking"></div>
      </div>
    </header>

  <div id="viewPipeline" class="crm-view crm-view--fill">
  <main class="crm-layout" id="crmApp">
    <details class="pipeline-topbar-details" id="pipelineTopbarDetails">
      <summary class="pipeline-topbar-summary">
        <span class="pipeline-topbar-summary__title">Kennzahlen &amp; Filter</span>
        <span class="pipeline-topbar-summary__chev" aria-hidden="true"></span>
      </summary>
      <div class="pipeline-topbar-body">
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
          <div class="filter-actions">
            <button class="btn btn-secondary" id="exportJson" type="button">Export JSON</button>
            <label class="btn btn-secondary import-label">
              Import JSON
              <input type="file" id="importJson" accept="application/json" hidden>
            </label>
            <button class="btn btn-ghost" id="resetFilters" type="button">Filter zurücksetzen</button>
          </div>
        </section>
      </div>
    </details>

    <section class="board-section">
      <div id="pipelineBoard" class="pipeline-board"></div>
    </section>
  </main>
  </div>

  <div id="viewCustomers" class="crm-view hidden">
    <main class="crm-layout crm-single-panel">
      <article class="panel customers-panel-full">
        <header class="panel-head panel-head--split">
          <div>
            <h2>Kunden</h2>
            <p class="panel-subtitle">Alle Kunden verwalten und Projekten zuordnen.</p>
          </div>
          <input id="customerSearchInput" type="search" placeholder="Kunde suchen …" aria-label="Kunden suchen">
        </header>
        <div class="customers-stats" id="customersStats"></div>
        <div class="table-wrap customers-table-wrap">
          <table class="customers-table">
            <thead>
              <tr>
                <th>Firma</th>
                <th>Ansprechpartner</th>
                <th>Kontakt</th>
                <th>Status</th>
                <th>Projekte</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="customersTableBody"></tbody>
          </table>
        </div>
        <p class="empty-hint hidden" id="customersEmptyHint">Noch keine Kunden – oben „+ Kunde anlegen“ wählen.</p>
      </article>
    </main>
  </div>

  <div id="viewProjects" class="crm-view hidden">
    <main class="crm-layout crm-projects-layout">
      <section class="projects-overview panel">
        <header class="panel-head panel-head--plain">
          <h2>Aktive Projekte</h2>
          <p class="panel-subtitle">Laufende und geplante Aufträge im Überblick.</p>
        </header>
        <div class="stats-grid projects-stats-grid" id="projectsStats"></div>
        <div class="active-projects-grid" id="activeProjectsGrid"></div>
        <p class="empty-hint hidden" id="activeProjectsEmpty">Keine aktiven Projekte.</p>
      </section>
      <article class="panel projects-list-panel">
        <header class="panel-head panel-head--split">
          <div>
            <h2>Alle Projekte</h2>
            <p class="panel-subtitle">Projektdokumentation mit Zeitraum und Leistungen.</p>
          </div>
          <div class="projects-filter-row">
            <select id="projectStatusFilter" aria-label="Status filtern">
              <option value="">Alle Status</option>
              <option value="aktiv">Aktiv</option>
              <option value="geplant">Geplant</option>
              <option value="pausiert">Pausiert</option>
              <option value="abgeschlossen">Abgeschlossen</option>
            </select>
            <input id="projectSearchInput" type="search" placeholder="Projekt suchen …" aria-label="Projekte suchen">
          </div>
        </header>
        <div class="table-wrap projects-table-wrap">
          <table class="projects-table">
            <thead>
              <tr>
                <th>Projekt</th>
                <th>Kunde</th>
                <th>Zeitraum</th>
                <th>Status</th>
                <th>Fortschritt</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="projectsTableBody"></tbody>
          </table>
        </div>
        <p class="empty-hint hidden" id="projectsEmptyHint">Noch keine Projekte angelegt.</p>
      </article>
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


  <div id="viewTracking" class="crm-view hidden">
    <main class="crm-layout crm-single-panel">
      <article class="panel tracking-panel-full">
        <header class="panel-head panel-head--split tracking-panel-head">
          <div>
            <h2>Tages-Tracking</h2>
            <p class="panel-subtitle" id="trackingDateLabel">Tagesübersicht: alle Nutzer mit Anrufen, Terminen und Abschlüssen.</p>
            <p class="tracking-readonly-hint muted hidden" id="trackingReadOnlyHint">Nur Administratoren können Einträge bearbeiten. Bitte einen Admin bitten, Ihre Nutzerrolle anzupassen.</p>
            <p class="tracking-edit-banner hidden" id="trackingEditBanner">
              <strong>Daten erfassen:</strong> Tag wählen, dann in die <strong>grün umrandeten Felder</strong> tippen – wird automatisch gespeichert.
            </p>
          </div>
          <div class="tracking-head-actions">
            <div class="tracking-date-nav" role="group" aria-label="Tag auswählen">
              <button class="btn btn-ghost" type="button" id="trackingPrevDay" title="Vorheriger Tag" aria-label="Vorheriger Tag">←</button>
              <label class="tracking-date-picker">
                <span class="tracking-date-picker__label">Tag</span>
                <input type="date" id="trackingDate" class="tracking-date-input" aria-label="Tag im Kalender wählen">
                <button type="button" class="btn btn-ghost tracking-date-calendar-btn" id="trackingOpenCalendar" title="Kalender öffnen" aria-label="Kalender öffnen">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                </button>
              </label>
              <button class="btn btn-ghost" type="button" id="trackingNextDay" title="Nächster Tag" aria-label="Nächster Tag">→</button>
              <button class="btn btn-secondary" type="button" id="trackingToday">Heute</button>
              <button type="button" class="btn btn-primary tracking-capture-btn hidden" id="trackingOpenEntry">Daten für diesen Tag erfassen</button>
            </div>
            <p class="tracking-save-hint muted hidden" id="trackingSaveHint" aria-live="polite"></p>
          </div>
        </header>
        <h3 class="tracking-section-title">Alle Nutzer am gewählten Tag</h3>
        <div class="table-wrap tracking-table-wrap">
          <table class="tracking-table">
            <thead>
              <tr>
                <th>Nutzer</th>
                <th>Anrufe</th>
                <th title="Termine gelegt">Termine</th>
                <th>Sales Calls</th>
                <th>Abschlüsse</th>
              </tr>
            </thead>
            <tbody id="trackingTableBody"></tbody>
            <tfoot>
              <tr class="tracking-totals-row">
                <th>Gesamt</th>
                <td id="trackingTotalCalls">0</td>
                <td id="trackingTotalResults">0</td>
                <td id="trackingTotalSalesCalls">0</td>
                <td id="trackingTotalClosures">0</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="empty-hint hidden" id="trackingEmptyHint">Keine Nutzer im System – bitte zuerst unter „Nutzer“ anlegen.</p>

        <section class="tracking-charts" id="trackingCharts" aria-label="Tracking-Auswertung">
          <article class="tracking-chart-card">
            <header class="tracking-chart-card__head">
              <h3>Termine gelegt</h3>
              <p class="muted tracking-chart-card__sub" id="trackingPieSubtitle">Verteilung nach Nutzer</p>
            </header>
            <div class="tracking-chart-wrap">
              <canvas id="trackingPieChart" role="img" aria-label="Kreisdiagramm Termine nach Nutzer"></canvas>
            </div>
            <p class="tracking-chart-empty hidden" id="trackingPieEmpty">Für diesen Tag sind noch keine Termine erfasst.</p>
          </article>
          <article class="tracking-chart-card tracking-chart-card--wide">
            <header class="tracking-chart-card__head">
              <h3>Gelegte Termine im Verlauf</h3>
              <p class="muted tracking-chart-card__sub" id="trackingClosuresRangeLabel">Letzte 30 Tage</p>
            </header>
            <div class="tracking-chart-wrap tracking-chart-wrap--tall">
              <canvas id="trackingClosuresChart" role="img" aria-label="Diagramm gelegte Termine nach Tag"></canvas>
            </div>
            <p class="tracking-chart-empty hidden" id="trackingClosuresEmpty">Im gewählten Zeitraum keine Termine erfasst.</p>
          </article>
        </section>
      </article>
    </main>
  </div>

  </div><!-- .crm-main -->
  </div><!-- .crm-shell -->

  <dialog id="customerModal" class="modal modal-wide">
    <form method="dialog" class="modal-card" id="customerForm">
      <header>
        <h3 id="customerModalTitle">Kunde anlegen</h3>
      </header>
      <div class="modal-grid">
        <label>Firma<input name="company" required placeholder="z. B. Muster GmbH"></label>
        <label>Ansprechpartner<input name="contactName" placeholder="z. B. Max Mustermann"></label>
        <label>E-Mail<input name="email" type="email"></label>
        <label>Telefon<input name="phone"></label>
        <label>Straße<input name="street"></label>
        <label>PLZ<input name="zip"></label>
        <label>Ort<input name="city"></label>
        <label>Status
          <select name="status">
            <option value="aktiv">Aktiv</option>
            <option value="inaktiv">Inaktiv</option>
          </select>
        </label>
        <label class="full-width">Notizen<textarea name="notes" rows="3"></textarea></label>
        <div class="full-width customer-projects-panel hidden" id="customerProjectsPanel">
          <h4 class="customer-projects-heading">Verknüpfte Projekte</h4>
          <ul class="customer-linked-projects" id="customerLinkedProjectsList"></ul>
          <p class="muted customer-projects-empty hidden" id="customerProjectsEmpty">Noch keine Projekte mit diesem Kunden verknüpft.</p>
          <div class="customer-link-project-row">
            <label for="linkProjectToCustomerSelect">Bestehendes Projekt verknüpfen</label>
            <div class="customer-link-project-actions">
              <select id="linkProjectToCustomerSelect" aria-label="Projekt auswählen"></select>
              <button class="btn btn-secondary" type="button" id="linkProjectToCustomerBtn">Verknüpfen</button>
            </div>
          </div>
          <button class="btn btn-secondary customer-add-project-btn" type="button" id="addProjectForCustomerBtn">+ Neues Projekt für diesen Kunden</button>
        </div>
      </div>
      <footer class="modal-actions">
        <button class="btn btn-ghost" value="cancel">Abbrechen</button>
        <button class="btn btn-primary" type="submit">Speichern</button>
      </footer>
    </form>
  </dialog>

  <dialog id="projectModal" class="modal modal-wide">
    <form method="dialog" class="modal-card" id="projectForm">
      <header>
        <h3 id="projectModalTitle">Projekt anlegen</h3>
      </header>
      <div class="modal-grid">
        <label>Projektname<input name="name" required placeholder="z. B. Website Relaunch"></label>
        <label>Kunde (Verknüpfung)<select name="customerId" id="projectCustomerSelect"><option value="">— Kein Kunde —</option></select></label>
        <label>Start<input name="startDate" type="date"></label>
        <label>Ende<input name="endDate" type="date"></label>
        <label>Status
          <select name="status">
            <option value="geplant">Geplant</option>
            <option value="aktiv">Aktiv</option>
            <option value="pausiert">Pausiert</option>
            <option value="abgeschlossen">Abgeschlossen</option>
          </select>
        </label>
        <label>Verantwortlich<input name="owner" placeholder="z. B. Alex"></label>
        <label class="full-width">Kurzbeschreibung<textarea name="description" rows="2" placeholder="Ziel und Umfang des Projekts"></textarea></label>
        <label class="full-width">Leistungen &amp; Aufgaben (eine Zeile pro Punkt)<textarea name="workItemsText" id="projectWorkItemsText" rows="5" placeholder="Konzeption&#10;Design&#10;Umsetzung&#10;Reporting"></textarea></label>
        <label class="full-width">Projektdokumentation<textarea name="documentation" rows="6" placeholder="Ablauf, Besonderheiten, Abstimmungen, Ergebnisse …"></textarea></label>
      </div>
      <footer class="modal-actions">
        <button class="btn btn-ghost" value="cancel">Abbrechen</button>
        <button class="btn btn-primary" type="submit">Speichern</button>
      </footer>
    </form>
  </dialog>

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
                <option value="fulfilment">Fulfilment</option>
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

  <dialog id="trackingEntryModal" class="modal modal-wide">
    <form method="dialog" class="modal-card" id="trackingEntryForm">
      <header>
        <h3>Tracking erfassen</h3>
        <p class="muted" id="trackingEntryModalDate">Kennzahlen für den gewählten Tag</p>
      </header>
      <p class="tracking-entry-intro muted">Tragen Sie die Zahlen pro Nutzer ein – wird automatisch gespeichert.</p>
      <div class="table-wrap tracking-entry-table-wrap">
        <table class="tracking-entry-table">
          <thead>
            <tr>
              <th>Nutzer</th>
              <th>Anrufe</th>
              <th>Termine</th>
              <th>Sales Calls</th>
              <th>Abschlüsse</th>
            </tr>
          </thead>
          <tbody id="trackingEntryModalBody"></tbody>
        </table>
      </div>
      <p class="empty-hint hidden" id="trackingEntryModalEmpty">Keine aktiven Nutzer – bitte zuerst unter „Nutzer“ anlegen.</p>
      <footer class="modal-actions">
        <p class="tracking-save-hint muted hidden" id="trackingEntryModalSaveHint" aria-live="polite"></p>
        <button type="button" class="btn btn-primary" id="trackingEntryClose">Schließen</button>
      </footer>
    </form>
  </dialog>

  <dialog id="incomingCallModal" class="modal modal--intent-announce">
    <div class="modal-card modal-card--intent-announce">
      <header>
        <h3>Rückruf aus Leads</h3>
        <p class="muted">Telefonnummer an dieses Konto übermittelt. Auf dem Handy: „Anrufen“ startet die native Telefon-App.</p>
      </header>
      <p class="incoming-call-number crm-no-autolink" id="incomingCallNumber" x-apple-data-detectors="false" translate="no" aria-live="polite"></p>
      <footer class="modal-actions modal-actions--intent-call">
        <button type="button" class="btn btn-ghost" id="incomingCallDismiss">Schließen</button>
        <button type="button" class="btn btn-secondary" id="incomingCallCopy">Nummer kopieren</button>
        <a class="btn btn-primary hidden" id="incomingCallDial" href="#">Anrufen</a>
      </footer>
    </div>
  </dialog>

  <div id="crmAppToast" class="crm-app-toast hidden" role="status" aria-live="polite"></div>

  <template id="dealCardTemplate">
    <article class="deal-card" draggable="true">
      <header>
        <h4></h4>
      </header>
      <p class="deal-company"></p>
      <p class="deal-meta"></p>
      <p class="deal-next-step"></p>
      <p class="deal-audit"></p>
      <div class="tag-list"></div>
      <footer>
        <button data-action="edit" class="link-btn deal-open-btn">Deal öffnen</button>
      </footer>
    </article>
  </template>

  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js" crossorigin="anonymous"></script>
  <script src="<?php echo htmlspecialchars(crm_asset_url('assets/crm.js'), ENT_QUOTES, 'UTF-8'); ?>"></script>
<?php endif; ?>
</body>
</html>
