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
    if (typeof renderRouteDocList === 'function') renderRouteDocList();
  });
}

// «إظهار الوحدة في الفاتورة» — one persisted switch that every printed
// document reads through Unit.qtyUnit(). Default ON; old invoices still print
// «قطعة» because Unit treats a missing unit as piece.
function applyInvUnitButton() {
  const btn = document.getElementById('btnInvShowUnit');
  if (!btn) return;
  const on = Unit.showInInvoice();
  const dot = btn.querySelector('i');
  btn.classList.toggle('inv-unit-on', on);
  btn.style.background = on ? 'linear-gradient(135deg,#2e7d32,#1b5e20)' : 'linear-gradient(135deg,#6c757d,#495057)';
  btn.style.color = '#fff';
  btn.style.border = 'none';
  btn.style.boxShadow = on ? '0 2px 8px rgba(46,125,50,.35)' : '0 2px 8px rgba(0,0,0,.18)';
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.title = Unit.text('showUnit');
  if (dot) dot.className = on ? 'fas fa-eye' : 'fas fa-eye-slash';
}

function toggleInvUnitVisibility() {
  const on = Unit.toggleShowInInvoice();
  applyInvUnitButton();
  // Repaint the list so nothing on screen contradicts the new choice.
  if (typeof refreshInvoiceList === 'function') refreshInvoiceList();
  const lbl = document.querySelector('#btnInvShowUnit [data-i18n="invUnit.show"]');
  if (lbl) lbl.textContent = Unit.text('showUnit');
  if (typeof window.zmtToast === 'function') {
    window.zmtToast(on ? Unit.text('showUnitOn') : Unit.text('showUnitOff'), on ? 'success' : 'info');
  }
}

function init_invoices() {
  applyInvUnitButton();
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
  renderRouteDocList();
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
  // Route orders (أذون الطريق) are a manager-only cosmetic copy of sale invoices,
  // so their tab is hidden for restricted users and in the sales-history overlay.
  // Every visit re-opens the real-invoices tab so the default view never drifts.
  const routeTabBtn = document.getElementById('invTabRoutes');
  if (routeTabBtn) routeTabBtn.style.display = (canManageInv && !salesHistory) ? '' : 'none';
  switchInvTab('invoices');
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
      var rd = document.getElementById('routeDocCfgModal');
      if (rd && rd.style.display !== 'none') { closeRouteDocSettings(); return; }
      var rem = document.getElementById('routeDocModal');
      if (rem && rem.style.display !== 'none') { closeRouteDocEditor(); return; }
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
  const invCountEl = document.getElementById('invInvoiceCount');
  if (invCountEl) invCountEl.textContent = String(_invsFiltered.length);
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
      <td class="inv-card-row-qty">${Unit.qtyUnit(it.qty || 0, it)}</td>
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
  // A discounted purchase invoice shows on its card the same figure as the
  // detail screen (the quoted total, 200) plus a discreet «discount» tag and
  // the net that actually moved on the supplier balance (190). The rate and
  // the real cost stay behind the "i" reveal like everywhere else.
  const cardTotal = isBuy ? _invGrossTotal(inv) : (parseFloat(inv.totalAmount) || 0);
  const cardNet = parseFloat(inv.totalAmount) || 0;
  const cardDisc = isBuy && !maskBuy && _invHasBuyDiscount(inv);

  let type, typeColor, typeIcon;
  if (inv.type === 'customer') {
    type = t('invoices.typeSale');
    typeColor = 'badge-success';
    typeIcon = 'fas fa-hand-holding-usd';
  } else if (inv.type === 'sup_sale') {
    type = t('invoices.typeSupSale');
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
        ${_invHasReturns(inv.id) ? `<span class="badge badge-danger inv-return-badge" style="margin-right:4px"><i class="fas fa-undo" style="margin-left:4px"></i>${t('invoices.returnNote')}</span>` : ''}
        <strong class="inv-card-num">${inv.invoiceNumber || '—'}</strong>
      </div>
      <div class="inv-card-date">${date}</div>
    </div>
    <div class="inv-card-body">
      <div class="inv-card-party">${partyName ? `<i class="fas fa-user" style="margin-left:4px;color:var(--silver-500)"></i>${escHtml(partyName)}` : '<span style="color:var(--silver-400)">—</span>'}<span class="inv-card-actions">${_invCardActionButtons(inv.id, inv.type)}</span></div>
      ${(inv.subCustomerName || inv.subCustomerId) ? `<div class="ct-tree-chip" title="${escHtml(t('customerTree.printLabel') || 'Client secondaire')}"><i class="fas fa-user-tag"></i>${escHtml(inv.subCustomerName || '')}</div>` : ''}
      ${lg ? '' : isPayment
        ? `<div class="inv-card-items"><i class="fas ${inv.direction === 'out' ? 'fa-arrow-up' : 'fa-arrow-down'}" style="font-size:10px;color:var(--silver-500)"></i> ${escHtml(_paymentVoucherLabel(inv))}</div>`
        : `<div class="inv-card-items">${inv.items ? inv.items.length + ' ' + t('invoices.itemCount') : '—'}</div>`}
      <div class="inv-card-total${cardDisc ? ' inv-card-total-disc' : ''}"><strong>${maskBuy ? '••••' : 'DA' + fmtMoney(cardTotal)}${cardDisc ? `<span class="inv-card-disc-tag" title="${escHtml(t('invoices.cardDiscountTitle'))}"><i class="fas fa-tags"></i>${escHtml(t('invoices.cardDiscountTag'))}</span>` : ''}</strong>${cardDisc ? `<small class="inv-card-net" dir="rtl">${escHtml(t('invoices.paidAfterDiscount'))}: DA${fmtMoney(cardNet)}</small>` : ''}</div>
    </div>
    ${lg ? _renderInvCardItems(inv) : ''}
    ${isPayment
      ? `<div class="inv-card-footer">
          <div class="inv-card-paid" style="color:#00897b"><i class="fas fa-check-circle"></i> ${escHtml(inv.supplierId ? _paymentVoucherLabel(inv) : (inv.direction === 'out' ? _paymentVoucherLabel(inv) : t('invoices.receivedLabel')))} DA${fmtMoney((inv.totalAmount || 0))}</div>
        </div>`
      : inv.type === 'sup_sale'
        ? `<div class="inv-card-footer">
          <div class="inv-card-progress">
            <div class="inv-progress-bar" style="width:${remaining > 0 ? 0 : 100}%"></div>
          </div>
          <div class="inv-card-paid">
            ${remaining > 0
              ? `<span style="color:#e65100;font-weight:600">${t('invoices.remainingOnSupplier')}: DA${fmtMoney(remaining)}</span>`
              : `<span style="color:#28a745"><i class="fas fa-check-circle"></i> ${t('invoices.supDebtSettled')}</span>`}
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
    case 'route':
      return `<svg ${base}><path d="M3 7h9v9H3z"/><path d="M12 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.7"/><circle cx="16.5" cy="18" r="1.7"/></svg>`;
    case 'convert':
      return `<svg ${base}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 11 2 2 4-4"/></svg>`;
    case 'return':
      return `<svg ${base}><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>`;
    case 'eye':
      return `<svg ${base}><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/></svg>`;
    default:
      return '';
  }
}

// A return invoice exists only when the shared returns store still holds at
// least one row for this invoice. Keeping the mark derived (instead of a
// persisted flag) means deleting the last return removes the badge, the note
// and the print action automatically — no stale state, no migration.
function _invHasReturns(invoiceId) {
  const RI = (typeof window.ReturnInvoice !== 'undefined') ? window.ReturnInvoice : null;
  return !!(RI && typeof RI.hasReturns === 'function' && RI.hasReturns(invoiceId));
}

function _invCardActionButtons(id, type) {
  const acts = [
    ['print', t('invoices.print')],
    ['pdf', t('invoices.savePdf')],
    ['email', t('invoices.sendEmail')],
  ];
  if (_invHasReturns(id)) acts.push(['return', t('invoices.printReturnInvoice')]);
  // A route doc is a cosmetic copy of a SALE invoice only — purchasing, payment
  // vouchers and supplier-side documents have nothing to copy.
  if (type === 'customer') acts.push(['route', t('invoices.copyToRoute')]);
  if (type !== 'payment') acts.push(['edit', t('invoices.edit')]);
  acts.push(['delete', t('invoices.delete')]);
  if (type === 'purchase' || type === 'supplier') {
    acts.push(['emp', t('invoices.printEmployee')]);
  }
  return acts.map(([a, title]) =>
    `<button type="button" class="inv-act${a === 'delete' ? ' inv-act-danger' : ''}" title="${title}" aria-label="${title}" onclick="event.stopPropagation();invCardAction('${id}','${a}')">${_invActionIcon(a)}</button>`
  ).join('');
}

function invCardAction(id, action) {
  showInvDetail(id);
  if (action === 'print') {
    // A discounted purchase invoice has two printable totals: let the operator
    // pick between «after» (190) and «before» (200) discount instead of
    // silently printing the default.
    if (_invHasBuyDiscount(DB.getInvoice(id))) { openInvPrintChoice(); return; }
    printInvFromDetail(); closeInvDetail();
  }
  else if (action === 'pdf') { saveInvoicePdf(); closeInvDetail(); }
  else if (action === 'email') { openInvoiceEmail(); closeInvDetail(); }
  else if (action === 'emp') { printInvEmployee(); closeInvDetail(); }
  else if (action === 'return') {
    closeInvDetail();
    if (window.ReturnInvoice && typeof window.ReturnInvoice.print === 'function') window.ReturnInvoice.print(id);
  }
  else if (action === 'edit') { showInvEditSection(); }
  else if (action === 'delete') { deleteInvoiceFromDetail(); }
  else if (action === 'route') { closeInvDetail(); invCopyToRouteDoc(id); }
  else if (action === 'convert') { openInvConvert(id); }
}

function _invEnsureCtxMenu() {
  if (document.getElementById('invCardCtx')) return;
  const m = document.createElement('div');
  m.id = 'invCardCtx';
  m.className = 'inv-card-ctx';
  const acts = [
    ['print', t('invoices.print')],
    ['pdf', t('invoices.savePdf')],
    ['email', t('invoices.sendEmail')],
    ['edit', t('invoices.edit')],
    ['delete', t('invoices.delete')]
  ];
  m.innerHTML = acts.map(([a, label]) =>
    `<div class="inv-card-ctx-item" data-action="${a}">${_invActionIcon(a)}<span>${label}</span></div>`
  ).join('') +
    `<div class="inv-card-ctx-return-wrap" style="display:none"><div class="inv-card-ctx-sep"></div>` +
    `<div class="inv-card-ctx-item" data-action="return">${_invActionIcon('return')}<span>${t('invoices.printReturnInvoice')}</span></div></div>` +
    `<div class="inv-card-ctx-route-wrap" style="display:none"><div class="inv-card-ctx-sep"></div>` +
    `<div class="inv-card-ctx-item" data-action="route">${_invActionIcon('route')}<span>${t('invoices.copyToRoute')}</span></div></div>` +
    `<div class="inv-card-ctx-convert-wrap" style="display:none"><div class="inv-card-ctx-sep"></div>` +
    `<div class="inv-card-ctx-item" data-action="convert">${_invActionIcon('convert')}<span>${t('invoices.convertBtn')}</span></div></div>` +
    `<div class="inv-card-ctx-emp-wrap" style="display:none"><div class="inv-card-ctx-sep"></div>` +
    `<div class="inv-card-ctx-item" data-action="emp">${_invActionIcon('emp')}<span>${t('invoices.printEmployee')}</span></div></div>`;
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
  const returnWrap = m.querySelector('.inv-card-ctx-return-wrap');
  if (returnWrap) returnWrap.style.display = _invHasReturns(id) ? 'block' : 'none';
  const routeWrap = m.querySelector('.inv-card-ctx-route-wrap');
  if (routeWrap) routeWrap.style.display = (inv && inv.type === 'customer') ? 'block' : 'none';
  const convertWrap = m.querySelector('.inv-card-ctx-convert-wrap');
  if (convertWrap) {
    const canConvert = !!(inv && _canManageInvoices() && _invConvertEligibility(inv).ok);
    convertWrap.style.display = canConvert ? 'block' : 'none';
  }
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

// One label for every place a payment voucher is shown. A supplier voucher
// with money coming IN is a receipt (قبض من مورد); the legacy debt note is
// still labelled سند دين لمورد. Legacy rows without `isDebtNote` fall back to
// direction so old data keeps its original meaning.
function _paymentVoucherLabel(inv) {
  if (!inv) return '';
  if (inv.supplierId) {
    return (inv.direction === 'in' && !inv.isDebtNote)
      ? t('invoices.payFromSupplier') : t('invoices.payToSupplier');
  }
  return inv.direction === 'out' ? t('invoices.payToSupplier') : t('invoices.payFromCustomer');
}

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
  syncPayInvSubSelect();
  updatePaymentBalance();
}

// Customer tree: show the sub-customer selector only for a parent with labels.
// It tags the voucher; it never changes the party the money is posted to.
function syncPayInvSubSelect() {
  const group = document.getElementById('payInvSubGroup');
  const sel = document.getElementById('payInvSubCustomer');
  if (!sel) return;
  const useful = (window.CustomerTree && _payInvPartyType === 'customer' && _payInvPartyId &&
    typeof window.CustomerTree.fillSelect === 'function')
    ? window.CustomerTree.fillSelect(sel, _payInvPartyId, t('customerTree.none'))
    : false;
  if (group) group.style.display = useful ? '' : 'none';
  if (!useful) sel.value = '';
}

function openPaymentInvoiceModal() {
  const m = document.getElementById('paymentInvoiceModal');
  if (!m) return;
  _payInvPartyType = 'customer';
  setPaymentPartyType('customer');
  document.getElementById('payInvAmount').value = '';
  document.getElementById('payInvNote').value = '';
  const debtNote = document.getElementById('payInvDebtNote');
  if (debtNote) debtNote.checked = false;
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
  // A supplier is now a normal cash collection by default (قبض من مورد). The
  // old debt-note behaviour stays available as an explicit, unchecked-by-default
  // option — and only for the supplier tab. Switching tabs always clears it.
  const debtGroup = document.getElementById('payInvDebtNoteGroup');
  const debtNote = document.getElementById('payInvDebtNote');
  if (debtNote) debtNote.checked = false;
  if (debtGroup) debtGroup.style.display = type === 'supplier' ? '' : 'none';
  // Any party is selectable: collecting from a customer with zero/negative
  // balance simply creates credit (رصيد لنا عليه), and collecting from a
  // supplier reduces what we owe him.
  const search = document.getElementById('payInvPartySearch');
  if (search) search.value = '';
  const results = document.getElementById('payInvPartyResults');
  if (results) results.innerHTML = '';
  const selected = document.getElementById('payInvSelected');
  if (selected) selected.style.display = 'none';
  syncPayInvSubSelect();
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
  // flips the balance to a credit we owe them. Supplier receipts and explicit
  // debt notes carry no cap at all.
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
  // Supplier tab defaults to money coming IN (قبض من مورد). The old behaviour
  // remains available as an explicit debt note with no money movement.
  const debtNoteEl = document.getElementById('payInvDebtNote');
  const isDebtNote = !isCustomer && !!debtNoteEl && debtNoteEl.checked;
  const isCashIn = !isDebtNote;

  // Customer tree: metadata only. `customerId` stays the parent and the single
  // balance deduction below is unchanged — no second payment row is created.
  const ctMeta = (isCustomer && window.CustomerTree)
    ? window.CustomerTree.metaFromSelect(document.getElementById('payInvSubCustomer'), DB.getCustomer(partyId))
    : {};
  const inv = DB.addInvoice({
    type: 'payment',
    direction: isCashIn ? 'in' : 'out',
    kind: isCustomer ? 'customer-receipt' : (isDebtNote ? 'supplier-debt-note' : 'supplier-receipt'),
    isDebtNote: isDebtNote,
    customerId: isCustomer ? partyId : undefined,
    ...ctMeta,
    supplierId: isCustomer ? undefined : partyId,
    totalAmount: amount,
    paidAmount: amount,
    items: [],
    date: new Date().toISOString().slice(0, 10),
    method: method,
    note: note || (isCustomer ? t('invoices.custVoucherNote')
      : (isDebtNote ? t('invoices.suppVoucherNote') : t('invoices.suppReceiptNote'))),
    isProvisional: false,
  }, { payment: true });

  // Balance effects (no cap, balances may go negative):
  // - Customer voucher: collecting money reduces what they owe; collecting more
  //   than the debt turns the balance into a credit we owe them (negative).
  // - Supplier receipt: money came in, so what we owe the supplier drops by the
  //   same amount. It is period revenue and carries no merchandise margin.
  // - Supplier debt note (explicit): no money moved; what we owe increases.
  if (isCustomer) {
    const customers = DB.getCustomers();
    const cIdx = customers.findIndex(c => c.id === partyId);
    if (cIdx !== -1) {
      customers[cIdx].balance = (parseFloat(customers[cIdx].balance) || 0) - amount;
      DB.saveCustomers(customers);
    }
  } else if (isDebtNote) {
    const suppliers = DB.getSuppliers();
    const sIdx = suppliers.findIndex(s => s.id === partyId);
    if (sIdx !== -1) {
      suppliers[sIdx].balance = (parseFloat(suppliers[sIdx].balance) || 0) + amount;
      DB.saveSuppliers(suppliers);
    }
  } else {
    const suppliers = DB.getSuppliers();
    const sIdx = suppliers.findIndex(s => s.id === partyId);
    if (sIdx !== -1) {
      suppliers[sIdx].balance = (parseFloat(suppliers[sIdx].balance) || 0) - amount;
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
  if (inv.type === 'payment') {
    // A supplier receipt is money in (Bon de caisse); only an explicit debt
    // note keeps the old Billet de dette label.
    return (inv.direction === 'out' || inv.isDebtNote) ? 'BILLET DE DETTE' : 'BON DE CAISSE';
  }
  return "FACTURE D'ACHAT";
}

function buildPaymentInvoiceHTML(inv) {
  const store = getStoreInfo();
  const isCustomer = !!inv.customerId;
  // Money moving INTO the till is a receipt whether the party is a customer
  // or a supplier; only an explicit debt note is a décaissement.
  const isReceipt = inv.direction === 'in' && !inv.isDebtNote;
  const party = isCustomer
    ? DB.getCustomers().find(c => c.id === inv.customerId) || null
    : DB.getSuppliers().find(s => s.id === inv.supplierId) || null;
  const date = new Date(inv.createdAt);
  const dateStr = date.toLocaleDateString('fr-DZ', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const amount = inv.totalAmount || 0;
  return `
    <div id="invDetailPrintArea" style="padding:30px 35px;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#222;direction:ltr;text-align:left" dir="ltr">
      ${buildDocHeaderRow(
        `<div style="font-size:20px;font-weight:900;color:#1a1a1a;text-transform:uppercase;letter-spacing:1px">${escHtml(store.name)}</div>
            <div style="font-size:10px;color:#999;margin-top:1px;text-transform:uppercase;letter-spacing:0.5px">${isCustomer ? 'Reçu de versement' : (isReceipt ? 'Bon de caisse' : 'Billet de dette')}</div>
            ${store.address ? `<div style="font-size:11px;color:#555;margin-top:4px">${escHtml(store.address)}</div>` : ''}
            ${store.phone ? `<div style="font-size:11px;color:#555">Tél: ${escHtml(store.phone)}</div>` : ''}
            ${storeLegalLineHTML(inv)}`,
        `<div style="font-size:26px;font-weight:900;color:#00897b;text-transform:uppercase;letter-spacing:2px">${_invTypeLabel(inv)}</div>
            <div style="font-size:14px;font-weight:700;color:#333;margin-top:6px">N° ${inv.invoiceNumber || '—'}</div>
            <div style="font-size:11px;color:#555;margin-top:4px;line-height:1.6">
              <div>Date: ${dateStr}</div>
              <div>Heure: ${timeStr}</div>
            </div>`
      )}

      <div style="border-top:2px solid #1a1a1a;margin:16px 0 14px"></div>
      <div style="height:1px;background:#ddd;margin-bottom:16px"></div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:16px" dir="ltr">
        <tr>
          <td style="vertical-align:top;width:50%">
            <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px">${isCustomer ? 'Client' : 'Fournisseur'}</div>
            ${party
              ? `<div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-top:2px">${escHtml(party.name)}</div>
                 ${party.phone ? `<div style="font-size:11px;color:#666">Tél: ${escHtml(party.phone)}</div>` : ''}
                 ${partyLegalLineHTML(inv, party, isCustomer ? 'customer' : 'supplier')}`
              : `<div style="font-size:14px;color:#888">—</div>`
            }
            ${invPartyBalanceBlockHTML(inv, party)}
          </td>
          <td style="vertical-align:top;text-align:right;width:50%">
            <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">${isReceipt ? 'Encaissement' : 'Décaissement'}</div>
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
            <button class="btn btn-primary" onclick="openInvPrintChoice()" style="display:flex;align-items:center;gap:5px"><i class="fas fa-print"></i> <span>${t('invoices.print')}</span></button>
            <button class="btn" onclick="previewInvFromDetail()" style="display:flex;align-items:center;gap:5px"><i class="fas fa-eye"></i> <span>${t('invoices.preview')}</span></button>
            <button class="btn" onclick="showInvPaymentSection()" style="display:flex;align-items:center;gap:5px"><i class="fas fa-hand-holding-usd"></i> <span>${t('invoices.pay')}</span></button>
            <button class="btn" onclick="showInvEditSection()" style="display:flex;align-items:center;gap:5px"><i class="fas fa-edit"></i> <span>${t('invoices.edit')}</span></button>
            <button class="btn btn-danger" onclick="deleteInvoiceFromDetail()" style="display:flex;align-items:center;gap:5px"><i class="fas fa-trash"></i> <span>${t('invoices.delete')}</span></button>
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
  _invPrintTotalBasis = 'net';

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

  _renderInvDetailBody(inv, isPayment, paidAmount, invoiceId);
  _injectInvBuyRevealButton(inv);
  _syncInvBuyRevealUI();
  // Payment vouchers are final balance settlements: no partial payment and no editing.
  if (footer) footer.querySelectorAll('button').forEach(b => {
    const oc = b.getAttribute && b.getAttribute('onclick');
    if (isPayment && (oc === 'showInvPaymentSection()' || oc === 'showInvEditSection()')) b.style.display = 'none';
  });
  _injectInvTransferFooterButton(inv);
  _injectInvConvertFooterButton(inv);
  _injectReturnInvoiceFooterButton(inv);
  modal.style.display = 'flex';
}

// Render the invoice body, then re-render once the logo has been inlined (the
// data URL is fetched asynchronously at startup). Keeps the on-screen preview
// identical to what will be printed, in both the editable and read-only views.
function _renderInvDetailBody(inv, isPayment, paidAmount, invoiceId) {
  const body = document.getElementById('invDetailBody');
  if (!body) return;
  const build = function () {
    return isPayment ? buildPaymentInvoiceHTML(inv) : buildInvoiceDetailHTML(inv, _invTypeLabel(inv), paidAmount);
  };
  body.innerHTML = build();
  const L = (typeof window.InvoiceLogo !== 'undefined') ? window.InvoiceLogo : null;
  if (L && L.isEnabled() && !L.current()) {
    Promise.resolve(L.warm()).then(function () {
      if (_invDetailId !== invoiceId) return;
      if (!L.current()) return;
      const cur = document.getElementById('invDetailBody');
      if (cur) cur.innerHTML = build();
    }).catch(function () {});
  }
}

// ===== SHARED DOCUMENT HEADER (shop name | optional logo | document type) ====
// One builder for every printed header in this file, so the logo can never
// appear on one document and be missing from another:
//   • buildInvoiceDetailHTML   (A4 invoice)
//   • buildPaymentInvoiceHTML  (payment voucher)
//   • the employee preparation sheet
// The PDF + email paths reuse the same builders, so they inherit the logo too.
//
// With a logo:  [ shop 45% ] [ logo ] [ document type 40% ]
// Without one:  the original two-column layout, untouched.
//
// `leftCell` / `rightCell` are the already-rendered HTML of the two original
// columns. The layout itself lives in the shared InvoiceLogo lib so the sales
// page and the settings preview render byte-for-byte the same header.
function buildDocHeaderRow(leftCell, rightCell, mono) {
  const L = (typeof window.InvoiceLogo !== 'undefined') ? window.InvoiceLogo : null;
  if (L && typeof L.headerRow === 'function') return L.headerRow(leftCell, rightCell, mono);
  return '<table style="width:100%;border-collapse:collapse" dir="ltr"><tr>' +
    '<td style="vertical-align:top;width:60%">' + leftCell + '</td>' +
    '<td style="vertical-align:top;text-align:right;width:40%">' + rightCell + '</td>' +
    '</tr></table>';
}

// Optional product columns on the commercial invoice. Hidden by default: the
// values come from the display-settings switches and are shared by the screen,
// printer, PDF and email copies because they all use buildInvoiceDetailHTML().
function _invColumnVis() {
  var cfg = null;
  try {
    if (typeof window !== 'undefined' && window.DisplaySettings && typeof window.DisplaySettings.invoiceColumns === 'function') {
      cfg = window.DisplaySettings.invoiceColumns();
    }
  } catch (e) {}
  if (!cfg) {
    try {
      var raw = (typeof localStorage !== 'undefined') ? localStorage.getItem('zmt_display_settings') : null;
      cfg = raw ? JSON.parse(raw) : null;
    } catch (e) { cfg = null; }
  }
  cfg = cfg || {};
  // DisplaySettings.invoiceColumns() exposes {reference, mark}; the raw stored
  // object uses {invShowReference, invShowMark}. Accept both shapes.
  function isOn(v) { return v === true || v === 1 || v === '1' || v === 'true'; }
  var ref = (cfg.invShowReference !== undefined) ? cfg.invShowReference : cfg.reference;
  var mark = (cfg.invShowMark !== undefined) ? cfg.invShowMark : cfg.mark;
  return {
    reference: isOn(ref),
    mark: isOn(mark)
  };
}

// Older sale lines may not carry the product snapshot; fall back to the live
// product so switching a column on never shows an empty cell for old invoices.
function _invItemExtra(item, field) {
  if (item && item[field]) return String(item[field]);
  var pid = item && item.productId;
  if (!pid || typeof DB === 'undefined' || typeof DB.getProduct !== 'function') return '';
  try {
    var p = DB.getProduct(pid);
    return (p && p[field]) ? String(p[field]) : '';
  } catch (e) { return ''; }
}

function _legalInfoVis() {
  if (typeof getLegalInfoVisibility === 'function') return getLegalInfoVisibility();
  return {
    customer: localStorage.getItem('zmt_inv_legal_customer') === '1',
    supplier: localStorage.getItem('zmt_inv_legal_supplier') === '1',
    employee: localStorage.getItem('zmt_inv_legal_employee') === '1',
  };
}

// The party's own legal identity is typed deliberately on its customer/supplier
// card, so it prints on that party's documents by default and has its own
// switches in settings. The shop's legal block keeps the older «إظهار هذه
// المعلومات في الفواتير لـ» switches, which stay off until asked for.
function _partyLegalVis() {
  return {
    customer: localStorage.getItem('zmt_inv_party_legal_customer') !== '0',
    supplier: localStorage.getItem('zmt_inv_party_legal_supplier') !== '0',
    employee: localStorage.getItem('zmt_inv_party_legal_employee') !== '0',
  };
}

function _legalCatOf(inv, forceCat) {
  return forceCat || ((inv.type === 'supplier' || inv.type === 'purchase') ? 'supplier'
            : (inv.type === 'employee') ? 'employee'
            : 'customer');
}

function _legalParts(rec) {
  if (!rec) return [];
  const parts = [];
  if (rec.nis) parts.push('NIS: ' + escHtml(rec.nis));
  if (rec.nif) parts.push('NIF: ' + escHtml(rec.nif));
  if (rec.rc || rec.rcc) parts.push('RC: ' + escHtml(rec.rc || rec.rcc));
  if (rec.article) parts.push('ART: ' + escHtml(rec.article));
  return parts;
}

// The party's own legal identity, typed on its customer/supplier form. It obeys
// its own switch (on by default), independent of the shop line above it.
function partyLegalLineHTML(inv, party, forceCat) {
  const cat = _legalCatOf(inv, forceCat);
  if (!_partyLegalVis()[cat]) return '';
  const parts = _legalParts(party);
  if (!parts.length) return '';
  return '<div style="font-size:10px;color:#777;margin-top:3px;direction:ltr;text-align:left">' + parts.join(' | ') + '</div>';
}

function storeLegalLineHTML(inv, forceCat) {
  const store = getStoreInfo();
  const cat = _legalCatOf(inv, forceCat);
  if (!_legalInfoVis()[cat]) return '';
  const parts = _legalParts(store);
  if (!parts.length) return '';
  return '<div style="font-size:10px;color:#999;margin-top:2px">' + parts.join(' | ') + '</div>';
}

function buildInvoiceDetailHTML(inv, typeLabel, paidAmount, opts) {
  const store = getStoreInfo();
  const remaining = inv.type === 'sup_sale'
    ? DB.getSupSaleNetDue(inv)
    : Math.max(0, (inv.totalAmount || 0) - paidAmount);
  const date = new Date(inv.createdAt);
  const dateStr = date.toLocaleDateString('fr-DZ', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const totalQty = inv.items ? inv.items.reduce((s, it) => s + it.qty, 0) : 0;
  const invCols = _invColumnVis();
  const invColCount = 4 + (invCols.reference ? 1 : 0) + (invCols.mark ? 1 : 0);

  const sup = inv.supplierId ? DB.getSuppliers().find(s => s.id === inv.supplierId) : null;
  const cust = inv.customerId ? DB.getCustomers().find(c => c.id === inv.customerId) : null;
  const party = cust || sup;
  const isCustomer = !!inv.customerId || inv.type === 'waybill' || inv.type === 'proforma' || inv.type === 'customer' || inv.type === 'sup_sale';
  const isBuy = inv.type === 'supplier' || inv.type === 'purchase';
  const maskBuy = isBuy && !Auth.buyPriceVisible();
  // ===== DISCOUNTED PURCHASE: WHICH TOTAL GOES WHERE =======================
  // The invoice lines always carry the QUOTED unit price (a 100→95 item still
  // reads 100 on paper), so:
  //   • screen total   = GROSS (200) — what the operator bargained for,
  //   • "i" reveal     = the per-product % / real cost and the NET (190),
  //   • printed total  = chosen in the print dialog: NET (190, «after
  //                      discount», with explicit remise lines) or GROSS (200).
  // The real per-unit cost is an internal accounting figure: it is never printed.
  // Purchase discount detail is sensitive: hidden on screen until "i" is
  // pressed and stripped from every printed / PDF / emailed copy.
  const buyMode = inv.purchaseDiscountMode === 'amount' ? 'amount' : 'percent';
  const buyGlobalDisc = parseFloat(inv.purchaseDiscountAmount) || 0;
  const buyProductDisc = parseFloat(inv.purchaseProductDiscount) || 0;
  const netTotal = parseFloat(inv.totalAmount) || 0;
  const grossTotal = isBuy ? _invGrossTotal(inv) : netTotal;
  const hasBuyDisc = isBuy && grossTotal > netTotal + 0.004;
  const printBasis = (opts && opts.printBasis === 'gross') ? 'gross' : 'net';
  const screenTotal = hasBuyDisc ? grossTotal : netTotal;
  const printTotal = (hasBuyDisc && printBasis === 'gross') ? grossTotal : netTotal;
  // Breakdown printed only for the «after discount» copy: the remise lines make
  // 100 × 2 − 10 = 190 add up on paper. The «before discount» copy prints the
  // gross total alone, without a single hint that a discount exists.
  const printDiscRows = (hasBuyDisc && printBasis === 'net') ? (function () {
    const r2 = function (v) { return Math.round((Number(v) || 0) * 100) / 100; };
    const gap = r2(grossTotal - netTotal);            // the discount the paper must explain
    const prodDisc = Math.min(r2(buyProductDisc), gap);
    // Whatever is left is the invoice-level remise. Deriving it from the gap
    // (instead of trusting the stored figure) guarantees the paper adds up
    // even when a legacy record or a 0.01 line-allocation rounding disagrees.
    const invDisc = r2(gap - prodDisc);
    const rows = [{ label: 'الإجمالي قبل الخصم / Sous-total (brut)', value: grossTotal, kind: 'sub' }];
    if (prodDisc > 0.004) {
      const prodPct = grossTotal > 0 ? Math.round((prodDisc / grossTotal) * 100 * 100) / 100 : 0;
      rows.push({ label: 'خصم المنتجات / Remise produits (' + fmtMoney(prodPct) + '%)', value: prodDisc, kind: 'disc' });
    }
    if (invDisc > 0.004) {
      const pct = (buyMode === 'percent' && (parseFloat(inv.purchaseDiscountValue) || 0) > 0)
        ? ' (' + fmtMoney(parseFloat(inv.purchaseDiscountValue) || 0) + '%)'
        : '';
      rows.push({ label: 'خصم الفاتورة / Remise facture' + pct, value: invDisc, kind: 'disc' });
    }
    return rows;
  })() : [];
  const hasBuySensitive = isBuy && (
    buyGlobalDisc > 0 || buyProductDisc > 0 ||
    (inv.items || []).some(it => (parseFloat(it.purchaseDiscountPct) || 0) > 0 || (parseFloat(it.realBuyPrice) || 0) > 0)
  );
  // Screen-only banner under the totals: the figure above is the GROSS (200);
  // the net (190) and the per-product rate/real cost stay behind the "i"
  // reveal. Clicking the banner (or pressing "i") toggles that same reveal.
  // Every printed / PDF / emailed copy drops it with .inv-screen-only.
  const discBanner = (hasBuyDisc && !maskBuy) ? (function () {
    const text = escHtml(t('invoices.discountOnInvoiceBanner'))
      .replace('{i}', '<b class="inv-disc-key">i</b>')
      .replace('{net}', 'DA' + fmtMoney(netTotal));
    return `<div class="inv-screen-only inv-disc-banner" dir="rtl" role="button" tabindex="0"
        title="${escHtml(t('invoices.paidAfterDiscount'))}: DA${fmtMoney(netTotal)}"
        onclick="toggleInvBuySensitive()"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleInvBuySensitive();}">
        <i class="fas fa-tags"></i><span>${text}</span></div>`;
  })() : '';
  const buySensitiveBlock = hasBuySensitive ? `
    <div class="inv-buy-sensitive inv-print-hide" dir="ltr" style="margin-top:10px;padding:10px 14px;border:1px dashed #8fbfa8;border-radius:6px;background:#f1f8f5;font-size:11.5px;color:#2e7d32">
      <div style="display:flex;justify-content:space-between;gap:16px"><span>خصم المنتجات / Remise produits</span><b>DA${fmtMoney(buyProductDisc)}</b></div>
      <div style="display:flex;justify-content:space-between;gap:16px"><span>خصم الفاتورة / Remise facture ${buyMode === 'amount' ? '(DA)' : '(' + fmtMoney(parseFloat(inv.purchaseDiscountValue) || 0) + '%)'}</span><b>DA${fmtMoney(buyGlobalDisc)}</b></div>
      <div style="display:flex;justify-content:space-between;gap:16px;border-top:1px solid #c8e6c9;margin-top:3px;padding-top:3px"><span>الإجمالي قبل الخصم / Brut</span><b>DA${fmtMoney(grossTotal)}</b></div>
      <div style="display:flex;justify-content:space-between;gap:16px;background:#e3f2e8;border-radius:4px;margin-top:4px;padding:4px 6px"><span style="font-weight:800">الإجمالي بعد الخصم / Net après remise</span><b>DA${fmtMoney(netTotal)}</b></div>
    </div>` : '';
  const walkinCust = (!cust && !sup && inv.walkinName) ? { name: inv.walkinName, phone: inv.walkinPhone, address: inv.walkinAddress } : null;
  // Conversion is a local ledger operation: the note explains who the invoice
  // was moved to and which anonymous cash receipts were cancelled. It is shown
  // on screen only (never printed).
  const cancelledCash = parseFloat(inv.conversionCancelledCash) || 0;
  const fromName = inv.convertedFromCustomerName || inv.walkinName || inv.walkinCustomerName || '';
  const convertNote = inv.convertedAt ? `
    <div class="inv-print-hide" dir="rtl" style="margin-top:12px;padding:10px 14px;border:1px solid #c7e0ff;border-radius:6px;background:#f2f8ff;font-size:12px;color:#1c4f82;line-height:1.8">
      <div style="display:flex;align-items:center;gap:7px;font-weight:800;margin-bottom:2px"><i class="fas fa-user-check"></i> ${escHtml(t('invoices.convertNoteTitle'))}</div>
      ${fromName ? `<div>${escHtml(t('invoices.convertNoteFrom'))} <b>${escHtml(fromName)}</b></div>` : ''}
      ${cancelledCash > 0 ? `<div>${t('invoices.convertNoteCancelled').replace('{amount}', _invMoney(cancelledCash))}</div>` : ''}
      <div style="font-size:11px;color:#5b7fa6">${escHtml(t('invoices.convertNoteOn').replace('{date}', new Date(inv.convertedAt).toLocaleString('fr-DZ')))}</div>
    </div>` : '';

  // A «ملاحظة مرتجع» note appears on screen only: it tells the operator that
  // part of this invoice has been returned and offers the French return
  // invoice. The printed ORIGINAL invoice stays untouched — stripInvPrintHidden
  // removes the whole block (inv-print-hide) from every print / PDF / email.
  const returnNote = _invHasReturns(inv.id) ? (function () {
    const rows = (window.ReturnInvoice && typeof window.ReturnInvoice.returnsFor === 'function')
      ? window.ReturnInvoice.returnsFor(inv.id) : [];
    const count = rows.length;
    const total = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);
    return `
    <div class="inv-print-hide inv-return-note" dir="rtl" style="margin-top:12px;padding:11px 14px;border:1px solid #f0b8b8;border-radius:8px;background:#fff5f5;font-size:12px;color:#b71c1c;line-height:1.8">
      <div style="display:flex;align-items:center;gap:7px;font-weight:800;margin-bottom:3px"><i class="fas fa-undo"></i> ${escHtml(t('invoices.returnNote'))}</div>
      <div style="color:#8a2b2b">${escHtml(t('invoices.returnNoteHint'))
        .replace('{count}', String(count))
        .replace('{amount}', 'DA' + fmtMoney(total))}</div>
      <button type="button" class="btn" onclick="event.stopPropagation();if(window.ReturnInvoice)window.ReturnInvoice.print('${inv.id}')"
        style="margin-top:8px;display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid #e0a0a0;color:#b71c1c">
        <i class="fas fa-print"></i> ${escHtml(t('invoices.printReturnInvoice'))}
      </button>
    </div>`;
  })() : '';

  // "Montant payé / Reste" strip. It always works off the NET total: that is
  // the money actually owed, so a settled invoice never shows a phantom
  // remainder when the operator prints the pre-discount copy.
  const paidBlockHTML = function (baseTotal, paidOpts) {
    const rest = Math.max(0, baseTotal - paidAmount);
    if (!(paidAmount > 0 || rest > 0)) return '';
    const settled = paidAmount >= baseTotal;
    const tag = (paidOpts && paidOpts.afterDisc)
      ? `<span style="display:inline-block;margin-inline-end:8px;padding:1px 7px;border-radius:999px;background:rgba(0,0,0,.07);font-size:10px;font-weight:800">${escHtml(t('invoices.paidAfterDiscount'))}</span>`
      : '';
    return `<div style="margin-top:14px;padding:10px 14px;border-radius:6px;font-size:12px;${settled ? 'background:#e8f5e9;border:1px solid #a5d6a7;color:#2e7d32' : 'background:#fff3e0;border:1px solid #ffcc80;color:#e65100'}" dir="ltr">
          ${tag}<strong>Montant payé:</strong> ${maskBuy ? '••••' : fmtMoney(paidAmount) + ' DA'}
          ${rest > 0 ? `&nbsp;|&nbsp; <strong>Reste:</strong> ${maskBuy ? '••••' : fmtMoney(rest) + ' DA'}` : ''}
        </div>`;
  };

  return `
    <div id="invDetailPrintArea" style="padding:30px 35px;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#222;direction:ltr;text-align:left" dir="ltr">
      ${buildDocHeaderRow(
        `<div style="font-size:20px;font-weight:900;color:#1a1a1a;text-transform:uppercase;letter-spacing:1px">${escHtml(store.name)}</div>
            <div style="font-size:10px;color:#999;margin-top:1px;text-transform:uppercase;letter-spacing:0.5px">${inv.type === 'proforma' ? 'Document proforma — sans valeur commerciale' : 'Document commercial'}</div>
            ${store.address ? `<div style="font-size:11px;color:#555;margin-top:4px">${escHtml(store.address)}</div>` : ''}
            ${store.phone ? `<div style="font-size:11px;color:#555">Tél: ${escHtml(store.phone)}</div>` : ''}
            ${storeLegalLineHTML(inv)}`,
        `<div style="font-size:26px;font-weight:900;color:#1a1a1a;text-transform:uppercase;letter-spacing:2px">${typeLabel}</div>
            <div style="font-size:10px;font-weight:600;color:#888;margin-top:1px;text-transform:uppercase;letter-spacing:1px">${inv.type === 'proforma' ? 'PROFORMA' : 'Original'}</div>
            <div style="font-size:14px;font-weight:700;color:#333;margin-top:6px">N° ${inv.invoiceNumber || '—'}</div>
            <div style="font-size:11px;color:#555;margin-top:4px;line-height:1.6">
              <div>Date: ${dateStr}</div>
              <div>Heure: ${timeStr}</div>
            </div>`
      )}

      <div style="border-top:2px solid #1a1a1a;margin:16px 0 14px"></div>
      <div style="height:1px;background:#ddd;margin-bottom:16px"></div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:16px" dir="ltr">
        <tr>
          <td style="vertical-align:top;width:50%">
            <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px">${(isCustomer && inv.type !== 'sup_sale') ? 'Client' : 'Fournisseur'}</div>
            ${party
              ? `<div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-top:2px">${escHtml(party.name)}</div>
                 ${party.phone ? `<div style="font-size:11px;color:#666">Tél: ${escHtml(party.phone)}</div>` : ''}
                 ${party.address ? `<div style="font-size:11px;color:#666">Adresse: ${escHtml(party.address)}</div>` : ''}
                 ${partyLegalLineHTML(inv, party)}`
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
            ${invCols.reference ? '<th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:110px">Référence</th>' : ''}
            <th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd">Désignation</th>
            ${invCols.mark ? '<th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:110px">Marque</th>' : ''}
            <th style="padding:8px 10px;text-align:center;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:90px">Qté</th>
            <th style="padding:8px 10px;text-align:right;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:90px">Prix unitaire</th>
            <th style="padding:8px 10px;text-align:right;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:90px">Total</th>
          </tr>
        </thead>
        <tbody>
          ${(inv.items || []).map((item, i) => `
            <tr style="${i % 2 === 0 ? 'background:#fafafa' : ''}">
              ${invCols.reference ? `<td style="padding:7px 10px;border:1px solid #eee;font-size:12px;color:#333" dir="ltr">${escHtml(_invItemExtra(item, 'reference'))}</td>` : ''}
              <td style="padding:7px 10px;border:1px solid #eee;font-size:12px;color:#333">${escHtml(item.name)}</td>
              ${invCols.mark ? `<td style="padding:7px 10px;border:1px solid #eee;font-size:12px;color:#333" dir="ltr">${escHtml(_invItemExtra(item, 'mark'))}</td>` : ''}
              <td style="padding:7px 10px;border:1px solid #eee;text-align:center;font-size:12px;color:#333">${Unit.qtyUnit(item.qty, item)}</td>
              <td style="padding:7px 10px;border:1px solid #eee;text-align:right;font-size:12px;color:#333">
                ${maskBuy ? '••••' : `${(inv.type !== 'waybill' && item.originalPrice && item.originalPrice !== item.price) ? `<span style="text-decoration:line-through;color:#999;font-size:10px">${fmtMoney(item.originalPrice)}</span> ` : ''}
                ${fmtMoney(item.price)} DA`}
              </td>
              <td style="padding:7px 10px;border:1px solid #eee;text-align:right;font-size:12px;font-weight:600;color:#333">${maskBuy ? '••••' : fmtMoney((item.price * item.qty)) + ' DA'}</td>
            </tr>
            ${(isBuy && ((parseFloat(item.purchaseDiscountPct) || 0) > 0 || (parseFloat(item.realBuyPrice) || 0) > 0)) ? `
            <tr class="inv-buy-sensitive inv-print-hide" style="background:#f7fbf9">
              <td colspan="${invColCount}" style="padding:4px 10px 7px;border:1px solid #eee;font-size:10.5px;color:#2e7d32" dir="ltr">
                <span style="margin-inline-end:14px">خصم المنتج: <b>${fmtMoney(parseFloat(item.purchaseDiscountPct) || 0)}%</b></span>
                <span style="margin-inline-end:14px">خصم الفاتورة/السطر: <b>DA${fmtMoney(parseFloat(item.globalDiscount) || 0)}</b></span>
                <span style="margin-inline-end:14px">التكلفة الحقيقية/الوحدة: <b>DA${fmtMoney(parseFloat(item.realBuyPrice) || 0)}</b></span>
                <span>التكلفة الحقيقية/السطر: <b>DA${fmtMoney(parseFloat(item.realTotal) || 0)}</b></span>
              </td>
            </tr>` : ''}
          `).join('')}
        </tbody>
      </table>
      ${buySensitiveBlock}
      ${convertNote}
      ${returnNote}

      ${(inv.subCustomerName || inv.subCustomerId) ? `
      <div class="ct-tree-note" style="margin-top:12px;padding:8px 12px;border-inline-start:3px solid #2563eb;background:#f8faff;font-size:12px;color:#334155" dir="ltr">
        <div style="font-size:10px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">${escHtml(t('customerTree.printLabel') || 'Client secondaire')}</div>
        <div style="font-weight:700">${escHtml(inv.subCustomerName || '')}</div>
      </div>` : ''}
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
              ${printDiscRows.map(r => `<tr class="inv-print-only" style="display:none;${r.kind === 'sub' ? 'border-top:1px solid #ddd' : ''}">
                <td style="padding:3px 10px;text-align:left;font-size:11.5px;color:${r.kind === 'sub' ? '#555' : '#c62828'};direction:rtl">${escHtml(r.label)}</td>
                <td style="padding:3px 10px;text-align:right;font-size:11.5px;font-weight:700;color:${r.kind === 'sub' ? '#333' : '#c62828'}">${r.kind === 'sub' ? '' : '− '}${fmtMoney(r.value)} DA</td>
              </tr>`).join('')}
              <tr style="border-top:2px solid #1a1a1a">
                <td style="padding:6px 10px;text-align:left;font-weight:800;font-size:15px;color:#1a1a1a">Net à payer</td>
                <td style="padding:6px 10px;text-align:right;font-weight:900;font-size:17px;color:#0066B1">${maskBuy ? '••••' : (hasBuyDisc
                  ? `<span class="inv-screen-only">${fmtMoney(screenTotal)} DA</span>
                     <span class="inv-print-only" style="display:none">${fmtMoney(printTotal)} DA</span>`
                  : fmtMoney(netTotal) + ' DA')}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      ${discBanner}

      ${inv.type === 'sup_sale'
        ? (remaining > 0
          ? `<div style="margin-top:14px;padding:12px 16px;background:#fff3e0;border:1px solid #ffcc80;border-radius:6px;font-size:13px;color:#e65100;display:flex;justify-content:space-between;align-items:center" dir="ltr">
              <strong>${t('invoices.remainingOnSupplier')}:</strong>
              <strong style="font-size:16px">${fmtMoney(remaining)} DA</strong>
            </div>`
          : `<div style="margin-top:14px;padding:12px 16px;background:#e8f5e9;border:1px solid #a5d6a7;border-radius:6px;font-size:13px;color:#2e7d32" dir="ltr">
              <strong>${t('invoices.supDebtSettled')}</strong>
            </div>`)
        + `<div style="margin-top:8px;font-size:11px;color:#666" dir="ltr">
            ${t('invoices.invoiceAmount')}: <strong>${fmtMoney((inv.totalAmount || 0))} DA</strong>
            ${paidAmount > 0 ? ` &nbsp;|&nbsp; ${t('invoices.cashReceived')}: <strong>${fmtMoney(paidAmount)} DA</strong>` : ''}
            ${(typeof inv.supExpense === 'number') ? ` &nbsp;|&nbsp; ${t('invoices.expenseRecorded')}: <strong>${fmtMoney(inv.supExpense)} DA</strong>` : ''}
          </div>`
        : (hasBuyDisc
          ? `<div class="inv-screen-only">${paidBlockHTML(netTotal, { afterDisc: true })}</div>
             <div class="inv-print-only" style="display:none">${paidBlockHTML(netTotal)}</div>`
          : paidBlockHTML(netTotal))}

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
  if (!inv) { alert(t('invoices.notFound')); return; }
  _invDetailId = invoiceId;
  _invPrintTotalBasis = 'net';

  const modal = document.getElementById('invDetailModal');
  if (!modal._host) modal._host = modal.parentNode;
  if (modal.parentNode !== document.body) document.body.appendChild(modal);
  const body = document.getElementById('invDetailBody');

  const isPayment = inv.type === 'payment';
  const paidAmount = isPayment ? (inv.totalAmount || 0) : DB.getInvoiceEffectivePaid(invoiceId);
  const invNum = inv.invoiceNumber || '—';
  const typeLabel = _invTypeLabel(inv);

  document.getElementById('invDetailTitle').innerHTML = `<i class="fas fa-file-invoice"></i> ${invNum}`;
  _renderInvDetailBody(inv, isPayment, paidAmount, invoiceId);

  const footer = document.getElementById('invDetailFooter');
  if (footer) {
    _invDetailFooterReadOnlyBackup = footer.innerHTML;
    const returnBtn = _invHasReturns(inv.id)
      ? `<button class="btn" onclick="if(window.ReturnInvoice)window.ReturnInvoice.print('${inv.id}')"><i class="fas fa-undo"></i> ${t('invoices.printReturnInvoice')}</button>`
      : '';
    footer.innerHTML = `<button class="btn" onclick="closeInvDetail()">${t('common.close')}</button>${returnBtn}<button class="btn btn-primary" onclick="printInvFromReadOnly()"><i class="fas fa-print"></i> ${t('common.print')}</button>`;
  }

  modal.style.display = 'flex';
}

// Elements carrying the 'inv-print-hide' class are shown on screen but stripped
// from every printed / PDF / emailed copy, so the paper stays clean (party
// balance, "merged from delivery notes" observation…). Payment vouchers keep
// their balance block — they have no such class.
function stripInvPrintHidden(html) {
  if (!html) return html;
  const src = String(html);
  if (src.indexOf('inv-print-hide') === -1 && src.indexOf('inv-print-only') === -1) return html;
  try {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    tmp.querySelectorAll('.inv-print-hide, .inv-screen-only').forEach(function (el) { el.remove(); });
    // Paper-only alternatives (e.g. the pre-discount total of a purchase
    // invoice) are kept in the DOM hidden so the same markup serves both views.
    tmp.querySelectorAll('.inv-print-only').forEach(function (el) { el.style.display = ''; });
    return tmp.innerHTML;
  } catch (e) { return html; }
}

// ===== "i" REVEAL: discount % and real cost of a purchase invoice =====
// The values stay in the DOM (so the hidden rows survive a re-render) but are
// only painted after the user presses "i"; printed/PDF copies strip them.
var _invBuySensitiveOn = false;

function _invHasBuySensitive(inv) {
  if (!inv || (inv.type !== 'supplier' && inv.type !== 'purchase')) return false;
  if ((parseFloat(inv.purchaseDiscountAmount) || 0) > 0) return true;
  if ((parseFloat(inv.purchaseProductDiscount) || 0) > 0) return true;
  return (inv.items || []).some(it =>
    (parseFloat(it.purchaseDiscountPct) || 0) > 0 || (parseFloat(it.realBuyPrice) || 0) > 0
  );
}

// ===== PRINTED TOTAL BASIS (discounted purchase invoices) =====
// The operator picks, at print time, whether the paper carries the total
// before the discount (200) or after it (190 + explicit remise lines).
// 'net' is the default because 190 is the money that actually left the
// supplier balance. The choice is reset every time the dialog opens.
var _invPrintTotalBasis = 'net';

function _invGrossTotal(inv) {
  if (!inv) return 0;
  const stored = parseFloat(inv.purchaseGross);
  if (isFinite(stored)) return stored;
  // Legacy invoice saved before purchaseGross existed: rebuild the quoted total
  // from the line prices (the gross buy price is what the line carries).
  const prodDisc = parseFloat(inv.purchaseProductDiscount) || 0;
  const globDisc = parseFloat(inv.purchaseDiscountAmount) || 0;
  if (prodDisc > 0.004 || globDisc > 0.004) {
    return (inv.items || []).reduce(function (s, it) {
      return s + (parseFloat(it.price) || 0) * (parseFloat(it.qty) || 0);
    }, 0);
  }
  return parseFloat(inv.totalAmount) || 0;
}

function _invHasBuyDiscount(inv) {
  if (!inv || (inv.type !== 'supplier' && inv.type !== 'purchase')) return false;
  const net = parseFloat(inv.totalAmount) || 0;
  return _invGrossTotal(inv) > net + 0.004;
}

function _invPrintBasisFor(inv) {
  return _invHasBuyDiscount(inv) && _invPrintTotalBasis === 'gross' ? 'gross' : 'net';
}

function _syncInvPrintBasisUI() {
  document.querySelectorAll('input[name="invPrintTotalBasis"]').forEach(function (r) {
    r.checked = (r.value === _invPrintTotalBasis);
  });
  const hint = document.getElementById('invPrintTotalHint');
  if (hint) {
    hint.textContent = t(_invPrintTotalBasis === 'gross'
      ? 'invoices.printTotalHintGross'
      : 'invoices.printTotalHintNet');
  }
}

function setInvPrintTotalBasis(basis) {
  _invPrintTotalBasis = basis === 'gross' ? 'gross' : 'net';
  _syncInvPrintBasisUI();
}

function _syncInvBuyRevealUI() {
  document.body.classList.toggle('inv-buy-reveal', !!_invBuySensitiveOn);
  const btn = document.getElementById('invBuyRevealBtn');
  if (btn) {
    btn.classList.toggle('is-on', !!_invBuySensitiveOn);
    btn.setAttribute('aria-pressed', _invBuySensitiveOn ? 'true' : 'false');
  }
}

function toggleInvBuySensitive(force) {
  _invBuySensitiveOn = (force === undefined) ? !_invBuySensitiveOn : !!force;
  _syncInvBuyRevealUI();
  return _invBuySensitiveOn;
}

function _injectInvBuyRevealButton(inv) {
  const old = document.getElementById('invBuyRevealBtn');
  if (old) old.remove();
  const footer = document.getElementById('invDetailFooter');
  if (!footer || !_invHasBuySensitive(inv)) return;
  const btn = document.createElement('button');
  btn.id = 'invBuyRevealBtn';
  btn.type = 'button';
  btn.className = 'inv-buy-reveal-btn' + (_invBuySensitiveOn ? ' is-on' : '');
  btn.textContent = 'i';
  btn.title = t('invoices.buyRevealTitle');
  btn.setAttribute('aria-pressed', _invBuySensitiveOn ? 'true' : 'false');
  btn.onclick = function () { toggleInvBuySensitive(); };
  footer.insertBefore(btn, footer.firstChild);
}

// The "i" key toggles the hidden cost detail of whichever purchase view is open.
// Capture phase + stopPropagation keeps it from also opening product details.
document.addEventListener('keydown', function (e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code !== 'KeyI' && e.key !== 'i' && e.key !== 'I') return;
  const tgt = e.target;
  if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT' || tgt.isContentEditable)) return;
  const purModal = document.getElementById('invPurModal');
  const detModal = document.getElementById('invDetailModal');
  const purOpen = !!purModal && purModal.style.display !== 'none';
  const detOpen = !!detModal && detModal.style.display === 'flex';
  if (!purOpen && !detOpen) return;
  e.preventDefault();
  e.stopPropagation();
  if (purOpen) togglePurSensitive();
  else toggleInvBuySensitive();
}, true);

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
    }
    /* The business logo is a colour image with an inline grayscale(0%) filter;
       in N&B mode the filter is re-asserted at 100% so the printed watermark is
       a true grey. Opacity is preserved (it is what makes it a watermark). */
    #invDetailPrintArea img.zmt-doc-logo, #invEmpPrintArea img.zmt-doc-logo, #invoicePrintArea img.zmt-doc-logo {
      filter:grayscale(100%) !important;
    }`;
}

function openPrintWindow(title, bodyHtml, mode) {
  const win = window.open('', '', 'width=800,height=600');
  if (!win) { alert(t('invoices.allowPopups')); return; }
  const styles = document.querySelectorAll('link[rel="stylesheet"], style');
  let sh = '';
  styles.forEach(s => sh += s.outerHTML);
  const bw = mode === 'bw' ? invBwCss() : '';
  const ppRule = (typeof PrintPaper !== 'undefined' && PrintPaper) ? PrintPaper.pageRule(10) : '@page{margin:10mm;size:A4}';
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + title + '</title>' + sh + '<style>' + ppRule + 'body{margin:0;padding:0;font-family:"Segoe UI","Helvetica Neue",Arial,sans-serif}*{box-sizing:border-box}@media print{body{margin:0;padding:0}}' + bw + '</style></head><body>' + bodyHtml + '<script>window.print();window.close();<\/script></body></html>');
  win.document.close();
}

// The exact sheet the printer gets, shown on screen first: same markup, same
// styles, same N&B override — but instead of firing the printer and closing
// itself it carries a toolbar (طباعة / إغلاق) that disappears from the printout.
function openInvoicePreview(title, bodyHtml, mode) {
  const win = window.open('', '', 'width=900,height=700');
  if (!win) { alert(t('invoices.allowPopups')); return; }
  const styles = document.querySelectorAll('link[rel="stylesheet"], style');
  let sh = '';
  styles.forEach(s => sh += s.outerHTML);
  const bw = mode === 'bw' ? invBwCss() : '';
  const ppRule = (typeof PrintPaper !== 'undefined' && PrintPaper) ? PrintPaper.pageRule(10) : '@page{margin:10mm;size:A4}';
  const previewW = (typeof PrintPaper !== 'undefined' && PrintPaper) ? PrintPaper.previewWidthCss() : '210mm';
  const bar = '<div class="zmt-preview-bar">' +
    '<span class="zmt-preview-title">' + escHtml(title || '') + '</span>' +
    '<span class="zmt-preview-note">' + t('invoices.previewNote') + '</span>' +
    '<button type="button" class="zmt-preview-btn zmt-preview-print" onclick="window.print()">' + t('invoices.print') + '</button>' +
    '<button type="button" class="zmt-preview-btn" onclick="window.close()">' + t('common.close') + '</button>' +
    '</div>';
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + escHtml(title || '') + '</title>' + sh +
    '<style>' + ppRule + 'body{margin:0;padding:0;font-family:"Segoe UI","Helvetica Neue",Arial,sans-serif}' +
    '*{box-sizing:border-box}' +
    '.zmt-preview-bar{position:sticky;top:0;z-index:9;display:flex;align-items:center;gap:10px;padding:10px 16px;background:#263238;color:#fff;box-shadow:0 1px 4px rgba(0,0,0,.3)}' +
    '.zmt-preview-title{font-weight:700;font-size:14px}' +
    '.zmt-preview-note{font-size:12px;opacity:.75;flex:1}' +
    '.zmt-preview-btn{cursor:pointer;border:1px solid #546e7a;background:#37474f;color:#fff;border-radius:4px;padding:6px 14px;font-size:13px}' +
    '.zmt-preview-print{background:#1e88e5;border-color:#1e88e5;font-weight:700}' +
    '#zmtPreviewSheet{background:#fff;max-width:' + previewW + ';margin:14px auto;box-shadow:0 2px 10px rgba(0,0,0,.25)}' +
    '@media print{.zmt-preview-bar{display:none!important}body{background:#fff}#zmtPreviewSheet{max-width:none;margin:0;box-shadow:none}}' +
    bw + '</style></head><body>' + bar +
    '<div id="zmtPreviewSheet">' + bodyHtml + '</div></body></html>');
  win.document.close();
}

// Preview of the invoice currently open in the detail modal — rebuilt from the
// record exactly like printInvFromDetail, so what is on screen is what prints.
// `_invPrintTotalBasis` carries the total chosen in the print dialog: a
// discounted purchase invoice previews «after» (190) or «before» (200) discount.
function previewInvFromDetail() {
  withInvoiceLogo(function () {
    const inv = DB.getInvoice(_invDetailId);
    if (!inv) return;
    const isPayment = inv.type === 'payment';
    const paidAmount = isPayment ? (inv.totalAmount || 0) : DB.getInvoiceEffectivePaid(_invDetailId);
    const body = document.getElementById('invDetailBody');
    if (body) body.innerHTML = isPayment
      ? buildPaymentInvoiceHTML(inv)
      : buildInvoiceDetailHTML(inv, _invTypeLabel(inv), paidAmount, { printBasis: _invPrintBasisFor(inv) });
    const content = document.getElementById('invDetailPrintArea');
    if (!content) return;
    openInvoicePreview((t('invoices.invoiceDetails') || 'Facture') + ' ' + t('invoices.routePreviewSuffix'), stripInvPrintHidden(content.outerHTML));
  });
}

// `mode`: 'color' (default) or 'bw' (أبيض وأسود) — chosen in the print dialog.
function printInvFromDetail(mode) {
  // Warm the logo first, then rebuild the body from the record so the printed
  // copy carries the same header as the screen — the data URL is fetched
  // asynchronously at startup and may not have been ready when the modal opened.
  withInvoiceLogo(function () {
    const inv = DB.getInvoice(_invDetailId);
    if (inv) {
      const isPayment = inv.type === 'payment';
      const paidAmount = isPayment ? (inv.totalAmount || 0) : DB.getInvoiceEffectivePaid(_invDetailId);
      const body = document.getElementById('invDetailBody');
      if (body) body.innerHTML = isPayment
        ? buildPaymentInvoiceHTML(inv)
        : buildInvoiceDetailHTML(inv, _invTypeLabel(inv), paidAmount, { printBasis: _invPrintBasisFor(inv) });
    }
    const content = document.getElementById('invDetailPrintArea');
    if (!content) return;
    openPrintWindow(t('invoices.invoiceDetails') || 'Facture', stripInvPrintHidden(content.outerHTML), mode);
  });
}

// Read-only viewers (discounts page, store debts) print straight away — except
// for a discounted purchase invoice, where the print dialog offers the two
// totals. Pages that don't host the dialog fall back to the net copy.
function printInvFromReadOnly() {
  const inv = DB.getInvoice(_invDetailId);
  if (_invHasBuyDiscount(inv) && document.getElementById('invPrintChoiceModal')) {
    openInvPrintChoice();
    return;
  }
  printInvFromDetail();
}

// Refresh the inlined logo data URL, then run the print callback. Kept separate
// so every entry point (screen print, employee sheet, PDF, email) draws the
// exact same header. A failure just prints without the logo.
function withInvoiceLogo(fn) {
  const L = (typeof window.InvoiceLogo !== 'undefined') ? window.InvoiceLogo : null;
  if (!L || !L.isEnabled()) { fn(); return; }
  Promise.resolve(L.warm()).then(fn).catch(function () { fn(); });
}

function openInvPrintChoice() {
  const inv = DB.getInvoice(_invDetailId);
  if (!inv) return;
  const m = document.getElementById('invPrintChoiceModal');
  // Pages that host only the injected detail modal (no invoices.html) have no
  // print dialog: print straight away rather than dead-ending the button.
  if (!m) { printInvFromDetail(); return; }
  if (!m._host) m._host = m.parentNode;
  if (m.parentNode !== document.body) document.body.appendChild(m);
  const empBtn = document.getElementById('invPrintEmployeeBtn');
  if (empBtn) empBtn.style.display = (inv.type === 'purchase' || inv.type === 'supplier') ? 'flex' : 'none';
  const routeBtn = document.getElementById('invPrintRouteBtn');
  if (routeBtn) routeBtn.style.display = inv.type === 'customer' ? 'flex' : 'none';
  // Total basis — only for a purchase invoice carrying a discount. Default is
  // the net (190): the amount that actually moved on the supplier balance.
  _invPrintTotalBasis = 'net';
  const totalBlock = document.getElementById('invPrintTotalBlock');
  if (totalBlock) totalBlock.style.display = _invHasBuyDiscount(inv) ? 'block' : 'none';
  const netVal = document.getElementById('invPrintTotalNetVal');
  if (netVal) netVal.textContent = 'DA' + fmtMoney(parseFloat(inv.totalAmount) || 0);
  const grossVal = document.getElementById('invPrintTotalGrossVal');
  if (grossVal) grossVal.textContent = 'DA' + fmtMoney(_invGrossTotal(inv));
  _syncInvPrintBasisUI();
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
  withInvoiceLogo(function () {
    const html = buildEmployeePrintHTML(inv);
    openPrintWindow(t('invoices.employeeDocTitle') || 'Bon de préparation', html);
  });
}

// ===== ROUTE DOCS (bon de route — printed as «FACTURE») =====
// A cosmetic copy of a sale invoice. It lives in the `routeDocs` store, not in
// `invoices`, so no sales report, stock level, customer balance or net-account
// figure can see it. Every money figure is one fixed share of the original:
// the operator sets the share (default 58 % deducted → 42 % kept) in the
// invoices page header, behind the manager password.
//
// The doc always totals itself from its own lines (routeDocTotal), so the
// editor, the card and the printed sheet can never disagree.

var ROUTE_PCT_META = 'route_doc_pct';
var ROUTE_PCT_DEFAULT = 58;
var _rdEdit = null;
var _rdSearchTimer = null;
var _rdTab = 'invoices';

function routeDocPct() {
  let raw = null;
  try { raw = DB.getMeta(ROUTE_PCT_META); } catch (e) { raw = null; }
  const n = Number(raw);
  return (isFinite(n) && n >= 0 && n <= 100) ? n : ROUTE_PCT_DEFAULT;
}

function _rdRound(v) { return Math.round((Number(v) || 0) * 100) / 100; }

function _rdKeep(pct) {
  return Math.max(0, Math.min(1, (100 - (Number(pct) || 0)) / 100));
}

// subtotal − remise client % − remise globale. Same shape the sales engine uses,
// so a route doc reads like the invoice it was copied from.
function routeDocTotal(items, custDiscPct, extraDisc) {
  const sub = (items || []).reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
  const afterCust = sub * (1 - (Number(custDiscPct) || 0) / 100);
  return Math.max(0, _rdRound(afterCust - (Number(extraDisc) || 0)));
}

function _rdPartyName(inv) {
  if (inv.customerId) {
    const c = DB.getCustomers().find(x => x.id === inv.customerId);
    if (c) return c.name || '';
  }
  if (inv.supplierId) {
    const s = DB.getSuppliers().find(x => x.id === inv.supplierId);
    if (s) return s.name || '';
  }
  return inv.walkinName || '';
}

function buildRouteDocFromInvoice(inv, pct) {
  const keep = _rdKeep(pct);
  const items = (inv.items || []).map(function (it) {
    return {
      productId: it.productId || '',
      name: it.name || '',
      barcode: it.barcode || '',
      unit: it.unit || '',
      unitLabel: it.unitLabel || '',
      qty: Number(it.qty) || 0,
      price: _rdRound((Number(it.price) || 0) * keep),
    };
  });
  const paid = DB.getInvoiceEffectivePaid(inv) || 0;
  const wantTotal = _rdRound((Number(inv.totalAmount) || 0) * keep);
  const cdPct = Number(inv.customerDiscount) || 0;
  // A single «remise globale» absorbs whatever the scaled lines still overshoot
  // the scaled invoice total, so the doc adds up to exactly that figure.
  const gross = items.reduce((s, it) => s + it.price * it.qty, 0) * (1 - cdPct / 100);
  const extra = Math.max(0, _rdRound(gross - wantTotal));
  return {
    refInvoiceId: inv.id,
    refInvoiceNumber: inv.invoiceNumber || '',
    customerId: inv.customerId || '',
    supplierId: inv.supplierId || '',
    partyName: _rdPartyName(inv),
    walkinName: inv.walkinName || '',
    items: items,
    customerDiscount: cdPct,
    extraDiscount: extra,
    paidAmount: _rdRound(paid * keep),
    totalAmount: routeDocTotal(items, cdPct, extra),
    pct: Number(pct) || 0,
    note: inv.note || '',
  };
}

// One click must yield exactly one document. Both the card button and the print
// menu call this, so a double-fired click (or an operator pressing it twice by
// accident) used to mint a second BR- number for the same invoice. A copy that
// is still byte-identical to what this invoice would produce — same percentage,
// same lines, same money — is reopened instead of duplicated; anything the
// operator has edited, or a different percentage, still makes a new document.
function _rdSignature(rd) {
  const items = (rd.items || []).map(function (it) {
    return [it.productId || '', String(it.name || '').trim(), Number(it.qty) || 0, Number(it.price) || 0].join(':');
  }).join('|');
  return [rd.refInvoiceId || '', rd.pct || 0, items, rd.customerDiscount || 0, rd.extraDiscount || 0,
          rd.totalAmount || 0, rd.paidAmount || 0].join('#');
}

function invCopyToRouteDoc(invId) {
  const inv = DB.getInvoice(invId || _invDetailId);
  if (!inv) { invToast(t('invoices.notFound'), 'error'); return; }
  if (inv.type !== 'customer') { invToast(t('invoices.routeOnlySales'), 'error'); return; }
  const pct = routeDocPct();
  const cand = buildRouteDocFromInvoice(inv, pct);
  const sig = _rdSignature(cand);
  const same = (DB.getRouteDocs() || []).find(function (rd) { return _rdSignature(rd) === sig; });
  if (same) {
    refreshInvoiceList();
    switchInvTab('routes');
    invToast(t('invoices.routeExists').replace('{NUM}', same.routeNumber || ''), 'success');
    openRouteDocEditor(same.id);
    return;
  }
  const rd = DB.addRouteDoc(cand);
  refreshInvoiceList();
  switchInvTab('routes');
  invToast(t('invoices.routeCreated').replace('{NUM}', rd.routeNumber), 'success');
  openRouteDocEditor(rd.id);
}

// The printer only knows invoices; a route doc is handed to it as a read-only
// stand-in so the A4 sheet is byte-identical to a sale invoice except for the
// «FACTURE» heading and its own BR- number.
function _rdFakeInvoice(rd) {
  return {
    id: rd.id,
    type: 'customer',
    invoiceNumber: rd.routeNumber,
    createdAt: rd.createdAt,
    items: rd.items || [],
    totalAmount: rd.totalAmount || 0,
    customerId: rd.customerId || '',
    supplierId: rd.supplierId || '',
    customerDiscount: rd.customerDiscount || 0,
    extraDiscount: rd.extraDiscount || 0,
    note: rd.note || '',
    walkinName: rd.walkinName || '',
    walkinPhone: '',
    walkinAddress: '',
  };
}

function printRouteDoc(id, mode) {
  const rd = DB.getRouteDoc(id);
  if (!rd) { invToast(t('invoices.routeNotFound'), 'error'); return; }
  withInvoiceLogo(function () {
    const html = buildInvoiceDetailHTML(_rdFakeInvoice(rd), 'FACTURE', Number(rd.paidAmount) || 0);
    openPrintWindow(rd.routeNumber || 'Facture', stripInvPrintHidden(html), mode);
  });
}

function previewRouteDoc(id) {
  const rd = DB.getRouteDoc(id);
  if (!rd) { invToast(t('invoices.routeNotFound'), 'error'); return; }
  withInvoiceLogo(function () {
    const html = buildInvoiceDetailHTML(_rdFakeInvoice(rd), 'FACTURE', Number(rd.paidAmount) || 0);
    openInvoicePreview((rd.routeNumber || 'Facture') + ' ' + t('invoices.routePreviewSuffix'), stripInvPrintHidden(html));
  });
}

// Preview of the editor's current content: saved first so the sheet on screen is
// the saved document, then shown before anything goes to the printer.
function rdSaveAndPreview() {
  const id = _rdEdit ? _rdEdit.id : '';
  saveRouteDocEditor();
  if (id) previewRouteDoc(id);
}

// Same capture-then-close order: saving clears _rdEdit, so the id must be read
// before it, or the print call would run with an empty id.
function rdSaveAndPrint() {
  const id = _rdEdit ? _rdEdit.id : '';
  saveRouteDocEditor();
  if (id) printRouteDoc(id);
}

function deleteRouteDocConfirm(id) {
  const rd = DB.getRouteDoc(id);
  if (!rd) return;
  if (!confirm(t('invoices.deleteRouteConfirm').replace('{NUM}', rd.routeNumber))) return;
  DB.deleteRouteDoc(id);
  refreshInvoiceList();
  invToast(t('invoices.routeDeleted'), 'success');
}

// ===== ROUTE DOCS TAB =====

function switchInvTab(tab) {
  _rdTab = tab === 'routes' ? 'routes' : 'invoices';
  const routes = _rdTab === 'routes';
  const t1 = document.getElementById('invTabInvoices');
  const t2 = document.getElementById('invTabRoutes');
  if (t1) t1.classList.toggle('is-active', !routes);
  if (t2) t2.classList.toggle('is-active', routes);
  const hide = ['invFiltersBar', 'invResultsInfo', 'allInvoicesList', 'invPagination'];
  hide.forEach(function (i) {
    const el = document.getElementById(i);
    if (el) el.style.display = routes ? 'none' : (i === 'invPagination' ? 'none' : '');
  });
  const rl = document.getElementById('routeDocList');
  if (rl) rl.style.display = routes ? '' : 'none';
  if (routes) renderRouteDocList();
}

function renderRouteDocList() {
  const box = document.getElementById('routeDocList');
  const count = document.getElementById('invRouteCount');
  if (!box) return;
  const docs = (DB.getRouteDocs() || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (count) count.textContent = String(docs.length);
  if (!docs.length) {
    box.innerHTML = `<div class="rd-empty"><i class="fas fa-truck-fast" style="font-size:34px;display:block;margin-bottom:10px;opacity:.45"></i>${t('invoices.noRouteDocs')}</div>`;
    return;
  }
  box.innerHTML = docs.map(function (rd) {
    const paid = Number(rd.paidAmount) || 0;
    const tot = Number(rd.totalAmount) || 0;
    const date = rd.createdAt ? new Date(rd.createdAt).toLocaleDateString('fr-DZ', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
    return `<div class="rd-card">
      <div class="rd-meta">
        <div class="rd-num">${escHtml(rd.routeNumber || '—')} <span class="rd-badge">${t('invoices.formalCopy')}</span></div>
        <div class="rd-ref">${t('invoices.fromInvoice')} ${escHtml(rd.refInvoiceNumber || '—')} · ${date} · ${escHtml(t('invoices.seller'))}: ${escHtml(rd.operatorName || '')}</div>
        <div class="rd-party">${escHtml(rd.partyName || rd.walkinName || t('invoices.cashCustomer'))}</div>
      </div>
      <div class="rd-tot">DA${fmtMoney(tot)}${paid > 0 ? `<div style="font-size:11px;font-weight:600;color:#2e7d32">${t('invoices.paidPrefix')} DA${fmtMoney(paid)}</div>` : ''}</div>
      <div class="rd-acts">
        <button type="button" class="rd-act" title="${t('invoices.preview')}" aria-label="${t('invoices.preview')}" onclick="previewRouteDoc('${rd.id}')">${_invActionIcon('eye')}</button>
        <button type="button" class="rd-act" title="${t('invoices.edit')}" aria-label="${t('invoices.edit')}" onclick="openRouteDocEditor('${rd.id}')">${_invActionIcon('edit')}</button>
        <button type="button" class="rd-act" title="${t('invoices.print')}" aria-label="${t('invoices.print')}" onclick="printRouteDoc('${rd.id}')">${_invActionIcon('print')}</button>
        <button type="button" class="rd-act rd-act-danger" title="${t('invoices.delete')}" aria-label="${t('invoices.delete')}" onclick="deleteRouteDocConfirm('${rd.id}')">${_invActionIcon('delete')}</button>
      </div>
    </div>`;
  }).join('');
}

// ===== ROUTE DOC EDITOR =====

function _ensureRouteDocModal() {
  let m = document.getElementById('routeDocModal');
  if (m) return m;
  m = document.createElement('div');
  m.id = 'routeDocModal';
  m.className = 'modal-overlay';
  m.style.zIndex = '100004';
  m.onclick = function (e) { if (e.target === m) closeRouteDocEditor(); };
  m.innerHTML = `<div class="modal rd-modal">
    <div class="modal-header">
      <h3><i class="fas fa-truck-fast" style="color:#5c6bc0"></i> ${t('invoices.routeDocTitle')} <span id="rdModalNum">—</span></h3>
      <button class="modal-close" onclick="closeRouteDocEditor()" aria-label="${t('common.close')}">&times;</button>
    </div>
    <div class="modal-body" style="max-height:66vh;overflow:auto">
      <div class="rd-hint" id="rdModalHint"></div>
      <div class="rd-row-head" style="margin-top:8px"><span>${t('invoices.colLabel')}</span><span>${t('common.qty')}</span><span>${t('invoices.sellPriceLabel')}</span><span>${t('common.total')}</span><span></span></div>
      <div class="rd-form" id="rdRows"></div>
      <div style="padding:0 16px 10px">
        <div class="search-bar" style="margin:0">
          <i class="fas fa-search"></i>
          <input type="text" id="rdProductSearch" placeholder="${t('invoices.searchProductToAdd')}" oninput="rdProductSearch()" autocomplete="off">
        </div>
        <div id="rdProductResults" class="search-results" style="display:none"></div>
      </div>
      <div class="rd-form">
        <div class="rd-row" style="grid-template-columns:1fr 110px 110px 120px">
          <span class="rd-hint">${t('invoices.discountHint')}</span>
          <input type="number" id="rdCustDisc" step="0.01" min="0" max="100" oninput="rdRecalc()" value="0">
          <input type="number" id="rdExtraDisc" step="0.01" min="0" oninput="rdRecalc()" value="0">
          <input type="number" id="rdPaid" step="0.01" min="0" oninput="rdRecalc()" value="0">
        </div>
        <div class="rd-row" style="grid-template-columns:1fr">
          <input type="text" id="rdNote" placeholder="${t('invoices.notePh')}" oninput="rdRecalc()">
        </div>
        <div class="rd-sum"><span>${t('invoices.routeNet')}</span><span id="rdTotalLabel" dir="ltr">DA 0,00</span></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeRouteDocEditor()">${t('common.cancel')}</button>
      <button class="btn" onclick="rdSaveAndPreview()"><i class="fas fa-eye"></i> ${t('invoices.savePreview')}</button>
      <button class="btn btn-primary" onclick="saveRouteDocEditor()"><i class="fas fa-check"></i> ${t('common.save')}</button>
      <button class="btn btn-success" onclick="rdSaveAndPrint()"><i class="fas fa-print"></i> ${t('invoices.savePrint')}</button>
    </div>
  </div>`;
  document.body.appendChild(m);
  return m;
}

function openRouteDocEditor(id) {
  const rd = DB.getRouteDoc(id);
  if (!rd) { invToast(t('invoices.routeNotFound'), 'error'); return; }
  _rdEdit = {
    id: rd.id,
    routeNumber: rd.routeNumber,
    refInvoiceNumber: rd.refInvoiceNumber,
    pct: rd.pct,
    items: (rd.items || []).map(it => Object.assign({}, it)),
    customerDiscount: Number(rd.customerDiscount) || 0,
    extraDiscount: Number(rd.extraDiscount) || 0,
    paidAmount: Number(rd.paidAmount) || 0,
    note: rd.note || '',
  };
  const m = _ensureRouteDocModal();
  m.style.display = 'flex';
  document.getElementById('rdModalNum').textContent = rd.routeNumber || '—';
  document.getElementById('rdModalHint').textContent =
    t('invoices.formalCopyNote')
      .replace('{NUM}', rd.refInvoiceNumber || '—')
      .replace('{PCT}', String(100 - (Number(rd.pct) || 0)));
  document.getElementById('rdCustDisc').value = _rdEdit.customerDiscount;
  document.getElementById('rdExtraDisc').value = _rdEdit.extraDiscount;
  document.getElementById('rdPaid').value = _rdEdit.paidAmount;
  document.getElementById('rdNote').value = _rdEdit.note;
  const res = document.getElementById('rdProductResults');
  if (res) { res.style.display = 'none'; res.innerHTML = ''; }
  const si = document.getElementById('rdProductSearch');
  if (si) si.value = '';
  renderRouteDocRows();
}

function closeRouteDocEditor() {
  const m = document.getElementById('routeDocModal');
  if (m) m.style.display = 'none';
  _rdEdit = null;
}

function renderRouteDocRows() {
  const box = document.getElementById('rdRows');
  if (!box || !_rdEdit) return;
  box.innerHTML = _rdEdit.items.map(function (it, i) {
    return `<div class="rd-row">
      <input type="text" value="${escHtml(it.name || '')}" onchange="rdSetField(${i},'name',this.value)" placeholder="${t('invoices.productNamePh')}">
      <input type="number" step="any" min="0" value="${it.qty}" onchange="rdSetField(${i},'qty',this.value)" dir="ltr">
      <input type="number" step="any" min="0" value="${it.price}" onchange="rdSetField(${i},'price',this.value)" dir="ltr">
      <div class="rd-total" dir="ltr">DA ${fmtMoney((Number(it.price) || 0) * (Number(it.qty) || 0))}</div>
      <button type="button" class="rd-act rd-act-danger" title="${t('invoices.deleteLineTitle')}" aria-label="${t('invoices.deleteLineTitle')}" onclick="rdRemoveRow(${i})">${_invActionIcon('delete')}</button>
    </div>`;
  }).join('');
  rdRecalc();
}

function rdSetField(i, field, value) {
  if (!_rdEdit || !_rdEdit.items[i]) return;
  _rdEdit.items[i][field] = (field === 'name') ? String(value || '') : (Number(value) || 0);
  renderRouteDocRows();
}

function rdRemoveRow(i) {
  if (!_rdEdit) return;
  _rdEdit.items.splice(i, 1);
  renderRouteDocRows();
}

function rdRecalc() {
  if (!_rdEdit) return;
  const lbl = document.getElementById('rdTotalLabel');
  if (lbl) lbl.textContent = 'DA ' + fmtMoney(routeDocTotal(_rdEdit.items, _rdEdit.customerDiscount, _rdEdit.extraDiscount));
}

function rdProductSearch() {
  if (_rdSearchTimer) clearTimeout(_rdSearchTimer);
  _rdSearchTimer = setTimeout(renderRdProductSearch, 180);
}

function renderRdProductSearch() {
  const box = document.getElementById('rdProductResults');
  if (!box) return;
  const q = normSearch(document.getElementById('rdProductSearch').value || '');
  const all = DB.getProducts();
  const matches = q
    ? all.map(p => ({ p, score: productSearchScore(p.name, p.barcode, q, p.mark, p.reference, p.countryOfOrigin) }))
        .filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 10).map(x => x.p)
    : all.slice(0, 10);
  box.style.display = 'block';
  if (!matches.length) {
    box.innerHTML = `<div class="search-result-item disabled">${t('inventory.noResults')}</div>`;
    return;
  }
  const keep = _rdKeep(routeDocPct());
  box.innerHTML = matches.map(function (p) {
    const sell = Number(p.sellPrice) || Number(p.price) || 0;
    return `<div class="search-result-item" onclick="rdAddProduct('${p.id}')">
      <strong>${escHtml(p.name)}</strong>
      <span class="text-muted" dir="ltr">${escHtml(p.barcode || '')} | DA ${fmtMoney(_rdRound(sell * keep))}</span>
    </div>`;
  }).join('');
}

function rdAddProduct(pid) {
  if (!_rdEdit) return;
  const p = DB.getProducts().find(x => x.id === pid);
  if (!p) return;
  const keep = _rdKeep(routeDocPct());
  _rdEdit.items.push({
    productId: p.id,
    name: p.name || '',
    barcode: p.barcode || '',
    unit: p.unit || '',
    unitLabel: p.unitLabel || '',
    qty: 1,
    price: _rdRound((Number(p.sellPrice) || Number(p.price) || 0) * keep),
  });
  const box = document.getElementById('rdProductResults');
  if (box) { box.style.display = 'none'; box.innerHTML = ''; }
  renderRouteDocRows();
}

function saveRouteDocEditor() {
  if (!_rdEdit) return;
  const cd = Number(document.getElementById('rdCustDisc').value) || 0;
  const ex = Number(document.getElementById('rdExtraDisc').value) || 0;
  const paid = Number(document.getElementById('rdPaid').value) || 0;
  const items = _rdEdit.items.filter(it => (String(it.name || '').trim() !== '') && (Number(it.qty) || 0) > 0);
  if (!items.length) { invToast(t('invoices.routeNeedsLine'), 'error'); return; }
  DB.updateRouteDoc(_rdEdit.id, {
    items: items,
    customerDiscount: cd,
    extraDiscount: ex,
    paidAmount: Math.max(0, paid),
    note: document.getElementById('rdNote').value || '',
    totalAmount: routeDocTotal(items, cd, ex),
  });
  renderRouteDocList();
  closeRouteDocEditor();
  invToast(t('invoices.routeSaved'), 'success');
}

// ===== ROUTE DOC PRICING SETTING (manager password) =====

var _rdCfgUnlocked = false;

function _rdCfgModal(html) {
  let m = document.getElementById('routeDocCfgModal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'routeDocCfgModal';
    m.className = 'modal-overlay';
    m.style.zIndex = '100004';
    m.onclick = function (e) { if (e.target === m) closeRouteDocSettings(); };
    document.body.appendChild(m);
  }
  m.innerHTML = html;
  m.style.display = 'flex';
  return m;
}

function closeRouteDocSettings() {
  const m = document.getElementById('routeDocCfgModal');
  if (m) m.style.display = 'none';
}

function openRouteDocSettings() {
  if (_rdCfgUnlocked) { _rdCfgForm(); return; }
  _rdCfgModal(`<div class="modal" style="max-width:400px">
    <div class="modal-header">
      <h3><i class="fas fa-lock"></i> ${t('invoices.routeCfgTitle')}</h3>
      <button class="modal-close" onclick="closeRouteDocSettings()">&times;</button>
    </div>
    <div class="modal-body">
      <div class="rd-lock">
        <label class="ms-label" for="rdCfgPass">${t('invoices.managerPassword')}</label>
        <input id="rdCfgPass" class="form-input" type="password" autocomplete="off" onkeydown="if(event.key==='Enter')rdCfgUnlockDo()">
        <div id="rdCfgError" style="color:#ff6b6b;font-size:12px;display:none">${t('invoices.wrongPassword')}</div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button type="button" class="btn" onclick="closeRouteDocSettings()">${t('common.cancel')}</button>
          <button type="button" class="btn btn-primary" onclick="rdCfgUnlockDo()">${t('invoices.enterLabel')}</button>
        </div>
      </div>
    </div>
  </div>`);
  const inp = document.getElementById('rdCfgPass');
  if (inp) setTimeout(() => inp.focus(), 60);
}

async function rdCfgUnlock(password) {
  const stored = (typeof Auth !== 'undefined' && Auth.getStorePassword) ? (Auth.getStorePassword() || '') : '';
  if (stored) return (password || '') === stored;
  if (typeof Auth !== 'undefined' && typeof Auth.verifyLocalPassword === 'function' && typeof Auth.getUserCode === 'function') {
    try { return await Auth.verifyLocalPassword(Auth.getUserCode(), password || ''); } catch (e) { return false; }
  }
  return false;
}

async function rdCfgUnlockDo() {
  const inp = document.getElementById('rdCfgPass');
  const ok = await rdCfgUnlock(inp ? inp.value : '');
  const err = document.getElementById('rdCfgError');
  if (!ok) { if (err) err.style.display = 'block'; if (inp) inp.select(); return; }
  _rdCfgUnlocked = true;
  _rdCfgForm();
}

function _rdCfgForm() {
  const pct = routeDocPct();
  _rdCfgModal(`<div class="modal" style="max-width:440px">
    <div class="modal-header">
      <h3><i class="fas fa-percent"></i> ${t('invoices.routeCfgTitle')}</h3>
      <button class="modal-close" onclick="closeRouteDocSettings()">&times;</button>
    </div>
    <div class="modal-body">
      <div class="rd-lock" style="max-width:none">
        <label class="ms-label" for="rdCfgPct">${t('invoices.pctLabel')}</label>
        <input id="rdCfgPct" class="form-input rd-pct" type="number" step="0.5" min="0" max="100" value="${pct}" oninput="rdCfgPreview()" dir="ltr">
        <div class="rd-hint" id="rdCfgHint"></div>
        <div class="rd-hint">${t('invoices.pctExample').replace('{VAL}', fmtMoney(200 * _rdKeep(58)))}</div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
          <button type="button" class="btn" onclick="closeRouteDocSettings()">${t('common.cancel')}</button>
          <button type="button" class="btn btn-primary" onclick="rdCfgSaveDo()">${t('common.save')}</button>
        </div>
      </div>
    </div>
  </div>`);
  rdCfgPreview();
}

function rdCfgPreview() {
  const el = document.getElementById('rdCfgPct');
  const hint = document.getElementById('rdCfgHint');
  if (!el || !hint) return;
  const raw = Number(el.value);
  const pct = (isFinite(raw) && raw >= 0 && raw <= 100) ? raw : ROUTE_PCT_DEFAULT;
  hint.textContent = t('invoices.pctRemainHint')
    .replace('{PCT}', String(_rdRound(100 - pct)))
    .replace('{VAL}', fmtMoney(_rdRound(200 * _rdKeep(pct))));
}

function rdCfgSaveDo() {
  const el = document.getElementById('rdCfgPct');
  const raw = Number(el ? el.value : NaN);
  if (!isFinite(raw) || raw < 0 || raw > 100) { invToast(t('invoices.invalidPct'), 'error'); return; }
  DB.setMeta(ROUTE_PCT_META, _rdRound(raw));
  closeRouteDocSettings();
  invToast(t('invoices.pctSaved').replace('{PCT}', String(_rdRound(raw))), 'success');
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
        <td style="padding:7px 10px;border:1px solid #eee;text-align:center;font-size:12px;color:#333">${Unit.qtyUnit(qte, item)}</td>
      </tr>`;
  }).join('');

  return `
    <div id="invEmpPrintArea" style="padding:30px 35px;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#222;direction:ltr;text-align:left" dir="ltr">
      ${buildDocHeaderRow(
        `<div style="font-size:20px;font-weight:900;color:#1a1a1a;text-transform:uppercase;letter-spacing:1px">${escHtml(store.name)}</div>
            ${store.address ? `<div style="font-size:11px;color:#555;margin-top:4px">${escHtml(store.address)}</div>` : ''}
            ${store.phone ? `<div style="font-size:11px;color:#555">Tél: ${escHtml(store.phone)}</div>` : ''}
            ${storeLegalLineHTML(inv, 'employee')}`,
        `<div style="font-size:24px;font-weight:900;color:#1a1a1a;text-transform:uppercase;letter-spacing:2px">BON DE PRÉPARATION</div>
            <div style="font-size:14px;font-weight:700;color:#333;margin-top:6px">N° ${inv.invoiceNumber || '—'}</div>
            <div style="font-size:11px;color:#555;margin-top:4px;line-height:1.6">
              <div>Date: ${dateStr}</div>
              <div>Heure: ${timeStr}</div>
            </div>`
      )}

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
            <div style="font-size:12px;color:#555">Total quantité: <strong>${Unit.fmtQty(totalQty)}</strong></div>
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
            <th style="padding:8px 10px;text-align:center;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:90px">Qté</th>
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
  const ctRow = document.getElementById('invPaySubRow');
  const ctSel = document.getElementById('invPaySubCustomer');
  if (ctSel && window.CustomerTree && inv.customerId && typeof window.CustomerTree.fillSelect === 'function') {
    const useful = window.CustomerTree.fillSelect(ctSel, inv.customerId, t('customerTree.none'));
    if (useful && typeof window.CustomerTree.selectInvoiceChild === 'function') {
      window.CustomerTree.selectInvoiceChild(ctSel, inv, inv.customerId);
    }
    if (ctRow) ctRow.style.display = useful ? '' : 'none';
  } else if (ctRow) ctRow.style.display = 'none';
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

  // Customer tree: tag only — the payment and balance stay on the parent.
  const ctMeta = (inv.customerId && window.CustomerTree)
    ? window.CustomerTree.metaFromSelect(document.getElementById('invPaySubCustomer'), DB.getCustomer(inv.customerId))
    : {};
  DB.addPayment({
    customerId: inv.customerId || undefined,
    ...ctMeta,
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
// A manually typed sale line (name / qty / price, no product card).
var _invEditFreeIdx = 0;
// Lines marked for removal by the quick-entry "add from scratch" mode
// (indices into inv.items). Applied (stock decrement + line drop) at save time.
var _invEditRemoved = [];
// Absolute qty values typed on existing lines before opening the quick-entry;
// reapplied on re-render so typed values survive the round-trip.
var _invEditPendingQty = null;
var _invEditQtySnapshot = null;
// Live total of the lines currently typed in the edit screen. The paid preview
// reads it so «المتبقي / رصيد دائن» moves with the quantities and prices.
var _invEditLiveTotal = 0;

// Bundle lines carry their component snapshot on the invoice row. The edit
// screen shows one return field per component so the customer can hand back a
// single item of the bundle without having to "un-buy" the whole bundle.
function _invEditBundleRowsHtml(item, i, showPrices) {
  if (!showPrices || typeof SaleCore === 'undefined' || !SaleCore.bundleHeldComponents) return '';
  if (!SaleCore.isBundleItem || !SaleCore.isBundleItem(item)) return '';
  const comps = SaleCore.bundleHeldComponents(DB, item);
  if (!comps.length) return '';
  const cols = 3 + (showPrices ? 3 : 0);
  return `<tr class="inv-bundle-comp-row">
    <td colspan="${cols}" style="padding:0 8px 10px">
      <div style="background:#f5f8ff;border:1px solid #d9e6ff;border-radius:8px;padding:8px 10px">
        <div style="font-size:11px;font-weight:700;color:var(--bmw-blue-1);margin-bottom:6px">
          <i class="fas fa-gift"></i> مكونات الباقة — إرجاع جزئي
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead><tr style="color:var(--silver-600)">
            <th style="text-align:right;padding:3px 5px">المكوّن</th>
            <th style="text-align:center;padding:3px 5px">المباع</th>
            <th style="text-align:center;padding:3px 5px">مرتجع سابقاً</th>
            <th style="text-align:center;padding:3px 5px">المتبقي</th>
            <th style="text-align:center;padding:3px 5px">إرجاع الآن</th>
          </tr></thead>
          <tbody>
            ${comps.map((c, j) => `<tr>
              <td style="padding:3px 5px">${escHtml(c.name || c.barcode || '')}</td>
              <td style="text-align:center;padding:3px 5px">${Unit.qtyUnit(c.soldQty, DB.getProduct(c.productId) || c)}</td>
              <td style="text-align:center;padding:3px 5px;color:${c.returnedQty > 0 ? '#e65100' : 'var(--silver-500)'};font-weight:${c.returnedQty > 0 ? '700' : '400'}">${Unit.qtyUnit(c.returnedQty, DB.getProduct(c.productId) || c)}</td>
              <td style="text-align:center;padding:3px 5px;font-weight:700">${Unit.qtyUnit(c.heldQty, DB.getProduct(c.productId) || c)}</td>
              <td style="text-align:center;padding:3px 5px">
                <input type="text" class="no-spinner num-input" inputmode="decimal" id="editCompReturn_${i}_${j}" value="0" min="0" step="any" ${c.heldQty <= 0 ? 'disabled ' : ''}oninput="updateInvEditTotals()" style="width:72px;text-align:center;padding:3px 6px;border:1px solid var(--silver-300);border-radius:4px;font-size:12px">
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </td>
  </tr>`;
}

// تحويل timestamp → 'YYYY-MM-DD' لحقل input type=date
function _invDateToInput(ts) {
  const d = new Date(ts || Date.now());
  if (!isFinite(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function _invInputToDate(s) {
  if (!s) return null;
  const t = new Date(s + 'T00:00:00').getTime();
  return isFinite(t) ? t : null;
}

function showPaymentDateEdit(inv) {
  inv = inv || DB.getInvoice(_invDetailId);
  if (!inv) return;
  _invDetailId = inv.id;
  const modal = document.getElementById('invDetailModal');
  // reuse invDetailBody
  const body = document.getElementById('invDetailBody');
  if (body) {
    body.innerHTML = `<div style="padding:20px;direction:rtl;text-align:right">
      <div style="font-size:14px;font-weight:700;margin-bottom:12px"><i class="fas fa-calendar-alt"></i> تعديل تاريخ سند القبض</div>
      <div style="margin-bottom:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <label style="font-size:13px;font-weight:600">التاريخ</label>
        <input type="date" id="payDateEdit" value="${_invDateToInput(inv.createdAt || inv.date)}" style="padding:6px 10px;border:1px solid var(--silver-300);border-radius:4px;font-size:13px">
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" onclick="savePaymentDateEdit()"><i class="fas fa-save"></i> حفظ</button>
        <button class="btn" onclick="showInvDetail('${inv.id}')">إلغاء</button>
      </div>
    </div>`;
  }
  const footer = document.getElementById('invDetailFooter');
  if (footer) footer.style.display = 'none';
  if (modal) modal.style.display = 'flex';
}

function savePaymentDateEdit() {
  if (!_invDetailId) return;
  const inv = DB.getInvoice(_invDetailId);
  if (!inv) return;
  const inp = document.getElementById('payDateEdit');
  const newTs = inp ? _invInputToDate(inp.value) : null;
  if (!newTs) { alert('تاريخ غير صحيح'); return; }
  DB.updateInvoice(_invDetailId, { createdAt: newTs, date: newTs, modifiedAt: Date.now() });
  // الدفعات المرتبطة (الموجودة الآن) تتبع التاريخ الجديد
  const allPmts = DB.getPayments();
  let chg = false;
  allPmts.forEach(p => { if (p.invoiceId === _invDetailId) { p.createdAt = newTs; chg = true; } });
  if (chg) DB.savePayments(allPmts);
  showInvDetail(_invDetailId);
  filterInvoices();
  alert(t('invoices.invoiceEdited'));
}

function showInvEditSection(keepStaged) {
  if (!_invDetailId) return;
  const inv = DB.getInvoice(_invDetailId);
  if (!inv || !inv.items || inv.items.length === 0) return;
  if (inv.type === 'payment') { showPaymentDateEdit(inv); return; }
  if (inv.type === 'transfer_receive') { alert(t('invoices.cannotEditReception')); return; }
  if (inv.type === 'transfer') { showTransferEditSection(inv); return; }
  if (inv.isProvisional && inv.type === 'waybill') { alert(t('invoices.cannotEditProformaWaybill')); return; }

  // سعر الوحدة والخصم قابلان للتعديل في فواتير العملاء وبيعات المورد (المبيعات)
  const showPrices = (inv.type === 'customer' || inv.type === 'sup_sale');
  const isPurFamily = inv.type === 'supplier' || inv.type === 'purchase';

  // المبلغ المدفوع قابل للتعديل في فواتير البيع للعميل وفواتير الشراء (مورد أو
  // بدون مورد). «بيع لمورد» يبقى كما هو. الدفعات هي المصدر الحقيقي للرصيد.
  const showPaid = (inv.type === 'customer' || inv.type === 'supplier' || inv.type === 'purchase');
  const paidNow = showPaid ? DB.getInvoicePaidAmount(_invDetailId) : 0;

  // keepStaged: re-render after returning from the "add from scratch"
  // quick-entry — the staged additions and removal markers must survive.
  if (!keepStaged) { _invEditNewItems = []; _invEditNewIdx = 0; _invEditFreeIdx = 0; _invEditRemoved = []; }

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
      <div style="margin-bottom:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
       <label style="font-size:13px;font-weight:600;color:var(--silver-700)"><i class="fas fa-calendar-alt"></i> تاريخ الفاتورة</label>
       <input type="date" id="editInvDate" value="${_invDateToInput(inv.createdAt || inv.date)}" style="padding:6px 10px;border:1px solid var(--silver-300);border-radius:4px;font-size:13px">
     </div>
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
          const rem = _invEditRemoved.includes(i);
          const canRemove = !isPurFamily && showPrices && !rem;
          return `
          <tr${rem ? ' style="opacity:.55"' : ''}>
            <td${rem ? ' style="text-decoration:line-through"' : ''}>${escHtml(item.name)}${item.isBundle ? ` <span style="font-size:10px;color:var(--bmw-blue-1);background:#eaf1ff;border-radius:4px;padding:1px 5px"><i class="fas fa-gift"></i> باقة</span>` : ''}${rem ? ` <button class="btn btn-sm" onclick="undoInvEditRemove(${i})" style="padding:1px 6px;font-size:10px;margin-right:6px"><i class="fas fa-undo"></i> ${t('invoices.qeUndoRemove')}</button>` : (canRemove ? ` <button class="btn btn-sm btn-danger" onclick="markInvEditRemove(${i})" title="${t('invoices.deleteLine')}" style="padding:1px 6px;font-size:10px;margin-right:6px"><i class="fas fa-trash"></i></button>` : '')}</td>
            <td style="text-align:center">${Unit.qtyUnit(item.qty, item)}</td>
            <td style="text-align:center">
              <input type="text" class="no-spinner num-input" inputmode="decimal" id="editQty_${i}" value="${Unit.fmtQty(item.qty, item.qtyDecimals)}" min="0" step="any" ${rem ? 'disabled ' : ''}oninput="updateInvEditTotals()" style="width:80px;text-align:center;padding:4px 8px;border:1px solid var(--silver-300);border-radius:4px;font-size:14px">
            </td>
            ${showPrices ? `
            <td style="text-align:center">
              <input type="text" class="no-spinner num-input" inputmode="decimal" id="editPrice_${i}" value="${item.price}" min="0" step="0.01" ${rem ? 'disabled ' : ''}oninput="updateInvEditTotals()" style="width:85px;text-align:center;padding:4px 8px;border:1px solid var(--silver-300);border-radius:4px;font-size:14px">
            </td>
            <td style="text-align:center">
              <input type="text" class="no-spinner num-input" inputmode="decimal" id="editDisc_${i}" value="0" min="0" step="0.01" ${rem ? 'disabled ' : ''}oninput="updateInvEditTotals()" style="width:80px;text-align:center;padding:4px 8px;border:1px solid var(--silver-300);border-radius:4px;font-size:14px">
            </td>
            <td style="text-align:center" id="editLineTotal_${i}">DA${fmtMoney(item.price * item.qty)}</td>` : ''}
          </tr>
          ${rem ? '' : _invEditBundleRowsHtml(item, i, showPrices)}`;
        }).join('')}
      </tbody>
    </table>
    ${showPrices ? `
    <div id="editTotalsBar" style="margin-top:12px;padding:10px 14px;background:#fff8e1;border:1px solid #ffe082;border-radius:8px;font-size:13px;font-weight:600;color:var(--silver-700)"></div>` : ''}
    ${showPaid ? `
    <div id="editPaidBar" style="margin-top:12px;padding:10px 14px;background:#eef7ee;border:1px solid #cde8cd;border-radius:8px">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <label style="font-size:13px;font-weight:600;color:var(--silver-700)"><i class="fas fa-money-bill-wave"></i> ${t('invoices.paidEditLabel')}</label>
        <input type="text" class="no-spinner num-input" inputmode="decimal" id="editPaidAmount" value="${Number(paidNow || 0).toFixed(2)}" oninput="updateInvEditPaidPreview()" dir="ltr" style="width:130px;text-align:center;padding:5px 8px;border:1px solid var(--silver-300);border-radius:4px;font-size:14px">
        <div id="editPaidPreview" style="font-size:12px;font-weight:600;color:var(--silver-600)"></div>
      </div>
      <div style="font-size:11px;color:var(--silver-500);margin-top:6px">${t('invoices.paidEditHint')}</div>
    </div>` : ''}
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
      ${showPrices && !isPurFamily ? `
      <button class="btn" onclick="addInvEditFreeLine()" style="display:flex;align-items:center;gap:6px;background:#f3e5f5;border:1px solid #ce93d8;color:#6a1b9a;font-weight:700"><i class="fas fa-plus"></i> ${t('invoices.addFreeLine')}</button>` : ''}
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
    _restoreInvEditInputs();
  }
  if (showPrices || showPaid) updateInvEditTotals();
  setTimeout(() => {
    const scanInput = document.getElementById('editBarcodeScan');
    if (scanInput) scanInput.focus();
  }, 200);
}

// Credit already stored on the line from previous partial component returns
// plus whatever is typed in the "return now" fields of this edit.
function _invEditBundleCreditValue(item, i) {
  let credit = parseFloat(item.bundleReturnCredit) || 0;
  if (typeof SaleCore === 'undefined' || !SaleCore.bundleHeldComponents || !SaleCore.isBundleItem || !SaleCore.isBundleItem(item)) {
    return credit;
  }
  const comps = SaleCore.bundleHeldComponents(DB, item);
  comps.forEach((c, j) => {
    const inp = document.getElementById(`editCompReturn_${i}_${j}`);
    if (!inp) return;
    let q = Unit.parse(inp.value);
    if (!(q > 0)) return;
    q = Math.min(Unit.roundQty(q), c.heldQty);
    credit += (parseFloat(c.valuePerBundle) || 0) * q;
  });
  return credit;
}

function updateInvEditTotals() {
  if (!_invDetailId) return;
  const inv = DB.getInvoice(_invDetailId);
  if (!inv || !inv.items) return;
  const showTotals = (inv.type === 'customer' || inv.type === 'sup_sale');
  if (!showTotals) {
    // فاتورة شراء: لا شريط إجماليات هنا، لكن المعاينة تحتاج الإجمالي الحيّ.
    _invEditLiveTotal = _invEditPurchaseLiveTotal(inv);
    updateInvEditPaidPreview();
    return;
  }
  const oldTotal = inv.totalAmount || 0;
  let newTotal = 0;

  for (let i = 0; i < inv.items.length; i++) {
    if (_invEditRemoved.includes(i)) continue;
    const item = inv.items[i];
    const qtyInput = document.getElementById('editQty_' + i);
    const priceInput = document.getElementById('editPrice_' + i);
    const discInput = document.getElementById('editDisc_' + i);
    if (!qtyInput) { newTotal += Math.max(0, (item.price * item.qty) - (parseFloat(item.bundleReturnCredit) || 0)); continue; }
    const qty = Unit.parse(qtyInput.value);
    const q = Unit.roundQty(qty >= 0 ? qty : item.qty);
    const price = priceInput ? parseFloat(priceInput.value) : item.price;
    const p = priceInput && isFinite(price) && price >= 0 ? price : item.price;
    const disc = discInput ? parseFloat(discInput.value) : 0;
    const d = discInput && isFinite(disc) && disc > 0 ? disc : 0;
    let lineTotal = (p * q) - d - _invEditBundleCreditValue(item, i);
    if (lineTotal < 0) lineTotal = 0;
    const cell = document.getElementById('editLineTotal_' + i);
    if (cell) cell.textContent = 'DA' + fmtMoney(lineTotal);
    newTotal += lineTotal;
  }

  for (const ni of _invEditNewItems) {
    const qtyInput = document.getElementById('editNewQty_' + ni._idx);
    const priceInput = document.getElementById('editNewPrice_' + ni._idx);
    const discInput = document.getElementById('editNewDisc_' + ni._idx);
    const qty = qtyInput ? Unit.parse(qtyInput.value) : NaN;
    const q = Unit.roundQty(qty > 0 ? qty : 1);
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
  _invEditLiveTotal = newTotal;
  updateInvEditPaidPreview();
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

// Live discounted total of a purchase invoice being edited (qty-only edits).
// Mirrors how saveInvEdit recomputes the purchase total so the paid preview
// never shows a stale remaining.
function _invEditPurchaseLiveTotal(inv) {
  const lines = [];
  for (let i = 0; i < inv.items.length; i++) {
    if (_invEditRemoved.includes(i)) continue;
    const item = inv.items[i];
    const qtyInput = document.getElementById('editQty_' + i);
    let q = item.qty;
    if (qtyInput && String(qtyInput.value).trim() !== '') {
      const v = Unit.parse(qtyInput.value);
      if (v >= 0) q = Unit.roundQty(v);
    }
    lines.push({ qty: q, buyPrice: item.price, purchaseDiscountPct: item.purchaseDiscountPct || 0 });
  }
  for (const ni of _invEditNewItems) {
    const qtyInput = document.getElementById('editNewQty_' + ni._idx);
    const q = qtyInput ? (Unit.roundQty(Unit.parse(qtyInput.value)) || 1) : ni.qty;
    lines.push({ qty: q, buyPrice: ni.price || 0, purchaseDiscountPct: ni.purchaseDiscountPct || 0 });
  }
  if (typeof PurchaseCore !== 'undefined' && PurchaseCore && PurchaseCore.compute) {
    try {
      const pd = PurchaseCore.compute(lines, inv.purchaseDiscountMode || 'percent', inv.purchaseDiscountValue || 0);
      return pd.total;
    } catch (e) {}
  }
  return lines.reduce((s, l) => s + (l.buyPrice || 0) * (l.qty || 0), 0);
}

// Shows, under the paid field, what the corrected amount does to the invoice:
// the remaining still owed, or — when the paid exceeds the total — the credit
// the party now carries.
function updateInvEditPaidPreview() {
  const input = document.getElementById('editPaidAmount');
  const box = document.getElementById('editPaidPreview');
  if (!input || !box) return;
  const inv = DB.getInvoice(_invDetailId);
  if (!inv) return;
  const total = _invEditLiveTotal || 0;
  const credit = parseFloat(inv.creditUsed) || 0;
  const paid = Unit.parse(input.value);
  const rest = total - paid - credit;
  if (rest > 0.005) {
    box.style.color = 'var(--silver-600)';
    box.textContent = `${t('invoices.paidEditRemaining')} DA${fmtMoney(rest)}`;
  } else if (rest < -0.005) {
    box.style.color = '#198754';
    box.textContent = `${t('invoices.paidEditCredit')} DA${fmtMoney(Math.abs(rest))}`;
  } else {
    box.style.color = 'var(--silver-600)';
    box.textContent = `${t('invoices.paidEditRemaining')} DA0.00`;
  }
}

function handleEditBarcodeKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const input = document.getElementById('editBarcodeScan');
    const q = cleanScannedCode(input.value);
    if (!q) return;
    const status = document.getElementById('editScanStatus');
    // A label off the counter scale names its article by PLU, so a weighed item
    // can be put back on the invoice. The read is the register's own: a LAN sub
    // device and a disabled setting both refuse it and fall through to the
    // ordinary barcode lookup below.
    const hit = (typeof salesScaleLookup === 'function') ? salesScaleLookup(q) : null;
    const scaleProd = hit && hit.prod && hit.decoded.weight > 0 ? hit.prod : null;
    const prod = scaleProd || DB.getProductByBarcode(q);
    if (prod) {
      addEditProduct(prod.id, scaleProd ? hit.decoded.weight : null,
        scaleProd ? hit.decoded.weightDecimals : null);
      status.textContent = scaleProd
        ? `${t('invoices.scanDone')} — ${t('sales.scaleTag')} ${Unit.fmtQty(hit.decoded.weight, hit.decoded.weightDecimals)}`
        : t('invoices.scanDone');
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

// A label that printed its weight stages the line at that weight — the
// cashier never retypes what the paper already says.
function addEditProduct(productId, qty, qtyDecimals) {
  const prod = DB.getProduct(productId);
  if (!prod) return;
  const inv = DB.getInvoice(_invDetailId);
  const isSupplier = inv && (inv.type === 'supplier' || inv.type === 'purchase');
  const showPrices = inv && (inv.type === 'customer' || inv.type === 'sup_sale');
  // «غير محدود» is the scale's answer, not the shelf's: a weighed card is never
  // refused for having no stock, because its stock is what the machine weighs.
  if (!isSupplier && prod.fixed !== true && prod.quantity <= 0) { alert(`"${prod.name}" ${t('invoices.notInStock')}`); return; }

  const idx = _invEditNewIdx++;
  const price = isSupplier ? (prod.buyPrice || 0) : (prod.sellPrice || 0);
  const typed = Number(qty);
  const ni = { _idx: idx, productId: prod.id, barcode: prod.barcode, name: prod.name, price,
    qty: typed > 0 ? Unit.roundQty(typed) : 1, originalPrice: price, discount: 0 };
  if (qtyDecimals != null) ni.qtyDecimals = qtyDecimals;
  _invEditNewItems.push(ni);
  renderEditNewItemRow(ni, showPrices);
}

// Builds the <tr> for a staged row (existing product picked in the edit screen
// OR a new product staged by the "add from scratch" quick-entry).
function renderEditNewItemRow(ni, showPrices) {
  const idx = ni._idx;
  const tbody = document.getElementById('editItemsBody');
  if (!tbody) return;
  const badgeColor = ni._isFree ? '#6a1b9a' : (ni._isNew ? '#e65100' : 'var(--bmw-blue-1)');
  const priceNote = ni._isNew && ni.payload
    ? ` <span style="font-size:10px;color:var(--silver-500)">(${t('quickEntry.buyPrice')}: DA${fmtMoney(ni.payload.buyPrice || 0)})</span>`
    : '';
  const nameCell = ni._isFree
    ? `<input type="text" id="editNewName_${idx}" value="${escHtml(ni.name || '')}" placeholder="${t('invoices.freeLineNamePlaceholder')}" oninput="updateInvEditTotals()" style="width:100%;min-width:130px;padding:4px 8px;border:1px solid var(--silver-300);border-radius:4px;font-size:13px">`
    : escHtml(ni.name);
  const badge = ni._isFree ? t('invoices.freeLineBadge') : t('invoices.badgeNew');
  const row = document.createElement('tr');
  row.id = `editNewRow_${idx}`;
  row.innerHTML = `
    <td>${nameCell} <span style="font-size:10px;color:${badgeColor};font-weight:600">(${badge})</span>${priceNote}</td>
    <td style="text-align:center">—</td>
    <td style="text-align:center">
      <input type="text" class="no-spinner num-input" inputmode="decimal" id="editNewQty_${idx}" value="${Unit.fmtQty(ni.qty, ni.qtyDecimals)}" min="0" step="any" oninput="updateInvEditTotals()" style="width:70px;text-align:center;padding:4px 8px;border:1px solid var(--silver-300);border-radius:4px;font-size:14px">
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
  updateInvEditTotals();
}

// Snapshots every typed value before a re-render (mark/undo a line removal),
// so switching a line's removed state never discards what the user typed.
function _snapshotInvEditInputs() {
  const snap = {};
  document.querySelectorAll('[id^="editQty_"],[id^="editPrice_"],[id^="editDisc_"],[id^="editNewQty_"],[id^="editNewPrice_"],[id^="editNewDisc_"],[id^="editNewName_"]')
    .forEach(el => { snap[el.id] = el.value; });
  _invEditPendingQty = snap;
}

function _restoreInvEditInputs() {
  if (!_invEditPendingQty) return;
  for (const key in _invEditPendingQty) {
    // Older quick-entry snapshots used bare numeric keys for editQty_N.
    const id = (/^\d+$/.test(key) ? 'editQty_' + key : key);
    const el = document.getElementById(id);
    if (el) el.value = _invEditPendingQty[key];
  }
  _invEditPendingQty = null;
}

function markInvEditRemove(i) {
  if (!_invEditRemoved.includes(i)) { _snapshotInvEditInputs(); _invEditRemoved.push(i); }
  showInvEditSection(true);
}

function undoInvEditRemove(i) {
  _snapshotInvEditInputs();
  _invEditRemoved = _invEditRemoved.filter(x => x !== i);
  showInvEditSection(true);
}

// A sale line typed by hand: no product card, no stock movement, full price is
// revenue and (having no cost) profit. It is committed only inside saveInvEdit.
function addInvEditFreeLine() {
  const inv = DB.getInvoice(_invDetailId);
  if (!inv || (inv.type !== 'customer' && inv.type !== 'sup_sale')) return;
  const ni = { _idx: _invEditFreeIdx++, _isFree: true, freeLine: true,
    productId: null, barcode: '', name: '', qty: 1, price: 0, discount: 0 };
  _invEditNewItems.push(ni);
  renderEditNewItemRow(ni, true);
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
    // Unit.parse reads "" as 0, so a blank field must keep the stored quantity.
    if (inp && String(inp.value).trim() !== '') { const v = Unit.parse(inp.value); if (v >= 0) curQty = v; }
    _invEditQtySnapshot[i] = curQty;
    const p = DB.getProduct(item.productId);
    return {
      src: 'item', itemIdx: i, productId: item.productId, name: item.name,
      barcode: (p && p.barcode) || item.barcode || '',
      qty: curQty, price: item.price || 0,
      purchaseDiscountPct: parseFloat(item.purchaseDiscountPct) || 0,
      sell: p ? (p.sellPrice || 0) : 0, whole: p ? (p.wholesalePrice || 0) : 0,
      brandId: p ? (p.brandId || '') : '', reference: p ? (p.reference || '') : '',
      plu: p ? (p.plu || '') : '',
      countryOfOrigin: p ? (p.countryOfOrigin || '') : '', mark: p ? (p.mark || '') : '',
      storageLocation: p ? (p.storageLocation || '') : '', family: p ? (p.family || '') : '',
      extraPrices: (p && p.extraPrices) || {},
      expiryDate: p ? (p.expiryDate || '') : ''
    };
  }).concat(_invEditNewItems.map(ni => {
    const p = ni.productId ? DB.getProduct(ni.productId) : null;
    return {
      src: 'staged', stagedIdx: ni._idx, isNew: !!ni._isNew, productId: ni.productId || null,
      name: ni.name, barcode: (p && p.barcode) || ni.barcode || '',
      qty: ni.qty, price: ni.price || 0,
      purchaseDiscountPct: parseFloat(ni.purchaseDiscountPct || (ni.payload && ni.payload.purchaseDiscountPct)) || 0,
      sell: p ? (p.sellPrice || 0) : (ni.payload ? (ni.payload.sellPrice || 0) : 0),
      whole: p ? (p.wholesalePrice || 0) : (ni.payload ? (ni.payload.wholesalePrice || 0) : 0),
      brandId: p ? (p.brandId || '') : (ni.payload ? (ni.payload.brandId || '') : ''),
      reference: p ? (p.reference || '') : (ni.payload ? (ni.payload.reference || '') : ''),
      plu: p ? (p.plu || '') : (ni.payload ? (ni.payload.plu || '') : ''),
      countryOfOrigin: p ? (p.countryOfOrigin || '') : (ni.payload ? (ni.payload.countryOfOrigin || '') : ''),
      mark: p ? (p.mark || '') : (ni.payload ? (ni.payload.mark || '') : ''),
      storageLocation: p ? (p.storageLocation || '') : (ni.payload ? (ni.payload.storageLocation || '') : ''),
      family: p ? (p.family || '') : (ni.payload ? (ni.payload.family || '') : ''),
      extraPrices: (p && p.extraPrices) || (ni.payload && ni.payload.extraPrices) || ni.extraPrices || {},
      expiryDate: p ? (p.expiryDate || '') : (ni.payload ? (ni.payload.expiryDate || '') : '')
    };
  }));

  // The invoice keeps its own whole-invoice discount while being edited; hand it
  // over so the quick-entry footer shows the net that will actually be saved.
  window._qePrefill = {
    invoiceId: inv.id, invoiceNumber: inv.invoiceNumber || '', supplierName: sup ? sup.name : '', rows,
    discMode: inv.purchaseDiscountMode === 'amount' ? 'amount' : 'percent',
    discValue: parseFloat(inv.purchaseDiscountValue) || 0
  };
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
        discount: 0, _isNew: true, payload: a.payload,
        purchaseDiscountPct: parseFloat(a.purchaseDiscountPct || a.payload.purchaseDiscountPct) || 0,
        realBuyPrice: parseFloat(a.realBuyPrice || a.payload.realBuyPrice) || 0
      });
    } else {
      _invEditNewItems.push({
        _idx: idx, productId: a.productId, barcode: a.barcode || '', name: a.name,
        price: a.price || 0, qty: a.qty, originalPrice: a.price || 0, discount: 0,
        extraPrices: (a.extraPrices && Object.keys(a.extraPrices).length) ? a.extraPrices : null,
        purchaseDiscountPct: parseFloat(a.purchaseDiscountPct) || 0,
        realBuyPrice: parseFloat(a.realBuyPrice) || 0
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
  if (q && String(q).trim().length >= 2) { try { DB.logSearch({ query: q, context: 'edit-product' }); } catch (e) {} }
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
    // Same rule the product grid uses: a «غير محدود» card is never out of stock.
    const oos = (!isSupplier && p.fixed !== true && p.quantity <= 0);
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

  // المبلغ المدفوع كما هو مسجّل الآن في سطور الدفعات (المصدر الحقيقي).
  const paidBefore = DB.getInvoicePaidAmount(_invDetailId);
  // المبلغ المدفوع الذي كتبه المستخدم في الحقل، إن وُجد الحقل أصلًا. يُسمح بأن
  // يتجاوز الإجمالي: الزائد يخفّض رصيد الطرف (رصيد دائن إن تعدّاه).
  const paidInputEl = document.getElementById('editPaidAmount');
  let explicitPaid = null;
  if (paidInputEl && String(paidInputEl.value).trim() !== '') {
    const pv = Unit.parse(paidInputEl.value);
    if (isFinite(pv) && pv >= 0) explicitPaid = pv;
  }
  const paidChanged = (explicitPaid !== null) && (Math.abs(explicitPaid - paidBefore) >= 0.005);

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
        if (input && String(input.value).trim() !== '') { const v = Unit.parse(input.value); if (v >= 0) targetQty = Unit.roundQty(v); }
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
    const removed = _invEditRemoved.includes(i);
    if (removed) {
      // Full-line removal. A purchase line put stock ON the shelf, so removing
      // it takes that stock back. A sale line took stock OFF the shelf, so
      // removing it returns the goods and writes a return row (same as typing
      // a lower quantity). «غير محدود» cards never carry a shelf number.
      if (!isProvisional && item.productId) {
        const rprod = DB.getProduct(item.productId);
        const isBundleLine = salesPriceEdit && typeof SaleCore !== 'undefined' &&
          SaleCore.isBundleItem && SaleCore.isBundleItem(item);
        if (rprod && rprod.fixed !== true && !isBundleLine) {
          DB.updateProduct(item.productId, { quantity: Unit.roundQty((rprod.quantity || 0) + (isPurFamily ? -item.qty : item.qty)) });
        }
        if (salesPriceEdit) {
          if (isBundleLine) {
            const comps = SaleCore.bundleComponents(DB, item);
            const returns = comps.map(c => ({ productId: c.productId, qty: Unit.roundQty(c.qtyPerBundle * item.qty) }));
            SaleCore.applyBundleComponentReturns(
              DB, _invDetailId, item, returns, 'تعديل فاتورة (حذف سطر باقة)', { track: false });
          } else {
            const returnUnit = parseFloat(item.price) ||
              (parseFloat(item.qty) ? (parseFloat(item.total) || 0) / parseFloat(item.qty) : 0);
            DB.addReturn({
              invoiceId: _invDetailId,
              productId: item.productId,
              productName: item.name,
              qty: item.qty,
              price: returnUnit,
              total: returnUnit * item.qty,
              unit: item.unit,
              unitLabel: item.unitLabel,
              qtyDecimals: item.qtyDecimals,
              reason: 'تعديل فاتورة (حذف سطر)',
            });
          }
        }
      }
      totalChanged = true;
      changes.push({ name: item.name, oldQty: item.qty, newQty: 0, diff: -item.qty });
      continue;
    }
    const input = document.getElementById('editQty_' + i);
    if (!input) { updatedItems.push(item); newTotalAmount += item.price * item.qty; continue; }
    let newQty = String(input.value).trim() === '' ? item.qty : Unit.roundQty(Unit.parse(input.value));
    if (!(newQty >= 0)) newQty = item.qty;
    const diff = newQty - item.qty;

    const isBundleLine = salesPriceEdit && !isProvisional &&
      typeof SaleCore !== 'undefined' && SaleCore.isBundleItem && SaleCore.isBundleItem(item);

    // Bundle lines are a single invoice row over several real stock cards.
    // Work on a copy so a blocked save never leaves half-returned components.
    const bundleWork = isBundleLine ? Object.assign({}, item, {
      returnedComponents: Object.assign({}, item.returnedComponents || {}),
      bundleComponents: (item.bundleComponents || []).map(c => Object.assign({}, c)),
    }) : null;

    if (diff !== 0 && !isProvisional) {
      if (isBundleLine) {
        const comps = SaleCore.bundleComponents(DB, bundleWork);
        if (diff < 0) {
          // Whole bundles went back: every component comes back with them,
          // capped by whatever is still held (a component already returned
          // earlier must not be restored twice).
          const returns = comps.map(c => ({
            productId: c.productId,
            qty: Unit.roundQty(c.qtyPerBundle * Math.abs(diff)),
          }));
          // The quantity drop already removes this money from the line total,
          // so these pieces are restored to stock but not tracked as an extra
          // partial return (that would count them twice).
          SaleCore.applyBundleComponentReturns(
            DB, _invDetailId, bundleWork, returns,
            'تعديل فاتورة (نقص كمية باقة)', { track: false });
        } else if (diff > 0) {
          // Raising the bundle quantity asks the shelf for every component of
          // the added bundles. Partial returns made earlier stay returned.
          for (const c of comps) {
            const want = Unit.roundQty(c.qtyPerBundle * diff);
            if (want <= 0) continue;
            const p = DB.getProduct(c.productId);
            if (!p || p.fixed === true) continue;
            if ((p.quantity || 0) < want) {
              alert(t('invoices.insufficientStock').replace('...', c.name || item.name));
              return;
            }
            DB.updateProduct(c.productId, { quantity: Unit.roundQty((p.quantity || 0) - want) });
          }
        }
        // The component rows are rendered against the *new* bundle quantity.
        bundleWork.qty = newQty;
      } else if (DB.getProduct(item.productId)) {
        // Only a line that still has a product card can move stock. An unlisted
        // (F10) line has none, and its edit must still reach the invoice below.
        const prod = DB.getProduct(item.productId);
        if (inv.type === 'supplier' || inv.type === 'purchase') {
          if (diff > 0) {
            DB.updateProduct(item.productId, { quantity: Unit.roundQty((prod.quantity || 0) + diff) });
          } else {
            const belowQty = Unit.roundQty((prod.quantity || 0) - Math.abs(diff));
            if (belowQty < 0) {
              alert(t('invoices.cannotBelowZero').replace('...', item.name));
              return;
            }
            DB.updateProduct(item.productId, { quantity: belowQty });
          }
        } else {
          // A «غير محدود» card is filled by the scale, not by the shelf: the sale
          // engine never deducts it, so editing its line must not add to it or
          // drain it either. The return itself is still written — the customer
          // handed the goods back and the reports have to say so.
          const weighed = prod.fixed === true;
          if (diff > 0) {
            if (!weighed) {
              if (prod.quantity < diff) {
                alert(t('invoices.insufficientStock').replace('...', item.name));
                return;
              }
              DB.updateProduct(item.productId, { quantity: Unit.roundQty(prod.quantity - diff) });
            }
          } else {
            if (!weighed) DB.updateProduct(item.productId, { quantity: Unit.roundQty(prod.quantity + Math.abs(diff)) });
            const returnQty = Math.abs(diff);
            const returnUnit = parseFloat(item.price) ||
              (parseFloat(item.qty) ? (parseFloat(item.total) || 0) / parseFloat(item.qty) : 0);
            DB.addReturn({
              invoiceId: _invDetailId,
              productId: item.productId,
              productName: item.name,
              qty: returnQty,
              price: returnUnit,
              total: returnUnit * returnQty,
              unit: item.unit,
              unitLabel: item.unitLabel,
              qtyDecimals: item.qtyDecimals,
              reason: 'تعديل فاتورة (نقص كمية)',
            });
          }
        }
      }
    }

    let price = item.price;
    let discount = 0;
    if (salesPriceEdit) {
      const priceInput = document.getElementById('editPrice_' + i);
      if (priceInput) {
        const p = parseFloat(priceInput.value);
        if (isFinite(p) && p >= 0) {
          const prod = item.productId ? DB.getProduct(item.productId) : null;
          const floor = prod ? Math.max(0, parseFloat(prod.minPrice) || 0) : 0;
          // The product's floor is not advisory: an edited sale invoice cannot
          // be pushed below it by typing over the line price.
          price = Math.max(p, floor);
        }
      }
      const discInput = document.getElementById('editDisc_' + i);
      if (discInput) {
        const d = parseFloat(discInput.value);
        if (isFinite(d) && d > 0) discount = d;
      }
    }

    // Partial component returns: only the pieces the customer actually handed
    // back from this bundle line. Each one restores its own stock card and is
    // credited against the line total.
    let partialCredit = 0;
    if (isBundleLine) {
      const comps = SaleCore.bundleHeldComponents(DB, bundleWork);
      const returns = [];
      comps.forEach((c, j) => {
        const inp = document.getElementById(`editCompReturn_${i}_${j}`);
        if (!inp) return;
        let q = Unit.parse(inp.value);
        if (!(q > 0)) return;
        q = Math.min(Unit.roundQty(q), c.heldQty);
        if (q > 0) returns.push({ productId: c.productId, qty: q });
      });
      if (returns.length) {
        const res = SaleCore.applyBundleComponentReturns(
          DB, _invDetailId, bundleWork, returns, 'تعديل فاتورة (إرجاع جزئي لمكوّن باقة)');
        partialCredit = parseFloat(res.credit) || 0;
      }
    }

    const lineBase = bundleWork || item;
    const lineCredit = isBundleLine ? (parseFloat(bundleWork.bundleReturnCredit) || 0) : 0;
    const newTotal = Math.max(0, (price * newQty) - discount - lineCredit);
    const savedItem = salesPriceEdit
      ? { ...lineBase, qty: newQty, price, total: newTotal, lineDiscount: discount, discount }
      : { ...lineBase, qty: newQty, total: newTotal };
    updatedItems.push(savedItem);
    newTotalAmount += newTotal;
    if (diff !== 0) { changes.push({ name: item.name, oldQty: item.qty, newQty, diff }); totalChanged = true; }
    if (salesPriceEdit && (price !== item.price || discount !== 0)) totalChanged = true;
    if (partialCredit > 0) totalChanged = true;
  }

  // Process new items added during edit
  for (const newItem of _invEditNewItems) {
    const qtyInput = document.getElementById('editNewQty_' + newItem._idx);
    const qty = qtyInput ? (Unit.roundQty(Unit.parse(qtyInput.value)) || 1) : newItem.qty;

    // Hand-typed sale line: no product card, no shelf movement. Its full price
    // is revenue and profit (there is no purchase cost for an unlisted item).
    if (newItem._isFree) {
      if (!salesPriceEdit) continue;
      const nameInput = document.getElementById('editNewName_' + newItem._idx);
      const name = String((nameInput && nameInput.value) || newItem.name || '').trim();
      if (!name) { alert(t('invoices.freeLineNameRequired')); return; }
      if (!(qty > 0)) { alert(t('invoices.freeLineQtyRequired')); return; }
      const priceInput = document.getElementById('editNewPrice_' + newItem._idx);
      const p = priceInput ? parseFloat(priceInput.value) : Number(newItem.price);
      const price = isFinite(p) && p >= 0 ? p : 0;
      const discInput = document.getElementById('editNewDisc_' + newItem._idx);
      const d = discInput ? parseFloat(discInput.value) : 0;
      const discount = isFinite(d) && d > 0 ? d : 0;
      const total = Math.max(0, (price * qty) - discount);
      updatedItems.push({
        productId: null, barcode: '', name, qty, price, total,
        freeLine: true, lineDiscount: discount, discount
      });
      newTotalAmount += total;
      changes.push({ name, oldQty: 0, newQty: qty, diff: qty });
      totalChanged = true;
      continue;
    }

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
      }), { source: 'invoice-edit-new' });
      if (!res || !res.ok) {
        alert(t('invoices.addFromScratchConflict') + ': ' + (res && res.existing ? res.existing.name : ''));
        return;
      }
      const nprod = res.product;
      newItem.productId = nprod.id; newItem.barcode = nprod.barcode; newItem.name = nprod.name;
      const buyPrice = parseFloat(payload.buyPrice) || 0;
      const linePct = parseFloat(payload.purchaseDiscountPct) || 0;
      const total = buyPrice * qty;
      updatedItems.push(Object.assign({
        productId: nprod.id, barcode: nprod.barcode, name: nprod.name, qty,
        price: buyPrice, total, originalPrice: buyPrice, lineDiscount: 0, discount: 0,
        purchaseDiscountPct: linePct,
        realBuyPrice: parseFloat(payload.realBuyPrice) || 0
      }, Unit.snapshot(nprod)));
      newTotalAmount += total;
      changes.push({ name: nprod.name, oldQty: 0, newQty: qty, diff: qty });
      totalChanged = true;
      continue;
    }

    const prod = DB.getProduct(newItem.productId);
    if (!prod) continue;

    // Extra sale prices typed on the quick-entry line belong to the product,
    // not to this invoice: merge them in (never wipe the stored ones).
    if (isPurFamily && newItem.extraPrices) {
      DB.updateProduct(newItem.productId, {
        extraPrices: Object.assign({}, prod.extraPrices || {}, newItem.extraPrices)
      });
    }

    if (!isProvisional) {
      if (inv.type === 'supplier' || inv.type === 'purchase') {
        DB.updateProduct(newItem.productId, { quantity: Unit.roundQty((prod.quantity || 0) + qty) });
      } else if (prod.fixed !== true) {
        // A weighed card («غير محدود») has no shelf number to drain: the scale
        // is its only quantity source, exactly as at the register.
        if (prod.quantity < qty) {
          alert(t('invoices.insufficientStock').replace('...', newItem.name));
          return;
        }
        DB.updateProduct(newItem.productId, { quantity: Unit.roundQty(prod.quantity - qty) });
      }
    }

    const fallbackPrice = (inv.type === 'supplier' || inv.type === 'purchase') ? (prod.buyPrice || 0) : (prod.sellPrice || 0);
    let price = newItem.price || fallbackPrice;
    let discount = 0;
    if (salesPriceEdit) {
      const priceInput = document.getElementById('editNewPrice_' + newItem._idx);
      if (priceInput) {
        const p = parseFloat(priceInput.value);
        if (isFinite(p) && p >= 0) price = Math.max(p, Math.max(0, parseFloat(prod.minPrice) || 0));
      }
      const discInput = document.getElementById('editNewDisc_' + newItem._idx);
      if (discInput) {
        const d = parseFloat(discInput.value);
        if (isFinite(d) && d > 0) discount = d;
      }
    }
    const total = (price * qty) - discount;
    const item = Object.assign({
      productId: newItem.productId,
      barcode: newItem.barcode,
      name: newItem.name,
      qty,
      price,
      total,
      originalPrice: newItem.originalPrice || fallbackPrice,
      lineDiscount: discount,
      discount,
      purchaseDiscountPct: parseFloat(newItem.purchaseDiscountPct) || 0,
      realBuyPrice: parseFloat(newItem.realBuyPrice) || 0
    }, Unit.snapshot(prod || newItem));
    if (newItem.qtyDecimals != null) item.qtyDecimals = newItem.qtyDecimals;
    updatedItems.push(item);
    newTotalAmount += total;
    changes.push({ name: newItem.name, oldQty: 0, newQty: qty, diff: qty });
    totalChanged = true;
  }

  _invEditNewItems = [];
  _invEditRemoved = [];

  // Purchase invoices keep their stored invoice-level discount: recompute the
  // REAL total from every line (product discount + global discount) instead of
  // the gross sum, so editing a discounted purchase never wipes the discount.
  let purDiscountFields = null;
  if (isPurFamily && typeof PurchaseCore !== 'undefined' && PurchaseCore && PurchaseCore.compute) {
    const pd = PurchaseCore.compute(
      updatedItems.map(it => ({
        qty: it.qty,
        buyPrice: it.price,
        purchaseDiscountPct: it.purchaseDiscountPct || 0
      })),
      inv.purchaseDiscountMode || 'percent',
      inv.purchaseDiscountValue || 0
    );
    pd.lines.forEach((line, i) => {
      const it = updatedItems[i];
      if (!it) return;
      it.purchaseDiscountPct = line.purchaseDiscountPct;
      it.realBuyPrice = line.realBuyPrice;
      it.realTotal = line.realTotal;
      it.globalDiscount = line.globalDiscount;
    });
    newTotalAmount = pd.total;
    purDiscountFields = {
      purchaseDiscountMode: pd.mode,
      purchaseDiscountValue: pd.value,
      purchaseDiscountAmount: pd.globalDiscountAmount,
      purchaseProductDiscount: pd.productDiscountAmount,
      purchaseGross: pd.gross
    };
  }

  if (!totalChanged && !paidChanged) {
    alert(t('invoices.noChangesMade'));
    return;
  }
  // Update invoice
  const oldTotal = inv.totalAmount;
  inv.totalAmount = newTotalAmount;
  const isSaleEdit = inv.type !== 'supplier' && inv.type !== 'purchase';
  // المبلغ المدفوع (المصدر: سطور الدفعات) قبل التعديل — أُلقط مبكرًا في الأعلى.
  // المبلغ (المدفوع) الجديد after reconciliation.
  let newPaid;
  if (paidChanged && explicitPaid !== null) {
    newPaid = explicitPaid;
    DB.setInvoicePaid(_invDetailId, explicitPaid, { note: t('invoices.paidEditNote') });
  } else if (isSaleEdit) {
    DB.reduceInvoicePayments(_invDetailId, newTotalAmount);
    newPaid = DB.getInvoicePaidAmount(_invDetailId);
  } else {
    newPaid = paidBefore;
  }
  if (isSaleEdit && !(paidChanged && explicitPaid !== null)) {
    const actualPaid = DB.getInvoicePaidAmount(_invDetailId);
    if (actualPaid > newTotalAmount) inv.paidAmount = newTotalAmount;
    else inv.paidAmount = actualPaid;
  } else {
    inv.paidAmount = newPaid;
  }

  const updateData = { items: updatedItems, totalAmount: newTotalAmount, paidAmount: inv.paidAmount };
  if (purDiscountFields) Object.assign(updateData, purDiscountFields);
  const dateInput = document.getElementById('editInvDate');
  const newDateTs = dateInput ? _invInputToDate(dateInput.value) : null;
  if (newDateTs) { updateData.createdAt = newDateTs; updateData.date = newDateTs; inv.createdAt = newDateTs; inv.date = newDateTs; }
  if (inv.type !== 'supplier' && inv.type !== 'purchase') {
    const newProfit = updatedItems.reduce((s, item) => {
      const prod = DB.getProduct(item.productId);
      const isBundle = typeof SaleCore !== 'undefined' && SaleCore.isBundleItem && SaleCore.isBundleItem(item);
      const buyPrice = isBundle
        ? (parseFloat(item.costPrice) || 0)
        : ((typeof PurchaseCore !== 'undefined' && PurchaseCore && typeof PurchaseCore.itemCost === 'function')
          ? PurchaseCore.itemCost(item, prod)
          : (prod ? (prod.buyPrice || 0) : 0));
      // A partial component return removes revenue but the component itself is
      // back on the shelf; its stored credit is what left the invoice total.
      return s + (((item.price - buyPrice) * item.qty) - (item.discount || 0) - (parseFloat(item.bundleReturnCredit) || 0));
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
  if (newDateTs) {
    const allPmts = DB.getPayments();
    let chg = false;
    allPmts.forEach(p => { if (p.invoiceId === _invDetailId) { p.createdAt = newDateTs; chg = true; } });
    if (chg) DB.savePayments(allPmts);
  }

  // Update customer/supplier balance if total or paid changed
  if (oldTotal !== newTotalAmount || paidChanged) {
    const balanceChange = (newTotalAmount - newPaid) - (oldTotal - paidBefore);
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
        const supAdjustment = (inv.type === 'sup_sale') ? -balanceChange : balanceChange;
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

// ===== CONVERT A SALE INVOICE TO A CUSTOMER ACCOUNT =====
// A walk-in sale (customerId:null) becomes a normal account sale: the whole
// invoice amount lands on the chosen customer's balance and the anonymous cash
// receipts already recorded on the invoice are cancelled. Reassigning an
// invoice that is already linked moves only the outstanding remainder (money
// already collected stays collected). The arithmetic lives in ConvertCore.
var _invConvertInvoiceId = null;
var _invConvertTargetId = null;
var _invConvertTab = 'existing';
var _invConvertMatches = [];
var _invConvertActive = -1;

function _invConvertR2(v) {
  const n = parseFloat(v) || 0;
  return Math.round((n + (n >= 0 ? 1e-9 : -1e-9)) * 100) / 100;
}

// Cash actually recorded on this invoice. Legacy invoices may only carry
// inv.paidAmount (no payment row), so fall back to it when no rows exist.
function _invConvertRecordedCash(inv) {
  if (!inv || !inv.id) return 0;
  const paid = _invConvertR2(DB.getInvoicePaidAmount(inv.id));
  if (paid > 0) return paid;
  const rows = (typeof DB.getInvoicePayments === 'function') ? (DB.getInvoicePayments(inv.id) || []) : [];
  if (!rows.length) return Math.max(0, _invConvertR2(inv.paidAmount));
  return Math.max(0, paid);
}

function _invConvertHasReturns(inv) {
  if (!inv || !inv.id) return false;
  return (DB.getReturns() || []).some(r => r && (r.invoiceId === inv.id || r.relatedTo === inv.id));
}

function _invConvertEligibility(inv) {
  if (!inv) return { ok: false, error: 'not_sale' };
  if (inv.type !== 'customer') return { ok: false, error: 'not_sale' };
  if (inv.isProvisional) return { ok: false, error: 'provisional' };
  if (_invConvertHasReturns(inv)) return { ok: false, error: 'has_returns' };
  if (!(_invConvertR2(inv.totalAmount) > 0)) return { ok: false, error: 'zero_total' };
  return { ok: true };
}

function _invConvertCurrentName(inv) {
  if (!inv) return '';
  if (inv.customerId) {
    const c = DB.getCustomer(inv.customerId);
    if (c) return c.name;
  }
  return inv.walkinName || inv.walkinCustomerName || t('invoices.convertWalkinLabel');
}

function _invConvertContext(inv) {
  const total = Math.max(0, _invConvertR2(inv && inv.totalAmount));
  const recordedCash = _invConvertRecordedCash(inv);
  const creditUsed = Math.max(0, _invConvertR2(inv && inv.creditUsed));
  return {
    total,
    recordedCash,
    creditUsed,
    effectivePaid: _invConvertR2(recordedCash + creditUsed),
    isWalkin: !(inv && inv.customerId)
  };
}

function _invConvertBuildPlan(inv, targetId) {
  if (typeof ConvertCore === 'undefined' || !ConvertCore || !ConvertCore.plan) {
    return { ok: false, error: 'unavailable' };
  }
  const ctx = _invConvertContext(inv);
  return ConvertCore.plan({
    type: inv.type,
    isProvisional: !!inv.isProvisional,
    hasReturns: _invConvertHasReturns(inv),
    targetCustomerId: targetId || '',
    currentCustomerId: (inv && inv.customerId) || '',
    totalAmount: ctx.total,
    recordedCash: ctx.recordedCash,
    creditUsed: ctx.creditUsed,
    effectivePaid: ctx.effectivePaid
  });
}

function _invConvertErrorText(code) {
  const map = {
    not_sale: 'invoices.convertErrNotSale',
    provisional: 'invoices.convertErrProvisional',
    has_returns: 'invoices.convertErrHasReturns',
    no_customer: 'invoices.convertErrNoCustomer',
    same_customer: 'invoices.convertErrSame',
    zero_total: 'invoices.convertErrZero',
    unavailable: 'invoices.convertErrUnavailable'
  };
  return t(map[code] || 'invoices.convertErrGeneric');
}

function ensureInvConvertModal() {
  if (document.getElementById('invConvertModal')) return;
  const div = document.createElement('div');
  div.id = 'invConvertModal';
  div.className = 'modal-overlay';
  div.style.display = 'none';
  div.setAttribute('onclick', 'if(event.target===this)closeInvConvert()');
  div.innerHTML = `
    <div class="modal inv-convert-modal">
      <div class="modal-header">
        <h3><i class="fas fa-user-check"></i> ${t('invoices.convertTitle')}</h3>
        <button class="modal-close" onclick="closeInvConvert()">&times;</button>
      </div>
      <div class="modal-body inv-convert-body">
        <div id="invConvertSummary" class="inv-convert-summary"></div>
        <div id="invConvertWarning" class="inv-convert-warning"></div>
        <div class="inv-convert-tabs" role="tablist">
          <button type="button" id="invConvertTabExisting" class="inv-convert-tab is-active" onclick="setInvConvertTab('existing')">
            <i class="fas fa-search"></i> ${t('invoices.convertExisting')}
          </button>
          <button type="button" id="invConvertTabNew" class="inv-convert-tab" onclick="setInvConvertTab('new')">
            <i class="fas fa-user-plus"></i> ${t('invoices.convertNew')}
          </button>
        </div>

        <div id="invConvertPaneExisting">
          <div class="sales-cust-search-row" style="margin-bottom:8px">
            <div class="sales-cust-search-wrap">
              <i class="fas fa-search" style="color:var(--silver-500);font-size:12px"></i>
              <input type="text" id="invConvertSearch" placeholder="${t('invoices.convertSearchPlaceholder')}" dir="rtl" autocomplete="off" oninput="searchInvConvert(this.value)" onkeydown="invConvertKey(event)">
            </div>
          </div>
          <div id="invConvertResults" class="search-results inv-convert-results"></div>
          <div id="invConvertSelected" class="inv-convert-selected" style="display:none">
            <i class="fas fa-user-check" style="color:var(--bmw-blue-1);margin-top:2px"></i>
            <div style="min-width:0;flex:1">
              <div class="inv-convert-selected-label">${t('invoices.convertSelected')}</div>
              <strong id="invConvertSelName"></strong>
              <div id="invConvertPreview" class="inv-convert-preview"></div>
            </div>
          </div>
        </div>

        <div id="invConvertPaneNew" style="display:none">
          <div class="inv-convert-form">
            <label class="inv-convert-field inv-convert-field-full">
              <span>${t('invoices.convertNewName')} *</span>
              <input type="text" id="invConvertNewName" dir="rtl" autocomplete="off" oninput="invConvertNewChanged()">
            </label>
            <label class="inv-convert-field">
              <span>${t('invoices.convertNewPhone')}</span>
              <input type="text" id="invConvertNewPhone" dir="ltr" autocomplete="off" oninput="invConvertNewChanged()">
            </label>
            <label class="inv-convert-field">
              <span>${t('invoices.convertNewDiscount')}</span>
              <input type="number" id="invConvertNewDiscount" class="no-spinner" min="0" max="100" step="any" value="0" dir="ltr" oninput="invConvertNewChanged()">
            </label>
            <label class="inv-convert-field inv-convert-field-full">
              <span>${t('invoices.convertNewAddress')}</span>
              <input type="text" id="invConvertNewAddress" dir="rtl" autocomplete="off" oninput="invConvertNewChanged()">
            </label>
            <label class="inv-convert-field inv-convert-field-full">
              <span>${t('invoices.convertNewType')}</span>
              <select id="invConvertNewType" onchange="invConvertNewChanged()">
                <option value="unit">${t('invoices.convertNewTypeUnit')}</option>
                <option value="whole">${t('invoices.convertNewTypeWhole')}</option>
              </select>
            </label>
          </div>
          <div id="invConvertNewPreview" class="inv-convert-hint"></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" onclick="closeInvConvert()">${t('common.cancel')}</button>
        <button class="btn btn-primary" id="invConvertConfirmBtn" onclick="confirmInvConvert()" disabled style="opacity:0.5">
          <i class="fas fa-check"></i> ${t('invoices.convertConfirm')}
        </button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

function openInvConvert(invoiceId) {
  if (!_canManageInvoices()) { alert(t('invoices.noPermission')); return; }
  const id = invoiceId || _invDetailId;
  const inv = id ? DB.getInvoice(id) : null;
  if (!inv) return;
  const elig = _invConvertEligibility(inv);
  if (!elig.ok) { alert(_invConvertErrorText(elig.error)); return; }

  _invConvertInvoiceId = inv.id;
  _invConvertTargetId = null;
  _invConvertMatches = [];
  _invConvertActive = -1;

  ensureInvConvertModal();
  const m = document.getElementById('invConvertModal');
  if (!m._host) m._host = m.parentNode;
  if (m.parentNode !== document.body) document.body.appendChild(m);

  const search = document.getElementById('invConvertSearch');
  if (search) search.value = '';
  const results = document.getElementById('invConvertResults');
  if (results) results.innerHTML = '';
  const selected = document.getElementById('invConvertSelected');
  if (selected) selected.style.display = 'none';
  ['invConvertNewName', 'invConvertNewPhone', 'invConvertNewAddress'].forEach(el => {
    const input = document.getElementById(el);
    if (input) input.value = '';
  });
  const disc = document.getElementById('invConvertNewDiscount');
  if (disc) disc.value = '0';
  const type = document.getElementById('invConvertNewType');
  if (type) type.value = 'unit';

  setInvConvertTab('existing');
  renderInvConvertSummary();
  m.style.display = 'flex';
  searchInvConvert('');
  setTimeout(() => { const el = document.getElementById('invConvertSearch'); if (el) el.focus(); }, 150);
}

function closeInvConvert() {
  const m = document.getElementById('invConvertModal');
  if (m) m.style.display = 'none';
}

function setInvConvertTab(tab) {
  _invConvertTab = (tab === 'new') ? 'new' : 'existing';
  const existingBtn = document.getElementById('invConvertTabExisting');
  const newBtn = document.getElementById('invConvertTabNew');
  const existingPane = document.getElementById('invConvertPaneExisting');
  const newPane = document.getElementById('invConvertPaneNew');
  if (existingBtn) existingBtn.classList.toggle('is-active', _invConvertTab === 'existing');
  if (newBtn) newBtn.classList.toggle('is-active', _invConvertTab === 'new');
  if (existingPane) existingPane.style.display = _invConvertTab === 'existing' ? '' : 'none';
  if (newPane) newPane.style.display = _invConvertTab === 'new' ? '' : 'none';
  renderInvConvertSummary();
  if (_invConvertTab === 'new') {
    setTimeout(() => { const el = document.getElementById('invConvertNewName'); if (el) el.focus(); }, 80);
  }
}

function renderInvConvertSummary() {
  const inv = _invConvertInvoiceId ? DB.getInvoice(_invConvertInvoiceId) : null;
  if (!inv) return;
  const ctx = _invConvertContext(inv);
  const currentName = _invConvertCurrentName(inv);

  const summary = document.getElementById('invConvertSummary');
  if (summary) {
    summary.innerHTML = `
      <span class="inv-convert-chip"><i class="fas fa-hashtag"></i> <b>${escHtml(inv.invoiceNumber || '—')}</b></span>
      <span class="inv-convert-chip"><i class="fas fa-user"></i> ${escHtml(currentName)}</span>
      <span class="inv-convert-chip"><i class="fas fa-coins"></i> <b dir="ltr">${_invMoney(ctx.total)}</b></span>
      ${ctx.recordedCash > 0 ? `<span class="inv-convert-chip inv-convert-chip-cash"><i class="fas fa-money-bill-wave"></i> ${escHtml(t('invoices.convertCashChip'))} <b dir="ltr">${_invMoney(ctx.recordedCash)}</b></span>` : ''}`;
  }

  const warning = document.getElementById('invConvertWarning');
  if (warning) {
    if (ctx.isWalkin) {
      warning.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${escHtml(
        t('invoices.convertWalkinNotice')
          .replace('{amount}', _invMoney(ctx.total))
          .replace('{cash}', _invMoney(ctx.recordedCash))
      )}`;
    } else {
      const remaining = Math.max(0, _invConvertR2(ctx.total - ctx.effectivePaid));
      warning.innerHTML = `<i class="fas fa-info-circle"></i> ${escHtml(
        t('invoices.convertReassignNotice')
          .replace('{from}', currentName)
          .replace('{amount}', _invMoney(remaining))
      )}`;
    }
  }

  if (_invConvertTab === 'existing') {
    const target = _invConvertTargetId ? DB.getCustomers().find(c => c.id === _invConvertTargetId) : null;
    const sel = document.getElementById('invConvertSelected');
    if (target && sel) {
      const nameEl = document.getElementById('invConvertSelName');
      if (nameEl) nameEl.textContent = target.name;
      const prev = document.getElementById('invConvertPreview');
      if (prev) prev.innerHTML = _invConvertPreviewHTML(inv, target);
      sel.style.display = 'flex';
    } else if (sel) {
      sel.style.display = 'none';
    }
  } else {
    const prev = document.getElementById('invConvertNewPreview');
    if (prev) prev.innerHTML = _invConvertNewPreviewHTML(inv);
  }

  _invConvertRefreshConfirm();
}

function _invConvertPreviewHTML(inv, target) {
  const plan = _invConvertBuildPlan(inv, target.id);
  if (!plan.ok) {
    return `<div class="inv-convert-error"><i class="fas fa-ban"></i> ${escHtml(_invConvertErrorText(plan.error))}</div>`;
  }
  const bal = parseFloat(target.balance) || 0;
  const after = _invConvertR2(bal + plan.newCustomerDelta);
  const moveTxt = plan.mode === 'walkin'
    ? t('invoices.convertPreviewFull').replace('{amount}', _invMoney(plan.newCustomerDelta))
    : t('invoices.convertPreviewRemaining').replace('{amount}', _invMoney(plan.newCustomerDelta));
  const oldTxt = plan.oldCustomerDelta
    ? `<div class="inv-convert-preview-old">${escHtml(t('invoices.convertPreviewOld').replace('{amount}', _invMoney(Math.abs(plan.oldCustomerDelta))))}</div>`
    : '';
  return `${escHtml(moveTxt)}
    <div class="inv-convert-preview-bal">
      <span>${escHtml(t('invoices.convertBalanceNow'))}: <b dir="ltr">${_invMoney(bal)}</b></span>
      <i class="fas fa-arrow-left" style="font-size:10px"></i>
      <span>${escHtml(t('invoices.convertBalanceAfter'))}: <b dir="ltr">${_invMoney(after)}</b></span>
    </div>
    ${oldTxt}`;
}

function _invConvertNewValues() {
  const val = (id) => {
    const el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  };
  const discount = Math.min(100, Math.max(0, parseFloat(val('invConvertNewDiscount')) || 0));
  return {
    name: val('invConvertNewName'),
    phone: val('invConvertNewPhone'),
    address: val('invConvertNewAddress'),
    discount: discount,
    type: val('invConvertNewType') === 'whole' ? 'whole' : 'unit'
  };
}

function _invConvertNewPreviewHTML(inv) {
  const vals = _invConvertNewValues();
  if (!vals.name) return escHtml(t('invoices.convertNewHint'));
  const ctx = _invConvertContext(inv);
  const delta = ctx.isWalkin
    ? ctx.total
    : Math.max(0, _invConvertR2(ctx.total - ctx.effectivePaid));
  return `<i class="fas fa-user-plus"></i> ${escHtml(t('invoices.convertWillCreate').replace('{name}', vals.name))}
    <div style="margin-top:4px">${escHtml(t('invoices.convertWillMove').replace('{amount}', _invMoney(delta)))}</div>`;
}

function invConvertNewChanged() {
  const inv = _invConvertInvoiceId ? DB.getInvoice(_invConvertInvoiceId) : null;
  if (!inv) return;
  const prev = document.getElementById('invConvertNewPreview');
  if (prev) prev.innerHTML = _invConvertNewPreviewHTML(inv);
  _invConvertRefreshConfirm();
}

function _invConvertRefreshConfirm() {
  const btn = document.getElementById('invConvertConfirmBtn');
  if (!btn) return;
  let ready = false;
  if (_invConvertTab === 'new') {
    ready = !!_invConvertNewValues().name;
  } else if (_invConvertTargetId) {
    const inv = _invConvertInvoiceId ? DB.getInvoice(_invConvertInvoiceId) : null;
    ready = !!(inv && _invConvertBuildPlan(inv, _invConvertTargetId).ok);
  }
  btn.disabled = !ready;
  btn.style.opacity = ready ? '1' : '0.5';
}

function searchInvConvert(q) {
  const results = document.getElementById('invConvertResults');
  if (!results) return;
  const needle = String((typeof normSearch === 'function' ? normSearch(q || '') : (q || ''))).toLowerCase();
  const inv = _invConvertInvoiceId ? DB.getInvoice(_invConvertInvoiceId) : null;
  const currentId = inv ? inv.customerId : null;
  let matches = DB.getCustomers().filter(c => !needle
    || String(c.name || '').toLowerCase().includes(needle)
    || (c.phone && String(c.phone).includes(needle)));
  matches.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'));
  _invConvertMatches = matches.slice(0, 60);
  _invConvertActive = _invConvertMatches.length ? 0 : -1;
  if (!matches.length) {
    results.innerHTML = `<div class="search-result-item disabled">${t('invoices.convertNoResults')}</div>`;
    return;
  }
  results.innerHTML = _invConvertMatches.map((c, i) => {
    const isCurrent = c.id === currentId;
    return `<div class="search-result-item inv-xfer-row${i === _invConvertActive ? ' active' : ''}" data-idx="${i}" onclick="selectInvConvert('${c.id}')">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%">
        <div style="min-width:0">
          <strong>${escHtml(c.name)}${isCurrent ? ` <span class="text-muted" style="font-size:10px">(${escHtml(t('invoices.convertCurrentTag'))})</span>` : ''}</strong>
          <div class="text-muted" style="font-size:11px">${c.phone ? escHtml(c.phone) : ''}${c.address ? ' · ' + escHtml(c.address) : ''}</div>
        </div>
        <div class="inv-convert-bal">${invPartyBalanceHTML('customer', c.balance, '11px')}</div>
      </div>
    </div>`;
  }).join('');
}

function _invConvertHighlight(idx) {
  const rows = document.querySelectorAll('#invConvertResults .inv-xfer-row');
  if (!rows.length) return;
  if (idx < 0) idx = rows.length - 1;
  if (idx >= rows.length) idx = 0;
  _invConvertActive = idx;
  rows.forEach((r, i) => r.classList.toggle('active', i === idx));
  if (rows[idx] && rows[idx].scrollIntoView) rows[idx].scrollIntoView({ block: 'nearest' });
}

function invConvertKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); closeInvConvert(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); _invConvertHighlight(_invConvertActive + 1); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); _invConvertHighlight(_invConvertActive - 1); return; }
  if (e.key === 'Enter') { e.preventDefault(); pickFirstInvConvert(); return; }
}

function pickFirstInvConvert() {
  const rows = document.querySelectorAll('#invConvertResults .inv-xfer-row');
  if (!rows.length) return;
  const idx = (_invConvertActive >= 0 && _invConvertActive < rows.length) ? _invConvertActive : 0;
  const m = (rows[idx].getAttribute('onclick') || '').match(/'([^']+)'/);
  if (m) selectInvConvert(m[1]);
}

function selectInvConvert(id) {
  const c = DB.getCustomers().find(x => x.id === id);
  if (!c) return;
  _invConvertTargetId = c.id;
  const search = document.getElementById('invConvertSearch');
  if (search) search.value = c.name;
  const results = document.getElementById('invConvertResults');
  if (results) results.innerHTML = '';
  renderInvConvertSummary();
}

function _invAdjustCustomerBalance(customerId, delta) {
  const d = _invConvertR2(delta);
  if (!customerId || !d) return;
  const customers = DB.getCustomers();
  const idx = customers.findIndex(c => c.id === customerId);
  if (idx === -1) return;
  customers[idx].balance = _invConvertR2((parseFloat(customers[idx].balance) || 0) + d);
  customers[idx].updatedAt = Date.now();
  DB.saveCustomers(customers);
}

// Discount records made at sale time carry the (possibly blank) walk-in
// customer. Re-attributing them keeps the discounts page/report consistent
// with the new account holder after a conversion or reassignment.
function _invConvertRetagDiscounts(invoiceId, customerId, customerName) {
  if (!invoiceId || !customerId) return;
  if (typeof DB.getDiscounts !== 'function' || typeof DB.saveDiscounts !== 'function') return;
  const list = DB.getDiscounts();
  let changed = false;
  list.forEach(d => {
    if (d && d.invoiceId === invoiceId && (d.customerId !== customerId || d.customerName !== customerName)) {
      d.customerId = customerId;
      d.customerName = customerName || '';
      changed = true;
    }
  });
  if (changed) DB.saveDiscounts(list);
}

function confirmInvConvert() {
  if (!_invConvertInvoiceId) return;
  const inv = DB.getInvoice(_invConvertInvoiceId);
  if (!inv) return;

  let target = null;
  let isNew = false;
  if (_invConvertTab === 'new') {
    const vals = _invConvertNewValues();
    if (!vals.name) { alert(t('invoices.convertNameRequired')); return; }
    target = vals;
    isNew = true;
  } else {
    target = DB.getCustomers().find(c => c.id === _invConvertTargetId);
    if (!target) { alert(t('invoices.convertSelectTarget')); return; }
  }

  // Validate everything on the untouched invoice before writing anything.
  const plan = _invConvertBuildPlan(inv, isNew ? '__new_convert_target__' : target.id);
  if (!plan.ok) { alert(_invConvertErrorText(plan.error)); return; }

  const oldName = _invConvertCurrentName(inv);
  const msg = (plan.mode === 'walkin')
    ? t('invoices.convertConfirmWalkin')
        .replace('{name}', target.name)
        .replace('{amount}', _invMoney(plan.total))
        .replace('{cash}', _invMoney(plan.cancelledCash))
    : t('invoices.convertConfirmReassign')
        .replace('{from}', oldName)
        .replace('{to}', target.name)
        .replace('{amount}', _invMoney(plan.newCustomerDelta));
  if (!confirm(msg)) return;

  if (isNew) {
    target = DB.addCustomer({
      name: target.name,
      phone: target.phone || '',
      address: target.address || '',
      type: target.type || 'unit',
      discount: target.discount || 0
    });
    if (target && typeof DB.logAudit === 'function') {
      DB.logAudit({ action: 'add', entity: 'customer', entityId: target.id, detail: target.name });
    }
  }
  if (!target || !target.id) return;

  // Capture the old link before DB.updateInvoice mutates the live object.
  const oldCustomerId = inv.customerId || null;

  if (plan.mode === 'walkin') {
    // Cancel the anonymous cash receipts and move the full amount to the account.
    if (plan.cancelPayments && typeof DB.deletePaymentsByInvoice === 'function') {
      DB.deletePaymentsByInvoice(inv.id);
    }
    DB.updateInvoice(inv.id, {
      customerId: target.id,
      paidAmount: 0,
      convertedAt: Date.now(),
      convertedFromWalkin: true,
      convertedFromCustomerName: oldName,
      conversionCancelledPayments: plan.cancelledCash,
      conversionCancelledCash: plan.cancelledCash,
      conversionTotal: plan.total
    });
    _invAdjustCustomerBalance(target.id, plan.newCustomerDelta);
  } else {
    // Reassignment: keep collected money, move only the outstanding remainder.
    if (plan.retagPayments && plan.recordedCash > 0) {
      const payments = DB.getPayments();
      let changed = false;
      payments.forEach(p => {
        if (p.invoiceId === inv.id) { p.customerId = target.id; changed = true; }
      });
      if (changed && typeof DB.savePayments === 'function') DB.savePayments(payments);
    }
    DB.updateInvoice(inv.id, {
      customerId: target.id,
      convertedAt: Date.now(),
      convertedFromWalkin: false,
      convertedFromCustomerName: oldName,
      reassignedFromCustomerId: oldCustomerId,
      conversionCancelledPayments: 0,
      conversionCancelledCash: 0,
      conversionTotal: plan.total
    });
    _invAdjustCustomerBalance(oldCustomerId, plan.oldCustomerDelta);
    _invAdjustCustomerBalance(target.id, plan.newCustomerDelta);
  }
  _invConvertRetagDiscounts(inv.id, target.id, target.name);

  if (typeof DB.logAudit === 'function') {
    const moved = (plan.mode === 'walkin') ? plan.total : plan.newCustomerDelta;
    const cancelTxt = plan.cancelledCash > 0 ? ` (إلغاء مقبوض DA${fmtMoney(plan.cancelledCash)})` : '';
    DB.logAudit({
      action: 'update', entity: 'invoice', entityId: inv.id,
      detail: `تحويل فاتورة بيع: ${oldName} → ${target.name} — DA${fmtMoney(moved)}${cancelTxt}`
    });
  }

  closeInvConvert();
  if (typeof refreshInvoiceList === 'function') refreshInvoiceList();
  if (typeof filterInvoices === 'function') filterInvoices();
  if (_invDetailId === inv.id) showInvDetail(inv.id);
  alert(t('invoices.convertDone').replace('{name}', target.name));
}

// Quick conversion entry point in the invoice-detail footer (managers and
// employees with invoice-management permission only).
function _injectInvConvertFooterButton(inv) {
  const footer = document.getElementById('invDetailFooter');
  if (!footer) return;
  const old = footer.querySelector('#invDetailConvertBtn');
  if (old) old.remove();
  if (!inv || !_canManageInvoices() || !_invConvertEligibility(inv).ok) return;
  const btn = document.createElement('button');
  btn.id = 'invDetailConvertBtn';
  btn.className = 'btn';
  btn.style.cssText = 'display:flex;align-items:center;gap:5px;background:#eefbf3;border:1px solid #bfe6cd;color:#1b7a43';
  btn.innerHTML = `<i class="fas fa-user-check"></i> ${t('invoices.convertBtn')}`;
  btn.addEventListener('click', () => openInvConvert(inv.id));
  const del = footer.querySelector('.btn-danger');
  if (del) footer.insertBefore(btn, del); else footer.appendChild(btn);
}

// Return-invoice entry point in the invoice-detail footer. Shown only when the
// shared returns store still holds at least one return for this invoice, so the
// button disappears by itself once the last return is deleted.
function _injectReturnInvoiceFooterButton(inv) {
  const footer = document.getElementById('invDetailFooter');
  if (!footer) return;
  const old = footer.querySelector('#invDetailReturnBtn');
  if (old) old.remove();
  if (!inv || !_invHasReturns(inv.id)) return;
  if (!window.ReturnInvoice || typeof window.ReturnInvoice.print !== 'function') return;
  const btn = document.createElement('button');
  btn.id = 'invDetailReturnBtn';
  btn.className = 'btn';
  btn.style.cssText = 'display:flex;align-items:center;gap:5px;background:#fff5f5;border:1px solid #f0b8b8;color:#b71c1c';
  btn.innerHTML = `<i class="fas fa-undo"></i> ${t('invoices.printReturnInvoice')}`;
  btn.addEventListener('click', () => window.ReturnInvoice.print(inv.id));
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
    const isSaleType = inv.type === 'customer' || inv.type === 'waybill' || inv.type === 'sup_sale';
    (inv.items || []).forEach(item => {
      // A bundle row has no card of its own: give back the components the
      // customer still holds (already-returned pieces stay where they are).
      if (isSaleType && typeof SaleCore !== 'undefined' && SaleCore.isBundleItem && SaleCore.isBundleItem(item)) {
        SaleCore.bundleHeldComponents(DB, item).forEach(c => {
          if (c.heldQty <= 0) return;
          const cp = DB.getProduct(c.productId);
          if (!cp || cp.fixed === true) return;
          DB.updateProduct(c.productId, { quantity: Unit.roundQty((cp.quantity || 0) + c.heldQty) });
        });
        return;
      }
      const prod = DB.getProduct(item.productId);
      if (prod) {
        if (isSaleType) {
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
      ${t('invoices.transferFromLabel')} ${escHtml(inv.toName || inv.toCode)} | ${t('invoices.currentTotal')} DA${fmtMoney((inv.totalAmount || 0))}
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
            <td style="text-align:center"><strong>${Unit.qtyUnit(item.qty, item)}</strong></td>
            <td style="text-align:center">
              <input type="text" class="no-spinner num-input" inputmode="decimal" id="editQty_${i}" value="${Unit.fmtQty(item.qty)}" min="0" step="any" style="width:80px;text-align:center;padding:4px 8px;border:1px solid var(--silver-300);border-radius:4px;font-size:14px" onchange="updateTransferEditTotal()">
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
    const qty = input ? Unit.parse(input.value) : item.qty;
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
    const newQty = input ? Math.max(0, Unit.roundQty(Unit.parse(input.value))) : item.qty;
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
    document.getElementById('wbConfirmBtnLabel').textContent = t('invoices.wbConfirmProforma');
  } else {
    document.getElementById('wbRegSection').style.display = 'flex';
    document.getElementById('wbFormIcon').className = 'fas fa-truck';
    document.getElementById('wbFormTitleText').textContent = t('invoices.typeWaybill');
    document.getElementById('wbConfirmBtnLabel').textContent = t('invoices.wbConfirmWaybill');
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
  if (q && String(q).trim().length >= 2) { try { DB.logSearch({ query: q, context: 'waybill-customer' }); } catch (e) {} }
  const results = document.getElementById('wbCustResults');
  q = normSearch(q);
  const customers = DB.getCustomers();
  const matches = q
    ? customers.filter(c =>
        c.name.toLowerCase().includes(q.toLowerCase()) || (c.phone && c.phone.includes(q))
      ).slice(0, 8)
    : customers.slice(0, 8);
  results.innerHTML = matches.length === 0
    ? '<div class="search-result-item disabled">' + t('invoices.noResults') + '</div>'
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
  if (!name) { alert(t('invoices.wbCustomerRequired')); return null; }
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
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--silver-500)">' + t('invoices.wbNoProducts') + '</div>';
    return;
  }
  grid.innerHTML = list.map(p => {
    const inCart = _wbCart.find(i => i.productId === p.id);
    return `<div class="wb-prod-card" onclick="${p.quantity > 0 ? `addToWbCart('${p.id}')` : ''}" title="${p.quantity <= 0 ? t('invoices.wbNotAvailable') : ''}" style="${p.quantity <= 0 ? 'opacity:0.4;cursor:not-allowed' : ''}">
      <div class="wb-prod-name">${escHtml(p.name)}</div>
      <div class="wb-prod-bar">${p.barcode}</div>
      <div class="wb-prod-footer">
        <span class="wb-prod-price">DA${fmtMoney(p.sellPrice)}</span>
        <span class="wb-prod-qty">${p.quantity}</span>
      </div>
      ${inCart ? '<div style="font-size:10px;color:var(--bmw-blue-1);font-weight:600">' + t('invoices.wbInCart') + '</div>' : ''}
    </div>`;
  }).join('');
}

function addToWbCart(productId) {
  const prod = DB.getProduct(productId);
  if (!prod || prod.quantity <= 0) return;
  const existing = _wbCart.findIndex(i => i.productId === productId);
  if (existing !== -1) {
    const it = _wbCart[existing];
    it.qty = Unit.roundQty(it.qty + Unit.step(it.qty));
    it.total = it.qty * it.price;
  } else {
    _wbCart.push(Object.assign({
      productId: prod.id,
      name: prod.name,
      barcode: prod.barcode,
      qty: 1,
      price: prod.sellPrice,
      total: prod.sellPrice,
      originalPrice: prod.sellPrice,
    }, Unit.snapshot(prod)));
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
        <button class="sc-qty-btn" onclick="decWbCartQty(${i})" ${item.qty <= Unit.step(item.qty) ? 'disabled' : ''}>−</button>
        <input type="text" class="no-spinner num-input" inputmode="decimal" value="${Unit.fmtQty(item.qty)}" min="0.000001" step="any" style="width:60px;text-align:center;padding:2px 4px;border:1px solid var(--silver-300);border-radius:4px;font-size:13px;font-weight:600" onchange="updateWbCartQty(${i},this.value)">
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
  const it = _wbCart[idx];
  it.qty = Unit.roundQty(it.qty + Unit.step(it.qty));
  it.total = it.qty * it.price;
  renderWbCart();
  updateWbTotals();
}

function decWbCartQty(idx) {
  const it = _wbCart[idx];
  const step = Unit.step(it.qty);
  if (it.qty > step) {
    it.qty = Unit.roundQty(it.qty - step);
    it.total = it.qty * it.price;
    renderWbCart();
    updateWbTotals();
  }
}

function updateWbCartQty(idx, val) {
  const qty = Unit.roundQty(Unit.parse(val));
  _wbCart[idx].qty = qty > 0 ? qty : 1;
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
    el.textContent = t('invoices.wbFullyPaid');
    el.style.color = '#28a745';
  } else if (paid > 0) {
    el.textContent = t('invoices.wbRemaining') + fmtMoney(remaining);
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
  if (_wbCart.length === 0) { alert(t('invoices.wbCartEmpty')); return; }

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
  const items = _wbCart.map(item => Object.assign({
    productId: item.productId,
    barcode: item.barcode,
    name: item.name,
    qty: Unit.roundQty(item.qty),
    price: item.price,
    total: item.qty * item.price,
    originalPrice: item.originalPrice || item.price,
    discount: 0,
  }, Unit.snapshot(item)));

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
    const buyPrice = (typeof PurchaseCore !== 'undefined' && PurchaseCore && typeof PurchaseCore.itemCost === 'function')
      ? PurchaseCore.itemCost(item, prod)
      : (prod ? (prod.buyPrice || 0) : 0);
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
      note: paidAmount >= totalAmount ? t('invoices.wbFullDeliveryNote') : t('invoices.wbPartialDeliveryNote'),
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
    alert(t('invoices.wbSavedPrefix') + typeLabel + ' ' + inv.invoiceNumber + '\n' + t('invoices.wbAmountLabel') + fmtMoney(totalAmount) + (isProvisional ? '\n' + t('invoices.wbProvisionalNote') : ''));
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
  alert(t('invoices.soonForm').replace('{TYPE}', type || ''));
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
  if (q && String(q).trim().length >= 2) { try { DB.logSearch({ query: q, context: 'dispatch-supplier' }); } catch (e) {} }
  const results = document.getElementById('dispSupResults');
  q = normSearch(q);
  const suppliers = DB.getSuppliers();
  const matches = q
    ? suppliers.filter(s =>
        s.name.toLowerCase().includes(q.toLowerCase()) || (s.phone && s.phone.includes(q))
      ).slice(0, 8)
    : suppliers.slice(0, 8);
  results.innerHTML = matches.length === 0
    ? '<div class="search-result-item disabled">' + t('invoices.noResults') + '</div>'
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
  if (q && String(q).trim().length >= 2) { try { DB.logSearch({ query: q, context: 'dispatch-customer' }); } catch (e) {} }
  const results = document.getElementById('dispCustResults');
  q = normSearch(q);
  const customers = DB.getCustomers();
  const matches = q
    ? customers.filter(c =>
        c.name.toLowerCase().includes(q.toLowerCase()) || (c.phone && c.phone.includes(q))
      ).slice(0, 8)
    : customers.slice(0, 8);
  results.innerHTML = matches.length === 0
    ? '<div class="search-result-item disabled">' + t('invoices.noResults') + '</div>'
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
  if (totalAmount <= 0) { alert(t('invoices.dispValidAmount')); return; }

  // Validate recipient
  let supplierId = null, customerId = null;
  let walkinName = '', walkinPhone = '', walkinAddress = '';

  if (_dispRecipientType === 'supplier') {
    if (!_dispSupplierId) { alert(t('invoices.dispChooseSupplier')); return; }
    supplierId = _dispSupplierId;
  } else if (_dispRecipientType === 'customer') {
    if (!_dispCustomerId) { alert(t('invoices.dispChooseCustomer')); return; }
    customerId = _dispCustomerId;
  } else {
    walkinName = document.getElementById('dispWalkinName').value.trim();
    if (!walkinName) { alert(t('invoices.dispRecipientRequired')); return; }
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
    name: t('invoices.dispatchItemName'),
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
      note: t('invoices.dispatchNoteText'),
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
      note: t('invoices.dispatchNoteText'),
      isProvisional: false,
    });

    if (payAmount > 0) {
      // دفعة العميل الأولى = إيراد (بيع)
      DB.addPayment({
        customerId,
        invoiceId: inv.id,
        amount: payAmount,
        note: t('invoices.dispatchNoteText'),
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
      note: walkinName ? t('invoices.dispatchNoteWalkin').replace('{NAME}', walkinName) : t('invoices.dispatchNoteText'),
      isProvisional: false,
    });
  }

  closeInvDispModal();

  let msg = t('invoices.dispSavedPrefix') + fmtMoney(invTotal);
  if (timbreFiscal > 0) msg += ' ' + t('invoices.dispTimbrePart') + fmtMoney(timbreFiscal) + ')';
  if (supplierId) msg += '\n' + t('invoices.dispSupplierDeduct');
  if (customerId) {
    const payAmount = Math.min(parseFloat(document.getElementById('dispPayAmount').value) || 0, totalAmount);
    msg += '\n' + t('invoices.dispExpenseLabel') + fmtMoney(invTotal);
    if (payAmount > 0) msg += t('invoices.dispCustomerSummary').replace('{PAY}', fmtMoney(payAmount)).replace('{REMAIN}', fmtMoney((totalAmount - payAmount)));
  }
  alert(msg);

  refreshInvoiceList();
  filterInvoices();
}

// ===== PURCHASE INVOICE FORM (مثل إضافة مخزون + Timbre) =====

var _purCart = [];
var _purCartSupplierId = null;
// Global invoice discount: percentage by default, or a fixed DA amount whose
// remainder is absorbed by the last line (see purchase-core.js).
var _purDiscountMode = 'percent';
var _purSensitiveOn = false;

function _purComputeCart() {
  const value = parseFloat((document.getElementById('purDiscValue') || {}).value) || 0;
  if (typeof PurchaseCore !== 'undefined' && PurchaseCore && PurchaseCore.compute) {
    return PurchaseCore.compute(_purCart, _purDiscountMode, value);
  }
  // Defensive fallback: never break the form if the shared core is missing.
  const lines = _purCart.map((it, i) => {
    const gross = Math.round((it.qty * it.buyPrice) * 100) / 100;
    return { index: i, qty: it.qty, buyPrice: it.buyPrice, purchaseDiscountPct: 0, gross: gross, productDiscount: 0, afterProduct: gross, globalDiscount: 0, realTotal: gross, realBuyPrice: it.buyPrice };
  });
  const total = Math.round(lines.reduce((s, l) => s + l.realTotal, 0) * 100) / 100;
  return { mode: 'percent', value: 0, gross: total, productDiscountAmount: 0, subtotal: total, globalDiscountAmount: 0, total, lines };
}

function purUpdateItemRealPreview() {
  const buyEl = document.getElementById('purBuyPrice');
  const discEl = document.getElementById('purItemDisc');
  const realEl = document.getElementById('purItemReal');
  if (!buyEl || !discEl || !realEl) return;
  const buy = parseFloat(buyEl.value) || 0;
  const pct = Math.min(100, Math.max(0, parseFloat(discEl.value) || 0));
  const globalValue = parseFloat((document.getElementById('purDiscValue') || {}).value) || 0;
  let real = buy * (1 - pct / 100);
  if (typeof PurchaseCore !== 'undefined' && PurchaseCore && PurchaseCore.compute) {
    // A fixed invoice amount is shared across the whole cart, so preview it on
    // its own line (the per-unit result is the same for any quantity).
    const target = _purDiscountMode === 'amount' ? Math.min(globalValue, real) : globalValue;
    const res = PurchaseCore.compute([{ qty: 1, buyPrice: buy, purchaseDiscountPct: pct }], _purDiscountMode, target);
    real = res.lines[0].realBuyPrice;
  } else if (_purDiscountMode === 'percent') {
    real = real * (1 - Math.min(100, Math.max(0, globalValue)) / 100);
  }
  realEl.value = 'DA' + fmtMoney(real);
}

// "i" is the app-wide reveal key for hidden cost data. It only changes what is
// shown inside this window: print/PDF builders strip `.inv-print-hide` blocks.
function togglePurSensitive(force) {
  _purSensitiveOn = (force === undefined) ? !_purSensitiveOn : !!force;
  const modal = document.getElementById('invPurModal');
  if (modal) modal.classList.toggle('pur-sensitive-on', _purSensitiveOn);
  const btn = document.getElementById('purRevealBtn');
  if (btn) {
    btn.classList.toggle('is-on', _purSensitiveOn);
    btn.setAttribute('aria-pressed', _purSensitiveOn ? 'true' : 'false');
  }
  purUpdateItemRealPreview();
  return _purSensitiveOn;
}

function setPurDiscountMode(mode) {
  _purDiscountMode = (mode === 'amount') ? 'amount' : 'percent';
  const pctBtn = document.getElementById('purDiscModePct');
  const amtBtn = document.getElementById('purDiscModeAmt');
  if (pctBtn) pctBtn.classList.toggle('is-active', _purDiscountMode === 'percent');
  if (amtBtn) amtBtn.classList.toggle('is-active', _purDiscountMode === 'amount');
  purRecalcTotal();
}

function openInvPurModal() {
  _purCart = [];
  _purCartSupplierId = null;
  _purDiscountMode = 'percent';
  const discVal = document.getElementById('purDiscValue');
  if (discVal) discVal.value = '0';
  const pctBtn = document.getElementById('purDiscModePct');
  const amtBtn = document.getElementById('purDiscModeAmt');
  if (pctBtn) pctBtn.classList.add('is-active');
  if (amtBtn) amtBtn.classList.remove('is-active');
  togglePurSensitive(false);
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

// Extra sale price fields (ExtraPrices) inside the purchase form. Repainting
// from `rec` also clears the values when the form is reset between lines.
function _purRenderExtraInputs(rec) {
  const wrap = document.getElementById('purExtraPricesWrap');
  if (!wrap) return;
  if (typeof ExtraPrices === 'undefined' || !ExtraPrices) { wrap.innerHTML = ''; return; }
  const html = ExtraPrices.inputsHTML('pur', rec);
  if (!html) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = `<div class="extra-price-section">
    <div class="extra-price-section-title"><i class="fas fa-tags"></i> ${t('inventory.extraPricesTitle')}</div>
    ${html}
  </div>`;
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
  document.getElementById('purScannerStatus').textContent = t('inventory.scannerReady');
  document.getElementById('purScannerResult').style.display = 'none';
  document.getElementById('purProdSearch').value = '';
  document.getElementById('purSearchResults').innerHTML = '';
  document.getElementById('purSelectedProduct').style.display = 'none';
  document.getElementById('purProdName').value = '';
  document.getElementById('purProdBar').value = '';
  document.getElementById('purQty').value = '1';
  Unit.fillSelect('purUnit', Unit.DEFAULT, 'purUnitCustom');
  document.getElementById('purBuyPrice').value = '0';
  document.getElementById('purSellPrice').value = '0';
  document.getElementById('purWholePrice').value = '0';
  const purItemDiscEl = document.getElementById('purItemDisc');
  if (purItemDiscEl) purItemDiscEl.value = '0';
  purUpdateItemRealPreview();
  const purExpiryEl = document.getElementById('purExpiry');
  if (purExpiryEl) purExpiryEl.value = '';
  const purFamilyEl = document.getElementById('purFamily');
  if (purFamilyEl) purFamilyEl.value = '';
  document.getElementById('purSupSearch').value = '';
  document.getElementById('purSupResults').innerHTML = '';
  document.getElementById('purSelectedSupplier').style.display = 'none';
  document.getElementById('purTimbreCheck').checked = false;
  document.getElementById('purTimbreAmount').style.display = 'none';
  _purRenderExtraInputs(null);
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
    status.textContent = t('invoices.purScannerFound');
    status.style.color = '#28a745';
    result.style.display = '';
    result.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0">
      <span><strong>${escHtml(prod.name)}</strong></span>
      <span style="font-size:11px;color:var(--silver-500)">${Auth.isManager() ? 'DA' + fmtMoney(prod.buyPrice) + ' / ' : ''}DA${fmtMoney(prod.sellPrice)} | ${t('invoices.purStockLabel')}: ${prod.quantity}</span>
    </div><button class="btn btn-sm" onclick="fillPurFromScan('${prod.id}')" style="font-size:11px"><i class="fas fa-check"></i> ${t('invoices.purUseProduct')}</button>`;
  } else {
    status.textContent = t('invoices.purNotFoundNew');
    status.style.color = '#e65100';
    result.style.display = '';
    result.innerHTML = `<div style="font-size:12px;color:var(--silver-600);padding:4px 0">${t('invoices.purBarcodeLabel')} <strong dir="ltr">${val}</strong></div>`;
    document.getElementById('purProdBar').value = val;
    document.getElementById('purProdName').focus();
  }
}

function fillPurFromScan(id) {
  const p = DB.getProduct(id);
  if (!p) return;
  document.getElementById('purBarcodeScanner').value = '';
  document.getElementById('purScannerResult').style.display = 'none';
  document.getElementById('purScannerStatus').textContent = t('inventory.scannerReady');
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
  const purItemDiscScan = document.getElementById('purItemDisc');
  if (purItemDiscScan) purItemDiscScan.value = String(parseFloat(p.purchaseDiscountPct) || 0);
  purUpdateItemRealPreview();
  setPurBrand(p.brandId);
  const purExpiryScan = document.getElementById('purExpiry');
  if (purExpiryScan) purExpiryScan.value = p.expiryDate || '';
  const purFamilyScan = document.getElementById('purFamily');
  if (purFamilyScan) purFamilyScan.value = p.family || '';
  _purRenderExtraInputs(p);
}

// --- Product search ---
function searchPurProduct(q) {
  if (q && String(q).trim().length >= 2) { try { DB.logSearch({ query: q, context: 'purchase-product' }); } catch (e) {} }
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
    ? '<div class="search-result-item disabled">' + t('invoices.noResults') + '</div>'
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
  const purItemDiscSearch = document.getElementById('purItemDisc');
  if (purItemDiscSearch) purItemDiscSearch.value = String(parseFloat(p.purchaseDiscountPct) || 0);
  purUpdateItemRealPreview();
  setPurBrand(p.brandId);
  const purExpirySearch = document.getElementById('purExpiry');
  if (purExpirySearch) purExpirySearch.value = p.expiryDate || '';
  const purFamilySearch = document.getElementById('purFamily');
  if (purFamilySearch) purFamilySearch.value = p.family || '';
  _purRenderExtraInputs(p);
}

// --- Supplier search ---
function searchPurSupplier(q) {
  if (q && String(q).trim().length >= 2) { try { DB.logSearch({ query: q, context: 'purchase-supplier' }); } catch (e) {} }
  const results = document.getElementById('purSupResults');
  q = normSearch(q);
  const suppliers = DB.getSuppliers();
  const matches = q
    ? suppliers.filter(s =>
        s.name.toLowerCase().includes(q.toLowerCase()) || (s.phone && s.phone.includes(q))
      ).slice(0, 8)
    : suppliers.slice(0, 8);
  results.innerHTML = matches.length === 0
    ? '<div class="search-result-item disabled">' + t('invoices.noResults') + '</div>'
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
  const qty = Unit.parse(document.getElementById('purQty').value);
  const unitSnap = Unit.readSelect('purUnit', 'purUnitCustom');
  const buyPrice = parseFloat(document.getElementById('purBuyPrice').value) || 0;
  const sellPrice = parseFloat(document.getElementById('purSellPrice').value) || 0;
  const wholesalePrice = parseFloat(document.getElementById('purWholePrice').value) || 0;
  const extraPrices = (typeof ExtraPrices !== 'undefined' && ExtraPrices) ? ExtraPrices.readInputs('pur') : {};
  const purchaseDiscountPct = Math.min(100, Math.max(0, parseFloat((document.getElementById('purItemDisc') || {}).value) || 0));
  const purExpiryEl = document.getElementById('purExpiry');
  const expiryDate = purExpiryEl ? purExpiryEl.value : '';
  const family = (document.getElementById('purFamily')?.value || '').trim();

  if (!name) { alert(t('invoices.purProductRequired')); return; }
  if (!barcode) { alert(t('invoices.purBarcodeRequired')); return; }
  if (!(qty > 0)) { alert(t('inventory.qtyInvalid')); return; }
  if (window.getPharmacyMode() && !family) { alert(t('inventory.familyRequired')); return; }

  const expSettings = getExpirySettings();
  if (expSettings.enabled && expSettings.required && !expiryDate) { alert(t('inventory.expiryRequired')); return; }

  const conflict = DB.findProductsByBarcode(barcode).find(p => !DB.isSameProductIdentity(p, { name, brandId }));
  if (conflict) {
    alert(t('invoices.barcodeConflict').replace('{NAME}', conflict.name).replace('{CODE}', conflict.barcode));
    return;
  }

  _purCart.push({ name, barcode, brandId, qty: Unit.roundQty(qty), unit: unitSnap.unit, unitLabel: unitSnap.unitLabel, buyPrice, sellPrice, wholesalePrice, extraPrices, purchaseDiscountPct, family, expiryDate });
  renderPurCart();
  resetPurForm();
  setTimeout(() => document.getElementById('purBarcodeScanner').focus(), 200);
}

function renderPurCart() {
  const section = document.getElementById('purCartSection');
  const container = document.getElementById('purCartItems');
  const countEl = document.getElementById('purCartCount');

  if (_purCart.length === 0) {
    section.style.display = 'none';
    if (container) container.innerHTML = '';
    if (countEl) countEl.textContent = '(0)';
    purRecalcTotal();
    return;
  }
  section.style.display = '';

  countEl.textContent = `(${_purCart.length})`;
  const computed = _purComputeCart();
  // Keep the live real cost on every cart row: purConfirmInvoice and
  // DB.addOrMergeProduct use it to split stock batches.
  _purCart.forEach((item, i) => {
    const line = computed.lines[i];
    if (line) { item.realBuyPrice = line.realBuyPrice; item.realTotal = line.realTotal; }
  });

  container.innerHTML = _purCart.map((item, i) => {
    const line = computed.lines[i] || {};
    return `<div class="cart-item pur-cart-item">
      <div class="cart-item-info">
        <strong>${item.name}</strong>
        <span class="text-muted">${item.barcode}</span>
      </div>
      <div class="cart-item-details">
        <span>${Unit.qtyUnit(item.qty, item)} × DA${fmtMoney(item.buyPrice)}</span>
        <span class="cart-item-total">DA${fmtMoney((item.qty * item.buyPrice))}</span>
      </div>
      <div class="cart-item-extra pur-sensitive">
        <div class="pur-line-row"><span>${t('invoices.purProductDiscount')}</span><b>${fmtMoney(line.purchaseDiscountPct || 0)}%</b></div>
        <div class="pur-line-row"><span>${t('invoices.purLineInvoiceDiscount')}</span><b>DA${fmtMoney(line.globalDiscount || 0)}</b></div>
        <div class="pur-line-row"><span>${t('invoices.realCost')}</span><b>DA${fmtMoney(line.realBuyPrice || 0)}</b></div>
        <div class="pur-line-row"><span>${t('invoices.purRealLineCost')}</span><b>DA${fmtMoney(line.realTotal || 0)}</b></div>
      </div>
      <button class="btn btn-sm btn-danger" onclick="purRemoveFromCart(${i})"><i class="fas fa-times"></i></button>
    </div>`;
  }).join('');
  purRecalcTotal();
}

function purRemoveFromCart(idx) {
  _purCart.splice(idx, 1);
  renderPurCart();
}

function purClearCart() {
  if (_purCart.length === 0) return;
  if (!confirm(t('invoices.purClearConfirm'))) return;
  _purCart = [];
  renderPurCart();
}

// --- Timbre & Total ---
function purRecalcTotal() {
  const computed = _purComputeCart();
  _purCart.forEach((item, i) => {
    const line = computed.lines[i];
    if (line) { item.realBuyPrice = line.realBuyPrice; item.realTotal = line.realTotal; }
  });

  const timbreEnabled = document.getElementById('purTimbreCheck').checked;
  const timbreRate = parseFloat(localStorage.getItem('zmt_timbre_rate') || '1');
  let timbreAmount = 0;
  if (timbreEnabled) {
    timbreAmount = computed.total * (timbreRate / 100);
    if (timbreAmount < 5) timbreAmount = 5;
    if (timbreAmount > 10000) timbreAmount = 10000;
  }
  const total = computed.total + timbreAmount;
  document.getElementById('purCartTotal').textContent = 'DA' + fmtMoney(total);
  const timbreEl = document.getElementById('purTimbreAmount');
  if (timbreEnabled && timbreAmount > 0) {
    timbreEl.textContent = '+ DA' + fmtMoney(timbreAmount);
    timbreEl.style.display = '';
  } else {
    timbreEl.style.display = 'none';
  }

  const summary = document.getElementById('purDiscSummary');
  if (summary) {
    const modeLabel = computed.mode === 'amount'
      ? t('invoices.purFixedDiscountLabel')
      : t('invoices.purPctDiscountLabel').replace('{VAL}', fmtMoney(computed.value));
    summary.innerHTML = `
      <div class="pur-sum-row"><span>${t('invoices.purGrossTotal')}</span><b>DA${fmtMoney(computed.gross)}</b></div>
      <div class="pur-sum-row"><span>${t('invoices.purProductsDiscount')}</span><b>DA${fmtMoney(computed.productDiscountAmount)}</b></div>
      <div class="pur-sum-row"><span>${modeLabel}</span><b>DA${fmtMoney(computed.globalDiscountAmount)}</b></div>
      <div class="pur-sum-row"><span>${t('invoices.purNetBeforeDiscount')}</span><b>DA${fmtMoney(computed.subtotal)}</b></div>
      <div class="pur-sum-row pur-sum-real"><span>${t('invoices.purRealTotal')}</span><b>DA${fmtMoney(computed.total)}</b></div>`;
  }

  purUpdateItemRealPreview();
}

// --- Confirm ---
function purConfirmInvoice() {
  if (_purCart.length === 0) { alert(t('invoices.purCartEmpty')); return; }

  const supplierId = _purCartSupplierId;
  const computed = _purComputeCart();
  let totalAmount = computed.total;
  const invoiceItems = [];

  for (const item of _purCart) {
    if (item.barcode) {
      const conflict = DB.findProductsByBarcode(item.barcode).find(p => !DB.isSameProductIdentity(p, item));
      if (conflict) {
        _purCart = [];
        _purCartSupplierId = null;
        renderPurCart();
        closeInvPurModal();
        alert(t('invoices.barcodeConflict').replace('{NAME}', conflict.name).replace('{CODE}', conflict.barcode));
        return;
      }
    }
  }

  _purCart.forEach((item, index) => {
    const line = computed.lines[index] || {};
    const realBuyPrice = line.realBuyPrice || 0;
    const realTotal = line.realTotal || 0;
    const itemTotal = item.qty * item.buyPrice;

    const res = DB.addOrMergeProduct({
      name: item.name, barcode: item.barcode,
      brandId: item.brandId,
      buyPrice: item.buyPrice, sellPrice: item.sellPrice,
      wholesalePrice: item.wholesalePrice || 0,
      extraPrices: item.extraPrices || {},
      purchaseDiscountPct: item.purchaseDiscountPct || 0,
      realBuyPrice,
      quantity: item.qty, supplierId,
      unit: item.unit, unitLabel: item.unitLabel,
      family: item.family || '',
      expiryDate: item.expiryDate || '',
    }, { source: 'purchase-invoice' });
    if (!res.ok) {
      _purCart = [];
      _purCartSupplierId = null;
      renderPurCart();
      closeInvPurModal();
      alert(res.existing ? t('invoices.barcodeConflict').replace('{NAME}', res.existing.name).replace('{CODE}', res.existing.barcode) : t('invoices.barcodeInvalid'));
      return;
    }

    const prod = res.product;
    invoiceItems.push(Object.assign({
      productId: prod.id, barcode: prod.barcode,
      name: item.name, qty: Unit.roundQty(item.qty),
      // The printed invoice keeps showing the displayed buy price…
      price: item.buyPrice, total: itemTotal,
      // …while the accounting uses the real cost (hidden, print-stripped).
      purchaseDiscountPct: item.purchaseDiscountPct || 0,
      realBuyPrice,
      realTotal,
      globalDiscount: line.globalDiscount || 0,
    }, Unit.snapshot(prod || item)));
  });

  const timbreEnabled = document.getElementById('purTimbreCheck').checked;
  const timbreRate = parseFloat(localStorage.getItem('zmt_timbre_rate') || '1');
  let timbreFiscal = 0;
  if (timbreEnabled) {
    timbreFiscal = totalAmount * (timbreRate / 100);
    if (timbreFiscal < 5) timbreFiscal = 5;
    if (timbreFiscal > 10000) timbreFiscal = 10000;
  }

  const discountFields = {
    purchaseDiscountMode: computed.mode,
    purchaseDiscountValue: computed.value,
    purchaseDiscountAmount: computed.globalDiscountAmount,
    purchaseProductDiscount: computed.productDiscountAmount,
    purchaseGross: computed.gross,
  };

  if (supplierId) {
    DB.addInvoice(Object.assign({
      supplierId, type: 'supplier', date: Date.now(), items: invoiceItems, totalAmount, timbreFiscal,
    }, discountFields));
    const suppliers = DB.getSuppliers();
    const idx = suppliers.findIndex(s => s.id === supplierId);
    if (idx !== -1) {
      suppliers[idx].balance = (parseFloat(suppliers[idx].balance) || 0) + totalAmount;
      DB.saveSuppliers(suppliers);
    }
  } else {
    DB.addInvoice(Object.assign({
      supplierId: null, type: 'purchase', date: Date.now(), items: invoiceItems, totalAmount, timbreFiscal,
    }, discountFields));
  }

  _purCart = [];
  _purCartSupplierId = null;
  document.getElementById('purTimbreCheck').checked = false;
  renderPurCart();
  closeInvPurModal();

  const cnt = invoiceItems.length;
  const totalQty = invoiceItems.reduce((s, it) => s + it.qty, 0);
  let msg = t('invoices.purSavedPrefix') + fmtMoney(totalAmount);
  if (timbreFiscal > 0) msg += t('invoices.purTimbreSuffix') + fmtMoney(timbreFiscal);
  msg += t('invoices.purSavedIncludes').replace('{CNT}', cnt).replace('{QTY}', Unit.fmtQty(totalQty));
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
// `opts.printBasis` mirrors the print dialog: 'net' (190, with remise lines)
// or 'gross' (200) for a discounted purchase invoice. Defaults to the basis
// last chosen for this invoice.
function buildInvoicePrintDocHTML(inv, opts) {
  const isPayment = inv.type === 'payment';
  const paidAmount = isPayment ? (inv.totalAmount || 0) : DB.getInvoiceEffectivePaid(inv);
  const typeLabel = _invTypeLabel(inv);
  const basis = (opts && opts.printBasis) || _invPrintBasisFor(inv);
  const raw = isPayment ? buildPaymentInvoiceHTML(inv) : buildInvoiceDetailHTML(inv, typeLabel, paidAmount, { printBasis: basis });
  const inner = stripInvPrintHidden(raw);
  const ppRule = (typeof PrintPaper !== 'undefined' && PrintPaper) ? PrintPaper.pageRule(0) : '@page{size:A4;margin:0}';
  const css = ppRule + 'html,body{margin:0;padding:0;background:#fff}*{box-sizing:border-box}table{border-collapse:collapse}img{max-width:100%}';
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
    if (window.InvoiceLogo && window.InvoiceLogo.isEnabled()) { try { await window.InvoiceLogo.warm(); } catch (e) {} }
    const html = buildInvoicePrintDocHTML(inv);
    const res = await window.electronAPI.generateInvoicePdf(html);
    if (!res || !res.success) { invToast(t('invoices.pdfGenerateFail'), 'error'); return; }
    const defaultPath = (inv.invoiceNumber || inv.id) + '.pdf';
    const result = await window.electronAPI.saveFile({ defaultPath: defaultPath, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (!result || !result.filePath) return;
    const wr = await window.electronAPI.writeFileBinary(result.filePath, res.data);
    if (wr && wr.success) invToast(t('invoices.pdfSavedOk'), 'success');
    else invToast(t('invoices.pdfSaveFail'), 'error');
  } catch (e) {
    invToast(t('invoices.pdfErrorPrefix') + (e && e.message ? e.message : e), 'error');
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
  if (!to) { showInvEmailError(t('invoices.emailRequired')); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { showInvEmailError(t('invoices.emailInvalid')); return; }
  const num = inv.invoiceNumber || inv.id;
  const subject = document.getElementById('invEmailSubject').value.trim() || ('Facture ' + num);
  const message = document.getElementById('invEmailMessage').value.trim();

  // Generate + save the PDF so the user can attach it, then open Gmail in the browser.
  try {
    if (window.InvoiceLogo && window.InvoiceLogo.isEnabled()) { try { await window.InvoiceLogo.warm(); } catch (e) {} }
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
  invToast(t('invoices.gmailOpened'), 'success');
  closeInvoiceEmail();
}

window.addEventListener('zmt:buyprice-toggle', function () {
  filterInvoices();
  const d = document.getElementById('invDetailModal');
  if (d && d.style.display === 'flex' && _invDetailId) showInvDetail(_invDetailId);
});
