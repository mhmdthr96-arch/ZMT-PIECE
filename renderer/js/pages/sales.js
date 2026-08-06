var _salesCart = [];
var _salesCustomerId = null;
var _salesProducts = [];
var _salesSearchQuery = '';
var _salesRenderRAF = null;
var _salesDefaultMode = 'unit';
var _salesPaidTouched = false;

function onSalesPaidInput() {
  _salesPaidTouched = true;
  updateSalesRemaining();
}

// Settings helpers (also defined in settings.js — duplicated here for availability in sales page)
function getStoreInfo() {
  return {
    name: localStorage.getItem('zmt_store_name') || 'ZMT PIECE',
    address: localStorage.getItem('zmt_store_address') || '',
    phone: localStorage.getItem('zmt_store_phone') || '',
  };
}
function getTimbreConfig() {
  return {
    enabled: localStorage.getItem('zmt_timbre_enabled') === '1',
    rate: parseFloat(localStorage.getItem('zmt_timbre_rate') || '1'),
  };
}
function getTvaRate() {
  return parseFloat(localStorage.getItem('zmt_tva_rate') || '0');
}

function init_sales() {
  _salesProducts = DB.getProducts();
  _salesSearchQuery = '';
  _salesDefaultMode = 'unit';
  renderSalesProducts();
  setupSalesBarcode();
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== PRODUCT GROUPS (merge same name+barcode, FIFO) =====

var _salesGroupList = [];

function salesGroupKey(p) {
  return (p.name || '') + '\u0001' + (p.barcode || '');
}

function getSalesGroups() {
  const map = new Map();
  const groups = [];
  for (const p of _salesProducts) {
    const key = salesGroupKey(p);
    let g = map.get(key);
    if (!g) {
      g = { key, name: p.name, barcode: p.barcode, records: [] };
      map.set(key, g);
      groups.push(g);
    }
    g.records.push(p);
  }
  for (const g of groups) {
    g.records.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }
  return groups;
}

function getSalesGroupByKey(key) {
  for (const g of getSalesGroups()) {
    if (g.key === key) return g;
  }
  return null;
}

function getGroupAvailableQty(group) {
  return group.records.reduce((s, r) => s + (r.quantity || 0), 0);
}

function getGroupActivePrice(group) {
  const r = group.records.find(r => (r.quantity || 0) > 0);
  return r ? (r.sellPrice || 0) : 0;
}

function getGroupWholesalePrice(group) {
  const r = group.records.find(r => (r.quantity || 0) > 0);
  return r ? (r.wholesalePrice || r.sellPrice || 0) : 0;
}

function allocateSalesLine(line, key) {
  const g = getSalesGroupByKey(key);
  if (!g) {
    line.entries = [];
    line.qty = 0;
    line.price = 0;
    line.total = 0;
    return;
  }
  const entries = [];
  let remaining = line.qty;
  let latestPrice = 0;
  const wholesale = line.mode === 'wholesale';
  for (const r of g.records) {
    if (remaining <= 0) break;
    const take = Math.min(r.quantity || 0, remaining);
    if (take > 0) {
      const price = wholesale ? (r.wholesalePrice || r.sellPrice || 0) : (r.sellPrice || 0);
      entries.push({ productId: r.id, qty: take, price, total: take * price });
      latestPrice = price;
      remaining -= take;
    }
  }
  line.entries = entries;
  line.price = latestPrice;
  line.total = entries.reduce((s, e) => s + e.total, 0);
}

// ===== PRODUCT GRID (ALL products, chunked rendering) =====

function salesCardHTML(g, i) {
  const totalQty = getGroupAvailableQty(g);
  const price = getGroupActivePrice(g);
  const whole = getGroupWholesalePrice(g);
  const outOfStock = totalQty <= 0;
  const lowStock = totalQty > 0 && totalQty <= DB.getLowStockThreshold();
  const multi = g.records.length > 1;
  const wholeVisible = whole > 0 && whole !== price;
  return `<div class="sp-card ${outOfStock ? 'sp-card-oos' : ''}"
    onclick="${outOfStock ? '' : `addSalesGroupToCart(${i})`}"
    ${outOfStock ? `title="${t('sales.unavailable')}"` : ''}>
    <div class="sp-card-top">
      <span class="sp-card-name">${escHtml(g.name)}</span>
      ${lowStock ? `<span class="sp-card-low" title="${t('sales.lowStockTip')}">!</span>` : ''}
    </div>
    <div class="sp-card-bar" dir="ltr">${escHtml(g.barcode)}</div>
    <div class="sp-card-footer">
      <div class="sp-card-prices">
        <span class="sp-card-price">DA${price.toFixed(2)}</span>
        ${wholeVisible ? `<span class="sp-card-price-whole" dir="ltr">${t('sales.wholesale')} DA${whole.toFixed(2)}</span>` : ''}
      </div>
      <span style="display:flex;align-items:center;gap:6px">
        ${multi ? `<span class="sp-card-batches" title="${t('sales.multiBatches')}"><i class="fas fa-layer-group"></i>${g.records.length}</span>` : ''}
        <span class="sp-card-qty ${lowStock ? 'sp-card-qty-low' : ''}">${totalQty}</span>
      </span>
    </div>
  </div>`;
}

function renderSalesProducts(filter) {
  if (typeof filter === 'string') {
    _salesSearchQuery = filter.trim().toLowerCase();
  }
  if (_salesRenderRAF) { cancelAnimationFrame(_salesRenderRAF); _salesRenderRAF = null; }

  const grid = document.getElementById('salesProductGrid');
  if (!grid || !grid.isConnected) return;
  let groups = getSalesGroups();
  const q = _salesSearchQuery;
  if (q && q.length >= 3) {
    groups = groups.filter(g =>
      g.name.toLowerCase().startsWith(q) ||
      g.barcode.toLowerCase().startsWith(q) ||
      g.name.toLowerCase().includes(' ' + q) ||
      g.barcode.toLowerCase().includes(q)
    );
  }
  _salesGroupList = groups;

  const count = document.getElementById('salesProdCount');
  if (count) count.textContent = `${groups.length} ${t('common.product')}`;

  grid.innerHTML = '';
  if (groups.length === 0) {
    grid.innerHTML = `<div class="sales-grid-empty">
      <i class="fas fa-box-open"></i>
      <p>${q ? t('sales.emptyResults') : t('sales.emptyProducts')}</p>
    </div>`;
    return;
  }

  let i = 0;
  const CHUNK = 240;
  const renderChunk = () => {
    if (!grid || !grid.isConnected) return;
    const t0 = performance.now();
    let html = '';
    while (i < groups.length) {
      html += salesCardHTML(groups[i], i);
      i++;
      if (i % CHUNK === 0 || (performance.now() - t0) > 15) break;
    }
    grid.insertAdjacentHTML('beforeend', html);
    if (i < groups.length) _salesRenderRAF = requestAnimationFrame(renderChunk);
  };
  renderChunk();
}

const _debouncedSalesSearch = debounce((q) => { renderSalesProducts(q); }, 200);
function filterSalesProducts(q) {
  _debouncedSalesSearch(q);
}

// ===== BARCODE SCANNER =====

function setupSalesBarcode() {
  const input = document.getElementById('salesBarcodeScan');
  if (!input) return;
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  newInput.addEventListener('keydown', handleSalesBarcodeScan);
  newInput.focus();
}

function handleSalesBarcodeScan(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const input = document.getElementById('salesBarcodeScan');
    const code = input.value.trim();
    if (!code) return;

    const beam = document.getElementById('salesScannerBeam');
    if (beam) beam.classList.add('active');

    document.getElementById('salesBarcodeStatus').textContent = '...';
    document.getElementById('salesBarcodeStatus').style.color = '#0066B1';

    const prod = DB.getProductByBarcode(code);
    if (prod) {
      const gKey = salesGroupKey(prod);
      const g = getSalesGroupByKey(gKey);
      const avail = g ? getGroupAvailableQty(g) : (prod.quantity || 0);
      if (avail <= 0) {
        document.getElementById('salesBarcodeStatus').textContent = t('sales.unavailable');
        document.getElementById('salesBarcodeStatus').style.color = '#dc3545';
        input.value = '';
        if (beam) setTimeout(() => beam.classList.remove('active'), 400);
        return;
      }
      addSalesLine(gKey);
      document.getElementById('salesBarcodeStatus').textContent = t('sales.scannerDone');
      document.getElementById('salesBarcodeStatus').style.color = '#28a745';
      setTimeout(() => {
        const idx = _salesCart.findIndex(c => c.key === gKey);
        const qtyInput = document.getElementById(`scqty_${idx}`);
        if (qtyInput) { qtyInput.focus(); qtyInput.select(); }
      }, 100);
    } else {
      document.getElementById('salesBarcodeStatus').textContent = t('sales.scannerNotFound');
      document.getElementById('salesBarcodeStatus').style.color = '#e65100';
    }
    input.value = '';
    if (beam) setTimeout(() => beam.classList.remove('active'), 400);
    setTimeout(() => {
      const s = document.getElementById('salesBarcodeStatus');
      if (s) { s.textContent = t('sales.scannerReady'); s.style.color = '#888'; }
    }, 2000);
  }
}

// ===== CUSTOMER =====

function searchSalesCustomer(q) {
  const results = document.getElementById('salesCustResults');
  if (!q || q.length < 1) { results.innerHTML = ''; return; }
  const matches = DB.getCustomers().filter(c =>
    c.name.toLowerCase().includes(q.toLowerCase()) || (c.phone && c.phone.includes(q))
  ).slice(0, 10);
  results.innerHTML = matches.length === 0
    ? `<div class="search-result-item disabled">${t('sales.noCustResults')}</div>`
    : matches.map(c => `<div class="search-result-item" onclick="selectSalesCustomer('${c.id}')">
        <strong>${escHtml(c.name)}</strong>
        <span class="text-muted">${c.phone || ''} ${c.discount > 0 ? `| ${t('sales.discount')} ${c.discount}%` : ''}</span>
      </div>`).join('');
}

function selectSalesCustomer(id) {
  const c = DB.getCustomer(id);
  if (!c) return;
  _salesCustomerId = c.id;
  _salesDefaultMode = c.type === 'whole' ? 'wholesale' : 'unit';
  document.getElementById('salesCustSearch').value = c.name;
  document.getElementById('salesCustResults').innerHTML = '';
  document.getElementById('salesSelectedCust').style.display = 'flex';
  document.getElementById('salesSelCustName').textContent = c.name;
  document.getElementById('salesSelCustType').textContent = c.type === 'whole' ? t('sales.wholesale') : t('sales.unit');
  document.getElementById('salesSelCustType').className = 'sales-cust-type ' + (c.type === 'whole' ? 'whole' : 'unit');
  document.getElementById('salesWalkinLabel').style.display = 'none';
  if (c.discount > 0) {
    document.getElementById('salesSelCustDiscount').textContent = `${t('sales.discount')} ${c.discount}%`;
    document.getElementById('salesSelCustDiscount').style.display = '';
  } else {
    document.getElementById('salesSelCustDiscount').style.display = 'none';
  }
  updateSalesTotals();
}

function setSalesWalkin() {
  _salesCustomerId = null;
  _salesDefaultMode = 'unit';
  document.getElementById('salesCustSearch').value = '';
  document.getElementById('salesCustResults').innerHTML = '';
  document.getElementById('salesSelectedCust').style.display = 'none';
  document.getElementById('salesWalkinLabel').style.display = 'flex';
  updateSalesTotals();
}

function clearSalesCustomer() {
  _salesCustomerId = null;
  _salesDefaultMode = 'unit';
  document.getElementById('salesSelectedCust').style.display = 'none';
  document.getElementById('salesWalkinLabel').style.display = 'none';
  document.getElementById('salesCustSearch').value = '';
  document.getElementById('salesCustResults').innerHTML = '';
  updateSalesTotals();
}

// ===== CART =====

function addToSalesCart(productId) {
  const prod = DB.getProduct(productId);
  if (!prod || prod.quantity <= 0) return;
  addSalesLine(salesGroupKey(prod));
}

function addSalesGroupToCart(idx) {
  const g = _salesGroupList[idx];
  if (!g) return;
  addSalesLine(g.key);
}

function addSalesLine(key) {
  const g = getSalesGroupByKey(key);
  if (!g) return;
  const avail = getGroupAvailableQty(g);
  if (avail <= 0) return;

  let line = _salesCart.find(c => c.key === key);
  if (line) {
    if (line.qty >= avail) return;
    line.qty++;
    allocateSalesLine(line, key);
  } else {
    line = { key, name: g.name, barcode: g.barcode, qty: 1, mode: _salesDefaultMode, price: 0, total: 0, entries: [] };
    allocateSalesLine(line, key);
    _salesCart.push(line);
  }

  renderSalesCart();
  document.getElementById('salesEmptyCart').style.display = 'none';
  renderSalesProducts();
}

function renderSalesCart() {
  const section = document.getElementById('salesCartSection');
  const items = document.getElementById('salesCartItems');
  const count = document.getElementById('salesCartCount');
  const empty = document.getElementById('salesEmptyCart');

  if (_salesCart.length === 0) {
    section.style.display = 'none';
    empty.style.display = '';
    document.getElementById('salesPaySection').style.display = 'none';
    return;
  }
  section.style.display = '';
  empty.style.display = 'none';
  if (count) count.textContent = _salesCart.length;

  items.innerHTML = _salesCart.map((line, i) => {
    const g = getSalesGroupByKey(line.key);
    const maxQty = g ? getGroupAvailableQty(g) : 99;
    const mixed = line.entries.length > 1;
    return `<div class="sc-item">
      <div class="sc-item-info">
        <div class="sc-item-name">${escHtml(line.name)}${mixed ? `<span class="sc-mixed-badge" title="${t('sales.mixedPrice')}"><i class="fas fa-layer-group"></i> ${t('sales.mixedPrice')}</span>` : ''}</div>
        <div class="sc-item-bar" dir="ltr">${escHtml(line.barcode)}</div>
        <div style="margin-top:3px">
          <button class="sc-mode-btn ${line.mode === 'wholesale' ? 'sc-mode-btn-active' : ''}" onclick="toggleSalesLineMode(${i})">${line.mode === 'wholesale' ? t('sales.wholesale') : t('sales.unit')}</button>
        </div>
      </div>
      <div class="sc-item-controls">
        <button class="sc-qty-btn" onclick="decSalesCartQty(${i})" ${line.qty <= 1 ? 'disabled' : ''}>−</button>
        <input type="number" class="no-spinner sc-qty-input" id="scqty_${i}"
          value="${line.qty}" min="1" max="${maxQty}"
          onchange="updateSalesCartQty(${i}, this.value)">
        <button class="sc-qty-btn" onclick="incSalesCartQty(${i})" ${line.qty >= maxQty ? 'disabled' : ''}>+</button>
        <span class="sc-item-price">DA${line.price.toFixed(2)}</span>
      </div>
      <div class="sc-item-right">
        <span class="sc-item-total">DA${line.total.toFixed(2)}</span>
        <button class="sc-item-remove" onclick="removeFromSalesCart(${i})" title="${t('sales.del')}"><i class="fas fa-times"></i></button>
      </div>
    </div>`;
  }).join('');

  updateSalesTotals();
}

function incSalesCartQty(idx) {
  const line = _salesCart[idx];
  if (!line) return;
  const g = getSalesGroupByKey(line.key);
  const maxQty = g ? getGroupAvailableQty(g) : 0;
  if (line.qty < maxQty) {
    line.qty++;
    allocateSalesLine(line, line.key);
    renderSalesCart();
  }
}

function decSalesCartQty(idx) {
  const line = _salesCart[idx];
  if (!line) return;
  if (line.qty > 1) {
    line.qty--;
    allocateSalesLine(line, line.key);
    renderSalesCart();
  }
}

function updateSalesCartQty(idx, val) {
  const line = _salesCart[idx];
  if (!line) return;
  const qty = parseInt(val) || 1;
  const g = getSalesGroupByKey(line.key);
  const maxQty = g ? getGroupAvailableQty(g) : 99;
  line.qty = Math.min(Math.max(1, qty), maxQty);
  allocateSalesLine(line, line.key);
  renderSalesCart();
}

function removeFromSalesCart(idx) {
  _salesCart.splice(idx, 1);
  renderSalesCart();
  if (_salesCart.length === 0) {
    document.getElementById('salesPaySection').style.display = 'none';
    document.getElementById('salesBarcodeScan').focus();
  }
}

function toggleSalesLineMode(idx) {
  const line = _salesCart[idx];
  if (!line) return;
  line.mode = line.mode === 'wholesale' ? 'unit' : 'wholesale';
  allocateSalesLine(line, line.key);
  renderSalesCart();
}

// ===== TOTALS & DISCOUNTS =====

function updateSalesTotals() {
  const subTotal = _salesCart.reduce((s, item) => s + item.total, 0);

  let custDiscPct = 0;
  if (_salesCustomerId) {
    const c = DB.getCustomer(_salesCustomerId);
    if (c && c.discount > 0) custDiscPct = c.discount;
  }
  const custDiscAmount = subTotal * (custDiscPct / 100);
  const afterCustDisc = subTotal - custDiscAmount;

  const rawExtra = parseFloat(document.getElementById('salesExtraDisc').value) || 0;
  const extraDisc = Math.min(rawExtra, afterCustDisc);

  const total = afterCustDisc - extraDisc;

  document.getElementById('salesCartSubtotal').textContent = `DA${subTotal.toFixed(2)}`;

  const cdEl = document.getElementById('salesCartCustDiscount');
  if (custDiscPct > 0) {
    cdEl.style.display = 'flex';
    document.getElementById('salesCartCustDiscVal').textContent = `-DA${custDiscAmount.toFixed(2)} (${custDiscPct}%)`;
  } else {
    cdEl.style.display = 'none';
  }

  document.getElementById('salesCartTotal').textContent = `DA${total.toFixed(2)}`;

  if (_salesCart.length > 0) {
    document.getElementById('salesPaySection').style.display = '';
    const payInput = document.getElementById('salesPaidAmount');
    payInput.max = total;
    if (!_salesPaidTouched) {
      payInput.value = total.toFixed(2);
    } else {
      const currVal = parseFloat(payInput.value) || 0;
      if (currVal > total) payInput.value = total.toFixed(2);
    }
    updateSalesRemaining();
  }
}

function clampExtraDisc() {
  const subTotal = _salesCart.reduce((s, item) => s + item.total, 0);
  let custDiscPct = 0;
  if (_salesCustomerId) {
    const c = DB.getCustomer(_salesCustomerId);
    if (c && c.discount > 0) custDiscPct = c.discount;
  }
  const afterCustDisc = subTotal - (subTotal * (custDiscPct / 100));
  const val = parseFloat(document.getElementById('salesExtraDisc').value) || 0;
  const clamped = Math.min(Math.max(0, val), afterCustDisc);
  document.getElementById('salesExtraDisc').value = clamped.toFixed(2);
  updateSalesTotals();
}

function updateSalesRemaining() {
  const total = parseFloat(document.getElementById('salesCartTotal').textContent.replace('DA', '')) || 0;
  const paid = parseFloat(document.getElementById('salesPaidAmount').value) || 0;
  const remaining = Math.max(0, total - paid);

  document.getElementById('salesRemainingVal').textContent = `DA${remaining.toFixed(2)}`;

  const remDisplay = document.getElementById('salesRemainingDisplay');
  const payStatus = document.getElementById('salesPayStatus');
  const statusText = document.getElementById('salesPayStatusText');

  if (paid >= total) {
    remDisplay.style.display = 'none';
    payStatus.className = 'sales-pay-status status-paid';
    statusText.innerHTML = `<i class="fas fa-check-circle"></i> ${t('sales.fullyPaid')}`;
  } else if (paid > 0) {
    remDisplay.style.display = 'flex';
    payStatus.className = 'sales-pay-status status-partial';
    statusText.innerHTML = `<i class="fas fa-hourglass-half"></i> ${t('sales.partialPay')}`;
  } else {
    remDisplay.style.display = 'none';
    payStatus.className = 'sales-pay-status status-unpaid';
    statusText.innerHTML = `<i class="fas fa-info-circle"></i> ${t('sales.enterPaid')}`;
  }
}

function setSalesFullPayment() {
  _salesPaidTouched = true;
  const total = parseFloat(document.getElementById('salesCartTotal').textContent.replace('DA', '')) || 0;
  document.getElementById('salesPaidAmount').value = total.toFixed(2);
  updateSalesRemaining();
  document.getElementById('salesPaidAmount').focus();
}

// ===== CHECKOUT =====

// ===== TIMBRE FISCAL =====

function calcTimbreFiscal(ttc) {
  const cfg = getTimbreConfig();
  if (!cfg.enabled) return 0;
  let amount = ttc * (cfg.rate / 100);
  if (amount < 5) amount = 5;
  if (amount > 10000) amount = 10000;
  return amount;
}

// ===== INVOICE PREVIEW =====

function showInvoicePreview(inv) {
  const existing = document.getElementById('invoicePreviewModal');
  if (existing) existing.remove();

  const store = getStoreInfo();
  const tvaRate = getTvaRate();
  const montantHT = inv.totalAmount / (1 + tvaRate / 100);
  const tvaAmount = inv.totalAmount - montantHT;
  const timbreFiscal = calcTimbreFiscal(inv.totalAmount);
  const netAPayer = inv.totalAmount + timbreFiscal;
  const paidAmount = DB.getInvoicePaidAmount(inv.id);

  const customer = inv.customerId ? DB.getCustomer(inv.customerId) : null;
  const date = new Date(inv.createdAt);
  const dateStr = date.toLocaleDateString('fr-DZ', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const totalQty = inv.items.reduce((s, it) => s + it.qty, 0);
  const originalSubtotal = inv.items.reduce((s, it) => s + (it.originalPrice || it.price) * it.qty, 0);
  const custDiscAmount = originalSubtotal * ((inv.customerDiscount || 0) / 100);
  const extraDiscAmount = inv.extraDiscount || 0;

  const modal = document.createElement('div');
  modal.id = 'invoicePreviewModal';
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:20px';

  modal.innerHTML = `
    <div style="background:white;border-radius:12px;max-width:750px;width:100%;max-height:95vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3)">
      <!-- Toolbar -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid #e0e0e0;background:#f8f9fa;border-radius:12px 12px 0 0;position:sticky;top:0;z-index:2" dir="ltr">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:14px;font-weight:700;color:#333">Aperçu de la facture</span>
        </div>
        <div style="display:flex;gap:6px">
          <button onclick="printInvoicePreview('color')" style="padding:7px 14px;background:#0066B1;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;display:flex;align-items:center;gap:5px">
            <i class="fas fa-print"></i> Couleur
          </button>
          <button onclick="printInvoicePreview('bw')" style="padding:7px 14px;background:#333;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;display:flex;align-items:center;gap:5px">
            <i class="fas fa-adjust"></i> N&amp;B
          </button>
          <button onclick="closeInvoicePreview()" style="padding:7px 14px;background:#e0e0e0;color:#555;border:none;border-radius:6px;cursor:pointer;font-size:12px">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>

      <!-- Invoice Content -->
      <div id="invoicePrintArea" style="padding:30px 35px;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#222;direction:ltr;text-align:left" dir="ltr">

        <!-- Header -->
        <table style="width:100%;border-collapse:collapse" dir="ltr">
          <tr>
            <td style="vertical-align:top;width:60%">
              <div style="font-size:20px;font-weight:900;color:#1a1a1a;text-transform:uppercase;letter-spacing:1px">${escHtml(store.name)}</div>
              <div style="font-size:10px;color:#999;margin-top:1px;text-transform:uppercase;letter-spacing:0.5px">Document commercial</div>
              ${store.address ? `<div style="font-size:11px;color:#555;margin-top:4px">${escHtml(store.address)}</div>` : ''}
              ${store.phone ? `<div style="font-size:11px;color:#555">Tél: ${escHtml(store.phone)}</div>` : ''}
              <div style="font-size:10px;color:#999;margin-top:2px">NIF: — &nbsp;|&nbsp; RC: —</div>
            </td>
            <td style="vertical-align:top;text-align:right;width:40%">
              <div style="font-size:30px;font-weight:900;color:#1a1a1a;text-transform:uppercase;letter-spacing:3px">FACTURE</div>
              <div style="font-size:11px;font-weight:700;color:#0066B1;margin-top:-2px;text-transform:uppercase;letter-spacing:1.5px">DE VENTE</div>
              <div style="font-size:10px;font-weight:600;color:#888;margin-top:1px;text-transform:uppercase;letter-spacing:1px">Original</div>
              <div style="font-size:14px;font-weight:700;color:#333;margin-top:6px">N° ${inv.invoiceNumber}</div>
              <div style="font-size:11px;color:#555;margin-top:4px;line-height:1.6">
                <div>Date: ${dateStr}</div>
                <div>Heure: ${timeStr}</div>
              </div>
            </td>
          </tr>
        </table>

        <!-- Separator -->
        <div style="border-top:2px solid #1a1a1a;margin:16px 0 14px"></div>
        <div style="height:1px;background:#ddd;margin-bottom:16px"></div>

        <!-- Customer Info -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px" dir="ltr">
          <tr>
            <td style="vertical-align:top;width:50%">
              <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px">Client</div>
              ${customer
                ? `<div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-top:2px">${escHtml(customer.name)}</div>
                   ${customer.phone ? `<div style="font-size:11px;color:#666">Tél: ${escHtml(customer.phone)}</div>` : ''}
                   ${customer.address ? `<div style="font-size:11px;color:#666">Adresse: ${escHtml(customer.address)}</div>` : ''}`
                : `<div style="font-size:14px;color:#888">Client non enregistré</div>`
              }
            </td>
            <td style="vertical-align:top;text-align:right;width:50%">
              ${paidAmount < inv.totalAmount
                ? `<div style="display:inline-block;padding:4px 14px;background:#fff3e0;color:#e65100;border:1px solid #ffcc80;border-radius:4px;font-size:11px;font-weight:700">NON SOLDÉE</div>`
                : `<div style="display:inline-block;padding:4px 14px;background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;border-radius:4px;font-size:11px;font-weight:700">SOLDÉE</div>`
              }
            </td>
          </tr>
        </table>

        <!-- Items Table -->
        <table style="width:100%;border-collapse:collapse;font-size:12px" dir="ltr">
          <thead>
            <tr style="background:#f2f2f2;border-bottom:2px solid #1a1a1a">
              <th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd">Désignation</th>
              <th style="padding:8px 10px;text-align:center;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:60px">Qté</th>
              <th style="padding:8px 10px;text-align:right;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:100px">Prix unitaire</th>
              <th style="padding:8px 10px;text-align:right;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:100px">Total</th>
            </tr>
          </thead>
          <tbody>
            ${inv.items.map((item, i) => `
              <tr style="${i % 2 === 0 ? 'background:#fafafa' : ''}">
                <td style="padding:7px 10px;border:1px solid #eee;font-size:12px;color:#333">${escHtml(item.name)}</td>
                <td style="padding:7px 10px;border:1px solid #eee;text-align:center;font-size:12px;color:#333">${item.qty}</td>
                <td style="padding:7px 10px;border:1px solid #eee;text-align:right;font-size:12px;color:#333">
                  ${(item.originalPrice && item.originalPrice !== item.price) ? `<span style="text-decoration:line-through;color:#999;font-size:10px">${item.originalPrice.toFixed(2)}</span> ` : ''}
                  ${item.price.toFixed(2)} DA</td>
                <td style="padding:7px 10px;border:1px solid #eee;text-align:right;font-size:12px;font-weight:600;color:#333">${(item.price * item.qty).toFixed(2)} DA</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- Totals -->
        <table style="width:100%;border-collapse:collapse;margin-top:10px" dir="ltr">
          <tr>
            <td style="width:60%"></td>
            <td style="width:40%">
              <table style="width:100%;border-collapse:collapse;font-size:13px">
                <tr>
                  <td style="padding:4px 10px;text-align:left;color:#666">Montant HT</td>
                  <td style="padding:4px 10px;text-align:right;font-weight:600;color:#333">${montantHT.toFixed(2)} DA</td>
                </tr>
                ${tvaRate > 0 ? `
                <tr>
                  <td style="padding:4px 10px;text-align:left;color:#666">TVA (${tvaRate}%)</td>
                  <td style="padding:4px 10px;text-align:right;font-weight:600;color:#333">${tvaAmount.toFixed(2)} DA</td>
                </tr>` : ''}
                <tr>
                  <td style="padding:4px 10px;text-align:left;color:#666">Montant TTC</td>
                  <td style="padding:4px 10px;text-align:right;font-weight:700;color:#1a1a1a;font-size:15px">${inv.totalAmount.toFixed(2)} DA</td>
                </tr>
                ${timbreFiscal > 0 ? `
                <tr>
                  <td style="padding:4px 10px;text-align:left;color:#e65100">Timbre Fiscal</td>
                  <td style="padding:4px 10px;text-align:right;font-weight:600;color:#e65100;font-size:13px">${timbreFiscal.toFixed(2)} DA</td>
                </tr>
                <tr style="border-top:2px solid #1a1a1a">
                  <td style="padding:6px 10px;text-align:left;font-weight:800;font-size:16px;color:#1a1a1a">Net à payer</td>
                  <td style="padding:6px 10px;text-align:right;font-weight:900;font-size:18px;color:#0066B1">${netAPayer.toFixed(2)} DA</td>
                </tr>` : `
                <tr style="border-top:2px solid #1a1a1a">
                  <td style="padding:6px 10px;text-align:left;font-weight:800;font-size:16px;color:#1a1a1a">Net à payer</td>
                  <td style="padding:6px 10px;text-align:right;font-weight:900;font-size:18px;color:#0066B1">${inv.totalAmount.toFixed(2)} DA</td>
                </tr>`}
              </table>
            </td>
          </tr>
        </table>

        <!-- Paid / Remaining -->
        ${paidAmount < inv.totalAmount ? `
        <div style="margin-top:14px;padding:10px 14px;background:#fff3e0;border:1px solid #ffcc80;border-radius:6px;font-size:12px;color:#e65100" dir="ltr">
          <strong>Montant payé:</strong> ${paidAmount.toFixed(2)} DA &nbsp;|&nbsp;
          <strong>Reste à payer:</strong> ${(inv.totalAmount - paidAmount).toFixed(2)} DA
        </div>` : `
        <div style="margin-top:14px;padding:10px 14px;background:#e8f5e9;border:1px solid #a5d6a7;border-radius:6px;font-size:12px;color:#2e7d32" dir="ltr">
          <strong>Payée intégralement</strong> — ${paidAmount.toFixed(2)} DA
        </div>`}

        <!-- Discounts detailed -->
        ${(custDiscAmount > 0 || extraDiscAmount > 0) ? `
        <div style="margin-top:12px;padding:10px 14px;background:#fafafa;border:1px solid #eee;border-radius:6px;font-size:11px;color:#555" dir="ltr">
          <div style="font-weight:700;color:#e65100;margin-bottom:6px"><i class="fas fa-tags"></i> Remises appliquées</div>
          <div style="display:flex;justify-content:space-between;padding:2px 0">
            <span>Sous-total avant remise</span>
            <span style="font-weight:600">${originalSubtotal.toFixed(2)} DA</span>
          </div>
          ${custDiscAmount > 0 ? `
          <div style="display:flex;justify-content:space-between;padding:2px 0">
            <span>Remise client (${inv.customerDiscount}%)</span>
            <span style="font-weight:600;color:#e65100">-${custDiscAmount.toFixed(2)} DA</span>
          </div>` : ''}
          ${extraDiscAmount > 0 ? `
          <div style="display:flex;justify-content:space-between;padding:2px 0">
            <span>Remise supplémentaire</span>
            <span style="font-weight:600;color:#e65100">-${extraDiscAmount.toFixed(2)} DA</span>
          </div>` : ''}
          <div style="display:flex;justify-content:space-between;padding:4px 0 0;margin-top:4px;border-top:1px dashed #ddd;font-weight:700;color:#333">
            <span>Total des remises</span>
            <span style="color:#e65100">-${(custDiscAmount + extraDiscAmount).toFixed(2)} DA</span>
          </div>
        </div>` : ''}

        <!-- Footer with stamp & signature -->
        <div style="border-top:2px solid #1a1a1a;margin-top:24px;padding-top:14px">
          <table style="width:100%;border-collapse:collapse" dir="ltr">
            <tr>
              <td style="width:50%;vertical-align:bottom">
                <div style="font-size:10px;color:#888;margin-bottom:4px">${escHtml(store.name)}</div>
                <div style="font-size:9px;color:#999">${store.address ? escHtml(store.address) + '<br>' : ''}Tél: ${store.phone || '—'}</div>
                <div style="font-size:9px;color:#999;margin-top:2px">NIF: — &nbsp;|&nbsp; Facture N° ${inv.invoiceNumber}</div>
              </td>
              <td style="width:50%;text-align:right;vertical-align:bottom">
                <div style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:1px">Cachet &amp; signature</div>
                <div style="height:50px;margin-top:6px;border-bottom:1px solid #ccc;width:180px;margin-left:auto"></div>
                <div style="font-size:9px;color:#999;margin-top:2px">Lu et approuvé</div>
              </td>
            </tr>
          </table>
        </div>
        <div style="text-align:center;margin-top:12px;font-size:9px;color:#bbb;letter-spacing:0.5px">
          ${escHtml(store.name)} · ${dateStr} · ${inv.invoiceNumber}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

function printInvoicePreview(mode) {
  const content = document.getElementById('invoicePrintArea');
  if (!content) return;

  const store = getStoreInfo();
  const win = window.open('', '', 'width=800,height=600');
  if (!win) { alert('Veuillez autoriser les popups pour imprimer'); return; }

  const styles = document.querySelectorAll('link[rel="stylesheet"], style');
  let styleHtml = '';
  styles.forEach(s => styleHtml += s.outerHTML);

  const isBw = mode === 'bw';

  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Facture</title>
      ${styleHtml}
      <style>
        @page { margin: 10mm; size: A4; }
        body { margin: 0; padding: 0; font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; }
        * { box-sizing: border-box; }
        #invoicePrintArea { padding: 30px 35px; }
        @media print {
          body { margin: 0; padding: 0; }
          #invoicePrintArea { padding: 0; }
        }
        ${isBw ? `
        #invoicePrintArea, #invoicePrintArea * {
          color: #000 !important;
          background: #fff !important;
          background-color: #fff !important;
          border-color: #000 !important;
          text-shadow: none !important;
          box-shadow: none !important;
        }
        #invoicePrintArea table th,
        #invoicePrintArea table td {
          border-color: #000 !important;
        }
        #invoicePrintArea table thead tr {
          background: #eee !important;
          background-color: #eee !important;
        }
        #invoicePrintArea tbody tr:nth-child(even) {
          background: #f5f5f5 !important;
          background-color: #f5f5f5 !important;
        }
        ` : ''}
      </style>
    </head>
    <body>
      ${content.outerHTML}
      <script>window.print();window.close();<\/script>
    </body>
    </html>
  `);
  win.document.close();
}

function closeInvoicePreview() {
  const modal = document.getElementById('invoicePreviewModal');
  if (modal) modal.remove();
}

// ===== CHECKOUT =====

function confirmSalesCheckout() {
  if (_salesCart.length === 0) { alert(t('sales.cartEmptyAlert')); return; }

  let totalAmount = 0;
  let custDiscPct = 0;
  let extraDiscAmount = 0;
  const invoiceItems = [];
  let totalProfit = 0;

  if (_salesCustomerId) {
    const c = DB.getCustomer(_salesCustomerId);
    if (c && c.discount > 0) custDiscPct = c.discount;
  }

  const subTotal = _salesCart.reduce((s, item) => s + item.total, 0);
  const custDiscAmount = subTotal * (custDiscPct / 100);
  const afterCustDisc = subTotal - custDiscAmount;
  extraDiscAmount = parseFloat(document.getElementById('salesExtraDisc').value) || 0;
  if (extraDiscAmount > afterCustDisc) extraDiscAmount = afterCustDisc;
  totalAmount = afterCustDisc - extraDiscAmount;

  const productUpdates = [];
  for (const line of _salesCart) {
    for (const entry of line.entries) {
      const prod = DB.getProduct(entry.productId);
      if (!prod || prod.quantity < entry.qty) {
        alert(`"${line.name}" ${t('sales.notAvailableQty')}\n${t('sales.available')} ${prod ? prod.quantity : 0}`);
        return;
      }
    }
  }
  for (const line of _salesCart) {
    for (const entry of line.entries) {
      const prod = DB.getProduct(entry.productId);
      const entryRatio = subTotal > 0 ? entry.total / subTotal : 0;
      const entryDisc = custDiscAmount * entryRatio;
      const entryExtraDisc = extraDiscAmount * entryRatio;
      const finalPrice = entry.price - (entryDisc / entry.qty) - (entryExtraDisc / entry.qty);
      const itemTotal = finalPrice * entry.qty;

      const buyPrice = prod.buyPrice || 0;
      totalProfit += (finalPrice - buyPrice) * entry.qty;

      productUpdates.push({ id: entry.productId, changes: { quantity: prod.quantity - entry.qty } });

      invoiceItems.push({
        productId: entry.productId,
        barcode: line.barcode,
        name: line.name,
        qty: entry.qty,
        price: finalPrice,
        total: itemTotal,
        originalPrice: entry.price,
        discount: entryDisc + entryExtraDisc,
      });
    }
  }

  const paidAmount = Math.min(parseFloat(document.getElementById('salesPaidAmount').value) || 0, totalAmount);
  if (paidAmount > totalAmount) { alert(t('sales.paidExceedsTotal')); return; }

  // Batch update all product quantities at once
  DB.updateProductsBatch(productUpdates);

  const inv = DB.addInvoice({
    customerId: _salesCustomerId,
    type: 'customer',
    date: Date.now(),
    items: invoiceItems,
    totalAmount,
    customerDiscount: custDiscPct,
    extraDiscount: extraDiscAmount,
    profit: totalProfit,
  });

  if (paidAmount > 0) {
    DB.addPayment({
      customerId: _salesCustomerId,
      invoiceId: inv.id,
      amount: paidAmount,
      note: paidAmount >= totalAmount ? t('sales.fullPaymentNote') : t('sales.partialPaymentNote'),
    });
  }

  if (custDiscAmount > 0) {
    DB.addDiscount({
      invoiceId: inv.id,
      customerId: _salesCustomerId,
      customerName: _salesCustomerId ? (DB.getCustomer(_salesCustomerId)?.name || '') : '',
      type: t('sales.discountType'),
      amount: custDiscAmount,
      percentage: custDiscPct,
      originalTotal: subTotal,
      finalTotal: afterCustDisc,
    });
  }
  if (extraDiscAmount > 0) {
    DB.addDiscount({
      invoiceId: inv.id,
      customerId: _salesCustomerId,
      customerName: _salesCustomerId ? (DB.getCustomer(_salesCustomerId)?.name || '') : '',
      type: t('sales.discountManual'),
      amount: extraDiscAmount,
      percentage: 0,
      originalTotal: afterCustDisc,
      finalTotal: totalAmount,
    });
  }

  if (_salesCustomerId) {
    const customers = DB.getCustomers();
    const cIdx = customers.findIndex(c => c.id === _salesCustomerId);
    if (cIdx !== -1) {
      customers[cIdx].balance = (parseFloat(customers[cIdx].balance) || 0) + (totalAmount - paidAmount);
      DB.saveCustomers(customers);
    }
  }

  _salesCart = [];
  _salesCustomerId = null;
  _salesDefaultMode = 'unit';
  document.getElementById('salesSelectedCust').style.display = 'none';
  document.getElementById('salesWalkinLabel').style.display = 'none';
  document.getElementById('salesCustSearch').value = '';
  document.getElementById('salesPaySection').style.display = 'none';
  document.getElementById('salesExtraDisc').value = '0';
  document.getElementById('salesPaidAmount').value = '0';
  _salesPaidTouched = false;
  renderSalesCart();
  renderSalesProducts();

  showInvoicePreview(inv);
  document.getElementById('salesBarcodeScan').focus();
}

function clearSalesCart() {
  if (_salesCart.length === 0) return;
  if (!confirm(t('sales.clearCartConfirm'))) return;
  _salesCart = [];
  _salesCustomerId = null;
  _salesDefaultMode = 'unit';
  document.getElementById('salesSelectedCust').style.display = 'none';
  document.getElementById('salesWalkinLabel').style.display = 'none';
  document.getElementById('salesCustSearch').value = '';
  document.getElementById('salesPaySection').style.display = 'none';
  document.getElementById('salesExtraDisc').value = '0';
  document.getElementById('salesPaidAmount').value = '0';
  _salesPaidTouched = false;
  renderSalesCart();
  renderSalesProducts();
  document.getElementById('salesBarcodeScan').focus();
}
