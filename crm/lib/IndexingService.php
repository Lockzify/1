<?php
declare(strict_types=1);

require_once __DIR__ . '/GoogleIndexingClient.php';

final class IndexingService
{
    public static function canAccess(?array $user): bool
    {
        return CrmDatabase::canAccessFulfilmentViews($user);
    }

    public static function requireAccess(?array $user): void
    {
        if (!self::canAccess($user)) {
            throw new \RuntimeException('Keine Berechtigung für Indexierung.');
        }
    }

    /**
     * @return array{configured:bool,clientEmail:?string,sitesAccessible:int,apiOk:bool,apiMessage:string}
     */
    public static function connectionStatus(): array
    {
        if (!GoogleIndexingClient::hasCredentials()) {
            return [
                'configured' => false,
                'clientEmail' => null,
                'sitesAccessible' => 0,
                'apiOk' => false,
                'apiMessage' => 'Service-Account-JSON fehlt.',
            ];
        }
        try {
            $client = GoogleIndexingClient::loadFromFile(GoogleIndexingClient::credentialsPath());
            $sites = $client->listSiteEntries();

            return [
                'configured' => true,
                'clientEmail' => $client->clientEmail(),
                'sitesAccessible' => count($sites),
                'apiOk' => true,
                'apiMessage' => 'Verbindung zur Google Search Console API erfolgreich.',
            ];
        } catch (\Throwable $e) {
            return [
                'configured' => true,
                'clientEmail' => null,
                'sitesAccessible' => 0,
                'apiOk' => false,
                'apiMessage' => $e->getMessage(),
            ];
        }
    }

    public static function saveCredentialsFromJson(string $json): string
    {
        $json = trim($json);
        if ($json === '') {
            throw new \InvalidArgumentException('JSON-Inhalt fehlt.');
        }
        $data = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($data)) {
            throw new \InvalidArgumentException('Ungültiges JSON.');
        }
        $client = new GoogleIndexingClient($data);
        $dir = dirname(GoogleIndexingClient::credentialsPath());
        if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
            throw new \RuntimeException('Datenverzeichnis konnte nicht angelegt werden.');
        }
        file_put_contents(
            GoogleIndexingClient::credentialsPath(),
            json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)
        );
        chmod(GoogleIndexingClient::credentialsPath(), 0600);

        return $client->clientEmail();
    }

    /**
     * @return array{verified:bool,message:string,property:string}
     */
    public static function verifyDomainProperty(int $domainId): array
    {
        $domain = CrmDatabase::getIndexingDomain($domainId);
        if ($domain === null) {
            throw new \InvalidArgumentException('Domain nicht gefunden.');
        }
        if (!GoogleIndexingClient::hasCredentials()) {
            throw new \RuntimeException('Service-Account-JSON fehlt. Bitte zuerst API-Zugang einrichten.');
        }
        $client = GoogleIndexingClient::loadFromFile(GoogleIndexingClient::credentialsPath());
        $property = (string) $domain['gscProperty'];
        if (!$client->hasSiteAccess($property)) {
            CrmDatabase::setIndexingDomainVerified($domainId, false);

            return [
                'verified' => false,
                'message' => 'Property nicht verknüpft. Fügen Sie ' . $client->clientEmail()
                    . ' in der Google Search Console als Nutzer (Eigentümer) für „' . $property . '“ hinzu.',
                'property' => $property,
            ];
        }
        CrmDatabase::setIndexingDomainVerified($domainId, true);

        return [
            'verified' => true,
            'message' => 'Property verknüpft und API-Zugriff bestätigt.',
            'property' => $property,
        ];
    }

    /**
     * @return array{added:int,skipped:int,total:int}
     */
    public static function importSitemap(int $domainId, string $xmlContent, string $filename): array
    {
        $domain = CrmDatabase::getIndexingDomain($domainId);
        if ($domain === null) {
            throw new \InvalidArgumentException('Domain nicht gefunden.');
        }
        $urls = self::parseSitemapXml($xmlContent);
        if ($urls === []) {
            throw new \InvalidArgumentException('Keine URLs in der Sitemap gefunden.');
        }
        $result = CrmDatabase::importIndexingUrls($domainId, $urls);
        CrmDatabase::updateIndexingDomainSitemapMeta($domainId, $filename, count($urls));

        return $result;
    }

    /**
     * @return list<string>
     */
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
                if ($child->getName() !== 'sitemap') {
                    continue;
                }
                $loc = trim((string) ($child->loc ?? ''));
                if ($loc !== '' && filter_var($loc, FILTER_VALIDATE_URL)) {
                    $urls[] = $loc;
                }
            }
            if ($urls !== []) {
                throw new \InvalidArgumentException(
                    'Sitemap-Index erkannt. Bitte die einzelne Sitemap-Datei hochladen (nicht den Index).'
                );
            }
        }

        foreach ($xml->children($ns) as $child) {
            if ($child->getName() !== 'url') {
                continue;
            }
            $loc = trim((string) ($child->loc ?? ''));
            if ($loc !== '' && filter_var($loc, FILTER_VALIDATE_URL)) {
                $urls[] = $loc;
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

    /**
     * @return array{submitted:int,failed:int,remainingQuota:int,dailyLimit:int,log: list<array<string,mixed>>}
     */
    public static function runDailyBatch(?string $date = null): array
    {
        if (!GoogleIndexingClient::hasCredentials()) {
            throw new \RuntimeException('Service-Account-JSON fehlt.');
        }
        $date = $date ?? gmdate('Y-m-d');
        $settings = CrmDatabase::getIndexingSettings();
        $dailyLimit = (int) ($settings['dailyLimit'] ?? 10);
        $already = CrmDatabase::countIndexingSubmissionsForDate($date);
        $remaining = max(0, $dailyLimit - $already);
        if ($remaining === 0) {
            return [
                'submitted' => 0,
                'failed' => 0,
                'remainingQuota' => 0,
                'dailyLimit' => $dailyLimit,
                'log' => [],
                'message' => 'Tageslimit bereits erreicht.',
            ];
        }

        $client = GoogleIndexingClient::loadFromFile(GoogleIndexingClient::credentialsPath());
        $candidates = CrmDatabase::pickPendingIndexingUrls($remaining);
        $submitted = 0;
        $failed = 0;
        $log = [];

        foreach ($candidates as $row) {
            $domainId = (int) $row['domainId'];
            $urlId = (int) $row['id'];
            $url = (string) $row['url'];
            $domain = CrmDatabase::getIndexingDomain($domainId);
            if ($domain === null || !(int) $domain['active']) {
                continue;
            }
            if (!(int) $domain['propertyVerified']) {
                CrmDatabase::markIndexingUrlFailed($urlId, 'Property nicht verifiziert.');
                $failed++;
                $log[] = ['url' => $url, 'ok' => false, 'message' => 'Property nicht verifiziert.'];
                continue;
            }
            $property = (string) $domain['gscProperty'];
            if (!$client->hasSiteAccess($property)) {
                CrmDatabase::setIndexingDomainVerified($domainId, false);
                CrmDatabase::markIndexingUrlFailed($urlId, 'GSC-Property-Zugriff verloren.');
                $failed++;
                $log[] = ['url' => $url, 'ok' => false, 'message' => 'GSC-Zugriff verloren.'];
                continue;
            }

            $result = $client->requestIndexing($url);
            if ($result['ok']) {
                CrmDatabase::markIndexingUrlSubmitted($urlId);
                CrmDatabase::logIndexingSubmission($date, $urlId, $domainId, $url, true, (string) $result['message']);
                $submitted++;
                $log[] = ['url' => $url, 'ok' => true, 'message' => (string) $result['message']];
            } else {
                CrmDatabase::markIndexingUrlFailed($urlId, (string) $result['message']);
                CrmDatabase::logIndexingSubmission($date, $urlId, $domainId, $url, false, (string) $result['message']);
                $failed++;
                $log[] = ['url' => $url, 'ok' => false, 'message' => (string) $result['message']];
            }
        }

        return [
            'submitted' => $submitted,
            'failed' => $failed,
            'remainingQuota' => max(0, $dailyLimit - CrmDatabase::countIndexingSubmissionsForDate($date)),
            'dailyLimit' => $dailyLimit,
            'log' => $log,
            'message' => $submitted > 0
                ? $submitted . ' Indexierungsanfrage(n) gesendet.'
                : 'Keine URLs zur Indexierung verarbeitet.',
        ];
    }
}
