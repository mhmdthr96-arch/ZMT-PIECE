// ============================================================
// ZMT Transfer Page - Inter-Store Product Transfer
// ============================================================

var _transferCart = [];
var _transferAccessibleStores = [];

function init_transfer() {
  _transferCart = [];
  loadTransferStores();
  renderTransferStoreInfo();
  setupTransferSearch();

  const brandSel = document.getElementById('transferItemBrand');
  if (brandSel) brandSel.innerHTML = (typeof buildBrandSelectOptions === 'function')
    ? buildBrandSelectOptions()
    : [...BRANDS.global, ...BRANDS.chinese].map(b => `<option value="${b.id}">${b.name}</option>`).join('');

  const sc = document.getElementById('transferBarcodeScanner');
  if (sc && !sc._zmtCleanBound) {
    sc._zmtCleanBound = true;
    sc.addEventListener('input', function() {
      const cleaned = cleanScannedCode(this.value, { scanner: true });
      if (cleaned !== this.value) this.value = cleaned;
    });
  }
}

function renderTransferStoreInfo() {
  const code = Auth.getUserCode();
  const type = Auth.getStoreType();
  const name = localStorage.getItem('zmt_store_name') || 'ZMT PIECE';
  document.getElementById('transferFromCode').textContent = `${name} (${code})`;
  document.getElementById('transferFromCode').dir = 'ltr';
}

async function loadTransferStores() {
  const destSel = document.getElementById('transferDestSelect');
  if (!destSel) return;

  destSel.innerHTML = `<option value="">${t('transfer.loading')}</option>`;

  try {
    const type = Auth.getStoreType();
    const myCode = Auth.getUserCode();
    const parentCode = Auth.getParentCode();

    if (type === 'main') {
      const branches = await Auth.listBranchesFull(myCode);
      let html = `<option value="">-- ${t('transfer.chooseDest')} --</option>`;
      for (const b of branches) {
        html += `<option value="${b.code}">🏢 ${b.name} (${b.code})</option>`;
      }
      destSel.innerHTML = html;
      _transferAccessibleStores = branches.map(b => ({ code: b.code, name: b.name, type: 'branch' }));
    } else if (type === 'branch') {
      let html = `<option value="">-- ${t('transfer.chooseDest')} --</option>`;
      if (parentCode) {
        html += `<option value="${parentCode}">🏠 ${t('transfer.mainStore')} (${parentCode})</option>`;
        _transferAccessibleStores = [{ code: parentCode, name: t('transfer.mainStore'), type: 'main' }];
        try {
          const branches = await Auth.listBranchesFull(parentCode);
          for (const b of branches) {
            if (b.code !== myCode) {
              html += `<option value="${b.code}">🏢 ${b.name} (${b.code})</option>`;
              _transferAccessibleStores.push({ code: b.code, name: b.name, type: 'branch' });
            }
          }
        } catch (e) {
          console.warn('[Transfer] Could not list sibling branches:', e);
        }
      }
      destSel.innerHTML = html;
    }
  } catch (e) {
    console.error('[Transfer] Error loading stores:', e);
    destSel.innerHTML = `<option value="">${t('transfer.loadError')}</option>`;
  }
}

function onTransferDestChange() {
  const destCode = document.getElementById('transferDestSelect').value;
  const codeEl = document.getElementById('transferToCode');
  if (destCode) {
    const store = _transferAccessibleStores.find(s => s.code === destCode);
    codeEl.textContent = store ? `${store.name} (${destCode})` : destCode;
  } else {
    codeEl.textContent = '--';
  }
  updateTransferExecSection();
}

// ===== DONATION (FREE TRANSFER) =====

function isTransferDonation() {
  const el = document.getElementById('transferDonation');
  return el ? el.checked : false;
}

function onTransferDonationToggle() {
  const donation = isTransferDonation();
  const warnEl = document.getElementById('transferDonationWarning');

  if (donation) {
    if (!confirm(`${t('transfer.donationWarning')}\n\n${t('transfer.confirmContinue')}`)) {
      document.getElementById('transferDonation').checked = false;
      return;
    }
    warnEl.style.display = '';
    _transferCart.forEach(it => { it.buyPrice = 0; });
  } else {
    warnEl.style.display = 'none';
  }

  const bpInput = document.getElementById('transferItemBuyPrice');
  bpInput.disabled = donation;
  if (donation) bpInput.value = '0';

  renderTransferCart();
}

// ===== BARCODE SCANNER =====

function handleTransferBarcodeScan(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();

  const input = document.getElementById('transferBarcodeScanner');
  const code = cleanScannedCode(input.value, { scanner: true });
  if (!code) return;

  document.getElementById('transferScannerStatus').textContent = t('transfer.scannerProcessing');
  document.getElementById('transferScannerStatus').style.color = '#0066B1';

  const product = DB.getProductByBarcode(code);
  const resultDiv = document.getElementById('transferScannerResult');

  if (product) {
    fillTransferFromProduct(product);
    resultDiv.style.display = 'flex';
    resultDiv.className = 'scanner-result scanner-success';
    resultDiv.innerHTML = `<i class="fas fa-check-circle"></i> ${t('transfer.scannerFound')} <strong>${product.name}</strong>`;
    document.getElementById('transferScannerStatus').textContent = t('transfer.scannerDone');
    document.getElementById('transferScannerStatus').style.color = '#28a745';
    setTimeout(() => document.getElementById('transferItemQty').focus(), 100);
  } else {
    resultDiv.style.display = 'flex';
    resultDiv.className = 'scanner-result scanner-warning';
    resultDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${t('transfer.scannerNotFound')} <strong dir="ltr">${code}</strong> ${t('transfer.scannerNotInStock')}`;
    document.getElementById('transferScannerStatus').textContent = t('transfer.scannerNotFoundShort');
    document.getElementById('transferScannerStatus').style.color = '#f39c12';
  }
  input.value = '';
}

// ===== PRODUCT SEARCH =====

function setupTransferSearch() {
  const input = document.getElementById('transferProdSearch');
  if (!input) return;
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  newInput.addEventListener('input', (typeof debounce === 'function') ? debounce(function() { searchTransferProduct(this.value); }, 180) : function() { searchTransferProduct(this.value); });
}

function searchTransferProduct(q) {
  const results = document.getElementById('transferSearchResults');
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
    results.innerHTML = `<div class="search-result-item disabled">${t('transfer.noResults')}</div>`;
    return;
  }

  const brands = [...BRANDS.global, ...BRANDS.chinese];
  results.innerHTML = matches.map(p => {
    const brand = brands.find(b => b.id === p.brandId);
    return `<div class="search-result-item" onclick="fillTransferFromProduct('${p.id}')">
      <strong>${p.name}</strong>
      <div>
        <span class="text-muted" dir="ltr">${p.barcode}</span>
        <span style="margin-left:8px;font-size:11px;color:var(--bmw-blue-1);font-weight:600">${t('transfer.stock')} ${p.quantity}</span>
      </div>
    </div>`;
  }).join('');
}

function fillTransferFromProduct(id) {
  const product = typeof id === 'string' ? DB.getProduct(id) : id;
  if (!product) return;

  document.getElementById('transferProdSearch').value = product.name;
  document.getElementById('transferSearchResults').innerHTML = '';
  document.getElementById('transferSelectedProduct').style.display = 'flex';
  document.getElementById('transferSelName').textContent = product.name;
  document.getElementById('transferSelBarcode').textContent = product.barcode;

  document.getElementById('transferItemName').value = product.name;
  document.getElementById('transferItemAvail').value = product.quantity;
  document.getElementById('transferItemQty').value = '1';
  document.getElementById('transferItemQty').max = product.quantity;
  document.getElementById('transferItemBuyPrice').value = isTransferDonation() ? 0 : product.buyPrice;
  document.getElementById('transferItemBuyPrice').disabled = isTransferDonation();
  document.getElementById('transferItemSellPrice').value = product.sellPrice;

  const brandSel = document.getElementById('transferItemBrand');
  if (brandSel) brandSel.value = product.brandId;

  document.getElementById('transferItemForm').style.display = '';
}

// ===== TRANSFER CART =====

function addTransferItem() {
  const destCode = document.getElementById('transferDestSelect').value;
  if (!destCode) { alert(t('transfer.selectDestFirst')); return; }

  const name = document.getElementById('transferItemName').value.trim();
  const avail = parseInt(document.getElementById('transferItemAvail').value) || 0;
  const qty = parseInt(document.getElementById('transferItemQty').value) || 0;
  let buyPrice = parseFloat(document.getElementById('transferItemBuyPrice').value) || 0;
  const sellPrice = parseFloat(document.getElementById('transferItemSellPrice').value) || 0;
  const brandId = document.getElementById('transferItemBrand').value;

  if (!name) { alert(t('transfer.searchFirst')); return; }
  if (qty <= 0) { alert(t('transfer.qtyZero')); return; }
  if (qty > avail) { alert(`${t('transfer.qtyExceeds')} (${qty}) ${t('transfer.qtyExceedsAvail')} (${avail})`); return; }
  if (isTransferDonation()) {
    buyPrice = 0;
  } else if (buyPrice <= 0) {
    alert(t('transfer.buyPriceZero')); return;
  }

  const selectedProduct = document.getElementById('transferSelectedProduct');
  let productId = null;
  if (selectedProduct.style.display !== 'none') {
    const barcode = document.getElementById('transferSelBarcode')?.textContent;
    if (barcode) {
      const prod = DB.getProducts().find(p => p.barcode === barcode);
      if (prod) productId = prod.id;
    }
  }

  _transferCart.push({
    productId, name, qty, buyPrice, sellPrice, brandId, availQty: avail
  });
  renderTransferCart();
  resetTransferItemForm();
}

function renderTransferCart() {
  const section = document.getElementById('transferCartSection');
  const container = document.getElementById('transferCartItems');
  const countEl = document.getElementById('transferCartCount');
  const totalEl = document.getElementById('transferCartTotal');

  if (_transferCart.length === 0) {
    section.style.display = 'none';
    document.getElementById('transferPaymentSection').style.display = 'none';
    updateTransferExecSection();
    return;
  }
  section.style.display = '';

  const brands = [...BRANDS.global, ...BRANDS.chinese];
  countEl.textContent = `(${_transferCart.length})`;
  const total = _transferCart.reduce((sum, item) => sum + item.qty * item.buyPrice, 0);
  totalEl.textContent = `DA${fmtMoney(total)}`;

  container.innerHTML = _transferCart.map((item, i) => {
    const brand = brands.find(b => b.id === item.brandId);
    return `<div class="cart-item">
      <div class="cart-item-info">
        <strong>${item.name}</strong>
        <span class="text-muted">${brand ? brand.name : item.brandId} | ${t('transfer.available')} ${item.availQty}</span>
      </div>
      <div class="cart-item-details">
        <span>${item.qty} × DA${fmtMoney(item.buyPrice)}</span>
        <span class="cart-item-total">DA${fmtMoney((item.qty * item.buyPrice))}</span>
      </div>
      <button class="btn btn-sm btn-danger" onclick="removeTransferItem(${i})"><i class="fas fa-times"></i></button>
    </div>`;
  }).join('');

  document.getElementById('transferPaymentSection').style.display = isTransferDonation() ? 'none' : '';
  document.getElementById('transferPayTotal').textContent = `DA${fmtMoney(total)}`;
  const payInput = document.getElementById('transferPayAmount');
  if (parseFloat(payInput.value) > total) payInput.value = total;
  updateTransferPaymentSummary();
  updateTransferExecSection();
}

function removeTransferItem(idx) {
  _transferCart.splice(idx, 1);
  renderTransferCart();
}

function clearTransferCart() {
  if (_transferCart.length === 0) return;
  if (!confirm(t('transfer.clearCartConfirm'))) return;
  _transferCart = [];
  renderTransferCart();
}

function resetTransferItemForm() {
  document.getElementById('transferProdSearch').value = '';
  document.getElementById('transferSearchResults').innerHTML = '';
  document.getElementById('transferSelectedProduct').style.display = 'none';
  document.getElementById('transferItemForm').style.display = 'none';
  document.getElementById('transferBarcodeScanner').value = '';
  document.getElementById('transferScannerResult').style.display = 'none';
  document.getElementById('transferScannerStatus').textContent = t('transfer.scannerReady');
  document.getElementById('transferScannerStatus').style.color = '#888';
}

// ===== PAYMENT =====

function updateTransferPaymentSummary() {
  const total = _transferCart.reduce((sum, item) => sum + item.qty * item.buyPrice, 0);
  const paid = parseFloat(document.getElementById('transferPayAmount').value) || 0;
  const debt = Math.max(0, total - paid);
  document.getElementById('transferPayDebt').textContent = `DA${fmtMoney(debt)}`;
}

function setTransferPayFull() {
  const total = _transferCart.reduce((sum, item) => sum + item.qty * item.buyPrice, 0);
  document.getElementById('transferPayAmount').value = total;
  updateTransferPaymentSummary();
}

function setTransferPayNone() {
  document.getElementById('transferPayAmount').value = 0;
  updateTransferPaymentSummary();
}

function updateTransferExecSection() {
  const section = document.getElementById('transferExecSection');
  if (_transferCart.length > 0 && document.getElementById('transferDestSelect').value) {
    section.style.display = '';
  } else {
    section.style.display = 'none';
  }
}

// ===== EXECUTE TRANSFER =====

async function executeTransfer() {
  const destCode = document.getElementById('transferDestSelect').value;
  if (!destCode) { alert(t('transfer.selectDest')); return; }
  if (_transferCart.length === 0) { alert(t('transfer.cartEmpty')); return; }

  const srcCode = Auth.getUserCode();
  const donation = isTransferDonation();
  const total = _transferCart.reduce((sum, item) => sum + item.qty * item.buyPrice, 0);
  let paid = parseFloat(document.getElementById('transferPayAmount').value) || 0;
  if (donation) paid = 0;
  const debt = Math.max(0, total - paid);

  if (!donation && paid > total) { alert(t('transfer.paidExceedsTotal')); return; }

  const destStore = _transferAccessibleStores.find(s => s.code === destCode);
  const destName = destStore ? destStore.name : destCode;

  let msg = `${t('transfer.confirmTitle')}\n` +
    `${t('transfer.confirmFrom')} ${srcCode}\n` +
    `${t('transfer.confirmTo')} ${destName} (${destCode})\n` +
    `${t('transfer.confirmProducts')} ${_transferCart.length}\n` +
    `${t('transfer.confirmTotal')} DA${fmtMoney(total)}\n` +
    `${t('transfer.confirmPaid')} DA${fmtMoney(paid)}\n` +
    `${t('transfer.confirmRemaining')} DA${fmtMoney(debt)}`;
  if (donation) msg += `\n\n⚠️ ${t('transfer.donationWarning')}`;
  msg += `\n\n${t('transfer.confirmContinue')}`;

  if (!confirm(msg)) return;

  try {
    // 1. Deduct products from sender inventory
    const raw = DB._getRawData();
    const allProducts = raw.products || [];

    for (const item of _transferCart) {
      const idx = allProducts.findIndex(p =>
        p.id === item.productId &&
        (!p.storeId || p.storeId === srcCode)
      );
      if (idx === -1) {
        alert(`${t('transfer.productNotFound').replace('...', item.name)}`);
        return;
      }
      const prod = allProducts[idx];
      if (prod.quantity < item.qty) {
        alert(`${t('transfer.stockLessThanNeeded').replace('...', item.name).replace('...', prod.quantity).replace('...', item.qty)}`);
        return;
      }
      allProducts[idx].quantity -= item.qty;
      allProducts[idx].updatedAt = Date.now();
      if (allProducts[idx].quantity <= 0) {
        allProducts.splice(idx, 1);
      }
    }

    // 2. Add products to receiver inventory
    for (const item of _transferCart) {
      const existingIdx = allProducts.findIndex(p =>
        p.storeId === destCode &&
        p.barcode && item.productId &&
        p.name === item.name
      );

      if (existingIdx !== -1) {
        allProducts[existingIdx].quantity += item.qty;
        allProducts[existingIdx].updatedAt = Date.now();
      } else {
        const cid = (typeof Auth !== 'undefined' && Auth.getCompanyId) ? (Auth.getCompanyId() || '') : '';
        allProducts.push({
          id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
          name: item.name,
          barcode: DB.generateBarcode(),
          brandId: item.brandId,
          buyPrice: item.buyPrice,
          sellPrice: item.sellPrice,
          quantity: item.qty,
          storeId: destCode,
          companyId: cid || undefined,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }

    // 3. Create reception invoice in receiver's data (فاتورة استلام)
    const receiverInvoiceItems = _transferCart.map(item => ({
      name: item.name,
      barcode: '',
      qty: item.qty,
      price: item.buyPrice,
      total: item.qty * item.buyPrice,
    }));

    const receiverInvoice = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      createdAt: Date.now(),
      invoiceNumber: DB.getNextInvoiceNumber(),
      storeId: destCode,
      companyId: (typeof Auth !== 'undefined' && Auth.getCompanyId) ? (Auth.getCompanyId() || '') : undefined,
      type: 'transfer_receive',
      date: Date.now(),
      items: receiverInvoiceItems,
      totalAmount: total,
      paidAmount: paid,
      isProvisional: false,
      fromCode: srcCode,
      toCode: destCode,
      fromName: localStorage.getItem('zmt_store_name') || srcCode,
      ...(donation ? { isDonation: true, note: t('transfer.donationNote') } : {}),
    };
    raw.invoices.push(receiverInvoice);

    raw.products = allProducts;
    DB._saveRawData(raw);

    // 4. Create transfer invoice in sender's data
    const invoiceItems = _transferCart.map(item => ({
      name: item.name,
      barcode: '',
      qty: item.qty,
      price: item.buyPrice,
      total: item.qty * item.buyPrice,
    }));

    const transferInvoice = DB.addInvoice({
      type: 'transfer',
      date: Date.now(),
      items: invoiceItems,
      totalAmount: total,
      paidAmount: paid,
      fromCode: srcCode,
      toCode: destCode,
      toName: destName,
      isProvisional: false,
      ...(donation ? { isDonation: true, note: t('transfer.donationNote') } : {}),
    });

    // 5. Record transfer
    const transferRecord = {
      id: transferInvoice.id,
      date: Date.now(),
      fromCode: srcCode,
      toCode: destCode,
      fromName: localStorage.getItem('zmt_store_name') || srcCode,
      toName: destName,
      items: _transferCart.map(item => ({
        name: item.name,
        qty: item.qty,
        buyPrice: item.buyPrice,
        sellPrice: item.sellPrice,
        brandId: item.brandId,
      })),
      totalAmount: total,
      paidAmount: paid,
      debtAmount: debt,
      ...(donation ? { isDonation: true, note: t('transfer.donationNote') } : {}),
    };

    const transfers = DB.getTransfers();
    transfers.push(transferRecord);
    DB.saveTransfers(transfers);

    // 6. Record payment in net account if paid > 0
    if (paid > 0) {
      DB.addPayment({
        type: 'transfer_payment',
        amount: paid,
        invoiceId: transferInvoice.id,
        note: `${t('transfer.payNote')} ${destName}`,
        date: Date.now(),
      });
    }

    // 7. Upload backup for destination store so branch monitor can see it
    if (typeof CloudService !== 'undefined' && CloudService.isCloudConnected()) {
      try {
        const destStore = _transferAccessibleStores.find(s => s.code === destCode);
        const destType = destStore ? destStore.type : 'branch';
        const destParent = Auth.getStoreType() === 'main' ? srcCode : Auth.getParentCode();
        await CloudService.uploadBackupForStore(destCode, destType, destParent);
        console.log('[Transfer] Destination backup uploaded for:', destCode);
      } catch (e) {
        console.warn('[Transfer] Failed to upload destination backup:', e.message);
      }
      // Also re-upload main store backup
      try {
        await CloudService.uploadBackup();
      } catch (e) {
        console.warn('[Transfer] Failed to re-upload main backup:', e.message);
      }
    }

    // Success
    const itemSummary = _transferCart.map(it => `${it.name} (${it.qty})`).join(', ');
    let successMsg = `${t('transfer.transferSuccess')}\n\n`;
    successMsg += `${t('transfer.transferredProducts')} ${itemSummary}\n`;
    successMsg += `${t('transfer.transferTotal')} DA${fmtMoney(total)}\n`;
    if (donation) successMsg += `✅ ${t('transfer.donationNote')}\n`;
    if (paid > 0) successMsg += `${t('transfer.transferPaid')} DA${fmtMoney(paid)}\n`;
    if (debt > 0) successMsg += `${t('transfer.transferRemaining')} DA${fmtMoney(debt)}\n`;
    if (typeof CloudService !== 'undefined' && typeof CloudService.isLanSubDevice === 'function' && CloudService.isLanSubDevice()) {
      successMsg += `\n⚠️ ${t('connection.lanSubUploadMsg') || 'هذا الجهاز فرعي (LAN): رفع البيانات للسحابة يتم من السيرفر الرئيسي لهذا الموقع'}\n`;
    }

    alert(successMsg);

    // Reset
    _transferCart = [];
    document.getElementById('transferPayAmount').value = '0';
    const donEl = document.getElementById('transferDonation');
    if (donEl) donEl.checked = false;
    const donWarn = document.getElementById('transferDonationWarning');
    if (donWarn) donWarn.style.display = 'none';
    const bpInput = document.getElementById('transferItemBuyPrice');
    if (bpInput) bpInput.disabled = false;
    renderTransferCart();
    resetTransferItemForm();
  } catch (e) {
    console.error('[Transfer] Error:', e);
    alert(`${t('transfer.transferError')} ${e.message}`);
  }
}

// ===== LAN SYNC: refresh product search results without resetting the form =====
window._pageSyncHandlers = window._pageSyncHandlers || {};
window._pageSyncHandlers['transfer'] = function transferSyncData() {
  const input = document.getElementById('transferProdSearch');
  searchTransferProduct(input ? input.value : '');
};
window.addEventListener('zmt:buyprice-toggle', function(){ renderTransferCart(); });
