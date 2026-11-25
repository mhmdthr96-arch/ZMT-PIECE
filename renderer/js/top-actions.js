// ============================================================================
// ZMT PIECE — Top-bar ACTION buttons
// ----------------------------------------------------------------------------
// Adds a group of coloured, SVG-iconed shortcuts to the title bar:
//   بيع · إدخال سريع · إضافة ذكية · حركات العملاء · حركات الموردين · تفاصيل الديون
//
// It follows the exact injection pattern already used by the activity-log and
// theme buttons: a container is inserted as the FIRST child of
// `.title-bar-controls` (so it sits right next to «الدعم الاحترافي»), and no
// existing button is removed, renamed or reordered. Everything is additive.
//
// Buttons honour the current user's permissions: a user who may not view a page
// simply does not see its shortcut (the check is re-run on every navigation, so
// it also settles right after login).
// ============================================================================
(function () {
  'use strict';

  var ICONS = {
    cart:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/>' +
      '<path d="M2 3h2.2l2.4 12.2a1.6 1.6 0 0 0 1.6 1.3h9.3a1.6 1.6 0 0 0 1.6-1.3L21 7H5.2"/></svg>',
    keyboard:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="2" y="5.5" width="20" height="13" rx="2.6"/>' +
      '<path d="M6 9.5h.01M9.7 9.5h.01M13.4 9.5h.01M17 9.5h.01M6 13h.01M18 13h.01"/>' +
      '<path d="M9.5 13.5h5"/></svg>',
    smart:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>' +
      '<path d="M14 3v5h5"/>' +
      '<path d="M12 14.6l.62 1.38L14 16.6l-1.38.62L12 18.6l-.62-1.38L10 16.6l1.38-.62z" fill="currentColor" stroke="none"/></svg>',
    users:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>' +
      '<path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    truck:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M1 4h12.5v11.5H1z"/><path d="M13.5 8H18l3 3v4.5h-7.5z"/>' +
      '<circle cx="5.5" cy="18.5" r="2"/><circle cx="17.5" cy="18.5" r="2"/></svg>',
    debts:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 3v18"/><path d="M7 21h10"/><path d="M5 7h14"/>' +
      '<path d="M5 7l-3 6a3 3 0 0 0 6 0z"/><path d="M19 7l-3 6a3 3 0 0 0 6 0z"/></svg>',
  };

  // Each action: an id, a colour class, an SVG icon, a permission page, the
  // i18n keys for its label/tooltip and the click handler.
  var ACTIONS = [
    {
      id: 'tbActSell', cls: 'tb-action-sell', icon: ICONS.cart, page: 'sales',
      labelKey: 'movements.btnSell', titleKey: 'movements.btnSellTitle',
      run: function () { if (typeof navigateTo === 'function') navigateTo('sales'); },
    },
    {
      id: 'tbActQuick', cls: 'tb-action-quick', icon: ICONS.keyboard, page: 'quick-entry',
      labelKey: 'movements.btnQuick', titleKey: 'movements.btnQuickTitle',
      run: function () {
        // Same entry point as the F1 shortcut (standalone quick-entry window),
        // with a plain navigation fallback for environments without the bridge.
        if (typeof window.openQuickEntryPage === 'function') window.openQuickEntryPage();
        else if (typeof navigateTo === 'function') navigateTo('quick-entry');
      },
    },
    {
      id: 'tbActSmart', cls: 'tb-action-smart', icon: ICONS.smart, page: 'invoices',
      labelKey: 'movements.btnSmart', titleKey: 'movements.btnSmartTitle',
      run: function () {
        if (typeof window.openSmartAddInvoice === 'function') window.openSmartAddInvoice();
        else if (typeof navigateTo === 'function') navigateTo('invoices');
      },
    },
    {
      id: 'tbActCustomers', cls: 'tb-action-cust', icon: ICONS.users, page: 'customer-movements',
      labelKey: 'movements.btnCustomers', titleKey: 'movements.btnCustomersTitle', badge: 'customers',
      run: function () { if (typeof navigateTo === 'function') navigateTo('customer-movements'); },
    },
    {
      id: 'tbActSuppliers', cls: 'tb-action-sup', icon: ICONS.truck, page: 'supplier-movements',
      labelKey: 'movements.btnSuppliers', titleKey: 'movements.btnSuppliersTitle',
      run: function () { if (typeof navigateTo === 'function') navigateTo('supplier-movements'); },
    },
    {
      id: 'tbActDebtDetails', cls: 'tb-action-debt', icon: ICONS.debts, page: 'debt-details',
      labelKey: 'movements.btnDebts', titleKey: 'movements.btnDebtsTitle',
      run: function () { if (typeof navigateTo === 'function') navigateTo('debt-details'); },
    },
  ];

  function txt(key, fallback) {
    try { if (typeof t === 'function') { var v = t(key); if (v) return v; } } catch (e) {}
    return fallback;
  }

  function canView(page) {
    try {
      if (typeof Auth === 'undefined' || typeof Auth.isLoggedIn !== 'function' || !Auth.isLoggedIn()) return true;
      if (typeof Auth.canView !== 'function') return true;
      return Auth.canView(page);
    } catch (e) { return true; }
  }

  function updateBadges() {
    // Live count of parties that still owe / are owed, shown as a small red
    // chip on the matching shortcut. Purely informational — never blocks a click.
    try {
      if (typeof DB === 'undefined') return;
      var debtors = (DB.getCustomers() || []).filter(function (c) { return Math.abs(parseFloat(c.balance) || 0) > 0.005; }).length;
      var btn = document.getElementById('tbActCustomers');
      if (btn) {
        var chip = btn.querySelector('.tb-action-badge');
        if (chip) chip.textContent = debtors;
        btn.classList.toggle('has-badge', debtors > 0);
      }
    } catch (e) {}
  }

  function applyPermissions() {
    ACTIONS.forEach(function (a) {
      var btn = document.getElementById(a.id);
      if (!btn) return;
      btn.style.display = canView(a.page) ? '' : 'none';
    });
    updateBadges();
  }

  function inject() {
    if (document.getElementById('tbActions')) { applyPermissions(); return; }
    var controls = document.querySelector('.title-bar-controls');
    if (!controls) return;

    var wrap = document.createElement('div');
    wrap.className = 'tb-actions';
    wrap.id = 'tbActions';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', txt('movements.groupAria', 'اختصارات'));

    ACTIONS.forEach(function (a) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tb-action-btn ' + a.cls;
      btn.id = a.id;
      var title = txt(a.titleKey, txt(a.labelKey, ''));
      btn.title = title;
      btn.setAttribute('aria-label', title);
      btn.innerHTML = a.icon +
        '<span class="tb-action-label">' + txt(a.labelKey, '') + '</span>' +
        (a.badge ? '<span class="tb-action-badge">0</span>' : '');
      btn.addEventListener('click', a.run);
      wrap.appendChild(btn);
    });

    controls.insertBefore(wrap, controls.firstChild);
    applyPermissions();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
  // Re-evaluate visibility/counters after every navigation (this also covers the
  // post-login navigation, so a restricted user never keeps a hidden shortcut).
  window.addEventListener('zmt:navigate', applyPermissions);

  window.refreshTopActions = applyPermissions;
})();
