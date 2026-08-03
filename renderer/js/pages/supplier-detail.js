var _sdSupplierId = null;
var _sdInvoices = [];

function escHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function init_supplier_detail() {
  const ctx = window.supCtx;
  if (!ctx || !ctx.supplierId) { navigateTo('suppliers'); return; }
  _sdSupplierId = ctx.supplierId;
  const s = DB.getSuppliers().find(x => x.id === _sdSupplierId);
  if (!s) { navigateTo('suppliers'); return; }

  document.getElementById('sdTitle').textContent = s.name;
  document.getElementById('sdName').textContent = s.name;

  const detailsEl = document.getElementById('sdDetails');
  let html = '';
  if (s.phone) html += `<span><i class="fas fa-phone"></i> ${escHtml(s.phone)}</span>`;
  if (s.address) html += `<span><i class="fas fa-map-marker-alt"></i> ${escHtml(s.address)}</span>`;
  if (!s.phone && !s.address) html += `<span class="text-muted">لا توجد معلومات إضافية</span>`;
  detailsEl.innerHTML = html;

  _sdInvoices = DB.getInvoicesBySupplier(_sdSupplierId);
  renderSdStats();
  renderSdInvoices();
  renderSdPayments();
}

function renderSdStats() {
  const s = DB.getSuppliers().find(x => x.id === _sdSupplierId);
  if (!s) return;

  const totalPurchases = _sdInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
  const payments = DB.getSupplierPayments(_sdSupplierId);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const balance = parseFloat(s.balance) || 0;

  document.getElementById('sdTotalPurchases').textContent = `DA${totalPurchases.toFixed(2)}`;
  document.getElementById('sdTotalPaid').textContent = `DA${totalPaid.toFixed(2)}`;
  document.getElementById('sdBalance').textContent = `DA${balance.toFixed(2)}`;

  document.getElementById('sdInvCount').textContent = _sdInvoices.length;
  document.getElementById('sdPayCount').textContent = payments.length;
}

function renderSdInvoices(filter) {
  const container = document.getElementById('sdInvoicesList');
  let list = _sdInvoices;
  if (filter) {
    const q = filter.toLowerCase();
    list = list.filter(inv => {
      const date = new Date(inv.date || inv.createdAt).toLocaleDateString('ar-EG-u-nu-latn');
      return date.includes(q) || inv.items.some(it => it.name.toLowerCase().includes(q));
    });
  }

  if (list.length === 0) {
    container.innerHTML = `<div class="placeholder-box" style="margin-top:20px">
      <i class="fas fa-file-invoice" style="font-size:40px;color:#555"></i>
      <p>${filter ? 'لا توجد نتائج' : 'لا توجد فواتير لهذا المورد'}</p>
    </div>`;
    return;
  }

  container.innerHTML = list.map((inv, i) => {
    const date = new Date(inv.date || inv.createdAt);
    const dateStr = date.toLocaleDateString('ar-EG-u-nu-latn');
    const timeStr = date.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
    return `<div class="sd-invoice-card" onclick="showSdInvoiceDetail('${inv.id}')">
      <div class="sd-inv-head">
        <span class="sd-inv-num">#${i + 1}</span>
        <span class="sd-inv-date"><i class="far fa-calendar-alt"></i> ${dateStr} ${timeStr}</span>
      </div>
      <div class="sd-inv-body">
        <div class="sd-inv-items">
          ${inv.items.slice(0, 3).map(it =>
            `<span class="sd-inv-item">${escHtml(it.name)} x${it.qty}</span>`
          ).join('')}
          ${inv.items.length > 3 ? `<span class="sd-inv-more">+${inv.items.length - 3}</span>` : ''}
        </div>
        <div class="sd-inv-total">DA${inv.totalAmount.toFixed(2)}</div>
      </div>
    </div>`;
  }).join('');
}

function filterSdInvoices(q) {
  renderSdInvoices(q);
}

var _sdCurrentInvoiceId = null;

function showSdInvoiceDetail(id) {
  _sdCurrentInvoiceId = id;
  const inv = DB.getInvoice(id);
  if (!inv) return;
  const date = new Date(inv.date || inv.createdAt);
  const dateStr = date.toLocaleDateString('ar-EG-u-nu-latn');
  const timeStr = date.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });

  const paidAmount = DB.getInvoicePaidAmount(id);
  const remaining = Math.max(0, (inv.totalAmount || 0) - paidAmount);

  document.getElementById('sdInvoiceBody').innerHTML = `
    <div class="sd-inv-detail-header">
      <span><strong>التاريخ:</strong> ${dateStr} ${timeStr}</span>
      <span><strong>الإجمالي:</strong> <span style="color:#0066B1">DA${(inv.totalAmount || 0).toFixed(2)}</span></span>
    </div>
    <div style="display:flex;gap:20px;margin:12px 0;padding:12px 16px;background:var(--silver-50);border-radius:var(--radius-sm)">
      <div>
        <span style="font-size:11px;color:var(--silver-500)">المدفوع</span>
        <div style="font-size:16px;font-weight:700;color:#28a745;margin-top:2px">DA${paidAmount.toFixed(2)}</div>
      </div>
      <div>
        <span style="font-size:11px;color:var(--silver-500)">المتبقي</span>
        <div style="font-size:16px;font-weight:700;color:${remaining > 0 ? '#e65100' : '#28a745'};margin-top:2px">DA${remaining.toFixed(2)}</div>
      </div>
    </div>
    <div class="table-container">
      <table class="data-table">
        <thead><tr>
          <th>#</th><th>المنتج</th><th>الباركود</th><th>الكمية</th><th>السعر</th><th>المجموع</th>
        </tr></thead>
        <tbody>
          ${inv.items.map((item, i) => `<tr>
            <td>${i + 1}</td>
            <td>${escHtml(item.name)}</td>
            <td dir="ltr">${item.barcode}</td>
            <td>${item.qty}</td>
            <td>DA${item.price.toFixed(2)}</td>
            <td>DA${item.total.toFixed(2)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  // Payment section
  const paySection = document.getElementById('sdPayInvoiceSection');
  const payInput = document.getElementById('sdPayInvoiceAmount');
  if (remaining > 0) {
    paySection.style.display = 'flex';
    payInput.value = remaining.toFixed(2);
    payInput.max = remaining;
  } else {
    paySection.style.display = 'none';
  }

  // Delete button
  document.getElementById('sdDeleteInvoiceBtn').style.display = 'inline-flex';

  document.getElementById('sdInvoiceModal').style.display = 'flex';
}

function payInvoiceFromDetail() {
  const inv = DB.getInvoice(_sdCurrentInvoiceId);
  if (!inv) return;

  const paidAmount = DB.getInvoicePaidAmount(_sdCurrentInvoiceId);
  const remaining = Math.max(0, (inv.totalAmount || 0) - paidAmount);
  if (remaining <= 0) { alert('هذه الفاتورة مدفوعة بالكامل'); return; }

  const amount = parseFloat(document.getElementById('sdPayInvoiceAmount').value);
  if (!amount || amount <= 0) { alert('الرجاء إدخال مبلغ صحيح'); return; }
  if (amount > remaining) { alert(`لا يمكن تجاوز المبلغ المتبقي (DA${remaining.toFixed(2)})`); return; }

  const invNum = _sdInvoices.findIndex(inv => inv.id === _sdCurrentInvoiceId) + 1;

  DB.addPayment({
    supplierId: _sdSupplierId,
    invoiceId: _sdCurrentInvoiceId,
    amount,
    note: `دفع فاتورة #${invNum}`,
  });

  // Update supplier balance
  const suppliers = DB.getSuppliers();
  const supIdx = suppliers.findIndex(s => s.id === _sdSupplierId);
  if (supIdx !== -1) {
    suppliers[supIdx].balance = (parseFloat(suppliers[supIdx].balance) || 0) - amount;
    DB.saveSuppliers(suppliers);
  }

  document.getElementById('sdInvoiceModal').style.display = 'none';
  renderSdStats();
  renderSdPayments();
  renderSdInvoices();
}

function deleteInvoiceFromDetail() {
  if (!confirm('هل أنت متأكد من حذف هذه الفاتورة بالكامل؟\nسيتم حذف المنتجات والكميات والدفعات المرتبطة.')) return;

  const inv = DB.getInvoice(_sdCurrentInvoiceId);
  if (!inv) return;

  // Prevent deleting supplier invoices if any product has been sold
  if (inv.type === 'supplier' || inv.type === 'purchase') {
    const allInvoices = DB.getInvoices();
    for (const item of (inv.items || [])) {
      const sold = allInvoices.some(other =>
        other.id !== _sdCurrentInvoiceId &&
        (other.type === 'customer' || other.type === 'waybill' || other.type === 'dispatch') &&
        other.items &&
        other.items.some(oi => oi.productId === item.productId)
      );
      if (sold) {
        alert(`لا يمكن حذف فاتورة المورد لأن المنتج "${item.name}" تم بيعه بالفعل`);
        return;
      }
    }
  }

  // 1. Subtract product quantities from inventory (skip for provisional & dispatch)
  if (!inv.isProvisional && inv.type !== 'dispatch') {
    inv.items.forEach(item => {
      const prod = DB.getProduct(item.productId);
      if (prod) {
        const newQty = prod.quantity - item.qty;
        if (newQty <= 0) {
          DB.deleteProduct(item.productId);
        } else {
          DB.updateProduct(item.productId, { quantity: newQty });
        }
      }
    });
  }

  // 2. Remove all payments for this invoice
  const payments = DB.getInvoicePayments(_sdCurrentInvoiceId);
  const totalInvoicePaid = payments.reduce((sum, p) => sum + p.amount, 0);
  DB.deletePaymentsByInvoice(_sdCurrentInvoiceId);
  DB.deleteReturnsByInvoice(_sdCurrentInvoiceId);
  DB.deleteDiscountsByInvoice(_sdCurrentInvoiceId);

  // 3. Update supplier balance
  if (inv.supplierId) {
    const suppliers = DB.getSuppliers();
    const supIdx = suppliers.findIndex(s => s.id === inv.supplierId);
    if (supIdx !== -1) {
      const currentBalance = parseFloat(suppliers[supIdx].balance) || 0;
      if (inv.type === 'dispatch') {
        // Dispatch: at creation we subtracted totalAmount → add it back
        suppliers[supIdx].balance = currentBalance + (inv.totalAmount || 0);
      } else {
        // Regular invoice: subtract the unpaid portion that was added to balance
        const remaining = (inv.totalAmount || 0) - totalInvoicePaid;
        suppliers[supIdx].balance = currentBalance - remaining;
      }
      DB.saveSuppliers(suppliers);
    }
  }

  // 4. Delete the invoice
  DB.deleteInvoice(_sdCurrentInvoiceId);

  document.getElementById('sdInvoiceModal').style.display = 'none';

  // Refresh
  _sdInvoices = DB.getInvoicesBySupplier(_sdSupplierId);
  renderSdStats();
  renderSdInvoices();
  renderSdPayments();
}

function renderSdPayments() {
  const container = document.getElementById('sdPaymentsList');
  const payments = DB.getSupplierPayments(_sdSupplierId);

  if (payments.length === 0) {
    container.innerHTML = `<div class="placeholder-box" style="margin-top:20px">
      <i class="fas fa-money-bill-wave" style="font-size:40px;color:#555"></i>
      <p>لا توجد دفعات مسجلة</p>
    </div>`;
    return;
  }

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

  container.innerHTML = `
    <div class="sd-pay-header">
      <span>إجمالي الدفعات: <strong style="color:#28a745">DA${totalPaid.toFixed(2)}</strong></span>
    </div>
    <div class="sd-pay-list">
      ${payments.sort((a, b) => b.createdAt - a.createdAt).map(p => {
        const d = new Date(p.createdAt);
        const dateStr = d.toLocaleDateString('ar-EG-u-nu-latn');
        const timeStr = d.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
        return `<div class="sd-pay-row">
          <div class="sd-pay-row-left">
            <div class="sd-pay-amount" style="color:#28a745">-DA${p.amount.toFixed(2)}</div>
            <div class="sd-pay-meta">
              <span class="sd-pay-date"><i class="far fa-calendar-alt"></i> ${dateStr} ${timeStr}</span>
              ${p.note ? `<span class="sd-pay-note"><i class="fas fa-sticky-note"></i> ${escHtml(p.note)}</span>` : ''}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

function switchSdTab(tab) {
  document.querySelectorAll('.sd-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab || (tab === 'invoices' && !b.dataset.tab)));
  const isInvoices = tab === 'invoices';
  document.getElementById('sdTabInvoices').style.display = isInvoices ? '' : 'none';
  document.getElementById('sdTabPayments').style.display = isInvoices ? 'none' : '';
}

function showPayModal() {
  const s = DB.getSuppliers().find(x => x.id === _sdSupplierId);
  if (!s) return;
  const payments = DB.getSupplierPayments(_sdSupplierId);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const balance = parseFloat(s.balance) || 0;
  document.getElementById('sdPayBalance').textContent = `DA${balance.toFixed(2)}`;
  document.getElementById('sdPayAmount').value = '';
  document.getElementById('sdPayNote').value = '';
  document.getElementById('sdPayModal').style.display = 'flex';
  setTimeout(() => document.getElementById('sdPayAmount').focus(), 150);
}

function closePayModal() {
  document.getElementById('sdPayModal').style.display = 'none';
}

function confirmPay() {
  const amount = parseFloat(document.getElementById('sdPayAmount').value);
  if (!amount || amount <= 0) { alert('الرجاء إدخال مبلغ صحيح'); return; }

  const note = document.getElementById('sdPayNote').value.trim();

  // Add payment record
  DB.addPayment({
    supplierId: _sdSupplierId,
    amount,
    note,
  });

  // Update supplier balance
  const suppliers = DB.getSuppliers();
  const idx = suppliers.findIndex(s => s.id === _sdSupplierId);
  if (idx !== -1) {
    suppliers[idx].balance = (parseFloat(suppliers[idx].balance) || 0) - amount;
    DB.saveSuppliers(suppliers);
  }

  closePayModal();
  renderSdStats();
  renderSdPayments();
  renderSdInvoices();
}

function showSdEditForm() {
  const s = DB.getSuppliers().find(x => x.id === _sdSupplierId);
  if (!s) return;
  document.getElementById('editSupId').value = s.id;
  document.getElementById('editSupName').value = s.name;
  document.getElementById('editSupPhone').value = s.phone || '';
  document.getElementById('editSupAddress').value = s.address || '';
  document.getElementById('editSupplierModal').style.display = 'flex';
}

function confirmSdDelete() {
  if (!confirm('هل أنت متأكد من حذف هذا المورد؟')) return;
  const suppliers = DB.getSuppliers();
  const idx = suppliers.findIndex(s => s.id === _sdSupplierId);
  if (idx !== -1) suppliers.splice(idx, 1);
  DB.saveSuppliers(suppliers);
  navigateTo('suppliers');
}

function _sdModalHandler(e) {
  ['sdInvoiceModal', 'sdPayModal'].forEach(id => {
    const el = document.getElementById(id);
    if (e.target === el) el.style.display = 'none';
  });
}
document.removeEventListener('click', _sdModalHandler);
document.addEventListener('click', _sdModalHandler);
if (window._pageListeners) window._pageListeners.push({ type: 'click', fn: _sdModalHandler });
