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
          <span class="sup-stat-value ${balance > 0 ? 'text-danger' : 'text-success'}">DA${balance.toFixed(2)}</span>
        </div>
        <div class="sup-stat">
          <span class="sup-stat-label">المدفوع</span>
          <span class="sup-stat-value" style="color:#28a745">DA${paid.toFixed(2)}</span>
        </div>
      </div>
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
  const q = document.getElementById('supSearch')?.value?.toLowerCase() || '';
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
  newInput.addEventListener('input', applySupFilter);
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
    balance: 0,
  });
  DB.saveSuppliers(suppliers);
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
  DB.saveSuppliers(suppliers);
  closeEditSupplier();
  renderSuppliers();
  openSupplierDetail(id);
}

function deleteSupplier2(id) {
  if (!confirm('هل أنت متأكد من حذف هذا المورد؟')) return;
  const suppliers = DB.getSuppliers();
  const idx = suppliers.findIndex(s => s.id === id);
  if (idx !== -1) suppliers.splice(idx, 1);
  DB.saveSuppliers(suppliers);
  navigateTo('suppliers');
}

function _supModalHandler(e) {
  ['addSupplierModal', 'editSupplierModal'].forEach(id => {
    const el = document.getElementById(id);
    if (e.target === el) el.style.display = 'none';
  });
}
document.removeEventListener('click', _supModalHandler);
document.addEventListener('click', _supModalHandler);
if (window._pageListeners) window._pageListeners.push({ type: 'click', fn: _supModalHandler });
