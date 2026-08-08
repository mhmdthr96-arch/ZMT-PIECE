// ============================================================
// ZMT Orders - Order missing parts from suppliers
// ============================================================

let _ordRange = 'all';
let _ordTab = 'mine';
let _ordOrdersCache = [];

function init_orders() {
  const isMain = typeof Auth !== 'undefined' && Auth.getStoreType() === 'main';
  document.getElementById('ordTabBranches').style.display = isMain ? '' : 'none';
  if (!isMain) {
    _ordTab = 'mine';
    document.getElementById('ordPaneBranches').style.display = 'none';
    document.getElementById('ordPaneMine').style.display = '';
  }
  _ordOrdersCache = (typeof DB !== 'undefined' && DB.getOrders) ? DB.getOrders() : [];
  renderOrdersSuggestions();
  renderOrdersList();
  updateOrdersBadge();
}

// ===== PRODUCT GROUPS (name + barcode) =====

function _ordGroups() {
  const map = new Map();
  const groups = [];
  for (const p of (DB.getProducts() || [])) {
    const key = (p.name || '') + '\u0001' + (p.barcode || '');
    let g = map.get(key);
    if (!g) {
      g = { key, name: p.name, barcode: p.barcode, records: [] };
      map.set(key, g);
      groups.push(g);
    }
    g.records.push(p);
  }
  return groups.map(g => ({
    key: g.key, name: g.name, barcode: g.barcode,
    qty: g.records.reduce((s, r) => s + (r.quantity || 0), 0),
    sellPrice: g.records[0] ? (g.records[0].sellPrice || 0) : 0,
  }));
}

// ===== SUGGESTIONS =====

function renderOrdersSuggestions() {
  const el = document.getElementById('ordersSuggestions');
  const threshold = DB.getLowStockThreshold();
  const low = _ordGroups()
    .filter(g => g.qty <= threshold)
    .sort((a, b) => a.qty - b.qty)
    .slice(0, 20);

  if (low.length === 0) {
    el.innerHTML = `<div class="ord-empty ord-empty-ok"><i class="fas fa-check-circle"></i> ${t('orders.noSuggestions')}</div>`;
    return;
  }

  el.innerHTML = low.map((g, i) => `
    <div class="ord-suggestion-card">
      <div class="ord-suggestion-info">
        <div class="ord-suggestion-name">${escHtml(g.name)}</div>
        <div class="ord-suggestion-meta" dir="ltr">${escHtml(g.barcode)}</div>
      </div>
      <span class="ord-suggestion-qty ${g.qty <= 0 ? 'ord-qty-oos' : 'ord-qty-low'}">${g.qty <= 0 ? t('orders.statusNotAvailable') : g.qty}</span>
      <input type="number" class="form-input no-spinner ord-qty-input" id="ordsugqty_${i}" value="${Math.max(1, threshold)}" min="1">
      <button class="btn btn-sm btn-primary" onclick="addOrdersProduct('${escHtml(g.barcode).replace(/'/g, "\\'")}', document.getElementById('ordsugqty_${i}').value)"><i class="fas fa-plus"></i> ${t('orders.tabMine')}</button>
    </div>`).join('');
}

function addOrdersProduct(barcode, qtyRaw) {
  const qty = parseInt(qtyRaw) || 1;
  const p = (DB.getProducts() || []).find(x => x.barcode === barcode);
  if (!p) { alert(t('common.error')); return; }
  DB.addOrder({ barcode, productName: p.name, unitPrice: p.sellPrice || 0, qty, status: 'pending' });
  _ordOrdersCache = DB.getOrders();
  renderOrdersList();
  updateOrdersBadge();
  if (typeof window.notifyWebPush === 'function') {
    window.notifyWebPush('order', { productName: p.name, qty: qty, unitPrice: p.sellPrice || 0 });
  }
}

// ===== MY ORDERS =====

function setOrdersRange(range) {
  _ordRange = range;
  document.querySelectorAll('#ordersFilters .ord-filter').forEach(b => b.classList.toggle('ord-filter-active', b.dataset.range === range));
  renderOrdersList();
}

function _ordInRange(ts) {
  if (_ordRange === 'all') return true;
  const now = new Date();
  if (_ordRange === 'today') return ts >= new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (_ordRange === 'week') { const d = new Date(now); d.setDate(d.getDate() - 7); return ts >= d.getTime(); }
  if (_ordRange === 'month') return ts >= new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  if (_ordRange === 'year') return ts >= new Date(now.getFullYear(), 0, 1).getTime();
  return true;
}

function renderOrdersList() {
  const el = document.getElementById('ordersList');
  const query = (document.getElementById('ordersSearch').value || '').trim().toLowerCase();

  if (query) {
    const matches = _ordGroups().filter(g =>
      (g.name || '').toLowerCase().includes(query) ||
      (g.barcode || '').toLowerCase().includes(query)
    ).slice(0, 30);
    if (matches.length === 0) {
      el.innerHTML = `<div class="ord-empty"><i class="fas fa-search"></i> ${t('orders.noSuggestions')}</div>`;
      return;
    }
    el.innerHTML = matches.map((g, i) => `
      <div class="ord-card ord-card-search">
        <div class="ord-card-info">
          <div class="ord-card-name">${escHtml(g.name)}</div>
          <div class="ord-card-meta" dir="ltr">${escHtml(g.barcode)} • ${t('common.qty')}: ${g.qty}</div>
        </div>
        <input type="number" class="form-input no-spinner ord-qty-input" id="ordsearchqty_${i}" value="1" min="1" style="width:70px">
        <button class="btn btn-sm btn-primary" onclick="addOrdersProduct('${escHtml(g.barcode).replace(/'/g, "\\'")}', document.getElementById('ordsearchqty_${i}').value)"><i class="fas fa-plus"></i></button>
      </div>`).join('');
    return;
  }

  const orders = _ordOrdersCache
    .filter(o => _ordInRange(o.createdAt || 0))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  if (orders.length === 0) {
    el.innerHTML = `<div class="ord-empty"><i class="fas fa-clipboard-list"></i> ${t('orders.empty')}</div>`;
    return;
  }

  el.innerHTML = orders.map(o => {
    const statusBadge = o.status === 'done' ? 'ord-st-done' : o.status === 'notAvailable' ? 'ord-st-na' : 'ord-st-pending';
    const statusLabel = o.status === 'done' ? t('orders.statusDone') : o.status === 'notAvailable' ? t('orders.statusNotAvailable') : t('orders.statusPending');
    return `<div class="ord-card">
      <div class="ord-card-info">
        <div class="ord-card-name">${escHtml(o.productName || '')}</div>
        <div class="ord-card-meta" dir="ltr">${escHtml(o.barcode || '')} • ${o.qty} × DA${(parseFloat(o.unitPrice) || 0).toFixed(2)} • ${_ordFmt(o.createdAt)}</div>
      </div>
      <span class="ord-st ${statusBadge}">${statusLabel}</span>
      <div class="ord-card-actions">
        ${o.status !== 'done' ? `<button class="ord-btn ord-btn-done" onclick="setOrderStatus('${o.id}', 'done')"><i class="fas fa-check"></i> ${t('orders.btnDone')}</button>` : ''}
        ${o.status === 'pending' ? `<button class="ord-btn ord-btn-na" onclick="setOrderStatus('${o.id}', 'notAvailable')"><i class="fas fa-times"></i> ${t('orders.btnNotAvailable')}</button>` : ''}
        <button class="ord-btn ord-btn-delete" onclick="deleteOrderRow('${o.id}')" title="${t('orders.btnDelete')}"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

function setOrderStatus(id, status) {
  DB.updateOrder(id, { status });
  _ordOrdersCache = DB.getOrders();
  renderOrdersList();
  updateOrdersBadge();
}

function deleteOrderRow(id) {
  if (!confirm(t('orders.deleteConfirm'))) return;
  DB.deleteOrder(id);
  _ordOrdersCache = DB.getOrders();
  renderOrdersList();
  updateOrdersBadge();
}

// ===== BRANCH ORDERS =====

function switchOrdersTab(tab) {
  _ordTab = tab;
  document.getElementById('ordTabMine').classList.toggle('ord-tab-active', tab === 'mine');
  document.getElementById('ordTabBranches').classList.toggle('ord-tab-active', tab === 'branches');
  document.getElementById('ordPaneMine').style.display = tab === 'mine' ? '' : 'none';
  document.getElementById('ordPaneBranches').style.display = tab === 'branches' ? '' : 'none';
  if (tab === 'branches') loadBranchOrders();
}

async function loadBranchOrders() {
  const el = document.getElementById('ordersBranchList');
  if (typeof CloudService === 'undefined' || !CloudService.isCloudConnected()) {
    el.innerHTML = `<div class="ord-empty"><i class="fas fa-cloud-upload-alt"></i> ${t('orders.cloudRequired')}</div>`;
    return;
  }
  el.innerHTML = `<div class="ord-empty"><i class="fas fa-spinner fa-spin"></i> ${t('orders.loading')}</div>`;

  let stores = [];
  try {
    stores = await CloudService.listAccessibleStores();
  } catch (e) {
    el.innerHTML = `<div class="ord-empty"><i class="fas fa-exclamation-triangle"></i> ${t('common.error')}: ${e.message}</div>`;
    return;
  }

  const branches = stores.filter(s => s.type === 'branch');
  const results = await Promise.all(branches.map(async (b) => {
    try {
      const backup = await CloudService.downloadStoreBackup(b.code);
      const data = backup?.data || {};
      const db = typeof data.zmt_db === 'string' ? JSON.parse(data.zmt_db) : (data.zmt_db || {});
      const orders = db.orders || data.zmt_orders || data.orders || [];
      return { name: b.name, code: b.code, orders: orders.filter(o => !o.storeId || o.storeId === b.code) };
    } catch (e) {
      return { name: b.name, code: b.code, orders: [], error: e.message };
    }
  }));

  const withOrders = results.filter(r => r.orders.length > 0);
  if (withOrders.length === 0) {
    el.innerHTML = `<div class="ord-empty"><i class="fas fa-store"></i> ${t('orders.noBranchOrders')}</div>`;
    return;
  }

  el.innerHTML = withOrders.map(r => `
    <div class="ord-branch-group">
      <div class="ord-branch-title"><i class="fas fa-store"></i> ${escHtml(r.name)} <span class="ord-branch-count">${r.orders.length}</span></div>
      ${r.orders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map(o => {
        const statusBadge = o.status === 'done' ? 'ord-st-done' : o.status === 'notAvailable' ? 'ord-st-na' : 'ord-st-pending';
        const statusLabel = o.status === 'done' ? t('orders.statusDone') : o.status === 'notAvailable' ? t('orders.statusNotAvailable') : t('orders.statusPending');
        return `<div class="ord-card">
          <div class="ord-card-info">
            <div class="ord-card-name">${escHtml(o.productName || '')}</div>
            <div class="ord-card-meta" dir="ltr">${escHtml(o.barcode || '')} • ${o.qty} × DA${(parseFloat(o.unitPrice) || 0).toFixed(2)} • ${_ordFmt(o.createdAt)}</div>
          </div>
          <span class="ord-st ${statusBadge}">${statusLabel}</span>
        </div>`;
      }).join('')}
    </div>`).join('');
}

function _ordFmt(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleString(); } catch (e) { return ''; }
}

// ===== LAN SYNC: live list refresh =====
window._pageSyncHandlers = window._pageSyncHandlers || {};
window._pageSyncHandlers['orders'] = function ordersSyncData() {
  _ordOrdersCache = (typeof DB !== 'undefined' && DB.getOrders) ? DB.getOrders() : [];
  renderOrdersSuggestions();
  renderOrdersList();
  updateOrdersBadge();
};
