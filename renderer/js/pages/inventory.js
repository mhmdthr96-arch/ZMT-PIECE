var _invCart = [];
var _invCartSupplierId = null;
var _invProducts = [];
var _invFiltered = [];
var _invPager = null;
var _invHideUntilSearch = false;

// Merged brand lookup, built once and reused for every card. _renderInvProductCard used
// to allocate a fresh [...BRANDS.global, ...BRANDS.chinese] array (and then do a
// linear find) for EACH of the 25 cards painted per page — 25 identical copies
// of the same list on every repaint. A single Map gives O(1) lookups.
var _invBrandMap = null;
function _invGetBrand(id) {
  if (!id) return null;
  if (!_invBrandMap) {
    _invBrandMap = new Map();
    const g = (typeof BRANDS !== 'undefined' && BRANDS.global) || [];
    const c = (typeof BRANDS !== 'undefined' && BRANDS.chinese) || [];
    for (let i = 0; i < g.length; i++) if (g[i] && g[i].id) _invBrandMap.set(g[i].id, g[i]);
    for (let i = 0; i < c.length; i++) if (c[i] && c[i].id) _invBrandMap.set(c[i].id, c[i]);
  }
  return _invBrandMap.get(id) || null;
}

function init_inventory() {
  _invProducts = DB.getProducts();
  _invHideUntilSearch = (function () { try { return localStorage.getItem('zmt_inv_hide_until_search') === '1'; } catch (e) { return false; } })();
  _invFiltered = _computeInvFiltered(normSearch(document.getElementById('invSearch')?.value || ''));
  if (_invPager) { _invPager.destroy(); _invPager = null; }
  _invPager = new InfiniteScrollPager({
    data: _invFiltered,
    container: document.getElementById('invGrid'),
    pageSize: 25,
    renderItem: _renderInvProductCard,
    renderEmpty: () => {
      const msg = _invHideState() ? 'اكتب في البحث لعرض المنتجات…' : t('inventory.empty');
      return `<div class="placeholder-box" style="grid-column:1/-1;padding:48px"><i class="fas fa-box-open" style="font-size:48px;color:#555"></i><p>${msg}</p></div>`;
    },
    scrollContainer: document.querySelector('.main-content') || window,
  });
  window._activePager = _invPager;
  setupInvSearch();
  _syncInvHideBtn();
  setupTransferButton();
  setupDirectAddButton();
  setupQuickAddButton();
  updateInvScopeChip();
  const sc = document.getElementById('invBarcodeScanner');
  if (sc && !sc._zmtCleanBound) {
    sc._zmtCleanBound = true;
    sc.addEventListener('input', function() {
      const cleaned = cleanScannedCode(this.value, { scanner: true });
      if (cleaned !== this.value) this.value = cleaned;
    });
  }
  const scDirect = document.getElementById('invDirectScanner');
  if (scDirect && !scDirect._zmtCleanBound) {
    scDirect._zmtCleanBound = true;
    scDirect.addEventListener('input', function() {
      const cleaned = cleanScannedCode(this.value, { scanner: true });
      if (cleaned !== this.value) this.value = cleaned;
    });
  }
  const directModal = document.getElementById('invAddDirectModal');
  if (directModal) directModal.addEventListener('click', function(e) {
    if (e.target === directModal) closeInvAddDirect();
  });
  const quickModal = document.getElementById('invQuickAddModal');
  if (quickModal) quickModal.addEventListener('click', function(e) {
    if (e.target === quickModal) closeQuickAddProduct();
  });
  // Hover + press E to edit the highlighted product (layout-independent via e.code).
  window._prodEditShortcut = function (id) { editInventoryItem(id); };
  _bindProdShortcuts();
  // Right-click context menu handlers for product cards (permissions mirror the card buttons).
  const isManager = Auth.isManager();
  window._registerProdCtxHandlers({
    edit: editInventoryItem,
    canEdit: isManager || Auth.canEdit('inventory'),
    ret: openSupplierReturnModal,
    canRet: isManager || Auth.canEdit('supplier-returns'),
    del: deleteInventoryItem,
    canDel: isManager,
  });
}

function setupTransferButton() {
  const btn = document.getElementById('btnTransferProducts');
  const text = document.getElementById('btnTransferText');
  if (!btn || typeof Auth === 'undefined') return;

  const type = Auth.getStoreType();
  if (type === 'branch') {
    btn.style.display = '';
    if (text) text.textContent = t('inventory.transferBranch');
  } else {
    btn.style.display = '';
    if (text) text.textContent = t('inventory.transferMain');
  }
}

function setupDirectAddButton() {
  const btn = document.getElementById('btnAddInvDirect');
  if (!btn || typeof Auth === 'undefined') return;
  btn.style.display = (Auth.isManager() || Auth.canEdit('inventory')) ? '' : 'none';
}

function setupQuickAddButton() {
  const btn = document.getElementById('btnQuickAddProduct');
  if (!btn || typeof Auth === 'undefined') return;
  btn.style.display = (Auth.isManager() || Auth.canEdit('inventory')) ? '' : 'none';
}

function populateInvBrands(selectedId) {
  const opts = (typeof buildBrandSelectOptions === 'function') ? buildBrandSelectOptions(selectedId) : '';
  const sel = document.getElementById('invBrand');
  if (sel && !selectedId) sel.innerHTML = opts;
  const selDirect = document.getElementById('invDirectBrand');
  if (selDirect && !selectedId) selDirect.innerHTML = opts;
  const selQuick = document.getElementById('qaBrand');
  if (selQuick && !selectedId) selQuick.innerHTML = opts;
}

function renderInventory() {
  _invProducts = DB.getProducts();
  applyInvFilter();
}

// Shows a small chip with the ACTIVE company scope + store so the user can
// immediately see which company/store the inventory list is bound to (and why a
// product may be hidden or an edit rejected). Hidden when no company is active.
function updateInvScopeChip() {
  const el = document.getElementById('invScopeChip');
  if (!el) return;
  try {
    const cid = (typeof Auth !== 'undefined' && Auth.getCompanyId) ? (Auth.getCompanyId() || '') : '';
    const ls = (function () { try { return localStorage.getItem('zmt_active_company') || ''; } catch (e) { return ''; } })();
    const c = cid || ls;
    const sid = (typeof Auth !== 'undefined' && Auth.getUserCode) ? (Auth.getUserCode() || '') : '';
    let name = '';
    if (c && typeof DB !== 'undefined' && DB.getCompany) {
      try {
        const comp = DB.getCompany(c);
        if (comp && comp.name) name = comp.name;
      } catch (e) {}
    }
    if (!c) {
      el.style.display = 'none';
      el.innerHTML = '';
      return;
    }
    el.style.display = 'inline-flex';
    el.innerHTML = '<i class="fas fa-building"></i><b>' + escHtml(name || ('#' + String(c).slice(0, 6))) + '</b>'
      + (sid ? '<span class="inv-scope-store">' + escHtml(sid) + '</span>' : '');
  } catch (e) {
    el.style.display = 'none';
    el.innerHTML = '';
  }
}

function _renderInvProductCard(p, idx) {
  const brand = _invGetBrand(p.brandId);
  const isManager = Auth.isManager();
  const qtyBadge = p.quantity < 5 ? 'danger' : 'ok';
  return `<div class="prod-card" data-id="${p.id}" ondblclick="${isManager ? `editInventoryItem('${p.id}')` : ''}">
    <div class="prod-card-head">
      <div class="prod-card-head-main">
        <div class="prod-card-title">${escHtml(p.name)}</div>
        <div class="prod-card-meta">
          <span class="prod-meta"><i class="fas fa-tag"></i> ${t('quickEntry.mark')}: <b>${escHtml(p.mark || '-')}</b></span>
          <span class="prod-meta mono"><i class="fas fa-barcode"></i> ${escHtml(p.barcode || '-')}</span>
          ${p.family ? `<span class="prod-meta family-chip"><i class="fas fa-pills"></i> <b>${escHtml(p.family)}</b></span>` : ''}
        </div>
      </div>
      <span class="prod-card-badge ${qtyBadge}">${p.quantity} ${t('inventory.col4')}</span>
    </div>
    <div class="prod-card-fields">
      <div class="prod-field full"><span class="prod-field-label"><i class="fas fa-hashtag"></i> ${t('quickEntry.reference')}</span><span class="prod-field-value">${referenceCellHTML(p.reference)}</span></div>
      <div class="prod-field full"><span class="prod-field-label"><i class="fas fa-globe"></i> ${t('quickEntry.countryOfOrigin')}</span><span class="prod-field-value">${escHtml(p.countryOfOrigin || '-')}</span></div>
      <div class="prod-field"><span class="prod-field-label"><i class="fas fa-warehouse"></i> ${t('quickEntry.storageLocation')}</span><span class="prod-field-value">${escHtml(p.storageLocation || '-')}</span></div>
      <div class="prod-field"><span class="prod-field-label"><i class="fas fa-trademark"></i> ${t('inventory.col3')}</span><span class="prod-field-value">${escHtml(brand ? brand.name : (p.brandId || '-'))}</span></div>
    </div>
    ${Auth.buyPriceVisible() ? `<div class="prod-card-cost"><span class="prod-field-label"><i class="fas fa-money-bill-wave"></i> ${t('inventory.col5')}</span><span class="prod-cost-value">DA${fmtMoney((p.buyPrice || 0))}</span></div>` : `<div class="prod-card-cost"><span class="prod-field-label"><i class="fas fa-money-bill-wave"></i> ${t('inventory.col5')}</span><span class="prod-cost-value">••••</span></div>`}
    <div class="prod-card-pricerow">
      <div class="price-pill price-unit"><span>${t('inventory.col6')}</span><b>DA${fmtMoney((p.sellPrice || 0))}</b></div>
      <div class="price-pill price-whole"><span>${t('quickEntry.wholesalePrice')}</span><b>DA${fmtMoney((p.wholesalePrice || 0))}</b></div>
    </div>
    <div class="prod-card-actions" ondblclick="event.stopPropagation()">
      <button class="btn btn-sm" onclick="openPrintBarcodeModal('${p.id}')" title="طباعة باركود"><i class="fas fa-barcode"></i></button>
      ${(isManager || Auth.canEdit('inventory')) ? `<button class="btn btn-sm" onclick="editInventoryItem('${p.id}')"><i class="fas fa-edit"></i></button>` : ''}
      ${(isManager || Auth.canEdit('supplier-returns')) ? `<button class="btn btn-sm btn-return" onclick="openSupplierReturnModal('${p.id}')" title="${t('supplierReturns.modalTitle')}"><i class="fas fa-undo-alt"></i></button>` : ''}
      ${isManager ? `<button class="btn btn-sm btn-danger" onclick="deleteInventoryItem('${p.id}')"><i class="fas fa-trash"></i></button>` : ''}
    </div>
  </div>`;
}

function applyInvFilter() {
  const q = normSearch(document.getElementById('invSearch')?.value || '');
  if (!_invPager) return;
  _invFiltered = _computeInvFiltered(q);
  _invPager.updateData(_invFiltered);
}

function _invHideState() {
  return _invHideUntilSearch && normSearch(document.getElementById('invSearch')?.value || '').trim().length < 2;
}

function _computeInvFiltered(q) {
  if (_invHideUntilSearch && (!q || q.trim().length < 2)) return [];
  if (q && q.trim().length >= 2) {
    // Same smart search as the sales page, but backed by the fast per-record
    // search cache (WeakMap) and capped so a 600k-row dataset never renders an
    // unbounded DOM; the pager above windows what gets drawn.
    return productsMatchingQuery(_invProducts, q, 60);
  }
  return _invProducts;
}

function _syncInvHideBtn() {
  const btn = document.getElementById('invHideUntilSearchBtn');
  if (!btn) return;
  if (_invHideUntilSearch) {
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    btn.title = 'عرض كل المنتجات';
  } else {
    btn.classList.remove('active');
    btn.setAttribute('aria-pressed', 'false');
    btn.title = 'إخفاء المنتجات حتى البحث (تظهر المطابقة فقط)';
  }
}

function toggleInvHideUntilSearch() {
  _invHideUntilSearch = !_invHideUntilSearch;
  try { localStorage.setItem('zmt_inv_hide_until_search', _invHideUntilSearch ? '1' : '0'); } catch (e) {}
  _syncInvHideBtn();
  if (_invHideUntilSearch) {
    const input = document.getElementById('invSearch');
    if (input) setTimeout(function () { input.focus(); }, 60);
  }
  applyInvFilter();
}

function setupInvSearch() {
  const input = document.getElementById('invSearch');
  if (!input) return;
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  newInput.addEventListener('input', debounce(applyInvFilter, 300));
}

// ========== ADD INVENTORY MODAL ==========

function openInvAddModal() {
  if (!Auth.isManager()) { alert(t('common.noPermission')); return; }
  populateInvBrands();
  document.getElementById('invAddModal').style.display = 'flex';
  resetInvForm();
  applyExpiryField('invExpiry');
  applyFamilyField('invFamily');
  if (typeof window.refreshFamilySuggestions === 'function') window.refreshFamilySuggestions();
  setTimeout(() => { const s = document.getElementById('invSupSearch'); if (s) s.focus(); }, 200);
}

function closeInvAddModal() {
  document.getElementById('invAddModal').style.display = 'none';
}

// ========== ADD PRODUCT WITHOUT INVOICE ==========

function openInvAddDirect() {
  if (!Auth.isManager() && !Auth.canEdit('inventory')) { alert(t('common.noPermission')); return; }
  populateInvBrands();
  document.getElementById('invAddDirectModal').style.display = 'flex';
  resetInvDirectForm();
  applyExpiryField('invDirectExpiry');
  applyFamilyField('invDirectFamily');
  if (typeof window.refreshFamilySuggestions === 'function') window.refreshFamilySuggestions();
  setTimeout(() => { const s = document.getElementById('invDirectScanner'); if (s) s.focus(); }, 200);
}

function closeInvAddDirect() {
  const el = document.getElementById('invAddDirectModal');
  if (el) el.style.display = 'none';
}

function resetInvDirectForm() {
  document.getElementById('invDirectName').value = '';
  document.getElementById('invDirectBar').value = '';
  document.getElementById('invDirectQty').value = '1';
  document.getElementById('invDirectBuy').value = '0';
  document.getElementById('invDirectSell').value = '0';
  document.getElementById('invDirectWhole').value = '0';
  document.getElementById('invDirectReference').value = '';
  document.getElementById('invDirectCountry').value = '';
  document.getElementById('invDirectMark').value = '';
  document.getElementById('invDirectStorage').value = '';
  document.getElementById('invDirectScanner').value = '';
  const expiryDirectEl = document.getElementById('invDirectExpiry');
  if (expiryDirectEl) expiryDirectEl.value = '';
  const familyDirectEl = document.getElementById('invDirectFamily');
  if (familyDirectEl) familyDirectEl.value = '';
  const ledPurchase = document.getElementById('invDirectLedgerPurchase');
  if (ledPurchase) ledPurchase.checked = true;
  const ledExpense = document.getElementById('invDirectLedgerExpense');
  if (ledExpense) ledExpense.checked = false;
  document.getElementById('invDirectScannerStatus').textContent = t('inventory.scannerReady');
  document.getElementById('invDirectScannerStatus').style.color = '#888';
}

function handleInvDirectScan(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const input = document.getElementById('invDirectScanner');
  const code = cleanScannedCode(input.value, { scanner: true });
  if (!code) return;
  document.getElementById('invDirectBar').value = code;
  document.getElementById('invDirectName').focus();
  input.value = '';
}

function confirmInvAddDirect() {
  if (!Auth.isManager() && !Auth.canEdit('inventory')) { alert(t('common.noPermission')); return; }
  const name = document.getElementById('invDirectName').value.trim();
  const barcode = document.getElementById('invDirectBar').value.trim();
  const brandId = document.getElementById('invDirectBrand').value;
  const reference = document.getElementById('invDirectReference').value.trim() || '';
  const countryOfOrigin = document.getElementById('invDirectCountry').value.trim() || '';
  const mark = document.getElementById('invDirectMark').value.trim() || '';
  const storageLocation = document.getElementById('invDirectStorage').value.trim() || '';

  if (!name) { alert(t('inventory.enterName')); return; }
  if (!barcode) { alert(t('inventory.enterBarcode')); return; }

  const conflict = DB.findProductsByBarcode(barcode).find(p => !DB.isSameProductIdentity(p, { name, brandId }));
  if (conflict) {
    alert(`${t('inventory.barcodeConflict')}: ${conflict.name} (${conflict.barcode})`);
    return;
  }

  const qty = parseInt(document.getElementById('invDirectQty').value, 10) || 1;
  const buyPrice = parseFloat(document.getElementById('invDirectBuy').value) || 0;
  const sellPrice = parseFloat(document.getElementById('invDirectSell').value) || 0;
  const wholesalePrice = parseFloat(document.getElementById('invDirectWhole').value) || 0;

  const expSettings = getExpirySettings();
  const expiryDate = document.getElementById('invDirectExpiry').value || '';
  if (expSettings.enabled && expSettings.required && !expiryDate) { alert(t('inventory.expiryRequired')); return; }

  const family = document.getElementById('invDirectFamily').value.trim() || '';
  if (window.getPharmacyMode() && !family) { alert(t('inventory.familyRequired')); return; }

  const res = DB.addOrMergeProduct({
    name, barcode, brandId,
    buyPrice, sellPrice, wholesalePrice: wholesalePrice || 0,
    quantity: qty,
    reference, countryOfOrigin, mark, storageLocation,
    family,
    expiryDate,
  });
  if (!res.ok) {
    alert(res.existing ? `${t('inventory.barcodeConflict')}: ${res.existing.name} (${res.existing.barcode})` : t('inventory.invalidBarcode'));
    return;
  }

  // Financial entry: record the cost (buyPrice x qty) into whichever of
  // purchases / expenses was checked (both, one, or neither).
  const totalCost = qty * buyPrice;
  if (totalCost > 0) {
    if (document.getElementById('invDirectLedgerPurchase')?.checked) {
      DB.addPayment({ amount: totalCost, note: `${name} (${barcode})`, type: 'net_purchase', method: 'cash' });
    }
    if (document.getElementById('invDirectLedgerExpense')?.checked) {
      DB.addPayment({ amount: totalCost, note: `${name} (${barcode})`, type: 'net_expense', method: 'cash' });
    }
  }
  closeInvAddDirect();
  renderInventory();
}

// ========== QUICK ADD FIXED PRODUCT (no quantity / no buy price / no invoice) ==========

function openQuickAddProduct() {
  if (!Auth.isManager() && !Auth.canEdit('inventory')) { alert(t('common.noPermission')); return; }
  const modal = document.getElementById('invQuickAddModal');
  if (!modal) return;
  populateInvBrands();
  resetQuickAddForm();
  applyFamilyField('qaFamily');
  if (typeof window.refreshFamilySuggestions === 'function') window.refreshFamilySuggestions();
  modal.style.display = 'flex';
  setTimeout(() => { const f = document.getElementById('qaName'); if (f) f.focus(); }, 150);
}

function closeQuickAddProduct() {
  const modal = document.getElementById('invQuickAddModal');
  if (modal) modal.style.display = 'none';
}

function resetQuickAddForm() {
  const nameEl = document.getElementById('qaName');
  const barEl = document.getElementById('qaBar');
  const familyEl = document.getElementById('qaFamily');
  const sellEl = document.getElementById('qaSell');
  if (nameEl) nameEl.value = '';
  if (barEl) barEl.value = '';
  if (familyEl) familyEl.value = '';
  if (sellEl) sellEl.value = '0';
}

function qaBarcodeKey(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const f = document.getElementById('qaName');
  if (f) f.focus();
}

function confirmQuickAddProduct() {
  if (!Auth.isManager() && !Auth.canEdit('inventory')) { alert(t('common.noPermission')); return; }
  const name = document.getElementById('qaName').value.trim();
  const barcode = document.getElementById('qaBar').value.trim();
  const brandId = document.getElementById('qaBrand').value;
  const family = document.getElementById('qaFamily').value.trim();
  const sellPrice = document.getElementById('qaSell').value;

  const res = quickAddProduct({ name, barcode, brandId, family, sellPrice });
  if (!res.ok) {
    alert(res.error || 'تعذرت الإضافة');
    return;
  }
  closeQuickAddProduct();
  renderInventory();
  const msgKey = res.updated ? 'inventory.quickAddUpdated' : 'inventory.quickAddSuccess';
  alert(`${t(msgKey) || 'تمت الإضافة'}: ${res.product.name}`);
}

function resetInvForm() {
  document.getElementById('invProdSearch').value = '';
  document.getElementById('invSearchResults').innerHTML = '';
  document.getElementById('invSelectedProduct').style.display = 'none';
  document.getElementById('invProdName').value = '';
  document.getElementById('invProdBar').value = '';
  document.getElementById('invQty').value = '1';
  document.getElementById('invBuyPrice').value = '0';
  document.getElementById('invSellPrice').value = '0';
  document.getElementById('invWholePrice').value = '0';
  const expiryEl = document.getElementById('invExpiry');
  if (expiryEl) expiryEl.value = '';
  document.getElementById('invReference').value = '';
  document.getElementById('invCountry').value = '';
  document.getElementById('invMark').value = '';
  document.getElementById('invStorage').value = '';
  const familyEl = document.getElementById('invFamily');
  if (familyEl) familyEl.value = '';
  document.getElementById('invSupSearch').value = '';
  document.getElementById('invSupResults').innerHTML = '';
  document.getElementById('invSelectedSupplier').style.display = 'none';
  document.getElementById('invBarcodeScanner').value = '';
  document.getElementById('invScannerResult').style.display = 'none';
  document.getElementById('invScannerStatus').textContent = t('inventory.scannerReady');
  document.getElementById('invScannerStatus').style.color = '#888';
}

// --- Barcode Scanner ---

function handleInvBarcodeScan(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const input = document.getElementById('invBarcodeScanner');
    const code = cleanScannedCode(input.value, { scanner: true });
    if (!code) return;

    document.getElementById('invScannerStatus').textContent = t('inventory.scannerProcessing');
    document.getElementById('invScannerStatus').style.color = '#0066B1';

    const existing = DB.getProductByBarcode(code);
    const resultDiv = document.getElementById('invScannerResult');

    if (existing) {
      fillInvFromProduct(existing);
      resultDiv.style.display = 'flex';
      resultDiv.className = 'scanner-result scanner-success';
      resultDiv.innerHTML = `<i class="fas fa-check-circle"></i> ${t('inventory.scannerFound')} <strong>${existing.name}</strong>`;
      document.getElementById('invScannerStatus').textContent = t('inventory.scannerDone');
      document.getElementById('invScannerStatus').style.color = '#28a745';
      setTimeout(() => document.getElementById('invQty').focus(), 100);
    } else {
      document.getElementById('invProdBar').value = code;
      document.getElementById('invProdName').focus();
      resultDiv.style.display = 'flex';
      resultDiv.className = 'scanner-result scanner-warning';
      resultDiv.innerHTML = `<i class="fas fa-qrcode"></i> ${t('inventory.scannerNewBarcode')} <strong dir="ltr">${code}</strong>`;
      document.getElementById('invScannerStatus').textContent = t('inventory.scannerNew');
      document.getElementById('invScannerStatus').style.color = '#f39c12';
    }
    input.value = '';
  }
}

// --- Product search ---

function invSearchKey(e) {
  const box = document.getElementById('invSearchResults');
  if (!box) return;
  const items = Array.prototype.slice.call(box.querySelectorAll('.search-result-item:not(.disabled)'));
  if (!items.length) return;
  let idx = items.findIndex(it => it.classList.contains('inv-sel'));
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    idx = (idx + 1) % items.length;
    invHighlightSearch(items, idx);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    idx = (idx - 1 + items.length) % items.length;
    invHighlightSearch(items, idx);
  } else if (e.key === 'Enter') {
    if (idx >= 0) { e.preventDefault(); items[idx].click(); }
  }
}

function invHighlightSearch(items, idx) {
  items.forEach((it, i) => it.classList.toggle('inv-sel', i === idx));
  if (items[idx].scrollIntoView) items[idx].scrollIntoView({ block: 'nearest' });
}

function searchInvProduct(q) {
  const results = document.getElementById('invSearchResults');
  q = normSearch(q);

  const products = DB.getProducts();
  const matches = q
    ? products
        .map(p => ({ p, score: productSearchScore(p.name, p.barcode, q, p.mark, p.reference, p.countryOfOrigin) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map(x => x.p)
    : products.slice(0, 10);

  if (matches.length === 0) {
    results.innerHTML = `<div class="search-result-item disabled">${t('inventory.noResults')}</div>`;
    return;
  }

  results.innerHTML = matches.map(p =>
    `<div class="search-result-item" onclick="fillInvFromProduct('${p.id}')">
      <strong>${p.name}</strong>
      <span class="text-muted" dir="ltr">${p.barcode}</span>
    </div>`
  ).join('');
}

function fillInvFromProduct(id) {
  const p = typeof id === 'string' ? DB.getProduct(id) : id;
  if (!p) return;

  document.getElementById('invProdSearch').value = p.name;
  document.getElementById('invSearchResults').innerHTML = '';
  document.getElementById('invSelectedProduct').style.display = 'flex';
  document.getElementById('invSelName').textContent = p.name;
  document.getElementById('invSelBarcode').textContent = p.barcode;

  document.getElementById('invProdName').value = p.name;
  document.getElementById('invProdBar').value = p.barcode;
  document.getElementById('invBrand').value = p.brandId;
  if (p.brandId) {
    const brandSel = document.getElementById('invBrand');
    if (brandSel && !new RegExp('value="' + p.brandId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"').test(brandSel.innerHTML)) {
      const brandName = (typeof findBrandById === 'function') ? findBrandById(p.brandId) : null;
      brandSel.innerHTML += `<option value="${escHtml(p.brandId)}" selected>${escHtml(brandName ? brandName.name : p.brandId)}</option>`;
    }
  }
  document.getElementById('invBuyPrice').value = p.buyPrice;
  document.getElementById('invSellPrice').value = p.sellPrice;
  document.getElementById('invWholePrice').value = p.wholesalePrice || 0;
  document.getElementById('invQty').value = '1';
  const expiryEl = document.getElementById('invExpiry');
  if (expiryEl) expiryEl.value = p.expiryDate || '';
  const familyEl = document.getElementById('invFamily');
  if (familyEl) familyEl.value = p.family || '';
}

// --- Supplier search ---

function searchInvSupplier(q) {
  const results = document.getElementById('invSupResults');
  q = normSearch(q);

  const suppliers = DB.getSuppliers();
  const matches = q
    ? suppliers.filter(s => s.name.toLowerCase().includes(q.toLowerCase())).slice(0, 10)
    : suppliers.slice(0, 10);

  if (matches.length === 0) { results.innerHTML = ''; return; }

  results.innerHTML = matches.map(s =>
    `<div class="search-result-item" onclick="selectInvSupplier('${s.id}')">
      <strong>${s.name}</strong>
      <span class="text-muted">${s.phone || ''}</span>
    </div>`
  ).join('');
}

function selectInvSupplier(id) {
  const s = DB.getSuppliers().find(x => x.id === id);
  if (!s) return;
  _invCartSupplierId = s.id;
  document.getElementById('invSelectedSupplier').style.display = 'flex';
  document.getElementById('invSupName').textContent = s.name;
  document.getElementById('invSupResults').innerHTML = '';
}

// --- Cart ---

function invAddToCart() {
  if (!Auth.isManager()) { alert(t('common.noPermission')); return; }
  const name = document.getElementById('invProdName').value.trim();
  const barcode = document.getElementById('invProdBar').value.trim();
  const brandId = document.getElementById('invBrand').value;
  const qty = parseInt(document.getElementById('invQty').value) || 1;
  const buyPrice = parseFloat(document.getElementById('invBuyPrice').value) || 0;
  const sellPrice = parseFloat(document.getElementById('invSellPrice').value) || 0;
  const wholesalePrice = parseFloat(document.getElementById('invWholePrice').value) || 0;
  const reference = document.getElementById('invReference').value.trim() || '';
  const countryOfOrigin = document.getElementById('invCountry').value.trim() || '';
  const mark = document.getElementById('invMark').value.trim() || '';
  const storageLocation = document.getElementById('invStorage').value.trim() || '';

  if (!name) { alert(t('inventory.enterName')); return; }
  if (!barcode) { alert(t('inventory.enterBarcode')); return; }

  const expSettings = getExpirySettings();
  const expiry = document.getElementById('invExpiry').value || '';
  if (expSettings.enabled && expSettings.required && !expiry) { alert(t('inventory.expiryRequired')); return; }

  const family = document.getElementById('invFamily').value.trim() || '';
  if (window.getPharmacyMode() && !family) { alert(t('inventory.familyRequired')); return; }

  const conflict = DB.findProductsByBarcode(barcode).find(p => !DB.isSameProductIdentity(p, { name, brandId }));
  if (conflict) {
    alert(`هذا الباركود مسجّل لمنتج آخر: ${conflict.name} (${conflict.barcode})`);
    return;
  }

  _invCart.push({ name, barcode, brandId, qty, buyPrice, sellPrice, wholesalePrice, reference, countryOfOrigin, mark, storageLocation, family, expiryDate: expiry });
  renderInvCart();
  resetInvForm();
  setTimeout(() => document.getElementById('invBarcodeScanner').focus(), 200);
}

function renderInvCart() {
  const section = document.getElementById('invCartSection');
  const container = document.getElementById('invCartItems');
  const countEl = document.getElementById('invCartCount');
  const totalEl = document.getElementById('invCartTotal');

  if (_invCart.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';

  countEl.textContent = `(${_invCart.length})`;
  const total = _invCart.reduce((sum, item) => sum + item.qty * item.buyPrice, 0);
  totalEl.textContent = `DA${fmtMoney(total)}`;

  container.innerHTML = _invCart.map((item, i) =>
    `<div class="cart-item">
      <div class="cart-item-info">
        <strong>${item.name}</strong>
        <span class="text-muted">${item.barcode}</span>
      </div>
      <div class="cart-item-details">
        <span>${item.qty} × DA${fmtMoney(item.buyPrice)}</span>
        <span class="cart-item-total">DA${fmtMoney((item.qty * item.buyPrice))}</span>
      </div>
      <button class="btn btn-sm btn-danger" onclick="invRemoveFromCart(${i})"><i class="fas fa-times"></i></button>
    </div>`
  ).join('');
  invRecalcTotal();
}

function invRemoveFromCart(idx) {
  _invCart.splice(idx, 1);
  renderInvCart();
}

function invClearCart() {
  if (_invCart.length === 0) return;
  if (!confirm(t('inventory.clearCartConfirm'))) return;
  _invCart = [];
  renderInvCart();
}

function invRecalcTotal() {
  const subtotal = _invCart.reduce((s, i) => s + i.qty * i.buyPrice, 0);
  const timbreEnabled = document.getElementById('invTimbreCheck').checked;
  const timbreRate = parseFloat(localStorage.getItem('zmt_timbre_rate') || '1');
  let timbreAmount = 0;
  if (timbreEnabled) {
    timbreAmount = subtotal * (timbreRate / 100);
    if (timbreAmount < 5) timbreAmount = 5;
    if (timbreAmount > 10000) timbreAmount = 10000;
  }
  const total = subtotal + timbreAmount;
  document.getElementById('invCartTotal').textContent = 'DA' + fmtMoney(total);
  const timbreEl = document.getElementById('invTimbreAmount');
  if (timbreEnabled && timbreAmount > 0) {
    timbreEl.textContent = '+ DA' + fmtMoney(timbreAmount);
    timbreEl.style.display = '';
  } else {
    timbreEl.style.display = 'none';
  }
}

function invConfirmInvoice() {
  if (_invCart.length === 0) { alert(t('inventory.cartEmpty')); return; }

  const supplierId = _invCartSupplierId;
  let totalAmount = 0;
  const invoiceItems = [];

  for (const item of _invCart) {
    if (item.barcode) {
      const conflict = DB.findProductsByBarcode(item.barcode).find(p => !DB.isSameProductIdentity(p, item));
      if (conflict) {
        _invCart = [];
        _invCartSupplierId = null;
        renderInvCart();
        closeInvAddModal();
        renderInventory();
        alert(`هذا الباركود مسجّل لمنتج آخر: ${conflict.name} (${conflict.barcode})`);
        return;
      }
    }
  }

  _invCart.forEach(item => {
    const itemTotal = item.qty * item.buyPrice;
    totalAmount += itemTotal;

    const res = DB.addOrMergeProduct({
      name: item.name, barcode: item.barcode,
      brandId: item.brandId,
      buyPrice: item.buyPrice, sellPrice: item.sellPrice,
      wholesalePrice: item.wholesalePrice || 0,
      quantity: item.qty, supplierId,
      reference: item.reference || '', countryOfOrigin: item.countryOfOrigin || '',
      mark: item.mark || '', storageLocation: item.storageLocation || '',
      family: item.family || '',
      expiryDate: item.expiryDate || '',
    });
    if (!res.ok) {
      _invCart = [];
      _invCartSupplierId = null;
      renderInvCart();
      closeInvAddModal();
      renderInventory();
      alert(res.existing ? `هذا الباركود مسجّل لمنتج آخر: ${res.existing.name} (${res.existing.barcode})` : 'الباركود غير صالح');
      return;
    }

    const prod = res.product;
    invoiceItems.push({
      productId: prod.id, barcode: prod.barcode,
      name: item.name, qty: item.qty,
      price: item.buyPrice, total: itemTotal,
    });
  });

  // Calculate timbre fiscal
  const timbreEnabled = document.getElementById('invTimbreCheck').checked;
  const timbreRate = parseFloat(localStorage.getItem('zmt_timbre_rate') || '1');
  let timbreFiscal = 0;
  if (timbreEnabled) {
    timbreFiscal = totalAmount * (timbreRate / 100);
    if (timbreFiscal < 5) timbreFiscal = 5;
    if (timbreFiscal > 10000) timbreFiscal = 10000;
  }

  if (supplierId) {
    DB.addInvoice({ supplierId, type: 'supplier', date: Date.now(), items: invoiceItems, totalAmount, timbreFiscal });
    const suppliers = DB.getSuppliers();
    const idx = suppliers.findIndex(s => s.id === supplierId);
    if (idx !== -1) {
      suppliers[idx].balance = (parseFloat(suppliers[idx].balance) || 0) + totalAmount;
      DB.saveSuppliers(suppliers);
    }
  } else {
    DB.addInvoice({ supplierId: null, type: 'purchase', date: Date.now(), items: invoiceItems, totalAmount, timbreFiscal });
  }

  _invCart = [];
  _invCartSupplierId = null;
  document.getElementById('invTimbreCheck').checked = false;
  renderInvCart();
  closeInvAddModal();
  renderInventory();

  const cnt = invoiceItems.length;
  const totalQty = invoiceItems.reduce((s, it) => s + it.qty, 0);
  let msg = `${t('inventory.invoiceSaved')} DA${fmtMoney(totalAmount)}`;
  if (timbreFiscal > 0) msg += ` + ${t('inventory.fiscalStamp')} DA${fmtMoney(timbreFiscal)}`;
  msg += ` ${t('inventory.includes')} ${cnt} ${t('inventory.productUnit')} (${totalQty} ${t('inventory.pieceUnit')})`;
  alert(msg);
}

// ========== EDIT / DELETE ==========

function editInventoryItem(id) {
  if (!Auth.isManager() && !Auth.canEdit('inventory')) { alert(t('common.noPermission')); return; }
  const p = DB.getProduct(id);
  if (!p) return;

  // Ensure the current brand is always present (even custom/unknown) then build favourites-first options.
  const brandName = (typeof findBrandById === 'function') ? findBrandById(p.brandId) : null;
  let brandOptions = (typeof buildBrandSelectOptions === 'function')
    ? buildBrandSelectOptions(p.brandId)
    : [...BRANDS.global, ...BRANDS.chinese].map(b => `<option value="${b.id}" ${b.id === p.brandId ? 'selected' : ''}>${b.name}</option>`).join('');
  if (p.brandId && !new RegExp('value="' + p.brandId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"').test(brandOptions)) {
    const label = brandName ? brandName.name : p.brandId;
    brandOptions += `<option value="${escHtml(p.brandId)}" selected>${escHtml(label)}</option>`;
  }

  const html = `
    <div class="form-group">
      <label>${t('inventory.editLabelName')}</label>
      <input type="text" class="form-input" id="invEditName" value="${escHtml(p.name)}">
    </div>
    <div class="form-group">
      <label>${t('inventory.editLabelBarcode')}</label>
      <input type="text" class="form-input" id="invEditBar" value="${p.barcode}" dir="ltr">
    </div>
    <div class="form-row">
      <div class="form-group" style="flex:1">
        <label>${t('inventory.editLabelBrand')}</label>
        <select class="form-input" id="invEditBrand">${brandOptions}</select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>${t('inventory.editLabelQty')}</label>
        <input type="text" class="form-input no-spinner num-input" inputmode="numeric" id="invEditQty" value="${toLatinDigits(p.quantity)}" min="0" dir="ltr">
      </div>
      ${Auth.isManager() ? `
      <div class="form-group">
        <label>${t('inventory.editLabelBuyPrice')}</label>
        <input type="text" class="form-input no-spinner num-input" inputmode="decimal" id="invEditBuy" value="${toLatinDigits(p.buyPrice)}" min="0" dir="ltr">
      </div>` : ''}
      <div class="form-group">
        <label>${t('inventory.editLabelSellPrice')}</label>
        <input type="text" class="form-input no-spinner num-input" inputmode="decimal" id="invEditSell" value="${toLatinDigits(p.sellPrice)}" min="0" dir="ltr">
      </div>
    </div>
    <div class="form-group">
      <label>${t('inventory.editLabelWholesale')}</label>
      <input type="text" class="form-input no-spinner num-input" inputmode="decimal" id="invEditWhole" value="${toLatinDigits(p.wholesalePrice || 0)}" min="0" dir="ltr">
    </div>
    <div class="form-group" id="invEditExpiryRow">
      <label>${t('inventory.expiryDate')}</label>
      <input type="date" class="form-input" id="invEditExpiry" value="${escHtml(p.expiryDate || '')}">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>${t('quickEntry.reference')}</label>
        <input type="text" class="form-input" id="invEditReference" value="${escHtml(p.reference || '')}" dir="ltr">
      </div>
      <div class="form-group">
        <label>${t('quickEntry.countryOfOrigin')}</label>
        <input type="text" class="form-input" id="invEditCountry" value="${escHtml(p.countryOfOrigin || '')}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>${t('quickEntry.mark')}</label>
        <input type="text" class="form-input" id="invEditMark" value="${escHtml(p.mark || '')}">
      </div>
      <div class="form-group">
        <label>${t('quickEntry.storageLocation')}</label>
        <input type="text" class="form-input" id="invEditStorage" value="${escHtml(p.storageLocation || '')}">
      </div>
    </div>
    <div class="form-group" id="invEditFamilyRow">
      <label>${t('inventory.family')}</label>
      <input type="text" class="form-input" id="invEditFamily" list="familyDatalist" value="${escHtml(p.family || '')}" placeholder="${t('inventory.family')}">
    </div>`;

  showModal(t('inventory.editTitle'), html, () => {
    const oldQty = p.quantity;
    const oldBuyPrice = p.buyPrice;
    const newQty = parseInt(document.getElementById('invEditQty').value) || 0;
    const buyPriceInput = document.getElementById('invEditBuy');
    const newBuyPrice = (buyPriceInput && Auth.isManager()) ? (parseFloat(buyPriceInput.value) || 0) : oldBuyPrice;
    const newSellPrice = parseFloat(document.getElementById('invEditSell').value) || 0;
    const newWholePrice = parseFloat(document.getElementById('invEditWhole').value) || 0;

    const expSettings = getExpirySettings();
    const newExpiry = document.getElementById('invEditExpiry').value || '';
    if (expSettings.enabled && expSettings.required && !newExpiry) { alert(t('inventory.expiryRequired')); return false; }

    const res = DB.updateProduct(id, {
      name: document.getElementById('invEditName').value.trim() || p.name,
      barcode: document.getElementById('invEditBar').value.trim() || p.barcode,
      brandId: document.getElementById('invEditBrand').value,
      quantity: newQty, buyPrice: newBuyPrice, sellPrice: newSellPrice, wholesalePrice: newWholePrice,
      reference: document.getElementById('invEditReference').value.trim() || '',
      countryOfOrigin: document.getElementById('invEditCountry').value.trim() || '',
      mark: document.getElementById('invEditMark').value.trim() || '',
      storageLocation: document.getElementById('invEditStorage').value.trim() || '',
      family: document.getElementById('invEditFamily').value.trim() || '',
      expiryDate: newExpiry,
    });
    if (res && res.ok === false) {
      // Never close the modal on a silent no-op: the edit was NOT persisted.
      alert(res.reason === 'not_found'
        ? 'المنتج لم يعد موجوداً — لم يُحفظ التعديل'
        : 'لم يُحفظ التعديل: المنتج خارج نطاق الشركة/المحل النشط. سجّل الدخول إلى شركتك أولاً ثم أعد المحاولة.');
      return false;
    }

    if (oldQty !== newQty || oldBuyPrice !== newBuyPrice) {
      const invoices = DB.getInvoices().filter(inv => inv.supplierId);
      invoices.forEach(inv => {
        const item = inv.items.find(it => it.productId === id);
        if (item) {
          const oldTotal = item.total;
          item.qty = newQty;
          item.price = newBuyPrice;
          item.total = newQty * newBuyPrice;
          inv.totalAmount = inv.items.reduce((sum, it) => sum + it.total, 0);
          DB.updateInvoice(inv.id, { items: inv.items, totalAmount: inv.totalAmount });

          const suppliers = DB.getSuppliers();
          const supIdx = suppliers.findIndex(s => s.id === inv.supplierId);
          if (supIdx !== -1) {
            suppliers[supIdx].balance = (parseFloat(suppliers[supIdx].balance) || 0) - oldTotal + item.total;
            DB.saveSuppliers(suppliers);
          }
        }
      });
    }
    return true;
  }, () => renderInventory());
  applyExpiryField('invEditExpiry');
  applyFamilyField('invEditFamily');
}

function deleteInventoryItem(id) {
  if (!Auth.isManager()) { alert(t('common.noPermission')); return; }
  if (!confirm(t('inventory.deleteConfirm'))) return;
  const p = DB.getProduct(id);
  if (!p) return;

  const invoices = DB.getInvoices();
  invoices.forEach(inv => {
    const itemIdx = inv.items.findIndex(it => it.productId === id);
    if (itemIdx !== -1) {
      const removedTotal = inv.items[itemIdx].total;
      inv.items.splice(itemIdx, 1);
      inv.totalAmount -= removedTotal;
      DB.updateInvoice(inv.id, { items: inv.items, totalAmount: inv.totalAmount });
      if (inv.supplierId) {
        const suppliers = DB.getSuppliers();
        const supIdx = suppliers.findIndex(s => s.id === inv.supplierId);
        if (supIdx !== -1) {
          suppliers[supIdx].balance = (parseFloat(suppliers[supIdx].balance) || 0) - removedTotal;
          DB.saveSuppliers(suppliers);
        }
      }
    }
  });

  DB.deleteProduct(id);
  renderInventory();
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ========== EXPORT / IMPORT EXCEL & CSV ==========

// Ask the user whether the purchase price should be included or hidden.
function exportProductsExcel() {
  // If buy-price visibility is currently hidden (Ctrl+X), export without it.
  if (typeof Auth !== 'undefined' && !Auth.buyPriceVisible()) {
    runExportProductsExcel(false);
    return;
  }
  const existing = document.getElementById('exportChoiceModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'exportChoiceModal';
  modal.style.display = 'flex';
  modal.innerHTML = `<div class="modal" style="max-width:440px">
    <div class="modal-header">
      <h3><i class="fas fa-file-excel" style="color:#2F5496"></i> ${t('inventory.exportXlsxTitle')}</h3>
      <button class="modal-close" onclick="document.getElementById('exportChoiceModal').remove()">&times;</button>
    </div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:10px">
      <button class="btn btn-primary" onclick="runExportProductsExcel(true);document.getElementById('exportChoiceModal').remove()" style="width:100%">
        <i class="fas fa-coins"></i> ${t('inventory.exportWithBuy')}
      </button>
      <button class="btn" onclick="runExportProductsExcel(false);document.getElementById('exportChoiceModal').remove()" style="width:100%">
        <i class="fas fa-eye-slash"></i> ${t('inventory.exportWithoutBuy')}
      </button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

function runExportProductsExcel(includeBuyPrice) {
  const products = DB.getProducts();
  if (!products || !products.length) {
    alert(t('inventory.noExport') || 'لا توجد بيانات للتصدير');
    return;
  }

  const user = (typeof Auth !== 'undefined' && Auth.getCurrentUser && Auth.getCurrentUser())
    ? (Auth.getCurrentUser().username || '') : '';
  const labels = {
    title: t('inventory.exportSheetTitle'),
    storeName: localStorage.getItem('zmt_store_name') || '',
    date: t('inventory.exportDate'),
    count: t('inventory.exportCount'),
    by: t('inventory.exportBy'),
    user,
    total: t('inventory.exportTotal'),
    sheetName: 'ZMT PIECE',
    headers: [
      t('inventory.colName'), t('inventory.colBarcode'), t('inventory.colBrand'),
      t('inventory.colMark'), t('inventory.colReference'), t('inventory.colCountry'),
      t('inventory.colStorage'), t('inventory.colQty'), t('inventory.colBuyPrice'),
      t('inventory.colSellPrice'), t('inventory.colWholePrice'), t('inventory.colExpiry'),
    ],
  };

  const wb = DB.exportProductsXLSX(includeBuyPrice, labels);
  const today = new Date().toISOString().slice(0, 10);
  const fileName = `ZMT_PIECE_Products_${today}.xlsx`;
  const base64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });

  if (window.electronAPI && window.electronAPI.saveFile) {
    window.electronAPI.saveFile({
      defaultPath: fileName,
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
    }).then(result => {
      if (!result.canceled && result.filePath) {
        window.electronAPI.writeFileBinary(result.filePath, base64).then(res => {
          if (res && res.success) alert(t('inventory.exportSuccess') || 'تم التصدير بنجاح');
          else alert((t('inventory.exportError') || 'حدث خطأ أثناء الحفظ: ') + ((res && res.error) || ''));
        });
      }
    });
  } else {
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

function importProductsCSV(input) {
  const file = input.files[0];
  if (!file) return;
  const isXlsx = /\.(xlsx|xls)$/i.test(file.name);
  const reader = new FileReader();
  reader.onload = function(e) {
    let result;
    try {
      result = isXlsx ? DB.importProductsXLSX(e.target.result) : DB.importProductsCSV(e.target.result);
    } catch (err) {
      alert(t('inventory.importFailed') || 'فشل الاستيراد. تأكد من تنسيق الملف');
      input.value = '';
      return;
    }
    if (result.count > 0) {
      renderInventory();
      let msg = `${t('inventory.importSuccess')} ${result.count} ${t('inventory.importSuccessEnd')}`;
      if (result.totalCost > 0) {
        msg += `\n${t('inventory.importCost')} DA${fmtMoney(result.totalCost)} (${t('inventory.importRecorded')})`;
      }
      alert(msg);
    } else {
      alert(t('inventory.importFailed') || 'فشل الاستيراد. تأكد من تنسيق الملف');
    }
    input.value = '';
  };
  if (isXlsx) reader.readAsArrayBuffer(file);
  else reader.readAsText(file, 'UTF-8');
}

// ========== GLOBAL MODAL ==========

function showModal(title, bodyHtml, onConfirm, onClose) {
  const existing = document.getElementById('genericModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'genericModal';
  modal.style.display = 'flex';
  modal.innerHTML = `<div class="modal" style="max-width:550px">
    <div class="modal-header">
      <h3><i class="fas fa-edit"></i> ${title}</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
    </div>
    <div class="modal-body">${bodyHtml}</div>
    <div class="modal-footer">
      <button class="btn" onclick="this.closest('.modal-overlay').remove(); if(typeof onClose === 'function') onClose()">${t('common.cancel')}</button>
      <button class="btn btn-success" id="modalConfirmBtn"><i class="fas fa-check"></i> ${t('common.save')}</button>
    </div>
  </div>`;

  document.body.appendChild(modal);
  document.getElementById('modalConfirmBtn').onclick = function() {
    if (onConfirm()) {
      modal.remove();
      if (typeof onClose === 'function') onClose();
    }
  };
  modal.addEventListener('click', (e) => { if (e.target === modal) { modal.remove(); if (typeof onClose === 'function') onClose(); } });
}

function _invModalHandler(e) {
  const modal = document.getElementById('invAddModal');
  if (e.target === modal) closeInvAddModal();
}
document.removeEventListener('click', _invModalHandler);
document.addEventListener('click', _invModalHandler);
if (window._pageListeners) window._pageListeners.push({ type: 'click', fn: _invModalHandler });

// ===== LAN SYNC HANDLER =====
window._pageSyncHandlers = window._pageSyncHandlers || {};
window._pageSyncHandlers['inventory'] = function inventorySyncData() {
  window.syncPreserveRefresh({
    search: ['invSearch'],
    render: () => {
      _invProducts = DB.getProducts();
      const q = normSearch(document.getElementById('invSearch')?.value || '');
      _invFiltered = _computeInvFiltered(q);
      _invPager.updateDataKeepScroll(_invFiltered);
    },
  });
};
window.addEventListener('zmt:buyprice-toggle', function(){ renderInventory(); });
