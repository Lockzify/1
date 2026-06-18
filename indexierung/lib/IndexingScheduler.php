<?php
declare(strict_types=1);

require_once __DIR__ . '/GoogleIndexingClient.php';
require_once __DIR__ . '/IndexingDatabase.php';
require_once __DIR__ . '/IndexingService.php';

final class IndexingScheduler
{
    private static function lockPath(): string
    {
        return dirname(__DIR__) . '/data/auto-run.lock';
    }

    private static function todayBerlin(): string
    {
        $tz = new \DateTimeZone('Europe/Berlin');
        return (new \DateTimeImmutable('now', $tz))->format('Y-m-d');
    }

    private static function nowBerlin(): \DateTimeImmutable
    {
        return new \DateTimeImmutable('now', new \DateTimeZone('Europe/Berlin'));
    }

    /** @return array{ran:bool,reason:string,batch?:array<string,mixed>} */
    public static function maybeRun(): array
    {
        $settings = IndexingDatabase::getSettings();
        if (!$settings['autoRunEnabled']) {
            return ['ran' => false, 'reason' => 'auto_disabled'];
        }

        $today = self::todayBerlin();
        if (($settings['lastAutoRunDate'] ?? '') === $today) {
            return ['ran' => false, 'reason' => 'already_ran_today'];
        }

        $now = self::nowBerlin();
        $scheduled = $now->setTime((int) $settings['autoRunHour'], 0, 0);
        if ($now < $scheduled) {
            return ['ran' => false, 'reason' => 'before_scheduled_time'];
        }

        if (!GoogleIndexingClient::hasCredentials()) {
            return ['ran' => false, 'reason' => 'not_connected'];
        }

        $lock = self::lockPath();
        $fh = @fopen($lock, 'c+');
        if ($fh === false) {
            return ['ran' => false, 'reason' => 'lock_failed'];
        }
        if (!flock($fh, LOCK_EX | LOCK_NB)) {
            fclose($fh);
            return ['ran' => false, 'reason' => 'already_running'];
        }

        try {
            $batch = IndexingService::runDailyBatch(gmdate('Y-m-d'));
            IndexingDatabase::markAutoRunDate($today);
            return ['ran' => true, 'reason' => 'ok', 'batch' => $batch];
        } catch (\Throwable $e) {
            return ['ran' => false, 'reason' => 'error: ' . $e->getMessage()];
        } finally {
            flock($fh, LOCK_UN);
            fclose($fh);
        }
    }
}
