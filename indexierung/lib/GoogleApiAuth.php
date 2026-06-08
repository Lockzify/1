<?php
declare(strict_types=1);

/**
 * Authentifizierung: OAuth (empfohlen) oder Service Account JSON.
 */
final class GoogleApiAuth
{
    private const TOKEN_URL = 'https://oauth2.googleapis.com/token';
    private const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

    public const SCOPES = [
        'https://www.googleapis.com/auth/webmasters.readonly',
        'https://www.googleapis.com/auth/indexing',
    ];

    public static function dataDir(): string
    {
        return dirname(__DIR__) . '/data';
    }

    public static function oauthConfigPath(): string
    {
        return self::dataDir() . '/oauth-config.json';
    }

    public static function oauthTokenPath(): string
    {
        return self::dataDir() . '/oauth-token.json';
    }

    public static function serviceAccountPath(): string
    {
        return self::dataDir() . '/google-service-account.json';
    }

    public static function ensureDataDir(): void
    {
        $dir = self::dataDir();
        if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
            throw new \RuntimeException('Datenverzeichnis konnte nicht angelegt werden.');
        }
    }

    public static function authMode(): string
    {
        if (self::hasOAuthToken()) {
            return 'oauth';
        }
        if (self::hasServiceAccount()) {
            return 'service_account';
        }

        return 'none';
    }

    public static function hasAuth(): bool
    {
        return self::authMode() !== 'none';
    }

    public static function hasOAuthConfig(): bool
    {
        $cfg = self::loadOAuthConfig();

        return $cfg !== null && $cfg['clientId'] !== '' && $cfg['clientSecret'] !== '';
    }

    public static function hasOAuthToken(): bool
    {
        $tok = self::loadOAuthToken();

        return $tok !== null && ($tok['refreshToken'] ?? '') !== '';
    }

    public static function hasServiceAccount(): bool
    {
        if (!is_readable(self::serviceAccountPath())) {
            return false;
        }
        try {
            $data = json_decode((string) file_get_contents(self::serviceAccountPath()), true, 512, JSON_THROW_ON_ERROR);

            return is_array($data) && !empty($data['client_email']) && !empty($data['private_key']);
        } catch (\Throwable $e) {
            return false;
        }
    }

    /** @return array{clientId:string,clientSecret:string}|null */
    public static function loadOAuthConfig(): ?array
    {
        if (!is_readable(self::oauthConfigPath())) {
            return null;
        }
        try {
            $data = json_decode((string) file_get_contents(self::oauthConfigPath()), true, 512, JSON_THROW_ON_ERROR);
        } catch (\Throwable $e) {
            return null;
        }
        if (!is_array($data)) {
            return null;
        }

        return [
            'clientId' => trim((string) ($data['clientId'] ?? '')),
            'clientSecret' => trim((string) ($data['clientSecret'] ?? '')),
        ];
    }

    /** @return array{refreshToken:string,email:?string,updatedAt:string}|null */
    public static function loadOAuthToken(): ?array
    {
        if (!is_readable(self::oauthTokenPath())) {
            return null;
        }
        try {
            $data = json_decode((string) file_get_contents(self::oauthTokenPath()), true, 512, JSON_THROW_ON_ERROR);
        } catch (\Throwable $e) {
            return null;
        }
        if (!is_array($data) || empty($data['refreshToken'])) {
            return null;
        }

        return [
            'refreshToken' => (string) $data['refreshToken'],
            'email' => isset($data['email']) ? (string) $data['email'] : null,
            'updatedAt' => (string) ($data['updatedAt'] ?? ''),
        ];
    }

    public static function saveOAuthConfig(string $clientId, string $clientSecret): void
    {
        $clientId = trim($clientId);
        $clientSecret = trim($clientSecret);
        if ($clientId === '' || $clientSecret === '') {
            throw new \InvalidArgumentException('Client ID und Client Secret sind Pflichtfelder.');
        }
        self::ensureDataDir();
        file_put_contents(self::oauthConfigPath(), json_encode([
            'clientId' => $clientId,
            'clientSecret' => $clientSecret,
            'updatedAt' => gmdate('c'),
        ], JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        chmod(self::oauthConfigPath(), 0600);
    }

    public static function saveServiceAccountJson(string $json): string
    {
        $json = trim($json);
        if ($json === '') {
            throw new \InvalidArgumentException('JSON-Inhalt fehlt.');
        }
        $data = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($data) || empty($data['client_email']) || empty($data['private_key'])) {
            throw new \InvalidArgumentException('Ungültige Service-Account-JSON.');
        }
        self::ensureDataDir();
        file_put_contents(self::serviceAccountPath(), json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));
        chmod(self::serviceAccountPath(), 0600);

        return (string) $data['client_email'];
    }

    public static function disconnectOAuth(): void
    {
        if (is_file(self::oauthTokenPath())) {
            unlink(self::oauthTokenPath());
        }
    }

    public static function accountLabel(): ?string
    {
        if (self::hasOAuthToken()) {
            $tok = self::loadOAuthToken();

            return $tok['email'] ?? 'Google-Konto (OAuth)';
        }
        if (self::hasServiceAccount()) {
            $data = json_decode((string) file_get_contents(self::serviceAccountPath()), true);

            return is_array($data) ? (string) ($data['client_email'] ?? null) : null;
        }

        return null;
    }

    public static function redirectUri(): string
    {
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host = (string) ($_SERVER['HTTP_HOST'] ?? 'localhost');
        $base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
        if ($base === '/' || $base === '.') {
            $base = '';
        }

        return $scheme . '://' . $host . $base . '/oauth-callback.php';
    }

    public static function authorizationUrl(): string
    {
        $cfg = self::loadOAuthConfig();
        if ($cfg === null) {
            throw new \RuntimeException('OAuth Client ID/Secret fehlen.');
        }
        $params = [
            'client_id' => $cfg['clientId'],
            'redirect_uri' => self::redirectUri(),
            'response_type' => 'code',
            'scope' => implode(' ', self::SCOPES),
            'access_type' => 'offline',
            'prompt' => 'consent',
            'include_granted_scopes' => 'true',
        ];

        return self::AUTH_URL . '?' . http_build_query($params);
    }

    public static function handleOAuthCallback(string $code): string
    {
        $code = trim($code);
        if ($code === '') {
            throw new \InvalidArgumentException('OAuth-Code fehlt.');
        }
        $cfg = self::loadOAuthConfig();
        if ($cfg === null) {
            throw new \RuntimeException('OAuth-Konfiguration fehlt.');
        }
        $res = self::httpPostForm(self::TOKEN_URL, [
            'code' => $code,
            'client_id' => $cfg['clientId'],
            'client_secret' => $cfg['clientSecret'],
            'redirect_uri' => self::redirectUri(),
            'grant_type' => 'authorization_code',
        ]);
        if (empty($res['refresh_token'])) {
            throw new \RuntimeException('Kein Refresh-Token erhalten. Bitte Verbindung trennen und erneut mit „Zustimmung“ verbinden.');
        }
        $email = null;
        if (!empty($res['access_token'])) {
            try {
                $info = self::httpGet('https://www.googleapis.com/oauth2/v2/userinfo', (string) $res['access_token']);
                $email = isset($info['email']) ? (string) $info['email'] : null;
            } catch (\Throwable $e) {
                $email = null;
            }
        }
        self::ensureDataDir();
        file_put_contents(self::oauthTokenPath(), json_encode([
            'refreshToken' => (string) $res['refresh_token'],
            'email' => $email,
            'updatedAt' => gmdate('c'),
        ], JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        chmod(self::oauthTokenPath(), 0600);

        return $email ?? 'Google-Konto';
    }

    /** @param list<string> $scopes */
    public static function getAccessToken(array $scopes): string
    {
        if (self::hasOAuthToken()) {
            return self::oauthAccessToken($scopes);
        }
        if (self::hasServiceAccount()) {
            return self::serviceAccountAccessToken($scopes);
        }

        throw new \RuntimeException('Keine Google-Anmeldung konfiguriert. Bitte OAuth verbinden oder Service-Account hinterlegen.');
    }

    /** @param list<string> $scopes */
    private static function oauthAccessToken(array $scopes): string
    {
        $cfg = self::loadOAuthConfig();
        $tok = self::loadOAuthToken();
        if ($cfg === null || $tok === null) {
            throw new \RuntimeException('OAuth nicht vollständig konfiguriert.');
        }
        $res = self::httpPostForm(self::TOKEN_URL, [
            'client_id' => $cfg['clientId'],
            'client_secret' => $cfg['clientSecret'],
            'refresh_token' => $tok['refreshToken'],
            'grant_type' => 'refresh_token',
        ]);
        if (empty($res['access_token'])) {
            throw new \RuntimeException('OAuth-Token konnte nicht erneuert werden. Bitte erneut verbinden.');
        }

        return (string) $res['access_token'];
    }

    /** @param list<string> $scopes */
    private static function serviceAccountAccessToken(array $scopes): string
    {
        $data = json_decode((string) file_get_contents(self::serviceAccountPath()), true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($data)) {
            throw new \RuntimeException('Service-Account-JSON ungültig.');
        }
        $email = (string) ($data['client_email'] ?? '');
        $key = (string) ($data['private_key'] ?? '');
        if ($email === '' || $key === '') {
            throw new \RuntimeException('Service-Account-JSON unvollständig.');
        }
        $now = time();
        $header = self::b64(json_encode(['alg' => 'RS256', 'typ' => 'JWT'], JSON_THROW_ON_ERROR));
        $claim = self::b64(json_encode([
            'iss' => $email,
            'scope' => implode(' ', $scopes),
            'aud' => self::TOKEN_URL,
            'iat' => $now,
            'exp' => $now + 3600,
        ], JSON_THROW_ON_ERROR));
        $input = $header . '.' . $claim;
        $signature = '';
        $pkey = openssl_pkey_get_private($key);
        if ($pkey === false || !openssl_sign($input, $signature, $pkey, OPENSSL_ALGO_SHA256)) {
            throw new \RuntimeException('JWT-Signatur fehlgeschlagen.');
        }
        $jwt = $input . '.' . self::b64($signature);
        $res = self::httpPostForm(self::TOKEN_URL, [
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion' => $jwt,
        ]);
        if (empty($res['access_token'])) {
            throw new \RuntimeException('Service-Account-Token fehlgeschlagen.');
        }

        return (string) $res['access_token'];
    }

    /** @return array<string, mixed> */
    private static function httpPostForm(string $url, array $fields): array
    {
        $ch = curl_init($url);
        if ($ch === false) {
            throw new \RuntimeException('cURL nicht verfügbar.');
        }
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
            CURLOPT_POSTFIELDS => http_build_query($fields),
            CURLOPT_TIMEOUT => 30,
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if (!is_string($body)) {
            throw new \RuntimeException('Token-Anfrage fehlgeschlagen.');
        }
        $json = json_decode($body, true);
        if ($code >= 400 || !is_array($json)) {
            $msg = is_array($json) && !empty($json['error_description'])
                ? (string) $json['error_description']
                : (is_array($json) && !empty($json['error']) ? (string) $json['error'] : 'HTTP ' . $code);

            throw new \RuntimeException($msg);
        }

        return $json;
    }

    /** @return array<string, mixed> */
    public static function httpGet(string $url, string $token): array
    {
        $ch = curl_init($url);
        if ($ch === false) {
            throw new \RuntimeException('cURL nicht verfügbar.');
        }
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $token],
            CURLOPT_TIMEOUT => 30,
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if (!is_string($body)) {
            throw new \RuntimeException('API-Anfrage fehlgeschlagen.');
        }
        $json = json_decode($body, true);
        if ($code >= 400) {
            $msg = is_array($json) && !empty($json['error']['message'])
                ? (string) $json['error']['message']
                : 'API-Fehler (HTTP ' . $code . ').';

            throw new \RuntimeException($msg);
        }

        return is_array($json) ? $json : [];
    }

    /** @param array<string, mixed> $payload @return array<string, mixed> */
    public static function httpPostJson(string $url, string $token, array $payload): array
    {
        $ch = curl_init($url);
        if ($ch === false) {
            throw new \RuntimeException('cURL nicht verfügbar.');
        }
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $token,
                'Content-Type: application/json',
            ],
            CURLOPT_POSTFIELDS => json_encode($payload, JSON_THROW_ON_ERROR),
            CURLOPT_TIMEOUT => 30,
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if (!is_string($body)) {
            throw new \RuntimeException('API-POST fehlgeschlagen.');
        }
        $json = json_decode($body, true);
        if ($code >= 400) {
            $msg = is_array($json) && !empty($json['error']['message'])
                ? (string) $json['error']['message']
                : 'API-Fehler (HTTP ' . $code . ').';

            throw new \RuntimeException($msg);
        }

        return is_array($json) ? $json : [];
    }

    private static function b64(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
}
