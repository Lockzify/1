<?php
declare(strict_types=1);

final class CrmDatabase
{
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
                role TEXT NOT NULL CHECK (role IN (\'admin\', \'user\')),
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )'
        );

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

        self::ensureLeadVariablesSeed($pdo);
    }

    /**
     * Alle anderen Sitzungen desselben Nutzers erhalten dieselbe Anfrage, bis jede sie quittiert hat.
     *
     * @return list<array{id:int, phoneDisplay:string, phoneUri:string, createdAt:string}>
     */
    public static function fetchPendingCallIntentsForConsumer(int $userId, string $consumerSessionId): array
    {
        $stmt = self::pdo()->prepare(
            'SELECT i.id, i.phone_display, i.phone_uri, i.created_at FROM call_intents i
             WHERE i.user_id = :uid
               AND i.creator_session_id != :consumer
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
            ':consumer' => $consumerSessionId,
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
            'SELECT id, creator_session_id FROM call_intents WHERE id = :id AND user_id = :uid LIMIT 1'
        );
        $stmt->execute([':id' => $intentId, ':uid' => $userId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            throw new \InvalidArgumentException('Eintrag nicht gefunden.');
        }
        if ((string) $row['creator_session_id'] === $consumerSessionId) {
            return;
        }
        $now = gmdate('c');
        $ins = $pdo->prepare(
            'INSERT OR IGNORE INTO call_intent_seen (intent_id, consumer_session_id, seen_at)
             VALUES (:iid, :csid, :t)'
        );
        $ins->execute([':iid' => $intentId, ':csid' => $consumerSessionId, ':t' => $now]);
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
        $name = getenv('CRM_ADMIN_NAME') ?: 'Leander';
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
                        'notizen' => 'Zum Testen: Eigene Mobilnummer in „Telefon“ eintragen und speichern. CRM auf dem Handy öffnen, dieselbe Liste wählen, Nummer antippen → Anruf-Dialog. Am PC löst der Klick nur dort die Telefonie aus (nicht zuverlässig auf dem Handy).',
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
        if (!in_array($role, ['admin', 'user'], true)) {
            $role = 'user';
        }
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
            if (!in_array($role, ['admin', 'user'], true)) {
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

    /** @return list<array{id:int,name:string,rowCount:int,updatedAt:string}> */
    public static function listLeadListsForUser(int $userId): array
    {
        $stmt = self::pdo()->prepare(
            'SELECT id, name, sheet_json, updated_at FROM user_lead_lists WHERE user_id = :uid ORDER BY updated_at DESC'
        );
        $stmt->execute([':uid' => $userId]);
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
            ];
        }
        return $out;
    }

    /** @return array<string, mixed>|null */
    public static function getLeadListForUser(int $listId, int $userId): ?array
    {
        $stmt = self::pdo()->prepare(
            'SELECT id, user_id, name, sheet_json, updated_at FROM user_lead_lists WHERE id = :id AND user_id = :uid LIMIT 1'
        );
        $stmt->execute([':id' => $listId, ':uid' => $userId]);
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
        $orderedKeys = self::getOrderedLeadVariableKeys();
        $aligned = self::alignLeadRowsToKeys($rows, $orderedKeys);
        $sheet = ['rows' => $aligned];
        $json = json_encode($sheet, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
        $now = gmdate('c');
        $stmt = self::pdo()->prepare(
            'UPDATE user_lead_lists SET name = :name, sheet_json = :sheet, updated_at = :u WHERE id = :id AND user_id = :uid'
        );
        $stmt->execute([
            ':name' => $name,
            ':sheet' => $json,
            ':u' => $now,
            ':id' => $listId,
            ':uid' => $userId,
        ]);
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
        $stmt = self::pdo()->prepare('DELETE FROM user_lead_lists WHERE id = :id AND user_id = :uid');
        $stmt->execute([':id' => $listId, ':uid' => $userId]);
        if ($stmt->rowCount() === 0) {
            throw new \InvalidArgumentException('Liste nicht gefunden.');
        }
    }
}
