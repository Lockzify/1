<?php
declare(strict_types=1);

final class CrmDatabase
{
    /** @var list<string> */
    public const USER_ROLES = ['admin', 'user', 'fulfilment'];

    private static ?\PDO $pdo = null;

    public static function pdo(): \PDO
    {
        if (self::$pdo === null) {
            $dir = dirname(__DIR__) . '/data';
            if (!is_dir($dir)) {
                if (!mkdir($dir, 0700, true) && !is_dir($dir)) {
                    throw new \RuntimeException('CRM-Datenverzeichnis konnte nicht angelegt werden.');
                }
            }
            $path = $dir . '/crm.sqlite';
            self::$pdo = new \PDO('sqlite:' . $path, null, null, [
                \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
            ]);
            self::migrate(self::$pdo);
            self::ensureAdminSeed(self::$pdo);
            self::ensureDemoLeadListSample(self::$pdo);
        }

        return self::$pdo;
    }

    private static function migrate(\PDO $pdo): void
    {
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                display_name TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN (\'admin\', \'user\', \'fulfilment\')),
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )'
        );
        self::migrateUsersRoleConstraint($pdo);

        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS app_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                payload TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )'
        );

        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS user_lead_lists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                sheet_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )'
        );
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_user_lead_lists_user_id ON user_lead_lists(user_id)');

        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS lead_variables (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                field_key TEXT NOT NULL UNIQUE COLLATE NOCASE,
                label TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )'
        );
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_lead_variables_sort ON lead_variables(sort_order)');

        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS call_intents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                creator_session_id TEXT NOT NULL,
                phone_display TEXT NOT NULL,
                phone_uri TEXT NOT NULL,
                created_at TEXT NOT NULL,
                delivered_at TEXT NULL
            )'
        );
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_call_intents_user_pending ON call_intents(user_id, delivered_at)');

        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS call_intent_seen (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                intent_id INTEGER NOT NULL,
                consumer_session_id TEXT NOT NULL,
                seen_at TEXT NOT NULL,
                UNIQUE(intent_id, consumer_session_id)
            )'
        );
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_call_intent_seen_consumer ON call_intent_seen(consumer_session_id)');

        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS daily_tracking (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                track_date TEXT NOT NULL,
                calls INTEGER NOT NULL DEFAULT 0,
                results INTEGER NOT NULL DEFAULT 0,
                sales_calls INTEGER NOT NULL DEFAULT 0,
                closures INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL,
                UNIQUE(user_id, track_date)
            )'
        );
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_daily_tracking_date ON daily_tracking(track_date)');

        self::ensureLeadVariablesSeed($pdo);
    }

    public static function normalizeTrackDate(string $date): string
    {
        $date = trim($date);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            throw new \InvalidArgumentException('Ungültiges Datum (YYYY-MM-DD).');
        }
        $dt = \DateTimeImmutable::createFromFormat('Y-m-d', $date);
        if ($dt === false || $dt->format('Y-m-d') !== $date) {
            throw new \InvalidArgumentException('Ungültiges Datum.');
        }

        return $date;
    }

    private static function clampMetric(int $value): int
    {
        return max(0, min(99999, $value));
    }

    /**
     * Alle CRM-Nutzer für die Tracking-Tabelle (aktive zuerst, dann alphabetisch).
     *
     * @return list<array{id:int,displayName:string,active:bool,role:string}>
     */
    public static function listUsersForTracking(): array
    {
        $stmt = self::pdo()->query(
            'SELECT id, display_name, active, role FROM users ORDER BY active DESC, display_name COLLATE NOCASE'
        );
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        $out = [];
        foreach ($rows ?: [] as $row) {
            $out[] = [
                'id' => (int) $row['id'],
                'displayName' => (string) $row['display_name'],
                'active' => (int) $row['active'] === 1,
                'role' => (string) $row['role'],
            ];
        }

        return $out;
    }

    /**
     * @return list<array{userId:int,displayName:string,active:bool,role:string,calls:int,results:int,salesCalls:int,closures:int,updatedAt:?string}>
     */
    public static function listDailyTrackingForDate(string $trackDate): array
    {
        $trackDate = self::normalizeTrackDate($trackDate);
        $users = self::listUsersForTracking();
        if ($users === []) {
            return [];
        }
        $stmt = self::pdo()->prepare(
            'SELECT user_id, calls, results, sales_calls, closures, updated_at
             FROM daily_tracking WHERE track_date = :d'
        );
        $stmt->execute([':d' => $trackDate]);
        $byUser = [];
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
            $byUser[(int) $row['user_id']] = $row;
        }
        $out = [];
        foreach ($users as $u) {
            $uid = (int) $u['id'];
            $stored = $byUser[$uid] ?? null;
            $out[] = [
                'userId' => $uid,
                'displayName' => (string) $u['displayName'],
                'active' => (bool) $u['active'],
                'role' => (string) $u['role'],
                'calls' => $stored ? (int) $stored['calls'] : 0,
                'results' => $stored ? (int) $stored['results'] : 0,
                'salesCalls' => $stored ? (int) $stored['sales_calls'] : 0,
                'closures' => $stored ? (int) $stored['closures'] : 0,
                'updatedAt' => $stored ? (string) $stored['updated_at'] : null,
            ];
        }

        return $out;
    }

    /**
     * Tages-Summen im Zeitraum (für Verlaufsdiagramme).
     *
     * @return list<array{date:string,calls:int,results:int,salesCalls:int,closures:int}>
     */
    public static function listDailyTrackingSeries(string $fromDate, string $toDate): array
    {
        $fromDate = self::normalizeTrackDate($fromDate);
        $toDate = self::normalizeTrackDate($toDate);
        if ($fromDate > $toDate) {
            [$fromDate, $toDate] = [$toDate, $fromDate];
        }
        $start = new \DateTimeImmutable($fromDate);
        $end = new \DateTimeImmutable($toDate);
        $diffDays = (int) $start->diff($end)->days;
        if ($diffDays > 366) {
            throw new \InvalidArgumentException('Zeitraum maximal 366 Tage.');
        }
        $stmt = self::pdo()->prepare(
            'SELECT track_date,
                    SUM(calls) AS calls,
                    SUM(results) AS results,
                    SUM(sales_calls) AS sales_calls,
                    SUM(closures) AS closures
             FROM daily_tracking
             WHERE track_date BETWEEN :f AND :t
             GROUP BY track_date
             ORDER BY track_date ASC'
        );
        $stmt->execute([':f' => $fromDate, ':t' => $toDate]);
        $byDate = [];
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
            $byDate[(string) $row['track_date']] = [
                'calls' => (int) $row['calls'],
                'results' => (int) $row['results'],
                'salesCalls' => (int) $row['sales_calls'],
                'closures' => (int) $row['closures'],
            ];
        }
        $out = [];
        for ($d = $start; $d <= $end; $d = $d->modify('+1 day')) {
            $iso = $d->format('Y-m-d');
            $stored = $byDate[$iso] ?? null;
            $out[] = [
                'date' => $iso,
                'calls' => $stored ? $stored['calls'] : 0,
                'results' => $stored ? $stored['results'] : 0,
                'salesCalls' => $stored ? $stored['salesCalls'] : 0,
                'closures' => $stored ? $stored['closures'] : 0,
            ];
        }

        return $out;
    }

    /**
     * @param array{calls?:int,results?:int,salesCalls?:int,closures?:int} $metrics
     * @return array{userId:int,displayName:string,calls:int,results:int,salesCalls:int,closures:int,updatedAt:string}
     */
    public static function saveDailyTracking(
        int $targetUserId,
        string $trackDate,
        array $metrics,
        int $requestingUserId,
        bool $isAdmin
    ): array {
        $trackDate = self::normalizeTrackDate($trackDate);
        if ($targetUserId <= 0) {
            throw new \InvalidArgumentException('Ungültiger Nutzer.');
        }
        if (!$isAdmin) {
            throw new \InvalidArgumentException('Nur Administratoren dürfen Tracking bearbeiten.');
        }
        $user = self::findUserById($targetUserId);
        if (!$user) {
            throw new \InvalidArgumentException('Nutzer nicht gefunden.');
        }
        $calls = self::clampMetric((int) ($metrics['calls'] ?? 0));
        $results = self::clampMetric((int) ($metrics['results'] ?? 0));
        $salesCalls = self::clampMetric((int) ($metrics['salesCalls'] ?? 0));
        $closures = self::clampMetric((int) ($metrics['closures'] ?? 0));
        $now = gmdate('c');
        $pdo = self::pdo();
        $pdo->prepare(
            'INSERT INTO daily_tracking (user_id, track_date, calls, results, sales_calls, closures, updated_at)
             VALUES (:uid, :d, :c, :r, :s, :cl, :u)
             ON CONFLICT(user_id, track_date) DO UPDATE SET
               calls = excluded.calls,
               results = excluded.results,
               sales_calls = excluded.sales_calls,
               closures = excluded.closures,
               updated_at = excluded.updated_at'
        )->execute([
            ':uid' => $targetUserId,
            ':d' => $trackDate,
            ':c' => $calls,
            ':r' => $results,
            ':s' => $salesCalls,
            ':cl' => $closures,
            ':u' => $now,
        ]);

        return [
            'userId' => $targetUserId,
            'displayName' => (string) $user['display_name'],
            'calls' => $calls,
            'results' => $results,
            'salesCalls' => $salesCalls,
            'closures' => $closures,
            'updatedAt' => $now,
        ];
    }

    /**
     * Alle Sitzungen desselben Nutzers (alle eingeloggten Browser/Tabs mit eigener PHP-Session)
     * erhalten dieselbe Anfrage, bis jede sie quittiert hat – inkl. des Geräts, das gesendet hat.
     *
     * @return list<array{id:int, phoneDisplay:string, phoneUri:string, createdAt:string}>
     */
    public static function fetchPendingCallIntentsForConsumer(int $userId, string $consumerSessionId): array
    {
        $stmt = self::pdo()->prepare(
            'SELECT i.id, i.phone_display, i.phone_uri, i.created_at FROM call_intents i
             WHERE i.user_id = :uid
               AND i.delivered_at IS NULL
               AND NOT EXISTS (
                 SELECT 1 FROM call_intent_seen s
                 WHERE s.intent_id = i.id AND s.consumer_session_id = :consumer2
               )
             ORDER BY i.id ASC
             LIMIT 20'
        );
        $stmt->execute([
            ':uid' => $userId,
            ':consumer2' => $consumerSessionId,
        ]);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        $out = [];
        foreach ($rows as $r) {
            $out[] = [
                'id' => (int) $r['id'],
                'phoneDisplay' => (string) $r['phone_display'],
                'phoneUri' => (string) $r['phone_uri'],
                'createdAt' => (string) $r['created_at'],
            ];
        }

        return $out;
    }

    public static function acknowledgeCallIntent(int $intentId, int $userId, string $consumerSessionId): void
    {
        $pdo = self::pdo();
        $stmt = $pdo->prepare(
            'SELECT id FROM call_intents WHERE id = :id AND user_id = :uid LIMIT 1'
        );
        $stmt->execute([':id' => $intentId, ':uid' => $userId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            throw new \InvalidArgumentException('Eintrag nicht gefunden.');
        }
        $now = gmdate('c');
        $ins = $pdo->prepare(
            'INSERT OR IGNORE INTO call_intent_seen (intent_id, consumer_session_id, seen_at)
             VALUES (:iid, :csid, :t)'
        );
        $ins->execute([':iid' => $intentId, ':csid' => $consumerSessionId, ':t' => $now]);
    }

    /**
     * Meldung für alle Sitzungen dieses Nutzers beenden (delivered_at setzen).
     */
    public static function dismissCallIntentForUser(int $intentId, int $userId): void
    {
        $pdo = self::pdo();
        $stmt = $pdo->prepare(
            'SELECT id FROM call_intents WHERE id = :id AND user_id = :uid LIMIT 1'
        );
        $stmt->execute([':id' => $intentId, ':uid' => $userId]);
        if (!$stmt->fetch(\PDO::FETCH_ASSOC)) {
            throw new \InvalidArgumentException('Eintrag nicht gefunden.');
        }
        $now = gmdate('c');
        $upd = $pdo->prepare(
            'UPDATE call_intents SET delivered_at = :t WHERE id = :id AND user_id = :uid'
        );
        $upd->execute([':t' => $now, ':id' => $intentId, ':uid' => $userId]);
    }

    /**
     * @return list<int>
     */
    public static function listDismissedCallIntentIdsAfter(int $userId, string $sinceIso): array
    {
        $stmt = self::pdo()->prepare(
            'SELECT id FROM call_intents
             WHERE user_id = :uid AND delivered_at IS NOT NULL AND delivered_at > :since
             ORDER BY id ASC'
        );
        $stmt->execute([':uid' => $userId, ':since' => $sinceIso]);

        return array_map(static fn (array $r): int => (int) $r['id'], $stmt->fetchAll(\PDO::FETCH_ASSOC));
    }

    public static function createCallIntent(int $userId, string $creatorSessionId, string $phoneDisplay, string $phoneUri): int
    {
        $now = gmdate('c');
        $stmt = self::pdo()->prepare(
            'INSERT INTO call_intents (user_id, creator_session_id, phone_display, phone_uri, created_at, delivered_at)
             VALUES (:uid, :csid, :pd, :pu, :c, NULL)'
        );
        $stmt->execute([
            ':uid' => $userId,
            ':csid' => $creatorSessionId,
            ':pd' => $phoneDisplay,
            ':pu' => $phoneUri,
            ':c' => $now,
        ]);

        return (int) self::pdo()->lastInsertId();
    }

    private static function ensureLeadVariablesSeed(\PDO $pdo): void
    {
        $count = (int) $pdo->query('SELECT COUNT(*) FROM lead_variables')->fetchColumn();
        if ($count > 0) {
            return;
        }
        $now = gmdate('c');
        $defaults = [
            ['firma', 'Firma', 10],
            ['vorname', 'Vorname', 20],
            ['nachname', 'Nachname', 30],
            ['email', 'E-Mail', 40],
            ['telefon', 'Telefon', 50],
            ['strasse', 'Straße', 60],
            ['plz', 'PLZ', 70],
            ['ort', 'Ort', 80],
            ['quelle', 'Quelle', 90],
            ['notizen', 'Notizen', 100],
        ];
        $stmt = $pdo->prepare(
            'INSERT INTO lead_variables (field_key, label, sort_order, created_at, updated_at)
             VALUES (:k, :l, :o, :c, :u)'
        );
        foreach ($defaults as [$key, $label, $order]) {
            $stmt->execute([':k' => $key, ':l' => $label, ':o' => $order, ':c' => $now, ':u' => $now]);
        }
    }

    private static function ensureAdminSeed(\PDO $pdo): void
    {
        $count = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
        if ($count > 0) {
            return;
        }

        $email = getenv('CRM_ADMIN_EMAIL') ?: 'info@adlions.de';
        $name = getenv('CRM_ADMIN_NAME') ?: 'Leander Jede';
        $password = getenv('CRM_ADMIN_PASSWORD') ?: 'Seo2026!?';
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $now = gmdate('c');

        $stmt = $pdo->prepare(
            'INSERT INTO users (email, password_hash, display_name, role, active, created_at, updated_at)
             VALUES (:email, :hash, :name, \'admin\', 1, :created, :updated)'
        );
        $stmt->execute([
            ':email' => $email,
            ':hash' => $hash,
            ':name' => $name,
            ':created' => $now,
            ':updated' => $now,
        ]);
    }

    /**
     * Legt für aktive Nutzer ohne Lead-Listen eine Demo-Liste mit Telefonnummer an (zum Testen von tel:-Links).
     */
    private static function ensureDemoLeadListSample(\PDO $pdo): void
    {
        if ((int) $pdo->query('SELECT COUNT(*) FROM lead_variables')->fetchColumn() === 0) {
            return;
        }

        $demoName = 'Beispiel: Telefon testen';
        $uids = $pdo->query('SELECT id FROM users WHERE active = 1 ORDER BY id ASC')->fetchAll(\PDO::FETCH_COLUMN);

        $countStmt = $pdo->prepare('SELECT COUNT(*) FROM user_lead_lists WHERE user_id = :uid');
        foreach ($uids as $uidRaw) {
            $userId = (int) $uidRaw;
            $countStmt->execute([':uid' => $userId]);
            if ((int) $countStmt->fetchColumn() > 0) {
                continue;
            }

            try {
                self::createLeadList($userId, $demoName, [
                    [
                        'firma' => 'Scalecom Demo',
                        'vorname' => 'Test',
                        'nachname' => 'Lead',
                        'email' => 'demo-lead@example.com',
                        'telefon' => '+49 30 12345678',
                        'strasse' => 'Musterstraße 1',
                        'plz' => '10115',
                        'ort' => 'Berlin',
                        'quelle' => 'Automatisch angelegt',
                        'notizen' => 'Zum Testen: Telefonnummer in „Telefon“ eintragen, Senden-Symbol tippen → Popup auf allen CRM-Sitzungen; auf dem Handy „Anrufen“ für natives Wählen.',
                    ],
                ]);
            } catch (\Throwable) {
                // z. B. leere Felddefinitionen — ignorieren
            }
        }
    }

    public static function findUserByEmail(string $email): ?array
    {
        $stmt = self::pdo()->prepare('SELECT * FROM users WHERE email = :email COLLATE NOCASE LIMIT 1');
        $stmt->execute([':email' => trim($email)]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    public static function findUserById(int $id): ?array
    {
        $stmt = self::pdo()->prepare('SELECT * FROM users WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    private static function migrateUsersRoleConstraint(\PDO $pdo): void
    {
        $stmt = $pdo->query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'");
        $ddl = $stmt ? (string) $stmt->fetchColumn() : '';
        $stmt?->closeCursor();
        if ($ddl !== '' && str_contains($ddl, "'fulfilment'")) {
            return;
        }

        $pdo->exec('PRAGMA busy_timeout = 5000');
        $pdo->exec('DROP TABLE IF EXISTS users_role_mig');

        $pdo->beginTransaction();
        try {
            $pdo->exec(
                'CREATE TABLE users_role_mig (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    password_hash TEXT NOT NULL,
                    display_name TEXT NOT NULL,
                    role TEXT NOT NULL CHECK (role IN (\'admin\', \'user\', \'fulfilment\')),
                    active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )'
            );
            $pdo->exec(
                'INSERT INTO users_role_mig (id, email, password_hash, display_name, role, active, created_at, updated_at)
                 SELECT id, email, password_hash, display_name, role, active, created_at, updated_at FROM users'
            );
            $pdo->exec('DROP TABLE users');
            $pdo->exec('ALTER TABLE users_role_mig RENAME TO users');
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            $pdo->exec('DROP TABLE IF EXISTS users_role_mig');
            throw $e;
        }
    }

    public static function normalizeUserRole(string $role): string
    {
        return in_array($role, self::USER_ROLES, true) ? $role : 'user';
    }

    /** @param array{role?:string}|null $user */
    public static function canAccessFulfilmentViews(?array $user): bool
    {
        $role = (string) ($user['role'] ?? '');

        return $role === 'admin' || $role === 'fulfilment';
    }

    public static function userRoleLabel(string $role): string
    {
        return match ($role) {
            'admin' => 'Administrator',
            'fulfilment' => 'Fulfilment',
            default => 'Nutzer',
        };
    }

    /** @return list<array<string, mixed>> */
    public static function listUsers(): array
    {
        $stmt = self::pdo()->query(
            'SELECT id, email, display_name, role, active, created_at, updated_at FROM users ORDER BY display_name COLLATE NOCASE'
        );
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        return $rows ?: [];
    }

    public static function createUser(string $email, string $displayName, string $password, string $role): int
    {
        $role = self::normalizeUserRole($role);
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $now = gmdate('c');
        $stmt = self::pdo()->prepare(
            'INSERT INTO users (email, password_hash, display_name, role, active, created_at, updated_at)
             VALUES (:email, :hash, :name, :role, 1, :created, :updated)'
        );
        $stmt->execute([
            ':email' => trim($email),
            ':hash' => $hash,
            ':name' => trim($displayName),
            ':role' => $role,
            ':created' => $now,
            ':updated' => $now,
        ]);

        return (int) self::pdo()->lastInsertId();
    }

    public static function updateUser(
        int $id,
        ?string $displayName,
        ?string $email,
        ?string $role,
        ?int $active,
        ?string $newPassword
    ): void {
        $user = self::findUserById($id);
        if (!$user) {
            throw new \InvalidArgumentException('Nutzer nicht gefunden.');
        }

        $fields = [];
        $params = [':id' => $id];

        if ($displayName !== null) {
            $fields[] = 'display_name = :display_name';
            $params[':display_name'] = trim($displayName);
        }
        if ($email !== null) {
            $fields[] = 'email = :email';
            $params[':email'] = trim($email);
        }
        if ($role !== null) {
            if (!in_array($role, self::USER_ROLES, true)) {
                throw new \InvalidArgumentException('Ungültige Rolle.');
            }
            $fields[] = 'role = :role';
            $params[':role'] = $role;
        }
        if ($active !== null) {
            $fields[] = 'active = :active';
            $params[':active'] = $active ? 1 : 0;
        }
        if ($newPassword !== null && $newPassword !== '') {
            $fields[] = 'password_hash = :hash';
            $params[':hash'] = password_hash($newPassword, PASSWORD_DEFAULT);
        }

        if (!$fields) {
            return;
        }

        $fields[] = 'updated_at = :updated';
        $params[':updated'] = gmdate('c');

        $sql = 'UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = :id';
        $stmt = self::pdo()->prepare($sql);
        $stmt->execute($params);
    }

    public static function getStatePayload(): ?array
    {
        $stmt = self::pdo()->query('SELECT payload, updated_at FROM app_state WHERE id = 1 LIMIT 1');
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }
        $decoded = json_decode((string) $row['payload'], true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($decoded)) {
            return null;
        }
        return ['state' => $decoded, 'updated_at' => (string) $row['updated_at']];
    }

    public static function saveStatePayload(array $state): void
    {
        $json = json_encode($state, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
        $now = gmdate('c');
        $pdo = self::pdo();
        $stmt = $pdo->prepare(
            'INSERT INTO app_state (id, payload, updated_at) VALUES (1, :payload, :updated)
             ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at'
        );
        $stmt->execute([':payload' => $json, ':updated' => $now]);
    }

    /** @return list<array{id:int,name:string,rowCount:int,updatedAt:string,userId:int,ownerName:string}> */
    public static function listLeadListsForUser(int $userId): array
    {
        return self::listLeadListsForScope($userId, false, $userId);
    }

    /**
     * @return list<array{id:int,name:string,rowCount:int,updatedAt:string,userId:int,ownerName:string}>
     */
    public static function listLeadListsForScope(int $requestingUserId, bool $isAdmin, ?int $filterUserId): array
    {
        $pdo = self::pdo();
        if ($isAdmin && $filterUserId === null) {
            $stmt = $pdo->query(
                'SELECT l.id, l.user_id, l.name, l.sheet_json, l.updated_at, u.display_name
                 FROM user_lead_lists l
                 INNER JOIN users u ON u.id = l.user_id
                 ORDER BY l.updated_at DESC'
            );
        } else {
            $uid = $isAdmin && $filterUserId !== null && $filterUserId > 0 ? $filterUserId : $requestingUserId;
            $stmt = $pdo->prepare(
                'SELECT l.id, l.user_id, l.name, l.sheet_json, l.updated_at, u.display_name
                 FROM user_lead_lists l
                 INNER JOIN users u ON u.id = l.user_id
                 WHERE l.user_id = :uid
                 ORDER BY l.updated_at DESC'
            );
            $stmt->execute([':uid' => $uid]);
        }
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        $out = [];
        foreach ($rows as $row) {
            $sheet = json_decode((string) $row['sheet_json'], true);
            $rowCount = 0;
            if (is_array($sheet) && isset($sheet['rows']) && is_array($sheet['rows'])) {
                $rowCount = count($sheet['rows']);
            }
            $out[] = [
                'id' => (int) $row['id'],
                'name' => (string) $row['name'],
                'rowCount' => $rowCount,
                'updatedAt' => (string) $row['updated_at'],
                'userId' => (int) $row['user_id'],
                'ownerName' => (string) $row['display_name'],
            ];
        }

        return $out;
    }

    /** @return list<array{id:int,displayName:string}> */
    public static function listActiveUsersBrief(): array
    {
        $stmt = self::pdo()->query(
            'SELECT id, display_name FROM users WHERE active = 1 ORDER BY display_name COLLATE NOCASE'
        );
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        $out = [];
        foreach ($rows as $row) {
            $out[] = [
                'id' => (int) $row['id'],
                'displayName' => (string) $row['display_name'],
            ];
        }

        return $out;
    }

    /** @return array<string, mixed>|null */
    public static function getLeadListForUser(int $listId, int $userId): ?array
    {
        return self::getLeadListById($listId, $userId, false);
    }

    /** @return array<string, mixed>|null */
    public static function getLeadListById(int $listId, int $requestingUserId, bool $isAdmin): ?array
    {
        if ($isAdmin) {
            $stmt = self::pdo()->prepare(
                'SELECT id, user_id, name, sheet_json, updated_at FROM user_lead_lists WHERE id = :id LIMIT 1'
            );
            $stmt->execute([':id' => $listId]);
        } else {
            $stmt = self::pdo()->prepare(
                'SELECT id, user_id, name, sheet_json, updated_at FROM user_lead_lists WHERE id = :id AND user_id = :uid LIMIT 1'
            );
            $stmt->execute([':id' => $listId, ':uid' => $requestingUserId]);
        }
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }
        $sheet = json_decode((string) $row['sheet_json'], true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($sheet)) {
            return null;
        }
        $rawRows = $sheet['rows'] ?? [];
        if (!is_array($rawRows)) {
            $rawRows = [];
        }
        $orderedKeys = self::getOrderedLeadVariableKeys();

        return [
            'id' => (int) $row['id'],
            'userId' => (int) $row['user_id'],
            'name' => (string) $row['name'],
            'rows' => self::alignLeadRowsToKeys($rawRows, $orderedKeys),
            'updatedAt' => (string) $row['updated_at'],
        ];
    }

    public static function userOwnsLeadList(int $listId, int $userId): bool
    {
        $stmt = self::pdo()->prepare('SELECT 1 FROM user_lead_lists WHERE id = :id AND user_id = :uid LIMIT 1');
        $stmt->execute([':id' => $listId, ':uid' => $userId]);

        return (bool) $stmt->fetchColumn();
    }

    /**
     * @param list<array<string, string>> $rows
     */
    public static function createLeadList(int $userId, string $name, array $rows): int
    {
        $orderedKeys = self::getOrderedLeadVariableKeys();
        $aligned = self::alignLeadRowsToKeys($rows, $orderedKeys);
        $now = gmdate('c');
        $sheet = ['rows' => $aligned];
        $json = json_encode($sheet, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
        $stmt = self::pdo()->prepare(
            'INSERT INTO user_lead_lists (user_id, name, sheet_json, created_at, updated_at)
             VALUES (:uid, :name, :sheet, :c, :u)'
        );
        $stmt->execute([
            ':uid' => $userId,
            ':name' => $name,
            ':sheet' => $json,
            ':c' => $now,
            ':u' => $now,
        ]);

        return (int) self::pdo()->lastInsertId();
    }

    /**
     * @param list<array<string, string>> $rows
     */
    public static function updateLeadList(int $userId, int $listId, string $name, array $rows): void
    {
        self::updateLeadListForOwner($userId, $listId, $name, $rows, false);
    }

    public static function updateLeadListForOwner(int $ownerUserId, int $listId, string $name, array $rows, bool $isAdmin): void
    {
        $orderedKeys = self::getOrderedLeadVariableKeys();
        $aligned = self::alignLeadRowsToKeys($rows, $orderedKeys);
        $sheet = ['rows' => $aligned];
        $json = json_encode($sheet, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
        $now = gmdate('c');
        if ($isAdmin) {
            $stmt = self::pdo()->prepare(
                'UPDATE user_lead_lists SET name = :name, sheet_json = :sheet, updated_at = :u WHERE id = :id'
            );
            $stmt->execute([
                ':name' => $name,
                ':sheet' => $json,
                ':u' => $now,
                ':id' => $listId,
            ]);
        } else {
            $stmt = self::pdo()->prepare(
                'UPDATE user_lead_lists SET name = :name, sheet_json = :sheet, updated_at = :u WHERE id = :id AND user_id = :uid'
            );
            $stmt->execute([
                ':name' => $name,
                ':sheet' => $json,
                ':u' => $now,
                ':id' => $listId,
                ':uid' => $ownerUserId,
            ]);
        }
        if ($stmt->rowCount() === 0) {
            throw new \InvalidArgumentException('Liste nicht gefunden.');
        }
    }

    /** @return list<array{id:int,key:string,label:string,sortOrder:int}> */
    public static function listLeadVariables(): array
    {
        $stmt = self::pdo()->query(
            'SELECT id, field_key, label, sort_order FROM lead_variables ORDER BY sort_order ASC, id ASC'
        );
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        $out = [];
        foreach ($rows as $r) {
            $out[] = [
                'id' => (int) $r['id'],
                'key' => (string) $r['field_key'],
                'label' => (string) $r['label'],
                'sortOrder' => (int) $r['sort_order'],
            ];
        }
        return $out;
    }

    /** @return list<string> */
    public static function getOrderedLeadVariableKeys(): array
    {
        $vars = self::listLeadVariables();
        return array_map(static fn (array $v): string => $v['key'], $vars);
    }

    /**
     * @param list<mixed> $rows
     * @param list<string> $orderedKeys
     * @return list<array<string, string>>
     */
    public static function alignLeadRowsToKeys(array $rows, array $orderedKeys): array
    {
        $out = [];
        foreach ($rows as $r) {
            if (!is_array($r)) {
                continue;
            }
            $line = [];
            foreach ($orderedKeys as $k) {
                $line[$k] = isset($r[$k]) ? (string) $r[$k] : '';
            }
            if (isset($r['__rowColor'])) {
                $line['__rowColor'] = (string) $r['__rowColor'];
            }
            $out[] = $line;
        }
        return $out;
    }

    public static function countLeadVariables(): int
    {
        return (int) self::pdo()->query('SELECT COUNT(*) FROM lead_variables')->fetchColumn();
    }

    public static function createLeadVariable(string $fieldKey, string $label): int
    {
        if (self::countLeadVariables() >= 80) {
            throw new \InvalidArgumentException('Maximal 80 globale Felder.');
        }
        $fieldKey = strtolower(trim($fieldKey));
        if (!preg_match('/^[a-z][a-z0-9_]{0,63}$/', $fieldKey)) {
            throw new \InvalidArgumentException('Technischer Name: Kleinbuchstaben, Ziffern, Unterstrich, max. 64 Zeichen.');
        }
        $label = trim($label);
        if ($label === '' || strlen($label) > 200) {
            throw new \InvalidArgumentException('Bitte eine Anzeige-Bezeichnung angeben.');
        }
        $max = (int) self::pdo()->query('SELECT COALESCE(MAX(sort_order), 0) FROM lead_variables')->fetchColumn();
        $now = gmdate('c');
        $stmt = self::pdo()->prepare(
            'INSERT INTO lead_variables (field_key, label, sort_order, created_at, updated_at)
             VALUES (:k, :l, :o, :c, :u)'
        );
        $stmt->execute([
            ':k' => $fieldKey,
            ':l' => $label,
            ':o' => $max + 10,
            ':c' => $now,
            ':u' => $now,
        ]);

        return (int) self::pdo()->lastInsertId();
    }

    public static function updateLeadVariable(int $id, string $label, int $sortOrder): void
    {
        $label = trim($label);
        if ($label === '' || strlen($label) > 200) {
            throw new \InvalidArgumentException('Ungültige Bezeichnung.');
        }
        $stmt = self::pdo()->prepare(
            'UPDATE lead_variables SET label = :l, sort_order = :o, updated_at = :u WHERE id = :id'
        );
        $stmt->execute([':l' => $label, ':o' => $sortOrder, ':u' => gmdate('c'), ':id' => $id]);
        if ($stmt->rowCount() === 0) {
            throw new \InvalidArgumentException('Feld nicht gefunden.');
        }
    }

    public static function deleteLeadVariable(int $id): void
    {
        $stmt = self::pdo()->prepare('SELECT field_key FROM lead_variables WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            throw new \InvalidArgumentException('Feld nicht gefunden.');
        }
        $key = (string) $row['field_key'];
        $del = self::pdo()->prepare('DELETE FROM lead_variables WHERE id = :id');
        $del->execute([':id' => $id]);
        self::stripFieldKeyFromAllLeadLists($key);
    }

    public static function stripFieldKeyFromAllLeadLists(string $fieldKey): void
    {
        $pdo = self::pdo();
        $stmt = $pdo->query('SELECT id, sheet_json FROM user_lead_lists');
        $lists = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        $upd = $pdo->prepare('UPDATE user_lead_lists SET sheet_json = :j, updated_at = :u WHERE id = :id');
        $now = gmdate('c');
        foreach ($lists as $list) {
            try {
                $sheet = json_decode((string) $list['sheet_json'], true, 512, JSON_THROW_ON_ERROR);
            } catch (\Throwable $e) {
                continue;
            }
            if (!is_array($sheet) || !isset($sheet['rows']) || !is_array($sheet['rows'])) {
                continue;
            }
            foreach ($sheet['rows'] as &$r) {
                if (is_array($r)) {
                    unset($r[$fieldKey]);
                }
            }
            unset($r);
            $upd->execute([
                ':j' => json_encode($sheet, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
                ':u' => $now,
                ':id' => (int) $list['id'],
            ]);
        }
    }

    public static function deleteLeadList(int $userId, int $listId): void
    {
        self::deleteLeadListById($listId, $userId, false);
    }

    public static function deleteLeadListById(int $listId, int $requestingUserId, bool $isAdmin): void
    {
        if ($isAdmin) {
            $stmt = self::pdo()->prepare('DELETE FROM user_lead_lists WHERE id = :id');
            $stmt->execute([':id' => $listId]);
        } else {
            $stmt = self::pdo()->prepare('DELETE FROM user_lead_lists WHERE id = :id AND user_id = :uid');
            $stmt->execute([':id' => $listId, ':uid' => $requestingUserId]);
        }
        if ($stmt->rowCount() === 0) {
            throw new \InvalidArgumentException('Liste nicht gefunden.');
        }
    }
}
