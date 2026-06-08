<?php
declare(strict_types=1);

/**
 * Google Search Console + Indexing API (Service Account, ohne Composer).
 */
final class GoogleIndexingClient
{
    private const TOKEN_URL = 'https://oauth2.googleapis.com/token';
    private const SITES_URL = 'https://www.googleapis.com/webmasters/v3/sites';
    private const INDEXING_URL = 'https://indexing.googleapis.com/v3/urlNotifications:publish';

    /** @var array<string, mixed> */
    private array $serviceAccount;

    public function __construct(array $serviceAccount)
    {
        if (empty($serviceAccount['client_email']) || empty($serviceAccount['private_key'])) {
            throw new \InvalidArgumentException('Service-Account-JSON unvollständig (client_email, private_key).');
        }
        $this->serviceAccount = $serviceAccount;
    }

    public static function credentialsPath(): string
    {
        return dirname(__DIR__) . '/data/google-service-account.json';
    }

    public static function hasCredentials(): bool
    {
        $path = self::credentialsPath();
        if (!is_readable($path)) {
            return false;
        }
        try {
            self::loadFromFile($path);

            return true;
        } catch (\Throwable $e) {
            return false;
        }
    }

    public static function loadFromFile(string $path): self
    {
        $raw = file_get_contents($path);
        if ($raw === false || trim($raw) === '') {
            throw new \RuntimeException('Service-Account-Datei konnte nicht gelesen werden.');
        }
        $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($data)) {
            throw new \RuntimeException('Service-Account-JSON ungültig.');
        }

        return new self($data);
    }

    public function clientEmail(): string
    {
        return (string) $this->serviceAccount['client_email'];
    }

    /**
     * @return list<string>
     */
    public function listSiteEntries(): array
    {
        $token = $this->accessToken(['https://www.googleapis.com/auth/webmasters.readonly']);
        $res = $this->httpGet(self::SITES_URL, $token);
        $entries = [];
        foreach (($res['siteEntry'] ?? []) as $entry) {
            if (is_array($entry) && !empty($entry['siteUrl'])) {
                $entries[] = (string) $entry['siteUrl'];
            }
        }

        return $entries;
    }

    public function hasSiteAccess(string $propertyUrl): bool
    {
        $propertyUrl = self::normalizePropertyUrl($propertyUrl);
        foreach ($this->listSiteEntries() as $site) {
            if (self::normalizePropertyUrl($site) === $propertyUrl) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return array{ok:bool,message:string,detail?:mixed}
     */
    public function requestIndexing(string $url): array
    {
        $url = trim($url);
        if ($url === '' || !filter_var($url, FILTER_VALIDATE_URL)) {
            throw new \InvalidArgumentException('Ungültige URL.');
        }
        $token = $this->accessToken(['https://www.googleapis.com/auth/indexing']);
        try {
            $res = $this->httpPostJson(self::INDEXING_URL, $token, [
                'url' => $url,
                'type' => 'URL_UPDATED',
            ]);

            return [
                'ok' => true,
                'message' => 'Indexierungsanfrage gesendet.',
                'detail' => $res,
            ];
        } catch (\RuntimeException $e) {
            return [
                'ok' => false,
                'message' => $e->getMessage(),
            ];
        }
    }

    public static function normalizePropertyUrl(string $property): string
    {
        $property = trim($property);
        if (str_starts_with($property, 'sc-domain:')) {
            return 'sc-domain:' . strtolower(substr($property, 10));
        }
        if (!str_contains($property, '://')) {
            return 'sc-domain:' . strtolower(preg_replace('#^www\.#i', '', $property));
        }
        $parts = parse_url($property);
        if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
            throw new \InvalidArgumentException('Ungültige Property-URL.');
        }
        $path = $parts['path'] ?? '/';
        if ($path === '') {
            $path = '/';
        }
        if (!str_ends_with($path, '/')) {
            $path .= '/';
        }

        return strtolower((string) $parts['scheme']) . '://' . strtolower((string) $parts['host']) . $path;
    }

    public static function domainToDefaultProperty(string $domain): string
    {
        $domain = strtolower(trim($domain));
        $domain = preg_replace('#^https?://#i', '', $domain) ?? $domain;
        $domain = preg_replace('#/.*$#', '', $domain) ?? $domain;
        $domain = preg_replace('#^www\.#i', '', $domain) ?? $domain;
        if ($domain === '' || !preg_match('/^[a-z0-9]([a-z0-9\-\.]*[a-z0-9])?$/i', $domain)) {
            throw new \InvalidArgumentException('Ungültige Domain.');
        }

        return 'sc-domain:' . $domain;
    }

    /**
     * @param list<string> $scopes
     */
    private function accessToken(array $scopes): string
    {
        $now = time();
        $header = self::base64UrlEncode(json_encode(['alg' => 'RS256', 'typ' => 'JWT'], JSON_THROW_ON_ERROR));
        $claim = self::base64UrlEncode(json_encode([
            'iss' => $this->clientEmail(),
            'scope' => implode(' ', $scopes),
            'aud' => self::TOKEN_URL,
            'iat' => $now,
            'exp' => $now + 3600,
        ], JSON_THROW_ON_ERROR));
        $input = $header . '.' . $claim;
        $signature = '';
        $key = openssl_pkey_get_private((string) $this->serviceAccount['private_key']);
        if ($key === false) {
            throw new \RuntimeException('Private Key im Service Account ungültig.');
        }
        $signed = openssl_sign($input, $signature, $key, OPENSSL_ALGO_SHA256);
        if (!$signed) {
            throw new \RuntimeException('JWT-Signatur fehlgeschlagen.');
        }
        $jwt = $input . '.' . self::base64UrlEncode($signature);

        $ch = curl_init(self::TOKEN_URL);
        if ($ch === false) {
            throw new \RuntimeException('cURL nicht verfügbar.');
        }
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
            CURLOPT_POSTFIELDS => http_build_query([
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion' => $jwt,
            ]),
            CURLOPT_TIMEOUT => 30,
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if (!is_string($body) || $body === '') {
            throw new \RuntimeException('Token-Anfrage fehlgeschlagen.');
        }
        $json = json_decode($body, true);
        if ($code >= 400 || !is_array($json) || empty($json['access_token'])) {
            $msg = is_array($json) && !empty($json['error_description'])
                ? (string) $json['error_description']
                : 'Token-Anfrage fehlgeschlagen (HTTP ' . $code . ').';

            throw new \RuntimeException($msg);
        }

        return (string) $json['access_token'];
    }

    /**
     * @return array<string, mixed>
     */
    private function httpGet(string $url, string $token): array
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

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function httpPostJson(string $url, string $token, array $payload): array
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
            throw new \RuntimeException('Indexing-API-Anfrage fehlgeschlagen.');
        }
        $json = json_decode($body, true);
        if ($code >= 400) {
            $msg = is_array($json) && !empty($json['error']['message'])
                ? (string) $json['error']['message']
                : 'Indexing-API-Fehler (HTTP ' . $code . ').';

            throw new \RuntimeException($msg);
        }

        return is_array($json) ? $json : [];
    }

    private static function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
}
