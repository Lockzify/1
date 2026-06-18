<?php
declare(strict_types=1);

/**
 * Tägliche Indexierung per URL aufrufen (für Hostinger „URL-Cron“ ohne Server-Pfad).
 *
 * Beispiel:
 * https://indexierung.deine-domain.de/cron-web.php?key=DEIN_GEHEIMER_SCHLÜSSEL
 */

require_once __DIR__ . '/lib/GoogleApiAuth.php';
GoogleApiAuth::ensureOAuthConfigFromDefaults();

require_once __DIR__ . '/lib/IndexingDatabase.php';
require_once __DIR__ . '/lib/IndexingService.php';

header('Content-Type: text/plain; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow');

$key = trim((string) ($_GET['key'] ?? ''));
$secret = IndexingDatabase::getCronSecret();

if ($key === '' || !hash_equals($secret, $key)) {
    http_response_code(403);
    echo "Forbidden — ungültiger oder fehlender Schlüssel.\n";
    exit;
}

try {
    $result = IndexingService::runDailyBatch(gmdate('Y-m-d'));
    echo sprintf(
        "OK [%s] submitted=%d failed=%d remaining=%d %s\n",
        gmdate('c'),
        (int) ($result['submitted'] ?? 0),
        (int) ($result['failed'] ?? 0),
        (int) ($result['remainingQuota'] ?? 0),
        (string) ($result['message'] ?? '')
    );
    exit(0);
} catch (\Throwable $e) {
    http_response_code(500);
    echo '[' . gmdate('c') . '] ERROR: ' . $e->getMessage() . "\n";
    exit(1);
}
