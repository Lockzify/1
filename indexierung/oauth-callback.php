<?php
declare(strict_types=1);

session_start();

require_once __DIR__ . '/lib/GoogleApiAuth.php';

$base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
if ($base === '/' || $base === '.') {
    $base = '';
}
$indexUrl = ($base === '' ? '' : $base) . '/index.php';

try {
    if (isset($_GET['error'])) {
        throw new \RuntimeException('Google OAuth abgebrochen: ' . (string) $_GET['error']);
    }
    $code = isset($_GET['code']) ? (string) $_GET['code'] : '';
    GoogleApiAuth::handleOAuthCallback($code);
    header('Location: ' . $indexUrl . '?oauth=ok');
} catch (\Throwable $e) {
    $msg = rawurlencode($e->getMessage());
    header('Location: ' . $indexUrl . '?oauth=error&msg=' . $msg);
}
exit;
