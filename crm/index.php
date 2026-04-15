<?php
declare(strict_types=1);

session_start();

const CRM_SESSION_KEY = 'adlions_crm_authenticated';
const CRM_ATTEMPTS_KEY = 'adlions_crm_login_attempts';
const CRM_LOCK_KEY = 'adlions_crm_lock_until';

if (!isset($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

$csrfToken = $_SESSION['csrf_token'];
$loginError = '';

$expectedPassword = getenv('CRM_PASSWORD') ?: 'Seo2026!?';
$lockUntil = (int) ($_SESSION[CRM_LOCK_KEY] ?? 0);
$isLocked = $lockUntil > time();

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
        header('Location: /crm/');
        exit;
    }

    if (!$isLocked && isset($_POST['password'])) {
        $password = (string) $_POST['password'];
        $isValid = hash_equals($expectedPassword, $password);

        if ($isValid) {
            session_regenerate_id(true);
            $_SESSION[CRM_SESSION_KEY] = true;
            $_SESSION[CRM_ATTEMPTS_KEY] = 0;
            $_SESSION[CRM_LOCK_KEY] = 0;
            header('Location: /crm/');
            exit;
        }

        $attempts = ((int) ($_SESSION[CRM_ATTEMPTS_KEY] ?? 0)) + 1;
        $_SESSION[CRM_ATTEMPTS_KEY] = $attempts;

        if ($attempts >= 5) {
            $lockSeconds = 10 * 60;
            $_SESSION[CRM_LOCK_KEY] = time() + $lockSeconds;
            $loginError = 'Zu viele Fehlversuche. Bitte in 10 Minuten erneut versuchen.';
        } else {
            $remaining = 5 - $attempts;
            $loginError = "Passwort falsch. Noch {$remaining} Versuche.";
        }
    } elseif ($isLocked) {
        $wait = max(1, $lockUntil - time());
        $minutes = (int) ceil($wait / 60);
        $loginError = "Login vorübergehend gesperrt. Bitte in ca. {$minutes} Minute(n) erneut versuchen.";
    }
}

$isAuthenticated = (bool) ($_SESSION[CRM_SESSION_KEY] ?? false);
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
  <link href="/crm/assets/crm.css" rel="stylesheet" type="text/css">
</head>
<body class="crm-body">
<?php if (!$isAuthenticated): ?>
  <main class="login-page">
    <section class="login-card">
      <div class="brand-block">
        <span class="brand-pill">ADLIONS CRM</span>
        <h1>Willkommen im Vertriebscockpit</h1>
        <p>Serverseitig geschützt mit Session-Login. Bitte Passwort eingeben, um das CRM zu öffnen.</p>
      </div>
      <form method="post" class="login-form" autocomplete="off">
        <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8'); ?>">
        <label for="password">Passwort</label>
        <input id="password" name="password" type="password" required autofocus>
        <?php if ($loginError !== ''): ?>
          <p class="error-message"><?php echo htmlspecialchars($loginError, ENT_QUOTES, 'UTF-8'); ?></p>
        <?php endif; ?>
        <button type="submit">CRM entsperren</button>
        <p class="hint-message">Tipp: Passwort über Server-Env `CRM_PASSWORD` setzen.</p>
      </form>
    </section>
  </main>
<?php else: ?>
  <header class="topbar">
    <div class="topbar-left">
      <span class="brand-pill">ADLIONS CRM</span>
      <h1>Pipeline & Kontakte</h1>
    </div>
    <div class="topbar-right">
      <button class="btn btn-primary" id="openDealModal">+ Deal anlegen</button>
      <button class="btn btn-secondary" id="openContactModal">+ Kontakt anlegen</button>
      <button class="btn btn-secondary" id="openPhaseModal">+ Phase anlegen</button>
      <form method="post">
        <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8'); ?>">
        <button class="btn btn-ghost" type="submit" name="logout" value="1">Logout</button>
      </form>
    </div>
  </header>

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
        <p>Aktive Kontakte</p>
        <strong id="statContactCount">0</strong>
      </article>
      <article class="stat-card">
        <p>Gewinnquote</p>
        <strong id="statWinRate">0%</strong>
      </article>
    </section>

    <section class="filter-bar">
      <div class="filter-group">
        <label for="searchInput">Suche</label>
        <input id="searchInput" type="search" placeholder="Deal, Firma, Kontakt, Tag ...">
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

    <section class="grid-two">
      <article class="panel">
        <header class="panel-head">
          <h2>Kontakte</h2>
          <input id="contactSearchInput" type="search" placeholder="Kontakt suchen ...">
        </header>
        <div class="table-wrap">
          <table>
            <thead>
            <tr>
              <th>Name</th>
              <th>Firma</th>
              <th>E-Mail</th>
              <th>Telefon</th>
              <th>Status</th>
              <th>Aktion</th>
            </tr>
            </thead>
            <tbody id="contactTableBody"></tbody>
          </table>
        </div>
      </article>
      <article class="panel">
        <header class="panel-head">
          <h2>Aktivitätsfeed</h2>
        </header>
        <ul class="activity-feed" id="activityFeed"></ul>
      </article>
    </section>
  </main>

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
        <label>Kontakt<select name="contactId" id="dealContactSelect"></select></label>
        <label>Nächster Schritt<input name="nextStep" placeholder="z. B. Angebot senden"></label>
        <label>Fällig am<input name="dueDate" type="date"></label>
        <label>Abschluss-Wahrscheinlichkeit %<input name="probability" type="number" min="0" max="100" step="5"></label>
        <label class="full-width">Tags (Komma-getrennt)<input name="tags" placeholder="B2B, Social Ads"></label>
        <label class="full-width">Notizen<textarea name="notes" rows="4"></textarea></label>
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

  <template id="dealCardTemplate">
    <article class="deal-card" draggable="true">
      <header>
        <h4></h4>
        <span class="priority-pill"></span>
      </header>
      <p class="deal-company"></p>
      <p class="deal-meta"></p>
      <p class="deal-next-step"></p>
      <div class="tag-list"></div>
      <footer>
        <button data-action="edit" class="link-btn">Bearbeiten</button>
        <button data-action="delete" class="link-btn danger">Löschen</button>
      </footer>
    </article>
  </template>

  <script src="/crm/assets/crm.js"></script>
<?php endif; ?>
</body>
</html>
