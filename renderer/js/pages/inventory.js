var _invCart = [];
var _invCartSupplierId = null;
var _invProducts = [];
var _invFiltered = [];
var _invPager = null;

function init_inventory() {
  _invProducts = DB.getProducts();
  _invFiltered = [..._invProducts];
  if (_invPager) { _invPager.destroy(); _invPager = null; }
  _invPager = new InfiniteScrollPager({
    data: _invFiltered,
    container: document.getElementById('invBody'),
    pageSize: 20,
    renderItem: _renderInvRow,
    renderEmpty: () => `<tr><td colspan="9" class="empty-row"><i class="fas fa-box-open"></i> ${t('inventory.empty')}</td></tr>`,
    scrollContainer: document.querySelector('.main-content') || window,
  });
  window._activePager = _invPager;
  setupInvSearch();
  setupTransferButton();
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

function populateInvBrands() {
  const sel = document.getElementById('invBrand');
  sel.innerHTML = [...BRANDS.global, ...BRANDS.chinese].map(b =>
    `<option value="${b.id}">${b.name}</option>`
  ).join('');
}

function populateInvCategories() {
  const sel = document.getElementById('invCategory');
  sel.innerHTML = DB.getCategories().map(c =>
    `<option value="${c}">${c}</option>`
  ).join('');
}

function renderInventory() {
  _invProducts = DB.getProducts();
  applyInvFilter();
}

function _renderInvRow(p, idx) {
  const brands = [...BRANDS.global, ...BRANDS.chinese];
  const brand = brands.find(b => b.id === p.brandId);
  return `<tr>
    <td>${idx + 1}</td>
    <td><strong>${p.name}</strong></td>
    <td dir="ltr">${p.barcode}</td>
    <td>${brand ? brand.name : p.brandId}</td>
    <td>${p.category || '-'}</td>
    <td class="${p.quantity < 5 ? 'text-danger' : ''}">${p.quantity}</td>
    <td class="hide-user">DA${p.buyPrice.toFixed(2)}</td>
    <td>DA${p.sellPrice.toFixed(2)}</td>
    <td>
      <button class="btn btn-sm ${Auth.isManager() ? '' : 'hide-user'}" onclick="editInventoryItem('${p.id}')"><i class="fas fa-edit"></i></button>
      <button class="btn btn-sm btn-danger ${Auth.isManager() ? '' : 'hide-user'}" onclick="deleteInventoryItem('${p.id}')"><i class="fas fa-trash"></i></button>
    </td>
  </tr>`;
}

function applyInvFilter() {
  const q = normSearch(document.getElementById('invSearch')?.value || '').toLowerCase();
  _invFiltered = q
    ? _invProducts.filter(p => p.name.toLowerCase().includes(q) || p.barcode.includes(q))
    : [..._invProducts];
  if (_invPager) _invPager.updateData(_invFiltered);
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
  populateInvBrands();
  populateInvCategories();
  document.getElementById('invAddModal').style.display = 'flex';
  resetInvForm();
  setTimeout(() => document.getElementById('invBarcodeScanner').focus(), 200);
}

function closeInvAddModal() {
  document.getElementById('invAddModal').style.display = 'none';
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
    const code = input.value.trim();
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

function searchInvProduct(q) {
  const results = document.getElementById('invSearchResults');
  q = normSearch(q);

  const products = DB.getProducts();
  const matches = q
    ? products.filter(p =>
        p.name.toLowerCase().includes(q.toLowerCase()) || p.barcode.includes(q)
      ).slice(0, 10)
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
  document.getElementById('invCategory').value = p.category || DB.getCategories()[0];
  document.getElementById('invBuyPrice').value = p.buyPrice;
  document.getElementById('invSellPrice').value = p.sellPrice;
  document.getElementById('invWholePrice').value = p.wholesalePrice || 0;
  document.getElementById('invQty').value = '1';
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
  const name = document.getElementById('invProdName').value.trim();
  const barcode = document.getElementById('invProdBar').value.trim();
  const brandId = document.getElementById('invBrand').value;
  const category = document.getElementById('invCategory').value;
  const qty = parseInt(document.getElementById('invQty').value) || 1;
  const buyPrice = parseFloat(document.getElementById('invBuyPrice').value) || 0;
  const sellPrice = parseFloat(document.getElementById('invSellPrice').value) || 0;
  const wholesalePrice = parseFloat(document.getElementById('invWholePrice').value) || 0;

  if (!name) { alert(t('inventory.enterName')); return; }
  if (!barcode) { alert(t('inventory.enterBarcode')); return; }

  _invCart.push({ name, barcode, brandId, category, qty, buyPrice, sellPrice, wholesalePrice });
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
  totalEl.textContent = `DA${total.toFixed(2)}`;

  container.innerHTML = _invCart.map((item, i) =>
    `<div class="cart-item">
      <div class="cart-item-info">
        <strong>${item.name}</strong>
        <span class="text-muted">${item.barcode}</span>
      </div>
      <div class="cart-item-details">
        <span>${item.qty} × DA${item.buyPrice.toFixed(2)}</span>
        <span class="cart-item-total">DA${(item.qty * item.buyPrice).toFixed(2)}</span>
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
  document.getElementById('invCartTotal').textContent = 'DA' + total.toFixed(2);
  const timbreEl = document.getElementById('invTimbreAmount');
  if (timbreEnabled && timbreAmount > 0) {
    timbreEl.textContent = '+ DA' + timbreAmount.toFixed(2);
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

  _invCart.forEach(item => {
    const itemTotal = item.qty * item.buyPrice;
    totalAmount += itemTotal;

    const prod = DB.addProduct({
      name: item.name, barcode: item.barcode,
      brandId: item.brandId, category: item.category,
      buyPrice: item.buyPrice, sellPrice: item.sellPrice,
      wholesalePrice: item.wholesalePrice || 0,
      quantity: item.qty, supplierId,
    });

    invoiceItems.push({
      productId: prod.id, barcode: item.barcode,
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
  let msg = `${t('inventory.invoiceSaved')} DA${totalAmount.toFixed(2)}`;
  if (timbreFiscal > 0) msg += ` + ${t('inventory.fiscalStamp')} DA${timbreFiscal.toFixed(2)}`;
  msg += ` ${t('inventory.includes')} ${cnt} ${t('inventory.productUnit')} (${totalQty} ${t('inventory.pieceUnit')})`;
  alert(msg);
}

// ========== EDIT / DELETE ==========

function editInventoryItem(id) {
  const p = DB.getProduct(id);
  if (!p) return;

  const allBrands = [...BRANDS.global, ...BRANDS.chinese];
  const brandOptions = allBrands.map(b => `<option value="${b.id}" ${b.id === p.brandId ? 'selected' : ''}>${b.name}</option>`).join('');
  const catOptions = DB.getCategories().map(c => `<option value="${c}" ${c === p.category ? 'selected' : ''}>${c}</option>`).join('');

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
      <div class="form-group">
        <label>${t('inventory.editLabelBrand')}</label>
        <select class="form-input" id="invEditBrand">${brandOptions}</select>
      </div>
      <div class="form-group">
        <label>${t('inventory.editLabelCategory')}</label>
        <select class="form-input" id="invEditCat">${catOptions}</select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>${t('inventory.editLabelQty')}</label>
        <input type="number" class="form-input no-spinner" id="invEditQty" value="${p.quantity}" min="0">
      </div>
      <div class="form-group">
        <label>${t('inventory.editLabelBuyPrice')}</label>
        <input type="number" class="form-input no-spinner" id="invEditBuy" value="${p.buyPrice}" min="0">
      </div>
      <div class="form-group">
        <label>${t('inventory.editLabelSellPrice')}</label>
        <input type="number" class="form-input no-spinner" id="invEditSell" value="${p.sellPrice}" min="0">
      </div>
    </div>
    <div class="form-group">
      <label>${t('inventory.editLabelWholesale')}</label>
      <input type="number" class="form-input no-spinner" id="invEditWhole" value="${p.wholesalePrice || 0}" min="0">
    </div>`;

  showModal(t('inventory.editTitle'), html, () => {
    const oldQty = p.quantity;
    const oldBuyPrice = p.buyPrice;
    const newQty = parseInt(document.getElementById('invEditQty').value) || 0;
    const newBuyPrice = parseFloat(document.getElementById('invEditBuy').value) || 0;
    const newSellPrice = parseFloat(document.getElementById('invEditSell').value) || 0;
    const newWholePrice = parseFloat(document.getElementById('invEditWhole').value) || 0;

    DB.updateProduct(id, {
      name: document.getElementById('invEditName').value.trim() || p.name,
      barcode: document.getElementById('invEditBar').value.trim() || p.barcode,
      brandId: document.getElementById('invEditBrand').value,
      category: document.getElementById('invEditCat').value,
      quantity: newQty, buyPrice: newBuyPrice, sellPrice: newSellPrice, wholesalePrice: newWholePrice,
    });

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
}

function deleteInventoryItem(id) {
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

// ========== EXPORT / IMPORT CSV ==========

function exportProductsCSV() {
  const csv = DB.exportProductsCSV();
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ZMT_PIECE_Products_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importProductsCSV(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const result = DB.importProductsCSV(e.target.result);
    if (result.count > 0) {
      renderInventory();
      let msg = `${t('inventory.importSuccess')} ${result.count} ${t('inventory.importSuccessEnd')}`;
      if (result.totalCost > 0) {
        msg += `\n${t('inventory.importCost')} DA${result.totalCost.toFixed(2)} (${t('inventory.importRecorded')})`;
      }
      alert(msg);
    } else {
      alert(t('inventory.importFailed'));
    }
    input.value = '';
  };
  reader.readAsText(file, 'UTF-8');
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