<?php
declare(strict_types=1);

require_once __DIR__ . '/GoogleIndexingClient.php';

final class IndexingDatabase
{
    private static ?\PDO $pdo = null;

    public static function pdo(): \PDO
    {
        if (self::$pdo === null) {
            $dir = dirname(__DIR__) . '/data';
            if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
                throw new \RuntimeException('Datenverzeichnis konnte nicht angelegt werden.');
            }
            self::$pdo = new \PDO('sqlite:' . $dir . '/indexing.sqlite', null, null, [
                \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
            ]);
            self::migrate(self::$pdo);
        }

        return self::$pdo;
    }

    private static function migrate(\PDO $pdo): void
    {
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS indexing_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                daily_limit INTEGER NOT NULL DEFAULT 10,
                updated_at TEXT NOT NULL
            )'
        );
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS indexing_domains (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                label TEXT NOT NULL,
                domain TEXT NOT NULL,
                gsc_property TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                property_verified INTEGER NOT NULL DEFAULT 0,
                property_verified_at TEXT NULL,
                sitemap_filename TEXT NULL,
                sitemap_uploaded_at TEXT NULL,
                url_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )'
        );
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_indexing_domains_active ON indexing_domains(active)');
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS indexing_urls (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                domain_id INTEGER NOT NULL,
                url TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT \'pending\' CHECK (status IN (\'pending\', \'submitted\', \'failed\')),
                submitted_at TEXT NULL,
                error_message TEXT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(domain_id, url),
                FOREIGN KEY (domain_id) REFERENCES indexing_domains(id) ON DELETE CASCADE
            )'
        );
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_indexing_urls_status ON indexing_urls(domain_id, status)');
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS indexing_daily_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                log_date TEXT NOT NULL,
                url_id INTEGER NOT NULL,
                domain_id INTEGER NOT NULL,
                url TEXT NOT NULL,
                success INTEGER NOT NULL DEFAULT 0,
                response_message TEXT NOT NULL,
                created_at TEXT NOT NULL
            )'
        );
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_indexing_daily_log_date ON indexing_daily_log(log_date)');

        $stmt = $pdo->query('SELECT id FROM indexing_settings WHERE id = 1');
        if (!$stmt || !$stmt->fetchColumn()) {
            $now = gmdate('c');
            $ins = $pdo->prepare('INSERT INTO indexing_settings (id, daily_limit, updated_at) VALUES (1, 10, :u)');
            $ins->execute([':u' => $now]);
        }
        self::ensureSettingsColumns($pdo);
    }

    private static function ensureSettingsColumns(\PDO $pdo): void
    {
        $cols = [];
        $info = $pdo->query('PRAGMA table_info(indexing_settings)');
        if ($info) {
            while ($row = $info->fetch(\PDO::FETCH_ASSOC)) {
                $cols[(string) $row['name']] = true;
            }
        }
        if (!isset($cols['auto_run_enabled'])) {
            $pdo->exec('ALTER TABLE indexing_settings ADD COLUMN auto_run_enabled INTEGER NOT NULL DEFAULT 1');
        }
        if (!isset($cols['auto_run_hour'])) {
            $pdo->exec('ALTER TABLE indexing_settings ADD COLUMN auto_run_hour INTEGER NOT NULL DEFAULT 8');
        }
        if (!isset($cols['last_auto_run_date'])) {
            $pdo->exec('ALTER TABLE indexing_settings ADD COLUMN last_auto_run_date TEXT NULL');
        }
    }

    /** @return array{dailyLimit:int,autoRunEnabled:bool,autoRunHour:int,lastAutoRunDate:?string,updatedAt:string} */
    public static function getSettings(): array
    {
        $stmt = self::pdo()->query(
            'SELECT daily_limit, auto_run_enabled, auto_run_hour, last_auto_run_date, updated_at FROM indexing_settings WHERE id = 1'
        );
        $row = $stmt ? $stmt->fetch(\PDO::FETCH_ASSOC) : false;
        if (!$row) {
            return [
                'dailyLimit' => 10,
                'autoRunEnabled' => true,
                'autoRunHour' => 8,
                'lastAutoRunDate' => null,
                'updatedAt' => gmdate('c'),
            ];
        }

        return [
            'dailyLimit' => max(1, min(200, (int) $row['daily_limit'])),
            'autoRunEnabled' => (int) ($row['auto_run_enabled'] ?? 1) === 1,
            'autoRunHour' => max(0, min(23, (int) ($row['auto_run_hour'] ?? 8))),
            'lastAutoRunDate' => isset($row['last_auto_run_date']) && $row['last_auto_run_date'] !== null
                ? (string) $row['last_auto_run_date'] : null,
            'updatedAt' => (string) $row['updated_at'],
        ];
    }

    public static function saveAutoSchedule(bool $enabled, int $hour): array
    {
        $hour = max(0, min(23, $hour));
        $now = gmdate('c');
        self::pdo()->prepare(
            'UPDATE indexing_settings SET auto_run_enabled = :e, auto_run_hour = :h, updated_at = :u WHERE id = 1'
        )->execute([':e' => $enabled ? 1 : 0, ':h' => $hour, ':u' => $now]);

        return self::getSettings();
    }

    public static function markAutoRunDate(string $date): void
    {
        self::pdo()->prepare('UPDATE indexing_settings SET last_auto_run_date = :d, updated_at = :u WHERE id = 1')
            ->execute([':d' => $date, ':u' => gmdate('c')]);
    }

    public static function saveDailyLimit(int $limit): array
    {
        $limit = max(1, min(200, $limit));
        $now = gmdate('c');
        self::pdo()->prepare('UPDATE indexing_settings SET daily_limit = :l, updated_at = :u WHERE id = 1')
            ->execute([':l' => $limit, ':u' => $now]);

        return self::getSettings();
    }

    private static function cronSecretPath(): string
    {
        return dirname(__DIR__) . '/data/cron-secret.txt';
    }

    public static function getCronSecret(): string
    {
        $path = self::cronSecretPath();
        if (is_readable($path)) {
            $secret = trim((string) file_get_contents($path));
            if ($secret !== '') {
                return $secret;
            }
        }

        return self::regenerateCronSecret();
    }

    public static function regenerateCronSecret(): string
    {
        $dir = dirname(__DIR__) . '/data';
        if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
            throw new \RuntimeException('Datenverzeichnis konnte nicht angelegt werden.');
        }
        $secret = bin2hex(random_bytes(24));
        if (file_put_contents(self::cronSecretPath(), $secret, LOCK_EX) === false) {
            throw new \RuntimeException('Cron-Schlüssel konnte nicht gespeichert werden.');
        }
        @chmod(self::cronSecretPath(), 0600);

        return $secret;
    }

    /** @return list<array<string, mixed>> */
    public static function listDomains(): array
    {
        $stmt = self::pdo()->query(
            'SELECT d.*,
                    SUM(CASE WHEN u.status = \'pending\' THEN 1 ELSE 0 END) AS pending_count,
                    SUM(CASE WHEN u.status = \'submitted\' THEN 1 ELSE 0 END) AS submitted_count,
                    SUM(CASE WHEN u.status = \'failed\' THEN 1 ELSE 0 END) AS failed_count
             FROM indexing_domains d
             LEFT JOIN indexing_urls u ON u.domain_id = d.id
             GROUP BY d.id
             ORDER BY d.label COLLATE NOCASE ASC'
        );
        $out = [];
        foreach ($stmt ? $stmt->fetchAll(\PDO::FETCH_ASSOC) : [] as $row) {
            $out[] = self::mapDomainRow($row);
        }

        return $out;
    }

    /** @return array<string, mixed>|null */
    public static function getDomain(int $id): ?array
    {
        $stmt = self::pdo()->prepare(
            'SELECT d.*,
                    SUM(CASE WHEN u.status = \'pending\' THEN 1 ELSE 0 END) AS pending_count,
                    SUM(CASE WHEN u.status = \'submitted\' THEN 1 ELSE 0 END) AS submitted_count,
                    SUM(CASE WHEN u.status = \'failed\' THEN 1 ELSE 0 END) AS failed_count
             FROM indexing_domains d
             LEFT JOIN indexing_urls u ON u.domain_id = d.id
             WHERE d.id = :id
             GROUP BY d.id'
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        return $row ? self::mapDomainRow($row) : null;
    }

    /** @param array<string, mixed> $row */
    private static function mapDomainRow(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'label' => (string) $row['label'],
            'domain' => (string) $row['domain'],
            'gscProperty' => (string) $row['gsc_property'],
            'active' => (int) $row['active'] === 1,
            'propertyVerified' => (int) $row['property_verified'] === 1,
            'propertyVerifiedAt' => $row['property_verified_at'] !== null ? (string) $row['property_verified_at'] : null,
            'sitemapFilename' => $row['sitemap_filename'] !== null ? (string) $row['sitemap_filename'] : null,
            'sitemapUploadedAt' => $row['sitemap_uploaded_at'] !== null ? (string) $row['sitemap_uploaded_at'] : null,
            'urlCount' => (int) ($row['url_count'] ?? 0),
            'pendingCount' => (int) ($row['pending_count'] ?? 0),
            'submittedCount' => (int) ($row['submitted_count'] ?? 0),
            'failedCount' => (int) ($row['failed_count'] ?? 0),
            'createdAt' => (string) $row['created_at'],
            'updatedAt' => (string) $row['updated_at'],
        ];
    }

    /** @param array{label:string,domain:string,gscProperty?:string,active?:bool} $data */
    public static function saveDomain(?int $id, array $data): array
    {
        $label = trim((string) ($data['label'] ?? ''));
        $domain = trim((string) ($data['domain'] ?? ''));
        if ($label === '' || $domain === '') {
            throw new \InvalidArgumentException('Bezeichnung und Domain sind Pflichtfelder.');
        }
        $gscProperty = trim((string) ($data['gscProperty'] ?? ''));
        $gscProperty = $gscProperty === ''
            ? GoogleIndexingClient::domainToDefaultProperty($domain)
            : GoogleIndexingClient::normalizePropertyUrl($gscProperty);
        $active = !isset($data['active']) || (bool) $data['active'];
        $now = gmdate('c');
        $pdo = self::pdo();

        if ($id !== null && $id > 0) {
            $existing = self::getDomain($id);
            if ($existing === null) {
                throw new \InvalidArgumentException('Domain nicht gefunden.');
            }
            $propertyChanged = $existing['gscProperty'] !== $gscProperty;
            $pdo->prepare(
                'UPDATE indexing_domains SET label = :label, domain = :domain, gsc_property = :prop,
                 active = :active, property_verified = :verified, property_verified_at = :vat, updated_at = :u
                 WHERE id = :id'
            )->execute([
                ':label' => $label,
                ':domain' => $domain,
                ':prop' => $gscProperty,
                ':active' => $active ? 1 : 0,
                ':verified' => $propertyChanged ? 0 : (int) $existing['propertyVerified'],
                ':vat' => $propertyChanged ? null : $existing['propertyVerifiedAt'],
                ':u' => $now,
                ':id' => $id,
            ]);

            return self::getDomain($id) ?? throw new \RuntimeException('Domain konnte nicht geladen werden.');
        }

        $pdo->prepare(
            'INSERT INTO indexing_domains (label, domain, gsc_property, active, property_verified, created_at, updated_at)
             VALUES (:label, :domain, :prop, :active, 0, :c, :u)'
        )->execute([
            ':label' => $label, ':domain' => $domain, ':prop' => $gscProperty,
            ':active' => $active ? 1 : 0, ':c' => $now, ':u' => $now,
        ]);

        return self::getDomain((int) $pdo->lastInsertId()) ?? throw new \RuntimeException('Domain konnte nicht geladen werden.');
    }

    public static function deleteDomain(int $id): void
    {
        $stmt = self::pdo()->prepare('DELETE FROM indexing_domains WHERE id = :id');
        $stmt->execute([':id' => $id]);
        if ($stmt->rowCount() === 0) {
            throw new \InvalidArgumentException('Domain nicht gefunden.');
        }
    }

    public static function setDomainVerified(int $id, bool $verified): void
    {
        $now = gmdate('c');
        self::pdo()->prepare(
            'UPDATE indexing_domains SET property_verified = :v, property_verified_at = :at, updated_at = :u WHERE id = :id'
        )->execute([':v' => $verified ? 1 : 0, ':at' => $verified ? $now : null, ':u' => $now, ':id' => $id]);
    }

    public static function updateSitemapMeta(int $id, string $filename, int $urlCount): void
    {
        $now = gmdate('c');
        self::pdo()->prepare(
            'UPDATE indexing_domains SET sitemap_filename = :f, sitemap_uploaded_at = :s, url_count = :c, updated_at = :u WHERE id = :id'
        )->execute([':f' => $filename, ':s' => $now, ':c' => $urlCount, ':u' => $now, ':id' => $id]);
    }

    /** @param list<string> $urls @return array{added:int,skipped:int,total:int} */
    public static function importUrls(int $domainId, array $urls): array
    {
        $pdo = self::pdo();
        $added = 0;
        $skipped = 0;
        $now = gmdate('c');
        $check = $pdo->prepare('SELECT 1 FROM indexing_urls WHERE domain_id = :d AND url = :u');
        $insert = $pdo->prepare(
            'INSERT INTO indexing_urls (domain_id, url, status, created_at) VALUES (:d, :u, \'pending\', :c)'
        );
        foreach ($urls as $url) {
            $url = trim($url);
            if ($url === '') {
                continue;
            }
            $check->execute([':d' => $domainId, ':u' => $url]);
            if ($check->fetchColumn()) {
                $skipped++;
                continue;
            }
            $insert->execute([':d' => $domainId, ':u' => $url, ':c' => $now]);
            $added++;
        }

        return ['added' => $added, 'skipped' => $skipped, 'total' => count($urls)];
    }

    /** @return list<array{id:int,domainId:int,url:string}> */
    public static function pickPendingUrls(int $limit): array
    {
        if ($limit <= 0) {
            return [];
        }
        $domainIds = array_map('intval', self::pdo()->query(
            'SELECT id FROM indexing_domains WHERE active = 1 AND property_verified = 1 ORDER BY id ASC'
        )->fetchAll(\PDO::FETCH_COLUMN) ?: []);
        if ($domainIds === []) {
            return [];
        }
        $picked = [];
        $offset = 0;
        while (count($picked) < $limit) {
            $progress = false;
            foreach ($domainIds as $domainId) {
                if (count($picked) >= $limit) {
                    break 2;
                }
                $stmt = self::pdo()->prepare(
                    'SELECT id, domain_id, url FROM indexing_urls
                     WHERE domain_id = :d AND status = \'pending\'
                     ORDER BY id ASC LIMIT 1 OFFSET ' . (int) $offset
                );
                $stmt->execute([':d' => $domainId]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                if ($row) {
                    $picked[] = ['id' => (int) $row['id'], 'domainId' => (int) $row['domain_id'], 'url' => (string) $row['url']];
                    $progress = true;
                }
            }
            if (!$progress) {
                break;
            }
            $offset++;
        }

        return $picked;
    }

    public static function markUrlSubmitted(int $urlId): void
    {
        self::pdo()->prepare(
            'UPDATE indexing_urls SET status = \'submitted\', submitted_at = :s, error_message = NULL WHERE id = :id'
        )->execute([':s' => gmdate('c'), ':id' => $urlId]);
    }

    public static function markUrlFailed(int $urlId, string $message): void
    {
        self::pdo()->prepare('UPDATE indexing_urls SET status = \'failed\', error_message = :m WHERE id = :id')
            ->execute([':m' => $message, ':id' => $urlId]);
    }

    public static function countSubmissionsForDate(string $date): int
    {
        $stmt = self::pdo()->prepare('SELECT COUNT(*) FROM indexing_daily_log WHERE log_date = :d AND success = 1');
        $stmt->execute([':d' => $date]);

        return (int) $stmt->fetchColumn();
    }

    public static function logSubmission(string $date, int $urlId, int $domainId, string $url, bool $success, string $message): void
    {
        self::pdo()->prepare(
            'INSERT INTO indexing_daily_log (log_date, url_id, domain_id, url, success, response_message, created_at)
             VALUES (:d, :uid, :did, :url, :s, :m, :c)'
        )->execute([
            ':d' => $date, ':uid' => $urlId, ':did' => $domainId, ':url' => $url,
            ':s' => $success ? 1 : 0, ':m' => $message, ':c' => gmdate('c'),
        ]);
    }

    /** @return list<array<string, mixed>> */
    public static function listDailyLog(string $date, int $limit = 50): array
    {
        $stmt = self::pdo()->prepare(
            'SELECT l.*, d.label AS domain_label FROM indexing_daily_log l
             JOIN indexing_domains d ON d.id = l.domain_id
             WHERE l.log_date = :d ORDER BY l.id DESC LIMIT :lim'
        );
        $stmt->bindValue(':d', $date);
        $stmt->bindValue(':lim', max(1, min(200, $limit)), \PDO::PARAM_INT);
        $stmt->execute();
        $out = [];
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
            $out[] = [
                'id' => (int) $row['id'],
                'date' => (string) $row['log_date'],
                'url' => (string) $row['url'],
                'domainLabel' => (string) $row['domain_label'],
                'success' => (int) $row['success'] === 1,
                'message' => (string) $row['response_message'],
                'createdAt' => (string) $row['created_at'],
            ];
        }

        return $out;
    }
}
