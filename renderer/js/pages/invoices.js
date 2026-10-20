// ===== INVOICES PAGE =====
var _invAllInvoices = [];
var _invsFiltered = [];
var _invDetailId = null;
var _invDetailFooterReadOnlyBackup = null;
var _invSearchDebounce = null;
var _invCustomersCache = null;
var _invSuppliersCache = null;
var _invsPager = null;

// Managers, or employees holding the 'invoices' edit permission, may view and
// pay purchase/supplier invoices. Everyone else is restricted to sale invoices.
function _canManageInvoices() {
  if (typeof Auth === 'undefined') return false;
  if (typeof Auth.isManager === 'function' && Auth.isManager()) return true;
  if (typeof Auth.canEdit === 'function' && Auth.canEdit('invoices')) return true;
  return false;
}

// Show the Quick Entry button only for users actually allowed to use it
// (same permission gate as the F1 shortcut).
function setupQuickEntryButton() {
  const btn = document.getElementById('btnQuickEntry');
  if (!btn || typeof Auth === 'undefined') return;
  const allowed = (!Auth.isLoggedIn()) || Auth.canView('quick-entry');
  btn.style.display = allowed ? '' : 'none';
}

// Re-sync the in-memory invoice list (and party caches) from the live DB.
// Single source of truth for every place that needs a fresh list, so invoices
// created elsewhere (e.g. the sales page calling DB.addInvoice directly) show up.
function refreshInvoiceList() {
  _invAllInvoices = DB.getInvoices().sort((a, b) => b.createdAt - a.createdAt);
  _invCustomersCache = null;
  _invSuppliersCache = null;
}

// The cross-window DB bus (F1 quick-entry child ↔ main) announces writes on
// 'zmt:data-refreshed' after the local cache has been reloaded. Re-render the
// open invoices view so a purchase saved in the quick-entry window appears
// without restarting the app. Registered once for the whole page lifecycle.
if (!window._invLiveSyncBound) {
  window._invLiveSyncBound = true;
  window.addEventListener('zmt:data-refreshed', function () {
    refreshInvoiceList();
    if (typeof filterInvoices === 'function') filterInvoices(true);
  });
}

function init_invoices() {
  // Quick-entry "add from scratch" (إضافة من العدم): returning from the
  // quick-entry page reopens the detail modal directly in edit mode with the
  // staged additions/removals applied. The detail modal is portaled to <body>
  // so it survives navigation — hide the stale one before reopening.
  if (window._invQEResume) {
    const r = window._invQEResume;
    window._invQEResume = null;
    const res = window._invQEAddResult || null;
    window._invQEAddResult = null;
    const dmodal = document.getElementById('invDetailModal');
    if (dmodal) dmodal.style.display = 'none';
    _invEditPendingQty = Object.assign({}, _invEditQtySnapshot || {}, (res && res.itemQty) || {});
    if (res) _applyInvQEResult(res);
    showInvDetail(r.invoiceId);
    showInvEditSection(true);
    _invEditQtySnapshot = null;
  }
  refreshInvoiceList();
  setupQuickEntryButton();
  const canManageInv = _canManageInvoices();
  const isUser = !canManageInv;
  const salesHistory = !!window._invSalesHistory;
  const typeFilterEl = document.getElementById('invTypeFilter');
  if (typeFilterEl) {
    // Employees without the invoices permission are restricted to sale invoices only
    typeFilterEl.style.display = (canManageInv && !salesHistory) ? '' : 'none';
    if (!canManageInv) typeFilterEl.value = 'customer';
    // When launched as the sales-history view, lock to sale invoices and hide the type filter
    else if (salesHistory) {
      typeFilterEl.value = 'customer';
      window._invForceType = null;
    }
    // When launched as the sales-history view (with full permission), pre-select sale invoices
    else if (window._invForceType) {
      typeFilterEl.value = window._invForceType;
      window._invForceType = null;
    }
  }
  // In sales-history mode the type-filter reset button is meaningless (no filter), so hide it.
  const resetBtn = document.querySelector('[onclick="resetInvoiceFilters()"]');
  if (resetBtn) resetBtn.style.display = salesHistory ? 'none' : '';
  if (_invsPager) { _invsPager.destroy(); _invsPager = null; }
  const _shOverlayEl = document.querySelector('.sh-overlay');
  const _shScroll = (_shOverlayEl && getComputedStyle(_shOverlayEl).display !== 'none')
    ? document.getElementById('shOverlayBody')
    : (document.querySelector('.main-content') || window);
  _invsPager = new InfiniteScrollPager({
    data: _invsFiltered,
    container: document.getElementById('allInvoicesList'),
    pageSize: 25,
    renderItem: _renderInvCard,
    renderEmpty: () => `<div class="placeholder-box"><i class="fas fa-file-invoice" style="font-size:48px;color:#555"></i><p>${t('invoices.noMatch')}</p></div>`,
    scrollContainer: _shScroll,
  });
  window._activePager = _invsPager;
  filterInvoices();
  _invBindCtxMenu();

  if (!window._invEscBound) {
    window._invEscBound = true;
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var pc = document.getElementById('invPrintChoiceModal');
      if (pc && pc.style.display !== 'none') { closeInvPrintChoice(); return; }
      var am = document.getElementById('addInvoiceMenuModal');
      if (am && am.style.display !== 'none') { closeAddInvoiceMenu(); return; }
      var pm = document.getElementById('paymentInvoiceModal');
      if (pm && pm.style.display !== 'none') { closePaymentInvoiceModal(); return; }
      var dt = document.getElementById('invDetailModal');
      if (dt && dt.style.display !== 'none') { closeInvDetail(); return; }
    });
  }
}

// ===== FILTERS =====

function filterInvoices(keepViewport) {
  const q = normSearch(document.getElementById('invSearchInput').value || '').toLowerCase();
  const dateFrom = document.getElementById('invDateFrom').value;
  const dateTo = document.getElementById('invDateTo').value;
  const canManageInv = _canManageInvoices();
  const salesHistory = !!window._invSalesHistory;
  // In the sales-history view, always restrict to sale (customer) invoices so
  // employees cannot switch the type filter to purchases / suppliers, etc.
  const typeFilter = salesHistory ? 'customer' : (canManageInv ? document.getElementById('invTypeFilter').value : 'customer');

  if (!_invCustomersCache) {
    _invCustomersCache = {};
    DB.getCustomers().forEach(c => { _invCustomersCache[c.id] = c; });
  }
  if (!_invSuppliersCache) {
    _invSuppliersCache = {};
    DB.getSuppliers().forEach(s => { _invSuppliersCache[s.id] = s; });
  }

  _invsFiltered = _invAllInvoices.filter(inv => {
    if (typeFilter !== 'all' && inv.type !== typeFilter) return false;

    if (q) {
      const numMatch = inv.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(q);
      const custMatch = inv.customerId && (_invCustomersCache[inv.customerId]?.name || '').toLowerCase().includes(q);
      const supMatch = inv.supplierId && (_invSuppliersCache[inv.supplierId]?.name || '').toLowerCase().includes(q);
      const walkinMatch = inv.walkinName && inv.walkinName.toLowerCase().includes(q);
      // Search inside invoice line items by product name / barcode (smart match)
      const prodMatch = (inv.items || []).some(it =>
        productSearchScore(it.name || it.productName || '', it.barcode || '', q,
          it.mark || '', it.reference || '', it.countryOfOrigin || '') > 0);
      if (!numMatch && !custMatch && !supMatch && !walkinMatch && !prodMatch) return false;
    }

    if (dateFrom) {
      const from = new Date(dateFrom).setHours(0,0,0,0);
      if (inv.createdAt < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo).setHours(23,59,59,999);
      if (inv.createdAt > to) return false;
    }

    return true;
  });

  const pagEl = document.getElementById('invPagination');
  if (pagEl) pagEl.style.display = 'none';
  const infoEl = document.getElementById('invResultsInfo');
  if (infoEl) infoEl.textContent = _invsFiltered.length + t('invoices.resultsInfo');
  if (_invsPager) {
    if (keepViewport) _invsPager.updateDataKeepScroll(_invsFiltered);
    else _invsPager.updateData(_invsFiltered);
  }
}

function setupInvSearchDebounce() {
  const input = document.getElementById('invSearchInput');
  if (!input) return;
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  newInput.addEventListener('input', debounce(function() { filterInvoices(); }, 300));
}

function resetInvoiceFilters() {
  document.getElementById('invSearchInput').value = '';
  document.getElementById('invDateFrom').value = '';
  document.getElementById('invDateTo').value = '';
  const canManageInv = _canManageInvoices();
  document.getElementById('invTypeFilter').value = canManageInv ? 'all' : 'customer';
  filterInvoices();
}

// (deprecated — kept for onclick compatibility in HTML)
function changeInvoicePage(delta) {}

// ===== RENDER =====

// Expanded items table for the large invoice cards (sales-history overlay only):
// lists every sold product with quantity, the unit price (original price struck
// through when a discount applied) and the line discount amount — mirroring the
// printed bill without leaving the page.
function _renderInvCardItems(inv, max = 8) {
  const items = inv.items || [];
  if (!items.length) return '';

  const unitOf = it => it.price || 0;
  const origOf = it => (it.originalPrice && it.originalPrice > unitOf(it)) ? it.originalPrice : 0;
  const discOf = it => origOf(it) ? (origOf(it) - unitOf(it)) * (it.qty || 0) : (it.discount || 0);

  const rows = items.slice(0, max).map((it) => {
    const unit = unitOf(it);
    const orig = origOf(it);
    const disc = discOf(it);
    const lineTotal = unit * (it.qty || 0);
    return `<tr class="inv-card-row">
      <td class="inv-card-row-name">${escHtml(it.name || it.productName || '—')}</td>
      <td class="inv-card-row-qty">${it.qty || 0}</td>
      <td class="inv-card-row-price">${orig ? `<s class="inv-card-row-orig">${fmtMoney(orig)}</s> ` : ''}${fmtMoney(unit)}<span class="inv-card-row-cur"> DA</span></td>
      <td class="inv-card-row-disc">${disc > 0 ? `<span class="inv-card-row-disc-amt">-${fmtMoney(disc)}</span>` : '<span class="inv-card-row-none">&mdash;</span>'}</td>
      <td class="inv-card-row-total">${fmtMoney(lineTotal)}<span class="inv-card-row-cur"> DA</span></td>
    </tr>`;
  }).join('');

  const totalDisc = items.reduce((s, it) => s + discOf(it), 0);
  const moreHtml = items.length > max
    ? `<div class="inv-card-more"><i class="fas fa-plus-circle" style="margin-left:5px"></i>${items.length - max} ${t('invoices.invCardMoreItems')}</div>`
    : '';
  const discHtml = totalDisc > 0
    ? `<div class="inv-card-disc-sum"><i class="fas fa-tags" style="margin-left:6px"></i>${t('invoices.invCardDiscount')}: <span class="inv-card-disc-amt">DA ${fmtMoney(totalDisc)}</span></div>`
    : '';

  return `<table class="inv-card-rows">
    <thead><tr>
      <th>${t('invoices.invCardProduct')}</th>
      <th class="inv-card-th-center">${t('invoices.invCardQty')}</th>
      <th class="inv-card-th-center">${t('invoices.invCardPrice')}</th>
      <th class="inv-card-th-center">${t('invoices.invCardDiscount')}</th>
      <th class="inv-card-th-center">${t('invoices.invCardTotal')}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>${discHtml}${moreHtml}`;
}

function _renderInvCard(inv, idx) {
  const suppliers = _invSuppliersCache || {};
  const customers = _invCustomersCache || {};
  const date = new Date(inv.createdAt).toLocaleDateString('ar-EG-u-nu-latn');
  const sup = inv.supplierId ? suppliers[inv.supplierId] : null;
  const cust = inv.customerId ? customers[inv.customerId] : null;
  const paidAmount = DB.getInvoiceEffectivePaid(inv);
  const isPayment = inv.type === 'payment';
  // For supplier sales the shown remainder is the net amount he still owes us
  // after the invoice settled our debt (المتبقي على المورد) — not total − paid.
  const remaining = inv.type === 'sup_sale'
    ? DB.getSupSaleNetDue(inv)
    : DB.getInvoiceRemaining(inv);
  const payRatio = inv.type === 'sup_sale'
    ? (remaining > 0 ? 0 : 1)
    : (inv.totalAmount > 0 ? (paidAmount / inv.totalAmount) : 0);

  const isBuy = inv.type === 'supplier' || inv.type === 'purchase';
  const maskBuy = isBuy && !Auth.buyPriceVisible();

  let type, typeColor, typeIcon;
  if (inv.type === 'customer') {
    type = t('invoices.typeSale');
    typeColor = 'badge-success';
    typeIcon = 'fas fa-hand-holding-usd';
  } else if (inv.type === 'sup_sale') {
    type = t('invoices.typeSupSale') || 'بيع لمورد';
    typeColor = 'badge-warning';
    typeIcon = 'fas fa-hand-holding-usd';
  } else if (inv.type === 'payment') {
    type = t('invoices.typePayment');
    typeColor = 'badge-success';
    typeIcon = 'fas fa-money-bill-wave';
  } else if (inv.type === 'supplier') {
    type = t('invoices.typeSupplier');
    typeColor = 'badge-warning';
    typeIcon = 'fas fa-truck';
  } else if (inv.type === 'waybill') {
    type = t('invoices.typeWaybill');
    typeColor = 'badge-info';
    typeIcon = 'fas fa-tasks';
  } else if (inv.type === 'proforma') {
    type = t('invoices.typeProforma');
    typeColor = 'badge-info';
    typeIcon = 'fas fa-file-alt';
  } else if (inv.type === 'dispatch') {
    type = t('invoices.typeDispatch');
    typeColor = 'badge-info';
    typeIcon = 'fas fa-share-square';
  } else if (inv.type === 'transfer') {
    type = t('invoices.typeTransfer');
    typeColor = 'badge-info';
    typeIcon = 'fas fa-exchange-alt';
  } else if (inv.type === 'transfer_receive') {
    type = t('invoices.typeReception');
    typeColor = 'badge-success';
    typeIcon = 'fas fa-clipboard-check';
  } else {
    type = t('invoices.typePurchase');
    typeColor = 'badge-info';
    typeIcon = 'fas fa-shopping-cart';
  }

  const partyName = cust ? cust.name : (sup ? sup.name : (inv.walkinName || ''));
  const lg = !!window._invSalesHistory;

  return `<div class="inv-card${lg ? ' inv-card-lg' : ''}" data-type="${inv.type || 'purchase'}" data-id="${inv.id}" onclick="showInvDetail('${inv.id}')">
    <div class="inv-card-top">
      <div class="inv-card-type">
        <span class="badge ${typeColor}"><i class="${typeIcon}" style="margin-left:4px"></i>${type}</span>
        ${inv.isProvisional && inv.type !== 'proforma' ? `<span class="badge badge-warning" style="margin-right:4px">${t('invoices.badgeProvisional')}</span>` : ''}
        <strong class="inv-card-num">${inv.invoiceNumber || '—'}</strong>
      </div>
      <div class="inv-card-date">${date}</div>
    </div>
    <div class="inv-card-body">
      <div class="inv-card-party">${partyName ? `<i class="fas fa-user" style="margin-left:4px;color:var(--silver-500)"></i>${escHtml(partyName)}` : '<span style="color:var(--silver-400)">—</span>'}<span class="inv-card-actions">${_invCardActionButtons(inv.id, inv.type)}</span></div>
      ${lg ? '' : isPayment
        ? `<div class="inv-card-items"><i class="fas ${inv.direction === 'out' ? 'fa-arrow-up' : 'fa-arrow-down'}" style="font-size:10px;color:var(--silver-500)"></i> ${(inv.direction === 'out' ? t('invoices.payToSupplier') : t('invoices.payFromCustomer'))}</div>`
        : `<div class="inv-card-items">${inv.items ? inv.items.length + ' ' + t('invoices.itemCount') : '—'}</div>`}
      <div class="inv-card-total"><strong>${maskBuy ? '••••' : 'DA' + fmtMoney((inv.totalAmount || 0))}</strong></div>
    </div>
    ${lg ? _renderInvCardItems(inv) : ''}
    ${isPayment
      ? `<div class="inv-card-footer">
          <div class="inv-card-paid" style="color:#00897b"><i class="fas fa-check-circle"></i> ${inv.direction === 'out' ? t('invoices.payToSupplier') : t('invoices.receivedLabel')} DA${fmtMoney((inv.totalAmount || 0))}</div>
        </div>`
      : inv.type === 'sup_sale'
        ? `<div class="inv-card-footer">
          <div class="inv-card-progress">
            <div class="inv-progress-bar" style="width:${remaining > 0 ? 0 : 100}%"></div>
          </div>
          <div class="inv-card-paid">
            ${remaining > 0
              ? `<span style="color:#e65100;font-weight:600">المتبقي على المورد: DA${fmtMoney(remaining)}</span>`
              : `<span style="color:#28a745"><i class="fas fa-check-circle"></i> دين المورد مسوّى</span>`}
          </div>
        </div>`
      : maskBuy
        ? `<div class="inv-card-footer"><div class="inv-card-paid">••••</div></div>`
      : `<div class="inv-card-footer">
      <div class="inv-card-progress">
        <div class="inv-progress-bar" style="width:${Math.min(payRatio * 100, 100)}%"></div>
      </div>
      <div class="inv-card-paid">
        ${payRatio >= 1
          ? `<span style="color:#28a745"><i class="fas fa-check-circle"></i> ${t('invoices.paidLabel')}</span>`
          : payRatio > 0
            ? `<span style="color:#e65100">DA${fmtMoney(paidAmount)}</span>`
            : `<span style="color:var(--silver-400)">${t('invoices.unpaidLabel')}</span>`
        }
        ${remaining > 0 ? `<span style="color:#e65100;font-size:11px">| ${t('invoices.remainingLabel')} DA${fmtMoney(remaining)}</span>` : ''}
      </div>
    </div>`}
  </div>`;
}

// ===== INVOICE CARD QUICK ACTIONS (hover + right-click) =====

function _invActionIcon(name) {
  const base = `viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`;
  switch (name) {
    case 'print':
      return `<svg ${base}><path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/></svg>`;
    case 'pdf':
      return `<svg ${base}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/></svg>`;
    case 'email':
      return `<svg ${base}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`;
    case 'edit':
      return `<svg ${base}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`;
    case 'delete':
      return `<svg ${base}><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`;
    case 'emp':
      return `<svg ${base}><rect x="4" y="3" width="16" height="18" rx="2" opacity="0.35"/><circle cx="12" cy="10" r="3"/><path d="M6 20a6 6 0 0 1 12 0"/></svg>`;
    default:
      return '';
  }
}

function _invCardActionButtons(id, type) {
  const acts = [
    ['print', 'طباعة'],
    ['pdf', 'حفظ PDF'],
    ['email', 'إرسال بالبريد'],
  ];
  if (type !== 'payment') acts.push(['edit', 'تعديل']);
  acts.push(['delete', 'حذف']);
  if (type === 'purchase' || type === 'supplier') {
    acts.push(['emp', 'طباعة إلى الموظف']);
  }
  return acts.map(([a, title]) =>
    `<button type="button" class="inv-act${a === 'delete' ? ' inv-act-danger' : ''}" title="${title}" aria-label="${title}" onclick="event.stopPropagation();invCardAction('${id}','${a}')">${_invActionIcon(a)}</button>`
  ).join('');
}

function invCardAction(id, action) {
  showInvDetail(id);
  if (action === 'print') { printInvFromDetail(); closeInvDetail(); }
  else if (action === 'pdf') { saveInvoicePdf(); closeInvDetail(); }
  else if (action === 'email') { openInvoiceEmail(); closeInvDetail(); }
  else if (action === 'emp') { printInvEmployee(); closeInvDetail(); }
  else if (action === 'edit') { showInvEditSection(); }
  else if (action === 'delete') { deleteInvoiceFromDetail(); }
}

function _invEnsureCtxMenu() {
  if (document.getElementById('invCardCtx')) return;
  const m = document.createElement('div');
  m.id = 'invCardCtx';
  m.className = 'inv-card-ctx';
  const acts = [
    ['print', 'طباعة'],
    ['pdf', 'حفظ PDF'],
    ['email', 'إرسال بالبريد'],
    ['edit', 'تعديل'],
    ['delete', 'حذف']
  ];
  m.innerHTML = acts.map(([a, label]) =>
    `<div class="inv-card-ctx-item" data-action="${a}">${_invActionIcon(a)}<span>${label}</span></div>`
  ).join('') +
    `<div class="inv-card-ctx-emp-wrap" style="display:none"><div class="inv-card-ctx-sep"></div>` +
    `<div class="inv-card-ctx-item" data-action="emp">${_invActionIcon('emp')}<span>طباعة إلى الموظف</span></div></div>`;
  m.addEventListener('click', function (e) {
    const item = e.target.closest('.inv-card-ctx-item');
    if (!item) return;
    const id = m.dataset.invId;
    _invHideCtxMenu();
    if (id) invCardAction(id, item.dataset.action);
  });
  document.body.appendChild(m);
}

function _invShowCtxMenu(id, x, y) {
  _invEnsureCtxMenu();
  const m = document.getElementById('invCardCtx');
  m.dataset.invId = id;
  const inv = DB.getInvoice(id);
  const empWrap = m.querySelector('.inv-card-ctx-emp-wrap');
  if (empWrap) empWrap.style.display = (inv && (inv.type === 'purchase' || inv.type === 'supplier')) ? 'block' : 'none';
  m.querySelectorAll('.inv-card-ctx-item[data-action="edit"]').forEach(el => {
    el.style.display = (inv && inv.type === 'payment') ? 'none' : '';
  });
  m.style.display = 'block';
  const w = m.offsetWidth, h = m.offsetHeight;
  const vw = window.innerWidth, vh = window.innerHeight;
  let left = x, top = y;
  if (left + w > vw - 8) left = vw - w - 8;
  if (top + h > vh - 8) top = vh - h - 8;
  m.style.left = Math.max(8, left) + 'px';
  m.style.top = Math.max(8, top) + 'px';
}

function _invHideCtxMenu() {
  const m = document.getElementById('invCardCtx');
  if (m) m.style.display = 'none';
}

function _invBindCtxMenu() {
  if (window._invCtxBound) return;
  window._invCtxBound = true;
  document.addEventListener('contextmenu', function (e) {
    const card = e.target.closest('#allInvoicesList .inv-card');
    if (!card || !card.dataset.id) return;
    e.preventDefault();
    _invShowCtxMenu(card.dataset.id, e.clientX, e.clientY);
  });
  document.addEventListener('click', function (e) {
    const m = document.getElementById('invCardCtx');
    if (m && m.style.display === 'block' && !m.contains(e.target)) _invHideCtxMenu();
  });
  document.addEventListener('scroll', _invHideCtxMenu, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') _invHideCtxMenu(); });

  // Track the invoice card currently under the mouse cursor (for keyboard shortcuts)
  document.addEventListener('mouseover', function (e) {
    const card = e.target.closest('#allInvoicesList .inv-card');
    window._invHoveredId = card ? card.dataset.id : null;
  });

  // Keyboard shortcuts on the hovered invoice card (layout-independent via e.code)
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const openModal = Array.prototype.some.call(document.querySelectorAll('.modal-overlay'), function (m) { return m.style.display === 'flex'; });
    if (openModal) return;
    const id = window._invHoveredId;
    if (!id) return;
    let action = null;
    switch (e.code) {
      case 'KeyE': action = 'edit'; break;
      case 'KeyP': action = 'print'; break;
      case 'KeyQ': action = 'pdf'; break;
      case 'KeyS': action = 'email'; break;
      case 'KeyU': {
        const inv = DB.getInvoice(id);
        if (inv && (inv.type === 'purchase' || inv.type === 'supplier')) action = 'emp';
        break;
      }
    }
    if (action) {
      e.preventDefault();
      invCardAction(id, action);
    }
  });
}

// ===== ADD INVOICE MENU =====

function showAddInvoiceMenu() {
  const m = document.getElementById('addInvoiceMenuModal');
  if (!m._host) m._host = m.parentNode;
  if (m.parentNode !== document.body) document.body.appendChild(m);
  m.style.display = 'flex';
}

function closeAddInvoiceMenu() {
  const m = document.getElementById('addInvoiceMenuModal');
  m.style.display = 'none';
  if (m._host && m.parentNode === document.body) m._host.appendChild(m);
}

// ===== PAYMENT VOUCHERS (سند قبض) =====
// A payment voucher settles a customer/supplier balance without an invoice
// mission (تسوية رصيد بدون فاتورة).

var _payInvPartyType = 'customer';
var _payInvPartyId = null;
var _payInvBalance = 0;

// ===== PARTY BALANCE DISPLAY (shared) =====
// A customer's positive balance means he owes us (عليه دين / هو مدين لنا); for
// a supplier a positive balance means we owe him (له / نحن ندين له). Negative
// flips the direction. The phrase always disambiguates who owes whom.
function invPartyBalanceHTML(kind, balance, size) {
  const b = parseFloat(balance) || 0;
  size = size || '12px';
  if (b === 0) return `<span style="color:var(--silver-500);font-size:${size}">${t('invoices.noDebt')}</span>`;
  const abs = fmtMoney(Math.abs(b));
  const otherOwes = (kind === 'customer' && b > 0) || (kind === 'supplier' && b < 0);
  const color = otherOwes ? '#e65100' : '#2e7d32';
  const main = otherOwes ? t('invoices.owedOn') : t('invoices.owedFor');
  return `<span style="color:${color};font-size:${size};font-weight:700">${main}</span><span style="color:${color};font-size:${size}"> — DA${abs}</span>`;
}

// Balance block shown next to the party inside invoice detail documents.
// `noPrint` marks the block so it is visible on screen but stripped from every
// printed/PDF/emailed copy (see stripInvPrintHidden). Payment vouchers keep it.
function invPartyBalanceBlockHTML(inv, party, noPrint) {
  if (!party) return '';
  const kind = inv.customerId ? 'customer' : (inv.supplierId ? 'supplier' : null);
  if (!kind) return '';
  const label = kind === 'customer' ? t('invoices.customerBalance') : t('invoices.supplierBalance');
  return `<div${noPrint ? ' class="inv-print-hide"' : ''} dir="rtl" style="margin-top:8px;padding:7px 12px;background:#f6f8fa;border:1px solid #e3e8ee;border-radius:6px;font-size:12px;color:#555;display:inline-block">
      <span style="color:#888">${escHtml(label)}:</span> ${invPartyBalanceHTML(kind, party.balance, '13px')}
    </div>`;
}

// Search-as-you-type party picker for the payment voucher (سند قبض).
function searchPayInvParty(q) {
  const results = document.getElementById('payInvPartyResults');
  if (!results) return;
  q = normSearch(q || '').toLowerCase();
  const kind = _payInvPartyType;
  const parties = (kind === 'customer' ? DB.getCustomers() : DB.getSuppliers())
    .filter(p => !q
      || (p.name || '').toLowerCase().includes(q)
      || (p.phone && p.phone.includes(q)))
    .slice(0, 8);
  results.innerHTML = parties.length === 0
    ? `<div class="search-result-item disabled">${t('inventory.noResults')}</div>`
    : parties.map(p =>
        `<div class="search-result-item" onclick="selectPayInvParty('${p.id}')">
          <strong>${escHtml(p.name)}</strong>
          <span class="text-muted">${invPartyBalanceHTML(kind, p.balance, '11px')}</span>
        </div>`).join('');
}

function selectPayInvParty(id) {
  const kind = _payInvPartyType;
  const party = (kind === 'customer' ? DB.getCustomers() : DB.getSuppliers()).find(p => p.id === id);
  if (!party) return;
  _payInvPartyId = id;
  const search = document.getElementById('payInvPartySearch');
  if (search) search.value = party.name;
  const results = document.getElementById('payInvPartyResults');
  if (results) results.innerHTML = '';
  const nameEl = document.getElementById('payInvPartyName');
  if (nameEl) nameEl.textContent = party.name;
  const selected = document.getElementById('payInvSelected');
  if (selected) selected.style.display = '';
  updatePaymentBalance();
}

function openPaymentInvoiceModal() {
  const m = document.getElementById('paymentInvoiceModal');
  if (!m) return;
  _payInvPartyType = 'customer';
  setPaymentPartyType('customer');
  document.getElementById('payInvAmount').value = '';
  document.getElementById('payInvNote').value = '';
  const warn = document.getElementById('payInvOverpay');
  if (warn) warn.style.display = 'none';
  if (!m._host) m._host = m.parentNode;
  if (m.parentNode !== document.body) document.body.appendChild(m);
  m.style.display = 'flex';
  setTimeout(() => { const s = document.getElementById('payInvPartySearch'); if (s) s.focus(); }, 50);
}

function closePaymentInvoiceModal() {
  const m = document.getElementById('paymentInvoiceModal');
  if (!m) return;
  m.style.display = 'none';
  if (m._host && m.parentNode === document.body) m._host.appendChild(m);
}

function setPaymentPartyType(type) {
  _payInvPartyType = type;
  _payInvPartyId = null;
  const custTab = document.getElementById('payInvCustTab');
  const suppTab = document.getElementById('payInvSuppTab');
  if (custTab) custTab.className = type === 'customer' ? 'btn btn-primary' : 'btn';
  if (suppTab) suppTab.className = type === 'supplier' ? 'btn btn-primary' : 'btn';
  // Any party is selectable: collecting from a customer with zero/negative
  // balance simply creates credit (رصيد لنا عليه), and a supplier voucher is a
  // debt note (سند دين) that adds to what we owe.
  const search = document.getElementById('payInvPartySearch');
  if (search) search.value = '';
  const results = document.getElementById('payInvPartyResults');
  if (results) results.innerHTML = '';
  const selected = document.getElementById('payInvSelected');
  if (selected) selected.style.display = 'none';
  updatePaymentBalance();
}

function updatePaymentBalance() {
  const balanceEl = document.getElementById('payInvBalance');
  const partyId = _payInvPartyId;
  let balance = 0;
  if (partyId) {
    const party = _payInvPartyType === 'customer'
      ? DB.getCustomers().find(c => c.id === partyId)
      : DB.getSuppliers().find(s => s.id === partyId);
    balance = party ? (parseFloat(party.balance) || 0) : 0;
  }
  _payInvBalance = balance;
  if (balanceEl) {
    balanceEl.innerHTML = partyId
      ? invPartyBalanceHTML(_payInvPartyType, balance, '18px')
      : '<span style="color:var(--silver-500);font-size:14px">—</span>';
  }
  updatePaymentBalanceOverpay();
}

function updatePaymentBalanceOverpay() {
  const amount = parseFloat(document.getElementById('payInvAmount').value) || 0;
  const warn = document.getElementById('payInvOverpay');
  if (!warn) return;
  // Informational (never blocking): collecting more than a customer's debt just
  // flips the balance to a credit we owe them. Supplier vouchers (debt notes)
  // carry no cap at all.
  if (_payInvPartyType === 'customer' && amount > _payInvBalance + 0.001) {
    warn.textContent = t('invoices.overpayWarn') + ' DA' + fmtMoney(_payInvBalance);
    warn.style.display = 'block';
  } else {
    warn.style.display = 'none';
  }
}

function confirmPaymentInvoice() {
  const partyId = _payInvPartyId;
  if (!partyId) { alert(t('invoices.chooseParty')); return; }
  const amount = parseFloat(document.getElementById('payInvAmount').value) || 0;
  if (amount <= 0) { alert(t('invoices.invalidAmount')); return; }
  const method = document.getElementById('payInvMethod').value || 'cash';
  const note = document.getElementById('payInvNote').value.trim();
  const isCustomer = _payInvPartyType === 'customer';

  const inv = DB.addInvoice({
    type: 'payment',
    direction: isCustomer ? 'in' : 'out',
    customerId: isCustomer ? partyId : undefined,
    supplierId: isCustomer ? undefined : partyId,
    totalAmount: amount,
    paidAmount: amount,
    items: [],
    date: new Date().toISOString().slice(0, 10),
    method: method,
    note: note || (isCustomer ? t('invoices.custVoucherNote') : t('invoices.suppVoucherNote')),
    isProvisional: false,
  }, { payment: true });

  // Balance effects (no cap, balances may go negative):
  // - Customer voucher: collecting money reduces what they owe; collecting more
  //   than the debt turns the balance into a credit we owe them (negative).
  // - Supplier voucher: it is a debt note (سند دين); we owe the supplier, so
  //   his outstanding balance increases by the voucher amount.
  if (isCustomer) {
    const customers = DB.getCustomers();
    const cIdx = customers.findIndex(c => c.id === partyId);
    if (cIdx !== -1) {
      customers[cIdx].balance = (parseFloat(customers[cIdx].balance) || 0) - amount;
      DB.saveCustomers(customers);
    }
  } else {
    const suppliers = DB.getSuppliers();
    const sIdx = suppliers.findIndex(s => s.id === partyId);
    if (sIdx !== -1) {
      suppliers[sIdx].balance = (parseFloat(suppliers[sIdx].balance) || 0) + amount;
      DB.saveSuppliers(suppliers);
    }
  }

  closePaymentInvoiceModal();
  refreshInvoiceList();
  filterInvoices();
  alert(t('invoices.paymentInvoiceSaved').replace('{n}', inv.invoiceNumber || ''));
}

function _invTypeLabel(inv) {
  if (inv.type === 'customer') return 'FACTURE DE VENTE';
  if (inv.type === 'sup_sale') return 'FACTURE DE VENTE FOURNISSEUR';
  if (inv.type === 'supplier') return "FACTURE D'ACHAT";
  if (inv.type === 'waybill') return 'BON DE LIVRAISON';
  if (inv.type === 'proforma') return 'FACTURE PROFORMA';
  if (inv.type === 'dispatch') return "BON D'ENVOI";
  if (inv.type === 'transfer') return 'BON DE TRANSFERT';
  if (inv.type === 'transfer_receive') return 'BON DE RÉCEPTION';
  if (inv.type === 'payment') return inv.direction === 'out' ? 'BILLET DE DETTE' : 'BON DE CAISSE';
  return "FACTURE D'ACHAT";
}

function buildPaymentInvoiceHTML(inv) {
  const store = getStoreInfo();
  const isCustomer = !!inv.customerId;
  const party = isCustomer
    ? DB.getCustomers().find(c => c.id === inv.customerId) || null
    : DB.getSuppliers().find(s => s.id === inv.supplierId) || null;
  const date = new Date(inv.createdAt);
  const dateStr = date.toLocaleDateString('fr-DZ', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const amount = inv.totalAmount || 0;
  return `
    <div id="invDetailPrintArea" style="padding:30px 35px;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#222;direction:ltr;text-align:left" dir="ltr">
      <table style="width:100%;border-collapse:collapse" dir="ltr">
        <tr>
          <td style="vertical-align:top;width:60%">
            <div style="font-size:20px;font-weight:900;color:#1a1a1a;text-transform:uppercase;letter-spacing:1px">${escHtml(store.name)}</div>
            <div style="font-size:10px;color:#999;margin-top:1px;text-transform:uppercase;letter-spacing:0.5px">${isCustomer ? 'Reçu de versement' : inv.direction === 'out' ? 'Billet de dette' : 'Bon de caisse'}</div>
            ${store.address ? `<div style="font-size:11px;color:#555;margin-top:4px">${escHtml(store.address)}</div>` : ''}
            ${store.phone ? `<div style="font-size:11px;color:#555">Tél: ${escHtml(store.phone)}</div>` : ''}
            ${storeLegalLineHTML(inv)}
          </td>
          <td style="vertical-align:top;text-align:right;width:40%">
            <div style="font-size:26px;font-weight:900;color:#00897b;text-transform:uppercase;letter-spacing:2px">${_invTypeLabel(inv)}</div>
            <div style="font-size:14px;font-weight:700;color:#333;margin-top:6px">N° ${inv.invoiceNumber || '—'}</div>
            <div style="font-size:11px;color:#555;margin-top:4px;line-height:1.6">
              <div>Date: ${dateStr}</div>
              <div>Heure: ${timeStr}</div>
            </div>
          </td>
        </tr>
      </table>

      <div style="border-top:2px solid #1a1a1a;margin:16px 0 14px"></div>
      <div style="height:1px;background:#ddd;margin-bottom:16px"></div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:16px" dir="ltr">
        <tr>
          <td style="vertical-align:top;width:50%">
            <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px">${isCustomer ? 'Client' : 'Fournisseur'}</div>
            ${party
              ? `<div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-top:2px">${escHtml(party.name)}</div>
                 ${party.phone ? `<div style="font-size:11px;color:#666">Tél: ${escHtml(party.phone)}</div>` : ''}`
              : `<div style="font-size:14px;color:#888">—</div>`
            }
            ${invPartyBalanceBlockHTML(inv, party)}
          </td>
          <td style="vertical-align:top;text-align:right;width:50%">
            <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">${isCustomer ? 'Encaissement' : 'Décaissement'}</div>
            <div style="display:inline-block;padding:4px 14px;background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;border-radius:4px;font-size:12px;font-weight:700">${(inv.method === 'ccp') ? 'CCP' : 'ESPÈCES'}</div>
          </td>
        </tr>
      </table>

      <table style="width:100%;border-collapse:collapse;margin-top:10px" dir="ltr">
        <tr>
          <td style="width:60%"></td>
          <td style="width:40%">
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <tr style="border-top:2px solid #1a1a1a">
                <td style="padding:6px 10px;text-align:left;font-weight:800;font-size:15px;color:#1a1a1a">Montant</td>
                <td style="padding:6px 10px;text-align:right;font-weight:900;font-size:17px;color:#00897b">${fmtMoney(amount)} DA</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      ${inv.note ? `
      <div style="margin-top:12px;padding:10px 14px;border:1px solid #ddd;border-radius:6px;background:#fafafa;font-size:12px;color:#333" dir="ltr">
        <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Observation</div>
        ${escHtml(inv.note)}
      </div>` : ''}

      <div style="border-top:2px solid #1a1a1a;margin-top:24px;padding-top:14px">
        <table style="width:100%;border-collapse:collapse" dir="ltr">
          <tr>
            <td style="width:50%;vertical-align:bottom">
              <div style="font-size:10px;color:#888;margin-bottom:4px">${escHtml(store.name)}</div>
              <div style="font-size:9px;color:#999">Tél: ${store.phone || '—'}</div>
            </td>
            <td style="width:50%;text-align:right;vertical-align:bottom">
              <div style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:1px">Cachet &amp; signature</div>
              <div style="height:50px;margin-top:6px;border-bottom:1px solid #ccc;width:180px;margin-left:auto"></div>
              <div style="font-size:9px;color:#999;margin-top:2px">Lu et approuvé</div>
            </td>
          </tr>
        </table>
      </div>
      <div style="text-align:center;margin-top:12px;font-size:9px;color:#bbb;letter-spacing:0.5px">
        ${escHtml(store.name)} &middot; ${dateStr} &middot; ${inv.invoiceNumber || '—'}
      </div>
    </div>`;
}

// ===== INVOICE DETAIL =====

var _invDetailFooterOriginal = null;

// On pages other than the invoices page (e.g. discounts), the invoice detail
// modal markup lives inside invoices.html which isn't loaded. Inject a copy
// into <body> on demand so viewInvoiceReadOnly / showInvDetail always work.
function ensureInvDetailModal() {
  if (document.getElementById('invDetailModal')) return;
  const holder = document.createElement('div');
  holder.innerHTML = `
    <div id="invDetailModal" class="modal-overlay" style="display:none" onclick="if(event.target===this)closeInvDetail()">
      <div class="modal" style="max-width:800px;width:95%">
        <div class="modal-header" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-start">
          <h3 id="invDetailTitle" style="margin:0;flex:1;min-width:200px"><i class="fas fa-file-invoice"></i> <span></span></h3>
          <div id="invDetailFooter" style="display:flex;gap:8px;flex-wrap:wrap;direction:ltr;margin:0;padding:0;border:0">
            <button class="btn btn-primary" onclick="openInvPrintChoice()" style="display:flex;align-items:center;gap:5px"><i class="fas fa-print"></i> <span>طباعة</span></button>
            <button class="btn" onclick="showInvPaymentSection()" style="display:flex;align-items:center;gap:5px"><i class="fas fa-hand-holding-usd"></i> <span>دفع</span></button>
            <button class="btn" onclick="showInvEditSection()" style="display:flex;align-items:center;gap:5px"><i class="fas fa-edit"></i> <span>تعديل</span></button>
            <button class="btn btn-danger" onclick="deleteInvoiceFromDetail()" style="display:flex;align-items:center;gap:5px"><i class="fas fa-trash"></i> <span>حذف</span></button>
          </div>
          <button class="modal-close" onclick="closeInvDetail()">&times;</button>
        </div>
        <div class="modal-body" id="invDetailBody" style="padding:0;max-height:80vh;overflow-y:auto;direction:ltr;text-align:left"></div>
      </div>
    </div>`;
  document.body.appendChild(holder.firstElementChild);
}

function showInvDetail(invoiceId) {
  ensureInvDetailModal();
  const inv = DB.getInvoice(invoiceId);
  if (!inv) return;
  // Managers and employees holding the 'invoices' edit permission may open
  // supplier/purchase invoices; everyone else is blocked from non-customer types.
  if (!_canManageInvoices() && inv.type !== 'customer') {
    alert(t('invoices.noPermission'));
    return;
  }
  _invDetailId = invoiceId;

  const modal = document.getElementById('invDetailModal');
  // Portal to <body> so position:fixed resolves against the viewport rather
  // than a scrolled/transformed ancestor (e.g. .main-content / .page fadeIn),
  // which would otherwise render the modal at the top of the scrolled list.
  if (!modal._host) modal._host = modal.parentNode;
  if (modal.parentNode !== document.body) document.body.appendChild(modal);
  const body = document.getElementById('invDetailBody');
  const title = document.getElementById('invDetailTitle');
  const footer = document.getElementById('invDetailFooter');
  if (footer && !_invDetailFooterOriginal) _invDetailFooterOriginal = footer.innerHTML;
  if (footer) footer.innerHTML = _invDetailFooterOriginal;

  document.getElementById('invPayTotal').textContent = ((inv.type === 'supplier' || inv.type === 'purchase') && !Auth.buyPriceVisible()) ? '••••' : 'DA' + fmtMoney((inv.totalAmount || 0));
  const isPayment = inv.type === 'payment';
  const paidAmount = isPayment ? (inv.totalAmount || 0) : DB.getInvoiceEffectivePaid(invoiceId);
  const invRemaining = inv.type === 'sup_sale'
    ? DB.getSupSaleNetDue(inv)
    : DB.getInvoiceRemaining(inv);
  const _invBuyMasked = (inv.type === 'supplier' || inv.type === 'purchase') && !Auth.buyPriceVisible();
  document.getElementById('invPayPaid').textContent = _invBuyMasked ? '••••' : 'DA' + fmtMoney(paidAmount);
  document.getElementById('invPayRemaining').textContent = _invBuyMasked ? '••••' : 'DA' + fmtMoney(invRemaining);
  document.getElementById('invPayAmount').value = invRemaining.toFixed(2);

  const invNum = inv.invoiceNumber || '—';
  const typeLabel = _invTypeLabel(inv);

  title.innerHTML = `<i class="fas fa-file-invoice"></i> ${invNum}`;

  body.innerHTML = isPayment ? buildPaymentInvoiceHTML(inv) : buildInvoiceDetailHTML(inv, typeLabel, paidAmount);
  // Payment vouchers are final balance settlements: no partial payment and no editing.
  if (footer) footer.querySelectorAll('button').forEach(b => {
    const oc = b.getAttribute && b.getAttribute('onclick');
    if (isPayment && (oc === 'showInvPaymentSection()' || oc === 'showInvEditSection()')) b.style.display = 'none';
  });
  _injectInvTransferFooterButton(inv);
  modal.style.display = 'flex';
}

function storeLegalLineHTML(inv, forceCat) {
  const store = getStoreInfo();
  const vis = (typeof getLegalInfoVisibility === 'function')
    ? getLegalInfoVisibility()
    : {
        customer: localStorage.getItem('zmt_inv_legal_customer') === '1',
        supplier: localStorage.getItem('zmt_inv_legal_supplier') === '1',
        employee: localStorage.getItem('zmt_inv_legal_employee') === '1',
      };
  const cat = forceCat || ((inv.type === 'supplier' || inv.type === 'purchase') ? 'supplier'
            : (inv.type === 'employee') ? 'employee'
            : 'customer');
  if (!vis[cat]) return '';
  const parts = [];
  if (store.nis) parts.push('NIS: ' + escHtml(store.nis));
  if (store.nif) parts.push('NIF: ' + escHtml(store.nif));
  if (store.rcc) parts.push('RC: ' + escHtml(store.rcc));
  if (store.article) parts.push('ART: ' + escHtml(store.article));
  if (!parts.length) return '';
  return '<div style="font-size:10px;color:#999;margin-top:2px">' + parts.join(' | ') + '</div>';
}

function buildInvoiceDetailHTML(inv, typeLabel, paidAmount) {
  const store = getStoreInfo();
  const remaining = inv.type === 'sup_sale'
    ? DB.getSupSaleNetDue(inv)
    : Math.max(0, (inv.totalAmount || 0) - paidAmount);
  const date = new Date(inv.createdAt);
  const dateStr = date.toLocaleDateString('fr-DZ', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const totalQty = inv.items ? inv.items.reduce((s, it) => s + it.qty, 0) : 0;

  const sup = inv.supplierId ? DB.getSuppliers().find(s => s.id === inv.supplierId) : null;
  const cust = inv.customerId ? DB.getCustomers().find(c => c.id === inv.customerId) : null;
  const party = cust || sup;
  const isCustomer = !!inv.customerId || inv.type === 'waybill' || inv.type === 'proforma' || inv.type === 'customer' || inv.type === 'sup_sale';
  const isBuy = inv.type === 'supplier' || inv.type === 'purchase';
  const maskBuy = isBuy && !Auth.buyPriceVisible();
  const walkinCust = (!cust && !sup && inv.walkinName) ? { name: inv.walkinName, phone: inv.walkinPhone, address: inv.walkinAddress } : null;

  return `
    <div id="invDetailPrintArea" style="padding:30px 35px;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#222;direction:ltr;text-align:left" dir="ltr">
      <table style="width:100%;border-collapse:collapse" dir="ltr">
        <tr>
          <td style="vertical-align:top;width:60%">
            <div style="font-size:20px;font-weight:900;color:#1a1a1a;text-transform:uppercase;letter-spacing:1px">${escHtml(store.name)}</div>
            <div style="font-size:10px;color:#999;margin-top:1px;text-transform:uppercase;letter-spacing:0.5px">${inv.type === 'proforma' ? 'Document proforma — sans valeur commerciale' : 'Document commercial'}</div>
            ${store.address ? `<div style="font-size:11px;color:#555;margin-top:4px">${escHtml(store.address)}</div>` : ''}
            ${store.phone ? `<div style="font-size:11px;color:#555">Tél: ${escHtml(store.phone)}</div>` : ''}
            ${storeLegalLineHTML(inv)}
          </td>
          <td style="vertical-align:top;text-align:right;width:40%">
            <div style="font-size:26px;font-weight:900;color:#1a1a1a;text-transform:uppercase;letter-spacing:2px">${typeLabel}</div>
            <div style="font-size:10px;font-weight:600;color:#888;margin-top:1px;text-transform:uppercase;letter-spacing:1px">${inv.type === 'proforma' ? 'PROFORMA' : 'Original'}</div>
            <div style="font-size:14px;font-weight:700;color:#333;margin-top:6px">N° ${inv.invoiceNumber || '—'}</div>
            <div style="font-size:11px;color:#555;margin-top:4px;line-height:1.6">
              <div>Date: ${dateStr}</div>
              <div>Heure: ${timeStr}</div>
            </div>
          </td>
        </tr>
      </table>

      <div style="border-top:2px solid #1a1a1a;margin:16px 0 14px"></div>
      <div style="height:1px;background:#ddd;margin-bottom:16px"></div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:16px" dir="ltr">
        <tr>
          <td style="vertical-align:top;width:50%">
            <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px">${(isCustomer && inv.type !== 'sup_sale') ? 'Client' : 'Fournisseur'}</div>
            ${party
              ? `<div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-top:2px">${escHtml(party.name)}</div>
                 ${party.phone ? `<div style="font-size:11px;color:#666">Tél: ${escHtml(party.phone)}</div>` : ''}
                 ${party.address ? `<div style="font-size:11px;color:#666">Adresse: ${escHtml(party.address)}</div>` : ''}`
              : walkinCust
                ? `<div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-top:2px">${escHtml(walkinCust.name)}</div>
                   ${walkinCust.phone ? `<div style="font-size:11px;color:#666">Tél: ${escHtml(walkinCust.phone)}</div>` : ''}
                   ${walkinCust.address ? `<div style="font-size:11px;color:#666">Adresse: ${escHtml(walkinCust.address)}</div>` : ''}`
                : `<div style="font-size:14px;color:#888">${isCustomer ? 'Client non enregistré' : '—'}</div>`
            }
            ${invPartyBalanceBlockHTML(inv, party, true)}
          </td>
          <td style="vertical-align:top;text-align:right;width:50%">
            ${inv.isProvisional || inv.type === 'proforma'
              ? `<div style="font-size:10px;color:#999;font-style:italic">Document sans valeur commerciale</div>`
              : inv.type === 'sup_sale'
                ? (remaining > 0
                  ? `<div style="display:inline-block;padding:4px 14px;background:#fff3e0;color:#e65100;border:1px solid #ffcc80;border-radius:4px;font-size:11px;font-weight:700">NON SOLDÉE — المتبقي على المورد</div>`
                  : `<div style="display:inline-block;padding:4px 14px;background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;border-radius:4px;font-size:11px;font-weight:700">SOLDÉE</div>`)
                : paidAmount >= (inv.totalAmount || 0)
                  ? `<div style="display:inline-block;padding:4px 14px;background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;border-radius:4px;font-size:11px;font-weight:700">SOLDÉE</div>`
                  : paidAmount > 0
                    ? `<div style="display:inline-block;padding:4px 14px;background:#fff3e0;color:#e65100;border:1px solid #ffcc80;border-radius:4px;font-size:11px;font-weight:700">PARTIELLEMENT SOLDÉE</div>`
                    : paidAmount === 0 && inv.type === 'waybill'
                      ? `<div style="display:inline-block;padding:4px 14px;background:#f5f5f5;color:#888;border:1px solid #ddd;border-radius:4px;font-size:11px;font-weight:700">NON SOLDÉE</div>`
                      : ''
            }
          </td>
        </tr>
      </table>

      <table style="width:100%;border-collapse:collapse;font-size:12px" dir="ltr">
        <thead>
          <tr style="background:#f2f2f2;border-bottom:2px solid #1a1a1a">
            <th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd">Désignation</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:50px">Qté</th>
            <th style="padding:8px 10px;text-align:right;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:90px">Prix unitaire</th>
            <th style="padding:8px 10px;text-align:right;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:90px">Total</th>
          </tr>
        </thead>
        <tbody>
          ${(inv.items || []).map((item, i) => `
            <tr style="${i % 2 === 0 ? 'background:#fafafa' : ''}">
              <td style="padding:7px 10px;border:1px solid #eee;font-size:12px;color:#333">${escHtml(item.name)}</td>
              <td style="padding:7px 10px;border:1px solid #eee;text-align:center;font-size:12px;color:#333">${item.qty}</td>
              <td style="padding:7px 10px;border:1px solid #eee;text-align:right;font-size:12px;color:#333">
                ${maskBuy ? '••••' : `${(inv.type !== 'waybill' && item.originalPrice && item.originalPrice !== item.price) ? `<span style="text-decoration:line-through;color:#999;font-size:10px">${fmtMoney(item.originalPrice)}</span> ` : ''}
                ${fmtMoney(item.price)} DA`}
              </td>
              <td style="padding:7px 10px;border:1px solid #eee;text-align:right;font-size:12px;font-weight:600;color:#333">${maskBuy ? '••••' : fmtMoney((item.price * item.qty)) + ' DA'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${inv.note ? `
      <div${(inv.mergedFrom && inv.mergedFrom.length) ? ' class="inv-print-hide"' : ''} style="margin-top:12px;padding:10px 14px;border:1px solid #ddd;border-radius:6px;background:#fafafa;font-size:12px;color:#333;white-space:pre-wrap" dir="ltr">
        <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Observation</div>
        ${escHtml(inv.note)}
      </div>` : ''}

      <table style="width:100%;border-collapse:collapse;margin-top:10px" dir="ltr">
        <tr>
          <td style="width:60%"></td>
          <td style="width:40%">
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <tr style="border-top:2px solid #1a1a1a">
                <td style="padding:6px 10px;text-align:left;font-weight:800;font-size:15px;color:#1a1a1a">Net à payer</td>
                <td style="padding:6px 10px;text-align:right;font-weight:900;font-size:17px;color:#0066B1">${maskBuy ? '••••' : fmtMoney((inv.totalAmount || 0)) + ' DA'}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      ${inv.type === 'sup_sale'
        ? (remaining > 0
          ? `<div style="margin-top:14px;padding:12px 16px;background:#fff3e0;border:1px solid #ffcc80;border-radius:6px;font-size:13px;color:#e65100;display:flex;justify-content:space-between;align-items:center" dir="ltr">
              <strong>المتبقي على المورد (Restant dû par le fournisseur):</strong>
              <strong style="font-size:16px">${fmtMoney(remaining)} DA</strong>
            </div>`
          : `<div style="margin-top:14px;padding:12px 16px;background:#e8f5e9;border:1px solid #a5d6a7;border-radius:6px;font-size:13px;color:#2e7d32" dir="ltr">
              <strong>دين المورد مسوّى بالكامل (Dette réglée)</strong>
            </div>`)
        + `<div style="margin-top:8px;font-size:11px;color:#666" dir="ltr">
            مبلغ الفاتورة: <strong>${fmtMoney((inv.totalAmount || 0))} DA</strong>
            ${paidAmount > 0 ? ` &nbsp;|&nbsp; مقبوض نقداً: <strong>${fmtMoney(paidAmount)} DA</strong>` : ''}
            ${(typeof inv.supExpense === 'number') ? ` &nbsp;|&nbsp; مسجّل في المصروفات: <strong>${fmtMoney(inv.supExpense)} DA</strong>` : ''}
          </div>`
        : (paidAmount > 0 || remaining > 0 ? `
        <div style="margin-top:14px;padding:10px 14px;border-radius:6px;font-size:12px;${paidAmount >= (inv.totalAmount || 0) ? 'background:#e8f5e9;border:1px solid #a5d6a7;color:#2e7d32' : 'background:#fff3e0;border:1px solid #ffcc80;color:#e65100'}" dir="ltr">
          <strong>Montant payé:</strong> ${maskBuy ? '••••' : fmtMoney(paidAmount) + ' DA'}
          ${remaining > 0 ? `&nbsp;|&nbsp; <strong>Reste:</strong> ${maskBuy ? '••••' : fmtMoney(remaining) + ' DA'}` : ''}
        </div>` : '')}

      <div style="border-top:2px solid #1a1a1a;margin-top:24px;padding-top:14px">
        <table style="width:100%;border-collapse:collapse" dir="ltr">
          <tr>
            <td style="width:50%;vertical-align:bottom">
              <div style="font-size:10px;color:#888;margin-bottom:4px">${escHtml(store.name)}</div>
              <div style="font-size:9px;color:#999">${store.address ? escHtml(store.address) + '<br>' : ''}Tél: ${store.phone || '—'}</div>
              <div style="font-size:9px;color:#999;margin-top:2px">NIF: — | Facture N° ${inv.invoiceNumber || '—'}</div>
            </td>
            <td style="width:50%;text-align:right;vertical-align:bottom">
              <div style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:1px">Cachet &amp; signature</div>
              <div style="height:50px;margin-top:6px;border-bottom:1px solid #ccc;width:180px;margin-left:auto"></div>
              <div style="font-size:9px;color:#999;margin-top:2px">Lu et approuvé</div>
            </td>
          </tr>
        </table>
      </div>
      <div style="text-align:center;margin-top:12px;font-size:9px;color:#bbb;letter-spacing:0.5px">
        ${escHtml(store.name)} &middot; ${dateStr} &middot; ${inv.invoiceNumber || '—'}
      </div>
    </div>`;
}

// ===== DETAIL ACTIONS =====

function closeInvDetail() {
  const modal = document.getElementById('invDetailModal');
  modal.style.display = 'none';
  if (modal._host && modal.parentNode === document.body) modal._host.appendChild(modal);
  if (_invDetailFooterReadOnlyBackup != null) {
    const footer = document.getElementById('invDetailFooter');
    if (footer) footer.innerHTML = _invDetailFooterReadOnlyBackup;
    _invDetailFooterReadOnlyBackup = null;
  } else if (_invDetailFooterOriginal) {
    const footer = document.getElementById('invDetailFooter');
    if (footer) footer.innerHTML = _invDetailFooterOriginal;
  }
  _invDetailId = null;
}

// Read-only / print-only invoice view (e.g. opened from the discounts page).
// Shows no pay/edit/delete actions — just view + print.
function viewInvoiceReadOnly(invoiceId) {
  ensureInvDetailModal();
  const inv = DB.getInvoice(invoiceId);
  if (!inv) { alert(t('invoices.notFound') || 'الفاتورة غير موجودة'); return; }
  _invDetailId = invoiceId;

  const modal = document.getElementById('invDetailModal');
  if (!modal._host) modal._host = modal.parentNode;
  if (modal.parentNode !== document.body) document.body.appendChild(modal);
  const body = document.getElementById('invDetailBody');

  const isPayment = inv.type === 'payment';
  const paidAmount = isPayment ? (inv.totalAmount || 0) : DB.getInvoiceEffectivePaid(invoiceId);
  const invNum = inv.invoiceNumber || '—';
  const typeLabel = _invTypeLabel(inv);

  document.getElementById('invDetailTitle').innerHTML = `<i class="fas fa-file-invoice"></i> ${invNum}`;
  body.innerHTML = isPayment ? buildPaymentInvoiceHTML(inv) : buildInvoiceDetailHTML(inv, typeLabel, paidAmount);

  const footer = document.getElementById('invDetailFooter');
  if (footer) {
    _invDetailFooterReadOnlyBackup = footer.innerHTML;
    footer.innerHTML = `<button class="btn" onclick="closeInvDetail()">${t('common.close')}</button><button class="btn btn-primary" onclick="printInvFromDetail()"><i class="fas fa-print"></i> ${t('common.print')}</button>`;
  }

  modal.style.display = 'flex';
}

// Elements carrying the 'inv-print-hide' class are shown on screen but stripped
// from every printed / PDF / emailed copy, so the paper stays clean (party
// balance, "merged from delivery notes" observation…). Payment vouchers keep
// their balance block — they have no such class.
function stripInvPrintHidden(html) {
  if (!html || String(html).indexOf('inv-print-hide') === -1) return html;
  try {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    tmp.querySelectorAll('.inv-print-hide').forEach(function (el) { el.remove(); });
    return tmp.innerHTML;
  } catch (e) { return html; }
}

// Monochrome (black & white) override for a print area — mirrors the sales
// page's N&B mode: black text/borders, white background, light grey table bands.
function invBwCss() {
  return `
    #invDetailPrintArea, #invDetailPrintArea *, #invEmpPrintArea, #invEmpPrintArea *, #invoicePrintArea, #invoicePrintArea * {
      color:#000 !important; background:#fff !important; background-color:#fff !important;
      border-color:#000 !important; text-shadow:none !important; box-shadow:none !important;
    }
    #invDetailPrintArea table th, #invDetailPrintArea table td,
    #invEmpPrintArea table th, #invEmpPrintArea table td,
    #invoicePrintArea table th, #invoicePrintArea table td { border-color:#000 !important; }
    #invDetailPrintArea table thead tr, #invEmpPrintArea table thead tr, #invoicePrintArea table thead tr {
      background:#eee !important; background-color:#eee !important;
    }
    #invDetailPrintArea tbody tr:nth-child(even), #invEmpPrintArea tbody tr:nth-child(even), #invoicePrintArea tbody tr:nth-child(even) {
      background:#f5f5f5 !important; background-color:#f5f5f5 !important;
    }`;
}

function openPrintWindow(title, bodyHtml, mode) {
  const win = window.open('', '', 'width=800,height=600');
  if (!win) { alert(t('invoices.allowPopups')); return; }
  const styles = document.querySelectorAll('link[rel="stylesheet"], style');
  let sh = '';
  styles.forEach(s => sh += s.outerHTML);
  const bw = mode === 'bw' ? invBwCss() : '';
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + title + '</title>' + sh + '<style>@page{margin:10mm;size:A4}body{margin:0;padding:0;font-family:"Segoe UI","Helvetica Neue",Arial,sans-serif}*{box-sizing:border-box}@media print{body{margin:0;padding:0}}' + bw + '</style></head><body>' + bodyHtml + '<script>window.print();window.close();<\/script></body></html>');
  win.document.close();
}

// `mode`: 'color' (default) or 'bw' (أبيض وأسود) — chosen in the print dialog.
function printInvFromDetail(mode) {
  const content = document.getElementById('invDetailPrintArea');
  if (!content) return;
  openPrintWindow(t('invoices.invoiceDetails') || 'Facture', stripInvPrintHidden(content.outerHTML), mode);
}

function openInvPrintChoice() {
  const inv = DB.getInvoice(_invDetailId);
  if (!inv) return;
  const m = document.getElementById('invPrintChoiceModal');
  if (!m) return;
  if (!m._host) m._host = m.parentNode;
  if (m.parentNode !== document.body) document.body.appendChild(m);
  const empBtn = document.getElementById('invPrintEmployeeBtn');
  if (empBtn) empBtn.style.display = (inv.type === 'purchase' || inv.type === 'supplier') ? 'flex' : 'none';
  m.style.display = 'flex';
}

function closeInvPrintChoice() {
  const m = document.getElementById('invPrintChoiceModal');
  if (!m) return;
  m.style.display = 'none';
  if (m._host && m.parentNode === document.body) m._host.appendChild(m);
}

function printInvEmployee() {
  const inv = DB.getInvoice(_invDetailId);
  if (!inv) return;
  closeInvPrintChoice();
  const html = buildEmployeePrintHTML(inv);
  openPrintWindow(t('invoices.employeeDocTitle') || 'Bon de préparation', html);
}

function buildEmployeePrintHTML(inv) {
  const store = getStoreInfo();
  const date = new Date(inv.createdAt);
  const dateStr = date.toLocaleDateString('fr-DZ', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const totalQty = inv.items ? inv.items.reduce((s, it) => s + (it.qty || 0), 0) : 0;

  const sup = inv.supplierId ? DB.getSuppliers().find(s => s.id === inv.supplierId) : null;
  const cust = inv.customerId ? DB.getCustomers().find(c => c.id === inv.customerId) : null;
  const party = cust || sup;
  const partyLabel = sup ? 'Fournisseur' : 'Client';

  const rows = (inv.items || []).map((item, i) => {
    const prod = item.productId ? DB.getProduct(item.productId) : null;
    const name = item.name || (prod && prod.name) || '—';
    const emplacement = (prod && prod.storageLocation) || '';
    const reference = (prod && prod.reference) || '';
    const pays = (prod && prod.countryOfOrigin) || '';
    const code = item.barcode || (prod && prod.barcode) || '';
    const qte = item.qty || 0;
    const marque = (prod && prod.mark) || '';
    const cell = v => (v && String(v).length ? escHtml(v) : '—');
    return `
      <tr style="${i % 2 === 0 ? 'background:#fafafa' : ''}">
        <td style="padding:7px 10px;border:1px solid #eee;font-size:12px;color:#333">${escHtml(name)}</td>
        <td style="padding:7px 10px;border:1px solid #eee;font-size:12px;color:#333">${cell(marque)}</td>
        <td style="padding:7px 10px;border:1px solid #eee;font-size:12px;color:#333">${cell(reference)}</td>
        <td style="padding:7px 10px;border:1px solid #eee;font-size:12px;color:#333">${cell(pays)}</td>
        <td style="padding:7px 10px;border:1px solid #eee;font-size:12px;color:#333;direction:ltr;text-align:left">${cell(code)}</td>
        <td style="padding:7px 10px;border:1px solid #eee;font-size:12px;color:#333">${cell(emplacement)}</td>
        <td style="padding:7px 10px;border:1px solid #eee;text-align:center;font-size:12px;color:#333">${qte}</td>
      </tr>`;
  }).join('');

  return `
    <div id="invEmpPrintArea" style="padding:30px 35px;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#222;direction:ltr;text-align:left" dir="ltr">
      <table style="width:100%;border-collapse:collapse" dir="ltr">
        <tr>
          <td style="vertical-align:top;width:60%">
            <div style="font-size:20px;font-weight:900;color:#1a1a1a;text-transform:uppercase;letter-spacing:1px">${escHtml(store.name)}</div>
            ${store.address ? `<div style="font-size:11px;color:#555;margin-top:4px">${escHtml(store.address)}</div>` : ''}
            ${store.phone ? `<div style="font-size:11px;color:#555">Tél: ${escHtml(store.phone)}</div>` : ''}
            ${storeLegalLineHTML(inv, 'employee')}
          </td>
          <td style="vertical-align:top;text-align:right;width:40%">
            <div style="font-size:24px;font-weight:900;color:#1a1a1a;text-transform:uppercase;letter-spacing:2px">BON DE PRÉPARATION</div>
            <div style="font-size:14px;font-weight:700;color:#333;margin-top:6px">N° ${inv.invoiceNumber || '—'}</div>
            <div style="font-size:11px;color:#555;margin-top:4px;line-height:1.6">
              <div>Date: ${dateStr}</div>
              <div>Heure: ${timeStr}</div>
            </div>
          </td>
        </tr>
      </table>

      <div style="border-top:2px solid #1a1a1a;margin:16px 0 14px"></div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:16px" dir="ltr">
        <tr>
          <td style="vertical-align:top;width:50%">
            <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px">${partyLabel}</div>
            ${party
              ? `<div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-top:2px">${escHtml(party.name)}</div>
                 ${party.phone ? `<div style="font-size:11px;color:#666">Tél: ${escHtml(party.phone)}</div>` : ''}`
              : `<div style="font-size:14px;color:#888">—</div>`}
          </td>
          <td style="vertical-align:top;text-align:right;width:50%">
            <div style="font-size:12px;color:#555">Total quantité: <strong>${totalQty}</strong></div>
          </td>
        </tr>
      </table>

      <table style="width:100%;border-collapse:collapse;font-size:12px" dir="ltr">
        <thead>
          <tr style="background:#f2f2f2;border-bottom:2px solid #1a1a1a">
            <th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd">Désignation</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:110px">Marque</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:120px">Référence</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:90px">Pays</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:120px">Code-barres</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:110px">Emplacement</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:50px">Qté</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div style="border-top:2px solid #1a1a1a;margin-top:24px;padding-top:10px">
        <table style="width:100%;border-collapse:collapse" dir="ltr">
          <tr>
            <td style="width:50%;vertical-align:bottom;font-size:10px;color:#888">${escHtml(store.name)}</td>
            <td style="width:50%;text-align:right;vertical-align:bottom">
              <div style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:1px">Cachet &amp; signature</div>
              <div style="height:50px;margin-top:6px;border-bottom:1px solid #ccc;width:180px;margin-left:auto"></div>
            </td>
          </tr>
        </table>
      </div>
      <div style="text-align:center;margin-top:12px;font-size:9px;color:#bbb;letter-spacing:0.5px">
        ${escHtml(store.name)} &middot; ${dateStr} &middot; ${inv.invoiceNumber || '—'}
      </div>
    </div>`;
}

function showInvPaymentSection() {
  if (!_invDetailId) return;
  const inv = DB.getInvoice(_invDetailId);
  if (!inv) return;
  if (inv.type === 'transfer_receive') { alert(t('invoices.cannotPayReception')); return; }
  if (inv.type === 'payment') { alert(t('invoices.cannotPayVoucher')); return; }
  if (inv.isProvisional) { alert(t('invoices.cannotPayProforma')); return; }
  const paid = DB.getInvoiceEffectivePaid(_invDetailId);
  const remaining = inv.type === 'sup_sale'
    ? DB.getSupSaleNetDue(inv)
    : DB.getInvoiceRemaining(inv);
  if (remaining <= 0) { alert(t('invoices.fullyPaidAlert')); return; }
  document.getElementById('invPayTotal').textContent = 'DA' + fmtMoney((inv.totalAmount || 0));
  document.getElementById('invPayPaid').textContent = 'DA' + fmtMoney(paid);
  document.getElementById('invPayRemaining').textContent = 'DA' + fmtMoney(remaining);
  document.getElementById('invPayAmount').value = remaining.toFixed(2);
  const payModal = document.getElementById('invPayModal');
  if (!payModal._host) payModal._host = payModal.parentNode;
  if (payModal.parentNode !== document.body) document.body.appendChild(payModal);
  payModal.style.display = 'flex';
}

function closeInvPay() {
  const m = document.getElementById('invPayModal');
  if (!m) return;
  m.style.display = 'none';
  if (m._host && m.parentNode === document.body) m._host.appendChild(m);
}

function confirmInvPayment() {
  if (!_invDetailId) return;
  const inv = DB.getInvoice(_invDetailId);
  if (!inv) return;
  const paid = DB.getInvoiceEffectivePaid(_invDetailId);
  const remaining = inv.type === 'sup_sale'
    ? DB.getSupSaleNetDue(inv)
    : DB.getInvoiceRemaining(inv);
  const amount = parseFloat(document.getElementById('invPayAmount').value) || 0;
  if (amount <= 0 || amount > remaining) { alert(t('invoices.invalidAmount')); return; }

  DB.addPayment({
    customerId: inv.customerId || undefined,
    supplierId: inv.supplierId || undefined,
    invoiceId: _invDetailId,
    amount,
    method: (document.getElementById('invPayMethod')?.value) || 'cash',
    note: inv.type === 'transfer' ? t('invoices.transferPayNote') : t('invoices.regularPayNote'),
  });

  // Update balance
  if (inv.customerId) {
    const customers = DB.getCustomers();
    const cIdx = customers.findIndex(c => c.id === inv.customerId);
    if (cIdx !== -1) {
      customers[cIdx].balance = (parseFloat(customers[cIdx].balance) || 0) - amount;
      DB.saveCustomers(customers);
    }
  }
  if (inv.supplierId) {
    const suppliers = DB.getSuppliers();
    const sIdx = suppliers.findIndex(s => s.id === inv.supplierId);
    if (sIdx !== -1) {
      if (inv.type === 'sup_sale') {
        suppliers[sIdx].balance = (parseFloat(suppliers[sIdx].balance) || 0) + amount;
      } else {
        suppliers[sIdx].balance = (parseFloat(suppliers[sIdx].balance) || 0) - amount;
      }
      DB.saveSuppliers(suppliers);
    }
  }

  // Update invoice paidAmount
  const newPaid = paid + amount;
  DB.updateInvoice(_invDetailId, { paidAmount: newPaid });

  // Transfer payment sync: also update receiver's reception invoice
  if (inv.type === 'transfer' && inv.toCode) {
    const raw = DB._getRawData();
    const receiverInvIdx = raw.invoices.findIndex(i =>
      i.storeId === inv.toCode && i.type === 'transfer_receive' && i.date === inv.date
    );
    if (receiverInvIdx !== -1) {
      raw.invoices[receiverInvIdx].paidAmount = newPaid;
      DB._saveRawData(raw);
    }
  }

  closeInvPay();
  showInvDetail(_invDetailId);
  filterInvoices();
  alert(t('invoices.paymentSaved'));
}

var _invEditNewItems = [];
var _invEditNewIdx = 0;
// Lines marked for removal by the quick-entry "add from scratch" mode
// (indices into inv.items). Applied (stock decrement + line drop) at save time.
var _invEditRemoved = [];
// Absolute qty values typed on existing lines before opening the quick-entry;
// reapplied on re-render so typed values survive the round-trip.
var _invEditPendingQty = null;
var _invEditQtySnapshot = null;

function showInvEditSection(keepStaged) {
  if (!_invDetailId) return;
  const inv = DB.getInvoice(_invDetailId);
  if (!inv || !inv.items || inv.items.length === 0) return;
  if (inv.type === 'payment') { alert(t('invoices.cannotEditVoucher')); return; }
  if (inv.type === 'transfer_receive') { alert(t('invoices.cannotEditReception')); return; }
  if (inv.type === 'transfer') { showTransferEditSection(inv); return; }
  if (inv.isProvisional && inv.type === 'waybill') { alert(t('invoices.cannotEditProformaWaybill')); return; }

  // سعر الوحدة والخصم قابلان للتعديل في فواتير العملاء وبيعات المورد (المبيعات)
  const showPrices = (inv.type === 'customer' || inv.type === 'sup_sale');
  const isPurFamily = inv.type === 'supplier' || inv.type === 'purchase';

  // keepStaged: re-render after returning from the "add from scratch"
  // quick-entry — the staged additions and removal markers must survive.
  if (!keepStaged) { _invEditNewItems = []; _invEditNewIdx = 0; _invEditRemoved = []; }

  const canQuickAdd = isPurFamily && (typeof Auth === 'undefined' || !Auth.isLoggedIn() || Auth.canView('quick-entry'));

  const body = document.getElementById('invDetailBody');

  let editHtml = `<div style="padding:20px;direction:rtl;text-align:right">
    <div style="font-size:14px;font-weight:700;color:var(--silver-800);margin-bottom:12px">
      <i class="fas fa-edit"></i> ${t('invoices.editTitle')} — ${inv.invoiceNumber || ''}
    </div>
    <p style="font-size:12px;color:var(--silver-500);margin-bottom:14px">
      ${isPurFamily
        ? t('invoices.editHelpSupplier')
        : t('invoices.editHelpCustomer')}
    </p>
    <div style="margin-bottom:14px;padding:10px;background:#f0f7ff;border:1px solid #cce5ff;border-radius:8px;display:flex;gap:8px;align-items:center">
      <i class="fas fa-barcode" style="font-size:18px;color:var(--bmw-blue-1)"></i>
      <input type="text" id="editBarcodeScan" placeholder="${t('invoices.scanPlaceholder')}" dir="ltr" style="flex:1;padding:6px 10px;border:1px solid var(--silver-300);border-radius:4px;font-size:13px" onkeydown="handleEditBarcodeKey(event)">
        <div id="editScanStatus" style="font-size:11px;color:#888">${t('invoices.scanReady')}</div>
      </div>
      <div style="margin-bottom:10px">
        <input type="text" id="editProdSearch" placeholder="${t('inventory.searchExistingPlaceholder')}" dir="rtl" autocomplete="off" style="width:100%;padding:6px 10px;border:1px solid var(--silver-300);border-radius:4px;font-size:13px" oninput="searchEditProduct(this.value)" onkeydown="editSearchKey(event)">
      </div>
      <div id="editSearchResults" style="margin-bottom:10px;max-height:150px;overflow-y:auto"></div>
    <table class="data-table">
      <thead><tr>
        <th>${t('invoices.editColProduct')}</th><th>${t('invoices.editColCurrentQty')}</th><th>${t('invoices.editColNewQty')}</th>
        ${showPrices ? `<th>${t('invoices.editColSellPrice')}</th><th>${t('invoices.editColDiscount')}</th><th>${t('invoices.editColLineTotal')}</th>` : ''}
      </tr></thead>
      <tbody id="editItemsBody">
        ${inv.items.map((item, i) => {
          const rem = isPurFamily && _invEditRemoved.includes(i);
          return `
          <tr${rem ? ' style="opacity:.55"' : ''}>
            <td${rem ? ' style="text-decoration:line-through"' : ''}>${escHtml(item.name)}${rem ? ` <button class="btn btn-sm" onclick="undoInvEditRemove(${i})" style="padding:1px 6px;font-size:10px;margin-right:6px"><i class="fas fa-undo"></i> ${t('invoices.qeUndoRemove')}</button>` : ''}</td>
            <td style="text-align:center">${item.qty}</td>
            <td style="text-align:center">
              <input type="text" class="no-spinner num-input" inputmode="numeric" id="editQty_${i}" value="${item.qty}" min="0" ${rem ? 'disabled ' : ''}oninput="updateInvEditTotals()" style="width:70px;text-align:center;padding:4px 8px;border:1px solid var(--silver-300);border-radius:4px;font-size:14px">
            </td>
            ${showPrices ? `
            <td style="text-align:center">
              <input type="text" class="no-spinner num-input" inputmode="decimal" id="editPrice_${i}" value="${item.price}" min="0" step="0.01" oninput="updateInvEditTotals()" style="width:85px;text-align:center;padding:4px 8px;border:1px solid var(--silver-300);border-radius:4px;font-size:14px">
            </td>
            <td style="text-align:center">
              <input type="text" class="no-spinner num-input" inputmode="decimal" id="editDisc_${i}" value="0" min="0" step="0.01" oninput="updateInvEditTotals()" style="width:80px;text-align:center;padding:4px 8px;border:1px solid var(--silver-300);border-radius:4px;font-size:14px">
            </td>
            <td style="text-align:center" id="editLineTotal_${i}">DA${fmtMoney(item.price * item.qty)}</td>` : ''}
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    ${showPrices ? `
    <div id="editTotalsBar" style="margin-top:12px;padding:10px 14px;background:#fff8e1;border:1px solid #ffe082;border-radius:8px;font-size:13px;font-weight:600;color:var(--silver-700)"></div>` : ''}
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
      ${canQuickAdd ? `
      <button class="btn" onclick="openInvQEAdd()" style="display:flex;align-items:center;gap:6px;background:#fff8e1;border:1px solid #ffe082;color:#8d6e00;font-weight:700"><i class="fas fa-bolt"></i> ${t('invoices.addFromScratch')}</button>` : ''}
      ${isPurFamily ? `
      <button class="btn" onclick="openInvTransfer()" style="display:flex;align-items:center;gap:6px;background:#f0f7ff;border:1px solid #cce5ff;color:var(--bmw-blue-1)"><i class="fas fa-exchange-alt"></i> ${t('invoices.transferBtn')}</button>` : ''}
      <button class="btn btn-primary" onclick="saveInvEdit()"><i class="fas fa-save"></i> ${t('invoices.saveEdits')}</button>
      <button class="btn" onclick="showInvDetail('${_invDetailId}')">${t('common.cancel')}</button>
    </div>
  </div>`;

  body.innerHTML = editHtml;
  document.getElementById('invDetailFooter').style.display = 'none';
  if (keepStaged) {
    for (const ni of _invEditNewItems) renderEditNewItemRow(ni, showPrices);
    if (_invEditPendingQty) {
      for (const key in _invEditPendingQty) {
        const inp = document.getElementById('editQty_' + key);
        if (inp) inp.value = _invEditPendingQty[key];
      }
      _invEditPendingQty = null;
    }
  }
  if (showPrices) updateInvEditTotals();
  setTimeout(() => {
    const scanInput = document.getElementById('editBarcodeScan');
    if (scanInput) scanInput.focus();
  }, 200);
}

function updateInvEditTotals() {
  if (!_invDetailId) return;
  const inv = DB.getInvoice(_invDetailId);
  if (!inv || !inv.items) return;
  const showTotals = (inv.type === 'customer' || inv.type === 'sup_sale');
  if (!showTotals) return;
  const oldTotal = inv.totalAmount || 0;
  let newTotal = 0;

  for (let i = 0; i < inv.items.length; i++) {
    const item = inv.items[i];
    const qtyInput = document.getElementById('editQty_' + i);
    const priceInput = document.getElementById('editPrice_' + i);
    const discInput = document.getElementById('editDisc_' + i);
    if (!qtyInput) { newTotal += item.price * item.qty; continue; }
    const qty = parseInt(qtyInput.value, 10);
    const q = isNaN(qty) || qty < 0 ? item.qty : qty;
    const price = priceInput ? parseFloat(priceInput.value) : item.price;
    const p = priceInput && isFinite(price) && price >= 0 ? price : item.price;
    const disc = discInput ? parseFloat(discInput.value) : 0;
    const d = discInput && isFinite(disc) && disc > 0 ? disc : 0;
    let lineTotal = (p * q) - d;
    if (lineTotal < 0) lineTotal = 0;
    const cell = document.getElementById('editLineTotal_' + i);
    if (cell) cell.textContent = 'DA' + fmtMoney(lineTotal);
    newTotal += lineTotal;
  }

  for (const ni of _invEditNewItems) {
    const qtyInput = document.getElementById('editNewQty_' + ni._idx);
    const priceInput = document.getElementById('editNewPrice_' + ni._idx);
    const discInput = document.getElementById('editNewDisc_' + ni._idx);
    const qty = qtyInput ? parseInt(qtyInput.value, 10) : NaN;
    const q = isNaN(qty) || qty < 1 ? 1 : qty;
    const price = priceInput ? parseFloat(priceInput.value) : (ni.price || 0);
    const p = priceInput && isFinite(price) && price >= 0 ? price : (ni.price || 0);
    const disc = discInput ? parseFloat(discInput.value) : 0;
    const d = discInput && isFinite(disc) && disc > 0 ? disc : 0;
    let lineTotal = (p * q) - d;
    if (lineTotal < 0) lineTotal = 0;
    const cell = document.getElementById('editNewLineTotal_' + ni._idx);
    if (cell) cell.textContent = 'DA' + fmtMoney(lineTotal);
    newTotal += lineTotal;
  }

  const bar = document.getElementById('editTotalsBar');
  if (!bar) return;
  const diff = newTotal - oldTotal;
  const sign = diff > 0 ? '+' : (diff < 0 ? '−' : '');
  const diffColor = diff > 0 ? '#28a745' : (diff < 0 ? '#e65100' : 'var(--silver-500)');
  bar.innerHTML =
    `<span>${t('invoices.currentTotal')} <strong>DA${fmtMoney(oldTotal)}</strong></span>` +
    `<span style="margin:0 12px">→</span>` +
    `<span>${t('invoices.newTotal')} <strong style="color:var(--bmw-blue-1)">DA${fmtMoney(newTotal)}</strong></span>` +
    `<span style="margin-right:12px;color:${diffColor}">${t('invoices.diff')} ${sign}DA${fmtMoney(Math.abs(diff))}</span>`;
}

function handleEditBarcodeKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const input = document.getElementById('editBarcodeScan');
    const q = cleanScannedCode(input.value);
    if (!q) return;
    const status = document.getElementById('editScanStatus');
    const prod = DB.getProductByBarcode(q);
    if (prod) {
      addEditProduct(prod.id);
      status.textContent = t('invoices.scanDone');
      status.style.color = '#28a745';
      input.value = '';
      setTimeout(() => { status.textContent = t('invoices.scanReady'); status.style.color = '#888'; }, 1500);
    } else {
      renderEditProductSearch(q);
      const n = document.querySelectorAll('#editSearchResults .search-result-item:not(.disabled)').length;
      status.textContent = n ? `${n} ${t('invoices.resultCount')}` : t('invoices.scanNotFound');
      status.style.color = n ? '#888' : '#e65100';
      setTimeout(() => { status.textContent = t('invoices.scanReady'); status.style.color = '#888'; }, 1500);
      input.value = '';
    }
  }
}

function addEditProduct(productId) {
  const prod = DB.getProduct(productId);
  if (!prod) return;
  const inv = DB.getInvoice(_invDetailId);
  const isSupplier = inv && (inv.type === 'supplier' || inv.type === 'purchase');
  const showPrices = inv && (inv.type === 'customer' || inv.type === 'sup_sale');
  if (!isSupplier && prod.quantity <= 0) { alert(`"${prod.name}" ${t('invoices.notInStock')}`); return; }

  const idx = _invEditNewIdx++;
  const price = isSupplier ? (prod.buyPrice || 0) : (prod.sellPrice || 0);
  const ni = { _idx: idx, productId: prod.id, barcode: prod.barcode, name: prod.name, price, qty: 1, originalPrice: price, discount: 0 };
  _invEditNewItems.push(ni);
  renderEditNewItemRow(ni, showPrices);
}

// Builds the <tr> for a staged row (existing product picked in the edit screen
// OR a new product staged by the "add from scratch" quick-entry).
function renderEditNewItemRow(ni, showPrices) {
  const idx = ni._idx;
  const tbody = document.getElementById('editItemsBody');
  if (!tbody) return;
  const badgeColor = ni._isNew ? '#e65100' : 'var(--bmw-blue-1)';
  const priceNote = ni._isNew && ni.payload
    ? ` <span style="font-size:10px;color:var(--silver-500)">(${t('quickEntry.buyPrice')}: DA${fmtMoney(ni.payload.buyPrice || 0)})</span>`
    : '';
  const row = document.createElement('tr');
  row.id = `editNewRow_${idx}`;
  row.innerHTML = `
    <td>${escHtml(ni.name)} <span style="font-size:10px;color:${badgeColor};font-weight:600">(${t('invoices.badgeNew')})</span>${priceNote}</td>
    <td style="text-align:center">—</td>
    <td style="text-align:center">
      <input type="text" class="no-spinner num-input" inputmode="decimal" id="editNewQty_${idx}" value="${ni.qty}" min="0" oninput="updateInvEditTotals()" style="width:60px;text-align:center;padding:4px 8px;border:1px solid var(--silver-300);border-radius:4px;font-size:14px">
      <button class="btn btn-sm btn-danger" onclick="removeEditNewItem(${idx})" style="margin-right:4px;padding:2px 6px;font-size:10px"><i class="fas fa-times"></i></button>
    </td>
    ${showPrices ? `
    <td style="text-align:center">
      <input type="text" class="no-spinner num-input" inputmode="decimal" id="editNewPrice_${idx}" value="${ni.price}" min="0" step="0.01" oninput="updateInvEditTotals()" style="width:85px;text-align:center;padding:4px 8px;border:1px solid var(--silver-300);border-radius:4px;font-size:14px">
    </td>
    <td style="text-align:center">
      <input type="text" class="no-spinner num-input" inputmode="decimal" id="editNewDisc_${idx}" value="0" min="0" step="0.01" oninput="updateInvEditTotals()" style="width:80px;text-align:center;padding:4px 8px;border:1px solid var(--silver-300);border-radius:4px;font-size:14px">
    </td>
    <td style="text-align:center" id="editNewLineTotal_${idx}">DA${fmtMoney(ni.price)}</td>` : ''}`;
  tbody.appendChild(row);
  if (showPrices) updateInvEditTotals();
}

function undoInvEditRemove(i) {
  _invEditRemoved = _invEditRemoved.filter(x => x !== i);
  showInvEditSection(true);
}

/* ===== Quick-entry "add from scratch" (إضافة من العدم) =====================
   Opens the quick-entry page bound to the invoice being edited: existing
   invoice lines are prefilled (qty editable, price locked), and confirm()
   there returns the rows instead of writing to the DB. The single commit
   point stays saveInvEdit(). */

function openInvQEAdd() {
  if (!_invDetailId) return;
  const inv = DB.getInvoice(_invDetailId);
  if (!inv || !inv.items || (inv.type !== 'supplier' && inv.type !== 'purchase')) return;
  if (typeof Auth !== 'undefined' && Auth.isLoggedIn() && !Auth.canView('quick-entry')) { alert(t('invoices.noPermission')); return; }

  const sup = inv.supplierId ? (DB.getSuppliers() || []).find(s => s.id === inv.supplierId) : null;
  // Snapshot the qty values typed so far so the round-trip (return + re-render)
  // does not wipe them.
  _invEditQtySnapshot = {};
  const rows = inv.items.map((item, i) => {
    const inp = document.getElementById('editQty_' + i);
    let curQty = item.qty;
    if (inp) { const v = parseInt(inp.value, 10); if (!isNaN(v) && v >= 0) curQty = v; }
    _invEditQtySnapshot[i] = curQty;
    const p = DB.getProduct(item.productId);
    return {
      src: 'item', itemIdx: i, productId: item.productId, name: item.name,
      barcode: (p && p.barcode) || item.barcode || '',
      qty: curQty, price: item.price || 0,
      sell: p ? (p.sellPrice || 0) : 0, whole: p ? (p.wholesalePrice || 0) : 0,
      brandId: p ? (p.brandId || '') : '', reference: p ? (p.reference || '') : '',
      countryOfOrigin: p ? (p.countryOfOrigin || '') : '', mark: p ? (p.mark || '') : '',
      storageLocation: p ? (p.storageLocation || '') : '', family: p ? (p.family || '') : '',
      expiryDate: p ? (p.expiryDate || '') : ''
    };
  }).concat(_invEditNewItems.map(ni => {
    const p = ni.productId ? DB.getProduct(ni.productId) : null;
    return {
      src: 'staged', stagedIdx: ni._idx, isNew: !!ni._isNew, productId: ni.productId || null,
      name: ni.name, barcode: (p && p.barcode) || ni.barcode || '',
      qty: ni.qty, price: ni.price || 0,
      sell: p ? (p.sellPrice || 0) : (ni.payload ? (ni.payload.sellPrice || 0) : 0),
      whole: p ? (p.wholesalePrice || 0) : (ni.payload ? (ni.payload.wholesalePrice || 0) : 0),
      brandId: p ? (p.brandId || '') : (ni.payload ? (ni.payload.brandId || '') : ''),
      reference: p ? (p.reference || '') : (ni.payload ? (ni.payload.reference || '') : ''),
      countryOfOrigin: p ? (p.countryOfOrigin || '') : (ni.payload ? (ni.payload.countryOfOrigin || '') : ''),
      mark: p ? (p.mark || '') : (ni.payload ? (ni.payload.mark || '') : ''),
      storageLocation: p ? (p.storageLocation || '') : (ni.payload ? (ni.payload.storageLocation || '') : ''),
      family: p ? (p.family || '') : (ni.payload ? (ni.payload.family || '') : ''),
      expiryDate: p ? (p.expiryDate || '') : (ni.payload ? (ni.payload.expiryDate || '') : '')
    };
  }));

  window._qePrefill = { invoiceId: inv.id, invoiceNumber: inv.invoiceNumber || '', supplierName: sup ? sup.name : '', rows };
  window._qeReturnPage = 'invoices';
  if (typeof getSidebarState === 'function') { window._qePrevSidebar = getSidebarState(); applySidebarState('slim'); }
  navigateTo('quick-entry');
}

// F1 hook: returns true (and opens the bound quick-entry) when the purchase /
// supplier invoice edit screen is currently open.
window.openInvQEAddIfEditing = function () {
  if (!_invDetailId || !document.getElementById('editBarcodeScan')) return false;
  const inv = DB.getInvoice(_invDetailId);
  if (!inv || (inv.type !== 'supplier' && inv.type !== 'purchase')) return false;
  if (typeof Auth !== 'undefined' && Auth.isLoggedIn() && !Auth.canView('quick-entry')) return false;
  openInvQEAdd();
  return true;
};

// Merges the quick-entry return payload into the edit-screen state. Called
// BEFORE showInvEditSection(true) re-renders the section.
function _applyInvQEResult(res) {
  if (!res) return;
  _invEditRemoved = (res.removals || []).slice();
  (res.stagedDeletes || []).forEach(idx => { _invEditNewItems = _invEditNewItems.filter(ni => ni._idx !== idx); });
  (res.stagedUpdates || []).forEach(u => {
    const ni = _invEditNewItems.find(x => x._idx === u.idx);
    if (ni) ni.qty = u.qty;
  });
  (res.additions || []).forEach(a => {
    const idx = _invEditNewIdx++;
    if (a.payload) {
      _invEditNewItems.push({
        _idx: idx, productId: null, barcode: a.payload.barcode || '', name: a.payload.name,
        price: a.payload.buyPrice || 0, qty: a.qty, originalPrice: a.payload.buyPrice || 0,
        discount: 0, _isNew: true, payload: a.payload
      });
    } else {
      _invEditNewItems.push({
        _idx: idx, productId: a.productId, barcode: a.barcode || '', name: a.name,
        price: a.price || 0, qty: a.qty, originalPrice: a.price || 0, discount: 0
      });
    }
  });
}

function removeEditNewItem(idx) {
  const row = document.getElementById(`editNewRow_${idx}`);
  if (row) row.remove();
  _invEditNewItems = _invEditNewItems.filter(it => it._idx !== idx);
  setTimeout(updateInvEditTotals, 0);
}

var _editSearchTimer = null;
function searchEditProduct(q) {
  if (_editSearchTimer) clearTimeout(_editSearchTimer);
  _editSearchTimer = setTimeout(() => renderEditProductSearch(q), 180);
}

function renderEditProductSearch(q) {
  const results = document.getElementById('editSearchResults');
  if (!results) return;
  q = normSearch(q);
  const products = DB.getProducts();
  const matches = q
    ? products
        .map(p => ({ p, score: productSearchScore(p.name, p.barcode, q, p.mark, p.reference, p.countryOfOrigin) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map(x => x.p)
    : products.slice(0, 10);

  if (matches.length === 0) {
    results.innerHTML = `<div class="search-result-item disabled">${t('inventory.noResults')}</div>`;
    return;
  }

  const inv = DB.getInvoice(_invDetailId);
  const isSupplier = inv && (inv.type === 'supplier' || inv.type === 'purchase');
  results.innerHTML = matches.map(p => {
    const oos = (!isSupplier && p.quantity <= 0);
    const act = oos ? '' : `addEditProduct('${p.id}');document.getElementById('editSearchResults').innerHTML='';`;
    return `<div class="search-result-item ${oos ? 'disabled' : ''}" onclick="${act}">
        <strong>${escHtml(p.name)}</strong>
        <span class="text-muted" dir="ltr">${p.barcode} | ${t('invoices.availableStock')} ${p.quantity}</span>
      </div>`;
  }).join('');
}

function editSearchKey(e) {
  const box = document.getElementById('editSearchResults');
  if (!box) return;
  const items = Array.prototype.slice.call(box.querySelectorAll('.search-result-item:not(.disabled)'));
  if (!items.length) return;
  let idx = items.findIndex(it => it.classList.contains('inv-sel'));
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    idx = (idx + 1) % items.length;
    editHighlightSearch(items, idx);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    idx = (idx - 1 + items.length) % items.length;
    editHighlightSearch(items, idx);
  } else if (e.key === 'Enter') {
    if (idx >= 0) { e.preventDefault(); items[idx].click(); }
  }
}

function editHighlightSearch(items, idx) {
  items.forEach((it, i) => it.classList.toggle('inv-sel', i === idx));
  if (items[idx].scrollIntoView) items[idx].scrollIntoView({ block: 'nearest' });
}

function saveInvEdit() {
  if (!_invDetailId) return;
  const inv = DB.getInvoice(_invDetailId);
  if (!inv || !inv.items) return;

  const isProvisional = inv.isProvisional;
  const salesPriceEdit = (inv.type === 'customer' || inv.type === 'sup_sale');
  const isPurFamily = inv.type === 'supplier' || inv.type === 'purchase';

  const changes = [];
  let totalChanged = false;
  let newTotalAmount = 0;
  const updatedItems = [];

  // Quick-entry removals/decreases on purchase invoices: validate ALL stock
  // guards BEFORE any write so a blocked save never leaves partial changes
  // (or half-created products) behind.
  if (isPurFamily && !isProvisional) {
    for (let i = 0; i < inv.items.length; i++) {
      const item = inv.items[i];
      let targetQty = item.qty;
      if (_invEditRemoved.includes(i)) {
        targetQty = 0;
      } else {
        const input = document.getElementById('editQty_' + i);
        if (input) { const v = parseInt(input.value, 10); if (!isNaN(v) && v >= 0) targetQty = v; }
      }
      const diff = targetQty - item.qty;
      if (diff < 0) {
        const prod = DB.getProduct(item.productId);
        if (prod && ((prod.quantity || 0) + diff) < 0) {
          alert(t('invoices.cannotBelowZero').replace('...', item.name));
          return;
        }
      }
    }
  }

  // Process existing items
  for (let i = 0; i < inv.items.length; i++) {
    const item = inv.items[i];
    const removed = isPurFamily && _invEditRemoved.includes(i);
    if (removed) {
      // Full-line removal: decrement stock by the whole line qty, then drop the
      // line from the invoice (totals & balance follow via the diff below).
      if (!isProvisional) {
        const rprod = DB.getProduct(item.productId);
        if (rprod) DB.updateProduct(item.productId, { quantity: (rprod.quantity || 0) - item.qty });
      }
      totalChanged = true;
      changes.push({ name: item.name, oldQty: item.qty, newQty: 0, diff: -item.qty });
      continue;
    }
    const input = document.getElementById('editQty_' + i);
    if (!input) { updatedItems.push(item); newTotalAmount += item.price * item.qty; continue; }
    let newQty = parseInt(input.value);
    if (isNaN(newQty) || newQty < 0) newQty = item.qty;
    const diff = newQty - item.qty;

    if (diff !== 0 && !isProvisional) {
      const prod = DB.getProduct(item.productId);
      if (!prod) { updatedItems.push(item); newTotalAmount += item.price * item.qty; continue; }

      if (inv.type === 'supplier' || inv.type === 'purchase') {
        if (diff > 0) {
          DB.updateProduct(item.productId, { quantity: (prod.quantity || 0) + diff });
        } else {
          const newQty = (prod.quantity || 0) - Math.abs(diff);
          if (newQty < 0) {
            alert(t('invoices.cannotBelowZero').replace('...', item.name));
            return;
          }
          DB.updateProduct(item.productId, { quantity: newQty });
        }
      } else {
        if (diff > 0) {
          if (prod.quantity < diff) {
            alert(t('invoices.insufficientStock').replace('...', item.name));
            return;
          }
          DB.updateProduct(item.productId, { quantity: prod.quantity - diff });
        } else {
          DB.updateProduct(item.productId, { quantity: prod.quantity + Math.abs(diff) });
          DB.addReturn({
            invoiceId: _invDetailId,
            productId: item.productId,
            productName: item.name,
            qty: Math.abs(diff),
            reason: 'تعديل فاتورة (نقص كمية)',
          });
        }
      }
    }

    let price = item.price;
    let discount = 0;
    if (salesPriceEdit) {
      const priceInput = document.getElementById('editPrice_' + i);
      if (priceInput) {
        const p = parseFloat(priceInput.value);
        if (isFinite(p) && p >= 0) price = p;
      }
      const discInput = document.getElementById('editDisc_' + i);
      if (discInput) {
        const d = parseFloat(discInput.value);
        if (isFinite(d) && d > 0) discount = d;
      }
    }

    const newTotal = (price * newQty) - discount;
    updatedItems.push(salesPriceEdit
      ? { ...item, qty: newQty, price, total: newTotal, lineDiscount: discount, discount }
      : { ...item, qty: newQty, total: newTotal });
    newTotalAmount += newTotal;
    if (diff !== 0) { changes.push({ name: item.name, oldQty: item.qty, newQty, diff }); totalChanged = true; }
    if (salesPriceEdit && (price !== item.price || discount !== 0)) totalChanged = true;
  }

  // Process new items added during edit
  for (const newItem of _invEditNewItems) {
    const qtyInput = document.getElementById('editNewQty_' + newItem._idx);
    const qty = qtyInput ? (parseInt(qtyInput.value) || 1) : newItem.qty;

    // New product staged by the "add from scratch" quick-entry: created NOW
    // (save time only) so abandoning the edit leaves no orphan product. Stock
    // comes with the creation/merge itself — no separate updateProduct below.
    if (newItem._isNew && isPurFamily) {
      const payload = newItem.payload || {};
      if (!payload.name || !String(payload.name).trim()) continue;
      const res = DB.addOrMergeProduct(Object.assign({}, payload, {
        barcode: (payload.barcode || '').trim() || (DB.generateBarcode ? DB.generateBarcode() : ('P' + Date.now())),
        quantity: isProvisional ? 0 : qty,
        supplierId: inv.supplierId || null
      }));
      if (!res || !res.ok) {
        alert(t('invoices.addFromScratchConflict') + ': ' + (res && res.existing ? res.existing.name : ''));
        return;
      }
      const nprod = res.product;
      newItem.productId = nprod.id; newItem.barcode = nprod.barcode; newItem.name = nprod.name;
      const buyPrice = parseFloat(payload.buyPrice) || 0;
      const total = buyPrice * qty;
      updatedItems.push({
        productId: nprod.id, barcode: nprod.barcode, name: nprod.name, qty,
        price: buyPrice, total, originalPrice: buyPrice, lineDiscount: 0, discount: 0
      });
      newTotalAmount += total;
      changes.push({ name: nprod.name, oldQty: 0, newQty: qty, diff: qty });
      totalChanged = true;
      continue;
    }

    const prod = DB.getProduct(newItem.productId);
    if (!prod) continue;

    if (!isProvisional) {
      if (inv.type === 'supplier' || inv.type === 'purchase') {
        DB.updateProduct(newItem.productId, { quantity: (prod.quantity || 0) + qty });
      } else {
        if (prod.quantity < qty) {
          alert(t('invoices.insufficientStock').replace('...', newItem.name));
          return;
        }
        DB.updateProduct(newItem.productId, { quantity: prod.quantity - qty });
      }
    }

    const fallbackPrice = (inv.type === 'supplier' || inv.type === 'purchase') ? (prod.buyPrice || 0) : (prod.sellPrice || 0);
    let price = newItem.price || fallbackPrice;
    let discount = 0;
    if (salesPriceEdit) {
      const priceInput = document.getElementById('editNewPrice_' + newItem._idx);
      if (priceInput) {
        const p = parseFloat(priceInput.value);
        if (isFinite(p) && p >= 0) price = p;
      }
      const discInput = document.getElementById('editNewDisc_' + newItem._idx);
      if (discInput) {
        const d = parseFloat(discInput.value);
        if (isFinite(d) && d > 0) discount = d;
      }
    }
    const total = (price * qty) - discount;
    updatedItems.push({
      productId: newItem.productId,
      barcode: newItem.barcode,
      name: newItem.name,
      qty,
      price,
      total,
      originalPrice: newItem.originalPrice || fallbackPrice,
      lineDiscount: discount,
      discount,
    });
    newTotalAmount += total;
    changes.push({ name: newItem.name, oldQty: 0, newQty: qty, diff: qty });
    totalChanged = true;
  }

  _invEditNewItems = [];
  _invEditRemoved = [];

  if (!totalChanged) {
    alert(t('invoices.noChangesMade'));
    return;
  }

  // Update invoice
  const oldTotal = inv.totalAmount;
  inv.totalAmount = newTotalAmount;
  const isSaleEdit = inv.type !== 'supplier' && inv.type !== 'purchase';
  const paidBefore = DB.getInvoicePaidAmount(_invDetailId);
  if (isSaleEdit) DB.reduceInvoicePayments(_invDetailId, newTotalAmount);
  const actualPaid = DB.getInvoicePaidAmount(_invDetailId);
  if (actualPaid > newTotalAmount) inv.paidAmount = newTotalAmount;
  else inv.paidAmount = actualPaid;

  const updateData = { items: updatedItems, totalAmount: newTotalAmount, paidAmount: inv.paidAmount };
  if (inv.type !== 'supplier' && inv.type !== 'purchase') {
    const newProfit = updatedItems.reduce((s, item) => {
      const prod = DB.getProduct(item.productId);
      const buyPrice = prod ? (prod.buyPrice || 0) : 0;
      return s + (((item.price - buyPrice) * item.qty) - (item.discount || 0));
    }, 0);
    updateData.profit = newProfit;
  }
  if (inv.timbreFiscal !== undefined) {
    const tRate = parseFloat(localStorage.getItem('zmt_timbre_rate') || '1');
    let newTimbre = newTotalAmount * (tRate / 100);
    if (newTimbre < 5) newTimbre = 5;
    if (newTimbre > 10000) newTimbre = 10000;
    updateData.timbreFiscal = newTimbre;
  }
  DB.updateInvoice(_invDetailId, updateData);

  // Update customer/supplier balance if total changed
  if (oldTotal !== newTotalAmount) {
    const diff = newTotalAmount - oldTotal;
    const balanceChange = (isSaleEdit && newTotalAmount < paidBefore) ? (paidBefore - oldTotal) : diff;
    if (inv.customerId) {
      const customers = DB.getCustomers();
      const cIdx = customers.findIndex(c => c.id === inv.customerId);
      if (cIdx !== -1) {
        customers[cIdx].balance = (parseFloat(customers[cIdx].balance) || 0) + balanceChange;
        DB.saveCustomers(customers);
      }
    }
    if (inv.supplierId) {
      const suppliers = DB.getSuppliers();
      const sIdx = suppliers.findIndex(s => s.id === inv.supplierId);
      if (sIdx !== -1) {
        // بيع لمورد (sup_sale): الإنشاء طرح المبلغ المستحق من رصيد المورد،
        // فالتعديل هنا يعكس نفس الإتجاه (النقص عندما يرتفع الإجمالي والعكس).
        const supAdjustment = (inv.type === 'sup_sale') ? -balanceChange : diff;
        suppliers[sIdx].balance = (parseFloat(suppliers[sIdx].balance) || 0) + supAdjustment;
        DB.saveSuppliers(suppliers);
      }
    }
  }

  document.getElementById('invDetailFooter').style.display = 'flex';
  showInvDetail(_invDetailId);
  filterInvoices();
  alert(t('invoices.invoiceEdited'));
}

// ===== TRANSFER A PURCHASE / SUPPLIER INVOICE TO A SUPPLIER =====
var _invTransferSupplierId = null;
var _invTransferCurrentId = null;
var _invTransferMatches = [];
var _invTransferActive = -1;
var _invTransferTotal = 0;

function _invMoney(v) {
  const n = parseFloat(v) || 0;
  return (n < 0 ? '-' : '') + 'DA' + fmtMoney(Math.abs(n));
}

// Balance chip: a positive supplier balance means we owe him.
function _invSupBalChip(bal, delta) {
  const b = parseFloat(bal) || 0;
  const d = parseFloat(delta) || 0;
  const after = b + d;
  const cls = b > 0 ? '#dc3545' : b < 0 ? '#198754' : 'var(--silver-500)';
  const cap = b > 0 ? t('invoices.transferOweHim') : b < 0 ? t('invoices.transferHeOwes') : t('invoices.transferBalance');
  const deltaTxt = d ? `<div style="font-size:10px;color:${d > 0 ? '#dc3545' : '#198754'}">${d > 0 ? '+' : ''}${_invMoney(d)} → ${_invMoney(after)}</div>` : '';
  return `<div style="text-align:left;white-space:nowrap">
    <div style="font-size:10px;color:var(--silver-500)">${cap}</div>
    <strong dir="ltr" style="font-size:12px;color:${cls}">${_invMoney(b)}</strong>
    ${deltaTxt}
  </div>`;
}

function ensureInvTransferModal() {
  if (document.getElementById('invTransferModal')) return;
  const div = document.createElement('div');
  div.id = 'invTransferModal';
  div.className = 'modal-overlay';
  div.style.display = 'none';
  div.setAttribute('onclick', 'if(event.target===this)closeInvTransfer()');
  div.innerHTML = `
    <div class="modal" style="max-width:560px">
      <div class="modal-header">
        <h3><i class="fas fa-exchange-alt"></i> ${t('invoices.transferTitle')}</h3>
        <button class="modal-close" onclick="closeInvTransfer()">&times;</button>
      </div>
      <div class="modal-body" style="padding:16px 18px">
        <div id="invTransferSummary" style="margin-bottom:10px;padding:10px 12px;background:var(--silver-100,#f5f5f5);border:1px solid var(--silver-300,#ddd);border-radius:8px;font-size:12px;color:var(--silver-700);display:flex;flex-wrap:wrap;gap:14px"></div>
        <p style="font-size:12px;color:var(--silver-500);margin-bottom:10px">${t('invoices.transferHint')}</p>
        <div id="invTransferCurrent" style="display:none;margin-bottom:10px;padding:8px 10px;background:#fff8e1;border:1px solid #ffe082;border-radius:8px;font-size:12px;color:var(--silver-700)"></div>
        <div class="sales-cust-search-row" style="margin-bottom:8px">
          <div class="sales-cust-search-wrap">
            <i class="fas fa-search" style="color:var(--silver-500);font-size:12px"></i>
            <input type="text" id="invTransferSearch" placeholder="${t('invoices.transferSearchPlaceholder')}" dir="rtl" autocomplete="off" oninput="searchInvTransfer(this.value)" onkeydown="invTransferKey(event)">
          </div>
        </div>
        <div id="invTransferResults" class="search-results" style="max-height:38vh;overflow-y:auto"></div>
        <div id="invTransferSelected" style="display:none;margin:12px 0 0;padding:10px;background:#f0f7ff;border:1px solid #cce5ff;border-radius:8px;align-items:flex-start;gap:10px">
          <i class="fas fa-truck" style="color:var(--bmw-blue-1);margin-top:2px"></i>
          <div style="min-width:0">
            <div style="font-size:12px;color:var(--silver-500)">${t('invoices.transferSelected')}</div>
            <strong id="invTransferSelName"></strong>
            <div id="invTransferPreview" style="font-size:11px;color:var(--silver-600);margin-top:4px"></div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" onclick="closeInvTransfer()">${t('common.cancel')}</button>
        <button class="btn btn-primary" id="invTransferConfirmBtn" onclick="confirmInvTransfer()" disabled style="opacity:0.5">
          <i class="fas fa-check"></i> ${t('invoices.transferConfirm')}
        </button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

function openInvTransfer() {
  if (!_invDetailId) return;
  const inv = DB.getInvoice(_invDetailId);
  if (!inv || (inv.type !== 'supplier' && inv.type !== 'purchase')) return;
  ensureInvTransferModal();
  const m = document.getElementById('invTransferModal');
  _invTransferSupplierId = null;
  _invTransferCurrentId = inv.supplierId || null;
  _invTransferMatches = [];
  _invTransferActive = -1;
  _invTransferTotal = parseFloat(inv.totalAmount) || 0;

  const search = document.getElementById('invTransferSearch');
  if (search) search.value = '';
  const results = document.getElementById('invTransferResults');
  if (results) results.innerHTML = '';
  const sel = document.getElementById('invTransferSelected');
  if (sel) sel.style.display = 'none';
  const btn = document.getElementById('invTransferConfirmBtn');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }

  const summary = document.getElementById('invTransferSummary');
  if (summary) {
    const itemCount = (inv.items || []).reduce((s, it) => s + (it.qty || 0), 0) || (inv.items || []).length;
    summary.innerHTML = `
      <span><i class="fas fa-hashtag"></i> <strong>${escHtml(inv.invoiceNumber || '—')}</strong></span>
      <span><i class="fas fa-boxes"></i> ${itemCount} ${t('invoices.transferItems')}</span>
      <span><i class="fas fa-coins"></i> <strong dir="ltr">${_invMoney(_invTransferTotal)}</strong></span>`;
  }

  const cur = document.getElementById('invTransferCurrent');
  if (cur) {
    if (inv.supplierId) {
      const cs = DB.getSuppliers().find(s => s.id === inv.supplierId);
      cur.innerHTML = `<i class="fas fa-info-circle"></i> ${t('invoices.transferCurrent')}: <strong>${escHtml(cs ? cs.name : '—')}</strong>`;
    } else {
      cur.innerHTML = `<i class="fas fa-info-circle"></i> ${t('invoices.transferNoSupplier')}`;
    }
    cur.style.display = '';
  }
  m.style.display = 'flex';
  searchInvTransfer('');
  setTimeout(() => { const el = document.getElementById('invTransferSearch'); if (el) el.focus(); }, 150);
}

function closeInvTransfer() {
  const m = document.getElementById('invTransferModal');
  if (m) m.style.display = 'none';
}

function searchInvTransfer(q) {
  const results = document.getElementById('invTransferResults');
  if (!results) return;
  q = (typeof normSearch === 'function' ? normSearch(q || '') : (q || ''));
  const suppliers = DB.getSuppliers().slice();
  const needle = q.toLowerCase();
  const matches = needle
    ? suppliers.filter(s =>
        (s.name && s.name.toLowerCase().includes(needle)) ||
        (s.phone && String(s.phone).includes(needle))
      )
    : suppliers.slice();
  matches.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar'));
  _invTransferMatches = matches.slice(0, 60);
  _invTransferActive = _invTransferMatches.length ? 0 : -1;
  if (matches.length === 0) {
    results.innerHTML = `<div class="search-result-item disabled">${t('invoices.transferNoResults')}</div>`;
    return;
  }
  results.innerHTML = _invTransferMatches.map((s, i) => {
    const isCurrent = s.id === _invTransferCurrentId;
    const bal = parseFloat(s.balance) || 0;
    const delta = isCurrent ? 0 : _invTransferTotal;
    return `<div class="search-result-item inv-xfer-row${i === _invTransferActive ? ' active' : ''}" data-idx="${i}" onclick="selectInvTransfer('${s.id}')">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%">
        <div style="min-width:0">
          <strong>${escHtml(s.name)}${isCurrent ? ` <span class="text-muted" style="font-size:10px">(${t('invoices.transferCurrentTag')})</span>` : ''}</strong>
          <div class="text-muted" style="font-size:11px">${s.phone ? escHtml(s.phone) : ''}${s.address ? ' · ' + escHtml(s.address) : ''}</div>
        </div>
        ${_invSupBalChip(bal, delta)}
      </div>
    </div>`;
  }).join('');
}

function _invTransferHighlight(idx) {
  const rows = document.querySelectorAll('#invTransferResults .inv-xfer-row');
  if (!rows.length) return;
  if (idx < 0) idx = rows.length - 1;
  if (idx >= rows.length) idx = 0;
  _invTransferActive = idx;
  rows.forEach((r, i) => r.classList.toggle('active', i === idx));
  const el = rows[idx];
  if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
}

function invTransferKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); closeInvTransfer(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); _invTransferHighlight(_invTransferActive + 1); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); _invTransferHighlight(_invTransferActive - 1); return; }
  if (e.key === 'Enter') { e.preventDefault(); pickFirstInvTransfer(); return; }
}

function pickFirstInvTransfer() {
  const rows = document.querySelectorAll('#invTransferResults .inv-xfer-row');
  if (!rows.length) return;
  const idx = (_invTransferActive >= 0 && _invTransferActive < rows.length) ? _invTransferActive : 0;
  const m = (rows[idx].getAttribute('onclick') || '').match(/'([^']+)'/);
  if (m) selectInvTransfer(m[1]);
}

function selectInvTransfer(id) {
  const s = DB.getSuppliers().find(x => x.id === id);
  if (!s) return;
  _invTransferSupplierId = s.id;
  const search = document.getElementById('invTransferSearch');
  if (search) search.value = s.name;
  const results = document.getElementById('invTransferResults');
  if (results) results.innerHTML = '';
  const nameEl = document.getElementById('invTransferSelName');
  if (nameEl) nameEl.textContent = s.name;
  const prev = document.getElementById('invTransferPreview');
  if (prev) {
    const oldName = _invTransferCurrentId
      ? ((DB.getSuppliers().find(x => x.id === _invTransferCurrentId) || {}).name || '—')
      : t('invoices.transferNoSupplier');
    if (s.id === _invTransferCurrentId) {
      prev.innerHTML = `<i class="fas fa-info-circle"></i> ${t('invoices.transferSame')}`;
    } else {
      const bal = parseFloat(s.balance) || 0;
      prev.innerHTML = `${escHtml(oldName)} <i class="fas fa-arrow-left" style="font-size:10px"></i> <strong>${escHtml(s.name)}</strong> · ${t('invoices.transferAmount')} <strong dir="ltr">${_invMoney(_invTransferTotal)}</strong> · ${t('invoices.transferAfterBal')} <strong dir="ltr">${_invMoney(bal + _invTransferTotal)}</strong>`;
    }
  }
  const sel = document.getElementById('invTransferSelected');
  if (sel) sel.style.display = 'flex';
  const btn = document.getElementById('invTransferConfirmBtn');
  if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
}

function confirmInvTransfer() {
  if (!_invDetailId || !_invTransferSupplierId) return;
  const inv = DB.getInvoice(_invDetailId);
  if (!inv || (inv.type !== 'supplier' && inv.type !== 'purchase')) return;
  if (inv.supplierId === _invTransferSupplierId) { alert(t('invoices.transferSame')); return; }
  const target = DB.getSuppliers().find(s => s.id === _invTransferSupplierId);
  if (!target) return;

  const oldSupplier = inv.supplierId ? DB.getSuppliers().find(s => s.id === inv.supplierId) : null;
  const oldName = oldSupplier ? oldSupplier.name : t('invoices.transferNoSupplier');
  const total = parseFloat(inv.totalAmount) || 0;
  const msg = t('invoices.transferConfirmMsg')
    .replace('{from}', oldName)
    .replace('{to}', target.name)
    .replace('{amount}', _invMoney(total));
  if (!confirm(msg)) return;

  const suppliers = DB.getSuppliers();
  if (inv.supplierId) {
    const oldIdx = suppliers.findIndex(s => s.id === inv.supplierId);
    if (oldIdx !== -1) suppliers[oldIdx].balance = (parseFloat(suppliers[oldIdx].balance) || 0) - total;
  }
  const tIdx = suppliers.findIndex(s => s.id === target.id);
  if (tIdx !== -1) suppliers[tIdx].balance = (parseFloat(suppliers[tIdx].balance) || 0) + total;
  DB.saveSuppliers(suppliers);
  DB.updateInvoice(_invDetailId, { supplierId: target.id, type: 'supplier' });
  if (typeof DB.logAudit === 'function') {
    DB.logAudit({ action: 'update', entity: 'invoice', entityId: _invDetailId, detail: 'تحويل مورد: ' + oldName + ' → ' + target.name });
  }

  closeInvTransfer();
  const footer = document.getElementById('invDetailFooter');
  if (footer) footer.style.display = 'flex';
  showInvDetail(_invDetailId);
  if (typeof filterInvoices === 'function') filterInvoices();
  alert(t('invoices.transferDone').replace('{name}', target.name));
}

// Quick "transfer" entry point rendered directly in the invoice-detail footer so
// a purchase/supplier invoice can be reassigned without opening the edit view.
function _injectInvTransferFooterButton(inv) {
  const footer = document.getElementById('invDetailFooter');
  if (!footer) return;
  const old = footer.querySelector('#invDetailTransferBtn');
  if (old) old.remove();
  if (!inv || (inv.type !== 'supplier' && inv.type !== 'purchase')) return;
  const btn = document.createElement('button');
  btn.id = 'invDetailTransferBtn';
  btn.className = 'btn';
  btn.style.cssText = 'display:flex;align-items:center;gap:5px;background:#f0f7ff;border:1px solid #cce5ff;color:var(--bmw-blue-1)';
  btn.innerHTML = `<i class="fas fa-exchange-alt"></i> ${t('invoices.transferBtn')}`;
  btn.addEventListener('click', () => openInvTransfer());
  const del = footer.querySelector('.btn-danger');
  if (del) footer.insertBefore(btn, del); else footer.appendChild(btn);
}

function deleteInvoiceFromDetail() {
  if (!_invDetailId) return;
  if (!confirm(t('invoices.deleteConfirm'))) return;

  const inv = DB.getInvoice(_invDetailId);
  if (!inv) return;
  if (inv.type === 'transfer_receive') { alert(t('invoices.cannotDeleteReception')); return; }

  // Payment vouchers move balances without touching stock; deleting one reverses
  // its effect: a customer voucher restores what the collection removed (+), a
  // supplier voucher (debt note) undoes what it added (–).
  if (inv.type === 'payment') {
    if (inv.customerId) {
      const customers = DB.getCustomers();
      const cIdx = customers.findIndex(c => c.id === inv.customerId);
      if (cIdx !== -1) {
        customers[cIdx].balance = (parseFloat(customers[cIdx].balance) || 0) + (inv.totalAmount || 0);
        DB.saveCustomers(customers);
      }
    }
    if (inv.supplierId) {
      const suppliers = DB.getSuppliers();
      const sIdx = suppliers.findIndex(s => s.id === inv.supplierId);
      if (sIdx !== -1) {
        suppliers[sIdx].balance = (parseFloat(suppliers[sIdx].balance) || 0) - (inv.totalAmount || 0);
        DB.saveSuppliers(suppliers);
      }
    }
  }

  // Prevent deleting supplier/purchase invoices if any product has been sold
  if (inv.type === 'supplier' || inv.type === 'purchase') {
    const allInvoices = DB.getInvoices();
    for (const item of (inv.items || [])) {
      const sold = allInvoices.some(other =>
        other.id !== _invDetailId &&
        (other.type === 'customer' || other.type === 'waybill' || other.type === 'dispatch') &&
        other.items &&
        other.items.some(oi => oi.productId === item.productId)
      );
      if (sold) {
        alert(t('invoices.cannotDeleteSold').replace('...', item.name));
        return;
      }
    }
  }

  // Rollback inventory (skip for provisional & dispatch)
  if (inv.type === 'transfer') {
    // Transfer: reverse inventory in both sender and receiver using raw data
    const raw = DB._getRawData();
    const allProducts = raw.products || [];

    // Return products to sender (add back)
    (inv.items || []).forEach(item => {
      const idx = allProducts.findIndex(p => p.name === item.name && p.storeId === inv.fromCode);
      if (idx !== -1) {
        allProducts[idx].quantity += item.qty;
        allProducts[idx].updatedAt = Date.now();
      } else {
        allProducts.push({
          id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
          name: item.name, barcode: item.barcode || DB.generateBarcode(),
          brandId: '', buyPrice: item.price, sellPrice: item.price,
          quantity: item.qty, storeId: inv.fromCode,
          createdAt: Date.now(), updatedAt: Date.now(),
        });
      }
    });

    // Remove products from receiver (subtract)
    (inv.items || []).forEach(item => {
      const idx = allProducts.findIndex(p => p.name === item.name && p.storeId === inv.toCode);
      if (idx !== -1) {
        allProducts[idx].quantity -= item.qty;
        allProducts[idx].updatedAt = Date.now();
        if (allProducts[idx].quantity <= 0) allProducts.splice(idx, 1);
      }
    });

    // Also delete the corresponding reception invoice in receiver's data
    const receiverInvIdx = raw.invoices.findIndex(i => i.storeId === inv.toCode && i.type === 'transfer_receive' && i.date === inv.date);
    if (receiverInvIdx !== -1) raw.invoices.splice(receiverInvIdx, 1);

    raw.products = allProducts;
    DB._saveRawData(raw);
  } else if (!inv.isProvisional && inv.type !== 'dispatch') {
    (inv.items || []).forEach(item => {
      const prod = DB.getProduct(item.productId);
      if (prod) {
        if (inv.type === 'customer' || inv.type === 'waybill' || inv.type === 'sup_sale') {
          DB.updateProduct(item.productId, { quantity: prod.quantity + item.qty });
        } else {
          const newQty = prod.quantity - item.qty;
          if (newQty <= 0) DB.deleteProduct(item.productId);
          else DB.updateProduct(item.productId, { quantity: newQty });
        }
      }
    });
  }

  const payments = DB.getInvoicePayments(_invDetailId);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  DB.deletePaymentsByInvoice(_invDetailId);
  // Supplier sales book a net-expense row (isSupSaleExpense) that is deliberately
  // not linked to the invoiceId; clean it up along with the invoice.
  try {
    DB.getPayments().filter(p => p.isSupSaleExpense === true && p.refInvoiceId === _invDetailId)
      .forEach(p => DB.deletePayment(p.id));
  } catch (e) {}
  DB.deleteReturnsByInvoice(_invDetailId);
  DB.deleteDiscountsByInvoice(_invDetailId);

  if (!inv.isProvisional) {
    if (inv.type === 'dispatch') {
      // Dispatch: reverse the original balance effect
      if (inv.supplierId) {
        const suppliers = DB.getSuppliers();
        const sIdx = suppliers.findIndex(s => s.id === inv.supplierId);
        if (sIdx !== -1) {
          // At creation we subtracted totalAmount → add it back
          suppliers[sIdx].balance = (parseFloat(suppliers[sIdx].balance) || 0) + (inv.totalAmount || 0);
          DB.saveSuppliers(suppliers);
        }
      }
      if (inv.customerId) {
        const customers = DB.getCustomers();
        const cIdx = customers.findIndex(c => c.id === inv.customerId);
        if (cIdx !== -1) {
          // At creation we added (totalAmount - payAmount) → remove unpaid portion
          customers[cIdx].balance = (parseFloat(customers[cIdx].balance) || 0) - ((inv.totalAmount || 0) - totalPaid);
          DB.saveCustomers(customers);
        }
      }
    } else if (inv.type !== 'payment') {
      // Regular invoices
      if (inv.supplierId) {
        const suppliers = DB.getSuppliers();
        const sIdx = suppliers.findIndex(s => s.id === inv.supplierId);
if (sIdx !== -1) {
      if (inv.type === 'sup_sale') {
        suppliers[sIdx].balance = (parseFloat(suppliers[sIdx].balance) || 0) + ((inv.totalAmount || 0) - totalPaid);
      } else {
        suppliers[sIdx].balance = (parseFloat(suppliers[sIdx].balance) || 0) - ((inv.totalAmount || 0) - totalPaid);
      }
      DB.saveSuppliers(suppliers);
    }
  }
  if (inv.customerId) {
        const customers = DB.getCustomers();
        const cIdx = customers.findIndex(c => c.id === inv.customerId);
        if (cIdx !== -1) {
          customers[cIdx].balance = (parseFloat(customers[cIdx].balance) || 0) - ((inv.totalAmount || 0) - totalPaid);
          DB.saveCustomers(customers);
        }
      }
    }
  }

  // Also delete receiver's reception invoice + its payments (for transfer invoices)
  if (inv.type === 'transfer' && inv.toCode) {
    const raw2 = DB._getRawData();
    const receiverInvIdx2 = raw2.invoices.findIndex(i =>
      i.storeId === inv.toCode && i.type === 'transfer_receive' && i.date === inv.date
    );
    if (receiverInvIdx2 !== -1) {
      const receiverInvId = raw2.invoices[receiverInvIdx2].id;
      raw2.invoices.splice(receiverInvIdx2, 1);
      DB._saveRawData(raw2);
      DB.deletePaymentsByInvoice(receiverInvId);
    } else {
      DB._saveRawData(raw2);
    }
  }

  DB.deleteInvoice(_invDetailId);
  closeInvDetail();
  refreshInvoiceList();
  filterInvoices();
  alert(t('invoices.invoiceDeleted'));
}

// ===== TRANSFER INVOICE EDIT =====

function showTransferEditSection(inv) {
  const body = document.getElementById('invDetailBody');
  const brands = [...BRANDS.global, ...BRANDS.chinese];

  let editHtml = `<div style="padding:20px;direction:rtl;text-align:right">
    <div style="font-size:14px;font-weight:700;color:var(--silver-800);margin-bottom:12px">
      <i class="fas fa-exchange-alt"></i> ${t('invoices.transferEditTitle')} — ${inv.invoiceNumber || ''}
    </div>
    <p style="font-size:12px;color:var(--silver-500);margin-bottom:14px">
      ${t('invoices.transferEditHelp')}
    </p>
    <div style="padding:10px;background:#fff3e0;border:1px solid #ffcc80;border-radius:8px;margin-bottom:14px;font-size:12px;color:#e65100">
      <i class="fas fa-exclamation-triangle" style="margin-left:4px"></i>
      من: ${escHtml(inv.toName || inv.toCode)} | ${t('invoices.currentTotal')} DA${fmtMoney((inv.totalAmount || 0))}
    </div>
    <table class="data-table">
      <thead><tr>
        <th>${t('invoices.editColProduct')}</th><th>${t('invoices.editColCurrentQty')}</th><th>${t('invoices.editColNewQty')}</th><th>${t('invoices.editColSellPrice')}</th>
      </tr></thead>
      <tbody id="editItemsBody">
        ${inv.items.map((item, i) => {
          const brand = brands.find(b => b.name === item.name || b.id === item.brandId);
          return `<tr>
            <td>${escHtml(item.name)}</td>
            <td style="text-align:center"><strong>${item.qty}</strong></td>
            <td style="text-align:center">
              <input type="text" class="no-spinner num-input" inputmode="numeric" id="editQty_${i}" value="${item.qty}" min="0" style="width:70px;text-align:center;padding:4px 8px;border:1px solid var(--silver-300);border-radius:4px;font-size:14px" onchange="updateTransferEditTotal()">
            </td>
            <td style="text-align:center">DA${fmtMoney(item.price)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div id="transferEditSummary" style="margin-top:14px;padding:12px;background:#f0f7ff;border:1px solid #cce5ff;border-radius:8px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span>${t('invoices.newTotal')}</span>
        <strong id="transferEditNewTotal">DA${fmtMoney((inv.totalAmount || 0))}</strong>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span>${t('invoices.diff')}</span>
        <strong id="transferEditDiff" style="color:#666">0 DA</strong>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button class="btn btn-primary" onclick="saveTransferEdit()"><i class="fas fa-save"></i> ${t('invoices.saveEdits')}</button>
      <button class="btn" onclick="showInvDetail('${_invDetailId}')">${t('common.cancel')}</button>
    </div>
  </div>`;

  body.innerHTML = editHtml;
  document.getElementById('invDetailFooter').style.display = 'none';
}

function updateTransferEditTotal() {
  const inv = DB.getInvoice(_invDetailId);
  if (!inv) return;
  let newTotal = 0;
  inv.items.forEach((item, i) => {
    const input = document.getElementById('editQty_' + i);
    const qty = input ? (parseInt(input.value) || 0) : item.qty;
    newTotal += qty * item.price;
  });
  const diff = newTotal - (inv.totalAmount || 0);
  document.getElementById('transferEditNewTotal').textContent = 'DA' + fmtMoney(newTotal);
  const diffEl = document.getElementById('transferEditDiff');
  if (diff > 0) {
    diffEl.textContent = '+' + fmtMoney(diff) + ' DA';
    diffEl.style.color = '#c62828';
  } else if (diff < 0) {
    diffEl.textContent = fmtMoney(diff) + ' DA';
    diffEl.style.color = '#388e3c';
  } else {
    diffEl.textContent = '0 DA';
    diffEl.style.color = '#666';
  }
}

function saveTransferEdit() {
  if (!_invDetailId) return;
  const inv = DB.getInvoice(_invDetailId);
  if (!inv || inv.type !== 'transfer') return;

  const raw = DB._getRawData();
  const allProducts = raw.products || [];
  let totalChanged = false;
  let newTotalAmount = 0;
  const updatedItems = [];

  for (let i = 0; i < inv.items.length; i++) {
    const item = inv.items[i];
    const input = document.getElementById('editQty_' + i);
    const newQty = input ? Math.max(0, parseInt(input.value) || 0) : item.qty;
    const diff = newQty - item.qty;

    if (diff !== 0) {
      totalChanged = true;
      if (diff > 0) {
        // Increase: deduct MORE from sender, add MORE to receiver
        const senderIdx = allProducts.findIndex(p => p.name === item.name && p.storeId === inv.fromCode);
        if (senderIdx !== -1) {
          if (allProducts[senderIdx].quantity < diff) {
            alert(t('invoices.insufficientStock').replace('...', item.name));
            return;
          }
          allProducts[senderIdx].quantity -= diff;
          allProducts[senderIdx].updatedAt = Date.now();
          if (allProducts[senderIdx].quantity <= 0) allProducts.splice(senderIdx, 1);
        }
        const recvIdx = allProducts.findIndex(p => p.name === item.name && p.storeId === inv.toCode);
        if (recvIdx !== -1) {
          allProducts[recvIdx].quantity += diff;
          allProducts[recvIdx].updatedAt = Date.now();
        } else {
          allProducts.push({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            name: item.name, barcode: DB.generateBarcode(),
            brandId: '', buyPrice: item.price, sellPrice: item.price,
            quantity: diff, storeId: inv.toCode,
            createdAt: Date.now(), updatedAt: Date.now(),
          });
        }
      } else {
        // Decrease: add back to sender, remove from receiver
        const absDiff = Math.abs(diff);
        const senderIdx = allProducts.findIndex(p => p.name === item.name && p.storeId === inv.fromCode);
        if (senderIdx !== -1) {
          allProducts[senderIdx].quantity += absDiff;
          allProducts[senderIdx].updatedAt = Date.now();
        } else {
          allProducts.push({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            name: item.name, barcode: item.barcode || DB.generateBarcode(),
            brandId: '', buyPrice: item.price, sellPrice: item.price,
            quantity: absDiff, storeId: inv.fromCode,
            createdAt: Date.now(), updatedAt: Date.now(),
          });
        }
        const recvIdx = allProducts.findIndex(p => p.name === item.name && p.storeId === inv.toCode);
        if (recvIdx !== -1) {
          allProducts[recvIdx].quantity -= absDiff;
          allProducts[recvIdx].updatedAt = Date.now();
          if (allProducts[recvIdx].quantity <= 0) allProducts.splice(recvIdx, 1);
        }
      }
    }

    const newTotal = newQty * item.price;
    updatedItems.push({ ...item, qty: newQty, total: newTotal });
    newTotalAmount += newTotal;
  }

  if (!totalChanged) {
    alert(t('invoices.noQtyChanged'));
    return;
  }

  // Update sender's transfer invoice
  DB.updateInvoice(_invDetailId, { items: updatedItems, totalAmount: newTotalAmount });

  // Update receiver's reception invoice
  const receiverInvIdx = raw.invoices.findIndex(i =>
    i.storeId === inv.toCode && i.type === 'transfer_receive' && i.date === inv.date
  );
  if (receiverInvIdx !== -1) {
    const oldPaid = raw.invoices[receiverInvIdx].paidAmount || 0;
    raw.invoices[receiverInvIdx].items = updatedItems;
    raw.invoices[receiverInvIdx].totalAmount = newTotalAmount;
    raw.invoices[receiverInvIdx].paidAmount = Math.min(oldPaid, newTotalAmount);
  }

  // Save products
  raw.products = allProducts;
  DB._saveRawData(raw);

  // Update transfer record
  const transfers = DB.getTransfers();
  const tIdx = transfers.findIndex(t => t.id === inv.id);
  if (tIdx !== -1) {
    transfers[tIdx].totalAmount = newTotalAmount;
    transfers[tIdx].items = updatedItems.map(it => ({
      name: it.name, qty: it.qty, price: it.price,
    }));
    DB.saveTransfers(transfers);
  }

  document.getElementById('invDetailFooter').style.display = 'flex';
  showInvDetail(_invDetailId);
  filterInvoices();
  alert(t('invoices.invoiceEdited'));
}

// ===== WAYBILL FORM (Bon de livraison) =====

var _wbCart = [];
var _wbCustomerId = null;
var _wbAllProducts = [];
var _wbFormType = 'waybill'; // 'waybill' or 'proforma'

function showWaybillForm(type) {
  _wbFormType = type || 'waybill';
  _wbCart = [];
  _wbCustomerId = null;
  _wbAllProducts = DB.getProducts();
  document.getElementById('wbCustSearch').value = '';
  document.getElementById('wbCustResults').innerHTML = '';
  document.getElementById('wbCustBadge').style.display = 'none';
  document.getElementById('wbWalkinFields').style.display = 'none';
  document.getElementById('wbProdSearch').value = '';
  document.getElementById('wbExtraDisc').value = '0';
  document.getElementById('wbTimbreCheck').checked = false;
  document.getElementById('wbPayAmount').value = '0';

  if (type === 'proforma') {
    // Proforma is always provisional, hide registration mode
    document.getElementById('wbRegSection').style.display = 'none';
    document.getElementById('wbFormIcon').className = 'fas fa-file-alt';
    document.getElementById('wbFormTitleText').textContent = t('invoices.typeProforma') + ' — Facture Proforma';
    document.getElementById('wbConfirmBtnLabel').textContent = 'تسجيل الفاتورة الشكلية';
  } else {
    document.getElementById('wbRegSection').style.display = 'flex';
    document.getElementById('wbFormIcon').className = 'fas fa-truck';
    document.getElementById('wbFormTitleText').textContent = t('invoices.typeWaybill');
    document.getElementById('wbConfirmBtnLabel').textContent = 'تسجيل الفاتورة';
    document.querySelector('input[name="wbRegMode"][value="real"]').checked = true;
  }

  renderWbProducts();
  renderWbCart();
  updateWbTotals();
  document.getElementById('waybillFormModal').style.display = 'flex';
}

function closeWaybillForm() {
  document.getElementById('waybillFormModal').style.display = 'none';
}

// ===== WAYBILL CUSTOMER =====

function searchWbCustomer(q) {
  const results = document.getElementById('wbCustResults');
  q = normSearch(q);
  const customers = DB.getCustomers();
  const matches = q
    ? customers.filter(c =>
        c.name.toLowerCase().includes(q.toLowerCase()) || (c.phone && c.phone.includes(q))
      ).slice(0, 8)
    : customers.slice(0, 8);
  results.innerHTML = matches.length === 0
    ? '<div class="search-result-item disabled">لا توجد نتائج</div>'
    : matches.map(c => `<div class="search-result-item" onclick="selectWbCustomer('${c.id}')">
        <strong>${escHtml(c.name)}</strong>
        <span class="text-muted">${c.phone || ''}</span>
      </div>`).join('');
}

function selectWbCustomer(id) {
  const c = DB.getCustomer(id);
  if (!c) return;
  _wbCustomerId = c.id;
  document.getElementById('wbCustSearch').value = c.name;
  document.getElementById('wbCustResults').innerHTML = '';
  document.getElementById('wbCustBadge').style.display = '';
  document.getElementById('wbCustNameLabel').textContent = c.name;
  document.getElementById('wbCustPhoneLabel').textContent = c.phone || '';
  document.getElementById('wbWalkinFields').style.display = 'none';
}

function setWbWalkin() {
  _wbCustomerId = null;
  document.getElementById('wbCustSearch').value = '';
  document.getElementById('wbCustResults').innerHTML = '';
  document.getElementById('wbCustBadge').style.display = 'none';
  document.getElementById('wbWalkinFields').style.display = '';
  document.getElementById('wbWalkinName').focus();
}

function clearWbCustomer() {
  _wbCustomerId = null;
  document.getElementById('wbCustBadge').style.display = 'none';
  document.getElementById('wbCustSearch').value = '';
  document.getElementById('wbCustResults').innerHTML = '';
  document.getElementById('wbWalkinFields').style.display = 'none';
}

function getWbCustomerData() {
  if (_wbCustomerId) {
    const c = DB.getCustomer(_wbCustomerId);
    return c ? { id: c.id, name: c.name, phone: c.phone, address: c.address } : null;
  }
  const name = document.getElementById('wbWalkinName').value.trim();
  if (!name) { alert('الرجاء إدخال اسم العميل'); return null; }
  return {
    id: null,
    name,
    phone: document.getElementById('wbWalkinPhone').value.trim(),
    address: document.getElementById('wbWalkinAddress').value.trim(),
  };
}

// ===== WAYBILL PRODUCTS =====

function filterWbProducts(q) {
  renderWbProducts(q);
}

function renderWbProducts(filter) {
  const grid = document.getElementById('wbProductGrid');
  let list = _wbAllProducts;
  const f = normSearch(filter || '');
  if (f) {
    list = list
      .map(p => ({ p, score: productSearchScore(p.name, p.barcode, f, p.mark, p.reference, p.countryOfOrigin) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(x => x.p);
  }
  if (list.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--silver-500)">لا توجد منتجات</div>';
    return;
  }
  grid.innerHTML = list.map(p => {
    const inCart = _wbCart.find(i => i.productId === p.id);
    return `<div class="wb-prod-card" onclick="${p.quantity > 0 ? `addToWbCart('${p.id}')` : ''}" title="${p.quantity <= 0 ? 'غير متوفر' : ''}" style="${p.quantity <= 0 ? 'opacity:0.4;cursor:not-allowed' : ''}">
      <div class="wb-prod-name">${escHtml(p.name)}</div>
      <div class="wb-prod-bar">${p.barcode}</div>
      <div class="wb-prod-footer">
        <span class="wb-prod-price">DA${fmtMoney(p.sellPrice)}</span>
        <span class="wb-prod-qty">${p.quantity}</span>
      </div>
      ${inCart ? '<div style="font-size:10px;color:var(--bmw-blue-1);font-weight:600">✓ في السلة</div>' : ''}
    </div>`;
  }).join('');
}

function addToWbCart(productId) {
  const prod = DB.getProduct(productId);
  if (!prod || prod.quantity <= 0) return;
  const existing = _wbCart.findIndex(i => i.productId === productId);
  if (existing !== -1) {
    _wbCart[existing].qty++;
    _wbCart[existing].total = _wbCart[existing].qty * _wbCart[existing].price;
  } else {
    _wbCart.push({
      productId: prod.id,
      name: prod.name,
      barcode: prod.barcode,
      qty: 1,
      price: prod.sellPrice,
      total: prod.sellPrice,
      originalPrice: prod.sellPrice,
    });
  }
  renderWbCart();
  updateWbTotals();
  renderWbProducts(document.getElementById('wbProdSearch').value);
  document.getElementById('wbProdSearch').focus();
}

function removeFromWbCart(idx) {
  _wbCart.splice(idx, 1);
  renderWbCart();
  updateWbTotals();
  renderWbProducts(document.getElementById('wbProdSearch').value);
}

function renderWbCart() {
  const items = document.getElementById('wbCartItems');
  const empty = document.getElementById('wbCartEmpty');
  const count = document.getElementById('wbCartCount');
  if (_wbCart.length === 0) {
    items.innerHTML = '';
    empty.style.display = '';
    if (count) count.textContent = '0';
    return;
  }
  empty.style.display = 'none';
  if (count) count.textContent = _wbCart.length;
  items.innerHTML = _wbCart.map((item, i) => `
    <div class="wb-cart-item">
      <div class="wb-cart-item-info">
        <div class="wb-cart-item-name">${escHtml(item.name)}</div>
        <div class="wb-cart-item-bar">${item.barcode}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <button class="sc-qty-btn" onclick="decWbCartQty(${i})" ${item.qty <= 1 ? 'disabled' : ''}>−</button>
        <input type="text" class="no-spinner num-input" inputmode="numeric" value="${item.qty}" min="1" style="width:40px;text-align:center;padding:2px 4px;border:1px solid var(--silver-300);border-radius:4px;font-size:13px;font-weight:600" onchange="updateWbCartQty(${i},this.value)">
        <button class="sc-qty-btn" onclick="incWbCartQty(${i})">+</button>
        <input type="text" class="no-spinner num-input" inputmode="decimal" value="${item.price.toFixed(2)}" min="0" step="0.01" style="width:80px;text-align:center;padding:2px 4px;border:1px solid var(--silver-300);border-radius:4px;font-size:12px;font-weight:600" onchange="updateWbCartPrice(${i},this.value)">
        <span style="font-size:11px;color:var(--silver-500)">DA</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:14px;font-weight:700;color:var(--bmw-blue-1);min-width:70px;text-align:right">DA${fmtMoney((item.qty * item.price))}</span>
        <button class="sc-item-remove" onclick="removeFromWbCart(${i})"><i class="fas fa-times"></i></button>
      </div>
    </div>
  `).join('');
}

function incWbCartQty(idx) {
  _wbCart[idx].qty++;
  _wbCart[idx].total = _wbCart[idx].qty * _wbCart[idx].price;
  renderWbCart();
  updateWbTotals();
}

function decWbCartQty(idx) {
  if (_wbCart[idx].qty > 1) {
    _wbCart[idx].qty--;
    _wbCart[idx].total = _wbCart[idx].qty * _wbCart[idx].price;
    renderWbCart();
    updateWbTotals();
  }
}

function updateWbCartQty(idx, val) {
  const qty = parseInt(val) || 1;
  _wbCart[idx].qty = Math.max(1, qty);
  _wbCart[idx].total = _wbCart[idx].qty * _wbCart[idx].price;
  renderWbCart();
  updateWbTotals();
}

function updateWbCartPrice(idx, val) {
  const price = parseFloat(val) || 0;
  _wbCart[idx].price = price;
  _wbCart[idx].total = _wbCart[idx].qty * price;
  renderWbCart();
  updateWbTotals();
}

// ===== WAYBILL TOTALS =====

function updateWbTotals() {
  const subtotal = _wbCart.reduce((s, i) => s + i.total, 0);
  const extraDisc = Math.min(parseFloat(document.getElementById('wbExtraDisc').value) || 0, subtotal);
  const afterDisc = subtotal - extraDisc;
  const timbreEnabled = document.getElementById('wbTimbreCheck').checked;
  const timbreRate = parseFloat(localStorage.getItem('zmt_timbre_rate') || '1');
  let timbreAmount = 0;
  if (timbreEnabled) {
    timbreAmount = afterDisc * (timbreRate / 100);
    if (timbreAmount < 5) timbreAmount = 5;
    if (timbreAmount > 10000) timbreAmount = 10000;
  }
  const total = afterDisc + timbreAmount;

  document.getElementById('wbSubtotal').textContent = 'DA' + fmtMoney(subtotal);
  const discRow = document.getElementById('wbDiscRow');
  const timbreRow = document.getElementById('wbTimbreRow');
  if (extraDisc > 0) {
    discRow.hidden = false;
    document.getElementById('wbDiscAmount').textContent = '-DA' + fmtMoney(extraDisc);
  } else {
    discRow.hidden = true;
  }
  if (timbreEnabled) {
    timbreRow.hidden = false;
    document.getElementById('wbTimbreAmount').textContent = 'DA' + fmtMoney(timbreAmount);
  } else {
    timbreRow.hidden = true;
  }
  document.getElementById('wbTotal').textContent = 'DA' + fmtMoney(total);
  updateWbPayRemaining();
}

function updateWbPayRemaining() {
  const totalEl = document.getElementById('wbTotal');
  const total = parseFloat(totalEl.textContent.replace('DA', '')) || 0;
  const paid = parseFloat(document.getElementById('wbPayAmount').value) || 0;
  const remaining = Math.max(0, total - paid);
  const el = document.getElementById('wbPayRemaining');
  if (paid >= total) {
    el.textContent = 'مدفوعة كلياً ✓';
    el.style.color = '#28a745';
  } else if (paid > 0) {
    el.textContent = 'الباقي: DA' + fmtMoney(remaining);
    el.style.color = '#e65100';
  } else {
    el.textContent = '';
  }
}

function setWbFullPay() {
  const totalEl = document.getElementById('wbTotal');
  const total = parseFloat(totalEl.textContent.replace('DA', '')) || 0;
  document.getElementById('wbPayAmount').value = total.toFixed(2);
  updateWbPayRemaining();
}

// ===== WAYBILL CONFIRM =====

function confirmWaybill() {
  if (_wbCart.length === 0) { alert('السلة فارغة'); return; }

  const custData = getWbCustomerData();
  if (!custData) return;

  const isProvisional = _wbFormType === 'proforma' || document.querySelector('input[name="wbRegMode"]:checked').value === 'provisional';
  const subtotal = _wbCart.reduce((s, i) => s + i.total, 0);
  const extraDisc = Math.min(parseFloat(document.getElementById('wbExtraDisc').value) || 0, subtotal);
  const afterDisc = subtotal - extraDisc;
  const timbreEnabled = document.getElementById('wbTimbreCheck').checked;
  const timbreRate = parseFloat(localStorage.getItem('zmt_timbre_rate') || '1');
  let timbreAmount = 0;
  if (timbreEnabled) {
    timbreAmount = afterDisc * (timbreRate / 100);
    if (timbreAmount < 5) timbreAmount = 5;
    if (timbreAmount > 10000) timbreAmount = 10000;
  }
  const totalAmount = afterDisc + timbreAmount;
  const paidAmount = Math.min(parseFloat(document.getElementById('wbPayAmount').value) || 0, totalAmount);

  // Create or get customer
  let customerId = _wbCustomerId;
  let walkinName, walkinPhone, walkinAddress;

  if (isProvisional) {
    // For provisional/proforma, store customer info directly (never create DB customer)
    customerId = null;
    if (_wbCustomerId) {
      const c = DB.getCustomer(_wbCustomerId);
      if (c) { walkinName = c.name; walkinPhone = c.phone; walkinAddress = c.address; }
    } else {
      walkinName = custData.name; walkinPhone = custData.phone; walkinAddress = custData.address;
    }
  } else {
    // Real waybill: create customer if walk-in
    if (!customerId && custData.name) {
      const newCust = DB.addCustomer({
        name: custData.name,
        phone: custData.phone || '',
        address: custData.address || '',
        discount: 0,
      });
      customerId = newCust.id;
    }
  }

  // Build items
  const items = _wbCart.map(item => ({
    productId: item.productId,
    barcode: item.barcode,
    name: item.name,
    qty: item.qty,
    price: item.price,
    total: item.qty * item.price,
    originalPrice: item.originalPrice || item.price,
    discount: 0,
  }));

  // Check stock & deduct inventory only if REAL
  if (!isProvisional) {
    for (const item of items) {
      const prod = DB.getProduct(item.productId);
      if (!prod) continue;
      if (prod.quantity < item.qty) {
        alert(t('invoices.insufficientStock').replace('...', item.name));
        return;
      }
    }
    items.forEach(item => {
      const prod = DB.getProduct(item.productId);
      if (prod) {
        DB.updateProduct(item.productId, { quantity: prod.quantity - item.qty });
      }
    });
  }

  // Calculate waybill profit
  const waybillProfit = items.reduce((s, item) => {
    const prod = DB.getProduct(item.productId);
    const buyPrice = prod ? (prod.buyPrice || 0) : 0;
    return s + ((item.price - buyPrice) * item.qty);
  }, 0);

  // Add invoice
  const inv = DB.addInvoice({
    customerId: isProvisional ? null : (customerId || null),
    type: _wbFormType,
    date: Date.now(),
    items,
    totalAmount,
    customerDiscount: 0,
    extraDiscount: extraDisc,
    timbreFiscal: timbreAmount,
    isProvisional,
    profit: waybillProfit,
    ...(isProvisional ? { walkinName, walkinPhone, walkinAddress } : {}),
  });

  // Payment only if REAL
  if (paidAmount > 0 && !isProvisional) {
    DB.addPayment({
      customerId: customerId || null,
      invoiceId: inv.id,
      amount: paidAmount,
      note: paidAmount >= totalAmount ? 'دفع كامل عند التسليم' : 'دفع جزئي عند التسليم',
    });
  }

  // Customer balance only if REAL and not fully paid
  if (!isProvisional && customerId) {
    const remaining = totalAmount - paidAmount;
    if (remaining > 0) {
      const customers = DB.getCustomers();
      const cIdx = customers.findIndex(c => c.id === customerId);
      if (cIdx !== -1) {
        customers[cIdx].balance = (parseFloat(customers[cIdx].balance) || 0) + remaining;
        DB.saveCustomers(customers);
      }
    }
  }

  closeWaybillForm();

  // Show invoice preview
  const typeLabel = _wbFormType === 'proforma' ? t('invoices.typeProforma') : t('invoices.typeWaybill');
  if (typeof showInvoicePreview === 'function') {
    showInvoicePreview(inv);
  } else {
    alert(`تم تسجيل ال${typeLabel} ${inv.invoiceNumber}\nالمبلغ: DA${fmtMoney(totalAmount)}${isProvisional ? '\n(تسجيل شكلي)' : ''}`);
  }

  // Refresh
  refreshInvoiceList();
  filterInvoices();
}

function startNewInvoice(type) {
  closeAddInvoiceMenu();
  if (type === 'waybill' || type === 'proforma') {
    showWaybillForm(type);
    return;
  }
  if (type === 'purchase') {
    openInvPurModal();
    return;
  }
  if (type === 'dispatch') {
    openInvDispModal();
    return;
  }
  alert(`سيتم قريباً إضافة نموذج إدخال ${type || ''}`);
}

// ===== DISPATCH INVOICE FORM (فاتورة إرسال) =====

var _dispRecipientType = 'customer'; // 'supplier' | 'customer' | 'walkin'
var _dispSupplierId = null;
var _dispCustomerId = null;

function openInvDispModal() {
  _dispSupplierId = null;
  _dispCustomerId = null;
  document.getElementById('dispSupSearch').value = '';
  document.getElementById('dispSupResults').innerHTML = '';
  document.getElementById('dispSelectedSupplier').style.display = 'none';
  document.getElementById('dispCustSearch').value = '';
  document.getElementById('dispCustResults').innerHTML = '';
  document.getElementById('dispSelectedCustomer').style.display = 'none';
  document.getElementById('dispWalkinName').value = '';
  document.getElementById('dispWalkinPhone').value = '';
  document.getElementById('dispWalkinAddress').value = '';
  document.getElementById('dispAmount').value = '0';
  document.getElementById('dispTimbreCheck').checked = false;
  document.getElementById('dispTimbreAmount').style.display = 'none';
  document.getElementById('dispPayAmount').value = '0';
  document.getElementById('dispTotal').textContent = 'DA0';
  document.getElementById('dispNote').value = '';
  // Default to customer tab
  switchDispTab('customer');
  document.getElementById('invDispModal').style.display = 'flex';
  setTimeout(() => {
    if (_dispRecipientType === 'customer') document.getElementById('dispCustSearch').focus();
    else if (_dispRecipientType === 'supplier') document.getElementById('dispSupSearch').focus();
    else document.getElementById('dispWalkinName').focus();
  }, 200);
}

function closeInvDispModal() {
  document.getElementById('invDispModal').style.display = 'none';
}

function switchDispTab(tab) {
  _dispRecipientType = tab;
  // Reset selections
  _dispSupplierId = null;
  _dispCustomerId = null;
  document.getElementById('dispSelectedSupplier').style.display = 'none';
  document.getElementById('dispSelectedCustomer').style.display = 'none';
  document.getElementById('dispSupResults').innerHTML = '';
  document.getElementById('dispCustResults').innerHTML = '';

  // Toggle sections
  document.getElementById('dispSupplierSection').style.display = tab === 'supplier' ? '' : 'none';
  document.getElementById('dispCustomerSection').style.display = tab === 'customer' ? '' : 'none';
  document.getElementById('dispWalkinSection').style.display = tab === 'walkin' ? '' : 'none';
  document.getElementById('dispPaySection').style.display = tab === 'customer' ? '' : 'none';

  // Toggle tab buttons
  ['supplier','customer','walkin'].forEach(t => {
    const btn = document.getElementById('dispTab' + t.charAt(0).toUpperCase() + t.slice(1));
    btn.className = t === tab ? 'btn btn-primary' : 'btn';
  });

  dispRecalcTotal();
}

function dispRecalcTotal() {
  const amount = parseFloat(document.getElementById('dispAmount').value) || 0;
  const timbreEnabled = document.getElementById('dispTimbreCheck').checked;
  const timbreRate = parseFloat(localStorage.getItem('zmt_timbre_rate') || '1');
  let timbreAmount = 0;
  if (timbreEnabled) {
    timbreAmount = amount * (timbreRate / 100);
    if (timbreAmount < 5) timbreAmount = 5;
    if (timbreAmount > 10000) timbreAmount = 10000;
  }
  const total = amount + timbreAmount;
  document.getElementById('dispTotal').textContent = 'DA' + fmtMoney(total);
  const timbreEl = document.getElementById('dispTimbreAmount');
  if (timbreEnabled && timbreAmount > 0) {
    timbreEl.textContent = '+ DA' + fmtMoney(timbreAmount);
    timbreEl.style.display = '';
  } else {
    timbreEl.style.display = 'none';
  }
}

// --- Supplier search ---
function searchDispSupplier(q) {
  const results = document.getElementById('dispSupResults');
  q = normSearch(q);
  const suppliers = DB.getSuppliers();
  const matches = q
    ? suppliers.filter(s =>
        s.name.toLowerCase().includes(q.toLowerCase()) || (s.phone && s.phone.includes(q))
      ).slice(0, 8)
    : suppliers.slice(0, 8);
  results.innerHTML = matches.length === 0
    ? '<div class="search-result-item disabled">لا توجد نتائج</div>'
    : matches.map(s => `<div class="search-result-item" onclick="selectDispSupplier('${s.id}')">
        <strong>${escHtml(s.name)}</strong>
        <span class="text-muted">${s.phone || ''} ${invPartyBalanceHTML('supplier', s.balance, '11px')}</span>
      </div>`).join('');
}

function selectDispSupplier(id) {
  const s = DB.getSuppliers().find(x => x.id === id);
  if (!s) return;
  _dispSupplierId = s.id;
  document.getElementById('dispSupSearch').value = s.name;
  document.getElementById('dispSupResults').innerHTML = '';
  document.getElementById('dispSupName').textContent = s.name;
  const balEl = document.getElementById('dispSupBalance');
  if (balEl) balEl.innerHTML = invPartyBalanceHTML('supplier', s.balance, '13px');
  document.getElementById('dispSelectedSupplier').style.display = '';
}

// --- Customer search ---
function searchDispCustomer(q) {
  const results = document.getElementById('dispCustResults');
  q = normSearch(q);
  const customers = DB.getCustomers();
  const matches = q
    ? customers.filter(c =>
        c.name.toLowerCase().includes(q.toLowerCase()) || (c.phone && c.phone.includes(q))
      ).slice(0, 8)
    : customers.slice(0, 8);
  results.innerHTML = matches.length === 0
    ? '<div class="search-result-item disabled">لا توجد نتائج</div>'
    : matches.map(c => `<div class="search-result-item" onclick="selectDispCustomer('${c.id}')">
        <strong>${escHtml(c.name)}</strong>
        <span class="text-muted">${c.phone || ''} ${invPartyBalanceHTML('customer', c.balance, '11px')}</span>
      </div>`).join('');
}

function selectDispCustomer(id) {
  const c = DB.getCustomers().find(x => x.id === id);
  if (!c) return;
  _dispCustomerId = c.id;
  document.getElementById('dispCustSearch').value = c.name;
  document.getElementById('dispCustResults').innerHTML = '';
  document.getElementById('dispCustName').textContent = c.name;
  const balEl = document.getElementById('dispCustBalance');
  if (balEl) balEl.innerHTML = invPartyBalanceHTML('customer', c.balance, '13px');
  document.getElementById('dispSelectedCustomer').style.display = '';
}

// --- Confirm ---
function confirmDispatchInvoice() {
  const totalAmount = parseFloat(document.getElementById('dispAmount').value) || 0;
  if (totalAmount <= 0) { alert('الرجاء إدخال مبلغ صحيح'); return; }

  // Validate recipient
  let supplierId = null, customerId = null;
  let walkinName = '', walkinPhone = '', walkinAddress = '';

  if (_dispRecipientType === 'supplier') {
    if (!_dispSupplierId) { alert('الرجاء اختيار مورد'); return; }
    supplierId = _dispSupplierId;
  } else if (_dispRecipientType === 'customer') {
    if (!_dispCustomerId) { alert('الرجاء اختيار عميل'); return; }
    customerId = _dispCustomerId;
  } else {
    walkinName = document.getElementById('dispWalkinName').value.trim();
    if (!walkinName) { alert('الرجاء إدخال اسم المرسل إليه'); return; }
    walkinPhone = document.getElementById('dispWalkinPhone').value.trim();
    walkinAddress = document.getElementById('dispWalkinAddress').value.trim();
  }

  // Calculate timbre
  const timbreEnabled = document.getElementById('dispTimbreCheck').checked;
  const timbreRate = parseFloat(localStorage.getItem('zmt_timbre_rate') || '1');
  let timbreFiscal = 0;
  if (timbreEnabled) {
    timbreFiscal = totalAmount * (timbreRate / 100);
    if (timbreFiscal < 5) timbreFiscal = 5;
    if (timbreFiscal > 10000) timbreFiscal = 10000;
  }

  const invTotal = totalAmount + timbreFiscal;

  // Build items array (single line: المبلغ المرسل)
  const items = [{
    productId: 'dispatch_' + Date.now(),
    barcode: 'DISPATCH',
    name: 'مبلغ الإرسال — Montant envoyé',
    qty: 1,
    price: invTotal,
    total: invTotal,
  }];

  // Create invoice
  const note = document.getElementById('dispNote').value.trim();
  const inv = DB.addInvoice({
    supplierId, customerId,
    walkinName, walkinPhone, walkinAddress,
    type: 'dispatch',
    date: Date.now(),
    items,
    totalAmount: invTotal,
    extraDiscount: 0,
    timbreFiscal,
    isProvisional: false,
    profit: 0,
    note,
  });

  // === HANDLE SUPPLIER DISPATCH ===
  if (supplierId) {
    // Reduce supplier balance (we paid them) — allow negative (overpayment)
    const suppliers = DB.getSuppliers();
    const sIdx = suppliers.findIndex(s => s.id === supplierId);
    if (sIdx !== -1) {
      suppliers[sIdx].balance = (parseFloat(suppliers[sIdx].balance) || 0) - invTotal;
      DB.saveSuppliers(suppliers);
    }
    // Record payment (expense in net account)
    DB.addPayment({
      supplierId,
      invoiceId: inv.id,
      amount: invTotal,
      type: 'stock_purchase',
      note: 'فاتورة إرسال — Bon d\'envoi',
      isProvisional: false,
    });
  }

  // === HANDLE CUSTOMER DISPATCH ===
  if (customerId) {
    const payAmount = Math.min(
      parseFloat(document.getElementById('dispPayAmount').value) || 0,
      totalAmount
    );

    // مبلغ الإرسال كاملاً = مصروف (خرج مال) — لا يُربط بالفاتورة حتى لا يتضاعف المبلغ المدفوع
    DB.addPayment({
      amount: invTotal,
      type: 'dispatch',
      note: 'فاتورة إرسال — Bon d\'envoi',
      isProvisional: false,
    });

    if (payAmount > 0) {
      // دفعة العميل الأولى = إيراد (بيع)
      DB.addPayment({
        customerId,
        invoiceId: inv.id,
        amount: payAmount,
        note: 'فاتورة إرسال — Bon d\'envoi',
        isProvisional: false,
      });
      // Update invoice paidAmount
      DB.updateInvoice(inv.id, { paidAmount: payAmount });
    }

    // Add unpaid remainder to customer balance (totalAmount without timbre)
    const remaining = totalAmount - payAmount;
    if (remaining > 0) {
      const customers = DB.getCustomers();
      const cIdx = customers.findIndex(c => c.id === customerId);
      if (cIdx !== -1) {
        customers[cIdx].balance = (parseFloat(customers[cIdx].balance) || 0) + remaining;
        DB.saveCustomers(customers);
      }
    }
  }

  // === HANDLE WALKIN DISPATCH ===
  // (no balance tracking) — المبلغ المرسل يسجل كمصروف
  if (!supplierId && !customerId) {
    DB.addPayment({
      amount: invTotal,
      type: 'dispatch',
      note: walkinName ? `فاتورة إرسال — ${walkinName}` : 'فاتورة إرسال — Bon d\'envoi',
      isProvisional: false,
    });
  }

  closeInvDispModal();

  let msg = `تم تسجيل فاتورة إرسال بقيمة DA${fmtMoney(invTotal)}`;
  if (timbreFiscal > 0) msg += ` (طابع جبائي: DA${fmtMoney(timbreFiscal)})`;
  if (supplierId) msg += '\nالمبلغ خصم من رصيد المورد';
  if (customerId) {
    const payAmount = Math.min(parseFloat(document.getElementById('dispPayAmount').value) || 0, totalAmount);
    msg += `\nالمبلغ مسجل كمصروف DA${fmtMoney(invTotal)}`;
    if (payAmount > 0) msg += `، والدفعة الأولى DA${fmtMoney(payAmount)} إيراد — الباقي DA${fmtMoney((totalAmount - payAmount))} كدين على العميل`;
  }
  alert(msg);

  refreshInvoiceList();
  filterInvoices();
}

// ===== PURCHASE INVOICE FORM (مثل إضافة مخزون + Timbre) =====

var _purCart = [];
var _purCartSupplierId = null;

function openInvPurModal() {
  _purCart = [];
  _purCartSupplierId = null;
  resetPurForm();
  populatePurBrands();
  renderPurCart();
  document.getElementById('invPurModal').style.display = 'flex';
  applyExpiryField('purExpiry');
  applyFamilyField('purFamily');
  if (typeof window.refreshFamilySuggestions === 'function') window.refreshFamilySuggestions();
  setTimeout(() => document.getElementById('purBarcodeScanner').focus(), 200);
}

function closeInvPurModal() {
  document.getElementById('invPurModal').style.display = 'none';
}

function populatePurBrands(selectedId) {
  const sel = document.getElementById('purBrand');
  if (!sel) return;
  sel.innerHTML = (typeof buildBrandSelectOptions === 'function')
    ? buildBrandSelectOptions(selectedId)
    : [...BRANDS.global, ...BRANDS.chinese].map(b => `<option value="${b.id}">${b.name}</option>`).join('');
}

function setPurBrand(brandId) {
  const sel = document.getElementById('purBrand');
  if (!sel) return;
  sel.value = brandId || '';
  if (!brandId) return;
  if (!new RegExp('value="' + brandId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"').test(sel.innerHTML)) {
    const brandName = (typeof findBrandById === 'function') ? findBrandById(brandId) : null;
    sel.innerHTML += `<option value="${escHtml(brandId)}" selected>${escHtml(brandName ? brandName.name : brandId)}</option>`;
  }
}

function resetPurForm() {
  const sc = document.getElementById('purBarcodeScanner');
  if (sc && !sc._zmtCleanBound) {
    sc._zmtCleanBound = true;
    sc.addEventListener('input', function() {
      const cleaned = cleanScannedCode(this.value);
      if (cleaned !== this.value) this.value = cleaned;
    });
  }
  sc.value = '';
  document.getElementById('purScannerStatus').textContent = 'جاهز للمسح';
  document.getElementById('purScannerResult').style.display = 'none';
  document.getElementById('purProdSearch').value = '';
  document.getElementById('purSearchResults').innerHTML = '';
  document.getElementById('purSelectedProduct').style.display = 'none';
  document.getElementById('purProdName').value = '';
  document.getElementById('purProdBar').value = '';
  document.getElementById('purQty').value = '1';
  document.getElementById('purBuyPrice').value = '0';
  document.getElementById('purSellPrice').value = '0';
  document.getElementById('purWholePrice').value = '0';
  const purExpiryEl = document.getElementById('purExpiry');
  if (purExpiryEl) purExpiryEl.value = '';
  const purFamilyEl = document.getElementById('purFamily');
  if (purFamilyEl) purFamilyEl.value = '';
  document.getElementById('purSupSearch').value = '';
  document.getElementById('purSupResults').innerHTML = '';
  document.getElementById('purSelectedSupplier').style.display = 'none';
  document.getElementById('purTimbreCheck').checked = false;
  document.getElementById('purTimbreAmount').style.display = 'none';
}

// --- Barcode scan ---
function handlePurBarcodeScan(e) {
  if (e.key !== 'Enter') return;
  const val = cleanScannedCode(e.target.value);
  if (!val) return;
  const status = document.getElementById('purScannerStatus');
  const result = document.getElementById('purScannerResult');
  const prod = DB.getProductByBarcode(val);
  if (prod) {
    status.textContent = '✓ تم العثور على المنتج';
    status.style.color = '#28a745';
    result.style.display = '';
    result.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0">
      <span><strong>${escHtml(prod.name)}</strong></span>
      <span style="font-size:11px;color:var(--silver-500)">${Auth.isManager() ? 'DA' + fmtMoney(prod.buyPrice) + ' / ' : ''}DA${fmtMoney(prod.sellPrice)} | المخزون: ${prod.quantity}</span>
    </div><button class="btn btn-sm" onclick="fillPurFromScan('${prod.id}')" style="font-size:11px"><i class="fas fa-check"></i> استخدام هذا المنتج</button>`;
  } else {
    status.textContent = '✗ منتج غير موجود — سيتم إدخال منتج جديد';
    status.style.color = '#e65100';
    result.style.display = '';
    result.innerHTML = `<div style="font-size:12px;color:var(--silver-600);padding:4px 0">الباركود: <strong dir="ltr">${val}</strong></div>`;
    document.getElementById('purProdBar').value = val;
    document.getElementById('purProdName').focus();
  }
}

function fillPurFromScan(id) {
  const p = DB.getProduct(id);
  if (!p) return;
  document.getElementById('purBarcodeScanner').value = '';
  document.getElementById('purScannerResult').style.display = 'none';
  document.getElementById('purScannerStatus').textContent = 'جاهز للمسح';
  document.getElementById('purScannerStatus').style.color = '';
  document.getElementById('purProdSearch').value = p.name;
  document.getElementById('purSelName').textContent = p.name;
  document.getElementById('purSelBarcode').textContent = p.barcode;
  document.getElementById('purSelectedProduct').style.display = '';
  document.getElementById('purProdName').value = p.name;
  document.getElementById('purProdBar').value = p.barcode;
  document.getElementById('purQty').value = '1';
  document.getElementById('purBuyPrice').value = p.buyPrice;
  document.getElementById('purSellPrice').value = p.sellPrice;
  document.getElementById('purWholePrice').value = p.wholesalePrice || 0;
  setPurBrand(p.brandId);
  const purExpiryScan = document.getElementById('purExpiry');
  if (purExpiryScan) purExpiryScan.value = p.expiryDate || '';
  const purFamilyScan = document.getElementById('purFamily');
  if (purFamilyScan) purFamilyScan.value = p.family || '';
}

// --- Product search ---
function searchPurProduct(q) {
  const results = document.getElementById('purSearchResults');
  q = normSearch(q);
  const products = DB.getProducts();
  const matches = q
    ? products
        .map(p => ({ p, score: productSearchScore(p.name, p.barcode, q, p.mark, p.reference, p.countryOfOrigin) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(x => x.p)
    : products.slice(0, 8);
  results.innerHTML = matches.length === 0
    ? '<div class="search-result-item disabled">لا توجد نتائج</div>'
    : matches.map(p => `<div class="search-result-item" onclick="fillPurFromSearch('${p.id}')">
        <strong>${escHtml(p.name)}</strong>
        <span class="text-muted">${p.barcode}</span>
      </div>`).join('');
}

function fillPurFromSearch(id) {
  const p = DB.getProduct(id);
  if (!p) return;
  document.getElementById('purProdSearch').value = p.name;
  document.getElementById('purSearchResults').innerHTML = '';
  document.getElementById('purSelName').textContent = p.name;
  document.getElementById('purSelBarcode').textContent = p.barcode;
  document.getElementById('purSelectedProduct').style.display = '';
  document.getElementById('purProdName').value = p.name;
  document.getElementById('purProdBar').value = p.barcode;
  document.getElementById('purQty').value = '1';
  document.getElementById('purBuyPrice').value = p.buyPrice;
  document.getElementById('purSellPrice').value = p.sellPrice;
  document.getElementById('purWholePrice').value = p.wholesalePrice || 0;
  setPurBrand(p.brandId);
  const purExpirySearch = document.getElementById('purExpiry');
  if (purExpirySearch) purExpirySearch.value = p.expiryDate || '';
  const purFamilySearch = document.getElementById('purFamily');
  if (purFamilySearch) purFamilySearch.value = p.family || '';
}

// --- Supplier search ---
function searchPurSupplier(q) {
  const results = document.getElementById('purSupResults');
  q = normSearch(q);
  const suppliers = DB.getSuppliers();
  const matches = q
    ? suppliers.filter(s =>
        s.name.toLowerCase().includes(q.toLowerCase()) || (s.phone && s.phone.includes(q))
      ).slice(0, 8)
    : suppliers.slice(0, 8);
  results.innerHTML = matches.length === 0
    ? '<div class="search-result-item disabled">لا توجد نتائج</div>'
    : matches.map(s => `<div class="search-result-item" onclick="selectPurSupplier('${s.id}')">
        <strong>${escHtml(s.name)}</strong>
        <span class="text-muted">${s.phone || ''}</span>
      </div>`).join('');
}

function selectPurSupplier(id) {
  const s = DB.getSuppliers().find(x => x.id === id);
  if (!s) return;
  _purCartSupplierId = s.id;
  document.getElementById('purSupSearch').value = s.name;
  document.getElementById('purSupResults').innerHTML = '';
  document.getElementById('purSupName').textContent = s.name;
  document.getElementById('purSelectedSupplier').style.display = '';
}

// --- Cart ---
function purAddToCart() {
  const name = document.getElementById('purProdName').value.trim();
  const barcode = document.getElementById('purProdBar').value.trim();
  const brandId = document.getElementById('purBrand').value;
  const qty = parseInt(document.getElementById('purQty').value) || 1;
  const buyPrice = parseFloat(document.getElementById('purBuyPrice').value) || 0;
  const sellPrice = parseFloat(document.getElementById('purSellPrice').value) || 0;
  const wholesalePrice = parseFloat(document.getElementById('purWholePrice').value) || 0;
  const purExpiryEl = document.getElementById('purExpiry');
  const expiryDate = purExpiryEl ? purExpiryEl.value : '';
  const family = (document.getElementById('purFamily')?.value || '').trim();

  if (!name) { alert('الرجاء إدخال اسم المنتج'); return; }
  if (!barcode) { alert('الرجاء إدخال الباركود'); return; }
  if (window.getPharmacyMode() && !family) { alert(t('inventory.familyRequired')); return; }

  const expSettings = getExpirySettings();
  if (expSettings.enabled && expSettings.required && !expiryDate) { alert(t('inventory.expiryRequired')); return; }

  const conflict = DB.findProductsByBarcode(barcode).find(p => !DB.isSameProductIdentity(p, { name, brandId }));
  if (conflict) {
    alert(`هذا الباركود مسجّل لمنتج آخر: ${conflict.name} (${conflict.barcode})`);
    return;
  }

  _purCart.push({ name, barcode, brandId, qty, buyPrice, sellPrice, wholesalePrice, family, expiryDate });
  renderPurCart();
  resetPurForm();
  setTimeout(() => document.getElementById('purBarcodeScanner').focus(), 200);
}

function renderPurCart() {
  const section = document.getElementById('purCartSection');
  const container = document.getElementById('purCartItems');
  const countEl = document.getElementById('purCartCount');
  const totalEl = document.getElementById('purCartTotal');

  if (_purCart.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';

  countEl.textContent = `(${_purCart.length})`;
  const total = _purCart.reduce((sum, item) => sum + item.qty * item.buyPrice, 0);
  totalEl.textContent = `DA${fmtMoney(total)}`;

  container.innerHTML = _purCart.map((item, i) =>
    `<div class="cart-item">
      <div class="cart-item-info">
        <strong>${item.name}</strong>
        <span class="text-muted">${item.barcode}</span>
      </div>
      <div class="cart-item-details">
        <span>${item.qty} × DA${Auth.isManager() ? fmtMoney(item.buyPrice) : fmtMoney(item.price)}</span>
        <span class="cart-item-total">DA${fmtMoney((item.qty * (Auth.isManager() ? item.buyPrice : item.price)))}</span>
      </div>
      <button class="btn btn-sm btn-danger" onclick="purRemoveFromCart(${i})"><i class="fas fa-times"></i></button>
    </div>`
  ).join('');
  purRecalcTotal();
}

function purRemoveFromCart(idx) {
  _purCart.splice(idx, 1);
  renderPurCart();
}

function purClearCart() {
  if (_purCart.length === 0) return;
  if (!confirm('تفريغ سلة الفاتورة؟')) return;
  _purCart = [];
  renderPurCart();
}

// --- Timbre & Total ---
function purRecalcTotal() {
  const subtotal = _purCart.reduce((s, i) => s + i.qty * i.buyPrice, 0);
  const timbreEnabled = document.getElementById('purTimbreCheck').checked;
  const timbreRate = parseFloat(localStorage.getItem('zmt_timbre_rate') || '1');
  let timbreAmount = 0;
  if (timbreEnabled) {
    timbreAmount = subtotal * (timbreRate / 100);
    if (timbreAmount < 5) timbreAmount = 5;
    if (timbreAmount > 10000) timbreAmount = 10000;
  }
  const total = subtotal + timbreAmount;
  document.getElementById('purCartTotal').textContent = 'DA' + fmtMoney(total);
  const timbreEl = document.getElementById('purTimbreAmount');
  if (timbreEnabled && timbreAmount > 0) {
    timbreEl.textContent = '+ DA' + fmtMoney(timbreAmount);
    timbreEl.style.display = '';
  } else {
    timbreEl.style.display = 'none';
  }
}

// --- Confirm ---
function purConfirmInvoice() {
  if (_purCart.length === 0) { alert('سلة الفاتورة فارغة'); return; }

  const supplierId = _purCartSupplierId;
  let totalAmount = 0;
  const invoiceItems = [];

  for (const item of _purCart) {
    if (item.barcode) {
      const conflict = DB.findProductsByBarcode(item.barcode).find(p => !DB.isSameProductIdentity(p, item));
      if (conflict) {
        _purCart = [];
        _purCartSupplierId = null;
        renderPurCart();
        closeInvPurModal();
        alert(`هذا الباركود مسجّل لمنتج آخر: ${conflict.name} (${conflict.barcode})`);
        return;
      }
    }
  }

  _purCart.forEach(item => {
    const itemTotal = item.qty * item.buyPrice;
    totalAmount += itemTotal;

    const res = DB.addOrMergeProduct({
      name: item.name, barcode: item.barcode,
      brandId: item.brandId,
      buyPrice: item.buyPrice, sellPrice: item.sellPrice,
      wholesalePrice: item.wholesalePrice || 0,
      quantity: item.qty, supplierId,
      family: item.family || '',
      expiryDate: item.expiryDate || '',
    });
    if (!res.ok) {
      _purCart = [];
      _purCartSupplierId = null;
      renderPurCart();
      closeInvPurModal();
      alert(res.existing ? `هذا الباركود مسجّل لمنتج آخر: ${res.existing.name} (${res.existing.barcode})` : 'الباركود غير صالح');
      return;
    }

    const prod = res.product;
    invoiceItems.push({
      productId: prod.id, barcode: prod.barcode,
      name: item.name, qty: item.qty,
      price: item.buyPrice, total: itemTotal,
    });
  });

  const timbreEnabled = document.getElementById('purTimbreCheck').checked;
  const timbreRate = parseFloat(localStorage.getItem('zmt_timbre_rate') || '1');
  let timbreFiscal = 0;
  if (timbreEnabled) {
    timbreFiscal = totalAmount * (timbreRate / 100);
    if (timbreFiscal < 5) timbreFiscal = 5;
    if (timbreFiscal > 10000) timbreFiscal = 10000;
  }

  if (supplierId) {
    DB.addInvoice({ supplierId, type: 'supplier', date: Date.now(), items: invoiceItems, totalAmount, timbreFiscal });
    const suppliers = DB.getSuppliers();
    const idx = suppliers.findIndex(s => s.id === supplierId);
    if (idx !== -1) {
      suppliers[idx].balance = (parseFloat(suppliers[idx].balance) || 0) + totalAmount;
      DB.saveSuppliers(suppliers);
    }
  } else {
    DB.addInvoice({ supplierId: null, type: 'purchase', date: Date.now(), items: invoiceItems, totalAmount, timbreFiscal });
  }

  _purCart = [];
  _purCartSupplierId = null;
  document.getElementById('purTimbreCheck').checked = false;
  renderPurCart();
  closeInvPurModal();

  const cnt = invoiceItems.length;
  const totalQty = invoiceItems.reduce((s, it) => s + it.qty, 0);
  let msg = `تم تسجيل فاتورة بقيمة DA${fmtMoney(totalAmount)}`;
  if (timbreFiscal > 0) msg += ` + طابع جبائي DA${fmtMoney(timbreFiscal)}`;
  msg += ` تشمل ${cnt} منتج (${totalQty} قطعة)`;
  alert(msg);

  refreshInvoiceList();
  filterInvoices();
}

// ===== UTILITY =====

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Settings helpers (duplicated for availability)
function getStoreInfo() {
  // Centralized in barcode-print.js: returns the active company when set,
  // otherwise falls back to the store's stored values.
  if (typeof window.getPrintInfo === 'function') return window.getPrintInfo();
  return {
    name: localStorage.getItem('zmt_store_name') || 'ZMT PIECE',
    address: localStorage.getItem('zmt_store_address') || '',
    phone: localStorage.getItem('zmt_store_phone') || '',
    nis: localStorage.getItem('zmt_store_nis') || '',
    nif: localStorage.getItem('zmt_store_nif') || '',
    rcc: localStorage.getItem('zmt_store_rcc') || '',
    article: localStorage.getItem('zmt_store_article') || '',
  };
}

// ===== LAN SYNC: refresh invoice list without disturbing open entry forms =====
window._pageSyncHandlers = window._pageSyncHandlers || {};
window._pageSyncHandlers['invoices'] = function invoicesSyncData() {
  window.syncPreserveRefresh({
    search: ['invSearchInput'],
    render: () => {
      refreshInvoiceList();
      filterInvoices(true);
    },
  });
};

// ===== PDF SAVE + EMAIL SENDING =====
function buildInvoicePrintDocHTML(inv) {
  const isPayment = inv.type === 'payment';
  const paidAmount = isPayment ? (inv.totalAmount || 0) : DB.getInvoiceEffectivePaid(inv);
  const typeLabel = _invTypeLabel(inv);
  const raw = isPayment ? buildPaymentInvoiceHTML(inv) : buildInvoiceDetailHTML(inv, typeLabel, paidAmount);
  const inner = stripInvPrintHidden(raw);
  const css = '@page{size:A4;margin:0}html,body{margin:0;padding:0;background:#fff}*{box-sizing:border-box}table{border-collapse:collapse}img{max-width:100%}';
  return '<!DOCTYPE html><html dir="ltr"><head><meta charset="utf-8"><title>Facture</title><style>' + css + '</style></head><body>' + inner + '</body></html>';
}

function invToast(msg, type) {
  let el = document.getElementById('invToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'invToast';
    el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:100020;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.25);opacity:0;transition:opacity .25s;pointer-events:none;direction:rtl;max-width:90%';
    document.body.appendChild(el);
  }
  const colors = { success: '#2e7d32', error: '#e53935', info: '#1565c0' };
  el.style.background = colors[type] || colors.info;
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.style.opacity = '0'; }, 3200);
}

async function saveInvoicePdf() {
  const inv = DB.getInvoice(_invDetailId);
  if (!inv) return;
  try {
    const html = buildInvoicePrintDocHTML(inv);
    const res = await window.electronAPI.generateInvoicePdf(html);
    if (!res || !res.success) { invToast('تعذّر توليد ملف PDF', 'error'); return; }
    const defaultPath = (inv.invoiceNumber || inv.id) + '.pdf';
    const result = await window.electronAPI.saveFile({ defaultPath: defaultPath, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (!result || !result.filePath) return;
    const wr = await window.electronAPI.writeFileBinary(result.filePath, res.data);
    if (wr && wr.success) invToast('تم حفظ ملف PDF بنجاح', 'success');
    else invToast('فشل حفظ الملف', 'error');
  } catch (e) {
    invToast('خطأ: ' + (e && e.message ? e.message : e), 'error');
  }
}

function openInvoiceEmail() {
  const inv = DB.getInvoice(_invDetailId);
  if (!inv) return;
  const sup = inv.supplierId ? DB.getSuppliers().find(function (s) { return s.id === inv.supplierId; }) : null;
  const cust = inv.customerId ? DB.getCustomers().find(function (c) { return c.id === inv.customerId; }) : null;
  const party = cust || sup;
  const email = (party && party.email) ? party.email : (inv.walkinEmail || '');
  const num = inv.invoiceNumber || inv.id;
  document.getElementById('invEmailTo').value = email || '';
  document.getElementById('invEmailSubject').value = 'Facture ' + num;
  document.getElementById('invEmailMessage').value = '';
  const err = document.getElementById('invEmailError');
  if (err) err.style.display = 'none';
  // Move the modal to <body> so it is positioned relative to the viewport
  // (the .page ancestor has transform/contain which breaks position:fixed).
  const emailModal = document.getElementById('invEmailModal');
  if (!emailModal._host) emailModal._host = emailModal.parentNode;
  if (emailModal.parentNode !== document.body) document.body.appendChild(emailModal);
  emailModal.style.display = 'flex';
}

function closeInvoiceEmail() {
  document.getElementById('invEmailModal').style.display = 'none';
}

function showInvEmailError(msg) {
  const el = document.getElementById('invEmailError');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}

function readSmtpConfig() {
  return {
    host: localStorage.getItem('zmt_smtp_host') || '',
    port: localStorage.getItem('zmt_smtp_port') || '587',
    user: localStorage.getItem('zmt_smtp_user') || '',
    pass: localStorage.getItem('zmt_smtp_pass') || '',
    from: localStorage.getItem('zmt_smtp_from') || localStorage.getItem('zmt_smtp_user') || '',
    secure: localStorage.getItem('zmt_smtp_secure') === '1',
  };
}

async function sendInvoiceEmail() {
  const inv = DB.getInvoice(_invDetailId);
  if (!inv) return;
  const to = document.getElementById('invEmailTo').value.trim();
  if (!to) { showInvEmailError('الرجاء إدخال بريد المرسل إليه'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { showInvEmailError('صيغة البريد الإلكتروني غير صحيحة'); return; }
  const num = inv.invoiceNumber || inv.id;
  const subject = document.getElementById('invEmailSubject').value.trim() || ('Facture ' + num);
  const message = document.getElementById('invEmailMessage').value.trim();

  // Generate + save the PDF so the user can attach it, then open Gmail in the browser.
  try {
    const html = buildInvoicePrintDocHTML(inv);
    const pdfRes = await window.electronAPI.generateInvoicePdf(html);
    if (pdfRes && pdfRes.success) {
      const defaultPath = ('facture_' + num + '.pdf');
      const result = await window.electronAPI.saveFile({ defaultPath: defaultPath, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
      if (result && result.filePath) {
        await window.electronAPI.writeFileBinary(result.filePath, pdfRes.data);
      }
    }
  } catch (e) { /* attachment is optional; Gmail still opens */ }

  const body = encodeURIComponent(message || ('Veuillez trouver ci-joint votre facture N° ' + num + '\n\nCordialement.'));
  const gmailUrl = 'https://mail.google.com/mail/?view=cm&to=' + encodeURIComponent(to)
    + '&su=' + encodeURIComponent(subject) + '&body=' + body;
  try { await window.electronAPI.openExternal(gmailUrl); } catch (e) {}
  invToast('تم فتح Gmail — أرفق ملف PDF ثم أرسل', 'success');
  closeInvoiceEmail();
}

window.addEventListener('zmt:buyprice-toggle', function () {
  filterInvoices();
  const d = document.getElementById('invDetailModal');
  if (d && d.style.display === 'flex' && _invDetailId) showInvDetail(_invDetailId);
});
