<?php
declare(strict_types=1);

require_once __DIR__ . '/GoogleApiAuth.php';

/**
 * Google Search Console + Indexing API.
 */
final class GoogleIndexingClient
{
    private const SITES_URL = 'https://www.googleapis.com/webmasters/v3/sites';
    private const INDEXING_URL = 'https://indexing.googleapis.com/v3/urlNotifications:publish';

    public static function hasCredentials(): bool
    {
        return GoogleApiAuth::hasAuth();
    }

    public function clientEmail(): string
    {
        return GoogleApiAuth::accountLabel() ?? 'unbekannt';
    }

    /** @return list<string> */
    public function listSiteEntries(): array
    {
        $token = GoogleApiAuth::getAccessToken(['https://www.googleapis.com/auth/webmasters.readonly']);
        $res = GoogleApiAuth::httpGet(self::SITES_URL, $token);
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

    /** @return array{ok:bool,message:string,detail?:mixed} */
    public function requestIndexing(string $url): array
    {
        $url = trim($url);
        if ($url === '' || !filter_var($url, FILTER_VALIDATE_URL)) {
            throw new \InvalidArgumentException('Ungültige URL.');
        }
        try {
            $token = GoogleApiAuth::getAccessToken(['https://www.googleapis.com/auth/indexing']);
            $res = GoogleApiAuth::httpPostJson(self::INDEXING_URL, $token, [
                'url' => $url,
                'type' => 'URL_UPDATED',
            ]);

            return ['ok' => true, 'message' => 'Indexierungsanfrage gesendet.', 'detail' => $res];
        } catch (\Throwable $e) {
            return ['ok' => false, 'message' => $e->getMessage()];
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
}
