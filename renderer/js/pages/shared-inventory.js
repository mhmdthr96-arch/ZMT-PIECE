// ============================================================
// ZMT Shared Inventory - Branch View of Main Store + Siblings
// ============================================================

let _siStores = [];
let _siStoreData = {};

function init_shared_inventory() {
  siLoadStores();
}

async function siLoadStores() {
  const list = document.getElementById('siStoresList');
  const loading = document.getElementById('siLoading');

  try {
    _siStores = await CloudService.listAccessibleStores();
    _siStoreData = {};

    const loadPromises = _siStores.map(async (s) => {
      try {
        const products = await CloudService.downloadStoreInventory(s.code);
        _siStoreData[s.code] = { products: products || [], loaded: true };
      } catch {
        _siStoreData[s.code] = { products: [], loaded: false };
      }
    });

    await Promise.all(loadPromises);

    // Also load own products for cross-store search
    const myCode = Auth.getUserCode();
    _siStoreData[myCode] = { products: DB.getProducts(), loaded: true, isOwn: true };
    if (!_siStores.find(s => s.code === myCode)) {
      _siStores.unshift({ code: myCode, name: localStorage.getItem('zmt_store_name') || 'محلك', type: Auth.getStoreType() });
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
      ? (localStorage.getItem('zmt_store_name') || 'محلك')
      : (_siStores.find(s => s.code === storeCode)?.name || storeCode);

    for (const p of d.products) {
      if (!q || productMatchesQuery(p.name, p.barcode, q)) {
        allResults.push({
          ...p, storeCode, storeName, isOwn: d.isOwn,
          score: q ? productSearchScore(p.name, p.barcode, q) : 0,
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
  document.getElementById('siStoresList').style.display = '';
  document.getElementById('siStoreDetail').style.display = 'none';
}
