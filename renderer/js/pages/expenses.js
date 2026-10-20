// ==================== EXPENSES PAGE (المصاريف) ====================
// Shows every payment that صافي الحساب (net account) counts as an expense,
// with time & date, searchable by date (day/month/year) and by invoice /
// supplier / customer name. Renders 25 rows at a time + "show more".

const EXP_PAGE_SIZE = 25;
const EXP_MONTHS_KEYS = ['1','2','3','4','5','6','7','8','9','10','11','12'];

let _expAll = [];       // full enriched expense records (filtered at source)
let _expFiltered = [];  // after text + date filters
let _expShown = 0;      // how many rows are currently rendered
let _expDebounce = null;
let _expDatePickerMode = null; // 'year' | 'month' | 'day'

function _expLocale() {
  return __lang === 'ar' ? 'ar-EG-u-nu-latn' : (__lang === 'zh' ? 'zh-CN' : (__lang === 'fr' ? 'fr-FR' : 'en-US'));
}

function _expMonthName(m) {
  const d = new Date(2020, m - 1, 15);
  return d.toLocaleDateString(_expLocale(), { month: 'long' });
}

function _expFmtNum(n) { return 'DA' + fmtMoney((Number(n) || 0)); }

// ========== DATA: same classification as net-account.js ==========
function _buildExpenseRecords() {
  const invoices = DB.getInvoices() || [];
  const invById = {};
  invoices.forEach(i => { invById[i.id] = i; });

  // literal copy of net-account's isNetExpensePayment
  function isNetExpensePayment(p) {
    if (p.supplierId || p.type === 'stock_purchase' || p.type === 'dispatch') {
      const inv = p.invoiceId ? invById[p.invoiceId] : null;
      if (inv && (inv.type === 'sup_sale' || inv.type === 'customer')) return false;
      return true;
    }
    const inv = p.invoiceId ? invById[p.invoiceId] : null;
    return !!inv && (inv.type === 'supplier' || inv.type === 'purchase');
  }

  const recs = [];
  (DB.getPayments() || []).forEach(p => {
    if (p.isProvisional) return;
    // المقاصّة عند بيع لمورد = تسوية رصيد محايدة لا تظهر كمصروف.
    if (p.isSupSaleExpense) return;
    // Payment vouchers (سند قبض) settle balances without expense value — a
    // Payment row linked to one must not be classified as an expense.
    const invRef = p.invoiceId ? invById[p.invoiceId] : null;
    if (invRef && invRef.type === 'payment') return;
    if (p.type !== 'net_expense' && !isNetExpensePayment(p)) return;

    const inv = p.invoiceId ? invById[p.invoiceId] : null;
    const suppliers = p.supplierId ? DB.getSuppliers().find(s => s.id === p.supplierId) : null;
    const customers = p.customerId ? DB.getCustomers().find(c => c.id === p.customerId) : null;
    const employeeName = (p.tag === 'salary' && p.employeeId)
      ? (DB.getEmployee(p.employeeId) || {}).name || '' : '';

    const invNum = inv ? (inv.invoiceNumber || 'No ' + (inv.id ? inv.id.substr(-6) : '')) : '';
    const supplierName = suppliers ? suppliers.name : '';
    const customerName = customers ? customers.name : '';

    const searchText = [
      supplierName, customerName, employeeName, invNum, p.note || '', p.period || '',
      inv && inv.items ? inv.items.map(it => it.name).join(' ') : '',
    ].join(' ').toLowerCase();

    recs.push({
      ts: p.createdAt || 0,
      p, inv,
      supplierName, customerName, employeeName, invNum,
      searchText,
    });
  });

  recs.sort((a, b) => b.ts - a.ts);
  return recs;
}

function _expTypeInfo(r) {
  const p = r.p;
  if (p.tag === 'salary') return { label: t('expenses.typeSalary'), badge: 'warning' };
  if (p.type === 'net_expense') return { label: t('expenses.typeDirect'), badge: 'danger' };
  if (p.type === 'dispatch') return { label: t('expenses.typeDispatch'), badge: 'warning' };
  if (p.type === 'stock_purchase') return { label: t('expenses.typeStock'), badge: 'warning' };
  if (p.supplierId) return { label: t('expenses.typeSupplier'), badge: 'danger' };
  if (r.inv && (r.inv.type === 'supplier' || r.inv.type === 'purchase')) return { label: t('expenses.typePurchase'), badge: 'danger' };
  return { label: t('expenses.typeExpense'), badge: 'danger' };
}

function _expDesc(r) {
  const p = r.p;
  if (p.tag === 'salary') {
    const name = r.employeeName || t('employees.title');
    return p.note ? `${name} — ${p.note}` : `${name}${p.period ? ' — ' + p.period : ''}`;
  }
  if (p.type === 'net_expense') return p.note || t('expenses.directExpense');
  if (p.supplierName) return (p.note ? `${p.supplierName} — ${p.note}` : p.note || p.supplierName);
  return p.note || t('expenses.noDesc');
}

function _expMethodLabel(p) {
  if (p.method === 'ccp') return `<i class="fas fa-credit-card" style="margin-left:4px;font-size:11px"></i>${t('sales.payCcp')}`;
  if (p.method === 'mixed') {
    const cash = (p.cashAmount || 0) > 0 ? t('sales.payCash') : '';
    const ccp = (p.ccpAmount || 0) > 0 ? t('sales.payCcp') : '';
    if (cash && ccp) return cash + ' + ' + ccp;
    return cash || ccp || t('sales.payCash');
  }
  return `<i class="fas fa-money-bill" style="margin-left:4px;font-size:11px"></i>${t('sales.payCash')}`;
}

// ========== FILTERS ==========
function _expCurrentDateFilter() {
  const year = document.getElementById('expYearVal').value;
  const month = document.getElementById('expMonthVal').value;
  const day = document.getElementById('expDayVal').value;
  return { year, month, day };
}

function _expInDateFilter(ts, f) {
  const d = new Date(ts);
  if (f.year && d.getFullYear() !== Number(f.year)) return false;
  if (f.month && (d.getMonth() + 1) !== Number(f.month)) return false;
  if (f.day && d.getDate() !== Number(f.day)) return false;
  return true;
}

function _applyExpenseFilters() {
  const q = (document.getElementById('expSearch').value || '').trim().toLowerCase();
  const dateF = _expCurrentDateFilter();
  _expFiltered = _expAll.filter(r => {
    if (q && !r.searchText.includes(q)) return false;
    if (!_expInDateFilter(r.ts, dateF)) return false;
    return true;
  });
}

function renderExpenses() {
  const container = document.getElementById('expList');
  if (!container) return;

  _applyExpenseFilters();
  _expShown = 0;
  container.innerHTML = '';

  document.getElementById('expTotalAmount').textContent = _expFmtNum(_expFiltered.reduce((s, r) => s + (r.p.amount || 0), 0));
  document.getElementById('expTotalCount').textContent = String(_expFiltered.length);

  if (_expFiltered.length === 0) {
    container.innerHTML = `<div class="placeholder-box"><i class="fas fa-money-bill-wave" style="font-size:36px;color:#555"></i><p>${t('expenses.empty')}</p></div>`;
    document.getElementById('expShowMoreBtn').style.display = 'none';
    return;
  }

  let html = '<div class="table-container"><table class="data-table"><thead><tr>' +
    `<th>${t('expenses.colDate')}</th><th>${t('expenses.colDesc')}</th><th>${t('expenses.colSource')}</th>` +
    `<th>${t('expenses.colType')}</th><th>${t('expenses.colMethod')}</th><th>${t('expenses.colAmount')}</th>` +
    '</tr></thead><tbody>';

  const total = _expFiltered.length;
  const chunk = _expFiltered.slice(0, EXP_PAGE_SIZE);
  chunk.forEach(r => { html += _expRowHTML(r); });
  html += '</tbody></table></div>';
  container.innerHTML = html;

  _expShown = chunk.length;
  document.getElementById('expShowMoreBtn').style.display = (_expShown < total) ? 'inline-flex' : 'none';
}

function _expRowHTML(r) {
  const p = r.p;
  const dt = new Date(r.ts || 0);
  const dateStr = dt.toLocaleDateString(_expLocale());
  const timeStr = dt.toLocaleTimeString(_expLocale(), { hour: '2-digit', minute: '2-digit' });
  const type = _expTypeInfo(r);
  const source = r.invNum || r.supplierName || r.customerName || r.employeeName;
  const sourceHtml = source ? escHtml(source) : '<span style="color:var(--silver-400)">—</span>';
  const desc = escHtml(_expDesc(r));

  return `<tr>
    <td style="white-space:nowrap">${dateStr}<div style="font-size:11px;color:var(--silver-500)">${timeStr}</div></td>
    <td>${desc}</td>
    <td>${sourceHtml}</td>
    <td><span class="badge badge-${type.badge}">${type.label}</span></td>
    <td style="white-space:nowrap;font-size:11px">${_expMethodLabel(p)}</td>
    <td style="white-space:nowrap;font-weight:700;color:#dc3545">${_expFmtNum(p.amount)}</td>
  </tr>`;
}

function expLoadMore() {
  const container = document.querySelector('#expList tbody');
  if (!container) return;
  const next = _expFiltered.slice(_expShown, _expShown + EXP_PAGE_SIZE);
  let html = '';
  next.forEach(r => { html += _expRowHTML(r); });
  container.insertAdjacentHTML('beforeend', html);
  _expShown += next.length;
  document.getElementById('expShowMoreBtn').style.display = (_expShown < _expFiltered.length) ? 'inline-flex' : 'none';
}

// ========== DATE PICKER ==========
function _expAvailableYears() {
  const set = new Set();
  _expAll.forEach(r => set.add(new Date(r.ts).getFullYear()));
  return Array.from(set).sort((a, b) => b - a);
}

function openExpDatePicker(mode) {
  _expDatePickerMode = mode;
  const titleEl = document.getElementById('expDatePickerTitle');
  titleEl.textContent = mode === 'year' ? t('expenses.chooseYear')
    : mode === 'month' ? t('expenses.chooseMonth') : t('expenses.chooseDay');

  const box = document.getElementById('expDatePickerItems');
  box.innerHTML = '';

  const cur = _expCurrentDateFilter();
  let values = [];

  if (mode === 'year') {
    values = _expAvailableYears().map(v => ({ v: String(v), label: String(v) }));
  } else if (mode === 'month') {
    values = EXP_MONTHS_KEYS.map(m => ({ v: m, label: _expMonthName(Number(m)) }));
  } else {
    values = Array.from({ length: 31 }, (_, i) => ({ v: String(i + 1), label: String(i + 1) }));
  }

  const active = mode === 'year' ? cur.year : mode === 'month' ? cur.month : cur.day;
  values.forEach(item => {
    const isActive = active === item.v;
    box.insertAdjacentHTML('beforeend',
      `<button class="btn exp-date-item${isActive ? ' active' : ''}" data-val="${item.v}"
        onclick="expDatePick('${mode}','${item.v}')" style="min-width:82px;justify-content:center">${item.label}</button>`);
  });

  document.getElementById('expDatePickerModal').style.display = 'flex';
}

function expDatePick(mode, val) {
  const map = { year: 'expYearVal', month: 'expMonthVal', day: 'expDayVal' };
  const hidden = document.getElementById(map[mode]);
  hidden.value = val;
  // update the visible button label
  const labelMap = { year: 'expYearLabel', month: 'expMonthLabel', day: 'expDayLabel' };
  const labelEl = document.getElementById(labelMap[mode]);
  const dateF = _expCurrentDateFilter();

  if (mode === 'year') labelEl.textContent = dateF.year || t('expenses.allYears');
  else if (mode === 'month') labelEl.textContent = dateF.month ? _expMonthName(Number(dateF.month)) : t('expenses.allMonths');
  else labelEl.textContent = dateF.day || t('expenses.allDays');

  renderExpenses();
  closeExpDatePicker();
}

function expSetDateFilter(reset) {
  if (reset) {
    ['year', 'month', 'day'].forEach(m => {
      document.getElementById(m === 'year' ? 'expYearVal' : m === 'month' ? 'expMonthVal' : 'expDayVal').value = '';
    });
    document.getElementById('expYearLabel').textContent = t('expenses.allYears');
    document.getElementById('expMonthLabel').textContent = t('expenses.allMonths');
    document.getElementById('expDayLabel').textContent = t('expenses.allDays');
    renderExpenses();
  }
  closeExpDatePicker();
}

function closeExpDatePicker() {
  document.getElementById('expDatePickerModal').style.display = 'none';
  _expDatePickerMode = null;
}

// ========== ADD EXPENSE MODAL ==========
let _expMethod = 'cash';

function openAddExpenseModal() {
  if (!Auth.isManager() && !(Auth.canEdit && Auth.canEdit('expenses'))) { alert(t('common.noPermission')); return; }
  document.getElementById('expReason').value = '';
  document.getElementById('expAmount').value = '';
  document.getElementById('expCashAmount').value = '0';
  document.getElementById('expCcpAmount').value = '0';
  document.getElementById('expMixedTotal').textContent = '';
  setExpenseMethod('cash');
  document.getElementById('addExpenseModal').style.display = 'flex';
  document.getElementById('expReason').focus();
}

function closeAddExpenseModal() {
  document.getElementById('addExpenseModal').style.display = 'none';
}

function setExpenseMethod(m) {
  _expMethod = m;
  document.querySelectorAll('#addExpenseModal .pay-method-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.method === m));
  document.getElementById('expMixedPay').style.display = (m === 'mixed') ? 'block' : 'none';
  if (m !== 'mixed') {
    document.getElementById('expAmount').disabled = false;
    document.getElementById('expCashAmount').disabled = true;
    document.getElementById('expCcpAmount').disabled = true;
  } else {
    document.getElementById('expAmount').disabled = true;
    document.getElementById('expCashAmount').disabled = false;
    document.getElementById('expCcpAmount').disabled = false;
    onExpMixedInput();
  }
}

function onExpAmountInput() {
  const amt = parseFloat(document.getElementById('expAmount').value) || 0;
  document.getElementById('expAmount').parentElement.classList.toggle('has-value', amt > 0);
}

function onExpMixedInput() {
  const cash = parseFloat(document.getElementById('expCashAmount').value) || 0;
  const ccp = parseFloat(document.getElementById('expCcpAmount').value) || 0;
  document.getElementById('expMixedTotal').textContent = `${t('expenses.mixedTotal')}: ${_expFmtNum(cash + ccp)}`;
}

function confirmAddExpense() {
  if (!Auth.isManager() && !(Auth.canEdit && Auth.canEdit('expenses'))) { alert(t('common.noPermission')); return; }

  const reason = document.getElementById('expReason').value.trim();
  if (!reason) { alert(t('expenses.needReason')); return; }

  let amount = 0, cashAmount = 0, ccpAmount = 0;
  if (_expMethod === 'mixed') {
    cashAmount = parseFloat(document.getElementById('expCashAmount').value) || 0;
    ccpAmount = parseFloat(document.getElementById('expCcpAmount').value) || 0;
    amount = cashAmount + ccpAmount;
  } else {
    amount = parseFloat(document.getElementById('expAmount').value) || 0;
    if (_expMethod === 'ccp') ccpAmount = amount; else cashAmount = amount;
  }
  if (amount <= 0) { alert(t('expenses.invalidAmount')); return; }

  DB.addPayment({
    type: 'net_expense',
    amount,
    method: _expMethod,
    cashAmount: _expMethod === 'mixed' ? cashAmount : undefined,
    ccpAmount: _expMethod === 'mixed' ? ccpAmount : undefined,
    note: reason,
  });

  closeAddExpenseModal();
  refreshExpensePage();
}

// ========== INIT ==========
function init_expenses() {
  const search = document.getElementById('expSearch');
  if (search) {
    search.oninput = () => {
      clearTimeout(_expDebounce);
      _expDebounce = setTimeout(() => renderExpenses(), 250);
    };
  }

  // permission gate for add button
  const btn = document.getElementById('btnAddExpense');
  if (btn) btn.style.display = (Auth.isManager() || (Auth.canEdit && Auth.canEdit('expenses'))) ? 'inline-flex' : 'none';

  // hidden date filter values
  ['expYearVal', 'expMonthVal', 'expDayVal'].forEach(id => {
    if (!document.getElementById(id)) {
      const h = document.createElement('input');
      h.type = 'hidden';
      h.id = id;
      h.value = '';
      document.body.appendChild(h);
    }
  });

  _expAll = _buildExpenseRecords();
  _expShown = 0;
  renderExpenses();
}

function refreshExpensePage() {
  _expAll = _buildExpenseRecords();
  _expShown = 0;
  renderExpenses();
}

// expose for inline onclick handlers in the page HTML
window.openExpDatePicker = openExpDatePicker;
window.expDatePick = expDatePick;
window.expSetDateFilter = expSetDateFilter;
window.closeExpDatePicker = closeExpDatePicker;
window.openAddExpenseModal = openAddExpenseModal;
window.closeAddExpenseModal = closeAddExpenseModal;
window.setExpenseMethod = setExpenseMethod;
window.onExpAmountInput = onExpAmountInput;
window.onExpMixedInput = onExpMixedInput;
window.confirmAddExpense = confirmAddExpense;
window.expLoadMore = expLoadMore;

function _expModalHandler(e) {
  if (e.target === document.getElementById('addExpenseModal')) closeAddExpenseModal();
  if (e.target === document.getElementById('expDatePickerModal')) closeExpDatePicker();
}
document.removeEventListener('click', _expModalHandler);
document.addEventListener('click', _expModalHandler);
if (window._pageListeners) window._pageListeners.push({ type: 'click', fn: _expModalHandler });

// ===== LAN SYNC HANDLER =====
window._pageSyncHandlers = window._pageSyncHandlers || {};
window._pageSyncHandlers['expenses'] = function expensesSyncData() {
  window.syncPreserveRefresh({
    search: ['expSearch'],
    render: () => {
      _expAll = _buildExpenseRecords();
      _expShown = 0;
      renderExpenses();
    },
  });
};