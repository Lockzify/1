<?php
declare(strict_types=1);

/**
 * Automatischer Tageslauf ohne Hostinger-Cron.
 * Ruft den Scheduler auf (max. 1× pro Tag nach der eingestellten Uhrzeit).
 */

require_once __DIR__ . '/lib/GoogleApiAuth.php';
GoogleApiAuth::ensureOAuthConfigFromDefaults();

require_once __DIR__ . '/lib/IndexingScheduler.php';

header('Content-Type: text/plain; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow');

$result = IndexingScheduler::maybeRun();

if ($result['ran']) {
    $batch = $result['batch'] ?? [];
    echo sprintf(
        "OK auto-run submitted=%d failed=%d %s\n",
        (int) ($batch['submitted'] ?? 0),
        (int) ($batch['failed'] ?? 0),
        (string) ($batch['message'] ?? '')
    );
    exit(0);
}

echo 'SKIP ' . ($result['reason'] ?? 'unknown') . "\n";
exit(0);
