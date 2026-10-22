var _salesCart = [];
var _salesCustomerId = null;
var _salesProducts = [];
var _salesSearchQuery = '';
var _salesRenderRAF = null;
var _salesDefaultMode = 'unit';
var _salesPaidTouched = false;
var _salesPayMethod = 'cash';
var _salesHideUntilSearch = false;
var _salesSuppId = null;
var _salesSupMode = false;
var _salesCreditUsed = 0;      // رصيد العميل الخاضع للخصم في البيع الحالي
var _salesComputedTotal = 0;   // آخر إجمالي محسوب بعد الخصومات (للباقي والدفع الكامل)

function onSalesPaidInput() {
  _salesPaidTouched = true;
  updateSalesRemaining();
}

function getSalesPaidAmount() {
  if (_salesPayMethod === 'mixed') {
    const cash = parseFloat(document.getElementById('salesCashAmount').value) || 0;
    const ccp = parseFloat(document.getElementById('salesCcpAmount').value) || 0;
    return { cash, ccp, total: cash + ccp };
  }
  const paid = parseFloat(document.getElementById('salesPaidAmount').value) || 0;
  return _salesPayMethod === 'ccp'
    ? { cash: 0, ccp: paid, total: paid }
    : { cash: paid, ccp: 0, total: paid };
}

function setSalesPayMethod(method) {
  _salesPayMethod = method;
  _salesPaidTouched = false;
  document.querySelectorAll('.pay-method-btn').forEach(b => b.classList.toggle('active', b.dataset.method === method));
  const mixed = method === 'mixed';
  document.getElementById('salesSinglePay').style.display = mixed ? 'none' : '';
  document.getElementById('salesMixedPay').style.display = mixed ? '' : 'none';
  updateSalesTotals();
}

function resetSalesPaymentUI() {
  _salesPayMethod = 'cash';
  _salesPaidTouched = false;
  document.getElementById('salesPaidAmount').value = '0';
  document.getElementById('salesCashAmount').value = '0';
  document.getElementById('salesCcpAmount').value = '0';
  document.querySelectorAll('.pay-method-btn').forEach(b => b.classList.toggle('active', b.dataset.method === 'cash'));
  document.getElementById('salesSinglePay').style.display = '';
  document.getElementById('salesMixedPay').style.display = 'none';
}

// Settings helpers (also defined in settings.js — duplicated here for availability in sales page)
function getStoreInfo() {
  // Centralized in barcode-print.js: returns the active company when set,
  // otherwise falls back to the store's stored values.
  if (typeof window.getPrintInfo === 'function') {
    return window.getPrintInfo();
  }
  return {
    name: localStorage.getItem('zmt_store_name') || 'ZMT PIECE',
    address: localStorage.getItem('zmt_store_address') || '',
    phone: localStorage.getItem('zmt_store_phone') || '',
    nis: localStorage.getItem('zmt_store_nis') || '',
    nif: localStorage.getItem('zmt_store_nif') || '',
    rcc: localStorage.getItem('zmt_store_rcc') || '',
    article: localStorage.getItem('zmt_store_article') || '',
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
  invalidateSalesGroupsCache();
  _salesSearchQuery = '';
  _salesDefaultMode = 'unit';
  _salesHideUntilSearch = (function () { try { return localStorage.getItem('zmt_sales_hide_until_search') === '1'; } catch (e) { return false; } })();
  renderSalesProducts();
  _syncSalesHideBtn();
  setupSalesBarcode();
  setupSalesGridScroll();
  // Keyboard quick-quantity modal: reset page-scoped state (navigation may have
  // left the flag set), drop any stale overlay DOM and (re)bind the key handler
  // so it is automatically unregistered when this page is left.
  _qkOpen = false;
  _qkIndex = 0;
  _qkBuffer = null;
  const staleQk = document.getElementById('salesQkModal');
  if (staleQk) staleQk.remove();
  trackPageListener('keydown', _qkHandler);
  const qkBtn = document.getElementById('salesQkOpenBtn');
  if (qkBtn) {
    qkBtn.disabled = true;
    qkBtn.title = t('sales.qtyModalHint') || qkBtn.title;
  }
  const supBtn = document.getElementById('salesSupSaleBtn');
  if (supBtn) {
    const isManager = (typeof Auth !== 'undefined') && Auth.isManager();
    supBtn.style.display = isManager ? '' : 'none';
  }
  // F4 shortcut: "sales history" pressed from another page - open it after
  // the sales page finishes loading.
  if (window._invOpenSalesHistory) {
    window._invOpenSalesHistory = false;
    if (typeof openSalesHistory === 'function') openSalesHistory();
  }
}

function setupSalesGridScroll() {
  const grid = document.getElementById('salesProductGrid');
  if (!grid) return;
  if (grid.dataset.scrollBound) return;
  grid.dataset.scrollBound = '1';
  grid.addEventListener('scroll', () => {
    if (grid.scrollTop <= 200 && _salesStart > 0) {
      _prependSalesGroups();
    }
    if (grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 600) {
      loadMoreSalesProducts();
    }
  });
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== PRODUCT GROUPS (merge same name+barcode, FIFO) =====

var _salesGroupList = [];
var _salesGroupsCache = null;
var _salesRenderedCount = 0;
var _salesStart = 0;
var _salesGridLoadingMore = false;

// Soft ceiling on live DOM nodes: leading groups are trimmed while scrolling
// down and re-rendered when scrolling back up (windowed / virtual list).
const SALES_MAX_NODES = 600;
const _salesGroupNormCache = new WeakMap();
function _salesGroupNorm(g) {
  let norm = _salesGroupNormCache.get(g);
  if (norm === undefined) {
    const rep = groupViableRecords(g)[0] || g.records[0] || {};
    norm = normalizeSearchText([g.name, g.barcode, rep.mark, rep.reference, rep.countryOfOrigin].filter(Boolean).join(' '));
    _salesGroupNormCache.set(g, norm);
  }
  return norm;
}

// Fast multi-word search over groups: cheap pre-filter on the cached normalized
// text, real score only for candidates, capped so huge result sets are bounded.
function _searchSalesGroups(groups, q, cap) {
  const limit = (cap && cap > 0) ? cap : 200;
  const tokens = searchTokens(q);
  const out = [];
  for (const g of groups) {
    const norm = _salesGroupNorm(g);
    let ok = true;
    for (const t of tokens) {
      if (!norm || norm.indexOf(t) === -1) { ok = false; break; }
    }
    if (!ok) continue;
    const rep = groupViableRecords(g)[0] || g.records[0] || {};
    const s = productSearchScore(g.name, g.barcode, q, rep.mark, rep.reference, rep.countryOfOrigin);
    if (s <= 0) continue;
    out.push({ g, s });
    if (out.length >= limit) break;
  }
  out.sort((a, b) => {
    const aOos = salesGroupOutOfStockCached(a.g) ? 1 : 0;
    const bOos = salesGroupOutOfStockCached(b.g) ? 1 : 0;
    return (aOos - bOos) || (b.s - a.s);
  });
  return out.map(x => x.g);
}

// Windowed rendering: when the live DOM exceeds SALES_MAX_NODES, drop leading
// groups and compensate the scroll position so the viewport stays put.
function _trimSalesGrid() {
  const grid = document.getElementById('salesProductGrid');
  if (!grid || !grid.isConnected) return;
  while (grid.childElementCount > SALES_MAX_NODES) {
    const first = grid.firstElementChild;
    if (!first) break;
    const h = first.getBoundingClientRect().height + 8;
    first.remove();
    _salesStart++;
    grid.scrollTop = Math.max(0, grid.scrollTop - h);
  }
}

// User scrolled back to the trimmed head -> re-render earlier groups.
function _prependSalesGroups() {
  if (_salesStart <= 0 || _salesGridLoadingMore) return;
  _salesGridLoadingMore = true;
  const grid = document.getElementById('salesProductGrid');
  if (!grid || !grid.isConnected) { _salesGridLoadingMore = false; return; }
  const from = Math.max(0, _salesStart - SALES_GRID_PAGE_SIZE);
  const first = grid.firstChild;
  const prevTop = first ? first.getBoundingClientRect().top : 0;
  let html = '';
  for (let i = from; i < _salesStart; i++) html += salesCardHTML(_salesGroupList[i], i);
  if (html) {
    grid.insertAdjacentHTML('afterbegin', html);
    if (first) {
      const delta = Math.max(0, first.getBoundingClientRect().top - prevTop);
      grid.scrollTop = Math.max(0, grid.scrollTop + delta);
    }
  }
  _salesStart = from;
  _salesGridLoadingMore = false;
}

function salesGroupKey(p) {
  return (p.name || '') + '\u0001' + (p.barcode || '');
}

function invalidateSalesGroupsCache() {
  _salesGroupsCache = null;
  _salesGroupsIndex = null;
}

var _salesGroupsIndex = null;

function getSalesGroups() {
  if (_salesGroupsCache) return _salesGroupsCache;
  const map = new Map();
  const groups = [];
  const prods = _salesProducts;
  for (let i = 0; i < prods.length; i++) {
    const p = prods[i];
    const key = salesGroupKey(p);
    let g = map.get(key);
    if (!g) {
      g = { key, name: p.name, barcode: p.barcode, records: [] };
      map.set(key, g);
      groups.push(g);
    }
    g.records.push(p);
  }
  for (let i = 0; i < groups.length; i++) {
    groups[i].records.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }
  _salesGroupsCache = groups;
  _salesGroupsIndex = map;
  return groups;
}

function getSalesGroupByKey(key) {
  const groups = getSalesGroups();
  if (_salesGroupsIndex) return _salesGroupsIndex.get(key) || null;
  for (const g of groups) {
    if (g.key === key) return g;
  }
  return null;
}

function getGroupAvailableQty(group) {
  if (!salesPharmacyOn()) {
    return group.records.reduce((s, r) => s + (r.quantity || 0), 0);
  }
  // Pharmacy mode: soldable stock = non-expired batches only.
  return group.records.reduce((s, r) => {
    if ((r.quantity || 0) <= 0) return s;
    if (isFixedRecord(r)) return s; // fixed = unlimited, handled via isGroupFixed
    if (salesExpiryClass(r) === 'expired') return s;
    return s + (r.quantity || 0);
  }, 0);
}

// A "fixed" product (restaurant-style menu item) has no tracked quantity:
// quantity stays 0 but it is always available and unlimited.
function isFixedRecord(r) { return !!(r && r.fixed === true); }
function isGroupFixed(group) { return (group.records || []).some(isFixedRecord); }
function isGroupOutOfStock(group) {
  return !isGroupFixed(group) && getGroupAvailableQty(group) <= 0;
}

// True when a pharmacy product still holds expired batches (even if some
// valid stock remains) — used to warn the cashier on the product card.
function hasExpiredBatches(group) {
  if (!salesPharmacyOn()) return false;
  return (group.records || []).some(r => (r.quantity || 0) > 0 && salesExpiryClass(r) === 'expired');
}

// Max qty that may be ordered for a group: unlimited (999) for fixed products.
function getGroupMaxQty(group) {
  return isGroupFixed(group) ? 999 : getGroupAvailableQty(group);
}

// Records that are actually sellable (non-expired in pharmacy mode) —
// keeps FIFO order and prefers stock > 0.
function groupViableRecords(group) {
  const recs = (group.records || []).filter(r => isFixedRecord(r) || (r.quantity || 0) > 0);
  if (!salesPharmacyOn()) return recs;
  return recs.filter(r => isFixedRecord(r) || salesExpiryClass(r) !== 'expired');
}

function getGroupActivePrice(group) {
  const r = groupViableRecords(group)[0] || group.records[0] || {};
  return r.sellPrice || 0;
}

function getGroupWholesalePrice(group) {
  const r = groupViableRecords(group)[0] || group.records[0] || {};
  return r.wholesalePrice || r.sellPrice || 0;
}

/* ============================================================
   PHARMACY-STOCK HELPERS — expiry-aware availability.
   ============================================================ */
function salesPharmacyOn() {
  return typeof window.getPharmacyMode === 'function' && !!window.getPharmacyMode();
}

function salesTodayMs() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function salesWarnDays() {
  try {
    const s = typeof getExpirySettings === 'function' ? getExpirySettings() : null;
    return (s && s.warnDays) || 30;
  } catch (e) { return 30; }
}

// ms timestamp of a record's expiry date (normalized to midnight), or null.
function salesExpiryMs(r) {
  if (!r || !r.expiryDate) return null;
  const t = new Date(String(r.expiryDate).slice(0, 10) + 'T00:00:00').getTime();
  return isNaN(t) ? null : t;
}

// 'expired' | 'expiring' | 'ok' | 'none'
function salesExpiryClass(r) {
  const t = salesExpiryMs(r);
  if (t === null) return 'none';
  const today = salesTodayMs();
  if (t < today) return 'expired';
  if (t <= today + salesWarnDays() * 86400000) return 'expiring';
  return 'ok';
}

// Short i18n label for the nearest expiry of a group's batches.
function salesGroupExpiryChip(g) {
  if (!salesPharmacyOn()) return '';
  const today = salesTodayMs();
  let expiredDays = null, expiredDate = null, expiringDays = null, hasDate = false;
  (g.records || []).forEach(r => {
    const t = salesExpiryMs(r);
    if (t === null) return;
    hasDate = true;
    const days = Math.floor((t - today) / 86400000);
    if (days <= 0) { if (expiredDays === null || days > expiredDays) { expiredDays = days; expiredDate = r.expiryDate; } }
    else if (days <= salesWarnDays()) { if (expiringDays === null || days < expiringDays) expiringDays = days; }
  });
  if (expiredDays !== null) {
    const label = (expiredDays === 0)
      ? (t('expiry.expiresToday') || 'ينتهي اليوم')
      : (t('expiry.overdue') || 'متأخر') + ' ' + Math.abs(expiredDays) + ' ' + (t('expiry.days') || 'يوم');
    return '<span class="exp-chip exp-chip-expired" title="' + escHtml(expiredDate || '') + '"><i class="fas fa-ban"></i> ' + escHtml(label) + '</span>';
  }
  if (expiringDays !== null) {
    return '<span class="exp-chip exp-chip-expiring"><i class="fas fa-hourglass-half"></i> ' + (t('expiry.inDays') || 'بعد') + ' ' + expiringDays + ' ' + (t('expiry.days') || 'يوم') + '</span>';
  }
  if (hasDate) {
    return '<span class="exp-chip exp-chip-ok"><i class="fas fa-check-circle"></i> ' + (t('expiry.sumOk') || 'سليم') + '</span>';
  }
  return '';
}

// Family capsule shown on the product card in pharmacy mode.
function salesFamilyChip(g) {
  if (!salesPharmacyOn()) return '';
  const family = getSalesGroupFamily(g);
  if (!family) return '';
  return '<span class="family-chip"><i class="fas fa-layer-group"></i> ' + escHtml(family) + '</span>';
}

var _salesSubstituteKeys = [];

function getSalesGroupFamily(group) {
  const recs = group.records || [];
  const viable = groupViableRecords(group).filter(r => String((r && r.family) || '').trim());
  const record = viable[0] || recs.find(r => String((r && r.family) || '').trim()) || recs[0];
  return String((record && record.family) || '').trim();
}

function hasSalesSubstitutes(group) {
  return salesPharmacyOn() && salesGroupOutOfStockCached(group) && !!getSalesGroupFamily(group);
}

function closeSalesSubstitutes() {
  const modal = document.getElementById('salesSubstituteModal');
  if (modal) modal.style.display = 'none';
  _salesSubstituteKeys = [];
}

function openSalesSubstitutes(index) {
  const group = _salesGroupList[index];
  const modal = document.getElementById('salesSubstituteModal');
  const body = document.getElementById('salesSubstituteBody');
  if (!group || !modal || !body) return;

  const family = getSalesGroupFamily(group);
  const familyKey = normalizeSearchText(family);
  const substitutes = familyKey
    ? getSalesGroups().filter(candidate =>
        candidate.key !== group.key &&
        !isGroupOutOfStock(candidate) &&
        normalizeSearchText(getSalesGroupFamily(candidate)) === familyKey
      )
    : [];

  _salesSubstituteKeys = substitutes.map(candidate => candidate.key);

  const esc = escHtml;
  const intro = `<div class="sub-intro">
      <div class="sub-intro-icon"><i class="fas fa-pills"></i></div>
      <div class="sub-intro-txt">
        <div class="sub-intro-label">${t('sales.substituteFor')}</div>
        <div class="sub-intro-name">${esc(group.name)}</div>
        <div class="sub-intro-family"><i class="fas fa-layer-group"></i> ${esc(family || t('sales.substituteNoFamily'))}</div>
      </div>
    </div>`;

  if (!family) {
    body.innerHTML = intro + `<div class="sub-empty"><i class="fas fa-pills"></i>${t('sales.substituteNoFamily')}</div>`;
  } else if (!substitutes.length) {
    body.innerHTML = intro + `<div class="sub-empty"><i class="fas fa-box-open"></i>${t('sales.substituteEmpty')}</div>`;
  } else {
    const list = substitutes.map((candidate, substituteIndex) => {
      const stock = isGroupFixed(candidate) ? '∞' : getGroupAvailableQty(candidate);
      const chip = salesGroupExpiryChip(candidate);
      return `<div class="sub-item">
        <div class="sub-info">
          <span class="sub-name">${esc(candidate.name)}</span>
          <span class="sub-meta">
            <span dir="ltr">${esc(candidate.barcode || '-')}</span>
            <span class="sub-stock"><i class="fas fa-boxes"></i> ${stock} ${isGroupFixed(candidate) ? '' : t('inventory.col4')}</span>
          </span>
          ${chip ? `<span class="sub-chips">${chip}</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
          <span class="sub-price">DA${fmtMoney(getGroupActivePrice(candidate))}</span>
          <button class="btn btn-sm btn-primary sub-add-btn" onclick="addSalesSubstitute(${substituteIndex})"><i class="fas fa-cart-plus"></i> ${t('sales.substituteAdd')}</button>
        </div>
      </div>`;
    }).join('');
    const countLabel = `<div class="sub-hint"><i class="fas fa-lightbulb"></i> ${substitutes.length} ${t('sales.substituteCount')}</div>`;
    body.innerHTML = intro + countLabel + `<div class="sub-list">${list}</div>`;
  }
  modal.style.display = 'flex';
}

function addSalesSubstitute(index) {
  const key = _salesSubstituteKeys[index];
  const group = key ? getSalesGroupByKey(key) : null;
  if (!group || isGroupOutOfStock(group)) return;
  addSalesLine(key);
  closeSalesSubstitutes();
}

function allocateSalesLine(line, key) {
  const g = getSalesGroupByKey(key);
  if (!g) {
    line.entries = [];
    line.qty = 0;
    line.price = 0;
    line.baseTotal = 0;
    line.total = 0;
    return;
  }
  const entries = [];
  let remaining = line.qty;
  let latestPrice = 0;
  const wholesale = line.mode === 'wholesale';
  const pharm = salesPharmacyOn();
  let blockedExpired = 0;
  for (const r of g.records) {
    if (remaining <= 0) break;
    // Pharmacy: expired batches can never be sold, whatever their qty.
    if (pharm && !isFixedRecord(r) && (r.quantity || 0) > 0 && salesExpiryClass(r) === 'expired') {
      blockedExpired += (r.quantity || 0);
      continue;
    }
    const take = isFixedRecord(r) ? remaining : Math.min(r.quantity || 0, remaining);
    if (take > 0) {
      const price = wholesale ? (r.wholesalePrice || r.sellPrice || 0) : (r.sellPrice || 0);
      entries.push({ productId: r.id, qty: take, price, total: take * price });
      latestPrice = price;
      remaining -= take;
    }
  }
  // Surface to the UI how much expired stock was skipped / could not be filled.
  line.blockedExpired = blockedExpired;
  line.shortQty = Math.max(0, remaining);
  // Apply a manual per-line unit price override (kept across re-allocation)
  if (line.manualPrice != null && !isNaN(line.manualPrice)) {
    const mp = Math.max(0, line.manualPrice);
    entries.forEach(e => { e.price = mp; e.total = e.qty * mp; });
    latestPrice = mp;
  }
  const baseTotal = entries.reduce((s, e) => s + e.total, 0);
  line.entries = entries;
  line.baseTotal = baseTotal;
  line.price = line.manualPrice != null && !isNaN(line.manualPrice) ? Math.max(0, line.manualPrice) : latestPrice;
  // Per-line discount is a fixed DA amount subtracted from the line total
  const lineDisc = Math.max(0, Math.min(line.discount || 0, baseTotal));
  line.total = baseTotal - lineDisc;
}

// ===== PRODUCT GRID (ALL products, chunked rendering) =====

// Per-render context: values that stay constant for one grid paint, hoisted out
// of the card template so a page of cards does not each re-read localStorage or
// rebuild the merged brand array. Rebuilt at the top of every full render;
// pages added later by loadMoreSalesProducts keep the same snapshot, exactly
// like the HTML already on screen.
var _salesCardCtx = null;
function _buildSalesCardCtx() {
  return {
    lowStockThreshold: DB.getLowStockThreshold(),
    restOrder: !!(window.RestService && window.RestService.canOrderFromSales()),
    restSelf: !!(window.RestService && window.RestService.canSelfOrder()),
    brands: [...BRANDS.global, ...BRANDS.chinese],
  };
}

// Out-of-stock walks every batch (and, in pharmacy mode, re-reads the expiry
// settings from localStorage), and the ranking sort calls it about twice per
// group on every keystroke — thousands of extra reads per search. Memoized for
// the duration of ONE render only: renderSalesProducts rebuilds the WeakMap, so
// a sale that just changed stock is always re-evaluated on the next paint.
var _salesOosCache = new WeakMap();
function salesGroupOutOfStockCached(g) {
  let v = _salesOosCache.get(g);
  if (v === undefined) { v = isGroupOutOfStock(g); _salesOosCache.set(g, v); }
  return v;
}

function salesCardHTML(g, i) {
  const ctx = _salesCardCtx || (_salesCardCtx = _buildSalesCardCtx());
  const fixed = isGroupFixed(g);
  const totalQty = getGroupAvailableQty(g);
  const price = getGroupActivePrice(g);
  const whole = getGroupWholesalePrice(g);
  const outOfStock = !fixed && totalQty <= 0;
  const lowStock = !fixed && totalQty > 0 && totalQty <= ctx.lowStockThreshold;
  const expiredAll = salesPharmacyOn() && !fixed && outOfStock && hasExpiredBatches(g);
  const multi = g.records.length > 1;
  const rep = groupViableRecords(g)[0] || g.records[0] || {};
  const brands = ctx.brands;
  const brand = brands.find(b => b.id === rep.brandId);
  const qtyBadge = outOfStock ? 'danger' : (lowStock ? 'warn' : 'ok');
  const wholeVisible = whole > 0 && whole !== price;
  const substituteAvailable = hasSalesSubstitutes(g);
  const chips = (salesPharmacyOn() && (salesFamilyChip(g) || salesGroupExpiryChip(g)))
    ? `<div class="prod-card-chips">${salesFamilyChip(g)}${salesGroupExpiryChip(g)}</div>` : '';
  const expiredNote = expiredAll
    ? `<div class="prod-card-expired-note"><i class="fas fa-ban"></i> ${t('sales.expiredBlocked')}</div>` : '';
  return `<div class="prod-card ${outOfStock ? 'oos' : ''} ${expiredAll ? 'oos-expired' : ''}"
    onclick="${outOfStock ? '' : `addSalesGroupToCart(${i})`}"
    ${outOfStock ? `title="${t('sales.unavailable')}"` : ''}>
    <div class="prod-card-head">
      <div class="prod-card-head-main">
        <div class="prod-card-title">${escHtml(g.name)}</div>
        <div class="prod-card-meta">
          <span class="prod-meta"><i class="fas fa-tag"></i> ${t('quickEntry.mark')}: <b>${escHtml(rep.mark || '-')}</b></span>
          <span class="prod-meta mono"><i class="fas fa-barcode"></i> ${escHtml(g.barcode || '-')}</span>
          ${multi ? `<span class="prod-meta"><i class="fas fa-layer-group"></i> ${g.records.length} ${t('sales.multiBatches')}</span>` : ''}
        </div>
      </div>
      <span class="prod-card-badge ${qtyBadge}" ${fixed ? `title="${t('sales.unlimited')}"` : ''}>${fixed ? '\u221E' : totalQty} ${fixed ? '' : t('inventory.col4')}</span>
    </div>
    ${chips}
    ${expiredNote}
    <div class="prod-card-fields">
      <div class="prod-field full"><span class="prod-field-label"><i class="fas fa-hashtag"></i> ${t('quickEntry.reference')}</span><span class="prod-field-value">${referenceCellHTML(rep.reference)}</span></div>
      <div class="prod-field full"><span class="prod-field-label"><i class="fas fa-globe"></i> ${t('quickEntry.countryOfOrigin')}</span><span class="prod-field-value">${escHtml(rep.countryOfOrigin || '-')}</span></div>
      <div class="prod-field"><span class="prod-field-label"><i class="fas fa-warehouse"></i> ${t('quickEntry.storageLocation')}</span><span class="prod-field-value">${escHtml(rep.storageLocation || '-')}</span></div>
      <div class="prod-field"><span class="prod-field-label"><i class="fas fa-trademark"></i> ${t('inventory.col3')}</span><span class="prod-field-value">${escHtml(brand ? brand.name : (rep.brandId || '-'))}</span></div>
    </div>
    <div class="prod-card-pricerow ${wholeVisible ? '' : 'single'}">
      <div class="price-pill price-unit"><span>${t('inventory.col6')}</span><b>DA${fmtMoney(price)}</b></div>
      ${wholeVisible ? `<div class="price-pill price-whole"><span>${t('quickEntry.wholesalePrice')}</span><b>DA${fmtMoney(whole)}</b></div>` : ''}
    </div>
    ${substituteAvailable ? `<button type="button" class="prod-card-oos-btn" onclick="event.stopPropagation();openSalesSubstitutes(${i})"><i class="fas fa-pills"></i> ${t('sales.findSubstitute')}</button>` : ''}
    ${ctx.restOrder ? `<button type="button" class="rest-order-btn rest-order-btn-primary" onclick="event.stopPropagation();window.RestService.restOrderGroup(${i})"><i class="fas fa-utensils"></i> ${escHtml(t('rest.orderBtn'))}</button>` : ''}
    ${ctx.restSelf ? `<button type="button" class="rest-order-btn rest-order-btn-self" onclick="event.stopPropagation();window.RestService.restOrderGroupSelf(${i})"><i class="fas fa-store"></i> ${escHtml(t('rest.orderSelfBtn'))}</button>` : ''}
  </div>`;
}

// First page only: the grid lazy-loads the rest on scroll (loadMoreSalesProducts)
// so a keystroke never builds 200+ heavy cards in a single frame.
const SALES_GRID_PAGE_SIZE = 60;

function renderSalesProducts(filter) {
  if (typeof filter === 'string') {
    _salesSearchQuery = normSearch(filter);
  }
  if (_salesRenderRAF) { cancelAnimationFrame(_salesRenderRAF); _salesRenderRAF = null; }
  // Fresh caches for this paint: quantities, settings and stock state may have
  // changed since the previous one.
  _salesCardCtx = null;
  _salesOosCache = new WeakMap();

  const grid = document.getElementById('salesProductGrid');
  if (!grid || !grid.isConnected) return;
  const q = _salesSearchQuery;
  const hiding = _salesHideUntilSearch && (!q || q.trim().length < 2);
  let groups;
  if (hiding) {
    // Hide-until-search: render nothing and skip group building + sorting
    // entirely, so opening the page stays cheap on very large catalogues.
    groups = [];
  } else if (q && q.trim().length >= 2) {
    // Smart multi-word search: every word must match name or barcode, ranked by
    // match quality, out-of-stock pushed to the bottom, and capped at 200 so a
    // huge result set is bounded (the grid itself is also windowed).
    groups = _searchSalesGroups(getSalesGroups(), q, 200);
  } else {
    groups = getSalesGroups();
    // Stable sort: out-of-stock products sink to the bottom, everything else keeps its order
    groups.sort((a, b) => (salesGroupOutOfStockCached(a) ? 1 : 0) - (salesGroupOutOfStockCached(b) ? 1 : 0));
  }
  _salesGroupList = groups;
  _salesRenderedCount = 0;
  _salesStart = 0;
  _salesGridLoadingMore = false;

  const count = document.getElementById('salesProdCount');
  if (count) count.textContent = `${groups.length} ${t('common.product')}`;

  grid.innerHTML = '';
  if (groups.length === 0) {
    grid.innerHTML = `<div class="sales-grid-empty">
      <i class="fas ${hiding ? 'fa-search' : 'fa-box-open'}"></i>
      <p>${hiding ? 'اكتب في البحث لعرض المنتجات…' : (q ? t('sales.emptyResults') : t('sales.emptyProducts'))}</p>
    </div>`;
    return;
  }

  const renderNextPage = () => {
    // Must be cleared FIRST: loadMoreSalesProducts refuses to run while a frame
    // is pending, and nothing ever reset this handle, which silently disabled
    // the infinite scroll (the grid froze at the first page forever).
    _salesRenderRAF = null;
    if (!grid || !grid.isConnected) return;
    if (_salesRenderedCount >= groups.length) return;
    const from = _salesRenderedCount;
    const to = Math.min(from + SALES_GRID_PAGE_SIZE, groups.length);
    let html = '';
    for (let i = from; i < to; i++) {
      html += salesCardHTML(groups[i], i);
    }
    _salesRenderedCount = to;
    grid.insertAdjacentHTML('beforeend', html);
    _trimSalesGrid();
  };
  _salesRenderRAF = requestAnimationFrame(renderNextPage);
}

function loadMoreSalesProducts() {
  if (_salesGridLoadingMore || _salesRenderRAF) return;
  _salesGridLoadingMore = true;
  const grid = document.getElementById('salesProductGrid');
  if (!grid || !grid.isConnected) { _salesGridLoadingMore = false; return; }
  const t0 = performance.now();
  let html = '';
  const groups = _salesGroupList;
  while (_salesRenderedCount < groups.length) {
    html += salesCardHTML(groups[_salesRenderedCount], _salesRenderedCount);
    _salesRenderedCount++;
    if ((performance.now() - t0) > 15) break;
  }
  grid.insertAdjacentHTML('beforeend', html);
  _trimSalesGrid();
  _salesGridLoadingMore = false;
}

const _debouncedSalesSearch = debounce((q) => { renderSalesProducts(q); }, 200);
function filterSalesProducts(q) {
  _debouncedSalesSearch(q);
}

function _syncSalesHideBtn() {
  const btn = document.getElementById('salesHideUntilSearchBtn');
  if (!btn) return;
  if (_salesHideUntilSearch) {
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    btn.title = 'عرض كل المنتجات';
  } else {
    btn.classList.remove('active');
    btn.setAttribute('aria-pressed', 'false');
    btn.title = 'إخفاء المنتجات حتى البحث (تظهر المطابقة فقط)';
  }
}

function toggleSalesHideUntilSearch() {
  _salesHideUntilSearch = !_salesHideUntilSearch;
  try { localStorage.setItem('zmt_sales_hide_until_search', _salesHideUntilSearch ? '1' : '0'); } catch (e) {}
  _syncSalesHideBtn();
  if (_salesHideUntilSearch) {
    const input = document.getElementById('salesSearch');
    if (input) setTimeout(function () { input.focus(); }, 60);
  }
  renderSalesProducts();
}

// ===== BARCODE SCANNER =====

function setupSalesBarcode() {
  const input = document.getElementById('salesBarcodeScan');
  if (!input) return;
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  newInput.addEventListener('keydown', handleSalesBarcodeScan);
  newInput.addEventListener('input', function() {
    const cleaned = cleanScannedCode(this.value);
    if (cleaned !== this.value) this.value = cleaned;
  });
  newInput.focus();
}

function handleSalesBarcodeScan(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const input = document.getElementById('salesBarcodeScan');
    const code = cleanScannedCode(input.value);
    if (!code) return;

    const beam = document.getElementById('salesScannerBeam');
    if (beam) beam.classList.add('active');

    document.getElementById('salesBarcodeStatus').textContent = '...';
    document.getElementById('salesBarcodeStatus').style.color = '#0066B1';

    const prod = DB.getProductByBarcode(code);
    if (prod) {
      const gKey = salesGroupKey(prod);
      const g = getSalesGroupByKey(gKey);
      const available = g ? !isGroupOutOfStock(g) : prod.fixed === true || (prod.quantity || 0) > 0;
      if (!available) {
        // Pharmacy: expired batch blocks the sale — tell the cashier exactly why.
        const expired = g && salesPharmacyOn() && hasExpiredBatches(g);
        document.getElementById('salesBarcodeStatus').textContent = expired ? t('sales.scannerExpired') : t('sales.unavailable');
        document.getElementById('salesBarcodeStatus').style.color = '#dc3545';
        input.value = '';
        if (beam) setTimeout(() => beam.classList.remove('active'), 400);
        return;
      }
      addSalesLine(gKey);
      document.getElementById('salesBarcodeStatus').textContent = t('sales.scannerDone');
      document.getElementById('salesBarcodeStatus').style.color = '#28a745';
    } else {
      document.getElementById('salesBarcodeStatus').textContent = t('sales.scannerNotFound');
      document.getElementById('salesBarcodeStatus').style.color = '#e65100';
    }
    input.value = '';
    // Keep focus pinned on the scanner field so consecutive items can be read
    // without re-selecting the field between scans.
    setTimeout(() => {
      const s = document.getElementById('salesBarcodeScan');
      if (s && document.activeElement !== s) s.focus();
    }, 0);
    if (beam) setTimeout(() => beam.classList.remove('active'), 400);
    setTimeout(() => {
      const s = document.getElementById('salesBarcodeStatus');
      if (s) { s.textContent = t('sales.scannerReady'); s.style.color = '#888'; }
    }, 2000);
  }
}

// ===== CUSTOMER =====

function getSalesCustomerCredit() {
  if (!_salesCustomerId) return 0;
  const c = DB.getCustomer(_salesCustomerId);
  if (!c) return 0;
  const bal = parseFloat(c.balance) || 0;
  return bal < 0 ? Math.abs(bal) : 0;
}

function renderCustomerBalanceChip(c) {
  const bal = parseFloat(c && c.balance) || 0;
  if (bal > 0) return `<span style="color:#dc3545;font-weight:700">دين عليه: DA${fmtMoney(bal)}</span>`;
  if (bal < 0) return `<span style="color:#1a7f37;font-weight:700">له رصيد: DA${fmtMoney(Math.abs(bal))}</span>`;
  return '<span style="color:var(--silver-500);font-weight:700">الرصيد: 0</span>';
}

function renderSalesCreditSection() {
  const section = document.getElementById('salesCreditSection');
  if (!section) return;
  const hasCart = _salesCart.length > 0;
  const credit = getSalesCustomerCredit();
  if (!hasCart || credit <= 0 || _salesSupMode) {
    section.style.display = 'none';
    if (_salesCreditUsed > 0) _salesCreditUsed = 0;
    return;
  }
  section.style.display = '';
  const total = _salesComputedTotal || 0;
  const usable = Math.min(credit, total);
  const txt = document.getElementById('salesCreditToggleText');
  const info = document.getElementById('salesCreditInfo');
  const label = document.getElementById('salesCreditLabel');
  if (!txt || !info || !label) return;
  if (_salesCreditUsed > 0) {
    txt.textContent = 'إلغاء الخصم';
    label.textContent = `سيتم خصم DA${fmtMoney(usable)} من رصيد العميل`;
    info.textContent = `رصيد العميل لصالحه: DA${fmtMoney(credit)} — الباقي بعد الخصم: DA${fmtMoney(Math.max(0, total - usable))}`;
  } else {
    txt.textContent = 'تطبيق الخصم';
    label.textContent = 'خصم المبلغ من رصيد العميل';
    info.textContent = `رصيد لصالح العميل (نحن مدينون له): DA${fmtMoney(credit)} — عند تطبيقه يُدفع الخصم من رصيده ويبقى المتبقي نقداً.`;
  }
}

function toggleSalesCredit() {
  const credit = getSalesCustomerCredit();
  if (credit <= 0) return;
  if (_salesCreditUsed > 0) {
    _salesCreditUsed = 0;
  } else {
    const total = _salesComputedTotal || 0;
    _salesCreditUsed = credit >= total ? total : credit;
  }
  renderSalesCreditSection();
  updateSalesTotals();
}

function searchSalesCustomer(q) {
  const results = document.getElementById('salesCustResults');
  q = normSearch(q);
  const customers = DB.getCustomers();
  const matches = q
    ? customers.filter(c =>
        c.name.toLowerCase().includes(q.toLowerCase()) || (c.phone && c.phone.includes(q))
      ).slice(0, 10)
    : customers.slice(0, 10);
  results.innerHTML = matches.length === 0
    ? `<div class="search-result-item disabled">${t('sales.noCustResults')}</div>`
    : matches.map(c => `<div class="search-result-item" onclick="selectSalesCustomer('${c.id}')">
        <strong>${escHtml(c.name)}</strong>
        <span class="text-muted">${c.phone || ''} ${c.discount > 0 ? `| ${t('sales.discount')} ${c.discount}%` : ''}</span>
        <span style="display:block;font-size:12px;font-weight:700;margin-top:2px">${renderCustomerBalanceChip(c)}</span>
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
  _salesCreditUsed = 0;
  const balEl = document.getElementById('salesSelCustBalance');
  const bal = parseFloat(c.balance) || 0;
  if (balEl) {
    if (bal > 0) {
      balEl.style.display = '';
      balEl.textContent = `دين عليه: DA${fmtMoney(bal)}`;
      balEl.style.color = '#dc3545';
    } else if (bal < 0) {
      balEl.style.display = '';
      balEl.textContent = `له رصيد: DA${fmtMoney(Math.abs(bal))}`;
      balEl.style.color = '#1a7f37';
    } else {
      balEl.style.display = 'none';
    }
  }
  updateSalesTotals();
}

// ===== ADD CUSTOMER FROM SALES PAGE =====
// Self-contained so it works without loading the customers page script.
function openSalesAddCustomer() {
  const m = document.getElementById('salesAddCustomerModal');
  if (!m._host) m._host = m.parentNode;
  if (m.parentNode !== document.body) document.body.appendChild(m);
  document.getElementById('sacName').value = '';
  document.getElementById('sacPhone').value = '';
  document.getElementById('sacAddress').value = '';
  document.getElementById('sacType').value = 'unit';
  document.getElementById('sacDiscount').value = '0';
  m.style.display = 'flex';
  setTimeout(() => { const el = document.getElementById('sacName'); if (el) el.focus(); }, 150);
}

function closeSalesAddCustomer() {
  const m = document.getElementById('salesAddCustomerModal');
  if (!m) return;
  m.style.display = 'none';
  if (m._host && m.parentNode === document.body) m._host.appendChild(m);
}

function confirmSalesAddCustomer() {
  const name = document.getElementById('sacName').value.trim();
  if (!name) { alert(t('customers.nameRequired') || 'الرجاء إدخال اسم العميل'); return; }
  const discount = parseFloat(document.getElementById('sacDiscount').value) || 0;
  if (discount < 0 || discount > 100) { alert(t('customers.discountRange') || 'نسبة الخصم يجب أن تكون بين 0 و 100'); return; }

  const cust = DB.addCustomer({
    name,
    phone: document.getElementById('sacPhone').value.trim(),
    address: document.getElementById('sacAddress').value.trim(),
    type: document.getElementById('sacType').value === 'whole' ? 'whole' : 'unit',
    discount,
  });
  if (cust) DB.logAudit({ action: 'add', entity: 'customer', entityId: cust.id, detail: name });

  closeSalesAddCustomer();
  // Auto-select the newly created customer for the current sale.
  selectSalesCustomer(cust.id);
}

function setSalesWalkin() {
  _salesCustomerId = null;
  _salesCreditUsed = 0;
  _salesDefaultMode = 'unit';
  document.getElementById('salesCustSearch').value = '';
  document.getElementById('salesCustResults').innerHTML = '';
  document.getElementById('salesSelectedCust').style.display = 'none';
  document.getElementById('salesWalkinLabel').style.display = 'flex';
  updateSalesTotals();
}

function clearSalesCustomer() {
  _salesCustomerId = null;
  _salesCreditUsed = 0;
  _salesDefaultMode = 'unit';
  document.getElementById('salesSelectedCust').style.display = 'none';
  document.getElementById('salesWalkinLabel').style.display = 'none';
  document.getElementById('salesCustSearch').value = '';
  document.getElementById('salesCustResults').innerHTML = '';
  updateSalesTotals();
}

// ===== SALE TO SUPPLIER (بيع له) =====

function openSupSaleMode() {
  if (_salesCart.length > 0) {
    if (!confirm('سيتم إفراغ محتوى القائمة الحالية. هل تريد المتابعة؟')) return;
  }
  _salesCustomerId = null;
  _salesCreditUsed = 0;
  _salesCart = [];
  _salesSuppId = null;
  _salesSupMode = true;
  _salesDefaultMode = 'unit';
  setSalesPayMethod('cash');
  resetSupSalePayUI();
  document.getElementById('salesSelectedCust').style.display = 'none';
  document.getElementById('salesWalkinLabel').style.display = 'none';
  const row = document.getElementById('salesCustRow');
  if (row) row.style.display = 'none';
  renderSalesCart();
  renderSalesProducts();
  openSupSalePicker();
}

function openSupSalePicker() {
  const m = document.getElementById('supSalePickerModal');
  if (!m) return;
  if (!m._host) m._host = m.parentNode;
  if (m.parentNode !== document.body) document.body.appendChild(m);
  const search = document.getElementById('supSalePickerSearch');
  if (search) search.value = '';
  renderSupSaleList('');
  m.style.display = 'flex';
  setTimeout(() => { const el = document.getElementById('supSalePickerSearch'); if (el) el.focus(); }, 150);
}

function closeSupSalePicker() {
  const m = document.getElementById('supSalePickerModal');
  if (!m) return;
  m.style.display = 'none';
  if (m._host && m.parentNode === document.body) m._host.appendChild(m);
}

function searchSupSaleSuppliers(q) {
  renderSupSaleList(q || '');
}

function pickFirstSupSaleSupplier() {
  const first = document.querySelector('#supSalePickerResults .sup-pick-item[data-sid]');
  if (first) selectSupSaleSupplier(first.getAttribute('data-sid'));
}

function fmtSupBalance(v) {
  return (v < 0 ? '-' : '') + 'DA' + fmtMoney(Math.abs(v));
}

function supBalChip(s) {
  const bal = parseFloat(s.balance) || 0;
  const cls = bal > 0 ? 'pos' : bal < 0 ? 'neg' : 'zero';
  const sign = bal > 0 ? '+' : bal < 0 ? '-' : '';
  const cap = bal > 0 ? 'علينا له' : bal < 0 ? 'له علينا' : 'الرصيد';
  return `<div class="sup-pick-bal ${cls}">
    <span class="sup-pick-bal-cap">${cap}</span>
    <strong dir="ltr">${sign}DA${fmtMoney(Math.abs(bal))}</strong>
  </div>`;
}

function renderSupSaleList(q) {
  const results = document.getElementById('supSalePickerResults');
  if (!results) return;
  q = normSearch(q || '');
  const suppliers = DB.getSuppliers().slice();
  const matches = q
    ? suppliers.filter(s =>
        s.name.toLowerCase().includes(q.toLowerCase()) || (s.phone && s.phone.includes(q))
      )
    : suppliers;
  matches.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar'));
  const countEl = document.getElementById('supSalePickerCount');
  if (countEl) countEl.textContent = matches.length + ' مورد';
  if (matches.length === 0) {
    results.innerHTML = `<div class="sup-pick-empty"><i class="fas fa-search"></i><div>لا يوجد مورد بهذا الاسم</div></div>`;
    return;
  }
  results.innerHTML = matches.map(s => `
    <div class="sup-pick-item" data-sid="${s.id}" onclick="selectSupSaleSupplier('${s.id}')">
      <div class="sup-pick-avatar">${escHtml(String(s.name || '؟').trim().charAt(0))}</div>
      <div class="sup-pick-info">
        <div class="sup-pick-name">${escHtml(s.name)}</div>
        <div class="sup-pick-meta">${s.phone ? '<i class="fas fa-phone-alt"></i>' + escHtml(s.phone) : ''}${s.address ? ' · ' + escHtml(s.address) : ''}</div>
      </div>
      ${supBalChip(s)}
    </div>`).join('');
}

function selectSupSaleSupplier(id) {
  const s = DB.getSuppliers().find(x => x.id === id);
  if (!s) return;
  _salesSuppId = s.id;
  updateSupSaleBanner(s);
  closeSupSalePicker();
  const scan = document.getElementById('salesBarcodeScan');
  if (scan) scan.focus();
}

function updateSupSaleBanner(s) {
  const banner = document.getElementById('salesSupBanner');
  if (!banner) return;
  const nameEl = document.getElementById('salesSupName');
  if (nameEl) nameEl.textContent = s.name;
  const balEl = document.getElementById('salesSupBalance');
  if (balEl) {
    const bal = parseFloat(s.balance) || 0;
    if (bal > 0) {
      balEl.textContent = 'علينا له: +DA' + fmtMoney(bal);
      balEl.style.color = '#dc3545';
    } else if (bal < 0) {
      balEl.textContent = 'له علينا: -DA' + fmtMoney(Math.abs(bal));
      balEl.style.color = '#198754';
    } else {
      balEl.textContent = 'الرصيد: DA0.00';
      balEl.style.color = 'var(--silver-500)';
    }
  }
  banner.style.display = 'flex';
}

function cancelSupSaleMode() {
  _salesSuppId = null;
  _salesSupMode = false;
  _salesDefaultMode = 'unit';
  resetSupSalePayUI();
  const banner = document.getElementById('salesSupBanner');
  if (banner) banner.style.display = 'none';
  const row = document.getElementById('salesCustRow');
  if (row) row.style.display = '';
  const search = document.getElementById('salesCustSearch');
  if (search) search.value = '';
  const results = document.getElementById('salesCustResults');
  if (results) results.innerHTML = '';
}

// In ''super-sale'' mode only cash-on-delivery is offered: hide CCP/mixed pills,
// keep single payout and relabel it clearly for the supplier case.
function syncSupSalePaySection() {
  document.querySelectorAll('#salesPaySection .pay-method-btn').forEach(b => {
    b.style.display = (_salesSupMode && b.dataset.method !== 'cash') ? 'none' : '';
  });
  const singlePay = document.getElementById('salesSinglePay');
  const mixedPay = document.getElementById('salesMixedPay');
  if (singlePay) singlePay.style.display = (_salesSupMode || _salesPayMethod !== 'mixed') ? '' : 'none';
  if (mixedPay) mixedPay.style.display = _salesSupMode ? 'none' : (_salesPayMethod === 'mixed' ? '' : 'none');
  const label = document.querySelector('#salesSinglePay .sales-pay-label');
  if (label) {
    if (_salesSupMode) {
      if (!label.dataset.orig) label.dataset.orig = label.textContent;
      label.textContent = 'نقد مقبوض الآن من المورد (اختياري)';
    } else if (label.dataset.orig) {
      label.textContent = label.dataset.orig;
    }
  }
}

function resetSupSalePayUI() {
  document.querySelectorAll('#salesPaySection .pay-method-btn').forEach(b => b.style.display = '');
  const label = document.querySelector('#salesSinglePay .sales-pay-label');
  if (label && label.dataset.orig) {
    label.textContent = label.dataset.orig;
    delete label.dataset.orig;
  }
  const info = document.getElementById('salesSupPayInfo');
  if (info) info.style.display = 'none';
}

function renderSupSalePayInfo(total, paid) {
  const info = document.getElementById('salesSupPayInfo');
  if (info) info.style.display = '';
  const remDisplay = document.getElementById('salesRemainingDisplay');
  if (remDisplay) remDisplay.style.display = 'none';
  const payStatus = document.getElementById('salesPayStatus');
  if (payStatus) payStatus.style.display = 'none';

  const debit = Math.max(0, total - paid);
  const sup = _salesSuppId ? DB.getSuppliers().find(s => s.id === _salesSuppId) : null;
  const cur = sup ? (parseFloat(sup.balance) || 0) : 0;
  const after = cur - debit;

  const debitEl = document.getElementById('salesSupDebitVal');
  if (debitEl) debitEl.textContent = 'DA' + fmtMoney(debit);
  const beforeEl = document.getElementById('salesSupBalBefore');
  if (beforeEl) {
    beforeEl.textContent = fmtSupBalance(cur) + (cur > 0 ? ' (علينا له)' : cur < 0 ? ' (له علينا)' : '');
    beforeEl.style.color = cur > 0 ? '#dc3545' : cur < 0 ? '#198754' : 'var(--silver-600)';
  }
  const afterEl = document.getElementById('salesSupBalAfter');
  if (afterEl) {
    afterEl.textContent = fmtSupBalance(after) + (after > 0 ? ' (علينا له)' : after < 0 ? ' (له علينا)' : '');
    afterEl.style.color = after > 0 ? '#dc3545' : after < 0 ? '#198754' : 'var(--silver-700)';
  }
}

// ===== TRANSFER INVOICE TO A CUSTOMER (proxy buyer) =====
var _transferCustomerId = null;

function openSalesTransfer() {
  if (_salesCart.length === 0) { alert(t('sales.cartEmptyAlert')); return; }
  const m = document.getElementById('salesTransferModal');
  if (!m._host) m._host = m.parentNode;
  if (m.parentNode !== document.body) document.body.appendChild(m);
  _transferCustomerId = null;
  document.getElementById('salesTransferSearch').value = '';
  document.getElementById('salesTransferResults').innerHTML = '';
  document.getElementById('salesTransferSelected').style.display = 'none';
  const btn = document.getElementById('salesTransferConfirmBtn');
  btn.disabled = true;
  btn.style.opacity = '0.5';
  m.style.display = 'flex';
  setTimeout(() => { const el = document.getElementById('salesTransferSearch'); if (el) el.focus(); }, 200);
}

function closeSalesTransfer() {
  const m = document.getElementById('salesTransferModal');
  if (!m) return;
  m.style.display = 'none';
  if (m._host && m.parentNode === document.body) m._host.appendChild(m);
}

function searchSalesTransfer(q) {
  const results = document.getElementById('salesTransferResults');
  if (!results) return;
  q = normSearch(q);
  const customers = DB.getCustomers();
  const matches = q
    ? customers.filter(c =>
        c.name.toLowerCase().includes(q.toLowerCase()) || (c.phone && c.phone.includes(q))
      ).slice(0, 10)
    : customers.slice(0, 10);
  results.innerHTML = matches.length === 0
    ? `<div class="search-result-item disabled">${t('sales.noCustResults')}</div>`
    : matches.map(c => `<div class="search-result-item" onclick="selectSalesTransfer('${c.id}')">
        <strong>${escHtml(c.name)}</strong>
        <span class="text-muted">${c.phone || ''} ${c.discount > 0 ? `| ${t('sales.discount')} ${c.discount}%` : ''}</span>
      </div>`).join('');
}

function selectSalesTransfer(id) {
  const c = DB.getCustomer(id);
  if (!c) return;
  _transferCustomerId = c.id;
  document.getElementById('salesTransferSearch').value = c.name;
  document.getElementById('salesTransferResults').innerHTML = '';
  document.getElementById('salesTransferSelName').textContent = c.name;
  document.getElementById('salesTransferSelected').style.display = 'flex';
  const btn = document.getElementById('salesTransferConfirmBtn');
  btn.disabled = false;
  btn.style.opacity = '1';
}

function confirmSalesTransfer() {
  if (!_transferCustomerId) return;
  _salesCustomerId = _transferCustomerId;
  closeSalesTransfer();
  confirmSalesCheckout();
}

// ===== CART =====

function addToSalesCart(productId) {
  const prod = DB.getProduct(productId);
  if (!prod || (prod.fixed !== true && prod.quantity <= 0)) return;
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
  if (isGroupOutOfStock(g)) return;

  let line = _salesCart.find(c => c.key === key);
  if (line) {
    const cap = isGroupFixed(g) ? 999 : getGroupAvailableQty(g);
    if (line.qty >= cap) return;
    line.qty++;
    allocateSalesLine(line, key);
  } else {
    line = { key, name: g.name, barcode: g.barcode, qty: 1, mode: _salesDefaultMode, price: 0, total: 0, baseTotal: 0, manualPrice: null, discount: 0, entries: [] };
    allocateSalesLine(line, key);
    _salesCart.push(line);
  }

  renderSalesCart();
  document.getElementById('salesEmptyCart').style.display = 'none';
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
    const emptyQkBtn = document.getElementById('salesQkOpenBtn');
    if (emptyQkBtn) emptyQkBtn.disabled = true;
    return;
  }
  section.style.display = '';
  empty.style.display = 'none';
  if (count) count.textContent = _salesCart.length;
  const qkBtn = document.getElementById('salesQkOpenBtn');
  if (qkBtn) qkBtn.disabled = false;

  items.innerHTML = _salesCart.map((line, i) => {
    const g = getSalesGroupByKey(line.key);
    const maxQty = g ? getGroupMaxQty(g) : 99;
    const mixed = line.entries.length > 1;
    const shortQty = line.shortQty || 0;
    const expiredWarn = (salesPharmacyOn() && (line.blockedExpired || 0) > 0)
      ? `<div class="sc-warn-note"><i class="fas fa-ban"></i> ${t('sales.batchExpiredPartial')} (${line.blockedExpired})</div>` : '';
    const shortWarn = shortQty > 0
      ? `<div class="sc-warn-note short"><i class="fas fa-exclamation-circle"></i> ${t('sales.subShortage')} ${Math.max(0, line.qty - shortQty)} / ${line.qty}</div>` : '';
    return `<div class="sc-item">
      <div class="sc-item-info">
        <div class="sc-item-name">${escHtml(line.name)}${mixed ? `<span class="sc-mixed-badge" title="${t('sales.mixedPrice')}"><i class="fas fa-layer-group"></i> ${t('sales.mixedPrice')}</span>` : ''}</div>
        <div class="sc-item-bar" dir="ltr">${escHtml(line.barcode)}</div>
        ${expiredWarn}
        ${shortWarn}
        <div style="margin-top:3px">
          <button class="sc-mode-btn ${line.mode === 'wholesale' ? 'sc-mode-btn-active' : ''}" onclick="toggleSalesLineMode(${i})">${line.mode === 'wholesale' ? t('sales.wholesale') : t('sales.unit')}</button>
        </div>
      </div>
      <div class="sc-item-controls">
        <button class="sc-qty-btn" onclick="decSalesCartQty(${i})" ${line.qty <= getSalesQtyStep() ? 'disabled' : ''}>−</button>
        <input type="text" class="no-spinner sc-qty-input num-input" inputmode="decimal" id="scqty_${i}"
          value="${line.qty}" min="0.5" step="0.5"
          onchange="updateSalesCartQty(${i}, this.value)">
        <button class="sc-qty-btn" onclick="incSalesCartQty(${i})" ${line.qty >= maxQty ? 'disabled' : ''}>+</button>
        <div style="display:flex;flex-direction:column;gap:3px;margin-top:4px">
          <div style="display:flex;align-items:center;gap:4px">
            <span style="font-size:10px;color:var(--silver-500)">${t('sales.unitPrice') || 'Prix'}</span>
            <input id="scprice_${i}" type="text" class="no-spinner num-input" inputmode="decimal" dir="ltr" min="0" step="0.01"
              style="width:84px;flex:1 1 84px;min-width:60px;max-width:120px;padding:3px 6px;border:1px solid var(--silver-300);border-radius:4px;font-size:12px"
              value="${line.price.toFixed(2)}" oninput="onSalesLinePriceInput(${i}, this.value)" onchange="updateSalesLinePrice(${i}, this.value)">
          </div>
          <div style="display:flex;align-items:center;gap:4px">
            <span style="font-size:10px;color:var(--silver-500)">${t('sales.lineDiscount') || 'Remise'}</span>
            <input id="scdisc_${i}" type="text" class="no-spinner num-input" inputmode="decimal" dir="ltr" min="0" step="0.01"
              style="width:84px;flex:1 1 84px;min-width:60px;max-width:120px;padding:3px 6px;border:1px solid var(--silver-300);border-radius:4px;font-size:12px"
              value="${(line.discount || 0)}" oninput="onSalesLineDiscountInput(${i}, this.value)" onchange="updateSalesLineDiscount(${i}, this.value)">
            <span style="font-size:10px;color:var(--silver-500)">DA</span>
          </div>
        </div>
      </div>
      <div class="sc-item-right">
        <span class="sc-item-total" id="scTotal_${i}">DA${fmtMoney(line.total)}</span>
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
  const maxQty = g ? getGroupMaxQty(g) : 999999;
  const step = getSalesQtyStep();
  if (line.qty < maxQty) {
    line.qty = Math.min(maxQty, +(line.qty + step).toFixed(3));
    allocateSalesLine(line, line.key);
    renderSalesCart();
  }
}

function decSalesCartQty(idx) {
  const line = _salesCart[idx];
  if (!line) return;
  if (line.qty > 0.5 || line.qty > 0) {
    const step = getSalesQtyStep();
    line.qty = Math.max(step, +(line.qty - step).toFixed(3));
    allocateSalesLine(line, line.key);
    renderSalesCart();
  }
}

function updateSalesCartQty(idx, val) {
  const line = _salesCart[idx];
  if (!line) return;
  let qty = parseFloat(val);
  if (isNaN(qty)) qty = getSalesQtyStep();
  const g = getSalesGroupByKey(line.key);
  const maxQty = g ? getGroupMaxQty(g) : 999999;
  const step = getSalesQtyStep();
  qty = Math.min(Math.max(step, +(qty).toFixed(3)));
  if (qty % step !== 0 && step > 0.0001) {
    qty = Math.max(step, Math.round(qty / step) * step);
  }
  line.qty = Math.min(maxQty, qty);
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

function updateSalesLinePrice(idx, val) {
  const line = _salesCart[idx];
  if (!line) return;
  const v = parseFloat(val);
  line.manualPrice = (val === '' || isNaN(v)) ? null : Math.max(0, v);
  allocateSalesLine(line, line.key);
  renderSalesCart();
}

function updateSalesLineDiscount(idx, val) {
  const line = _salesCart[idx];
  if (!line) return;
  const v = parseFloat(val);
  line.discount = (val === '' || isNaN(v)) ? 0 : Math.max(0, v);
  allocateSalesLine(line, line.key);
  renderSalesCart();
}

function onSalesLinePriceInput(idx, val) {
  const line = _salesCart[idx];
  if (!line) return;
  const v = parseFloat(val);
  line.manualPrice = (val === '' || isNaN(v)) ? null : Math.max(0, v);
  allocateSalesLine(line, line.key);
  updateSalesTotals();
  updateSalesLineTotal(idx);
}

function onSalesLineDiscountInput(idx, val) {
  const line = _salesCart[idx];
  if (!line) return;
  const v = parseFloat(val);
  line.discount = (val === '' || isNaN(v)) ? 0 : Math.max(0, v);
  allocateSalesLine(line, line.key);
  updateSalesTotals();
  updateSalesLineTotal(idx);
}

function updateSalesLineTotal(idx) {
  const line = _salesCart[idx];
  if (!line) return;
  const el = document.getElementById('scTotal_' + idx);
  if (el) el.textContent = `DA${fmtMoney(line.total)}`;
}

// ===== QUICK QUANTITY MODAL (keyboard-driven cart editor) =====
// Press "+" (top row or numpad) while the cart is non-empty — or click the
// keyboard button beside the LED grand-total — to open a list of the cart lines.
// Arrow keys move the selection, digits write the quantity directly (keypad
// style, reuse the same validators as the mouse spinner), Del removes the
// selected line, and Enter / Esc close and return focus to the barcode scanner.
let _qkOpen = false;
let _qkIndex = 0;
let _qkBuffer = null;

function salesAnyOverlayOpen() {
  return Array.prototype.some.call(document.querySelectorAll('.modal-overlay'), function (m) {
    return m.style.display === 'flex';
  });
}

function openSalesQtyQuick() {
  if (_salesCart.length === 0) return;
  const container = document.getElementById('pageContainer');
  if (!container) return;
  let overlay = document.getElementById('salesQkModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'salesQkModal';
    overlay.style.zIndex = '99990';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeSalesQtyQuick(); });
    container.appendChild(overlay);
  }
  _qkIndex = Math.min(_qkIndex, _salesCart.length - 1);
  _qkBuffer = null;
  _qkOpen = true;
  overlay.style.display = 'flex';
  _qkRender();
  const scan = document.getElementById('salesBarcodeScan');
  if (scan) scan.blur();
}

function closeSalesQtyQuick() {
  _qkOpen = false;
  _qkBuffer = null;
  const overlay = document.getElementById('salesQkModal');
  if (overlay) overlay.style.display = 'none';
  if (_salesCart.length > 0) {
    const scan = document.getElementById('salesBarcodeScan');
    if (scan) setTimeout(function () { scan.focus(); }, 0);
  }
}

function _qkSelect(idx) {
  if (idx < 0 || idx >= _salesCart.length) return;
  _qkIndex = idx;
  _qkBuffer = null;
  _qkRender();
}

function _qkRowsHtml() {
  return _salesCart.map(function (line, i) {
    const g = getSalesGroupByKey(line.key);
    const maxQty = g ? getGroupMaxQty(g) : 99;
    const atCap = line.qty >= maxQty;
    const active = i === _qkIndex;
    const unitLabel = t('sales.unitPrice') || 'Prix';
    return `<div class="qk-row${active ? ' active' : ''}" onclick="_qkSelect(${i})">
      <div class="qk-pos">${i + 1}</div>
      <div class="qk-info">
        <div class="qk-name">${escHtml(line.name)}${atCap ? `<span class="qk-full">${t('sales.qtyModalFull')}</span>` : ''}</div>
        <div class="qk-bar" dir="ltr">${escHtml(line.barcode || '')}</div>
        <div class="qk-price">${unitLabel} <span dir="ltr">${Number(line.price || 0).toFixed(2)}</span> DA</div>
      </div>
      <div class="qk-qty-wrap">
        <span class="qk-qty-label">${t('sales.qtyModalQty')}</span>
        <span class="qk-qty${atCap ? ' qk-max' : ''}" dir="ltr">${line.qty}</span>
      </div>
      <div class="qk-total" dir="ltr">DA${fmtMoney(line.total)}</div>
    </div>`;
  }).join('');
}

function _qkRender() {
  const overlay = document.getElementById('salesQkModal');
  if (!_qkOpen || !overlay) return;
  if (_salesCart.length === 0) { closeSalesQtyQuick(); return; }
  if (_qkIndex >= _salesCart.length) _qkIndex = _salesCart.length - 1;
  const pieces = _salesCart.reduce(function (s, l) { return s + (Number(l.qty) || 0); }, 0);
  overlay.innerHTML = `<div class="modal qk-modal">
    <div class="qk-head">
      <div class="qk-head-title"><i class="fas fa-keyboard" style="color:var(--bmw-blue-1)"></i> ${t('sales.qtyModalTitle')} <span class="qk-head-count">${_salesCart.length} ${t('sales.qtyModalItems')}</span></div>
      <button class="modal-close" type="button" onclick="closeSalesQtyQuick()" title="${t('common.close')}"><i class="fas fa-times"></i></button>
    </div>
    <div class="qk-items-list">${_qkRowsHtml()}</div>
    <div class="qk-foot">
      <div class="qk-foot-total">
        <span class="qk-foot-total-label">${t('common.total')}</span>
        <span class="qk-foot-total-val" dir="ltr">DA${fmtMoney(_salesComputedTotal || 0)}</span>
        <span class="qk-foot-total-label">(${pieces} ${t('sales.qtyModalItems')})</span>
      </div>
      <div class="qk-keys"><span class="qk-hint">${t('sales.qtyModalKeys')}</span></div>
    </div>
  </div>`;
  const row = overlay.querySelector('.qk-row.active');
  if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
}

function _qkHandler(e) {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  const isPlus = e.key === '+' || e.code === 'NumpadAdd' || (e.shiftKey && (e.code === 'Equal' || e.code === 'NumpadAdd'));

  if (!_qkOpen) {
    // Opener: only on the sale page with a non-empty cart, never while the
    // cashier is typing in a real field (search / prices / customers) or when
    // another modal is already open (substitutes, transfer, history …).
    if ((window._currentPageId || '') !== 'sales') return;
    if (_salesCart.length === 0) return;
    if (!isPlus) return;
    const target = e.target;
    if (target && target.tagName) {
      const tag = target.tagName.toUpperCase();
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
      if (inField && target.id !== 'salesBarcodeScan') return;
    }
    // A bare "+" opener only makes sense between scans. If the scanner field
    // already holds a partial code, let "+" be part of the barcode.
    const scanInput = document.getElementById('salesBarcodeScan');
    if (scanInput && String(scanInput.value || '').trim() !== '') return;
    if (salesAnyOverlayOpen()) return;
    e.preventDefault();
    openSalesQtyQuick();
    return;
  }

  // Modal open: own every key so nothing leaks to the scanner or behind.
  if (_salesCart.length === 0) { closeSalesQtyQuick(); return; }
  e.preventDefault();
  const count = _salesCart.length;

  if (isPlus) {
    _qkIndex = (_qkIndex + 1) % count;
    _qkBuffer = null;
    _qkRender();
    return;
  }
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === 'Up' || e.key === 'Right') {
    _qkIndex = (_qkIndex - 1 + count) % count;
    _qkBuffer = null;
    _qkRender();
    return;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'Down' || e.key === 'Left') {
    _qkIndex = (_qkIndex + 1) % count;
    _qkBuffer = null;
    _qkRender();
    return;
  }
  if (e.key === 'Delete' || e.key === 'Del') {
    if (_qkIndex >= count) _qkIndex = count - 1;
    removeFromSalesCart(_qkIndex);
    if (_salesCart.length === 0) { closeSalesQtyQuick(); return; }
    if (_qkIndex >= _salesCart.length) _qkIndex = _salesCart.length - 1;
    _qkBuffer = null;
    _qkRender();
    return;
  }
  if (e.key === 'Enter' || e.key === 'Escape' || e.key === 'Esc') { closeSalesQtyQuick(); return; }
  if (/^[0-9]$/.test(e.key)) {
    const line = _salesCart[_qkIndex];
    if (!line) return;
    const g = getSalesGroupByKey(line.key);
    const maxQty = g ? getGroupMaxQty(g) : 99;
    const base = _qkBuffer === null ? '' : _qkBuffer;
    const next = (base + e.key).slice(-5);
    const parsed = parseFloat(next) || getSalesQtyStep();
    const step = getSalesQtyStep();
    let valQty = Math.min(Math.max(step, parsed), maxQty);
    if (step > 0.0001 && valQty % step !== 0) valQty = Math.round(valQty / step) * step;
    valQty = +valQty.toFixed(3);
    line.qty = valQty;
    allocateSalesLine(line, line.key);
    _qkBuffer = parsed === valQty ? next : String(valQty);
    renderSalesCart();
    _qkRender();
  }
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
  _salesComputedTotal = total;

  document.getElementById('salesCartSubtotal').textContent = `DA${fmtMoney(subTotal)}`;

  const cdEl = document.getElementById('salesCartCustDiscount');
  if (custDiscPct > 0) {
    cdEl.style.display = 'flex';
    document.getElementById('salesCartCustDiscVal').textContent = `-DA${fmtMoney(custDiscAmount)} (${custDiscPct}%)`;
  } else {
    cdEl.style.display = 'none';
  }

  document.getElementById('salesCartTotal').textContent = `DA${fmtMoney(total)}`;

  if (_salesCart.length > 0) {
    document.getElementById('salesPaySection').style.display = '';
    syncSupSalePaySection();
    const payInput = document.getElementById('salesPaidAmount');
    const credit = _salesCreditUsed > 0 ? Math.min(_salesCreditUsed, total) : 0;
    const payable = Math.max(0, total - credit);
    payInput.max = payable;
    if (_salesSupMode) {
      if (!_salesPaidTouched) payInput.value = '0';
    } else if (!_salesPaidTouched) {
      if (_salesPayMethod === 'mixed') {
        document.getElementById('salesCashAmount').value = payable.toFixed(2);
        document.getElementById('salesCcpAmount').value = '0';
      } else {
        payInput.value = payable.toFixed(2);
      }
    } else if (_salesPayMethod !== 'mixed') {
      const currVal = parseFloat(payInput.value) || 0;
      if (currVal > payable) payInput.value = payable.toFixed(2);
    }
    updateSalesRemaining();
    renderSalesCreditSection();
  }
  renderSalesCreditSection();
  updateSalesLed();
}

function getSalesQtyStep() {
  return 0.5;
}

// Top-of-page LED grand-total (digital display).
function updateSalesLed() {
  const totalEl = document.getElementById('salesLedTotal');
  if (totalEl) totalEl.textContent = 'DA' + fmtMoney(_salesComputedTotal || 0);
  const itemsEl = document.getElementById('salesLedItems');
  if (itemsEl) {
    const pieces = _salesCart.reduce((s, l) => s + (Number(l.qty) || 0), 0);
    itemsEl.textContent = String(pieces);
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
  const credit = _salesCreditUsed > 0 ? Math.min(_salesCreditUsed, total) : 0;
  const payTarget = Math.max(0, total - credit);
  const paid = getSalesPaidAmount().total;
  const remaining = Math.max(0, payTarget - paid);

  if (_salesSupMode && _salesSuppId) {
    renderSupSalePayInfo(total, paid);
    return;
  }
  const info = document.getElementById('salesSupPayInfo');
  if (info) info.style.display = 'none';

  document.getElementById('salesRemainingVal').textContent = `DA${fmtMoney(remaining)}`;

  const remDisplay = document.getElementById('salesRemainingDisplay');
  const payStatus = document.getElementById('salesPayStatus');
  const statusText = document.getElementById('salesPayStatusText');

  if (paid >= payTarget) {
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
  const credit = _salesCreditUsed > 0 ? Math.min(_salesCreditUsed, total) : 0;
  const payable = Math.max(0, total - credit);
  if (_salesPayMethod === 'mixed') {
    document.getElementById('salesCashAmount').value = payable.toFixed(2);
    document.getElementById('salesCcpAmount').value = '0';
    document.getElementById('salesCcpAmount').focus();
  } else {
    document.getElementById('salesPaidAmount').value = payable.toFixed(2);
    document.getElementById('salesPaidAmount').focus();
  }
  updateSalesRemaining();
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
  const creditUsed = inv.creditUsed || 0;
  const effPaid = paidAmount + creditUsed;
  const payMethods = DB.getInvoicePaymentMethods(inv.id);

  const customer = inv.customerId ? DB.getCustomer(inv.customerId) : null;
  // For supplier sales we show the supplier as the buyer together with the net
  // amount he still owes us after the invoice settled our debt (المتبقي عليه).
  const supInfo = inv.type === 'sup_sale' ? (function () {
    let supp = null;
    if (inv.supplierId) supp = DB.getSuppliers().find(s => s.id === inv.supplierId) || null;
    let due = (typeof DB.getSupSaleNetDue === 'function') ? DB.getSupSaleNetDue(inv) : null;
    if (due === null) {
      // Fallback if the shared helper is unavailable (older runtime).
      const bal = parseFloat(supp && supp.balance) || 0;
      const onAcc = (inv.totalAmount || 0) - paidAmount;
      due = Math.max(0, onAcc - Math.max(0, bal + onAcc));
    }
    return { supp: supp, due: Math.max(0, due) };
  })() : null;
  const date = new Date(inv.createdAt);
  const dateStr = date.toLocaleDateString('fr-DZ', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const totalQty = inv.items.reduce((s, it) => s + it.qty, 0);
  const originalSubtotal = inv.items.reduce((s, it) => s + (it.originalPrice || it.price) * it.qty, 0);
  const custDiscAmount = originalSubtotal * ((inv.customerDiscount || 0) / 100);
  const extraDiscAmount = inv.extraDiscount || 0;
  const lineDiscTotal = inv.items.reduce((s, it) => s + (it.lineDiscount || 0), 0);

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
        ${(typeof buildDocHeaderRow === 'function')
          ? buildDocHeaderRow(
              `<div style="font-size:20px;font-weight:900;color:#1a1a1a;text-transform:uppercase;letter-spacing:1px">${escHtml(store.name)}</div>
              <div style="font-size:10px;color:#999;margin-top:1px;text-transform:uppercase;letter-spacing:0.5px">Document commercial</div>
              ${store.address ? `<div style="font-size:11px;color:#555;margin-top:4px">${escHtml(store.address)}</div>` : ''}
              ${store.phone ? `<div style="font-size:11px;color:#555">Tél: ${escHtml(store.phone)}</div>` : ''}
              <div style="font-size:10px;color:#999;margin-top:2px">${(store.nif ? 'NIF: ' + escHtml(store.nif) : 'NIF: —')} &nbsp;|&nbsp; ${(store.rcc ? 'RC: ' + escHtml(store.rcc) : 'RC: —')}${store.article ? ' &nbsp;|&nbsp; ART: ' + escHtml(store.article) : ''}</div>`,
              `<div style="font-size:30px;font-weight:900;color:#1a1a1a;text-transform:uppercase;letter-spacing:3px">FACTURE</div>
              <div style="font-size:11px;font-weight:700;color:#0066B1;margin-top:-2px;text-transform:uppercase;letter-spacing:1.5px">DE VENTE</div>
              <div style="font-size:10px;font-weight:600;color:#888;margin-top:1px;text-transform:uppercase;letter-spacing:1px">Original</div>
              <div style="font-size:14px;font-weight:700;color:#333;margin-top:6px">N° ${inv.invoiceNumber}</div>
              <div style="font-size:11px;color:#555;margin-top:4px;line-height:1.6">
                <div>Date: ${dateStr}</div>
                <div>Heure: ${timeStr}</div>
              </div>`
            )
          : `<table style="width:100%;border-collapse:collapse" dir="ltr">
          <tr>
            <td style="vertical-align:top;width:60%">
              <div style="font-size:20px;font-weight:900;color:#1a1a1a;text-transform:uppercase;letter-spacing:1px">${escHtml(store.name)}</div>
              <div style="font-size:10px;color:#999;margin-top:1px;text-transform:uppercase;letter-spacing:0.5px">Document commercial</div>
              ${store.address ? `<div style="font-size:11px;color:#555;margin-top:4px">${escHtml(store.address)}</div>` : ''}
              ${store.phone ? `<div style="font-size:11px;color:#555">Tél: ${escHtml(store.phone)}</div>` : ''}
              <div style="font-size:10px;color:#999;margin-top:2px">${(store.nif ? 'NIF: ' + escHtml(store.nif) : 'NIF: —')} &nbsp;|&nbsp; ${(store.rcc ? 'RC: ' + escHtml(store.rcc) : 'RC: —')}${store.article ? ' &nbsp;|&nbsp; ART: ' + escHtml(store.article) : ''}</div>
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
        </table>`}

        <!-- Separator -->
        <div style="border-top:2px solid #1a1a1a;margin:16px 0 14px"></div>
        <div style="height:1px;background:#ddd;margin-bottom:16px"></div>

        <!-- Customer Info -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px" dir="ltr">
          <tr>
            <td style="vertical-align:top;width:50%">
              <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px">${inv.type === 'sup_sale' ? 'Fournisseur' : 'Client'}</div>
              ${inv.type === 'sup_sale'
                ? (supInfo && supInfo.supp
                  ? `<div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-top:2px">${escHtml(supInfo.supp.name)}</div>
                     ${supInfo.supp.phone ? `<div style="font-size:11px;color:#666">Tél: ${escHtml(supInfo.supp.phone)}</div>` : ''}
                     ${supInfo.supp.address ? `<div style="font-size:11px;color:#666">Adresse: ${escHtml(supInfo.supp.address)}</div>` : ''}`
                  : `<div style="font-size:14px;color:#888">Fournisseur</div>`)
                : (customer
                  ? `<div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-top:2px">${escHtml(customer.name)}</div>
                     ${customer.phone ? `<div style="font-size:11px;color:#666">Tél: ${escHtml(customer.phone)}</div>` : ''}
                     ${customer.address ? `<div style="font-size:11px;color:#666">Adresse: ${escHtml(customer.address)}</div>` : ''}`
                  : `<div style="font-size:14px;color:#888">Client non enregistré</div>`)
              }
            </td>
            <td style="vertical-align:top;text-align:right;width:50%">
              ${(inv.type === 'sup_sale' ? (supInfo && supInfo.due > 0) : (effPaid < inv.totalAmount))
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
                  ${(item.originalPrice && item.originalPrice !== item.price) ? `<span style="text-decoration:line-through;color:#999;font-size:10px">${fmtMoney(item.originalPrice)}</span> ` : ''}
                  ${fmtMoney(item.price)} DA</td>
                <td style="padding:7px 10px;border:1px solid #eee;text-align:right;font-size:12px;font-weight:600;color:#333">${fmtMoney((item.price * item.qty))} DA</td>
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
                  <td style="padding:4px 10px;text-align:right;font-weight:600;color:#333">${fmtMoney(montantHT)} DA</td>
                </tr>
                ${tvaRate > 0 ? `
                <tr>
                  <td style="padding:4px 10px;text-align:left;color:#666">TVA (${tvaRate}%)</td>
                  <td style="padding:4px 10px;text-align:right;font-weight:600;color:#333">${fmtMoney(tvaAmount)} DA</td>
                </tr>` : ''}
                <tr>
                  <td style="padding:4px 10px;text-align:left;color:#666">Montant TTC</td>
                  <td style="padding:4px 10px;text-align:right;font-weight:700;color:#1a1a1a;font-size:15px">${fmtMoney(inv.totalAmount)} DA</td>
                </tr>
                ${timbreFiscal > 0 ? `
                <tr>
                  <td style="padding:4px 10px;text-align:left;color:#e65100">Timbre Fiscal</td>
                  <td style="padding:4px 10px;text-align:right;font-weight:600;color:#e65100;font-size:13px">${fmtMoney(timbreFiscal)} DA</td>
                </tr>
                <tr style="border-top:2px solid #1a1a1a">
                  <td style="padding:6px 10px;text-align:left;font-weight:800;font-size:16px;color:#1a1a1a">Net à payer</td>
                  <td style="padding:6px 10px;text-align:right;font-weight:900;font-size:18px;color:#0066B1">${fmtMoney(netAPayer)} DA</td>
                </tr>` : `
                <tr style="border-top:2px solid #1a1a1a">
                  <td style="padding:6px 10px;text-align:left;font-weight:800;font-size:16px;color:#1a1a1a">Net à payer</td>
                  <td style="padding:6px 10px;text-align:right;font-weight:900;font-size:18px;color:#0066B1">${fmtMoney(inv.totalAmount)} DA</td>
                </tr>`}
              </table>
            </td>
          </tr>
        </table>

        <!-- Paid / Remaining -->
        ${inv.type === 'sup_sale' ? `
        ${supInfo && supInfo.due > 0 ? `
        <div style="margin-top:14px;padding:12px 16px;background:#fff3e0;border:1px solid #ffcc80;border-radius:6px;font-size:13px;color:#e65100;display:flex;justify-content:space-between;align-items:center" dir="ltr">
          <strong>المتبقي على المورد (Restant dû par le fournisseur):</strong>
          <strong style="font-size:16px">${fmtMoney(supInfo.due)} DA</strong>
        </div>` : `
        <div style="margin-top:14px;padding:12px 16px;background:#e8f5e9;border:1px solid #a5d6a7;border-radius:6px;font-size:13px;color:#2e7d32" dir="ltr">
          <strong>دين المورد مسوّى بالكامل (Dette réglée)</strong>
        </div>`}
        <div style="margin-top:8px;font-size:11px;color:#666" dir="ltr">
          مبلغ الفاتورة: <strong>${fmtMoney(inv.totalAmount)} DA</strong>
          ${paidAmount > 0 ? ` &nbsp;|&nbsp; مقبوض نقداً: <strong>${fmtMoney(paidAmount)} DA</strong>` : ''}
          ${(typeof inv.supExpense === 'number') ? ` &nbsp;|&nbsp; مسجّل في المصروفات: <strong>${fmtMoney(inv.supExpense)} DA</strong>` : ''}
        </div>` : `
        ${effPaid < inv.totalAmount ? `
        <div style="margin-top:14px;padding:10px 14px;background:#fff3e0;border:1px solid #ffcc80;border-radius:6px;font-size:12px;color:#e65100" dir="ltr">
          <strong>Montant payé:</strong> ${fmtMoney(effPaid)} DA &nbsp;|&nbsp;
          <strong>Reste à payer:</strong> ${fmtMoney((inv.totalAmount - effPaid))} DA
        </div>` : `
        <div style="margin-top:14px;padding:10px 14px;background:#e8f5e9;border:1px solid #a5d6a7;border-radius:6px;font-size:12px;color:#2e7d32" dir="ltr">
          <strong>Payée intégralement</strong> — ${fmtMoney(effPaid)} DA
        </div>`}
        ${creditUsed > 0 ? `
        <div style="margin-top:8px;padding:10px 14px;background:#e8f5e9;border:1px solid #a5d6a7;border-radius:6px;font-size:12px;color:#1a7f37" dir="rtl">
          تم خصم <strong>DA${fmtMoney(creditUsed)}</strong> من رصيد العميل عند البيع
        </div>` : ''}`}

        ${payMethods.ccp > 0 ? `
        <div style="margin-top:8px;padding:8px 14px;background:#e3f2fd;border:1px solid #90caf9;border-radius:6px;font-size:11px;color:#1565c0" dir="ltr">
          <i class="fas fa-credit-card"></i>
          ${payMethods.cash > 0
            ? `<strong>Partiellement réglée par CCP:</strong> ${fmtMoney(payMethods.ccp)} DA &nbsp;|&nbsp; Espèces: ${fmtMoney(payMethods.cash)} DA`
            : `<strong>Réglée par CCP</strong> — ${fmtMoney(payMethods.ccp)} DA`}
        </div>` : ''}

        <!-- Discounts detailed -->
        ${(custDiscAmount > 0 || extraDiscAmount > 0 || lineDiscTotal > 0) ? `
        <div style="margin-top:12px;padding:10px 14px;background:#fafafa;border:1px solid #eee;border-radius:6px;font-size:11px;color:#555" dir="ltr">
          <div style="font-weight:700;color:#e65100;margin-bottom:6px"><i class="fas fa-tags"></i> Remises appliquées</div>
          <div style="display:flex;justify-content:space-between;padding:2px 0">
            <span>Sous-total avant remise</span>
            <span style="font-weight:600">${fmtMoney(originalSubtotal)} DA</span>
          </div>
          ${lineDiscTotal > 0 ? `
          <div style="display:flex;justify-content:space-between;padding:2px 0">
            <span>Remise article</span>
            <span style="font-weight:600;color:#e65100">-${fmtMoney(lineDiscTotal)} DA</span>
          </div>` : ''}
          ${custDiscAmount > 0 ? `
          <div style="display:flex;justify-content:space-between;padding:2px 0">
            <span>Remise client (${inv.customerDiscount}%)</span>
            <span style="font-weight:600;color:#e65100">-${fmtMoney(custDiscAmount)} DA</span>
          </div>` : ''}
          ${extraDiscAmount > 0 ? `
          <div style="display:flex;justify-content:space-between;padding:2px 0">
            <span>Remise supplémentaire</span>
            <span style="font-weight:600;color:#e65100">-${fmtMoney(extraDiscAmount)} DA</span>
          </div>` : ''}
          <div style="display:flex;justify-content:space-between;padding:4px 0 0;margin-top:4px;border-top:1px dashed #ddd;font-weight:700;color:#333">
            <span>Total des remises</span>
            <span style="color:#e65100">-${fmtMoney((lineDiscTotal + custDiscAmount + extraDiscAmount))} DA</span>
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

  // The logo is inlined asynchronously — rebuild the preview once it is ready so
  // the on-screen copy shows exactly what will be printed. Guarded by a flag to
  // avoid an infinite rebuild loop (the second pass finds _current set).
  const _L = (typeof window.InvoiceLogo !== 'undefined') ? window.InvoiceLogo : null;
  if (_L && _L.isEnabled() && !_L.current() && !showInvoicePreview._rebuilding) {
    Promise.resolve(_L.warm()).then(function () {
      if (!_L.current()) return;
      showInvoicePreview._rebuilding = true;
      try { showInvoicePreview(inv); } finally { showInvoicePreview._rebuilding = false; }
    }).catch(function () {});
  }
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
        /* Business logo: force the greyscale watermark in N&B mode. */
        #invoicePrintArea img.zmt-doc-logo { filter: grayscale(100%) !important; }
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

  let custDiscPct = 0;
  if (_salesCustomerId) {
    const c = DB.getCustomer(_salesCustomerId);
    if (c && c.discount > 0) custDiscPct = c.discount;
  }

  const pay = getSalesPaidAmount();
  let res;
  try {
    res = window.SaleCore.executeSale(DB, {
      lines: _salesCart.map(l => ({
        name: l.name,
        barcode: l.barcode,
        entries: l.entries,
        lineDiscount: l.discount || 0,
      })),
      customerId: _salesCustomerId,
      supplierId: _salesSuppId,
      supMode: _salesSupMode,
      customerDiscountPct: custDiscPct,
      extraDiscount: parseFloat(document.getElementById('salesExtraDisc').value) || 0,
      pay: { method: _salesPayMethod, cash: pay.cash, ccp: pay.ccp, total: pay.total },
      creditUsed: _salesCreditUsed,
    }, {
      fullPayment: t('sales.fullPaymentNote'),
      partialPayment: t('sales.partialPaymentNote'),
      custDiscType: t('sales.discountType'),
      extraDiscType: t('sales.discountManual'),
      lineDiscType: t('sales.lineDiscount'),
    });
  } catch (e) {
    alert(e && e.message ? e.message : String(e));
    return;
  }
  if (!res.ok) {
    if (res.error && res.error.code === 'STOCK') {
      alert(`"${res.error.name}" ${t('sales.notAvailableQty')}\n${t('sales.available')} ${res.error.available}`);
      return;
    }
    if (res.error && res.error.code === 'PAID_EXCEEDS') { alert(t('sales.paidExceedsTotal')); return; }
    alert((res.error && res.error.message) || t('sales.cartEmptyAlert'));
    return;
  }
  const inv = res.invoice;

  _salesCart = [];
  _salesCustomerId = null;
  _salesSuppId = null;
  _salesSupMode = false;
  _salesCreditUsed = 0;
  _salesDefaultMode = 'unit';
  document.getElementById('salesSelectedCust').style.display = 'none';
  document.getElementById('salesWalkinLabel').style.display = 'none';
  document.getElementById('salesCustSearch').value = '';
  const _supResetBanner = document.getElementById('salesSupBanner');
  if (_supResetBanner) _supResetBanner.style.display = 'none';
  const _supResetRow = document.getElementById('salesCustRow');
  if (_supResetRow) _supResetRow.style.display = '';
  document.getElementById('salesPaySection').style.display = 'none';
  document.getElementById('salesExtraDisc').value = '0';
  resetSalesPaymentUI();
  resetSupSalePayUI();
  renderSalesCart();
  renderSalesProducts();

  // Thermal mode: print the receipt silently straight to the roll printer and
  // never open the normal print window. On any failure we fall back to the
  // usual on-screen preview so the cashier is never stuck.
  if (window.ThermalPrint && window.ThermalPrint.isEnabled()) {
    window.ThermalPrint.printSale(inv, res).then(function (r) {
      if (r && r.ok) {
        window.ThermalPrint.toast(t('thermal.printed') || 'تمت الطباعة على الطابعة الحرارية', 'ok');
      } else if (r && r.fallback) {
        showInvoicePreview(inv);
      } else {
        window.ThermalPrint.toast((t('thermal.testFail') || 'فشل الطباعة') + ' ' + ((r && r.error) || ''), 'err');
        showInvoicePreview(inv);
      }
    });
  } else {
    showInvoicePreview(inv);
  }

  // Cash drawer: kick the drawer open after a confirmed sale. Deliberately
  // fire-and-forget — a drawer that will not open must never hold up the
  // cashier; the module shows a short toast only when it is worth nagging.
  if (window.CashDrawer && window.CashDrawer.isAvailable()) {
    try { window.CashDrawer.openFromSale(); } catch (e) {}
  }

  document.getElementById('salesBarcodeScan').focus();
}

function clearSalesCart() {
  if (_salesCart.length === 0) return;
  if (!confirm(t('sales.clearCartConfirm'))) return;
  _salesCart = [];
  _salesCustomerId = null;
  _salesSuppId = null;
  _salesSupMode = false;
  _salesCreditUsed = 0;
  _salesDefaultMode = 'unit';
  _salesPaidTouched = false;
  _salesComputedTotal = 0;
  document.getElementById('salesSelectedCust').style.display = 'none';
  document.getElementById('salesWalkinLabel').style.display = 'none';
  document.getElementById('salesCustSearch').value = '';
  const _supResetBanner = document.getElementById('salesSupBanner');
  if (_supResetBanner) _supResetBanner.style.display = 'none';
  const _supResetRow = document.getElementById('salesCustRow');
  if (_supResetRow) _supResetRow.style.display = '';
  document.getElementById('salesPaySection').style.display = 'none';
  document.getElementById('salesExtraDisc').value = '0';
  resetSalesPaymentUI();
  resetSupSalePayUI();
  renderSalesCart();
  renderSalesProducts();
  updateSalesLed();
  document.getElementById('salesBarcodeScan').focus();
}

// ===== SALES HISTORY =====

function openSalesHistory() {
  const overlay = document.getElementById('shOverlay');
  const body = document.getElementById('shOverlayBody');
  if (!overlay || !body) return;
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  // Enter sales-history mode so the embedded invoices list is locked to
  // sale invoices only (no type filter -> employees can't view purchases).
  window._invSalesHistory = true;

  if (!body.dataset.loaded) {
    body.innerHTML = '<div class="placeholder-box" style="padding:48px"><i class="fas fa-spinner fa-spin" style="font-size:34px;color:#0066B1"></i><p>جارٍ التحميل...</p></div>';
    fetch('pages/invoices.html')
      .then(r => r.text())
      .then(html => {
        body.innerHTML = html;
        body.dataset.loaded = '1';
        if (typeof applyTranslation === 'function') applyTranslation();
        _shInitInvoices(body);
      })
      .catch(() => {
        body.innerHTML = '<div class="placeholder-box" style="padding:48px"><i class="fas fa-exclamation-triangle" style="font-size:34px;color:#e74c3c"></i><p>تعذّر تحميل سجل المبيعات</p></div>';
      });
  } else {
    _shInitInvoices(body);
  }
  document.addEventListener('keydown', _shEscHandler);
}

function _shInitInvoices(body) {
  // Pre-select sale invoices so the overlay shows only sales history,
  // then run the real invoices page logic inside this renderer (so edits,
  // payments and returns correctly hit stock, net account and the LAN/cloud sync).
  window._invForceType = 'customer';
  if (body.dataset.inited) {
    // The invoices page keeps its list in a cached array; sales created on this
    // page write straight to the DB without touching that cache, so resync it
    // from the live DB before filtering — otherwise recent sales stay invisible
    // in the history until the app is restarted.
    if (typeof refreshInvoiceList === 'function') refreshInvoiceList();
    if (typeof filterInvoices === 'function') filterInvoices();
  } else {
    // First open for this overlay: boot the real invoices page logic here so the
    // pager binds to this overlay's DOM (not the main invoices page). Its own
    // init already refreshes the list.
    if (typeof executePageScript === 'function') executePageScript('invoices');
    body.dataset.inited = '1';
  }
}

function _shEscHandler(e) {
  if (e.key === 'Escape') closeSalesHistory();
}

function closeSalesHistory() {
  const overlay = document.getElementById('shOverlay');
  if (overlay) overlay.style.display = 'none';
  document.body.style.overflow = '';
  document.removeEventListener('keydown', _shEscHandler);
  // Leave sales-history mode so the normal invoices page is unaffected.
  window._invSalesHistory = false;
}

// ===== LAN SYNC: live refresh without disturbing the active cart =====
window._pageSyncHandlers = window._pageSyncHandlers || {};
window._pageSyncHandlers['sales'] = function salesSyncData() {
  window.syncPreserveRefresh({
    search: ['salesSearch', 'salesCustSearch'],
    render: () => {
      _salesProducts = DB.getProducts();
      invalidateSalesGroupsCache();
      renderSalesProducts(_salesSearchQuery);
    },
  });
};
