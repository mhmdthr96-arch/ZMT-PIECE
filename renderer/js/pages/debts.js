var _debtsTab = 'customers';
var _debtsSearch = '';

function init_debts() {
  _debtsTab = 'customers';
  _debtsSearch = '';
  const allowed = window._zmtCanEditBalance('debts');
  const recalcBtn = document.getElementById('debtsRecalcBtn');
  const syncBtn = document.getElementById('debtsSyncBtn');
  if (recalcBtn) recalcBtn.style.display = allowed ? '' : 'none';
  if (syncBtn) syncBtn.style.display = (allowed && window.startBalanceSyncFromGestion) ? '' : 'none';
  renderDebts();
}

// ===== BALANCE TOOLS =====

async function confirmRecalcAllBalances() {
  const res = await window.recalculateAllBalances({});
  if (!res) { alert(t('balanceTools.cantEdit') || 'لا تملك صلاحية تعديل العملاء/الموردين'); return; }
  const n = res.customers.length + res.suppliers.length;
  if (!n) { alert(t('balanceTools.noDiff') || 'لا توجد فروقات — الأرصدة مطابقة للحساب من الفواتير'); return; }
  const msg = (t('balanceTools.recalcConfirm') || 'سيتم إعادة اشتقاق رصيد كل عميل ومورد من الفواتير والدفعات الحالية. هل تريد المتابعة؟') +
    '\n\n' + res.customers.length + ' ' + (t('balanceTools.clients') || 'عميل') + ' • ' + res.suppliers.length + ' ' + (t('balanceTools.suppliers') || 'مورد');
  if (!confirm(msg)) return;
  await window.applyRecalculatedBalances(res);
  alert(t('balanceTools.recalcDone') || 'تمت إعادة حساب الأرصدة بنجاح');
}
window.confirmRecalcAllBalances = confirmRecalcAllBalances;

// ===== RENDER =====

function renderDebts() {
  const customers = DB.getCustomers();
  const suppliers = DB.getSuppliers();

  // Summary
  const supTotal = suppliers.reduce((s, sup) => {
    const b = parseFloat(sup.balance) || 0;
    return s + (b > 0 ? b : 0);
  }, 0);
  const custTotal = customers.reduce((s, c) => {
    const b = parseFloat(c.balance) || 0;
    return s + (b > 0 ? b : 0);
  }, 0);
  document.getElementById('dsSupplierDebt').textContent = 'DA' + fmtMoney(supTotal);
  document.getElementById('dsCustomerDebt').textContent = 'DA' + fmtMoney(custTotal);
  document.getElementById('dsNetDebt').textContent = 'DA' + fmtMoney((custTotal - supTotal));

  // Tab counts
  document.getElementById('dtCustCount').textContent = customers.length;
  document.getElementById('dtSupCount').textContent = suppliers.length;

  renderDebtsList();
}

function renderDebtsList() {
  const container = document.getElementById('debtsList');
  const q = normSearch(_debtsSearch).toLowerCase();

  if (_debtsTab === 'customers') {
    const list = DB.getCustomers().filter(c =>
      !q || c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q))
    );
    container.innerHTML = list.length === 0
      ? `<div class="placeholder-box" style="padding:30px 0"><i class="fas fa-users"></i><p>${t('customers.empty')}</p></div>`
      : list.map(c => {
          const bal = parseFloat(c.balance) || 0;
          const cls = bal > 0 ? 'positive' : bal < 0 ? 'negative' : 'zero';
          const sign = bal > 0 ? '' : bal < 0 ? '-' : '';
          return `<div class="debts-entity" onclick="showDebtsDetail('customer','${c.id}')">
            <div class="debts-entity-icon customer"><i class="fas fa-user"></i></div>
            <div class="debts-entity-info">
              <div class="debts-entity-name">${escHtml(c.name)}</div>
              <div class="debts-entity-phone">${c.phone || ''}</div>
            </div>
            <div class="debts-entity-balance ${cls}">${sign}DA${fmtMoney(Math.abs(bal))}</div>
            ${window._zmtCanEditBalance('customers') ? `<button class="debts-edit-btn" onclick="event.stopPropagation();openBalanceEditModal('customer','${c.id}')" title="${t('balanceTools.editTitle')}"><i class="fas fa-pencil-alt"></i></button>` : ''}
          </div>`;
        }).join('');
  } else {
    const list = DB.getSuppliers().filter(s =>
      !q || s.name.toLowerCase().includes(q) || (s.phone && s.phone.includes(q))
    );
    container.innerHTML = list.length === 0
      ? `<div class="placeholder-box" style="padding:30px 0"><i class="fas fa-truck"></i><p>${t('suppliers.empty')}</p></div>`
      : list.map(s => {
          const bal = parseFloat(s.balance) || 0;
          const cls = bal > 0 ? 'positive' : bal < 0 ? 'negative' : 'zero';
          const sign = bal > 0 ? '' : bal < 0 ? '-' : '';
return `<div class="debts-entity" onclick="showDebtsDetail('supplier','${s.id}')">
            <div class="debts-entity-icon supplier"><i class="fas fa-truck"></i></div>
            <div class="debts-entity-info">
              <div class="debts-entity-name">${escHtml(s.name)}</div>
              <div class="debts-entity-phone">${s.phone || ''}</div>
            </div>
            <div class="debts-entity-balance ${cls}">${sign}DA${fmtMoney(Math.abs(bal))}</div>
            ${window._zmtCanEditBalance('suppliers') ? `<button class="debts-edit-btn" onclick="event.stopPropagation();openBalanceEditModal('supplier','${s.id}')" title="${t('balanceTools.editTitle')}"><i class="fas fa-pencil-alt"></i></button>` : ''}
          </div>`;
        }).join('');
}
}

// ===== TABS & SEARCH =====

function switchDebtsTab(tab) {
  _debtsTab = tab;
  document.querySelectorAll('.debts-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  closeDebtsDetail();
  renderDebtsList();
}

function filterDebtsList() {
  _debtsSearch = document.getElementById('debtsSearch').value;
  renderDebtsList();
}

function setupDebtsSearchDebounce() {
  const input = document.getElementById('debtsSearch');
  if (!input) return;
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  newInput.addEventListener('input', debounce(function() { _debtsSearch = newInput.value; renderDebtsList(); }, 300));
}

// ===== DETAIL =====

function showDebtsDetail(type, id) {
  const panel = document.getElementById('debtsDetailPanel');
  panel.classList.add('open');

  const entity = type === 'customer'
    ? DB.getCustomers().find(c => c.id === id)
    : DB.getSuppliers().find(s => s.id === id);
  if (!entity) return;

  const balance = parseFloat(entity.balance) || 0;
  const balCls = balance > 0 ? 'positive' : balance < 0 ? 'negative' : 'zero';
  const balSign = balance > 0 ? '' : balance < 0 ? '-' : '';

  // Header info
  document.getElementById('debtsDetailInfo').innerHTML = `
    <div class="debts-detail-info-name">${escHtml(entity.name)}</div>
    <div class="debts-detail-info-sub">${entity.phone || ''} ${entity.address ? '— ' + escHtml(entity.address) : ''}</div>
  `;

  // Body
  const body = document.getElementById('debtsDetailBody');

  if (type === 'customer') {
    const invoices = DB.getInvoicesByCustomer(id);
    const payments = DB.getCustomerPayments(id);
    // Payment vouchers settle balances without sale/purchase value — exclude
    // them from the stat cards (they never create Payment rows, but guard here).
    const statInvoices = invoices.filter(inv => inv.type !== 'payment');
    const statPayments = payments.filter(p => {
      const invRef = p.invoiceId ? DB.getInvoice(p.invoiceId) : null;
      return !(invRef && invRef.type === 'payment');
    });
    const totalInvoiced = statInvoices.reduce((s, inv) => s + (inv.totalAmount || 0), 0);
    const totalPaid = statPayments.reduce((s, p) => s + p.amount, 0);

    body.innerHTML = `
      <div class="debts-stat-row">
        <div class="debts-stat-item"><div class="debts-stat-label">${t('debts.totalInvoices')}</div><div class="debts-stat-value" style="color:var(--bmw-blue-1)">DA${fmtMoney(totalInvoiced)}</div></div>
        <div class="debts-stat-item"><div class="debts-stat-label">${t('common.paid')}</div><div class="debts-stat-value" style="color:#28a745">DA${fmtMoney(totalPaid)}</div></div>
        <div class="debts-stat-item"><div class="debts-stat-label">${t('debts.balance')}</div><div class="debts-stat-value ${balCls}">${balSign}DA${fmtMoney(Math.abs(balance))}</div></div>
      </div>

      <div class="debts-section-title"><i class="fas fa-file-invoice"></i> ${t('debts.invoices')} (${invoices.length})</div>
      ${invoices.length === 0
        ? `<div style="text-align:center;padding:12px;color:var(--silver-400);font-size:12px">${t('debts.noInvoices')}</div>`
        : invoices.sort((a,b)=>b.createdAt-a.createdAt).map(inv => {
            const invPaid = inv.type === 'payment' ? (inv.totalAmount || 0) : DB.getInvoiceEffectivePaid(inv);
            const invRem = inv.type === 'sup_sale' ? DB.getSupSaleNetDue(inv) : Math.max(0, (inv.totalAmount || 0) - invPaid);
            const d = new Date(inv.createdAt);
            const ds = d.toLocaleDateString('fr-DZ',{day:'2-digit',month:'short',year:'numeric'}) + ' ' + d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
            let statusHtml, typeLabel;
            if (inv.type === 'customer') typeLabel = t('invoices.typeSale');
            else if (inv.type === 'payment') typeLabel = t('invoices.typePayment');
            else if (inv.type === 'waybill') typeLabel = t('invoices.typeWaybill');
            else if (inv.type === 'proforma') typeLabel = t('invoices.typeProforma');
            else if (inv.type === 'dispatch') typeLabel = t('invoices.typeDispatch');
            else typeLabel = inv.type;
            if (inv.isProvisional) statusHtml = `<span style="color:#999">${t('common.provisional')}</span>`;
            else if (invPaid >= (inv.totalAmount || 0)) statusHtml = `<span style="color:#28a745">${t('common.paidFull')}</span>`;
            else if (invPaid > 0) statusHtml = `<span style="color:#e65100">${t('common.paidPartial')}</span>`;
            else statusHtml = `<span style="color:var(--silver-400)">${t('common.unpaid')}</span>`;
            return `<div class="debts-inv-item">
              <div class="debts-inv-info">
                <div class="debts-inv-num">${inv.invoiceNumber || '—'} <span style="font-weight:400;font-size:10px;color:var(--silver-500)">${typeLabel}</span></div>
                <div class="debts-inv-date">${ds}</div>
              </div>
              <div style="font-size:10px">${statusHtml}</div>
              <div class="debts-inv-amount" style="color:${invRem > 0 ? '#e65100' : '#28a745'}">DA${fmtMoney(invRem)}</div>
              ${invRem > 0 && !inv.isProvisional && inv.type !== 'transfer_receive'
                ? `<button class="btn btn-sm btn-primary" onclick="openDebtPay('customer','${inv.id}')" style="font-size:11px"><i class="fas fa-hand-holding-usd"></i> ${t('debts.payBtn')}</button>`
                : ''}
            </div>`;
          }).join('')
      }

      <div class="debts-section-title"><i class="fas fa-hand-holding-usd"></i> ${t('debts.payments')} (${payments.length})</div>
      ${payments.length === 0
        ? `<div style="text-align:center;padding:12px;color:var(--silver-400);font-size:12px">${t('debts.noPayments')}</div>`
        : payments.sort((a,b)=>b.createdAt-a.createdAt).map(p => {
            const d = new Date(p.createdAt);
            const ds = d.toLocaleDateString('fr-DZ',{day:'2-digit',month:'short',year:'numeric'}) + ' ' + d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
            const invRef = p.invoiceId ? (DB.getInvoice(p.invoiceId)?.invoiceNumber || '') : '';
            return `<div class="debts-pay-item">
              <div class="debts-pay-date">${ds}</div>
              <div class="debts-pay-note">${p.note || ''} ${invRef ? '<span style="color:var(--silver-400)">#'+invRef+'</span>' : ''}</div>
              <div class="debts-pay-amount" style="color:#28a745">+DA${fmtMoney(p.amount)}</div>
            </div>`;
          }).join('')
      }
    `;
  } else {
    // Supplier
    const invoices = DB.getInvoicesBySupplier(id);
    const payments = DB.getSupplierPayments(id);
    // Payment vouchers settle balances without sale/purchase value — exclude
    // them from the stat cards (they never create Payment rows, but guard here).
    const statInvoices = invoices.filter(inv => inv.type !== 'payment');
    const statPayments = payments.filter(p => {
      const invRef = p.invoiceId ? DB.getInvoice(p.invoiceId) : null;
      return !(invRef && invRef.type === 'payment');
    });
    const totalSupSales = statInvoices.filter(inv => inv.type === 'sup_sale').reduce((s, inv) => s + (inv.totalAmount || 0), 0);
    const totalInvoiced = statInvoices.reduce((s, inv) => s + (inv.totalAmount || 0), 0) - totalSupSales;
    const totalPaid = statPayments.reduce((s, p) => s + p.amount, 0);

    body.innerHTML = `
      <div class="debts-stat-row">
        <div class="debts-stat-item"><div class="debts-stat-label">${t('debts.totalPurchases')}</div><div class="debts-stat-value" style="color:var(--bmw-blue-1)">DA${fmtMoney(totalInvoiced)}</div></div>
        <div class="debts-stat-item"><div class="debts-stat-label">${t('debts.paidToThem')}</div><div class="debts-stat-value" style="color:#28a745">DA${fmtMoney(totalPaid)}</div></div>
        <div class="debts-stat-item"><div class="debts-stat-label">${t('debts.balance')}</div><div class="debts-stat-value ${balCls}">${balSign}DA${fmtMoney(Math.abs(balance))}</div></div>
      </div>

      <div class="debts-section-title"><i class="fas fa-file-invoice"></i> ${t('debts.invoices')} (${invoices.length})</div>
      ${invoices.length === 0
        ? `<div style="text-align:center;padding:12px;color:var(--silver-400);font-size:12px">${t('debts.noInvoices')}</div>`
        : invoices.sort((a,b)=>b.createdAt-a.createdAt).map(inv => {
            const invPaid = inv.type === 'payment' ? (inv.totalAmount || 0) : DB.getInvoiceEffectivePaid(inv);
            const invRem = inv.type === 'sup_sale'
              ? DB.getSupSaleNetDue(inv)
              : Math.max(0, (inv.totalAmount || 0) - invPaid);
            const d = new Date(inv.createdAt);
            const ds = d.toLocaleDateString('fr-DZ',{day:'2-digit',month:'short',year:'numeric'}) + ' ' + d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
            let statusHtml, typeLabel;
            if (inv.type === 'sup_sale') typeLabel = 'بيع له';
            else if (inv.type === 'supplier' || inv.type === 'purchase') typeLabel = t('invoices.typePurchase');
            else if (inv.type === 'payment') typeLabel = t('invoices.typePayment');
            else if (inv.type === 'dispatch') typeLabel = t('invoices.typeDispatch');
            else typeLabel = inv.type;
            if (inv.isProvisional) statusHtml = `<span style="color:#999">${t('common.provisional')}</span>`;
            else if (invRem <= 0) statusHtml = `<span style="color:#28a745">${t('common.paidFull')}</span>`;
            else if (invPaid > 0) statusHtml = `<span style="color:#e65100">${t('common.paidPartial')}</span>`;
            else statusHtml = `<span style="color:var(--silver-400)">${t('common.unpaid')}</span>`;
            return `<div class="debts-inv-item">
              <div class="debts-inv-info">
                <div class="debts-inv-num">${inv.invoiceNumber || '—'} <span style="font-weight:400;font-size:10px;color:var(--silver-500)">${typeLabel}</span></div>
                <div class="debts-inv-date">${ds}</div>
              </div>
              <div style="font-size:10px">${statusHtml}</div>
              <div class="debts-inv-amount" style="color:${invRem > 0 ? '#e65100' : '#28a745'}">DA${fmtMoney(invRem)}</div>
              ${invRem > 0 && !inv.isProvisional && inv.type !== 'transfer_receive'
                ? `<button class="btn btn-sm btn-primary" onclick="openDebtPay('supplier','${inv.id}')" style="font-size:11px"><i class="fas fa-hand-holding-usd"></i> ${t('debts.payBtn')}</button>`
                : ''}
            </div>`;
          }).join('')
      }

      <div class="debts-section-title"><i class="fas fa-hand-holding-usd"></i> ${t('debts.payments')} (${payments.length})</div>
      ${payments.length === 0
        ? `<div style="text-align:center;padding:12px;color:var(--silver-400);font-size:12px">${t('debts.noPayments')}</div>`
        : payments.sort((a,b)=>b.createdAt-a.createdAt).map(p => {
            const d = new Date(p.createdAt);
            const ds = d.toLocaleDateString('fr-DZ',{day:'2-digit',month:'short',year:'numeric'}) + ' ' + d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
            const invRef = p.invoiceId ? (DB.getInvoice(p.invoiceId)?.invoiceNumber || '') : '';
            return `<div class="debts-pay-item">
              <div class="debts-pay-date">${ds}</div>
              <div class="debts-pay-note">${p.note || ''} ${invRef ? '<span style="color:var(--silver-400)">#'+invRef+'</span>' : ''}</div>
              <div class="debts-pay-amount" style="color:#e65100">-DA${fmtMoney(p.amount)}</div>
            </div>`;
          }).join('')
      }
    `;
  }
}

function closeDebtsDetail() {
  document.getElementById('debtsDetailPanel').classList.remove('open');
}

// ===== PAY FROM DEBTS =====
var _debtPayInvId = null;

function openDebtPay(type, invId) {
  const inv = DB.getInvoice(invId);
  if (!inv) return;
  if (inv.isProvisional) { alert(t('invoices.cannotPayProforma')); return; }
  const paid = DB.getInvoiceEffectivePaid(invId);
  const remaining = inv.type === 'sup_sale'
    ? DB.getSupSaleNetDue(inv)
    : DB.getInvoiceRemaining(inv);
  if (remaining <= 0) { alert(t('invoices.fullyPaidAlert')); return; }
  _debtPayInvId = invId;
  document.getElementById('debtPayTotal').textContent = 'DA' + fmtMoney((inv.totalAmount || 0));
  document.getElementById('debtPayPaid').textContent = 'DA' + fmtMoney(paid);
  document.getElementById('debtPayRemaining').textContent = 'DA' + fmtMoney(remaining);
  document.getElementById('debtPayAmount').value = remaining.toFixed(2);
  document.getElementById('debtPayModal').style.display = 'flex';
}

function closeDebtPay() {
  _debtPayInvId = null;
  document.getElementById('debtPayModal').style.display = 'none';
}

function confirmDebtPayment() {
  if (!_debtPayInvId) return;
  const inv = DB.getInvoice(_debtPayInvId);
  if (!inv) return;
  const paid = DB.getInvoiceEffectivePaid(_debtPayInvId);
  const remaining = inv.type === 'sup_sale'
    ? DB.getSupSaleNetDue(inv)
    : DB.getInvoiceRemaining(inv);
  const amount = parseFloat(document.getElementById('debtPayAmount').value) || 0;
  if (amount <= 0 || amount > remaining) { alert(t('invoices.invalidAmount')); return; }

  DB.addPayment({
    customerId: inv.customerId || undefined,
    supplierId: inv.supplierId || undefined,
    invoiceId: _debtPayInvId,
    amount,
    method: (document.getElementById('debtPayMethod')?.value) || 'cash',
    note: 'دفع من صفحة الديون',
  });

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

  DB.updateInvoice(_debtPayInvId, { paidAmount: paid + amount });

  const partyId = inv.customerId || inv.supplierId;
  const partyType = inv.customerId ? 'customer' : 'supplier';
  closeDebtPay();
  renderDebts();
  if (partyId) showDebtsDetail(partyType, partyId);
  alert(t('invoices.paymentSaved'));
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== LAN SYNC HANDLER =====
window._pageSyncHandlers = window._pageSyncHandlers || {};
window._pageSyncHandlers['debts'] = function debtsSyncData() {
  window.syncPreserveRefresh({
    search: ['debtsSearch'],
    render: () => {
      // renderDebtsList reads the module-level _debtsSearch, so push the
      // (still-focused) input value into it before re-rendering.
      const inp = document.getElementById('debtsSearch');
      if (inp) _debtsSearch = inp.value;
      renderDebts();
    },
  });
};