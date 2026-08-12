var editingProductId = null;
var _invoiceCart = [];
var _cartSupplierId = null;

function init_category_products() {
  const ctx = window.catCtx;
  if (!ctx) { navigateTo('brands'); return; }

  const brand = [...BRANDS.global, ...BRANDS.chinese].find(b => b.id === ctx.brandId);
  if (!brand) { navigateTo('brands'); return; }

  document.getElementById('catTitle').textContent = `${brand.name} - ${ctx.category}`;
  document.getElementById('catSub').textContent = 'المنتجات المتوفرة';
  window._brandCtx = ctx;

  renderProducts();
  setupProdSearch();
  const sc = document.getElementById('barcodeScannerInput');
  if (sc && !sc._zmtCleanBound) {
    sc._zmtCleanBound = true;
    sc.addEventListener('input', function() {
      const cleaned = cleanScannedCode(this.value);
      if (cleaned !== this.value) this.value = cleaned;
    });
  }
}

function renderProducts() {
  const ctx = window._brandCtx;
  if (!ctx) return;
  const products = DB.getProductsByBrandCategory(ctx.brandId, ctx.category);
  const container = document.getElementById('categoryProducts');

  if (products.length === 0) {
    container.innerHTML = `<div class="placeholder-box">
      <i class="fas fa-box-open" style="font-size:48px;color:#555"></i>
      <p>لا توجد منتجات في هذا التصنيف</p>
    </div>`;
    return;
  }

  const isManager = Auth.isManager();
  container.innerHTML = `<div class="table-container">
    <table class="data-table">
      <thead><tr>
        <th>#</th>
        <th>الاسم</th>
        <th>الباركود</th>
        <th>الكمية</th>
        <th>${isManager ? 'سعر الشراء' : ''}</th>
        <th>سعر البيع</th>
        <th>المورد</th>
        <th>إجراءات</th>
      </tr></thead>
      <tbody id="prodTableBody"></tbody>
    </table>
  </div>`;

  const tbody = document.getElementById('prodTableBody');
  const suppliers = DB.getSuppliers();
  const rows = products.map((p, i) => {
    const sup = p.supplierId ? suppliers.find(s => s.id === p.supplierId) : null;
    return `<tr>
      <td>${i + 1}</td>
      <td><strong>${p.name}</strong></td>
      <td dir="ltr">${p.barcode}</td>
      <td>${p.quantity}</td>
      <td>${isManager ? `DA${p.buyPrice.toFixed(2)}` : '-'}</td>
      <td>DA${p.sellPrice.toFixed(2)}</td>
      <td>${sup ? sup.name : '-'}</td>
      <td>
        <button class="btn btn-sm" onclick="openPrintBarcodeModal('${p.id}')" title="طباعة باركود"><i class="fas fa-barcode"></i></button>
        ${isManager ? `<button class="btn btn-sm" onclick="editProduct('${p.id}')"><i class="fas fa-edit"></i></button>` : ''}
        ${(isManager || Auth.canEdit('supplier-returns')) ? `<button class="btn btn-sm btn-return" onclick="openSupplierReturnModal('${p.id}')" title="${t('supplierReturns.modalTitle')}"><i class="fas fa-undo-alt"></i></button>` : ''}
        ${isManager ? `<button class="btn btn-sm btn-danger" onclick="deleteProduct('${p.id}')"><i class="fas fa-trash"></i></button>` : ''}
      </td>
    </tr>`;
  });
  tbody.innerHTML = rows.join('');
}

function setupProdSearch() {
  const input = document.getElementById('prodSearch');
  if (input) {
    input.oninput = function() {
      const q = this.value.toLowerCase();
      const rows = document.querySelectorAll('#prodTableBody tr');
      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(q) ? '' : 'none';
      });
    };
  }
}

function openAddProduct() {
  if (!Auth.isManager()) { alert(t('common.noPermission')); return; }
  editingProductId = null;
  document.getElementById('addProductModal').style.display = 'flex';
  resetAddForm();
  focusBarcodeScanner();
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

function switchProdTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('tabSearch').style.display = tab === 'search' ? '' : 'none';
  document.getElementById('tabNew').style.display = tab === 'new' ? '' : 'none';
}

// ===== SEARCH EXISTING PRODUCT =====

function searchExistingProduct(q) {
  const results = document.getElementById('searchResults');
  q = normSearch(q);

  const ctx = window._brandCtx;
  const all = DB.getProducts();
  const matches = q
    ? all.filter(p =>
        p.name.toLowerCase().includes(q.toLowerCase()) ||
        p.barcode.includes(q)
      ).slice(0, 10)
    : all.slice(0, 10);

  if (matches.length === 0) {
    results.innerHTML = '<div class="search-result-item disabled">لا توجد نتائج</div>';
    return;
  }

  results.innerHTML = matches.map(p => {
    const sameBrand = p.brandId === ctx?.brandId && p.category === ctx?.category;
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
    const code = cleanScannedCode(input.value);
    if (!code) return;

    document.getElementById('scannerStatus').textContent = 'جاري المعالجة...';
    document.getElementById('scannerStatus').style.color = '#0066B1';

    const existing = DB.getProductByBarcode(code);
    const resultDiv = document.getElementById('scannerResult');

    if (existing) {
      switchProdTab('search');
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
  const qty = parseInt(document.getElementById('prodQty').value) || 1;
  const buyPrice = parseFloat(document.getElementById('prodBuyPrice').value) || 0;
  const sellPrice = parseFloat(document.getElementById('prodSellPrice').value) || 0;
  const wholesalePrice = parseFloat(document.getElementById('prodWholePrice').value) || 0;

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

  return { productId, name, barcode, qty, buyPrice, sellPrice, wholesalePrice };
}

function addToCart() {
  const ctx = window._brandCtx;
  if (!ctx) { alert('خطأ في السياق'); return; }

  const item = getFormItem();
  if (!item) return;

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
  totalEl.textContent = `DA${total.toFixed(2)}`;

  container.innerHTML = _invoiceCart.map((item, i) =>
    `<div class="cart-item">
      <div class="cart-item-info">
        <strong>${item.name}</strong>
        <span class="text-muted">${item.barcode}</span>
      </div>
      <div class="cart-item-details">
        <span>${item.qty} × DA${item.buyPrice.toFixed(2)}</span>
        <span class="cart-item-total">DA${(item.qty * item.buyPrice).toFixed(2)}</span>
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
      brandId: ctx.brandId, category: ctx.category,
      buyPrice: item.buyPrice, sellPrice: item.sellPrice,
      wholesalePrice: item.wholesalePrice || 0,
      quantity: item.qty, supplierId,
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
  let msg = `تم تسجيل فاتورة بقيمة DA${totalAmount.toFixed(2)} تشمل ${productCount} منتج (${totalQty} قطعة)`;
  if (timbreFiscal > 0) msg += ` + طابع جبائي DA${timbreFiscal.toFixed(2)}`;
  alert(msg);
}

// ===== EDIT / DELETE =====

function editProduct(id) {
  if (!Auth.isManager()) { alert(t('common.noPermission')); return; }
  const p = DB.getProduct(id);
  if (!p) return;
  editingProductId = id;
  document.getElementById('addProductModal').style.display = 'flex';
  document.getElementById('selProdId').value = p.id;
  document.getElementById('selProdBarcodeVal').value = p.barcode;
  document.getElementById('selectedProductInfo').style.display = 'flex';
  document.getElementById('selProdName').textContent = p.name;
  document.getElementById('selProdBarcode').textContent = p.barcode;
  document.getElementById('prodQty').value = p.quantity;
  document.getElementById('prodBuyPrice').value = p.buyPrice;
  document.getElementById('prodSellPrice').value = p.sellPrice;
  document.getElementById('prodWholePrice').value = p.wholesalePrice || 0;
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
  renderProducts();
  const input = document.getElementById('prodSearch');
  if (input && input.value && typeof input.oninput === 'function') input.oninput();
};
