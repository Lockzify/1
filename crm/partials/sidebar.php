<?php
/** @var string $activeView pipeline|customers|projects|activity|tracking|leads|indexing */
/** @var array{displayName:string,email:string,role:string} $sessionUser */
/** @var string $csrfToken */

$isAdmin = ($sessionUser['role'] ?? '') === 'admin';
$canAccessFulfilmentViews = CrmDatabase::canAccessFulfilmentViews($sessionUser);
$roleLabel = CrmDatabase::userRoleLabel((string) ($sessionUser['role'] ?? 'user'));
$displayName = (string) ($sessionUser['displayName'] ?? '');
$initials = '';
foreach (preg_split('/\s+/u', trim($displayName)) as $part) {
    if ($part !== '') {
        $initials .= mb_strtoupper(mb_substr($part, 0, 1));
        if (mb_strlen($initials) >= 2) {
            break;
        }
    }
}
if ($initials === '' && !empty($sessionUser['email'])) {
    $initials = strtoupper(substr((string) $sessionUser['email'], 0, 2));
}

$crmIndexBase = crm_asset_url('index.php');
$crmNavViews = [
    'pipeline' => 'Deals',
    'customers' => 'Kunden',
    'projects' => 'Projekte',
    'activity' => 'Aktivitäten',
    'tracking' => 'Tracking',
];
if (!$canAccessFulfilmentViews) {
    unset($crmNavViews['customers'], $crmNavViews['projects']);
}
?>
<aside class="crm-sidebar" aria-label="Hauptnavigation">
  <div class="crm-sidebar-brand">
    <a href="<?php echo htmlspecialchars(crm_asset_url('index.php'), ENT_QUOTES, 'UTF-8'); ?>" class="crm-sidebar-logo" title="ADLIONS CRM">
      <span class="crm-sidebar-logo-mark" aria-hidden="true">A</span>
      <span class="crm-sidebar-logo-text">ADLIONS</span>
    </a>
  </div>

  <nav class="crm-sidebar-nav">
    <?php foreach ($crmNavViews as $viewKey => $viewLabel): ?>
      <a
        class="crm-sidebar-link<?php echo $activeView === $viewKey ? ' is-active' : ''; ?>"
        href="<?php echo htmlspecialchars($crmIndexBase . '?view=' . rawurlencode($viewKey), ENT_QUOTES, 'UTF-8'); ?>"
        data-crm-view="<?php echo htmlspecialchars($viewKey, ENT_QUOTES, 'UTF-8'); ?>"
      >
        <?php if ($viewKey === 'pipeline'): ?>
          <span class="crm-sidebar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="8" width="5" height="13" rx="1"/><rect x="17" y="5" width="4" height="16" rx="1"/></svg></span>
        <?php elseif ($viewKey === 'customers'): ?>
          <span class="crm-sidebar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
        <?php elseif ($viewKey === 'projects'): ?>
          <span class="crm-sidebar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span>
        <?php elseif ($viewKey === 'activity'): ?>
          <span class="crm-sidebar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></span>
        <?php else: ?>
          <span class="crm-sidebar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M3 3v18h18"/><path d="M7 16l4-6 4 3 5-8"/></svg></span>
        <?php endif; ?>
        <span class="crm-sidebar-label"><?php echo htmlspecialchars($viewLabel, ENT_QUOTES, 'UTF-8'); ?></span>
      </a>
    <?php endforeach; ?>
    <a class="crm-sidebar-link<?php echo $activeView === 'leads' ? ' is-active' : ''; ?>" href="<?php echo htmlspecialchars(crm_asset_url('leads.php'), ENT_QUOTES, 'UTF-8'); ?>">
      <span class="crm-sidebar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg></span>
      <span class="crm-sidebar-label">Leads</span>
    </a>
    <?php if ($canAccessFulfilmentViews): ?>
    <a class="crm-sidebar-link<?php echo $activeView === 'indexing' ? ' is-active' : ''; ?>" href="<?php echo htmlspecialchars(crm_asset_url('indexing.php'), ENT_QUOTES, 'UTF-8'); ?>">
      <span class="crm-sidebar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6M8 11h6"/></svg></span>
      <span class="crm-sidebar-label">Indexierung</span>
    </a>
    <?php endif; ?>
  </nav>

  <div class="crm-sidebar-footer">
    <?php if ($isAdmin && ($activeView ?? '') !== 'leads'): ?>
      <button class="crm-sidebar-footer-btn" type="button" id="openUsersModal">Nutzer</button>
    <?php endif; ?>
    <div class="crm-sidebar-user" title="<?php echo htmlspecialchars((string) $sessionUser['email'], ENT_QUOTES, 'UTF-8'); ?>">
      <span class="crm-sidebar-avatar" aria-hidden="true"><?php echo htmlspecialchars($initials, ENT_QUOTES, 'UTF-8'); ?></span>
      <span class="crm-sidebar-user-text">
        <strong><?php echo htmlspecialchars($displayName, ENT_QUOTES, 'UTF-8'); ?></strong>
        <small><?php echo htmlspecialchars($roleLabel, ENT_QUOTES, 'UTF-8'); ?></small>
      </span>
    </div>
    <form method="post" class="crm-sidebar-logout">
      <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8'); ?>">
      <button class="crm-sidebar-footer-btn crm-sidebar-footer-btn--logout" type="submit" name="logout" value="1">Abmelden</button>
    </form>
  </div>
</aside>
