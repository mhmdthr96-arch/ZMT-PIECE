function init_discounts() {
  setupDiscSearch();
  renderDiscounts();
}

function setupDiscSearch() {
  const input = document.getElementById('discSearch');
  if (!input) return;
  const clone = input.cloneNode(true);
  input.parentNode.replaceChild(clone, input);
  clone.addEventListener('input', debounce(renderDiscounts, 300));
}

function resetDiscFilters() {
  const s = document.getElementById('discSearch');
  if (s) s.value = '';
  const f = document.getElementById('discDateFrom');
  if (f) f.value = '';
  const t = document.getElementById('discDateTo');
  if (t) t.value = '';
  const tf = document.getElementById('discTypeFilter');
  if (tf) tf.value = 'all';
  renderDiscounts();
}

// Opens the invoice detail (read-only) for a discount's invoice. The invoices
// page script may not be loaded on the discounts page, so load it on demand.
function viewInvoiceDiscountSafe(id) {
  if (typeof window.viewInvoiceReadOnly === 'function') {
    viewInvoiceReadOnly(id);
    return;
  }
  const s = document.createElement('script');
  s.src = 'js/pages/invoices.js';
  s.onload = function () {
    if (typeof window.viewInvoiceReadOnly === 'function') viewInvoiceReadOnly(id);
    else alert(t('invoices.notFound') || 'تعذر تحميل عارض الفاتورة');
  };
  s.onerror = function () { alert(t('invoices.notFound') || 'تعذر تحميل عارض الفاتورة'); };
  document.body.appendChild(s);
}

function renderDiscounts() {
  const list = document.getElementById('discList');
  if (!list) return;

  const rawQ = (document.getElementById('discSearch')?.value || '').trim();
  const q = normSearch(rawQ);
  const ql = rawQ.toLowerCase();

  const fromVal = document.getElementById('discDateFrom')?.value;
  const toVal = document.getElementById('discDateTo')?.value;
  const fromTs = fromVal ? new Date(fromVal).setHours(0, 0, 0, 0) : 0;
  const toTs = toVal ? new Date(toVal).setHours(23, 59, 59, 999) : Infinity;

  const typeFilter = document.getElementById('discTypeFilter')?.value || 'all';
  const saleLabel = t('sales.discountType');
  const manualLabel = t('sales.discountManual');
  const lineLabel = t('sales.lineDiscount') || 'Remise';

  const all = DB.getDiscounts();
  const filtered = all.filter(d => {
    if (fromTs && (d.createdAt || 0) < fromTs) return false;
    if (toTs !== Infinity && (d.createdAt || 0) > toTs) return false;

    if (typeFilter !== 'all') {
      let match = false;
      if (typeFilter === 'sale' && d.type === saleLabel) match = true;
      if (typeFilter === 'manual' && d.type === manualLabel) match = true;
      if (typeFilter === 'line' && d.type === lineLabel) match = true;
      if (!match) return false;
    }

    if (!q) return true;
    const inv = d.invoiceId ? DB.getInvoice(d.invoiceId) : null;
    const num = inv && inv.invoiceNumber ? inv.invoiceNumber : (d.invoiceId || '');
    if (num.toLowerCase().includes(ql)) return true;
    if ((d.customerName || '').toLowerCase().includes(ql)) return true;
    if (inv && inv.items && inv.items.length) {
      const hit = inv.items.some(it => productSearchScore(it.name, it.barcode, q, it.mark, it.reference, it.countryOfOrigin) > 0);
      if (hit) return true;
    }
    return false;
  });

  filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  let totalAmount = 0;
  const html = filtered.map((d) => {
    totalAmount += d.amount || 0;
    return _renderDiscCard(d);
  }).join('');

  document.getElementById('discTotalCount').textContent = filtered.length;
  document.getElementById('discTotalAmount').textContent = `DA${fmtMoney(totalAmount)}`;
  const info = document.getElementById('discResultsInfo');
  if (info) info.textContent = filtered.length + ' تخفيض';

  if (filtered.length === 0) {
    list.innerHTML = `<div class="placeholder-box"><i class="fas fa-percent" style="font-size:48px;color:#555"></i><p>${t('discounts.empty')}</p></div>`;
    return;
  }
  list.innerHTML = html;
}

function _renderDiscCard(d) {
  const inv = d.invoiceId ? DB.getInvoice(d.invoiceId) : null;
  const invNum = inv ? (inv.invoiceNumber || d.invoiceId) : '—';
  const date = new Date(d.createdAt).toLocaleDateString('ar-EG-u-nu-latn');
  const time = new Date(d.createdAt).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
  return `<div class="inv-card" style="cursor:default">
    <div class="inv-card-top">
      <div class="inv-card-type">
        <span class="badge badge-warning"><i class="fas fa-percent" style="margin-left:4px"></i>${escHtml(d.type || t('discounts.title'))}</span>
        <strong class="inv-card-num">${escHtml(invNum)}</strong>
      </div>
      <div class="inv-card-date">${date} ${time}</div>
    </div>
    <div class="inv-card-body">
      <div class="inv-card-party"><i class="fas fa-user" style="margin-left:4px;color:var(--silver-500)"></i>${escHtml(d.customerName || t('discounts.unregistered'))}</div>
      <div class="inv-card-items">${d.percentage > 0 ? d.percentage + '%' : 'مبلغ ثابت'}</div>
      <div class="inv-card-total"><strong style="color:#e65100">-DA${fmtMoney((d.amount || 0))}</strong></div>
    </div>
    <div class="inv-card-footer" style="display:flex;gap:8px">
      <button class="btn btn-sm" onclick="viewInvoiceDiscountSafe('${d.invoiceId}')"><i class="fas fa-eye"></i> ${escHtml(t('discounts.viewInvoice') || 'عرض')}</button>
      <button class="btn btn-sm btn-danger" onclick="deleteDiscountItem('${d.id}')"><i class="fas fa-trash"></i></button>
    </div>
  </div>`;
}

function deleteDiscountItem(id) {
  if (!confirm(t('discounts.deleteConfirm'))) return;
  DB.deleteDiscount(id);
  renderDiscounts();
}

// ===== LAN SYNC: live list refresh =====
window._pageSyncHandlers = window._pageSyncHandlers || {};
window._pageSyncHandlers['discounts'] = function discountsSyncData() {
  window.syncPreserveRefresh({
    search: ['discSearch'],
    render: renderDiscounts,
  });
};
