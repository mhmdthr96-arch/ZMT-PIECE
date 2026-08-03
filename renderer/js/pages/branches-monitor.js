// ============================================================
// ZMT Branches Monitor - Main Store & Branch Monitoring
// ============================================================

let _bmBranches = [];
let _bmBranchData = {};
let _bmCurrentBranch = null;

function init_branches_monitor() {
  bmLoadBranches();
}

async function bmLoadBranches() {
  const list = document.getElementById('bmBranchesList');
  const empty = document.getElementById('bmBranchesEmpty');
  list.innerHTML = '<p class="text-muted"><i class="fas fa-spinner fa-spin"></i> ' + t('branchesMonitor.loading') + '</p>';
  empty.style.display = 'none';

  try {
    const storeType = Auth.getStoreType();
    const myCode = Auth.getUserCode();
    const parentCode = Auth.getParentCode();

    if (storeType === 'main') {
      // Main store: load its branches
      _bmBranches = await Auth.listBranchesFull(myCode);
    } else if (storeType === 'branch' && parentCode) {
      // Branch: load main store + sibling branches
      const mainInfo = { code: parentCode, name: 'المحل الرئيسي' };
      _bmBranches = [mainInfo];
      try {
        const siblings = await Auth.listBranchesFull(parentCode);
        for (const b of siblings) {
          if (b.code !== myCode) {
            _bmBranches.push(b);
          }
        }
      } catch (e) {
        console.warn('[Monitor] Could not list sibling branches:', e);
      }
    } else {
      _bmBranches = [];
    }

    _bmBranchData = {};
    let totalProducts = 0, totalSales = 0, totalRevenue = 0;

    const isMain = storeType === 'main';
    const isManager = Auth.isManager();

    // Load each store's backup (other stores only, NOT own store)
    const loadPromises = _bmBranches.map(async (b) => {
      try {
        const backup = await CloudService.downloadStoreBackup(b.code);
        const data = backup?.data || {};
        const db = typeof data.zmt_db === 'string' ? JSON.parse(data.zmt_db) : (data.zmt_db || {});
        const products = db.products || [];
        const invoices = db.invoices || [];
        const payments = Array.isArray(data.zmt_payments) ? data.zmt_payments : [];
        const sales = invoices.filter(i => i.type === 'sale' || i.type === 'customer');
        const salesTotal = sales.reduce((s, i) => s + (i.totalAmount || 0), 0);

        _bmBranchData[b.code] = { products, invoices, payments, sales, salesTotal, loaded: true };

        totalProducts += products.length;
        totalSales += sales.length;
        totalRevenue += salesTotal;
      } catch {
        _bmBranchData[b.code] = { products: [], invoices: [], payments: [], sales: [], salesTotal: 0, loaded: false };
      }
    });

    await Promise.all(loadPromises);

    document.getElementById('bmTotalBranches').textContent = _bmBranches.length;
    document.getElementById('bmTotalProducts').textContent = totalProducts;
    document.getElementById('bmTotalSales').textContent = totalSales;
    document.getElementById('bmTotalRevenue').textContent = _formatNumber(totalRevenue) + ' DA';

    // Hide sales/revenue summary cards for non-managers (sub-users & branches)
    const summaryCards = document.querySelectorAll('#bmSummary .bm-summary-card');
    if (summaryCards.length >= 4) {
      summaryCards[2].style.display = isManager ? '' : 'none';
      summaryCards[3].style.display = isManager ? '' : 'none';
    }

    if (_bmBranches.length === 0) {
      list.innerHTML = '';
      empty.style.display = '';
      return;
    }

    list.innerHTML = _bmBranches.map(b => {
      const d = _bmBranchData[b.code] || {};
      const statusClass = d.loaded ? 'bm-branch-online' : 'bm-branch-offline';
      const statusText = d.loaded ? t('branchesMonitor.online') : t('branchesMonitor.offline');
      const pCount = (d.products || []).length;
      const sCount = (d.sales || []).length;
      const sTotal = _formatNumber(d.salesTotal || 0);

      return `
        <div class="bm-branch-card" onclick="bmShowBranchDetail('${b.code}', '${_escHtml(b.name)}')">
          <div class="bm-branch-header">
            <div class="bm-branch-icon"><i class="fas fa-store"></i></div>
            <div class="bm-branch-info">
              <div class="bm-branch-name">${_escHtml(b.name)}</div>
              <div class="bm-branch-code" dir="ltr">${b.code}</div>
            </div>
            <span class="bm-branch-status ${statusClass}">${statusText}</span>
          </div>
          <div class="bm-branch-stats">
            <div class="bm-stat"><i class="fas fa-boxes"></i> ${pCount} ${t('branchesMonitor.productCount')}</div>
            ${isManager ? `<div class="bm-stat"><i class="fas fa-shopping-cart"></i> ${sCount} ${t('branchesMonitor.saleCount')}</div>
            <div class="bm-stat"><i class="fas fa-coins"></i> ${sTotal} DA</div>` : ''}
          </div>
          <div class="bm-branch-action">
            <button class="btn btn-primary btn-sm"><i class="fas fa-eye"></i> ${t('branchesMonitor.viewDetails')}</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    list.innerHTML = `<div class="conn-empty-state"><p class="text-danger">خطأ: ${e.message}</p></div>`;
  }
}

async function bmShowBranchDetail(code, name) {
  _bmCurrentBranch = code;
  document.getElementById('bmListView').style.display = 'none';
  document.getElementById('bmDetailView').style.display = '';
  document.getElementById('bmDetailName').textContent = name;
  document.getElementById('bmDetailCode').textContent = code;

  const storeType = Auth.getStoreType();
  const isMain = storeType === 'main';
  const isManager = Auth.isManager();

  // Hide financial tabs for non-managers (prevent spying)
  document.querySelector('.bm-tab[data-tab="invoices"]').style.display = isManager ? '' : 'none';
  document.querySelector('.bm-tab[data-tab="purchases"]').style.display = isManager ? '' : 'none';
  document.querySelector('.bm-tab[data-tab="net"]').style.display = isManager ? '' : 'none';

  // Hide financial summary cards for non-managers
  const detSummaryCards = document.querySelectorAll('#bmDetailSummary .bm-summary-card');
  if (detSummaryCards.length >= 4) {
    detSummaryCards[1].style.display = isManager ? '' : 'none';
    detSummaryCards[2].style.display = isManager ? '' : 'none';
    detSummaryCards[3].style.display = isManager ? '' : 'none';
  }

  const d = _bmBranchData[code];
  if (!d || !d.loaded) {
    document.getElementById('bmDetProducts').textContent = '0';
    document.getElementById('bmDetInvoices').textContent = '0';
    document.getElementById('bmDetSales').textContent = '0';
    document.getElementById('bmDetNet').textContent = '0 DA';
    document.getElementById('bmInventoryContent').innerHTML = `<p class="text-muted">${t('branchesMonitor.noData')}</p>`;
    document.getElementById('bmInvoicesContent').innerHTML = `<p class="text-muted">${t('branchesMonitor.noData')}</p>`;
    document.getElementById('bmPurchasesContent').innerHTML = `<p class="text-muted">${t('branchesMonitor.noData')}</p>`;
    document.getElementById('bmNetContent').innerHTML = `<p class="text-muted">${t('branchesMonitor.noData')}</p>`;
    return;
  }

  const purchases = d.invoices.filter(i => i.type === 'purchase' || i.type === 'supplier' || i.type === 'transfer_receive');
  const totalInvoices = d.invoices.length;
  const totalPurchasesAmount = purchases.reduce((s, i) => s + (i.totalAmount || 0), 0);
  const salesAmount = (d.salesTotal || 0);

  const transferPayments = (d.payments || []).filter(p => !p.isProvisional && p.type === 'transfer_payment');
  const transferIncome = transferPayments.reduce((s, p) => s + (p.amount || 0), 0);

  const transferInvoices = d.invoices.filter(i => i.type === 'transfer');
  const transferCost = transferInvoices.reduce((s, i) => s + (i.totalAmount || 0), 0);

  const netAccount = salesAmount + transferIncome - totalPurchasesAmount - transferCost;

  document.getElementById('bmDetProducts').textContent = d.products.length;

  bmRenderInventory(d.products);

  if (isManager) {
    document.getElementById('bmDetInvoices').textContent = totalInvoices;
    document.getElementById('bmDetSales').textContent = d.sales.length;
    document.getElementById('bmDetNet').textContent = _formatNumber(netAccount) + ' DA';
    bmRenderInvoices(d.sales, 'bmInvoicesContent');
    bmRenderInvoices(purchases, 'bmPurchasesContent');
    bmRenderNetAccount(d.sales, purchases, transferIncome, transferCost, netAccount);
  } else {
    document.getElementById('bmDetInvoices').textContent = '-';
    document.getElementById('bmDetSales').textContent = '-';
    document.getElementById('bmDetNet').textContent = '-';
    document.getElementById('bmInvoicesContent').innerHTML = `<p class="text-muted">${t('branchesMonitor.notAvailable')}</p>`;
    document.getElementById('bmPurchasesContent').innerHTML = `<p class="text-muted">${t('branchesMonitor.notAvailable')}</p>`;
    document.getElementById('bmNetContent').innerHTML = `<p class="text-muted">${t('branchesMonitor.notAvailable')}</p>`;
  }

  bmShowTab('inventory');
}

function bmBackToList() {
  _bmCurrentBranch = null;
  document.getElementById('bmListView').style.display = '';
  document.getElementById('bmDetailView').style.display = 'none';
}

function bmShowTab(tab) {
  document.querySelectorAll('.bm-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.bm-tab[data-tab="${tab}"]`).classList.add('active');

  document.getElementById('bmTabInventory').style.display = 'none';
  document.getElementById('bmTabInvoices').style.display = 'none';
  document.getElementById('bmTabPurchases').style.display = 'none';
  document.getElementById('bmTabNet').style.display = 'none';

  const map = {
    inventory: 'bmTabInventory',
    invoices: 'bmTabInvoices',
    purchases: 'bmTabPurchases',
    net: 'bmTabNet',
  };
  document.getElementById(map[tab]).style.display = '';
}

// ===== CROSS-STORE PRODUCT SEARCH =====

function bmSearchProduct(q) {
  const resultsEl = document.getElementById('bmSearchResults');
  if (!q || q.length < 1) {
    resultsEl.innerHTML = '';
    resultsEl.style.display = 'none';
    return;
  }

  const lowerQ = q.toLowerCase();
  const brands = (typeof BRANDS !== 'undefined') ? [...(BRANDS.global || []), ...(BRANDS.chinese || [])] : [];
  const myCode = Auth.getUserCode();
  const allResults = [];

  for (const [storeCode, d] of Object.entries(_bmBranchData)) {
    if (!d || !d.loaded || !d.products) continue;
    const storeName = storeCode === myCode
      ? (localStorage.getItem('zmt_store_name') || 'محلك')
      : (_bmBranches.find(b => b.code === storeCode)?.name || storeCode);

    for (const p of d.products) {
      const nameMatch = (p.name || '').toLowerCase().includes(lowerQ);
      const barMatch = (p.barcode || '').includes(q);
      if (nameMatch || barMatch) {
        allResults.push({ ...p, storeCode, storeName, isOwn: d.isOwn });
      }
    }
  }

  if (allResults.length === 0) {
    resultsEl.innerHTML = `<div class="search-result-item disabled">${t('branchesMonitor.noSearchResults')}</div>`;
    resultsEl.style.display = '';
    return;
  }

  resultsEl.innerHTML = allResults.slice(0, 30).map(p => {
    const brand = brands.find(b => b.id === p.brandId);
    const outOfStock = p.quantity <= 0;
    const storeBadge = p.isOwn
      ? '<span style="background:#e3f2fd;color:#1565c0;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">محلك</span>'
      : `<span style="background:#f3e5f5;color:#7b1fa2;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">${_escHtml(p.storeName)}</span>`;
    return `<div class="search-result-item" style="display:flex;justify-content:space-between;align-items:center;${outOfStock ? 'opacity:0.5' : ''}">
      <div>
        <strong>${_escHtml(p.name)}</strong>
        <div style="display:flex;gap:6px;align-items:center;margin-top:2px">
          <span class="text-muted" dir="ltr" style="font-size:11px">${p.barcode}</span>
          ${brand ? `<span style="font-size:11px;color:#666">${brand.name}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        ${storeBadge}
        <span style="font-size:12px;font-weight:700;${outOfStock ? 'color:#c62828' : 'color:#2e7d32'}">
          ${outOfStock ? `<i class="fas fa-times-circle"></i> ${t('branchesMonitor.outOfStock')}` : `<i class="fas fa-check-circle"></i> ${p.quantity}`}
        </span>
        <span style="font-size:11px;color:#666">DA${_formatNumber(p.sellPrice || 0)}</span>
      </div>
    </div>`;
  }).join('');
  resultsEl.style.display = '';
}

function bmRenderInventory(products) {
  const el = document.getElementById('bmInventoryContent');
  if (!products || products.length === 0) {
    el.innerHTML = `<p class="text-muted">${t('branchesMonitor.noInventory')}</p>`;
    return;
  }

  const brands = (typeof BRANDS !== 'undefined') ? [...(BRANDS.global || []), ...(BRANDS.chinese || [])] : [];

  el.innerHTML = `
    <div style="margin-bottom:12px;font-size:13px;color:#666;">${t('branchesMonitor.productsLabel')} <strong>${products.length}</strong></div>
    <table class="data-table">
      <thead>
        <tr>
          <th>#</th>
          <th>المنتج</th>
          <th>الباركود</th>
          <th>العلامة</th>
          <th>الفئة</th>
          <th>الكمية</th>
          <th>الحالة</th>
          <th>بيع</th>
        </tr>
      </thead>
      <tbody>
        ${products.map((p, i) => {
          const brand = brands.find(b => b.id === p.brandId);
          const outOfStock = p.quantity <= 0;
          return `<tr style="${outOfStock ? 'background:#fff5f5;opacity:0.6' : ''}">
            <td>${i + 1}</td>
            <td>${_escHtml(p.name || '-')}</td>
            <td dir="ltr">${p.barcode || '-'}</td>
            <td>${brand ? brand.name : (p.brandId || '-')}</td>
            <td>${p.category || '-'}</td>
            <td><strong style="color:${outOfStock ? '#c62828' : '#333'}">${p.quantity || 0}</strong></td>
            <td>${outOfStock
              ? `<span style="color:#c62828;font-weight:700;font-size:11px"><i class="fas fa-times-circle"></i> ${t('branchesMonitor.outOfStock')}</span>`
              : `<span style="color:#388e3c;font-size:11px"><i class="fas fa-check-circle"></i> ${t('branchesMonitor.inStock')}</span>`
            }</td>
            <td>${_formatNumber(p.sellPrice || 0)} DA</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

function bmRenderInvoices(invoices, elementId) {
  const el = document.getElementById(elementId);
  if (!invoices || invoices.length === 0) {
    el.innerHTML = `<p class="text-muted">${t('branchesMonitor.noInvoices')}</p>`;
    return;
  }

  el.innerHTML = `
    <div style="margin-bottom:12px;font-size:13px;color:#666;">${t('branchesMonitor.invoicesLabel')} <strong>${invoices.length}</strong></div>
    <table class="data-table">
      <thead>
        <tr>
          <th>#</th>
          <th>رقم الفاتورة</th>
          <th>التاريخ</th>
          <th>عدد الأصناف</th>
          <th>المبلغ</th>
          <th>الحالة</th>
        </tr>
      </thead>
      <tbody>
        ${invoices.map((inv, i) => {
          const date = new Date(inv.date || inv.createdAt).toLocaleDateString('ar-EG-u-nu-latn');
          const itemQty = (inv.items || []).reduce((s, it) => s + (it.qty || 0), 0);
          const status = inv.isProvisional ? `<span style="color:#f57c00;">${t('branchesMonitor.provisional')}</span>` : `<span style="color:#388e3c;">${t('branchesMonitor.sold')}</span>`;
          return `<tr>
            <td>${i + 1}</td>
            <td dir="ltr">${inv.invoiceNumber || '-'}</td>
            <td>${date}</td>
            <td>${itemQty}</td>
            <td><strong>${_formatNumber(inv.totalAmount || 0)} DA</strong></td>
            <td>${status}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

function bmRenderNetAccount(sales, purchases, transferIncome, transferCost, netAccount) {
  const el = document.getElementById('bmNetContent');
  const totalSales = (sales || []).reduce((s, i) => s + (i.totalAmount || 0), 0);
  const totalPurchases = (purchases || []).reduce((s, i) => s + (i.totalAmount || 0), 0);
  const salesCount = (sales || []).length;
  const purchasesCount = (purchases || []).length;

  el.innerHTML = `
    <div class="bm-net-account">
      <div class="bm-net-row bm-net-header">
        <span>البيان</span>
        <span>المبلغ</span>
      </div>
      <div class="bm-net-row">
        <span><i class="fas fa-arrow-up" style="color:#388e3c;"></i> ${t('branchesMonitor.totalSales')} (${salesCount} فاتورة)</span>
        <span style="color:#388e3c;font-weight:bold;">+${_formatNumber(totalSales)} DA</span>
      </div>
      ${transferIncome > 0 ? `<div class="bm-net-row">
        <span><i class="fas fa-arrow-up" style="color:#1565c0;"></i> ${t('branchesMonitor.transferIncome')} (${(transferIncome || 0).toFixed(0)} DA)</span>
        <span style="color:#1565c0;font-weight:bold;">+${_formatNumber(transferIncome)} DA</span>
      </div>` : ''}
      <div class="bm-net-row">
        <span><i class="fas fa-arrow-down" style="color:#c62828;"></i> ${t('branchesMonitor.totalPurchases')} (${purchasesCount} فاتورة)</span>
        <span style="color:#c62828;font-weight:bold;">-${_formatNumber(totalPurchases)} DA</span>
      </div>
      ${transferCost > 0 ? `<div class="bm-net-row">
        <span><i class="fas fa-arrow-down" style="color:#e65100;"></i> ${t('branchesMonitor.transferCost')} (${(transferCost || 0).toFixed(0)} DA)</span>
        <span style="color:#e65100;font-weight:bold;">-${_formatNumber(transferCost)} DA</span>
      </div>` : ''}
      <div class="bm-net-row bm-net-total">
        <span><i class="fas fa-balance-scale"></i> ${t('branchesMonitor.netAccount')}</span>
        <span style="color:${netAccount >= 0 ? '#388e3c' : '#c62828'};font-weight:bold;font-size:18px;">
          ${netAccount >= 0 ? '+' : ''}${_formatNumber(netAccount)} DA
        </span>
      </div>
    </div>
  `;
}

function bmRefresh() {
  bmLoadBranches();
}

function _formatNumber(n) {
  return Number(n).toLocaleString('ar-EG-u-nu-latn', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function _escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
