#!/usr/bin/env php
<?php
declare(strict_types=1);

/**
 * Tägliche Indexierungsanfragen (max. 10 gesamt über alle aktiven Domains).
 * Cron: 0 8 * * * php /pfad/zum/indexierung-cron.php
 */

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "Nur per CLI ausführbar.\n");
    exit(1);
}

require_once __DIR__ . '/indexierung/lib/IndexingService.php';

try {
    $result = IndexingService::runDailyBatch(gmdate('Y-m-d'));
    fwrite(STDOUT, sprintf(
        "[%s] submitted=%d failed=%d remaining=%d %s\n",
        gmdate('c'),
        (int) ($result['submitted'] ?? 0),
        (int) ($result['failed'] ?? 0),
        (int) ($result['remainingQuota'] ?? 0),
        (string) ($result['message'] ?? '')
    ));
    exit(0);
} catch (\Throwable $e) {
    fwrite(STDERR, '[' . gmdate('c') . '] ERROR: ' . $e->getMessage() . "\n");
    exit(1);
}
