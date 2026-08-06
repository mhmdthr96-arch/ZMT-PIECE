if (typeof salesChart !== 'undefined') { try { salesChart.destroy(); } catch(e) {} }
if (typeof profitChart !== 'undefined') { try { profitChart.destroy(); } catch(e) {} }
var salesChart = null;
var profitChart = null;

function init_dashboard() {
  updateDashboardStats();
  const sel = document.getElementById('monthSelect');
  if (sel) {
    renderChart(parseInt(sel.value));
    const clone = sel.cloneNode(true);
    sel.parentNode.replaceChild(clone, clone);
    clone.addEventListener('change', () => renderChart(parseInt(clone.value)));
  }
  renderLowStockAlert();
  renderProfitChart();
}

function updateDashboardStats() {
  const products = DB.getProducts();
  const invoices = DB.getInvoices();
  const customers = DB.getCustomers();
  const payments = DB.getPayments();

  const totalItems = products.reduce((sum, p) => sum + (p.quantity || 0), 0);
  const totalProducts = products.length;
  const totalCustomers = customers.length;

  const totalSales = payments
    .filter(p => p.customerId)
    .reduce((s, p) => s + p.amount, 0);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthInvoices = invoices.filter(inv => inv.type === 'customer' && inv.createdAt >= monthStart);
  const thisMonthTotal = monthInvoices.reduce((s, inv) => s + inv.totalAmount, 0);

  document.getElementById('statInventory').textContent = totalItems.toLocaleString();
  document.getElementById('statInvoices').textContent = monthInvoices.length;
  document.getElementById('statCustomers').textContent = totalCustomers;
  document.getElementById('statSales').textContent = `DA${totalSales.toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

  document.getElementById('dashLowStock').textContent = products.filter(p => p.quantity > 0 && p.quantity <= 5).length;
  document.getElementById('dashMonthSales').textContent = `DA${thisMonthTotal.toFixed(2)}`;
  document.getElementById('dashProfit').textContent = `DA${invoices.filter(i => i.type === 'customer' && DB.getInvoicePaidAmount(i.id) >= (i.totalAmount || 0)).reduce((s, i) => s + (i.profit || 0), 0).toFixed(2)}`;
}

function generateRealData(months) {
  const invoices = DB.getInvoices();
  const payments = DB.getPayments().filter(p => p.customerId);
  const returns = DB.getReturns();
  const products = DB.getProducts();
  const now = new Date();
  const data = [];

  for (let i = months - 1; i >= 0; i--) {
    const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0, 23, 59, 59);
    const mStart = m.getTime();
    const mEndTs = mEnd.getTime();
    const label = m.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

    const monthPayments = payments.filter(p => p.createdAt >= mStart && p.createdAt <= mEndTs);
    const sales = monthPayments.reduce((s, p) => s + p.amount, 0);

    const inventory = products.reduce((sum, p) => sum + (p.quantity || 0), 0);

    const monthReturns = returns.filter(r => r.createdAt >= mStart && r.createdAt <= mEndTs);
    const returnQty = monthReturns.reduce((s, r) => s + (r.qty || 0), 0);

    const monthProfit = invoices
      .filter(inv => inv.type === 'customer' && inv.createdAt >= mStart && inv.createdAt <= mEndTs && DB.getInvoicePaidAmount(inv.id) >= (inv.totalAmount || 0))
      .reduce((s, inv) => s + (inv.profit || 0), 0);

    data.push({ label, sales, inventory, returns: returnQty, profit: monthProfit });
  }
  return data;
}

function getSalesLabel() { return window.t ? window.t('chart.sales') : 'Sales'; }
function getInventoryLabel() { return window.t ? window.t('chart.inventory') : 'Inventory'; }
function getReturnsLabel() { return window.t ? window.t('chart.returns') : 'Returns'; }

function getChartConfig(data) {
  const labels = data.map(d => d.label);
  return {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: getSalesLabel(),
          data: data.map(d => d.sales),
          backgroundColor: 'rgba(0,102,177,0.75)',
          borderColor: '#0066B1',
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: getInventoryLabel(),
          data: data.map(d => d.inventory),
          backgroundColor: 'rgba(0,64,128,0.75)',
          borderColor: '#004080',
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: getReturnsLabel(),
          data: data.map(d => d.returns),
          backgroundColor: 'rgba(192,57,43,0.65)',
          borderColor: '#c0392b',
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { size: 11 }, boxWidth: 12, padding: 16 },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { font: { size: 10 } } },
      },
    },
  };
}

function renderChart(months) {
  const canvas = document.getElementById('salesChart');
  if (!canvas) return;
  const data = generateRealData(months);
  const config = getChartConfig(data);
  if (salesChart) salesChart.destroy();
  salesChart = new Chart(canvas, config);
}

function renderProfitChart() {
  const canvas = document.getElementById('profitChart');
  if (!canvas) return;
  const data = generateRealData(3);
  if (profitChart) profitChart.destroy();

  const totalProfit = data.reduce((s, d) => s + d.profit, 0);
  const totalSales = data.reduce((s, d) => s + d.sales, 0);
  const cost = totalSales - totalProfit;

  profitChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: [t('dash.netProfit'), t('dash.cost')],
      datasets: [{
        data: [totalProfit, cost],
        backgroundColor: ['rgba(40,167,69,0.8)', 'rgba(108,117,125,0.5)'],
        borderColor: ['#28a745', '#6c757d'],
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { size: 11 }, boxWidth: 12, padding: 16 },
        },
      },
    },
  });
}

function renderLowStockAlert() {
  const threshold = DB.getLowStockThreshold();
  const low = DB.getLowStockProducts(threshold);
  const container = document.getElementById('lowStockAlert');
  if (!container) return;
  if (low.length === 0) { container.style.display = 'none'; return; }
  container.style.display = '';
  container.innerHTML = `
    <div class="low-stock-header">
      <i class="fas fa-exclamation-triangle"></i>
      <span>${low.length} ${t('dash.lowStockItems')}(${threshold})</span>
      <button class="btn btn-sm" onclick="document.getElementById('lowStockAlert').style.display='none'" style="background:transparent;color:white;padding:2px 8px"><i class="fas fa-times"></i></button>
    </div>
    <div class="low-stock-list">
      ${low.slice(0, 10).map(p => `
        <span class="low-stock-item"><strong>${p.name}</strong> (${p.quantity})</span>
      `).join('')}
      ${low.length > 10 ? `<span class="low-stock-item">${t('dash.andMore')} ${low.length - 10} ${t('dash.moreItems')}</span>` : ''}
    </div>`;
}

window.renderChart = renderChart;
