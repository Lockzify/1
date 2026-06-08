<?php
declare(strict_types=1);

session_start();

require_once __DIR__ . '/lib/IndexingService.php';

header('Content-Type: application/json; charset=utf-8');

function json_out(array $payload, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}

function require_csrf(): void
{
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if ($token === '' && isset($_POST['csrf_token'])) {
        $token = (string) $_POST['csrf_token'];
    }
    $expected = (string) ($_SESSION['indexierung_csrf'] ?? '');
    if ($expected === '' || !hash_equals($expected, (string) $token)) {
        json_out(['ok' => false, 'error' => 'Ungültige Anfrage (CSRF).'], 403);
    }
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = isset($_GET['action']) ? (string) $_GET['action'] : '';

try {
    if ($action === 'csrf' && $method === 'GET') {
        if (!isset($_SESSION['indexierung_csrf'])) {
            $_SESSION['indexierung_csrf'] = bin2hex(random_bytes(32));
        }
        json_out(['ok' => true, 'csrfToken' => (string) $_SESSION['indexierung_csrf']]);
    }

    if ($action === 'status' && $method === 'GET') {
        $date = gmdate('Y-m-d');
        $settings = IndexingDatabase::getSettings();
        $domains = IndexingDatabase::listDomains();
        $pendingTotal = 0;
        foreach ($domains as $d) {
            $pendingTotal += (int) $d['pendingCount'];
        }
        json_out([
            'ok' => true,
            'connection' => IndexingService::connectionStatus(),
            'settings' => $settings,
            'quota' => [
                'date' => $date,
                'dailyLimit' => (int) $settings['dailyLimit'],
                'submittedToday' => IndexingDatabase::countSubmissionsForDate($date),
            ],
            'stats' => [
                'domainCount' => count($domains),
                'activeDomainCount' => count(array_filter($domains, static fn (array $d): bool => $d['active'])),
                'verifiedDomainCount' => count(array_filter($domains, static fn (array $d): bool => $d['active'] && $d['propertyVerified'])),
                'pendingUrls' => $pendingTotal,
            ],
            'domains' => $domains,
            'todayLog' => IndexingDatabase::listDailyLog($date, 30),
        ]);
    }

    if ($action === 'oauth_config' && $method === 'POST') {
        require_csrf();
        $raw = file_get_contents('php://input');
        $body = json_decode($raw ?: 'null', true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($body)) {
            json_out(['ok' => false, 'error' => 'Ungültige Nutzdaten.'], 422);
        }
        try {
            IndexingService::saveOAuthConfig(
                (string) ($body['clientId'] ?? ''),
                (string) ($body['clientSecret'] ?? '')
            );
        } catch (\Throwable $e) {
            json_out(['ok' => false, 'error' => $e->getMessage()], 422);
        }
        json_out([
            'ok' => true,
            'redirectUri' => GoogleApiAuth::redirectUri(),
            'connection' => IndexingService::connectionStatus(),
        ]);
    }

    if ($action === 'oauth_url' && $method === 'GET') {
        try {
            json_out(['ok' => true, 'url' => GoogleApiAuth::authorizationUrl(), 'redirectUri' => GoogleApiAuth::redirectUri()]);
        } catch (\Throwable $e) {
            json_out(['ok' => false, 'error' => $e->getMessage()], 422);
        }
    }

    if ($action === 'oauth_disconnect' && $method === 'POST') {
        require_csrf();
        IndexingService::disconnectOAuth();
        json_out(['ok' => true, 'connection' => IndexingService::connectionStatus()]);
    }

    if ($action === 'credentials' && $method === 'POST') {
        require_csrf();
        $raw = file_get_contents('php://input');
        $body = json_decode($raw ?: 'null', true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($body)) {
            json_out(['ok' => false, 'error' => 'Ungültige Nutzdaten.'], 422);
        }
        try {
            $email = IndexingService::saveCredentialsFromJson((string) ($body['serviceAccountJson'] ?? ''));
        } catch (\Throwable $e) {
            json_out(['ok' => false, 'error' => $e->getMessage()], 422);
        }
        json_out(['ok' => true, 'clientEmail' => $email, 'connection' => IndexingService::connectionStatus()]);
    }

    if ($action === 'settings_save' && $method === 'POST') {
        require_csrf();
        $raw = file_get_contents('php://input');
        $body = json_decode($raw ?: 'null', true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($body)) {
            json_out(['ok' => false, 'error' => 'Ungültige Nutzdaten.'], 422);
        }
        json_out(['ok' => true, 'settings' => IndexingDatabase::saveDailyLimit((int) ($body['dailyLimit'] ?? 10))]);
    }

    if ($action === 'domain_save' && $method === 'POST') {
        require_csrf();
        $raw = file_get_contents('php://input');
        $body = json_decode($raw ?: 'null', true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($body)) {
            json_out(['ok' => false, 'error' => 'Ungültige Nutzdaten.'], 422);
        }
        $id = isset($body['id']) ? (int) $body['id'] : null;
        if ($id !== null && $id <= 0) {
            $id = null;
        }
        try {
            $domain = IndexingDatabase::saveDomain($id, [
                'label' => (string) ($body['label'] ?? ''),
                'domain' => (string) ($body['domain'] ?? ''),
                'gscProperty' => (string) ($body['gscProperty'] ?? ''),
                'active' => !isset($body['active']) || (bool) $body['active'],
            ]);
        } catch (\Throwable $e) {
            json_out(['ok' => false, 'error' => $e->getMessage()], 422);
        }
        json_out(['ok' => true, 'domain' => $domain]);
    }

    if ($action === 'domain_delete' && $method === 'POST') {
        require_csrf();
        $raw = file_get_contents('php://input');
        $body = json_decode($raw ?: 'null', true, 512, JSON_THROW_ON_ERROR);
        $id = (int) (is_array($body) ? ($body['id'] ?? 0) : 0);
        if ($id <= 0) {
            json_out(['ok' => false, 'error' => 'Ungültige ID.'], 422);
        }
        try {
            IndexingDatabase::deleteDomain($id);
        } catch (\Throwable $e) {
            json_out(['ok' => false, 'error' => $e->getMessage()], 422);
        }
        json_out(['ok' => true]);
    }

    if ($action === 'domain_verify' && $method === 'POST') {
        require_csrf();
        $raw = file_get_contents('php://input');
        $body = json_decode($raw ?: 'null', true, 512, JSON_THROW_ON_ERROR);
        $id = (int) (is_array($body) ? ($body['id'] ?? 0) : 0);
        if ($id <= 0) {
            json_out(['ok' => false, 'error' => 'Ungültige ID.'], 422);
        }
        try {
            $result = IndexingService::verifyDomainProperty($id);
            $domain = IndexingDatabase::getDomain($id);
        } catch (\Throwable $e) {
            json_out(['ok' => false, 'error' => $e->getMessage()], 422);
        }
        json_out(['ok' => true, 'verification' => $result, 'domain' => $domain]);
    }

    if ($action === 'sitemap_upload' && $method === 'POST') {
        require_csrf();
        $id = (int) ($_POST['domainId'] ?? 0);
        if ($id <= 0) {
            json_out(['ok' => false, 'error' => 'Ungültige Domain-ID.'], 422);
        }
        if (!isset($_FILES['sitemap']) || !is_array($_FILES['sitemap']) || ($_FILES['sitemap']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            json_out(['ok' => false, 'error' => 'Sitemap-Upload fehlgeschlagen.'], 422);
        }
        $content = is_readable((string) $_FILES['sitemap']['tmp_name'])
            ? (string) file_get_contents((string) $_FILES['sitemap']['tmp_name'])
            : '';
        if ($content === '') {
            json_out(['ok' => false, 'error' => 'Datei ist leer.'], 422);
        }
        try {
            $import = IndexingService::importSitemap($id, $content, (string) ($_FILES['sitemap']['name'] ?? 'sitemap.xml'));
            $domain = IndexingDatabase::getDomain($id);
        } catch (\Throwable $e) {
            json_out(['ok' => false, 'error' => $e->getMessage()], 422);
        }
        json_out(['ok' => true, 'import' => $import, 'domain' => $domain]);
    }

    if ($action === 'run_batch' && $method === 'POST') {
        require_csrf();
        try {
            $result = IndexingService::runDailyBatch();
        } catch (\Throwable $e) {
            json_out(['ok' => false, 'error' => $e->getMessage()], 422);
        }
        json_out(['ok' => true, 'batch' => $result]);
    }

    json_out(['ok' => false, 'error' => 'Unbekannte Aktion.'], 404);
} catch (\Throwable $e) {
    json_out(['ok' => false, 'error' => 'Serverfehler.'], 500);
}
