if (typeof _rCharts !== 'undefined') {
  Object.values(_rCharts).forEach(c => { try { if (c) c.destroy(); } catch(e) {} });
}
var _rCharts = {};

var _rPeriod = 'month';

function setReportPeriod(period) {
  _rPeriod = period;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b.dataset.period === period));
  document.getElementById('reportDateRange').style.display = period === 'custom' ? 'block' : 'none';
  document.getElementById('reportSingleDay').style.display = period === 'day' ? 'block' : 'none';
  renderReports();
}

function getDateRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  const toTs = now.getTime();

  let fromTs;

  switch (_rPeriod) {
    case 'week': {
      const dayOfWeek = now.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(now);
      monday.setDate(d - diff);
      monday.setHours(0, 0, 0, 0);
      fromTs = monday.getTime();
      break;
    }
    case 'month':
      fromTs = new Date(y, m, 1).getTime();
      break;
    case 'year':
      fromTs = new Date(y, 0, 1).getTime();
      break;
    case 'custom': {
      const fromEl = document.getElementById('reportDateFrom');
      const toEl = document.getElementById('reportDateTo');
      if (fromEl.value) fromTs = new Date(fromEl.value + 'T00:00:00').getTime();
      else fromTs = new Date(y, m, 1).getTime();
      if (toEl.value) return { from: fromTs, to: new Date(toEl.value + 'T23:59:59').getTime() };
      return { from: fromTs };
    }
    case 'day': {
      const dayEl = document.getElementById('reportSingleDate');
      if (dayEl.value) {
        const day = new Date(dayEl.value + 'T00:00:00');
        return { from: day.getTime(), to: day.getTime() + 86399999 };
      }
      fromTs = new Date(y, m, d).getTime();
      break;
    }
    default: fromTs = 0;
  }

  return { from: fromTs };
}

function inReportRange(ts, range) {
  const t = ts || 0;
  if (range && range.from && t < range.from) return false;
  if (range && range.to && t > range.to) return false;
  return true;
}

function filterByDate(items, range) {
  if (!items || items.length === 0) return [];
  return items.filter(item => inReportRange(item.createdAt || item.date || 0, range));
}

// Margin follows the day an invoice was FULLY settled, not the sale date.
// Partial collections still appear as revenue in their own period.
function filterByCompletion(items, range) {
  if (!items || items.length === 0) return [];
  return items.filter(inv => {
    const ts = DB.getInvoiceCompletionTs(inv);
    return ts > 0 && inReportRange(ts, range);
  });
}

// Cost of a sale line: the snapshot frozen at sale time, then the product's
// real batch cost (displayed buy price after purchase discounts).
function _reportLineCost(line, prod) {
  if (typeof PurchaseCore !== 'undefined' && PurchaseCore && typeof PurchaseCore.itemCost === 'function') {
    return PurchaseCore.itemCost(line, prod);
  }
  return prod ? (prod.buyPrice || 0) : 0;
}

function getProfitMargin(invoices, productMap) {
  return invoices.reduce((s, inv) => {
    if (inv.isProvisional) return s;
    if (DB.getInvoiceEffectivePaid(inv) < (inv.totalAmount || 0)) return s;
    (inv.items || []).forEach(it => {
      const prod = productMap[it.productId];
      const buyPrice = _reportLineCost(it, prod);
      s += (it.price - buyPrice) * it.qty;
    });
    return s;
  }, 0);
}

// «مصروف يدوي» فقط كما في net-account: net_expense دون Tag (الرواتب
// tag:'salary' والزكاة tag:'zakat' خارج الخصم ولا تُمس totalExpenses).
function _reportManualExpenseSplit(payments, from, to) {
  const out = { cash: 0, ccp: 0 };
  (payments || []).forEach(p => {
    if (!p || p.isProvisional || p.type !== 'net_expense' || p.tag) return;
    const ts = p.createdAt || 0;
    if (from != null && ts < from) return;
    if (to != null && ts > to) return;
    const a = isFinite(Number(p.amount)) ? Number(p.amount) : 0;
    if (p.cashAmount != null || p.ccpAmount != null) {
      out.cash += isFinite(Number(p.cashAmount)) ? Number(p.cashAmount) : 0;
      out.ccp += isFinite(Number(p.ccpAmount)) ? Number(p.ccpAmount) : 0;
    } else if (p.method === 'ccp') out.ccp += a;
    else if (p.method === 'mixed') { out.cash += a / 2; out.ccp += a / 2; }
    else out.cash += a;
  });
  return out;
}

function formatDA(v) {
  return 'DA' + fmtMoney((v || 0));
}

function getProfitMarginSplit(invoices, productMap, manualExpenses) {
  let marginCash = 0, marginCcp = 0, collectedCash = 0, collectedCcp = 0;
  invoices.forEach(inv => {
    if (inv.isProvisional) return;
    if (DB.getInvoiceEffectivePaid(inv) < (inv.totalAmount || 0)) return;
    let margin = 0;
    (inv.items || []).forEach(it => {
      const prod = productMap[it.productId];
      const buyPrice = _reportLineCost(it, prod);
      margin += (it.price - buyPrice) * it.qty;
    });
    const m = DB.getInvoicePaymentMethods(inv.id);
    collectedCash += m.cash;
    collectedCcp += m.ccp;
    const totalPaid = m.cash + m.ccp;
    if (totalPaid > 0 && m.ccp > 0) {
      const ccpRatio = m.ccp / totalPaid;
      marginCcp += margin * ccpRatio;
      marginCash += margin * (1 - ccpRatio);
    } else {
      marginCash += margin;
    }
  });
  // خصم المصروفات اليدوية من سطر النقد/CCP فقط (وليس من سطر الهامش)،
  // دون أن تنزل القناة إلى ما تحت الصفر.
  const me = manualExpenses || { cash: 0, ccp: 0 };
  collectedCash = Math.max(0, collectedCash - (Number(me.cash) || 0));
  collectedCcp = Math.max(0, collectedCcp - (Number(me.ccp) || 0));
  return { margin: { cash: marginCash, ccp: marginCcp }, collected: { cash: collectedCash, ccp: collectedCcp } };
}

function formatProfitMarginSplitCard(margin, split) {
  return `${formatDA(margin)}
    <div style="font-size:10px;font-weight:400;margin-top:4px;display:flex;gap:12px;flex-wrap:wrap;color:rgba(255,255,255,0.85)">
      <span>💵 ${t('net.cashLabel')}: ${formatDA(split.collected.cash)}</span>
      <span>📮 CCP: ${formatDA(split.collected.ccp)}</span>
    </div>
    <div style="font-size:10px;font-weight:400;margin-top:2px;color:rgba(255,255,255,0.6)">
      ${t('net.marginLabel')} — 💵 ${formatDA(split.margin.cash)} · 📮 ${formatDA(split.margin.ccp)}
    </div>`;
}

// ===== NET ACCOUNT IN REPORTS =====
var _netReportType = 'year';

function populateNetReportYears() {
  const sel = document.getElementById('netReportYear');
  if (!sel) return;
  const years = new Set([new Date().getFullYear()]);
  DB.getInvoices().forEach(i => { const ts = i.createdAt || i.date; if (ts) years.add(new Date(ts).getFullYear()); });
  DB.getPayments().forEach(p => { if (p.createdAt) years.add(new Date(p.createdAt).getFullYear()); });
  const list = [...years].sort((a, b) => b - a);
  const cur = sel.value;
  sel.innerHTML = list.map(y => `<option value="${y}">${y}</option>`).join('');
  if (cur && list.map(String).includes(String(cur))) sel.value = cur;
}

function setNetReportRange(type) {
  _netReportType = type;
  document.querySelectorAll('#netReportControls .period-btn').forEach(b => b.classList.toggle('active', b.dataset.netperiod === type));
  document.getElementById('netReportYearRow').style.display = type === 'year' ? 'flex' : 'none';
  document.getElementById('netReportDateRow').style.display = type === 'date' ? 'flex' : 'none';
  document.getElementById('netReportRangeRow').style.display = type === 'range' ? 'flex' : 'none';
  renderNetAccountSection();
}

function getNetReportRange() {
  switch (_netReportType) {
    case 'date': {
      const el = document.getElementById('netReportDate');
      if (el && el.value) {
        const d = new Date(el.value + 'T00:00:00');
        return { from: d.getTime(), to: d.getTime() + 86399999 };
      }
      return null;
    }
    case 'range': {
      const f = document.getElementById('netReportFrom');
      const t = document.getElementById('netReportTo');
      const from = f && f.value ? new Date(f.value + 'T00:00:00').getTime() : null;
      const to = t && t.value ? new Date(t.value + 'T23:59:59').getTime() : null;
      if (!from && !to) return null;
      const range = {};
      if (from) range.from = from;
      if (to) range.to = to;
      return range;
    }
    default: {
      const y = parseInt(document.getElementById('netReportYear')?.value || new Date().getFullYear(), 10);
      return { from: new Date(y, 0, 1).getTime(), to: new Date(y, 11, 31, 23, 59, 59).getTime() };
    }
  }
}

function renderNetAccountSection() {
  if (!document.getElementById('netReportSales')) return;
  populateNetReportYears();
  const range = getNetReportRange();
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = formatDA(val); };

  if (!range) {
    ['netReportSales','netReportPurchases','netReportExpenses','netReportProfit','netReportPendingPeriod','netReportCustPeriod','netReportSupPeriod','netReportPendingCurrent','netReportCustCurrent','netReportSupCurrent'].forEach(id => set(id, 0));
    const pm = document.getElementById('netReportPeriodMargin');
    const tm = document.getElementById('netReportTotalMargin');
    if (pm) pm.textContent = 'DA0';
    if (tm) tm.textContent = 'DA0';
    return;
  }

  const res = computeNet(range);
  set('netReportSales', res.totalSales);
  set('netReportPurchases', res.totalPurchases);
  set('netReportExpenses', res.totalExpenses);
  set('netReportProfit', res.profit);
  set('netReportPendingPeriod', res.pendingPeriod);
  set('netReportCustPeriod', res.customerDebtPeriod);
  set('netReportSupPeriod', res.supplierDebtPeriod);
  set('netReportPendingCurrent', res.pendingTotal);
  set('netReportCustCurrent', res.customerDebt);
  set('netReportSupCurrent', res.supplierDebt);
  const pm = document.getElementById('netReportPeriodMargin');
  const tm = document.getElementById('netReportTotalMargin');
  if (pm) pm.innerHTML = formatProfitMarginSplitCard(res.periodMargin, res.periodSplit);
  if (tm) tm.innerHTML = formatProfitMarginSplitCard(res.totalMargin, res.totalSplit);
}

function init_reports() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const today = y + '-' + m + '-' + d;
  const firstDay = y + '-' + m + '-01';

  const fromEl = document.getElementById('reportDateFrom');
  const toEl = document.getElementById('reportDateTo');
  const singleEl = document.getElementById('reportSingleDate');
  if (fromEl) fromEl.value = firstDay;
  if (toEl) toEl.value = today;
  if (singleEl) singleEl.value = today;

  renderReports();

  // Auto-expand period if no data found for current selection
  const allInvoices = DB.getInvoices().filter(inv => inv.type === 'customer');
  const allReturns = DB.getReturns();
  const range = getDateRange();
  const hasSales = filterByDate(allInvoices, range).length > 0;
  const hasReturns = filterByDate(allReturns, range).length > 0;

  if (!hasSales && !hasReturns && allInvoices.length > 0) {
    // No data in current month — auto-switch to 'year'
    _rPeriod = 'year';
    document.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b.dataset.period === 'year'));
    renderReports();
  }

  populateNetReportYears();
  renderNetAccountSection();
}

function renderReports() {
  const range = getDateRange();

  // === RAW DATA ===
  const allInvoices = DB.getInvoices();
  const salesInvoices = filterByDate(allInvoices.filter(inv => inv.type === 'customer'), range);
  const allReturns = DB.getReturns();
  const filteredReturns = filterByDate(allReturns, range);
  // All money actually collected in the period: invoice payments, walk-in,
  // direct customer payments and «سند قبض» vouchers (no double counting).
  const allCashIn = DB.getCashInEvents();
  const filteredCashIn = allCashIn.filter(c => inReportRange(c.ts, range));

  // Build lookup maps for O(1) access
  const invoiceMap = {};
  for (const inv of allInvoices) invoiceMap[inv.id] = inv;
  const productMap = {};
  for (const p of DB.getProducts()) productMap[p.id] = p;

  // === SALES STATS (from invoice totals — real value of goods sold) ===
  const totalSalesAmount = salesInvoices.reduce((s, inv) => s + (inv.totalAmount || 0), 0);
  const totalSalesQty = salesInvoices.reduce((s, inv) => s + inv.items.reduce((si, it) => si + it.qty, 0), 0);
  const totalSalesPaid = filteredCashIn.reduce((s, c) => s + c.amount, 0);
  const totalSalesDue = totalSalesAmount - totalSalesPaid;

  // === RETURNS STATS ===
  const totalReturnsCount = filteredReturns.length;
  const totalReturnsQty = filteredReturns.reduce((s, r) => s + (r.qty || 0), 0);

  // Returns value: O(N) using lookup map instead of O(N*M)
  let totalReturnsValue = 0;
  filteredReturns.forEach(r => {
    const inv = invoiceMap[r.invoiceId];
    if (inv && inv.items) {
      const match = inv.items.find(it => it.productId === r.productId);
      if (match) totalReturnsValue += (match.price || 0) * (r.qty || 0);
    }
  });

  const netSales = totalSalesAmount - totalReturnsValue;
  const returnRate = totalSalesAmount > 0 ? (totalReturnsValue / totalSalesAmount * 100) : 0;

  // هامش الربح = (سعر البيع - سعر الشراء) لكل قطعة. ربح الفاتورة يظهر في
  // الفترة التي اكتمل فيها سدادها، لا في تاريخ إصدارها.
  const allCustomerInvoices = allInvoices.filter(inv => inv.type === 'customer');
  const periodPaidSales = filterByCompletion(allCustomerInvoices, range);
  const totalSalesProfit = periodPaidSales.reduce((s, inv) => s + (inv.profit || 0), 0);
  const totalProfitMargin = getProfitMargin(allCustomerInvoices, productMap);
  const periodProfitMargin = getProfitMargin(periodPaidSales, productMap);
  // خصم المصروفات اليدوية (net_expense بلا Tag) من سطر النقد/CCP فقط:
  // البطاقة الكلية بكل المصروفات، وبطاقة الفترة بمصروفات الفترة. نستعمل
  // دوال net-account المشتركة عندما تكون محمّلة، وإلا حساباً مطابقاً محلياً
  // حتى يبقى ملف reports.js مستقلاً إن فُتح وحده.
  const allPaymentsRaw = DB.getPayments();
  const meTotal = (typeof _manualExpenseSplit === 'function')
    ? _manualExpenseSplit(allPaymentsRaw, null, null)
    : _reportManualExpenseSplit(allPaymentsRaw, null, null);
  const mePeriod = (typeof _manualExpenseSplit === 'function')
    ? _manualExpenseSplit(allPaymentsRaw, range && range.from, range && range.to)
    : _reportManualExpenseSplit(allPaymentsRaw, range && range.from, range && range.to);
  const totalProfitSplit = getProfitMarginSplit(allCustomerInvoices, productMap, meTotal);
  const periodProfitSplit = getProfitMarginSplit(periodPaidSales, productMap, mePeriod);
  const paidSalesAmount = periodPaidSales.reduce((s, inv) => s + (inv.totalAmount || 0), 0);
  const profitMargin = paidSalesAmount > 0 ? (periodProfitMargin / paidSalesAmount * 100) : 0;

  document.getElementById('rSalesAmount').textContent = formatDA(totalSalesAmount);
  document.getElementById('rSalesCount').textContent = salesInvoices.length;
  document.getElementById('rSalesQty').textContent = totalSalesQty;
  document.getElementById('rSalesProfit').textContent = formatDA(totalSalesProfit);
  document.getElementById('rSalesPaid').textContent = formatDA(totalSalesPaid);
  document.getElementById('rSalesDue').textContent = formatDA(totalSalesDue);
  document.getElementById('rReturnsCount').textContent = totalReturnsCount;
  document.getElementById('rReturnsQty').textContent = totalReturnsQty;
  document.getElementById('rReturnsValue').textContent = formatDA(totalReturnsValue);
  document.getElementById('rNetAmount').textContent = formatDA(netSales);
  document.getElementById('rReturnRate').textContent = returnRate.toFixed(1) + '%';
  document.getElementById('rProfitMargin').innerHTML = formatProfitMarginSplitCard(periodProfitMargin, periodProfitSplit);
  const pctEl = document.getElementById('rProfitMarginPct');
  if (pctEl) pctEl.textContent = profitMargin.toFixed(1) + '%';
  const totalMarginEl = document.getElementById('rTotalProfitMargin');
  if (totalMarginEl) totalMarginEl.innerHTML = formatProfitMarginSplitCard(totalProfitMargin, totalProfitSplit);

  // Top product
  const prodMap = {};
  const prodName = {};
  salesInvoices.forEach(inv => (inv.items || []).forEach(it => {
    const rid = it.productId || ('free:' + (it.name || ''));
    if (!prodMap[rid]) { prodMap[rid] = 0; prodName[rid] = it.name || ''; }
    prodMap[rid] += it.qty;
  }));
  const topProd = Object.entries(prodMap).sort((a, b) => b[1] - a[1])[0];
  document.getElementById('rTopProduct').textContent = topProd
    ? ((productMap[topProd[0]] && productMap[topProd[0]].name) || prodName[topProd[0]] || '—') : '—';

  // === CHARTS ===
  renderComparisonPie(totalSalesAmount, totalReturnsValue);
  renderComparisonBar(salesInvoices, filteredReturns, invoiceMap);
  renderSalesTrend(salesInvoices, range);
  renderReturnsTrend(filteredReturns);
  renderReturnsReasonPie(filteredReturns);

  // === TABLES ===
  renderBestSellers(salesInvoices, productMap);
  renderDailyBreakdown(salesInvoices, filteredReturns, invoiceMap, range);
}

// ===== COMPARISON PIE (Doughnut) =====
function renderComparisonPie(salesAmount, returnsValue) {
  const canvas = document.getElementById('comparisonPieChart');
  if (!canvas) return;
  destroyChart('comparisonPie');

  const centerEl = document.getElementById('comparisonPieCenter');
  const netVal = salesAmount - returnsValue;
  if (centerEl) {
    document.getElementById('pieNetValue').textContent = formatDA(netVal);
    centerEl.style.display = 'block';
  }

  if (salesAmount === 0 && returnsValue === 0) {
    canvas.parentNode.innerHTML = `<div class="placeholder-box" style="height:280px;display:flex;align-items:center;justify-content:center"><p style="color:var(--silver-500)">${t('common.noResults')}</p></div>`;
    return;
  }

  _rCharts.comparisonPie = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: [t('chart.sales'), t('chart.returns')],
      datasets: [{
        data: [salesAmount, returnsValue],
        backgroundColor: ['#0066B1', '#e65100'],
        borderWidth: 3,
        borderColor: 'white',
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 12 }, boxWidth: 14, padding: 16, usePointStyle: true } },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
              return ctx.label + ': ' + formatDA(ctx.parsed) + ' (' + pct + '%)';
            },
          },
        },
      },
    },
  });
}

// ===== COMPARISON BAR =====
function renderComparisonBar(salesInvoices, returns, invoiceMap) {
  const canvas = document.getElementById('comparisonBarChart');
  if (!canvas) return;
  destroyChart('comparisonBar');

  const dailySales = {};
  salesInvoices.forEach(inv => {
    const d = new Date(inv.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!dailySales[d]) dailySales[d] = 0;
    dailySales[d] += inv.totalAmount;
  });

  const dailyReturns = {};
  returns.forEach(r => {
    const d = new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!dailyReturns[d]) dailyReturns[d] = 0;
    const inv = invoiceMap[r.invoiceId];
    if (inv && inv.items) {
      const match = inv.items.find(it => it.productId === r.productId);
      if (match) dailyReturns[d] += (match.price || 0) * (r.qty || 0);
    }
  });

  const allDays = [...new Set([...Object.keys(dailySales), ...Object.keys(dailyReturns)])].sort();

  if (allDays.length === 0) {
    canvas.parentNode.innerHTML = `<div class="placeholder-box" style="height:280px;display:flex;align-items:center;justify-content:center"><p style="color:var(--silver-500)">${t('common.noResults')}</p></div>`;
    return;
  }

  _rCharts.comparisonBar = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: allDays,
      datasets: [
        { label: t('chart.sales'), data: allDays.map(d => dailySales[d] || 0), backgroundColor: 'rgba(0,102,177,0.8)', borderRadius: 4 },
        { label: t('chart.returns'), data: allDays.map(d => dailyReturns[d] || 0), backgroundColor: 'rgba(230,81,0,0.8)', borderRadius: 4 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, usePointStyle: true } } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45 } },
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { font: { size: 9 } } },
      },
    },
  });
}

// ===== SALES TREND (Line) =====
function renderSalesTrend(invoices, range) {
  const canvas = document.getElementById('salesTrendChart');
  if (!canvas) return;
  destroyChart('salesTrend');

  const dayKey = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const daily = {};
  const bucket = (ts) => {
    const d = dayKey(ts);
    if (!daily[d]) daily[d] = { sales: 0, profit: 0 };
    return daily[d];
  };
  // المبيعات = التحصيل الفعلي بتاريخه (دفعات فواتير + سندات قبض + دفع مباشر).
  DB.getCashInEvents().forEach(c => { if (inReportRange(c.ts, range)) bucket(c.ts).sales += c.amount; });
  // الربح = ربح الفاتورة كاملاً في يوم اكتمال سدادها.
  (invoices || []).forEach(inv => {
    if (inv.isProvisional) return;
    const ts = DB.getInvoiceCompletionTs(inv);
    if (ts) bucket(ts).profit += (inv.profit || 0);
  });

  const labels = Object.keys(daily).sort();
  if (labels.length === 0) {
    canvas.parentNode.innerHTML = `<div class="placeholder-box" style="height:250px;display:flex;align-items:center;justify-content:center"><p style="color:var(--silver-500)">${t('common.noResults')}</p></div>`;
    return;
  }

  _rCharts.salesTrend = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: t('chart.sales'), data: labels.map(l => daily[l].sales), borderColor: '#0066B1', backgroundColor: 'rgba(0,102,177,0.08)', fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#0066B1' },
        { label: t('reports.profit'), data: labels.map(l => daily[l].profit), borderColor: '#28a745', backgroundColor: 'rgba(40,167,69,0.08)', fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#28a745' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, usePointStyle: true } } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45 } },
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { font: { size: 9 } } },
      },
    },
  });
}

// ===== RETURNS TREND (Line) =====
function renderReturnsTrend(returns) {
  const canvas = document.getElementById('returnsTrendChart');
  if (!canvas) return;
  destroyChart('returnsTrend');

  const daily = {};
  returns.forEach(r => {
    const d = new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!daily[d]) daily[d] = 0;
    daily[d] += r.qty || 0;
  });

  const labels = Object.keys(daily).sort();
  if (labels.length === 0) {
    canvas.parentNode.innerHTML = `<div class="placeholder-box" style="height:250px;display:flex;align-items:center;justify-content:center"><p style="color:var(--silver-500)">${t('common.noResults')}</p></div>`;
    return;
  }

  _rCharts.returnsTrend = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: t('reports.returnsPieces'), data: labels.map(l => daily[l]),
        borderColor: '#e65100', backgroundColor: 'rgba(230,81,0,0.08)',
        fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#e65100',
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, usePointStyle: true } } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45 } },
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { font: { size: 9 }, precision: 0 } },
      },
    },
  });
}

// ===== CATEGORY PIE =====
function renderCategoryPie(invoices, productMap) {
  const canvas = document.getElementById('categoryPieChart');
  if (!canvas) return;
  destroyChart('categoryPie');

  const catMap = {};
  invoices.forEach(inv => (inv.items || []).forEach(item => {
    const prod = productMap[item.productId];
    const cat = prod ? (prod.category || 'أخرى') : 'أخرى';
    if (!catMap[cat]) catMap[cat] = 0;
    catMap[cat] += item.qty;
  }));

  const labels = Object.keys(catMap);
  const data = Object.values(catMap);
  const colors = ['#0066B1','#28a745','#e65100','#ffc107','#dc3545','#6f42c1','#20c997','#fd7e14','#6610f2','#d63384','#17a2b8','#343a40'];

  if (labels.length === 0) {
    canvas.parentNode.innerHTML = `<div class="placeholder-box" style="height:240px;display:flex;align-items:center;justify-content:center"><p style="color:var(--silver-500)">${t('common.noResults')}</p></div>`;
    return;
  }

  _rCharts.categoryPie = new Chart(canvas, {
    type: 'pie',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors.slice(0, labels.length), borderWidth: 2, borderColor: 'white' }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 12, padding: 10, usePointStyle: true } },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
              return ctx.label + ': ' + ctx.parsed + t('reports.pieces') + ' (' + pct + '%)';
            },
          },
        },
      },
    },
  });
}

// ===== RETURNS REASON PIE =====
function renderReturnsReasonPie(returns) {
  const canvas = document.getElementById('returnsReasonChart');
  if (!canvas) return;
  destroyChart('returnsReason');

  const reasonMap = {};
  returns.forEach(r => {
    const reason = r.reason || 'أخرى';
    if (!reasonMap[reason]) reasonMap[reason] = 0;
    reasonMap[reason] += r.qty || 0;
  });

  const labels = Object.keys(reasonMap);
  const data = Object.values(reasonMap);
  const colors = ['#e65100','#dc3545','#ffc107','#6f42c1','#20c997','#fd7e14','#0066B1','#6610f2','#d63384'];

  if (labels.length === 0) {
    canvas.parentNode.innerHTML = `<div class="placeholder-box" style="height:240px;display:flex;align-items:center;justify-content:center"><p style="color:var(--silver-500)">${t('common.noResults')}</p></div>`;
    return;
  }

  _rCharts.returnsReason = new Chart(canvas, {
    type: 'pie',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors.slice(0, labels.length), borderWidth: 2, borderColor: 'white' }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 12, padding: 10, usePointStyle: true } },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
              return ctx.label + ': ' + ctx.parsed + t('reports.pieces') + ' (' + pct + '%)';
            },
          },
        },
      },
    },
  });
}

// ===== BEST SELLERS TABLE =====
function renderBestSellers(invoices, productMap) {
  const container = document.getElementById('bestSellersBody');
  const prodMap = {};
  invoices.forEach(inv => (inv.items || []).forEach(item => {
    // An unlisted (F10) line has no product id, so every one of them would
    // collapse into a single "null" row. Group them by the name typed at the
    // till instead, and keep that name for the label.
    const rid = item.productId || ('free:' + (item.name || ''));
    if (!prodMap[rid]) prodMap[rid] = { qty: 0, total: 0, profit: 0, name: item.name || '', free: !item.productId };
    prodMap[rid].qty += item.qty;
    prodMap[rid].total += item.total;
    const prod = productMap[item.productId];
    const buyPrice = _reportLineCost(item, prod);
    prodMap[rid].profit += (item.price - buyPrice) * item.qty;
  }));

  const sorted = Object.entries(prodMap).sort((a, b) => b[1].qty - a[1].qty).slice(0, 20);

  if (sorted.length === 0) {
    container.innerHTML = `<tr><td colspan="6" class="empty-row"><i class="fas fa-box-open"></i> ${t('reports.noSales')}</td></tr>`;
    return;
  }

  container.innerHTML = sorted.map(([prodId, data], i) => {
    const prod = productMap[prodId];
    return '<tr>' +
      '<td>' + (i + 1) + '</td>' +
      '<td><strong>' + (prod ? escHtml(prod.name) : escHtml(data.name)) + (data.free ? ' <span class="sc-free-badge">' + t('sales.freeNoCost') + '</span>' : '') + '</strong></td>' +
      '<td dir="ltr">' + (prod ? escHtml(prod.barcode) : '-') + '</td>' +
      '<td>' + Unit.fmtQty(data.qty) + '</td>' +
      '<td>' + formatDA(data.total) + '</td>' +
      '<td style="color:#28a745">' + formatDA(data.profit) + '</td>' +
    '</tr>';
  }).join('');
}

// ===== DAILY BREAKDOWN TABLE =====
function renderDailyBreakdown(salesInvoices, returns, invoiceMap, range) {
  const container = document.getElementById('dailyBreakdownBody');
  const daily = {};
  const bucket = (ts) => {
    const d = new Date(ts).toLocaleDateString('ar-EG-u-nu-latn');
    if (!daily[d]) daily[d] = { invCount: 0, salesQty: 0, salesAmount: 0, returnCount: 0, returnQty: 0, returnValue: 0 };
    return daily[d];
  };

  salesInvoices.forEach(inv => {
    const b = bucket(inv.createdAt || inv.date || 0);
    b.invCount++;
    b.salesQty += inv.items.reduce((s, it) => s + it.qty, 0);
  });
  // عمود التحصيل يُسجَّل بتاريخ استلام المال فعلياً، لا تاريخ إصدار الفاتورة.
  DB.getCashInEvents().forEach(c => {
    if (inReportRange(c.ts, range)) bucket(c.ts).salesAmount += c.amount;
  });

  returns.forEach(r => {
    const b = bucket(r.createdAt || r.date || 0);
    b.returnCount++;
    b.returnQty += r.qty || 0;
    const inv = invoiceMap[r.invoiceId];
    if (inv && inv.items) {
      const match = inv.items.find(it => it.productId === r.productId);
      if (match) b.returnValue += (match.price || 0) * (r.qty || 0);
    }
  });

  const sorted = Object.entries(daily).sort((a, b) => new Date(b[0]) - new Date(a[0]));

  if (sorted.length === 0) {
    container.innerHTML = `<tr><td colspan="7" class="empty-row">${t('common.noResults')}</td></tr>`;
    return;
  }

  container.innerHTML = sorted.map(([date, d]) => {
    const net = d.salesAmount - d.returnValue;
    const netColor = net >= 0 ? '#28a745' : '#dc3545';
    return '<tr>' +
      '<td>' + date + '</td>' +
      '<td>' + d.invCount + '</td>' +
      '<td>' + d.salesQty + '</td>' +
      '<td>' + formatDA(d.salesAmount) + '</td>' +
      '<td>' + d.returnCount + '</td>' +
      '<td>' + d.returnQty + '</td>' +
      '<td style="color:' + netColor + ';font-weight:600">' + formatDA(net) + '</td>' +
    '</tr>';
  }).join('');
}

// ===== HELPERS =====
function destroyChart(name) {
  if (_rCharts[name]) { try { _rCharts[name].destroy(); } catch(e) {} _rCharts[name] = null; }
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function exportReportsPDF() {
  const range = getDateRange();
  const allInvoices = DB.getInvoices();
  const invoiceMap = {};
  for (const inv of allInvoices) invoiceMap[inv.id] = inv;

  const salesInv = filterByDate(allInvoices.filter(inv => inv.type === 'customer'), range);
  const ret = filterByDate(DB.getReturns(), range);
  const cashIn = DB.getCashInEvents().filter(c => inReportRange(c.ts, range));

  const totalSales = cashIn.reduce((s, c) => s + c.amount, 0);
  const totalProfit = filterByCompletion(allInvoices.filter(inv => inv.type === 'customer'), range)
    .reduce((s, inv) => s + (inv.profit || 0), 0);
  const totalReturns = ret.reduce((s, r) => s + (r.qty || 0), 0);

  const periodLabel = document.querySelector('.period-btn.active');
  let header = t('reports.reportTitle') + ' - ZMT PIECE\n';
  header += '='.repeat(50) + '\n';
  header += t('reports.periodLabel') + ' ' + (periodLabel ? periodLabel.textContent.trim() : _rPeriod) + '\n';
  header += '='.repeat(50) + '\n\n';
  header += t('reports.totalSales') + formatDA(totalSales) + '\n';
  header += t('reports.totalProfit') + formatDA(totalProfit) + '\n';
  header += t('reports.salesInvoiceCount') + salesInv.length + '\n';
  header += t('reports.returnsCount') + ret.length + ' (' + totalReturns + t('reports.pieces') + ')\n';
  header += t('reports.netSales') + formatDA(totalSales - ret.reduce((s, r) => {
    const inv = invoiceMap[r.invoiceId];
    if (inv && inv.items) {
      const match = inv.items.find(it => it.productId === r.productId);
      return s + ((match ? match.price : 0) * (r.qty || 0));
    }
    return s;
  }, 0)) + '\n\n';

  header += t('reports.dailyDetails') + '\n';
  header += '-'.repeat(40) + '\n';

  const dailySales = {};
  const dailyBucket = (ts) => {
    const d = new Date(ts).toLocaleDateString('ar-EG-u-nu-latn');
    if (!dailySales[d]) dailySales[d] = { count: 0, amount: 0 };
    return dailySales[d];
  };
  salesInv.forEach(inv => { dailyBucket(inv.createdAt || inv.date || 0).count++; });
  cashIn.forEach(c => { dailyBucket(c.ts).amount += c.amount; });

  Object.entries(dailySales).sort((a, b) => new Date(b[0]) - new Date(a[0])).slice(0, 50).forEach(([date, d]) => {
    header += date + ': ' + d.count + t('reports.invoicesWord') + ', ' + formatDA(d.amount) + '\n';
  });

  const blob = new Blob([header], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = t('reports.reportTitle').replace(/\s+/g, '_') + '_' + new Date().toISOString().slice(0, 10) + '.txt';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ===== LAN SYNC HANDLER =====
window._pageSyncHandlers = window._pageSyncHandlers || {};
window._pageSyncHandlers['reports'] = function reportsSyncData() {
  // Reports re-renders every section from the (preserved) date-range inputs, so
  // a single in-place call keeps numbers fresh without wiping the page state.
  renderReports();
};
