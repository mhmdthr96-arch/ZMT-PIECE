var _salesCart = [];
var _salesCustomerId = null;
// Customer tree: a sub-customer is only a label on the parent's invoice.
// This id NEVER replaces _salesCustomerId in DB writes.
var _salesSubCustomerId = null;
var _salesSubPickerId = null;
var _salesProducts = [];
var _salesSearchQuery = '';
var _salesRenderRAF = null;
var _salesDefaultMode = 'unit';
var _salesPaidTouched = false;
var _salesPayMethod = 'cash';
var _salesHideUntilSearch = false;
var _salesViewMode = 'grid';
var _salesListAllCols = false;
var _salesInCartStrip = false;
var _salesCartWidth = 420;
var _salesCartDragging = false;
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

// The party's own legal identity (NIS / NIF / RC / Article), typed on its
// customer or supplier card. Written out here because page scripts load one at
// a time — the invoices-page helper is not defined while the sales page runs.
// On unless the operator explicitly switched it off in settings.
function salesPartyLegalHTML(party, isSupplier) {
  if (!party) return '';
  const key = isSupplier ? 'zmt_inv_party_legal_supplier' : 'zmt_inv_party_legal_customer';
  if (localStorage.getItem(key) === '0') return '';
  const parts = [];
  if (party.nis) parts.push('NIS: ' + escHtml(party.nis));
  if (party.nif) parts.push('NIF: ' + escHtml(party.nif));
  if (party.rc || party.rcc) parts.push('RC: ' + escHtml(party.rc || party.rcc));
  if (party.article) parts.push('ART: ' + escHtml(party.article));
  if (!parts.length) return '';
  return '<div style="font-size:10px;color:#777;margin-top:3px;direction:ltr;text-align:left">' + parts.join(' | ') + '</div>';
}
function getTvaRate() {
  return parseFloat(localStorage.getItem('zmt_tva_rate') || '0');
}

function _salesPageKeyHandler(e) {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  // F10 sells an item that is not in the catalogue. It works whatever has
  // focus — the cashier may be mid-search — but never on top of an open modal,
  // including its own window.
  if (e.key === 'F10' || e.code === 'F10') {
    if (salesAnyOverlayOpen && salesAnyOverlayOpen()) return;
    e.preventDefault();
    e.stopPropagation();
    openSalesFreeLine();
    return;
  }
  // F5 opens the customer tree for the selected parent. Handled here (page
  // scoped) instead of globally so other pages keep the normal reload key and
  // the flag OFF keeps the exact previous behaviour. It must also work while
  // the cashier's focus is in the barcode/name field.
  if (e.key === 'F5' || e.code === 'F5') {
    if (!_salesTreeEnabled()) return;
    e.preventDefault();
    e.stopPropagation();
    if (salesAnyOverlayOpen && salesAnyOverlayOpen()) return;
    openSalesSubCustomerModal();
    return;
  }
  const target = e.target;
  const inScanField = !!(target && target.id === 'salesBarcodeScan');
  if (target && target.tagName) {
    const tag = target.tagName.toUpperCase();
    const inField = tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
    if (inField && !inScanField) return;
  }
  if (salesAnyOverlayOpen && salesAnyOverlayOpen()) return;
  const key = e.key || '';
  if (key === 'F' || key === 'f') {
    // The scan field is also the name search now: "f" is a letter there, never
    // the clear-cart shortcut. The visible «تفريغ» button is always available.
    if (inScanField) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof clearSalesCart === 'function') clearSalesCart();
    return;
  }
  if (key === 'F9' || e.code === 'F9') {
    e.preventDefault();
    e.stopPropagation();
    if (typeof clearSalesCart === 'function') clearSalesCart();
    return;
  }
}

function init_sales() {
  _salesProducts = (typeof salesAllProducts === 'function') ? salesAllProducts() : (DB.getProducts ? DB.getProducts() : (_salesProducts || []));
  invalidateSalesGroupsCache();
  _salesSearchQuery = '';
  _salesDefaultMode = 'unit';
  _salesHideUntilSearch = (function () { try { return localStorage.getItem('zmt_sales_hide_until_search') === '1'; } catch (e) { return false; } })();
  _salesViewMode = (function () { try { return localStorage.getItem('zmt_sales_view_mode') === 'list' ? 'list' : 'grid'; } catch (e) { return 'grid'; } })();
  _salesListAllCols = (function () { try { return localStorage.getItem('zmt_sales_list_allcols') === '1'; } catch (e) { return false; } })();
  _salesInCartStrip = (function () { try { return localStorage.getItem('zmt_sales_incart_strip') === '1'; } catch (e) { return false; } })();
  _salesFavBrandsOn = (function () { try { return localStorage.getItem('zmt_sales_fav_brands_on') === '1'; } catch (e) { return false; } })();
  _salesFavBrandActive = null;
  _syncSalesFavBrandsBtn();
  _salesCartWidth = (function () { try { var v = parseInt(localStorage.getItem('zmt_sales_cart_width'), 10); if (isNaN(v)) return 420; return Math.max(300, Math.min(700, v)); } catch (e) { return 420; } })();
  _salesCartDragging = false;
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
  trackPageListener('keydown', _salesPageKeyHandler);
  _syncSalesViewUI();
  setSalesView(_salesViewMode);
  if (document.getElementById('salesListAllCols')) document.getElementById('salesListAllCols').checked = !!_salesListAllCols;
  toggleSalesInCartStrip();
  initSalesCartWidth();
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
  try { updateSalesLed(); } catch (e) {}
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

// ---- Favourite brands strip (feature: إظهار العلامات المفضلة) ----
// The full filtered list stays in _salesGroupList; every entry keeps its
// absolute index there so card actions (add to cart, substitutes, rest order)
// keep working no matter which section the card is painted in.
var _salesFavBrandsOn = false;
var _salesFavBrandActive = null;
var _salesMainGroups = [];   // [{ g, idx }] main grid (all except active brand)
var _salesFavGroups = [];    // [{ g, idx }] products of the active brand
var _salesFavRendered = 0;

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

// One grid entry (card or list row) with its ABSOLUTE index inside
// _salesGroupList so windowed sections never break cart actions.
function _salesItemHTML(item) {
  if (!item || !item.g) return '';
  return (_salesViewMode === 'list')
    ? salesListRowHTML(item.g, item.idx)
    : salesCardHTML(item.g, item.idx);
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
  for (let i = from; i < _salesStart; i++) html += _salesItemHTML(_salesMainGroups[i]);
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

// Load more groups when scrolling down (appends to existing DOM)
function loadMoreSalesProducts() {
  if (_salesGridLoadingMore) return;
  if (!_salesMainGroups || _salesRenderedCount >= _salesMainGroups.length) return;
  const grid = document.getElementById('salesProductGrid');
  if (!grid || !grid.isConnected) return;
  _salesGridLoadingMore = true;
  const from = _salesRenderedCount;
  const to = Math.min(from + SALES_GRID_PAGE_SIZE, _salesMainGroups.length);
  let html = '';
  for (let i = from; i < to; i++) html += _salesItemHTML(_salesMainGroups[i]);
  _salesRenderedCount = to;
  grid.insertAdjacentHTML('beforeend', html);
  _trimSalesGrid();
  _salesGridLoadingMore = false;
}

function salesGroupKey(p) {
  return (p.name || '') + '\u0001' + (p.barcode || '');
}

function invalidateSalesGroupsCache() {
  _salesGroupsCache = null;
  _salesGroupsIndex = null;
  _salesCardCtx = null;
}
if (typeof window !== 'undefined') window.invalidateSalesGroupsCache = invalidateSalesGroupsCache;
function _invalidateSalesGroupsCache() { invalidateSalesGroupsCache(); }

var _salesGroupsIndex = null;

function salesAllProducts() {
  const prods = (DB.getProducts ? DB.getProducts() : []).slice();
  const bundles = (DB.getBundles ? DB.getBundles() : []);
  for (const b of bundles) {
    const cost = (b.components || []).reduce((s, c) => {
      const p = DB.getProduct(c.productId);
      return s + ((p && p.buyPrice) || 0) * (parseFloat(c.qty) || 0);
    }, 0);
    prods.push({
      id: 'bundle:' + b.id,
      name: b.name,
      barcode: b.barcode,
      brandId: null,
      buyPrice: cost,
      sellPrice: b.price || 0,
      wholesalePrice: b.price || 0,
      extraPrices: {},
      quantity: 0,
      fixed: false,
      isBundle: true,
      bundleId: b.id,
      bundleComponents: b.components || [],
      minPrice: 0,
      createdAt: b.createdAt || 0,
    });
  }
  return prods;
}
function getSalesGroups() {
  if (_salesGroupsCache) return _salesGroupsCache;
  const map = new Map();
  const groups = [];
  const prods = (_salesProducts && _salesProducts.length) ? _salesProducts : (DB.getProducts ? DB.getProducts() : []);
  _salesProducts = prods;
  for (let i = 0; i < prods.length; i++) {
    const p = prods[i];
    if (!p) continue;
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
function bundleReservedQty(productId) {
  const bundles = (DB.getBundles ? DB.getBundles() : []);
  let maxq = 0;
  for (const b of bundles) {
    const comp = (b.components || []).find(c => c.productId === productId);
    if (comp) maxq = Math.max(maxq, parseFloat(comp.qty) || 0);
  }
  return maxq;
}
function salesGroupMinPrice(g) {
  if (!g || !g.records) return 0;
  return Math.max(0, ...(g.records.map(r => Number(r && r.minPrice) || 0)));
}
function salesLineMinPrice(line) {
  if (!line) return 0;
  if (line.minPrice != null && !isNaN(line.minPrice)) return Math.max(0, Number(line.minPrice) || 0);
  return salesGroupMinPrice(getSalesGroupByKey(line.key));
}

// One fixed-colour badge shared by the sales grid card and the compact list
// row. `fv-minPrice` keeps it under the existing field-visibility switch.
function salesMinPriceBadge(g, listMode) {
  const floor = salesGroupMinPrice(g);
  const value = floor > 0 ? 'DA' + fmtMoney(floor) : '—';
  const label = escHtml(t('quickEntry.minPrice'));
  return listMode
    ? `<span class="sales-list-price floor fv-minPrice"><b>${value}</b><span class="sales-list-price-kind">${label}</span></span>`
    : `<div class="price-pill price-floor fv-minPrice"><span>${label}</span><b>${value}</b></div>`;
}

// ===== FAVOURITE BRANDS (sales strip) =====

// Brand of a group: the first sellable batch carries the identity.
function _salesGroupBrandId(g) {
  if (!g) return '';
  const rep = groupViableRecords(g)[0] || (g.records && g.records[0]) || {};
  return String(rep.brandId || '');
}

// Favourites live in the same localStorage keys used by the Brands page. The
// sales page can open first (brands.js is lazy-loaded), so we read the raw keys
// instead of depending on functions that may not exist yet.
const SALES_FAV_BRANDS_KEY = 'zmt_fav_brands';
const SALES_CUSTOM_BRANDS_KEY = 'zmt_custom_brands';

function _salesLsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}

function _salesCustomBrands() {
  const list = _salesLsGet(SALES_CUSTOM_BRANDS_KEY, []);
  return Array.isArray(list) ? list : [];
}

// Built-in + custom brands, custom definitions win when the id matches.
function _salesAllBrands() {
  const map = new Map();
  if (typeof BRANDS !== 'undefined') {
    (BRANDS.global || []).forEach(b => { if (b && b.id) map.set(b.id, b); });
    (BRANDS.chinese || []).forEach(b => { if (b && b.id) map.set(b.id, b); });
  }
  _salesCustomBrands().forEach(b => { if (b && b.id) map.set(b.id, b); });
  return [...map.values()];
}

function _salesFavBrandIds() {
  const list = _salesLsGet(SALES_FAV_BRANDS_KEY, []);
  return Array.isArray(list) ? list.map(String).filter(Boolean) : [];
}

// Colour + initials for the compact strip cards (no external images needed).
function _salesBrandColor(b) {
  return (b && b.color) ? b.color : '#0066B1';
}
function _salesBrandInitials(b) {
  const letters = String((b && b.name) || '').replace(/[^A-Za-z0-9\u0600-\u06FF]/g, '');
  return (letters.substring(0, 2) || '?').toUpperCase();
}
function _salesBrandById(id) {
  return _salesAllBrands().find(b => String(b.id) === String(id)) || null;
}

function _syncSalesFavBrandsBtn() {
  const btn = document.getElementById('salesFavBrandsBtn');
  if (!btn) return;
  btn.classList.toggle('active', !!_salesFavBrandsOn);
  btn.setAttribute('aria-pressed', _salesFavBrandsOn ? 'true' : 'false');
}

function toggleSalesFavBrands() {
  const turningOn = !_salesFavBrandsOn;
  if (turningOn && !_salesFavBrandIds().length) {
    alert(t('sales.favBrandsEmpty') || 'لا توجد علامات مفضلة — افتح صفحة العلامات وانقر ★ على العلامات التي تريد إظهارها.');
    return;
  }
  _salesFavBrandsOn = turningOn;
  try { localStorage.setItem('zmt_sales_fav_brands_on', _salesFavBrandsOn ? '1' : '0'); } catch (e) {}
  if (!_salesFavBrandsOn) _salesFavBrandActive = null;
  _syncSalesFavBrandsBtn();
  renderSalesProducts();
}

// One active brand at a time; pressing the same brand again hides its products.
function toggleSalesFavBrand(id) {
  const next = (id == null) ? null : String(id);
  _salesFavBrandActive = (next && _salesFavBrandActive === next) ? null : next;
  renderSalesProducts();
}

// Cards are built from the current (search-aware) group list so the count always
// matches what the user will see after pressing the brand.
function _renderSalesFavStrip(groups) {
  const strip = document.getElementById('salesFavStrip');
  const items = document.getElementById('salesFavStripItems');
  const countEl = document.getElementById('salesFavStripCount');
  if (!strip || !items) return;

  const ids = _salesFavBrandIds();
  const brands = _salesAllBrands();
  const byId = new Map(brands.map(b => [String(b.id), b]));
  const favs = ids.map(id => byId.get(id)).filter(Boolean);

  if (!_salesFavBrandsOn) {
    strip.style.display = 'none';
    items.innerHTML = '';
    if (countEl) countEl.textContent = '';
    return;
  }

  strip.style.display = 'flex';
  const counts = new Map();
  (groups || []).forEach(g => {
    const bid = _salesGroupBrandId(g);
    if (!bid) return;
    counts.set(bid, (counts.get(bid) || 0) + 1);
  });

  if (countEl) {
    countEl.textContent = favs.length
      ? `${favs.length} ${t('common.brand')}`
      : '';
  }

  if (favs.length === 0) {
    items.innerHTML = `<div class="sales-fav-empty"><i class="fas fa-star"></i> ${escHtml(t('sales.favBrandsEmpty'))}</div>`;
    return;
  }

  items.innerHTML = favs.map(b => {
    const id = String(b.id);
    const color = _salesBrandColor(b);
    const c = counts.get(id) || 0;
    const active = _salesFavBrandActive === id;
    return `<button type="button" class="sales-fav-card ${active ? 'active' : ''} ${c === 0 ? 'empty' : ''}"
      style="--fav-color:${color}" onclick="toggleSalesFavBrand('${escHtml(id)}')"
      title="${escHtml(b.name || id)}" aria-pressed="${active ? 'true' : 'false'}">
      <span class="sales-fav-card-avatar">${escHtml(_salesBrandInitials(b))}</span>
      <span class="sales-fav-card-body">
        <span class="sales-fav-card-name">${escHtml(b.name || id)}</span>
        <span class="sales-fav-card-count"><i class="fas fa-cubes"></i> ${c} ${escHtml(t('common.product'))}</span>
      </span>
      ${active ? '<i class="fas fa-check-circle sales-fav-card-check"></i>' : ''}
    </button>`;
  }).join('');
}

function _renderSalesFavActive() {
  const section = document.getElementById('salesFavActiveSection');
  const grid = document.getElementById('salesFavActiveGrid');
  const nameEl = document.getElementById('salesFavActiveName');
  const countEl = document.getElementById('salesFavActiveCount');
  if (!section || !grid) return;

  const brand = _salesFavBrandActive ? _salesBrandById(_salesFavBrandActive) : null;
  if (!_salesFavBrandActive || !brand) {
    section.style.display = 'none';
    grid.innerHTML = '';
    _salesFavRendered = 0;
    return;
  }

  section.style.display = 'flex';
  section.style.setProperty('--fav-color', _salesBrandColor(brand));
  if (nameEl) nameEl.textContent = brand.name || _salesFavBrandActive;
  if (countEl) countEl.textContent = `${_salesFavGroups.length} ${t('common.product')}`;

  _salesFavRendered = 0;
  grid.innerHTML = '';
  const to = Math.min(SALES_GRID_PAGE_SIZE, _salesFavGroups.length);
  let html = '';
  for (let i = 0; i < to; i++) html += _salesItemHTML(_salesFavGroups[i]);
  _salesFavRendered = to;
  grid.innerHTML = html || `<div class="sales-grid-empty sales-fav-grid-empty"><i class="fas fa-box-open"></i><p>${escHtml(t('sales.favBrandsNoProducts'))}</p></div>`;

  if (!grid.dataset.scrollBound) {
    grid.dataset.scrollBound = '1';
    grid.addEventListener('scroll', function () {
      if (this.scrollTop + this.clientHeight >= this.scrollHeight - 300) loadMoreSalesFavProducts();
    });
  }
}

function loadMoreSalesFavProducts() {
  const grid = document.getElementById('salesFavActiveGrid');
  if (!grid || !grid.isConnected) return;
  if (_salesFavRendered >= _salesFavGroups.length) return;
  const from = _salesFavRendered;
  const to = Math.min(from + SALES_GRID_PAGE_SIZE, _salesFavGroups.length);
  let html = '';
  for (let i = from; i < to; i++) html += _salesItemHTML(_salesFavGroups[i]);
  _salesFavRendered = to;
  const empty = grid.querySelector('.sales-fav-grid-empty');
  if (empty) empty.remove();
  grid.insertAdjacentHTML('beforeend', html);
}

function bundleMaxSellable(r) {
  if (!r || !r.isBundle) return 0;
  const comps = r.bundleComponents || (r.bundleId && DB.getBundle(r.bundleId) && DB.getBundle(r.bundleId).components) || [];
  let max = Infinity;
  for (const c of comps) {
    const p = DB.getProduct(c.productId);
    const avail = p ? (parseFloat(p.quantity) || 0) : 0;
    const per = Math.floor(avail / (parseFloat(c.qty) || 1));
    max = Math.min(max, per);
  }
  return (max === Infinity || !isFinite(max)) ? 0 : Math.max(0, max);
}
function getGroupAvailableQty(group) {
  if (group && group.records && group.records.some(r => r && r.isBundle)) {
    const r = group.records.find(x => x && x.isBundle);
    if (r) {
      let max = Infinity;
      for (const c of (r.bundleComponents || [])) {
        const p = DB.getProduct(c.productId);
        const avail = p ? (parseFloat(p.quantity) || 0) : 0;
        const per = Math.floor(avail / (parseFloat(c.qty) || 1));
        max = Math.min(max, per);
      }
      return (max === Infinity) ? 0 : Math.max(0, max);
    }
  }
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
  const recs = (group.records || []).filter(r => isFixedRecord(r) || r.isBundle || (r.quantity || 0) > 0);
  if (!salesPharmacyOn()) return recs;
  return recs.filter(r => isFixedRecord(r) || r.isBundle || salesExpiryClass(r) !== 'expired');
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
   EXTRA SALE PRICES (feature 3)
   ============================================================ */
function salesExtraFields() {
  return (typeof ExtraPrices !== 'undefined' && ExtraPrices) ? ExtraPrices.fields() : [];
}

// Cart price mode is one of: 'unit' | 'wholesale' | 'extra:<fieldId>'.
function salesExtraFieldOfMode(mode) {
  const m = String(mode || '');
  if (m.indexOf('extra:') !== 0) return null;
  return salesExtraFields().find(f => f.id === m.slice(6)) || null;
}

function salesPriceForRecord(r, mode) {
  if (!r) return 0;
  if (mode === 'wholesale') return r.wholesalePrice || r.sellPrice || 0;
  const field = salesExtraFieldOfMode(mode);
  if (field) {
    const v = (typeof ExtraPrices !== 'undefined' && ExtraPrices) ? ExtraPrices.priceOf(r, field.id) : 0;
    return v || r.sellPrice || 0;
  }
  return r.sellPrice || 0;
}

function getGroupModePrice(group, mode) {
  const r = groupViableRecords(group)[0] || group.records[0] || {};
  return salesPriceForRecord(r, mode);
}

function salesLineModeLabel(mode) {
  if (mode === 'wholesale') return t('sales.wholesale');
  const field = salesExtraFieldOfMode(mode);
  if (field) return field.name;
  return t('sales.unit');
}

// Cycle order: قطعة → جملة → each extra field → قطعة. A mode whose field was
// deleted meanwhile silently falls back to the first step instead of sticking
// on a price that no longer exists.
function salesNextLineMode(mode) {
  const list = ['unit', 'wholesale'].concat(salesExtraFields().map(f => 'extra:' + f.id));
  const i = list.indexOf(String(mode || 'unit'));
  return list[(i < 0 ? 0 : i + 1) % list.length];
}

function salesExtraPillsHTML(rec, extraClass) {
  if (typeof ExtraPrices === 'undefined' || !ExtraPrices) return '';
  return salesExtraFields().map(f => ExtraPrices.pillHTML(rec, f, extraClass)).join('');
}

// A product group can hold several purchase batches at different costs. The
// stock-weighted cost of the sellable batches is the figure a list row should
// show — quoting only the oldest batch understates the cost as soon as a
// restock arrives at a different price.
function getGroupBuyPrice(group) {
  const recs = groupViableRecords(group);
  let cost = 0, qty = 0;
  for (const r of recs) {
    const q = Math.max(0, r.quantity || 0);
    if (!q) continue;
    cost += (r.buyPrice || 0) * q;
    qty += q;
  }
  if (qty) return cost / qty;
  // Fixed (unlimited-stock) records carry no quantity: fall back to the first one.
  return recs.length ? (recs[0].buyPrice || 0) : 0;
}

// Purchase cost is a manager figure and stays masked until Ctrl+X reveals it,
// exactly like the inventory cards. No session means no reveal, never a
// default-open read.
function salesBuyPriceVisible() {
  return !!(typeof Auth !== 'undefined'
    && typeof Auth.buyPriceVisible === 'function'
    && Auth.buyPriceVisible());
}

/* ============================================================
   MINIMUM SELL MARGIN (إعدادات نسبة البيع)

   The manager fixes, per sale kind, how much of the gap between the
   shelf price (P) and the true cost (C) may be given away:

       floor = P − pct × (P − C)

   25% of a 100 → 130 product is a floor of 122.50. Cost is not the
   oldest batch's price: the cart already consumed specific batches
   FIFO into line.entries, so the cost of what is actually leaving the
   shop is the cost of those batches. Discounts are checked line by
   line, which means the invoice-level customer % and the extra discount
   are distributed back onto the lines exactly like SaleCore does.

   New retail/wholesale sales only. Returns, edits of an old invoice and
   «بيع لمورد» never enter this path.
   ============================================================ */
const SALES_MARGIN_META = 'sales_margin_cfg';

function salesMarginConfig() {
  let raw = null;
  try { raw = DB.getMeta(SALES_MARGIN_META); } catch (e) { raw = null; }
  const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return (isFinite(n) && n >= 0 && n <= 100) ? n : null;
  };
  const cfg = { enabled: !!(raw && raw.enabled), store: { retail: null, wholesale: null, extras: {} }, rules: [] };
  const extrasOf = (o) => {
    const out = {};
    if (o && o.extras && typeof o.extras === 'object') {
      for (const id of Object.keys(o.extras)) {
        const n = num(o.extras[id]);
        if (n != null) out[id] = n;
      }
    }
    return out;
  };
  if (raw && raw.store) {
    cfg.store.retail = num(raw.store.retail);
    cfg.store.wholesale = num(raw.store.wholesale);
    cfg.store.extras = extrasOf(raw.store);
  }
  if (raw && Array.isArray(raw.rules)) {
    for (const r of raw.rules) {
      if (!r || !r.id) continue;
      const scope = r.scope === 'brand' || r.scope === 'category' || r.scope === 'product' ? r.scope : 'category';
      cfg.rules.push({ scope, id: String(r.id), label: String(r.label || ''), retail: num(r.retail), wholesale: num(r.wholesale), extras: extrasOf(r) });
    }
  }
  return cfg;
}

function salesMarginEnabled() {
  const cfg = salesMarginConfig();
  const hasExtras = Object.keys(cfg.store.extras).length > 0 || cfg.rules.some(r => Object.keys(r.extras || {}).length > 0);
  return !!(cfg.enabled && (cfg.store.retail != null || cfg.store.wholesale != null || hasExtras || cfg.rules.length));
}

// A product rule points at a sales group, whose key joins name and barcode with
// U+0001. That separator cannot survive an HTML attribute — the parser turns
// control characters into spaces and the rule would silently stop matching — so
// the identifier is stored URL-encoded and compared in the same form.
function _msProductId(key) {
  return encodeURIComponent(String(key == null ? '' : key));
}

// product > brand > category > store. A level that does not set this kind
// falls through to the next one instead of silently meaning "no floor".
// kind is 'retail' | 'wholesale' | 'extra:<fieldId>'.
function salesMarginKindOfMode(mode) {
  if (mode === 'wholesale') return 'wholesale';
  const field = salesExtraFieldOfMode(mode);
  return field ? ('extra:' + field.id) : 'retail';
}

function _marginPctOf(holder, kind) {
  if (!holder) return null;
  if (String(kind).indexOf('extra:') === 0) {
    const extras = holder.extras || {};
    const v = extras[kind.slice(6)];
    return v == null ? null : v;
  }
  const v = holder[kind];
  return v == null ? null : v;
}

function salesMarginPct(cfg, kind, group, rep) {
  const family = String((rep && rep.family) || '').trim().toLowerCase();
  const brandId = rep && rep.brandId ? String(rep.brandId) : '';
  const pid = group && group.key ? _msProductId(group.key) : '';
  for (const scope of ['product', 'brand', 'category']) {
    for (const r of cfg.rules) {
      const pct = _marginPctOf(r, kind);
      if (r.scope !== scope || pct == null) continue;
      if (scope === 'product' && pid && r.id === pid) return pct;
      if (scope === 'brand' && brandId && r.id === brandId) return pct;
      if (scope === 'category' && family && r.id.toLowerCase() === family) return pct;
    }
  }
  return _marginPctOf(cfg.store, kind);
}

// The shelf price and the FIFO cost of the very batches this line consumes.
function salesMarginLineBasis(line, group) {
  let qty = 0, refTotal = 0, costTotal = 0;
  const entries = (line && line.entries) || [];
  for (const e of entries) {
    const q = Number(e.qty) || 0;
    if (q <= 0) continue;
    const rec = (group && group.records ? group.records.find(r => r.id === e.productId) : null)
      || (typeof DB.getProduct === 'function' ? DB.getProduct(e.productId) : null);
    const list = salesPriceForRecord(rec, line && line.mode);
    qty += q;
    refTotal += list * q;
    costTotal += (Number(rec && rec.buyPrice) || 0) * q;
  }
  if (!qty) {
    // Fixed (unlimited) products and hand-built lines carry no per-batch price
    // history: the line's own figures are the only reference there is.
    qty = Number(line && line.qty) || 0;
    refTotal = Number(line && line.baseTotal) || 0;
    costTotal = (typeof getGroupBuyPrice === 'function' && group ? getGroupBuyPrice(group) : 0) * qty;
  }
  return { qty, refTotal, costTotal };
}

// Floor of one line: returns null when nothing protects a margin here (no
// rule, no shelf price, or the shelf price is already at or under cost).
function salesMarginFloorOf(line, group, cfg) {
  const kind = salesMarginKindOfMode(line.mode);
  const rep = (group && group.records && group.records[0]) || null;
  const pct = salesMarginPct(cfg, kind, group, rep);
  if (pct == null) return null;
  const basis = salesMarginLineBasis(line, group);
  if (!basis.qty || basis.refTotal <= 0) return null;
  const gap = basis.refTotal - basis.costTotal;
  if (gap <= 0) return null;
  return { pct, kind, qty: basis.qty, refTotal: basis.refTotal, floorTotal: basis.refTotal - (pct / 100) * gap };
}

// Every cart line against its floor, with the invoice-level discounts pushed
// back onto the lines exactly like SaleCore spreads them (pro rata of the line
// base totals, after the customer percentage and the manual extra).
//
// A line can be brought back onto the floor by either lever, and the cashier
// must be corrected where he actually erred: an over-large discount is taken
// from the discount field and leaves his price alone; a price that is itself
// under the floor is lifted instead.
function salesMarginScan(custDiscPct, extraDisc) {
  const cfg = salesMarginConfig();
  if (!cfg.enabled) return [];
  const baseTotals = _salesCart.map(l => Math.max(0, Number(l.baseTotal) || 0));
  const subTotal = baseTotals.reduce((s, v) => s + v, 0);
  if (subTotal <= 0) return [];
  const custDisc = subTotal * (Math.max(0, Number(custDiscPct) || 0) / 100);
  const extra = Math.min(Math.max(0, Number(extraDisc) || 0), subTotal - custDisc);
  const ratio = (custDisc + extra) / subTotal;
  // What the invoice leaves a line before its own discount. A fully discounted
  // cart (ratio → 1) leaves nothing, so no finite price is asked for there.
  const keep = ratio < 0.999 ? 1 - ratio : 0;
  const out = [];
  for (let i = 0; i < _salesCart.length; i++) {
    const line = _salesCart[i];
    const floor = salesMarginFloorOf(line, getSalesGroupByKey(line.key), cfg);
    if (!floor || floor.floorTotal == null) continue;
    const disc = Math.max(0, Number(line.discount) || 0);
    const room = baseTotals[i] * keep;
    const charged = room - disc;
    if (charged >= floor.floorTotal - 1e-6) continue;
    // Largest discount this price can still carry (truncated to the cent so the
    // correction never lands a hair under the floor).
    const maxDisc = Math.max(0, Math.floor((room - floor.floorTotal) * 100 + 1e-6) / 100);
    const newDisc = Math.min(disc, maxDisc);
    const byDiscount = room - newDisc >= floor.floorTotal - 1e-6;
    // Price lever: the lowest unit price that lands on the floor once the
    // (already corrected) line discount and its invoice share come off it.
    const needBase = keep > 0 ? (floor.floorTotal + newDisc) / keep : floor.floorTotal;
    // Ceil to the cent, but let binary noise land on the exact cent instead of
    // pushing the offer one cent above the true minimum.
    const suggest = Math.ceil((needBase / floor.qty) * 100 - 1e-6) / 100;
    out.push({
      idx: i,
      name: line.name,
      qty: floor.qty,
      kind: floor.kind,
      byDiscount,
      newDisc,
      maxDisc,
      chargedUnit: charged / floor.qty,
      floorUnit: floor.floorTotal / floor.qty,
      // The single number the operator is shown: the minimum allowed price in
      // the field he is actually being corrected in.
      suggestUnit: byDiscount
        ? Math.ceil((floor.floorTotal / floor.qty) * 100 - 1e-6) / 100
        : (suggest > 0 ? suggest : floor.floorTotal / floor.qty),
    });
  }
  return out;
}

// «اعتماد أقل سعر»: correct the field the breach came from, then re-scan —
// raising a line moves the invoice discount onto the others, so this is
// repeated until the cart is clean (bounded, never endless).
function salesMarginAcceptFloors() {
  for (let pass = 0; pass < 5; pass++) {
    const discs = _salesMarginInvoiceDiscs();
    const v = salesMarginScan(discs.custPct, discs.extra);
    if (!v.length) return true;
    for (const item of v) {
      const line = _salesCart[item.idx];
      if (!line) continue;
      if (item.byDiscount) {
        // The price was never the problem: shrink the discount, leave 200 at 200.
        line.discount = item.newDisc;
      } else {
        line.manualPrice = item.suggestUnit;
        line.discount = item.newDisc;
      }
      allocateSalesLine(line, line.key);
    }
    renderSalesCart();
  }
  const discs = _salesMarginInvoiceDiscs();
  const left = salesMarginScan(discs.custPct, discs.extra);
  if (left.length) alert(t('sales.marginWarn') + '\n' + left.map(x => x.name).join(', '));
  return left.length === 0;
}

// The two invoice-level discounts live in the DOM (both layouts use the same
// ids), so a live per-line check reads them exactly like the checkout does.
function _salesMarginInvoiceDiscs() {
  let custPct = 0;
  if (_salesCustomerId) {
    const c = DB.getCustomer(_salesCustomerId);
    if (c && c.discount > 0) custPct = c.discount;
  }
  const el = document.getElementById('salesExtraDisc');
  return { custPct, extra: el ? (parseFloat(el.value) || 0) : 0 };
}

let _salesMarginBusy = false;
// Set by «المواصلة» at checkout: the very next confirmation is the operator's
// answered warning, so it must not ask twice. Cleared as soon as it is spent.
let _salesMarginBypass = false;
let _salesOverpayBypass = false;
// «المواصلة» at checkout for the customer credit limit (سقف الدين): the very
// next confirmation is the operator's answered warning, so it must not ask twice.
let _salesCreditBypass = false;

function showSalesMarginWarning(violations, context) {
  if (!violations || !violations.length) return false;
  // A live warning that is still on screen must never let a checkout slip
  // underneath it: the checkout replaces it, so the guard still holds.
  if (_salesMarginBusy && context !== 'checkout') return false;
  if (_salesMarginBusy) closeSalesMarginWarning();
  _salesMarginBusy = true;
  const container = document.getElementById('pageContainer') || document.body;
  let overlay = document.getElementById('salesMarginModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'salesMarginModal';
    overlay.style.zIndex = '99992';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeSalesMarginWarning(); });
    container.appendChild(overlay);
  }
  overlay.dataset.context = context === 'checkout' ? 'checkout' : 'live';
  overlay.dataset.violations = JSON.stringify(violations.map(v => v.idx));
  const rows = violations.map(v => `
    <div class="sm-row">
      <div class="sm-name">${escHtml(v.name)}<span class="sm-kind">${v.kind === 'wholesale' ? t('sales.wholesale') : t('sales.unit')}</span></div>
      <div class="sm-qty" dir="ltr">${Unit.fmtQty(v.qty)}</div>
      <div class="sm-floor">${t('sales.marginMin')}<b dir="ltr">DA${fmtMoney(v.suggestUnit)}</b></div>
    </div>`).join('');
  overlay.innerHTML = `<div class="modal sm-modal">
    <div class="sm-head">
      <i class="fas fa-percent"></i> ${t('sales.marginWarn')}
      <button class="modal-close" type="button" onclick="closeSalesMarginWarning()"><i class="fas fa-times"></i></button>
    </div>
    <div class="sm-list">${rows}</div>
    <div class="sm-foot">
      <button type="button" class="btn btn-secondary" onclick="salesMarginKeepGoing()">${t('sales.marginContinue')}</button>
      <button type="button" class="btn btn-primary" onclick="salesMarginTakeFloors()">${t('sales.marginAccept')}</button>
    </div>
  </div>`;
  overlay.style.display = 'flex';
  return true;
}

// Called after a cart edit: the cashier is told about the floor the moment the
// number he typed breaks it, not only when the invoice is already assembled.
function salesMarginLiveCheck() {
  if (_salesSupMode || _salesMarginBusy) return false;
  if (!salesMarginEnabled()) return false;
  const discs = _salesMarginInvoiceDiscs();
  return showSalesMarginWarning(salesMarginScan(discs.custPct, discs.extra), 'live');
}

function closeSalesMarginWarning() {
  _salesMarginBusy = false;
  const overlay = document.getElementById('salesMarginModal');
  if (overlay) overlay.style.display = 'none';
}

// «المواصلة» — السماح بتسجيل مبلغ مدفوع أكبر من الإجمالي (زبون غير مسجل / شراء
// بدون مورد). «إلغاء» يعرض رسالة «لا يمكن تجاوز المبلغ الإجمالي».
function showSalesOverpayWarning(total, paid) {
  const container = document.getElementById('pageContainer') || document.body;
  let overlay = document.getElementById('salesOverpayModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'salesOverpayModal';
    overlay.style.zIndex = '99994';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeSalesOverpayWarning(); });
    container.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="modal sm-modal">
    <div class="sm-head">
      <i class="fas fa-exclamation-triangle"></i> ${t('sales.overpayTitle')}
    </div>
    <div class="sm-list" style="padding:14px;font-size:13px;color:var(--silver-700);line-height:1.7">
      ${t('sales.overpayMsg')}<br><br>
      <div dir="ltr" style="text-align:center;font-weight:700;color:var(--bmw-blue-1)">
        ${t('sales.total') || 'Total'}: DA${fmtMoney(total)}
      </div>
    </div>
    <div class="sm-foot">
      <button type="button" class="btn btn-secondary" onclick="salesOverpayCancel()">${t('common.cancel') || 'إلغاء'}</button>
      <button type="button" class="btn btn-primary" onclick="salesOverpayContinue()">${t('sales.overpayContinue')}</button>
    </div>
  </div>`;
  overlay.style.display = 'flex';
  return true;
}

function closeSalesOverpayWarning() {
  const overlay = document.getElementById('salesOverpayModal');
  if (overlay) overlay.style.display = 'none';
}

function salesOverpayCancel() {
  closeSalesOverpayWarning();
  alert(t('sales.paidExceedsTotal'));
}

function salesOverpayContinue() {
  closeSalesOverpayWarning();
  _salesOverpayBypass = true;
  confirmSalesCheckout();
}

// Customer credit limit (سقف الدين) — a sale may not push the customer's
// outstanding balance past the limit configured for him. Shown in the same
// style as the margin / overpay warnings; «المواصلة» spends the bypass on this
// click only.
function showSalesCreditWarning(projectedBalance, limit, total, balanceBefore) {
  const container = document.getElementById('pageContainer') || document.body;
  let overlay = document.getElementById('salesCreditModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'salesCreditModal';
    overlay.style.zIndex = '99994';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) salesCreditCancel(); });
    container.appendChild(overlay);
  }
  // The debt message blocks the sale for a normal cashier. Only a manager gets
  // the extra «مواصلة» answer, and only for this one checkout attempt.
  const canContinue = (typeof Auth !== 'undefined') && typeof Auth.isManager === 'function' && Auth.isManager();
  const continueBtn = canContinue
    ? `<button type="button" class="btn btn-primary" onclick="salesCreditContinue()">${t('sales.creditContinue') || 'مواصلة'}</button>`
    : '';
  overlay.innerHTML = `<div class="modal sm-modal">
    <div class="sm-head">
      <i class="fas fa-triangle-exclamation"></i> ${t('sales.creditBlocked') || t('sales.creditWarn')}
      <button class="modal-close" type="button" onclick="salesCreditCancel()"><i class="fas fa-times"></i></button>
    </div>
    <div class="sm-list" style="padding:14px;font-size:13px;color:var(--silver-700);line-height:1.7">
      <div style="font-size:14px;font-weight:800;color:#b91c1c;line-height:1.9">${t('sales.creditDebtMsg') || 'يجب على هذا العميل دفع الديون السابقة لاستمرار هذه العملية'}</div><br>
      <div dir="ltr" style="text-align:center;font-weight:700;color:var(--bmw-blue-1)">
        ${t('sales.currentBalance') || 'Current balance'}: DA${fmtMoney(balanceBefore || 0)} / ${t('sales.creditLimit')}: DA${fmtMoney(limit)}
      </div>
      <div dir="ltr" style="text-align:center;font-weight:700;color:#b45309">
        ${t('sales.projectedBalance')}: DA${fmtMoney(projectedBalance || 0)} / ${t('sales.creditLimit')}: DA${fmtMoney(limit)}
      </div>
      <div dir="ltr" style="text-align:center;font-size:12px;color:var(--silver-500)">
        ${t('sales.total') || 'Total'}: DA${fmtMoney(total || 0)}
      </div>
    </div>
    <div class="sm-foot">
      <button type="button" class="btn btn-secondary" onclick="salesCreditCancel()">${t('common.cancel') || 'إلغاء'}</button>
      ${continueBtn}
    </div>
  </div>`;
  overlay.style.display = 'flex';
  return true;
}

function closeSalesCreditWarning() {
  const overlay = document.getElementById('salesCreditModal');
  if (overlay) overlay.style.display = 'none';
}

function salesCreditCancel() {
  closeSalesCreditWarning();
}

function salesCreditContinue() {
  // A forged/stale call must never override the limit for a non-manager.
  if (!((typeof Auth !== 'undefined') && typeof Auth.isManager === 'function' && Auth.isManager())) {
    closeSalesCreditWarning();
    alert(t('sales.creditDebtMsg') || 'يجب على هذا العميل دفع الديون السابقة لاستمرار هذه العملية');
    return;
  }
  closeSalesCreditWarning();
  _salesCreditBypass = true;
  confirmSalesCheckout();
}

// «المواصلة» — the operator accepts the hurt margin. Only the checkout path
// writes anything: a live warning dismissed mid-typing is not a sale yet, and
// the same line is checked again when the cashier confirms the invoice.
function salesMarginKeepGoing() {
  const overlay = document.getElementById('salesMarginModal');
  let idxs = [];
  try { idxs = JSON.parse((overlay && overlay.dataset.violations) || '[]'); } catch (e) { idxs = []; }
  closeSalesMarginWarning();
  if (overlay && overlay.dataset.context === 'checkout') {
    const lines = idxs.map(i => {
      const l = _salesCart[i];
      return l ? `${l.name}×${Unit.fmtQty(l.qty)}=${fmtMoney(l.total)}` : '';
    }).filter(Boolean).join(' | ');
    try {
      DB.logAudit({ action: 'marginOverride', entity: 'invoice', detail: `${t('sales.marginWarn')}: ${lines}` });
    } catch (e) {}
    _salesMarginBypass = true;
    confirmSalesCheckout();
  }
}

function salesMarginTakeFloors() {
  const overlay = document.getElementById('salesMarginModal');
  const wasCheckout = overlay && overlay.dataset.context === 'checkout';
  closeSalesMarginWarning();
  const clean = salesMarginAcceptFloors();
  if (wasCheckout && clean) confirmSalesCheckout();
}



/* ============================================================
   MARGIN SETTINGS PANEL (نافذة إعدادات نسبة البيع)

   Guarded by the store password: the percentages decide what the shop
   is allowed to sell at, so a cashier cannot change them even though he
   sees the warning the rule produces. Electron renderer has no prompt(),
   so this is an overlay like the rest of the sales modals.
   ============================================================ */
let _msDraft = null;

async function salesMarginUnlock(password) {
  const stored = (typeof Auth !== 'undefined' && Auth.getStorePassword) ? (Auth.getStorePassword() || '') : '';
  if (stored) return String(password) === String(stored);
  // A remembered session keeps no copy of the password: fall back to the same
  // offline hash the login screen verifies with.
  if (typeof Auth !== 'undefined' && typeof Auth.verifyLocalPassword === 'function' && typeof Auth.getUserCode === 'function') {
    try { return await Auth.verifyLocalPassword(Auth.getUserCode(), password || ''); } catch (e) { return false; }
  }
  return false;
}

function openSalesMarginSettings() {
  const container = document.getElementById('pageContainer') || document.body;
  let overlay = document.getElementById('salesMarginCfgModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'salesMarginCfgModal';
    overlay.style.zIndex = '99993';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeSalesMarginSettings(); });
    container.appendChild(overlay);
  }
  _msDraft = null;
  overlay.style.display = 'flex';
  overlay.innerHTML = `<div class="modal ms-modal">
    <div class="qk-head">
      <div class="qk-head-title"><i class="fas fa-percent" style="color:var(--bmw-blue-1)"></i> ${t('sales.marginBtn')}</div>
      <button class="modal-close" type="button" onclick="closeSalesMarginSettings()"><i class="fas fa-times"></i></button>
    </div>
    <div class="ms-lock">
      <label class="ms-label" for="msPass">${t('sales.marginPwd')}</label>
      <input id="msPass" class="form-input" type="password" autocomplete="off" onkeydown="if(event.key==='Enter')salesMarginUnlockDo()">
      <div id="msPassError" style="color:#ff6b6b;font-size:12px;display:none">${t('sales.marginPwdBad')}</div>
      <div class="ms-foot" style="padding:0">
        <button type="button" class="btn btn-primary" onclick="salesMarginUnlockDo()">${t('common.confirm')}</button>
      </div>
    </div>
  </div>`;
  const inp = document.getElementById('msPass');
  if (inp) setTimeout(function () { inp.focus(); }, 0);
}

async function salesMarginUnlockDo() {
  const inp = document.getElementById('msPass');
  const ok = await salesMarginUnlock(inp ? inp.value : '');
  const err = document.getElementById('msPassError');
  if (!ok) { if (err) err.style.display = 'block'; if (inp) inp.select(); return; }
  _msDraft = salesMarginConfig();
  _msRender();
}

function closeSalesMarginSettings() {
  const overlay = document.getElementById('salesMarginCfgModal');
  if (overlay) overlay.style.display = 'none';
  _msDraft = null;
}

// Pickers for the three exception levels. Everything comes from the live
// catalogue, so a rule can never point at a brand or a family that was renamed
// out of existence without showing up as an orphan row here.
function _msCategoryOptions() {
  return (typeof window.getProductFamilies === 'function' ? window.getProductFamilies() : [])
    .map(f => ({ id: String(f).trim().toLowerCase(), label: f }));
}
function _msBrandOptions() {
  const brands = (typeof BRANDS !== 'undefined' && BRANDS) ? [...(BRANDS.global || []), ...(BRANDS.chinese || [])] : [];
  return brands.map(b => ({ id: String(b.id), label: b.name }));
}
function _msProductOptions() {
  const seen = {};
  const out = [];
  for (const g of getSalesGroups()) {
    if (!g.key || seen[g.key]) continue;
    seen[g.key] = 1;
    out.push({ id: _msProductId(g.key), label: g.name + (g.barcode ? ' — ' + g.barcode : '') });
  }
  out.sort((a, b) => String(a.label).localeCompare(String(b.label)));
  return out.slice(0, 800);
}
function _msOptionsFor(scope) {
  if (scope === 'brand') return _msBrandOptions();
  if (scope === 'product') return _msProductOptions();
  return _msCategoryOptions();
}

function _msSelect(options, selectedId, onchange, placeholder) {
  const head = placeholder ? `<option value="">${placeholder}</option>` : '';
  const body = options.map(o =>
    `<option value="${escHtml(o.id)}"${String(o.id) === String(selectedId) ? ' selected' : ''}>${escHtml(o.label)}</option>`).join('');
  const known = options.some(o => String(o.id) === String(selectedId));
  const orphan = !known && selectedId
    ? `<option value="${escHtml(selectedId)}" selected>${escHtml(selectedId)}</option>` : '';
  return `<select class="form-input" onchange="${onchange}">${head}${orphan}${body}</select>`;
}

function _msRuleRow(r, i) {
  const extras = (r && r.extras) || {};
  const extraInputs = salesExtraFields().map(f => {
    const v = extras[f.id];
    return `<input class="form-input ms-input ms-extra-input" type="number" min="0" max="100" step="0.5"
      title="${escHtml(f.name)}" placeholder="${escHtml(f.name)}" style="border-color:${escHtml(f.color)}"
      value="${v == null ? '' : v}" onchange="salesMarginSetPct(${i}, 'extra:${escHtml(f.id)}', this.value)">`;
  }).join('');
  return `<div class="ms-rule">
    ${_msSelect([{ id: 'category', label: t('sales.marginScopeCat') }, { id: 'brand', label: t('sales.marginScopeBrand') }, { id: 'product', label: t('sales.marginScopeProduct') }],
      r.scope, `salesMarginSetRuleScope(${i}, this.value)`, '')}
    ${_msSelect(_msOptionsFor(r.scope), r.id, `salesMarginSetTarget(${i}, this.value)`, t('sales.marginPick'))}
    <span class="ms-pcts">
      <input class="form-input ms-input" type="number" min="0" max="100" step="0.5" placeholder="${t('sales.marginRetail')}"
        value="${r.retail == null ? '' : r.retail}" onchange="salesMarginSetPct(${i}, 'retail', this.value)">
      <input class="form-input ms-input" type="number" min="0" max="100" step="0.5" placeholder="${t('sales.marginWholesale')}"
        value="${r.wholesale == null ? '' : r.wholesale}" onchange="salesMarginSetPct(${i}, 'wholesale', this.value)">
      ${extraInputs}
    </span>
    <button type="button" class="btn btn-secondary ms-del" onclick="salesMarginDropRule(${i})" title="${t('common.delete')}"><i class="fas fa-trash"></i></button>
  </div>`;
}

function _msRender() {
  const overlay = document.getElementById('salesMarginCfgModal');
  if (!overlay || !_msDraft) return;
  const cfg = _msDraft;
  const rows = cfg.rules.map((r, i) => _msRuleRow(r, i)).join('');
  overlay.innerHTML = `<div class="modal ms-modal">
    <div class="qk-head">
      <div class="qk-head-title"><i class="fas fa-percent" style="color:var(--bmw-blue-1)"></i> ${t('sales.marginTitle')}</div>
      <button class="modal-close" type="button" onclick="closeSalesMarginSettings()"><i class="fas fa-times"></i></button>
    </div>
    <div class="ms-form">
      <label class="ms-row"><input type="checkbox" id="msEnabled" ${cfg.enabled ? 'checked' : ''} onchange="salesMarginSetEnabled(this.checked)"> ${t('sales.marginEnabled')}</label>
      <div class="ms-row">
        <span class="ms-label">${t('sales.marginStore')}</span>
        <input class="form-input ms-input" type="number" min="0" max="100" step="0.5" placeholder="${t('sales.marginNone')}"
          value="${cfg.store.retail == null ? '' : cfg.store.retail}" onchange="salesMarginSetStore('retail', this.value)" title="${t('sales.marginRetail')}">
        <input class="form-input ms-input" type="number" min="0" max="100" step="0.5" placeholder="${t('sales.marginNone')}"
          value="${cfg.store.wholesale == null ? '' : cfg.store.wholesale}" onchange="salesMarginSetStore('wholesale', this.value)" title="${t('sales.marginWholesale')}">
      </div>
      ${salesExtraFields().map(f => `<div class="ms-row">
        <span class="ms-label" style="color:${escHtml(f.color)}"><i class="fas fa-tag"></i> ${escHtml(f.name)}</span>
        <input class="form-input ms-input" type="number" min="0" max="100" step="0.5" placeholder="${t('sales.marginNone')}"
          style="border-color:${escHtml(f.color)}"
          value="${(cfg.store.extras && cfg.store.extras[f.id] != null) ? cfg.store.extras[f.id] : ''}"
          onchange="salesMarginSetStore('extra:${escHtml(f.id)}', this.value)" title="${escHtml(f.name)}">
      </div>`).join('')}
      <div class="ms-hint">${t('sales.marginRetail')} / ${t('sales.marginWholesale')} — ${t('sales.marginHint')}</div>
      <div class="ms-row"><span class="ms-label">${t('sales.marginRules')}</span>
        <button type="button" class="btn btn-secondary" onclick="salesMarginAddRule()"><i class="fas fa-plus"></i> ${t('sales.marginAdd')}</button>
      </div>
      ${cfg.rules.length
        ? `<div class="ms-rule-head"><span>${t('sales.marginScopeCat')} / ${t('sales.marginScopeBrand')} / ${t('sales.marginScopeProduct')}</span><span>${t('sales.marginPick')}</span><span>${t('sales.marginRetail')} / ${t('sales.marginWholesale')}</span><span></span></div>
           <div style="display:flex;flex-direction:column;gap:6px">${rows}</div>`
        : `<div class="ms-hint">${t('sales.marginNone')}</div>`}
    </div>
    <div class="sm-foot">
      <button type="button" class="btn btn-secondary" onclick="closeSalesMarginSettings()">${t('common.cancel')}</button>
      <button type="button" class="btn btn-primary" onclick="salesMarginSave()">${t('common.save')}</button>
    </div>
  </div>`;
}

function salesMarginSetEnabled(v) { if (_msDraft) _msDraft.enabled = !!v; }
function salesMarginSetStore(field, v) {
  if (!_msDraft) return;
  const n = v === '' ? null : Number(v);
  const clean = (isFinite(n) && n >= 0 && n <= 100) ? n : null;
  if (String(field).indexOf('extra:') === 0) {
    if (!_msDraft.store.extras) _msDraft.store.extras = {};
    const id = String(field).slice(6);
    if (clean == null) delete _msDraft.store.extras[id];
    else _msDraft.store.extras[id] = clean;
    return;
  }
  _msDraft.store[field] = clean;
}
function salesMarginAddRule() {
  if (!_msDraft) return;
  _msDraft.rules.push({ scope: 'category', id: '', label: '', retail: null, wholesale: null, extras: {} });
  _msRender();
}
// Switching a rule to another level retargets it: a brand id is meaningless as
// a product key, so the row keeps a valid selection instead of an orphan rule.
function salesMarginSetRuleScope(i, scope) {
  const r = _msDraft && _msDraft.rules[i];
  if (!r) return;
  r.scope = scope === 'brand' || scope === 'product' ? scope : 'category';
  const opts = _msOptionsFor(r.scope);
  r.id = opts.length ? opts[0].id : '';
  r.label = opts.length ? opts[0].label : '';
  _msRender();
}
function salesMarginSetTarget(i, id) {
  const r = _msDraft && _msDraft.rules[i];
  if (!r) return;
  const hit = _msOptionsFor(r.scope).find(o => o.id === id);
  r.id = String(id);
  r.label = hit ? hit.label : '';
  _msRender();
}
function salesMarginSetPct(i, field, v) {
  const r = _msDraft && _msDraft.rules[i];
  if (!r) return;
  const n = v === '' ? null : Number(v);
  const clean = (isFinite(n) && n >= 0 && n <= 100) ? n : null;
  if (String(field).indexOf('extra:') === 0) {
    if (!r.extras) r.extras = {};
    const id = String(field).slice(6);
    if (clean == null) delete r.extras[id];
    else r.extras[id] = clean;
    return;
  }
  r[field] = clean;
}
function salesMarginDropRule(i) {
  if (!_msDraft) return;
  _msDraft.rules.splice(i, 1);
  _msRender();
}

function salesMarginSave() {
  if (!_msDraft) return;
  const cleanExtras = (map) => {
    const out = {};
    Object.keys(map || {}).forEach(id => {
      const n = Number(map[id]);
      if (isFinite(n) && n >= 0 && n <= 100) out[id] = n;
    });
    return out;
  };
  const clean = {
    enabled: !!_msDraft.enabled,
    store: {
      retail: _msDraft.store.retail,
      wholesale: _msDraft.store.wholesale,
      extras: cleanExtras(_msDraft.store.extras),
    },
    rules: _msDraft.rules
      .filter(r => r && r.id && (r.retail != null || r.wholesale != null || Object.keys(cleanExtras(r.extras)).length))
      .map(r => ({
        scope: r.scope, id: String(r.id), label: String(r.label || ''),
        retail: r.retail, wholesale: r.wholesale, extras: cleanExtras(r.extras),
      })),
  };
  try {
    DB.setMeta(SALES_MARGIN_META, clean);
    DB.logAudit({ action: 'marginConfig', entity: 'settings', detail: `enabled=${clean.enabled} store=${clean.store.retail}/${clean.store.wholesale} rules=${clean.rules.length}` });
  } catch (e) {
    alert((e && e.message) || String(e));
    return;
  }
  closeSalesMarginSettings();
  // The renderer ships no toast helper, and Electron has no window.prompt either.
  alert(t('sales.marginSaved'));
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
      ? t('expiry.expiresToday')
      : t('expiry.overdue') + ' ' + Math.abs(expiredDays) + ' ' + t('expiry.days');
    return '<span class="exp-chip exp-chip-expired" title="' + escHtml(expiredDate || '') + '"><i class="fas fa-ban"></i> ' + escHtml(label) + '</span>';
  }
  if (expiringDays !== null) {
    return '<span class="exp-chip exp-chip-expiring"><i class="fas fa-hourglass-half"></i> ' + t('expiry.inDays') + ' ' + expiringDays + ' ' + t('expiry.days') + '</span>';
  }
  if (hasDate) {
    return '<span class="exp-chip exp-chip-ok"><i class="fas fa-check-circle"></i> ' + t('expiry.sumOk') + '</span>';
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
  if (isFreeSalesKey(key || line.key)) {
    // An unlisted line has no batches to allocate against: price × qty, full
    // stop. The same override and per-line discount rules still apply.
    const qty = Unit.roundQty(Number(line.qty) || 0);
    const manual = line.manualPrice != null && !isNaN(line.manualPrice);
    const price = Math.max(salesLineMinPrice(line), 0, Number(manual ? line.manualPrice : line.price) || 0);
    line.entries = qty > 0
      ? [{ productId: null, name: line.name, barcode: '', qty: qty, price: price, total: price * qty }]
      : [];
    line.blockedExpired = 0;
    line.shortQty = 0;
    line.baseTotal = price * qty;
    line.price = price;
    line.total = line.baseTotal - Math.max(0, Math.min(line.discount || 0, line.baseTotal));
    return;
  }
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
  let remaining = Unit.roundQty(line.qty);
  let latestPrice = 0;
  const pharm = salesPharmacyOn();
  let blockedExpired = 0;
  for (const r of g.records) {
    if (remaining <= 0) break;
    // Pharmacy: expired batches can never be sold, whatever their qty.
    if (pharm && !isFixedRecord(r) && (r.quantity || 0) > 0 && salesExpiryClass(r) === 'expired') {
      blockedExpired += (r.quantity || 0);
      continue;
    }
    if (r.isBundle) {
      const mx = bundleMaxSellable(r);
      if (mx <= 0) continue;
      if (remaining > mx) remaining = mx;
    }
    const take = Unit.roundQty(isFixedRecord(r) || r.isBundle ? remaining : Math.min(r.quantity || 0, remaining));
    if (take > 0) {
      const price = Math.max(salesLineMinPrice(line), salesPriceForRecord(r, line.mode));
      entries.push({ productId: r.id, qty: take, price, total: take * price });
      latestPrice = price;
      remaining = Unit.roundQty(remaining - take);
    }
  }
  // Surface to the UI how much expired stock was skipped / could not be filled.
  line.blockedExpired = blockedExpired;
  line.shortQty = Math.max(0, Unit.roundQty(remaining));
  // Apply a manual per-line unit price override (kept across re-allocation)
  if (line.manualPrice != null && !isNaN(line.manualPrice)) {
    const minPrice = salesLineMinPrice(line);
    const mp = Math.max(minPrice, 0, line.manualPrice);
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
    brands: _salesAllBrands(),
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
  const minFloorVisible = salesGroupMinPrice(g) > 0;
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
          ${(typeof ProductQR !== 'undefined' ? ProductQR.htmlOf(rep) : '')}
          ${multi ? `<span class="prod-meta"><i class="fas fa-layer-group"></i> ${g.records.length} ${t('sales.multiBatches')}</span>` : ''}
        </div>
      </div>
      <span class="prod-card-badge ${qtyBadge}" ${fixed ? `title="${t('sales.unlimited')}"` : ''}>${fixed ? '\u221E' : Unit.fmtQty(totalQty)} ${fixed ? '' : t('inventory.col4')}</span>
    </div>
    ${chips}
    ${expiredNote}
    <div class="prod-card-fields">
      <div class="prod-field full"><span class="prod-field-label"><i class="fas fa-hashtag"></i> ${t('quickEntry.reference')}</span><span class="prod-field-value">${referenceCellHTML(rep.reference)}</span></div>
      <div class="prod-field full"><span class="prod-field-label"><i class="fas fa-globe"></i> ${t('quickEntry.countryOfOrigin')}</span><span class="prod-field-value">${escHtml(rep.countryOfOrigin || '-')}</span></div>
      <div class="prod-field"><span class="prod-field-label"><i class="fas fa-warehouse"></i> ${t('quickEntry.storageLocation')}</span><span class="prod-field-value">${escHtml(rep.storageLocation || '-')}</span></div>
      <div class="prod-field"><span class="prod-field-label"><i class="fas fa-trademark"></i> ${t('inventory.col3')}</span><span class="prod-field-value">${escHtml(brand ? brand.name : (rep.brandId || '-'))}</span></div>
    </div>
    <div class="prod-card-pricerow ${(wholeVisible || minFloorVisible) ? '' : 'single'}">
      <div class="price-pill price-unit"><span>${t('inventory.col6')}${rep ? ' / ' + Unit.esc(Unit.label(rep)) : ''}</span><b>DA${fmtMoney(price)}</b></div>
      ${wholeVisible ? `<div class="price-pill price-whole"><span>${t('quickEntry.wholesalePrice')}</span><b>DA${fmtMoney(whole)}</b></div>` : ''}
      ${salesExtraPillsHTML(rep)}
      ${salesMinPriceBadge(g, false)}
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
  if (!grid || !grid.isConnected) {
    // Never fail silently: a missing container used to blank the whole page.
    console.error('[sales] #salesProductGrid is missing from sales.html');
    return;
  }

  // Drop a brand that was removed from favourites (or deleted) meanwhile.
  if (_salesFavBrandActive && _salesFavBrandIds().indexOf(String(_salesFavBrandActive)) === -1) {
    _salesFavBrandActive = null;
  }
  _syncSalesFavBrandsBtn();

  const q = _salesSearchQuery;
  const hiding = _salesHideUntilSearch && (!q || q.trim().length < 2);
  // Groups are also needed (for counts only) when the strip is visible while
  // hide-until-search is active; that is the only time we build them anyway.
  const needGroups = !hiding || _salesFavBrandsOn || !!_salesFavBrandActive;
  let groups = [];
  if (needGroups) {
    if (q && q.trim().length >= 2) {
      // Smart multi-word search: every word must match name or barcode, ranked by
      // match quality, out-of-stock pushed to the bottom, and capped at 200 so a
      // huge result set is bounded (the grid itself is also windowed).
      groups = _searchSalesGroups(getSalesGroups(), q, 200);
    } else {
      groups = getSalesGroups();
      // Stable sort: out-of-stock products sink to the bottom, everything else keeps its order
      groups.sort((a, b) => (salesGroupOutOfStockCached(a) ? 1 : 0) - (salesGroupOutOfStockCached(b) ? 1 : 0));
    }
  }
  _salesGroupList = groups;

  // Partition: the active favourite brand gets its own section on top, the rest
  // stays in the main grid under «بقية المنتجات». Absolute indices are kept so
  // every card action still targets the right group.
  const activeId = _salesFavBrandActive ? String(_salesFavBrandActive) : null;
  const mainItems = [];
  const favItems = [];
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (activeId && _salesGroupBrandId(g) === activeId) favItems.push({ g, idx: i });
    else mainItems.push({ g, idx: i });
  }
  _salesFavGroups = activeId ? favItems : [];
  _salesMainGroups = hiding ? [] : mainItems;

  _salesRenderedCount = 0;
  _salesStart = 0;
  _salesGridLoadingMore = false;
  _salesFavRendered = 0;

  _renderSalesFavStrip(groups);
  _renderSalesFavActive();

  const restLabel = document.getElementById('salesFavRestLabel');
  const restCount = document.getElementById('salesFavRestCount');
  const showRest = !hiding && !!activeId && _salesMainGroups.length > 0;
  if (restLabel) restLabel.style.display = showRest ? 'flex' : 'none';
  if (restCount) restCount.textContent = showRest ? `${_salesMainGroups.length} ${t('common.product')}` : '';

  const count = document.getElementById('salesProdCount');
  if (count) count.textContent = `${groups.length} ${t('common.product')}`;

  grid.innerHTML = '';
  if (_salesMainGroups.length === 0) {
    grid.innerHTML = `<div class="sales-grid-empty">
      <i class="fas ${hiding ? 'fa-search' : (activeId ? 'fa-star' : 'fa-box-open')}"></i>
      <p>${hiding
        ? t('inventory.hiddenUntilSearch')
        : (activeId
          ? t('sales.favBrandsNoRest')
          : (q ? t('sales.emptyResults') : t('sales.emptyProducts')))}</p>
    </div>`;
    return;
  }

  const renderNextPage = () => {
    // Must be cleared FIRST: loadMoreSalesProducts refuses to run while a frame
    // is pending, and nothing ever reset this handle, which silently disabled
    // the infinite scroll (the grid froze at the first page forever).
    _salesRenderRAF = null;
    if (!grid || !grid.isConnected) return;
    if (_salesRenderedCount >= _salesMainGroups.length) return;
    const from = _salesRenderedCount;
    const to = Math.min(from + SALES_GRID_PAGE_SIZE, _salesMainGroups.length);
    let html = '';
    for (let i = from; i < to; i++) html += _salesItemHTML(_salesMainGroups[i]);
    _salesRenderedCount = to;
    grid.insertAdjacentHTML('beforeend', html);
    _trimSalesGrid();
  };
  _salesRenderRAF = requestAnimationFrame(renderNextPage);
}

function salesListRowHTML(g, i) {
  const ctx = _salesCardCtx || (_salesCardCtx = _buildSalesCardCtx());
  const fixed = isGroupFixed(g);
  const totalQty = getGroupAvailableQty(g);
  const price = getGroupActivePrice(g);
  const whole = getGroupWholesalePrice(g);
  const buy = getGroupBuyPrice(g);
  const showBuy = salesBuyPriceVisible();
  const buyLabel = t('quickEntry.buyPrice');
  const outOfStock = !fixed && totalQty <= 0;
  const multi = g.records.length > 1;
  const rep = groupViableRecords(g)[0] || g.records[0] || {};
  const brands = ctx.brands;
  const brand = brands.find(b => b.id === rep.brandId);
  const unitName = rep.unit ? Unit.name(rep.unit) : Unit.name('piece');
  const unitLabel = rep.unit === 'custom' ? (rep.unitLabel || unitName) : unitName;
  const allCols = !!_salesListAllCols;
  const extraCells = allCols
    ? `<div class="sales-list-row-cell">${multi ? g.records.length : 1}</div>
       <div class="sales-list-row-cell">${showBuy ? (buy ? 'DA' + fmtMoney(buy) : '-') : '••••'}</div>
       <div class="sales-list-row-cell">${escHtml(rep.reference || '-')}</div>
       <div class="sales-list-row-cell">${escHtml(rep.countryOfOrigin || '-')}</div>`
    : '';
  // The reference and every selling price are now visible on the row itself.
  // The expandable details keep only the remaining information — no duplicate
  // reference / price lines that could drift out of sync with the visible ones.
  const extraDetails = allCols ? '' : `
      ${multi ? `<span><b>${t('sales.multiBatches')}:</b> ${g.records.length}</span>` : ''}
      ${showBuy ? (buy ? `<span><b>${buyLabel}:</b> DA${fmtMoney(buy)}</span>` : '') : `<span><b>${buyLabel}:</b> ••••</span>`}
      <span><b>${t('quickEntry.countryOfOrigin')}:</b> ${escHtml(rep.countryOfOrigin || '-')}</span>`;
  // Keep the exact per-field colours produced by ExtraPrices.pillHTML — only
  // the layout is compacted by the .sales-list-extra CSS below.
  const listPrices = `
      <div class="sales-list-row-prices">
        <span class="sales-list-price unit"><b>DA${fmtMoney(price)}</b><span class="sales-list-price-kind">${Unit.esc(unitLabel)}</span></span>
        <span class="sales-list-price whole"><b>${whole > 0 ? 'DA' + fmtMoney(whole) : '-'}</b><span class="sales-list-price-kind">${escHtml(t('sales.wholesale'))}</span></span>
        ${salesExtraPillsHTML(rep, 'sales-list-extra')}
        ${salesMinPriceBadge(g, true)}
      </div>`;
  return `<div class="sales-list-row ${outOfStock ? 'oos' : ''}" onclick="${outOfStock ? '' : `addSalesGroupToCart(${i})`}" data-idx="${i}">
    <div class="sales-list-row-name">${escHtml(g.name)}${rep.reference ? ` <span class="sales-list-ref">${referenceCellHTML(rep.reference)}</span>` : ''}${unitLabel && unitLabel !== Unit.name('piece') ? ` <span class="sc-unit-badge">${Unit.esc(unitLabel)}</span>` : ''}</div>
    <div class="sales-list-row-body">
      ${listPrices}
      <div class="sales-list-row-meta">${escHtml(g.barcode || '-')} • ${escHtml(rep.mark || '-')} • ${escHtml(brand ? brand.name : (rep.brandId || '-'))}</div>
      ${extraCells}
      <div class="sales-list-row-cell">${fixed ? '∞' : Unit.fmtQty(totalQty)}</div>
      <div class="sales-list-row-actions">
        ${outOfStock ? '' : `<button type="button" class="sales-list-row-add" onclick="event.stopPropagation();addSalesGroupToCart(${i})"><i class="fas fa-plus"></i></button>`}
        ${hasSalesSubstitutes(g) ? `<button type="button" class="btn btn-sm" onclick="event.stopPropagation();openSalesSubstitutes(${i})"><i class="fas fa-pills"></i> ${t('sales.findSubstitute')}</button>` : ''}
        <button type="button" class="sales-list-row-chevron" onclick="event.stopPropagation();toggleSalesListDetails(this)" title="${t('salesDense.details')}"><i class="fas fa-chevron-down"></i></button>
      </div>
    </div>
    <div class="sales-list-row-details">
      ${extraDetails}
      <span><b>${t('quickEntry.storageLocation')}:</b> ${escHtml(rep.storageLocation || '-')}</span>
      <span><b>${t('units.label')}:</b> ${escHtml(unitLabel)}</span>
      ${rep.family ? `<span><b>${t('quickEntry.family')}:</b> ${escHtml(rep.family)}</span>` : ''}
    </div>
  </div>`;
}

function toggleSalesListDetails(btn) {
  const row = btn.closest('.sales-list-row');
  if (!row) return;
  row.classList.toggle('open');
  const icon = btn.querySelector('i');
  if (icon) icon.classList.toggle('fa-chevron-down');
  if (icon) icon.classList.toggle('fa-chevron-up');
}

let _salesSearchTimer = null;
function _cancelSalesSearch() {
  if (_salesSearchTimer) { clearTimeout(_salesSearchTimer); _salesSearchTimer = null; }
}
function filterSalesProducts(q) {
  _cancelSalesSearch();
  _salesSearchTimer = setTimeout(function () {
    _salesSearchTimer = null;
    renderSalesProducts(q);
    if (q && String(q).trim().length >= 2) { try { DB.logSearch({ query: q, context: 'sales-products' }); } catch (e) {} }
  }, 200);
}

function _applySalesGridModeTo(el) {
  if (!el) return;
  el.classList.toggle('sales-list-view', _salesViewMode === 'list');
  el.classList.toggle('all-cols', !!_salesListAllCols);
}

function _syncSalesViewUI() {
  const g = document.getElementById('salesProductGrid');
  const gb = document.getElementById('salesViewGridBtn');
  const lb = document.getElementById('salesViewListBtn');
  const ac = document.getElementById('salesListAllCols');
  _applySalesGridModeTo(g);
  _applySalesGridModeTo(document.getElementById('salesFavActiveGrid'));
  if (gb) gb.classList.toggle('active', _salesViewMode === 'grid');
  if (lb) lb.classList.toggle('active', _salesViewMode === 'list');
  if (ac) ac.checked = !!_salesListAllCols;
  const st = document.getElementById('salesInCartToggleBtn');
  if (st) st.classList.toggle('active', _salesInCartStrip);
  const strip = document.getElementById('salesInCartStrip');
  if (strip) strip.classList.toggle('show', _salesInCartStrip && _salesCart && _salesCart.length > 0);
}

function _syncSalesHideBtn() {
  const btn = document.getElementById('salesHideUntilSearchBtn');
  if (!btn) return;
  if (_salesHideUntilSearch) {
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    btn.title = t('inventory.showOnlyProducts');
  } else {
    btn.classList.remove('active');
    btn.setAttribute('aria-pressed', 'false');
    btn.title = t('inventory.hideUntilSearch');
  }
}

function toggleSalesHideUntilSearch() {
  _salesHideUntilSearch = !_salesHideUntilSearch;
  try { localStorage.setItem('zmt_sales_hide_until_search', _salesHideUntilSearch ? '1' : '0'); } catch (e) {}
  _syncSalesHideBtn();
  if (_salesHideUntilSearch) {
    const input = document.getElementById('salesBarcodeScan');
    if (input) setTimeout(function () { input.focus(); }, 60);
  }
  renderSalesProducts();
}

function setSalesView(mode) {
  _salesViewMode = (mode === 'list') ? 'list' : 'grid';
  try { localStorage.setItem('zmt_sales_view_mode', _salesViewMode); } catch (e) {}
  const g = document.getElementById('salesProductGrid');
  const gb = document.getElementById('salesViewGridBtn');
  const lb = document.getElementById('salesViewListBtn');
  _applySalesGridModeTo(g);
  _applySalesGridModeTo(document.getElementById('salesFavActiveGrid'));
  if (gb) gb.classList.toggle('active', _salesViewMode === 'grid');
  if (lb) lb.classList.toggle('active', _salesViewMode === 'list');
  // Re-render to reflect view mode
  try { invalidateSalesGroupsCache(); } catch (e) {}
  renderSalesProducts();
}

function toggleSalesListAllCols(on) {
  _salesListAllCols = !!on;
  try { localStorage.setItem('zmt_sales_list_allcols', _salesListAllCols ? '1' : '0'); } catch (e) {}
  const g = document.getElementById('salesProductGrid');
  if (g) g.classList.toggle('all-cols', _salesListAllCols);
  renderSalesProducts();
}

function toggleSalesInCartStrip() {
  _salesInCartStrip = !_salesInCartStrip;
  try { localStorage.setItem('zmt_sales_incart_strip', _salesInCartStrip ? '1' : '0'); } catch (e) {}
  const btn = document.getElementById('salesInCartToggleBtn');
  if (btn) btn.classList.toggle('active', _salesInCartStrip);
  const strip = document.getElementById('salesInCartStrip');
  if (strip) strip.classList.toggle('show', _salesInCartStrip && _salesCart.length > 0);
  renderSalesInCartStrip();
}

function renderSalesInCartStrip() {
  const strip = document.getElementById('salesInCartStrip');
  const items = document.getElementById('salesInCartStripItems');
  if (!strip || !items) return;
  if (!_salesInCartStrip || _salesCart.length === 0) {
    strip.classList.remove('show');
    items.innerHTML = '';
    return;
  }
  strip.classList.add('show');
  items.innerHTML = _salesCart.map((line, i) => {
    const name = escHtml(line.name || '');
    const qty = Unit.fmtQty ? Unit.fmtQty(line.qty) : line.qty;
    return `<span class="sales-in-cart-chip"><span>${name}</span> <span class="sales-in-cart-chip-qty">${qty}</span> <button class="sales-in-cart-chip-remove" onclick="event.stopPropagation();removeFromSalesCart(${i});"><i class="fas fa-times"></i></button></span>`;
  }).join('');
}

function applySalesCartWidth(w, persist) {
  let n = parseInt(w, 10);
  if (!isFinite(n)) n = 420;
  if (n < 300) n = 300;
  if (n > 700) n = 700;
  _salesCartWidth = n;
  const right = document.getElementById('salesRight');
  const layout = document.querySelector('.sales-layout');
  if (right) {
    right.style.width = n + 'px';
    right.style.flex = '0 0 ' + n + 'px';
  }
  if (layout && window.innerWidth > 1100) {
    layout.style.gridTemplateColumns = '1fr ' + n + 'px';
  } else if (layout) {
    layout.style.gridTemplateColumns = '';
  }
  if (persist) {
    try { localStorage.setItem('zmt_sales_cart_width', String(n)); } catch (e) {}
  }
  return n;
}

function initSalesCartWidth() {
  const right = document.getElementById('salesRight');
  const layout = document.querySelector('.sales-layout');
  const resizer = document.getElementById('salesCartResizer');
  if (!right || !layout) return;
  // The display-settings slider is the single source of truth when present;
  // the legacy localStorage key keeps older installs working.
  let startW = _salesCartWidth;
  try {
    if (window.DisplaySettings && typeof window.DisplaySettings.current === 'function') {
      const cur = window.DisplaySettings.current();
      if (cur && typeof cur.salesCart === 'number') startW = cur.salesCart;
    }
  } catch (e) {}
  applySalesCartWidth(startW, false);
  if (resizer) {
    resizer.onmousedown = function (e) {
      _salesCartDragging = true;
      resizer.classList.add('active');
      document.body.style.cursor = 'col-resize';
      e.preventDefault();
    };
  }
  if (!document._salesCartResizeBound) {
    document._salesCartResizeBound = true;
    document.addEventListener('mousemove', function (e) {
      if (!_salesCartDragging) return;
      const layoutEl = document.querySelector('.sales-layout');
      if (!layoutEl) return;
      const rect = layoutEl.getBoundingClientRect();
      applySalesCartWidth(rect.right - e.clientX, false);
    });
    document.addEventListener('mouseup', function () {
      if (!_salesCartDragging) return;
      _salesCartDragging = false;
      const resizerEl = document.getElementById('salesCartResizer');
      if (resizerEl) resizerEl.classList.remove('active');
      document.body.style.cursor = '';
      applySalesCartWidth(_salesCartWidth, true);
      try {
        if (window.DisplaySettings && typeof window.DisplaySettings.setLive === 'function') {
          window.DisplaySettings.setLive('salesCart', _salesCartWidth);
        }
      } catch (e) {}
    });
  }
}

// ===== BARCODE SCANNER =====

function setupSalesBarcode() {
  const input = document.getElementById('salesBarcodeScan');
  if (!input) return;
  // Replace the node so a re-entry into the page never stacks handlers.
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  newInput.addEventListener('keydown', handleSalesBarcodeScan);
  // This field is both the scanner and the smart name search: typing filters
  // the grid, Enter does the real lookup (scale -> barcode -> unique name).
  newInput.addEventListener('input', function () {
    const st = document.getElementById('salesBarcodeStatus');
    if (st && st.textContent !== '...') { st.textContent = t('sales.scannerReady'); st.style.color = '#888'; }
    filterSalesProducts(this.value);
  });
  newInput.focus();
}

// A scan is authoritative; a name is only sold automatically when exactly one
// product matches. The raw query is searched (never the layout-cleaned one) so
// Arabic names are not mangled by the barcode keyboard map.
function _salesScanNameMatches(query) {
  const q = normSearch(query);
  if (!q || q.length < 2) return [];
  return _searchSalesGroups(getSalesGroups(), q, 20);
}

function handleSalesBarcodeScan(e) {
  if (!e || e.key !== 'Enter') return;
  e.preventDefault();
  // A phone scan must never add a line behind an open dialog.
  if (salesAnyOverlayOpen()) return;

  const input = document.getElementById('salesBarcodeScan');
  if (!input) return;
  const raw = String(input.value || '').trim();
  if (!raw) return;

  // This Enter is a lookup, not a live search: drop the pending filter paint so
  // the cleared field is not filtered by the code we just sold.
  _cancelSalesSearch();

  const beam = document.getElementById('salesScannerBeam');
  if (beam) beam.classList.add('active');

  const statusEl = document.getElementById('salesBarcodeStatus');
  const setStatus = function (txt, color) {
    if (!statusEl) return;
    statusEl.textContent = txt;
    statusEl.style.color = color;
  };
  setStatus('...', '#0066B1');

  const cleaned = cleanScannedCode(raw);

  // A label off the counter scale is read before the shelf is asked: its money,
  // not a price list, is what the customer is charged.
  const scaleHit = cleaned ? salesScaleLookup(cleaned) : null;
  if (scaleHit) {
    salesScaleHandle(scaleHit);
  } else {
    let scanned = cleaned ? DB.getProductByBarcode(cleaned) : null;
    let scannedBundle = null;
    // Bundles carry their own printed barcode and are sold exactly like a
    // product. Products are checked first (historical behaviour), then the
    // bundle index so an old label never becomes unreachable.
    if (!scanned && cleaned && typeof DB.getBundleByBarcode === 'function') {
      scannedBundle = DB.getBundleByBarcode(cleaned);
      if (scannedBundle) scanned = scannedBundle;
    }
    if (scanned) {
      const gKey = salesGroupKey(scanned);
      let g = getSalesGroupByKey(gKey);
      // A bundle created or edited after the till snapshot must still resolve.
      if (!g && scannedBundle && typeof salesAllProducts === 'function') {
        _salesProducts = salesAllProducts();
        invalidateSalesGroupsCache();
        g = getSalesGroupByKey(gKey);
      }
      const available = g ? !isGroupOutOfStock(g) : (scanned.fixed === true || (scanned.quantity || 0) > 0);
      if (!available) {
        // Pharmacy: expired batch blocks the sale — tell the cashier exactly why.
        const expired = g && salesPharmacyOn() && hasExpiredBatches(g);
        setStatus(expired ? t('sales.scannerExpired') : t('sales.unavailable'), '#dc3545');
        input.value = '';
        renderSalesProducts('');
        if (beam) setTimeout(() => beam.classList.remove('active'), 400);
        return;
      }
      addSalesLine(gKey);
      setStatus(t('sales.scannerDone'), '#28a745');
    } else {
      const numeric = /^[0-9]+$/.test(cleaned || '');
      const matches = numeric ? [] : _salesScanNameMatches(raw);
      if (matches.length === 1) {
        const g = matches[0];
        if (isGroupOutOfStock(g)) {
          const expired = salesPharmacyOn() && hasExpiredBatches(g);
          setStatus(expired ? t('sales.scannerExpired') : t('sales.unavailable'), '#dc3545');
          input.value = '';
          renderSalesProducts('');
          if (beam) setTimeout(() => beam.classList.remove('active'), 400);
          return;
        }
        addSalesLine(g.key);
        setStatus(t('sales.scannerDone'), '#28a745');
      } else if (matches.length > 1) {
        // Ambiguous: never guess. Keep the text and show the matches so the
        // cashier chooses the right product from the grid.
        setStatus(t('sales.scannerMultiple'), '#e65100');
        renderSalesProducts(raw);
        if (beam) setTimeout(() => beam.classList.remove('active'), 400);
        return;
      } else {
        setStatus(t('sales.scannerNotFound'), '#e65100');
      }
    }
  }

  input.value = '';
  renderSalesProducts('');
  // Keep focus pinned on the scanner field so consecutive items can be read
  // without re-selecting the field between scans. If a dialog opened (scale
  // label that needs a decision), it keeps the keyboard.
  if (!salesAnyOverlayOpen()) {
    setTimeout(() => {
      const s = document.getElementById('salesBarcodeScan');
      if (s && document.activeElement !== s) s.focus();
    }, 0);
    setTimeout(() => {
      const s = document.getElementById('salesBarcodeStatus');
      if (s) { s.textContent = t('sales.scannerReady'); s.style.color = '#888'; }
    }, 2000);
  }
  if (beam) setTimeout(() => beam.classList.remove('active'), 400);
}

// ===== WEIGHT-SCALE LABELS AT THE REGISTER =====
/* ============================================================
   A counter scale prints its own in-store code: a prefix, the product's PLU
   and one of weight / unit price / amount. Where those digits sit is decided
   per shop in «إعدادات الميزان» on the inventory page, so the register serves
   every machine instead of one.

   The owner rule the whole path is built on: the money printed on the label
   is the truth. When the label carries an amount the line total IS that
   amount and the quantity is derived from it; when it carries only a weight
   the quantity IS that weight and the price comes from the product card.

   A weighed article's card is «غير محدود», so no shelf stock moves — the
   sale engine skips the deduction for a fixed record.

   A LAN sub device never reads labels: only the till that owns the machine
   has its patterns, and a second device inventing weighed lines would put
   money in the shop's reports that no scale ever printed.
   ============================================================ */

function salesScaleConfig() {
  if (typeof ScaleCore === 'undefined' || !ScaleCore) return null;
  let raw = null;
  try { raw = DB.getMeta(ScaleCore.META_KEY); } catch (e) { return null; }
  const cfg = ScaleCore.configFromMeta(raw);
  return (cfg && cfg.enabled) ? cfg : null;
}

function salesScaleSubDevice() {
  try { return localStorage.getItem('zmt_lan_role') === 'sub'; } catch (e) { return false; }
}

// The price the register would have charged for one unit of that card, in the
// mode the cashier is currently selling in (piece / wholesale / extra field).
function salesScaleCardPrice(p) {
  if (!p) return 0;
  const g = getSalesGroupByKey(salesGroupKey(p));
  const r = g ? (groupViableRecords(g)[0] || g.records[0]) : p;
  return Math.max(0, Number(salesPriceForRecord(r, _salesDefaultMode)) || 0);
}

// code -> what the label carries, which card it belongs to and what it costs.
// `res` is null when no quantity is on the label and none can be derived yet;
// the dialog then asks the cashier for the weight.
function salesScaleLookup(code) {
  const cfg = salesScaleConfig();
  if (!cfg || salesScaleSubDevice()) return null;
  const decoded = ScaleCore.decode(code, cfg);
  if (!decoded || !decoded.code) return null;
  const prod = decoded.plu ? DB.getProductByPlu(decoded.plu) : null;
  const card = salesScaleCardPrice(prod);
  return { decoded: decoded, prod: prod, card: card, res: ScaleCore.resolve(decoded, card) };
}

var _scaleScan = null;
var _scaleHits = [];

function salesScaleStatus(msg, color) {
  const st = document.getElementById('salesBarcodeStatus');
  if (st) { st.textContent = msg; st.style.color = color; }
}

function salesScaleHandle(hit) {
  if (hit.res && hit.prod) {
    const line = salesAddWeighedLine(hit.prod, hit.res, hit.decoded);
    salesScaleStatus(line ? t('sales.scannerDone') : t('sales.unavailable'), line ? '#28a745' : '#dc3545');
    return;
  }
  openSalesScaleModal(hit);
  salesScaleStatus(hit.res ? t('sales.scaleUnknownPlu') : t('sales.scaleNeedQty'), '#e65100');
}

// Labels of the same article land on one cart line: the weight adds up and so
// does the money the labels printed, so two tickets of 0.250 @ 40 DA give
// exactly 0.500 and 80.00 DA — never a rounded average price.
function salesAddWeighedLine(prod, res, decoded) {
  const g = getSalesGroupByKey(salesGroupKey(prod));
  if (!g || isGroupOutOfStock(g)) return null;
  let line = _salesCart.find(c => c.key === g.key);
  if (!line) {
    line = { key: g.key, name: g.name, barcode: g.barcode, qty: 0, mode: _salesDefaultMode,
      price: 0, total: 0, baseTotal: 0, manualPrice: null, discount: 0, entries: [], scale: null };
    _salesCart.push(line);
  }
  const prev = line.scale || { amount: 0, count: 0, fromLabel: false };
  const qty = Unit.roundQty((Number(line.qty) || 0) + Number(res.qty || 0));
  const amount = Math.max(0, prev.amount + Number(res.total || 0));
  line.qty = qty;
  line.scale = {
    amount: amount, count: prev.count + 1,
    fromLabel: !!prev.fromLabel || !!res.amountFromLabel,
    // The first label decides how the line's weight is written (0.250); a
    // second one of the same article never changes the article's places.
    decimals: prev.decimals != null ? prev.decimals
      : (res.qtyDecimals != null ? res.qtyDecimals : null),
    plu: (decoded && decoded.plu) || prev.plu || '',
    code: (decoded && decoded.code) || '',
  };
  // The unit price is whatever makes the line total equal the label money.
  line.manualPrice = qty > 0 ? amount / qty : null;
  allocateSalesLine(line, g.key);
  renderSalesCart();
  const empty = document.getElementById('salesEmptyCart');
  if (empty) empty.style.display = 'none';
  return line;
}

function openSalesScaleModal(hit) {
  const m = document.getElementById('salesScaleModal');
  if (!m) return;
  _scaleScan = hit;
  if (!m._host) m._host = m.parentNode;
  if (m.parentNode !== document.body) document.body.appendChild(m);
  const qtyEl = document.getElementById('salesScaleQty');
  const priceEl = document.getElementById('salesScalePrice');
  const searchEl = document.getElementById('salesScaleSearch');
  const resultsEl = document.getElementById('salesScaleResults');
  if (qtyEl) qtyEl.value = '';
  if (priceEl) priceEl.value = '';
  if (searchEl) searchEl.value = '';
  if (resultsEl) resultsEl.innerHTML = '';
  _scaleHits = [];
  m.style.display = 'flex';
  renderSalesScaleModal();
  // Whatever the label left unsaid is the field the cashier has to act on.
  const first = !hit.res ? document.getElementById('salesScaleQty')
    : !hit.prod ? document.getElementById('salesScaleSearch') : null;
  if (first) first.focus();
}

function closeSalesScaleModal() {
  const m = document.getElementById('salesScaleModal');
  if (m) {
    m.style.display = 'none';
    if (m._host && m.parentNode === document.body) m._host.appendChild(m);
  }
  _scaleScan = null;
  _scaleHits = [];
  const scan = document.getElementById('salesBarcodeScan');
  if (scan) scan.focus();
}

function renderSalesScaleModal() {
  const s = _scaleScan;
  if (!s) return;
  const facts = document.getElementById('salesScaleFacts');
  if (facts) facts.innerHTML = salesScaleFactsHTML(s);
  const qtyRow = document.getElementById('salesScaleQtyRow');
  const priceRow = document.getElementById('salesScalePriceRow');
  const linkRow = document.getElementById('salesScaleLinkRow');
  // A label that printed its weight decided the quantity; one that printed the
  // money decided the price. The register never asks twice.
  if (qtyRow) qtyRow.style.display = s.res ? 'none' : '';
  const labelMoney = s.res ? !!s.res.amountFromLabel : s.decoded.amountFromLabel != null;
  if (priceRow) priceRow.style.display = labelMoney ? 'none' : '';
  if (linkRow) linkRow.style.display = s.prod ? 'none' : '';
  const priceEl = document.getElementById('salesScalePrice');
  if (priceEl && !labelMoney && String(priceEl.value).trim() === '') {
    const known = s.res ? s.res.price : (s.decoded.unitPrice != null ? s.decoded.unitPrice : s.card);
    if (known > 0) priceEl.value = known.toFixed(2);
  }
  updateSalesScaleTotal();
}

function salesScaleFactsHTML(s) {
  const d = s.decoded;
  const bits = [];
  bits.push(`${escHtml(t('inventory.plu'))}: <b>${escHtml(d.plu || '-')}</b>`);
  if (d.weight != null) bits.push(`${escHtml(t('scale.colWeight'))}: ${d.weight}`);
  if (d.unitPrice != null) bits.push(`${escHtml(t('scale.colUnitPrice'))}: ${fmtMoney(d.unitPrice)}`);
  if (d.amount != null) bits.push(`${escHtml(t('scale.colAmount'))}: ${fmtMoney(d.amount)}`);
  if (s.prod) bits.push(`<b>${escHtml(s.prod.name)}</b>`);
  bits.push(`<span class="scale-code">${escHtml(d.code)}</span>`);
  return bits.join(' — ');
}

// The numbers the line will take: from the label whenever the label can say
// them, from the cashier for the one thing it could not.
function salesScaleNumbers() {
  const s = _scaleScan;
  if (!s) return null;
  const d = s.decoded;
  const money = d.amountFromLabel != null ? d.amountFromLabel : null;
  // Quantity: the printed weight, or what the cashier typed for it.
  let qty = d.weight != null ? Unit.roundQty(d.weight) : null;
  let decimals = d.weight != null ? d.weightDecimals : null;
  if (qty == null) {
    const raw = String((document.getElementById('salesScaleQty') || {}).value || '');
    // Unit.parse reads "-3" as 3, so the minus is refused from the raw text.
    const q = raw.indexOf('-') === -1 ? Unit.parse(raw) : 0;
    if (!(q > 0)) return { error: 'sales.scaleQtyBad' };
    qty = Unit.roundQty(q);
  }
  // The label amount is the owner's word: the line total IS that money and the
  // unit price is whatever the quantity works out to.
  if (money != null) return { qty: qty, price: qty > 0 ? money / qty : 0, total: money, decimals: decimals };
  let price = d.unitPrice != null ? d.unitPrice : null;
  if (price == null) {
    const el = document.getElementById('salesScalePrice');
    const p = parseFloat(el ? el.value : '');
    price = isNaN(p) ? (s.card > 0 ? s.card : null) : Math.max(0, p);
  }
  // Nothing on the label, on the field or on a card says what it costs yet.
  if (price == null) return { error: 'sales.scalePick' };
  return { qty: qty, price: price, total: qty * price, decimals: decimals };
}

function updateSalesScaleTotal() {
  const el = document.getElementById('salesScaleTotal');
  const add = document.getElementById('salesScaleAddBtn');
  const n = salesScaleNumbers();
  // A label that printed its money states the price the customer pays even
  // before the missing weight is typed: the figure shown never comes from a
  // price list, and adding stays refused until the quantity says where it goes.
  const shown = (n && !n.error) ? n.total
    : (_scaleScan && _scaleScan.decoded.amountFromLabel != null ? _scaleScan.decoded.amountFromLabel : 0);
  if (el) el.textContent = 'DA' + fmtMoney(shown);
  if (add) add.disabled = !n || !!n.error || !!(_scaleScan && !_scaleScan.prod);
}

function salesScaleBad(errorKey) {
  alert(t(errorKey || 'sales.scaleQtyBad'));
  const el = document.getElementById(errorKey === 'sales.scalePick' ? 'salesScalePrice' : 'salesScaleQty');
  if (el) { el.focus(); if (el.select) el.select(); }
}

function confirmSalesScaleLine() {
  const s = _scaleScan;
  if (!s) return;
  const n = salesScaleNumbers();
  if (!n || n.error) { salesScaleBad(n && n.error); return; }
  if (!s.prod) { alert(t('sales.scalePick')); return; }
  const res = { qty: n.qty, price: n.price, total: n.total,
    amountFromLabel: s.decoded.amountFromLabel != null, qtyDecimals: n.decimals };
  const line = salesAddWeighedLine(s.prod, res, s.decoded);
  if (!line) { alert(t('sales.unavailable')); return; }
  closeSalesScaleModal();
}

// «سطر حر»: the label's money is kept, but no card is invented for the article.
function confirmSalesScaleFree() {
  const s = _scaleScan;
  if (!s) return;
  const n = salesScaleNumbers();
  if (!n || n.error) { salesScaleBad(n && n.error); return; }
  const line = addSalesFreeLine({ name: '', qty: n.qty, price: n.price });
  if (!line) { salesScaleBad('sales.scaleQtyBad'); return; }
  line.scale = { amount: n.total, count: 1, fromLabel: s.decoded.amountFromLabel != null,
    decimals: n.decimals, plu: s.decoded.plu || '', code: s.decoded.code || '' };
  renderSalesCart();
  closeSalesScaleModal();
}

// The same intelligence the product grid uses: cached normalised text, real
// score only for candidates, out-of-stock last.
function renderSalesScaleResults(q) {
  const box = document.getElementById('salesScaleResults');
  if (!box || !_scaleScan) return;
  const query = String(q || '').trim();
  if (!query) { box.innerHTML = ''; _scaleHits = []; updateSalesScaleTotal(); return; }
  _scaleHits = _searchSalesGroups(getSalesGroups(), query, 12);
  if (!_scaleHits.length) {
    box.innerHTML = `<div class="scale-none">${escHtml(t('sales.scaleNone'))}</div>`;
    return;
  }
  box.innerHTML = _scaleHits.map((g, i) => {
    const r = groupViableRecords(g)[0] || g.records[0] || {};
    const name = g.name || '';
    const meta = [g.barcode || '', r.plu ? `${escHtml(t('inventory.plu'))}: ${escHtml(String(r.plu))}` : '']
      .filter(Boolean).join(' · ');
    return `<button type="button" class="scale-hit" onclick="salesScaleLink(${i})">
      <span class="scale-hit-name">${escHtml(name)}</span>
      <span class="scale-hit-meta" dir="ltr">${meta}</span>
      <span class="scale-hit-price">DA${fmtMoney(salesPriceForRecord(r, _salesDefaultMode))}</span>
    </button>`;
  }).join('');
}

function salesScaleLinkFirst() {
  if (_scaleHits.length) salesScaleLink(0);
}

// The link is permanent, exactly as the shop asked: from now on every label
// carrying this code goes straight onto that card. A code already owned by
// another card is never moved in silence.
function salesScaleLink(i) {
  const s = _scaleScan;
  const g = _scaleHits[i];
  if (!s || !g) return;
  const r = groupViableRecords(g)[0] || g.records[0];
  const prod = r && DB.getProduct(r.id);
  if (!prod) { alert(t('sales.unavailable')); return; }
  const plu = s.decoded.plu;
  // The code reaching here matched no card in the database — that is why the
  // window opened — so the chosen card is either already its owner or carries a
  // different code that must be replaced on purpose, never in silence.
  if (plu && !ScaleCore.pluMatches(prod.plu, plu)) {
    if (prod.plu && !confirm(String(t('inventory.pluReplaceConfirm'))
      .replace('{old}', prod.plu).replace('{new}', plu))) return;
    DB.updateProduct(prod.id, { plu: String(plu) });
    invalidateSalesGroupsCache();
    _salesProducts = (typeof salesAllProducts === 'function') ? salesAllProducts() : (DB.getProducts ? DB.getProducts() : _salesProducts);
  }
  s.prod = prod;
  s.card = salesScaleCardPrice(prod);
  // The card in hand can change what the label meant (a weight label prices
  // from the card), so the resolution is redone, not inherited from the search.
  s.res = ScaleCore.resolve(s.decoded, s.card);
  // A label that already says the weight needs no further click: the link is
  // what was missing, so the line goes in exactly as a known PLU would.
  if (s.res) { confirmSalesScaleLine(); return; }
  renderSalesScaleModal();
}

// Esc closes, Enter on the two money fields adds the line, Enter on the search
// links the best match — the cashier never leaves the keyboard at a till.
function salesScaleKeyNav(e) {
  if (e.key === 'Escape' || e.key === 'Esc') {
    e.preventDefault(); e.stopPropagation();
    closeSalesScaleModal();
    return;
  }
  const id = e.target && e.target.id;
  if (e.key !== 'Enter') return;
  e.preventDefault(); e.stopPropagation();
  if (id === 'salesScaleSearch') { salesScaleLinkFirst(); return; }
  confirmSalesScaleLine();
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
  if (bal > 0) return `<span style="color:#dc3545;font-weight:700">${t('sales.custDebtPrefix')}: DA${fmtMoney(bal)}</span>`;
  if (bal < 0) return `<span style="color:#1a7f37;font-weight:700">${t('sales.custCreditPrefix')}: DA${fmtMoney(Math.abs(bal))}</span>`;
  return `<span style="color:var(--silver-500);font-weight:700">${t('sales.custZeroLabel')}</span>`;
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
    txt.textContent = t('sales.creditCancelDiscount');
    label.textContent = `${t('sales.creditWillDiscount')} DA${fmtMoney(usable)} ${t('sales.creditFromBalance')}`;
    info.textContent = `${t('sales.creditCustomerBalance')}: DA${fmtMoney(credit)} — ${t('sales.creditAfterDiscount')}: DA${fmtMoney(Math.max(0, total - usable))}`;
  } else {
    txt.textContent = t('sales.applyDiscount');
    label.textContent = t('sales.creditDiscountNow');
    info.textContent = `${t('sales.creditOweNote')}: DA${fmtMoney(credit)} — ${t('sales.creditApplyNote')}`;
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
  if (q && String(q).trim().length >= 2) { try { DB.logSearch({ query: q, context: 'sales-customers' }); } catch (e) {} }
  const input = document.getElementById('salesLedCustSearch') || document.getElementById('salesCustSearch');
  if (input && document.activeElement !== input) {
    try { input.value = q; } catch (e) {}
  }
  const results = document.getElementById('salesLedCustResults') || document.getElementById('salesCustResults');
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
  // A label belongs to one parent only. Changing the parent must drop it.
  if (String(c.id) !== String(_salesCustomerId || '')) _resetSalesSubCustomer();
  _salesCustomerId = c.id;
  _salesWalkin = false;
  _salesDefaultMode = c.type === 'whole' ? 'wholesale' : 'unit';
  const s1 = document.getElementById('salesCustSearch'); if (s1) { s1.value = c.name; }
  const s2 = document.getElementById('salesLedCustSearch'); if (s2) { s2.value = c.name; }
  const r1 = document.getElementById('salesCustResults'); if (r1) r1.innerHTML = '';
  const r2 = document.getElementById('salesLedCustResults'); if (r2) r2.innerHTML = '';
  document.getElementById('salesSelectedCust') && (document.getElementById('salesSelectedCust').style.display = 'flex');
  document.getElementById('salesLedSelectedCust') && (document.getElementById('salesLedSelectedCust').style.display = 'flex');
  document.getElementById('salesSelCustName') && (document.getElementById('salesSelCustName').textContent = c.name);
  document.getElementById('salesLedSelCustName') && (document.getElementById('salesLedSelCustName').textContent = c.name);
  const st = document.getElementById('salesSelCustType');
  if (st) { st.textContent = c.type === 'whole' ? t('sales.wholesale') : t('sales.unit'); st.className = 'sales-cust-type ' + (c.type === 'whole' ? 'whole' : 'unit'); }
  const lst = document.getElementById('salesLedSelCustType');
  if (lst) lst.textContent = c.type === 'whole' ? t('sales.wholesale') : t('sales.unit');
  document.getElementById('salesWalkinLabel') && (document.getElementById('salesWalkinLabel').style.display = 'none');
  document.getElementById('salesLedWalkinLabel') && (document.getElementById('salesLedWalkinLabel').style.display = 'none');
  document.getElementById('salesCustRow') && (document.getElementById('salesCustRow').style.display = 'none');
  const lw = document.getElementById('salesLedCustomer'); if (lw) lw.classList.add('has-selection');
  document.getElementById('salesSupBanner') && (document.getElementById('salesSupBanner').style.display = 'none');
  document.getElementById('salesLedSupBanner') && (document.getElementById('salesLedSupBanner').style.display = 'none');
  if (c.discount > 0) {
    const d1 = document.getElementById('salesSelCustDiscount'); if (d1) { d1.textContent = `${t('sales.discount')} ${c.discount}%`; d1.style.display = ''; }
    const d2 = document.getElementById('salesLedSelCustDiscount'); if (d2) { d2.textContent = `${t('sales.discount')} ${c.discount}%`; d2.style.display = 'inline-flex'; }
  } else {
    const d1 = document.getElementById('salesSelCustDiscount'); if (d1) d1.style.display = 'none';
    const d2 = document.getElementById('salesLedSelCustDiscount'); if (d2) d2.style.display = 'none';
  }
  _salesCreditUsed = 0;
  const balEl = document.getElementById('salesSelCustBalance');
  const bal = parseFloat(c.balance) || 0;
  if (balEl) {
    if (bal > 0) {
      balEl.style.display = '';
      balEl.textContent = `${t('sales.custDebtPrefix')}: DA${fmtMoney(bal)}`;
      balEl.style.color = '#dc3545';
    } else if (bal < 0) {
      balEl.style.display = '';
      balEl.textContent = `${t('sales.custCreditPrefix')}: DA${fmtMoney(Math.abs(bal))}`;
      balEl.style.color = '#1a7f37';
    } else {
      balEl.style.display = 'none';
    }
  }
  const lbal = document.getElementById('salesLedSelCustBalance');
  if (lbal) {
    if (bal > 0) {
      lbal.style.display = 'inline-flex';
      lbal.textContent = `${t('sales.custDebtPrefix')}: DA${fmtMoney(bal)}`;
      lbal.style.color = '#ffb3b3';
    } else if (bal < 0) {
      lbal.style.display = 'inline-flex';
      lbal.textContent = `${t('sales.custCreditPrefix')}: DA${fmtMoney(Math.abs(bal))}`;
      lbal.style.color = '#9dffb3';
    } else {
      lbal.style.display = 'none';
    }
  }
  try { if (typeof _syncSalesCustomerTop === 'function') _syncSalesCustomerTop(); } catch (e) {}
  _syncSalesSubBadge();
  _syncSalesPickSubBtn();
  updateSalesTotals();
}

// ===== CUSTOMER TREE — SUB-CUSTOMER LABEL (F5) =====
// The parent (_salesCustomerId) stays the account owner for every DB write.
function _salesTreeEnabled() {
  return !!(window.CustomerTree && typeof window.CustomerTree.enabled === 'function' && window.CustomerTree.enabled());
}

function _salesSelectedSub() {
  if (!_salesSubCustomerId || !window.CustomerTree || typeof window.CustomerTree.findChild !== 'function') return null;
  return window.CustomerTree.findChild(_salesSubCustomerId);
}

function _syncSalesSubBadge() {
  const el = document.getElementById('salesSubCustomerBadge');
  if (el) {
    const sub = _salesSelectedSub();
    if (!sub) { el.style.display = 'none'; el.textContent = ''; }
    else { el.style.display = 'inline-flex'; el.textContent = (t('customerTree.sub') || 'زبون تابع') + ': ' + sub.name; }
  }
  _syncSalesPickSubBtn();
}

// The button only exists for an actual parent customer AND while the customer
// tree feature is enabled. F5 keeps working independently, as before.
function _syncSalesPickSubBtn() {
  const btn = document.getElementById('salesPickSubBtn');
  if (!btn) return;
  btn.style.display = (_salesTreeEnabled() && !!_salesCustomerId && !_salesSupMode) ? 'inline-flex' : 'none';
}

function _resetSalesSubCustomer() {
  _salesSubCustomerId = null;
  _salesSubPickerId = null;
  _syncSalesSubBadge();
}

function openSalesSubCustomerModal() {
  if (!_salesTreeEnabled()) return;
  if (!_salesCustomerId) { alert(t('customerTree.noParent')); return; }
  const parent = DB.getCustomer(_salesCustomerId);
  if (!parent) { alert(t('customerTree.noParent')); return; }
  const m = document.getElementById('salesSubCustomerModal');
  if (!m) return;
  if (!m._host) m._host = m.parentNode;
  if (m.parentNode !== document.body) document.body.appendChild(m);
  _salesSubPickerId = _salesSubCustomerId || null;
  const pEl = document.getElementById('salesSubCustomerParent');
  if (pEl) pEl.innerHTML = escHtml(t('customerTree.of') || '') + ': <b>' + escHtml(parent.name) + '</b>';
  ['sscName', 'sscPhone', 'sscAddress'].forEach(function (id) {
    const f = document.getElementById(id);
    if (f) f.value = '';
  });
  renderSalesSubCustomerList();
  m.style.display = 'flex';
  setTimeout(function () { const f = document.getElementById('sscName'); if (f) { try { f.focus(); } catch (e) {} } }, 120);
}

function closeSalesSubCustomerModal() {
  const m = document.getElementById('salesSubCustomerModal');
  if (!m) return;
  m.style.display = 'none';
  if (m._host && m.parentNode === document.body) m._host.appendChild(m);
}

function renderSalesSubCustomerList() {
  const box = document.getElementById('salesSubCustomerList');
  if (!box) return;
  const kids = window.CustomerTree.childrenOf(_salesCustomerId);
  if (!kids.length) {
    box.innerHTML = '<div style="padding:12px;color:var(--silver-500);font-size:12px">' +
      escHtml(t('customerTree.noChildren') || '') + '</div>';
    return;
  }
  const parent = DB.getCustomer(_salesCustomerId);
  const invoices = DB.getInvoicesByCustomer ? DB.getInvoicesByCustomer(_salesCustomerId) : [];
  box.innerHTML = kids.map(function (k) {
    const picked = String(_salesSubPickerId || '') === String(k.id);
    const debt = parent ? (window.CustomerTree.childDebt(parent, k.id, invoices) || 0) : 0;
    return '<button type="button" class="ct-pick-row' + (picked ? ' is-picked' : '') +
      '" onclick="pickSalesSubCustomer(\'' + escHtml(k.id) + '\')">' +
      '<span class="ct-pick-dot"><i class="fas fa-user-tag"></i></span>' +
      '<span class="ct-pick-main"><b>' + escHtml(k.name) + '</b>' +
      (k.phone ? '<small dir="ltr">' + escHtml(k.phone) + '</small>' : '') +
      (k.address ? '<small>' + escHtml(k.address) + '</small>' : '') + '</span>' +
      (debt > 0 ? '<span class="ct-pick-debt">' + escHtml(t('customerTree.debt') || '') + ': DA' + fmtMoney(debt) + '</span>' : '') +
      '</button>';
  }).join('');
}

function pickSalesSubCustomer(id) {
  _salesSubPickerId = id;
  renderSalesSubCustomerList();
}

function confirmSalesSelectSubCustomer() {
  _salesSubCustomerId = _salesSubPickerId || null;
  _syncSalesSubBadge();
  closeSalesSubCustomerModal();
}

function clearSalesSubCustomer() {
  _resetSalesSubCustomer();
  closeSalesSubCustomerModal();
}

function confirmSalesAddSubCustomer() {
  if (!_salesTreeEnabled() || !_salesCustomerId) return;
  const nameEl = document.getElementById('sscName');
  const phoneEl = document.getElementById('sscPhone');
  const addrEl = document.getElementById('sscAddress');
  const name = nameEl ? String(nameEl.value || '').trim() : '';
  if (!name) {
    alert(t('customerTree.nameRequired'));
    if (nameEl) { try { nameEl.focus(); } catch (e) {} }
    return;
  }
  const payload = {
    name: name,
    phone: phoneEl ? phoneEl.value : '',
    address: addrEl ? addrEl.value : '',
  };
  // addChildEx distinguishes «empty name» from «could not persist». Showing the
  // same alert for both was the reason a typed name appeared to be rejected.
  const res = (typeof window.CustomerTree.addChildEx === 'function')
    ? window.CustomerTree.addChildEx(_salesCustomerId, payload)
    : { ok: !!(window.CustomerTree.addChild(_salesCustomerId, payload)), error: 'legacy' };
  if (!res.ok) {
    console.warn('[Sales] sub-customer save failed:', res.error);
    if (res.error === 'noParent') alert(t('customerTree.noParent'));
    else if (res.error === 'emptyName') alert(t('customerTree.nameRequired'));
    else alert(t('customerTree.saveFailed'));
    if (nameEl) { try { nameEl.focus(); } catch (e) {} }
    return;
  }
  const created = res.child;
  _salesSubCustomerId = created.id;
  _salesSubPickerId = created.id;
  _syncSalesSubBadge();
  closeSalesSubCustomerModal();
  if (window.ThermalPrint && window.ThermalPrint.toast) {
    try { window.ThermalPrint.toast(t('customerTree.saved'), 'ok'); } catch (e) {}
  }
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
  if (window.ZmtPartyLegal && typeof window.ZmtPartyLegal.clear === 'function') {
    window.ZmtPartyLegal.clear('sac');
  }
  const sacLimit = document.getElementById('sacCreditLimit');
  if (sacLimit) sacLimit.value = '0';
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
  if (!name) { alert(t('customers.nameRequired')); return; }
  const discount = parseFloat(document.getElementById('sacDiscount').value) || 0;
  if (discount < 0 || discount > 100) { alert(t('customers.discountRange')); return; }
  const limitEl = document.getElementById('sacCreditLimit');
  const creditLimit = limitEl ? (parseFloat(limitEl.value) || 0) : 0;
  if (creditLimit < 0) { alert(t('customers.prompts.invalidCreditLimit')); return; }
  const legal = window.ZmtPartyLegal && typeof window.ZmtPartyLegal.read === 'function'
    ? window.ZmtPartyLegal.read('sac') : {};

  const cust = DB.addCustomer(Object.assign({
    name,
    phone: document.getElementById('sacPhone').value.trim(),
    address: document.getElementById('sacAddress').value.trim(),
    type: document.getElementById('sacType').value === 'whole' ? 'whole' : 'unit',
    discount,
    creditLimit,
  }, legal));
  if (cust) DB.logAudit({ action: 'add', entity: 'customer', entityId: cust.id, detail: name });

  closeSalesAddCustomer();
  // Auto-select the newly created customer for the current sale.
  selectSalesCustomer(cust.id);
}

function setSalesWalkin() {
  _salesCustomerId = null;
  _resetSalesSubCustomer();
  _salesWalkin = true;
  _salesCreditUsed = 0;
  _salesDefaultMode = 'unit';
  const s1 = document.getElementById('salesCustSearch'); if (s1) s1.value = '';
  const s2 = document.getElementById('salesLedCustSearch'); if (s2) s2.value = '';
  const r1 = document.getElementById('salesCustResults'); if (r1) r1.innerHTML = '';
  const r2 = document.getElementById('salesLedCustResults'); if (r2) r2.innerHTML = '';
  document.getElementById('salesSelectedCust') && (document.getElementById('salesSelectedCust').style.display = 'none');
  document.getElementById('salesLedSelectedCust') && (document.getElementById('salesLedSelectedCust').style.display = 'none');
  document.getElementById('salesWalkinLabel') && (document.getElementById('salesWalkinLabel').style.display = 'flex');
  document.getElementById('salesLedWalkinLabel') && (document.getElementById('salesLedWalkinLabel').style.display = 'flex');
  const lw = document.getElementById('salesLedCustomer'); if (lw) lw.classList.add('has-selection');
  document.getElementById('salesSupBanner') && (document.getElementById('salesSupBanner').style.display = 'none');
  document.getElementById('salesLedSupBanner') && (document.getElementById('salesLedSupBanner').style.display = 'none');
  try { if (typeof _syncSalesCustomerTop === 'function') _syncSalesCustomerTop(); } catch (e) {}
  updateSalesTotals();
}

function clearSalesCustomer() {
  _salesCustomerId = null;
  _resetSalesSubCustomer();
  _salesWalkin = false;
  _salesCreditUsed = 0;
  _salesDefaultMode = 'unit';
  const _csr = document.getElementById('salesCustRow'); if (_csr) _csr.style.display = '';
  const _lcsr = document.getElementById('salesLedCustomer'); if (_lcsr) _lcsr.classList.remove('has-selection');
  document.getElementById('salesSelectedCust') && (document.getElementById('salesSelectedCust').style.display = 'none');
  document.getElementById('salesLedSelectedCust') && (document.getElementById('salesLedSelectedCust').style.display = 'none');
  document.getElementById('salesWalkinLabel') && (document.getElementById('salesWalkinLabel').style.display = 'none');
  document.getElementById('salesLedWalkinLabel') && (document.getElementById('salesLedWalkinLabel').style.display = 'none');
  const lw = document.getElementById('salesLedCustomer'); if (lw) lw.classList.remove('has-selection');
  const s1 = document.getElementById('salesCustSearch'); if (s1) s1.value = '';
  const s2 = document.getElementById('salesLedCustSearch'); if (s2) s2.value = '';
  const r1 = document.getElementById('salesCustResults'); if (r1) r1.innerHTML = '';
  const r2 = document.getElementById('salesLedCustResults'); if (r2) r2.innerHTML = '';
  try { if (typeof _syncSalesCustomerTop === 'function') _syncSalesCustomerTop(); } catch (e) {}
  updateSalesTotals();
}

// ===== SALE TO SUPPLIER (بيع له) =====

function openSupSaleMode() {
  if (_salesCart.length > 0) {
    if (!confirm(t('sales.supClearWarn'))) return;
  }
  _salesCustomerId = null;
  _resetSalesSubCustomer();
  _salesWalkin = false;
  _salesCreditUsed = 0;
  _salesCart = [];
  _salesSuppId = null;
  _salesSupMode = true;
  _salesDefaultMode = 'unit';
  setSalesPayMethod('cash');
  resetSupSalePayUI();
  document.getElementById('salesSelectedCust') && (document.getElementById('salesSelectedCust').style.display = 'none');
  document.getElementById('salesLedSelectedCust') && (document.getElementById('salesLedSelectedCust').style.display = 'none');
  document.getElementById('salesWalkinLabel') && (document.getElementById('salesWalkinLabel').style.display = 'none');
  document.getElementById('salesLedWalkinLabel') && (document.getElementById('salesLedWalkinLabel').style.display = 'none');
  document.getElementById('salesSupBanner') && (document.getElementById('salesSupBanner').style.display = 'none');
  document.getElementById('salesLedSupBanner') && (document.getElementById('salesLedSupBanner').style.display = 'none');
  const lw = document.getElementById('salesLedCustomer'); if (lw) lw.classList.add('has-selection');
  const row = document.getElementById('salesCustRow');
  if (row) row.style.display = 'none';
  try { if (typeof _syncSalesCustomerTop === 'function') _syncSalesCustomerTop(); } catch (e) {}
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
  if (q && String(q).trim().length >= 2) { try { DB.logSearch({ query: q, context: 'sup-sale-supplier' }); } catch (e) {} }
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
  const cap = bal > 0 ? t('sales.supDebtCap') : bal < 0 ? t('sales.supCreditCap') : t('sales.supZeroCap');
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
  if (countEl) countEl.textContent = matches.length + ' ' + t('sales.supplierName');
  if (matches.length === 0) {
    results.innerHTML = `<div class="sup-pick-empty"><i class="fas fa-search"></i><div>${t('sales.supNotFound')}</div></div>`;
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
  _salesSupMode = true;
  _syncSalesPickSubBtn();
  updateSupSaleBanner(s);
  closeSupSalePicker();
  try { if (typeof _syncSalesCustomerTop === 'function') _syncSalesCustomerTop(); } catch (e) {}
  const scan = document.getElementById('salesBarcodeScan');
  if (scan) scan.focus();
}

function updateSupSaleBanner(s) {
  const banner = document.getElementById('salesSupBanner');
  const lsb = document.getElementById('salesLedSupBanner');
  const nameEl = document.getElementById('salesSupName');
  const lname = document.getElementById('salesLedSupName');
  if (nameEl) nameEl.textContent = s.name;
  if (lname) lname.textContent = s.name;
  const balEl = document.getElementById('salesSupBalance');
  const lbal = document.getElementById('salesLedSupBalance');
  const bal = parseFloat(s.balance) || 0;
  const fmt = function(v){ try { return fmtMoney ? fmtMoney(v) : Number(v).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}); } catch(e){ return Number(v).toFixed(2); } };
  if (balEl) {
    if (bal > 0) {
      balEl.textContent = t('sales.supDebtCap') + ': +DA' + fmt(bal);
      balEl.style.color = '#dc3545';
    } else if (bal < 0) {
      balEl.textContent = t('sales.supCreditCap') + ': -DA' + fmt(Math.abs(bal));
      balEl.style.color = '#198754';
    } else {
      balEl.textContent = t('sales.supZeroCap') + ': DA0.00';
      balEl.style.color = 'var(--silver-500)';
    }
  }
  if (lbal) {
    if (bal > 0) {
      lbal.textContent = t('sales.supDebtCap') + ': +DA' + fmt(bal);
      lbal.style.color = '#ffb3b3';
    } else if (bal < 0) {
      lbal.textContent = t('sales.supCreditCap') + ': -DA' + fmt(Math.abs(bal));
      lbal.style.color = '#9dffb3';
    } else {
      lbal.textContent = t('sales.supZeroCap') + ': DA0.00';
      lbal.style.color = 'rgba(255,255,255,0.8)';
    }
  }
  if (banner) banner.style.display = 'flex';
  if (lsb) lsb.style.display = 'flex';
  const lw = document.getElementById('salesLedCustomer'); if (lw) lw.classList.add('has-selection');
  try { if (typeof _syncSalesCustomerTop === 'function') _syncSalesCustomerTop(); } catch (e) {}
}

function cancelSupSaleMode() {
  _salesSuppId = null;
  _salesSupMode = false;
  _syncSalesPickSubBtn();
  _salesDefaultMode = 'unit';
  resetSupSalePayUI();
  try { updateSalesRemaining(); } catch (e) {}
  const banner = document.getElementById('salesSupBanner');
  if (banner) banner.style.display = 'none';
  const lsb = document.getElementById('salesLedSupBanner');
  if (lsb) lsb.style.display = 'none';
  const lw = document.getElementById('salesLedCustomer'); if (lw) lw.classList.remove('has-selection');
  const row = document.getElementById('salesCustRow');
  if (row) row.style.display = '';
  const search = document.getElementById('salesCustSearch');
  if (search) search.value = '';
  const lsearch = document.getElementById('salesLedCustSearch');
  if (lsearch) lsearch.value = '';
  const results = document.getElementById('salesCustResults');
  if (results) results.innerHTML = '';
  const lresults = document.getElementById('salesLedCustResults');
  if (lresults) lresults.innerHTML = '';
  try { if (typeof _syncSalesCustomerTop === 'function') _syncSalesCustomerTop(); } catch (e) {}
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
      label.textContent = t('sales.supCashReceivedNow');
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
  const remDisplay = document.getElementById('salesRemainingDisplay');
  if (remDisplay) remDisplay.style.display = '';
  const payStatus = document.getElementById('salesPayStatus');
  if (payStatus) payStatus.style.display = '';
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
    beforeEl.textContent = fmtSupBalance(cur) + (cur > 0 ? ' (' + t('sales.supDebtCap') + ')' : cur < 0 ? ' (' + t('sales.supCreditCap') + ')' : '');
    beforeEl.style.color = cur > 0 ? '#dc3545' : cur < 0 ? '#198754' : 'var(--silver-600)';
  }
  const afterEl = document.getElementById('salesSupBalAfter');
  if (afterEl) {
    afterEl.textContent = fmtSupBalance(after) + (after > 0 ? ' (' + t('sales.supDebtCap') + ')' : after < 0 ? ' (' + t('sales.supCreditCap') + ')' : '');
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
  // «تحويل الزبون» changes the account owner: never carry a child label over.
  if (String(_transferCustomerId) !== String(_salesCustomerId || '')) _resetSalesSubCustomer();
  _salesCustomerId = _transferCustomerId;
  closeSalesTransfer();
  confirmSalesCheckout();
}

// ===== CART =====

// ---- free line: an item sold that has no record in the inventory ----
// A free line carries no product group, so it has no batches, no stock to
// deduct, no shelf price and no price modes: the typed price × typed quantity
// is the whole line, and its entire amount is margin.
const FREE_KEY = 'free:';
let _salesFreeSeq = 0;

function isFreeSalesKey(key) { return String(key || '').indexOf(FREE_KEY) === 0; }

// The cap a line's quantity may reach. Nothing caps an unlisted item — only a
// real product group is limited by what the shelves hold. A key with no group
// left (product removed while its line was in the cart) has no known limit,
// which is what the quantity buttons and the typed entry always assumed.
function salesLineMaxQty(line) {
  if (!line) return 999999;
  if (isFreeSalesKey(line.key)) return 999999;
  const g = getSalesGroupByKey(line.key);
  return g ? getGroupMaxQty(g) : 999999;
}

function addSalesFreeLine(opts) {
  opts = opts || {};
  const qty = Unit.roundQty(Number(opts.qty) || 0);
  const price = Math.max(0, Number(opts.price) || 0);
  if (!(qty > 0)) return null;
  const name = String(opts.name || '').trim() || t('sales.freeDefaultName');
  const line = {
    key: FREE_KEY + (++_salesFreeSeq), name: name, barcode: '', qty: qty,
    mode: 'unit', price: price, total: qty * price, baseTotal: qty * price,
    manualPrice: price, discount: 0, free: true, minPrice: 0,
    entries: [{ productId: null, name: name, barcode: '', qty: qty, price: price, total: qty * price }],
  };
  _salesCart.push(line);
  renderSalesCart();
  return line;
}

const FREE_FIELDS = ['salesFreeName', 'salesFreeQty', 'salesFreePrice'];

function openSalesFreeLine() {
  const m = document.getElementById('salesFreeModal');
  if (!m) return;
  if (!m._host) m._host = m.parentNode;
  if (m.parentNode !== document.body) document.body.appendChild(m);
  document.getElementById('salesFreeName').value = '';
  document.getElementById('salesFreeQty').value = '1';
  document.getElementById('salesFreePrice').value = '';
  updateSalesFreeTotal();
  m.style.display = 'flex';
  // The quantity is the field the cashier always edits, so it opens focused
  // with its "1" selected: type over it or press Enter for a single unit.
  const qty = document.getElementById('salesFreeQty');
  if (qty) { qty.focus(); if (qty.select) qty.select(); }
}

function closeSalesFreeLine() {
  const m = document.getElementById('salesFreeModal');
  if (m) {
    m.style.display = 'none';
    if (m._host && m.parentNode === document.body) m._host.appendChild(m);
  }
  const scan = document.getElementById('salesBarcodeScan');
  if (scan) scan.focus();
}

function salesFreeTotal() {
  const raw = String((document.getElementById('salesFreeQty') || {}).value || '');
  const q = raw.indexOf('-') === -1 ? Unit.parse(raw) : 0;
  const p = parseFloat((document.getElementById('salesFreePrice') || {}).value);
  return Unit.roundQty(q > 0 ? q : 0) * (isNaN(p) ? 0 : Math.max(0, p));
}

function updateSalesFreeTotal() {
  const el = document.getElementById('salesFreeTotal');
  if (el) el.textContent = 'DA' + fmtMoney(salesFreeTotal());
}

function confirmSalesFreeLine() {
  const qtyEl = document.getElementById('salesFreeQty');
  const priceEl = document.getElementById('salesFreePrice');
  const rawQty = String(qtyEl.value || '');
  const qty = Unit.parse(rawQty);
  const price = parseFloat(priceEl.value);
  // Unit.parse drops a minus sign (it reads "-3" as 3), so a negative quantity
  // has to be refused from the raw text — the rule is zero and negative never
  // reach the cart.
  if (rawQty.indexOf('-') !== -1 || !(qty > 0)) {
    alert(t('sales.freeQtyBad'));
    qtyEl.focus(); if (qtyEl.select) qtyEl.select();
    return;
  }
  if (isNaN(price)) {
    alert(t('sales.freePriceBad'));
    priceEl.focus(); if (priceEl.select) priceEl.select();
    return;
  }
  addSalesFreeLine({ name: document.getElementById('salesFreeName').value, qty: Unit.roundQty(qty), price: Math.max(0, price) });
  closeSalesFreeLine();
}

// Arrows walk the three fields (left/down forward, right/up back, matching the
// direction the rest of the app's tables use); Enter adds, Esc cancels.
function salesFreeKeyNav(e) {
  if (e.key === 'Escape' || e.key === 'Esc') {
    e.preventDefault(); e.stopPropagation(); closeSalesFreeLine(); return;
  }
  if (e.key === 'Enter') {
    e.preventDefault(); e.stopPropagation(); confirmSalesFreeLine(); return;
  }
  const i = FREE_FIELDS.indexOf(e.target && e.target.id);
  if (i < 0) return;
  const rtl = (typeof window.isRTL === 'function') ? window.isRTL() : ((window.__lang || 'ar') === 'ar');
  let n = -1;
  // Down always advances; Left advances in RTL (reading order) and Right does
  // in LTR, so the physical arrow points the way the layout flows.
  if (e.key === 'ArrowDown' || (rtl ? e.key === 'ArrowLeft' : e.key === 'ArrowRight')) n = Math.min(FREE_FIELDS.length - 1, i + 1);
  else if (e.key === 'ArrowUp' || (rtl ? e.key === 'ArrowRight' : e.key === 'ArrowLeft')) n = Math.max(0, i - 1);
  if (n < 0 || n === i) return;
  e.preventDefault(); e.stopPropagation();
  const el = document.getElementById(FREE_FIELDS[n]);
  if (el) { el.focus(); if (el.select) el.select(); }
}

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
    // The + button follows the last decimal place of the current quantity:
    // 1 -> 2, 0.25 -> 0.26, 0.001 -> 0.002.
    line.qty = Math.min(cap, Unit.roundQty(line.qty + Unit.step(line.qty)));
    allocateSalesLine(line, key);
  } else {
    // Every new line starts at exactly 1, whatever the product's unit; the
    // cashier types any decimal value by hand.
    // Block selling a product alone if it's reserved for a bundle.
    const _rep = g.records && g.records[0];
    if (_rep && !_rep.isBundle) {
      const _reserved = (typeof bundleReservedQty === 'function') ? bundleReservedQty(_rep.id) : 0;
      if (_reserved > 0 && getGroupAvailableQty(g) <= _reserved) {
        alert(t('sales.bundleSaleBlocked'));
        return;
      }
    }
    line = { key, name: g.name, barcode: g.barcode, qty: 1, mode: _salesDefaultMode, price: 0, total: 0, baseTotal: 0, manualPrice: null, discount: 0, entries: [], minPrice: Math.max(0, ...((g.records || []).map(r => Number(r && r.minPrice) || 0))) };
    allocateSalesLine(line, key);
    _salesCart.push(line);
  }

  renderSalesCart();
  document.getElementById('salesEmptyCart').style.display = 'none';
}

function renderSalesCart() {
  // A «المواصلة» answer belongs to the prices that were on the screen when it
  // was given; editing the cart afterwards asks again.
  _salesMarginBypass = false;
  _salesCreditBypass = false;
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
    renderSalesInCartStrip();
    return;
  }
  section.style.display = '';
  empty.style.display = 'none';
  if (count) count.textContent = _salesCart.length;
  const qkBtn = document.getElementById('salesQkOpenBtn');
  if (qkBtn) qkBtn.disabled = false;

  // A field deleted while a line was using it: fall back to the unit price.
  _salesCart.forEach(line => {
    if (line.mode !== 'unit' && line.mode !== 'wholesale' && !salesExtraFieldOfMode(line.mode)) {
      line.mode = 'unit';
      allocateSalesLine(line, line.key);
    }
  });

  items.innerHTML = _salesCart.map((line, i) => {
    const g = getSalesGroupByKey(line.key);
    const free = isFreeSalesKey(line.key);
    const maxQty = salesLineMaxQty(line);
    const mixed = line.entries.length > 1;
    const shortQty = line.shortQty || 0;
    const expiredWarn = (salesPharmacyOn() && (line.blockedExpired || 0) > 0)
      ? `<div class="sc-warn-note"><i class="fas fa-ban"></i> ${t('sales.batchExpiredPartial')} (${line.blockedExpired})</div>` : '';
    const shortWarn = shortQty > 0
      ? `<div class="sc-warn-note short"><i class="fas fa-exclamation-circle"></i> ${t('sales.subShortage')} ${Math.max(0, line.qty - shortQty)} / ${line.qty}</div>` : '';
    // The floor is part of the line's identity on screen: the cashier can see
    // the minimum before typing a price, not only after it snaps back.
    const floor = salesLineMinPrice(line);
    const floorNote = floor > 0
      ? `<div class="sc-minprice-note" id="scFloor_${i}"><i class="fas fa-arrow-down"></i> ${escHtml(t('quickEntry.minPrice'))}: DA${fmtMoney(floor)}</div>`
      : '';
    const unitName = (g && g.records && g.records[0])
      ? Unit.label(g.records[0]) : '';
    return `<div class="sc-item">
      <div class="sc-item-info">
        <div class="sc-item-name">${escHtml(line.name)}${line.scale ? `<span class="sc-scale-badge" title="${escHtml(line.scale.fromLabel ? t('sales.scaleFromLabelTag') : t('sales.scaleTag'))}"><i class="fas fa-weight-hanging"></i> ${escHtml(t('sales.scaleTag'))}</span>` : ''}${free ? `<span class="sc-free-badge" title="${escHtml(t('sales.freeDefaultName'))}">${escHtml(t('sales.freeTag'))}</span>` : (unitName ? `<span class="sc-unit-badge">${Unit.esc(unitName)}</span>` : '')}${mixed ? `<span class="sc-mixed-badge" title="${t('sales.mixedPrice')}"><i class="fas fa-layer-group"></i> ${t('sales.mixedPrice')}</span>` : ''}</div>
        <div class="sc-item-bar" dir="ltr">${escHtml(line.barcode)}</div>
        ${expiredWarn}
        ${shortWarn}
        <div style="margin-top:3px">
          ${free ? '' : `<button class="sc-mode-btn ${line.mode !== 'unit' ? 'sc-mode-btn-active' : ''}" onclick="toggleSalesLineMode(${i})" title="${t('sales.switchPriceMode')}${salesExtraFields().length ? ' ' + t('sales.switchPriceModeExtra') : ''}">${salesLineModeLabel(line.mode)}</button>`}
        </div>
        ${floorNote}
      </div>
      <div class="sc-item-controls">
        <button class="sc-qty-btn" onclick="decSalesCartQty(${i})" ${line.qty <= Unit.step(line.qty) ? 'disabled' : ''}>−</button>
        <input type="text" class="no-spinner sc-qty-input num-input" inputmode="decimal" id="scqty_${i}"
          value="${Unit.fmtQty(line.qty)}" min="0.000001" step="any"
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
  const maxQty = salesLineMaxQty(line);
  const step = Unit.step(line.qty);
  if (line.qty < maxQty) {
    line.qty = Math.min(maxQty, Unit.roundQty(line.qty + step));
    allocateSalesLine(line, line.key);
    renderSalesCart();
  }
}

function decSalesCartQty(idx) {
  const line = _salesCart[idx];
  if (!line) return;
  const step = Unit.step(line.qty);
  if (line.qty > step) {
    line.qty = Math.max(step, Unit.roundQty(line.qty - step));
    allocateSalesLine(line, line.key);
    renderSalesCart();
  }
}

function updateSalesCartQty(idx, val) {
  const line = _salesCart[idx];
  if (!line) return;
  let qty = Unit.parse(val);
  if (!(qty > 0)) qty = 1;
  const maxQty = salesLineMaxQty(line);
  // No fixed 0.5 grid any more: any decimal up to 6 places is accepted.
  line.qty = Math.min(maxQty, Unit.roundQty(qty));
  allocateSalesLine(line, line.key);
  renderSalesCart();
}

function removeFromSalesCart(idx) {
  _salesCart.splice(idx, 1);
  renderSalesCart();
  renderSalesInCartStrip();
  if (_salesCart.length === 0) {
    document.getElementById('salesPaySection').style.display = 'none';
    document.getElementById('salesBarcodeScan').focus();
  }
}

function toggleSalesLineMode(idx) {
  const line = _salesCart[idx];
  if (!line) return;
  // An unlisted line has no shelf prices to cycle through — its price is the
  // one the cashier typed.
  if (isFreeSalesKey(line.key)) return;
  line.mode = salesNextLineMode(line.mode);
  allocateSalesLine(line, line.key);
  renderSalesCart();
}

function updateSalesLinePrice(idx, val) {
  const line = _salesCart[idx];
  if (!line) return;
  const v = parseFloat(val);
  const minPrice = salesLineMinPrice(line);
  const below = (val !== '' && !isNaN(v) && v < minPrice);
  line.manualPrice = (val === '' || isNaN(v)) ? null : Math.max(minPrice, v);
  allocateSalesLine(line, line.key);
  renderSalesCart();
  salesMarginLiveCheck();
  if (below) salesFlashFloor(idx);
}

function updateSalesLineDiscount(idx, val) {
  const line = _salesCart[idx];
  if (!line) return;
  const v = parseFloat(val);
  line.discount = (val === '' || isNaN(v)) ? 0 : Math.max(0, v);
  allocateSalesLine(line, line.key);
  renderSalesCart();
  salesMarginLiveCheck();
}

function onSalesLinePriceInput(idx, val) {
  const line = _salesCart[idx];
  if (!line) return;
  const v = parseFloat(val);
  const minPrice = salesLineMinPrice(line);
  const below = (val !== '' && !isNaN(v) && v < minPrice);
  line.manualPrice = (val === '' || isNaN(v)) ? null : Math.max(minPrice, v);
  allocateSalesLine(line, line.key);
  updateSalesTotals();
  updateSalesLineTotal(idx);
  if (below) salesFlashFloor(idx);
}

// One-shot red pulse on the line's floor chip when a typed price is refused.
function salesFlashFloor(idx) {
  const el = document.getElementById('scFloor_' + idx);
  if (!el) return;
  el.classList.remove('flash');
  // Force a reflow so the animation restarts on a repeated refusal.
  void el.offsetWidth;
  el.classList.add('flash');
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
    const free = isFreeSalesKey(line.key);
    const maxQty = salesLineMaxQty(line);
    const atCap = line.qty >= maxQty;
    const active = i === _qkIndex;
    const unitLabel = t('sales.unitPrice') || 'Prix';
    const uName = (g && g.records && g.records[0]) ? Unit.label(g.records[0]) : '';
    return `<div class="qk-row${active ? ' active' : ''}" onclick="_qkSelect(${i})">
      <div class="qk-pos">${i + 1}</div>
      <div class="qk-info">
        <div class="qk-name">${escHtml(line.name)}${free ? `<span class="sc-free-badge">${escHtml(t('sales.freeTag'))}</span>` : (uName ? `<span class="sc-unit-badge">${Unit.esc(uName)}</span>` : '')}${atCap ? `<span class="qk-full">${t('sales.qtyModalFull')}</span>` : ''}</div>
        <div class="qk-bar" dir="ltr">${escHtml(line.barcode || '')}</div>
        <div class="qk-price">${unitLabel} <span dir="ltr">${Number(line.price || 0).toFixed(2)}</span> DA</div>
      </div>
      <div class="qk-qty-wrap">
        <span class="qk-qty-label">${t('sales.qtyModalQty')}</span>
        <span class="qk-qty${atCap ? ' qk-max' : ''}" dir="ltr">${Unit.fmtQty(line.qty)}</span>
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
  const pieces = Unit.roundQty(_salesCart.reduce(function (s, l) { return s + (Number(l.qty) || 0); }, 0));
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
        <span class="qk-foot-total-label">(${Unit.fmtQty(pieces)} ${t('sales.qtyModalItems')})</span>
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
  const _qkRtl = (typeof window.isRTL === 'function') ? window.isRTL() : ((window.__lang || 'ar') === 'ar');
  const _qkUp = e.key === 'ArrowUp' || e.key === 'Up';
  const _qkDown = e.key === 'ArrowDown' || e.key === 'Down';
  const _qkRight = e.key === 'ArrowRight' || e.key === 'Right';
  const _qkLeft = e.key === 'ArrowLeft' || e.key === 'Left';
  const _qkPrev = _qkUp || (_qkRtl ? _qkRight : _qkLeft);
  const _qkNext = _qkDown || (_qkRtl ? _qkLeft : _qkRight);
  if (_qkPrev) {
    _qkIndex = (_qkIndex - 1 + count) % count;
    _qkBuffer = null;
    _qkRender();
    return;
  }
  if (_qkNext) {
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
  if (/^[0-9]$/.test(e.key) || e.key === '.' || e.key === ',' || e.code === 'NumpadDecimal') {
    const line = _salesCart[_qkIndex];
    if (!line) return;
    const maxQty = salesLineMaxQty(line);
    const base = _qkBuffer === null ? '' : _qkBuffer;
    // 12 chars is enough for 0.000001 and still bounded.
    const next = (base + (e.code === 'NumpadDecimal' ? '.' : e.key)).slice(-12);
    const parsed = Unit.parse(next);
    let valQty = Math.min(parsed > 0 ? parsed : 1, maxQty);
    valQty = Unit.roundQty(valQty);
    line.qty = valQty;
    allocateSalesLine(line, line.key);
    _qkBuffer = next;
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

// Legacy helper: a fresh line starts at 1 and the + / − buttons follow each
// line's own decimal places (Unit.step). Kept so old call sites never break.
function getSalesQtyStep() {
  return Unit.step(1);
}

// Top-of-page LED grand-total (digital display).
function updateSalesLed() {
  const totalEl = document.getElementById('salesLedTotal');
  if (totalEl) {
    const total = (_salesCart && _salesCart.length > 0) ? (_salesComputedTotal || 0) : 0;
    totalEl.textContent = 'DA' + fmtMoney(total);
  }
  const itemsEl = document.getElementById('salesLedItems');
  if (itemsEl) {
    if (!_salesCart || _salesCart.length === 0) {
      itemsEl.textContent = Unit.fmtQty ? Unit.fmtQty(0) : '0';
    } else {
      const pieces = Unit.roundQty(_salesCart.reduce((s, l) => s + (Number(l.qty) || 0), 0));
      itemsEl.textContent = Unit.fmtQty ? Unit.fmtQty(pieces) : pieces;
    }
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

// The post-sale preview is built here rather than through invoices.js because
// that page script is loaded only when the invoices page is opened. Read the
// same shared switches so a Référence / Marque choice applies to both paths.
function _previewInvColumns() {
  var cfg = null;
  try {
    if (window.DisplaySettings && typeof window.DisplaySettings.invoiceColumns === 'function') {
      cfg = window.DisplaySettings.invoiceColumns();
    }
  } catch (e) {}
  if (!cfg) {
    try {
      var raw = localStorage.getItem('zmt_display_settings');
      cfg = raw ? JSON.parse(raw) : null;
    } catch (e) { cfg = null; }
  }
  cfg = cfg || {};
  function isOn(v) { return v === true || v === 1 || v === '1' || v === 'true'; }
  var ref = (cfg.invShowReference !== undefined) ? cfg.invShowReference : cfg.reference;
  var mark = (cfg.invShowMark !== undefined) ? cfg.invShowMark : cfg.mark;
  return { reference: isOn(ref), mark: isOn(mark) };
}

// Older lines may not carry the product snapshot; fall back to the live record
// exactly like the invoices page does, so enabling a column never shows blanks.
function _previewItemExtra(item, field) {
  if (item && item[field]) return String(item[field]);
  var pid = item && item.productId;
  if (!pid || typeof DB === 'undefined' || typeof DB.getProduct !== 'function') return '';
  try {
    var p = DB.getProduct(pid);
    return (p && p[field]) ? String(p[field]) : '';
  } catch (e) { return ''; }
}

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
  const invCols = _previewInvColumns();

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
                     ${supInfo.supp.address ? `<div style="font-size:11px;color:#666">Adresse: ${escHtml(supInfo.supp.address)}</div>` : ''}
                     ${salesPartyLegalHTML(supInfo.supp, true)}`
                  : `<div style="font-size:14px;color:#888">Fournisseur</div>`)
                : (customer
                  ? `<div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-top:2px">${escHtml(customer.name)}</div>
                     ${customer.phone ? `<div style="font-size:11px;color:#666">Tél: ${escHtml(customer.phone)}</div>` : ''}
                     ${customer.address ? `<div style="font-size:11px;color:#666">Adresse: ${escHtml(customer.address)}</div>` : ''}
                     ${salesPartyLegalHTML(customer, false)}`
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

        ${(inv.subCustomerName || inv.subCustomerId) ? `
        <!-- Customer tree: historical sub-customer snapshot, printed on the invoice -->
        <div class="ct-tree-note" style="margin:0 0 14px;padding:8px 12px;border-inline-start:3px solid #2563eb;background:#f8faff;color:#334155;font-size:11px;direction:ltr;text-align:left">
          <div style="font-weight:700">${escHtml(t('customerTree.printLabel') || 'Client secondaire')}: ${escHtml(inv.subCustomerName || '')}</div>
          ${inv.note ? `<div style="margin-top:3px">${escHtml(inv.note)}</div>` : ''}
        </div>` : ''}

        <!-- Items Table -->
        <table style="width:100%;border-collapse:collapse;font-size:12px" dir="ltr">
          <thead>
            <tr style="background:#f2f2f2;border-bottom:2px solid #1a1a1a">
              ${invCols.reference ? '<th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:110px">Référence</th>' : ''}
              <th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd">Désignation</th>
              ${invCols.mark ? '<th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:110px">Marque</th>' : ''}
              <th style="padding:8px 10px;text-align:center;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:60px">Qté</th>
              <th style="padding:8px 10px;text-align:right;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:100px">Prix unitaire</th>
              <th style="padding:8px 10px;text-align:right;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:100px">Total</th>
            </tr>
          </thead>
          <tbody>
            ${inv.items.map((item, i) => `
              <tr style="${i % 2 === 0 ? 'background:#fafafa' : ''}">
                ${invCols.reference ? `<td style="padding:7px 10px;border:1px solid #eee;font-size:12px;color:#333" dir="ltr">${escHtml(_previewItemExtra(item, 'reference'))}</td>` : ''}
                <td style="padding:7px 10px;border:1px solid #eee;font-size:12px;color:#333">${escHtml(item.name)}</td>
                ${invCols.mark ? `<td style="padding:7px 10px;border:1px solid #eee;font-size:12px;color:#333" dir="ltr">${escHtml(_previewItemExtra(item, 'mark'))}</td>` : ''}
                <td style="padding:7px 10px;border:1px solid #eee;text-align:center;font-size:12px;color:#333">${Unit.qtyUnit(item.qty, item)}</td>
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
          <strong>${t('invoices.remainingOnSupplier')}</strong>
          <strong style="font-size:16px">${fmtMoney(supInfo.due)} DA</strong>
        </div>` : `
        <div style="margin-top:14px;padding:12px 16px;background:#e8f5e9;border:1px solid #a5d6a7;border-radius:6px;font-size:13px;color:#2e7d32" dir="ltr">
          <strong>${t('invoices.supDebtSettled')}</strong>
        </div>`}
        <div style="margin-top:8px;font-size:11px;color:#666" dir="ltr">
          ${t('invoices.invoiceAmount')}: <strong>${fmtMoney(inv.totalAmount)} DA</strong>
          ${paidAmount > 0 ? ` &nbsp;|&nbsp; ${t('invoices.cashReceived')}: <strong>${fmtMoney(paidAmount)} DA</strong>` : ''}
          ${(typeof inv.supExpense === 'number') ? ` &nbsp;|&nbsp; ${t('invoices.expenseRecorded')}: <strong>${fmtMoney(inv.supExpense)} DA</strong>` : ''}
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
          ${t('sales.creditDiscountDone')} <strong>DA${fmtMoney(creditUsed)}</strong> ${t('sales.creditDiscountSource')}
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
  const ppRule = (typeof PrintPaper !== 'undefined' && PrintPaper) ? PrintPaper.pageRule(10) : '@page { margin: 10mm; size: A4; }';

  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Facture</title>
      ${styleHtml}
      <style>
        ${ppRule}
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

  // The floor is asked about before a single record exists: once the invoice is
  // written the sale cannot be pulled back. «بيع لمورد» is outside the rule, and
  // «المواصلة» spends its bypass on this click only.
  const marginBypass = _salesMarginBypass;
  _salesMarginBypass = false;
  const overpayBypass = _salesOverpayBypass;
  _salesOverpayBypass = false;
  let creditBypass = _salesCreditBypass;
  _salesCreditBypass = false;
  // The bypass is only meaningful for a manager. Any other state (e.g. a stale
  // flag left by an old dialog) is discarded so the limit is checked again.
  if (creditBypass && !((typeof Auth !== 'undefined') && typeof Auth.isManager === 'function' && Auth.isManager())) {
    creditBypass = false;
  }
  if (!_salesSupMode && !marginBypass) {
    const extraEl = document.getElementById('salesExtraDisc');
    const v = salesMarginScan(custDiscPct, extraEl ? (parseFloat(extraEl.value) || 0) : 0);
    if (v.length && showSalesMarginWarning(v, 'checkout')) return;
  }
  // Credit limit (سقف الدين): warn before the invoice is written — once it is
  // persisted the sale cannot be pulled back, exactly like the margin floor.
  if (!_salesSupMode && !creditBypass) {
    const custForCredit = _salesCustomerId ? DB.getCustomer(_salesCustomerId) : null;
    const creditLimit = custForCredit ? (parseFloat(custForCredit.creditLimit) || 0) : 0;
    if (creditLimit > 0 && custForCredit) {
      const saleTotal = _salesComputedTotal || 0;
      const paidAmt = (typeof getSalesPaidAmount === 'function') ? (getSalesPaidAmount().total || 0) : 0;
      const projectedBalance = (parseFloat(custForCredit.balance) || 0) + saleTotal - paidAmt;
      if (projectedBalance > creditLimit + 0.005) {
        if (showSalesCreditWarning(projectedBalance, creditLimit, saleTotal, parseFloat(custForCredit.balance) || 0)) return;
      }
    }
  }

  // Customer tree: resolve the label BEFORE the cart is cleared. This label is
  // metadata for the parent's invoice only — it never becomes a second payer.
  let subCustomer = null;
  let subNote = '';
  if (_salesTreeEnabled() && _salesSubCustomerId && !_salesSupMode) {
    const chosen = window.CustomerTree.findChild(_salesSubCustomerId);
    // Final guard: the label must belong to the current parent account.
    if (chosen && String(chosen.parentId) === String(_salesCustomerId)) {
      subCustomer = chosen;
      subNote = window.CustomerTree.noteFor(subCustomer, DB.getCustomer(_salesCustomerId)) || '';
    }
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
        // A weighed line keeps the label's place-count on the invoice too,
        // so the paper says 0.250 كغ exactly as the scale printed it.
        qtyDecimals: l.scale && l.scale.decimals != null ? l.scale.decimals : null,
      })),
      customerId: _salesCustomerId,
      // Optional sub-customer label + French note. SaleCore keeps customerId
      // and the single balance write on the parent, unchanged.
      subCustomer: subCustomer,
      note: subNote || undefined,
      supplierId: _salesSuppId,
      supMode: _salesSupMode,
      customerDiscountPct: custDiscPct,
      extraDiscount: parseFloat(document.getElementById('salesExtraDisc').value) || 0,
      pay: { method: _salesPayMethod, cash: pay.cash, ccp: pay.ccp, total: pay.total },
      creditUsed: _salesCreditUsed,
      allowOverpay: overpayBypass,
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
    if (res.error && res.error.code === 'PAID_EXCEEDS') {
      if (!_salesSupMode && showSalesOverpayWarning(res.error.total, res.error.paid)) return;
      alert(t('sales.paidExceedsTotal'));
      return;
    }
    alert((res.error && res.error.message) || t('sales.cartEmptyAlert'));
    return;
  }
  const inv = res.invoice;

  // The invoice is already persisted at this point, so nothing below may throw:
  // the old hardcoded getElementById('salesSelectedCust') chain was written for
  // the previous layout and crashed here — leaving the cart on screen so a
  // second click recorded the same sale twice. clearSalesCart() null-guards
  // every id (old panel + new LED variants) and resets the totals strip too;
  // the cart is emptied first so clearSalesCart() takes its silent branch and
  // the cashier is never asked "تفريغ السلة؟" after a sale he just confirmed.
  _salesCart = [];
  clearSalesCart();

  // Explicit "sale recorded" feedback: in thermal mode no preview window opens,
  // so without this the cashier only sees the cart vanish.
  try {
    if (window.ThermalPrint && window.ThermalPrint.toast) {
      window.ThermalPrint.toast(t('inventory.invoiceSaved') + ' DA' + fmtMoney(inv.totalAmount), 'ok');
    }
  } catch (e) {}

  // Thermal mode: print the receipt silently straight to the roll printer and
  // never open the normal print window. On any failure we fall back to the
  // usual on-screen preview so the cashier is never stuck.
  if (window.ThermalPrint && window.ThermalPrint.isEnabled()) {
    window.ThermalPrint.printSale(inv, res).then(function (r) {
      if (r && r.ok) {
        window.ThermalPrint.toast(t('thermal.printed'), 'ok');
      } else if (r && r.fallback) {
        showInvoicePreview(inv);
      } else {
        window.ThermalPrint.toast(t('thermal.testFail') + ' ' + ((r && r.error) || ''), 'err');
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
  if (_salesCart.length === 0) {
    _salesCart = [];
    _salesCustomerId = null;
    _resetSalesSubCustomer();
    _salesWalkin = false;
    _salesSuppId = null;
    _salesSupMode = false;
    _salesCreditUsed = 0;
    _salesDefaultMode = 'unit';
    _salesPaidTouched = false;
    _salesComputedTotal = 0;
    const sb2 = document.getElementById('salesSelectedCust');
    if (sb2) sb2.style.display = 'none';
    const lsb2 = document.getElementById('salesLedSelectedCust');
    if (lsb2) lsb2.style.display = 'none';
    const wl = document.getElementById('salesWalkinLabel');
    if (wl) wl.style.display = 'none';
    const lwl = document.getElementById('salesLedWalkinLabel');
    if (lwl) lwl.style.display = 'none';
    const cs = document.getElementById('salesCustSearch');
    if (cs) cs.value = '';
    const lcs = document.getElementById('salesLedCustSearch');
    if (lcs) lcs.value = '';
    const cr = document.getElementById('salesCustResults');
    if (cr) cr.innerHTML = '';
    const lcr = document.getElementById('salesLedCustResults');
    if (lcr) lcr.innerHTML = '';
    const _supResetBanner = document.getElementById('salesSupBanner');
    if (_supResetBanner) _supResetBanner.style.display = 'none';
    const _supResetBannerL = document.getElementById('salesLedSupBanner');
    if (_supResetBannerL) _supResetBannerL.style.display = 'none';
    const lw = document.getElementById('salesLedCustomer');
    if (lw) lw.classList.remove('has-selection');
    const _supResetRow = document.getElementById('salesCustRow');
    if (_supResetRow) _supResetRow.style.display = '';
    const psec = document.getElementById('salesPaySection');
    if (psec) psec.style.display = 'none';
    const ed = document.getElementById('salesExtraDisc');
    if (ed) ed.value = '0';
    resetSalesPaymentUI();
    resetSupSalePayUI();
    const csec = document.getElementById('salesCartSection');
    if (csec) csec.style.display = 'none';
    const escart = document.getElementById('salesEmptyCart');
    if (escart) escart.style.display = '';
    const emptyQkBtn2 = document.getElementById('salesQkOpenBtn');
    if (emptyQkBtn2) emptyQkBtn2.disabled = true;
    try { if (typeof _syncSalesCustomerTop === 'function') _syncSalesCustomerTop(); } catch (e) {}
    renderSalesInCartStrip();
    renderSalesProducts();
    try { updateSalesTotals(); } catch (e) {}
    try { updateSalesLed(); } catch (e) {}
    const bs = document.getElementById('salesBarcodeScan');
    if (bs) { try { bs.focus(); } catch (e) {} }
    return;
  }
  if (!confirm(t('sales.clearCartConfirm'))) return;
  _salesCart = [];
  _salesCustomerId = null;
  _resetSalesSubCustomer();
  _salesWalkin = false;
  _salesSuppId = null;
  _salesSupMode = false;
  _salesCreditUsed = 0;
  _salesDefaultMode = 'unit';
  _salesPaidTouched = false;
  _salesComputedTotal = 0;
  const sb2 = document.getElementById('salesSelectedCust');
  if (sb2) sb2.style.display = 'none';
  const lsb2 = document.getElementById('salesLedSelectedCust');
  if (lsb2) lsb2.style.display = 'none';
  const wl = document.getElementById('salesWalkinLabel');
  if (wl) wl.style.display = 'none';
  const lwl = document.getElementById('salesLedWalkinLabel');
  if (lwl) lwl.style.display = 'none';
  const cs = document.getElementById('salesCustSearch');
  if (cs) cs.value = '';
  const lcs = document.getElementById('salesLedCustSearch');
  if (lcs) lcs.value = '';
  const cr = document.getElementById('salesCustResults');
  if (cr) cr.innerHTML = '';
  const lcr = document.getElementById('salesLedCustResults');
  if (lcr) lcr.innerHTML = '';
  const _supResetBanner = document.getElementById('salesSupBanner');
  if (_supResetBanner) _supResetBanner.style.display = 'none';
  const _supResetBannerL = document.getElementById('salesLedSupBanner');
  if (_supResetBannerL) _supResetBannerL.style.display = 'none';
  const lw = document.getElementById('salesLedCustomer');
  if (lw) lw.classList.remove('has-selection');
  const _supResetRow = document.getElementById('salesCustRow');
  if (_supResetRow) _supResetRow.style.display = '';
  const psec = document.getElementById('salesPaySection');
  if (psec) psec.style.display = 'none';
  const ed = document.getElementById('salesExtraDisc');
  if (ed) ed.value = '0';
  resetSalesPaymentUI();
  resetSupSalePayUI();
  const csec = document.getElementById('salesCartSection');
  if (csec) csec.style.display = 'none';
  const escart = document.getElementById('salesEmptyCart');
  if (escart) escart.style.display = '';
  const emptyQkBtn2 = document.getElementById('salesQkOpenBtn');
  if (emptyQkBtn2) emptyQkBtn2.disabled = true;
  try { if (typeof _syncSalesCustomerTop === 'function') _syncSalesCustomerTop(); } catch (e) {}
  renderSalesInCartStrip();
  renderSalesProducts();
  try { updateSalesTotals(); } catch (e) {}
  try { updateSalesLed(); } catch (e) {}
  const bs = document.getElementById('salesBarcodeScan');
  if (bs) { try { bs.focus(); } catch (e) {} }
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
    body.innerHTML = '<div class="placeholder-box" style="padding:48px"><i class="fas fa-spinner fa-spin" style="font-size:34px;color:#0066B1"></i><p>' + t('sales.loading') + '</p></div>';
    fetch('pages/invoices.html')
      .then(r => r.text())
      .then(html => {
        body.innerHTML = html;
        body.dataset.loaded = '1';
        if (typeof applyTranslation === 'function') applyTranslation();
        _shInitInvoices(body);
      })
      .catch(() => {
        body.innerHTML = '<div class="placeholder-box" style="padding:48px"><i class="fas fa-exclamation-triangle" style="font-size:34px;color:#e74c3c"></i><p>' + t('sales.loadError') + '</p></div>';
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
    search: ['salesBarcodeScan', 'salesCustSearch'],
    render: () => {
      _salesProducts = (typeof salesAllProducts === 'function') ? salesAllProducts() : (DB.getProducts ? DB.getProducts() : _salesProducts);
      invalidateSalesGroupsCache();
      renderSalesProducts(_salesSearchQuery);
    },
  });
};

// Ctrl+X flips purchase-cost visibility globally. Only the list view renders the
// cost, so the grid view is left untouched — repainting it would throw away the
// cashier's scroll position for nothing.
window.addEventListener('zmt:buyprice-toggle', function () {
  if (_salesViewMode !== 'list') return;
  renderSalesProducts(_salesSearchQuery);
});

// Extra sale-price fields edited on the inventory page (same tab → no storage
// event): repaint the cards and the cart modes without disturbing quantities.
document.addEventListener('zmt:extra-prices-changed', function () {
  const page = document.getElementById('page-sales');
  if (!page || !page.classList.contains('active')) return;
  _salesCardCtx = null;
  renderSalesProducts(_salesSearchQuery);
  if (_salesCart.length) renderSalesCart();
});
