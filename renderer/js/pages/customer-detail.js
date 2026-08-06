var _cdCustomerId = null;
var _cdInvoices = [];
var _cdCurrentInvoiceId = null;

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
  if (!c.phone && !c.address) dhtml += `<span class="text-muted">لا توجد معلومات إضافية</span>`;
  detailsEl.innerHTML = dhtml;

  // Discount
  const discEl = document.getElementById('cdDiscount');
  if (c.discount > 0) {
    discEl.textContent = `خصم ${c.discount}% على جميع المنتجات`;
  } else {
    discEl.textContent = '';
  }

  _cdInvoices = DB.getInvoicesByCustomer(_cdCustomerId);
  renderCdStats();
  renderCdInvoices();
  renderCdHistory();
  renderCdPayments();
}

function renderCdStats() {
  const c = DB.getCustomer(_cdCustomerId);
  if (!c) return;

  const totalPurchases = _cdInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
  const payments = DB.getCustomerPayments(_cdCustomerId);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const balance = parseFloat(c.balance) || 0;

  document.getElementById('cdTotalPurchases').textContent = `DA${totalPurchases.toFixed(2)}`;
  document.getElementById('cdTotalPaid').textContent = `DA${totalPaid.toFixed(2)}`;
  document.getElementById('cdBalance').textContent = `DA${balance.toFixed(2)}`;

  document.getElementById('cdInvCount').textContent = _cdInvoices.length;
  const returns = DB.getReturns().filter(r => r.customerId === _cdCustomerId || r.relatedTo === _cdCustomerId);
  document.getElementById('cdHistCount').textContent = _cdInvoices.length + returns.length;
  document.getElementById('cdPayCount').textContent = payments.length;
}

// ===== INVOICES TAB =====

function renderCdInvoices(filter) {
  const container = document.getElementById('cdInvoicesList');
  let list = _cdInvoices;
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
      <p>${filter ? 'لا توجد نتائج' : 'لا توجد فواتير لهذا العميل'}</p>
    </div>`;
    return;
  }

  container.innerHTML = list.map((inv, i) => {
    const date = new Date(inv.date || inv.createdAt);
    const dateStr = date.toLocaleDateString('ar-EG-u-nu-latn');
    const timeStr = date.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
    const paidAmount = DB.getInvoicePaidAmount(inv.id);
    const remaining = Math.max(0, (inv.totalAmount || 0) - paidAmount);
    const modified = inv.modifiedAt ? '<span class="badge badge-warning" style="font-size:10px;margin-right:6px"><i class="fas fa-pen"></i> معدلة</span>' : '';
    const products = inv.items.map(it => it.name).join(', ').substring(0, 50);

    return `<div class="sd-invoice-card" onclick="showCdInvoiceDetail('${inv.id}')">
      <div class="sd-inv-head">
        <div>
          <span class="sd-inv-num">فاتورة #${i + 1}</span>
          ${modified}
        </div>
        <span class="sd-inv-date"><i class="far fa-calendar-alt"></i> ${dateStr} ${timeStr}</span>
      </div>
      <div class="sd-inv-body">
        <div class="sd-inv-items">
          <span style="font-size:11px;color:var(--silver-600)">${escHtml(products.substring(0, 40))}${products.length > 40 ? '...' : ''}</span>
        </div>
        <div style="text-align:left">
          <div class="sd-inv-total">DA${inv.totalAmount.toFixed(2)}</div>
          <div style="font-size:10px;margin-top:4px">
            <span style="color:#28a745">مدفوع: DA${paidAmount.toFixed(2)}</span>
            ${remaining > 0 ? `<span style="color:#e65100;margin-right:6px">متبقي: DA${remaining.toFixed(2)}</span>` : ''}
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
  const container = document.getElementById('cdHistoryList');

  const entries = [];

  _cdInvoices.forEach((inv, idx) => {
    const date = new Date(inv.date || inv.createdAt);
    entries.push({
      date,
      ts: inv.createdAt,
      type: 'فاتورة',
      desc: `فاتورة #${idx + 1} - ${inv.items.length} منتج`,
      amount: inv.totalAmount,
      badge: 'info',
      invoiceNum: idx + 1,
    });
  });

  const returns = DB.getReturns().filter(r => r.customerId === _cdCustomerId);
  returns.forEach(r => {
    entries.push({
      date: new Date(r.createdAt),
      ts: r.createdAt,
      type: 'مرتجع',
      desc: `مرتجع: ${r.productName} x${r.qty} (${r.reason || 'بدون سبب'})`,
      amount: 0,
      badge: 'warning',
    });
  });

  entries.sort((a, b) => b.ts - a.ts);

  if (entries.length === 0) {
    container.innerHTML = `<div class="placeholder-box"><i class="fas fa-history" style="font-size:40px;color:#555"></i><p>لا يوجد سجل شراء</p></div>`;
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
      <div style="font-weight:700;color:${e.type === 'مرتجع' ? '#e65100' : '#0066B1'}">DA${e.amount.toFixed(2)}</div>
    </div>`;
  }).join('');
}

// ===== PAYMENTS TAB =====

function renderCdPayments() {
  const container = document.getElementById('cdPaymentsList');
  const payments = DB.getCustomerPayments(_cdCustomerId);

  if (payments.length === 0) {
    container.innerHTML = `<div class="placeholder-box"><i class="fas fa-money-bill-wave" style="font-size:40px;color:#555"></i><p>لا توجد دفعات مسجلة</p></div>`;
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
            <div class="sd-pay-amount" style="color:#28a745">DA${p.amount.toFixed(2)}</div>
            <div class="sd-pay-meta">
              <span class="sd-pay-date"><i class="far fa-calendar-alt"></i> ${dateStr} ${timeStr}</span>
              ${p.note ? `<span class="sd-pay-note"><i class="fas fa-sticky-note"></i> ${escHtml(p.note)}</span>` : ''}
              ${p.invoiceId ? `<span class="sd-pay-note"><i class="fas fa-file-invoice"></i> دفعة فاتورة</span>` : ''}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

// ===== TAB SWITCHING =====

function switchCdTab(tab) {
  document.querySelectorAll('.sd-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab || (!b.dataset.tab && tab === 'invoices'));
  });
  document.getElementById('cdTabInvoices').style.display = tab === 'invoices' ? '' : 'none';
  document.getElementById('cdTabHistory').style.display = tab === 'history' ? '' : 'none';
  document.getElementById('cdTabPayments').style.display = tab === 'payments' ? '' : 'none';
}

// ===== INVOICE DETAIL =====

function showCdInvoiceDetail(id) {
  _cdCurrentInvoiceId = id;
  const inv = DB.getInvoice(id);
  if (!inv) return;

  const invIdx = _cdInvoices.findIndex(x => x.id === id);
  const date = new Date(inv.date || inv.createdAt);
  const dateStr = date.toLocaleDateString('ar-EG-u-nu-latn');
  const timeStr = date.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });

  const paidAmount = DB.getInvoicePaidAmount(id);
  const remaining = Math.max(0, (inv.totalAmount || 0) - paidAmount);
  const modified = inv.modifiedAt ? `<span class="badge badge-warning" style="margin-right:8px"><i class="fas fa-pen"></i> معدلة</span>` : '';

  document.getElementById('cdInvModalTitle').textContent = `#${invIdx + 1}`;

  document.getElementById('cdInvoiceBody').innerHTML = `
    <div class="sd-inv-detail-header">
      <span><strong>التاريخ:</strong> ${dateStr} ${timeStr} ${modified}</span>
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

  const paySection = document.getElementById('cdPayInvoiceSection');
  const payInput = document.getElementById('cdPayInvoiceAmount');
  if (remaining > 0) {
    paySection.style.display = 'flex';
    payInput.value = remaining.toFixed(2);
    payInput.max = remaining;
  } else {
    paySection.style.display = 'none';
  }

  document.getElementById('cdDeleteInvoiceBtn').style.display = 'inline-flex';
  document.getElementById('cdInvoiceModal').style.display = 'flex';
}

// ===== PAY FROM INVOICE =====

function payInvoiceFromCd() {
  const inv = DB.getInvoice(_cdCurrentInvoiceId);
  if (!inv) return;

  const paidAmount = DB.getInvoicePaidAmount(_cdCurrentInvoiceId);
  const remaining = Math.max(0, (inv.totalAmount || 0) - paidAmount);
  if (remaining <= 0) { alert('هذه الفاتورة مدفوعة بالكامل'); return; }

  const amount = parseFloat(document.getElementById('cdPayInvoiceAmount').value);
  if (!amount || amount <= 0) { alert('الرجاء إدخال مبلغ صحيح'); return; }
  if (amount > remaining) { alert(`لا يمكن تجاوز المبلغ المتبقي (DA${remaining.toFixed(2)})`); return; }

  const invNum = _cdInvoices.findIndex(inv => inv.id === _cdCurrentInvoiceId) + 1;

  DB.addPayment({
    customerId: _cdCustomerId,
    invoiceId: _cdCurrentInvoiceId,
    amount,
    note: `دفع فاتورة #${invNum}`,
  });

  // Update customer balance
  const customers = DB.getCustomers();
  const cIdx = customers.findIndex(c => c.id === _cdCustomerId);
  if (cIdx !== -1) {
    customers[cIdx].balance = (parseFloat(customers[cIdx].balance) || 0) - amount;
    DB.saveCustomers(customers);
  }

  document.getElementById('cdInvoiceModal').style.display = 'none';
  renderCdStats();
  renderCdPayments();
  renderCdInvoices();
}

// ===== DELETE INVOICE =====

function deleteInvoiceFromCd() {
  if (!confirm('هل أنت متأكد من حذف هذه الفاتورة بالكامل؟\nسيتم إرجاع الكميات للمخزون وحذف الدفعات المرتبطة.')) return;

  const inv = DB.getInvoice(_cdCurrentInvoiceId);
  if (!inv) return;

  const paidAmount = DB.getInvoicePaidAmount(_cdCurrentInvoiceId);
  const remaining = (inv.totalAmount || 0) - paidAmount;

  // 1. Return quantities to inventory (skip for provisional & dispatch)
  if (!inv.isProvisional && inv.type !== 'dispatch') {
    inv.items.forEach(item => {
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
      customers[cIdx].balance = currentBalance - remaining;
      DB.saveCustomers(customers);
    }
  }

  // 5. Delete invoice
  DB.deleteInvoice(_cdCurrentInvoiceId);

  document.getElementById('cdInvoiceModal').style.display = 'none';

  _cdInvoices = DB.getInvoicesByCustomer(_cdCustomerId);
  renderCdStats();
  renderCdInvoices();
  renderCdHistory();
  renderCdPayments();
}

// ===== EDIT INVOICE =====

function editCdInvoice() {
  const inv = DB.getInvoice(_cdCurrentInvoiceId);
  if (!inv) return;

  const invIdx = _cdInvoices.findIndex(x => x.id === _cdCurrentInvoiceId);
  document.getElementById('cdEditInvTitle').textContent = `#${invIdx + 1}`;

  const html = inv.items.map((item, i) => {
    const prod = DB.getProduct(item.productId);
    const currentQty = prod ? prod.quantity : 0;
    const unitPrice = item.price / item.qty;
    return `<div style="background:var(--silver-50);border:1px solid var(--silver-300);border-radius:var(--radius-sm);padding:12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <strong style="font-size:13px">${escHtml(item.name)}</strong>
        <span style="font-size:11px;color:var(--silver-500)" dir="ltr">باركود: ${item.barcode}</span>
      </div>
      <div style="font-size:11px;color:var(--silver-500);margin-bottom:6px">المخزون الحالي: <strong>${currentQty}</strong></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <div>
          <label style="font-size:11px;color:var(--silver-600);display:block;margin-bottom:2px">الكمية</label>
          <input type="number" class="form-input no-spinner" id="cdEditItemQty_${i}" value="${item.qty}" min="0" style="padding:6px 8px;font-size:13px" oninput="recalcCdEditItem(${i})">
        </div>
        <div>
          <label style="font-size:11px;color:var(--silver-600);display:block;margin-bottom:2px">سعر الوحدة (DA)</label>
          <div style="padding:6px 8px;font-size:13px;font-weight:700;color:var(--silver-800);background:var(--silver-100);border-radius:var(--radius-sm)">DA${unitPrice.toFixed(6)}</div>
          <input type="hidden" id="cdEditItemUnitPrice_${i}" value="${unitPrice}">
        </div>
        <div>
          <label style="font-size:11px;color:var(--silver-600);display:block;margin-bottom:2px">المجموع</label>
          <div style="padding:6px 8px;font-size:13px;font-weight:700;color:var(--bmw-blue-1);background:var(--silver-100);border-radius:var(--radius-sm)" id="cdEditItemTotal_${i}">DA${(item.qty * unitPrice).toFixed(2)}</div>
        </div>
      </div>
    </div>`;
  }).join('');

  document.getElementById('cdEditInvoiceBody').innerHTML = html;
  document.getElementById('cdEditInvoiceModal').style.display = 'flex';
}

function recalcCdEditItem(i) {
  const qtyInput = document.getElementById(`cdEditItemQty_${i}`);
  const unitPrice = parseFloat(document.getElementById(`cdEditItemUnitPrice_${i}`).value) || 0;
  const totalDiv = document.getElementById(`cdEditItemTotal_${i}`);
  const q = parseInt(qtyInput.value) || 0;
  totalDiv.textContent = `DA${(q * unitPrice).toFixed(2)}`;
}

function closeCdEditModal() {
  document.getElementById('cdEditInvoiceModal').style.display = 'none';
}

function confirmCdEditInvoice() {
  const inv = DB.getInvoice(_cdCurrentInvoiceId);
  if (!inv) return;

  const oldTotal = inv.totalAmount;
  const changes = [];
  let newTotal = 0;

  inv.items.forEach((item, i) => {
    let newQty = parseInt(document.getElementById(`cdEditItemQty_${i}`).value);
    if (isNaN(newQty) || newQty < 0) newQty = item.qty;
    const unitPrice = parseFloat(document.getElementById(`cdEditItemUnitPrice_${i}`).value) || 0;
    const newItemTotal = newQty * unitPrice;
    newTotal += newItemTotal;

    const diffQty = newQty - item.qty;

    if (diffQty !== 0) {
      changes.push({
        productId: item.productId,
        name: item.name,
        oldQty: item.qty,
        newQty,
        diffQty,
        unitPrice,
        oldItemTotal: item.total,
        newItemTotal,
      });
    }

    item.qty = newQty;
    item.price = unitPrice;
    item.total = newItemTotal;
  });

  if (changes.length === 0) {
    alert('لم تقم بأي تغيير على الكميات');
    return;
  }

  // Validate inventory: check if increased quantities are available
  for (const ch of changes) {
    if (ch.diffQty > 0) {
      const prod = DB.getProduct(ch.productId);
      if (!prod || prod.quantity < ch.diffQty) {
        alert(`الكمية غير متوفرة في المخزون لـ "${ch.name}"\nالمتوفر: ${prod ? prod.quantity : 0}\nالمطلوب: ${ch.diffQty}`);
        return;
      }
    }
  }

  // Apply changes
  for (const ch of changes) {
    if (ch.diffQty > 0) {
      const prod = DB.getProduct(ch.productId);
      if (prod) {
        if (prod.quantity < ch.diffQty) {
          alert(`المخزون غير كافٍ لـ "${ch.name}": المتوفر ${prod.quantity}, المطلوب ${ch.diffQty}`);
          return;
        }
        DB.updateProduct(ch.productId, { quantity: prod.quantity - ch.diffQty });
      }
    } else if (ch.diffQty < 0) {
      const prod = DB.getProduct(ch.productId);
      if (prod) {
        const returnQty = Math.abs(ch.diffQty);
        DB.updateProduct(ch.productId, { quantity: prod.quantity + returnQty });
        DB.addReturn({
          invoiceId: _cdCurrentInvoiceId,
          productId: ch.productId,
          productName: ch.name,
          qty: returnQty,
          reason: 'تعديل فاتورة',
        });
      }
    }
  }

  inv.totalAmount = newTotal;
  inv.modifiedAt = Date.now();

  // Recalculate profit
  const newProfit = inv.items.reduce((s, item) => {
    const prod = DB.getProduct(item.productId);
    const buyPrice = prod ? (prod.buyPrice || 0) : 0;
    return s + ((item.price - buyPrice) * item.qty);
  }, 0);

  const updateData = { items: inv.items, totalAmount: newTotal, modifiedAt: Date.now(), profit: newProfit };
  if (inv.timbreFiscal !== undefined) {
    const tRate = parseFloat(localStorage.getItem('zmt_timbre_rate') || '1');
    let newTimbre = newTotal * (tRate / 100);
    if (newTimbre < 5) newTimbre = 5;
    if (newTimbre > 10000) newTimbre = 10000;
    updateData.timbreFiscal = newTimbre;
  }
  const paidBefore = DB.getInvoicePaidAmount(_cdCurrentInvoiceId);
  DB.reduceInvoicePayments(_cdCurrentInvoiceId, newTotal);
  DB.updateInvoice(_cdCurrentInvoiceId, updateData);

  const diffTotal = newTotal - oldTotal;
  const balanceChange = newTotal < paidBefore ? (paidBefore - oldTotal) : diffTotal;
  const customers = DB.getCustomers();
  const cIdx = customers.findIndex(c => c.id === _cdCustomerId);
  if (cIdx !== -1) {
    customers[cIdx].balance = (parseFloat(customers[cIdx].balance) || 0) + balanceChange;
    DB.saveCustomers(customers);
  }

  closeCdEditModal();
  document.getElementById('cdInvoiceModal').style.display = 'none';

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
  document.getElementById('cdEditDiscount').value = c.discount || 0;
  document.getElementById('cdEditModal').style.display = 'flex';
}

function confirmCdEdit() {
  const name = document.getElementById('cdEditName').value.trim();
  if (!name) { alert('الاسم مطلوب'); return; }
  const discount = parseFloat(document.getElementById('cdEditDiscount').value) || 0;
  if (discount < 0 || discount > 100) { alert('نسبة الخصم يجب أن تكون بين 0 و 100'); return; }

  DB.updateCustomer(_cdCustomerId, {
    name,
    phone: document.getElementById('cdEditPhone').value.trim(),
    address: document.getElementById('cdEditAddress').value.trim(),
    discount,
  });

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
  if (!confirm('هل أنت متأكد من حذف هذا العميل؟')) return;
  DB.deleteCustomer(_cdCustomerId);
  navigateTo('customers');
}

// ===== MODAL CLOSE HANDLERS =====

function _cdModalHandler(e) {
  ['cdInvoiceModal', 'cdEditInvoiceModal', 'cdEditModal'].forEach(id => {
    const el = document.getElementById(id);
    if (e.target === el) el.style.display = 'none';
  });
}
document.removeEventListener('click', _cdModalHandler);
document.addEventListener('click', _cdModalHandler);
if (window._pageListeners) window._pageListeners.push({ type: 'click', fn: _cdModalHandler });