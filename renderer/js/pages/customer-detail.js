var _cdCustomerId = null;
var _cdInvoices = [];
var _cdCurrentInvoiceId = null;
// Edit-session state: lines marked for removal and hand-typed (unlisted) lines.
var _cdEditRemoved = [];
var _cdEditFree = [];
var _cdEditFreeIdx = 0;
var _cdEditPending = null;

function escHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function init_customer_detail() {
  const ctx = window.custCtx;
  if (!ctx || !ctx.customerId) { navigateTo('customers'); return; }
  _cdCustomerId = ctx.customerId;
  const c = DB.getCustomer(_cdCustomerId);
  if (!c) { navigateTo('customers'); return; }

  document.getElementById('cdTitle').textContent = c.name;
  document.getElementById('cdName').textContent = c.name;

  // Avatar
  const avatar = document.getElementById('cdAvatar');
  if (c.photo) {
    avatar.style.background = 'none';
    avatar.innerHTML = `<img src="${c.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  }

  // Details
  const detailsEl = document.getElementById('cdDetails');
  let dhtml = '';
  if (c.phone) dhtml += `<span><i class="fas fa-phone"></i> ${escHtml(c.phone)}</span>`;
  if (c.address) dhtml += `<span><i class="fas fa-map-marker-alt"></i> ${escHtml(c.address)}</span>`;
  if (!c.phone && !c.address) dhtml += `<span class="text-muted">${t('customers.emptyDetails')}</span>`;
  detailsEl.innerHTML = dhtml;

  // Discount
  const discEl = document.getElementById('cdDiscount');
  if (c.discount > 0) {
    discEl.textContent = `${t('customers.discountOnAll')} ${c.discount}${t('customers.discountOnAllSuffix')}`;
  } else {
    discEl.textContent = '';
  }

  _cdInvoices = DB.getInvoicesByCustomer(_cdCustomerId);
  renderCdStats();
  renderCdInvoices();
  renderCdHistory();
  renderCdPayments();
  cdUpdateMergeBtn();

  const subBtn = document.getElementById('cdSubCustomersBtn');
  if (subBtn) subBtn.style.display = (window.CustomerTree && window.CustomerTree.enabled()) ? 'inline-flex' : 'none';
  if (ctx.openChildren && window.CustomerTree && window.CustomerTree.enabled()) {
    setTimeout(function () { openCdSubCustomers(); }, 60);
  }
}

// ===== CUSTOMER TREE — CHILDREN OF THIS PARENT =====
// Everything here is display + tagging. The parent's balance is the single
// ledger; no child account is ever created.
function openCdSubCustomers() {
  if (!(window.CustomerTree && window.CustomerTree.enabled())) return;
  const m = document.getElementById('cdSubCustomersModal');
  if (!m) return;
  if (!m._host) m._host = m.parentNode;
  if (m.parentNode !== document.body) document.body.appendChild(m);
  ['cdSubName', 'cdSubPhone', 'cdSubAddress'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderCdSubCustomers();
  m.style.display = 'flex';
}

function closeCdSubCustomers() {
  const m = document.getElementById('cdSubCustomersModal');
  if (!m) return;
  m.style.display = 'none';
  if (m._host && m.parentNode === document.body) m._host.appendChild(m);
}

function cdAddSubCustomer() {
  if (!(window.CustomerTree && window.CustomerTree.enabled())) return;
  const nameEl = document.getElementById('cdSubName');
  const name = nameEl ? String(nameEl.value || '').trim() : '';
  if (!name) { alert(t('customerTree.nameRequired')); return; }
  const res = (typeof window.CustomerTree.addChildEx === 'function')
    ? window.CustomerTree.addChildEx(_cdCustomerId, {
        name: name,
        phone: document.getElementById('cdSubPhone')?.value || '',
        address: document.getElementById('cdSubAddress')?.value || '',
      })
    : { ok: false, error: 'legacy' };
  if (!res.ok) {
    console.warn('[CustomerDetail] sub-customer save failed:', res.error);
    alert(res.error === 'noParent' ? t('customerTree.noParent')
      : (res.error === 'emptyName' ? t('customerTree.nameRequired') : t('customerTree.saveFailed')));
    return;
  }
  renderCdSubCustomers();
  if (nameEl) nameEl.value = '';
}

function cdRemoveSubCustomer(childId) {
  if (!(window.CustomerTree && window.CustomerTree.enabled())) return;
  if (!confirm(t('customerTree.deleteConfirm'))) return;
  if (window.CustomerTree.removeChild(_cdCustomerId, childId)) renderCdSubCustomers();
}

function cdPayChildInvoice(invId, childId) {
  closeCdSubCustomers();
  showCdInvoiceDetail(invId);
  const sel = document.getElementById('cdPaySubCustomer');
  if (sel) sel.value = childId;
}

function cdConfirmChildVoucher(childId) {
  if (!(window.CustomerTree && window.CustomerTree.enabled())) return;
  const amountEl = document.getElementById('cdVoucher_' + childId);
  const amount = parseFloat(amountEl?.value) || 0;
  if (amount <= 0) { alert(t('invoices.invalidAmount')); return; }
  const parent = DB.getCustomer(_cdCustomerId);
  const child = window.CustomerTree.findChild(childId);
  if (!parent || !child) return;
  const meta = window.CustomerTree.metaFor(child, parent) || {};
  const method = document.getElementById('cdVoucherMethod_' + childId)?.value || 'cash';
  // Same single-movement voucher as invoices.js confirmPaymentInvoice();
  // customerId is the parent and the balance is reduced exactly once here.
  DB.addInvoice({
    type: 'payment',
    direction: 'in',
    customerId: _cdCustomerId,
    ...meta,
    totalAmount: amount,
    paidAmount: amount,
    items: [],
    date: new Date().toISOString().slice(0, 10),
    method: method,
    note: ((t('invoices.custVoucherNote') || t('customerTree.voucher')) + ' — ' + child.name).slice(0, 300),
    isProvisional: false,
  }, { payment: true });
  const customers = DB.getCustomers();
  const cIdx = customers.findIndex(c => c.id === _cdCustomerId);
  if (cIdx !== -1) {
    customers[cIdx].balance = (parseFloat(customers[cIdx].balance) || 0) - amount;
    DB.saveCustomers(customers);
  }
  renderCdSubCustomers();
  renderCdStats();
  renderCdInvoices();
  renderCdPayments();
}

function renderCdSubCustomers() {
  const listEl = document.getElementById('cdSubList');
  const parent = DB.getCustomer(_cdCustomerId);
  if (!listEl || !parent) return;
  const pEl = document.getElementById('cdSubParentLine');
  if (pEl) pEl.innerHTML = escHtml(t('customerTree.of') || '') + ': <b>' + escHtml(parent.name) + '</b>';
  const kids = window.CustomerTree.childrenOf(_cdCustomerId);
  if (!kids.length) {
    listEl.innerHTML = '<div style="padding:14px;color:var(--silver-500);font-size:12px">' + escHtml(t('customerTree.noChildren') || '') + '</div>';
    return;
  }
  const invoices = DB.getInvoicesByCustomer(_cdCustomerId) || [];
  const payments = DB.getCustomerPayments(_cdCustomerId) || [];
  const debts = window.CustomerTree.childDebts(parent, kids, invoices);
  listEl.innerHTML = kids.map(function (k) {
    const kidInvs = invoices.filter(inv => inv && inv.type !== 'payment' && String(inv.subCustomerId || '') === k.id);
    const kidPays = payments.filter(p => p && String(p.subCustomerId || '') === k.id);
    const debt = debts[k.id] || 0;
    const invRows = kidInvs.length
      ? kidInvs.map(function (inv) {
          const due = DB.getInvoiceRemaining(inv);
          return '<div class="ct-child-row"><span>#' + escHtml(inv.invoiceNumber || inv.id) + ' · ' + fmtMoney(inv.totalAmount || 0) + ' DA</span>' +
            '<span>' + (due > 0 ? escHtml(t('customerTree.debt')) + ': ' + fmtMoney(due) + ' DA' : escHtml(t('invoices.receivedLabel') || '')) + '</span>' +
            (due > 0 ? '<button class="btn btn-sm btn-success" onclick="cdPayChildInvoice(\'' + escHtml(inv.id) + '\',\'' + escHtml(k.id) + '\')">' + escHtml(t('customerTree.pay')) + '</button>' : '') +
            '</div>';
        }).join('')
      : '<div class="ct-child-empty">' + escHtml(t('customerTree.invoices')) + ': 0</div>';
    const payRows = kidPays.length
      ? kidPays.slice(-8).reverse().map(function (p) {
          return '<div class="ct-child-row"><span>' + escHtml(p.date ? new Date(p.date).toLocaleDateString() : '') + '</span>' +
            '<span style="color:#2e7d32;font-weight:700">+' + fmtMoney(p.amount || 0) + ' DA</span>' +
            '<span class="text-muted">' + escHtml(p.note || '') + '</span></div>';
        }).join('')
      : '<div class="ct-child-empty">' + escHtml(t('customerTree.payments')) + ': 0</div>';
    return '<div class="ct-child-card" style="border:1px solid var(--silver-300,#d1d5db);border-radius:8px;padding:11px 12px;background:var(--silver-50,#fff)">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<b style="font-size:14px"><i class="fas fa-user-tag" style="color:#2563eb;margin-inline-end:5px"></i>' + escHtml(k.name) + '</b>' +
        (k.phone ? '<span class="text-muted" dir="ltr">' + escHtml(k.phone) + '</span>' : '') +
        (k.address ? '<span class="text-muted">' + escHtml(k.address) + '</span>' : '') +
        '<span style="margin-inline-start:auto;color:#dc3545;font-weight:700;font-size:12px">' + escHtml(t('customerTree.debt')) + ': DA' + fmtMoney(debt) + '</span>' +
        '<button class="btn btn-sm btn-danger" onclick="cdRemoveSubCustomer(\'' + escHtml(k.id) + '\')" title="' + escHtml(t('customerTree.remove')) + '"><i class="fas fa-trash"></i></button>' +
      '</div>' +
      '<div style="margin-top:8px;font-size:11px;font-weight:700;color:var(--silver-600)">' + escHtml(t('customerTree.invoices')) + '</div>' + invRows +
      '<div style="margin-top:8px;font-size:11px;font-weight:700;color:var(--silver-600)">' + escHtml(t('customerTree.payments')) + '</div>' + payRows +
      '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:9px">' +
        '<input type="number" class="form-input no-spinner" id="cdVoucher_' + escHtml(k.id) + '" min="0" step="0.01" placeholder="0.00" style="width:120px">' +
        '<select class="form-input" id="cdVoucherMethod_' + escHtml(k.id) + '" style="width:100px"><option value="cash">' + escHtml(t('sales.payCash')) + '</option><option value="ccp">' + escHtml(t('sales.payCcp')) + '</option></select>' +
        '<button class="btn btn-sm btn-success" onclick="cdConfirmChildVoucher(\'' + escHtml(k.id) + '\')"><i class="fas fa-receipt"></i> ' + escHtml(t('customerTree.voucher')) + '</button>' +
      '</div></div>';
  }).join('');
}

function renderCdStats() {
  const c = DB.getCustomer(_cdCustomerId);
  if (!c) return;

  const statInvoices = _cdInvoices.filter(inv => inv.type !== 'payment');
  const statPayments = DB.getCustomerPayments(_cdCustomerId).filter(p => {
    const r = p.invoiceId ? DB.getInvoice(p.invoiceId) : null;
    return !(r && r.type === 'payment');
  });
  const totalPurchases = statInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
  const totalPaid = statPayments.reduce((sum, p) => sum + p.amount, 0);
  const balance = parseFloat(c.balance) || 0;

  document.getElementById('cdTotalPurchases').textContent = `DA${fmtMoney(totalPurchases)}`;
  document.getElementById('cdTotalPaid').textContent = `DA${fmtMoney(totalPaid)}`;
  document.getElementById('cdBalance').textContent = (balance < 0 ? '-' : '') + `DA${fmtMoney(Math.abs(balance))}`;

  document.getElementById('cdInvCount').textContent = _cdInvoices.length;
  const returns = DB.getReturns().filter(r => r.customerId === _cdCustomerId || r.relatedTo === _cdCustomerId);
  document.getElementById('cdHistCount').textContent = _cdInvoices.length + returns.length;
  document.getElementById('cdPayCount').textContent = statPayments.length;
}

// ===== INVOICES TAB =====

function renderCdInvoices(filter) {
  const container = document.getElementById('cdInvoicesList');
  let list = _cdInvoices;
  const q = normSearch(filter || '').toLowerCase();
  if (q) {
    list = list.filter(inv => {
      const date = new Date(inv.date || inv.createdAt).toLocaleDateString('ar-EG-u-nu-latn');
      return date.includes(q) || inv.items.some(it => it.name.toLowerCase().includes(q));
    });
  }

  if (list.length === 0) {
    container.innerHTML = `<div class="placeholder-box" style="margin-top:20px">
      <i class="fas fa-file-invoice" style="font-size:40px;color:#555"></i>
      <p>${filter ? t('customers.noInvoicesFound') : t('customers.noInvoicesForCustomer')}</p>
    </div>`;
    return;
  }

  container.innerHTML = list.map((inv, i) => {
    const date = new Date(inv.date || inv.createdAt);
    const dateStr = date.toLocaleDateString('ar-EG-u-nu-latn');
    const timeStr = date.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
    const paidAmount = inv.type === 'payment' ? (inv.totalAmount || 0) : DB.getInvoiceEffectivePaid(inv);
    const remaining = Math.max(0, (inv.totalAmount || 0) - paidAmount);
    const modified = inv.modifiedAt ? '<span class="badge badge-warning" style="font-size:10px;margin-right:6px"><i class="fas fa-pen"></i> ' + t('customers.modified') + '</span>' : '';
    const products = inv.type === 'payment'
      ? (inv.direction === 'out' ? t('customers.paymentToSupplier') : t('customers.paymentVoucher'))
      : inv.items.map(it => it.name).join(', ').substring(0, 50);

    return `<div class="sd-invoice-card" onclick="showCdInvoiceDetail('${inv.id}')">
      <div class="sd-inv-head">
        <div>
          <span class="sd-inv-num">${t('customers.invoiceNumber')}${i + 1}</span>
          ${modified}
        </div>
        <span class="sd-inv-date"><i class="far fa-calendar-alt"></i> ${dateStr} ${timeStr}</span>
      </div>
      <div class="sd-inv-body">
        <div class="sd-inv-items">
          <span style="font-size:11px;color:var(--silver-600)">${escHtml(products.substring(0, 40))}${products.length > 40 ? '...' : ''}</span>
        </div>
        <div style="text-align:left">
          <div class="sd-inv-total">DA${fmtMoney(inv.totalAmount)}</div>
          <div style="font-size:10px;margin-top:4px">
            <span style="color:#28a745">${t('customers.paid')}: DA${fmtMoney(paidAmount)}</span>
            ${remaining > 0 ? `<span style="color:#e65100;margin-right:6px">${t('customers.remaining')}: DA${fmtMoney(remaining)}</span>` : ''}
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function filterCdInvoices(q) {
  renderCdInvoices(q);
}

// ===== HISTORY TAB =====

function renderCdHistory() {
  _cdRenderHistoryStats();
  const container = document.getElementById('cdHistoryList');

  const entries = [];

  _cdInvoices.forEach((inv, idx) => {
    const date = new Date(inv.date || inv.createdAt);
    entries.push({
      date,
      ts: inv.createdAt,
      type: t('customers.typeSale'),
      desc: inv.type === 'payment'
        ? `${t('customers.receipt')} ${inv.invoiceNumber || ''} — ${inv.direction === 'out' ? t('customers.paymentToSupplier') : t('customers.collectionFromCustomer')}`
        : `${t('customers.invoiceNumber')}${idx + 1} - ${inv.items.length} ${t('customers.productNoun')}`,
      amount: inv.totalAmount,
      badge: 'info',
      invoiceNum: idx + 1,
    });
  });

  const returns = DB.getReturns().filter(r => r.customerId === _cdCustomerId || r.relatedTo === _cdCustomerId);
  returns.forEach(r => {
    entries.push({
      date: new Date(r.createdAt),
      ts: r.createdAt,
      type: t('customers.returnType'),
      desc: `${t('customers.returnType')}: ${r.productName} x${Unit.qtyUnit(r.qty, r)} (${r.reason || t('customers.noReason')})`,
      amount: 0,
      badge: 'warning',
    });
  });

  entries.sort((a, b) => b.ts - a.ts);

  if (entries.length === 0) {
    container.innerHTML = `<div class="placeholder-box"><i class="fas fa-history" style="font-size:40px;color:#555"></i><p>${t('customers.historyEmpty')}</p></div>`;
    return;
  }

  container.innerHTML = entries.map(e => {
    const dateStr = e.date.toLocaleDateString('ar-EG-u-nu-latn');
    const timeStr = e.date.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
    return `<div class="sd-pay-row" style="display:flex;justify-content:space-between;align-items:center">
      <div class="sd-pay-row-left">
        <span class="badge badge-${e.badge}">${e.type}</span>
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--silver-800)">${escHtml(e.desc)}</div>
          <div style="font-size:11px;color:var(--silver-500);margin-top:2px"><i class="far fa-calendar-alt"></i> ${dateStr} ${timeStr}</div>
        </div>
      </div>
      <div style="font-weight:700;color:${e.type === t('customers.returnType') ? '#e65100' : '#0066B1'}">DA${fmtMoney(e.amount)}</div>
    </div>`;
  }).join('');
}

function _cdRenderHistoryStats() {
  const statEl = document.getElementById('cdHistoryStats');
  if (!statEl) return;
  const sales = _cdInvoices.filter(inv => inv.type !== 'payment');
  const returns = DB.getReturns().filter(r => r.customerId === _cdCustomerId || r.relatedTo === _cdCustomerId);
  const saleAmount = sales.reduce((s, inv) => s + (inv.totalAmount || 0), 0);
  statEl.innerHTML = `
    <div class="rec-chip">
      <span class="rec-chip-icon" style="background:#e3f2fd;color:#1565c0"><i class="fas fa-shopping-cart"></i></span>
      <div>
        <div class="rec-chip-label">${t('customers.historySalesCount')}</div>
        <div class="rec-chip-val">${sales.length} <small>${t('customers.historySalesCountInvoice')}</small> · DA${fmtMoney(saleAmount)}</div>
      </div>
    </div>
    <div class="rec-chip">
      <span class="rec-chip-icon" style="background:#fff3e0;color:#e65100"><i class="fas fa-undo-alt"></i></span>
      <div>
        <div class="rec-chip-label">${t('customers.historyReturnsCount')}</div>
        <div class="rec-chip-val">${returns.length} <small>${t('customers.historyReturnsCountReturn')}</small></div>
      </div>
    </div>`;
}

// ===== PAYMENTS TAB =====

function renderCdPayments() {
  const container = document.getElementById('cdPaymentsList');
  const payments = DB.getCustomerPayments(_cdCustomerId);

  if (payments.length === 0) {
    container.innerHTML = `<div class="placeholder-box"><i class="fas fa-money-bill-wave" style="font-size:40px;color:#555"></i><p>${t('customers.paymentsEmpty')}</p></div>`;
    return;
  }

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

  container.innerHTML = `
    <div class="sd-pay-header">
      <span>${t('customers.paymentsTotal')}: <strong style="color:#28a745">DA${fmtMoney(totalPaid)}</strong></span>
    </div>
    <div class="sd-pay-list">
      ${payments.sort((a, b) => b.createdAt - a.createdAt).map(p => {
        const d = new Date(p.createdAt);
        const dateStr = d.toLocaleDateString('ar-EG-u-nu-latn');
        const timeStr = d.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
        return `<div class="sd-pay-row">
          <div class="sd-pay-row-left">
            <div class="sd-pay-amount" style="color:#28a745">DA${fmtMoney(p.amount)}</div>
            <div class="sd-pay-meta">
              <span class="sd-pay-date"><i class="far fa-calendar-alt"></i> ${dateStr} ${timeStr}</span>
              ${p.note ? `<span class="sd-pay-note"><i class="fas fa-sticky-note"></i> ${escHtml(p.note)}</span>` : ''}
              ${p.invoiceId ? `<span class="sd-pay-note"><i class="fas fa-file-invoice"></i> ${t('customers.paymentForInvoice')}</span>` : ''}
              ${p.type === 'customer_direct' ? `<span class="sd-pay-note" style="color:#6a1b9a"><i class="fas fa-hand-holding-usd"></i> ${t('customers.directPayBadge')}</span>` : ''}
            </div>
          </div>
          ${p.type === 'customer_direct' ? `
          <div class="sd-pay-row-actions" style="display:flex;gap:6px;align-items:center;padding:0 10px">
            <button class="btn btn-sm" onclick="openCdDirectPayment('${p.id}')" title="${t('common.edit')}"><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm btn-danger" onclick="deleteCdDirectPayment('${p.id}')" title="${t('common.delete')}"><i class="fas fa-trash"></i></button>
          </div>` : ''}
        </div>`;
      }).join('')}
    </div>`;
}

// ===== DIRECT CUSTOMER PAYMENT ==============================================
// Stored as a Payment row with type:'customer_direct' and no invoice link, so
// the shared cash-in helper books it as revenue on its own date. The customer's
// balance may go negative (the shop then owes the customer).

var _cdDirectPayEditId = null;

function _cdAdjustBalance(delta) {
  const customers = DB.getCustomers();
  const idx = customers.findIndex(c => c.id === _cdCustomerId);
  if (idx === -1) return;
  customers[idx].balance = (parseFloat(customers[idx].balance) || 0) + delta;
  DB.saveCustomers(customers);
}

function openCdDirectPayment(id) {
  const p = id ? DB.getPayments().find(x => x.id === id) : null;
  if (id && (!p || p.type !== 'customer_direct' || p.customerId !== _cdCustomerId)) return;
  _cdDirectPayEditId = p ? p.id : null;
  const title = document.getElementById('cdDirectPayTitle');
  if (title) title.textContent = p ? t('customers.editDirectPayment') : t('customers.addDirectPayment');
  const amountEl = document.getElementById('cdDirectPayAmount');
  const dateEl = document.getElementById('cdDirectPayDate');
  const methodEl = document.getElementById('cdDirectPayMethod');
  const noteEl = document.getElementById('cdDirectPayNote');
  if (amountEl) amountEl.value = p ? Number(p.amount || 0).toFixed(2) : '0';
  if (dateEl) dateEl.value = _invDateToInput(p ? (p.createdAt || p.date || Date.now()) : Date.now());
  if (methodEl) methodEl.value = p ? (p.method || 'cash') : 'cash';
  if (noteEl) noteEl.value = p ? (p.note || '') : '';
  document.getElementById('cdDirectPaymentModal').style.display = 'flex';
}

function closeCdDirectPayment() {
  _cdDirectPayEditId = null;
  document.getElementById('cdDirectPaymentModal').style.display = 'none';
}

function saveCdDirectPayment() {
  const amount = Unit.parse(document.getElementById('cdDirectPayAmount').value);
  if (!(amount > 0)) { alert(t('customers.amountRequired')); return; }
  const ts = _invInputToDate(document.getElementById('cdDirectPayDate').value);
  if (!ts) { alert(t('expiry.invalidDate')); return; }
  const method = document.getElementById('cdDirectPayMethod').value || 'cash';
  const note = (document.getElementById('cdDirectPayNote').value || '').trim();

  if (_cdDirectPayEditId) {
    const old = DB.getPayments().find(x => x.id === _cdDirectPayEditId);
    if (!old || old.type !== 'customer_direct') { closeCdDirectPayment(); return; }
    DB.updatePayment(_cdDirectPayEditId, { amount, note, method, createdAt: ts, date: ts });
    // The old amount had already reduced the balance; replace it by the new one.
    _cdAdjustBalance((Number(old.amount) || 0) - amount);
  } else {
    DB.addPayment({
      customerId: _cdCustomerId, type: 'customer_direct',
      amount, note, method, createdAt: ts, date: ts
    });
    _cdAdjustBalance(-amount);
  }
  closeCdDirectPayment();
  renderCdStats();
  renderCdPayments();
  renderCdHistory();
  renderCdInvoices();
}

function deleteCdDirectPayment(id) {
  const p = DB.getPayments().find(x => x.id === id);
  if (!p || p.type !== 'customer_direct' || p.customerId !== _cdCustomerId) return;
  if (!confirm(t('customers.deletePaymentConfirm'))) return;
  if (!DB.deletePayment(id)) return;
  _cdAdjustBalance(Number(p.amount) || 0);
  renderCdStats();
  renderCdPayments();
  renderCdHistory();
  renderCdInvoices();
}

// ===== TAB SWITCHING =====

function switchCdTab(tab) {
  document.querySelectorAll('#page-customer-detail .sd-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab || (!b.dataset.tab && tab === 'invoices'));
  });
  document.getElementById('cdTabInvoices').style.display = tab === 'invoices' ? '' : 'none';
  document.getElementById('cdTabHistory').style.display = tab === 'history' ? '' : 'none';
  document.getElementById('cdTabPayments').style.display = tab === 'payments' ? '' : 'none';
}

// ===== INVOICE DETAIL =====

// The invoice dialogs live inside the cached page HTML, i.e. inside the
// scrollable #pageContainer. `position:fixed` would then resolve against that
// scrolled ancestor and the dialog would appear at the TOP of a long list.
// Portal them to <body> while open (the same fix used by invoices.js) and put
// them back on close so the router's cleanup/cache keeps working.
function _cdPortalModal(id, show) {
  const m = document.getElementById(id);
  if (!m) return;
  if (show) {
    if (!m._host || m._host === document.body) m._host = m.parentNode;
    if (m.parentNode !== document.body) document.body.appendChild(m);
    m.style.display = 'flex';
  } else {
    m.style.display = 'none';
    if (m._host && m._host !== document.body && m._host.isConnected && m.parentNode === document.body) {
      m._host.appendChild(m);
    }
  }
}

function showCdInvoiceDetail(id) {
  _cdCurrentInvoiceId = id;
  const inv = DB.getInvoice(id);
  if (!inv) return;

  const invIdx = _cdInvoices.findIndex(x => x.id === id);
  const date = new Date(inv.date || inv.createdAt);
  const dateStr = date.toLocaleDateString('ar-EG-u-nu-latn');
  const timeStr = date.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });

  const paidAmount = inv.type === 'payment' ? (inv.totalAmount || 0) : DB.getInvoiceEffectivePaid(id);
  const remaining = Math.max(0, (inv.totalAmount || 0) - paidAmount);
  const modified = inv.modifiedAt ? `<span class="badge badge-warning" style="margin-right:8px"><i class="fas fa-pen"></i> ${t('customers.modified')}</span>` : '';
  // Prefer the historical snapshot on the invoice; resolve the live label only
  // for older rows that stored an id without a name.
  const ctChild = (window.CustomerTree && inv.subCustomerId && typeof window.CustomerTree.findChild === 'function')
    ? window.CustomerTree.findChild(inv.subCustomerId) : null;
  const ctName = inv.subCustomerName || (ctChild && ctChild.name) || '';

  document.getElementById('cdInvModalTitle').textContent = `#${invIdx + 1}`;

  document.getElementById('cdInvoiceBody').innerHTML = `
    <div class="sd-inv-detail-header">
      <span><strong>${t('customers.invoiceDate')}:</strong> ${dateStr} ${timeStr} ${modified}</span>
      <span><strong>${t('customers.invoiceTotal')}:</strong> <span style="color:#0066B1">DA${fmtMoney((inv.totalAmount || 0))}</span></span>
    </div>
    ${(inv.subCustomerName || inv.subCustomerId) ? `
    <div class="ct-tree-note" style="margin-top:10px">
      <div style="font-size:10px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">${escHtml(t('customerTree.printLabel') || 'Client secondaire')}</div>
      <div style="font-weight:700">${escHtml(ctName)}</div>
    </div>` : ''}
    <div style="display:flex;gap:20px;margin:12px 0;padding:12px 16px;background:var(--silver-50);border-radius:var(--radius-sm)">
      <div>
        <span style="font-size:11px;color:var(--silver-500)">${t('customers.paid')}</span>
        <div style="font-size:16px;font-weight:700;color:#28a745;margin-top:2px">DA${fmtMoney(paidAmount)}</div>
      </div>
      <div>
        <span style="font-size:11px;color:var(--silver-500)">${t('customers.remaining')}</span>
        <div style="font-size:16px;font-weight:700;color:${remaining > 0 ? '#e65100' : '#28a745'};margin-top:2px">DA${fmtMoney(remaining)}</div>
      </div>
    </div>
    <div class="table-container">
      <table class="data-table">
        <thead><tr>
          <th>#</th><th>${t('customers.colProduct')}</th><th>${t('customers.colBarcode')}</th><th>${t('customers.colQty')}</th><th>${t('customers.colPrice')}</th><th>${t('customers.colTotal')}</th>
        </tr></thead>
        <tbody>
          ${inv.items.map((item, i) => `<tr>
            <td>${i + 1}</td>
            <td>${escHtml(item.name)}</td>
            <td dir="ltr">${item.barcode}</td>
            <td>${Unit.qtyUnit(item.qty, item)}</td>
            <td>DA${fmtMoney(item.price)}</td>
            <td>DA${fmtMoney(item.total)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  const paySection = document.getElementById('cdPayInvoiceSection');
  const payInput = document.getElementById('cdPayInvoiceAmount');
  if (remaining > 0) {
    paySection.style.display = 'flex';
    payInput.value = remaining.toFixed(2);
    payInput.max = remaining;
    const ctSel = document.getElementById('cdPaySubCustomer');
    if (ctSel && window.CustomerTree && typeof window.CustomerTree.fillSelect === 'function') {
      const useful = window.CustomerTree.fillSelect(ctSel, _cdCustomerId, t('customerTree.none'));
      ctSel.style.display = useful ? '' : 'none';
      // Open on THIS invoice's child; the user can still switch to another
      // child or to «no sub-customer» for the payment being recorded.
      if (useful && typeof window.CustomerTree.selectInvoiceChild === 'function') {
        window.CustomerTree.selectInvoiceChild(ctSel, inv, _cdCustomerId);
      }
    }
  } else {
    paySection.style.display = 'none';
  }

  document.getElementById('cdDeleteInvoiceBtn').style.display = 'inline-flex';
  _cdPortalModal('cdInvoiceModal', true);
}

// ===== PAY FROM INVOICE =====

function payInvoiceFromCd() {
  const inv = DB.getInvoice(_cdCurrentInvoiceId);
  if (!inv) return;

  const paidAmount = DB.getInvoiceEffectivePaid(_cdCurrentInvoiceId);
  const remaining = DB.getInvoiceRemaining(inv);
  if (remaining <= 0) { alert(t('customers.paidInFull')); return; }

  const amount = parseFloat(document.getElementById('cdPayInvoiceAmount').value);
  if (!amount || amount <= 0) { alert(t('customers.amountRequired')); return; }
  if (amount > remaining) { alert(`${t('customers.amountExceedsRemaining')} (DA${fmtMoney(remaining)})`); return; }

  const invNum = _cdInvoices.findIndex(inv => inv.id === _cdCurrentInvoiceId) + 1;

  // Customer tree: the chosen child is only a tag. customerId remains the
  // parent and the balance is reduced once, by the existing code below.
  const ctMeta = (window.CustomerTree && _cdCustomerId)
    ? window.CustomerTree.metaFromSelect(document.getElementById('cdPaySubCustomer'), DB.getCustomer(_cdCustomerId))
    : {};
  DB.addPayment({
    customerId: _cdCustomerId,
    ...ctMeta,
    invoiceId: _cdCurrentInvoiceId,
    amount,
    method: (document.getElementById('cdPayMethod')?.value) || 'cash',
    note: `${t('customers.paymentAgainstInvoice')} #${invNum}`,
  });

  // Update customer balance
  const customers = DB.getCustomers();
  const cIdx = customers.findIndex(c => c.id === _cdCustomerId);
  if (cIdx !== -1) {
    customers[cIdx].balance = (parseFloat(customers[cIdx].balance) || 0) - amount;
    DB.saveCustomers(customers);
  }

  _cdPortalModal('cdInvoiceModal', false);
  renderCdStats();
  renderCdPayments();
  renderCdInvoices();
}

// ===== DELETE INVOICE =====

function deleteInvoiceFromCd() {
  if (!confirm(t('customers.deleteInvoiceConfirm'))) return;

  const inv = DB.getInvoice(_cdCurrentInvoiceId);
  if (!inv) return;

  const paidAmount = DB.getInvoicePaidAmount(_cdCurrentInvoiceId);
  const remaining = (inv.totalAmount || 0) - paidAmount;

  // 1. Return quantities to inventory (skip for provisional & dispatch)
  if (!inv.isProvisional && inv.type !== 'dispatch') {
    inv.items.forEach(item => {
      // Bundle rows restore whatever components the customer still holds;
      // pieces already returned by an earlier edit are not restored twice.
      if (typeof SaleCore !== 'undefined' && SaleCore.isBundleItem && SaleCore.isBundleItem(item)) {
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
        DB.updateProduct(item.productId, { quantity: prod.quantity + item.qty });
      }
    });
  }

  // 2. Remove payments
  DB.deletePaymentsByInvoice(_cdCurrentInvoiceId);

  // 3. Remove returns linked to this invoice
  DB.deleteReturnsByInvoice(_cdCurrentInvoiceId);

  // 3b. Remove discounts linked to this invoice
  DB.deleteDiscountsByInvoice(_cdCurrentInvoiceId);

  // 4. Update customer balance
  if (inv.customerId) {
    const customers = DB.getCustomers();
    const cIdx = customers.findIndex(c => c.id === inv.customerId);
    if (cIdx !== -1) {
      const currentBalance = parseFloat(customers[cIdx].balance) || 0;
      // A payment voucher reduced the balance when created — deleting it
      // restores its amount (unlike a credit invoice which is reversed).
      customers[cIdx].balance = inv.type === 'payment'
        ? currentBalance + (inv.totalAmount || 0)
        : currentBalance - remaining;
      DB.saveCustomers(customers);
    }
  }

  // 5. Delete invoice
  DB.deleteInvoice(_cdCurrentInvoiceId);

  _cdPortalModal('cdInvoiceModal', false);

  _cdInvoices = DB.getInvoicesByCustomer(_cdCustomerId);
  renderCdStats();
  renderCdInvoices();
  renderCdHistory();
  renderCdPayments();
}

// ===== EDIT INVOICE =====

function _cdBundleComponentsHtml(item, i) {
  if (typeof SaleCore === 'undefined' || !SaleCore.bundleHeldComponents) return '';
  const comps = SaleCore.bundleHeldComponents(DB, item);
  if (!comps.length) return '';
  return `<div style="margin-top:10px;background:#f5f8ff;border:1px solid #d9e6ff;border-radius:8px;padding:8px 10px">
    <div style="font-size:11px;font-weight:700;color:var(--bmw-blue-1);margin-bottom:6px">
      <i class="fas fa-gift"></i> مكونات الباقة — إرجاع جزئي
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr style="color:var(--silver-600)">
        <th style="text-align:right;padding:3px 4px">المكوّن</th>
        <th style="text-align:center;padding:3px 4px">المباع</th>
        <th style="text-align:center;padding:3px 4px">مرتجع سابقاً</th>
        <th style="text-align:center;padding:3px 4px">المتبقي</th>
        <th style="text-align:center;padding:3px 4px">إرجاع الآن</th>
      </tr></thead>
      <tbody>
        ${comps.map((c, j) => `<tr>
          <td style="padding:3px 4px">${escHtml(c.name || c.barcode || '')}</td>
          <td style="text-align:center;padding:3px 4px">${Unit.qtyUnit(c.soldQty, DB.getProduct(c.productId) || c)}</td>
          <td style="text-align:center;padding:3px 4px;color:${c.returnedQty > 0 ? '#e65100' : 'var(--silver-500)'};font-weight:${c.returnedQty > 0 ? '700' : '400'}">${Unit.qtyUnit(c.returnedQty, DB.getProduct(c.productId) || c)}</td>
          <td style="text-align:center;padding:3px 4px;font-weight:700">${Unit.qtyUnit(c.heldQty, DB.getProduct(c.productId) || c)}</td>
          <td style="text-align:center;padding:3px 4px">
            <input type="text" class="form-input no-spinner num-input" inputmode="decimal" id="cdEditCompReturn_${i}_${j}" value="0" min="0" step="any" ${c.heldQty <= 0 ? 'disabled ' : ''}oninput="recalcCdEditItem(${i})" style="width:68px;padding:3px 5px;font-size:12px;text-align:center">
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function _cdBundleCreditValue(item, i) {
  let credit = parseFloat(item.bundleReturnCredit) || 0;
  if (typeof SaleCore === 'undefined' || !SaleCore.bundleHeldComponents) return credit;
  const comps = SaleCore.bundleHeldComponents(DB, item);
  comps.forEach((c, j) => {
    const inp = document.getElementById(`cdEditCompReturn_${i}_${j}`);
    if (!inp) return;
    let q = Unit.parse(inp.value);
    if (!(q > 0)) return;
    q = Math.min(Unit.roundQty(q), c.heldQty);
    credit += (parseFloat(c.valuePerBundle) || 0) * q;
  });
  return credit;
}

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

function editCdInvoice(keepState) {
  const inv = DB.getInvoice(_cdCurrentInvoiceId);
  if (!inv) return;
  if (inv.type === 'payment') { alert(t('customers.receiptReadonly')); return; }

  const invIdx = _cdInvoices.findIndex(x => x.id === _cdCurrentInvoiceId);
  document.getElementById('cdEditInvTitle').textContent = `#${invIdx + 1}`;

  const paidNow = DB.getInvoicePaidAmount(_cdCurrentInvoiceId);
  if (!keepState) { _cdEditRemoved = []; _cdEditFree = []; _cdEditFreeIdx = 0; }

  const html = inv.items.map((item, i) => {
    const prod = DB.getProduct(item.productId);
    const currentQty = prod ? prod.quantity : 0;
    // item.price IS the unit price (the whole app treats it that way, and the
    // invoices page edits it as such). Dividing it by the quantity turned a
    // 3-piece line into a third of its price — and a 0.25 kg label into four
    // times its own, which the save then wrote back onto the invoice.
    const unitPrice = Number(item.price) || 0;
    const isBundle = typeof SaleCore !== 'undefined' && SaleCore.isBundleItem && SaleCore.isBundleItem(item);
    const credit = isBundle ? (parseFloat(item.bundleReturnCredit) || 0) : 0;
    const bundleBlock = isBundle ? _cdBundleComponentsHtml(item, i) : '';
    const removed = _cdEditRemoved.includes(i);
    return `<div id="cdEditLine_${i}" style="background:var(--silver-50);border:1px solid var(--silver-300);border-radius:var(--radius-sm);padding:12px;margin-bottom:8px;${removed ? 'opacity:.55' : ''}">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <strong style="font-size:13px;${removed ? 'text-decoration:line-through' : ''}">${escHtml(item.name)}${isBundle ? ' <span style="font-size:10px;color:var(--bmw-blue-1);background:#eaf1ff;border-radius:4px;padding:1px 5px"><i class="fas fa-gift"></i> باقة</span>' : ''}</strong>
        <span style="font-size:11px;color:var(--silver-500)" dir="ltr">${removed ? `<button class="btn btn-sm" onclick="unmarkCdEditRemove(${i})" style="padding:1px 6px;font-size:10px;margin-left:6px"><i class="fas fa-undo"></i> ${t('invoices.qeUndoRemove')}</button>` : `<button class="btn btn-sm btn-danger" onclick="markCdEditRemove(${i})" title="${t('invoices.deleteLine')}" style="padding:1px 6px;font-size:10px;margin-left:6px"><i class="fas fa-trash"></i></button>`}${t('customers.barcodeLabel')}: ${item.barcode}</span>
      </div>
      <div style="font-size:11px;color:var(--silver-500);margin-bottom:6px">${t('customers.currentStock')}: <strong>${currentQty}</strong></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <div>
          <label style="font-size:11px;color:var(--silver-600);display:block;margin-bottom:2px">${t('customers.colQty')}</label>
          <input type="text" class="form-input no-spinner num-input" inputmode="decimal" id="cdEditItemQty_${i}" value="${Unit.fmtQty(item.qty, item.qtyDecimals)}" min="0" step="any" ${removed ? 'disabled ' : ''}style="padding:6px 8px;font-size:13px" oninput="recalcCdEditItem(${i})">
        </div>
        <div>
          <label style="font-size:11px;color:var(--silver-600);display:block;margin-bottom:2px">${t('customers.unitPriceLabel')}</label>
          <div style="padding:6px 8px;font-size:13px;font-weight:700;color:var(--silver-800);background:var(--silver-100);border-radius:var(--radius-sm)">DA${unitPrice.toFixed(6)}</div>
          <input type="hidden" id="cdEditItemUnitPrice_${i}" value="${unitPrice}">
        </div>
        <div>
          <label style="font-size:11px;color:var(--silver-600);display:block;margin-bottom:2px">${t('customers.colTotal')}</label>
          <div style="padding:6px 8px;font-size:13px;font-weight:700;color:var(--bmw-blue-1);background:var(--silver-100);border-radius:var(--radius-sm)" id="cdEditItemTotal_${i}">DA${fmtMoney((item.qty * unitPrice) - credit)}</div>
        </div>
      </div>
      ${bundleBlock}
    </div>`;
  }).join('');

  document.getElementById('cdEditInvoiceBody').innerHTML = html +
    _cdFreeLinesHtml() + `
    <div style="margin:10px 0">
      <button class="btn" onclick="addCdFreeLine()" style="display:flex;align-items:center;gap:6px;background:#f3e5f5;border:1px solid #ce93d8;color:#6a1b9a;font-weight:700"><i class="fas fa-plus"></i> ${t('invoices.addFreeLine')}</button>
    </div>
    <div id="cdEditPaidBar" style="margin-top:12px;padding:10px 14px;background:#eef7ee;border:1px solid #cde8cd;border-radius:8px">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <label style="font-size:13px;font-weight:600;color:var(--silver-700)"><i class="fas fa-calendar-alt"></i> تاريخ الفاتورة</label>
        <input type="date" id="cdEditInvDate" value="${_invDateToInput(inv.createdAt || inv.date)}" style="padding:6px 10px;border:1px solid var(--silver-300);border-radius:4px;font-size:13px">
      </div>
    </div>
    <div id="cdEditPaidBar2" style="margin-top:12px;padding:10px 14px;background:#eef7ee;border:1px solid #cde8cd;border-radius:8px">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <label style="font-size:13px;font-weight:600;color:var(--silver-700)"><i class="fas fa-money-bill-wave"></i> ${t('invoices.paidEditLabel')}</label>
        <input type="text" class="form-input no-spinner num-input" inputmode="decimal" id="cdEditPaidAmount" value="${Number(paidNow || 0).toFixed(2)}" oninput="recalcCdEditPaid()" dir="ltr" style="width:130px;text-align:center;padding:6px 8px;font-size:13px">
        <div id="cdEditPaidPreview" style="font-size:12px;font-weight:600;color:var(--silver-600)"></div>
      </div>
      <div style="font-size:11px;color:var(--silver-500);margin-top:6px">${t('invoices.paidEditHint')}</div>
    </div>`;
  _cdPortalModal('cdEditInvoiceModal', true);
  _cdRestoreEditValues();
  recalcCdEditPaid();
}

function _cdSnapshotEditValues() {
  const snap = {};
  document.querySelectorAll('[id^="cdEditItemQty_"],[id^="cdEditFreeName_"],[id^="cdEditFreeQty_"],[id^="cdEditFreePrice_"],[id="cdEditPaidAmount"]')
    .forEach(el => { snap[el.id] = el.value; });
  _cdEditPending = snap;
}

function _cdRestoreEditValues() {
  if (!_cdEditPending) return;
  for (const id in _cdEditPending) {
    const el = document.getElementById(id);
    if (el && !el.disabled) el.value = _cdEditPending[id];
  }
  _cdEditPending = null;
}

function markCdEditRemove(i) {
  _cdSnapshotEditValues();
  if (!_cdEditRemoved.includes(i)) _cdEditRemoved.push(i);
  editCdInvoice(true);
}

function unmarkCdEditRemove(i) {
  _cdSnapshotEditValues();
  _cdEditRemoved = _cdEditRemoved.filter(x => x !== i);
  editCdInvoice(true);
}

function _cdFreeLinesHtml() {
  return _cdEditFree.map(f => `
    <div id="cdEditFreeRow_${f._idx}" style="background:#faf5fb;border:1px solid #ce93d8;border-radius:var(--radius-sm);padding:12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <strong style="font-size:13px;color:#6a1b9a">${t('invoices.freeLineBadge')}</strong>
        <button class="btn btn-sm btn-danger" onclick="removeCdFreeLine(${f._idx})" style="padding:1px 6px;font-size:10px"><i class="fas fa-times"></i> ${t('common.delete')}</button>
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px">
        <div><label style="font-size:11px;color:var(--silver-600);display:block;margin-bottom:2px">${t('invoices.freeLineNamePlaceholder')}</label>
          <input type="text" class="form-input" id="cdEditFreeName_${f._idx}" value="${escHtml(f.name || '')}" style="padding:6px 8px;font-size:13px" oninput="recalcCdEditPaid()"></div>
        <div><label style="font-size:11px;color:var(--silver-600);display:block;margin-bottom:2px">${t('customers.colQty')}</label>
          <input type="text" class="form-input no-spinner num-input" inputmode="decimal" id="cdEditFreeQty_${f._idx}" value="${Unit.fmtQty(f.qty)}" style="padding:6px 8px;font-size:13px" oninput="recalcCdEditPaid()"></div>
        <div><label style="font-size:11px;color:var(--silver-600);display:block;margin-bottom:2px">${t('customers.unitPriceLabel')}</label>
          <input type="text" class="form-input no-spinner num-input" inputmode="decimal" id="cdEditFreePrice_${f._idx}" value="${f.price}" style="padding:6px 8px;font-size:13px" oninput="recalcCdEditPaid()"></div>
        <div><label style="font-size:11px;color:var(--silver-600);display:block;margin-bottom:2px">${t('customers.colTotal')}</label>
          <div style="padding:6px 8px;font-size:13px;font-weight:700;color:var(--bmw-blue-1);background:var(--silver-100);border-radius:var(--radius-sm)" id="cdEditFreeTotal_${f._idx}">DA0.00</div></div>
      </div>
    </div>`).join('');
}

function addCdFreeLine() {
  _cdSnapshotEditValues();
  _cdEditFree.push({ _idx: _cdEditFreeIdx++, name: '', qty: 1, price: 0 });
  editCdInvoice(true);
}

function removeCdFreeLine(idx) {
  _cdSnapshotEditValues();
  _cdEditFree = _cdEditFree.filter(f => f._idx !== idx);
  editCdInvoice(true);
}

function recalcCdEditItem(i) {
  const qtyInput = document.getElementById(`cdEditItemQty_${i}`);
  const totalDiv = document.getElementById(`cdEditItemTotal_${i}`);
  if (_cdEditRemoved.includes(i)) {
    if (totalDiv) totalDiv.textContent = 'DA0.00';
    recalcCdEditPaid();
    return;
  }
  const unitPrice = parseFloat(document.getElementById(`cdEditItemUnitPrice_${i}`).value) || 0;
  const q = Unit.parse(qtyInput.value);
  const inv = DB.getInvoice(_cdCurrentInvoiceId);
  const item = inv && inv.items ? inv.items[i] : null;
  const credit = item ? _cdBundleCreditValue(item, i) : 0;
  totalDiv.textContent = `DA${fmtMoney(Math.max(0, (q * unitPrice) - credit))}`;
  recalcCdEditPaid();
}

function recalcCdEditPaid() {
  const box = document.getElementById('cdEditPaidPreview');
  const input = document.getElementById('cdEditPaidAmount');
  if (!box || !input) return;
  const inv = DB.getInvoice(_cdCurrentInvoiceId);
  if (!inv || !inv.items) return;
  let total = 0;
  inv.items.forEach((item, i) => {
    if (_cdEditRemoved.includes(i)) return;
    const qtyInput = document.getElementById(`cdEditItemQty_${i}`);
    const unitPrice = parseFloat(document.getElementById(`cdEditItemUnitPrice_${i}`)?.value) || (item.price || 0);
    const q = qtyInput ? Unit.parse(qtyInput.value) : item.qty;
    const credit = (typeof SaleCore !== 'undefined' && SaleCore.isBundleItem && SaleCore.isBundleItem(item)) ? _cdBundleCreditValue(item, i) : 0;
    total += Math.max(0, (q * unitPrice) - credit);
  });
  _cdEditFree.forEach(f => {
    const q = Unit.parse(document.getElementById(`cdEditFreeQty_${f._idx}`)?.value) || 0;
    const p = parseFloat(document.getElementById(`cdEditFreePrice_${f._idx}`)?.value) || 0;
    const lineTotal = Math.max(0, q * p);
    const cell = document.getElementById(`cdEditFreeTotal_${f._idx}`);
    if (cell) cell.textContent = 'DA' + fmtMoney(lineTotal);
    total += lineTotal;
  });
  const paid = Unit.parse(input.value);
  const rest = total - paid;
  if (rest > 0.005) { box.style.color = 'var(--silver-600)'; box.textContent = `${t('invoices.paidEditRemaining')} DA${fmtMoney(rest)}`; }
  else if (rest < -0.005) { box.style.color = '#198754'; box.textContent = `${t('invoices.paidEditCredit')} DA${fmtMoney(Math.abs(rest))}`; }
  else { box.style.color = 'var(--silver-600)'; box.textContent = `${t('invoices.paidEditRemaining')} DA0.00`; }
}

function closeCdEditModal() {
  _cdPortalModal('cdEditInvoiceModal', false);
}

function confirmCdEditInvoice() {
  const inv = DB.getInvoice(_cdCurrentInvoiceId);
  if (!inv) return;

  const oldTotal = inv.totalAmount;
  const paidBefore = DB.getInvoicePaidAmount(_cdCurrentInvoiceId);
  const paidInputEl = document.getElementById('cdEditPaidAmount');
  let explicitPaid = null;
  if (paidInputEl && String(paidInputEl.value).trim() !== '') {
    const pv = Unit.parse(paidInputEl.value);
    if (isFinite(pv) && pv >= 0) explicitPaid = pv;
  }
  const paidChanged = (explicitPaid !== null) && (Math.abs(explicitPaid - paidBefore) >= 0.005);
  const changes = [];
  const newItems = [];
  let newTotal = 0;
  let anyChange = false;

  inv.items.forEach((item, i) => {
    if (_cdEditRemoved.includes(i)) {
      anyChange = true;
      changes.push({
        productId: item.productId, name: item.name, item, removed: true,
        oldQty: item.qty, newQty: 0, diffQty: -item.qty,
        unitPrice: Number(item.price) || 0,
        isBundle: typeof SaleCore !== 'undefined' && SaleCore.isBundleItem && SaleCore.isBundleItem(item),
      });
      return;
    }
    let newQty = Unit.parse(document.getElementById(`cdEditItemQty_${i}`).value);
    if (!(newQty >= 0)) newQty = item.qty;
    const unitPrice = parseFloat(document.getElementById(`cdEditItemUnitPrice_${i}`).value) || 0;
    const isBundle = typeof SaleCore !== 'undefined' && SaleCore.isBundleItem && SaleCore.isBundleItem(item);
    const work = isBundle ? Object.assign({}, item, {
      returnedComponents: Object.assign({}, item.returnedComponents || {}),
      bundleComponents: (item.bundleComponents || []).map(c => Object.assign({}, c)),
    }) : Object.assign({}, item);
    const diffQty = newQty - item.qty;
    let partialCredit = 0;

    if (isBundle && diffQty !== 0) {
      const comps = SaleCore.bundleComponents(DB, work);
      if (diffQty < 0) {
        // Quantity drop already removes those bundles from the line total;
        // restore their components and drop the credit again below so it is
        // not subtracted twice.
        const returns = comps.map(c => ({
          productId: c.productId,
          qty: Unit.roundQty(c.qtyPerBundle * Math.abs(diffQty)),
        }));
        // A quantity drop already removes those bundles from the line total;
        // restore the pieces but do not also store them as a partial return.
        SaleCore.applyBundleComponentReturns(
          DB, _cdCurrentInvoiceId, work, returns,
          t('customers.returnReason'), { track: false });
      } else if (diffQty > 0) {
        for (const c of comps) {
          const want = Unit.roundQty(c.qtyPerBundle * diffQty);
          if (want <= 0) continue;
          const p = DB.getProduct(c.productId);
          if (!p || p.fixed === true) continue;
          if ((p.quantity || 0) < want) {
            alert(`${t('customers.stockInsufficient')} "${c.name || item.name}": ${t('customers.stockAvailable')} ${p.quantity}, ${t('customers.qtyRequired')} ${want}`);
            return;
          }
          DB.updateProduct(c.productId, { quantity: Unit.roundQty((p.quantity || 0) - want) });
        }
      }
      work.qty = newQty;
    }

    if (isBundle) {
      const comps = SaleCore.bundleHeldComponents(DB, work);
      const returns = [];
      comps.forEach((c, j) => {
        const inp = document.getElementById(`cdEditCompReturn_${i}_${j}`);
        if (!inp) return;
        let q = Unit.parse(inp.value);
        if (!(q > 0)) return;
        q = Math.min(Unit.roundQty(q), c.heldQty);
        if (q > 0) returns.push({ productId: c.productId, qty: q });
      });
      if (returns.length) {
        const res = SaleCore.applyBundleComponentReturns(
          DB, _cdCurrentInvoiceId, work, returns, t('customers.returnReason'));
        partialCredit = parseFloat(res.credit) || 0;
      }
    }

    const credit = isBundle ? (parseFloat(work.bundleReturnCredit) || 0) : 0;
    const newItemTotal = Math.max(0, (newQty * unitPrice) - credit);
    newTotal += newItemTotal;

    if (diffQty !== 0 || partialCredit > 0) {
      anyChange = true;
      changes.push({
        productId: item.productId,
        name: item.name,
        oldQty: item.qty,
        newQty,
        diffQty,
        unitPrice,
        oldItemTotal: item.total,
        newItemTotal,
        isBundle,
      });
    }

    work.qty = newQty;
    work.price = unitPrice;
    work.total = newItemTotal;
    newItems.push(work);
  });

  // Hand-typed lines: no product card and no stock movement. They are pure
  // revenue and (no cost exists) profit, exactly like the F10 "non-catalogue"
  // line at the register.
  _cdEditFree.forEach(f => {
    const nameEl = document.getElementById(`cdEditFreeName_${f._idx}`);
    const name = String((nameEl && nameEl.value) || f.name || '').trim();
    if (!name) { alert(t('invoices.freeLineNameRequired')); return; }
    const qtyEl = document.getElementById(`cdEditFreeQty_${f._idx}`);
    const q = Unit.parse(qtyEl ? qtyEl.value : f.qty);
    if (!(q > 0)) { alert(t('invoices.freeLineQtyRequired')); return; }
    const priceEl = document.getElementById(`cdEditFreePrice_${f._idx}`);
    const p = parseFloat(priceEl ? priceEl.value : f.price);
    const price = isFinite(p) && p >= 0 ? p : 0;
    const total = Unit.roundQty(price * q);
    newItems.push({ productId: null, barcode: '', name, qty: q, price, total, freeLine: true });
    newTotal += total;
    anyChange = true;
  });

  if (!anyChange && !paidChanged) {
    alert(t('customers.notChanged'));
    return;
  }

  // Validate inventory: check if increased quantities are available.
  // Bundle increases were already resolved component-by-component above.
  for (const ch of changes) {
    if (!ch.isBundle && ch.diffQty > 0) {
      const prod = DB.getProduct(ch.productId);
      // Only a card that exists and counts its own stock can refuse: a «غير
      // محدود» card is filled by the scale and an unlisted (F10) line has no
      // card at all — refusing either would abort the whole save.
      if (prod && prod.fixed !== true && prod.quantity < ch.diffQty) {
        alert(`${t('customers.qtyUnavailable')} "${ch.name}"\n${t('customers.stockAvailable')}: ${prod.quantity}\n${t('customers.qtyRequired')}: ${ch.diffQty}`);
        return;
      }
    }
  }

  // Apply changes (bundle lines already moved their component cards).
  for (const ch of changes) {
    if (ch.removed) {
      const item = ch.item || {};
      const prod = item.productId ? DB.getProduct(item.productId) : null;
      if (!inv.isProvisional && prod && prod.fixed !== true && !ch.isBundle) {
        DB.updateProduct(item.productId, { quantity: Unit.roundQty(prod.quantity + item.qty) });
      }
      if (ch.isBundle) {
        const comps = SaleCore.bundleComponents(DB, item);
        const returns = comps.map(c => ({ productId: c.productId, qty: Unit.roundQty(c.qtyPerBundle * item.qty) }));
        SaleCore.applyBundleComponentReturns(
          DB, _cdCurrentInvoiceId, item, returns, t('customers.returnReason'), { track: false });
      } else if (prod) {
        const returnQty = item.qty;
        const returnUnit = parseFloat(ch.unitPrice) || 0;
        DB.addReturn({
          invoiceId: _cdCurrentInvoiceId,
          productId: item.productId,
          productName: item.name,
          qty: returnQty,
          price: returnUnit,
          total: returnUnit * returnQty,
          unit: prod.unit,
          unitLabel: prod.unitLabel,
          qtyDecimals: prod.qtyDecimals,
          reason: t('customers.returnReason'),
        });
      }
      continue;
    }
    if (ch.isBundle) continue;
    if (ch.diffQty > 0) {
      const prod = DB.getProduct(ch.productId);
      if (prod && prod.fixed !== true) {
        if (prod.quantity < ch.diffQty) {
          alert(`${t('customers.stockInsufficient')} "${ch.name}": ${t('customers.stockAvailable')} ${prod.quantity}, ${t('customers.qtyRequired')} ${ch.diffQty}`);
          return;
        }
        DB.updateProduct(ch.productId, { quantity: Unit.roundQty(prod.quantity - ch.diffQty) });
      }
    } else if (ch.diffQty < 0) {
      const prod = DB.getProduct(ch.productId);
      if (prod) {
        const returnQty = Math.abs(ch.diffQty);
        // A weighed card («غير محدود») is filled by the scale, not by the shelf,
        // so a return of it is recorded but never inflates that number.
        if (prod.fixed !== true) DB.updateProduct(ch.productId, { quantity: Unit.roundQty(prod.quantity + returnQty) });
        const returnUnit = parseFloat(ch.unitPrice) || 0;
        DB.addReturn({
          invoiceId: _cdCurrentInvoiceId,
          productId: ch.productId,
          productName: ch.name,
          qty: returnQty,
          price: returnUnit,
          total: returnUnit * returnQty,
          unit: prod.unit,
          unitLabel: prod.unitLabel,
          qtyDecimals: prod.qtyDecimals,
          reason: t('customers.returnReason'),
        });
      }
    }
  }

  inv.items = newItems;

  inv.totalAmount = newTotal;
  inv.modifiedAt = Date.now();

  // Recalculate profit
  const newProfit = inv.items.reduce((s, item) => {
    const prod = DB.getProduct(item.productId);
    const isBundle = typeof SaleCore !== 'undefined' && SaleCore.isBundleItem && SaleCore.isBundleItem(item);
    const buyPrice = isBundle
      ? (parseFloat(item.costPrice) || 0)
      : ((typeof PurchaseCore !== 'undefined' && PurchaseCore && typeof PurchaseCore.itemCost === 'function')
        ? PurchaseCore.itemCost(item, prod)
        : (prod ? (prod.buyPrice || 0) : 0));
    return s + (((item.price - buyPrice) * item.qty) - (parseFloat(item.bundleReturnCredit) || 0));
  }, 0);

  const updateData = { items: inv.items, totalAmount: newTotal, modifiedAt: Date.now(), profit: newProfit };
  const _cdDateInp = document.getElementById('cdEditInvDate');
  const _cdNewDate = _cdDateInp ? _invInputToDate(_cdDateInp.value) : null;
  if (_cdNewDate) { updateData.createdAt = _cdNewDate; updateData.date = _cdNewDate; inv.createdAt = _cdNewDate; inv.date = _cdNewDate; }
  if (inv.timbreFiscal !== undefined) {
    const tRate = parseFloat(localStorage.getItem('zmt_timbre_rate') || '1');
    let newTimbre = newTotal * (tRate / 100);
    if (newTimbre < 5) newTimbre = 5;
    if (newTimbre > 10000) newTimbre = 10000;
    updateData.timbreFiscal = newTimbre;
  }
  if (paidChanged && explicitPaid !== null) {
    DB.setInvoicePaid(_cdCurrentInvoiceId, explicitPaid, { note: t('invoices.paidEditNote') });
  } else {
    DB.reduceInvoicePayments(_cdCurrentInvoiceId, newTotal);
  }
  const newPaid = DB.getInvoicePaidAmount(_cdCurrentInvoiceId);
  updateData.paidAmount = newPaid;
  DB.updateInvoice(_cdCurrentInvoiceId, updateData);
  if (_cdNewDate) {
    const allPmts = DB.getPayments();
    let chg = false;
    allPmts.forEach(p => { if (p.invoiceId === _cdCurrentInvoiceId) { p.createdAt = _cdNewDate; chg = true; } });
    if (chg) DB.savePayments(allPmts);
  }

  const diffTotal = newTotal - oldTotal;
  const balanceChange = (newTotal - newPaid) - (oldTotal - paidBefore);
  const customers = DB.getCustomers();
  const cIdx = customers.findIndex(c => c.id === _cdCustomerId);
  if (cIdx !== -1) {
    customers[cIdx].balance = (parseFloat(customers[cIdx].balance) || 0) + balanceChange;
    DB.saveCustomers(customers);
  }

  closeCdEditModal();
  _cdPortalModal('cdInvoiceModal', false);

  _cdInvoices = DB.getInvoicesByCustomer(_cdCustomerId);
  renderCdStats();
  renderCdInvoices();
  renderCdHistory();
  renderCdPayments();
}

// ===== EDIT CUSTOMER INFO =====

function showCdEditForm() {
  const c = DB.getCustomer(_cdCustomerId);
  if (!c) return;
  document.getElementById('cdEditName').value = c.name;
  document.getElementById('cdEditPhone').value = c.phone || '';
  document.getElementById('cdEditAddress').value = c.address || '';
  document.getElementById('cdEditEmail').value = c.email || '';
  if (window.ZmtPartyLegal && typeof window.ZmtPartyLegal.fill === 'function') {
    window.ZmtPartyLegal.fill('cdEdit', c);
  } else {
    document.getElementById('cdEditNis').value = c.nis || '';
    document.getElementById('cdEditNif').value = c.nif || '';
    document.getElementById('cdEditRc').value = c.rc || '';
    document.getElementById('cdEditArticle').value = c.article || '';
  }
  document.getElementById('cdEditType').value = c.type === 'whole' ? 'whole' : 'unit';
  document.getElementById('cdEditDiscount').value = c.discount || 0;
  document.getElementById('cdEditCreditLimit').value = (c.creditLimit == null) ? 0 : c.creditLimit;
  document.getElementById('cdEditModal').style.display = 'flex';
}

function confirmCdEdit() {
  const name = document.getElementById('cdEditName').value.trim();
  if (!name) { alert(t('customers.nameRequired')); return; }
  const discount = parseFloat(document.getElementById('cdEditDiscount').value) || 0;
  if (discount < 0 || discount > 100) { alert(t('customers.discountRange')); return; }
  const creditLimit = parseFloat(document.getElementById('cdEditCreditLimit').value) || 0;
  if (creditLimit < 0) { alert(t('customers.prompts.invalidCreditLimit')); return; }

  const legal = window.ZmtPartyLegal && typeof window.ZmtPartyLegal.read === 'function'
    ? window.ZmtPartyLegal.read('cdEdit') : {};
  DB.updateCustomer(_cdCustomerId, Object.assign({
    name,
    phone: document.getElementById('cdEditPhone').value.trim(),
    address: document.getElementById('cdEditAddress').value.trim(),
    email: document.getElementById('cdEditEmail').value.trim(),
    type: document.getElementById('cdEditType').value === 'whole' ? 'whole' : 'unit',
    discount,
    creditLimit,
  }, legal));

  document.getElementById('cdEditModal').style.display = 'none';

  // Refresh UI
  const c = DB.getCustomer(_cdCustomerId);
  if (c) {
    document.getElementById('cdTitle').textContent = c.name;
    document.getElementById('cdName').textContent = c.name;
  }
  renderCdStats();
}

function confirmCdDelete() {
  if (!confirm(t('customers.deleteCustomerConfirm'))) return;
  DB.deleteCustomer(_cdCustomerId);
  navigateTo('customers');
}

// ===== MODAL CLOSE HANDLERS =====

function _cdModalHandler(e) {
  ['cdInvoiceModal', 'cdEditInvoiceModal', 'cdEditModal'].forEach(id => {
    const el = document.getElementById(id);
    if (e.target === el) _cdPortalModal(id, false);
  });
}
document.removeEventListener('click', _cdModalHandler);
document.addEventListener('click', _cdModalHandler);
if (window._pageListeners) window._pageListeners.push({ type: 'click', fn: _cdModalHandler });

// ===== LAN SYNC HANDLER =====
window._pageSyncHandlers = window._pageSyncHandlers || {};
window._pageSyncHandlers['customer-detail'] = function cdSyncData() {
  if (!_cdCustomerId) return;
  const c = DB.getCustomer(_cdCustomerId);
  if (!c) { navigateTo('customers'); return; }
  // Refresh the header + stats from the latest records, then rebuild every tab
  // in place (each renderer is idempotent and reads fresh DB state).
  document.getElementById('cdTitle').textContent = c.name;
  document.getElementById('cdName').textContent = c.name;
  const avatar = document.getElementById('cdAvatar');
  if (avatar) {
    avatar.style.background = c.photo ? 'none' : '';
    avatar.innerHTML = c.photo
      ? `<img src="${c.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
      : `<i class="fas fa-user"></i>`;
  }
  _cdInvoices = DB.getInvoicesByCustomer(_cdCustomerId);
  renderCdStats();
  renderCdInvoices();
  renderCdHistory();
  renderCdPayments();
  cdUpdateMergeBtn();
};

// ===== MERGE WAYBILLS (وصول التسليم) INTO ONE SALE INVOICE ===================
// A *real* waybill (type 'waybill', !isProvisional) already:
//   - deducted stock when it was created,
//   - recorded any payment made at delivery,
//   - raised the customer balance by its unpaid remainder.
// It is NOT counted as a sale by the dashboard / reports / net-account / zakat
// (they all require type === 'customer') - which is exactly the "confusion" this
// feature removes: N waybills become ONE 'customer' sale invoice.
//
// The merge is therefore a *document consolidation* with hard invariants:
//   - STOCK IS NEVER TOUCHED (not deducted again, not restored);
//   - the balance moves by exactly (new remainder - sum of old remainders), i.e.
//     by (sum of old recorded payments - new payment) - zero by default;
//   - the new totalAmount is the EXACT sum of the waybills' totals;
//   - returns/discounts attached to the waybills are re-pointed, never deleted;
//   - a full snapshot of every merged waybill is stored inside the new invoice.

var _cdMergeSel = {};        // { waybillId: true }
var _cdMergeMethod = 'cash'; // 'cash' | 'ccp' | 'mixed'

function _cdNum(v) { return parseFloat(v) || 0; }
function _cdPad2(n) { return String(n).padStart(2, '0'); }
// 0x01: separator that can never appear inside a product name/barcode.
function _cdSep() { return String.fromCharCode(1); }

// Real (non-provisional) waybills that belong to the current customer.
function cdWaybills() {
  return (_cdInvoices || []).filter(inv =>
    inv && inv.type === 'waybill' && !inv.isProvisional &&
    (!inv.customerId || inv.customerId === _cdCustomerId)
  );
}

function cdMergeSelected() {
  return cdWaybills().filter(w => _cdMergeSel[w.id]);
}

// Toolbar button: visible only when there is something to merge, with live count.
function cdUpdateMergeBtn() {
  const btn = document.getElementById('cdMergeBtn');
  const cnt = document.getElementById('cdMergeCount');
  if (!btn || !cnt) return;
  const n = cdWaybills().length;
  btn.style.display = n > 0 ? '' : 'none';
  cnt.textContent = n;
  cnt.style.display = n > 0 ? '' : 'none';
}

// Local YYYY-MM-DD / HH:MM for the native date and time inputs.
function _cdLocalParts(ts) {
  const d = new Date(ts || Date.now());
  return {
    date: d.getFullYear() + '-' + _cdPad2(d.getMonth() + 1) + '-' + _cdPad2(d.getDate()),
    time: _cdPad2(d.getHours()) + ':' + _cdPad2(d.getMinutes()),
  };
}

// Payments already recorded on the SELECTED waybills, split cash/CCP exactly
// like a sale invoice does (legacy waybill payments carry no `method` -> cash).
function _cdMergeRecorded() {
  let cash = 0, ccp = 0;
  cdMergeSelected().forEach(w => {
    const m = DB.getInvoicePaymentMethods(w.id);
    cash += m.cash || 0;
    ccp += m.ccp || 0;
  });
  return { cash, ccp, total: cash + ccp };
}

// Debt a waybill contributed = max(0, total - effective paid) - the same rule the
// creation and edit flows used, so the balance delta computed from it is exact.
function _cdMergeOldRemaining(sel) {
  return sel.reduce((s, w) =>
    s + Math.max(0, (w.totalAmount || 0) - DB.getInvoiceEffectivePaid(w.id)), 0);
}

// Build the consolidated item list: only truly identical lines (same product /
// barcode + same price + same discount) are merged into one line, so
// sum(qty x price) stays exactly equal to the sum of the waybill item totals and
// the printed invoice shows no rounding drift. Different prices stay separate.
function cdMergeBuildItems(list) {
  const order = [];
  const map = Object.create(null);
  const keyOf = it => [
    it && it.productId != null ? it.productId : '',
    it && it.name != null ? it.name : '',
    it && it.barcode != null ? it.barcode : '',
    _cdNum(it && it.price).toFixed(4),
    _cdNum(it && it.discount).toFixed(4),
  ].join(_cdSep());

  list.forEach(w => (w.items || []).forEach(it => {
    const k = keyOf(it);
    if (!map[k]) {
      map[k] = {
        productId: it.productId,
        barcode: it.barcode,
        name: it.name,
        qty: 0,
        price: _cdNum(it.price),
        total: 0,
        originalPrice: (it.originalPrice != null ? it.originalPrice : it.price),
        discount: _cdNum(it.discount),
      };
      order.push(k);
    }
    const line = map[k];
    line.qty += _cdNum(it.qty);
    line.total += (it.total != null ? _cdNum(it.total) : (_cdNum(it.qty) * _cdNum(it.price)));
  }));

  return order.map(k => {
    const l = map[k];
    l.total = Math.round(l.total * 100) / 100;
    return l;
  });
}

// ---------------- dialog ----------------

function openCdMerge() {
  const list = cdWaybills();
  if (list.length === 0) { alert(t('merge.none')); return; }

  _cdMergeSel = {};
  list.forEach(w => { _cdMergeSel[w.id] = true; });

  // Default date/time = the OLDEST waybill (both fields stay fully editable).
  const oldest = Math.min.apply(null, list.map(w => w.date || w.createdAt || Date.now()));
  const parts = _cdLocalParts(oldest);
  document.getElementById('cdMergeDate').value = parts.date;
  document.getElementById('cdMergeTime').value = parts.time;

  // Default paid amount = what was already recorded, same cash/CCP split.
  const rec = _cdMergeRecorded();
  document.getElementById('cdMergePaid').value = rec.total.toFixed(2);
  document.getElementById('cdMergeCash').value = rec.cash.toFixed(2);
  document.getElementById('cdMergeCcp').value = rec.ccp.toFixed(2);
  cdMergeSetMethod(rec.cash > 0 && rec.ccp > 0 ? 'mixed' : (rec.ccp > 0 ? 'ccp' : 'cash'));

  cdMergeRenderList();
  const box = document.getElementById('cdMergeList');
  if (box) box.scrollTop = 0;
  document.getElementById('cdMergeModal').style.display = 'flex';
}

function closeCdMerge() {
  document.getElementById('cdMergeModal').style.display = 'none';
}

function cdMergeSelectAll() {
  cdWaybills().forEach(w => { _cdMergeSel[w.id] = true; });
  cdMergeRenderList();
}

function cdMergeSelectNone() {
  _cdMergeSel = {};
  cdMergeRenderList();
}

function cdMergeToggle(id) {
  _cdMergeSel[id] = !_cdMergeSel[id];
  cdMergeRenderList();
}

function cdMergePayFull() {
  const total = cdMergeSelected().reduce((s, w) => s + (w.totalAmount || 0), 0);
  document.getElementById('cdMergePaid').value = total.toFixed(2);
  document.getElementById('cdMergeCash').value = total.toFixed(2);
  document.getElementById('cdMergeCcp').value = '0.00';
  cdMergeRefresh();
}

function cdMergeSetMethod(method) {
  _cdMergeMethod = (method === 'ccp' || method === 'mixed') ? method : 'cash';
  document.querySelectorAll('#cdMergeModal .pay-method-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.method === _cdMergeMethod);
  });
  const mixed = _cdMergeMethod === 'mixed';
  document.getElementById('cdMergeSinglePay').style.display = mixed ? 'none' : '';
  document.getElementById('cdMergeMixedPay').style.display = mixed ? '' : 'none';
  cdMergeRefresh();
}

function cdMergeGetPay() {
  if (_cdMergeMethod === 'mixed') {
    const cash = Math.max(0, _cdNum(document.getElementById('cdMergeCash').value));
    const ccp = Math.max(0, _cdNum(document.getElementById('cdMergeCcp').value));
    return { method: 'mixed', cash, ccp, total: cash + ccp };
  }
  const paid = Math.max(0, _cdNum(document.getElementById('cdMergePaid').value));
  return _cdMergeMethod === 'ccp'
    ? { method: 'ccp', cash: 0, ccp: paid, total: paid }
    : { method: 'cash', cash: paid, ccp: 0, total: paid };
}

function cdMergeRenderList() {
  const box = document.getElementById('cdMergeList');
  if (!box) return;
  const list = cdWaybills();
  if (list.length === 0) {
    box.innerHTML = '<div class="cd-merge-empty">' + escHtml(t('merge.none')) + '</div>';
    cdMergeRefresh();
    return;
  }
  box.innerHTML = list.map((w, i) => {
    const d = new Date(w.date || w.createdAt);
    const dateStr = d.toLocaleDateString('ar-EG-u-nu-latn');
    const timeStr = d.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
    const total = w.totalAmount || 0;
    const paid = DB.getInvoiceEffectivePaid(w.id);
    const remaining = Math.max(0, total - paid);
    const on = !!_cdMergeSel[w.id];
    const label = w.invoiceNumber || (t('merge.waybillNo') + ' #' + (i + 1));
    return '<div class="cd-merge-row' + (on ? ' on' : '') + '" onclick="cdMergeToggle(\'' + w.id + '\')">' +
      '<input type="checkbox" tabindex="-1"' + (on ? ' checked' : '') + '>' +
      '<div class="cd-merge-row-main">' +
        '<div class="cd-merge-row-num"><i class="fas fa-truck" style="color:#e65100"></i> ' + escHtml(label) + '</div>' +
        '<div class="cd-merge-row-meta"><i class="far fa-calendar-alt"></i> ' + dateStr + ' ' + timeStr + ' &middot; DA' + fmtMoney(total) + '</div>' +
      '</div>' +
      '<div class="cd-merge-row-amt">' +
        '<div style="color:#28a745">+DA' + fmtMoney(paid) + '</div>' +
        (remaining > 0 ? '<div style="color:#e65100;font-weight:400">-DA' + fmtMoney(remaining) + '</div>' : '') +
      '</div>' +
    '</div>';
  }).join('');
  cdMergeRefresh();
}

function cdMergeRefresh() {
  const sel = cdMergeSelected();
  const n = sel.length;
  const total = sel.reduce((s, w) => s + (w.totalAmount || 0), 0);
  const pay = cdMergeGetPay();
  const remaining = Math.max(0, total - pay.total);
  const rec = _cdMergeRecorded();

  const recEl = document.getElementById('cdMergeRecorded');
  if (recEl) recEl.textContent = t('merge.recorded') + ' DA' + fmtMoney(rec.total);

  const oldRemaining = _cdMergeOldRemaining(sel);
  const delta = remaining - oldRemaining; // === sum(old paid) - new paid
  const deltaCls = delta > 0.004 ? 'up' : (delta < -0.004 ? 'down' : '');
  const deltaTxt = (delta > 0.004 ? '+' : '') + 'DA' + fmtMoney(delta);

  const box = document.getElementById('cdMergeSummary');
  if (box) {
    box.innerHTML =
      '<div class="cd-merge-sum-title"><i class="fas fa-clipboard-list"></i> ' + escHtml(t('merge.summary')) + '</div>' +
      '<div class="cd-merge-sum-line"><span>' + escHtml(t('merge.selCount')) + '</span><strong>' + n + '</strong></div>' +
      '<div class="cd-merge-sum-line"><span>' + escHtml(t('merge.sumTotal')) + '</span><strong>DA' + fmtMoney(total) + '</strong></div>' +
      '<div class="cd-merge-sum-line"><span>' + escHtml(t('merge.sumPaid')) + '</span><strong style="color:#28a745">DA' + fmtMoney(pay.total) + '</strong></div>' +
      '<div class="cd-merge-sum-line cd-merge-sum-total"><span>' + escHtml(t('merge.sumRemaining')) + '</span><strong style="color:' + (remaining > 0 ? '#e65100' : '#28a745') + '">DA' + fmtMoney(remaining) + '</strong></div>' +
      '<div class="cd-merge-sum-line"><span>' + escHtml(t('merge.debtDelta')) + '</span><strong class="cd-merge-sum-delta ' + deltaCls + '">' + deltaTxt + '</strong></div>';
  }

  const btn = document.getElementById('cdMergeConfirmBtn');
  if (btn) btn.disabled = n === 0;
}

function cdMergeConfirm() {
  const sel = cdMergeSelected();
  if (sel.length === 0) { alert(t('merge.selectAtLeast')); return; }

  // ---- chosen date + time (back-dating is honoured by the period reports) ----
  const dv = (document.getElementById('cdMergeDate').value || '').trim();
  let tv = (document.getElementById('cdMergeTime').value || '').trim();
  if (!dv) { alert(t('merge.needDate')); return; }
  if (tv.split(':').length !== 2) tv = '00:00';
  const chosen = new Date(dv + 'T' + tv + ':00');
  if (isNaN(chosen.getTime())) { alert(t('merge.needDate')); return; }
  const chosenTs = chosen.getTime();

  // ---- exact aggregate of the selected waybills ------------------------------
  const totalAmount = sel.reduce((s, w) => s + (w.totalAmount || 0), 0);
  const extraDiscount = sel.reduce((s, w) => s + (w.extraDiscount || 0), 0);
  const timbreFiscal = sel.reduce((s, w) => s + (w.timbreFiscal || 0), 0);
  const profit = sel.reduce((s, w) => s + (w.profit || 0), 0);

  const pay = cdMergeGetPay();
  if (pay.total > totalAmount + 0.005) { alert(t('merge.paidExceeds')); return; }

  const remaining = Math.max(0, totalAmount - pay.total);
  const balanceDelta = remaining - _cdMergeOldRemaining(sel); // 0 when unchanged

  // Irreversible -> explicit confirmation carrying the exact numbers.
  const msg = t('merge.confirmMsg')
    .replace('{n}', String(sel.length))
    .replace('{total}', fmtMoney(totalAmount))
    .replace('{paid}', fmtMoney(pay.total))
    .replace('{remaining}', fmtMoney(remaining));
  if (!confirm(t('merge.confirmTitle') + String.fromCharCode(10, 10) + msg)) return;

  // ---- full snapshot: lets a future build restore the waybills if needed -----
  const snapshot = sel.map(w => ({
    id: w.id,
    invoiceNumber: w.invoiceNumber || '',
    date: w.date || w.createdAt || null,
    createdAt: w.createdAt || null,
    totalAmount: w.totalAmount || 0,
    extraDiscount: w.extraDiscount || 0,
    timbreFiscal: w.timbreFiscal || 0,
    profit: w.profit || 0,
    note: w.note || '',
    items: (w.items || []).map(it => Object.assign({}, it)),
    payments: DB.getInvoicePayments(w.id).map(p => ({
      amount: p.amount || 0,
      method: p.method || null,
      cashAmount: p.cashAmount,
      ccpAmount: p.ccpAmount,
      note: p.note || '',
      createdAt: p.createdAt || null,
    })),
    returns: DB.getReturns().filter(r => r.invoiceId === w.id).map(r => Object.assign({}, r)),
    discounts: DB.getDiscounts().filter(d => d.invoiceId === w.id).map(d => Object.assign({}, d)),
  }));

  const mergedFrom = sel.map(w => ({
    id: w.id,
    invoiceNumber: w.invoiceNumber || '',
    date: w.date || w.createdAt || null,
    totalAmount: w.totalAmount || 0,
    paid: DB.getInvoiceEffectivePaid(w.id),
  }));

  // Customer tree: if every merged invoice carried the same sub-customer label,
  // keep that label on the consolidated invoice. Never a new customerId.
  const ctOn = !!(window.CustomerTree && typeof window.CustomerTree.enabled === 'function' && window.CustomerTree.enabled());
  const ctIds = sel.map(w => String((w && w.subCustomerId) || ''));
  const ctShared = (ctOn && ctIds.length && ctIds[0] && ctIds.every(x => x === ctIds[0])) ? ctIds[0] : null;
  const ctMeta = ctShared ? (window.CustomerTree.metaFor(ctShared) || {}) : {};
  const ctNote = ctShared ? (window.CustomerTree.noteFor(ctShared) || '') : '';

  // ---- 1) the consolidated sale invoice --------------------------------------
  let inv;
  try {
    inv = DB.addInvoice({
      customerId: _cdCustomerId,
      ...ctMeta,
      type: 'customer',
      date: chosenTs,
      items: cdMergeBuildItems(sel),
      totalAmount,
      customerDiscount: 0,
      extraDiscount,
      timbreFiscal,
      profit,
      mergedFrom,
      mergeSnapshot: snapshot,
      mergedAt: Date.now(),
      note: (t('merge.mergedNote') + ' ' + sel.map(w => w.invoiceNumber || '').filter(Boolean).join(', ') + ' ' + ctNote).trim().slice(0, 300),
    }, { numberYear: chosen.getFullYear() });
  } catch (e) {
    alert(t('customers.invoiceCreateError') + ': ' + (e && e.message ? e.message : e));
    return;
  }

  // Period reports read createdAt (falling back to date) - align it so the merge
  // lands in the period the user picked.
  try { DB.updateInvoice(inv.id, { createdAt: chosenTs }); } catch (e) {}

  // ---- 2) payments: drop the old rows, record the chosen one -----------------
  sel.forEach(w => { try { DB.deletePaymentsByInvoice(w.id); } catch (e) {} });
  if (pay.total > 0) {
    const pmt = {
      customerId: _cdCustomerId,
      ...ctMeta,
      invoiceId: inv.id,
      amount: pay.total,
      method: pay.method,
      note: t('customers.mergePaymentNote'),
    };
    if (pay.method === 'mixed') { pmt.cashAmount = pay.cash; pmt.ccpAmount = pay.ccp; }
    try { DB.addPayment(pmt); } catch (e) {}
  }

  // ---- 3) re-point returns and discounts (keep the audit trail, never delete) -
  try {
    const returns = DB.getReturns();
    let ch = false;
    returns.forEach(r => { if (sel.some(w => w.id === r.invoiceId)) { r.invoiceId = inv.id; ch = true; } });
    if (ch) DB.saveReturns(returns);
  } catch (e) {}
  try {
    const discounts = DB.getDiscounts();
    let ch = false;
    discounts.forEach(d => { if (sel.some(w => w.id === d.invoiceId)) { d.invoiceId = inv.id; ch = true; } });
    if (ch) DB.saveDiscounts(discounts);
  } catch (e) {}

  // ---- 4) customer balance: exactly the debt delta ---------------------------
  if (Math.abs(balanceDelta) > 0.004) {
    const customers = DB.getCustomers();
    const cIdx = customers.findIndex(c => c.id === _cdCustomerId);
    if (cIdx !== -1) {
      customers[cIdx].balance = (parseFloat(customers[cIdx].balance) || 0) + balanceDelta;
      DB.saveCustomers(customers);
    }
  }

  // ---- 5) delete the merged waybills (records only - STOCK UNTOUCHED) --------
  sel.forEach(w => { try { DB.deleteInvoice(w.id); } catch (e) {} });

  // ---- 6) audit trail --------------------------------------------------------
  try {
    DB.logAudit({
      action: 'merge',
      entity: 'invoice',
      entityId: inv.id,
      detail: (inv.invoiceNumber || '') + ' <- ' + sel.map(w => w.invoiceNumber || '').filter(Boolean).join(', '),
    });
  } catch (e) {}

  closeCdMerge();
  _cdInvoices = DB.getInvoicesByCustomer(_cdCustomerId);
  renderCdStats();
  renderCdInvoices();
  renderCdHistory();
  renderCdPayments();
  cdUpdateMergeBtn();

  alert(t('merge.done').replace('{n}', String(sel.length)).replace('{num}', inv.invoiceNumber || ''));
  showCdInvoiceDetail(inv.id);
}