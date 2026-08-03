// ============================================================
// ZMT Store Debts - ديون المحلات
// ============================================================

let _sdAllInvoices = [];
let _sdStores = {};
let _sdCurrentStore = null;

function init_store_debts() {
  if (typeof showInvDetail !== 'function') {
    const s = document.createElement('script');
    s.src = 'js/pages/invoices.js';
    s.onload = () => sdLoadData();
    document.body.appendChild(s);
  } else {
    sdLoadData();
  }
}

function sdLoadData() {
  const allInvoices = DB.getInvoices();
  _sdAllInvoices = allInvoices.filter(inv => inv.type === 'transfer' || inv.type === 'transfer_receive');
  _sdStores = {};

  const myCode = Auth.getUserCode();
  const storeNames = {};
  try { storeNames[myCode] = localStorage.getItem('zmt_store_name') || myCode; } catch(e) {}

  _sdAllInvoices.forEach(inv => {
    let otherCode, otherName;
    if (inv.type === 'transfer') {
      otherCode = inv.toCode;
      otherName = inv.toName || otherCode;
    } else {
      otherCode = inv.fromCode;
      otherName = inv.fromName || otherCode;
    }
    if (!otherCode) return;
    if (!storeNames[otherCode]) storeNames[otherCode] = otherName;

    if (!_sdStores[otherCode]) {
      _sdStores[otherCode] = { code: otherCode, name: otherName, invoices: [], totalAmount: 0, paidAmount: 0 };
    }
    const paid = DB.getInvoicePaidAmount(inv.id);
    _sdStores[otherCode].invoices.push(inv);
    _sdStores[otherCode].totalAmount += (inv.totalAmount || 0);
    _sdStores[otherCode].paidAmount += paid;
  });

  sdRenderList();
}

function sdRenderList() {
  const container = document.getElementById('sdStoresList');
  const entries = Object.values(_sdStores);
  const totalStores = entries.length;

  let totalOwed = 0;
  let totalOwe = 0;
  entries.forEach(s => {
    const debt = s.totalAmount - s.paidAmount;
    const unpaidTransfers = s.invoices.filter(i => i.type === 'transfer').reduce((sum, i) => {
      const p = DB.getInvoicePaidAmount(i.id);
      return sum + Math.max(0, (i.totalAmount || 0) - p);
    }, 0);
    const unpaidReceives = s.invoices.filter(i => i.type === 'transfer_receive').reduce((sum, i) => {
      const p = DB.getInvoicePaidAmount(i.id);
      return sum + Math.max(0, (i.totalAmount || 0) - p);
    }, 0);
    totalOwed += unpaidTransfers;
    totalOwe += unpaidReceives;
  });
  const netDebt = totalOwed - totalOwe;

  document.getElementById('sdTotalStores').textContent = totalStores;
  document.getElementById('sdTotalOwed').textContent = _sdFormatNum(totalOwed) + ' DA';
  document.getElementById('sdTotalOwe').textContent = _sdFormatNum(totalOwe) + ' DA';
  document.getElementById('sdNetDebt').textContent = (netDebt >= 0 ? '+' : '') + _sdFormatNum(netDebt) + ' DA';
  document.getElementById('sdNetDebt').style.color = netDebt >= 0 ? '#2e7d32' : '#c62828';

  if (entries.length === 0) {
    container.innerHTML = `<div class="placeholder-box"><i class="fas fa-store" style="font-size:48px;color:#555"></i><p>${t('storeDebts.noTransfers')}</p></div>`;
    return;
  }

  container.innerHTML = entries.map(s => {
    const unpaidTransfers = s.invoices.filter(i => i.type === 'transfer').reduce((sum, i) => {
      const p = DB.getInvoicePaidAmount(i.id);
      return sum + Math.max(0, (i.totalAmount || 0) - p);
    }, 0);
    const unpaidReceives = s.invoices.filter(i => i.type === 'transfer_receive').reduce((sum, i) => {
      const p = DB.getInvoicePaidAmount(i.id);
      return sum + Math.max(0, (i.totalAmount || 0) - p);
    }, 0);
    const net = unpaidTransfers - unpaidReceives;
    const invCount = s.invoices.length;

    return `
      <div class="inv-card" onclick="sdShowStoreDetail('${s.code}')" style="cursor:pointer">
        <div class="inv-header">
          <div class="inv-icon" style="background:#1565c0;color:#fff;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center">
            <i class="fas fa-store"></i>
          </div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:14px">${_escHtml(s.name)}</div>
            <div dir="ltr" style="font-size:11px;color:#888">${s.code}</div>
            <div style="font-size:11px;color:#888;margin-top:2px">${invCount} ${t('storeDebts.transferInvoices')}</div>
          </div>
          <div style="text-align:left">
            <div style="font-size:10px;color:#888">${net >= 0 ? t('storeDebts.weOwe') : t('storeDebts.owedToUs')}</div>
            <div style="font-size:18px;font-weight:900;color:${net >= 0 ? '#c62828' : '#2e7d32'}">
              ${net >= 0 ? '-' : '+'}${_sdFormatNum(Math.abs(net))} DA
            </div>
          </div>
        </div>
        <div class="inv-footer" style="display:flex;gap:16px;margin-top:8px;font-size:11px;color:#888">
          <span><i class="fas fa-arrow-up" style="color:#2e7d32"></i> ${t('storeDebts.owedLabel')} ${_sdFormatNum(unpaidTransfers)} DA</span>
          <span><i class="fas fa-arrow-down" style="color:#c62828"></i> ${t('storeDebts.weOweLabel')} ${_sdFormatNum(unpaidReceives)} DA</span>
          <span><i class="fas fa-check-circle" style="color:#888"></i> ${t('storeDebts.paidLabel')} ${_sdFormatNum(s.paidAmount)} DA</span>
        </div>
      </div>`;
  }).join('');
}

function sdShowStoreDetail(storeCode) {
  const s = _sdStores[storeCode];
  if (!s) return;
  _sdCurrentStore = storeCode;

  document.getElementById('sdListView').style.display = 'none';
  document.getElementById('sdDetailView').style.display = '';
  document.getElementById('sdDetailName').textContent = s.name;
  document.getElementById('sdDetailCode').textContent = storeCode;

  const unpaidTransfers = s.invoices.filter(i => i.type === 'transfer').reduce((sum, i) => {
    const p = DB.getInvoicePaidAmount(i.id);
    return sum + Math.max(0, (i.totalAmount || 0) - p);
  }, 0);
  const unpaidReceives = s.invoices.filter(i => i.type === 'transfer_receive').reduce((sum, i) => {
    const p = DB.getInvoicePaidAmount(i.id);
    return sum + Math.max(0, (i.totalAmount || 0) - p);
  }, 0);
  const net = unpaidTransfers - unpaidReceives;
  const totalPaid = s.paidAmount;
  const totalRemaining = s.totalAmount - totalPaid;

  document.getElementById('sdDetailTotal').textContent = (net >= 0 ? '-' : '+') + _sdFormatNum(Math.abs(net)) + ' DA';
  document.getElementById('sdDetailTotal').style.color = net >= 0 ? '#c62828' : '#2e7d32';

  document.getElementById('sdDetTotalInvoices').textContent = s.invoices.length;
  document.getElementById('sdDetPaid').textContent = _sdFormatNum(totalPaid) + ' DA';
  document.getElementById('sdDetRemaining').textContent = _sdFormatNum(totalRemaining) + ' DA';

  sdRenderInvoices(s.invoices);
}

function sdRenderInvoices(invoices) {
  const el = document.getElementById('sdInvoicesContent');
  if (!invoices || invoices.length === 0) {
    el.innerHTML = '<p class="text-muted">لا توجد فواتير</p>';
    return;
  }

  const sorted = [...invoices].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  el.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>#</th>
          <th>رقم الفاتورة</th>
          <th>النوع</th>
          <th>التاريخ</th>
          <th>المنتجات</th>
          <th>المبلغ</th>
          <th>المدفوع</th>
          <th>المتبقي</th>
          <th>الحالة</th>
          <th>إجراءات</th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map((inv, i) => {
          const paid = DB.getInvoicePaidAmount(inv.id);
          const remaining = Math.max(0, (inv.totalAmount || 0) - paid);
          const date = new Date(inv.createdAt).toLocaleDateString('ar-EG-u-nu-latn');
          const isTransfer = inv.type === 'transfer';
          const typeLabel = isTransfer ? t('storeDebts.typeTransfer') : t('storeDebts.typeReception');
          const typeColor = isTransfer ? '#1565c0' : '#e65100';
          const itemCount = (inv.items || []).reduce((s, it) => s + (it.qty || 0), 0);
          const statusHtml = inv.isProvisional
            ? '<span style="color:#f57c00;font-weight:700">معلق</span>'
            : (remaining <= 0
              ? `<span style="color:#2e7d32;font-weight:700">${t('storeDebts.statusPaid')}</span>`
              : `<span style="color:#c62828;font-weight:700">${t('storeDebts.statusRemaining')} ${_sdFormatNum(remaining)} DA</span>`);

          return `<tr>
            <td>${i + 1}</td>
            <td dir="ltr" style="font-weight:600">${inv.invoiceNumber || '—'}</td>
            <td><span style="background:${typeColor};color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">${typeLabel}</span></td>
            <td>${date}</td>
            <td>${itemCount}</td>
            <td><strong>${_sdFormatNum(inv.totalAmount || 0)} DA</strong></td>
            <td style="color:#2e7d32">${_sdFormatNum(paid)} DA</td>
            <td style="color:${remaining > 0 ? '#c62828' : '#333'}">${_sdFormatNum(remaining)} DA</td>
            <td>${statusHtml}</td>
            <td>
              <button class="btn btn-sm" onclick="event.stopPropagation();showInvDetail('${inv.id}')" title="عرض"><i class="fas fa-eye"></i></button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

function sdBackToList() {
  _sdCurrentStore = null;
  document.getElementById('sdListView').style.display = '';
  document.getElementById('sdDetailView').style.display = 'none';
}

function _sdFormatNum(n) {
  return Number(n).toLocaleString('ar-EG-u-nu-latn', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function _escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
