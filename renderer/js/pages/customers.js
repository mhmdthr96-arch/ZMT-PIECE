var _custAll = [];
var _custFiltered = [];
var _custPager = null;

function init_customers() {
  _custAll = DB.getCustomers();
  _custFiltered = [..._custAll];
  if (_custPager) { _custPager.destroy(); _custPager = null; }
  _custPager = new Pager({
    data: _custFiltered,
    container: document.getElementById('customersList'),
    pageSize: 12,
    render: renderCustPage,
  });
  setupCustSearch();
}

function renderCustomers() {
  _custAll = DB.getCustomers();
  applyCustFilter();
}

function renderCustPage(slice, info) {
  const container = document.getElementById('customersList');

  let totalDebts = 0;
  let totalPaid = 0;

  const html = slice.map(c => {
    const custPayments = DB.getCustomerPayments(c.id);
    const paid = custPayments.reduce((s, p) => s + p.amount, 0);
    const balance = parseFloat(c.balance) || 0;
    totalDebts += balance;
    totalPaid += paid;

    const invoices = DB.getInvoicesByCustomer(c.id);
    const totalPurchases = invoices.reduce((s, inv) => s + (inv.totalAmount || 0), 0);

    return `<div class="supplier-card" onclick="navigateToCustomer('${c.id}')">
      <div class="sup-card-avatar" style="${c.photo ? 'background:none;overflow:hidden' : ''}">
        ${c.photo ? `<img src="${c.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : `<i class="fas fa-user"></i>`}
      </div>
      <div class="sup-card-body">
        <div class="sup-card-name">${escHtml(c.name)}</div>
        <div class="sup-card-meta">
          ${c.phone ? `<span><i class="fas fa-phone"></i> ${escHtml(c.phone)}</span>` : ''}
          ${c.discount > 0 ? `<span><i class="fas fa-percent"></i> خصم ${c.discount}%</span>` : ''}
          <span class="cust-type-chip ${c.type === 'whole' ? 'whole' : 'unit'}">${c.type === 'whole' ? t('customers.typeWhole') : t('customers.typeUnit')}</span>
          <span><i class="fas fa-shopping-cart"></i> ${totalPurchases.toFixed(2)} DA مشتريات</span>
        </div>
      </div>
      <div class="sup-card-stats">
        <div class="sup-stat">
          <span class="sup-stat-label">المديونية</span>
          <span class="sup-stat-value" style="color:#e65100">DA${balance.toFixed(2)}</span>
        </div>
        <div class="sup-stat">
          <span class="sup-stat-label">المدفوع</span>
          <span class="sup-stat-value" style="color:#28a745">DA${paid.toFixed(2)}</span>
        </div>
        <div class="sup-stat">
          <span class="sup-stat-label">الفواتير</span>
          <span class="sup-stat-value">${invoices.length}</span>
        </div>
      </div>
      <div class="sup-card-action"><i class="fas fa-chevron-left"></i></div>
    </div>`;
  }).join('');

  // Update header stats from full dataset
  const allCusts = _custAll;
  const allDebts = allCusts.reduce((s, c) => s + (parseFloat(c.balance) || 0), 0);
  const allPaid = allCusts.reduce((s, c) => {
    return s + DB.getCustomerPayments(c.id).reduce((sp, p) => sp + p.amount, 0);
  }, 0);
  document.getElementById('custTotalCount').textContent = allCusts.length;
  document.getElementById('custTotalDebts').textContent = `DA${allDebts.toFixed(2)}`;
  document.getElementById('custTotalPaid').textContent = `DA${allPaid.toFixed(2)}`;

  if (info.total === 0) {
    container.innerHTML = `<div class="placeholder-box"><i class="fas fa-users" style="font-size:48px;color:#555"></i><p>لا يوجد عملاء</p></div>`;
    return;
  }
  container.innerHTML = `<div class="supplier-grid">${html}</div>`;
}

function applyCustFilter() {
  const q = document.getElementById('custSearch')?.value?.toLowerCase() || '';
  _custFiltered = q
    ? _custAll.filter(c => c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q)))
    : [..._custAll];
  if (_custPager) _custPager.updateData(_custFiltered);
}

function setupCustSearch() {
  const input = document.getElementById('custSearch');
  if (!input) return;
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  newInput.addEventListener('input', applyCustFilter);
}

function navigateToCustomer(id) {
  window.custCtx = { customerId: id };
  navigateTo('customer-detail');
}

// ===== ADD CUSTOMER MODAL =====

let _custPhotoData = '';

function openAddCustomerModal() {
  _custPhotoData = '';
  document.getElementById('custName').value = '';
  document.getElementById('custPhone').value = '';
  document.getElementById('custAddress').value = '';
  document.getElementById('custType').value = 'unit';
  document.getElementById('custDiscount').value = '0';
  document.getElementById('custPhotoPreview').innerHTML = '<i class="fas fa-user" style="font-size:24px;color:var(--silver-400)"></i>';
  document.getElementById('custPhotoInput').value = '';
  document.getElementById('addCustomerModal').style.display = 'flex';
  setTimeout(() => document.getElementById('custName').focus(), 150);
}

function closeAddCustomerModal() {
  document.getElementById('addCustomerModal').style.display = 'none';
}

function confirmAddCustomer() {
  const name = document.getElementById('custName').value.trim();
  if (!name) { alert('الرجاء إدخال اسم العميل'); return; }

  const discount = parseFloat(document.getElementById('custDiscount').value) || 0;
  if (discount < 0 || discount > 100) { alert('نسبة الخصم يجب أن تكون بين 0 و 100'); return; }

  DB.addCustomer({
    name,
    phone: document.getElementById('custPhone').value.trim(),
    address: document.getElementById('custAddress').value.trim(),
    type: document.getElementById('custType').value === 'whole' ? 'whole' : 'unit',
    discount,
    photo: _custPhotoData || '',
  });

  closeAddCustomerModal();
  renderCustomers();
}

// Photo upload handling
function _custPhotoHandler(e) {
  if (e.target.id === 'custPhotoInput') {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
      _custPhotoData = ev.target.result;
      document.getElementById('custPhotoPreview').innerHTML = `<img src="${_custPhotoData}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    };
    reader.readAsDataURL(file);
  }
}
document.removeEventListener('change', _custPhotoHandler);
document.addEventListener('change', _custPhotoHandler);
if (window._pageListeners) window._pageListeners.push({ type: 'change', fn: _custPhotoHandler });

function _custModalHandler(e) {
  if (e.target === document.getElementById('addCustomerModal')) closeAddCustomerModal();
}
document.removeEventListener('click', _custModalHandler);
document.addEventListener('click', _custModalHandler);
if (window._pageListeners) window._pageListeners.push({ type: 'click', fn: _custModalHandler });

function escHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}