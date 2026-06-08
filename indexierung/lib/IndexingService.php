<?php
declare(strict_types=1);

require_once __DIR__ . '/GoogleApiAuth.php';
require_once __DIR__ . '/GoogleIndexingClient.php';
require_once __DIR__ . '/IndexingDatabase.php';

final class IndexingService
{
    private static function client(): GoogleIndexingClient
    {
        if (!GoogleIndexingClient::hasCredentials()) {
            throw new \RuntimeException('Keine Google-Anmeldung. Bitte OAuth verbinden.');
        }

        return new GoogleIndexingClient();
    }

    /** @return array{configured:bool,authMode:string,clientEmail:?string,sitesAccessible:int,apiOk:bool,apiMessage:string,hasOAuthConfig:bool,redirectUri:?string} */
    public static function connectionStatus(): array
    {
        $mode = GoogleApiAuth::authMode();
        if ($mode === 'none') {
            return [
                'configured' => false,
                'authMode' => 'none',
                'clientEmail' => null,
                'sitesAccessible' => 0,
                'apiOk' => false,
                'apiMessage' => GoogleApiAuth::hasOAuthConfig()
                    ? 'OAuth konfiguriert – bitte mit Google verbinden.'
                    : 'Bitte OAuth Client ID/Secret eintragen und verbinden.',
                'hasOAuthConfig' => GoogleApiAuth::hasOAuthConfig(),
                'redirectUri' => GoogleApiAuth::hasOAuthConfig() ? GoogleApiAuth::redirectUri() : null,
            ];
        }
        try {
            $client = self::client();

            return [
                'configured' => true,
                'authMode' => $mode,
                'clientEmail' => $client->clientEmail(),
                'sitesAccessible' => count($client->listSiteEntries()),
                'apiOk' => true,
                'apiMessage' => $mode === 'oauth'
                    ? 'OAuth-Verbindung zur Google Search Console API erfolgreich.'
                    : 'Service-Account-Verbindung erfolgreich.',
                'hasOAuthConfig' => GoogleApiAuth::hasOAuthConfig(),
                'redirectUri' => GoogleApiAuth::redirectUri(),
            ];
        } catch (\Throwable $e) {
            return [
                'configured' => true,
                'authMode' => $mode,
                'clientEmail' => GoogleApiAuth::accountLabel(),
                'sitesAccessible' => 0,
                'apiOk' => false,
                'apiMessage' => $e->getMessage(),
                'hasOAuthConfig' => GoogleApiAuth::hasOAuthConfig(),
                'redirectUri' => GoogleApiAuth::redirectUri(),
            ];
        }
    }

    public static function saveOAuthConfig(string $clientId, string $clientSecret): void
    {
        GoogleApiAuth::saveOAuthConfig($clientId, $clientSecret);
    }

    public static function saveCredentialsFromJson(string $json): string
    {
        return GoogleApiAuth::saveServiceAccountJson($json);
    }

    public static function disconnectOAuth(): void
    {
        GoogleApiAuth::disconnectOAuth();
    }

    /** @return array{verified:bool,message:string,property:string} */
    public static function verifyDomainProperty(int $domainId): array
    {
        $domain = IndexingDatabase::getDomain($domainId);
        if ($domain === null) {
            throw new \InvalidArgumentException('Domain nicht gefunden.');
        }
        if (!GoogleIndexingClient::hasCredentials()) {
            throw new \RuntimeException('Keine Google-Anmeldung. Bitte zuerst OAuth verbinden.');
        }
        $client = self::client();
        $property = (string) $domain['gscProperty'];
        if (!$client->hasSiteAccess($property)) {
            IndexingDatabase::setDomainVerified($domainId, false);
            $hint = GoogleApiAuth::authMode() === 'oauth'
                ? 'Das verbundene Google-Konto hat keinen Zugriff auf „' . $property . '“ in der Search Console.'
                : 'Fügen Sie ' . $client->clientEmail() . ' in der Search Console als Inhaber für „' . $property . '“ hinzu.';

            return ['verified' => false, 'message' => $hint, 'property' => $property];
        }
        IndexingDatabase::setDomainVerified($domainId, true);

        return [
            'verified' => true,
            'message' => 'Property verknüpft und API-Zugriff bestätigt.',
            'property' => $property,
        ];
    }

    /** @return array{added:int,skipped:int,total:int} */
    public static function importSitemap(int $domainId, string $xmlContent, string $filename): array
    {
        if (IndexingDatabase::getDomain($domainId) === null) {
            throw new \InvalidArgumentException('Domain nicht gefunden.');
        }
        $urls = self::parseSitemapXml($xmlContent);
        if ($urls === []) {
            throw new \InvalidArgumentException('Keine URLs in der Sitemap gefunden.');
        }
        $result = IndexingDatabase::importUrls($domainId, $urls);
        IndexingDatabase::updateSitemapMeta($domainId, $filename, count($urls));

        return $result;
    }

    /** @return list<string> */
    public static function parseSitemapXml(string $xmlContent): array
    {
        $xmlContent = trim($xmlContent);
        if ($xmlContent === '') {
            return [];
        }
        libxml_use_internal_errors(true);
        $xml = simplexml_load_string($xmlContent);
        if ($xml === false) {
            throw new \InvalidArgumentException('Sitemap-XML konnte nicht gelesen werden.');
        }
        $namespaces = $xml->getNamespaces(true);
        $ns = $namespaces[''] ?? 'http://www.sitemaps.org/schemas/sitemap/0.9';
        $urls = [];

        if ($xml->getName() === 'sitemapindex') {
            foreach ($xml->children($ns) as $child) {
                if ($child->getName() === 'sitemap') {
                    $loc = trim((string) ($child->loc ?? ''));
                    if ($loc !== '' && filter_var($loc, FILTER_VALIDATE_URL)) {
                        $urls[] = $loc;
                    }
                }
            }
            if ($urls !== []) {
                throw new \InvalidArgumentException(
                    'Sitemap-Index erkannt. Bitte die einzelne Sitemap-Datei hochladen (nicht den Index).'
                );
            }
        }

        foreach ($xml->children($ns) as $child) {
            if ($child->getName() === 'url') {
                $loc = trim((string) ($child->loc ?? ''));
                if ($loc !== '' && filter_var($loc, FILTER_VALIDATE_URL)) {
                    $urls[] = $loc;
                }
            }
        }

        if ($urls === [] && isset($xml->url)) {
            foreach ($xml->url as $urlNode) {
                $loc = trim((string) ($urlNode->loc ?? ''));
                if ($loc !== '' && filter_var($loc, FILTER_VALIDATE_URL)) {
                    $urls[] = $loc;
                }
            }
        }

        return array_values(array_unique($urls));
    }

    /** @return array{submitted:int,failed:int,remainingQuota:int,dailyLimit:int,log:list<array<string,mixed>>,message:string} */
    public static function runDailyBatch(?string $date = null): array
    {
        if (!GoogleIndexingClient::hasCredentials()) {
            throw new \RuntimeException('Keine Google-Anmeldung. OAuth zuerst verbinden.');
        }
        $date = $date ?? gmdate('Y-m-d');
        $settings = IndexingDatabase::getSettings();
        $dailyLimit = (int) $settings['dailyLimit'];
        $remaining = max(0, $dailyLimit - IndexingDatabase::countSubmissionsForDate($date));
        if ($remaining === 0) {
            return [
                'submitted' => 0, 'failed' => 0, 'remainingQuota' => 0,
                'dailyLimit' => $dailyLimit, 'log' => [], 'message' => 'Tageslimit bereits erreicht.',
            ];
        }

        $client = self::client();
        $submitted = 0;
        $failed = 0;
        $log = [];

        foreach (IndexingDatabase::pickPendingUrls($remaining) as $row) {
            $domainId = (int) $row['domainId'];
            $urlId = (int) $row['id'];
            $url = (string) $row['url'];
            $domain = IndexingDatabase::getDomain($domainId);
            if ($domain === null || !$domain['active']) {
                continue;
            }
            if (!$domain['propertyVerified']) {
                IndexingDatabase::markUrlFailed($urlId, 'Property nicht verifiziert.');
                $failed++;
                $log[] = ['url' => $url, 'ok' => false, 'message' => 'Property nicht verifiziert.'];
                continue;
            }
            if (!$client->hasSiteAccess((string) $domain['gscProperty'])) {
                IndexingDatabase::setDomainVerified($domainId, false);
                IndexingDatabase::markUrlFailed($urlId, 'GSC-Property-Zugriff verloren.');
                $failed++;
                $log[] = ['url' => $url, 'ok' => false, 'message' => 'GSC-Zugriff verloren.'];
                continue;
            }

            $result = $client->requestIndexing($url);
            if ($result['ok']) {
                IndexingDatabase::markUrlSubmitted($urlId);
                IndexingDatabase::logSubmission($date, $urlId, $domainId, $url, true, (string) $result['message']);
                $submitted++;
                $log[] = ['url' => $url, 'ok' => true, 'message' => (string) $result['message']];
            } else {
                IndexingDatabase::markUrlFailed($urlId, (string) $result['message']);
                IndexingDatabase::logSubmission($date, $urlId, $domainId, $url, false, (string) $result['message']);
                $failed++;
                $log[] = ['url' => $url, 'ok' => false, 'message' => (string) $result['message']];
            }
        }

        return [
            'submitted' => $submitted,
            'failed' => $failed,
            'remainingQuota' => max(0, $dailyLimit - IndexingDatabase::countSubmissionsForDate($date)),
            'dailyLimit' => $dailyLimit,
            'log' => $log,
            'message' => $submitted > 0
                ? $submitted . ' Indexierungsanfrage(n) gesendet.'
                : 'Keine URLs zur Indexierung verarbeitet.',
        ];
    }
}
