// ============================================================
// ZMT Branches Monitor - Main Store & Branch Monitoring
// ============================================================

let _bmBranches = [];
let _bmBranchData = {};
let _bmCurrentBranch = null;

// Active company scope. When a company is active, branches-monitor only shows
// records tagged with that company (companyId). Global/store-level (untagged)
// records are shown too. Returns '' when no company is active (unfiltered).
function _bmActiveCompanyId() {
  try {
    if (typeof Auth !== 'undefined' && Auth.getCompanyId) return (Auth.getCompanyId() || '');
  } catch (e) {}
  return '';
}

function _bmScopeRecords(records) {
  const cid = _bmActiveCompanyId();
  if (!cid || !Array.isArray(records)) return records;
  return records.filter(r => !r.companyId || r.companyId === cid);
}

// The codes of the branches explicitly attached to the ACTIVE company
// (storeCodes of DB.getCompany(activeCompanyId)). Empty array when no company
// is active → no company-based restriction on the store list. Read-only use:
// this only filters WHICH sibling/main stores appear for monitoring, the data
// pull itself remains gated by CloudService access rules.
function _bmCompanyStoreCodes() {
  try {
    const cid = _bmActiveCompanyId();
    if (!cid) return [];
    const c = (typeof DB !== 'undefined' && DB.getCompany) ? DB.getCompany(cid) : null;
    if (!c || !Array.isArray(c.storeCodes)) return [];
    return c.storeCodes.map(String);
  } catch (e) {
    return [];
  }
}

function _bmIsInActiveCompany(code) {
  const set = _bmCompanyStoreCodes();
  if (!set.length) return true; // no active company → unrestricted
  return set.indexOf(String(code)) !== -1;
}

function _bmActiveCompanyRestricts() {
  return _bmCompanyStoreCodes().length > 0;
}

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

    if (storeType === 'main') {
      // Main store: load its branches. When a company is active, only the
      // branches explicitly attached to it appear; otherwise all branches (legacy).
      const allBranches = await Auth.listBranchesFull(myCode);
      _bmBranches = allBranches.filter(b => _bmIsInActiveCompany(b.code));
    } else if (storeType === 'branch' && myCode) {
      const parent = Auth.getParentCode();
      if (!parent || !_bmActiveCompanyRestricts()) {
        // Standalone branch, or no company chosen → only own store (legacy).
        _bmBranches = [{ code: myCode, name: _bmOwnStoreName() }];
      } else {
        // Branch monitors the parent main store + the sibling branches explicitly
        // attached to the active company. Inventory only — transactions stay private.
        const branches = (await Auth.listBranchesFull(parent)) || [];
        _bmBranches = [
          { code: parent, name: 'المحل الرئيسي', type: 'main' },
          ...branches
            .filter(b => b.code !== myCode && _bmIsInActiveCompany(b.code))
            .map(b => ({ code: b.code, name: b.name, type: 'branch' })),
        ];
      }
    } else {
      _bmBranches = [];
    }

    _bmBranchData = {};
    let totalProducts = 0, totalSales = 0, totalRevenue = 0;

    const isMain = storeType === 'main';
    const isManager = Auth.isManager();

    // Load each store's data. The main store gets its full backup. A branch
    // viewing the parent or a sibling only gets the read-only inventory
    // (products) — invoices/payments/net stay private via _canAccessStore.
    const loadPromises = _bmBranches.map(async (b) => {
      try {
        if (isMain || b.code === myCode) {
          const backup = await CloudService.downloadStoreBackup(b.code);
          const data = backup?.data || {};
          const inner = typeof data.zmt_db === 'string' ? JSON.parse(data.zmt_db) : (data.zmt_db || {});
          const products = _bmScopeRecords(inner.products || []);
          const invoices = _bmScopeRecords(inner.invoices || []);
          const payments = _bmScopeRecords(Array.isArray(data.zmt_payments) ? data.zmt_payments : []);
          const sales = invoices.filter(i => i.type === 'sale' || i.type === 'customer');
          const salesTotal = sales.reduce((s, i) => s + (i.totalAmount || 0), 0);

          _bmBranchData[b.code] = { products, invoices, payments, sales, salesTotal, loaded: true };

          totalProducts += products.length;
          totalSales += sales.length;
          totalRevenue += salesTotal;
        } else {
          // A non-manager (branch) store: inventory-only view of the selected store.
          const raw = (await CloudService.downloadStoreInventory(b.code)) || [];
          const products = _bmScopeRecords(raw);
          _bmBranchData[b.code] = { products, invoices: [], payments: [], sales: [], salesTotal: 0, loaded: true };
          totalProducts += products.length;
        }
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
  // Financial tabs are only available when this store is being viewed with a
  // full backup: the main store over its branches, or a branch over ITSELF.
  // Branches viewing the parent store or a sibling only ever have inventory.
  const canViewFinance = isMain || code === Auth.getUserCode();

  // Hide financial tabs when not allowed (prevent spying)
  document.querySelector('.bm-tab[data-tab="invoices"]').style.display = canViewFinance ? '' : 'none';
  document.querySelector('.bm-tab[data-tab="purchases"]').style.display = canViewFinance ? '' : 'none';
  document.querySelector('.bm-tab[data-tab="net"]').style.display = canViewFinance ? '' : 'none';

  // Hide financial summary cards when not allowed
  const detSummaryCards = document.querySelectorAll('#bmDetailSummary .bm-summary-card');
  if (detSummaryCards.length >= 4) {
    detSummaryCards[1].style.display = canViewFinance ? '' : 'none';
    detSummaryCards[2].style.display = canViewFinance ? '' : 'none';
    detSummaryCards[3].style.display = canViewFinance ? '' : 'none';
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

  if (canViewFinance) {
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
  q = normSearch(q);
  const lowerQ = q.toLowerCase();
  const brands = (typeof BRANDS !== 'undefined') ? [...(BRANDS.global || []), ...(BRANDS.chinese || [])] : [];
  const myCode = Auth.getUserCode();
  const allResults = [];

  for (const [storeCode, d] of Object.entries(_bmBranchData)) {
    if (!d || !d.loaded || !d.products) continue;
    const storeName = storeCode === myCode
      ? _bmOwnStoreName()
      : (_bmBranches.find(b => b.code === storeCode)?.name || storeCode);

    for (const p of d.products) {
      const nameMatch = !lowerQ || (p.name || '').toLowerCase().includes(lowerQ);
      const barMatch = !q || (p.barcode || '').includes(q);
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
        <span><i class="fas fa-arrow-up" style="color:#1565c0;"></i> ${t('branchesMonitor.transferIncome')} (${fmtMoney(transferIncome)} DA)</span>
        <span style="color:#1565c0;font-weight:bold;">+${_formatNumber(transferIncome)} DA</span>
      </div>` : ''}
      <div class="bm-net-row">
        <span><i class="fas fa-arrow-down" style="color:#c62828;"></i> ${t('branchesMonitor.totalPurchases')} (${purchasesCount} فاتورة)</span>
        <span style="color:#c62828;font-weight:bold;">-${_formatNumber(totalPurchases)} DA</span>
      </div>
      ${transferCost > 0 ? `<div class="bm-net-row">
        <span><i class="fas fa-arrow-down" style="color:#e65100;"></i> ${t('branchesMonitor.transferCost')} (${fmtMoney(transferCost)} DA)</span>
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

// Display name for "my store": prefers the active company's store name (per-company,
// persists with its backup), otherwise the global store name.
function _bmOwnStoreName() {
  try {
    if (typeof DB !== 'undefined' && DB.getActiveCompanyStoreName) {
      const n = DB.getActiveCompanyStoreName();
      if (n) return n;
    }
  } catch (e) {}
  try {
    const local = localStorage.getItem('zmt_store_name') || '';
    if (local) return local;
  } catch (e) {}
  return 'محلك';
}

// ===== LAN SYNC HANDLER =====
window._pageSyncHandlers = window._pageSyncHandlers || {};
window._pageSyncHandlers['branches-monitor'] = function bmSyncData() {
  // Cloud-backed page: never rebuild it from a LAN op. Refresh only this
  // device's own inventory slice in memory, and re-render the local products
  // table when the user is viewing their own store on the inventory tab.
  const myCode = Auth.getUserCode();
  if (myCode && _bmBranchData[myCode]) {
    _bmBranchData[myCode].products = _bmScopeRecords(DB.getProducts());
  }
  if (_bmCurrentBranch && _bmCurrentBranch === myCode) {
    const d = _bmBranchData[myCode];
    if (d && d.loaded && document.getElementById('bmDetProducts')) {
      document.getElementById('bmDetProducts').textContent = d.products.length;
      const activeTab = document.querySelector('.bm-tab.active');
      if (activeTab && activeTab.getAttribute('data-tab') === 'inventory') {
        const el = document.getElementById('bmInventoryContent');
        if (el && el.isConnected) bmRenderInventory(d.products);
      }
    }
  }
};
