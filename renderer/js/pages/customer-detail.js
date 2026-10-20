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
  cdUpdateMergeBtn();
}

function renderCdStats() {
  const c = DB.getCustomer(_cdCustomerId);
  if (!c) return;

  const statInvoices = _cdInvoices.filter(inv => inv.type !== 'payment');
  const statPayments = DB.getCustomerPayments(_cdCustomerId).filter(p => {
    const r = p.invoiceId ? DB.getInvoice(p.invoiceId) : null;
    return !(r && r.type === 'payment');
  });
  const totalPurchases = statInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
  const totalPaid = statPayments.reduce((sum, p) => sum + p.amount, 0);
  const balance = parseFloat(c.balance) || 0;

  document.getElementById('cdTotalPurchases').textContent = `DA${fmtMoney(totalPurchases)}`;
  document.getElementById('cdTotalPaid').textContent = `DA${fmtMoney(totalPaid)}`;
  document.getElementById('cdBalance').textContent = (balance < 0 ? '-' : '') + `DA${fmtMoney(Math.abs(balance))}`;

  document.getElementById('cdInvCount').textContent = _cdInvoices.length;
  const returns = DB.getReturns().filter(r => r.customerId === _cdCustomerId || r.relatedTo === _cdCustomerId);
  document.getElementById('cdHistCount').textContent = _cdInvoices.length + returns.length;
  document.getElementById('cdPayCount').textContent = statPayments.length;
}

// ===== INVOICES TAB =====

function renderCdInvoices(filter) {
  const container = document.getElementById('cdInvoicesList');
  let list = _cdInvoices;
  const q = normSearch(filter || '').toLowerCase();
  if (q) {
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
    const paidAmount = inv.type === 'payment' ? (inv.totalAmount || 0) : DB.getInvoiceEffectivePaid(inv);
    const remaining = Math.max(0, (inv.totalAmount || 0) - paidAmount);
    const modified = inv.modifiedAt ? '<span class="badge badge-warning" style="font-size:10px;margin-right:6px"><i class="fas fa-pen"></i> معدلة</span>' : '';
    const products = inv.type === 'payment'
      ? (inv.direction === 'out' ? 'دفع لمورد' : 'سند قبض / تسوية')
      : inv.items.map(it => it.name).join(', ').substring(0, 50);

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
          <div class="sd-inv-total">DA${fmtMoney(inv.totalAmount)}</div>
          <div style="font-size:10px;margin-top:4px">
            <span style="color:#28a745">مدفوع: DA${fmtMoney(paidAmount)}</span>
            ${remaining > 0 ? `<span style="color:#e65100;margin-right:6px">متبقي: DA${fmtMoney(remaining)}</span>` : ''}
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
  _cdRenderHistoryStats();
  const container = document.getElementById('cdHistoryList');

  const entries = [];

  _cdInvoices.forEach((inv, idx) => {
    const date = new Date(inv.date || inv.createdAt);
    entries.push({
      date,
      ts: inv.createdAt,
      type: 'فاتورة',
      desc: inv.type === 'payment'
        ? `سند قبض ${inv.invoiceNumber || ''} — ${(inv.direction === 'out' ? 'دفع لمورد' : 'قبض من عميل')}`
        : `فاتورة #${idx + 1} - ${inv.items.length} منتج`,
      amount: inv.totalAmount,
      badge: 'info',
      invoiceNum: idx + 1,
    });
  });

  const returns = DB.getReturns().filter(r => r.customerId === _cdCustomerId || r.relatedTo === _cdCustomerId);
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
      <div style="font-weight:700;color:${e.type === 'مرتجع' ? '#e65100' : '#0066B1'}">DA${fmtMoney(e.amount)}</div>
    </div>`;
  }).join('');
}

function _cdRenderHistoryStats() {
  const statEl = document.getElementById('cdHistoryStats');
  if (!statEl) return;
  const sales = _cdInvoices.filter(inv => inv.type !== 'payment');
  const returns = DB.getReturns().filter(r => r.customerId === _cdCustomerId || r.relatedTo === _cdCustomerId);
  const saleAmount = sales.reduce((s, inv) => s + (inv.totalAmount || 0), 0);
  statEl.innerHTML = `
    <div class="rec-chip">
      <span class="rec-chip-icon" style="background:#e3f2fd;color:#1565c0"><i class="fas fa-shopping-cart"></i></span>
      <div>
        <div class="rec-chip-label">عدد عمليات البيع معه</div>
        <div class="rec-chip-val">${sales.length} <small>فاتورة</small> · DA${fmtMoney(saleAmount)}</div>
      </div>
    </div>
    <div class="rec-chip">
      <span class="rec-chip-icon" style="background:#fff3e0;color:#e65100"><i class="fas fa-undo-alt"></i></span>
      <div>
        <div class="rec-chip-label">عدد المرتجعات</div>
        <div class="rec-chip-val">${returns.length} <small>مرتجع</small></div>
      </div>
    </div>`;
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
      <span>إجمالي الدفعات: <strong style="color:#28a745">DA${fmtMoney(totalPaid)}</strong></span>
    </div>
    <div class="sd-pay-list">
      ${payments.sort((a, b) => b.createdAt - a.createdAt).map(p => {
        const d = new Date(p.createdAt);
        const dateStr = d.toLocaleDateString('ar-EG-u-nu-latn');
        const timeStr = d.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
        return `<div class="sd-pay-row">
          <div class="sd-pay-row-left">
            <div class="sd-pay-amount" style="color:#28a745">DA${fmtMoney(p.amount)}</div>
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
  document.querySelectorAll('#page-customer-detail .sd-tab').forEach(b => {
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

  const paidAmount = inv.type === 'payment' ? (inv.totalAmount || 0) : DB.getInvoiceEffectivePaid(id);
  const remaining = Math.max(0, (inv.totalAmount || 0) - paidAmount);
  const modified = inv.modifiedAt ? `<span class="badge badge-warning" style="margin-right:8px"><i class="fas fa-pen"></i> معدلة</span>` : '';

  document.getElementById('cdInvModalTitle').textContent = `#${invIdx + 1}`;

  document.getElementById('cdInvoiceBody').innerHTML = `
    <div class="sd-inv-detail-header">
      <span><strong>التاريخ:</strong> ${dateStr} ${timeStr} ${modified}</span>
      <span><strong>الإجمالي:</strong> <span style="color:#0066B1">DA${fmtMoney((inv.totalAmount || 0))}</span></span>
    </div>
    <div style="display:flex;gap:20px;margin:12px 0;padding:12px 16px;background:var(--silver-50);border-radius:var(--radius-sm)">
      <div>
        <span style="font-size:11px;color:var(--silver-500)">المدفوع</span>
        <div style="font-size:16px;font-weight:700;color:#28a745;margin-top:2px">DA${fmtMoney(paidAmount)}</div>
      </div>
      <div>
        <span style="font-size:11px;color:var(--silver-500)">المتبقي</span>
        <div style="font-size:16px;font-weight:700;color:${remaining > 0 ? '#e65100' : '#28a745'};margin-top:2px">DA${fmtMoney(remaining)}</div>
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
            <td>DA${fmtMoney(item.price)}</td>
            <td>DA${fmtMoney(item.total)}</td>
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

  const paidAmount = DB.getInvoiceEffectivePaid(_cdCurrentInvoiceId);
  const remaining = DB.getInvoiceRemaining(inv);
  if (remaining <= 0) { alert('هذه الفاتورة مدفوعة بالكامل'); return; }

  const amount = parseFloat(document.getElementById('cdPayInvoiceAmount').value);
  if (!amount || amount <= 0) { alert('الرجاء إدخال مبلغ صحيح'); return; }
  if (amount > remaining) { alert(`لا يمكن تجاوز المبلغ المتبقي (DA${fmtMoney(remaining)})`); return; }

  const invNum = _cdInvoices.findIndex(inv => inv.id === _cdCurrentInvoiceId) + 1;

  DB.addPayment({
    customerId: _cdCustomerId,
    invoiceId: _cdCurrentInvoiceId,
    amount,
    method: (document.getElementById('cdPayMethod')?.value) || 'cash',
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
      // A payment voucher reduced the balance when created — deleting it
      // restores its amount (unlike a credit invoice which is reversed).
      customers[cIdx].balance = inv.type === 'payment'
        ? currentBalance + (inv.totalAmount || 0)
        : currentBalance - remaining;
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
  if (inv.type === 'payment') { alert('سند القبض قابل للعرض فقط — لا يمكن تعديله'); return; }

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
          <input type="text" class="form-input no-spinner num-input" inputmode="numeric" id="cdEditItemQty_${i}" value="${item.qty}" min="0" style="padding:6px 8px;font-size:13px" oninput="recalcCdEditItem(${i})">
        </div>
        <div>
          <label style="font-size:11px;color:var(--silver-600);display:block;margin-bottom:2px">سعر الوحدة (DA)</label>
          <div style="padding:6px 8px;font-size:13px;font-weight:700;color:var(--silver-800);background:var(--silver-100);border-radius:var(--radius-sm)">DA${unitPrice.toFixed(6)}</div>
          <input type="hidden" id="cdEditItemUnitPrice_${i}" value="${unitPrice}">
        </div>
        <div>
          <label style="font-size:11px;color:var(--silver-600);display:block;margin-bottom:2px">المجموع</label>
          <div style="padding:6px 8px;font-size:13px;font-weight:700;color:var(--bmw-blue-1);background:var(--silver-100);border-radius:var(--radius-sm)" id="cdEditItemTotal_${i}">DA${fmtMoney((item.qty * unitPrice))}</div>
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
  totalDiv.textContent = `DA${fmtMoney((q * unitPrice))}`;
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
  document.getElementById('cdEditType').value = c.type === 'whole' ? 'whole' : 'unit';
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
    email: document.getElementById('cdEditEmail').value.trim(),
    type: document.getElementById('cdEditType').value === 'whole' ? 'whole' : 'unit',
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

// ===== LAN SYNC HANDLER =====
window._pageSyncHandlers = window._pageSyncHandlers || {};
window._pageSyncHandlers['customer-detail'] = function cdSyncData() {
  if (!_cdCustomerId) return;
  const c = DB.getCustomer(_cdCustomerId);
  if (!c) { navigateTo('customers'); return; }
  // Refresh the header + stats from the latest records, then rebuild every tab
  // in place (each renderer is idempotent and reads fresh DB state).
  document.getElementById('cdTitle').textContent = c.name;
  document.getElementById('cdName').textContent = c.name;
  const avatar = document.getElementById('cdAvatar');
  if (avatar) {
    avatar.style.background = c.photo ? 'none' : '';
    avatar.innerHTML = c.photo
      ? `<img src="${c.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
      : `<i class="fas fa-user"></i>`;
  }
  _cdInvoices = DB.getInvoicesByCustomer(_cdCustomerId);
  renderCdStats();
  renderCdInvoices();
  renderCdHistory();
  renderCdPayments();
  cdUpdateMergeBtn();
};

// ===== MERGE WAYBILLS (وصول التسليم) INTO ONE SALE INVOICE ===================
// A *real* waybill (type 'waybill', !isProvisional) already:
//   - deducted stock when it was created,
//   - recorded any payment made at delivery,
//   - raised the customer balance by its unpaid remainder.
// It is NOT counted as a sale by the dashboard / reports / net-account / zakat
// (they all require type === 'customer') - which is exactly the "confusion" this
// feature removes: N waybills become ONE 'customer' sale invoice.
//
// The merge is therefore a *document consolidation* with hard invariants:
//   - STOCK IS NEVER TOUCHED (not deducted again, not restored);
//   - the balance moves by exactly (new remainder - sum of old remainders), i.e.
//     by (sum of old recorded payments - new payment) - zero by default;
//   - the new totalAmount is the EXACT sum of the waybills' totals;
//   - returns/discounts attached to the waybills are re-pointed, never deleted;
//   - a full snapshot of every merged waybill is stored inside the new invoice.

var _cdMergeSel = {};        // { waybillId: true }
var _cdMergeMethod = 'cash'; // 'cash' | 'ccp' | 'mixed'

function _cdNum(v) { return parseFloat(v) || 0; }
function _cdPad2(n) { return String(n).padStart(2, '0'); }
// 0x01: separator that can never appear inside a product name/barcode.
function _cdSep() { return String.fromCharCode(1); }

// Real (non-provisional) waybills that belong to the current customer.
function cdWaybills() {
  return (_cdInvoices || []).filter(inv =>
    inv && inv.type === 'waybill' && !inv.isProvisional &&
    (!inv.customerId || inv.customerId === _cdCustomerId)
  );
}

function cdMergeSelected() {
  return cdWaybills().filter(w => _cdMergeSel[w.id]);
}

// Toolbar button: visible only when there is something to merge, with live count.
function cdUpdateMergeBtn() {
  const btn = document.getElementById('cdMergeBtn');
  const cnt = document.getElementById('cdMergeCount');
  if (!btn || !cnt) return;
  const n = cdWaybills().length;
  btn.style.display = n > 0 ? '' : 'none';
  cnt.textContent = n;
  cnt.style.display = n > 0 ? '' : 'none';
}

// Local YYYY-MM-DD / HH:MM for the native date and time inputs.
function _cdLocalParts(ts) {
  const d = new Date(ts || Date.now());
  return {
    date: d.getFullYear() + '-' + _cdPad2(d.getMonth() + 1) + '-' + _cdPad2(d.getDate()),
    time: _cdPad2(d.getHours()) + ':' + _cdPad2(d.getMinutes()),
  };
}

// Payments already recorded on the SELECTED waybills, split cash/CCP exactly
// like a sale invoice does (legacy waybill payments carry no `method` -> cash).
function _cdMergeRecorded() {
  let cash = 0, ccp = 0;
  cdMergeSelected().forEach(w => {
    const m = DB.getInvoicePaymentMethods(w.id);
    cash += m.cash || 0;
    ccp += m.ccp || 0;
  });
  return { cash, ccp, total: cash + ccp };
}

// Debt a waybill contributed = max(0, total - effective paid) - the same rule the
// creation and edit flows used, so the balance delta computed from it is exact.
function _cdMergeOldRemaining(sel) {
  return sel.reduce((s, w) =>
    s + Math.max(0, (w.totalAmount || 0) - DB.getInvoiceEffectivePaid(w.id)), 0);
}

// Build the consolidated item list: only truly identical lines (same product /
// barcode + same price + same discount) are merged into one line, so
// sum(qty x price) stays exactly equal to the sum of the waybill item totals and
// the printed invoice shows no rounding drift. Different prices stay separate.
function cdMergeBuildItems(list) {
  const order = [];
  const map = Object.create(null);
  const keyOf = it => [
    it && it.productId != null ? it.productId : '',
    it && it.name != null ? it.name : '',
    it && it.barcode != null ? it.barcode : '',
    _cdNum(it && it.price).toFixed(4),
    _cdNum(it && it.discount).toFixed(4),
  ].join(_cdSep());

  list.forEach(w => (w.items || []).forEach(it => {
    const k = keyOf(it);
    if (!map[k]) {
      map[k] = {
        productId: it.productId,
        barcode: it.barcode,
        name: it.name,
        qty: 0,
        price: _cdNum(it.price),
        total: 0,
        originalPrice: (it.originalPrice != null ? it.originalPrice : it.price),
        discount: _cdNum(it.discount),
      };
      order.push(k);
    }
    const line = map[k];
    line.qty += _cdNum(it.qty);
    line.total += (it.total != null ? _cdNum(it.total) : (_cdNum(it.qty) * _cdNum(it.price)));
  }));

  return order.map(k => {
    const l = map[k];
    l.total = Math.round(l.total * 100) / 100;
    return l;
  });
}

// ---------------- dialog ----------------

function openCdMerge() {
  const list = cdWaybills();
  if (list.length === 0) { alert(t('merge.none')); return; }

  _cdMergeSel = {};
  list.forEach(w => { _cdMergeSel[w.id] = true; });

  // Default date/time = the OLDEST waybill (both fields stay fully editable).
  const oldest = Math.min.apply(null, list.map(w => w.date || w.createdAt || Date.now()));
  const parts = _cdLocalParts(oldest);
  document.getElementById('cdMergeDate').value = parts.date;
  document.getElementById('cdMergeTime').value = parts.time;

  // Default paid amount = what was already recorded, same cash/CCP split.
  const rec = _cdMergeRecorded();
  document.getElementById('cdMergePaid').value = rec.total.toFixed(2);
  document.getElementById('cdMergeCash').value = rec.cash.toFixed(2);
  document.getElementById('cdMergeCcp').value = rec.ccp.toFixed(2);
  cdMergeSetMethod(rec.cash > 0 && rec.ccp > 0 ? 'mixed' : (rec.ccp > 0 ? 'ccp' : 'cash'));

  cdMergeRenderList();
  const box = document.getElementById('cdMergeList');
  if (box) box.scrollTop = 0;
  document.getElementById('cdMergeModal').style.display = 'flex';
}

function closeCdMerge() {
  document.getElementById('cdMergeModal').style.display = 'none';
}

function cdMergeSelectAll() {
  cdWaybills().forEach(w => { _cdMergeSel[w.id] = true; });
  cdMergeRenderList();
}

function cdMergeSelectNone() {
  _cdMergeSel = {};
  cdMergeRenderList();
}

function cdMergeToggle(id) {
  _cdMergeSel[id] = !_cdMergeSel[id];
  cdMergeRenderList();
}

function cdMergePayFull() {
  const total = cdMergeSelected().reduce((s, w) => s + (w.totalAmount || 0), 0);
  document.getElementById('cdMergePaid').value = total.toFixed(2);
  document.getElementById('cdMergeCash').value = total.toFixed(2);
  document.getElementById('cdMergeCcp').value = '0.00';
  cdMergeRefresh();
}

function cdMergeSetMethod(method) {
  _cdMergeMethod = (method === 'ccp' || method === 'mixed') ? method : 'cash';
  document.querySelectorAll('#cdMergeModal .pay-method-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.method === _cdMergeMethod);
  });
  const mixed = _cdMergeMethod === 'mixed';
  document.getElementById('cdMergeSinglePay').style.display = mixed ? 'none' : '';
  document.getElementById('cdMergeMixedPay').style.display = mixed ? '' : 'none';
  cdMergeRefresh();
}

function cdMergeGetPay() {
  if (_cdMergeMethod === 'mixed') {
    const cash = Math.max(0, _cdNum(document.getElementById('cdMergeCash').value));
    const ccp = Math.max(0, _cdNum(document.getElementById('cdMergeCcp').value));
    return { method: 'mixed', cash, ccp, total: cash + ccp };
  }
  const paid = Math.max(0, _cdNum(document.getElementById('cdMergePaid').value));
  return _cdMergeMethod === 'ccp'
    ? { method: 'ccp', cash: 0, ccp: paid, total: paid }
    : { method: 'cash', cash: paid, ccp: 0, total: paid };
}

function cdMergeRenderList() {
  const box = document.getElementById('cdMergeList');
  if (!box) return;
  const list = cdWaybills();
  if (list.length === 0) {
    box.innerHTML = '<div class="cd-merge-empty">' + escHtml(t('merge.none')) + '</div>';
    cdMergeRefresh();
    return;
  }
  box.innerHTML = list.map((w, i) => {
    const d = new Date(w.date || w.createdAt);
    const dateStr = d.toLocaleDateString('ar-EG-u-nu-latn');
    const timeStr = d.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
    const total = w.totalAmount || 0;
    const paid = DB.getInvoiceEffectivePaid(w.id);
    const remaining = Math.max(0, total - paid);
    const on = !!_cdMergeSel[w.id];
    const label = w.invoiceNumber || (t('merge.waybillNo') + ' #' + (i + 1));
    return '<div class="cd-merge-row' + (on ? ' on' : '') + '" onclick="cdMergeToggle(\'' + w.id + '\')">' +
      '<input type="checkbox" tabindex="-1"' + (on ? ' checked' : '') + '>' +
      '<div class="cd-merge-row-main">' +
        '<div class="cd-merge-row-num"><i class="fas fa-truck" style="color:#e65100"></i> ' + escHtml(label) + '</div>' +
        '<div class="cd-merge-row-meta"><i class="far fa-calendar-alt"></i> ' + dateStr + ' ' + timeStr + ' &middot; DA' + fmtMoney(total) + '</div>' +
      '</div>' +
      '<div class="cd-merge-row-amt">' +
        '<div style="color:#28a745">+DA' + fmtMoney(paid) + '</div>' +
        (remaining > 0 ? '<div style="color:#e65100;font-weight:400">-DA' + fmtMoney(remaining) + '</div>' : '') +
      '</div>' +
    '</div>';
  }).join('');
  cdMergeRefresh();
}

function cdMergeRefresh() {
  const sel = cdMergeSelected();
  const n = sel.length;
  const total = sel.reduce((s, w) => s + (w.totalAmount || 0), 0);
  const pay = cdMergeGetPay();
  const remaining = Math.max(0, total - pay.total);
  const rec = _cdMergeRecorded();

  const recEl = document.getElementById('cdMergeRecorded');
  if (recEl) recEl.textContent = t('merge.recorded') + ' DA' + fmtMoney(rec.total);

  const oldRemaining = _cdMergeOldRemaining(sel);
  const delta = remaining - oldRemaining; // === sum(old paid) - new paid
  const deltaCls = delta > 0.004 ? 'up' : (delta < -0.004 ? 'down' : '');
  const deltaTxt = (delta > 0.004 ? '+' : '') + 'DA' + fmtMoney(delta);

  const box = document.getElementById('cdMergeSummary');
  if (box) {
    box.innerHTML =
      '<div class="cd-merge-sum-title"><i class="fas fa-clipboard-list"></i> ' + escHtml(t('merge.summary')) + '</div>' +
      '<div class="cd-merge-sum-line"><span>' + escHtml(t('merge.selCount')) + '</span><strong>' + n + '</strong></div>' +
      '<div class="cd-merge-sum-line"><span>' + escHtml(t('merge.sumTotal')) + '</span><strong>DA' + fmtMoney(total) + '</strong></div>' +
      '<div class="cd-merge-sum-line"><span>' + escHtml(t('merge.sumPaid')) + '</span><strong style="color:#28a745">DA' + fmtMoney(pay.total) + '</strong></div>' +
      '<div class="cd-merge-sum-line cd-merge-sum-total"><span>' + escHtml(t('merge.sumRemaining')) + '</span><strong style="color:' + (remaining > 0 ? '#e65100' : '#28a745') + '">DA' + fmtMoney(remaining) + '</strong></div>' +
      '<div class="cd-merge-sum-line"><span>' + escHtml(t('merge.debtDelta')) + '</span><strong class="cd-merge-sum-delta ' + deltaCls + '">' + deltaTxt + '</strong></div>';
  }

  const btn = document.getElementById('cdMergeConfirmBtn');
  if (btn) btn.disabled = n === 0;
}

function cdMergeConfirm() {
  const sel = cdMergeSelected();
  if (sel.length === 0) { alert(t('merge.selectAtLeast')); return; }

  // ---- chosen date + time (back-dating is honoured by the period reports) ----
  const dv = (document.getElementById('cdMergeDate').value || '').trim();
  let tv = (document.getElementById('cdMergeTime').value || '').trim();
  if (!dv) { alert(t('merge.needDate')); return; }
  if (tv.split(':').length !== 2) tv = '00:00';
  const chosen = new Date(dv + 'T' + tv + ':00');
  if (isNaN(chosen.getTime())) { alert(t('merge.needDate')); return; }
  const chosenTs = chosen.getTime();

  // ---- exact aggregate of the selected waybills ------------------------------
  const totalAmount = sel.reduce((s, w) => s + (w.totalAmount || 0), 0);
  const extraDiscount = sel.reduce((s, w) => s + (w.extraDiscount || 0), 0);
  const timbreFiscal = sel.reduce((s, w) => s + (w.timbreFiscal || 0), 0);
  const profit = sel.reduce((s, w) => s + (w.profit || 0), 0);

  const pay = cdMergeGetPay();
  if (pay.total > totalAmount + 0.005) { alert(t('merge.paidExceeds')); return; }

  const remaining = Math.max(0, totalAmount - pay.total);
  const balanceDelta = remaining - _cdMergeOldRemaining(sel); // 0 when unchanged

  // Irreversible -> explicit confirmation carrying the exact numbers.
  const msg = t('merge.confirmMsg')
    .replace('{n}', String(sel.length))
    .replace('{total}', fmtMoney(totalAmount))
    .replace('{paid}', fmtMoney(pay.total))
    .replace('{remaining}', fmtMoney(remaining));
  if (!confirm(t('merge.confirmTitle') + String.fromCharCode(10, 10) + msg)) return;

  // ---- full snapshot: lets a future build restore the waybills if needed -----
  const snapshot = sel.map(w => ({
    id: w.id,
    invoiceNumber: w.invoiceNumber || '',
    date: w.date || w.createdAt || null,
    createdAt: w.createdAt || null,
    totalAmount: w.totalAmount || 0,
    extraDiscount: w.extraDiscount || 0,
    timbreFiscal: w.timbreFiscal || 0,
    profit: w.profit || 0,
    note: w.note || '',
    items: (w.items || []).map(it => Object.assign({}, it)),
    payments: DB.getInvoicePayments(w.id).map(p => ({
      amount: p.amount || 0,
      method: p.method || null,
      cashAmount: p.cashAmount,
      ccpAmount: p.ccpAmount,
      note: p.note || '',
      createdAt: p.createdAt || null,
    })),
    returns: DB.getReturns().filter(r => r.invoiceId === w.id).map(r => Object.assign({}, r)),
    discounts: DB.getDiscounts().filter(d => d.invoiceId === w.id).map(d => Object.assign({}, d)),
  }));

  const mergedFrom = sel.map(w => ({
    id: w.id,
    invoiceNumber: w.invoiceNumber || '',
    date: w.date || w.createdAt || null,
    totalAmount: w.totalAmount || 0,
    paid: DB.getInvoiceEffectivePaid(w.id),
  }));

  // ---- 1) the consolidated sale invoice --------------------------------------
  let inv;
  try {
    inv = DB.addInvoice({
      customerId: _cdCustomerId,
      type: 'customer',
      date: chosenTs,
      items: cdMergeBuildItems(sel),
      totalAmount,
      customerDiscount: 0,
      extraDiscount,
      timbreFiscal,
      profit,
      mergedFrom,
      mergeSnapshot: snapshot,
      mergedAt: Date.now(),
      note: (t('merge.mergedNote') + ' ' + sel.map(w => w.invoiceNumber || '').filter(Boolean).join(', ')).trim(),
    }, { numberYear: chosen.getFullYear() });
  } catch (e) {
    alert('تعذر إنشاء الفاتورة: ' + (e && e.message ? e.message : e));
    return;
  }

  // Period reports read createdAt (falling back to date) - align it so the merge
  // lands in the period the user picked.
  try { DB.updateInvoice(inv.id, { createdAt: chosenTs }); } catch (e) {}

  // ---- 2) payments: drop the old rows, record the chosen one -----------------
  sel.forEach(w => { try { DB.deletePaymentsByInvoice(w.id); } catch (e) {} });
  if (pay.total > 0) {
    const pmt = {
      customerId: _cdCustomerId,
      invoiceId: inv.id,
      amount: pay.total,
      method: pay.method,
      note: 'دفع عند دمج وصول التسليم',
    };
    if (pay.method === 'mixed') { pmt.cashAmount = pay.cash; pmt.ccpAmount = pay.ccp; }
    try { DB.addPayment(pmt); } catch (e) {}
  }

  // ---- 3) re-point returns and discounts (keep the audit trail, never delete) -
  try {
    const returns = DB.getReturns();
    let ch = false;
    returns.forEach(r => { if (sel.some(w => w.id === r.invoiceId)) { r.invoiceId = inv.id; ch = true; } });
    if (ch) DB.saveReturns(returns);
  } catch (e) {}
  try {
    const discounts = DB.getDiscounts();
    let ch = false;
    discounts.forEach(d => { if (sel.some(w => w.id === d.invoiceId)) { d.invoiceId = inv.id; ch = true; } });
    if (ch) DB.saveDiscounts(discounts);
  } catch (e) {}

  // ---- 4) customer balance: exactly the debt delta ---------------------------
  if (Math.abs(balanceDelta) > 0.004) {
    const customers = DB.getCustomers();
    const cIdx = customers.findIndex(c => c.id === _cdCustomerId);
    if (cIdx !== -1) {
      customers[cIdx].balance = (parseFloat(customers[cIdx].balance) || 0) + balanceDelta;
      DB.saveCustomers(customers);
    }
  }

  // ---- 5) delete the merged waybills (records only - STOCK UNTOUCHED) --------
  sel.forEach(w => { try { DB.deleteInvoice(w.id); } catch (e) {} });

  // ---- 6) audit trail --------------------------------------------------------
  try {
    DB.logAudit({
      action: 'merge',
      entity: 'invoice',
      entityId: inv.id,
      detail: (inv.invoiceNumber || '') + ' <- ' + sel.map(w => w.invoiceNumber || '').filter(Boolean).join(', '),
    });
  } catch (e) {}

  closeCdMerge();
  _cdInvoices = DB.getInvoicesByCustomer(_cdCustomerId);
  renderCdStats();
  renderCdInvoices();
  renderCdHistory();
  renderCdPayments();
  cdUpdateMergeBtn();

  alert(t('merge.done').replace('{n}', String(sel.length)).replace('{num}', inv.invoiceNumber || ''));
  showCdInvoiceDetail(inv.id);
}