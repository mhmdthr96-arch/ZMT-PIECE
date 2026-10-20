// ============================================================
// ZMT Shared Inventory - Branch View of Main Store + Siblings
// ============================================================

let _siStores = [];
let _siStoreData = {};
let _siOpenView = null; // { code, name } of the currently open store detail

// Active company scope. When a company is active, shared inventory only shows
// products tagged with that company (companyId). Global products (untagged)
// are shown too. Returns '' when no company is active (unfiltered).
function _siActiveCompanyId() {
  try {
    if (typeof Auth !== 'undefined' && Auth.getCompanyId) return (Auth.getCompanyId() || '');
  } catch (e) {}
  return '';
}

// Codes of the branches explicitly attached to the active company. Empty when no
// company is active → no store-list restriction.
function _siCompanyStoreCodes() {
  try {
    const cid = _siActiveCompanyId();
    if (!cid) return [];
    const c = (typeof DB !== 'undefined' && DB.getCompany) ? DB.getCompany(cid) : null;
    if (!c || !Array.isArray(c.storeCodes)) return [];
    return c.storeCodes.map(String);
  } catch (e) {
    return [];
  }
}

function _siIsInActiveCompany(code) {
  const set = _siCompanyStoreCodes();
  if (!set.length) return true; // no active company → unrestricted
  return set.indexOf(String(code)) !== -1;
}

function _siCompanyRestricts() {
  return _siCompanyStoreCodes().length > 0;
}

function _siScopeProducts(products) {
  const cid = _siActiveCompanyId();
  if (!cid || !Array.isArray(products)) return products;
  return products.filter(p => !p.companyId || p.companyId === cid);
}

function init_shared_inventory() {
  siLoadStores();
}

async function siLoadStores() {
  const list = document.getElementById('siStoresList');
  const loading = document.getElementById('siLoading');

  try {
    _siStores = await CloudService.listAccessibleStores();

    // Restrict the visible store list to the active company when one is chosen.
    // The main store always stays in the list (it belongs to the user's family);
    // branches keep only those explicitly attached to the active company.
    if (_siCompanyRestricts()) {
      const myCode = Auth.getUserCode();
      _siStores = _siStores.filter(s =>
        s.type === 'main' || s.code === myCode || _siIsInActiveCompany(s.code)
      );
    }

    _siStoreData = {};

    const loadPromises = _siStores.map(async (s) => {
      try {
        const products = _siScopeProducts(await CloudService.downloadStoreInventory(s.code));
        _siStoreData[s.code] = { products: products || [], loaded: true };
      } catch {
        _siStoreData[s.code] = { products: [], loaded: false };
      }
    });

    await Promise.all(loadPromises);

    // Also load own products for cross-store search
    const myCode = Auth.getUserCode();
    _siStoreData[myCode] = { products: _siScopeProducts(DB.getProducts()), loaded: true, isOwn: true };
    if (!_siStores.find(s => s.code === myCode)) {
      _siStores.unshift({ code: myCode, name: _siOwnStoreName(), type: Auth.getStoreType() });
    }

    loading.style.display = 'none';
    list.style.display = '';

    if (_siStores.length === 0) {
      list.innerHTML = '<div class="conn-empty-state"><i class="fas fa-store"></i><p>لا توجد محلات مرتبطة</p></div>';
      return;
    }

    list.innerHTML = _siStores.map(s => {
      const d = _siStoreData[s.code] || {};
      const pCount = (d.products || []).length;
      const statusClass = d.loaded ? 'bm-branch-online' : 'bm-branch-offline';
      const typeLabel = s.type === 'main' ? 'محل رئيسي' : 'فرع';
      const icon = d.isOwn ? 'fa-store' : (s.type === 'main' ? 'fa-store' : 'fa-code-branch');

      return `
        <div class="bm-branch-card" onclick="siShowStoreDetail('${s.code}', '${_escHtml(s.name)}')">
          <div class="bm-branch-header">
            <div class="bm-branch-icon"><i class="fas ${icon}"></i></div>
            <div class="bm-branch-info">
              <div class="bm-branch-name">${d.isOwn ? '🏠 ' : ''}${_escHtml(s.name)}</div>
              <div class="bm-branch-code" dir="ltr">${s.code} <span style="font-size:11px;color:#999;">(${typeLabel})</span></div>
            </div>
            <span class="bm-branch-status ${statusClass}">${d.loaded ? 'متصل' : 'غير متصل'}</span>
          </div>
          <div class="bm-branch-stats">
            <div class="bm-stat"><i class="fas fa-boxes"></i> ${pCount} منتج</div>
          </div>
          <div class="bm-branch-action">
            <button class="btn btn-primary btn-sm"><i class="fas fa-eye"></i> عرض المخزون</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    loading.innerHTML = `<p class="text-danger">خطأ: ${e.message}</p>`;
  }
}

function siShowStoreDetail(code, name) {
  _siOpenView = { code, name };
  document.getElementById('siStoresList').style.display = 'none';
  document.getElementById('siStoreDetail').style.display = '';
  document.getElementById('siDetailName').textContent = name;
  document.getElementById('siDetailCode').textContent = code;

  const d = _siStoreData[code];
  const el = document.getElementById('siInventoryContent');

  if (!d || !d.loaded) {
    el.innerHTML = '<p class="text-muted">لا توجد بيانات متاحة</p>';
    return;
  }

  const products = d.products;
  if (products.length === 0) {
    el.innerHTML = '<p class="text-muted">لا يوجد مخزون</p>';
    return;
  }

  const brands = (typeof BRANDS !== 'undefined') ? [...(BRANDS.global || []), ...(BRANDS.chinese || [])] : [];

  el.innerHTML = `
    <div style="margin-bottom:12px;font-size:13px;color:#666;">عدد المنتجات: <strong>${products.length}</strong></div>
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
              ? '<span style="color:#c62828;font-weight:700;font-size:11px"><i class="fas fa-times-circle"></i> نفذ</span>'
              : '<span style="color:#388e3c;font-size:11px"><i class="fas fa-check-circle"></i> متوفر</span>'
            }</td>
            <td>${_formatNumber(p.sellPrice || 0)} DA</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

function siSearchProduct(q) {
  const resultsEl = document.getElementById('siSearchResults');
  q = normSearch(q);
  const brands = (typeof BRANDS !== 'undefined') ? [...(BRANDS.global || []), ...(BRANDS.chinese || [])] : [];
  const myCode = Auth.getUserCode();
  const allResults = [];

  for (const [storeCode, d] of Object.entries(_siStoreData)) {
    if (!d || !d.loaded || !d.products) continue;
    const storeName = d.isOwn
      ? _siOwnStoreName()
      : (_siStores.find(s => s.code === storeCode)?.name || storeCode);

    for (const p of d.products) {
      if (!q || productMatchesQuery(p.name, p.barcode, q, p.mark, p.reference, p.countryOfOrigin)) {
        allResults.push({
          ...p, storeCode, storeName, isOwn: d.isOwn,
          score: q ? productSearchScore(p.name, p.barcode, q, p.mark, p.reference, p.countryOfOrigin) : 0,
        });
      }
    }
  }

  if (q) allResults.sort((a, b) => b.score - a.score);

  if (allResults.length === 0) {
    resultsEl.innerHTML = '<div class="search-result-item disabled">لا توجد نتائج في أي محل</div>';
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
          ${outOfStock ? '<i class="fas fa-times-circle"></i> نفذ' : `<i class="fas fa-check-circle"></i> ${p.quantity}`}
        </span>
        <span style="font-size:11px;color:#666">DA${_formatNumber(p.sellPrice || 0)}</span>
      </div>
    </div>`;
  }).join('');
  resultsEl.style.display = '';
}

function siBackToList() {
  _siOpenView = null;
  document.getElementById('siStoresList').style.display = '';
  document.getElementById('siStoreDetail').style.display = 'none';
}

// Display name for "my store": prefers the active company's store name (per-company,
// persists with its backup), otherwise the global store name.
function _siOwnStoreName() {
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
window._pageSyncHandlers['shared-inventory'] = function siSyncData() {
  // This page renders OTHER stores' cloud data, so a LAN peer's DB change must
  // never trigger the old destructive script re-injection. The only local state
  // worth refreshing is our own store's inventory slice.
  const myCode = Auth.getUserCode();
  if (myCode && _siStoreData[myCode]) {
    _siStoreData[myCode].products = _siScopeProducts(DB.getProducts());
  }
  if (_siOpenView && _siOpenView.code === myCode) {
    const el = document.getElementById('siInventoryContent');
    if (el && el.isConnected) siShowStoreDetail(myCode, _siOpenView.name);
  }
};
