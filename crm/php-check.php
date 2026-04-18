<?php
declare(strict_types=1);
// Im Browser aufrufen: …/crm/php-check.php
// Zeigt „PHP OK“ → PHP läuft. Download statt Text → kein PHP auf diesem Host für /crm.
header('Content-Type: text/html; charset=utf-8');
echo '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>PHP-Check</title></head><body>';
echo '<p><strong>PHP OK</strong> – der Webserver führt PHP aus. <a href="index.php">Zum CRM</a></p>';
echo '</body></html>';
