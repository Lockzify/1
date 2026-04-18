<?php
declare(strict_types=1);

session_start();

require_once __DIR__ . '/lib/CrmDatabase.php';

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
    $expected = (string) ($_SESSION['csrf_token'] ?? '');
    if ($expected === '' || !hash_equals($expected, (string) $token)) {
        json_out(['ok' => false, 'error' => 'Ungültige Anfrage (CSRF).'], 403);
    }
}

function current_user(): array
{
    $id = (int) ($_SESSION['crm_user_id'] ?? 0);
    if ($id <= 0) {
        json_out(['ok' => false, 'error' => 'Nicht angemeldet.'], 401);
    }
    $user = CrmDatabase::findUserById($id);
    if (!$user || !(int) $user['active']) {
        unset($_SESSION['crm_user_id']);
        json_out(['ok' => false, 'error' => 'Sitzung ungültig.'], 401);
    }
    return $user;
}

function user_public(array $user): array
{
    return [
        'id' => (int) $user['id'],
        'email' => (string) $user['email'],
        'displayName' => (string) $user['display_name'],
        'role' => (string) $user['role'],
    ];
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = isset($_GET['action']) ? (string) $_GET['action'] : '';

try {
    if ($action === 'me' && $method === 'GET') {
        $user = current_user();
        json_out(['ok' => true, 'user' => user_public($user)]);
    }

    if ($action === 'state' && $method === 'GET') {
        current_user();
        $row = CrmDatabase::getStatePayload();
        if ($row === null) {
            json_out(['ok' => true, 'state' => null, 'updated_at' => null]);
        }
        json_out(['ok' => true, 'state' => $row['state'], 'updated_at' => $row['updated_at']]);
    }

    if ($action === 'state' && $method === 'POST') {
        require_csrf();
        current_user();
        $raw = file_get_contents('php://input');
        $body = json_decode($raw ?: 'null', true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($body) || !isset($body['state']) || !is_array($body['state'])) {
            json_out(['ok' => false, 'error' => 'Ungültige Nutzdaten.'], 422);
        }
        $state = $body['state'];
        foreach (['phases', 'deals', 'contacts'] as $key) {
            if (!isset($state[$key]) || !is_array($state[$key])) {
                json_out(['ok' => false, 'error' => "State fehlt: {$key}"], 422);
            }
        }
        if (!isset($state['activities']) || !is_array($state['activities'])) {
            $state['activities'] = [];
        }
        CrmDatabase::saveStatePayload($state);
        json_out(['ok' => true]);
    }

    if ($action === 'users' && $method === 'GET') {
        $user = current_user();
        if (($user['role'] ?? '') !== 'admin') {
            json_out(['ok' => false, 'error' => 'Keine Berechtigung.'], 403);
        }
        $list = CrmDatabase::listUsers();
        $out = array_map(static function (array $row): array {
            return [
                'id' => (int) $row['id'],
                'email' => (string) $row['email'],
                'displayName' => (string) $row['display_name'],
                'role' => (string) $row['role'],
                'active' => (bool) (int) $row['active'],
                'createdAt' => (string) $row['created_at'],
                'updatedAt' => (string) $row['updated_at'],
            ];
        }, $list);
        json_out(['ok' => true, 'users' => $out]);
    }

    if ($action === 'users_create' && $method === 'POST') {
        require_csrf();
        $actor = current_user();
        if (($actor['role'] ?? '') !== 'admin') {
            json_out(['ok' => false, 'error' => 'Keine Berechtigung.'], 403);
        }
        $raw = file_get_contents('php://input');
        $body = json_decode($raw ?: 'null', true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($body)) {
            json_out(['ok' => false, 'error' => 'Ungültige Nutzdaten.'], 422);
        }
        $email = trim((string) ($body['email'] ?? ''));
        $name = trim((string) ($body['displayName'] ?? ''));
        $password = (string) ($body['password'] ?? '');
        $role = (string) ($body['role'] ?? 'user');
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            json_out(['ok' => false, 'error' => 'Bitte gültige E-Mail angeben.'], 422);
        }
        if ($name === '') {
            json_out(['ok' => false, 'error' => 'Bitte Namen angeben.'], 422);
        }
        if (strlen($password) < 8) {
            json_out(['ok' => false, 'error' => 'Passwort mindestens 8 Zeichen.'], 422);
        }
        if (CrmDatabase::findUserByEmail($email)) {
            json_out(['ok' => false, 'error' => 'Diese E-Mail ist bereits registriert.'], 409);
        }
        $id = CrmDatabase::createUser($email, $name, $password, $role);
        json_out(['ok' => true, 'userId' => $id]);
    }

    if ($action === 'users_update' && $method === 'POST') {
        require_csrf();
        $actor = current_user();
        if (($actor['role'] ?? '') !== 'admin') {
            json_out(['ok' => false, 'error' => 'Keine Berechtigung.'], 403);
        }
        $raw = file_get_contents('php://input');
        $body = json_decode($raw ?: 'null', true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($body)) {
            json_out(['ok' => false, 'error' => 'Ungültige Nutzdaten.'], 422);
        }
        $id = (int) ($body['id'] ?? 0);
        if ($id <= 0) {
            json_out(['ok' => false, 'error' => 'Ungültige Nutzer-ID.'], 422);
        }
        $target = CrmDatabase::findUserById($id);
        if (!$target) {
            json_out(['ok' => false, 'error' => 'Nutzer nicht gefunden.'], 404);
        }
        $displayName = array_key_exists('displayName', $body) ? (string) $body['displayName'] : null;
        $email = array_key_exists('email', $body) ? (string) $body['email'] : null;
        $role = array_key_exists('role', $body) ? (string) $body['role'] : null;
        $active = array_key_exists('active', $body) ? (bool) $body['active'] : null;
        $newPassword = array_key_exists('password', $body) ? (string) $body['password'] : null;

        if ($email !== null) {
            $email = trim($email);
            if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                json_out(['ok' => false, 'error' => 'Bitte gültige E-Mail angeben.'], 422);
            }
            $other = CrmDatabase::findUserByEmail($email);
            if ($other && (int) $other['id'] !== $id) {
                json_out(['ok' => false, 'error' => 'Diese E-Mail wird bereits verwendet.'], 409);
            }
        }

        if ($newPassword !== null && $newPassword !== '' && strlen($newPassword) < 8) {
            json_out(['ok' => false, 'error' => 'Passwort mindestens 8 Zeichen.'], 422);
        }

        if ($id === (int) $actor['id'] && $active === false) {
            json_out(['ok' => false, 'error' => 'Sie können sich nicht selbst deaktivieren.'], 422);
        }

        $willBeAdmin = $role === null ? ($target['role'] === 'admin') : ($role === 'admin');
        $willBeActive = $active === null ? ((int) $target['active'] === 1) : $active;

        if ($target['role'] === 'admin' && (int) $target['active'] === 1) {
            $activeAdminRows = array_values(array_filter(
                CrmDatabase::listUsers(),
                static fn (array $u): bool => $u['role'] === 'admin' && (int) $u['active'] === 1
            ));
            if (
                count($activeAdminRows) === 1
                && (int) $activeAdminRows[0]['id'] === $id
                && (!$willBeActive || !$willBeAdmin)
            ) {
                json_out(['ok' => false, 'error' => 'Der letzte aktive Admin kann nicht entfernt oder herabgestuft werden.'], 422);
            }
        }

        CrmDatabase::updateUser(
            $id,
            $displayName,
            $email,
            $role,
            $active === null ? null : ($active ? 1 : 0),
            ($newPassword !== null && $newPassword !== '') ? $newPassword : null
        );
        json_out(['ok' => true]);
    }

    if ($action === 'lead_variables' && $method === 'GET') {
        current_user();
        json_out(['ok' => true, 'variables' => CrmDatabase::listLeadVariables()]);
    }

    if ($action === 'lead_variable_create' && $method === 'POST') {
        require_csrf();
        $actor = current_user();
        if (($actor['role'] ?? '') !== 'admin') {
            json_out(['ok' => false, 'error' => 'Nur Administratoren können globale Felder anlegen.'], 403);
        }
        $raw = file_get_contents('php://input');
        $body = json_decode($raw ?: 'null', true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($body)) {
            json_out(['ok' => false, 'error' => 'Ungültige Nutzdaten.'], 422);
        }
        $key = (string) ($body['key'] ?? '');
        $label = (string) ($body['label'] ?? '');
        try {
            $newId = CrmDatabase::createLeadVariable($key, $label);
        } catch (\PDOException $e) {
            json_out(['ok' => false, 'error' => 'Dieser technische Name ist bereits vergeben.'], 409);
        } catch (\InvalidArgumentException $e) {
            json_out(['ok' => false, 'error' => $e->getMessage()], 422);
        }
        json_out(['ok' => true, 'id' => $newId]);
    }

    if ($action === 'lead_variable_update' && $method === 'POST') {
        require_csrf();
        $actor = current_user();
        if (($actor['role'] ?? '') !== 'admin') {
            json_out(['ok' => false, 'error' => 'Nur Administratoren können globale Felder bearbeiten.'], 403);
        }
        $raw = file_get_contents('php://input');
        $body = json_decode($raw ?: 'null', true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($body)) {
            json_out(['ok' => false, 'error' => 'Ungültige Nutzdaten.'], 422);
        }
        $id = (int) ($body['id'] ?? 0);
        $label = (string) ($body['label'] ?? '');
        $sortOrder = (int) ($body['sortOrder'] ?? 0);
        if ($id <= 0) {
            json_out(['ok' => false, 'error' => 'Ungültige Feld-ID.'], 422);
        }
        try {
            CrmDatabase::updateLeadVariable($id, $label, $sortOrder);
        } catch (\InvalidArgumentException $e) {
            json_out(['ok' => false, 'error' => $e->getMessage()], 422);
        }
        json_out(['ok' => true]);
    }

    if ($action === 'lead_variable_delete' && $method === 'POST') {
        require_csrf();
        $actor = current_user();
        if (($actor['role'] ?? '') !== 'admin') {
            json_out(['ok' => false, 'error' => 'Nur Administratoren können globale Felder löschen.'], 403);
        }
        $raw = file_get_contents('php://input');
        $body = json_decode($raw ?: 'null', true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($body)) {
            json_out(['ok' => false, 'error' => 'Ungültige Nutzdaten.'], 422);
        }
        $id = (int) ($body['id'] ?? 0);
        if ($id <= 0) {
            json_out(['ok' => false, 'error' => 'Ungültige Feld-ID.'], 422);
        }
        if (CrmDatabase::countLeadVariables() <= 1) {
            json_out(['ok' => false, 'error' => 'Das letzte Feld darf nicht gelöscht werden.'], 422);
        }
        try {
            CrmDatabase::deleteLeadVariable($id);
        } catch (\InvalidArgumentException $e) {
            json_out(['ok' => false, 'error' => $e->getMessage()], 404);
        }
        json_out(['ok' => true]);
    }

    if ($action === 'lead_variable_move' && $method === 'POST') {
        require_csrf();
        $actor = current_user();
        if (($actor['role'] ?? '') !== 'admin') {
            json_out(['ok' => false, 'error' => 'Keine Berechtigung.'], 403);
        }
        $raw = file_get_contents('php://input');
        $body = json_decode($raw ?: 'null', true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($body)) {
            json_out(['ok' => false, 'error' => 'Ungültige Nutzdaten.'], 422);
        }
        $id = (int) ($body['id'] ?? 0);
        $dir = (string) ($body['direction'] ?? '');
        if ($id <= 0 || !in_array($dir, ['up', 'down'], true)) {
            json_out(['ok' => false, 'error' => 'Ungültige Anfrage.'], 422);
        }
        $vars = CrmDatabase::listLeadVariables();
        $idx = -1;
        foreach ($vars as $i => $v) {
            if ($v['id'] === $id) {
                $idx = $i;
                break;
            }
        }
        if ($idx < 0) {
            json_out(['ok' => false, 'error' => 'Feld nicht gefunden.'], 404);
        }
        $swap = $dir === 'up' ? $idx - 1 : $idx + 1;
        if ($swap < 0 || $swap >= count($vars)) {
            json_out(['ok' => true]);
        }
        $a = $vars[$idx];
        $b = $vars[$swap];
        try {
            CrmDatabase::updateLeadVariable($a['id'], $a['label'], $b['sortOrder']);
            CrmDatabase::updateLeadVariable($b['id'], $b['label'], $a['sortOrder']);
        } catch (\InvalidArgumentException $e) {
            json_out(['ok' => false, 'error' => $e->getMessage()], 422);
        }
        json_out(['ok' => true]);
    }

    if ($action === 'lead_lists' && $method === 'GET') {
        $user = current_user();
        $items = CrmDatabase::listLeadListsForUser((int) $user['id']);
        json_out(['ok' => true, 'lists' => $items]);
    }

    if ($action === 'lead_list' && $method === 'GET') {
        $user = current_user();
        $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
        if ($id <= 0) {
            json_out(['ok' => false, 'error' => 'Ungültige Listen-ID.'], 422);
        }
        $list = CrmDatabase::getLeadListForUser($id, (int) $user['id']);
        if ($list === null) {
            json_out(['ok' => false, 'error' => 'Liste nicht gefunden.'], 404);
        }
        json_out(['ok' => true, 'list' => $list, 'variables' => CrmDatabase::listLeadVariables()]);
    }

    if ($action === 'lead_list_save' && $method === 'POST') {
        require_csrf();
        $user = current_user();
        $raw = file_get_contents('php://input');
        $body = json_decode($raw ?: 'null', true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($body)) {
            json_out(['ok' => false, 'error' => 'Ungültige Nutzdaten.'], 422);
        }
        $name = trim((string) ($body['name'] ?? ''));
        if ($name === '' || strlen($name) > 200) {
            json_out(['ok' => false, 'error' => 'Bitte einen Listen-Namen angeben (max. 200 Zeichen).'], 422);
        }
        $rows = $body['rows'] ?? null;
        if (!is_array($rows)) {
            json_out(['ok' => false, 'error' => 'Zeilen müssen ein Array sein.'], 422);
        }
        if (count($rows) > 8000) {
            json_out(['ok' => false, 'error' => 'Maximal 8000 Zeilen pro Liste.'], 422);
        }
        $normalizedRows = normalize_lead_rows_for_save($rows);
        $listId = isset($body['id']) ? (int) $body['id'] : 0;
        if ($listId > 0) {
            try {
                CrmDatabase::updateLeadList((int) $user['id'], $listId, $name, $normalizedRows);
            } catch (\InvalidArgumentException $e) {
                json_out(['ok' => false, 'error' => $e->getMessage()], 404);
            }
            json_out(['ok' => true, 'id' => $listId]);
        }
        $newId = CrmDatabase::createLeadList((int) $user['id'], $name, $normalizedRows);
        json_out(['ok' => true, 'id' => $newId]);
    }

    if ($action === 'lead_list_delete' && $method === 'POST') {
        require_csrf();
        $user = current_user();
        $raw = file_get_contents('php://input');
        $body = json_decode($raw ?: 'null', true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($body)) {
            json_out(['ok' => false, 'error' => 'Ungültige Nutzdaten.'], 422);
        }
        $id = (int) ($body['id'] ?? 0);
        if ($id <= 0) {
            json_out(['ok' => false, 'error' => 'Ungültige Listen-ID.'], 422);
        }
        try {
            CrmDatabase::deleteLeadList((int) $user['id'], $id);
        } catch (\InvalidArgumentException $e) {
            json_out(['ok' => false, 'error' => $e->getMessage()], 404);
        }
        json_out(['ok' => true]);
    }

    if ($action === 'call_intent_send' && $method === 'POST') {
        require_csrf();
        $user = current_user();
        $raw = file_get_contents('php://input');
        $body = json_decode($raw ?: 'null', true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($body)) {
            json_out(['ok' => false, 'error' => 'Ungültige Nutzdaten.'], 422);
        }
        $phoneDisplay = trim((string) ($body['phoneDisplay'] ?? ''));
        $phoneUri = trim((string) ($body['phoneUri'] ?? ''));
        if ($phoneDisplay === '' || strlen($phoneDisplay) > 80) {
            json_out(['ok' => false, 'error' => 'Ungültige Telefonnummer (Anzeige).'], 422);
        }
        if ($phoneUri === '' || strlen($phoneUri) > 120 || strpos($phoneUri, 'tel:') !== 0) {
            json_out(['ok' => false, 'error' => 'Ungültige Rufnummer.'], 422);
        }
        $digits = preg_replace('/\D/', '', substr($phoneUri, 4));
        if ($digits === '' || strlen($digits) < 5) {
            json_out(['ok' => false, 'error' => 'Rufnummer zu kurz.'], 422);
        }
        $sid = session_id();
        if ($sid === '') {
            json_out(['ok' => false, 'error' => 'Sitzung ungültig.'], 401);
        }
        CrmDatabase::createCallIntent((int) $user['id'], $sid, $phoneDisplay, $phoneUri);
        json_out(['ok' => true]);
    }

    if ($action === 'call_intent_poll' && $method === 'GET') {
        $user = current_user();
        $sid = session_id();
        if ($sid === '') {
            json_out(['ok' => false, 'error' => 'Sitzung ungültig.'], 401);
        }
        $intents = CrmDatabase::claimCallIntentsForOtherSessions((int) $user['id'], $sid);
        json_out(['ok' => true, 'intents' => $intents]);
    }

    json_out(['ok' => false, 'error' => 'Unbekannte Aktion.'], 404);
} catch (\Throwable $e) {
    json_out(['ok' => false, 'error' => 'Serverfehler.'], 500);
}

/**
 * @param list<mixed> $rows
 * @return list<array<string, string>>
 */
function normalize_lead_rows_for_save(array $rows): array
{
    $keys = CrmDatabase::getOrderedLeadVariableKeys();
    if ($keys === []) {
        json_out(['ok' => false, 'error' => 'Es sind keine globalen Lead-Felder definiert. Bitte Admin kontaktieren.'], 422);
    }
    $outRows = [];
    foreach ($rows as $r) {
        if (!is_array($r)) {
            continue;
        }
        $line = [];
        foreach ($keys as $k) {
            $v = isset($r[$k]) ? (string) $r[$k] : '';
            $line[$k] = function_exists('mb_substr') ? mb_substr($v, 0, 4000, 'UTF-8') : substr($v, 0, 4000);
        }
        $outRows[] = $line;
    }

    return $outRows;
}
