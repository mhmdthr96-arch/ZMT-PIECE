var _editingSupplierId = null;
var _supAll = [];
var _supFiltered = [];
var _supPager = null;

function init_suppliers() {
  _supAll = DB.getSuppliers();
  _supFiltered = [..._supAll];
  if (_supPager) { _supPager.destroy(); _supPager = null; }
  _supPager = new Pager({
    data: _supFiltered,
    container: document.getElementById('suppliersGrid'),
    pageSize: 12,
    render: renderSupPage,
  });
  setupSupSearch();
}

function renderSuppliers() {
  _supAll = DB.getSuppliers();
  applySupFilter();
}

function renderSupPage(slice, info) {
  const grid = document.getElementById('suppliersGrid');
  const empty = document.getElementById('suppliersEmpty');

  if (info.total === 0) {
    grid.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = slice.map(s => {
    const balance = parseFloat(s.balance) || 0;
    const paid = DB.getSupplierPayments(s.id).reduce((sum, p) => sum + p.amount, 0);
    return `<div class="supplier-card" onclick="openSupplierDetail('${s.id}')">
      <div class="sup-card-avatar">
        <i class="fas fa-user-tie"></i>
      </div>
      <div class="sup-card-body">
        <div class="sup-card-name">${escHtml(s.name)}</div>
        <div class="sup-card-meta">
          ${s.phone ? `<span><i class="fas fa-phone"></i> ${escHtml(s.phone)}</span>` : ''}
          ${s.address ? `<span><i class="fas fa-map-marker-alt"></i> ${escHtml(s.address)}</span>` : ''}
        </div>
      </div>
      <div class="sup-card-stats">
        <div class="sup-stat">
          <span class="sup-stat-label">الرصيد</span>
          <span class="sup-stat-value ${balance > 0 ? 'text-danger' : 'text-success'}">DA${fmtMoney(balance)}</span>
        </div>
        <div class="sup-stat">
          <span class="sup-stat-label">المدفوع</span>
          <span class="sup-stat-value" style="color:#28a745">DA${fmtMoney(paid)}</span>
        </div>
      </div>
      <button class="rec-card-btn" onclick="event.stopPropagation();openSupRecords('${s.id}')" title="سجلات المورد">
        <i class="fas fa-clipboard-list"></i><span>السجل</span>
      </button>
      <div class="sup-card-action">
        <i class="fas fa-chevron-left"></i>
      </div>
    </div>`;
  }).join('');
}

function escHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function applySupFilter() {
  const q = normSearch(document.getElementById('supSearch')?.value || '').toLowerCase();
  _supFiltered = q
    ? _supAll.filter(s => s.name.toLowerCase().includes(q) || (s.phone && s.phone.includes(q)))
    : [..._supAll];
  if (_supPager) _supPager.updateData(_supFiltered);
}

function setupSupSearch() {
  const input = document.getElementById('supSearch');
  if (!input) return;
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  newInput.addEventListener('input', (typeof debounce === 'function') ? debounce(applySupFilter, 180) : applySupFilter);
}

function showAddSupplierForm() {
  document.getElementById('supName').value = '';
  document.getElementById('supPhone').value = '';
  document.getElementById('supAddress').value = '';
  document.getElementById('addSupplierModal').style.display = 'flex';
}

function closeAddSupplier() {
  document.getElementById('addSupplierModal').style.display = 'none';
}

function confirmAddSupplier() {
  const name = document.getElementById('supName').value.trim();
  if (!name) { alert('الرجاء إدخال اسم المورد'); return; }
  const suppliers = DB.getSuppliers();
  suppliers.push({
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    name,
    phone: document.getElementById('supPhone').value.trim(),
    address: document.getElementById('supAddress').value.trim(),
    email: document.getElementById('supEmail').value.trim(),
    balance: 0,
  });
  DB.saveSuppliers(suppliers);
  const added = suppliers[suppliers.length - 1];
  DB.logAudit({ action: 'add', entity: 'supplier', entityId: added.id, detail: name });
  closeAddSupplier();
  renderSuppliers();
}

function openSupplierDetail(id) {
  window.supCtx = { supplierId: id };
  navigateTo('supplier-detail');
}

function showEditSupplierForm(id) {
  const s = DB.getSuppliers().find(x => x.id === id);
  if (!s) return;
  document.getElementById('editSupId').value = s.id;
  document.getElementById('editSupName').value = s.name;
  document.getElementById('editSupPhone').value = s.phone || '';
  document.getElementById('editSupAddress').value = s.address || '';
  document.getElementById('editSupEmail').value = s.email || '';
  document.getElementById('editSupplierModal').style.display = 'flex';
}

function closeEditSupplier() {
  document.getElementById('editSupplierModal').style.display = 'none';
}

function confirmEditSupplier() {
  const id = document.getElementById('editSupId').value;
  const name = document.getElementById('editSupName').value.trim();
  if (!name) { alert('الرجاء إدخال اسم المورد'); return; }
  const suppliers = DB.getSuppliers();
  const idx = suppliers.findIndex(s => s.id === id);
  if (idx === -1) return;
  suppliers[idx].name = name;
  suppliers[idx].phone = document.getElementById('editSupPhone').value.trim();
  suppliers[idx].address = document.getElementById('editSupAddress').value.trim();
  suppliers[idx].email = document.getElementById('editSupEmail').value.trim();
  DB.saveSuppliers(suppliers);
  DB.logAudit({ action: 'update', entity: 'supplier', entityId: id, detail: name });
  closeEditSupplier();
  renderSuppliers();
  openSupplierDetail(id);
}

function deleteSupplier2(id) {
  if (!confirm('هل أنت متأكد من حذف هذا المورد؟')) return;
  const suppliers = DB.getSuppliers();
  const idx = suppliers.findIndex(s => s.id === id);
  const removed = idx !== -1 ? suppliers[idx] : null;
  if (idx !== -1) suppliers.splice(idx, 1);
  DB.saveSuppliers(suppliers);
  if (removed) DB.logAudit({ action: 'delete', entity: 'supplier', entityId: id, detail: removed.name || '' });
  navigateTo('suppliers');
}

// ===== SUPPLIER RECORDS (سجلات المورد) =====

function _supRecStatusLabel(status) {
  switch (status) {
    case 'returned': return 'تم الاسترجاع';
    case 'not_returned': return 'لم تسترجع';
    default: return 'جاري الاسترجاع';
  }
}

function _supRecStatusBadge(status) {
  const cls = status === 'returned' ? 'badge-success' : (status === 'not_returned' ? 'badge-info' : 'badge-warning');
  return `<span class="badge ${cls}">${_supRecStatusLabel(status)}</span>`;
}

function _supRecordsData(supplierId) {
  const invoices = DB.getInvoicesBySupplier(supplierId);
  const purchases = invoices.filter(inv => inv.type === 'supplier' || inv.type === 'purchase');
  const sales = invoices.filter(inv => inv.type === 'sup_sale');
  const returns = (DB.getSupplierReturns ? DB.getSupplierReturns() : [])
    .filter(r => r.supplierId === supplierId)
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const purchaseAmount = purchases.reduce((s, inv) => s + (inv.totalAmount || 0), 0);
  const saleAmount = sales.reduce((s, inv) => s + (inv.totalAmount || 0), 0);
  const returnAmount = returns.reduce((s, r) => s + (r.amount || 0), 0);
  return { purchases, purchaseAmount, sales, saleAmount, returns, returnAmount };
}

function openSupRecords(id) {
  const s = DB.getSuppliers().find(x => x.id === id);
  if (!s) return;
  const rec = _supRecordsData(id);

  document.getElementById('supRecordsName').textContent = s.name;

  document.getElementById('supRecStats').innerHTML = `
    <div class="rec-chip">
      <span class="rec-chip-icon" style="background:#e3f2fd;color:#1565c0"><i class="fas fa-cart-arrow-down"></i></span>
      <div>
        <div class="rec-chip-label">عمليات الشراء من المورد</div>
        <div class="rec-chip-val">${rec.purchases.length} <small>فاتورة</small> · DA${fmtMoney(rec.purchaseAmount)}</div>
      </div>
    </div>
    <div class="rec-chip">
      <span class="rec-chip-icon" style="background:#f3e5f5;color:#8e24aa"><i class="fas fa-handshake"></i></span>
      <div>
        <div class="rec-chip-label">عمليات البيع له</div>
        <div class="rec-chip-val">${rec.sales.length} <small>عملية</small> · DA${fmtMoney(rec.saleAmount)}</div>
      </div>
    </div>
    <div class="rec-chip">
      <span class="rec-chip-icon" style="background:#fff3e0;color:#e65100"><i class="fas fa-box-open"></i></span>
      <div>
        <div class="rec-chip-label">السلع الفاسدة المرجعة</div>
        <div class="rec-chip-val">${rec.returns.length} <small>مرتجع</small> · DA${fmtMoney(rec.returnAmount)}</div>
      </div>
    </div>`;

  const listBox = document.getElementById('supRecList');
  if (rec.returns.length === 0) {
    listBox.innerHTML = `<div class="rec-empty"><i class="fas fa-box-open"></i><p>لا توجد سلع فاسدة مرجعة لهذا المورد</p></div>`;
  } else {
    listBox.innerHTML = rec.returns.map(r => {
      const d = new Date(r.createdAt || Date.now());
      const dateStr = d.toLocaleDateString('ar-EG-u-nu-latn');
      const timeStr = d.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
      return `<div class="rec-row">
        <div class="rec-row-main">
          <div class="rec-row-name">${escHtml(r.productName || 'منتج')}</div>
          <div class="rec-row-meta">
            <span><strong>${Unit.qtyUnit(r.qty ?? 0, r)}</strong></span>
            <span class="rec-date"><i class="far fa-calendar-alt"></i> ${dateStr} ${timeStr}</span>
            <span class="rec-id"><i class="fas fa-file-invoice"></i> ${escHtml(r.invoiceNumber || r.invoiceId || '—')}</span>
            ${r.note ? `<span class="rec-note"><i class="fas fa-sticky-note"></i> ${escHtml(r.note)}</span>` : ''}
          </div>
        </div>
        <div class="rec-row-side">
          <span class="rec-value">DA${fmtMoney((r.amount || 0))}</span>
          ${_supRecStatusBadge(r.status)}
        </div>
      </div>`;
    }).join('');
  }

  document.getElementById('supRecordsModal').style.display = 'flex';
}

function closeSupRecords() {
  document.getElementById('supRecordsModal').style.display = 'none';
}

function _supModalHandler(e) {
  ['addSupplierModal', 'editSupplierModal', 'supRecordsModal'].forEach(id => {
    const el = document.getElementById(id);
    if (e.target === el) el.style.display = 'none';
  });
}
document.removeEventListener('click', _supModalHandler);
document.addEventListener('click', _supModalHandler);
if (window._pageListeners) window._pageListeners.push({ type: 'click', fn: _supModalHandler });

// ===== LAN SYNC HANDLER =====
window._pageSyncHandlers = window._pageSyncHandlers || {};
window._pageSyncHandlers['suppliers'] = function suppliersSyncData() {
  window.syncPreserveRefresh({
    search: ['supSearch'],
    render: () => {
      _supAll = DB.getSuppliers();
      const q = normSearch(document.getElementById('supSearch')?.value || '').toLowerCase();
      _supFiltered = q
        ? _supAll.filter(s => s.name.toLowerCase().includes(q) || (s.phone && s.phone.includes(q)))
        : [..._supAll];
      _supPager.updateDataKeepPage(_supFiltered);
    },
  });
};
