// ============================================================
// ZMT PIECE - Global Shortcuts (F2 / F3 / F4 / Esc)
// ============================================================
// Self-contained module that works from any page:
//   F2  -> Add a supplier (managers & users with supplier edit permission).
//   F3  -> Add a customer (managers & anyone who can sell).
//   F4  -> Sales-history window.
//   Esc -> Close the top-most open window; when no window is open then sign
//          out; on the login screen it asks to close the whole app.
// The add-windows are built as lightweight .modal-overlay nodes that reuse
// the app's existing modal CSS, so they never conflict with page modals.
(function () {
  if (window._zmtShortcutsBound) return;
  window._zmtShortcutsBound = true;

  // ids of the modals already declared inside the page templates.
  var PAGE_MODAL_IDS = [
    'addSupplierModal', 'editSupplierModal', 'addCustomerModal',
    'inventoryAddProductModal', 'quickEntryModal', 'barcodePrintModal',
    'addProductModal', 'catQuickAddModal',
    'invAddModal', 'invAddDirectModal', 'invQuickAddModal',
    'addKindModal', 'addBrandModal', 'debtPayModal',
    'addExpenseModal', 'expDatePickerModal', 'migrationModal',
    'invPrintChoiceModal', 'invEmailModal', 'waybillFormModal',
    'invDispModal', 'invPurModal', 'invPayModal', 'addInvoiceMenuModal',
    'sdInvoiceModal', 'sdPayModal',
    'cdInvoiceModal', 'cdEditModal', 'cdEditInvoiceModal',
    'salesTransferModal', 'salesAddCustomerModal', 'lanFirewallModal'
  ];
  var PAGE_HIDE_IDS = ['shOverlay', 'recoveryOverlay'];

  var ALL_KNOWN_IDS = PAGE_MODAL_IDS.concat(PAGE_HIDE_IDS);

  var lastGlobalOverlay = null; // the self-contained modal currently open

  // ---------- helpers ------------------------------------------------------

  function $id(id) { return document.getElementById(id); }
  function isShown(el) { return !!el && !!el.style && el.style.display === 'flex'; }
  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function isAfter(a, b) {
    return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) === Node.DOCUMENT_POSITION_FOLLOWING;
  }
  function isKnownId(el) { return el.id && ALL_KNOWN_IDS.indexOf(el.id) !== -1; }

  var GLOBAL_IDS = ['_zmtSupplierOverlay', '_zmtCustomerOverlay'];
  function isGlobalOverlay(el) { return el && GLOBAL_IDS.indexOf(el.id) !== -1; }

  // Login / blocking screens always answer to Esc with "close the app".
  function isLoginScreen() { return isShown($id('loginOverlay')); }
  function blockingScreen() {
    return isShown($id('licenseOverlay')) || isShown($id('freezeOverlay'));
  }

  // The F-shortcuts only make sense while the user is inside the app.
  function appActive() {
    if (isLoginScreen() || blockingScreen()) return false;
    if (typeof Auth !== 'undefined') {
      try { if (!Auth.isLoggedIn()) return false; } catch (e) {}
    }
    return true;
  }

  function canAct(kind) {
    if (typeof Auth === 'undefined') return true;
    try {
      if (Auth.isManager()) return true;
      if (kind === 'supplier') return !!Auth.canEdit('suppliers');
      if (kind === 'customer') return !!Auth.canView('sales');
      return !!Auth.canView('sales');
    } catch (e) { return true; }
  }

  function denyPermission() {
    try { alert('لا تملك صلاحية تنفيذ هذا الإجراء'); } catch (e) {}
  }

  function closeApp() {
    try {
      if (window.electronAPI && typeof window.electronAPI.close === 'function') {
        window.electronAPI.close();
      } else if (typeof window.close === 'function') {
        window.close();
      }
    } catch (e) {}
  }

  // ---------- generic modal builder ----------------------------------------

  function buildOverlay(opts) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = opts.id;
    overlay.style.cssText = 'display:flex;align-items:center;justify-content:center;position:fixed;inset:0;z-index:100040;background:rgba(0,0,0,0.5)';
    var box = document.createElement('div');
    box.className = 'modal';
    box.style.cssText = 'background:#fff;border-radius:14px;max-width:' + (opts.width || 480) + 'px;width:calc(100vw - 32px);max-height:92vh;display:flex;flex-direction:column;overflow:hidden;position:relative';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');

    // header
    var header = document.createElement('div');
    header.className = 'modal-header';
    var title = document.createElement('h3');
    title.innerHTML = '<i class="' + opts.icon + '" style="margin-left:8px"></i>' + escHtml(opts.title);
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'modal-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.setAttribute('aria-label', t('common.close') || 'Close');
    header.appendChild(title);
    header.appendChild(closeBtn);

    // body
    var body = document.createElement('div');
    body.className = 'modal-body';
    body.style.cssText = 'padding:20px;max-height:calc(92vh - 120px);overflow:auto';
    var rows = '';
    for (var i = 0; i < opts.fields.length; i++) {
      var f = opts.fields[i];
      var req = f.required ? ' <span class="required">*</span>' : '';
      var attrs = '';
      attrs += ' class="form-input"';
      attrs += ' id="' + f.id + '"';
      attrs += ' type="' + (f.type || 'text') + '"';
      if (f.placeholder) attrs += ' placeholder="' + escHtml(f.placeholder) + '"';
      if (f.dir) attrs += ' dir="' + f.dir + '"';
      if (f.min != null) attrs += ' min="' + f.min + '"';
      if (f.max != null) attrs += ' max="' + f.max + '"';
      if (f.step != null) attrs += ' step="' + f.step + '"';
      if (f.value) attrs += ' value="' + escHtml(f.value) + '"';
      if (f.accept) attrs += ' accept="' + f.accept + '"';
      var control;
      if (f.kind === 'select') {
        var options = '';
        for (var o = 0; o < f.options.length; o++) {
          var op = f.options[o];
          options += '<option value="' + escHtml(op[0]) + '">' + escHtml(op[1]) + '</option>';
        }
        control = '<select class="form-input" id="' + f.id + '">' + options + '</select>';
      } else if (f.kind === 'file') {
        control = '<div style="display:flex;align-items:center;gap:12px">' +
          '<div id="' + f.previewId + '" style="width:64px;height:64px;border-radius:50%;background:var(--silver-200);display:flex;align-items:center;justify-content:center;overflow:hidden;border:2px solid var(--silver-300);flex-shrink:0">' +
          '<i class="fas fa-user" style="font-size:24px;color:var(--silver-400)"></i></div>' +
          '<input type="file" accept="image/*" id="' + f.id + '" style="font-size:12px">' +
          '</div>';
      } else {
        control = '<input' + attrs + '>';
      }
      rows += '<div class="form-group"><label>' + escHtml(f.label) + req + '</label>' + control +
        (f.help ? '<small style="color:var(--silver-500);font-size:11px">' + escHtml(f.help) + '</small>' : '') +
        '</div>';
    }
    body.innerHTML = rows;

    // footer
    var footer = document.createElement('div');
    footer.className = 'modal-footer';
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn';
    cancel.textContent = t('common.cancel') || 'إلغاء';
    var save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn btn-success';
    save.innerHTML = '<i class="fas fa-check"></i> ' + (escHtml(t('common.save') || 'حفظ'));
    footer.appendChild(cancel);
    footer.appendChild(save);

    box.appendChild(header);
    box.appendChild(body);
    box.appendChild(footer);
    overlay.appendChild(box);

    function remove() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (window._zmtLastGlobalOverlay === overlay) window._zmtLastGlobalOverlay = null;
      document.body.style.overflow = '';
    }
    closeBtn.addEventListener('click', remove);
    cancel.addEventListener('click', remove);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) remove(); });
    save.addEventListener('click', function () {
      var res = opts.onSave();
      if (res !== false) remove();
    });

    window._zmtLastGlobalOverlay = overlay;
    document.body.appendChild(overlay);
    // Focus the first text field.
    setTimeout(function () {
      var first = body.querySelector('input[type="text"], input:not([type="file"])');
      if (first) first.focus();
    }, 120);
    return overlay;
  }

  function closeGlobalOverlays() {
    ['_zmtSupplierOverlay', '_zmtCustomerOverlay'].forEach(function (id) {
      var el = $id(id);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    window._zmtLastGlobalOverlay = null;
  }

  // Close anything currently open (page modals, dynamic overlays, global ones)
  // so the shortcuts never stack windows on top of each other.
  function forceCloseAllOverlays() {
    closeGlobalOverlays();
    var sh = $id('shOverlay');
    if (isShown(sh) && typeof closeSalesHistory === 'function') {
      try { closeSalesHistory(); } catch (e) {}
    }
    for (var i = 0; i < ALL_KNOWN_IDS.length; i++) {
      var el = $id(ALL_KNOWN_IDS[i]);
      if (el) { el.style.display = 'none'; }
    }
    var dyns = document.querySelectorAll('.modal-overlay');
    for (var j = 0; j < dyns.length; j++) {
      var m = dyns[j];
      if (m.style.display === 'flex' && !isKnownId(m)) {
        try { if (m.parentNode) m.parentNode.removeChild(m); } catch (e) {}
      }
    }
    document.body.style.overflow = '';
  }

  // ---------- F2: add supplier ---------------------------------------------

  function handleAddSupplier() {
    if (!appActive()) return;
    if (!canAct('supplier')) { denyPermission(); return; }
    forceCloseAllOverlays();
    buildOverlay({
      id: '_zmtSupplierOverlay',
      icon: 'fas fa-plus-circle',
      title: t('suppliers.addModalTitle') || 'إضافة مورد جديد',
      width: 480,
      fields: [
        { id: '_zmtSupName',    label: t('suppliers.formName') || 'اسم المورد', required: true },
        { id: '_zmtSupPhone',   label: t('suppliers.formPhone') || 'رقم الهاتف', placeholder: '05XXXXXXXX', dir: 'ltr' },
        { id: '_zmtSupAddress', label: t('suppliers.formAddress') || 'العنوان' },
        { id: '_zmtSupEmail',   label: t('suppliers.formEmail') || 'البريد الإلكتروني (اختياري)', type: 'email', placeholder: 'example@domain.com', dir: 'ltr' }
      ],
      onSave: submitSupplier
    });
  }

  function submitSupplier() {
    var name = $id('_zmtSupName').value.trim();
    if (!name) { alert(t('suppliers.prompts.nameRequired') || 'أدخل اسم المورد'); return false; }
    var suppliers = DB.getSuppliers();
    suppliers.push({
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      name: name,
      phone: $id('_zmtSupPhone').value.trim(),
      address: $id('_zmtSupAddress').value.trim(),
      email: $id('_zmtSupEmail').value.trim(),
      balance: 0
    });
    DB.saveSuppliers(suppliers);
    var added = suppliers[suppliers.length - 1];
    DB.logAudit({ action: 'add', entity: 'supplier', entityId: added.id, detail: name });
    try {
      // Refresh the supplier list if the suppliers page is currently shown.
      if (typeof renderSuppliers === 'function' && $id('suppliersGrid')) renderSuppliers();
    } catch (e) {}
    return true;
  }

  // ---------- F3: add customer ---------------------------------------------

  function handleAddCustomer() {
    if (!appActive()) return;
    if (!canAct('customer')) { denyPermission(); return; }
    forceCloseAllOverlays();
    window._zmtCustPhoto = '';
    buildOverlay({
      id: '_zmtCustomerOverlay',
      icon: 'fas fa-user-plus',
      title: t('customers.addModalTitle') || 'إضافة عميل جديد',
      width: 500,
      fields: [
        { id: '_zmtCustName',     label: t('customers.formName') || 'اسم العميل', required: true },
        { id: '_zmtCustPhone',    label: t('customers.formPhone') || 'رقم الهاتف', placeholder: '0555123456', dir: 'ltr' },
        { id: '_zmtCustAddress',  label: t('customers.formAddress') || 'العنوان' },
        { id: '_zmtCustEmail',    label: t('customers.formEmail') || 'البريد الإلكتروني (اختياري)', type: 'email', placeholder: 'example@domain.com', dir: 'ltr' },
        { id: '_zmtCustType',     kind: 'select', label: t('customers.formType') || 'نوع العميل',
          options: [['unit', t('customers.typeUnit') || 'قطاعي'], ['whole', t('customers.typeWhole') || 'جملة']] },
        { id: '_zmtCustDiscount', label: t('customers.formDiscount') || 'الخصم (%)', type: 'number', value: '0', min: '0', max: '100', step: '0.001' },
        { id: '_zmtCustPhoto',    kind: 'file', previewId: '_zmtCustPhotoPreview', label: t('customers.formPhoto') || 'صورة العميل (اختياري)' }
      ],
      onSave: submitCustomer
    });
    // photo preview (capture phase, removed with the overlay on next close)
    document.removeEventListener('change', zmtPhotoChanged);
    document.addEventListener('change', zmtPhotoChanged);
  }

  function zmtPhotoChanged(e) {
    if (e.target && e.target.id === '_zmtCustPhoto') {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        window._zmtCustPhoto = ev.target.result;
        var prev = $id('_zmtCustPhotoPreview');
        if (prev) prev.innerHTML = '<img src="' + window._zmtCustPhoto + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
      };
      reader.readAsDataURL(file);
    }
  }

  function submitCustomer() {
    var name = $id('_zmtCustName').value.trim();
    if (!name) { alert(t('customers.prompts.nameRequired') || 'أدخل اسم العميل'); return false; }
    var discount = parseFloat($id('_zmtCustDiscount').value) || 0;
    if (discount < 0 || discount > 100) { alert(t('customers.prompts.invalidDiscount') || 'الخصم يجب أن يكون بين 0 و 100'); return false; }
    var cust = DB.addCustomer({
      name: name,
      phone: $id('_zmtCustPhone').value.trim(),
      address: $id('_zmtCustAddress').value.trim(),
      email: $id('_zmtCustEmail').value.trim(),
      type: $id('_zmtCustType').value === 'whole' ? 'whole' : 'unit',
      discount: discount,
      photo: window._zmtCustPhoto || ''
    });
    if (cust) DB.logAudit({ action: 'add', entity: 'customer', entityId: cust.id, detail: name });
    try {
      if (typeof renderCustomers === 'function' && $id('customersList')) renderCustomers();
    } catch (e) {}
    return true;
  }

  // ---------- F4: sales history --------------------------------------------

  function handleSalesHistory() {
    if (!appActive()) return;
    if (!canAct('history')) { denyPermission(); return; }
    if (typeof openSalesHistory === 'function' && $id('shOverlay')) {
      openSalesHistory();
      return;
    }
    // Sales page is not loaded: go there and open the history automatically.
    window._invOpenSalesHistory = true;
    navigateTo('sales');
  }

  // ---------- Esc -----------------------------------------------------------

  function closeTopBusinessOverlay() {
    // 1) Sales history first (it owns body-scroll + its own state).
    var sh = $id('shOverlay');
    if (isShown(sh)) {
      if (typeof closeSalesHistory === 'function') { closeSalesHistory(); }
      else { sh.style.display = 'none'; document.body.style.overflow = ''; }
      return true;
    }
    // 2) Page-level modals -> hide the top-most visible one.
    var pageEl = null;
    for (var i = 0; i < ALL_KNOWN_IDS.length; i++) {
      var el = $id(ALL_KNOWN_IDS[i]);
      if (isShown(el)) {
        if (!pageEl || isAfter(pageEl, el)) pageEl = el;
      }
    }
    if (pageEl) {
      pageEl.style.display = 'none';
      document.body.style.overflow = '';
      return true;
    }
    // 3) Dynamic (self-contained) modals -> remove the top-most one.
    var dynEl = null;
    var dyns = document.querySelectorAll('.modal-overlay');
    for (var j = 0; j < dyns.length; j++) {
      var m = dyns[j];
      if (m.style.display === 'flex' && !isKnownId(m)) {
        if (!dynEl || isAfter(dynEl, m)) dynEl = m;
      }
    }
    if (dynEl) {
      if (dynEl.parentNode) dynEl.parentNode.removeChild(dynEl);
      document.body.style.overflow = '';
      return true;
    }
    return false;
  }

  function handleEscape(e) {
    // Login screen: always ask before closing the app.
    if (isLoginScreen()) {
      e.preventDefault();
      try {
        if (confirm('هل تريد إغلاق البرنامج؟')) closeApp();
      } catch (err) {}
      return;
    }
    // Blocking overlays (license / freeze): closing the window is the only option.
    if (blockingScreen()) {
      e.preventDefault();
      try {
        if (confirm('هل تريد إغلاق البرنامج؟')) closeApp();
      } catch (err) {}
      return;
    }
    // A window is open -> close only the top-most one.
    if (closeTopBusinessOverlay()) return;
    // Nothing open -> sign out (it shows its own confirmation).
    e.preventDefault();
    if (typeof userLogout === 'function') userLogout();
  }

  // ---------- wire up -------------------------------------------------------

  document.addEventListener('keydown', function (e) {
    // F9: on sales page, if cart non-empty -> clear cart and reset totals to zero
    if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key === 'F9') {
      const cur = window._currentPageId || '';
      if (cur === 'sales') {
        const cart = Array.isArray(window._salesCart) ? window._salesCart : [];
        if (cart.length > 0) {
          e.preventDefault();
          if (typeof window.clearSalesCart === 'function') {
            try { window.clearSalesCart(); } catch (err) {}
          }
        }
      }
      return;
    }

    // F6: open "Add Expense" modal from anywhere
    if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key === 'F6') {
      e.preventDefault();
      if (typeof window.openAddExpenseModal === 'function') {
        try { window.openAddExpenseModal(); } catch (err) {}
        return;
      }
      if (typeof window.navigateTo === 'function') {
        try { window.navigateTo('expenses'); } catch (err) {}
        setTimeout(function () {
          if (typeof window.openAddExpenseModal === 'function') {
            try { window.openAddExpenseModal(); } catch (err) {}
          }
        }, 120);
      }
      return;
    }

    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key) {
      case 'F2': e.preventDefault(); handleAddSupplier(); break;
      case 'F3': e.preventDefault(); handleAddCustomer(); break;
      case 'F4': e.preventDefault(); handleSalesHistory(); break;
      case 'F12': e.preventDefault(); openDrawerHotkey(); break;
      case 'Escape': handleEscape(e); break;
    }
  });

  // F12 opens the cash drawer. The main process intercepts F12 first and sends
  // an IPC event (the reliable path); this DOM handler is the redundant safety
  // net for builds where the main-process hook is unavailable. The drawer module
  // guards against double-firing with a busy flag, so both paths are harmless.
  function openDrawerHotkey() {
    if (typeof window.CashDrawer === 'undefined') return;
    try { window.CashDrawer.openManual(); } catch (e) {}
  }
})();