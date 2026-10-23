var editingProductId = null;
var _invoiceCart = [];
var _cartSupplierId = null;

function init_category_products() {
  // Brand-scoped product screen: we arrive here directly from a brand card.
  const ctx = window.brandCtx;
  if (!ctx || !ctx.brandId) { navigateTo('brands'); return; }

  const brand = findBrandById(ctx.brandId);
  if (!brand) { navigateTo('brands'); return; }

  document.getElementById('catTitle').textContent = brand.name;
  document.getElementById('catSub').textContent = 'المنتجات المتوفرة';
  window._brandCtx = ctx;
  window.catCtx = { brandId: ctx.brandId }; // backward-compat alias

  if (window._catPager) { window._catPager.destroy(); window._catPager = null; }
  renderProducts();
  setupProdSearch();
  const sc = document.getElementById('barcodeScannerInput');
  if (sc && !sc._zmtCleanBound) {
    sc._zmtCleanBound = true;
    sc.addEventListener('input', function() {
      const cleaned = cleanScannedCode(this.value, { scanner: true });
      if (cleaned !== this.value) this.value = cleaned;
    });
  }
  // Hover + press E to edit the highlighted product (layout-independent via e.code).
  window._prodEditShortcut = function (id) { editProduct(id); };
  _bindProdShortcuts();
  // Right-click context menu handlers for product cards (permissions mirror the card buttons).
  const isManager = Auth.isManager();
  window._registerProdCtxHandlers({
    edit: editProduct,
    canEdit: isManager,
    ret: openSupplierReturnModal,
    canRet: isManager || Auth.canEdit('supplier-returns'),
    del: deleteProduct,
    canDel: isManager,
  });
  // Fixed product quick-add button visibility + overlay click-outside close.
  const qaBtn = document.getElementById('btnCatQuickAdd');
  if (qaBtn) qaBtn.style.display = (isManager || Auth.canEdit('inventory')) ? '' : 'none';
  const qaModal = document.getElementById('catQuickAddModal');
  if (qaModal) qaModal.addEventListener('click', function(e) {
    if (e.target === qaModal) catCloseQuickAddProduct();
  });
}

function catProductCardHTML(p, i) {
  const brand = findBrandById(p.brandId);
  const isManager = Auth.isManager();
  const qtyBadge = p.quantity < 5 ? 'danger' : 'ok';
  return `<div class="prod-card" data-id="${p.id}" ondblclick="${isManager ? `editProduct('${p.id}')` : ''}">
    <div class="prod-card-head">
      <div class="prod-card-head-main">
        <div class="prod-card-title">${escHtml(p.name)}</div>
        <div class="prod-card-meta">
          <span class="prod-meta"><i class="fas fa-tag"></i> ${t('quickEntry.mark')}: <b>${escHtml(p.mark || '-')}</b></span>
          <span class="prod-meta mono"><i class="fas fa-barcode"></i> ${escHtml(p.barcode || '-')}</span>
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
      ${isManager ? `<button class="btn btn-sm" onclick="editProduct('${p.id}')"><i class="fas fa-edit"></i></button>` : ''}
      ${(isManager || Auth.canEdit('supplier-returns')) ? `<button class="btn btn-sm btn-return" onclick="openSupplierReturnModal('${p.id}')" title="${t('supplierReturns.modalTitle')}"><i class="fas fa-undo-alt"></i></button>` : ''}
      ${isManager ? `<button class="btn btn-sm btn-danger" onclick="deleteProduct('${p.id}')"><i class="fas fa-trash"></i></button>` : ''}
    </div>
  </div>`;
}

function renderProducts(q) {
  const ctx = window._brandCtx;
  if (!ctx) return;
  const all = DB.getProductsByBrand(ctx.brandId);
  const qs = (typeof q === 'string') ? normSearch(q) : '';
  // Fast pre-filter over the cached search text + real score for candidates,
  // capped so a huge category never renders an unbounded DOM.
  const products = (qs && qs.trim().length >= 2)
    ? productsMatchingQuery(all, qs, 60)
    : all;
  const container = document.getElementById('categoryProducts');
  if (!container) return;

  if (products.length === 0) {
    if (window._catPager) { window._catPager.destroy(); window._catPager = null; }
    container.innerHTML = `<div class="placeholder-box">
      <i class="fas fa-box-open" style="font-size:48px;color:#555"></i>
      <p>${qs ? 'لا توجد نتائج مطابقة' : 'لا توجد منتجات في هذا التصنيف'}</p>
    </div>`;
    return;
  }

  let grid = document.getElementById('catProdGrid');
  if (!grid) {
    container.innerHTML = '';
    grid = document.createElement('div');
    grid.id = 'catProdGrid';
    grid.className = 'prod-grid';
    container.appendChild(grid);
  }
  if (window._catPager) {
    window._catPager.updateData(products);
  } else {
    window._catPager = new InfiniteScrollPager({
      data: products,
      container: grid,
      pageSize: 25,
      renderItem: (p, i) => catProductCardHTML(p, i),
      renderEmpty: null,
      scrollContainer: document.querySelector('.main-content') || window,
      maxNodes: 400,
    });
    window._activePager = window._catPager;
  }
}

var _catSearchDebounce = null;
function setupProdSearch() {
  const input = document.getElementById('prodSearch');
  if (!input) return;
  input.oninput = function () {
    const v = this.value;
    clearTimeout(_catSearchDebounce);
    _catSearchDebounce = setTimeout(() => renderProducts(v), 300);
  };
}

function openAddProduct() {
  if (!Auth.isManager()) { alert(t('common.noPermission')); return; }
  editingProductId = null;
  document.getElementById('addProductModal').style.display = 'flex';
  applyExpiryField('prodExpiry');
  applyFamilyField('prodFamily');
  if (typeof window.refreshFamilySuggestions === 'function') window.refreshFamilySuggestions();
  resetAddForm();
  setTimeout(() => { const s = document.getElementById('supplierSearchInput'); if (s) s.focus(); }, 50);
}

function resetAddForm() {
  document.getElementById('prodSearchInput').value = '';
  document.getElementById('searchResults').innerHTML = '';
  document.getElementById('selectedProductInfo').style.display = 'none';
  document.getElementById('newProdName').value = '';
  document.getElementById('newProdBar').value = '';
  document.getElementById('barcodeError').textContent = '';
  document.getElementById('prodQty').value = '1';
  document.getElementById('prodBuyPrice').value = '0';
  document.getElementById('prodSellPrice').value = '0';
  document.getElementById('prodWholePrice').value = '0';
  const prodExpiryEl = document.getElementById('prodExpiry');
  if (prodExpiryEl) prodExpiryEl.value = '';
  const prodFamilyEl = document.getElementById('prodFamily');
  if (prodFamilyEl) prodFamilyEl.value = '';
  document.getElementById('supplierSearchInput').value = '';
  document.getElementById('supplierResults').innerHTML = '';
  document.getElementById('selectedSupplierInfo').style.display = 'none';
  document.getElementById('barcodeScannerInput').value = '';
  document.getElementById('scannerResult').style.display = 'none';
  document.getElementById('scannerStatus').textContent = 'جاهز للمسح';
  document.getElementById('scannerStatus').style.color = '#888';
  switchProdTab('search');
}

function closeAddProduct() {
  document.getElementById('addProductModal').style.display = 'none';
}

// ===== QUICK ADD FIXED PRODUCT (no quantity / no buy price / no invoice, brand fixed) =====

function catOpenQuickAddProduct() {
  if (!Auth.isManager() && !Auth.canEdit('inventory')) { alert(t('common.noPermission')); return; }
  const modal = document.getElementById('catQuickAddModal');
  if (!modal) return;
  catResetQuickAddForm();
  applyFamilyField('qaFamily');
  if (typeof window.refreshFamilySuggestions === 'function') window.refreshFamilySuggestions();
  modal.style.display = 'flex';
  setTimeout(() => { const f = document.getElementById('qaName'); if (f) f.focus(); }, 150);
}

function catCloseQuickAddProduct() {
  const modal = document.getElementById('catQuickAddModal');
  if (modal) modal.style.display = 'none';
}

function catResetQuickAddForm() {
  const nameEl = document.getElementById('qaName');
  const barEl = document.getElementById('qaBar');
  const familyEl = document.getElementById('qaFamily');
  const sellEl = document.getElementById('qaSell');
  if (nameEl) nameEl.value = '';
  if (barEl) barEl.value = '';
  if (familyEl) familyEl.value = '';
  if (sellEl) sellEl.value = '0';
}

function catQaBarcodeKey(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const f = document.getElementById('qaName');
  if (f) f.focus();
}

function catConfirmQuickAddProduct() {
  if (!Auth.isManager() && !Auth.canEdit('inventory')) { alert(t('common.noPermission')); return; }
  const ctx = window._brandCtx;
  const name = document.getElementById('qaName').value.trim();
  const barcode = document.getElementById('qaBar').value.trim();
  const family = document.getElementById('qaFamily').value.trim();
  const sellPrice = document.getElementById('qaSell').value;

  const res = quickAddProduct({ name, barcode, brandId: ctx ? ctx.brandId : null, family, sellPrice });
  if (!res.ok) {
    alert(res.error || 'تعذرت الإضافة');
    return;
  }
  catCloseQuickAddProduct();
  renderProducts();
  const msgKey = res.updated ? 'inventory.quickAddUpdated' : 'inventory.quickAddSuccess';
  alert(`${t(msgKey) || 'تمت الإضافة'}: ${res.product.name}`);
}

function switchProdTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('tabSearch').style.display = tab === 'search' ? '' : 'none';
  document.getElementById('tabNew').style.display = tab === 'new' ? '' : 'none';
}

// ===== SEARCH EXISTING PRODUCT =====

function catSearchKey(e) {
  const box = document.getElementById('searchResults');
  if (!box) return;
  const items = Array.prototype.slice.call(box.querySelectorAll('.search-result-item:not(.disabled)'));
  if (!items.length) return;
  let idx = items.findIndex(it => it.classList.contains('qe-sel'));
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    idx = (idx + 1) % items.length;
    catHighlightSearch(items, idx);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    idx = (idx - 1 + items.length) % items.length;
    catHighlightSearch(items, idx);
  } else if (e.key === 'Enter') {
    if (idx >= 0) { e.preventDefault(); items[idx].click(); }
  }
}

function catHighlightSearch(items, idx) {
  items.forEach((it, i) => it.classList.toggle('qe-sel', i === idx));
  if (items[idx].scrollIntoView) items[idx].scrollIntoView({ block: 'nearest' });
}

function searchExistingProduct(q) {
  const results = document.getElementById('searchResults');
  q = normSearch(q);

  const ctx = window._brandCtx;
  const all = DB.getProducts();
  const matches = q
    ? productsMatchingQuery(all, q, 10)
    : all.slice(0, 10);

  if (matches.length === 0) {
    results.innerHTML = '<div class="search-result-item disabled">لا توجد نتائج</div>';
    return;
  }

  results.innerHTML = matches.map(p => {
    const sameBrand = p.brandId === ctx?.brandId;
    return `<div class="search-result-item ${sameBrand ? '' : 'diff-context'}" onclick="selectExistingProduct('${p.id}')">
      <strong>${p.name}</strong>
      <span class="text-muted" dir="ltr">${p.barcode}</span>
      <span class="text-muted">${sameBrand ? '' : p.brandId}</span>
    </div>`;
  }).join('');
}

function selectExistingProduct(id) {
  const p = DB.getProduct(id);
  if (!p) return;
  document.getElementById('selectedProductInfo').style.display = 'flex';
  document.getElementById('selProdName').textContent = p.name;
  document.getElementById('selProdBarcode').textContent = p.barcode;
  document.getElementById('selProdId').value = p.id;
  document.getElementById('selProdBarcodeVal').value = p.barcode;
  document.getElementById('searchResults').innerHTML = '';
  document.getElementById('prodQty').value = '1';
  document.getElementById('prodBuyPrice').value = p.buyPrice;
  document.getElementById('prodSellPrice').value = p.sellPrice;
  document.getElementById('prodWholePrice').value = p.wholesalePrice || 0;
  const prodExpirySel = document.getElementById('prodExpiry');
  if (prodExpirySel) prodExpirySel.value = p.expiryDate || '';
  const prodFamilySel = document.getElementById('prodFamily');
  if (prodFamilySel) prodFamilySel.value = p.family || '';
}

// ===== SUPPLIER SEARCH =====

function searchSuppliers(q) {
  const results = document.getElementById('supplierResults');
  q = normSearch(q);

  const suppliers = DB.getSuppliers();
  const matches = q
    ? suppliers.filter(s => s.name.toLowerCase().includes(q.toLowerCase())).slice(0, 10)
    : suppliers.slice(0, 10);

  if (matches.length === 0) { results.innerHTML = ''; return; }

  results.innerHTML = matches.map(s =>
    `<div class="search-result-item" onclick="selectSupplier('${s.id}')">
      <strong>${s.name}</strong>
      <span class="text-muted">${s.phone || ''}</span>
    </div>`
  ).join('');
}

function selectSupplier(id) {
  const suppliers = DB.getSuppliers();
  const s = suppliers.find(sup => sup.id === id);
  if (!s) return;
  _cartSupplierId = s.id;
  document.getElementById('selectedSupplierInfo').style.display = 'flex';
  document.getElementById('selSupplierName').textContent = s.name;
  document.getElementById('selSupplierPhone').textContent = s.phone || '';
  document.getElementById('supplierResults').innerHTML = '';
}

// ===== BARCODE SCANNER =====

function handleBarcodeScan(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const input = document.getElementById('barcodeScannerInput');
    const code = cleanScannedCode(input.value, { scanner: true });
    if (!code) return;

    document.getElementById('scannerStatus').textContent = 'جاري المعالجة...';
    document.getElementById('scannerStatus').style.color = '#0066B1';

    const existing = DB.getProductByBarcode(code);
    const resultDiv = document.getElementById('scannerResult');

    if (existing) {
  switchProdTab('new');
      document.getElementById('prodSearchInput').value = existing.name;
      searchExistingProduct(existing.name);
      selectExistingProduct(existing.id);

      resultDiv.style.display = 'flex';
      resultDiv.className = 'scanner-result scanner-success';
      resultDiv.innerHTML = `<i class="fas fa-check-circle"></i> تم العثور على: <strong>${existing.name}</strong>`;
      document.getElementById('scannerStatus').textContent = 'تم المسح';
      document.getElementById('scannerStatus').style.color = '#28a745';
      setTimeout(() => document.getElementById('prodQty').focus(), 100);
    } else {
      switchProdTab('new');
      document.getElementById('newProdBar').value = code;
      document.getElementById('newProdName').focus();

      resultDiv.style.display = 'flex';
      resultDiv.className = 'scanner-result scanner-warning';
      resultDiv.innerHTML = `<i class="fas fa-qrcode"></i> منتج جديد - الباركود <strong dir="ltr">${code}</strong>`;
      document.getElementById('scannerStatus').textContent = 'منتج جديد';
      document.getElementById('scannerStatus').style.color = '#f39c12';
    }

    input.value = '';
  }
}

function focusBarcodeScanner() {
  setTimeout(() => {
    const input = document.getElementById('barcodeScannerInput');
    if (input) input.focus();
  }, 200);
}

// ===== CART SYSTEM =====

function getFormItem() {
  const tab = document.querySelector('.tab-btn.active')?.dataset.tab;
  let productId, barcode, name;
  const qty = Unit.parse(document.getElementById('prodQty').value);
  const buyPrice = parseFloat(document.getElementById('prodBuyPrice').value) || 0;
  const sellPrice = parseFloat(document.getElementById('prodSellPrice').value) || 0;
  const wholesalePrice = parseFloat(document.getElementById('prodWholePrice').value) || 0;
  const prodExpiryEl = document.getElementById('prodExpiry');
  const expiryDate = prodExpiryEl ? prodExpiryEl.value : '';
  const family = (document.getElementById('prodFamily')?.value || '').trim();

  if (tab === 'search') {
    productId = document.getElementById('selProdId').value;
    if (!productId) { alert('الرجاء اختيار منتج من نتائج البحث'); return null; }
    const existing = DB.getProduct(productId);
    if (!existing) { alert('المنتج غير موجود'); return null; }
    name = existing.name;
    barcode = existing.barcode;
  } else {
    name = document.getElementById('newProdName').value.trim();
    barcode = document.getElementById('newProdBar').value.trim();
    if (!name) { alert('الرجاء إدخال اسم المنتج'); return null; }
    if (!barcode) { alert('الرجاء إدخال الباركود'); return null; }
  }

  const reference = (document.getElementById('newProdReference')?.value || '').trim();
  const countryOfOrigin = (document.getElementById('newProdCountry')?.value || '').trim();
  const mark = (document.getElementById('newProdMark')?.value || '').trim();
  const storageLocation = (document.getElementById('newProdStorage')?.value || '').trim();

  return { productId, name, barcode, qty, buyPrice, sellPrice, wholesalePrice, family, reference, countryOfOrigin, mark, storageLocation, expiryDate };
}

function addToCart() {
  const ctx = window._brandCtx;
  if (!ctx) { alert('خطأ في السياق'); return; }

  const item = getFormItem();
  if (!item) return;
  if (window.getPharmacyMode() && !item.family) { alert(t('inventory.familyRequired')); return; }

  if (item.barcode) {
    const conflict = DB.findProductsByBarcode(item.barcode).find(p => !DB.isSameProductIdentity(p, item));
    if (conflict) {
      alert(`هذا الباركود مسجّل لمنتج آخر: ${conflict.name} (${conflict.barcode})`);
      return;
    }
  }

  _invoiceCart.push(item);

  renderCart();
  resetAddForm();
  focusBarcodeScanner();
}

function renderCart() {
  const section = document.getElementById('cartSection');
  const container = document.getElementById('cartItems');
  const countEl = document.getElementById('cartCount');
  const totalEl = document.getElementById('cartTotal');

  if (_invoiceCart.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';

  countEl.textContent = `(${_invoiceCart.length})`;
  const total = _invoiceCart.reduce((sum, item) => sum + item.qty * item.buyPrice, 0);
  totalEl.textContent = `DA${fmtMoney(total)}`;

  container.innerHTML = _invoiceCart.map((item, i) =>
    `<div class="cart-item">
      <div class="cart-item-info">
        <strong>${item.name}</strong>
        <span class="text-muted">${item.barcode}</span>
      </div>
      <div class="cart-item-details">
        <span>${Unit.qtyUnit(item.qty, item)} × DA${fmtMoney(item.buyPrice)}</span>
        <span class="cart-item-total">DA${fmtMoney((item.qty * item.buyPrice))}</span>
      </div>
      <button class="btn btn-sm btn-danger" onclick="removeFromCart(${i})"><i class="fas fa-times"></i></button>
    </div>`
  ).join('');
}

function removeFromCart(idx) {
  _invoiceCart.splice(idx, 1);
  renderCart();
}

function clearCart() {
  if (_invoiceCart.length === 0) return;
  if (!confirm('تفريغ سلة الفاتورة؟')) return;
  _invoiceCart = [];
  renderCart();
}

function confirmInvoice() {
  if (_invoiceCart.length === 0) { alert('سلة الفاتورة فارغة'); return; }

  const ctx = window._brandCtx;
  if (!ctx) { alert('خطأ في السياق'); return; }

  const supplierId = _cartSupplierId || document.getElementById('selSupplierId').value || null;
  let totalAmount = 0;
  const invoiceItems = [];

  for (const item of _invoiceCart) {
    if (item.barcode) {
      const conflict = DB.findProductsByBarcode(item.barcode).find(p => !DB.isSameProductIdentity(p, item));
      if (conflict) {
        _invoiceCart = [];
        renderCart();
        closeAddProduct();
        renderProducts();
        alert(`هذا الباركود مسجّل لمنتج آخر: ${conflict.name} (${conflict.barcode})`);
        return;
      }
    }
  }

  _invoiceCart.forEach(item => {
    const itemTotal = item.qty * item.buyPrice;
    totalAmount += itemTotal;

    // Follow barcode reuse rules: block other products, merge same product +
    // same prices, keep a separate row when prices differ.
    const res = DB.addOrMergeProduct({
      name: item.name, barcode: item.barcode,
      brandId: ctx.brandId,
      buyPrice: item.buyPrice, sellPrice: item.sellPrice,
      wholesalePrice: item.wholesalePrice || 0,
      quantity: item.qty, supplierId,
      family: item.family || '',
      reference: item.reference || '', countryOfOrigin: item.countryOfOrigin || '',
      mark: item.mark || '', storageLocation: item.storageLocation || '',
      expiryDate: item.expiryDate || '',
    });

    if (!res.ok) {
      const msg = res.existing
        ? `هذا الباركود مسجّل لمنتج آخر: ${res.existing.name} (${res.existing.barcode})`
        : 'الباركود غير صالح';
      _invoiceCart = [];
      renderCart();
      closeAddProduct();
      renderProducts();
      alert(msg);
      return;
    }

    const prod = res.product;
    invoiceItems.push({
      productId: prod.id,
      barcode: prod.barcode,
      name: item.name,
      qty: item.qty,
      price: item.buyPrice,
      total: itemTotal,
    });
  });

  // Calculate timbre fiscal
  const timbreEnabled = document.getElementById('catTimbreCheck').checked;
  const timbreRate = parseFloat(localStorage.getItem('zmt_timbre_rate') || '1');
  let timbreFiscal = 0;
  if (timbreEnabled) {
    timbreFiscal = totalAmount * (timbreRate / 100);
    if (timbreFiscal < 5) timbreFiscal = 5;
    if (timbreFiscal > 10000) timbreFiscal = 10000;
  }

  // Create invoice
  if (supplierId) {
    DB.addInvoice({
      supplierId, type: 'supplier',
      date: Date.now(), items: invoiceItems, totalAmount, timbreFiscal,
    });
    const suppliers = DB.getSuppliers();
    const supIdx = suppliers.findIndex(s => s.id === supplierId);
    if (supIdx !== -1) {
      suppliers[supIdx].balance = (parseFloat(suppliers[supIdx].balance) || 0) + totalAmount;
      DB.saveSuppliers(suppliers);
    }
  } else {
    DB.addInvoice({
      supplierId: null, type: 'purchase',
      date: Date.now(), items: invoiceItems, totalAmount, timbreFiscal,
    });
  }

  _invoiceCart = [];
  _cartSupplierId = null;
  renderCart();
  closeAddProduct();
  renderProducts();

  const productCount = invoiceItems.length;
  const totalQty = invoiceItems.reduce((s, it) => s + it.qty, 0);
  let msg = `تم تسجيل فاتورة بقيمة DA${fmtMoney(totalAmount)} تشمل ${productCount} منتج (${totalQty} قطعة)`;
  if (timbreFiscal > 0) msg += ` + طابع جبائي DA${fmtMoney(timbreFiscal)}`;
  alert(msg);
}

// ===== EDIT / DELETE =====

function editProduct(id) {
  if (!Auth.isManager()) { alert(t('common.noPermission')); return; }
  const p = DB.getProduct(id);
  if (!p) return;
  editingProductId = id;
  document.getElementById('addProductModal').style.display = 'flex';
  applyExpiryField('prodExpiry');
  applyFamilyField('prodFamily');
  if (typeof window.refreshFamilySuggestions === 'function') window.refreshFamilySuggestions();
  document.getElementById('selProdId').value = p.id;
  document.getElementById('selProdBarcodeVal').value = p.barcode;
  document.getElementById('selectedProductInfo').style.display = 'flex';
  document.getElementById('selProdName').textContent = p.name;
  document.getElementById('selProdBarcode').textContent = p.barcode;
  document.getElementById('prodQty').value = p.quantity;
  document.getElementById('prodBuyPrice').value = p.buyPrice;
  document.getElementById('prodSellPrice').value = p.sellPrice;
  document.getElementById('prodWholePrice').value = p.wholesalePrice || 0;
  const prodExpiryEdit = document.getElementById('prodExpiry');
  if (prodExpiryEdit) prodExpiryEdit.value = p.expiryDate || '';
  const prodFamilyEdit = document.getElementById('prodFamily');
  if (prodFamilyEdit) prodFamilyEdit.value = p.family || '';
  if (p.supplierId) {
    const sup = DB.getSuppliers().find(s => s.id === p.supplierId);
    if (sup) {
      document.getElementById('selectedSupplierInfo').style.display = 'flex';
      document.getElementById('selSupplierName').textContent = sup.name;
      document.getElementById('selSupplierPhone').textContent = sup.phone || '';
      document.getElementById('selSupplierId').value = sup.id;
    }
  }
  switchProdTab('search');
}

function deleteProduct(id) {
  if (!Auth.isManager()) { alert(t('common.noPermission')); return; }
  if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;
  const p = DB.getProduct(id);
  if (!p) return;

  const invoices = DB.getInvoices();
  invoices.forEach(inv => {
    const itemIdx = inv.items.findIndex(item => item.productId === id);
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
  renderProducts();
}

function _catProdModalHandler(e) {
  const modal = document.getElementById('addProductModal');
  if (e.target === modal) closeAddProduct();
}
document.removeEventListener('click', _catProdModalHandler);
document.addEventListener('click', _catProdModalHandler);
if (window._pageListeners) window._pageListeners.push({ type: 'click', fn: _catProdModalHandler });

// ===== LAN SYNC: re-render product list without closing open modals =====
window._pageSyncHandlers = window._pageSyncHandlers || {};
window._pageSyncHandlers['category-products'] = function categoryProductsSyncData() {
  window.syncPreserveRefresh({
    search: ['prodSearch'],
    render: () => {
      renderProducts();
      const input = document.getElementById('prodSearch');
      if (input && input.value && typeof input.oninput === 'function') input.oninput();
    },
  });
};

window.addEventListener('zmt:buyprice-toggle', function(){ renderProducts(); renderCart(); });
