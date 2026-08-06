var _debtsTab = 'customers';
var _debtsSearch = '';

function init_debts() {
  _debtsTab = 'customers';
  _debtsSearch = '';
  renderDebts();
}

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
  document.getElementById('dsSupplierDebt').textContent = 'DA' + supTotal.toFixed(2);
  document.getElementById('dsCustomerDebt').textContent = 'DA' + custTotal.toFixed(2);
  document.getElementById('dsNetDebt').textContent = 'DA' + (custTotal - supTotal).toFixed(2);

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
            <div class="debts-entity-balance ${cls}">${sign}DA${Math.abs(bal).toFixed(2)}</div>
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
            <div class="debts-entity-balance ${cls}">${sign}DA${Math.abs(bal).toFixed(2)}</div>
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
    const totalInvoiced = invoices.reduce((s, inv) => s + (inv.totalAmount || 0), 0);
    const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

    body.innerHTML = `
      <div class="debts-stat-row">
        <div class="debts-stat-item"><div class="debts-stat-label">${t('debts.totalInvoices')}</div><div class="debts-stat-value" style="color:var(--bmw-blue-1)">DA${totalInvoiced.toFixed(2)}</div></div>
        <div class="debts-stat-item"><div class="debts-stat-label">${t('common.paid')}</div><div class="debts-stat-value" style="color:#28a745">DA${totalPaid.toFixed(2)}</div></div>
        <div class="debts-stat-item"><div class="debts-stat-label">${t('debts.balance')}</div><div class="debts-stat-value ${balCls}">${balSign}DA${Math.abs(balance).toFixed(2)}</div></div>
      </div>

      <div class="debts-section-title"><i class="fas fa-file-invoice"></i> ${t('debts.invoices')} (${invoices.length})</div>
      ${invoices.length === 0
        ? `<div style="text-align:center;padding:12px;color:var(--silver-400);font-size:12px">${t('debts.noInvoices')}</div>`
        : invoices.sort((a,b)=>b.createdAt-a.createdAt).map(inv => {
            const invPaid = DB.getInvoicePaidAmount(inv.id);
            const invRem = Math.max(0, (inv.totalAmount || 0) - invPaid);
            const d = new Date(inv.createdAt);
            const ds = d.toLocaleDateString('fr-DZ',{day:'2-digit',month:'short',year:'numeric'}) + ' ' + d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
            let statusHtml, typeLabel;
            if (inv.type === 'customer') typeLabel = t('invoices.typeSale');
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
              <div class="debts-inv-amount" style="color:${invRem > 0 ? '#e65100' : '#28a745'}">DA${invRem.toFixed(2)}</div>
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
              <div class="debts-pay-amount" style="color:#28a745">+DA${p.amount.toFixed(2)}</div>
            </div>`;
          }).join('')
      }
    `;
  } else {
    // Supplier
    const invoices = DB.getInvoicesBySupplier(id);
    const payments = DB.getSupplierPayments(id);
    const totalInvoiced = invoices.reduce((s, inv) => s + (inv.totalAmount || 0), 0);
    const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

    body.innerHTML = `
      <div class="debts-stat-row">
        <div class="debts-stat-item"><div class="debts-stat-label">${t('debts.totalPurchases')}</div><div class="debts-stat-value" style="color:var(--bmw-blue-1)">DA${totalInvoiced.toFixed(2)}</div></div>
        <div class="debts-stat-item"><div class="debts-stat-label">${t('debts.paidToThem')}</div><div class="debts-stat-value" style="color:#28a745">DA${totalPaid.toFixed(2)}</div></div>
        <div class="debts-stat-item"><div class="debts-stat-label">${t('debts.balance')}</div><div class="debts-stat-value ${balCls}">${balSign}DA${Math.abs(balance).toFixed(2)}</div></div>
      </div>

      <div class="debts-section-title"><i class="fas fa-file-invoice"></i> ${t('debts.invoices')} (${invoices.length})</div>
      ${invoices.length === 0
        ? `<div style="text-align:center;padding:12px;color:var(--silver-400);font-size:12px">${t('debts.noInvoices')}</div>`
        : invoices.sort((a,b)=>b.createdAt-a.createdAt).map(inv => {
            const invPaid = DB.getInvoicePaidAmount(inv.id);
            const invRem = Math.max(0, (inv.totalAmount || 0) - invPaid);
            const d = new Date(inv.createdAt);
            const ds = d.toLocaleDateString('fr-DZ',{day:'2-digit',month:'short',year:'numeric'}) + ' ' + d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
            let statusHtml, typeLabel;
            if (inv.type === 'supplier' || inv.type === 'purchase') typeLabel = t('invoices.typePurchase');
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
              <div class="debts-inv-amount" style="color:${invRem > 0 ? '#e65100' : '#28a745'}">DA${invRem.toFixed(2)}</div>
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
              <div class="debts-pay-amount" style="color:#e65100">-DA${p.amount.toFixed(2)}</div>
            </div>`;
          }).join('')
      }
    `;
  }
}

function closeDebtsDetail() {
  document.getElementById('debtsDetailPanel').classList.remove('open');
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}