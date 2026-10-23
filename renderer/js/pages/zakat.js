// ===== ZAKAT (حساب الزكاة) =====
// Spécialistes des biens commerciaux (عروض التجارة) et trésorerie.
// Formule : وعاء = مخزون (سعر السوق) + سيولة (نقد + CCP + تسوية) + ديون لنا (على العملاء)
//                  + أموالنا عند الموردين (رصيد مورد سالب) − ديون علينا (للموردين) − سلف العملاء المقبوضة (رصيد عميل سالب).
// الزكاة = 2.5% (ربع العشر) من الوعاء الصافي إذا بلغ النصاب وحال عليه الحول.

function init_zakat() {
  zkLoadInputs();
  calculateZakat();
}

// ===== Persistence (localStorage, per the app conventions) =====
function zkStorageKey(sub) {
  const store = (typeof Auth !== 'undefined' && Auth.getUserCode) ? (Auth.getUserCode() || '') : '';
  return 'zakat_' + sub + '_' + store;
}
function zkLoadInputs() {
  try {
    const nisab = parseFloat(localStorage.getItem(zkStorageKey('nisab')) || '') || 0;
    const year = localStorage.getItem(zkStorageKey('year')) || String(new Date().getFullYear());
    const adj = parseFloat(localStorage.getItem(zkStorageKey('liquidity_adj')) || '') || 0;
    const ni = document.getElementById('zakatNisabInput');
    const yr = document.getElementById('zakatNisabYear');
    const ad = document.getElementById('zakatLiquidityAdj');
    if (ni) ni.value = nisab ? String(nisab) : '';
    if (yr) yr.value = year;
    if (ad) ad.value = String(adj || 0);
  } catch (e) {}
}
function zkSaveNisab() {
  try {
    const ni = document.getElementById('zakatNisabInput');
    const yr = document.getElementById('zakatNisabYear');
    const v = ni ? parseFloat(ni.value) || 0 : 0;
    localStorage.setItem(zkStorageKey('nisab'), String(v));
    if (yr) localStorage.setItem(zkStorageKey('year'), yr.value || String(new Date().getFullYear()));
  } catch (e) {}
}
function zkSaveAdjustment() {
  try {
    const ad = document.getElementById('zakatLiquidityAdj');
    const v = ad ? parseFloat(ad.value) || 0 : 0;
    localStorage.setItem(zkStorageKey('liquidity_adj'), String(v));
  } catch (e) {}
}

// ===== Recompute scheduling (debounced) =====
let zkTimer = null;
function zkScheduleRecalc() {
  if (zkTimer) clearTimeout(zkTimer);
  zkTimer = setTimeout(() => {
    zkSaveNisab();
    zkSaveAdjustment();
    calculateZakat();
  }, 350);
}

// ===== Helpers =====
function zkNum(v) { return (parseFloat(v) || 0); }
function zkFix(v) { return fmtMoney((zkNum(v))); }
function zkDA(v) { return 'DA' + zkFix(v); }
function zkEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function zkParts(p) {
  // cash/ccp split of one payment row
  let cash = 0, ccp = 0;
  const a = zkNum(p.amount), od = (p.cashAmount != null || p.ccpAmount != null);
  if (od) { cash = zkNum(p.cashAmount); ccp = zkNum(p.ccpAmount); }
  else if (p.method === 'ccp') ccp = a;
  else if (p.method === 'mixed') { cash = a / 2; ccp = a / 2; }
  else cash = a;
  return { cash, ccp };
}

// Payment classification (mirrors net-account.js isNetExpensePayment — global,
// not period-filtered): expense = money paid OUT; sale = money received IN.
function zkIsExpensePayment(p, invById) {
  if (p.supplierId || p.type === 'stock_purchase' || p.type === 'dispatch') {
    const inv = p.invoiceId ? invById[p.invoiceId] : null;
    if (inv && (inv.type === 'sup_sale' || inv.type === 'customer')) return false;
    return true;
  }
  const inv = p.invoiceId ? invById[p.invoiceId] : null;
  return !!inv && (inv.type === 'supplier' || inv.type === 'purchase');
}

// ===== Computation =====
function zkComputeInventory() {
  // Current market value at retail resale price (sellPrice), جمهور doctrine.
  const products = (typeof DB !== 'undefined' && DB.getProducts) ? DB.getProducts() : [];
  let total = 0;
  const rows = [];
  products.forEach(p => {
    const qty = zkNum(p.quantity);
    if (qty <= 0) return;
    if (p.fixed) return; // services — no stock to valorize
    const price = zkNum(p.sellPrice);
    total += qty * price;
    rows.push({ id: p.id, name: p.name || '', qty, price, value: qty * price });
  });
  rows.sort((a, b) => b.value - a.value);
  return { total, rows };
}

function zkComputeLiquidity() {
  // Net liquidity since the books began = money IN − money OUT, split cash/CCP,
  // plus a manual adjustment field (opening balance / unrecorded withdrawals).
  const payments = (typeof DB !== 'undefined' && DB.getPayments) ? DB.getPayments() : [];
  const invoices = (typeof DB !== 'undefined' && DB.getInvoices) ? DB.getInvoices() : [];
  const invById = {};
  invoices.forEach(i => { invById[i.id] = i; });
  let cashIn = 0, cashOut = 0, ccpIn = 0, ccpOut = 0;

  payments.forEach(p => {
    if (p.isProvisional) return;
    // Inter-store settlements (ديون المحلات) are internal — never double-count.
    if (p.type === 'transfer_payment') return;
    const invRef = p.invoiceId ? invById[p.invoiceId] : null;
    if (invRef && invRef.type === 'payment') return; // payment vouchers settle balances
    if (p.isSupSaleExpense) { // مقاصّة رصيد من مورد عند بيع لمورد = نقد وارد (بيع)
      const pp = zkParts(p);
      cashIn += pp.cash; ccpIn += pp.ccp;
      return;
    }
    if (p.type === 'net_purchase' || p.type === 'net_expense') {
      const pp = zkParts(p);
      cashOut += pp.cash; ccpOut += pp.ccp;
      return;
    }
    const isExp = zkIsExpensePayment(p, invById);
    const pp = zkParts(p);
    if (isExp) { cashOut += pp.cash; ccpOut += pp.ccp; }
    else { cashIn += pp.cash; ccpIn += pp.ccp; }
  });

  const adj = zkNum(document.getElementById('zakatLiquidityAdj')?.value);
  const netCash = cashIn - cashOut;
  const netCcp = ccpIn - ccpOut;
  return {
    cashIn, cashOut, netCash,
    ccpIn, ccpOut, netCcp,
    adj,
    total: netCash + netCcp + adj,
    breakdown: [
      { label: 'lqCashIn', value: cashIn, tone: 'in' },
      { label: 'lqCashOut', value: cashOut, tone: 'out' },
      { label: 'lqNetCash', value: netCash, tone: 'net' },
      { label: 'lqCcpIn', value: ccpIn, tone: 'in' },
      { label: 'lqCcpOut', value: ccpOut, tone: 'out' },
      { label: 'lqNetCcp', value: netCcp, tone: 'net' },
      { label: 'lqAdj', value: adj, tone: 'adj' },
    ],
  };
}

function zkComputeReceivables() {
  // Debts owed to us, good/collectable: positive customer balances.
  // Customer prepayments (negative balances = we owe a future delivery or a
  // refund) are the opposite side: سلف العملاء المقبوضة — a liability deducted.
  const customers = (typeof DB !== 'undefined' && DB.getCustomers) ? DB.getCustomers() : [];
  let total = 0;
  let owedToCustomers = 0;
  const rows = [];
  const prepaidRows = [];
  customers.forEach(c => {
    const b = zkNum(c.balance);
    if (b > 0) { total += b; rows.push({ name: c.name || '—', value: b }); }
    else if (b < 0) { owedToCustomers += Math.abs(b); prepaidRows.push({ name: c.name || '—', value: Math.abs(b) }); }
  });
  rows.sort((a, b) => b.value - a.value);
  prepaidRows.sort((a, b) => b.value - a.value);
  return { total, rows, owedToCustomers, prepaidRows };
}

function zkComputePayables() {
  // Due debts to suppliers (positive balances). Suppliers we have overpaid
  // (negative balances = they still owe us goods or a refund) are our money
  // held at them: أموالنا عند الموردين — an asset added to the base.
  const suppliers = (typeof DB !== 'undefined' && DB.getSuppliers) ? DB.getSuppliers() : [];
  let total = 0;
  let atSuppliers = 0;
  const rows = [];
  const advanceRows = [];
  suppliers.forEach(s => {
    const b = zkNum(s.balance);
    if (b > 0) { total += b; rows.push({ name: s.name || '—', value: b }); }
    else if (b < 0) { atSuppliers += Math.abs(b); advanceRows.push({ name: s.name || '—', value: Math.abs(b) }); }
  });
  rows.sort((a, b) => b.value - a.value);
  advanceRows.sort((a, b) => b.value - a.value);
  return { total, rows, atSuppliers, advanceRows };
}

function calculateZakat() {
  if (typeof DB === 'undefined' || !DB.getProducts) return;

  const inventory = zkComputeInventory();
  const liquidity = zkComputeLiquidity();
  const receivables = zkComputeReceivables();
  const payables = zkComputePayables();

  const base = inventory.total + liquidity.total + receivables.total + payables.atSuppliers
             - payables.total - receivables.owedToCustomers;
  const nisab = zkNum(document.getElementById('zakatNisabInput')?.value);
  const nisabYear = (document.getElementById('zakatNisabYear')?.value || '').trim();
  const zakat = (nisab > 0 && base >= nisab) ? base * 0.025 : 0;
  const deficit = Math.max(0, (nisab > 0 ? nisab : 0) - base);

  // ---- Stats
  zkSetText('zkStatInventory', zkDA(inventory.total));
  zkSetText('zkStatCash', zkDA(liquidity.netCash + liquidity.adj));
  zkSetText('zkStatCcp', zkDA(liquidity.netCcp));
  zkSetText('zkStatReceivables', zkDA(receivables.total));
  zkSetText('zkStatPayables', zkDA(payables.total));
  zkSetText('zkStatAtSuppliers', zkDA(payables.atSuppliers));
  zkSetText('zkStatOwedCustomers', zkDA(receivables.owedToCustomers));
  zkSetText('zkStatBase', zkDA(base));
  zkSetText('zkStatNisab', nisab > 0 ? zkDA(nisab) : '—');

  // ---- Result box
  const amountEl = document.getElementById('zkResultAmount');
  const badgeEl = document.getElementById('zkStatusBadge');
  const subEl = document.getElementById('zkResultSub');

  // ---- Record button state
  const recBtn = document.getElementById('zkRecordBtn');
  const recHint = document.getElementById('zkRecordHint');
  const payable = nisab > 0 && base >= nisab;
  if (recBtn) {
    recBtn.disabled = !payable;
    recBtn.title = payable ? '' : t('zakat.noAmount');
  }
  if (recHint) recHint.style.display = payable ? 'none' : 'block';

  if (nisab <= 0) {
    if (amountEl) amountEl.textContent = '—';
    if (badgeEl) { badgeEl.textContent = t('zakat.noNisab'); badgeEl.className = 'badge badge-warning'; badgeEl.style.cssText = 'font-size:13px;padding:6px 14px'; }
    if (subEl) subEl.textContent = t('zakat.noNisab');
  } else if (base >= nisab) {
    if (amountEl) { amountEl.textContent = zkDA(zakat); amountEl.style.color = '#28a745'; }
    if (badgeEl) { badgeEl.textContent = t('zakat.payable'); badgeEl.className = 'badge badge-success'; badgeEl.style.cssText = 'font-size:13px;padding:6px 14px'; }
    if (subEl) subEl.textContent = t('zakat.reached') + (nisabYear ? ' (' + t('zakat.nisabYear') + ' ' + zkEsc(nisabYear) + ')' : '');
  } else {
    if (amountEl) { amountEl.textContent = 'DA0.00'; amountEl.style.color = '#e65100'; }
    if (badgeEl) { badgeEl.textContent = t('zakat.noZakat'); badgeEl.className = 'badge badge-danger'; badgeEl.style.cssText = 'font-size:13px;padding:6px 14px'; }
    if (subEl) subEl.textContent = t('zakat.deficit') + ': ' + zkDA(deficit);
  }

  // ---- Liquidity table
  zkRenderLiquidity(liquidity);

  // ---- Inventory table
  zkRenderInventory(inventory.rows);

  // ---- Debts
  zkRenderDebtRows('zkCustomersRows', receivables.rows, receivables.total, 'asset');
  zkRenderDebtRows('zkSuppliersRows', payables.rows, payables.total, 'liab');
  zkRenderDebtRows('zkAtSuppliersRows', payables.advanceRows, payables.atSuppliers, 'asset');
  zkRenderDebtRows('zkOwedCustomersRows', receivables.prepaidRows, receivables.owedToCustomers, 'liab');

  // ---- Reference net profit (informational only)
  let profitRef = null;
  try {
    if (typeof computeNet === 'function') {
      profitRef = computeNet(null).profit;
    }
  } catch (e) { profitRef = null; }
  zkSetText('zkNetProfitRef', profitRef == null ? '—' : zkDA(profitRef));
}

// ===== RECORD ZAKAT AS AN EXPENSE (تقييد صرف الزكاة) =====
// الإخراج قيد مالي فعلي: يُقيَّد كمصروف (net_expense) بوسم داخلي يمنع تكراره لنفس السنة.
function zkHasZakatPayout(year) {
  try {
    const payments = (typeof DB !== 'undefined' && DB.getPayments) ? DB.getPayments() : [];
    return payments.some(p => p.tag === 'zakat' && String(p.zakatYear) === String(year));
  } catch (e) { return false; }
}

function zkCanRecordZakat() {
  if (typeof Auth === 'undefined') return true;
  try {
    if (Auth.isManager()) return true;
    if (Auth.canEdit && Auth.canEdit('expenses')) return true;
  } catch (e) {}
  return false;
}

function zkRecordZakat() {
  if (!zkCanRecordZakat()) {
    if (typeof alert === 'function') alert(t('common.noPermission') || 'لا تملك صلاحية إجراء هذه العملية');
    return;
  }
  const nisab = zkNum(document.getElementById('zakatNisabInput')?.value);
  const year = (document.getElementById('zakatNisabYear')?.value || '').trim() || String(new Date().getFullYear());
  if (nisab <= 0) {
    if (typeof alert === 'function') alert(t('zakat.noNisab'));
    return;
  }
  const inventory = zkComputeInventory();
  const liquidity = zkComputeLiquidity();
  const receivables = zkComputeReceivables();
  const payables = zkComputePayables();
  const base = inventory.total + liquidity.total + receivables.total + payables.atSuppliers
             - payables.total - receivables.owedToCustomers;
  const zakat = (base >= nisab) ? base * 0.025 : 0;
  if (zakat <= 0) {
    if (typeof alert === 'function') alert(t('zakat.noAmount') || 'بلغ النصاب أولاً ليتمكن التقييد');
    return;
  }
  if (zkHasZakatPayout(year)) {
    if (typeof alert === 'function') alert((t('zakat.alreadyPaid') || '').replace('{year}', year));
    return;
  }
  const msg = (t('zakat.payConfirm') || '')
    .replace('{amount}', zkFix(zakat))
    .replace('{year}', year);
  if (typeof confirm === 'function' && !confirm(msg)) return;

  if (typeof DB === 'undefined' || !DB.addPayment) {
    if (typeof alert === 'function') alert('DB unavailable');
    return;
  }
  DB.addPayment({
    type: 'net_expense',
    amount: zakat,
    method: 'cash',
    note: (t('zakat.payNow') || 'Zakat') + ' ' + year,
    tag: 'zakat',
    zakatYear: year,
  });

  if (typeof alert === 'function') alert((t('zakat.paySuccess') || '').replace('{year}', year));
  calculateZakat();
}

function zkSetText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function zkRenderLiquidity(l) {
  const tb = document.getElementById('zkLiquidityRows');
  if (!tb) return;
  let html = '';
  l.breakdown.forEach(r => {
    const color = r.tone === 'out' ? '#dc3545' : (r.tone === 'in' ? '#28a745' : (r.tone === 'adj' ? '#e6a000' : '#0066B1'));
    html += `<tr>
      <td style="font-size:12px">${zkEsc(t(r.label))}</td>
      <td style="text-align:left;font-weight:600;color:${color};direction:ltr">${zkDA(r.value)}</td>
    </tr>`;
  });
  html += `<tr style="border-top:2px solid var(--silver-300)">
    <td style="font-size:12px;font-weight:700">${zkEsc(t('zakat.lqTotal'))}</td>
    <td style="text-align:left;font-weight:800;color:var(--bmw-blue-1);direction:ltr;font-size:16px">${zkDA(l.total)}</td>
  </tr>`;
  tb.innerHTML = html;
}

function zkRenderInventory(rows) {
  const tb = document.getElementById('zkInventoryRows');
  if (!tb) return;
  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="5" class="empty-row">${zkEsc(t('zakat.invEmpty'))}</td></tr>`;
    return;
  }
  let total = 0;
  let html = rows.map(r => {
    total += r.value;
    return `<tr>
      <td style="font-size:12px">${zkEsc(r.name)}</td>
      <td style="font-size:12px;text-align:center">${Unit.qtyUnit(r.qty, r)}</td>
      <td style="font-size:12px"><span class="badge badge-info" style="font-size:11px">${zkEsc(t('zakat.invBasisRetail'))}</span></td>
      <td style="font-size:12px;text-align:left;direction:ltr">${zkDA(r.price)}</td>
      <td style="font-size:12px;text-align:left;direction:ltr;font-weight:600">${zkDA(r.value)}</td>
    </tr>`;
  }).join('');
  html += `<tr style="border-top:2px solid var(--silver-300)">
    <td colspan="4" style="font-size:12px;font-weight:700" >${zkEsc(t('zakat.invTotal'))}</td>
    <td style="text-align:left;font-weight:800;color:var(--bmw-blue-1);direction:ltr;font-size:15px">${zkDA(total)}</td>
  </tr>`;
  tb.innerHTML = html;
}

function zkRenderDebtRows(id, rows, total, tone) {
  const tb = document.getElementById(id);
  if (!tb) return;
  const color = tone === 'asset' ? '#0f9d58' : (tone === 'liab' ? '#dc3545' : 'var(--bmw-blue-1)');
  const valStyle = tone ? `color:${color}` : 'color:var(--silver-700)';
  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="2" class="empty-row">${zkEsc(t('zakat.debtEmpty'))}</td></tr>`;
    return;
  }
  let html = rows.map(r => `<tr>
    <td style="font-size:12px">${zkEsc(r.name)}</td>
    <td style="font-size:12px;text-align:left;direction:ltr;font-weight:600;${valStyle}">${zkDA(r.value)}</td>
  </tr>`).join('');
  html += `<tr style="border-top:2px solid var(--silver-300)">
    <td style="font-size:12px;font-weight:700">${zkEsc(t('zakat.debtTotal'))}</td>
    <td style="text-align:left;font-weight:800;font-size:14px;direction:ltr;color:${color}">${zkDA(total)}</td>
  </tr>`;
  tb.innerHTML = html;
}

// ===== PRINT REPORT =====
function zkBuildReportHtml() {
  const inventory = zkComputeInventory();
  const liquidity = zkComputeLiquidity();
  const receivables = zkComputeReceivables();
  const payables = zkComputePayables();
  const base = inventory.total + liquidity.total + receivables.total + payables.atSuppliers
             - payables.total - receivables.owedToCustomers;
  const nisab = zkNum(document.getElementById('zakatNisabInput')?.value);
  const nisabYear = (document.getElementById('zakatNisabYear')?.value || '').trim();
  const zakat = (nisab > 0 && base >= nisab) ? base * 0.025 : 0;
  const now = new Date();
  const dateStr = now.toLocaleDateString('ar-EG-u-nu-latn');

  const storeName = (typeof DB !== 'undefined' && DB.getStoreName)
    ? DB.getStoreName() : '';
  const lq = l => zkEsc(t(l));
  const row = (a, b) => `<tr><td style="padding:6px 10px">${a}</td><td style="padding:6px 10px;text-align:left;direction:ltr">${b}</td></tr>`;

  let invRows = '';
  if (inventory.rows.length) {
    inventory.rows.slice(0, 200).forEach(r => {
      invRows += `<tr><td style="padding:4px 8px">${zkEsc(r.name)}</td><td style="padding:4px 8px;text-align:center">${Unit.qtyUnit(r.qty, r)}</td><td style="padding:4px 8px">${zkEsc(t('zakat.invBasisRetail'))}</td><td style="padding:4px 8px;text-align:left;direction:ltr">${zkDA(r.price)}</td><td style="padding:4px 8px;text-align:left;direction:ltr">${zkDA(r.value)}</td></tr>`;
    });
    if (inventory.rows.length > 200) invRows += `<tr><td colspan="5" style="padding:4px 8px;color:#888">… (+${inventory.rows.length - 200})</td></tr>`;
  } else {
    invRows = `<tr><td colspan="5" style="padding:8px;color:#888">${zkEsc(t('zakat.invEmpty'))}</td></tr>`;
  }

  const custRows = receivables.rows.slice(0, 40).map(r => row(zkEsc(r.name), zkDA(r.value))).join('') ||
    `<tr><td colspan="2" style="padding:8px;color:#888">—</td></tr>`;
  const supRows = payables.rows.slice(0, 40).map(r => row(zkEsc(r.name), zkDA(r.value))).join('') ||
    `<tr><td colspan="2" style="padding:8px;color:#888">—</td></tr>`;
  const advRows = payables.advanceRows.slice(0, 40).map(r => row(zkEsc(r.name), zkDA(r.value))).join('') ||
    `<tr><td colspan="2" style="padding:8px;color:#888">—</td></tr>`;
  const prepRows = receivables.prepaidRows.slice(0, 40).map(r => row(zkEsc(r.name), zkDA(r.value))).join('') ||
    `<tr><td colspan="2" style="padding:8px;color:#888">—</td></tr>`;

  const lqRows = liquidity.breakdown.map(r => row(lq(r.label), zkDA(r.value))).join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<title>${zkEsc(t('zakat.reportTitle'))}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#222;padding:20px;line-height:1.6}
  h1{font-size:20px;color:#0066B1;margin-bottom:2px}
  .muted{color:#888;font-size:12px}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0066B1;padding-bottom:10px;margin-bottom:16px}
  .sum{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:18px}
  .card{border:1px solid #ddd;border-radius:6px;padding:12px;background:#fafafa}
  .card b{display:block;font-size:12px;color:#555;margin-bottom:2px}
  .card span{font-size:17px;font-weight:700;direction:ltr;display:inline-block}
  .hero{background:#0066B1;color:#fff;border-radius:8px;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}
  .hero b{font-size:13px;font-weight:600;opacity:.85}
  .hero span{font-size:26px;font-weight:800}
  h2{font-size:15px;color:#004080;margin:18px 0 8px;border-right:3px solid #0066B1;padding-right:8px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:#f0f5fa;color:#004080;padding:7px 10px;text-align:right;border-bottom:2px solid #0066B1}
  td{border-bottom:1px solid #eee}
  .total td{background:#fff7e6;font-weight:700;border-top:2px solid #e6a000}
  .green{color:#28a745}.gold{color:#e6a000}.blue{color:#0066B1}
  .note{font-size:11px;color:#777;margin-top:12px;border-top:1px dashed #ccc;padding-top:8px}
  @page{size:A4;margin:12mm}
</style>
</head>
<body>
  <div class="head">
    <div>
      <h1>${zkEsc(t('zakat.reportTitle'))}</h1>
      <div class="muted">${zkEsc(storeName)}</div>
    </div>
    <div style="text-align:left">
      <div class="muted">${zkEsc(t('zakat.reportDate'))}: ${dateStr}</div>
      <div class="muted">${zkEsc(t('zakat.nisabYear'))}: ${zkEsc(nisabYear)}</div>
    </div>
  </div>

  <div class="hero">
    <div><b>${zkEsc(t('zakat.result'))}</b> <span style="color:#fff">${zkDA(zakat)}</span></div>
    <div class="muted" style="color:#dce9f5">${zkEsc(t('zakat.resultSub'))}</div>
  </div>

  <div class="sum">
    <div class="card"><b>${zkEsc(t('zakat.stat1'))}</b><span>${zkDA(inventory.total)} DA</span></div>
    <div class="card"><b>${zkEsc(t('zakat.stat2'))}</b><span>${zkDA(liquidity.netCash + liquidity.adj)} DA</span></div>
    <div class="card"><b>${zkEsc(t('zakat.stat3'))}</b><span>${zkDA(liquidity.netCcp)} DA</span></div>
    <div class="card"><b>${zkEsc(t('zakat.stat4'))}</b><span>${zkDA(receivables.total)} DA</span></div>
    <div class="card"><b>${zkEsc(t('zakat.stat5'))}</b><span>${zkDA(payables.total)} DA</span></div>
    <div class="card"><b>${zkEsc(t('zakat.stat8'))}</b><span class="green">${zkDA(payables.atSuppliers)} DA</span></div>
    <div class="card"><b>${zkEsc(t('zakat.stat9'))}</b><span>${zkDA(receivables.owedToCustomers)} DA</span></div>
    <div class="card"><b>${zkEsc(t('zakat.stat6'))}</b><span class="blue">${zkDA(base)} DA</span></div>
    <div class="card"><b>${zkEsc(t('zakat.stat7'))}</b><span>${nisab > 0 ? zkDA(nisab) : '—'}</span></div>
    <div class="card"><b>${zkEsc(t('zakat.invBasisRetail'))}</b><span class="gold">2.5%</span></div>
  </div>

  <h2>${zkEsc(t('zakat.lqTitle'))}</h2>
  <table>
    <thead><tr><th></th><th style="text-align:left">DA</th></tr></thead>
    <tbody>${lqRows}</tbody>
  </table>

  <h2>${zkEsc(t('zakat.invTitle'))}</h2>
  <table>
    <thead><tr><th>${zkEsc(t('zakat.invColProduct'))}</th><th style="text-align:center">${zkEsc(t('zakat.invColQty'))}</th><th>${zkEsc(t('zakat.invColBasis'))}</th><th style="text-align:left">${zkEsc(t('zakat.invColPrice'))}</th><th style="text-align:left">${zkEsc(t('zakat.invColValue'))}</th></tr></thead>
    <tbody>${invRows}
      <tr class="total"><td colspan="4">${zkEsc(t('zakat.invTotal'))}</td><td style="text-align:left;direction:ltr">${zkDA(inventory.total)} DA</td></tr>
    </tbody>
  </table>

  <h2>${zkEsc(t('zakat.debtTitle'))}</h2>
  <table>
    <thead><tr><th>${zkEsc(t('zakat.debtCustomers'))}</th><th style="text-align:left">${zkEsc(t('zakat.debtColBalance'))}</th></tr></thead>
    <tbody>${custRows}</tbody>
  </table>
  <table style="margin-top:8px">
    <thead><tr><th>${zkEsc(t('zakat.debtSuppliers'))}</th><th style="text-align:left">${zkEsc(t('zakat.debtColBalance'))}</th></tr></thead>
    <tbody>${supRows}</tbody>
  </table>
  <table style="margin-top:8px">
    <thead><tr><th>${zkEsc(t('zakat.debtAtSuppliers'))}</th><th style="text-align:left">${zkEsc(t('zakat.debtColBalance'))}</th></tr></thead>
    <tbody>${advRows}</tbody>
  </table>
  <table style="margin-top:8px">
    <thead><tr><th>${zkEsc(t('zakat.debtOwedCustomers'))}</th><th style="text-align:left">${zkEsc(t('zakat.debtColBalance'))}</th></tr></thead>
    <tbody>${prepRows}</tbody>
  </table>

  <div class="note">${zkEsc(t('zakat.methodB1'))} · ${zkEsc(t('zakat.methodB4'))}</div>
  <script>window.print();window.close();<\/script>
</body>
</html>`;
}

function printZakatReport() {
  const html = zkBuildReportHtml();
  let win = null;
  try { win = window.open('', '_blank', 'width=820,height=640'); } catch (e) { win = null; }
  if (!win) { if (typeof alert === 'function') alert(t('invoices.allowPopups') || 'الرجاء السماح بالنوافذ المنبثقة'); return; }
  win.document.write(html);
  win.document.close();
}

// ===== LAN SYNC HANDLER =====
window._pageSyncHandlers = window._pageSyncHandlers || {};
window._pageSyncHandlers['zakat'] = function zakatSyncData() {
  calculateZakat();
};

// Expose for inline onclick handlers
window.init_zakat = init_zakat;
window.calculateZakat = calculateZakat;
window.printZakatReport = printZakatReport;
window.zkScheduleRecalc = zkScheduleRecalc;
window.zkRecordZakat = zkRecordZakat;