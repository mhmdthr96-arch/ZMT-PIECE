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

function filterByDate(items, range) {
  if (!items || items.length === 0) return [];
  return items.filter(item => {
    const t = item.createdAt || item.date || 0;
    if (range.from && t < range.from) return false;
    if (range.to && t > range.to) return false;
    return true;
  });
}

function getProfitMargin(invoices, productMap) {
  return invoices.reduce((s, inv) => {
    if (inv.isProvisional) return s;
    (inv.items || []).forEach(it => {
      const prod = productMap[it.productId];
      const buyPrice = prod ? (prod.buyPrice || 0) : 0;
      s += (it.price - buyPrice) * it.qty;
    });
    return s;
  }, 0);
}

function formatDA(v) {
  return 'DA' + (v || 0).toFixed(2);
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
}

function renderReports() {
  const range = getDateRange();

  // === RAW DATA ===
  const allInvoices = DB.getInvoices();
  const salesInvoices = filterByDate(allInvoices.filter(inv => inv.type === 'customer'), range);
  const allReturns = DB.getReturns();
  const filteredReturns = filterByDate(allReturns, range);
  const allPayments = DB.getPayments().filter(p => p.customerId);
  const filteredPayments = filterByDate(allPayments, range);

  // Build lookup maps for O(1) access
  const invoiceMap = {};
  for (const inv of allInvoices) invoiceMap[inv.id] = inv;
  const productMap = {};
  for (const p of DB.getProducts()) productMap[p.id] = p;

  // === SALES STATS (from invoice totals — real value of goods sold) ===
  const totalSalesAmount = salesInvoices.reduce((s, inv) => s + (inv.totalAmount || 0), 0);
  const totalSalesProfit = salesInvoices.reduce((s, inv) => s + (inv.profit || 0), 0);
  const totalSalesQty = salesInvoices.reduce((s, inv) => s + inv.items.reduce((si, it) => si + it.qty, 0), 0);
  const totalSalesPaid = filteredPayments.reduce((s, p) => s + p.amount, 0);
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

  // هامش الربح = (سعر البيع - سعر الشراء) لكل قطعة — للفترة + الإجمالي العام
  const totalProfitMargin = getProfitMargin(allInvoices.filter(inv => inv.type === 'customer'), productMap);
  const periodProfitMargin = getProfitMargin(salesInvoices, productMap);
  const profitMargin = totalSalesAmount > 0 ? (periodProfitMargin / totalSalesAmount * 100) : 0;

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
  document.getElementById('rProfitMargin').textContent = formatDA(periodProfitMargin);
  const pctEl = document.getElementById('rProfitMarginPct');
  if (pctEl) pctEl.textContent = profitMargin.toFixed(1) + '%';
  const totalMarginEl = document.getElementById('rTotalProfitMargin');
  if (totalMarginEl) totalMarginEl.textContent = formatDA(totalProfitMargin);

  // Top product
  const prodMap = {};
  salesInvoices.forEach(inv => (inv.items || []).forEach(it => {
    if (!prodMap[it.productId]) prodMap[it.productId] = 0;
    prodMap[it.productId] += it.qty;
  }));
  const topProd = Object.entries(prodMap).sort((a, b) => b[1] - a[1])[0];
  document.getElementById('rTopProduct').textContent = topProd ? (productMap[topProd[0]]?.name || '—') : '—';

  // === CHARTS ===
  renderComparisonPie(totalSalesAmount, totalReturnsValue);
  renderComparisonBar(salesInvoices, filteredReturns, invoiceMap);
  renderSalesTrend(salesInvoices);
  renderReturnsTrend(filteredReturns);
  renderCategoryPie(salesInvoices, productMap);
  renderReturnsReasonPie(filteredReturns);

  // === TABLES ===
  renderBestSellers(salesInvoices, productMap);
  renderDailyBreakdown(salesInvoices, filteredReturns, invoiceMap);
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
function renderSalesTrend(invoices) {
  const canvas = document.getElementById('salesTrendChart');
  if (!canvas) return;
  destroyChart('salesTrend');

  const daily = {};
  invoices.forEach(inv => {
    const d = new Date(inv.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!daily[d]) daily[d] = { sales: 0, profit: 0 };
    daily[d].sales += inv.totalAmount;
    daily[d].profit += inv.profit || 0;
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
    if (!prodMap[item.productId]) prodMap[item.productId] = { qty: 0, total: 0, profit: 0 };
    prodMap[item.productId].qty += item.qty;
    prodMap[item.productId].total += item.total;
    const prod = productMap[item.productId];
    const buyPrice = prod ? (prod.buyPrice || 0) : 0;
    prodMap[item.productId].profit += (item.price - buyPrice) * item.qty;
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
      '<td><strong>' + (prod ? escHtml(prod.name) : prodId) + '</strong></td>' +
      '<td dir="ltr">' + (prod ? escHtml(prod.barcode) : '-') + '</td>' +
      '<td>' + data.qty + '</td>' +
      '<td>' + formatDA(data.total) + '</td>' +
      '<td style="color:#28a745">' + formatDA(data.profit) + '</td>' +
    '</tr>';
  }).join('');
}

// ===== DAILY BREAKDOWN TABLE =====
function renderDailyBreakdown(salesInvoices, returns, invoiceMap) {
  const container = document.getElementById('dailyBreakdownBody');
  const daily = {};

  salesInvoices.forEach(inv => {
    const d = new Date(inv.createdAt).toLocaleDateString('ar-EG-u-nu-latn');
    if (!daily[d]) daily[d] = { invCount: 0, salesQty: 0, salesAmount: 0, returnCount: 0, returnQty: 0, returnValue: 0 };
    daily[d].invCount++;
    daily[d].salesQty += inv.items.reduce((s, it) => s + it.qty, 0);
    daily[d].salesAmount += inv.totalAmount;
  });

  returns.forEach(r => {
    const d = new Date(r.createdAt).toLocaleDateString('ar-EG-u-nu-latn');
    if (!daily[d]) daily[d] = { invCount: 0, salesQty: 0, salesAmount: 0, returnCount: 0, returnQty: 0, returnValue: 0 };
    daily[d].returnCount++;
    daily[d].returnQty += r.qty || 0;
    const inv = invoiceMap[r.invoiceId];
    if (inv && inv.items) {
      const match = inv.items.find(it => it.productId === r.productId);
      if (match) daily[d].returnValue += (match.price || 0) * (r.qty || 0);
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
  const payments = filterByDate(DB.getPayments().filter(p => p.customerId), range);

  const totalSales = payments.reduce((s, p) => s + p.amount, 0);
  const totalProfit = salesInv.reduce((s, inv) => s + (inv.profit || 0), 0);
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
  salesInv.forEach(inv => {
    const d = new Date(inv.createdAt).toLocaleDateString('ar-EG-u-nu-latn');
    if (!dailySales[d]) dailySales[d] = { count: 0, amount: 0 };
    dailySales[d].count++;
    dailySales[d].amount += inv.totalAmount;
  });

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