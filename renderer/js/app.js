// ============================================================
// ZMT PIECE - Core App
// ============================================================

console.log('[App] Starting...');

const api = window.electronAPI || {};

// ===== WINDOW FOCUS FIX (Windows) =====
// After a native alert()/confirm() dialog closes, the frameless window can keep
// visual focus without keyboard focus — inputs freeze until the user clicks outside
// and back. Re-request window focus after every dialog to keep typing working.
(function() {
  const nativeAlert = window.alert;
  const nativeConfirm = window.confirm;
  function restoreFocus() {
    if (window.electronAPI && window.electronAPI.focusFix) window.electronAPI.focusFix();
  }
  window.alert = function(msg) {
    const r = nativeAlert.call(window, msg);
    restoreFocus();
    return r;
  };
  window.confirm = function(msg) {
    const r = nativeConfirm.call(window, msg);
    restoreFocus();
    return r;
  };
})();

// ===== SUPPLIERS STORAGE =====
if (!localStorage.getItem('zmt_suppliers')) {
  localStorage.setItem('zmt_suppliers', JSON.stringify([]));
}
// ===== BRANDS DATA =====
const BRANDS = {
  global: [
    // ——— ألمانيا ———
    { id:'bmw',        name:'BMW',           country:'ألمانيا', slug:'bmw',         color:'#0066B1' },
    { id:'mercedes',   name:'Mercedes-Benz',  country:'ألمانيا', slug:'mercedes',    color:'#00ADEF' },
    { id:'audi',       name:'Audi',           country:'ألمانيا', slug:'audi',        color:'#BB0A30' },
    { id:'volkswagen', name:'Volkswagen',     country:'ألمانيا', slug:'volkswagen',  color:'#001E50' },
    { id:'porsche',    name:'Porsche',        country:'ألمانيا', slug:'porsche',     color:'#B12B24' },
    { id:'opel',       name:'Opel',           country:'ألمانيا', slug:'opel',        color:'#F3E300' },
    { id:'smart',      name:'Smart',          country:'ألمانيا', slug:'smart',       color:'#1A1A1A' },
    { id:'man',        name:'MAN',            country:'ألمانيا', slug:'man',         color:'#002C5F' },
    // ——— اليابان ———
    { id:'toyota',     name:'Toyota',         country:'اليابان',    slug:'toyota',      color:'#EB0A1E' },
    { id:'honda',      name:'Honda',          country:'اليابان',    slug:'honda',       color:'#E60012' },
    { id:'nissan',     name:'Nissan',         country:'اليابان',    slug:'nissan',      color:'#C3002F' },
    { id:'mazda',      name:'Mazda',          country:'اليابان',    slug:'mazda',       color:'#101010' },
    { id:'subaru',     name:'Subaru',         country:'اليابان',    slug:'subaru',      color:'#013C7A' },
    { id:'mitsubishi', name:'Mitsubishi',     country:'اليابان',    slug:'mitsubishi',  color:'#E60012' },
    { id:'lexus',      name:'Lexus',          country:'اليابان',    slug:'lexus',       color:'#999999' },
    { id:'suzuki',     name:'Suzuki',         country:'اليابان',    slug:'suzuki',      color:'#E60012' },
    { id:'infiniti',   name:'Infiniti',       country:'اليابان',    slug:'infiniti',    color:'#1A1A1A' },
    { id:'acura',      name:'Acura',          country:'اليابان',    slug:'acura',       color:'#003D6B' },
    { id:'daihatsu',   name:'Daihatsu',       country:'اليابان',    slug:'daihatsu',    color:'#E50012' },
    { id:'isuzu',      name:'Isuzu',          country:'اليابان',    slug:'isuzu',       color:'#003366' },
    // ——— أمريكا ———
    { id:'ford',       name:'Ford',           country:'أمريكا',     slug:'ford',        color:'#003478' },
    { id:'chevrolet',  name:'Chevrolet',      country:'أمريكا',     slug:'chevrolet',   color:'#CDCDCD' },
    { id:'dodge',      name:'Dodge',          country:'أمريكا',     slug:'dodge',       color:'#333333' },
    { id:'jeep',       name:'Jeep',           country:'أمريكا',     slug:'jeep',        color:'#005A3C' },
    { id:'cadillac',   name:'Cadillac',       country:'أمريكا',     slug:'cadillac',    color:'#1A1A1A' },
    { id:'tesla',      name:'Tesla',          country:'أمريكا',     slug:'tesla',       color:'#E82127' },
    { id:'chrysler',   name:'Chrysler',       country:'أمريكا',     slug:'chrysler',    color:'#333333' },
    { id:'gmc',        name:'GMC',            country:'أمريكا',     slug:'gmc',         color:'#003E6B' },
    { id:'lincoln',    name:'Lincoln',        country:'أمريكا',     slug:'lincoln',     color:'#002856' },
    { id:'buick',      name:'Buick',          country:'أمريكا',     slug:'buick',       color:'#004E8C' },
    { id:'ram',        name:'Ram',            country:'أمريكا',     slug:'ram',         color:'#333333' },
    // ——— كوريا ———
    { id:'hyundai',    name:'Hyundai',        country:'كوريا',      slug:'hyundai',     color:'#003366' },
    { id:'kia',        name:'Kia',            country:'كوريا',      slug:'kia',         color:'#BB0A30' },
    { id:'genesis',    name:'Genesis',        country:'كوريا',      slug:'genesis',     color:'#1A1A1A' },
    { id:'ssangyong',  name:'SsangYong',      country:'كوريا',      slug:'ssangyong',   color:'#003366' },
    // ——— السويد ———
    { id:'volvo',      name:'Volvo',          country:'السويد',     slug:'volvo',       color:'#003057' },
    { id:'scania',     name:'Scania',         country:'السويد',     slug:'scania',      color:'#003366' },
    // ——— إيطاليا ———
    { id:'ferrari',    name:'Ferrari',        country:'إيطاليا',    slug:'ferrari',     color:'#FF2800' },
    { id:'lamborghini',name:'Lamborghini',    country:'إيطاليا',    slug:'lamborghini', color:'#DDBB00' },
    { id:'maserati',   name:'Maserati',       country:'إيطاليا',    slug:'maserati',    color:'#1A1A2E' },
    { id:'fiat',       name:'Fiat',           country:'إيطاليا',    slug:'fiat',        color:'#003366' },
    { id:'alfa-romeo', name:'Alfa Romeo',     country:'إيطاليا',    slug:'alfaromeo',   color:'#C00000' },
    { id:'lancia',     name:'Lancia',         country:'إيطاليا',    slug:'lancia',      color:'#003366' },
    { id:'iveco',      name:'Iveco',          country:'إيطاليا',    slug:'iveco',       color:'#004098' },
    // ——— بريطانيا ———
    { id:'jaguar',     name:'Jaguar',         country:'بريطانيا',   slug:'jaguar',      color:'#36454F' },
    { id:'land-rover', name:'Land Rover',     country:'بريطانيا',   slug:'landrover',   color:'#005A3C' },
    { id:'mini',       name:'Mini',           country:'بريطانيا',   slug:'mini',        color:'#005A3C' },
    { id:'bentley',    name:'Bentley',        country:'بريطانيا',   slug:'bentley',     color:'#1A1A1A' },
    { id:'rolls-royce',name:'Rolls-Royce',    country:'بريطانيا',   slug:'rollsroyce',  color:'#1A1A1A' },
    { id:'aston-martin',name:'Aston Martin',  country:'بريطانيا',   slug:'astonmartin', color:'#00665E' },
    { id:'mclaren',    name:'McLaren',        country:'بريطانيا',   slug:'mclaren',     color:'#FF6600' },
    { id:'lotus',      name:'Lotus',          country:'بريطانيا',   slug:'lotus',       color:'#005A3C' },
    // ——— فرنسا ———
    { id:'peugeot',    name:'Peugeot',        country:'فرنسا',      slug:'peugeot',     color:'#003E74' },
    { id:'renault',    name:'Renault',        country:'فرنسا',      slug:'renault',     color:'#FFCC00' },
    { id:'citroen',    name:'Citro\u00ebn',   country:'فرنسا',      slug:'citroen',     color:'#1C3F7A' },
    { id:'bugatti',    name:'Bugatti',        country:'فرنسا',      slug:'bugatti',     color:'#1A1A2E' },
    // ——— إسبانيا ———
    { id:'seat',       name:'SEAT',           country:'إسبانيا',    slug:'seat',        color:'#004B87' },
    // ——— التشيك ———
    { id:'skoda',      name:'Skoda',          country:'التشيك',     slug:'skoda',       color:'#006633' },
    // ——— رومانيا ———
    { id:'dacia',      name:'Dacia',          country:'رومانيا',    slug:'dacia',       color:'#003366' },
    // ——— الهند ———
    { id:'tata',       name:'Tata Motors',    country:'الهند',      slug:'tata',        color:'#1A1A8A' },
    { id:'mahindra',   name:'Mahindra',       country:'الهند',      slug:'mahindra',    color:'#DD1E2A' },
    // ——— هولندا ———
    { id:'daf',        name:'DAF Trucks',     country:'هولندا',     slug:'daf',         color:'#003366' },
  ],
  chinese: [
    { id:'byd',        name:'BYD',            country:'الصين', slug:'byd',           color:'#C71523' },
    { id:'geely',      name:'Geely',          country:'الصين', slug:'geely',         color:'#003399' },
    { id:'chery',      name:'Chery',          country:'الصين', slug:'chery',         color:'#B7202E' },
    { id:'jetour',     name:'Jetour',         country:'الصين', slug:'jetour',        color:'#003366' },
    { id:'great-wall', name:'Great Wall',     country:'الصين', slug:'greatwall',     color:'#333333' },
    { id:'ora',        name:'Ora',            country:'الصين', slug:'ora',           color:'#41B3A2' },
    { id:'nio',        name:'NIO',            country:'الصين', slug:'nio',           color:'#000000' },
    { id:'xpeng',      name:'XPeng',          country:'الصين', slug:'xpeng',         color:'#1A1A2E' },
    { id:'li-auto',    name:'Li Auto',        country:'الصين', slug:'li-auto',       color:'#333333' },
    { id:'saic',       name:'SAIC Motor',     country:'الصين', slug:'saic',          color:'#DC0028' },
    { id:'changan',    name:'Changan',        country:'الصين', slug:'changan',       color:'#003366' },
    { id:'gac',        name:'GAC Group',      country:'الصين', slug:'gac',           color:'#004098' },
    { id:'dongfeng',   name:'Dongfeng',       country:'الصين', slug:'dongfeng',      color:'#0066B1' },
    { id:'baic',       name:'BAIC',           country:'الصين', slug:'baic',          color:'#004EA1' },
    { id:'mg',         name:'MG',             country:'الصين', slug:'mg',            color:'#C8191E' },
    { id:'faw',        name:'FAW',            country:'الصين', slug:'faw',           color:'#DC0028' },
    { id:'jac',        name:'JAC Motors',     country:'الصين', slug:'jac',           color:'#004A98' },
    { id:'zeekr',      name:'Zeekr',          country:'الصين', slug:'zeekr',         color:'#2B2B2B' },
    { id:'aion',       name:'Aion',           country:'الصين', slug:'aion',          color:'#0066B1' },
    { id:'leapmotor',  name:'Leapmotor',      country:'الصين', slug:'leapmotor',     color:'#333333' },
    { id:'wm-motor',   name:'WM Motor',       country:'الصين', slug:'wm-motor',      color:'#005A9E' },
    { id:'hiphi',      name:'HiPhi',          country:'الصين', slug:'hiphi',         color:'#1A1A2E' },
    { id:'voyah',      name:'Voyah',          country:'الصين', slug:'voyah',         color:'#003D6B' },
    { id:'deepal',     name:'Deepal',         country:'الصين', slug:'deepal',        color:'#0066B1' },
    { id:'seres',      name:'Seres',          country:'الصين', slug:'seres',         color:'#002856' },
    { id:'dfsk',       name:'DFSK',           country:'الصين', slug:'dfsk',          color:'#004098' },
    { id:'bestune',    name:'Bestune',        country:'الصين', slug:'bestune',       color:'#DC0028' },
    { id:'venucia',    name:'Venucia',        country:'الصين', slug:'venucia',       color:'#004EA1' },
  ],
};

// ===== SHARED BRAND SELECT =====
// Builds <option>/<optgroup> HTML for a brand <select> used when adding a product.
//   - optional: first option is "—" (no brand)
//   - favorites: brands marked as favourite (localStorage zmt_fav_brands) shown first in a labelled group
//   - includes built-in brands + custom brands (kinds) so nothing is lost when editing
function buildBrandSelectOptions(selectedId) {
  selectedId = selectedId || '';
  var esc = function (s) {
    return (typeof window.escHtml === 'function') ? window.escHtml(s) : String(s == null ? '' : s);
  };

  // Multi-language group labels (independent of any page script).
  var _lang = (typeof window.__lang === 'string') ? window.__lang : 'ar';
  var labels = {
    ar: { favourites: 'المفضلة', none: 'بدون علامة', all: 'بقية العلامات' },
    en: { favourites: 'Favourites', none: 'No brand', all: 'All brands' },
    fr: { favourites: 'Favoris', none: 'Sans marque', all: 'Toutes les marques' },
    zh: { favourites: '收藏', none: '无品牌', all: '所有品牌' }
  };
  var L = labels[_lang] || labels.ar;

  // Collect all brands: built-in + custom (custom overrides built-in with same id).
  var builtins = (typeof BRANDS !== 'undefined' && BRANDS) ? [].concat(BRANDS.global || [], BRANDS.chinese || []) : [];
  var customs = [];
  try {
    var raw = localStorage.getItem('zmt_custom_brands');
    if (raw) { var parsed = JSON.parse(raw); if (Array.isArray(parsed)) customs = parsed; }
  } catch (e) { /* ignore corrupt storage */ }

  var map = new Map();
  builtins.forEach(function (b) { if (b && b.id) map.set(b.id, b); });
  customs.forEach(function (b) { if (b && b.id) map.set(b.id, b); });
  var all = Array.from(map.values());

  // Favourite ids (in stored priority order).
  var favIds = [];
  try {
    var fr = localStorage.getItem('zmt_fav_brands');
    if (fr) { var fp = JSON.parse(fr); if (Array.isArray(fp)) favIds = fp; }
  } catch (e) { /* ignore */ }

  var favSet = new Set(favIds);
  var favourites = [], others = [];
  all.forEach(function (b) {
    var item = { id: b.id, name: b.name || '' };
    (favSet.has(b.id) ? favourites : others).push(item);
  });
  // favourites follow the user's stored order; others alphabetical (locale-aware, fallback safe).
  var orderFav = {}, i = 0;
  favourites.forEach(function (b) { orderFav[b.id] = i++; });
  favourites.sort(function (a, b) { return (orderFav[a.id] != null ? orderFav[a.id] : 0) - (orderFav[b.id] != null ? orderFav[b.id] : 0); });
  others.sort(function (a, b) {
    try { return String(a.name).localeCompare(String(b.name), 'ar'); }
    catch (e) { return String(a.name) < String(b.name) ? -1 : (String(a.name) > String(b.name) ? 1 : 0); }
  });

  function opt(b) {
    return '<option value="' + esc(b.id) + '"' + (selectedId === b.id ? ' selected' : '') + '>' + esc(b.name) + '</option>';
  }

  var html = '<option value="">' + esc(L.none) + '</option>';
  if (favourites.length) {
    html += '<optgroup label="' + esc(L.favourites) + '">' + favourites.map(opt).join('') + '</optgroup>';
  }
  if (others.length) {
    html += '<optgroup label="' + esc(L.all) + '">' + others.map(opt).join('') + '</optgroup>';
  }
  return html;
}

// Helper: brand image HTML (local file with PNG fallback and SVG badge fallback)
function brandImageHTML(b) {
  const c = b.color || '#0066B1';
  const initials = b.name.replace(/[^A-Za-z0-9]/g, '').substring(0, 2).toUpperCase();

  return `<img src="assets/brands/${b.slug}.svg" alt="${b.name}" data-png="assets/brands/${b.slug}.png" data-color="${c}" data-init="${initials}">`;
}

// ===== PAGE CACHE =====
const pageCache = {};
var _pendingFetchController = null;
var _currentPageId = null;

function cleanupPage() {
  // Leaving the price display stage always restores the normal window.
  try {
    if (document.body.classList.contains('pd-kiosk')) {
      document.body.classList.remove('pd-kiosk');
      window.__pdKioskMode = false;
      if (window.electronAPI && typeof window.electronAPI.windowSetKiosk === 'function') {
        window.electronAPI.windowSetKiosk(false);
      }
    }
  } catch (e) {}

  // Destroy active infinite scroll pager
  if (window._activePager) {
    window._activePager.destroy();
    window._activePager = null;
  }
  if (window._pageListeners) {
    for (const { type, fn, target } of window._pageListeners) {
      (target || document).removeEventListener(type, fn);
    }
    window._pageListeners = [];
  }
  document.querySelectorAll('body > [id*="Modal"], body > [id*="modal"]').forEach(el => {
    if (el.parentNode === document.body) el.remove();
  });
  const prev = document.getElementById('invoicePreviewModal');
  if (prev) prev.remove();

  const container = document.getElementById('pageContainer');
  if (container) {
    container.querySelectorAll('canvas').forEach(c => {
      const chart = Chart.getChart && Chart.getChart(c);
      if (chart) { try { chart.destroy(); } catch(e) {} }
    });
    container.querySelectorAll('input, select, textarea').forEach(el => {
      el.value = '';
      el.checked = false;
    });
  }

  if (window._pageIntervals) {
    for (const id of window._pageIntervals) clearInterval(id);
    window._pageIntervals = [];
  }
}
if (!window._pageListeners) window._pageListeners = [];
if (!window._pageIntervals) window._pageIntervals = [];
if (!window._pageSyncHandlers) window._pageSyncHandlers = {};

function trackPageInterval(fn, delay) {
  const id = setInterval(fn, delay);
  if (!window._pageIntervals) window._pageIntervals = [];
  window._pageIntervals.push(id);
  return id;
}

function trackPageListener(type, fn, target) {
  if (!window._pageListeners) window._pageListeners = [];
  window._pageListeners.push({ type, fn, target });
  (target || document).addEventListener(type, fn);
}

// ===== BRAND IMAGE LOADER (local SVG/PNG with SVG badge fallback) =====
function setupBrandImages(scope) {
  const container = scope || document;
  container.querySelectorAll('.brand-card .brand-image img[data-png]').forEach(img => {
    const color = img.dataset.color || '#0066B1';
    const init = img.dataset.init || 'BR';
    let retried = false;

    function showFallback() {
      const svg = '<svg width="48" height="48" viewBox="0 0 100 100">'
        + '<circle cx="50" cy="50" r="48" fill="' + color + '"/>'
        + '<text x="50" y="50" text-anchor="middle" dy=".35em" fill="white" '
        + 'font-size="30" font-weight="bold" font-family="Arial,sans-serif">' + init + '</text></svg>';
      img.style.display = 'none';
      img.parentNode.innerHTML = svg;
    }

    function tryPNG() {
      if (retried) { showFallback(); return; }
      retried = true;
      img.src = img.dataset.png;
    }

    if (img.complete) {
      if (img.naturalWidth === 0 || img.naturalHeight === 0) tryPNG();
      return;
    }

    img.addEventListener('error', () => tryPNG());
    img.addEventListener('load', () => {});
  });
}

// ===== SHARED PRODUCT SEARCH (sales <-> inventory) =====
// The text a user types in either product search field follows them across the
// two pages. cleanupPage() wipes every input on navigation, so the value is
// mirrored here and restored right after the target page's init has run.
const SHARED_PRODUCT_SEARCH_KEY = 'zmt_shared_product_search';
const SHARED_PRODUCT_SEARCH_INPUTS = { sales: 'salesBarcodeScan', inventory: 'invSearch' };

function getSharedProductSearch() {
  try { return String(localStorage.getItem(SHARED_PRODUCT_SEARCH_KEY) || ''); } catch (e) { return ''; }
}
function setSharedProductSearch(value) {
  const q = value == null ? '' : String(value);
  try { localStorage.setItem(SHARED_PRODUCT_SEARCH_KEY, q); } catch (e) {}
  return q;
}
function captureSharedProductSearch(pageId) {
  const inputId = SHARED_PRODUCT_SEARCH_INPUTS[pageId];
  if (!inputId) return;
  const input = document.getElementById(inputId);
  if (input && input.value !== undefined) setSharedProductSearch(input.value);
}
document.addEventListener('input', function (e) {
  const id = e.target && e.target.id;
  if (id === 'salesBarcodeScan' || id === 'invSearch') setSharedProductSearch(e.target.value);
}, true);

function restoreSharedProductSearch(pageId) {
  const inputId = SHARED_PRODUCT_SEARCH_INPUTS[pageId];
  if (!inputId) return;
  const input = document.getElementById(inputId);
  if (!input) return;
  const q = getSharedProductSearch();
  if (input.value !== q) input.value = q;
  if (!q) return;
  // Run the real page filter directly: it avoids the 200/300 ms debounce and
  // never double-registers a search log (the debounced helpers do the logging).
  if (pageId === 'sales' && typeof window.renderSalesProducts === 'function') {
    window.renderSalesProducts(q);
  } else if (pageId === 'inventory' && typeof window.applyInvFilter === 'function') {
    window.applyInvFilter();
  }
}

// Open a product's editor from any page (currently used by the low-stock modal).
// The inventory script is loaded lazily by the router, so when it is not present
// yet we remember the id, navigate, and fire the editor from runPageInit().
window.openProductEditor = function (id) {
  if (!id) return;
  if (typeof Auth !== 'undefined' && Auth && typeof Auth.isLoggedIn === 'function' && Auth.isLoggedIn() &&
      typeof Auth.canView === 'function' && !Auth.canView('inventory')) {
    alert(t('common.noPermission') || 'لا تملك صلاحية للقيام بهذه العملية');
    return;
  }
  if (typeof window.editInventoryItem === 'function' && document.getElementById('invGrid')) {
    window.editInventoryItem(id);
    return;
  }
  window.__zmtPendingProductEdit = String(id);
  navigateTo('inventory');
};

// ===== ROUTER =====
function navigateTo(pageId) {
  console.log('[Router] Navigating to:', pageId);

  // Restore sidebar if we are leaving the quick-entry page (F1 had collapsed it)
  if (_currentPageId === 'quick-entry' && pageId !== 'quick-entry' && typeof window._qePrevSidebar !== 'undefined') {
    applySidebarState(window._qePrevSidebar);
    window._qePrevSidebar = undefined;
  }

  if (typeof Auth !== 'undefined' && Auth.isLoggedIn() && !Auth.canView(pageId)) {
    console.warn('[Router] Access denied for:', pageId);
    const fallback = (typeof Auth.firstViewablePage === 'function') ? Auth.firstViewablePage() : null;
    if (fallback) {
      pageId = fallback;
    } else {
      showNoAccess();
      return;
    }
  }

  if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
    document.body.classList.toggle('user-mode', !Auth.isManager());
  }

  // Must happen BEFORE cleanupPage(): it empties every input in the old page.
  try { captureSharedProductSearch(_currentPageId); } catch (e) {}
  // A pending product edit only makes sense when the inventory page is reached.
  if (window.__zmtPendingProductEdit && pageId !== 'inventory') window.__zmtPendingProductEdit = null;

  cleanupPage();

  // Abort any pending fetch from previous navigation
  if (_pendingFetchController) {
    _pendingFetchController.abort();
    _pendingFetchController = null;
  }

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
  if (navItem) navItem.classList.add('active');

  const container = document.getElementById('pageContainer');
  if (!container) return;

  _currentPageId = pageId;
  // Lightweight navigation hook. Lets feature modules (e.g. the restaurant FAB)
  // react to a page change instantly instead of polling window._currentPageId on
  // a timer.
  try { window.dispatchEvent(new CustomEvent('zmt:navigate', { detail: { pageId } })); } catch (e) {}

  if (pageCache[pageId]) {
    container.innerHTML = pageCache[pageId];
    // Only the rebuilt page needs translating here: the global chrome was
    // already translated at boot / on language change. Re-parsing the whole
    // document on every navigation was the settings slowness.
    applyTranslation(container);
    executePageScript(pageId);
    return;
  }

  _pendingFetchController = new AbortController();
  const signal = _pendingFetchController.signal;

  fetch(`pages/${pageId}.html`, { signal })
    .then(res => { if (!res.ok) throw new Error('Page not found: ' + pageId); return res.text(); })
    .then(html => {
      // Ignore stale responses if user navigated elsewhere
      if (_currentPageId !== pageId) return;
      pageCache[pageId] = html;
      container.innerHTML = html;
      applyTranslation(container);
      executePageScript(pageId);
    })
    .catch(err => {
      if (err.name === 'AbortError') return;
      console.error('[Router] Error:', err);
      container.innerHTML = `<div class="page"><div class="page-header"><div class="page-header-content"><h1><i class="fas fa-exclamation-triangle"></i> خطأ</h1><p>تعذر تحميل الصفحة: ${pageId}</p></div></div></div>`;
    })
    .finally(() => {
      if (_pendingFetchController && _pendingFetchController.signal === signal) {
        _pendingFetchController = null;
      }
    });
}

// Page scripts execute in the shared global realm, so each one must be
// parsed exactly once per session. Re-navigating re-invokes the cached init
// hook instead of re-injecting the <script> (which would re-declare the
// module-level const/let bindings and throw "already been declared").
const _pageScriptsLoaded = Object.create(null);

// Seed the page scripts that index.html preloads as static <script> tags
// (supplier-returns.js, net-account.js, ...). Their globals already exist in the
// shared realm, so the router must invoke their cached init hook instead of
// injecting the file again — a second evaluation would re-declare top-level
// let/const bindings and throw "already been declared". Scanned from the DOM so
// it also covers anything else preloaded before app.js runs.
(function _seedPreloadedPageScripts() {
  try {
    var tags = document.querySelectorAll('script[src]');
    for (var i = 0; i < tags.length; i++) {
      var m = /js\/pages\/([^/?#]+)\.js(?:[?#].*)?$/.exec(tags[i].getAttribute('src') || '');
      if (m) _pageScriptsLoaded[m[1]] = true;
    }
  } catch (e) {}
})();

function executePageScript(pageId) {
  const scriptId = 'page-script-' + pageId;
  const old = document.getElementById(scriptId);
  if (old) old.remove();

  // A focused element that got removed from the DOM can leave keyboard input
  // frozen until the user clicks outside and back. Clear any such stale focus.
  const activeEl = document.activeElement;
  if (activeEl && activeEl !== document.body && activeEl.isConnected === false) {
    activeEl.blur();
    document.body.focus();
  }

  if (_pageScriptsLoaded[pageId]) {
    runPageInit(pageId);
    return;
  }

  const script = document.createElement('script');
  script.id = scriptId;
  script.src = 'js/pages/' + pageId + '.js';
  script.onload = () => {
    _pageScriptsLoaded[pageId] = true;
    // runPageInit() already calls setupBrandImages() on every path (cached and
    // freshly loaded scripts); calling it here as well repeated the work.
    runPageInit(pageId);
  };
  script.onerror = () => console.warn('[Router] No script for:', pageId);
  document.body.appendChild(script);
}

function runPageInit(pageId) {
  if (window.__zmtDigitizeInputs) window.__zmtDigitizeInputs(document);
  const fn = window['init_' + pageId.replace(/-/g, '_')];
  if (typeof fn === 'function') {
    try { fn(); } catch (e) { console.error('[Router] init error for', pageId, e); }
  }
  // Restore the shared product search after init_* has built its initial list.
  try { restoreSharedProductSearch(pageId); } catch (e) { console.warn('[Router] search restore failed', e); }

  // The thermal toggle lives in the sales header, which is injected on every
  // navigation — repaint its ON/OFF state so it reflects the saved setting.
  try { if (window.ThermalPrint) window.ThermalPrint.paintToggle(); } catch (e) {}
  setupBrandImages();

  // A low-stock "open product" click travels here once inventory.js is loaded.
  try {
    const pending = window.__zmtPendingProductEdit;
    if (pageId === 'inventory' && pending) {
      window.__zmtPendingProductEdit = null;
      if (typeof window.editInventoryItem === 'function') {
        setTimeout(function () {
          try { window.editInventoryItem(pending); } catch (e) { console.error('[Router] product edit failed', e); }
        }, 0);
      }
    }
  } catch (e) {}
}

// ===== GLOBAL escHtml (regex-based, 100x faster than DOM) =====
if (typeof window.escHtml === 'undefined') {
  window.escHtml = function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  };
}

if (typeof window.escAttr === 'undefined') {
  window.escAttr = function escAttr(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  };
}

// ===== SHARED PARTY LEGAL FIELDS (NIS / NIF / RC / ARTICLE) =====
// Every supplier/customer entry point (page forms, F2/F3 windows, quick entry
// and the sales quick-add) uses these four optional fields. The storage keys
// are exactly the ones printed by the invoice legal block, so one value always
// reaches every document without a migration. `prefix` is the HTML id prefix.
if (typeof window.ZmtPartyLegal === 'undefined') {
  window.ZmtPartyLegal = (function () {
    var FIELDS = [
      { key: 'rc', suffix: 'Rc' },
      { key: 'nif', suffix: 'Nif' },
      { key: 'nis', suffix: 'Nis' },
      { key: 'article', suffix: 'Article' }
    ];
    function normalize(rec) {
      var out = {};
      FIELDS.forEach(function (f) {
        out[f.key] = (rec && rec[f.key] != null) ? String(rec[f.key]).trim() : '';
      });
      return out;
    }
    function fill(prefix, rec) {
      FIELDS.forEach(function (f) {
        var el = document.getElementById(prefix + f.suffix);
        if (el) el.value = (rec && rec[f.key] != null) ? rec[f.key] : '';
      });
    }
    function read(prefix) {
      var out = {};
      FIELDS.forEach(function (f) {
        var el = document.getElementById(prefix + f.suffix);
        out[f.key] = el ? String(el.value || '').trim() : '';
      });
      return out;
    }
    return {
      fields: FIELDS,
      normalize: normalize,
      fill: fill,
      read: read,
      clear: function (prefix) { fill(prefix, {}); }
    };
  })();
}

// ===== PHONE BARCODE SCANNER BRIDGE =====
// A phone on the LAN (paired via Connection Settings) sends scanned codes over
// a WebSocket; the main process forwards them here as 'phs-scan'. This bridge
// injects the code into the current page's barcode scanner field and simulates
// the Enter keystroke exactly like a wired USB scanner would — the page's own
// handleXScan handler then does the real work (add a sales line, find a product,
// etc.).
const PHS_SCANNER_FIELD = {
  sales: 'salesBarcodeScan',
  inventory: 'invBarcodeScanner',
  'category-products': 'barcodeScannerInput',
  invoices: 'purBarcodeScanner',
  transfer: 'transferBarcodeScanner',
  'price-display': 'pdScannerField',
  employees: 'empScanInput',
  'quick-entry': 'qeScanInput',
};

// On these pages the mapped scanner field is authoritative: a phone scan must
// never land in whatever input happens to be focused (quantity, search, …).
// The sales page's field is also its smart name search, so it is pinned too.
const PINNED_SCANNER_PAGES = ['quick-entry', 'employees', 'sales'];

const PRODUCT_SCAN_PAGES = ['sales', 'inventory', 'invoices', 'transfer', 'category-products', 'price-display', 'quick-entry'];

// Less common barcode fields (modals, dialogs) that also act on Enter — a scan
// into these should behave like the wired scanner too.
const PHS_ENTER_FIELDS = ['editBarcodeScan'];

window.injectRemoteScan = function injectRemoteScan(code) {
  if (typeof code !== 'string' || !code) return;
  const fieldId = PHS_SCANNER_FIELD[_currentPageId];
  const mapped = fieldId ? document.getElementById(fieldId) : null;

  // The sales page keeps focus pinned on its scanner field; on other pages we
  // always use the mapped field id so a remote scan can never land in an
  // unrelated search box.
  let target = mapped || document.querySelector('.scanner-input, .sales-scanner-input');

  // If the operator has an editable field focused right now, that field is the
  // target — including fields inside dialogs (smart-add, edit barcode, …).
  // Pinned pages keep their own scanner field outside dialogs; inside a dialog
  // the focused field is the operator's real target.
  const active = document.activeElement;
  if (active && active.tagName && active !== document.body) {
    const tag = active.tagName.toUpperCase();
    const type = ((active.getAttribute && active.getAttribute('type')) || '').toLowerCase();
    const editable = ((tag === 'INPUT' || tag === 'TEXTAREA') && ['', 'text', 'search', 'tel', 'url', 'email', 'number'].indexOf(type) >= 0 && !active.disabled && !active.readOnly) ||
      (tag !== 'INPUT' && tag !== 'TEXTAREA' && !!active.isContentEditable);
    const inModal = !!(active.closest && active.closest('.modal-overlay'));
    // Pinned pages keep their own field outside a dialog; inside a dialog the
    // focused field is the operator's real target. All other pages always use
    // the focused editable field — including smart-add / edit dialogs.
    const pinned = PINNED_SCANNER_PAGES.indexOf(_currentPageId) >= 0;
    if (editable && (!pinned || inModal)) target = active;
  }

  if (!target) {
    try { window.dispatchEvent(new CustomEvent('zmt-phs-scan', { detail: { code, ignored: true } })); } catch (e) {}
    return;
  }

  const isMappedField = target === mapped || (function () {
    const id = (target.getAttribute && target.getAttribute('id')) || '';
    if (PHS_ENTER_FIELDS.indexOf(id) >= 0) return true;
    const cls = (target.getAttribute && target.getAttribute('class')) || '';
    return /scanner|barcode/i.test(cls);
  })();

  let field = (typeof window.cleanScannedCode === 'function') ? window.cleanScannedCode(code) : code;
  try {
    if (window.zmtEmployeeScanHook && _currentPageId !== 'employees') {
      const r = window.zmtEmployeeScanHook(field);
      if (r && r.consumed) {
        field = '';
        return;
      }
    }
  } catch (e) {}
  target.value = field;

  // Broad live events so every search/listener reacts exactly like a real
  // keyboard-typed input (search filters, oninput validators, …).
  ['input', 'change'].forEach((evType) => {
    try {
      target.dispatchEvent(new Event(evType, { bubbles: true }));
    } catch (e) {}
  });

  // Brief visual flash so the operator sees the injected code land.
  target.classList.add('phs-injected');
  setTimeout(() => target.classList.remove('phs-injected'), 500);

  // Show the status placeholder while the page's handler resolves the code.
  const status = target.nextElementSibling;
  if (status && status.classList && /status|result/i.test(status.className)) {
    status.textContent = (typeof t === 'function') ? t('common.scanning') || '…' : '…';
  }

  // Only the page's own scanner fields consume the Enter keystroke (add a sales
  // line, look up by barcode, …). Generic search boxes react to the input event
  // above; blindly sending Enter could submit a form or confirm a dialog.
  if (isMappedField) {
    requestAnimationFrame(() => {
      try {
        target.focus({ preventScroll: true });
        target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
        target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
      } catch (e) {}
    });
  }

}
window.zmtEmployeeScanHook = function zmtEmployeeScanHook(code) {
  try {
    if (typeof code !== 'string' || !code) return { consumed: false };
    const cleaned = (typeof window.cleanScannedCode === 'function') ? window.cleanScannedCode(code, { scanner: true }) : code;
    if (!cleaned) return { consumed: false };
    let emp = null;
    if (DB && typeof DB.getEmployeeByBarcode === 'function') emp = DB.getEmployeeByBarcode(cleaned);
    if (!emp) return { consumed: false };
    const page = window._currentPageId || '';
    try {
      const prod = (DB && typeof DB.getProductByBarcode === 'function') ? DB.getProductByBarcode(cleaned) : null;
      if (prod && PRODUCT_SCAN_PAGES.indexOf(page) >= 0) return { consumed: false };
    } catch (e) {}
    if (emp.status === 'inactive') {
      try { if (window._empToast) window._empToast('<i class="fas fa-exclamation-triangle"></i> ' + (emp.name||'') + ' — ' + (typeof t==='function'?t('employees.statusInactive'):'موقوف'), false); } catch (e) {}
      try { if (window.ZmtSound && window.ZmtSound.error) window.ZmtSound.error(); } catch (e) {}
      return { consumed: true, employee: emp, state: 'inactive' };
    }
    if (typeof window.empApplyScan === 'function') return window.empApplyScan(cleaned);
    return { consumed: false };
  } catch (e) { return { consumed: false }; }
};

function setupPhoneScannerBridge() {
  const api = window.electronAPI;
  if (!api || typeof api.onPhsScan !== 'function') return;
  api.onPhsScan((s) => {
    if (s && s.code) {
      window.injectRemoteScan(String(s.code));
      console.log('[PHS] remote scan received:', s.code.slice(0, 30), s.deviceName || '');
    }
  });
}

// ===== PHONE POS («البيع») BRIDGE =====
// Phones send { type:'req' } over the LAN socket; the main process relays each
// one here. The DESKTOP renderer owns the database, so every request is
// executed HERE (synchronously) through PhoneSaleService and the answer is
// sent back to the main process, which forwards it to the phone.
function setupPhoneSaleBridge() {
  const api = window.electronAPI;
  if (!api) return;
  const apply = (st) => {
    window.phoneSaleEnabled = !!(st && st.enabled);
  };
  if (typeof api.onPsaleEnabled === 'function') {
    api.onPsaleEnabled(apply);
  }
  if (typeof api.psaleGetEnabled === 'function') {
    api.psaleGetEnabled().then(apply).catch(() => {});
  }
  if (typeof api.onPsaleRequest === 'function' && typeof window.PhoneSaleService !== 'undefined') {
    api.onPsaleRequest((p) => {
      if (!p || !p.requestId || !p.req) return;
      try {
        const data = window.PhoneSaleService.handle(p.req, p.payload || {});
        api.psaleRespond(p.requestId, { ok: true, data });
      } catch (e) {
        const err = e || {};
        api.psaleRespond(p.requestId, { ok: false, error: { code: err.code || 'ERROR', msg: err.msg || err.message || String(err) } });
      }
    });
  }
}

// ===== GLOBAL BRAND LOOKUP (built-in + custom brands) =====
if (typeof window.findBrandById === 'undefined') {
  window.findBrandById = function findBrandById(id) {
    try {
      const builtins = (typeof BRANDS !== 'undefined' && BRANDS) ? [...BRANDS.global, ...BRANDS.chinese] : [];
      const b = builtins.find(x => x.id === id);
      if (b) return b;
      const raw = localStorage.getItem('zmt_custom_brands');
      const list = raw ? JSON.parse(raw) : [];
      return list.find(x => x.id === id) || null;
    } catch (e) { return null; }
  };
}

// ===== REFERENCE -> IMAGE SEARCH IN EXTERNAL BROWSER =====
// Clicking a product's reference opens the default browser and runs an image
// search for that reference (e.g. an auto-parts number). Works for any product
// that has a reference value; no image field is required.
function openReferenceImageSearch(ref) {
  if (!ref) return;
  const url = 'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(String(ref).trim());
  if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
    window.electronAPI.openExternal(url);
  } else {
    window.open(url, '_blank');
  }
}

// ===== PRODUCT CARD KEYBOARD SHORTCUTS (hover + physical key, layout-independent) =====
function _bindProdShortcuts() {
  if (window._prodCtxBound) return;
  window._prodCtxBound = true;
  document.addEventListener('mouseover', function (e) {
    const card = e.target.closest('.prod-card');
    window._prodHoveredId = (card && card.dataset.id) ? card.dataset.id : null;
  });
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Never hijack a key while the user is typing inside a text field (search
    // boxes, barcode scanner inputs, product forms …). Typing Arabic 'ر' maps to
    // KeyR on an AZERTY layout, so without this guard searching would keep opening
    // the external reference browser and steal focus. Shortcuts still fire when a
    // card is hovered while focus is outside any input.
    if (e.target && e.target.tagName) {
      const tag = e.target.tagName.toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
    }
    const openModal = Array.prototype.some.call(document.querySelectorAll('.modal-overlay'), function (m) { return m.style.display === 'flex'; });
    if (openModal) return;
    const id = window._prodHoveredId;
    if (!id) return;
    let action = null;
    switch (e.code) {
      case 'KeyE': action = 'edit'; break;
      case 'KeyP': action = 'barcode'; break;
      case 'KeyR': action = 'reference'; break;
      case 'KeyI': action = 'details'; break;
    }
    if (!action) return;
    e.preventDefault();
    if (action === 'details') {
      // Open the full product details (sales / purchase history + cheapest
      // supplier advisory). Follows the same permission as the context menu.
      if (_prodCtxCanDetails() && typeof showProductDetails === 'function') showProductDetails(id);
    } else if (action === 'edit') {
      // Edit the hovered product. The active page registers its own edit
      // function (inventory → editInventoryItem, brand products → editProduct).
      var editFn = window._prodEditShortcut || window.editInventoryItem || window.editProduct;
      if (typeof editFn === 'function') editFn(id);
    } else if (action === 'barcode') {
      openPrintBarcodeModal(id);
    } else if (action === 'reference') {
      const p = DB.getProduct(id);
      const ref = p && (p.reference || p.barcode);
      if (ref) openReferenceImageSearch(ref);
    }
  });
}

// ===== PRODUCT CARD CONTEXT MENU (right-click) =====
// A single reusable menu shared by the inventory and brand-products screens.
// Per-page actions (edit / delete) are registered via window._prodCtxHandlers.

function _prodCtxCanDetails() {
  if (typeof Auth === 'undefined') return true;
  if (Auth.isManager()) return true;
  const perms = Auth.getPermissions();
  return !!(perms && perms['product-details'] && perms['product-details'].view === true);
}

function _prodCtxEnsure() {
  if (document.getElementById('prodCardCtx')) return;
  const m = document.createElement('div');
  m.id = 'prodCardCtx';
  m.className = 'prod-card-ctx';
  const acts = [
    ['details', 'pd-details', t('productDetails.title') || 'تفاصيل المنتج'],
    ['barcode', '', 'طباعة باركود'],
    ['edit', '', t('common.edit') || 'تعديل'],
    ['return', '', t('supplierReturns.modalTitle')],
    ['delete', 'prod-card-ctx-danger', t('common.delete') || 'حذف'],
  ];
  m.innerHTML = acts.map(([a, cls, label]) =>
    `<div class="prod-card-ctx-item ${cls}" data-action="${a}"${a === 'details' ? ' data-always="1"' : ''}><i class="fas ${_prodCtxIcon(a)}"></i><span>${label}</span></div>`
  ).join('');
  m.addEventListener('click', function (e) {
    const item = e.target.closest ? e.target.closest('.prod-card-ctx-item') : null;
    if (!item) return;
    const id = m.dataset.prodId;
    const action = item.dataset.action;
    _prodCtxHide();
    if (!id) return;
    _prodCtxRun(id, action);
  });
  document.body.appendChild(m);
}

function _prodCtxIcon(action) {
  switch (action) {
    case 'details': return 'fa-info-circle';
    case 'barcode': return 'fa-barcode';
    case 'edit': return 'fa-edit';
    case 'return': return 'fa-undo-alt';
    case 'delete': return 'fa-trash';
    default: return 'fa-circle';
  }
}

function _prodCtxShow(id, x, y) {
  _prodCtxEnsure();
  const m = document.getElementById('prodCardCtx');
  if (!m) return;
  const h = window._prodCtxHandlers || {};
  m.dataset.prodId = id;
  m.querySelectorAll('.prod-card-ctx-item').forEach(function (item) {
    const action = item.dataset.action;
    let show = true;
    if (action === 'details') {
      show = _prodCtxCanDetails();
    } else if (action === 'barcode') {
      show = true;
    } else if (action === 'edit') {
      show = h.canEdit && typeof h.edit === 'function';
    } else if (action === 'return') {
      show = h.canRet && typeof h.ret === 'function';
    } else if (action === 'delete') {
      show = h.canDel && typeof h.del === 'function';
    }
    item.style.display = show ? '' : 'none';
  });
  m.style.display = 'block';
  const w = m.offsetWidth, hgt = m.offsetHeight;
  const vw = window.innerWidth, vh = window.innerHeight;
  let left = x, top = y;
  if (left + w > vw - 8) left = vw - w - 8;
  if (top + hgt > vh - 8) top = vh - hgt - 8;
  m.style.left = Math.max(8, left) + 'px';
  m.style.top = Math.max(8, top) + 'px';
}

function _prodCtxHide() {
  const m = document.getElementById('prodCardCtx');
  if (m) m.style.display = 'none';
}

function _prodCtxRun(id, action) {
  const h = window._prodCtxHandlers || {};
  if (action === 'details') { showProductDetails(id); return; }
  if (action === 'barcode') { if (typeof window.openPrintBarcodeModal === 'function') window.openPrintBarcodeModal(id); return; }
  if (action === 'edit' && typeof h.edit === 'function') { h.edit(id); return; }
  if (action === 'return' && typeof h.ret === 'function') { h.ret(id); return; }
  if (action === 'delete' && typeof h.del === 'function') { h.del(id); return; }
}

function _bindProductCtxMenu() {
  if (window._prodCtxMenuBound) return;
  window._prodCtxMenuBound = true;
  document.addEventListener('contextmenu', function (e) {
    if (!window._prodCtxHandlers) return;
    const card = e.target.closest ? e.target.closest('.prod-card') : null;
    if (!card || !card.dataset.id) return;
    e.preventDefault();
    _prodCtxShow(card.dataset.id, e.clientX, e.clientY);
  });
  document.addEventListener('click', function (e) {
    const m = document.getElementById('prodCardCtx');
    if (m && m.style.display === 'block' && !m.contains(e.target)) _prodCtxHide();
  });
  document.addEventListener('scroll', _prodCtxHide, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') _prodCtxHide(); });
}

// ===== PRODUCT DETAILS MODAL (sales / purchases / returns) =====
function showProductDetails(productId) {
  const prod = DB.getProduct(productId);
  if (!prod) { alert(t('supplierReturns.noProduct') || 'المنتج غير موجود'); return; }
  const PD = (LANG[__lang] && LANG[__lang].productDetails) || LANG.ar.productDetails;
  const brand = (typeof findBrandById === 'function') ? findBrandById(prod.brandId) : null;
  const fmtDate = function (ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ar-EG-u-nu-latn');
  };
  const fmtMoney = window.fmtMoney;
  const fmtDateTime = function (ts) {
    if (!ts) return '—';
    // A value carrying no wall-clock part (e.g. '2026-01-15') renders the date
    // only; anything else (timestamp / ISO with time) gets date + time.
    if (typeof ts === 'string' && !/\d{1,2}:\d{2}/.test(ts) && !/^\s*\d{5,}\s*$/.test(ts) && !/[T ]\d{1,2}[:]/.test(ts)) {
      const dd = new Date(ts);
      if (!isNaN(dd.getTime())) {
        try { return dd.toLocaleDateString('ar-EG-u-nu-latn'); } catch (e) { return dd.toLocaleDateString(); }
      }
    }
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    let datePart;
    try { datePart = d.toLocaleDateString('ar-EG-u-nu-latn'); } catch (e) { datePart = d.toLocaleDateString(); }
    let timePart;
    try { timePart = d.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' }); } catch (e) { timePart = d.toLocaleTimeString(); }
    return datePart + ' · ' + timePart;
  };

  // The same article can live in several stock rows (smart split keeps a new
  // batch when its real cost differs). The «i» details are an article view, so
  // every row sharing name + barcode + reference is merged here: quantities and
  // returns are summed and the histories are unioned.
  const siblings = (DB.getProductIdentityGroup ? DB.getProductIdentityGroup(prod.id) : []) || [];
  const groupProds = siblings.length ? siblings : [prod];
  const groupIds = groupProds.map(function (p) { return p.id; });
  const totalQty = Math.round(groupProds.reduce(function (sum, p) {
    return sum + (Number(p.quantity) || 0);
  }, 0) * 1000) / 1000;
  let costQty = 0, costSum = 0, simpleCost = 0;
  groupProds.forEach(function (p) {
    const q = Number(p.quantity) || 0;
    const bp = Number(p.buyPrice) || 0;
    simpleCost += bp;
    if (q > 0) { costQty += q; costSum += bp * q; }
  });
  const avgBuy = costQty > 0 ? (costSum / costQty) : (groupProds.length ? simpleCost / groupProds.length : 0);

  const purchases = (DB.getProductPurchaseHistory ? DB.getProductPurchaseHistory(groupIds) : []) || [];
  const sales = (DB.getProductSalesHistory ? DB.getProductSalesHistory(groupIds) : []) || [];
  const returnsCount = DB.getProductReturnsCount ? DB.getProductReturnsCount(groupIds) : 0;
  // Cheapest-supplier advisory: group purchase rows by supplier, keep the
  // lowest unit price ever paid (tie-break: most recent purchase) so the user
  // instantly knows which supplier gives the best price for this product.
  const supStats = {};
  let adviceHtml = '';
  (purchases || []).forEach(function (pr) {
    if (!pr.supplierId || !pr.supplierName) return;
    const stat = supStats[pr.supplierId] || (supStats[pr.supplierId] = { name: pr.supplierName, bestPrice: Infinity, lastDate: 0, count: 0 });
    const price = Number(pr.price) || 0;
    if (price > 0 && price < stat.bestPrice) stat.bestPrice = price;
    const ts = Number(pr.date) || 0;
    if (ts > stat.lastDate) stat.lastDate = ts;
    stat.count++;
  });
  const supList = Object.keys(supStats)
    .map(function (k) { return supStats[k]; })
    .filter(function (s) { return s.bestPrice !== Infinity; })
    .sort(function (a, b) {
      if (a.bestPrice !== b.bestPrice) return a.bestPrice - b.bestPrice;
      return b.lastDate - a.lastDate;
    });
  if (supList.length) {
    const best = supList[0];
    const compareRow = supList.map(function (s) {
      return '<span class="pd-advice-sup">' + escHtml(s.name) + ' <b>DA' + fmtMoney(s.bestPrice) + '</b></span>';
    }).join('<span class="pd-advice-sep">·</span>');
    adviceHtml = `
      <div class="pd-advice" role="note">
        <div class="pd-advice-row">
          <span class="pd-advice-ico"><i class="fas fa-lightbulb"></i></span>
          <span class="pd-advice-txt"><b>${escHtml(PD.adviceTitle)}:</b> ${escHtml(PD.adviceFrom)} <b class="pd-advice-sup-name">${escHtml(best.name)}</b> — ${escHtml(PD.adviceLowest)} <b>DA${fmtMoney(best.bestPrice)}</b></span>
        </div>
        ${supList.length > 1 ? '<div class="pd-advice-cmp"><span class="pd-advice-cmp-label">' + escHtml(PD.adviceCompare) + ':</span> ' + compareRow + '</div>' : ''}
      </div>`;
  }

  // Header: product summary tiles
  let body = `
    <div class="pd-head">
      <div class="pd-head-title">
        <div class="pd-head-name">${escHtml(prod.name) || '—'}</div>
        <div class="pd-head-meta">
          <span><i class="fas fa-barcode"></i> ${escHtml(prod.barcode || '—')}</span>
          <span><i class="fas fa-trademark"></i> ${escHtml(brand ? brand.name : (prod.brandId || '—'))}</span>
          ${prod.reference ? `<span><i class="fas fa-hashtag"></i> ${escHtml(prod.reference)}</span>` : ''}
          ${groupProds.length > 1 ? `<span class="pd-batches-chip"><i class="fas fa-layer-group"></i> ${groupProds.length} ${escHtml(PD.batches || 'دفعات')}</span>` : ''}
        </div>
      </div>
      <div class="pd-stat">
        <span class="pd-stat-label">${t('inventory.col4')}</span>
        <b class="${totalQty < 5 ? 'pd-stat-danger' : ''}">${totalQty}</b>
      </div>
      <div class="pd-stat">
        <span class="pd-stat-label">${t('inventory.col5')}</span>
        <b>${(typeof Auth !== 'undefined' && Auth.buyPriceVisible && Auth.buyPriceVisible()) ? 'DA' + fmtMoney(avgBuy) : '••••'}</b>
      </div>
      <div class="pd-stat">
        <span class="pd-stat-label">${t('inventory.col6')}</span>
        <b>DA${fmtMoney(prod.sellPrice)}</b>
      </div>
      <div class="pd-stat">
        <span class="pd-stat-label">${t('quickEntry.wholesalePrice')}</span>
        <b>DA${fmtMoney(prod.wholesalePrice)}</b>
      </div>
      <div class="pd-stat pd-stat-returns ${returnsCount > 0 ? 'has-returns' : ''}">
        <span class="pd-stat-label">${PD.returnsCount}</span>
        <b>${returnsCount}</b>
      </div>
    </div>
  `;
  body += adviceHtml;

  // Sales history table
  let salesRows = '';
  if (sales.length === 0) {
    salesRows = `<tr><td colspan="6" class="pd-empty">${PD.noData}</td></tr>`;
  } else {
    salesRows = sales.map(function (s) {
      return `<tr>
        <td>${fmtDate(s.date)}</td>
        <td class="mono">${escHtml(s.invoiceNumber || '—')}</td>
        <td>${escHtml(s.customerName || '—')}</td>
        <td>${s.qty}</td>
        <td>DA${fmtMoney(s.price)}</td>
        <td>DA${fmtMoney(s.total)}</td>
      </tr>`;
    }).join('');
  }
  body += `
    <div class="pd-section">
      <h4 class="pd-section-title"><i class="fas fa-chart-line"></i> ${PD.salesHistory}</h4>
      <table class="pd-table">
        <thead><tr>
          <th>${PD.colDate}</th><th>${PD.colInvoice}</th><th>${PD.colCustomer}</th>
          <th>${PD.colQty}</th><th>${PD.colPrice}</th><th>${PD.colTotal}</th>
        </tr></thead>
        <tbody>${salesRows}</tbody>
      </table>
    </div>
  `;

  // Purchase history table
  let purchaseRows = '';
  if (purchases.length === 0) {
    purchaseRows = `<tr><td colspan="6" class="pd-empty">${PD.noData}</td></tr>`;
  } else {
    purchaseRows = purchases.map(function (pr) {
      return `<tr>
        <td>${fmtDateTime(pr.date)}</td>
        <td class="mono">${escHtml(pr.invoiceNumber || '—')}</td>
        <td>${escHtml(pr.supplierName || '—')}</td>
        <td>${pr.qty}</td>
        <td>DA${fmtMoney(pr.price)}</td>
        <td>DA${fmtMoney(pr.total)}</td>
      </tr>`;
    }).join('');
  }
  body += `
    <div class="pd-section">
      <h4 class="pd-section-title"><i class="fas fa-truck-loading"></i> ${PD.purchaseHistory}</h4>
      <table class="pd-table">
        <thead><tr>
          <th>${PD.colDate}</th><th>${PD.colInvoice}</th><th>${PD.colSupplier}</th>
          <th>${PD.colQty}</th><th>${PD.colBuyPrice}</th><th>${PD.colTotal}</th>
        </tr></thead>
        <tbody>${purchaseRows}</tbody>
      </table>
    </div>
  `;

  // Open as a modal (self-contained — works on every page)
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'display:flex;align-items:center;justify-content:center;position:fixed;inset:0;z-index:100030;background:rgba(0,0,0,0.5)';
  const box = document.createElement('div');
  box.className = 'modal-box';
  box.style.cssText = 'background:#fff;border-radius:14px;max-width:860px;max-height:90vh;width:calc(100vw - 32px);overflow:hidden;display:flex;flex-direction:column;position:relative';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  const header = document.createElement('div');
  header.className = 'modal-header';
  const h = document.createElement('h3');
  h.innerHTML = '<i class="fas fa-box" style="margin-left:8px"></i>' + escHtml(PD.title);
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close'; closeBtn.innerHTML = '×'; closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close');
  header.appendChild(h); header.appendChild(closeBtn);
  const bodyEl = document.createElement('div');
  bodyEl.className = 'modal-body';
  bodyEl.style.cssText = 'padding:20px;max-height:calc(90vh - 60px);overflow:auto';
  bodyEl.innerHTML = body;
  box.appendChild(header); box.appendChild(bodyEl); overlay.appendChild(box);
  function _pdClose() {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    document.removeEventListener('keydown', _pdOnKey);
  }
  function _pdOnKey(e) { if (e.key === 'Escape') _pdClose(); }
  closeBtn.addEventListener('click', _pdClose);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) _pdClose(); });
  document.addEventListener('keydown', _pdOnKey);
  document.body.appendChild(overlay);
}

function _registerProdCtxHandlers(handlers) {
  window._prodCtxHandlers = handlers || {};
}

// ===== FIXED PRODUCT QUICK ADD (name + optional barcode + sell price only) =====
// Creates a non-quantified product (restaurant-style menu item): quantity 0, no
// buy price, no wholesale price, no invoice and no ledger entry.
function quickAddProduct(opts) {
  const name = String((opts && opts.name) || '').trim();
  if (!name) return { ok: false, error: t('inventory.enterName') || 'أدخل اسم المنتج' };
  const sellPrice = parseFloat(opts && opts.sellPrice);
  if (isNaN(sellPrice) || sellPrice < 0) return { ok: false, error: t('inventory.invalidSell') || 'أدخل سعر بيع صحيح' };
  const family = String((opts && opts.family) || '').trim();
  if (window.getPharmacyMode && window.getPharmacyMode() && !family) {
    return { ok: false, error: t('inventory.familyRequired') };
  }
  const barcode = String((opts && opts.barcode) || '').trim();
  if (barcode) {
    const matches = DB.findProductsByBarcode(barcode) || [];
    const conflict = matches.find(p => !DB.isSameProductIdentity(p, { name, brandId: opts.brandId, barcode }));
    if (conflict) return { ok: false, error: `${t('inventory.barcodeConflict') || 'هذا الباركود مسجّل لمنتج آخر'}: ${conflict.name} (${conflict.barcode})` };
    const same = matches.find(p => DB.isSameProductIdentity(p, { name, brandId: opts.brandId, barcode }));
    if (same) {
      const changes = { sellPrice, fixed: true };
      if (family) changes.family = family;
      if (opts && opts.extraPrices && typeof opts.extraPrices === 'object' && Object.keys(opts.extraPrices).length) {
        changes.extraPrices = opts.extraPrices;
      }
      DB.updateProduct(same.id, changes);
      return { ok: true, product: same, updated: true };
    }
  }
  const prod = DB.addProduct({
    name, barcode: barcode || '',
    brandId: opts.brandId || null,
    buyPrice: 0, sellPrice, wholesalePrice: 0,
    extraPrices: (opts && opts.extraPrices) || {},
    quantity: 0,
    fixed: true,
    family,
    reference: '', countryOfOrigin: '', mark: '', storageLocation: '', expiryDate: '',
    minPrice: 0,
  }, { source: 'quick-add-product' });
  return { ok: true, product: prod };
}

// Bind the shared product context menu once for the whole app.
_bindProductCtxMenu();

// Render a clickable reference cell. Returns '-' when there is no reference.
function referenceCellHTML(ref) {
  if (!ref) return '-';
  const safe = window.escAttr(ref);
  const text = window.escHtml(ref);
  return '<span class="ref-link" data-ref="' + safe + '" title="بحث صورة للمرجع" style="cursor:pointer;color:var(--primary);text-decoration:underline">' + text + '</span>';
}

// Single delegated click handler (bound once) so the reference stays clickable
// even after tables re-render. stopPropagation prevents row-selection handlers
// (e.g. add-to-cart) from firing when the reference itself is clicked.
if (!window.__refLinkBound) {
  window.__refLinkBound = true;
  document.addEventListener('click', function (e) {
    const el = e.target.closest ? e.target.closest('.ref-link') : null;
    if (el && el.dataset && el.dataset.ref) {
      e.stopPropagation();
      openReferenceImageSearch(el.dataset.ref);
    }
  });
}

// ===== NO-ACCESS SCREEN (user with zero viewable pages) =====
function showNoAccess() {
  cleanupPage();
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const container = document.getElementById('pageContainer');
  if (!container) return;
  _currentPageId = 'noaccess';
  container.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;gap:14px;text-align:center;padding:24px;">
    <i class="fas fa-ban" style="font-size:56px;color:#dc3545;opacity:.85"></i>
    <h2 style="margin:0">${t('common.noAccessHint')}</h2>
  </div>`;
}

// ===== UTILITIES =====
function debounce(fn, ms) { let t; return function() { clearTimeout(t); const a=arguments, ctx=this; t = setTimeout(() => fn.apply(ctx, a), ms); }; }

// Normalize a search query: whitespace-only (or empty) input counts as no filter
function normSearch(v) { return String(v || '').trim(); }

// ===== SMART PRODUCT SEARCH =====
// Multi-word search: every word in the query must match the product name or
// barcode, and results can be ranked by match quality (word-start matches rank
// above plain substrings, name above barcode).

// Escape regex special characters so user input is treated literally.
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Normalize text for matching: lowercase, strip diacritics/tatweel, fold
// common Arabic letter variants (أ/إ/آ→ا, ة→ه, ى→ي) and collapse whitespace.
function normalizeSearchText(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

// Split a query into individual search tokens (words).
function searchTokens(q) {
  return normalizeSearchText(q).split(' ').filter(Boolean);
}

// True when every token of the query matches the product (name, barcode, or any
// other field). Delegates to productSearchScore so the two never diverge.
function productMatchesQuery(name, barcode, q, mark, reference, country) {
  return productSearchScore(name, barcode, q, mark, reference, country) > 0;
}

// Rank a product for a query. Returns 0 when the product does not match.
// Higher is better: word-start match in name (4) > name substring (3) >
// barcode prefix (2) > barcode substring (1), summed across tokens, plus a
// tie-breaker boost when the whole query matches the start of the name.
function productSearchScore(name, barcode, q, mark, reference, country) {
  const tokens = searchTokens(q);
  if (!tokens.length) return 1;
  const n = normalizeSearchText(name);
  const b = normalizeSearchText(barcode);
  const bc = (typeof canonBarcode === 'function') ? canonBarcode(barcode) : '';
  const m = mark ? normalizeSearchText(mark) : '';
  const r = reference ? normalizeSearchText(reference) : '';
  const c = country ? normalizeSearchText(country) : '';
  const fullQuery = normalizeSearchText(q);
  let score = 0;
  for (const t of tokens) {
    const nIdx = n.indexOf(t);
    if (nIdx !== -1) {
      score += (nIdx === 0 || n[nIdx - 1] === ' ') ? 4 : 3;
    } else {
      const bIdx = b.indexOf(t);
      if (bIdx !== -1) {
        score += (bIdx === 0) ? 2 : 1;
      } else if (bc && bc.indexOf(t) !== -1) {
        score += (bc.indexOf(t) === 0) ? 2 : 1;
      } else if (m && m.indexOf(t) !== -1) {
        // match against the product's mark / sub-brand
        score += 2;
      } else if (r && r.indexOf(t) !== -1) {
        // match against the product's reference
        score += 2;
      } else if (c && c.indexOf(t) !== -1) {
        // match against the product's country of origin
        score += 2;
      } else {
        return 0;
      }
    }
  }
  if (fullQuery && (n.startsWith(fullQuery) || (m && m.startsWith(fullQuery)))) score += 10;
  return score;
}

// ===== FAST SEARCH CACHE =====

// Normalized search text computed ONCE per product object (WeakMap: never
// serialized to disk, GC'd with the record) and reused for every keystroke.
// At ~1M rows this turns the per-keypress O(rows * normalize(fields)) cost into
// O(rows * indexOf) on precomputed strings.
const _searchNormCache = new WeakMap();
function _productSearchCache(p) {
  if (!p) return '';
  let norm = _searchNormCache.get(p);
  if (norm === undefined) {
    norm = normalizeSearchText(
      [p.name, p.nameLatin, p.barcode, p.mark, p.reference, p.countryOfOrigin]
        .filter(Boolean)
        .join(' ')
    );
    _searchNormCache.set(p, norm);
  }
  return norm;
}

// Incremental-aware search: inexpensive token pre-filter over cached normalized
// text, then the real score only for candidates, capped at `cap` results so the
// page never renders an unbounded list. Without a query it returns the source
// array unchanged so infinite scroll / windowing still browses the full set.
function productsMatchingQuery(products, q, cap) {
  const limit = (cap && cap > 0) ? cap : 50;
  const qs = String(q || '').trim();
  if (!qs) return products || [];
  const tokens = searchTokens(qs);
  if (!tokens.length) return products || [];
  const out = [];
  for (const p of (products || [])) {
    if (!p) continue;
    const norm = _productSearchCache(p);
    let ok = true;
    for (const t of tokens) {
      if (!norm || norm.indexOf(t) === -1) { ok = false; break; }
    }
    if (!ok) continue;
    const s = productSearchScore(p.name, p.barcode, qs, p.mark, p.reference, p.countryOfOrigin);
    if (s <= 0) continue;
    out.push({ p, s });
    if (out.length >= limit) break;
  }
  out.sort((a, b) => {
    const aOos = (a.p.quantity || 0) <= 0 ? 1 : 0;
    const bOos = (b.p.quantity || 0) <= 0 ? 1 : 0;
    return (aOos - bOos) || (b.s - a.s);
  });
  return out.map(x => x.p);
}

// ===== BARCODE HELPERS =====

// Normalize a barcode for storage/display: convert Arabic-Indic (٠-٩), Persian
// (۰-۹) and full-width (０-９) digits to ASCII 0-9, and strip whitespace, NBSP,
// bidi marks, zero-width characters and control characters. Original letter
// case is preserved so the value shown/printed matches what was entered.
function normBarcode(v) {
  return String(v || '')
    .replace(/[\u0660-\u0669]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x0660 + 48))
    .replace(/[\u06F0-\u06F9]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x06F0 + 48))
    .replace(/[\uFF10-\uFF19]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 48))
    .replace(/[\s\u00A0\u2000-\u200A\u200E\u200F\u202A-\u202E\u200B\u200C\u200D\uFEFF\u0000-\u001F\u007F-\u009F]/g, '');
}

// Canonical form used for indexing/comparison: normalized + uppercased.
function canonBarcode(v) {
  return normBarcode(v).toUpperCase();
}

function _mapChars(s, map) {
  let out = '';
  for (const ch of s) {
    const lo = ch.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(map, lo)) {
      const m = map[lo];
      out += (ch === lo) ? m : m.toUpperCase();
    } else {
      out += ch;
    }
  }
  return out;
}

// French AZERTY layout reverse-mapping (scan output -> ASCII).
var FR_DIGIT_MAP = { '&': '1', '\u00e9': '2', '"': '3', "'": '4', '(': '5', '-': '6', '\u00e8': '7', '_': '8', '\u00e7': '9', '\u00e0': '0' };
var FR_LETTER_MAP = { 'a': 'q', 'q': 'a', 'z': 'w', 'w': 'z', ';': 'm', ',': 'm' };

function frLayoutToAscii(s) {
  return _mapChars(normBarcode(s), Object.assign({}, FR_DIGIT_MAP, FR_LETTER_MAP));
}

// Arabic (101) layout reverse-mapping (scan output -> QWERTY keys).
var AR_TO_EN = {
  '\u0636':'q', '\u0635':'w', '\u062b':'e', '\u0642':'r', '\u0641':'t',
  '\u063a':'y', '\u0639':'u', '\u0647':'i', '\u062e':'o', '\u062d':'p',
  '\u062c':'[', '\u062f':']', '\u0634':'a', '\u0633':'s', '\u064a':'d',
  '\u0628':'f', '\u0644':'g', '\u0627':'h', '\u062a':'j', '\u0646':'k',
  '\u0645':'l', '\u0643':';', '\u0637':"'", '\u0626':'z', '\u0621':'x',
  '\u0624':'c', '\u0631':'v', '\u0649':'n', '\u0629':'m'
};

function arLayoutToAscii(s) {
  const norm = normBarcode(s);
  const noLig = norm.replace(/\u0644\u0627/g, 'b');
  return _mapChars(noLig, AR_TO_EN);
}

// Ordered list of candidate forms of a scanned/typed barcode, tried in order
// by tolerant lookups: raw, canonical, French-layout, Arabic-layout.
function barcodeVariants(code) {
  const raw = String(code || '').trim();
  const out = [];
  for (const v of [raw, canonBarcode(raw), canonBarcode(frLayoutToAscii(raw)), canonBarcode(arLayoutToAscii(raw))]) {
    if (v && out.indexOf(v) === -1) out.push(v);
  }
  return out;
}

// Clean a scanned barcode value so the correct characters show in the field and
// are stored.
//
// By default (opts.scanner !== true) it auto-detects the two common Algerian
// keyboard-layout garbles (French AZERTY symbols and Arabic letters/digits)
// only when they are clearly present, preserving the current behaviour for
// manual entry.
//
// When opts.scanner === true the layout is taken from the "Barcode input
// layout" setting (auto / azerty / arabic / qwerty) so a reader can force the
// correct mapping regardless of the scanned text's content, and an optional
// forced letter-case is applied. The mapping itself is case-insensitive, so it
// works whether CAPS LOCK is on or off and whether the scanner emits upper or
// lower case letters.
function cleanScannedCode(raw, opts) {
  const s = normBarcode(raw);
  if (!s) return '';
  const scanner = !!(opts && opts.scanner);
  const mode = scanner
    ? ((typeof localStorage !== 'undefined') ? (localStorage.getItem('zmt_barcode_input_layout') || 'auto') : 'auto')
    : 'auto';

  let out = s;
  if (mode === 'auto') {
    if (/[\u0600-\u06FF]/.test(s)) out = arLayoutToAscii(s);
    else {
      const hasHardFr = /[&\u00e9\u00e8\u00e7\u00e0]/.test(s);
      const pureFrSymbols = /^[\u0022\u0027\u0028\u005f\u002d&\u00e9\u00e8\u00e7\u00e0]+$/.test(s);
      if (hasHardFr || pureFrSymbols) out = frLayoutToAscii(s);
    }
  } else if (mode === 'azerty') {
    out = frLayoutToAscii(s);
  } else if (mode === 'arabic') {
    out = arLayoutToAscii(s);
  }
  // mode 'qwerty' (or any other value) => out = s (no transform)

  if (scanner) {
    const caseMode = (typeof localStorage !== 'undefined') ? (localStorage.getItem('zmt_barcode_force_case') || 'none') : 'none';
    if (caseMode === 'upper') out = out.toUpperCase();
    else if (caseMode === 'lower') out = out.toLowerCase();
  }
  return out;
}

// ===== PRODUCT EXPIRY SETTINGS (shared by inventory/quick-entry/invoices/expiry) =====
window.getExpirySettings = function () {
  return {
    enabled: (localStorage.getItem('zmt_expiry_enabled') || '1') !== '0',
    required: localStorage.getItem('zmt_expiry_required') === '1',
    warnDays: parseInt(localStorage.getItem('zmt_expiry_warn_days') || '30', 10) || 30,
  };
};

// ===== DEBT ALERTS SETTINGS (تنبيهات الديون) =====
// Mirrors the expiry pattern: a tiny localStorage reader plus a once-a-day
// start-up reminder. The heavy lifting (scope/duration + critical list) lives in
// js/pages/debt-details.js and is reached through window.ddShowDebtAlertReminder.
window.getDebtAlertSettings = function () {
  const def = { enabled: false, scope: 'both', days: 30 };
  try {
    const raw = localStorage.getItem('zmt_debt_alerts');
    if (!raw) return def;
    const o = JSON.parse(raw) || {};
    const scope = (o.scope === 'customers' || o.scope === 'suppliers' || o.scope === 'both') ? o.scope : 'both';
    let days = parseInt(o.days, 10);
    if ([7, 14, 30, 60].indexOf(days) === -1) days = 30;
    return { enabled: !!o.enabled, scope: scope, days: days };
  } catch (e) { return def; }
};

// Once-a-day reminder window listing the critical debts. Runs right after login
// (same spot as the expiry warning). Marks the day as shown only when it really
// displayed something, so a quiet day does not suppress a later alert.
window.checkDebtAlertsWarning = function () {
  try {
    const cfg = window.getDebtAlertSettings();
    if (!cfg.enabled) return;
    const d = new Date();
    const pad = (n) => (n < 10 ? '0' : '') + n;
    const today = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    if (localStorage.getItem('zmt_debt_alert_shown') === today) return;
    if (typeof window.ddShowDebtAlertReminder !== 'function') return;
    if (window._ddAlertScheduled) return; // one reminder per launch
    window._ddAlertScheduled = true;
    // Let the splash close first (same idea as checkExpiryWarning). Mark the day
    // only when the reminder actually displayed something.
    setTimeout(() => {
      try {
        const count = window.ddShowDebtAlertReminder();
        if (count > 0) localStorage.setItem('zmt_debt_alert_shown', today);
      } catch (e) {}
    }, 700);
  } catch (e) {}
};
// Show/hide + make-required an expiry <input type=date> (id) based on settings.
window.applyExpiryField = function (inputId) {
  const el = typeof inputId === 'string' ? document.getElementById(inputId) : inputId;
  if (!el) return;
  const s = window.getExpirySettings();
  const wrap = el.closest('.form-group') || el.parentElement;
  if (wrap) wrap.style.display = s.enabled ? '' : 'none';
  el.required = s.enabled && s.required;
  return s;
};

// ===== PRODUCT FAMILY (العائلة) — shared by quick-entry/inventory/invoices/category-products/sales =====
// Unique non-empty families currently present in the catalogue. Fills the
// <datalist> suggestions: type to filter, pick an existing family, or keep
// typing to create a brand-new one.
window.getProductFamilies = function () {
  try {
    if (typeof DB === 'undefined' || !DB.getProducts) return [];
    const seen = {};
    const out = [];
    (DB.getProducts() || []).forEach(p => {
      const f = String((p && p.family) || '').trim();
      if (!f) return;
      const key = f.toLowerCase();
      if (seen[key]) return;
      seen[key] = 1;
      out.push(f);
    });
    out.sort((a, b) => a.localeCompare(b));
    return out.slice(0, 200);
  } catch (e) { return []; }
};

window.refreshFamilySuggestions = function () {
  const dl = document.getElementById('familyDatalist');
  if (!dl) return;
  dl.innerHTML = window.getProductFamilies().map(f => '<option value="' + escHtml(f) + '"></option>').join('');
};

// Show/hide a family input according to pharmacy mode (hidden outside it).
window.applyFamilyField = function (inputId) {
  const el = typeof inputId === 'string' ? document.getElementById(inputId) : inputId;
  if (!el) return;
  const on = window.getPharmacyMode();
  const wrap = el.closest('.form-group') || el.parentElement;
  if (wrap) wrap.style.display = on ? '' : 'none';
  el.required = on;
  return on;
};

// Toggle a whole wrapper group + mark its inner input required (pharmacy only).
window.applyFamilyGroup = function (groupId, inputId) {
  const grp = typeof groupId === 'string' ? document.getElementById(groupId) : groupId;
  const on = window.getPharmacyMode();
  if (grp) grp.style.display = on ? '' : 'none';
  const el = typeof inputId === 'string' ? document.getElementById(inputId) : inputId;
  if (el) el.required = on;
  return on;
};

// Called once after boot to warn the manager about expired/expiring products.
window.checkExpiryWarning = function () {
  try {
    if (typeof DB === 'undefined' || !DB.getProducts) return;
    const cfg = window.getExpirySettings();
    if (!cfg.enabled) return;
    const today = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); })();
    const warnMs = (cfg.warnDays || 30) * 86400000;
    const products = DB.getProducts() || [];
    let expired = 0, expiring = 0;
    products.forEach(p => {
      if (!p.expiryDate) return;
      const exp = new Date(p.expiryDate + 'T00:00:00').getTime();
      if (isNaN(exp)) return;
      if (exp < today) expired++;
      else if (exp <= today + warnMs) expiring++;
    });
    if (expired <= 0 && expiring <= 0) return;
    const L = LANG[__lang] || LANG.ar;
    const msg = (L.expiry ? L.expiry['warnMsg'] : null) || ('تنبيه انتهاء الصلاحية:');
    setTimeout(() => {
      alert(msg + '\\n• ' + (L.expiry ? L.expiry.sumExpired : 'منتهي') + ': ' + expired + '\\n• ' + (L.expiry ? L.expiry.sumExpiring : 'قريب الانتهاء') + ': ' + expiring);
    }, 600);
  } catch (e) { /* ignore */ }
};

function addDaysToDateISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ===== ORDERS NAV BADGE =====
window.updateOrdersBadge = function() {
  const el = document.getElementById('ordersNavBadge');
  if (!el) return;
  let n = 0;
  try {
    if (typeof DB !== 'undefined' && DB.ready && DB.ready()) {
      n = (DB.getOrders() || []).filter(o => o.status === 'pending' || o.status === 'notAvailable').length;
    }
  } catch (e) {}
  el.textContent = n;
  el.style.display = n > 0 ? '' : 'none';
};

// ===== WEB PUSH NOTIFY (fire-and-forget) =====
// Website URL used by web-push triggers. Not a secret — it may be overridden
// per-install via localStorage (zmt_push_site_url) from the Connection Settings
// page. The trigger is authenticated with the store's own login credentials
// (code + password), so no shared secret is embedded in the app at all.
const ZMT_PUSH_SITE_URL = 'https://zmt-website.vercel.app';
window.ZMT_PUSH_SITE_URL = ZMT_PUSH_SITE_URL;

// Notifies the manager's phone (via the website's /api/push-trigger) the
// moment an order or spoiled-goods return is created on the desktop. The site
// URL lives in localStorage (zmt_push_site_url) with a build-in default; the
// store credentials come from the current login. Never blocks or throws.
window.notifyWebPush = function(type, payload) {
  try {
    const siteUrl = localStorage.getItem('zmt_push_site_url') || ZMT_PUSH_SITE_URL;
    if (!/^https?:\/\/.+/.test(siteUrl)) return;

    const user = (typeof Auth !== 'undefined' && typeof Auth.getCurrentUser === 'function') ? Auth.getCurrentUser() : null;
    const storeCode = (typeof Auth !== 'undefined' && Auth.getUserCode) ? (Auth.getUserCode() || '') : '';
    const parentCode = (typeof Auth !== 'undefined' && Auth.getParentCode) ? (Auth.getParentCode() || '') : '';
    const storeName = (typeof Auth !== 'undefined' && Auth.getStoreName) ? (Auth.getStoreName() || '') : (user && (user.branchName || ''));
    const password = (typeof Auth !== 'undefined' && Auth.getStorePassword) ? (Auth.getStorePassword() || '') : '';
    if (!storeCode || !password) return;

    const body = Object.assign({
      type: type,
      parentCode: parentCode || storeCode,
      storeCode: storeCode,
      storeName: storeName || '',
      code: storeCode,
      password: password,
      createdAt: Date.now()
    }, payload || {});

    const headers = { 'Content-Type': 'application/json' };
    const legacySecret = localStorage.getItem('zmt_push_secret');
    if (legacySecret) headers['x-zmt-secret'] = legacySecret;

    fetch(siteUrl.replace(/\/+$/, '') + '/api/push-trigger', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    }).catch(function() {});
  } catch (e) { /* ignore */ }
};

// ===== CONTROLS =====
document.getElementById('btnMinimize')?.addEventListener('click', () => api.minimize?.());
document.getElementById('btnMaximize')?.addEventListener('click', () => api.maximize?.());
document.getElementById('btnClose')?.addEventListener('click', () => api.close?.());

// ===== PROFESSIONAL SUPPORT =====
const SUPPORT_WHATSAPP = 'https://wa.me/213783833902?text=' + encodeURIComponent('السلام عليكم، أحتاج دعم من فريق ZMT PIECE');
const SUPPORT_EMAIL = 'mailto:zmtsouftware@gmail.com?subject=' + encodeURIComponent('دعم ZMT PIECE');

function setupSupportButton() {
  const btn = document.getElementById('btnSupport');
  const dropdown = document.getElementById('supportDropdown');
  if (!btn || !dropdown) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!document.getElementById('tbSupport')?.contains(e.target)) dropdown.classList.remove('open');
  });

  const anydesk = document.getElementById('supportAnyDesk');
  if (anydesk) anydesk.addEventListener('click', async () => {
    dropdown.classList.remove('open');
    try {
      const res = await window.electronAPI?.openAnyDesk?.();
      if (res && !res.success) alert('تعذر فتح AnyDesk: ' + (res.error || ''));
    } catch (err) { console.warn('openAnyDesk failed', err); }
  });

  const rustdesk = document.getElementById('supportRustDesk');
  if (rustdesk) rustdesk.addEventListener('click', async () => {
    dropdown.classList.remove('open');
    await window.__zmtLaunchRustDesk?.();
  });

  const wa = document.getElementById('supportWhatsapp');
  if (wa) wa.addEventListener('click', async () => {
    dropdown.classList.remove('open');
    try { await window.electronAPI?.openExternal?.(SUPPORT_WHATSAPP); } catch (err) { console.warn(err); }
  });

  const mail = document.getElementById('supportEmail');
  if (mail) mail.addEventListener('click', async () => {
    dropdown.classList.remove('open');
    try { await window.electronAPI?.openExternal?.(SUPPORT_EMAIL); } catch (err) { console.warn(err); }
  });
}

// Remote support via RustDesk. Launches the executable (bundled/known path or a
// previously chosen one). If it cannot be found the user may locate it once and
// the chosen path is remembered for next time; otherwise we open rustdesk.com.
window.__zmtLaunchRustDesk = async function () {
  try {
    const saved = localStorage.getItem('zmt_rustdesk_path') || '';
    let res = await window.electronAPI?.openRustDesk?.(saved);
    if (res && res.success) return;
    if (res && res.notFound) {
      if (confirm('لم يتم العثور على RustDesk على هذا الجهاز.\nهل تريد تحديد مكان ملف RustDesk.exe الآن؟')) {
        const pick = await window.electronAPI?.pickRustDesk?.();
        if (pick && pick.success && pick.path) {
          localStorage.setItem('zmt_rustdesk_path', pick.path);
          const retry = await window.electronAPI?.openRustDesk?.(pick.path);
          if (retry && retry.success) return;
          alert('تعذر فتح RustDesk: ' + ((retry && retry.error) || ''));
        }
        return;
      }
      try { await window.electronAPI?.openExternal?.('https://rustdesk.com'); } catch (err) { console.warn(err); }
      return;
    }
    alert('تعذر فتح RustDesk: ' + ((res && res.error) || ''));
  } catch (err) { console.warn('openRustDesk failed', err); }
};

// ===== NAVIGATION =====
document.addEventListener('click', (e) => {
  const item = e.target.closest('.nav-item');
  if (item) { e.preventDefault(); const p = item.dataset.page; if (p) navigateTo(p); }
});

// ===== I18N TRANSLATIONS =====
const LANG = {
  ar: {
    appTitle: 'ZMT PIECE',
    online: 'متصل', offline: 'غير متصل',
    nav: {
      localOrders: 'الطلبات المحلية',
      priceDisplay: 'شاشة عرض السعر',
      main: 'الرئيسية', manage: 'إدارة', finance: 'المالية', system: 'النظام',
      dashboard: 'لوحة التحكم', brands: 'العلامات التجارية', sales: 'البيع', invoices: 'الفواتير',
      inventory: 'المخزون', suppliers: 'الموردين', customers: 'العملاء', debts: 'الديون', debtDetails: 'تفاصيل الديون',
      customerMovements: 'حركات العملاء', supplierMovements: 'حركات الموردين',
      employees: 'الموظفين',
      supplierReturns: 'السلع الفاسدة', expiry: 'انتهاء الصلاحية',
      netAccount: 'صافي الحساب', expenses: 'المصاريف', discounts: 'التخفيضات', returns: 'المرتجعات',
      reports: 'التقارير', backup: 'النسخ الاحتياطي', settings: 'الاعدادات',
      zakat: 'الزكاة',
      connection: 'اعدادات الاتصال',
      storeDebts: 'ديون المحلات', branchesMonitor: 'مراقبة الفروع', sharedInventory: 'المخزون المشترك',
      orders: 'الطلبات',
    },
    expiry: {
      title: 'انتهاء الصلاحية', sub: 'المنتجات المنتهية صلاحيتها أو القاربة للانتهاء',
      search: 'بحث بالاسم أو الباركود...', refresh: 'تحديث', noDate: '—',
      filterAll: 'الكل', filterExpired: 'منتهي الصلاحية', filterExpiring: 'قريب الانتهاء', filterOk: 'سليم',
      sumExpired: 'منتهي', sumExpiring: 'قريب الانتهاء', sumOk: 'سليم', sumWarnWindow: 'أيام التحذير',
      expired: 'منتهي', expiresToday: 'ينتهي اليوم', inDays: 'بعد', days: 'يوم', overdue: 'متأخر',
      warnMsg: 'تنبيه انتهاء الصلاحية:',
      empty: 'لا توجد منتجات مطابقة', editPrompt: 'تاريخ انتهاء الصلاحية الجديد (YYYY-MM-DD):', invalidDate: 'صيغة التاريخ غير صحيحة',
    },
    dash: {
      title: 'لوحة التحكم', sub: 'نظرة عامة على المبيعات والمخزون',
      s1: 'قطعة في المخزون', s2: 'فاتورة هذا الشهر', s3: 'عميل مسجل', s4: 'إجمالي المبيعات',
      chart: 'المبيعات مقابل المخزون والمرتجعات', months: 'عدد الأشهر:',
      m1: 'شهر', m2: 'شهرين', m3: 'أشهر', m4: 'أشهر', m5: 'أشهر', m6: 'أشهر',
      netProfit: 'صافي الربح', cost: 'التكلفة',
      lowStockItems: ' منتج أقل من حد المخزون',
      andMore: 'و', moreItems: 'أخرى...',
      lowStock: 'منتجات تحت حد المخزون', estimatedProfit: 'إجمالي الربح المقدر', monthSales: 'مبيعات هذا الشهر', profitCostDist: 'توزيع الربح والتكلفة',
      view: 'عرض', lowStockModalTitle: 'المنتجات تحت حد المخزون',
      colProduct: 'المنتج', colCode: 'الباركود / المارك', colThreshold: 'الحد', openProduct: 'فتح المنتج',
      printBw: 'طباعة أبيض وأسود', lowStockPrintTitle: 'كشف المنتجات تحت حد المخزون',
      printDate: 'تاريخ الطباعة', printCount: 'عدد المنتجات',
    },
    brands: { title: 'العلامات التجارية', sub: 'إدارة الأصناف والعلامات التجارية', search: 'بحث عن علامة تجارية...', favAdd: 'إضافة إلى المفضلة', favRemove: 'إزالة من المفضلة', brandsWord: 'علامة', addOther: 'إضافة أخرى', addOtherHint: 'إضافة صنف جديد', backToKinds: 'الأصناف', brandsOfKind: 'العلامات التجارية', addBrand: 'إضافة علامة', noBrands: 'لا توجد علامات في هذا الصنف بعد', deleteBrand: 'حذف العلامة', confirmDelete: 'حذف هذه العلامة؟', addKindTitle: 'إضافة صنف جديد', kindName: 'اسم الصنف', kindIcon: 'أيقونة (اختياري)', kindColor: 'لون', kindRequired: 'يرجى إدخال اسم الصنف', kindExists: 'هذا الصنف موجود بالفعل', addBrandTitle: 'إضافة علامة تجارية', brandName: 'اسم العلامة', brandCountry: 'البلد', brandColor: 'لون العلامة', brandKind: 'الصنف', brandNameRequired: 'يرجى إدخال اسم العلامة' },
    sales: {
      title: 'البيع', sub: 'إنشاء فاتورة بيع جديدة',
      searchParts: 'بحث القطع', searchPlaceholder: 'ابحث باسم القطعة أو رقمها...',
      emptySearch: 'اكتب لبدء البحث عن قطع الغيار',
      cart: 'سلة المشتريات', cartEmpty: 'السلة فارغة', total: 'المجموع:',
      checkout: 'إتمام البيع',
      confirm: 'تأكيد', transferInvoice: 'تحويل الفاتورة', transferTitle: 'تحويل الفاتورة إلى عميل',
      transferHint: 'اختر العميل الذي ستُسجَّل عليه هذه الفاتورة (مثلاً إن كان المشتري وكيلاً عنه).',
      transferSelected: 'سيتم تسجيل الفاتورة على:', transferConfirm: 'تأكيد التحويل',
    },
    invoices: {
      title: 'الفواتير', sub: 'جميع فواتير البيع والمشتريات',
      search: 'بحث عن فاتورة...', newInvoice: 'فاتورة جديدة',
      col1: 'رقم الفاتورة', col2: 'التاريخ', col3: 'العميل', col4: 'المبلغ', col5: 'الحالة', col6: 'إجراءات',
      empty: 'لا توجد فواتير بعد',
      printChoiceTitle: 'اختر نوع الطباعة', printChoiceDesc: 'كيف تريد التعامل مع هذه الفاتورة؟',
      printTotalTitle: 'إجمالي الطباعة',
      printTotalNet: 'بعد الخصم', printTotalGross: 'قبل الخصم',
      printTotalNetDesc: 'سعر الوحدة كما هو + سطر الخصم', printTotalGrossDesc: 'الإجمالي دون أي ذكر للخصم',
      printTotalHintNet: 'سيُطبع سعر الوحدة كما هو، ثم سطر الخصم، ثم الإجمالي بعد الخصم.',
      printTotalHintGross: 'سيُطبع الإجمالي قبل الخصم فقط، دون أي سطر خصم.',
      paidAfterDiscount: 'بعد الخصم',
      cardDiscountTag: 'خصم',
      cardDiscountTitle: 'فاتورة بخصم — افتح الفاتورة واضغط i لعرض نسبة الخصم والتكلفة الحقيقية',
      discountOnInvoiceBanner: 'تحتوي هذه الفاتورة على خصم — اضغط {i} أو هذه الرسالة لعرض نسبة الخصم والتكلفة الحقيقية، والإجمالي بعد الخصم {net}.',
      printNormal: 'طباعة عادية', printEmployee: 'طباعة إلى الموظف', employeeDocTitle: 'قائمة تحضير',
      savePdf: 'حفظ كـ PDF', sendEmail: 'إرسال بالبريد الإلكتروني', send: 'إرسال',
      emailTitle: 'إرسال الفاتورة بالبريد',
      emailTo: 'إرسال إلى', emailSubject: 'الموضوع', emailMessage: 'رسالة (اختياري)',
      emailHint: 'عند الإرسال سيُفتح Gmail في المتصفح مع حفظ نسخة PDF — قم بإرفاق ملف PDF ثم أكمل الإرسال.',
    },
    inventory: {
      title: 'المخزون', sub: 'إدارة مخزون قطع الغيار',
      search: 'بحث في المخزون...', add: 'إضافة قطعة', export: 'تصدير',
      col1: 'الباركود', col2: 'اسم القطعة', col3: 'العلامة', col4: 'الكمية', col5: 'سعر الشراء', col6: 'سعر البيع', col7: 'إجراءات',
      empty: 'المخزون فارغ',
    },
    suppliers: {
      title: 'الموردين', sub: 'إدارة موردي قطع الغيار',
      search: 'بحث عن مورد...', add: 'إضافة مورد',
      col1: 'الاسم', col2: 'الهاتف', col3: 'البريد', col4: 'العلامات', col5: 'الرصيد', col6: 'إجراءات',
      empty: 'لا يوجد موردين',
      addModalTitle: 'إضافة مورد جديد', editModalTitle: 'تعديل المورد',
      formName: 'اسم المورد', formNamePl: 'مثال: مؤسسة XX لقطع الغيار',
      formPhone: 'رقم الهاتف', formAddress: 'العنوان', formAddressPl: 'مثال: الرياض - شارع الملك فهد',
      formEmail: 'البريد الإلكتروني (اختياري)',
      cancel: 'إلغاء', save: 'حفظ',
    },
    sdPayment: {
      editTitle: 'تعديل الدفعة', note: 'الملاحظة', date: 'تاريخ الدفع',
      balanceNote: 'يُحدَّث رصيد المورد تلقائياً بمقدار الفرق.',
      confirmDelete: 'هل تريد حذف هذه الدفعة؟ سيُعاد أثرها إلى رصيد المورد.',
      invalidAmount: 'الرجاء إدخال مبلغ صحيح', invalidDate: 'صيغة تاريخ الدفع غير صحيحة',
      updated: 'تم تعديل الدفعة وتحديث الرصيد', deleted: 'تم حذف الدفعة وتحديث الرصيد',
    },
    movements: {
      custTitle: 'حركات العملاء', custSub: 'سجل كامل للديون والدفعات والفواتير مع تسويات الرصيد',
      supTitle: 'حركات الموردين', supSub: 'سجل كامل للديون والدفعات والفواتير مع تسويات الرصيد',
      partyLabel: 'الطرف', searchLabel: 'بحث', searchPh: 'ابحث بالاسم أو رقم الفاتورة...',
      allCustomers: 'كل العملاء', allSuppliers: 'كل الموردين',
      viewReport: 'عرض كتقرير', print: 'طباعة', close: 'إغلاق', printTitle: 'كشف الحركات',
      allowPopups: 'يرجى السماح بالنوافذ المنبثقة للطباعة', nothingToPrint: 'لا توجد بيانات للطباعة',
      emptyList: 'لا توجد نتائج مطابقة', noMovements: 'لا توجد حركات مسجّلة',
      legendSale: 'فاتورة بيع (مدين)', legendPurchase: 'فاتورة شراء (مدين)',
      legendPayment: 'دفعة (دائن)', legendPaySupplier: 'دفعة للمورد (دائن)',
      legendVoucher: 'سند قبض', legendDebtNote: 'سند دين',
      legendSettle: 'تسوية رصيد (وصول الرصيد إلى صفر)',
      entrySale: 'فاتورة بيع', entryPurchase: 'فاتورة شراء', entrySupSale: 'بيع للمورد',
      entryPayment: 'دفعة', entryReceipt: 'سند قبض', entryDebtNote: 'سند دين',
      itemsNoun: 'منتج',
      opening: 'رصيد سابق', settledTag: 'تسوية رصيد', balanceAfter: 'الرصيد بعدها',
      movCount: 'عدد الحركات', settleCount: 'مرات التسوية', currentDue: 'الرصيد الحالي',
      colDate: 'التاريخ', colTime: 'الوقت', colDesc: 'البيان', colRef: 'المرجع',
      colDebit: 'مدين (+)', colCredit: 'دائن (−)', colBalance: 'الرصيد',
      totalDebit: 'إجمالي المدين', totalCredit: 'إجمالي الدائن', finalBalance: 'الرصيد النهائي',
      netTotal: 'صافي الأرصدة', grandTotal: 'الإجمالي العام',
      sumParties: 'عدد العملاء', sumPartiesSup: 'عدد الموردين',
      reportTitleOneCust: 'كشف حركات العميل', reportTitleAllCust: 'كشف حركات العملاء',
      reportTitleOneSup: 'كشف حركات المورد', reportTitleAllSup: 'كشف حركات الموردين',
      phone: 'الهاتف', generatedAt: 'تاريخ الإصدار',
      footNote: 'كشف حركات مُولَّد آلياً من سجلّات البرنامج',
      fromLabel: 'من تاريخ', toLabel: 'إلى تاريخ',
      qMonth: 'هذا الشهر', q30: 'آخر 30 يوم', qAll: 'الكل',
      includeReturns: 'تضمين المرتجعات', legendReturn: 'مرتجع (لا يغيّر الرصيد)',
      entryReturn: 'مرتجع',
      returnsReport: 'تقرير المرتجعات', monthlyStatement: 'كشف شهري',
      settleNow: 'تسوية رصيد', exportCsv: 'تصدير Excel',
      sendWhatsApp: 'واتساب', sendEmail: 'إرسال بالبريد',
      aging: 'أعمار الديون', oldest: 'أقدم دين', days: 'يوم',
      age0: '0-30 يوم', age30: '31-60 يوم', age60: '61-90 يوم', age90: 'أكثر من 90 يوم',
      overLimit: 'تجاوز سقف الدين',
      retCount: 'عدد المرتجعات', retQty: 'إجمالي الكمية', retValue: 'قيمة المرتجعات',
      retTitleOneCust: 'تقرير مرتجعات العميل', retTitleAllCust: 'تقرير مرتجعات العملاء',
      retTitleOneSup: 'تقرير مرتجعات المورد', retTitleAllSup: 'تقرير مرتجعات الموردين',
      retPrintTitle: 'تقرير المرتجعات',
      colInvoice: 'الفاتورة', colProduct: 'المنتج', colQty: 'الكمية', colValue: 'القيمة', colReason: 'السبب',
      colParty: 'الطرف', period: 'الفترة',
      noReturns: 'لا توجد مرتجعات مسجّلة', nothingToExport: 'لا توجد بيانات للتصدير',
      nothingToSend: 'لا توجد بيانات للإرسال', exportOk: 'تم التصدير بنجاح', exportFail: 'تعذّر التصدير',
      emailTo: 'إلى', emailSubject: 'الموضوع', emailBody: 'النص', emailInvalid: 'بريد إلكتروني غير صالح',
      emailSent: 'تم إرسال البريد', emailFail: 'تعذّر إرسال البريد', cancel: 'إلغاء', send: 'إرسال',
      mCash: 'نقداً', mCcp: 'CCP', mCheck: 'شيك', mTransfer: 'تحويل', customer: 'عميل', supplier: 'مورد',
      settleAmount: 'المبلغ', settleMethod: 'طريقة الدفع', settleNote: 'ملاحظة',
      settleDefaultNote: 'تسوية رصيد', signature: 'التوقيع الإلكتروني', clearSig: 'مسح التوقيع',
      settleSave: 'حفظ التسوية', invalidAmount: 'يرجى إدخال مبلغ صحيح',
      settleSaved: 'تم تسجيل التسوية بنجاح', pickOneParty: 'اختر طرفاً محدداً أولاً',
      groupAria: 'اختصارات سريعة',
      btnSell: 'بيع', btnSellTitle: 'البيع — فتح صفحة البيع',
      btnQuick: 'إدخال سريع', btnQuickTitle: 'الإدخال السريع',
      btnSmart: 'إضافة ذكية', btnSmartTitle: 'إضافة فاتورة ذكية',
      btnCustomers: 'حركات العملاء', btnCustomersTitle: 'حركات العملاء',
      btnSuppliers: 'حركات الموردين', btnSuppliersTitle: 'حركات الموردين',
      btnDebts: 'تفاصيل الديون', btnDebtsTitle: 'تفاصيل الديون — ما لنا وما علينا',
    },
    customers: {
      title: 'العملاء', sub: 'إدارة العملاء',
      search: 'بحث عن عميل...', add: 'إضافة عميل',
      col1: 'الاسم', col2: 'الهاتف', col3: 'العنوان', col4: 'المشتريات', col5: 'الرصيد', col6: 'إجراءات',
      empty: 'لا يوجد عملاء',
      addModalTitle: 'إضافة عميل جديد', editModalTitle: 'تعديل العميل',
      formName: 'اسم العميل', formNamePl: 'مثال: أحمد علي',
      formPhone: 'رقم الهاتف', formAddress: 'العنوان', formAddressPl: 'مثال: الجزائر العاصمة',
      formEmail: 'البريد الإلكتروني (اختياري)',
      formType: 'نوع العميل', typeUnit: 'قطعة', typeWhole: 'جملة', formTypeHelp: 'يحدد السعر الافتراضي في صفحة البيع (يمكن تغييره لكل منتج داخل السلة)',
      formDiscount: 'نسبة الخصم (%)', formDiscountHelp: 'من 0.001% إلى 100% - اختياري', formCreditLimit: 'سقف الدين (اختياري)', formCreditLimitHelp: '0 تعني بلا حد — يُنبه عند تجاوزه عند البيع',
      cancel: 'إلغاء', save: 'حفظ',
      totalDebts: 'إجمالي الديون على العملاء',
      totalPaid: 'إجمالي المدفوع',
      totalCount: 'إجمالي العملاء',
    },
    employees: {
      title: 'الموظفين', sub: 'إدارة الموظفين والحضور والرواتب',
      search: 'بحث عن موظف...', add: 'إضافة موظف', empty: 'لا يوجد موظفون',
      totalCount: 'إجمالي الموظفين', presentToday: 'حاضر اليوم',
      dueThisMonth: 'مستحق هذا الشهر', paidThisMonth: 'مدفوع هذا الشهر',
      scanLabel: 'امسح باركود الموظف للحضور أو الانصراف...', scanReady: 'جاهز للمسح',
      scanNotFound: 'كود غير معروف — لا يوجد موظف بهذا الباركود',
      scanIn: 'تسجيل حضور', scanOut: 'تسجيل انصراف',
      scanDone: 'اليوم منتهٍ لهذا الموظف (سجل الحضور والانصراف مكتملان)',
      btnCheckIn: 'حضور', btnCheckOut: 'انصراف', btnFixDay: 'تعديل', btnDelDay: 'حذف السجل',
      statusActive: 'نشط', statusInactive: 'موقوف',
      todayPresent: 'حاضر', todayAbsent: 'غائب', todayRest: 'راحة',
      worked: 'المدة', notOutYet: 'لم ينصرف بعد',
      addModalTitle: 'إضافة موظف جديد', editModalTitle: 'تعديل الموظف',
      formName: 'اسم الموظف', formNamePl: 'مثال: محمد أمين',
      formPhone: 'رقم الهاتف (اختياري)',
      formBarcode: 'الباركود', formBarcodeGen: 'توليد',
      formBarcodeHelp: 'كود فريد لكل موظف — لا يتكرر مع المنتجات ولا مع موظف آخر',
      formPhoto: 'الصورة (اختياري)',
      formSalaryType: 'نوع الراتب', salaryMonthly: 'شهري', salaryDaily: 'يومي',
      formMonthly: 'الراتب الشهري (دج)', formDaily: 'مبلغ اليوم (دج)',
      salaryHelp: 'الشهري يُقسم على 30 يومًا دائمًا: 30000 ← 1000/يوم (فبراير والمصر لا ينقصان)',
      formPayDay: 'يوم صرف الراتب', formPayDayHelp: 'من 1 إلى 31 — يوم استحقاق صرف الراتب الشهري',
      timingSection: 'توقيت العمل', timingEnabled: 'تفعيل توقيت العمل (خصم التأخر والانصراف المبكر)',
      formWorkStart: 'بداية العمل', formWorkEnd: 'نهاية العمل', formGrace: 'سماحية (دقائق)',
      perSecond: 'سعر الثانية',
      restSection: 'أيام العمل والراحة', restEnabled: 'تفعيل أيام الراحة',
      restWork: 'عمل', restPaid: 'راحة مدفوعة', restUnpaid: 'راحة غير مدفوعة',
      restHelp: 'اختر حالة كل يوم. الراحة غير المدفوعة بلا حضور تُخصم من الراتب الشهري، وبوجود حضور تُعامَل كيوم عمل.',
      formStatus: 'الحالة', formNote: 'ملاحظة',
      cancel: 'إلغاء', save: 'حفظ', del: 'حذف الموظف',
      confirmDelete: 'حذف هذا الموظف وسجل حضوره؟ (تبقى مدفوعات الراتب في المصروفات)',
      barcodeTaken: 'هذا الباركود مستخدم لموظف آخر',
      nameRequired: 'يرجى إدخال اسم الموظف',
      invalidNumber: 'يرجى إدخال مبلغ صحيح',
      settlement: 'تسوية الرواتب', month: 'الشهر',
      colIn: 'حضور', colOut: 'انصراف', colAbsents: 'غياب', colRest: 'راحة',
      colLate: 'تأخر', colEarly: 'مبكر', colDeduct: 'الخصم',
      colGross: 'الإجمالي', colNet: 'الصافي', colState: 'الحالة',
      units: 'وحدة/يوم', days: 'يوم', seconds: 'ثانية',
      paid: 'مدفوع', unpaid: 'غير مدفوع', partial: 'مدفوع جزئيًا',
      btnPay: 'صرف', btnUnpay: 'إلغاء الصرف',
      noAttendance: 'لا يوجد سجل حضور لهذا الشهر — يُحتسب غيابًا كاملًا',
      payTitle: 'صرف راتب', payAmount: 'المبلغ', payMethod: 'طريقة الدفع',
      paySuccess: 'تم تسجيل الصرف في المصروفات',
      unpayConfirm: 'إلغاء هذا الصرف؟',
      payNothing: 'لا يوجد مستحق لصرفه',
      badgeTitle: 'بطاقة الموظف', badgePrint: 'طباعة',
      barcodeMissing: 'لا يوجد باركود لهذا الموظف',
      allowPopups: 'الرجاء السماح بالنوافذ المنبثقة للطباعة',
      recTitle: 'سجل الحضور', recIn: 'حضور', recOut: 'انصراف',
      recLate: 'تأخر (ث)', recEarly: 'مبكر (ث)', recEmpty: 'لا توجد سجلات في هذا الشهر',
      recManual: 'يدوي',
      editInTitle: 'وقت الحضور', editOutTitle: 'وقت الانصراف',
      saveRec: 'حفظ', dayOf: 'يوم',
      statsHint: 'الغياب محسوب من سجل الحضور: مسح الباركود أو الأزرار اليدوية',
    },
    stockTools: {
      syncBtn: 'مزامنة المخزون من STOCK.FDB',
      syncTitle: 'مزامنة المخزون من البرنامج القديم',
      syncHint: 'تُقرأ كمية كل صنف من جدول ARTICLES في قاعدة البرنامج القديم وتُطبَّق على المنتج المطابق. لا تُستعمل الفواتير هنا لأن المخزون القديم يشملها بالفعل — وهذا ما كان يسبّب مضاعفة الكمية (5 ← 10).',
      current: 'الكمية الحالية',
      legacy: 'كمية البرنامج القديم',
      difference: 'الفرق',
      applyLabel: 'تطبيق',
      selectAll: 'تحديد الكل',
      noChanges: 'لا توجد فروقات — المخزون مطابق للبرنامج القديم',
      applied: 'تمت مزامنة المخزون لـ',
      changedCount: 'منتج',
      cantEdit: 'لا تملك صلاحية تعديل المخزون',
      notMatched: 'غير مطابق',
      matched: 'مطابق',
      changed: 'به فرق',
      unmatchedCount: 'غير مطابق',
      legacyTotal: 'إجمالي القديم',
      currentTotal: 'إجمالي الحالي',
      readError: 'تعذر قراءة جدول ARTICLES من قاعدة البرنامج القديم',
      empty: 'لا توجد أصناف في قاعدة البرنامج القديم',
      backupNote: 'تم حفظ نسخة احتياطية قبل التطبيق.',
    },
    balanceTools: {
      editTitle: 'تعديل الرصيد',
      current: 'الرصيد الحالي',
      newBalance: 'الرصيد الجديد (المبلغ)',
      signToggle: 'الاتجاه',
      owesUs: 'مدين لنا',
      weOweHim: 'له ائتمان عندنا (سلفة)',
      weOwe: 'علينا دين له',
      owesUsSup: 'له رصيد عندنا (سلفة)',
      hintCustomer: 'القيمة الموجبة: العميل مدين لنا. القيمة السالبة: له ائتمان عندنا (مقدّم/سلفة).',
      hintSupplier: 'القيمة الموجبة: علينا دين له. القيمة السالبة: له رصيد عندنا (دفعات مقدمة).',
      save: 'حفظ الرصيد',
      saved: 'تم تحديث الرصيد بنجاح',
      emptyEdit: 'يرجى إدخال رصيد صحيح',
      cantEdit: 'لا تملك صلاحية تعديل العملاء/الموردين',
      recalcBtn: 'إعادة حساب الأرصدة من الفواتير',
      recalcConfirm: 'سيتم إعادة اشتقاق رصيد كل عميل ومورد من الفواتير والدفعات الحالية في قاعدة البيانات. سيتم حفظ نسخة احتياطية أولاً. هل تريد المتابعة؟',
      recalcDone: 'تمت إعادة حساب الأرصدة بنجاح',
      noDiff: 'لا توجد فروقات — الأرصدة مطابقة للحساب من الفواتير',
      clients: 'عملاء',
      suppliers: 'موردين',
      syncBtn: 'مزامنة الأرصدة من STOCK.FDB',
      syncTitle: 'مزامنة الأرصدة من البرنامج القديم (Gestion Stock)',
      syncHint: 'القيم أدناه مأخوذة من قاعدة البرنامج القديم: «المخزّن» = CREDIT_CLIENT/CREDIT_FOURNISSEUR، و«المحسوب» من مجاميع فواتير البيع/الشراء (FC/FF) والدفعات (VC/VF).',
      storedLabel: 'المخزّن',
      computedLabel: 'المحسوب',
      modeStored: 'استخدام الرصيد المخزّن (CREDIT)',
      modeComputed: 'استخدام الرصيد المحسوب من الأرشيف',
      applyLabel: 'تطبيق على المحدد',
      selectAll: 'تحديد الكل',
      noFirebird: 'لا يوجد ملف قاعدة بيانات قديمة مفتوح. افتح ملف STOCK.FDB أولاً من قسم الاستيراد (Gestion Stock).',
      openFile: 'فتح ملف STOCK.FDB...',
      notMatched: 'لم تُطابق (غير مذكور في القاعدة القديمة)',
      applied: 'تم تحديث الأرصدة:',
      changedCount: 'طرفاً تم تعديله',
      diffCount: 'اختلاف عن الحالي',
      parties: 'طرف',
      matchedFor: 'عدد الأطراف في القاعدة القديمة:',
      noChanges: 'لا توجد تغييرات للتطبيق',
      parseErr: 'تعذر قراءة قاعدة البيانات القديمة',
      hybridTitle: 'الأطراف المزدوجة (عميل ⇄ مورد)',
      hybridHint: 'القاعدة: الزوج «المؤكد» = نفس الاسم تماماً في جدولَي العميل والمورد + معاملات فعلية (بيع/شراء/دفعات) في الطرفين. البرنامج القديم كان يصنّف هذا الشخص «مورداً» يتعامل بالاتجاهين، فرصيده الحقيقي = رصيد العميل − رصيد المورد (سجلّ العميل = NET، سجلّ المورد = −NET). بقية الأزواج «مرشحة للمراجعة» (ربط قديم/اسم متشابه): تبقى أطرافاً مستقلة برصيدها المخزّن ما لم تُحددها يدوياً.',
      sectionSingles: 'أطراف مفردة',
      sectionHybrid: 'الأطراف المزدوجة',
      hybridCustCol: 'العميل',
      hybridSupCol: 'المورد',
      hybridLinkCol: 'الربط',
      hybridCreditC: 'رصيد العميل',
      hybridCreditF: 'رصيد المورد',
      hybridNetCol: 'NET الحقيقي',
      hybridSignNote: 'موجب NET = عليه لنا في سجل العميل، ويظهر −NET في سجل المورد (علينا).',
      hybridCreate: 'يُستحدث',
      basisCf: 'Code CF',
      basisName: 'الاسم',
      basisBoth: 'CF + اسم',
      basisDouble: 'مورد ثنائي (اسم + معاملات)',
      basisConfirmed: 'تأكيد يدوي',
      hybridConfirmed: 'مؤكد',
      hybridSuspect: 'مراجعة',
      hybridPairCount: 'زوج مزدوج',
      noHybrids: 'لا توجد أطراف مزدوجة في القاعدة',
      oldBalance: 'الرصيد القديم',
      newBalanceVal: 'الرصيد الجديد',
      noPermissionTitle: 'لا صلاحية',
    },
    debts: {
      title: 'الديون', sub: 'إدارة الديون والذمم',
      youOwe: 'ديون عليك (للموردين)', youOwed: 'ديون لك (على العملاء)',
      noDebts: 'لا توجد ديون مستحقة',
      logTitle: 'سجل الديون',
      col1: 'التاريخ', col2: 'النوع', col3: 'الطرف', col4: 'المبلغ', col5: 'الحالة', col6: 'إجراءات',
      empty: 'لا توجد معاملات',
      totalInvoices: 'إجمالي الفواتير', totalPurchases: 'إجمالي المشتريات',
      balance: 'الرصيد', paid: 'المدفوع', paidToThem: 'المدفوع لهم',
      invoices: 'الفواتير', noInvoices: 'لا توجد فواتير', payBtn: 'دفع',
      payments: 'الدفعات', noPayments: 'لا توجد دفعات',
      net: 'صافي الذمم', chooseSide: 'اختر طرفاً من القائمة', back: 'رجوع',
      searchPlaceholder: 'ابحث بالاسم أو رقم الهاتف...', tabCustomers: 'العملاء', tabSuppliers: 'الموردين',
      totalCustomerDebts: 'ديون لنا (على العملاء)', totalSupplierDebts: 'ديون علينا (للموردين)',
      recalcFromOldDb: 'تصحيح أرصدة العملاء والموردين من قاعدة Gestion Stock القديمة دون إعادة استيراد',
    },
    debtDetails: {
      title: 'تفاصيل الديون', sub: 'نظرة شاملة على الذمم: ما لنا وما علينا مع العملاء والموردين',
      onCustomers: 'مجموع الديون التي على العملاء', onCustomersHint: 'مبالغ يدين بها العملاء لنا',
      toSuppliers: 'مجموع الديون التي علينا للموردين', toSuppliersHint: 'مبالغ ندين بها للموردين',
      toCustomers: 'مجموع الديون التي علينا إلى العملاء', toCustomersHint: 'أرصدة دائنة للعملاء (دفعوا أكثر مما اشتروا)',
      fromSuppliers: 'مجموع الديون التي لنا على الموردين', fromSuppliersHint: 'مبالغ يدين بها الموردون لنا',
      exportCustomers: 'تصدير قائمة العملاء', exportSuppliers: 'تصدير قائمة الموردين',
      groupAll: 'كل الأطراف', groupOwing: 'الذين عليهم دين (يدينون لنا)', groupOwed: 'الذين ندين لهم',
      exportExcel: 'تصدير Excel', view: 'عرض',
      resultsTitle: 'النتائج', emptyResults: 'اختر خيار عرض من الأزرار أعلاه لعرض القائمة',
      noMatch: 'لا يوجد أطراف مطابقون لهذا الفلتر',
      colIndex: '#', colName: 'الاسم', colPhone: 'الهاتف', colAddress: 'العنوان', colBalance: 'الرصيد', colStatus: 'الحالة',
      statusOwingUs: 'يدين لنا', statusWeOwe: 'ندين له',
      total: 'الإجمالي', countLabel: 'عدد الأطراف',
      filterAllCust: 'كل العملاء', filterAllSup: 'كل الموردين',
      filterOwingCust: 'العملاء الذين عليهم دين', filterOwedCust: 'العملاء الذين ندين لهم',
      filterOwingSup: 'الموردون الذين يدينون لنا', filterOwedSup: 'الموردون الذين علينا دين لهم',
      print: 'طباعة', sheetTitle: 'تفاصيل الديون', dateLabel: 'تاريخ التصدير', by: 'بواسطة',
      nothingToExport: 'لا توجد بيانات للتصدير', exportOk: 'تم التصدير بنجاح', exportFail: 'تعذّر التصدير',
      customers: 'العملاء', suppliers: 'الموردون',
      searchPh: 'ابحث باسم العميل أو المورّد أو رقم الهاتف...',
      searchHint: 'اكتب حرفين على الأقل للبحث في العملاء والموردين معاً',
      searchResults: 'نتائج البحث', noSearchResults: 'لا توجد نتائج مطابقة',
      colType: 'النوع', typeCustomer: 'عميل', typeSupplier: 'مورّد', clear: 'مسح',
      alertsBtn: 'تنبيهات الديون', alertsTitle: 'تنبيهات الديون',
      alertsSub: 'حدّد النطاق والمدة، وسيُدرج كل من عليه دين لنا تجاوز هذه المدة في قائمة الديون الحرجة.',
      scopeLabel: 'النطاق', scopeCustomers: 'عملاء', scopeSuppliers: 'موردون', scopeBoth: 'الاثنان معاً',
      stateLabel: 'الحالة', enable: 'تفعيل', disable: 'عدم التفعيل',
      durationLabel: 'المدة', durWeek: 'أسبوع', durTwoWeeks: 'أسبوعان', durMonth: 'شهر', durTwoMonths: 'شهران',
      alertsSave: 'حفظ', alertsCancel: 'إلغاء', alertsSaved: 'تم حفظ إعدادات التنبيهات',
      criticalTitle: 'قائمة الديون الحرجة', criticalEmpty: 'لا توجد ديون حرجة حالياً',
      criticalDisabled: 'تنبيهات الديون غير مفعّلة', critSearchPh: 'ابحث بالاسم في الديون الحرجة...',
      colOwed: 'المبلغ المستحق', colAge: 'العمر (أيام)', daysUnit: 'يوم',
      reminderTitle: 'تنبيه: ديون حرجة', reminderMsg1: 'يوجد', reminderMsg2: 'طرفاً بديون تجاوزت المدة المحددة',
      reminderTotal: 'إجمالي المبالغ المستحقة', later: 'لاحقاً',
    },
    net: {
      title: 'صافي الحساب', sub: 'ملخص الحسابات المالية',
      s1: 'إجمالي المبيعات', s2: 'إجمالي المشتريات', s3: 'صافي الربح', s4: 'المبالغ المعلقة',
      logTitle: 'سجل المعاملات',
      col1: 'التاريخ', col2: 'الوصف', col3: 'النوع', col4: 'المبلغ', col5: 'الرصيد',
      empty: 'لا توجد معاملات حديثة',
      customerDebt: 'دين لنا', supplierDebt: 'دين علينا',
      purchaseInvoice: 'فاتورة شراء', purchaseFrom: 'فاتورة من',
      transferInvoice: 'فاتورة تحويل', receptionInvoice: 'فاتورة استلام',
      purchases: 'مشتريات', paymentFrom: 'دفعة من', paymentFromSupplier: 'قبض من مورد: ',
      paymentNote: 'دفعة', paymentWalkin: 'دفعة من زبون',
      salesPaid: 'مبيعات (مدفوع)', supplierReceipt: 'قبض من مورد', paymentTo: 'دفعة لـ',
      paymentToSupplier: 'دفعة لمورد', expenses: 'مصروفات',
      stockPurchase: 'شراء مخزون', stockPurchases: 'مشتريات مخزون',
      totalExpenses: 'إجمالي المصروفات', quickTitle: 'إدخال مباشر', quickHint: 'قيد مالي مباشر دون إنشاء فاتورة أو تعديل المخزون.', purchaseAdd: 'إضافة المبلغ إلى المشتريات', expenseAdd: 'إضافة إلى المصروفات', quickNoteLabel: 'ملاحظة (اختياري)', addBtn: 'إضافة', invalidAmount: 'يرجى إدخال مبلغ صحيح', directPurchase: 'إدخال مباشر - مشتريات', directExpense: 'إدخال مباشر - مصروفات',
      marginTitle: 'هامش الربح', periodLabel: 'الفترة:', today: 'اليوم', yesterday: 'الأمس', last7Days: 'آخر 7 أيام',
      totalMargin: 'هامش الربح الكلي', periodMargin: 'هامش الربح للفترة', allTime: 'منذ البداية',
      cashLabel: 'نقداً', marginLabel: 'هامش', ccpPaidNote: 'مدفوعة CCP',
      periodCash: 'إيرادات الفترة (نقداً)', totalCash: 'إيرادات كلية (نقداً)',
      detailTitle: 'تفاصيل السجل', detailMethod: 'طريقة الدفع', detailNote: 'الملاحظة', detailAmount: 'المبلغ',
      invoiceDetails: 'إجمالي الفاتورة', productCol: 'المنتج', qtyCol: 'الكمية',
      buyPriceCol: 'سعر الشراء', sellPriceCol: 'سعر البيع', lineTotalCol: 'المجموع',
      profitCol: 'الربح', marginPctCol: 'الهامش %', costEstimated: 'التكلفة تقديرية (آخر سعر شراء)',
      by: 'بقلم', byManager: 'المدير',
    },
    expenses: {
      title: 'المصاريف', sub: 'سجل كل المصروفات المسجلة في صافي الحساب مع الوقت والتاريخ',
      totalLabel: 'إجمالي المصروفات', countLabel: 'عدد العمليات',
      searchPlaceholder: 'بحث باسم الفاتورة أو المورد أو العميل...',
      allYears: 'كل السنوات', allMonths: 'كل الشهور', allDays: 'كل الأيام', allLabel: 'الكل',
      addBtn: 'إضافة صرف', addTitle: 'تسجيل صرف جديد',
      listTitle: 'سجل المصروفات', showMore: 'إظهار المزيد',
      reasonLabel: 'السبب', reasonPlaceholder: 'مثال: نقل بضاعة، فاتورة كهرباء، ترميم...', amountLabel: 'المبلغ', saveBtn: 'تسجيل الصرف',
      colDate: 'التاريخ', colDesc: 'البيان', colSource: 'المصدر', colType: 'النوع', colMethod: 'طريقة الدفع', colAmount: 'المبلغ',
      typeDirect: 'صرف مباشر', typeDispatch: 'إرسال', typeStock: 'شراء مخزون', typeSupplier: 'دفعة مورد', typePurchase: 'فاتورة شراء', typeExpense: 'مصروف', typeSalary: 'راتب',
      directExpense: 'صرف مباشر', noDesc: 'بدون بيان',
      mixedTotal: 'الإجمالي', invalidAmount: 'يرجى إدخال مبلغ صحيح', needReason: 'يرجى إدخال سبب الصرف', saved: 'تم تسجيل الصرف بنجاح',
      chooseYear: 'اختر السنة', chooseMonth: 'اختر الشهر', chooseDay: 'اختر اليوم',
    },
    discounts: {
      title: 'التخفيضات', sub: 'إدارة العروض والتخفيضات',
      add: 'إضافة تخفيض',
      col1: 'المنتج', col2: 'نسبة التخفيض', col3: 'تاريخ البداية', col4: 'تاريخ النهاية', col5: 'الحالة', col6: 'إجراءات',
      empty: 'لا توجد تخفيضات',
      unregistered: 'غير مسجل', deleteConfirm: 'حذف سجل التخفيض؟',
      totalDiscounts: 'إجمالي التخفيضات', totalValue: 'القيمة الإجمالية للتخفيضات',
      colDate: 'التاريخ', colInvoice: 'الفاتورة', colCustomer: 'العميل', colType: 'النوع', colRatio: 'النسبة', colAmount: 'المبلغ', colActions: 'إجراءات',
      viewInvoice: 'عرض الفاتورة', searchPlaceholder: 'بحث برقم الفاتورة أو المنتج...', periodAll: 'الكل', periodToday: 'اليوم', period7: '7 أيام', period30: '30 يوم', period90: '90 يوم',
    },
    returns: {
      title: 'المرتجعات', sub: 'إدارة المرتجعات والاسترجاع',
      add: 'تسجيل مرتجع', export: 'تصدير',
      col1: 'رقم المرتجع', col2: 'الفاتورة', col3: 'القطعة', col4: 'الكمية', col5: 'السبب', col6: 'التاريخ', col7: 'إجراءات',
      empty: 'لا توجد مرتجعات',
      time: 'الوقت', defaultReason: 'تعديل فاتورة',
      printReturnInvoice: 'طباعة فاتورة إرجاع',
      deleteConfirm: 'حذف سجل المرتجع؟',
      noReturnsExport: 'لا توجد مرتجعات للتصدير',
      exportSuccess: 'تم تصدير المرتجعات بنجاح',
      exportError: 'حدث خطأ أثناء الحفظ: ',
    },
    returnInvoice: {
      noReturns: 'لا توجد مرتجعات مسجلة لهذه الفاتورة.',
      invoiceMissing: 'الفاتورة غير موجودة: لا يمكن طباعة فاتورة الإرجاع.',
    },
    supplierReturns: {
      title: 'السلع الفاسدة', sub: 'إدارة إرجاع السلع الفاسدة للموردين',
      export: 'تصدير', filterAll: 'الكل',
      statusPending: 'جاري الاسترجاع', statusReturned: 'تم الاسترجاع', statusNotReturned: 'لم تسترجع',
      colProduct: 'المنتج', colQty: 'الكمية', colAmount: 'القيمة',
      colSupplier: 'المورد', colInvoice: 'الفاتورة', colDate: 'التاريخ',
      colStatus: 'الحالة', colActions: 'إجراءات', colStore: 'المحل/الفرع',
      empty: 'لا توجد طلبات إرجاع',
      noProduct: 'المنتج غير موجود', noInvoice: 'لا توجد فاتورة شراء لهذا المنتج',
      stock: 'المتوفر', supplier: 'المورد', qty: 'الكمية المرتجعة', invoice: 'فاتورة الدخول',
      note: 'ملاحظة', notePlaceholder: 'اختياري...',
      modalTitle: 'إرجاع سلعة للمورد',
      notOwned: 'لا يمكن تعديل طلبات محل آخر',
      invalidQty: 'أدخل كمية صحيحة', qtyExceedsStock: 'الكمية أكبر من المتوفر في المخزون',
      qtyExceedsInvoice: 'الكمية أكبر مما ورد في هذه الفاتورة',
      created: 'تم تسجيل طلب الإرجاع',
      confirmReturned: 'تأكيد تم الاسترجاع؟\\nسيتم خصم الكمية من المخزون وتخفيض فاتورة المورد والأثر على صافي الحساب.',
      confirmNotReturned: 'تأكيد عدم استرجاع السلعة؟\\nلن يحدث أي تغيير على المخزون أو الفاتورة.',
      insufficientStock: 'المخزون الحالي لا يكفي للخصم', invoiceMissing: 'فاتورة الشراء غير موجودة',
      lineMissing: 'المنتج لم يعد موجودًا في الفاتورة',
      returnedSuccess: 'تم الاسترجاع: خُصمت الكمية من المخزون وخفّضت فاتورة المورد',
      delete: 'حذف الطلب', deleteReverse: 'تراجع عن الاسترجاع',
      deleteConfirm: 'حذف طلب الإرجاع؟', deleteReturnedConfirm: 'حذف الطلب؟\\nسيتم التراجع عن كل التأثيرات (إعادة الكمية للمخزون ورفع الفاتورة).',
      deleted: 'تم حذف الطلب',
      refundNote: 'استرجاع بضاعة مورد',
      noExport: 'لا توجد بيانات للتصدير', exportSuccess: 'تم التصدير بنجاح', exportError: 'حدث خطأ أثناء الحفظ: ',
    },
    productDetails: {
      title: 'تفاصيل المنتج',
      batches: 'دفعات',
      salesHistory: 'سجل المبيعات',
      purchaseHistory: 'سجل الشراء من الموردين',
      returnsCount: 'عدد المرتجعات',
      customerReturns: 'مرتجعات العملاء',
      supplierReturns: 'مرتجعات المورد (السلع الفاسدة)',
      colDate: 'التاريخ', colQty: 'الكمية', colPrice: 'سعر البيع', colTotal: 'الإجمالي',
      colBuyPrice: 'سعر الشراء', colCustomer: 'العميل', colSupplier: 'المورد', colInvoice: 'الفاتورة',
      noData: 'لا توجد بيانات',
      adviceTitle: 'نصيحة شراء', adviceFrom: 'اشترِ هذا المنتج من', adviceLowest: 'أرخص سعر مدفوع', adviceCompare: 'مقارنة الموردين',
    },
    reports: {
      title: 'التقارير', sub: 'تقارير المبيعات والمخزون المتقدمة',
      c1: 'تقرير المبيعات', c1desc: 'تحليل المبيعات اليومية والأسبوعية والشهرية',
      c2: 'تقرير المخزون', c2desc: 'حالة المخزون وحركة القطع',
      c3: 'تقرير الأرباح', c3desc: 'الأرباح والخسائر',
      c4: 'تقرير العملاء', c4desc: 'تحليل قاعدة العملاء',
      dailySales: 'المبيعات اليومية', categoryDist: 'المبيعات حسب الفئة',
      bestSellers: 'أفضل المنتجات مبيعاً', brandSales: 'المبيعات حسب العلامة',
      dailyBreakdown: 'تفصيل المبيعات اليومية',
      period: 'الفترة:', exportPDF: 'تصدير PDF',
      period7: 'آخر 7 أيام', period30: 'آخر 30 يوم', period90: 'آخر 3 أشهر',
      period365: 'آخر سنة', periodAll: 'الكل',
      noSales: 'لا توجد مبيعات', profit: 'الربح',
      returnsPieces: 'المرتجعات (قطع)', pieces: ' قطعة',
      reportTitle: 'تقرير المبيعات والمرتجعات',
      periodLabel: 'الفترة:', totalSales: 'إجمالي المبيعات: ',
      totalProfit: 'إجمالي الربح: ', salesInvoiceCount: 'عدد فواتير البيع: ',
      returnsCount: 'عدد المرتجعات: ', netSales: 'صافي المبيعات: ',
      dailyDetails: 'التفصيل اليومي:', invoicesWord: ' فواتير',
      period2: 'الفترة:', thisWeek: 'هذا الأسبوع', thisMonth: 'هذا الشهر', thisYear: 'هذه السنة', custom: 'مخصص', specificDay: 'يوم محدد',
      from: 'من:', to: 'إلى:', date2: 'التاريخ:', totalSales2: 'إجمالي المبيعات', invoices2: 'فاتورة', pieces2: 'قطعة',
      profit2: 'ربح', paid2: 'مدفوع', remaining2: 'متبقي', returnCount: 'عدد المرتجعات', value: 'قيمة',
      netSales2: 'صافي المبيعات', returnRatio: 'نسبة العائد', profitMargin: 'هامش الربح',
      totalProfitMargin: 'هامش الربح الكلي', ratioLabel: 'النسبة', allTimeLabel: 'إجمالي عام',
      salesVsReturns: 'المبيعات vs المرتجعات', net: 'صافي', dailySalesVsReturns: 'المبيعات اليومية vs المرتجعات',
      salesTrend: 'اتجاه المبيعات', returnsTrend: 'اتجاه المرتجعات', salesByCategory: 'المبيعات حسب الفئة',
      returnsByReason: 'المرتجعات حسب السبب', topProducts: 'أفضل المنتجات مبيعاً',
      productCol: 'المنتج', barcodeCol: 'الباركود', qtySoldCol: 'الكمية المباعة', totalCol: 'الإجمالي', profitCol: 'الربح',
      dailyDetail2: 'تفصيل المبيعات والمرتجعات اليومي', dateCol: 'التاريخ',
      salesInvoicesCol: 'فواتير البيع', piecesSoldCol: 'قطع مباعة', salesValueCol: 'قيمة المبيعات',
      returnsCol: 'مرتجعات', piecesReturnedCol: 'قطع مرتجعة', netDayCol: 'صافي اليوم',
    },
    reportsNet: {
      title: 'صافي الحساب', period: 'الفترة:', year: 'السنة:', specificDate: 'تاريخ محدد',
      range: 'نطاق', sales: 'إجمالي المبيعات', purchases: 'إجمالي المشتريات',
      expenses: 'إجمالي المصروفات', profit: 'صافي الربح',
      periodDebt: 'المبالغ المعلقة للفترة', currentDebt: 'المبالغ المعلقة الحالية',
      customerDebt: 'دين لنا', supplierDebt: 'دين علينا',
      periodMargin: 'هامش الربح للفترة', totalMargin: 'هامش الربح الكلي',
    },
    zakat: {
      title: 'حساب الزكاة', sub: 'زكاة عروض التجارة والأموال وفقاً لمذهب جمهور العلماء',
      nisabLabel: 'قيمة النصاب لهذه السنة (DA)', nisabYear: 'السنة',
      nisabHint: 'يُدخل يدوياً بناءً على سعر الذهب/الفضة أو العملة المحلية',
      result: 'الزكاة الواجبة', resultSub: 'ربع العشر (2.5%) من الوعاء الزكوي الصافي',
      noNisab: 'أدخل قيمة النصاب أولاً لتحديد وجوب الزكاة',
      payable: 'يجب عليك إخراج', noZakat: 'لا زكاة في هذا المال — لم يبلغ الوعاء النصاب',
      deficit: 'النقص اللازم لبلوغ النصاب', reached: 'الوعاء بلغ النصاب — الزكاة واجبة',
      payNow: 'إخراج الزكاة', noAmount: 'بلغ النصاب أولاً ليتمكن التقييد',
      payConfirm: 'سيُسجَّل مبلغ زكاة السنة {year} (DA {amount}) كمصروف في سجل المصروفات ويُخصم من الحساب الختامي، بوصفه ذمةً خارجة عن المال. هل أنت متأكد؟',
      paySuccess: 'سُجِّلت زكاة السنة {year} كمصروف بنجاح.',
      alreadyPaid: 'سُجِّلت زكاة السنة {year} مسبقاً في المصروفات — لا يمكن تكرار التقييد لنفس السنة.',
      stat1: 'قيمة المخزون (سعر السوق)', stat2: 'السيولة النقدية', stat3: 'الحسابات (CCP / بنك)',
      stat4: 'الديون لنا (مرجوة التحصيل)', stat5: 'الديون علينا (إلى الموردين)',
      stat6: 'الوعاء الزكوي الصافي', stat7: 'قيمة النصاب',
      stat8: 'أموالنا عند الموردين (ديون لنا)', stat9: 'أموال العملاء لدينا (ديون علينا)',
      lqTitle: 'تفصيل السيولة النقدية والحسابات', lqSub: 'الداخل ناقص الخارج (منذ تسجيل النظام) + تسوية يدوية',
      lqCashIn: 'النقد الداخل', lqCashOut: 'النقد الخارج', lqNetCash: 'صافي النقد',
      lqCcpIn: 'CCP الداخل', lqCcpOut: 'CCP الخارج', lqNetCcp: 'صافي CCP',
      lqAdj: 'تسوية يدوية (رصيد افتتاحي / سحوبات غير مسجلة)', lqTotal: 'إجمالي السيولة',
      lqNote: 'التسوية اليدوية تُحفظ محلياً لهذه السنة فقط؛ أعد مراجعتها عند كل سنة زكوية.',
      invTitle: 'تفصيل المخزون — التقويم بسعر السوق (المفرق)',
      invSub: 'سعر البيع بالوحدة لكل منتج، بغضّ النظر عن سعر الشراء، موافقةً لقول الجمهور',
      invColProduct: 'المنتج', invColQty: 'الكمية', invColBasis: 'أساس التقويم',
      invColPrice: 'السعر (DA)', invColValue: 'القيمة (DA)', invBasisRetail: 'المفرق',
      invTotal: 'إجمالي المخزون', invEmpty: 'لا يوجد مخزون قابل للتقييم',
      debtTitle: 'الديون', debtCustomers: 'ديون لنا على العملاء (مرجوة التحصيل)',
      debtSuppliers: 'ديون علينا للموردين الحالة', debtColName: 'الاسم', debtColBalance: 'الرصيد (DA)',
      debtAtSuppliers: 'أموالنا عند الموردين (سلف/تجاوز دفع)', debtOwedCustomers: 'سلف العملاء المقبوضة (ديون علينا)',
      debtTotal: 'الإجمالي', debtEmpty: 'لا توجد',
      debtNote: 'تُضاف إلى الوعاء: ديون العملاء لنا وأموالنا عند الموردين (السلف المدفوعة له). وتُخصم منه: ديون الموردين الحالة وسلف العملاء المقبوضة (لا توجد بيانات آجال استحقاق في النظام).',
      methodTitle: 'منهج الحسبة', methodRule: 'الأصل الفقهي المطبق',
      methodB1: 'المخزون يُقوَّم بسعر السوق الحالي (سعر البيع) لا بسعر الشراء — روح التجارة السائدة.',
      methodB2: 'الأرباح النقدية والعينية المحققة داخلة في الوعاء ضمنياً؛ فهي لا تُضاف مرة أخرى.',
      methodB3: 'الديون المرجوّة التحصيل (على العملاء) وأموالنا عند الموردين تُضاف؛ والديون الحالة علينا (للموردين) وسلف العملاء المقبوضة تُخصم.',
      methodB4: 'تخرج الزكاة بمعدل ربع العشر (2.5%) على كامل الوعاء الصافي متى بلغ النصاب عليه الحول.',
      methodProfit: 'صافي الربح المرجعي (حسب صافي الحساب):',
      methodProfitNote: 'معروض كإيضاح لتتبع الأرباح، وهي مدرجة ضمنياً في المخزون والنقد أعلاه.',
      print: 'طباعة تقرير الزكاة', reportTitle: 'تقرير حساب الزكاة', reportDate: 'تاريخ الإصدار',
      countBtn: 'جرد المخزون', countSub: 'عدّ الكميات الفعلية وطابقها مع كميات النظام؛ تُصحَّح الكميات المخالفة فقط عند الحفظ.',
      countSearch: 'ابحث بالاسم أو الباركود...', countAdd: 'إضافة', countAddAll: 'إضافة كل المنتجات',
      countClear: 'تفريغ القائمة', countClearConfirm: 'سيتم تفريغ قائمة الجرد بالكامل. متابعة؟',
      countColProduct: 'المنتج', countColSystem: 'كمية النظام', countColActual: 'الكمية الفعلية',
      countColDiff: 'الفرق', countColRemove: 'حذف',
      countEmpty: 'لم تُضف أي منتج بعد. ابحث وأضف المنتجات أو استخدم «إضافة كل المنتجات».',
      countNoResults: 'لا توجد نتائج مطابقة', countAlreadyAdded: 'المنتج مضاف مسبقاً إلى قائمة الجرد.',
      countRows: 'عدد الأسطر', countDiffs: 'أسطر مختلفة',
      countSave: 'حفظ الجرد', countPrint: 'طباعة ورقة الجرد',
      countNoChanges: 'لا توجد فروق لحفظها — الكميات الفعلية مطابقة لكميات النظام.',
      countConfirm: 'سيتم تصحيح كميات {n} منتج في المخزون. لا يُسجَّل أي مصروف أو بيع. متابعة؟',
      countSaved: 'تم حفظ الجرد وتصحيح {n} منتج.',
      countNoPermission: 'لا تملك صلاحية الجرد — للمدير فقط.',
      countFixedNote: 'منتج غير مُكمّم — لا يُحتسب في قيمة الزكاة',
      countSheetTitle: 'ورقة جرد المخزون', countDate: 'تاريخ الجرد',
      countSign: 'توقيع الجارد', countSignManager: 'توقيع المدير',
    },
    backup: {
      title: 'النسخ الاحتياطي', sub: 'إدارة النسخ الاحتياطية للبيانات',
      c1: 'إنشاء نسخة احتياطية', c1desc: 'حفظ نسخة من قاعدة البيانات',
      c1btn: '<i class="fas fa-save"></i> تصدير',
      c2: 'استعادة نسخة', c2desc: 'استرجاع البيانات من نسخة سابقة',
      c2btn: '<i class="fas fa-upload"></i> استيراد',
      prevTitle: 'النسخ السابقة',
      empty: 'لا توجد نسخ احتياطية سابقة',
      restore: 'استعادة', creating: 'جاري إنشاء النسخة الاحتياطية...',
      operationCancelled: 'تم إلغاء العملية',
      createSuccess: '✓ تم إنشاء النسخة بنجاح — ',
      createFailed: '✗ فشل الحفظ: ',
      readingFile: 'جاري قراءة الملف...',
      readFileFailed: '✗ فشل قراءة الملف: ',
      invalidFile: '✗ الملف غير صالح — لا يحتوي على بيانات',
      restoreConfirm: 'استعادة النسخة الاحتياطية?',
      store: 'المتجر: ', date: 'التاريخ: ',
      content: 'المحتوى:\\n',
      products: 'المنتجات', invoices: 'الفواتير',
      customers: 'العملاء', suppliers: 'الموردين',
      payments: 'المدفوعات', returns: 'المرتجعات',
      discounts: 'التخفيضات', unknown: 'غير معروف',
      dataWarning: '⚠️ سيتم استبدال جميع البيانات الحالية بالكامل!',
      restoreCancelled: 'تم إلغاء الاستعادة',
      restoreSuccess: '✓ تمت استعادة البيانات بنجاح. أعد فتح الصفحات لتحديث العرض.',
      restoreError: '✗ خطأ: ',
      readFileFailed2: '✗ فشل القراءة: ',
      invalidFile2: '✗ الملف غير صالح',
      restoreFromFileConfirm: 'استعادة',
      restoreFromFileWarning: 'سيتم استبدال جميع البيانات الحالية.',
      restoreFromFileSuccess: '✓ تمت الاستعادة من ',
      restoreTitle: 'استعادة النسخة الاحتياطية',
      retagLabel: 'إعادة وسم البيانات بالرمز الحالي',
      retagHint: 'فعّل هذا الخيار فقط إذا كانت النسخة الاحتياطية من متجر برمز مختلف. عند التفعيل يُعاد وسم عناصر البيانات المستعادة (المنتجات، الفواتير، الطلبات...) برمز المتجر الحالي حتى تظهر في الواجهة.',
      retagWarn: 'تنبيه: عند التفعيل تُنسب بيانات المتجر القديم إلى المتجر الحالي. اتركه معطّلاً إذا كانت النسخة من نفس المتجر.',
      retagCurrent: 'رمز المتجر الحالي:',
      restoreSuccessRetag: '✓ تمت استعادة البيانات وإعادة وسمها بالرمز الحالي. أعد فتح الصفحات لتحديث العرض.',
      restoreFromFileSuccessRetag: '✓ تمت الاستعادة وإعادة الوسم من ',
      deleteAllConfirm: '⚠️ حذف كل البيانات?',
      deleteAllDetails: 'سيتم مسح جميع المنتجات، الفواتير، العملاء، الموردين، المدفوعات، المرتجعات، التخفيضات.',
      deleteAllWarning: 'هذا الإجراء لا يمكن التراجع عنه!',
      deleteAllBackupHint: 'تأكد من إنشاء نسخة احتياطية قبل المتابعة.',
      deleteAllFinalConfirm: 'تأكيد نهائي: حذف كل البيانات?\\nلن تتمكن من استعادتها بدون نسخة احتياطية.',
      deleteAllDone: '✓ تم مسح كل البيانات. استخدم "استعادة نسخة" لاسترجاع البيانات.',
      clearData: 'مسح البيانات', clearDataDesc: 'مسح كل البيانات من التطبيق — يُستخدم لاختبار استعادة النسخة الاحتياطية',
      deleteAllBtn: 'حذف كل البيانات',
    },
    sharedInventory: {
      title: 'المخزون المشترك', sub: 'عرض مخزون المحل الرئيسي والفروع المرتبطة',
      searchAll: 'بحث في جميع المحلات', searchAllPlaceholder: 'ابحث بالاسم أو الباركود لمعرفة أي محل فيه المنتج...',
      loading: 'جاري تحميل البيانات...', backToList: 'رجوع للقائمة',
    },
    migration: {
      title: 'تحميل نسخة من برنامج سابق', cardTitle: 'تحميل نسخة من برنامج سابق',
      cardDesc: 'استيراد بيانات من أي برنامج آخر (CSV, Excel, قواعد بيانات...)',
      cardBtn: 'استيراد من برنامج سابق',
      dropHere: 'اسحب الملف هنا أو اضغط للاختيار',
      supportedFormats: 'يدعم: CSV, Excel, JSON, XML, SQL, SQLite (.db), dBASE (.dbf), Firebird (.fdb), Sable Stock (.gssp/.zgssp), أي نص',
      reading: 'جاري قراءة الملف...', readError: 'خطأ في قراءة الملف',
      selectTable: 'اختر الجدول الذي يحتوي على قطع الغيار:',
      preview: 'معاينة البيانات', columns: 'عمود',
      mapColumns: 'مطابقة الأعمدة',
      mapHint: 'البرنامج حاول مطابقة الأعمدة تلقائياً — راجع وعدّل حسب الحاجة',
      noMapping: 'بدون مطابقة',
      back: 'السابق', next: 'التالي',
      totalRows: 'إجمالي الصفوف:', mappedFields: 'الحقول المطابقة:',
      moreRows: 'صفوف إضافية...',
      importBtn: 'استيراد البيانات',
      needNameOrBarcode: 'يجب مطابقة حقل اسم المنتج أو الباركود على الأقل',
      importing: 'جاري الاستيراد...', importSuccess: 'تم الاستيراد بنجاح',
      productsImported: 'منتج تم استيراده', importError: 'خطأ في الاستيراد',
      cannotRead: 'لا يمكن قراءة الملف', parseError: 'خطأ في تحليل الملف',
      forceTypeLabel: 'نوع الملف (يدوي):', forceAuto: 'تلقائي (النوع المكتشف)',
      forceTypeHint: 'اتركه «تلقائي» في الوضع الطبيعي — غيّره فقط إذا لم يتعرف البرنامج على ملف قديم.',
      engineHintSql: 'تعذّر إكمال عملية SQL Server (LocalDB) — راجع تفاصيل الخطأ أدناه؛ وعند الحاجة تحقق من صلاحيات المدير ومن وجود SqlLocalDB.msi داخل المثبّت',
      engineHintFirebird: 'تعذّر تشغيل محرّك Firebird — تأكد من وجود gbak.exe و fbclient.dll ومكتبات VC++ داخل المثبّت',
      engineHintSqlite: 'تعذّر تحميل محرّك SQLite (sql.js) — تأكد من اكتمال تثبيت البرنامج',
      engineHintGeneric: 'تعذّر فتح الملف بهذا النوع — جرّب تحديد النوع يدوياً من القائمة',
      unsupportedDbType: 'قاعدة بيانات هذا النوع تحتاج تصدير أولاً',
      exportHint: 'قم بتصدير البيانات من برنامجك القديم كملف CSV أو Excel ثم حاول مرة أخرى',
      aiAnalyzing: 'جاري التحليل بالذكاء الاصطناعي...',
      aiError: 'خطأ في الذكاء الاصطناعي',
      aiDone: 'اكتمل التحليل بالذكاء الاصطناعي',
      aiAnalyzed: 'تم التحليل بالذكاء الاصطناعي',
      chooseMode: 'اختر طريقة المعالجة',
      modeHint: 'المعالجة المحلية سريعة وتعتمد على المطابقة التلقائية. المعالجة بالذكاء الاصطناعي تحلل البيانات بذكاء لفهم النصوص غير المنظمة.',
      localMode: 'معالجة محلية',
      localHint: 'مطابقة تلقائية سريعة',
      aiMode: 'معالجة بالذكاء الاصطناعي',
      aiHint: 'تحليل ذكي عبر مزود AI تختاره',
      aiRequiresKey: '* المعالجة بالذكاء الاصطناعي تتطلب مفتاح API مضبوط في الإعدادات',
      mssqlNoPath: 'تعذر الوصول إلى مسار ملف النسخة الاحتياطية',
      mssqlOpenError: 'تعذر فتح نسخة SQL Server (.bak)',
      mssqlNoTables: 'لا توجد جداول قابلة للقراءة في نسخة SQL Server',
      firebirdNoPath: 'تعذر الوصول إلى مسار ملف قاعدة Firebird',
      firebirdNoTables: 'لا توجد جداول قابلة للقراءة في قاعدة البيانات',
      firebirdOpenError: 'تعذر فتح قاعدة بيانات Firebird',
      firebirdTableError: 'تعذر قراءة الجدول',
      selectRole: 'ماذا يحتوي هذا الجدول؟',
      roleHint: 'حدد نوع البيانات ليُستورد بالشكل الصحيح',
      roleProducts: 'قطع غيار / منتجات',
      roleCustomers: 'العملاء',
      roleSuppliers: 'الموردون',
      needName: 'يجب مطابقة حقل الاسم على الأقل',
      importDone: 'تم الاستيراد بنجاح',
      roleSalesInvoices: 'فواتير البيع',
      rolePurchaseInvoices: 'فواتير الشراء',
      importedNote: 'مستورد',
      oldInvoiceNote: 'فاتورة مستوردة',
      oldPaymentNote: 'مدفوعات مستوردة',
      restoringBackup: 'جاري استرجاع النسخة الاحتياطية (gbak)...',
      preparingEngine: 'جاري تجهيز محرّك SQL Server...',
      rolePayments: 'الدفعات',
      loadingBrands: 'جاري قراءة العلامات التجارية...',
      brandEmpty: 'بدون علامة',
      fullImportPanelTitle: 'استيراد شامل لكل البيانات',
      fullImportPanelDesc: 'تم اكتشاف قاعدة بيانات Sable Stock / Gestion Stock — يمكن استيراد كل شيء دفعة واحدة: العملاء، الموردون، المنتجات بالأسعار، الفواتير والمرتجعات.',
      fullImportBtn: 'استيراد شامل',
      fullImportPopupTitle: 'اختر العلامات التجارية للاستيراد',
      fullImportPopupHint: 'حدد العلامات التجارية التي تريد استيراد منتجاتها. المنتجات التي لا تحمل علامة تُستورد دائماً.',
      selectAll: 'تحديد الكل',
      cancelImport: 'إلغاء',
      confirmImport: 'بدء الاستيراد',
      creatingBackup: 'جاري إنشاء نسخة احتياطية قبل الاستيراد...',
      productsNone: 'لم يتم استيراد أي منتج (تأكد من تحديد العلامات)',
      markBackfilled: 'تم استرجاع المارك للمنتجات الموجودة',
      fullImportDone: 'اكتمل الاستيراد الشامل',
      gsspReading: 'جاري فتح نسخة Sable Stock...',
      gsspNotSable: 'هذا الملف ليس نسخة Sable Stock صالحة',
      gsspBadPassword: 'تعذر فتح نسخة Sable Stock — كلمة مرور النسخة غير معروفة لهذا الإصدار',
      gsspPanelDesc: 'تم اكتشاف نسخة Sable Stock (GSSP) — يمكن استيراد كل شيء دفعة واحدة: العملاء، الموردون، المنتجات بالأسعار، فواتير البيع، المبيعات النقدية والدفعات بتواريخها الحقيقية.',
      gsspSaleLine: 'بيع',
      gsspCashLine: 'بيع نقدي',
      gsspCashLabel: 'فاتورة نقدية',
      gsspInvoiceNote: 'فاتورة Sable Stock',
      gsspCashNote: 'فاتورة نقدية Sable Stock',
      gsspPaymentNote: 'دفعة Sable Stock',
      gsspSkipped: 'موجود مسبقاً',
      returnsCount: 'المرتجعات',
      avoirReason: 'مرتجع (Avoir)',
      walkin: 'عميل عابر',
      dispatchNote: 'ملاحظة فاتورة الإرسال', dispatchNotePlaceholder: 'ملاحظة تُطبع على فاتورة الإرسال...',
    },
    brandCat: { brand: 'العلامة', category: 'اختر نوع القطعة', searchPlaceholder: 'بحث عن نوع...', addProduct: 'إضافة منتج', noCategories: 'لا توجد أقسام بعد', addCategory: 'إضافة قسم', products: 'منتج' },
    catProducts: { title: 'المنتجات', sub: 'المنتجات المتوفرة', searchPlaceholder: 'بحث عن منتج...', addProduct: 'إضافة منتج', empty: 'لا توجد منتجات في هذا التصنيف', addInvoiceTitle: 'إضافة منتج للفاتورة', scanPlaceholder: 'امسح الباركود ضوئياً...', scannerReady: 'جاهز للمسح', searchProduct: 'بحث عن منتج', newProduct: 'منتج جديد', searchExisting: 'ابحث بالاسم أو الباركود', searchExistingPlaceholder: 'اسم المنتج أو الباركود...', name: 'اسم المنتج', namePlaceholder: 'اسم القطعة', barcode: 'الباركود', barcodePlaceholder: 'أدخل الباركود', generate: 'توليد', qty: 'الكمية', buyPrice: 'سعر الشراء', sellPrice: 'سعر البيع', supplier: 'المورد', supplierPlaceholder: 'ابحث عن مورد بالاسم...', cancel: 'إلغاء', addToCart: 'إضافة إلى سلة الفاتورة', cartTitle: 'سلة الفاتورة', total: 'الإجمالي:', clear: 'تفريغ',       confirmInvoice: 'تأكيد الفاتورة', fiscalStamp: 'طابع جبائي (Timbre Fiscal)', wholesalePrice: 'سعر البيع بالجملة' },
    settings: {
      title: 'الاعدادات', sub: 'إعدادات البرنامج',
      printSettingsBtn: 'اعدادات الطباعة',
      general: 'الإعدادات العامة',
      storeName: 'اسم المتجر', currency: 'العملة', language: 'اللغة', buttonSound: 'صوت الأزرار', introSound: 'صوت المقدمة',
      productQR: 'إظهار رمز QR للمنتجات', productQRHint: 'عند التفعيل يظهر رمز QR صغير على بطاقات المنتجات في المخزون والبيع. الخيار معطّل افتراضياً ويُحفظ على هذا الجهاز.',
      openIsolated: 'فتح نافذة مستقلة', createShortcut: 'اختصار سطح المكتب',
      isolatedHint: 'تفتح الشركة في نافذة وعملية منفصلة ببيانات معزولة تماماً عن بقية الشركات.',
      snapshotDone: 'تم تجهيز نسخة الشركة.', snapshotError: 'تعذّر تجهيز نسخة الشركة:',
      openDone: 'تم فتح النافذة المستقلة.', openError: 'تعذّر فتح النافذة المستقلة:',
      shortcutDone: 'تم إنشاء الاختصار على سطح المكتب.', shortcutError: 'تعذّر إنشاء الاختصار:',
      isolatedOnly: 'هذه النافذة مخصصة لشركة واحدة فقط.',
      staleBuild: 'النسخة المثبّتة قديمة ولا تحتوي نافذة الشركة المستقلة. أغلق البرنامج وأعد تشغيل النسخة المحدّثة، أو ثبّت الإصدار 3.3.6.',
      notif: 'إشعارات المخزون المنخفض',       autoBackup: 'نسخ احتياطي تلقائي',
      info: 'معلومات البرنامج',
      version: 'الإصدار', developer: 'مطور البرنامج', company: 'الشركة المطورة', lastUpdate: 'آخر تحديث',
      smtpCard: 'البريد الإلكتروني (SMTP) — لإرسال الفواتير', smtpDesc: 'اضبط بيانات خادم بريدك لإرسال فواتير PDF مباشرة من بريدك. البيانات محفوظة محلياً على هذا الجهاز فقط.',
      smtpHost: 'مضيف SMTP', smtpPort: 'المنفذ', smtpSecure: 'اتصال آمن (SSL/TLS)',
      smtpSecureHint: 'فعّل لـ المنفذ 465 (SSL). أوقفه لـ 587 (STARTTLS).',
      smtpUser: 'اسم المستخدم (البريد)', smtpPass: 'كلمة المرور / كلمة تطبيق',
      smtpFrom: 'البريد الظاهر (From)', smtpFromHint: 'اتركه فارغاً لاستخدام اسم المستخدم',
      smtpTest: 'اختبار الإرسال', smtpPassHint: 'ملاحظة مهمة: بريد Gmail (ومعظم المزودين مثل Outlook/Yahoo) لا يقبل كلمة المرور العادية. يجب تفعيل "التحقق بخطوتين" ثم إنشاء "كلمة تطبيق" (App Password) من إعدادات حسابك، ووضع تلك الـ 16 خانة هنا.',
      invoiceLogo: 'لوغو العمل (الفواتير)',
      logoUpload: 'تحميل لوغو العمل', logoPreview: 'معاينة اللوغو', logoRemove: 'إزالة',
      logoLayout: 'موضع اللوغو وحجمه وشفافيته', logoSize: 'الحجم', logoOpacity: 'الشفافية',
      logoLocalHint: 'يُحفظ على هذا الجهاز فقط ولا يُرفع إلى السحابة.',
      logoPreviewHint: 'هكذا سيظهر اللوغو على الفاتورة المطبوعة.', logoPreviewBw: 'أبيض وأسود',
      logoSaved: 'تم حفظ لوغو العمل', logoRemoved: 'تمت إزالة اللوغو',
      logoImportFailed: 'تعذّر استيراد اللوغو', logoNone: 'لا يوجد لوغو محمّل',
      logoRemoveConfirm: 'إزالة لوغو العمل من الفواتير؟',
    },
    chart: { sales: 'المبيعات', inventory: 'المخزون', returns: 'المرتجعات' },
    connection: {
      title: 'اعدادات الاتصال', sub: 'إعدادات الاتصال السحابي وإدارة المحلات',
    },
    btn: {
      newInvoice: 'فاتورة جديدة', addPart: 'إضافة قطعة', export: 'تصدير',
      addSupplier: 'إضافة مورد', addCustomer: 'إضافة عميل', addDiscount: 'إضافة تخفيض',
      addReturn: 'تسجيل مرتجع',
    },
    common: {
      save: 'حفظ', cancel: 'إلغاء', delete: 'حذف', edit: 'تعديل', confirm: 'تأكيد', send: 'إرسال',
      close: 'إغلاق', print: 'طباعة', loading: 'جاري التحميل...', processing: 'جاري المعالجة...',
      noResults: 'لا توجد نتائج', empty: 'فارغ', search: 'بحث',
      noPermission: 'لا تملك صلاحية للقيام بهذه العملية',
      noAccessHint: 'لا تملك صلاحية الوصول لأي صفحة. تواصل مع المدير.',
      page: 'صفحة', of: 'من', product: 'منتج', piece: 'قطعة', invoice: 'فاتورة',
      qty: 'الكمية', total: 'الإجمالي', paid: 'المدفوع', remaining: 'المتبقي', debt: 'دين',
      date: 'التاريخ', name: 'الاسم', status: 'الحالة', actions: 'إجراءات',
      yes: 'نعم', no: 'لا', success: 'تم بنجاح', error: 'خطأ', warning: 'تنبيه',
      areYouSure: 'هل أنت متأكد؟', stock: 'المخزون', price: 'السعر',
      addItem: 'إضافة', removeItem: 'إزالة', clearCart: 'تفريغ السلة',
      ready: 'جاهز', done: 'تم ✓', notFound: 'غير موجود', outOfStock: 'غير متوفر',
      lowStock: 'مخزون منخفض', new: 'جديد', provisional: 'شكلي',
      paidFull: 'مدفوعة كلياً', paidPartial: 'دفعة جزئية', unpaid: 'غير مدفوعة',
      manual: 'يدوي', customer: 'عميل',
      back: 'رجوع', pay: 'دفع', payFull: 'دفع كلياً', searchAll: 'بحث في الكل', refresh: 'تحديث', confirmPay: 'تأكيد الدفع',
      barcode: 'الباركود', brand: 'العلامة التجارية', category: 'التصنيف', supplier: 'المورد',
      address: 'العنوان', phone: 'رقم الهاتف', email: 'البريد الإلكتروني', username: 'اسم المستخدم', password: 'كلمة المرور',
      generate: 'توليد', fiscalStamp: 'الطابع الجبائي', cart: 'السلة', clear: 'تفريغ',
      subtotal: 'المجموع الفرعي', discount: 'الخصم', totalAfterDiscount: 'الإجمالي بعد الخصم',
      payNow: 'المبلغ المدفوع الآن', remainingDebt: 'المتبقي (دين)', fullPayment: 'دفع كامل', noPayment: 'بدون دفع',
      real: 'حقيقي', formal: 'شكلي', customerDiscount: 'خصم العميل', additionalDiscount: 'تخفيض إضافي',
    },
    sales: {
      title: 'البيع', sub: 'إنشاء فاتورة بيع جديدة',
      searchParts: 'بحث القطع', searchPlaceholder: 'ابحث باسم القطعة أو رقمها...',
      emptySearch: 'اكتب لبدء البحث عن قطع الغيار',
      emptyResults: 'لا توجد نتائج للبحث', emptyProducts: 'لا توجد منتجات',
      cart: 'سلة المشتريات', cartEmpty: 'السلة فارغة', total: 'المجموع:',
      checkout: 'إتمام البيع',
      unavailable: 'غير متوفر', lowStockTip: 'مخزون منخفض',
      scannerReady: 'جاهز', scannerDone: 'تم ✓', scannerNotFound: 'غير موجود', scannerUnavailable: 'غير متوفر',
      scannerMultiple: 'عدة نتائج — اختر المنتج من القائمة',
      noCustResults: 'لا توجد نتائج', discount: 'خصم',
      del: 'حذف',
      fullyPaid: 'مدفوعة كلياً', partialPay: 'دفعة جزئية', enterPaid: 'أدخل المبلغ المدفوع',
      cartEmptyAlert: 'السلة فارغة', notAvailableQty: 'غير متوفر بالكمية المطلوبة', available: 'المتوفر:',
      paidExceedsTotal: 'المبلغ المدفوع لا يمكن أن يتجاوز الإجمالي',
      fullPaymentNote: 'دفع كامل عند البيع', partialPaymentNote: 'دفع جزئي عند البيع',
      overpayTitle: 'المبلغ المدفوع أكبر من المستحقات', overpayMsg: 'المبلغ المدفوع أكبر من إجمالي الفاتورة. هل تريد المتابعة وتسجيل المبلغ الزائد؟', overpayContinue: 'متابعة',
      creditWarn: 'تجاوز سقف رصيد العميل', creditWarnMsg: 'سيؤدي هذا البيع إلى تجاوز الرصيد المسموح بالتعامل مع العميل — هل تريد المتابعة؟', creditLimit: 'سقف الدين', projectedBalance: 'الرصيد المتوقع بعد البيع', creditContinue: 'مواصلة', creditBlocked: 'لا يمكن تجاوز سقف الدين — قم بتعديل السلة أو اختيار طريقة دفع أخرى', creditDebtMsg: 'يجب على هذا العميل دفع الديون السابقة لاستمرار هذه العملية',
      discountType: 'عميل', discountManual: 'يدوي', lineDiscount: 'تخفيض السطر',
      clearCartConfirm: 'تفريغ سلة المشتريات؟',
      customer: 'العميل', customerPlaceholder: 'ابحث عن عميل...', unregistered: 'زبون غير مسجل', remove: 'إزالة',
      pickSubCustomer: 'اختيار زبون تابع',
      cartTitle: 'سلة المشتريات', subtotal: 'المجموع الفرعي', customerDiscount: 'خصم العميل', additionalDiscount: 'تخفيض إضافي',
      totalLabel: 'الإجمالي', paidLabel: 'المبلغ المدفوع', payFull: 'دفع كلياً', remainingLabel: 'الباقي',
      clear: 'تفريغ', checkout: 'إتمام البيع', emptyCartTitle: 'السلة فارغة', emptyCartHint: 'امسح باركود القطعة أو اخترها من قائمة المنتجات',
      scanPlaceholder: 'امسح الباركود أو ابحث بالاسم...', searchPlaceholder2: 'ابحث باسم القطعة أو الباركود...', productsCount: '0 منتج', multiBatches: 'دفعات متعددة', mixedPrice: 'أسعار متعددة', unit: 'قطعة', wholesale: 'جملة', unlimited: 'غير محدود', freeBtn: 'بيع منتج غير مدرج', freeTitle: 'بيع منتج غير مدرج', freeHint: 'صنف لا بطاقة له في المخزن: تُكتب الكمية والسعر يدوياً، ولا يُنقص شيء من المخزون.', freeName: 'اسم المنتج (اختياري)', freeNamePh: 'اتركه فارغاً لعرض «منتج غير موجود في المخزن»', freeQty: 'الكمية', freePrice: 'سعر الوحدة', freeTotal: 'الإجمالي', freeAdd: 'إضافة للسلة', freeDefaultName: 'منتج غير موجود في المخزن', freeTag: 'غير مدرج', freeNoCost: 'بلا تكلفة', freeQtyBad: 'أدخل كمية أكبر من صفر', freePriceBad: 'أدخل سعراً للمنتج',
      payMethod: 'طريقة الدفع', payCash: 'نقداً', payCcp: 'CCP', payBoth: 'الاثنان معاً',
      cashAmount: 'المبلغ النقدي', ccpAmount: 'مبلغ CCP',
      marginBtn: 'إعدادات نسبة البيع', marginTitle: 'الحد الأدنى لنسبة الربح', marginHint: 'النسبة تُحسب من سعر العرض مقابل تكلفة القطعة: لا يُسمح بالنزول تحت الحد المعروض.',
      marginEnabled: 'تفعيل الحد الأدنى', marginRetail: 'نسبة التجزئة %', marginWholesale: 'نسبة الجملة %', marginStore: 'كل المحل',
      marginRules: 'استثناءات (تصنيف أو علامة أو منتج)', marginScopeCat: 'تصنيف', marginScopeBrand: 'علامة', marginScopeProduct: 'منتج',
      marginPick: 'اختر', marginAdd: 'إضافة استثناء', marginRemove: 'حذف', marginNone: 'بدون استثناء',
      marginPwd: 'كلمة مرور المحل', marginPwdBad: 'كلمة المرور غير صحيحة', marginSaved: 'تم حفظ إعدادات نسبة البيع',
      marginWarn: 'هذا السعر ينزل تحت الحد الأدنى لنسبة الربح', marginMin: 'أقل سعر مسموح', marginContinue: 'المواصلة', marginAccept: 'اعتماد أقل سعر',
    },
    orders: {
      title: 'الطلبات', sub: 'طلب القطع الناقصة من الموردين',
      tabMine: 'طلباتي', tabBranches: 'طلبات الفروع',
      suggestions: 'اقتراحات النقص', noSuggestions: 'لا توجد منتجات منخفضة أو نافدة — رائع!',
      search: 'ابحث باسم القطعة أو الباركود...',
      all: 'الكل', today: 'اليوم', week: 'الأسبوع', month: 'الشهر', year: 'السنة',
      refresh: 'تحديث',
      empty: 'لا توجد طلبات بعد — أضف من اقتراحات النقص أو ابحث',
      statusPending: 'قيد الانتظار', statusDone: 'منجز', statusNotAvailable: 'لا يوجد',
      btnDone: 'منجز', btnNotAvailable: 'لا يوجد', btnDelete: 'حذف',
      deleteConfirm: 'حذف هذا الطلب؟',
      cloudRequired: 'يتطلب اتصالاً بالسحابة لعرض طلبات الفروع',
      loading: 'جاري تحميل طلبات الفروع...',
      noBranchOrders: 'لا توجد طلبات من الفروع بعد',
    },
    invoices: {
      title: 'الفواتير', sub: 'جميع فواتير البيع والمشتريات',
      search: 'بحث عن فاتورة...', newInvoice: 'فاتورة جديدة', quickEntry: 'إدخال سريع', smartAdd: 'إضافة ذكية',
      col1: 'رقم الفاتورة', col2: 'التاريخ', col3: 'العميل', col4: 'المبلغ', col5: 'الحالة', col6: 'إجراءات',
      empty: 'لا توجد فواتير بعد', noMatch: 'لا توجد فواتير مطابقة',
      resultsInfo: ' فاتورة',
      typeSale: 'فاتورة بيع', typeSupplier: 'فاتورة مورد', typeWaybill: 'فاتورة طريق / وصل تسليم',
      typeProforma: 'فاتورة شكلية', typeDispatch: 'فاتورة إرسال', typeTransfer: 'فاتورة تحويل',
      typeReception: 'فاتورة استلام', typePurchase: 'فاتورة شراء',
      newPaymentInvoice: 'سند قبض', typePayment: 'سند قبض',
      paymentInvoiceTitle: 'سند قبض جديد',
      paymentInvoiceDesc: 'تسجيل مال مقبوض من عميل أو مورد (يُحتسب إيراداً)، أو سند دين لمورد بدون مال — تسوية رصيد بدون فاتورة.',
      payFromCustomer: 'قبض من عميل', payFromSupplier: 'قبض من مورد', payToSupplier: 'سند دين لمورد',
      supplierDebtNote: 'سند دين (بدون مال — لا يُحتسب إيراداً)',
      payParty: 'العميل / المورد', payOutstanding: 'الدين الحالي (الاستحقاق)',
      payAmount: 'مبلغ السند', payMethod: 'طريقة الدفع', payNote: 'ملاحظة (اختياري)',
      confirmPayment: 'حفظ السند', receivedLabel: 'مقبوض',
      selectPayCustomer: 'اختر العميل', selectPaySupplier: 'اختر المورد',
      payPartySearch: 'اكتب للبحث عن عميل أو مورد...', noDebt: 'لا دين', owedOn: 'عليه دين (هو مدين لنا)', owedFor: 'له (نحن ندين له)',
      customerBalance: 'رصيد العميل', supplierBalance: 'رصيد المورد',
      overpayWarn: 'المبلغ أكبر من الدين الحالي — رصيد العميل الحالي:',
      chooseParty: 'يرجى اختيار عميل أو مورد', paymentInvoiceSaved: 'تم حفظ السند {n} بنجاح',
      cannotPayVoucher: 'سند القبض مسدد بالكامل — لا يمكن إضافة دفعة عليه',
      cannotEditVoucher: 'سند القبض قابل للعرض فقط — لا يمكن تعديله',
      custVoucherNote: 'سند قبض — تسوية رصيد بدون فاتورة',
      suppVoucherNote: 'سند دين لمورد — تسوية رصيد بدون فاتورة',
      suppReceiptNote: 'قبض من مورد — تسوية رصيد بدون فاتورة',
      badgeProvisional: 'شكلي',
      printReturnInvoice: 'طباعة فاتورة إرجاع',
      returnNote: 'ملاحظة مرتجع',
      returnNoteHint: 'تحتوي هذه الفاتورة على {count} مرتجع بإجمالي {amount} — اطبع فاتورة الإرجاع للاطلاع على الأصناف المرتجعة.',
      itemCount: 'منتج', paidLabel: 'مدفوعة', unpaidLabel: 'غير مدفوعة', remainingLabel: 'متبقي',
      invCardProduct: 'المنتج', invCardQty: 'الكمية', invCardPrice: 'السعر', invCardDiscount: 'الخصم', invCardTotal: 'الإجمالي', invCardMoreItems: 'أصناف أخرى',
      pageInfo: 'الصفحة', allowPopups: 'الرجاء السماح بالنوافذ المنبثقة للطباعة',
      cannotPayReception: 'لا يمكن إضافة دفعة لفاتورة استلام — فاتورة مرجعية فقط',
      cannotPayProforma: 'لا يمكن إضافة دفعة لفاتورة شكلية',
      fullyPaidAlert: 'هذه الفاتورة مسددة بالكامل', invalidAmount: 'المبلغ غير صحيح',
      transferPayNote: 'دفعة على فاتورة تحويل', regularPayNote: 'دفعة عبر الفواتير',
      paymentSaved: 'تم تسجيل الدفعة بنجاح',
      cannotEditDispatch: 'لا يمكن تعديل فاتورة إرسال',
      cannotEditReception: 'لا يمكن تعديل فاتورة استلام — فاتورة مرجعية فقط',
      cannotEditProformaWaybill: 'لا يمكن تعديل فاتورة طريق شكلية',
      noPermission: 'غير مصرح لك بعرض هذه الفاتورة',
      editTitle: 'تعديل الفاتورة',
      editHelpSupplier: 'فاتورة مورد: زيادة الكمية تزيد المخزون ورصيد المورد، نقص الكمية يقلل المخزون ورصيد المورد.',
      addFromScratch: 'إضافة من العدم',
      qeUndoRemove: 'تراجع',
      addFromScratchConflict: 'تعارض الباركود: يوجد منتج آخر بنفس الباركود ببيانات مختلفة',
editHelpCustomer: 'قم بتعديل الكميات وسعر الوحدة والخصم لكل سطر. الزيادة تُخصم من المخزون، النقصان يُرجع للمخزون ويُسجل كمرتجع. الإجمالي يُحسب تلقائياً = (سعر × كمية) − الخصم.',
      scanPlaceholder: 'امسح الباركود أو اكتب اسم المنتج...',
      editColProduct: 'المنتج', editColCurrentQty: 'الكمية الحالية', editColNewQty: 'الكمية الجديدة',
      editColDiscount: 'الخصم', editColLineTotal: 'إجمالي السطر',
      saveEdits: 'حفظ التعديلات', cancelEdit: 'إلغاء',
      scanDone: 'تم ✓', scanReady: 'جاهز', scanNotFound: 'غير موجود', resultCount: 'نتيجة',
      availableStock: 'متوفر:', notInStock: 'غير متوفر في المخزون', badgeNew: 'جديد',
      cannotBelowZero: 'لا يمكن جعل كمية "..." أقل من الصفر في المخزون',
      insufficientStock: 'المخزون غير كافٍ لـ "..."',
      noQtyChanged: 'لم يتم تغيير أي كمية',
      noChangesMade: 'لم يتم إجراء أي تغيير',
      invoiceEdited: 'تم تعديل الفاتورة بنجاح',
      deleteConfirm: 'هل أنت متأكد من حذف هذه الفاتورة بالكامل؟ سيتم إرجاع المنتجات للمخزون وحذف الدفعات والمرتجعات المرتبطة.',
      cannotDeleteReception: 'لا يمكن حذف فاتورة استلام — فاتورة مرجعية فقط',
      cannotDeleteSold: 'لا يمكن حذف فاتورة المورد لأن المنتج "..." تم بيعه بالفعل',
      invoiceDeleted: 'تم حذف الفاتورة',
      transferEditTitle: 'تعديل فاتورة التحويل',
      transferEditHelp: 'تعديل كمية الأصناف. الزيادة تنقص من مخزونك وتُضاف للمُستلم. النقصان يُضاف لمخزونك وينقص من المُستلم.',
      currentTotal: 'الإجمالي الحالي:', editColSellPrice: 'ثمن البيع',
      newTotal: 'الإجمالي الجديد:', diff: 'الفرق:',
      paidEditLabel: 'المبلغ المدفوع', paidEditHint: 'عدّل المبلغ المدفوع نقدًا؛ يُحدَّث رصيد الطرف وصافي الحساب والمصروفات والمبيعات والهامش تلقائيًا.',
      paidEditNote: 'تعديل المبلغ المدفوع', paidEditRemaining: 'المتبقي:', paidEditCredit: 'رصيد دائن',
      deleteLine: 'حذف السطر', addFreeLine: 'إضافة سطر يدوي',
      freeLineBadge: 'سطر يدوي', freeLineNamePlaceholder: 'اسم الصنف (بدون منتج في المخزون)',
      freeLineNameRequired: 'اكتب اسم الصنف في السطر اليدوي', freeLineQtyRequired: 'كمية السطر اليدوي يجب أن تكون أكبر من الصفر',
    },
    inventory: {
      title: 'المخزون', sub: 'إدارة مخزون قطع الغيار',
      search: 'بحث في المخزون...', add: 'إضافة قطعة', export: 'تصدير',
      col1: 'الباركود', col2: 'اسم القطعة', col3: 'العلامة', col4: 'الكمية', col5: 'سعر الشراء', col6: 'سعر البيع', col7: 'إجراءات',
      empty: 'المخزون فارغ',
      customizeBtn: 'تخصيص الأزرار', customizeTitle: 'تخصيص أزرار صفحة المخزون',
      customizeHint: 'اختر الأزرار التي تريد إظهارها في صفحة المخزون. يُحفظ اختيارك تلقائيًا على هذا الجهاز.',
      customizeShowAll: 'إظهار الكل',
      transferBranch: 'نقل المنتجات إلى فرع أو محل رئيسي',
      transferMain: 'نقل منتجات إلى الفروع',
      scannerReady: 'جاهز للمسح', scannerProcessing: 'جاري المعالجة...',
      scannerFound: 'تم العثور على:', scannerDone: 'تم المسح',
      scannerNewBarcode: 'منتج جديد - الباركود', scannerNew: 'منتج جديد',
      noResults: 'لا توجد نتائج',
      enterName: 'الرجاء إدخال اسم المنتج', enterBarcode: 'الرجاء إدخال الباركود',
      clearCartConfirm: 'تفريغ سلة الفاتورة؟', cartEmpty: 'سلة الفاتورة فارغة',
      invoiceSaved: 'تم تسجيل فاتورة بقيمة', fiscalStamp: 'طابع جبائي',
      includes: 'تشمل', productUnit: 'منتج', pieceUnit: 'قطعة',
      editLabelName: 'اسم المنتج', editLabelBarcode: 'الباركود', editLabelBrand: 'العلامة',
      editLabelCategory: 'التصنيف', editLabelQty: 'الكمية', editLabelBuyPrice: 'سعر الشراء', editLabelSellPrice: 'سعر البيع', editLabelWholesale: 'سعر البيع بالجملة',
      editTitle: 'تعديل المنتج',
      diagnoseBtn: 'تشخيص', diagTitle: 'تقرير تشخيص المنتج',
      diagDuplicateYes: 'يوجد تكرار: عدة بطاقات لنفس المنتج', diagDuplicateNo: 'لا يوجد تكرار (بطاقة واحدة)',
      diagGroupCount: 'عدد البطاقات بنفس الهوية/الباركود',
      diagVerdictLabel: 'السبب المرجّح', diagVerdictSingle: 'بطاقة واحدة (لا تكرار)',
      diagVerdictSplit: 'فصل ذكي: اختلاف سعر/كلفة/صلاحية — وهذا سلوك مقصود',
      diagVerdictIndependent: 'إنشاء مستقل مزدوج: نفس الهوية لكن أُنشئت مرتين (ذاكرة قديمة/نافذة ثانية أو مسار مختلف)',
      diagVerdictIdentity: 'اختلاف في حقل الهوية (الاسم/العلامة/المرجع/بلد المنشأ/المارك) ⇒ يُعاملان كمنتجين مختلفين',
      diagScope: 'النطاق الحالي', diagCompany: 'الشركة:', diagStore: 'المحل:',
      diagInScope: 'داخل النطاق', diagOutScope: 'خارج النطاق',
      diagSupplierDiff: 'المورد مختلف بين البطاقات — هذا يفسّر ظهور بطاقة بمورد وأخرى بدونه.',
      diagSupplierSame: 'المورد متطابق بين البطاقات.',
      diagCreated: 'أُنشئت', diagSource: 'المصدر', diagSupplier: 'المورد', diagQty: 'الكمية',
      diagBuy: 'شراء', diagSell: 'بيع', diagRealCost: 'الكلفة الحقيقية',
      diagSplitReason: 'سبب الفصل', diagSplitFrom: 'مفصولة عن', diagCurrent: 'الحالية', diagNone: 'بدون',
      diagIdentityDiff: 'اختلاف الهوية',
      diagQtyCheck: 'مطابقة الكمية', diagGroupQty: 'مجموع كميات البطاقات', diagPurchaseQty: 'مجموع كميات فواتير الشراء', diagPurchaseLines: 'عدد أسطر الشراء',
      diagQtyOk: 'الكمية مطابقة لفواتير الشراء.', diagQtyMismatch: 'الكمية لا تطابق فواتير الشراء — قد يكون هناك إدخال مزدوج أو تعديل يدوي.',
      diagAudit: 'سجل عمليات هذا المنتج', diagNoAudit: 'لا توجد عمليات مسجلة لهذا المنتج.', diagReason: 'السبب',
      diagHint: 'بطاقتان بنفس الباركود = فصل ذكي (اختلاف سعر/كلفة) أو إنشاء مستقل. راجع عمود «سبب الفصل» والمصدر.',
      diagNotFound: 'تعذّر العثور على المنتج.',
      deleteConfirm: 'هل أنت متأكد من حذف هذا المنتج؟',
      importSuccess: 'تم استيراد', importSuccessEnd: 'منتج بنجاح',
      importCost: 'تكلفة المشتريات:', importRecorded: 'مسجلة في صافي الحساب',
      importFailed: 'فشل الاستيراد. تأكد من تنسيق الملف',
      addWithInvoice: 'إضافة مخزون + فاتورة', transferBtn: 'نقل منتجات', exportExcel: 'تصدير Excel', exportXlsxTitle: 'تصدير المخزون إلى Excel', exportWithBuy: 'تصدير بسعر الشراء', exportWithoutBuy: 'تصدير بدون سعر الشراء', exportExcludeZero: 'استبعاد المنتجات ذات الكمية صفر', exportExcludeZeroHint: 'يُحفظ اختيارك ويُطبَّق على التصديرات القادمة', exportSkippedZero: 'تم استبعاد منتجات بكمية صفر:', exportSheetTitle: 'قائمة المخزون', exportDate: 'تاريخ التصدير', exportCount: 'عدد المنتجات', exportBy: 'بواسطة', exportTotal: 'الإجمالي', noExport: 'لا توجد بيانات للتصدير', exportSuccess: 'تم التصدير بنجاح', exportError: 'حدث خطأ أثناء الحفظ: ', colName: 'اسم المنتج', colBarcode: 'الباركود', colBrand: 'العلامة التجارية', colMark: 'المارك', colReference: 'المرجع', colCountry: 'بلد المنشأ', colStorage: 'مكان التخزين', colQty: 'الكمية', colBuyPrice: 'سعر الشراء', colSellPrice: 'سعر البيع', colWholePrice: 'سعر الجملة', colExpiry: 'تاريخ الانتهاء', exportCSV: 'تصدير CSV', importCSV: 'استيراد CSV / Excel', addDirect: 'إضافة منتج من غير فاتورة', addDirectTitle: 'إضافة منتج من غير فاتورة', addDirectBtn: 'إضافة المنتج للمخزون', addDirectHint: 'يُضاف المنتج إلى المخزون مباشرة دون إنشاء فاتورة مشتريات. سعر الشراء اختياري.', barcodeConflict: 'هذا الباركود مسجّل لمنتج آخر', invalidBarcode: 'الباركود غير صالح', entryDestination: 'اتجاه القيد المالي (سعر الشراء × الكمية)',
      addTitle: 'إضافة مخزون + فاتورة', scanPlaceholder2: 'امسح الباركود ضوئياً...',
      searchExisting: 'ابحث عن منتج موجود (بالاسم أو الباركود)', searchExistingPlaceholder: 'اسم المنتج أو الباركود...',
      category: 'التصنيف', name: 'اسم المنتج', barcode: 'الباركود', generate2: 'توليد',
      qty: 'الكمية', buyPrice: 'سعر الشراء', sellPrice: 'سعر البيع', wholesalePrice: 'سعر البيع بالجملة', supplierOptional: 'المورد (اختياري)',
      supplierSearchPlaceholder: 'ابحث عن مورد...', addToCart: 'إضافة إلى سلة الفاتورة',
      invoiceCart: 'سلة الفاتورة', fiscalStamp2: 'الطابع الجبائي (Timbre Fiscal)', totalLabel: 'الإجمالي:',
      clear2: 'تفريغ', confirmInvoice: 'تأكيد الفاتورة', categoryCol: 'التصنيف',
      quickAdd: 'إضافة منتج ثابت', quickAddTitle: 'إضافة منتج ثابت', quickAddHint: 'منتج ثابت (مثل أصناف المطاعم): يُضاف مباشرة دون كمية أو سعر شراء ودون إنشاء فاتورة.', quickAddNamePlaceholder: 'مثال: برغر كبير', quickAddBtn: 'إضافة المنتج', quickAddSuccess: 'تمت إضافة المنتج بنجاح', quickAddUpdated: 'تم تحديث سعر المنتج', optional: '(اختياري)', invalidSell: 'أدخل سعر بيع صحيح',
    },
    transfer: {
      loading: 'جاري التحميل...', chooseDest: 'اختر الوجهة', mainStore: 'المحل الرئيسي',
      loadError: 'خطأ في تحميل الوجهات',
      scannerProcessing: 'جاري المعالجة...', scannerFound: 'تم العثور على:', scannerDone: 'تم المسح',
      scannerNotFound: 'لا يوجد منتج بالباركود', scannerNotInStock: 'في مخزونك', scannerNotFoundShort: 'غير موجود',
      noResults: 'لا توجد نتائج', stock: 'المخزون:',
      selectDestFirst: 'الرجاء اختيار محل الوجهة أولاً',
      searchFirst: 'الرجاء البحث عن منتج أولاً', qtyZero: 'الكمية يجب أن تكون أكبر من صفر',
      qtyExceeds: 'الكمية المطلوبة', qtyExceedsAvail: 'تتجاوز المتوفر',
      buyPriceZero: 'سعر الشراء يجب أن يكون أكبر من صفر',
      donationLabel: 'إرسال المنتجات دون مقابل (تبرع)',
      donationWarning: 'تحذير: فاتورة النقل ستظهر برصيد 0، وفاتورة الاستلام ستظهر للمستلم برصيد 0.',
      donationNote: 'تبرع (نقل دون مقابل)',
      available: 'المتوفر:',
      clearCartConfirm: 'تفريغ سلة فاتورة النقل؟', scannerReady: 'جاهز للمسح',
      selectDest: 'الرجاء اختيار محل الوجهة', cartEmpty: 'سلة النقل فارغة',
      paidExceedsTotal: 'المبلغ المدفوع لا يمكن أن يتجاوز الإجمالي',
      confirmTitle: 'تأكيد النقل:', confirmFrom: 'من:', confirmTo: 'إلى:',
      confirmProducts: 'المنتجات:', confirmTotal: 'الإجمالي:', confirmPaid: 'المدفوع:', confirmRemaining: 'المتبقي (دين):',
      confirmContinue: 'هل تريد المتابعة؟',
      productNotFound: 'المنتج "..." غير موجود في المخزون',
      stockLessThanNeeded: 'الكمية المتوفرة للمنتج "..." أقل من المطلوبة',
      payNote: 'دفع - نقل إلى',
      transferSuccess: 'تم تنفيذ فاتورة النقل بنجاح!',
      transferredProducts: 'المنتجات المنقولة:', transferTotal: 'الإجمالي:',
      transferPaid: 'المدفوع:', transferRemaining: 'المتبقي (دين):',
      transferError: 'حدث خطأ أثناء تنفيذ النقل:',
      sub: 'نقل منتجات من محل إلى آخر مع تسجيل ديون',
      senderStore: 'المحل المرسل', destination: 'الوجهة',
      chooseDestination2: '-- اختر الوجهة --', selectDestination: 'اختر محل الوجهة',
      scanPlaceholder2: 'امسح الباركود ضوئياً...', searchExisting: 'ابحث عن منتج في المخزون (بالاسم أو الباركود)',
      searchPlaceholder2: 'اسم المنتج أو الباركود...', productDataTitle: 'بيانات المنتج للنقل',
      productName: 'اسم المنتج', availableQty: 'الكمية المتوفرة', transferQty: 'الكمية للنقل',
      buyPrice: 'سعر الشراء', sellPrice2: 'سعر البيع', brand2: 'العلامة التجارية', category2: 'التصنيف',
      addToCart2: 'إضافة إلى سلة النقل', transferCart: 'سلة فاتورة النقل', totalLabel2: 'الإجمالي:',
      clear3: 'تفريغ', paymentSection: 'الدفع والديون', payNow2: 'المبلغ المدفوع الآن',
      remainingDebt2: 'المتبقي (دين):', fullPayment2: 'دفع كامل', noPayment2: 'بدون دفع',
      confirmTransfer: 'تأكيد وتنفيذ فاتورة النقل',
    },
    settings: {
      title: 'الاعدادات', sub: 'إعدادات البرنامج',
      printSettingsBtn: 'اعدادات الطباعة',
      general: 'الإعدادات العامة',
      storeName: 'اسم المتجر', currency: 'العملة', language: 'اللغة', buttonSound: 'صوت الأزرار', introSound: 'صوت المقدمة',
      productQR: 'إظهار رمز QR للمنتجات', productQRHint: 'عند التفعيل يظهر رمز QR صغير على بطاقات المنتجات في المخزون والبيع. الخيار معطّل افتراضياً ويُحفظ على هذا الجهاز.',
      openIsolated: 'فتح نافذة مستقلة', createShortcut: 'اختصار سطح المكتب',
      isolatedHint: 'تفتح الشركة في نافذة وعملية منفصلة ببيانات معزولة تماماً عن بقية الشركات.',
      snapshotDone: 'تم تجهيز نسخة الشركة.', snapshotError: 'تعذّر تجهيز نسخة الشركة:',
      openDone: 'تم فتح النافذة المستقلة.', openError: 'تعذّر فتح النافذة المستقلة:',
      shortcutDone: 'تم إنشاء الاختصار على سطح المكتب.', shortcutError: 'تعذّر إنشاء الاختصار:',
      isolatedOnly: 'هذه النافذة مخصصة لشركة واحدة فقط.',
      staleBuild: 'النسخة المثبّتة قديمة ولا تحتوي نافذة الشركة المستقلة. أغلق البرنامج وأعد تشغيل النسخة المحدّثة، أو ثبّت الإصدار 3.3.6.',
      notif: 'إشعارات المخزون المنخفض',       autoBackup: 'نسخ احتياطي تلقائي',
      info: 'معلومات البرنامج',
      version: 'الإصدار', developer: 'مطور البرنامج', company: 'الشركة المطورة', lastUpdate: 'آخر تحديث',
      settingsSaved: 'تم حفظ الإعدادات',
      wrongPassword: 'كلمة المرور الحالية غير صحيحة',
      verifyError: 'خطأ في التحقق:',
      passwordMinLength: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل',
      passwordsNoMatch: 'كلمتا المرور غير متطابقتين',
      passwordSaved: 'تم حفظ كلمة المرور بنجاح',
      errorPrefix: 'خطأ:',
      colPage: 'الصفحة', colView: 'عرض', colEdit: 'تعديل', colDelete: 'حذف',
      enterUsername: 'الرجاء إدخال اسم المستخدم', enterPassword: 'الرجاء إدخال كلمة المرور',
      userUpdated: 'تم تحديث المستخدم بنجاح', userCreated: 'تم إنشاء المستخدم بنجاح',
      noPerms: 'بدون صلاحيات',
      delete_user_confirm: 'هل أنت متأكد من حذف المستخدم "..."؟',
      storeAddress: 'عنوان المحل', phoneNumber: 'رقم الهاتف', enableFiscalStamp: 'تفعيل الطابع الجبائي في الفواتير',
      fiscalRatio: 'النسبة:', fiscalMin: 'الحد الأدنى 5 دج - الحد الأقصى 10,000 دج',
      fiscalPercent: '% (0% للأنظمة المبسطة)', lowStockThreshold: 'حد المخزون المنخفض',
      lowStockHint: 'أقل من هذا الرقم يُعتبر مخزون منخفض', saveSettings: 'حفظ الإعدادات',
      storePasswordCard: 'كلمة مرور المحل', storePasswordDesc: 'لحماية المحل، أنشئ كلمة مرور. لا يمكن الدخول كمدير بدونها.',
      currentPassword: 'كلمة المرور الحالية', currentPasswordPlaceholder: 'اتركها فارغة إذا جديدة',
      newPassword: 'كلمة المرور الجديدة', newPasswordPlaceholder: 'كلمة مرور المحل',
      confirmPassword: 'تأكيد كلمة المرور', confirmPasswordPlaceholder: 'أعد إدخال كلمة المرور',
      savePassword: 'حفظ كلمة المرور',
      lanCard: 'مزامنة الشبكة المحلية (LAN)',
      lanDesc: 'اربط هذا الجهاز بجهاز آخر في نفس المحل عبر الراوتر لمزامنة فورية لكل عمليات البيع والإدخال والتعديل.',
      lanRole: 'دور هذا الجهاز',
      lanOff: 'معطل',
      lanMain: 'سيرفر رئيسي (الجهاز الذي يملك IP ثابت)',
      lanSub: 'سيرفر فرعي (جهاز الكاشير الثاني)',
      lanLocalIps: 'عناوين IP هذا الجهاز',
      lanLocalIpHint: 'ثبّت أحد هذه العناوين كعنوان IP ثابت في إعدادات Windows/الراوتر، وأدخل نفس العنوان في الجهاز الفرعي.',
      lanServerIp: 'عنوان IP السيرفر الرئيسي',
      lanPort: 'المنفذ',
      lanPortHint: 'يبدأ بـ 4512 ويتغيّر تلقائيًا إن كان مشغولًا',
      lanStatus: 'حالة المزامنة',
      lanStatusOff: 'المزامنة معطلة',
      lanStatusMainOn: 'السيرفر الرئيسي يعمل',
      lanStatusMainOff: 'السيرفر الرئيسي متوقف',
      lanStatusClients: 'الأجهزة المتصلة',
      lanStatusSubOn: 'متصل بالسيرفر الرئيسي',
      lanStatusSubOff: 'غير متصل بالسيرفر الرئيسي',
      lanListeningPort: 'المنفذ الفعلي',
      lanFirewallHint: 'إن لم يتصل الجهاز الفرعي، اسمح لهذا البرنامج عبر جدار حماية Windows (شبكة خاصة): الإعدادات ← خصوصية وأمان ← جدار حماية Windows ← السماح لتطبيق عبر جدار الحماية.',
      lanTest: 'اختبار الاتصال',
      lanTestWait: 'جارٍ الاختبار...',
      lanTestOk: 'الاتصال ناجح — السيرفر متاح على هذا المنفذ',
      lanTestFail: 'فشل الاتصال',
      lanTestRefused: 'لا يوجد سيرفر على هذا العنوان/المنفذ',
      lanTestTimeout: 'انتهت المهلة — قد يكون المنفذ محجوبًا أو العنوان خاطئًا',
      lanTestUnreachable: 'العنوان لا يمكن الوصول إليه — تأكد من أن الجهازين على نفس الشبكة',
      lanSaved: 'تم حفظ إعدادات المزامنة بنجاح',
      lanIpRequired: 'أدخل عنوان IP السيرفر الرئيسي أولاً',
      lanRemoteReset: 'مسح بيانات الفرع عن بُعد',
      lanRemoteResetConfirm: 'سيتم مسح كل بيانات جهاز الفرع عن بُعد وإعادة مزامنتها من هذا السيرفر الرئيسي. هل أنت متأكد؟',
      lanRemoteResetSent: 'تم إرسال أمر المسح إلى الفرع — سيُفرغ ويعيد المزامنة خلال لحظات.',
      printerCard: 'مشاركة الطابعة عبر الشبكة (LAN)',
      printerDesc: 'شارك الطابعة المتصلة بهذا الجهاز لتستخدمها أجهزة الكاشير الأخرى، أو ثبّت طابعة السيرفر المشتركة على هذا الجهاز وتولَّها كافتراضية للطباعة.',
      printerShareSide: 'مشاركة طابعة هذا الجهاز (السيرفر)',
      printerInstallSide: 'استخدام طابعة السيرفر من هذا الجهاز (الفرعي)',
      printerSelect: 'الطابعة المحلية',
      printerLoading: 'جارٍ التحميل',
      printerNone: 'لا توجد طابعات',
      printerDefaultNow: 'الطابعة الافتراضية الحالية',
      printerShareName: 'اسم المشاركة',
      printerShareNow: 'مشاركة',
      printerUnshare: 'إلغاء المشاركة',
      printerSharedOk: 'تمت مشاركة الطابعة بنجاح، المسار المتاح للأجهزة:',
      printerUnsharedOk: 'تم إلغاء مشاركة الطابعة',
      printerServerHost: 'عنوان السيرفر',
      printerBrowse: 'استعراض الطابعات',
      printerConnect: 'توصيل وجعل افتراضية',
      printerMakeDefault: 'تعيين كافتراضية',
      printerConnected: 'تم توصيل الطابعة',
      printerDriverInf: 'مسار ملف التعريف INF (إن لم يكن مثبتاً)',
      printerInstallDriver: 'تثبيت التعريف',
      printerDrvShare: 'أو مجلد تعاريف مشترك على السيرفر',
      printerInstallDriverShare: 'تثبيت من المجلد المشترك',
      printerDriverInstalled: 'تم تثبيت تعريف الطابعة بنجاح',
      printerFixDesc: 'يتطلب صلاحيات المشرف ويعيد تشغيل خدمة الطباعة (Spooler) تلقائياً.',
      printerFixNow: 'إصلاح مشاكل الطباعة عبر الشبكة (0x0000011b / 0x00000709)',
      printerFixOk: 'تم تطبيق الإصلاح وإعادة تشغيل خدمة الطباعة',
      printerTest: 'طباعة صفحة تجريبية',
      printerTestTitle: 'صفحة اختبار الطباعة',
      printerSelectFirst: 'اختر الطابعة أولاً',
      printerHostRequired: 'أدخل عنوان السيرفر',
      printerLookForDrv: 'حدد ملف التعريف (INF) أولاً',
      printerBusy: 'جارٍ الاستعلام',
      printerNoneShared: 'لم يتم العثور على طابعات مشتركة على هذا الجهاز',
      printerWorking: 'جارٍ التنفيذ...',
      printerInstalling: 'جارٍ التثبيت',
      printerUnknownErr: 'حدث خطأ غير متوقع',
      printerNeedAdmin: 'تحتاج هذه العملية إلى صلاحيات المشرف (وافق على نافذة UAC) — أو نفّذها يدوياً من إعدادات Windows.',
      printerAccessDenied: 'تم رفض الوصول على الجهاز البعيد (يتطلب صلاحيات في السيرفر). تأكد من تشغيل مشاركة الطابعات في Windows وإذن \\"Everyone\\" في خصائص الطباعة.',
      printerHostUnreachable: 'لا يمكن الوصول إلى السيرفر — تأكد من أن الجهازين على نفس الشبكة وأن اسمه/عنوانه صحيح.',
      printerDriverMissing: 'التعريف غير مثبت محلياً',
      printerDriverMissingHint: 'ثبّت التعريف من خانة INF أو المجلد المشترك أعلاه ثم أعد المحاولة.',
      printerDriverNightmare: 'يفتقر الجهاز إلى تعريف الطابعة أو هناك قيد أمان (PrintNightmare). ثبّت التعريف ثم أعد المحاولة، أو شغّل زر \\"إصلاح مشاكل الطباعة\\" أولاً.',
      printerDefaultSet: 'تم تعيين الطابعة كافتراضية',
      usersCard: 'إدارة المستخدمين', usersDesc: 'أنشئ مستخدمين وحدد صلاحياتهم للبرنامج.',
      addUser: 'إضافة مستخدم', newUser: 'مستخدم جديد',
      companiesCard: 'إدارة الشركات (متعدد)', companiesDesc: 'أنشئ عدة شركات، وتنقل بين بياناتها من هذا الجهاز. كل شركة لها بياناتها (منتجات، فواتير، عملاء، موردين...) بشكل منفصل.',
      addCompany: 'إضافة شركة', newCompany: 'شركة جديدة',
      companyName: 'اسم الشركة', companyNamePlaceholder: 'مثال: شركة السيارات الحديثة',
      companyStoreName: 'اسم المتجر الخاص بالشركة', companyStoreNamePlaceholder: 'مثال: متجر الزواوي - المركز',
      companyPassword: 'كلمة مرور الشركة', companyPasswordPlaceholder: 'كلمة مرور للدخول كمدير هذه الشركة',
      companyActiveHint: 'الشركة النشطة حالياً: ',
      enterCompany: 'الدخول كمدير الشركة', exitCompany: 'الخروج من نطاق الشركة',
      confirmDeleteCompany: 'هل أنت متأكد من حذف هذه الشركة وجميع بياناتها؟ لا يمكن التراجع.',
      resetCompanyData: 'تفريغ بيانات الشركة',
      confirmResetCompanyData: 'هل تريد تفريغ كل بيانات الشركة: ... لا يمكن التراجع!',
      confirmResetCompanyDataFinal: 'تأكيد إضافي: سيتم حذف كل المنتجات والفواتير والعملاء والموردين والدفعات والمرتجعات والطلبات والتحويلات الخاصة بهذه الشركة. متابعة؟',
      resetCompanyDataDone: 'تم تفريغ بيانات الشركة (… سجل).',
      noCompanies: 'لا توجد شركات بعد',
      companyNameRequired: 'اسم الشركة مطلوب',
      companyStoreCodes: 'الفروع المضمومة لهذه الشركة', companyStoreCodesHint: 'اختر فرعًا أو أكثر (تركه فارغًا = لن تظهر هذه الشركة لأي فرع)', companyNoBranches: 'لا توجد فروع منشأة بعد',
      companyLegalTitle: 'بيانات التعريف القانونية (تظهر في الطباعة)',
      companyPhone: 'رقم الهاتف', companyAddress: 'العنوان', companyNis: 'NIS', companyNif: 'NIF', companyRcc: 'RCC / RC', companyArticle: 'ARTICLE',
      userCompany: 'الشركة',
      companyManageDenied: 'إدارة الشركات متاحة للمحل الرئيسي فقط.',
      companyNotPermitted: 'لا يمكن تعيين المستخدم إلى هذه الشركة؛ فهي ليست مصرحاً بها لهذا المحل/الفرع.',
      companyNoPermitted: 'لا توجد شركات مصرح بها لهذا المحل/الفرع',
      companyUpdated: 'تم حفظ تعديلات الشركة',
      companyCreated: 'تم إنشاء الشركة بنجاح',
      companyIsActive: 'الشركة النشطة حالياً',
      enteredCompany: 'تم الانتقال إلى نطاق هذه الشركة، وستظهر بياناتها فقط الآن.',
      userName: 'اسم المستخدم', userNamePlaceholder: 'اسم المستخدم',
      userPassword: 'كلمة المرور', userPasswordPlaceholder: 'كلمة المرور',
      permissions: 'الصلاحيات',
    },
    storeDebts: {
      title: 'ديون المحلات', sub: 'ديون المحلات حسب فواتير التحويل',
      storeCount: 'عدد المحلات', owedToUs: 'لدينا ( عليهم )', weOwe: 'عليهم ( لنا )',
      netDebt: 'صافي الديون', transferInvoices: ' فاتورة تحويل',
      owedLabel: 'عليهم:', weOweLabel: 'لنا:', paidLabel: 'مدفوع:',
      totalDebt: 'إجمالي الدين', totalInvoices: 'إجمالي الفواتير',
      paid: 'المدفوع', remaining: 'المتبقي',
      typeTransfer: 'تحويل صادر', typeReception: 'استلام',
      statusPaid: 'مدفوع', statusRemaining: 'متبقي',
      noTransfers: 'لا توجد فواتير تحويل',
      payTitle: 'تسديد دفعة', total: 'الإجمالي:', paidPreviously: 'المدفوع سابقاً:',
      payAmount: 'مبلغ الدفعة', confirmPay: 'تأكيد الدفع', back: 'رجوع',
      noInvoices: 'لا توجد فواتير', invoiceDetails: 'تفاصيل الفاتورة',
      invoiceActionsPrint: 'طباعة', invoiceActionsPay: 'دفع', invoiceActionsEdit: 'تعديل',
      printChoiceTitle: 'اختر نوع الطباعة', printChoiceDesc: 'كيف تريد طباعة هذه الفاتورة؟', printNormal: 'طباعة عادية', printEmployee: 'طباعة إلى الموظف', employeeDocTitle: 'قائمة تجهيز',
      invoiceActionsDelete: 'حذف', invoiceActionsClose: 'إغلاق',
      totalDebtLabel: 'إجمالي الدين', emptyPlaceholder: 'لا توجد فواتير تحويل',
    },
    branchesMonitor: {
      title: 'مراقبة الفروع', sub: 'مراقبة وإدارة جميع فروعك من مكان واحد',
      loading: 'جاري تحميل البيانات...',
      online: 'متصل', offline: 'غير متصل',
      productCount: ' منتج', saleCount: ' مبيعة',
      viewDetails: 'عرض التفاصيل',
      noData: 'لا توجد بيانات متاحة', noInventory: 'لا يوجد مخزون', noInvoices: 'لا توجد فواتير',
      productsLabel: 'عدد المنتجات:', invoicesLabel: 'عدد الفواتير:',
      tabInventory: 'المخزون', tabInvoices: 'الفواتير', tabPurchases: 'المشتريات', tabNet: 'صافي الحساب',
      notAvailable: 'غير متاح',
      sold: 'مدفوع', provisional: 'معلق',
      transferIncome: 'مداخيل التحويل', transferCost: 'مصاريف التحويل',
      totalSales: 'إجمالي المبيعات', totalPurchases: 'إجمالي المشتريات',
      netAccount: 'صافي الحساب',
      searchPlaceholder: 'بحث في المنتجات...',
      noSearchResults: 'لا توجد نتائج في أي محل',
      outOfStock: 'نفذ', inStock: 'متوفر',
      searchAll: 'بحث في جميع المحلات', searchAllPlaceholder: 'ابحث بالاسم أو الباركود لمعرفة أي محل فيه المنتج...',
      branchCount: 'عدد الفروع', totalProducts: 'إجمالي المنتجات', totalRevenue: 'إجمالي الإيرادات',
      branchesList: 'قائمة الفروع', refresh: 'تحديث', noBranches: 'لا توجد فروع مسجلة',
      backToList: 'رجوع للقائمة', products: 'المنتجات', invoices: 'الفواتير',
      sales: 'المبيعات', purchases: 'فواتير الشراء', loadingPlaceholder: 'جاري التحميل...',
    },
    chart: { sales: 'المبيعات', inventory: 'المخزون', returns: 'المرتجعات' },
    btn: {
      newInvoice: 'فاتورة جديدة', addPart: 'إضافة قطعة', export: 'تصدير',
      addSupplier: 'إضافة مورد', addCustomer: 'إضافة عميل', addDiscount: 'إضافة تخفيض',
      addReturn: 'تسجيل مرتجع',
    },
    connection: {
      title: 'اعدادات الاتصال', sub: 'إعدادات الاتصال السحابي وإدارة المحلات',
      connected: 'متصل بالسحابة',
      mainConnected: 'محل رئيسي - متصل بـ Supabase',
      branchConnectedMsg: 'فرع متصل بالمحل الرئيسي',
      mainStore: 'محل رئيسي', branch: 'فرع',
      branchParenthetical: '(فرع)',
      enterCredentials: 'أدخل بيانات الاتصال للبدء',
      logoutConfirm: 'هل أنت متأكد من تسجيل الخروج؟',
      cloudRequired: 'الرجاء الاتصال بالسحابة أولاً',
      uploading: 'جاري الرفع...', noChanges: 'لا توجد تغييرات للرفع',
      uploadSuccess: 'تم الرفع بنجاح',
      uploadBackupBtn: 'رفع نسخة احتياطية',
      lanSubUploadMsg: 'هذا الجهاز فرعي (LAN): رفع البيانات للسحابة يتم من السيرفر الرئيسي لهذا الموقع',
      enterStorePassword: 'أدخل كلمة مرور المحل للتحميل:',
      wrongPassword: 'كلمة المرور غير صحيحة',
      verificationError: 'خطأ في التحقق: ',
      backupEmpty: 'النسخة الاحتياطية فارغة',
      restoreSuccessMsg: 'تم الاسترداد بنجاح - أعد تشغيل البرنامج',
      restoreBackupBtn: 'استرداد نسخة احتياطية',
      lastSync: 'آخر مزامنة: ',
      branchNameRequired: 'الرجاء إدخال اسم الفرع',
      passwordRequired: 'الرجاء إدخال كلمة المرور',
      branchCreated: 'تم إنشاء الفرع بنجاح - الرمز: ',
      passwordLabel: 'كلمة المرور: ',
      viewStock: 'عرض المخزون', deleteBranchBtn: 'حذف الفرع',
      deleteBranchConfirm1: 'هل أنت متأكد من حذف فرع "',
      deleteBranchConfirm2: 'لن تتمكن من استعادته.',
      enterStorePasswordView: 'أدخل كلمة مرور المحل لعرض مخزون الفرع:',
      noBranchStock: 'لا يوجد مخزون لهذا الفرع',
      barcode: 'الباركود', brand: 'العلامة', sellPrice: 'سعر البيع',
      emailRequired: 'الرجاء إدخال بريد صحيح',
      searching: 'جاري البحث...', noPassword: 'لا توجد كلمة مرور',
      savingPassword: 'جاري حفظ كلمة المرور الجديدة...',
      userInfoTitle: 'معلومات المستخدم', emailLabel: 'البريد الإلكتروني', codeLabel: 'الرمز الخاص',
      storeTypeLabel: 'نوع المحل', mainCodeLabel: 'الرمز الرئيسي',
      statusTitle: 'غير متصل', statusDesc: 'أدخل بيانات الاتصال لل 시작',
      statusBadge: 'غير متصل', connTab: 'الاتصال', backupTab: 'النسخ الاحتياطي',
      branchesTab: 'الفروع', recoveryTab: 'استرداد الحساب',
      cloudStatusCard: 'حالة الاتصال السحابي', cloudStatusDesc: 'الاتصال بالسحابة تلقائي. جميع بياناتك محفوظة بأمان.',
      logoutBtn: 'تسجيل خروج', uploadCard: 'رفع نسخة احتياطية', uploadDesc: 'سيتم استبدال النسخة الموجودة في السحابة...',
      pushTitle: 'إشعارات الجوال', pushDesc: 'عند إنشاء طلب منتج أو استرجاع سلعة فاسدة، يُرسل إشعار فوري لهاتفك حتى عندما يكون الموقع مغلقًا.',
      siteUrlLabel: 'رابط الموقع', siteUrlPlaceholder: 'https://...',
      pushSaveBtn: 'حفظ', pushUrlRequired: 'أدخل رابط الموقع', pushUrlInvalid: 'رابط الموقع غير صالح',
      pushSaved: 'تم حفظ الإعدادات',
      autoBackup: 'النسخ الاحتياطي التلقائي', backupInterval: 'الفترة (بالدقائق)',
      min1: '1 دقيقة', min2: '2 دقيقة', min5: '5 دقائق', min10: '10 دقائق', min30: '30 دقيقة',
      uploadBtn: 'رفع نسخة احتياطية', restoreBtn: 'استرداد نسخة احتياطية',
      branchesCard: 'الفروع', branchesDesc: 'إدارة الفروع متاحة فقط للمحل الرئيسي.',
      addBranch: 'إضافة فرع جديد', branchName: 'اسم الفرع', branchNamePlaceholder: 'مثال: فرع وسط المدينة',
      branchPassword: 'كلمة مرور', branchPasswordPlaceholder: 'كلمة مرور الفرع',
      saveBranch: 'حفظ الفرع', cancel2: 'إلغاء', addNewBranch: 'اضافة فرع جديد', refreshBtn: 'تحديث',
      noBranches2: 'لا توجد فروع مسجلة', branchStock: 'مخزون الفرع: ',
      recoveryCard: 'استرداد الحساب / كلمة المرور', recoveryDesc: 'أدخل البريد الإلكتروني المرتبط بالحساب...',
      search2: 'بحث', storeNameLabel: 'اسم المحل', codeResult: 'الرمز', passwordResult: 'كلمة المرور',
      changePassword: 'تغيير كلمة المرور', searchAgain: 'بحث مرة أخرى',
      newPasswordLabel: 'كلمة المرور الجديدة', newPasswordPlaceholder2: '4 أحرف على الأقل',
      confirmPasswordLabel: 'تأكيد كلمة المرور', confirmPasswordPlaceholder2: 'أعد إدخال كلمة المرور',
      saveNewPassword: 'حفظ كلمة المرور الجديدة',       backBtn: 'رجوع',
      scannerTab: 'ماسح الجوال', scannerCard: 'ماسح الباركود عبر الجوال',
      scannerDesc: 'حوّل أي هاتف على نفس شبكة المحل إلى ماسح باركود لاسلكي يغذي نفس حقل الباركود مثل الماسح السلكي. الخدمة HTTPS محلية بالكامل وتستخدم شهادة خاصة — لا تغادر بياناتك المحل.',
      scannerEnable: 'تفعيل ماسح الجوال',
      scannerFirewall: 'تأكيد إذن الجدار الناري',
      scannerStep1: 'فعّل الخدمة وامسح رمز QR بهاتفك (نفس شبكة الواي فاي).',
      scannerStep2: 'افتح الصفحة ووجه الكاميرا لرمز المنتج أو فاتورة البيع.',
      scannerStep3: 'عند فتح الهاتف لأول مرة ستظهر نافذة موافقة هنا — اختر "دائمًا" أو "هذه الجلسة".',
      scannerStep4: 'كل شفرة تُقرأ تُدخل تلقائيًا في حقل الباركود المفتوح.',
      scannerStep5: 'المرة الأولى تظهر رسالة "غير آمن" — افتح المزيد وواصل، ستكون الشهادة مميزة بعد التثبيت.',
      certHelpTitle: 'تثبيت شهادة الأمان على الهاتف (مطلوب للتطبيق المستقل)',
      certHelpDesc: 'إن ضغطت «متابعة» على تحذير الشهادة، ثبّت الشهادة مرة واحدة من الرابط التالي ثم أعد فتح الصفحة؛ وإلا سيبقى خيار التثبيت كاختصار فقط.',
      certHelpOpen: 'فتح دليل التثبيت',
      certHelpCopy: 'نسخ رابط الدليل',
      scannerDevices: 'الأجهزة المقترنة', scannerNoDevices: 'لا توجد أجهزة مقترنة بعد',
      scannerStarting: 'جاري تشغيل الخدمة…', scannerStarted: 'ماسح الجوال يعمل الآن',
      scannerStartError: 'تعذر تشغيل ماسح الجوال', scannerStopped: 'ماسح الجوال متوقف',
      scannerRunning: 'يعمل', scannerError: 'خطأ',
      scannerFwChecking: 'جاري التحقق من أذونات الجدار الناري…', scannerFwOk: 'أذونات الجدار الناري سليمة',
      scannerFwNeedsPermission: 'تم رفض إذن المسؤول — يُفضَّل تشغيل ماسح الجوال أولًا أو أذن للجار الناري يدويًا',
      scannerPairTitle: 'طلب اقتران ماسح هاتف', scannerPairAlways: 'دائمًا',
      scannerPairSession: 'هذه الجلسة', scannerPairDeny: 'رفض',
      scannerRemove: 'إزالة', scannerRemoveConfirm: 'إزالة هذا الجهاز ومنع اقترانه؟',
      scannerSell: 'البيع', scannerSellTitle: 'السماح لهذا الهاتف بالبيع من المتجر',
      psaleCard: 'نقطة بيع الهاتف (البيع)',
      psaleDesc: 'فكّر في موظفين يبيعون من الهواتف أثناء الزحمة: افتحوا صفحة البيع على نفس شبكة المحل، وليختار كل موظف اسمه، وبيعوا للعملاء والموردين بالخصم ومراقبة الأسعار. البيع يُنفَّذ على الكمبيوتر مباشرة فتظهر الفواتير والمخزون والرصيد فورًا في كل الأجهزة.',
      psaleEnable: 'تفعيل البيع من الهاتف',
      psaleEnabled: 'البيع من الهاتف مفعّل الآن', psaleDisabled: 'تم إيقاف البيع من الهاتف',
      psaleRunning: 'البيع من الهاتف مفعّل', psalePaused: 'البيع متوقف — فعّله أعلاه',
      psaleStep1: 'فعّل البيع، وامسح QR بنفس هاتف ماسح الباركود (أو هاتف جديد — ستظهر الموافقة هنا).',
      psaleStep2: 'افتح صفحة «ZMT البيع»، اختر الموظف من الشريط العلوي.',
      psaleStep3: 'ابحث عن القطع، أضفها للسلة، اختر العميل/المورد، الخصم وطريقة الدفع.',
      psaleStep4: 'أكّد البيع — الفاتورة والمخزون والرصيد تُحدَّث فورًا على الكمبيوتر.',
    },
    pd: {
      tab: 'شاشة عرض السعر',
      saved: 'تم الحفظ',
      tabDesc: 'شاشة ملء الشاشة تعرض فيديوهات المحل، وعند مسح أي باركود يظهر سعر بيعه ثلاث ثوانيح ثم يعود الفيديو. تقر البيانات والوسائط محليًاً على هذا الجهاز.',
      enable: 'تفعيل شاشة عرض السعر',
      enabled: 'تم التفعيل',
      disabled: 'تم التعطيل',
      videosTitle: 'مقاطع الفيديو',
      videosDesc: 'تعرض المقطعات بالترتيب ثم تكرّر تلقائيًاً. يمنع رفعها إلى السحابة — تنسخ داخل مجلد بيانات البرنامج المحلي.',
      videosAdd: 'إضافة فيديو',
      videosEmpty: 'لا توجد مقطعات فيديو',
      videoAdded: 'تمت إضافة المقطعات',
      mediaTitle: 'الصور والفيديوهات',
      mediaDesc: 'تُعرض العناصر بالترتيب ثم تُكرَّر تلقائيًا: الصورة تبقى وفق مدّتها، والفيديو يُعرض كاملًا. يُمنع رفعها إلى السحابة — تُنسَخ داخل مجلد بيانات البرنامج المحلي.',
      mediaAddImage: 'إضافة صورة',
      mediaAddVideo: 'إضافة فيديو',
      mediaEmpty: 'لا توجد صور أو فيديوهات',
      imageAdded: 'تمت إضافة الصورة',
      logoTitle: 'لوغو المحل',
      logoDesc: 'يظهر أعلى شاشة العرض وبجانب السعر. يعرض في شاشة عرض السعر فقط.',
      logoPick: 'اختيار صورة',
      logoClear: 'إزالة',
      logoSaved: 'تم حفظ اللوغو',
      colorsTitle: 'الألوان والخطوت',
      bg: 'لون خلفية الصفحة',
      priceColor: 'لون الأرقام (السعر)',
      nameColor: 'لون اسم المحل',
      nameSize: 'حجم خط الاسم',
      priceSize: 'حجم الأرقام',
      font: 'الخط',
      tickerTitle: 'الشريط السفلي',
      tickerDesc: 'شريط أبيض متحرك أسفل الشاشة يحمل شعار البرنامج واسم ZMT SOFTWARE ومعلومات التواصل.',
      tickerOn: 'إظهار الشريط السفلي',
      tickerPhone: 'رقم الهاتف داخل الشريط',
      tickerMail: 'البريد داخل الشريط',
      autoLoginTitle: 'الدخول التلقائي لشاشة العرض',
      autoLoginDesc: 'عند شغل البرنامج يدخل هذا الحساب تلقائيًاً بدون كلمة مرور وتفتح شاشة العرض بملء الشاشة فورًاً.',
      autoLoginOn: 'تفعيل الدخول التلقائي',
      autoLoginUser: 'الحساب',
      autoLoginPass: 'كلمة المرور',
      autoLoginNeed: 'اختر الحساب وأدخل كلمة المرور',
      autoStartTitle: 'بدء التشغيل مع Windows',
      autoStartDesc: 'يفتح البرنامج تلقائيًاً عند شغل الجهاز ثم ينتقل مباشرة إلى شاشة عرض السعر.',
      autoStartOn: 'تشغيل البرنامج مع بدء Windows',
      pinTitle: 'رمز القفل',
      pinDesc: 'يطلب للخروج من شاشة العرض (زر القفل أو Ctrl+Shift+P). تركه فارغًاً لاستخدام كلمة مرور المحل.',
      pinLabel: 'رمز القفل',
      pinSave: 'حفظ الرمز',
      pinShort: '3 خانات على الأقل',
      noAccount: '— اختر حساباً —',
      noVideos: 'لا توجد مقطعات فيديو بعد',
      noVideosHint: 'أضف مقطعات فيديو من إعدادات الاتصال ← تبويب شاشة العرض',
      currency: 'دج',
      notFound: 'المنتج غير موجود',
      scanPlaceholder: 'امسح الباركود هنا',
      lockTitle: 'رمز المدير',
      lockPlaceholder: 'أدخل الرمز',
      cancel: 'إلغاء',
      unlock: 'فتح'
    },
    rest: {
      tab: 'المطعم',
      enable: 'تفعيل خاصية المطعم',
      enabled: 'المطعم مفعّل الآن',
      disabled: 'المطعم متوقف',
      roleLabel: 'دور هذا الجهاز',
      roleSend: 'مرسل — يرسل الطلبات (نادل)',
      roleReceive: 'مستلم — يستقبل الطلبات (مطبخ/حساب)',
      roleNone: 'الجهاز غير مشترك',
      roleNoneHint: 'فعّل المطعم واختر دور الجهاز للبدء.',
      nameLabel: 'اسم هذا الجهاز',
      namePlaceholder: 'مثال: مطبخ 1 أو نادل أحمد',
      tablesLabel: 'قائمة الطاولات',
      tablesAdd: 'إضافة طاولة',
      tablesHint: 'اكتب رقم طاولة ثم اضغط إضافة. المرسل يستطيع كتابة طاولة حرة أيضًا.',
      printerLabel: 'طابعة تذكرة المطبخ',
      printerDefault: 'الطابعة الافتراضية',
      printerListBtn: 'تحديث القائمة',
      permsTitle: 'صلاحيات الأجهزة (المدير)',
      permsDesc: 'حدّد لكل جهاز مادا يستطيع: الإرسال أو التحكم بالحالة أو تأكيد البيع.',
      permSend: 'إرسال',
      permControl: 'تحكم بالحالة',
      permConfirm: 'تأكيد البيع',
      deviceCol: 'الجهاز',
      nameCol: 'الاسم',
      roleCol: 'الدور',
      savePerms: 'حفظ الصلاحيات',
      permSaved: 'تم حفظ الصلاحيات وإرسالها للأجهزة',
      myDevice: 'هذا الجهاز',
      onlyManager: 'إدارة الصلاحيات متاحة للمدير فقط',
      pageTitle: 'الطلبات المحلية',
      pageSub: 'طلبات المطعم على الشبكة المحلية',
      ordersEmpty: 'لا توجد طلبات بعد',
      outgoing: 'طلباتي المرسلة',
      incoming: 'الطلبات الواردة إلي',
      qtyLabel: 'الكمية',
      priceLabel: 'السعر',
      time: 'الوقت',
      actions: 'إجراء',
      statusCol: 'الحالة',
      tableCol: 'الطاولة',
      senderCol: 'المرسل',
      receiverCol: 'المستلم',
      itemsCol: 'الأصناف',
      orderBtn: 'طلب',
      orderSelfBtn: 'اطلب لنفسك',
      selfReceiver: 'هذا الجهاز (نفسي)',
      cartTitle: 'سلة طلبات المطعم',
      cartSub: 'راجع الأصناف ثم أرسلها للمطبخ',
      clear: 'إفراغ',
      emptyCart: 'السلة فارغة — اضغط «طلب» على أي قطعة',
      emptyCartHint: 'تُضاف الأصناف هنا واحدًا تلو الآخر قبل الإرسال',
      close: 'إغلاق',
      notesPlaceholder: 'مثال: بدون بصل، حار قليلًا…',
      orderSent: 'أُرسل الطلب بنجاح',
      receiverLabel: 'المستلم',
      noReceivers: 'لا يوجد مستلم متصل',
      tableLabel: 'رقم الطاولة',
      tablePlaceholder: 'اختر أو اكتب رقم الطاولة',
      notesLabel: 'ملاحظات',
      send: 'إرسال الطلب',
      addedToCart: 'أُضيف للسلة',
      newOrder: 'طلب جديد',
      cancel2: 'إغلاق',
      cancel: 'إلغاء',
      inprogressBtn: 'قيد التنفيذ',
      doneBtn: 'تم التنفيذ',
      confirmBtn: 'تأكيد البيع',
      confirmTitle: 'تأكيد بيع الطلب',
      confirmSub: 'راجع المبلغ واختر طريقة الدفع',
      itemsCount: 'صنف',
      noActions: 'لا توجد إجراءات متاحة الآن',
      payMethod: 'طريقة الدفع',
      payCash: 'نقدًا',
      payCcp: 'CCP',
      payConfirm: 'تأكيد الدفع والبيع',
      customerLabel: 'العميل (اختياري)',
      stockShort: 'الكمية غير متوفرة — بقي الطلب كما هو',
      failed: 'فشلت العملية',
      saleOk: 'تم البيع والفواتير والمخزون محدثة',
      ticketTitle: 'تذكرة مطبخ',
      tablePrefix: 'طاولة',
      fromLabel: 'من:',
      itemCol: 'الصنف',
      invoiceTitle: 'فاتورة بيع',
      sellerLabel: 'البائع:',
      paidLabel: 'المدفوع:',
      remainLabel: 'المتبقي:',
      thanks: 'شكرًا لتعاملكم معنا',
      statusNew: 'جديد',
      statusInprogress: 'قيد التنفيذ',
      statusDone: 'تم التنفيذ',
      statusConfirmed: 'مؤكد',
      statusCancelled: 'ملغي',
      orderNo: 'رقم الطلب',
      sent: 'تم إرسال الطلب',
      done: 'تم التنفيذ',
      ticketPrinted: 'طُبعت تذكرة المطبخ',
      noTable: 'أدخل رقم الطاولة',
      total: "الإجمالي",
      all: "الكل",
    },
    login: {
      loginSubtitle: 'اختر طريقة الدخول', managerTab: 'مدير', userTab: 'مستخدم', newAccountTab: 'حساب جديد', branchTab: 'فرع',
      codeLabel: 'الرمز المكون من 10 أرقام', storePassword: 'كلمة مرور المحل', passwordPlaceholder: 'أدخل كلمة المرور',
      chooseCompany: 'اختر الشركة', enterNow: 'دخول', chooseEmployee: 'اختر الموظف', employeePlaceholder: 'اسم الموظف', needCompany: 'الرجاء اختيار الشركة أولاً',
      loginManager: 'دخول كمدير', forgotPassword: 'نسيت كلمة المرور؟',
      storeCode: 'كود المحل', storeCodePlaceholder: 'أدخل كود المحل (10 أرقام)',
      usernameLabel: 'اسم المستخدم', usernamePlaceholder: 'اسم المستخدم',
      userPassword: 'كلمة المرور', loginAsUser: 'دخول كمستخدم',
      emailLabel: 'البريد الإلكتروني', createAccount: 'إنشاء حساب', createPasswordLabel: 'كلمة مرور المحل (اختياري لكن موصى به — للتفعيل)',
      mainStoreCode: 'الرمز الرئيسي للمحل', branchPassword: 'كلمة مرور الفرع', branchLogin: 'اتصال كفرع',
      accountCreatedTitle: 'تم إنشاء الحساب بنجاح!', accountCreatedDesc: 'احفظ هذا الرمز في مكان آمن. ستحتاجه لاستعادة بياناتك.',
      accountCreatedWarning: 'هذا الرمز لا يمكن استرجاعه. اكتبه أو صوره.', enterApp: 'الدخول للبرنامج',
      recoveryTitle: 'استرداد كلمة المرور', recoverySubtitle: 'أدخل بريدك الإلكتروني لعرض الرمز وكلمة المرور',
      searchBtn: 'بحث', backToLogin: 'العودة لتسجيل الدخول',
      storeNameSpan: 'اسم المحل:', codeSpan: 'الرمز:', passwordSpan: 'كلمة المرور:',
      loginWithCode: 'دخول بالرمز', resetPassword: 'إعادة تعيين كلمة المرور',
      searchAgainLink: 'بحث مرة أخرى', newPasswordTitle: 'تعيين كلمة مرور جديدة',
      newPassLabel: 'كلمة المرور الجديدة', newPassPlaceholder: 'أدخل كلمة المرور الجديدة',
      confirmPassLabel: 'تأكيد كلمة المرور', confirmPassPlaceholder: 'أعد إدخال كلمة المرور',
      saveNewPass: 'حفظ كلمة المرور الجديدة', backLink: 'العودة',
    },
  },
  en: {
    appTitle: 'ZMT PIECE',
    online: 'Online', offline: 'Offline',
    nav: {
      localOrders: 'Local Orders',
      priceDisplay: 'Price Display',
      main: 'Main', manage: 'Management', finance: 'Finance', system: 'System',
      dashboard: 'Dashboard', brands: 'Brands', sales: 'Sales', invoices: 'Invoices',
      inventory: 'Inventory', suppliers: 'Suppliers', customers: 'Customers', debts: 'Debts', debtDetails: 'Debt Details',
      customerMovements: 'Customer Movements', supplierMovements: 'Supplier Movements',
      employees: 'Employees',
      supplierReturns: 'Spoiled Goods', expiry: 'Expiry',
      netAccount: 'Net Account', expenses: 'Expenses', discounts: 'Discounts', returns: 'Returns',
      reports: 'Reports', backup: 'Backup', settings: 'Settings',
      zakat: 'Zakat',
      connection: 'Connection Settings',
      storeDebts: 'Store Debts', branchesMonitor: 'Branch Monitor', sharedInventory: 'Shared Inventory',
      orders: 'Orders',
    },
    expiry: {
      title: 'Expiry', sub: 'Products expired or expiring soon',
      search: 'Search by name or barcode...', refresh: 'Refresh', noDate: '—',
      filterAll: 'All', filterExpired: 'Expired', filterExpiring: 'Expiring soon', filterOk: 'OK',
      sumExpired: 'Expired', sumExpiring: 'Expiring soon', sumOk: 'OK', sumWarnWindow: 'warn days',
      expired: 'Expired', expiresToday: 'Expires today', inDays: 'in', days: 'days', overdue: 'overdue',
      warnMsg: 'Expiry warning:',
      empty: 'No matching products', editPrompt: 'New expiry date (YYYY-MM-DD):', invalidDate: 'Invalid date format',
    },
    dash: {
      title: 'Dashboard', sub: 'Sales & Inventory Overview',
      s1: 'Items in Stock', s2: 'Invoices This Month', s3: 'Registered Customers', s4: 'Total Sales',
      chart: 'Sales vs Inventory vs Returns', months: 'Months:',
      m1: 'Month', m2: 'Months', m3: 'Months', m4: 'Months', m5: 'Months', m6: 'Months',
      netProfit: 'Net Profit', cost: 'Cost',
      lowStockItems: ' products below stock threshold',
      andMore: 'and', moreItems: 'more...',
      lowStock: 'Low Stock Products', estimatedProfit: 'Estimated Total Profit', monthSales: 'This Month Sales', profitCostDist: 'Profit & Cost Distribution',
      view: 'View', lowStockModalTitle: 'Products Below Stock Threshold',
      colProduct: 'Product', colCode: 'Barcode / Mark', colThreshold: 'Threshold', openProduct: 'Open product',
      printBw: 'Print Black & White', lowStockPrintTitle: 'Low Stock Products Report',
      printDate: 'Print date', printCount: 'Products',
    },
    brands: { title: 'Brands', sub: 'Manage kinds and brands', search: 'Search for a brand...', favAdd: 'Add to favorites', favRemove: 'Remove from favorites', brandsWord: 'brands', addOther: 'Add another', addOtherHint: 'Add a new kind', backToKinds: 'Kinds', brandsOfKind: 'Brands', addBrand: 'Add brand', noBrands: 'No brands in this kind yet', deleteBrand: 'Delete brand', confirmDelete: 'Delete this brand?', addKindTitle: 'Add new kind', kindName: 'Kind name', kindIcon: 'Icon (optional)', kindColor: 'Color', kindRequired: 'Please enter a kind name', kindExists: 'This kind already exists', addBrandTitle: 'Add brand', brandName: 'Brand name', brandCountry: 'Country', brandColor: 'Brand color', brandKind: 'Kind', brandNameRequired: 'Please enter a brand name' },
    sales: {
      title: 'Sales', sub: 'Create New Sales Invoice',
      searchParts: 'Search Parts', searchPlaceholder: 'Search by part name or number...',
      emptySearch: 'Type to start searching for parts',
      cart: 'Shopping Cart', cartEmpty: 'Cart is empty', total: 'Total:',
      checkout: 'Checkout',
      confirm: 'Confirm', transferInvoice: 'Transfer Invoice', transferTitle: 'Transfer invoice to a customer',
      transferHint: 'Choose the customer this invoice will be recorded under (e.g. if the buyer is acting on their behalf).',
      transferSelected: 'Invoice will be recorded under:', transferConfirm: 'Confirm Transfer',
    },
    invoices: {
      title: 'Invoices', sub: 'All Sales & Purchase Invoices',
      search: 'Search for invoice...', newInvoice: 'New Invoice',
      col1: 'Invoice #', col2: 'Date', col3: 'Customer', col4: 'Amount', col5: 'Status', col6: 'Actions',
      empty: 'No invoices yet',
    },
    inventory: {
      title: 'Inventory', sub: 'Manage Parts Inventory',
      search: 'Search inventory...', add: 'Add Part', export: 'Export',
      col1: 'Code', col2: 'Part Name', col3: 'Brand', col4: 'Quantity', col5: 'Buy Price', col6: 'Sell Price', col7: 'Actions',
      empty: 'Inventory is empty',
    },
    suppliers: {
      title: 'Suppliers', sub: 'Manage Parts Suppliers',
      search: 'Search for supplier...', add: 'Add Supplier',
      col1: 'Name', col2: 'Phone', col3: 'Email', col4: 'Brands', col5: 'Balance', col6: 'Actions',
      empty: 'No suppliers',
      addModalTitle: 'Add New Supplier', editModalTitle: 'Edit Supplier',
      formName: 'Supplier Name', formNamePl: 'e.g. XX Auto Parts Co.',
      formPhone: 'Phone Number', formAddress: 'Address', formAddressPl: 'e.g. Riyadh - King Fahd Rd',
      cancel: 'Cancel', save: 'Save',
    },
    sdPayment: {
      editTitle: 'Edit Payment', note: 'Note', date: 'Payment date',
      balanceNote: 'The supplier balance is updated automatically by the difference.',
      confirmDelete: 'Delete this payment? Its effect on the supplier balance will be reversed.',
      invalidAmount: 'Please enter a valid amount', invalidDate: 'Invalid payment date format',
      updated: 'Payment updated and balance adjusted', deleted: 'Payment deleted and balance adjusted',
    },
    movements: {
      custTitle: 'Customer Movements', custSub: 'Full log of debts, payments and invoices with balance settlements',
      supTitle: 'Supplier Movements', supSub: 'Full log of debts, payments and invoices with balance settlements',
      partyLabel: 'Party', searchLabel: 'Search', searchPh: 'Search by name or invoice number...',
      allCustomers: 'All Customers', allSuppliers: 'All Suppliers',
      viewReport: 'View report', print: 'Print', close: 'Close', printTitle: 'Movements Report',
      allowPopups: 'Please allow pop-ups to print', nothingToPrint: 'No data to print',
      emptyList: 'No matching results', noMovements: 'No movements recorded',
      legendSale: 'Sale invoice (debit)', legendPurchase: 'Purchase invoice (debit)',
      legendPayment: 'Payment (credit)', legendPaySupplier: 'Payment to supplier (credit)',
      legendVoucher: 'Receipt voucher', legendDebtNote: 'Debt note',
      legendSettle: 'Balance settlement (balance reached zero)',
      entrySale: 'Sale invoice', entryPurchase: 'Purchase invoice', entrySupSale: 'Sale to supplier',
      entryPayment: 'Payment', entryReceipt: 'Receipt voucher', entryDebtNote: 'Debt note',
      itemsNoun: 'items',
      opening: 'Opening balance', settledTag: 'Balance settlement', balanceAfter: 'Balance after',
      movCount: 'Movements', settleCount: 'Settlements', currentDue: 'Current balance',
      colDate: 'Date', colTime: 'Time', colDesc: 'Description', colRef: 'Reference',
      colDebit: 'Debit (+)', colCredit: 'Credit (−)', colBalance: 'Balance',
      totalDebit: 'Total debit', totalCredit: 'Total credit', finalBalance: 'Final balance',
      netTotal: 'Net balances', grandTotal: 'Grand total',
      sumParties: 'Customers', sumPartiesSup: 'Suppliers',
      reportTitleOneCust: 'Customer Movements Report', reportTitleAllCust: 'Customers Movements Report',
      reportTitleOneSup: 'Supplier Movements Report', reportTitleAllSup: 'Suppliers Movements Report',
      phone: 'Phone', generatedAt: 'Generated at',
      footNote: 'Movements report generated automatically from the program records',
      fromLabel: 'From date', toLabel: 'To date',
      qMonth: 'This month', q30: 'Last 30 days', qAll: 'All',
      includeReturns: 'Include returns', legendReturn: 'Return (does not change the balance)',
      entryReturn: 'Return',
      returnsReport: 'Returns report', monthlyStatement: 'Monthly statement',
      settleNow: 'Settle balance', exportCsv: 'Export Excel',
      sendWhatsApp: 'WhatsApp', sendEmail: 'Send by e-mail',
      aging: 'Debt aging', oldest: 'Oldest debt', days: 'day(s)',
      age0: '0-30 days', age30: '31-60 days', age60: '61-90 days', age90: 'Over 90 days',
      overLimit: 'Credit limit exceeded',
      retCount: 'Returns count', retQty: 'Total quantity', retValue: 'Returns value',
      retTitleOneCust: 'Customer returns report', retTitleAllCust: 'Customers returns report',
      retTitleOneSup: 'Supplier returns report', retTitleAllSup: 'Suppliers returns report',
      retPrintTitle: 'Returns report',
      colInvoice: 'Invoice', colProduct: 'Product', colQty: 'Quantity', colValue: 'Value', colReason: 'Reason',
      colParty: 'Party', period: 'Period',
      noReturns: 'No returns recorded', nothingToExport: 'No data to export',
      nothingToSend: 'No data to send', exportOk: 'Exported successfully', exportFail: 'Export failed',
      emailTo: 'To', emailSubject: 'Subject', emailBody: 'Message', emailInvalid: 'Invalid e-mail address',
      emailSent: 'E-mail sent', emailFail: 'Could not send the e-mail', cancel: 'Cancel', send: 'Send',
      mCash: 'Cash', mCcp: 'CCP', mCheck: 'Cheque', mTransfer: 'Transfer', customer: 'Customer', supplier: 'Supplier',
      settleAmount: 'Amount', settleMethod: 'Payment method', settleNote: 'Note',
      settleDefaultNote: 'Balance settlement', signature: 'Electronic signature', clearSig: 'Clear signature',
      settleSave: 'Save settlement', invalidAmount: 'Please enter a valid amount',
      settleSaved: 'Settlement recorded successfully', pickOneParty: 'Choose a specific party first',
      groupAria: 'Quick shortcuts',
      btnSell: 'Sell', btnSellTitle: 'Sell — open the sales page',
      btnQuick: 'Quick entry', btnQuickTitle: 'Quick entry',
      btnSmart: 'Smart add', btnSmartTitle: 'Smart invoice add',
      btnCustomers: 'Customer movements', btnCustomersTitle: 'Customer movements',
      btnSuppliers: 'Supplier movements', btnSuppliersTitle: 'Supplier movements',
      btnDebts: 'Debt details', btnDebtsTitle: 'Debt details — receivables & payables',
    },
    customers: {
      title: 'Customers', sub: 'Manage Customers',
      search: 'Search for customer...', add: 'Add Customer',
      col1: 'Name', col2: 'Phone', col3: 'Address', col4: 'Purchases', col5: 'Balance', col6: 'Actions',
      empty: 'No customers',
      addModalTitle: 'Add New Customer', editModalTitle: 'Edit Customer',
      formName: 'Customer Name', formNamePl: 'e.g. Ahmed Ali',
      formPhone: 'Phone Number', formAddress: 'Address', formAddressPl: 'e.g. Algiers',
      formType: 'Customer Type', typeUnit: 'Unit', typeWhole: 'Wholesale', formTypeHelp: 'Sets the default price in the sales page (can be changed per product in the cart)',
      formDiscount: 'Discount (%)', formDiscountHelp: 'From 0.001% to 100% - Optional', formCreditLimit: 'Credit limit (optional)', formCreditLimitHelp: '0 means no limit — warns when exceeded at sale',
      cancel: 'Cancel', save: 'Save',
      totalDebts: 'Total Customer Debts',
      totalPaid: 'Total Paid',
      totalCount: 'Total Customers',
    },
    employees: {
      title: 'Employees', sub: 'Manage employees, attendance & payroll',
      search: 'Search for employee...', add: 'Add Employee', empty: 'No employees',
      totalCount: 'Total Employees', presentToday: 'Present today',
      dueThisMonth: 'Due this month', paidThisMonth: 'Paid this month',
      scanLabel: 'Scan employee barcode to check in/out...', scanReady: 'Ready to scan',
      scanNotFound: 'Unknown code — no employee has this barcode',
      scanIn: 'Check in', scanOut: 'Check out',
      scanDone: 'Day finished for this employee (in & out already recorded)',
      btnCheckIn: 'In', btnCheckOut: 'Out', btnFixDay: 'Edit', btnDelDay: 'Delete record',
      statusActive: 'Active', statusInactive: 'Inactive',
      todayPresent: 'Present', todayAbsent: 'Absent', todayRest: 'Rest',
      worked: 'Duration', notOutYet: 'Not checked out yet',
      addModalTitle: 'Add New Employee', editModalTitle: 'Edit Employee',
      formName: 'Employee Name', formNamePl: 'e.g. Mohamed Amine',
      formPhone: 'Phone Number (optional)',
      formBarcode: 'Barcode', formBarcodeGen: 'Generate',
      formBarcodeHelp: 'Unique code per employee — never repeats with products or other employees',
      formPhoto: 'Photo (optional)',
      formSalaryType: 'Salary type', salaryMonthly: 'Monthly', salaryDaily: 'Daily',
      formMonthly: 'Monthly salary (DA)', formDaily: 'Day rate (DA)',
      salaryHelp: 'Monthly is always divided by 30 days: 30000 → 1000/day (Feb & 31-day months are never docked)',
      formPayDay: 'Pay day', formPayDayHelp: '1 to 31 — the day the monthly salary is settled',
      timingSection: 'Working hours', timingEnabled: 'Enable working hours (late/early deduction)',
      formWorkStart: 'Shift start', formWorkEnd: 'Shift end', formGrace: 'Grace period (minutes)',
      perSecond: 'Per-second rate',
      restSection: 'Work & rest days', restEnabled: 'Enable rest days',
      restWork: 'Work', restPaid: 'Paid rest', restUnpaid: 'Unpaid rest',
      restHelp: 'Pick the state of each day. An unpaid rest day without attendance is deducted from the monthly salary; with attendance it counts as a work day.',
      formStatus: 'Status', formNote: 'Note',
      cancel: 'Cancel', save: 'Save', del: 'Delete Employee',
      confirmDelete: 'Delete this employee and their attendance records? (Salary payouts stay in expenses)',
      barcodeTaken: 'This barcode is already used by another employee',
      nameRequired: 'Please enter the employee name',
      invalidNumber: 'Please enter a valid amount',
      settlement: 'Payroll settlement', month: 'Month',
      colIn: 'In', colOut: 'Out', colAbsents: 'Absent', colRest: 'Rest',
      colLate: 'Late', colEarly: 'Early', colDeduct: 'Deduction',
      colGross: 'Gross', colNet: 'Net', colState: 'Status',
      units: 'unit/day', days: 'days', seconds: 's',
      paid: 'Paid', unpaid: 'Unpaid', partial: 'Partly paid',
      btnPay: 'Pay', btnUnpay: 'Undo payment',
      noAttendance: 'No attendance records this month — counted as fully absent',
      payTitle: 'Pay salary', payAmount: 'Amount', payMethod: 'Payment method',
      paySuccess: 'Payout recorded in expenses',
      unpayConfirm: 'Cancel this payout?',
      payNothing: 'Nothing due to pay',
      badgeTitle: 'Employee badge', badgePrint: 'Print',
      barcodeMissing: 'This employee has no barcode',
      allowPopups: 'Please allow pop-ups to print',
      recTitle: 'Attendance records', recIn: 'In', recOut: 'Out',
      recLate: 'Late (s)', recEarly: 'Early (s)', recEmpty: 'No records this month',
      recManual: 'Manual',
      editInTitle: 'Check-in time', editOutTitle: 'Check-out time',
      saveRec: 'Save', dayOf: 'Day',
      statsHint: 'Absence is derived from attendance records: barcode scans or manual buttons',
    },
    stockTools: {
      syncBtn: 'Sync stock from STOCK.FDB',
      syncTitle: 'Sync stock from the old program',
      syncHint: 'Each item quantity is read from the ARTICLES table of the old database and applied to the matching product. Invoices are not used here because the legacy stock already includes them — that is exactly what doubled quantities (5 → 10).',
      current: 'Current qty',
      legacy: 'Old program qty',
      difference: 'Difference',
      applyLabel: 'Apply',
      selectAll: 'Select all',
      noChanges: 'No differences — stock already matches the old program',
      applied: 'Stock synced for',
      changedCount: 'products',
      cantEdit: 'You do not have permission to edit stock',
      notMatched: 'Not matched',
      matched: 'Matched',
      changed: 'Differs',
      unmatchedCount: 'Unmatched',
      legacyTotal: 'Old total',
      currentTotal: 'Current total',
      readError: 'Could not read the ARTICLES table from the old database',
      empty: 'No items in the old database',
      backupNote: 'A backup was saved before applying.',
    },
    balanceTools: {
      editTitle: 'Edit Balance',
      current: 'Current Balance',
      newBalance: 'New Balance (amount)',
      signToggle: 'Direction',
      owesUs: 'Owes us',
      weOweHim: 'Has credit with us (advance)',
      weOwe: 'We owe him',
      owesUsSup: 'Has balance with us (advance)',
      hintCustomer: 'Positive: the customer owes us. Negative: he has credit with us (advance).',
      hintSupplier: 'Positive: we owe him. Negative: he has balance with us (advances paid).',
      save: 'Save Balance',
      saved: 'Balance updated successfully',
      emptyEdit: 'Please enter a valid balance',
      cantEdit: 'You do not have permission to edit customers/suppliers',
      recalcBtn: 'Recalculate Balances from Invoices',
      recalcConfirm: 'Customer and supplier balances will be re-derived from the current invoices and payments in the database. A backup will be saved first. Continue?',
      recalcDone: 'Balances recalculated successfully',
      noDiff: 'No differences — balances already match the invoice ledger',
      clients: 'customers',
      suppliers: 'suppliers',
      syncBtn: 'Sync Balances from STOCK.FDB',
      syncTitle: 'Sync Balances from Legacy (Gestion Stock)',
      syncHint: 'Values below come from the legacy database: "Stored" = CREDIT_CLIENT/CREDIT_FOURNISSEUR, "Computed" = totals of sales/purchase invoices (FC/FF) and payments (VC/VF).',
      storedLabel: 'Stored',
      computedLabel: 'Computed',
      modeStored: 'Use stored balance (CREDIT)',
      modeComputed: 'Use computed balance from archive',
      applyLabel: 'Apply to selected',
      selectAll: 'Select all',
      noFirebird: 'No legacy database file is open. Open STOCK.FDB first from the import section (Gestion Stock).',
      openFile: 'Open STOCK.FDB...',
      notMatched: 'Not matched (not listed in legacy DB)',
      applied: 'Balances updated:',
      changedCount: 'parties updated',
      diffCount: 'differ from current',
      parties: 'parties',
      matchedFor: 'Parties in legacy DB:',
      noChanges: 'No changes to apply',
      parseErr: 'Could not read the legacy database',
      hybridTitle: 'Hybrid Parties (Client ⇄ Supplier)',
      hybridHint: 'Rule: a CONFIRMED pair = the exact same name in both the client and supplier tables + real activity (sales/purchases/payments) on BOTH sides. The legacy program treated that person as a SUPPLIER trading both ways, so the true balance = client credit − supplier credit (client record = NET, supplier record = −NET). The remaining pairs are review candidates (legacy link / similar name): they stay independent with their own stored balance unless you select them manually.',
      sectionSingles: 'Single parties',
      sectionHybrid: 'Hybrid parties',
      hybridCustCol: 'Client',
      hybridSupCol: 'Supplier',
      hybridLinkCol: 'Link',
      hybridCreditC: 'Client Credit',
      hybridCreditF: 'Supplier Credit',
      hybridNetCol: 'True NET',
      hybridSignNote: 'Positive NET = owes us (in the client record); the supplier record shows −NET (we owe).',
      hybridCreate: 'will be created',
      basisCf: 'Code CF',
      basisName: 'Name',
      basisBoth: 'CF + Name',
      basisDouble: 'Two-way supplier (name + activity)',
      basisConfirmed: 'Manual confirmation',
      hybridConfirmed: 'Confirmed',
      hybridSuspect: 'Review',
      hybridPairCount: 'hybrid pairs',
      noHybrids: 'No hybrid parties in the database',
      oldBalance: 'Old Balance',
      newBalanceVal: 'New Balance',
      noPermissionTitle: 'No Permission',
    },
    debts: {
      title: 'Debts', sub: 'Manage Debts & Receivables',
      youOwe: 'Debts You Owe (to Suppliers)', youOwed: 'Debts Owed to You (from Customers)',
      noDebts: 'No outstanding debts',
      logTitle: 'Debt Log',
      col1: 'Date', col2: 'Type', col3: 'Party', col4: 'Amount', col5: 'Status', col6: 'Actions',
      empty: 'No transactions',
      totalInvoices: 'Total Invoices', totalPurchases: 'Total Purchases',
      balance: 'Balance', paid: 'Paid', paidToThem: 'Paid to them',
      invoices: 'Invoices', noInvoices: 'No invoices', payBtn: 'Pay',
      payments: 'Payments', noPayments: 'No payments',
      net: 'Net Receivables', chooseSide: 'Choose a party from the list', back: 'Back',
      searchPlaceholder: 'Search by name or phone number...', tabCustomers: 'Customers', tabSuppliers: 'Suppliers',
      totalCustomerDebts: 'Debts Owed to You (from Customers)', totalSupplierDebts: 'Debts You Owe (to Suppliers)',
      recalcFromOldDb: 'Recalculate customer/supplier balances from the old Gestion Stock database without re-importing',
    },
    debtDetails: {
      title: 'Debt Details', sub: 'A full view of receivables and payables with customers and suppliers',
      onCustomers: 'Total Debts Owed by Customers', onCustomersHint: 'Amounts customers owe you',
      toSuppliers: 'Total Debts You Owe Suppliers', toSuppliersHint: 'Amounts you owe suppliers',
      toCustomers: 'Total Debts You Owe Customers', toCustomersHint: 'Customer credit balances (they paid more than they bought)',
      fromSuppliers: 'Total Debts Suppliers Owe You', fromSuppliersHint: 'Amounts suppliers owe you',
      exportCustomers: 'Export Customers List', exportSuppliers: 'Export Suppliers List',
      groupAll: 'All parties', groupOwing: 'Those who owe you', groupOwed: 'Those you owe',
      exportExcel: 'Export Excel', view: 'View',
      resultsTitle: 'Results', emptyResults: 'Choose a view option from the buttons above to show a list',
      noMatch: 'No parties match this filter',
      colIndex: '#', colName: 'Name', colPhone: 'Phone', colAddress: 'Address', colBalance: 'Balance', colStatus: 'Status',
      statusOwingUs: 'Owes you', statusWeOwe: 'You owe',
      total: 'Total', countLabel: 'Parties count',
      filterAllCust: 'All customers', filterAllSup: 'All suppliers',
      filterOwingCust: 'Customers who owe you', filterOwedCust: 'Customers you owe',
      filterOwingSup: 'Suppliers who owe you', filterOwedSup: 'Suppliers you owe',
      print: 'Print', sheetTitle: 'Debt Details', dateLabel: 'Export date', by: 'By',
      nothingToExport: 'No data to export', exportOk: 'Export completed successfully', exportFail: 'Export failed',
      customers: 'Customers', suppliers: 'Suppliers',
      searchPh: 'Search by customer or supplier name or phone number...',
      searchHint: 'Type at least two characters to search customers and suppliers together',
      searchResults: 'Search results', noSearchResults: 'No matching results',
      colType: 'Type', typeCustomer: 'Customer', typeSupplier: 'Supplier', clear: 'Clear',
      alertsBtn: 'Debt alerts', alertsTitle: 'Debt alerts',
      alertsSub: 'Choose a scope and duration; every party who owes you beyond that duration joins the critical-debts list.',
      scopeLabel: 'Scope', scopeCustomers: 'Customers', scopeSuppliers: 'Suppliers', scopeBoth: 'Both together',
      stateLabel: 'Status', enable: 'Enable', disable: 'Disable',
      durationLabel: 'Duration', durWeek: 'One week', durTwoWeeks: 'Two weeks', durMonth: 'One month', durTwoMonths: 'Two months',
      alertsSave: 'Save', alertsCancel: 'Cancel', alertsSaved: 'Alert settings saved',
      criticalTitle: 'Critical debts', criticalEmpty: 'No critical debts right now',
      criticalDisabled: 'Debt alerts are disabled', critSearchPh: 'Search critical debts by name...',
      colOwed: 'Amount owed', colAge: 'Age (days)', daysUnit: 'days',
      reminderTitle: 'Alert: critical debts', reminderMsg1: 'There are', reminderMsg2: 'parties with debts past the chosen duration',
      reminderTotal: 'Total amount owed', later: 'Later',
    },
    net: {
      title: 'Net Account', sub: 'Financial Summary',
      s1: 'Total Sales', s2: 'Total Purchases', s3: 'Net Profit', s4: 'Pending Amounts',
      logTitle: 'Transaction Log',
      col1: 'Date', col2: 'Description', col3: 'Type', col4: 'Amount', col5: 'Balance',
      empty: 'No recent transactions',
      customerDebt: 'Owed to us', supplierDebt: 'We owe',
      purchaseInvoice: 'Purchase invoice', purchaseFrom: 'Invoice from',
      transferInvoice: 'Transfer invoice', receptionInvoice: 'Reception invoice',
      purchases: 'Purchases', paymentFrom: 'Payment from', paymentFromSupplier: 'Receipt from supplier: ',
      paymentNote: 'Payment', paymentWalkin: 'Payment from walk-in',
      salesPaid: 'Sales (paid)', supplierReceipt: 'Supplier receipt', paymentTo: 'Payment to',
      paymentToSupplier: 'Payment to supplier', expenses: 'Expenses',
      stockPurchase: 'Stock purchase', stockPurchases: 'Stock purchases',
      totalExpenses: 'Total Expenses', quickTitle: 'Quick Entry', quickHint: 'Direct cash entry without creating an invoice or changing inventory.', purchaseAdd: 'Add amount to purchases', expenseAdd: 'Add to expenses', quickNoteLabel: 'Note (optional)', addBtn: 'Add', invalidAmount: 'Please enter a valid amount', directPurchase: 'Direct entry - Purchase', directExpense: 'Direct entry - Expense',
      marginTitle: 'Profit Margin', periodLabel: 'Period:', today: 'Today', yesterday: 'Yesterday', last7Days: 'Last 7 days',
      totalMargin: 'Total Profit Margin', periodMargin: 'Period Profit Margin', allTime: 'All time',
      cashLabel: 'Cash', marginLabel: 'Margin', ccpPaidNote: 'Paid via CCP',
      periodCash: 'Period Cash Revenue', totalCash: 'Total Cash Revenue',
      detailTitle: 'Log details', detailMethod: 'Payment method', detailNote: 'Note', detailAmount: 'Amount',
      invoiceDetails: 'Invoice total', productCol: 'Product', qtyCol: 'Qty',
      buyPriceCol: 'Buy price', sellPriceCol: 'Sell price', lineTotalCol: 'Total',
      profitCol: 'Profit', marginPctCol: 'Margin %', costEstimated: 'Cost estimated (last buy price)',
      by: 'By', byManager: 'Manager',
    },
    expenses: {
      title: 'Expenses', sub: 'Record of all expenses logged in the net account with time & date',
      totalLabel: 'Total Expenses', countLabel: 'Number of records',
      searchPlaceholder: 'Search by invoice, supplier or customer name...',
      allYears: 'All years', allMonths: 'All months', allDays: 'All days', allLabel: 'All',
      addBtn: 'Add Expense', addTitle: 'Record a new expense',
      listTitle: 'Expenses Log', showMore: 'Show More',
      reasonLabel: 'Reason', reasonPlaceholder: 'e.g. delivery, electricity bill, repairs...', amountLabel: 'Amount', saveBtn: 'Save Expense',
      colDate: 'Date', colDesc: 'Description', colSource: 'Source', colType: 'Type', colMethod: 'Method', colAmount: 'Amount',
      typeDirect: 'Direct expense', typeDispatch: 'Dispatch', typeStock: 'Stock purchase', typeSupplier: 'Supplier payment', typePurchase: 'Purchase invoice', typeExpense: 'Expense', typeSalary: 'Salary',
      directExpense: 'Direct expense', noDesc: 'No description',
      mixedTotal: 'Total', invalidAmount: 'Please enter a valid amount', needReason: 'Please enter a reason for the expense', saved: 'Expense recorded successfully',
      chooseYear: 'Choose year', chooseMonth: 'Choose month', chooseDay: 'Choose day',
    },
    discounts: {
      title: 'Discounts', sub: 'Manage Offers & Discounts',
      add: 'Add Discount',
      col1: 'Product', col2: 'Discount %', col3: 'Start Date', col4: 'End Date', col5: 'Status', col6: 'Actions',
      empty: 'No discounts',
      unregistered: 'Unregistered', deleteConfirm: 'Delete discount record?',
      totalDiscounts: 'Total Discounts', totalValue: 'Total Discount Value',
      colDate: 'Date', colInvoice: 'Invoice', colCustomer: 'Customer', colType: 'Type', colRatio: 'Ratio', colAmount: 'Amount', colActions: 'Actions',
      viewInvoice: 'View invoice', searchPlaceholder: 'Search by invoice number or product...', periodAll: 'All', periodToday: 'Today', period7: '7 days', period30: '30 days', period90: '90 days',
    },
    returns: {
      title: 'Returns', sub: 'Manage Returns & Refunds',
      add: 'Record Return', export: 'Export',
      col1: 'Return #', col2: 'Invoice', col3: 'Part', col4: 'Qty', col5: 'Reason', col6: 'Date', col7: 'Actions',
      empty: 'No returns',
      time: 'Time', defaultReason: 'Invoice adjustment',
      printReturnInvoice: 'Print Return Invoice',
      deleteConfirm: 'Delete return record?',
      noReturnsExport: 'No returns to export',
      exportSuccess: 'Returns exported successfully',
      exportError: 'Error saving: ',
    },
    returnInvoice: {
      noReturns: 'No returns recorded for this invoice.',
      invoiceMissing: 'Invoice not found: cannot print the return invoice.',
    },
    supplierReturns: {
      title: 'Spoiled Goods', sub: 'Manage returned spoiled goods to suppliers',
      export: 'Export', filterAll: 'All',
      statusPending: 'Being Returned', statusReturned: 'Returned', statusNotReturned: 'Not Returned',
      colProduct: 'Product', colQty: 'Qty', colAmount: 'Amount',
      colSupplier: 'Supplier', colInvoice: 'Invoice', colDate: 'Date',
      colStatus: 'Status', colActions: 'Actions', colStore: 'Store / Branch',
      empty: 'No return requests',
      noProduct: 'Product not found', noInvoice: 'No purchase invoice for this product',
      stock: 'In stock', supplier: 'Supplier', qty: 'Return qty', invoice: 'Entry invoice',
      note: 'Note', notePlaceholder: 'Optional...',
      modalTitle: 'Return Goods to Supplier',
      notOwned: 'You cannot modify another store\'s requests',
      invalidQty: 'Enter a valid quantity', qtyExceedsStock: 'Quantity exceeds current stock',
      qtyExceedsInvoice: 'Quantity exceeds the amount on this invoice',
      created: 'Return request created',
      confirmReturned: 'Confirm returned?\nQuantity will be deducted from stock, the supplier invoice reduced and net account affected.',
      confirmNotReturned: 'Confirm not returned?\nNo change will be made to stock or invoice.',
      insufficientStock: 'Current stock is not enough to deduct', invoiceMissing: 'Purchase invoice not found',
      lineMissing: 'Product no longer exists on the invoice',
      returnedSuccess: 'Returned: deducted from stock and reduced the supplier invoice',
      delete: 'Delete request', deleteReverse: 'Undo return',
      deleteConfirm: 'Delete return request?', deleteReturnedConfirm: 'Delete request?\nAll effects will be reversed (stock restored and invoice raised).',
      deleted: 'Request deleted',
      refundNote: 'Supplier goods return',
      noExport: 'Nothing to export', exportSuccess: 'Exported successfully', exportError: 'Error saving: ',
    },
    productDetails: {
      title: 'Product Details',
      batches: 'batches',
      salesHistory: 'Sales History',
      purchaseHistory: 'Supplier Purchase History',
      returnsCount: 'Returns Count',
      customerReturns: 'Customer Returns',
      supplierReturns: 'Supplier Returns (Spoiled)',
      colDate: 'Date', colQty: 'Qty', colPrice: 'Sell Price', colTotal: 'Total',
      colBuyPrice: 'Buy Price', colCustomer: 'Customer', colSupplier: 'Supplier', colInvoice: 'Invoice',
      noData: 'No data available',
      adviceTitle: 'Buying Tip', adviceFrom: 'order this product from', adviceLowest: 'lowest price paid', adviceCompare: 'Supplier comparison',
    },
    reports: {
      title: 'Reports', sub: 'Advanced Sales & Inventory Reports',
      c1: 'Sales Report', c1desc: 'Daily, weekly and monthly sales analysis',
      c2: 'Inventory Report', c2desc: 'Inventory status and parts movement',
      c3: 'Profit Report', c3desc: 'Profits and losses',
      c4: 'Customer Report', c4desc: 'Customer base analysis',
      dailySales: 'Daily Sales', categoryDist: 'Sales by Category',
      bestSellers: 'Best Selling Products', brandSales: 'Sales by Brand',
      dailyBreakdown: 'Daily Sales Breakdown',
      period: 'Period:', exportPDF: 'Export PDF',
      period7: 'Last 7 Days', period30: 'Last 30 Days', period90: 'Last 3 Months',
      period365: 'Last Year', periodAll: 'All Time',
      noSales: 'No sales', profit: 'Profit',
      returnsPieces: 'Returns (pieces)', pieces: ' pieces',
      reportTitle: 'Sales & Returns Report',
      periodLabel: 'Period:', totalSales: 'Total Sales: ',
      totalProfit: 'Total Profit: ', salesInvoiceCount: 'Sales invoices: ',
      returnsCount: 'Returns count: ', netSales: 'Net Sales: ',
      dailyDetails: 'Daily breakdown:', invoicesWord: ' invoices',
      period2: 'Period:', thisWeek: 'This Week', thisMonth: 'This Month', thisYear: 'This Year', custom: 'Custom', specificDay: 'Specific Day',
      from: 'From:', to: 'To:', date2: 'Date:', totalSales2: 'Total Sales', invoices2: 'invoices', pieces2: 'pieces',
      profit2: 'Profit', paid2: 'Paid', remaining2: 'Remaining', returnCount: 'Returns Count', value: 'Value',
      netSales2: 'Net Sales', returnRatio: 'Return Ratio', profitMargin: 'Profit Margin',
      totalProfitMargin: 'Total Profit Margin', ratioLabel: 'Ratio', allTimeLabel: 'Overall Total',
      salesVsReturns: 'Sales vs Returns', net: 'Net', dailySalesVsReturns: 'Daily Sales vs Returns',
      salesTrend: 'Sales Trend', returnsTrend: 'Returns Trend', salesByCategory: 'Sales by Category',
      returnsByReason: 'Returns by Reason', topProducts: 'Top Selling Products',
      productCol: 'Product', barcodeCol: 'Barcode', qtySoldCol: 'Qty Sold', totalCol: 'Total', profitCol: 'Profit',
      dailyDetail2: 'Daily Sales & Returns Detail', dateCol: 'Date',
      salesInvoicesCol: 'Sales Invoices', piecesSoldCol: 'Pieces Sold', salesValueCol: 'Sales Value',
      returnsCol: 'Returns', piecesReturnedCol: 'Pieces Returned', netDayCol: 'Net Day',
    },
    reportsNet: {
      title: 'Net Account', period: 'Period:', year: 'Year:', specificDate: 'Specific Date',
      range: 'Range', sales: 'Total Sales', purchases: 'Total Purchases',
      expenses: 'Total Expenses', profit: 'Net Profit',
      periodDebt: 'Pending (Period)', currentDebt: 'Pending (Current)',
      customerDebt: 'Owed to us', supplierDebt: 'We owe',
      periodMargin: 'Period Profit Margin', totalMargin: 'Total Profit Margin',
    },
    zakat: {
      title: 'Zakat Calculation', sub: 'Zakat on trade goods and money per the doctrine of the majority of scholars',
      nisabLabel: 'Nisab value for this year (DA)', nisabYear: 'Year',
      nisabHint: 'Enter manually based on the local gold/silver price or local currency',
      result: 'Zakat due', resultSub: 'A quarter-tenth (2.5%) of the net zakatable base',
      noNisab: 'Enter the nisab value first to determine zakat liability',
      payable: 'You must pay', noZakat: 'No zakat on this wealth — the base has not reached nisab',
      deficit: 'Shortfall required to reach nisab', reached: 'The base reached nisab — zakat is due',
      payNow: 'Pay out Zakat', noAmount: 'Reach nisab first to enable payout',
      payConfirm: 'The zakat amount for year {year} (DA {amount}) will be recorded as an expense in the expenses log and deducted in the closing account, as wealth leaving your liability. Are you sure?',
      paySuccess: 'Zakat for year {year} has been recorded as an expense.',
      alreadyPaid: 'Zakat for year {year} is already recorded in expenses — payout cannot be duplicated for the same year.',
      stat1: 'Inventory value (market price)', stat2: 'Cash liquidity', stat3: 'Accounts (CCP / Bank)',
      stat4: 'Receivables (good debts)', stat5: 'Payables (due to suppliers)',
      stat6: 'Net zakatable base', stat7: 'Nisab value',
      stat8: 'Money at suppliers (owed to us)', stat9: 'Customer deposits (owed back)',
      lqTitle: 'Cash & accounts detail', lqSub: 'Money in minus money out (since records began) + manual adjustment',
      lqCashIn: 'Cash in', lqCashOut: 'Cash out', lqNetCash: 'Net cash',
      lqCcpIn: 'CCP in', lqCcpOut: 'CCP out', lqNetCcp: 'Net CCP',
      lqAdj: 'Manual adjustment (opening balance / unrecorded withdrawals)', lqTotal: 'Total liquidity',
      lqNote: 'The manual adjustment is stored locally for this year only; re-check it each zakat year.',
      invTitle: 'Inventory detail — valued at market price (retail)',
      invSub: 'Per-unit selling price for each product, regardless of purchase cost, per majority doctrine',
      invColProduct: 'Product', invColQty: 'Qty', invColBasis: 'Basis',
      invColPrice: 'Price (DA)', invColValue: 'Value (DA)', invBasisRetail: 'Retail',
      invTotal: 'Total inventory', invEmpty: 'No valuatable stock',
      debtTitle: 'Debts', debtCustomers: 'Receivables from customers (good debts)',
      debtSuppliers: 'Payables to suppliers (due)', debtColName: 'Name', debtColBalance: 'Balance (DA)',
      debtAtSuppliers: 'Money at suppliers (advances/overpayments)', debtOwedCustomers: 'Customer prepayments held (owed back)',
      debtTotal: 'Total', debtEmpty: 'None',
      debtNote: 'Added to the base: receivables from customers and money held at suppliers (negative supplier balances). Deducted: due supplier debts and customer prepayments held (negative customer balances).',
      methodTitle: 'Calculation method', methodRule: 'Applied fiqh principle',
      methodB1: 'Inventory is valued at current market price (selling price), not purchase cost — the prevailing trade value.',
      methodB2: 'Cash and in-kind profits are already within the base implicitly; they are not added twice.',
      methodB3: 'Collectable receivables (from customers) and money at suppliers are added; due payables and customer prepayments held are deducted.',
      methodB4: 'Zakat is paid at a quarter-tenth (2.5%) of the full net base once nisab is reached and a hawl passes.',
      methodProfit: 'Reference net profit (per Net Account):',
      methodProfitNote: 'Shown for profit tracking only; it is already embedded in inventory and cash above.',
      print: 'Print zakat report', reportTitle: 'Zakat Calculation Report', reportDate: 'Issue date',
      countBtn: 'Stock Count', countSub: 'Count the physical quantities and match them to the system quantities; only differing lines are corrected on save.',
      countSearch: 'Search by name or barcode...', countAdd: 'Add', countAddAll: 'Add all products',
      countClear: 'Clear list', countClearConfirm: 'The whole count list will be cleared. Continue?',
      countColProduct: 'Product', countColSystem: 'System qty', countColActual: 'Actual qty',
      countColDiff: 'Difference', countColRemove: 'Remove',
      countEmpty: 'No products added yet. Search and add products, or use "Add all products".',
      countNoResults: 'No matching results', countAlreadyAdded: 'This product is already on the count list.',
      countRows: 'Lines', countDiffs: 'Differing lines',
      countSave: 'Save count', countPrint: 'Print count sheet',
      countNoChanges: 'No differences to save — actual quantities match the system quantities.',
      countConfirm: 'The quantities of {n} product(s) will be corrected in stock. No expense or sale is recorded. Continue?',
      countSaved: 'Count saved and {n} product(s) corrected.',
      countNoPermission: 'You are not allowed to count stock — managers only.',
      countFixedNote: 'Non-quantified product — not valued in zakat',
      countSheetTitle: 'Stock Count Sheet', countDate: 'Count date',
      countSign: 'Counter signature', countSignManager: 'Manager signature',
    },
    backup: {
      title: 'Backup', sub: 'Manage Data Backups',
      c1: 'Create Backup', c1desc: 'Save a copy of the database',
      c1btn: '<i class="fas fa-save"></i> Export',
      c2: 'Restore Backup', c2desc: 'Restore data from a previous backup',
      c2btn: '<i class="fas fa-upload"></i> Import',
      prevTitle: 'Previous Backups',
      empty: 'No previous backups',
      restore: 'Restore', creating: 'Creating backup...',
      operationCancelled: 'Operation cancelled',
      createSuccess: '✓ Backup created — ',
      createFailed: '✗ Save failed: ',
      readingFile: 'Reading file...',
      readFileFailed: '✗ Failed to read: ',
      invalidFile: '✗ Invalid file — no data',
      restoreConfirm: 'Restore backup?',
      store: 'Store: ', date: 'Date: ',
      content: 'Content:\n',
      products: 'Products', invoices: 'Invoices',
      customers: 'Customers', suppliers: 'Suppliers',
      payments: 'Payments', returns: 'Returns',
      discounts: 'Discounts', unknown: 'Unknown',
      dataWarning: '⚠️ All current data will be completely replaced!',
      restoreCancelled: 'Restore cancelled',
      restoreSuccess: '✓ Data restored successfully. Reopen pages to refresh.',
      restoreError: '✗ Error: ',
      readFileFailed2: '✗ Read failed: ',
      invalidFile2: '✗ Invalid file',
      restoreFromFileConfirm: 'Restore',
      restoreFromFileWarning: 'All current data will be replaced.',
      restoreFromFileSuccess: '✓ Restored from ',
      restoreTitle: 'Restore backup',
      retagLabel: 'Re-tag data with the current code',
      retagHint: 'Enable only when the backup is from a store with a different code. When on, restored records (products, invoices, orders...) are re-stamped with the current store code so they appear in the UI.',
      retagWarn: 'Note: enabling this assigns the old store\'s data to the current store. Leave it off if the backup is from the same store.',
      retagCurrent: 'Current store code:',
      restoreSuccessRetag: '✓ Data restored and re-tagged with the current code. Reopen pages to refresh.',
      restoreFromFileSuccessRetag: '✓ Restored and re-tagged from ',
      deleteAllConfirm: '⚠️ Delete all data?',
      deleteAllDetails: 'All products, invoices, customers, suppliers, payments, returns, and discounts will be cleared.',
      deleteAllWarning: 'This action cannot be undone!',
      deleteAllBackupHint: 'Make sure to create a backup before continuing.',
      deleteAllFinalConfirm: 'Final confirmation: Delete all data?\nYou won\'t be able to restore without a backup.',
      deleteAllDone: '✓ All data cleared. Use "Restore" to recover data.',
      clearData: 'Clear Data', clearDataDesc: 'Clear all data from the app — used to test backup restoration',
      deleteAllBtn: 'Delete All Data',
    },
    sharedInventory: {
      title: 'Shared Inventory', sub: 'View main store and linked branches inventory',
      searchAll: 'Search All Stores', searchAllPlaceholder: 'Search by name or barcode to find which store has the product...',
      loading: 'Loading data...', backToList: 'Back to List',
    },
    migration: {
      title: 'Import from Previous Program', cardTitle: 'Import from Previous Program',
      cardDesc: 'Import data from any other program (CSV, Excel, databases...)',
      cardBtn: 'Import from Previous Program',
      dropHere: 'Drag & drop a file here or click to browse',
      supportedFormats: 'Supports: CSV, Excel, JSON, XML, SQL, SQLite (.db), dBASE (.dbf), Firebird (.fdb), Sable Stock (.gssp/.zgssp), any text',
      reading: 'Reading file...', readError: 'Error reading file',
      selectTable: 'Select the table containing your parts:',
      preview: 'Data Preview', columns: 'columns',
      mapColumns: 'Column Mapping',
      mapHint: 'Auto-mapping attempted — review and adjust as needed',
      noMapping: 'No mapping',
      back: 'Back', next: 'Next',
      totalRows: 'Total rows:', mappedFields: 'Mapped fields:',
      moreRows: 'more rows...',
      importBtn: 'Import Data',
      needNameOrBarcode: 'At least product name or barcode must be mapped',
      importing: 'Importing...', importSuccess: 'Import completed successfully',
      productsImported: 'products imported', importError: 'Import error',
      cannotRead: 'Cannot read file', parseError: 'Error parsing file',
      forceTypeLabel: 'File type (manual):', forceAuto: 'Auto (detected type)',
      forceTypeHint: 'Leave it on "Auto" normally — change it only when the program cannot recognise an old backup.',
      engineHintSql: 'The SQL Server (LocalDB) operation could not be completed — see the details below; if needed, check administrator rights and that SqlLocalDB.msi shipped with the installer',
      engineHintFirebird: 'Could not start the Firebird engine — check that gbak.exe, fbclient.dll and the VC++ runtime shipped with the installer',
      engineHintSqlite: 'Could not load the SQLite engine (sql.js) — check that the installation is complete',
      engineHintGeneric: 'This file could not be opened with the detected type — try choosing the type manually',
      unsupportedDbType: 'This database type requires manual export',
      exportHint: 'Export data from your old program as CSV or Excel, then try again',
      aiAnalyzing: 'AI analyzing...',
      aiError: 'AI Error',
      aiDone: 'AI analysis completed',
      aiAnalyzed: 'Analyzed by AI',
      chooseMode: 'Choose Processing Method',
      modeHint: 'Local processing is fast and uses automatic matching. AI processing intelligently analyzes data to understand unstructured text.',
      localMode: 'Local Processing',
      localHint: 'Fast automatic matching',
      aiMode: 'AI Processing',
      aiHint: 'Smart analysis via your chosen AI provider',
      aiRequiresKey: '* AI processing requires an API key configured in Settings',
      mssqlNoPath: 'Could not access the backup file path',
      mssqlOpenError: 'Could not open the SQL Server (.bak) backup',
      mssqlNoTables: 'No readable tables found in the SQL Server backup',
      firebirdNoPath: 'Could not access the Firebird database file path',
      firebirdNoTables: 'No readable tables found in the database',
      firebirdOpenError: 'Could not open Firebird database',
      firebirdTableError: 'Could not read table',
      selectRole: 'What does this table contain?',
      roleHint: 'Choose the data type so it imports correctly',
      roleProducts: 'Parts / Products',
      roleCustomers: 'Customers',
      roleSuppliers: 'Suppliers',
      needName: 'At least the name field must be mapped',
      importDone: 'Import completed successfully',
      roleSalesInvoices: 'Sales Invoices',
      rolePurchaseInvoices: 'Purchase Invoices',
      importedNote: 'Imported',
      oldInvoiceNote: 'Imported invoice',
      oldPaymentNote: 'Imported payment',
      restoringBackup: 'Restoring backup (gbak)...',
      preparingEngine: 'Preparing SQL Server engine...',
      rolePayments: 'Payments',
      loadingBrands: 'Reading brands...',
      brandEmpty: 'No brand',
      fullImportPanelTitle: 'Full Data Import',
      fullImportPanelDesc: 'Sable Stock / Gestion Stock database detected — you can import everything at once: customers, suppliers, products with prices, invoices and returns.',
      fullImportBtn: 'Full Import',
      fullImportPopupTitle: 'Select brands to import',
      fullImportPopupHint: 'Select the brands you want to import products for. Products without a brand are always imported.',
      selectAll: 'Select All',
      cancelImport: 'Cancel',
      confirmImport: 'Start Import',
      creatingBackup: 'Creating backup before import...',
      productsNone: 'No products were imported (check brand selection)',
      markBackfilled: 'Mark restored for existing products',
      fullImportDone: 'Full import completed',
      gsspReading: 'Opening the Sable Stock backup...',
      gsspNotSable: 'This file is not a valid Sable Stock backup',
      gsspBadPassword: 'Could not open the Sable Stock backup — the backup password is unknown for this version',
      gsspPanelDesc: 'A Sable Stock (GSSP) backup was detected — everything can be imported at once: customers, suppliers, products with prices, sales invoices, cash sales and payments, with their real dates.',
      gsspSaleLine: 'Sale',
      gsspCashLine: 'Cash sale',
      gsspCashLabel: 'Cash invoice',
      gsspInvoiceNote: 'Sable Stock invoice',
      gsspCashNote: 'Sable Stock cash invoice',
      gsspPaymentNote: 'Sable Stock payment',
      gsspSkipped: 'already present',
      returnsCount: 'Returns',
      avoirReason: 'Return (Avoir)',
      walkin: 'Walk-in customer',
      dispatchNote: 'Dispatch invoice note', dispatchNotePlaceholder: 'Note printed on the dispatch invoice...',
    },
    brandCat: { brand: 'Brand', category: 'Choose Part Type', searchPlaceholder: 'Search for type...', addProduct: 'Add Product', noCategories: 'No categories yet', addCategory: 'Add category', products: 'products' },
    catProducts: { title: 'Products', sub: 'Available Products', searchPlaceholder: 'Search for product...', addProduct: 'Add Product', empty: 'No products in this category', addInvoiceTitle: 'Add Product to Invoice', scanPlaceholder: 'Scan barcode...', scannerReady: 'Ready to scan', searchProduct: 'Search for product', newProduct: 'New Product', searchExisting: 'Search by name or barcode', searchExistingPlaceholder: 'Product name or barcode...', name: 'Product Name', namePlaceholder: 'Part name', barcode: 'Barcode', barcodePlaceholder: 'Enter barcode', generate: 'Generate', qty: 'Quantity', buyPrice: 'Buy Price', sellPrice: 'Sell Price', supplier: 'Supplier', supplierPlaceholder: 'Search for supplier by name...', cancel: 'Cancel', addToCart: 'Add to Invoice Cart', cartTitle: 'Invoice Cart', total: 'Total:', clear: 'Clear',       confirmInvoice: 'Confirm Invoice', fiscalStamp: 'Fiscal Stamp (Timbre Fiscal)', wholesalePrice: 'Wholesale Price' },
    settings: {
      title: 'Settings', sub: 'Application Settings',
      printSettingsBtn: 'Print Settings',
      general: 'General Settings',
      storeName: 'Store Name', currency: 'Currency', language: 'Language', buttonSound: 'Button sounds', introSound: 'Intro sound',
      productQR: 'Show product QR codes', productQRHint: 'When enabled, a small QR code appears on product cards in inventory and sales. Off by default and remembered on this device.',
      openIsolated: 'Open isolated window', createShortcut: 'Desktop shortcut',
      isolatedHint: 'Opens the company in a separate window and process with completely isolated data.',
      snapshotDone: 'Company snapshot is ready.', snapshotError: 'Could not prepare the company snapshot:',
      openDone: 'Isolated window opened.', openError: 'Could not open the isolated window:',
      shortcutDone: 'Desktop shortcut created.', shortcutError: 'Could not create the shortcut:',
      isolatedOnly: 'This window is dedicated to a single company.',
      staleBuild: 'This installed build is older and does not include isolated company windows. Close the app and relaunch the updated version, or install 3.3.6.',
      notif: 'Low Stock Notifications',       autoBackup: 'Auto Backup',
      info: 'About',
      version: 'Version', developer: 'Developer', lastUpdate: 'Last Update',
      invoiceLogo: 'Business Logo (Invoices)',
      logoUpload: 'Upload Business Logo', logoPreview: 'Preview Logo', logoRemove: 'Remove',
      logoLayout: 'Logo position, size and opacity', logoSize: 'Size', logoOpacity: 'Opacity',
      logoLocalHint: 'Saved on this device only — never uploaded to the cloud.',
      logoPreviewHint: 'This is how the logo will appear on the printed invoice.', logoPreviewBw: 'Black & white',
      logoSaved: 'Business logo saved', logoRemoved: 'Logo removed',
      logoImportFailed: 'Could not import the logo', logoNone: 'No logo loaded',
      logoRemoveConfirm: 'Remove the business logo from invoices?',
    },
    chart: { sales: 'Sales', inventory: 'Inventory', returns: 'Returns' },
    connection: {
      title: 'Connection Settings', sub: 'Cloud connection and store management',
    },
    btn: {
      newInvoice: 'New Invoice', addPart: 'Add Part', export: 'Export',
      addSupplier: 'Add Supplier', addCustomer: 'Add Customer', addDiscount: 'Add Discount',
      addReturn: 'Record Return',
    },
    common: {
      save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit', confirm: 'Confirm',
      close: 'Close', print: 'Print', loading: 'Loading...', processing: 'Processing...',
      noResults: 'No results', empty: 'Empty', search: 'Search',
      noPermission: 'You do not have permission to perform this action',
      noAccessHint: 'You do not have access to any page. Contact the manager.',
      page: 'Page', of: 'of', product: 'Product', piece: 'Piece', invoice: 'Invoice',
      qty: 'Qty', total: 'Total', paid: 'Paid', remaining: 'Remaining', debt: 'Debt',
      date: 'Date', name: 'Name', status: 'Status', actions: 'Actions',
      yes: 'Yes', no: 'No', success: 'Success', error: 'Error', warning: 'Warning',
      areYouSure: 'Are you sure?', stock: 'Stock', price: 'Price',
      addItem: 'Add', removeItem: 'Remove', clearCart: 'Clear Cart',
      ready: 'Ready', done: 'Done', notFound: 'Not found', outOfStock: 'Out of stock',
      lowStock: 'Low stock', new: 'New', provisional: 'Provisional',
      paidFull: 'Fully paid', paidPartial: 'Partial payment', unpaid: 'Unpaid',
      manual: 'Manual', customer: 'Customer',
      back: 'Back', pay: 'Pay', payFull: 'Pay Full', searchAll: 'Search All', refresh: 'Refresh', confirmPay: 'Confirm Payment',
      barcode: 'Barcode', brand: 'Brand', category: 'Category', supplier: 'Supplier',
      address: 'Address', phone: 'Phone', email: 'Email', username: 'Username', password: 'Password',
      generate: 'Generate', fiscalStamp: 'Fiscal Stamp', cart: 'Cart', clear: 'Clear',
      subtotal: 'Subtotal', discount: 'Discount', totalAfterDiscount: 'Total After Discount',
      payNow: 'Amount Paid Now', remainingDebt: 'Remaining (Debt)', fullPayment: 'Full Payment', noPayment: 'No Payment',
      real: 'Real', formal: 'Formal', customerDiscount: 'Customer Discount', additionalDiscount: 'Additional Discount',
    },
    sales: {
      title: 'Sales', sub: 'Create New Sales Invoice',
      searchParts: 'Search Parts', searchPlaceholder: 'Search by part name or number...',
      emptySearch: 'Type to start searching for parts',
      emptyResults: 'No search results', emptyProducts: 'No products',
      cart: 'Shopping Cart', cartEmpty: 'Cart is empty', total: 'Total:',
      checkout: 'Checkout',
      unavailable: 'Unavailable', lowStockTip: 'Low stock',
      scannerReady: 'Ready', scannerDone: 'Done', scannerNotFound: 'Not found', scannerUnavailable: 'Unavailable',
      scannerMultiple: 'Multiple matches — pick the product from the list',
      noCustResults: 'No results', discount: 'Discount',
      del: 'Delete',
      fullyPaid: 'Fully paid', partialPay: 'Partial payment', enterPaid: 'Enter paid amount',
      cartEmptyAlert: 'Cart is empty', notAvailableQty: 'Not available in required qty', available: 'Available:',
      paidExceedsTotal: 'Paid amount cannot exceed total',
      fullPaymentNote: 'Full payment at sale', partialPaymentNote: 'Partial payment at sale',
      overpayTitle: 'Paid amount exceeds the due', overpayMsg: 'The paid amount is greater than the invoice total. Continue and record the excess?', overpayContinue: 'Continue',
      creditWarn: 'Customer credit limit exceeded', creditWarnMsg: 'This sale would push the balance above the customer credit limit — continue?', creditLimit: 'Credit limit', projectedBalance: 'Projected balance after sale', creditContinue: 'Continue sale', creditBlocked: 'Cannot exceed the credit limit — adjust the cart or choose another payment method', creditDebtMsg: 'This customer must settle previous debts before this operation can continue',
      discountType: 'Customer', discountManual: 'Manual', lineDiscount: 'Line discount',
      clearCartConfirm: 'Clear purchase cart?',
      customer: 'Customer', customerPlaceholder: 'Search for customer...', unregistered: 'Unregistered customer', remove: 'Remove',
      pickSubCustomer: 'Choose a sub-customer',
      cartTitle: 'Shopping Cart', subtotal: 'Subtotal', customerDiscount: 'Customer Discount', additionalDiscount: 'Additional Discount',
      totalLabel: 'Total', paidLabel: 'Amount Paid', payFull: 'Pay Full', remainingLabel: 'Remaining',
      clear: 'Clear', checkout: 'Checkout', emptyCartTitle: 'Cart is Empty', emptyCartHint: 'Scan item barcode or select from product list',
      scanPlaceholder: 'Scan barcode or search by name...', searchPlaceholder2: 'Search by part name or barcode...', productsCount: '0 products', multiBatches: 'Multiple batches', mixedPrice: 'Mixed price', unit: 'Unit', wholesale: 'Wholesale', unlimited: 'Unlimited', freeBtn: 'Sell an unlisted item', freeTitle: 'Sell an unlisted item', freeHint: 'An item with no stock card: quantity and price are typed by hand and nothing is deducted from stock.', freeName: 'Item name (optional)', freeNamePh: 'Leave empty for "Item not in stock"', freeQty: 'Quantity', freePrice: 'Unit price', freeTotal: 'Total', freeAdd: 'Add to cart', freeDefaultName: 'Item not in stock', freeTag: 'Unlisted', freeNoCost: 'No cost', freeQtyBad: 'Enter a quantity greater than zero', freePriceBad: 'Enter a price for the item',
      payMethod: 'Payment Method', payCash: 'Cash', payCcp: 'CCP', payBoth: 'Both',
      cashAmount: 'Cash Amount', ccpAmount: 'CCP Amount',
      marginBtn: 'Margin settings', marginTitle: 'Minimum profit margin', marginHint: 'Computed from the shelf price against the cost: no price below the allowed minimum.',
      marginEnabled: 'Enable the minimum', marginRetail: 'Retail %', marginWholesale: 'Wholesale %', marginStore: 'Whole store',
      marginRules: 'Exceptions (category, brand or product)', marginScopeCat: 'Category', marginScopeBrand: 'Brand', marginScopeProduct: 'Product',
      marginPick: 'Choose', marginAdd: 'Add exception', marginRemove: 'Delete', marginNone: 'No exception',
      marginPwd: 'Store password', marginPwdBad: 'Wrong password', marginSaved: 'Margin settings saved',
      marginWarn: 'This price is below the minimum profit margin', marginMin: 'Allowed minimum', marginContinue: 'Continue', marginAccept: 'Use the minimum',
    },
    orders: {
      title: 'Orders', sub: 'Order missing parts from suppliers',
      tabMine: 'My Orders', tabBranches: 'Branch Orders',
      suggestions: 'Low stock suggestions', noSuggestions: 'No low or out-of-stock products — great!',
      search: 'Search by part name or barcode...',
      all: 'All', today: 'Today', week: 'Week', month: 'Month', year: 'Year',
      refresh: 'Refresh',
      empty: 'No orders yet — add from suggestions or search',
      statusPending: 'Pending', statusDone: 'Done', statusNotAvailable: 'Not available',
      btnDone: 'Done', btnNotAvailable: 'Not available', btnDelete: 'Delete',
      deleteConfirm: 'Delete this order?',
      cloudRequired: 'Cloud connection required to view branch orders',
      loading: 'Loading branch orders...',
      noBranchOrders: 'No branch orders yet',
    },
    invoices: {
      title: 'Invoices', sub: 'All Sales & Purchase Invoices',
      search: 'Search for invoice...', newInvoice: 'New Invoice', quickEntry: 'Quick Entry', smartAdd: 'Smart Add',
      col1: 'Invoice #', col2: 'Date', col3: 'Customer', col4: 'Amount', col5: 'Status', col6: 'Actions',
      empty: 'No invoices yet', noMatch: 'No matching invoices',
      resultsInfo: ' invoices',
      typeSale: 'Sale Invoice', typeSupplier: 'Supplier Invoice', typeWaybill: 'Waybill / Delivery Note',
      typeProforma: 'Proforma Invoice', typeDispatch: 'Dispatch Invoice', typeTransfer: 'Transfer Invoice',
      typeReception: 'Reception Invoice', typePurchase: 'Purchase Invoice',
      newPaymentInvoice: 'Payment Voucher', typePayment: 'Payment Voucher',
      paymentInvoiceTitle: 'New Payment Voucher',
      paymentInvoiceDesc: 'Record cash received from a customer or a supplier (revenue), or a supplier debt note with no cash — balance movement without an invoice.',
      payFromCustomer: 'Receive from customer', payFromSupplier: 'Receive from supplier', payToSupplier: 'Supplier debt note',
      supplierDebtNote: 'Debt note (no cash — excluded from revenue)',
      payParty: 'Customer / Supplier', payOutstanding: 'Current balance (outstanding)',
      payAmount: 'Voucher amount', payMethod: 'Payment method', payNote: 'Note (optional)',
      confirmPayment: 'Save voucher', receivedLabel: 'Received',
      selectPayCustomer: 'Select customer', selectPaySupplier: 'Select supplier',
      payPartySearch: 'Search for a customer or supplier...', noDebt: 'No debt', owedOn: 'Debt (he owes us)', owedFor: 'Credit (we owe him)',
      customerBalance: 'Customer balance', supplierBalance: 'Supplier balance',
      overpayWarn: 'Amount exceeds the current balance — current customer balance:',
      chooseParty: 'Please choose a customer or supplier', paymentInvoiceSaved: 'Voucher {n} saved',
      cannotPayVoucher: 'Payment vouchers are fully settled — no payment can be added',
      cannotEditVoucher: 'Payment vouchers are view-only — cannot be edited',
      custVoucherNote: 'Payment voucher — balance settlement without invoice',
      suppVoucherNote: 'Supplier debt note — balance movement without invoice',
      suppReceiptNote: 'Supplier receipt — balance settlement without invoice',
      badgeProvisional: 'Provisional',
      printReturnInvoice: 'Print Return Invoice',
      returnNote: 'Return note',
      returnNoteHint: 'This invoice has {count} returned item(s) totalling {amount} — print the return invoice to see the returned lines.',
      itemCount: 'items', paidLabel: 'Paid', unpaidLabel: 'Unpaid', remainingLabel: 'Remaining',
      invCardProduct: 'Product', invCardQty: 'Qty', invCardPrice: 'Price', invCardDiscount: 'Discount', invCardTotal: 'Total', invCardMoreItems: 'more items',
      pageInfo: 'Page', allowPopups: 'Please allow popups for printing',
      cannotPayReception: 'Cannot add payment to reception invoice - reference only',
      cannotPayProforma: 'Cannot add payment to proforma invoice',
      fullyPaidAlert: 'Invoice is fully paid', invalidAmount: 'Invalid amount',
      transferPayNote: 'Payment on transfer invoice', regularPayNote: 'Payment via invoices',
      paymentSaved: 'Payment recorded successfully',
      cannotEditDispatch: 'Cannot edit dispatch invoice',
      cannotEditReception: 'Cannot edit reception invoice - reference only',
      cannotEditProformaWaybill: 'Cannot edit provisional waybill',
      noPermission: 'You are not authorized to view this invoice',
      editTitle: 'Edit Invoice',
      editHelpSupplier: 'Supplier invoice: increasing qty increases stock and supplier balance, decreasing reduces both.',
      addFromScratch: 'Add from scratch',
      qeUndoRemove: 'Undo',
      addFromScratchConflict: 'Barcode conflict: another product with the same barcode has different details',
      editHelpCustomer: 'Edit quantities, unit price and per-line discount. Increase deducts from stock, decrease returns to stock and records as return. Total updates automatically = (price × qty) − discount.',
      scanPlaceholder: 'Scan barcode or type product name...',
      editColProduct: 'Product', editColCurrentQty: 'Current Qty', editColNewQty: 'New Qty',
      editColDiscount: 'Discount', editColLineTotal: 'Line Total',
      saveEdits: 'Save Edits', cancelEdit: 'Cancel',
      scanDone: 'Done', scanReady: 'Ready', scanNotFound: 'Not found', resultCount: 'result',
      availableStock: 'Available:', notInStock: 'Not in stock', badgeNew: 'New',
      cannotBelowZero: 'Cannot set qty of "..." below zero in stock',
      insufficientStock: 'Insufficient stock for "..."',
      noQtyChanged: 'No quantity changed',
      noChangesMade: 'No changes made',
      invoiceEdited: 'Invoice edited successfully',
      deleteConfirm: 'Delete this invoice completely? Products will be returned to stock and linked payments/returns will be deleted.',
      cannotDeleteReception: 'Cannot delete reception invoice - reference only',
      cannotDeleteSold: 'Cannot delete supplier invoice - product "..." has been sold',
      invoiceDeleted: 'Invoice deleted',
      transferEditTitle: 'Edit Transfer Invoice',
      transferEditHelp: 'Edit item quantities. Increase reduces your stock and adds to receiver. Decrease adds to your stock and reduces receiver.',
      currentTotal: 'Current Total:', editColSellPrice: 'Sell Price',
      newTotal: 'New Total:', diff: 'Difference:',
      paidEditLabel: 'Paid amount', paidEditHint: 'Edit the cash paid; the party balance, net account, expenses, sales and margin update automatically.',
      paidEditNote: 'Paid amount corrected', paidEditRemaining: 'Remaining:', paidEditCredit: 'Credit balance',
      deleteLine: 'Delete line', addFreeLine: 'Add manual line',
      freeLineBadge: 'Manual line', freeLineNamePlaceholder: 'Item name (no stock product)',
      freeLineNameRequired: 'Enter a name for the manual line', freeLineQtyRequired: 'Manual line quantity must be greater than zero',
    },
    inventory: {
      title: 'Inventory', sub: 'Manage Parts Inventory',
      search: 'Search inventory...', add: 'Add Part', export: 'Export',
      col1: 'Code', col2: 'Part Name', col3: 'Brand', col4: 'Quantity', col5: 'Buy Price', col6: 'Sell Price', col7: 'Actions',
      empty: 'Inventory is empty',
      customizeBtn: 'Customize buttons', customizeTitle: 'Customize inventory buttons',
      customizeHint: 'Choose which buttons appear on the inventory page. Your choice is saved automatically on this device.',
      customizeShowAll: 'Show all',
      transferBranch: 'Transfer products to branch or main store',
      transferMain: 'Transfer products to branches',
      scannerReady: 'Ready to scan', scannerProcessing: 'Processing...',
      scannerFound: 'Found:', scannerDone: 'Scan complete',
      scannerNewBarcode: 'New product - Barcode', scannerNew: 'New product',
      noResults: 'No results',
      enterName: 'Please enter product name', enterBarcode: 'Please enter barcode',
      clearCartConfirm: 'Clear invoice cart?', cartEmpty: 'Invoice cart is empty',
      invoiceSaved: 'Invoice registered for', fiscalStamp: 'Fiscal stamp',
      includes: 'includes', productUnit: 'products', pieceUnit: 'pieces',
      editLabelName: 'Product Name', editLabelBarcode: 'Barcode', editLabelBrand: 'Brand',
      editLabelCategory: 'Category', editLabelQty: 'Quantity', editLabelBuyPrice: 'Buy Price', editLabelSellPrice: 'Sell Price', editLabelWholesale: 'Wholesale Price',
      editTitle: 'Edit Product',
      diagnoseBtn: 'Diagnose', diagTitle: 'Product diagnosis report',
      diagDuplicateYes: 'Duplicate: several cards for the same product', diagDuplicateNo: 'No duplicate (single card)',
      diagGroupCount: 'Cards sharing this identity/barcode',
      diagVerdictLabel: 'Likely cause', diagVerdictSingle: 'Single card (no duplicate)',
      diagVerdictSplit: 'Smart split: price/cost/expiry difference — intended behaviour',
      diagVerdictIndependent: 'Independent duplicate: identical identity but created twice (stale cache / second window or different path)',
      diagVerdictIdentity: 'An identity field differs (name/brand/reference/country/mark) — treated as two different products',
      diagScope: 'Current scope', diagCompany: 'Company:', diagStore: 'Store:',
      diagInScope: 'in scope', diagOutScope: 'out of scope',
      diagSupplierDiff: 'Supplier differs between cards — this explains one card with a supplier and one without.',
      diagSupplierSame: 'Supplier is identical across cards.',
      diagCreated: 'Created', diagSource: 'Source', diagSupplier: 'Supplier', diagQty: 'Qty',
      diagBuy: 'Buy', diagSell: 'Sell', diagRealCost: 'Real cost',
      diagSplitReason: 'Split reason', diagSplitFrom: 'split from', diagCurrent: 'current', diagNone: 'none',
      diagIdentityDiff: 'Identity differs',
      diagQtyCheck: 'Quantity check', diagGroupQty: 'Cards total qty', diagPurchaseQty: 'Purchase invoices qty', diagPurchaseLines: 'Purchase lines',
      diagQtyOk: 'Quantity matches the purchase invoices.', diagQtyMismatch: 'Quantity does not match the purchase invoices — possible double entry or manual edit.',
      diagAudit: 'Audit trail for this product', diagNoAudit: 'No recorded operations for this product.', diagReason: 'Reason',
      diagHint: 'Two cards with the same barcode = smart split (price/cost difference) or independent creation. See the "Split reason" column and the source.',
      diagNotFound: 'Product not found.',
      deleteConfirm: 'Are you sure you want to delete this product?',
      importSuccess: 'Imported', importSuccessEnd: 'products successfully',
      importCost: 'Purchase cost:', importRecorded: 'Recorded in net account',
      importFailed: 'Import failed. Check file format.',
      addWithInvoice: 'Add Stock + Invoice', transferBtn: 'Transfer Products', exportExcel: 'Export Excel', exportXlsxTitle: 'Export Inventory to Excel', exportWithBuy: 'Export with purchase price', exportWithoutBuy: 'Export without purchase price', exportExcludeZero: 'Exclude zero-quantity products', exportExcludeZeroHint: 'Your choice is remembered for future exports', exportSkippedZero: 'Zero-quantity products skipped:', exportSheetTitle: 'Inventory List', exportDate: 'Export date', exportCount: 'Products count', exportBy: 'By', exportTotal: 'Total', noExport: 'No data to export', exportSuccess: 'Export completed successfully', exportError: 'Error while saving: ', colName: 'Product Name', colBarcode: 'Barcode', colBrand: 'Brand', colMark: 'Mark', colReference: 'Reference', colCountry: 'Country of Origin', colStorage: 'Storage Location', colQty: 'Quantity', colBuyPrice: 'Purchase Price', colSellPrice: 'Selling Price', colWholePrice: 'Wholesale Price', colExpiry: 'Expiry Date', exportCSV: 'Export CSV', importCSV: 'Import CSV / Excel', addDirect: 'Add Product Without Invoice', addDirectTitle: 'Add Product Without Invoice', addDirectBtn: 'Add product to inventory', addDirectHint: 'Product is added directly to inventory without creating a purchase invoice. Purchase price is optional.', barcodeConflict: 'This barcode is registered to another product', invalidBarcode: 'Invalid barcode', entryDestination: 'Financial entry direction (buy price × quantity)',
      addTitle: 'Add Stock + Invoice', scanPlaceholder2: 'Scan barcode...',
      searchExisting: 'Search existing product (by name or barcode)', searchExistingPlaceholder: 'Product name or barcode...',
      category: 'Category', name: 'Product Name', barcode: 'Barcode', generate2: 'Generate',
      qty: 'Quantity', buyPrice: 'Buy Price', sellPrice: 'Sell Price', wholesalePrice: 'Wholesale Price', supplierOptional: 'Supplier (optional)',
      supplierSearchPlaceholder: 'Search for supplier...', addToCart: 'Add to Invoice Cart',
      invoiceCart: 'Invoice Cart', fiscalStamp2: 'Fiscal Stamp (Timbre Fiscal)', totalLabel: 'Total:',
      clear2: 'Clear', confirmInvoice: 'Confirm Invoice', categoryCol: 'Category',
      quickAdd: 'Add Fixed Product', quickAddTitle: 'Add Fixed Product', quickAddHint: 'Fixed product (e.g. restaurant menu items): added directly with no quantity, no buy price and no invoice.', quickAddNamePlaceholder: 'Example: Large Burger', quickAddBtn: 'Add Product', quickAddSuccess: 'Product added successfully', quickAddUpdated: 'Product price updated', optional: '(optional)', invalidSell: 'Enter a valid sell price',
    },
    transfer: {
      loading: 'Loading...', chooseDest: 'Choose destination', mainStore: 'Main Store',
      loadError: 'Error loading destinations',
      scannerProcessing: 'Processing...', scannerFound: 'Found:', scannerDone: 'Scan complete',
      scannerNotFound: 'No product with barcode', scannerNotInStock: 'in your stock', scannerNotFoundShort: 'Not found',
      noResults: 'No results', stock: 'Stock:',
      selectDestFirst: 'Please select destination store first',
      searchFirst: 'Please search for a product first', qtyZero: 'Quantity must be greater than zero',
      qtyExceeds: 'Requested quantity', qtyExceedsAvail: 'exceeds available',
      buyPriceZero: 'Buy price must be greater than zero',
      donationLabel: 'Send products free of charge (donation)',
      donationWarning: 'Warning: the transfer invoice will show a balance of 0, and the receiving invoice will also show a balance of 0 for the recipient.',
      donationNote: 'Donation (free transfer)',
      available: 'Available:',
      clearCartConfirm: 'Clear transfer cart?', scannerReady: 'Ready to scan',
      selectDest: 'Please select destination store', cartEmpty: 'Transfer cart is empty',
      paidExceedsTotal: 'Paid amount cannot exceed total',
      confirmTitle: 'Confirm Transfer:', confirmFrom: 'From:', confirmTo: 'To:',
      confirmProducts: 'Products:', confirmTotal: 'Total:', confirmPaid: 'Paid:', confirmRemaining: 'Remaining (Debt):',
      confirmContinue: 'Do you want to continue?',
      productNotFound: 'Product "..." not found in stock',
      stockLessThanNeeded: 'Available qty for "..." is less than needed',
      payNote: 'Payment - Transfer to',
      transferSuccess: 'Transfer invoice created successfully!',
      transferredProducts: 'Transferred products:', transferTotal: 'Total:',
      transferPaid: 'Paid:', transferRemaining: 'Remaining (Debt):',
      transferError: 'Error during transfer:',
      sub: 'Transfer products between stores with debt tracking',
      senderStore: 'Sending Store', destination: 'Destination',
      chooseDestination2: '-- Choose Destination --', selectDestination: 'Select destination store',
      scanPlaceholder2: 'Scan barcode...', searchExisting: 'Search product in stock (by name or barcode)',
      searchPlaceholder2: 'Product name or barcode...', productDataTitle: 'Product Data for Transfer',
      productName: 'Product Name', availableQty: 'Available Qty', transferQty: 'Transfer Qty',
      buyPrice: 'Buy Price', sellPrice2: 'Sell Price', brand2: 'Brand', category2: 'Category',
      addToCart2: 'Add to Transfer Cart', transferCart: 'Transfer Invoice Cart', totalLabel2: 'Total:',
      clear3: 'Clear', paymentSection: 'Payment & Debts', payNow2: 'Amount Paid Now',
      remainingDebt2: 'Remaining (Debt):', fullPayment2: 'Full Payment', noPayment2: 'No Payment',
      confirmTransfer: 'Confirm & Execute Transfer Invoice',
    },
    settings: {
      title: 'Settings', sub: 'Application Settings',
      printSettingsBtn: 'Print Settings',
      general: 'General Settings',
      storeName: 'Store Name', currency: 'Currency', language: 'Language', buttonSound: 'Button sounds', introSound: 'Intro sound',
      productQR: 'Show product QR codes', productQRHint: 'When enabled, a small QR code appears on product cards in inventory and sales. Off by default and remembered on this device.',
      openIsolated: 'Open isolated window', createShortcut: 'Desktop shortcut',
      isolatedHint: 'Opens the company in a separate window and process with completely isolated data.',
      snapshotDone: 'Company snapshot is ready.', snapshotError: 'Could not prepare the company snapshot:',
      openDone: 'Isolated window opened.', openError: 'Could not open the isolated window:',
      shortcutDone: 'Desktop shortcut created.', shortcutError: 'Could not create the shortcut:',
      isolatedOnly: 'This window is dedicated to a single company.',
      staleBuild: 'This installed build is older and does not include isolated company windows. Close the app and relaunch the updated version, or install 3.3.6.',
      notif: 'Low Stock Notifications', autoBackup: 'Auto Backup',
      info: 'About',
      version: 'Version', developer: 'Developer', lastUpdate: 'Last Update',
      settingsSaved: 'Settings saved',
      invoiceLogo: 'Business Logo (Invoices)',
      logoUpload: 'Upload Business Logo', logoPreview: 'Preview Logo', logoRemove: 'Remove',
      logoLayout: 'Logo position, size and opacity', logoSize: 'Size', logoOpacity: 'Opacity',
      logoLocalHint: 'Saved on this device only — never uploaded to the cloud.',
      logoPreviewHint: 'This is how the logo will appear on the printed invoice.', logoPreviewBw: 'Black & white',
      logoSaved: 'Business logo saved', logoRemoved: 'Logo removed',
      logoImportFailed: 'Could not import the logo', logoNone: 'No logo loaded',
      logoRemoveConfirm: 'Remove the business logo from invoices?',
      wrongPassword: 'Current password is incorrect',
      verifyError: 'Verification error:',
      passwordMinLength: 'Password must be at least 4 characters',
      passwordsNoMatch: 'Passwords do not match',
      passwordSaved: 'Password saved successfully',
      errorPrefix: 'Error:',
      colPage: 'Page', colView: 'View', colEdit: 'Edit', colDelete: 'Delete',
      enterUsername: 'Please enter username', enterPassword: 'Please enter password',
      userUpdated: 'User updated successfully', userCreated: 'User created successfully',
      noPerms: 'No permissions',
      delete_user_confirm: 'Are you sure you want to delete user "..."?',
      storeAddress: 'Store Address', phoneNumber: 'Phone Number', enableFiscalStamp: 'Enable Fiscal Stamp in Invoices',
      fiscalRatio: 'Ratio:', fiscalMin: 'Min 5 DA - Max 10,000 DA',
      fiscalPercent: '% (0% for basic systems)', lowStockThreshold: 'Low Stock Threshold',
      lowStockHint: 'Below this number is considered low stock', saveSettings: 'Save Settings',
      storePasswordCard: 'Store Password', storePasswordDesc: 'To protect the store, create a password. Cannot login as manager without it.',
      currentPassword: 'Current Password', currentPasswordPlaceholder: 'Leave empty if new',
      newPassword: 'New Password', newPasswordPlaceholder: 'Store password',
      confirmPassword: 'Confirm Password', confirmPasswordPlaceholder: 'Re-enter password',
      savePassword: 'Save Password',
      lanCard: 'LAN Sync',
      lanDesc: 'Link this device to another device of the same store over your router for instant sync of all sales, inputs and edits.',
      lanRole: 'Device role',
      lanOff: 'Disabled',
      lanMain: 'Main server (device with static IP)',
      lanSub: 'Sub server (second register)',
      lanLocalIps: 'This device IP addresses',
      lanLocalIpHint: 'Set one of these as a static IP in Windows/router settings and enter the same address on the sub device.',
      lanServerIp: 'Main server IP address',
      lanPort: 'Port',
      lanPortHint: 'Starts at 4512 and shifts automatically if busy',
      lanStatus: 'Sync status',
      lanStatusOff: 'Sync is disabled',
      lanStatusMainOn: 'Main server is running',
      lanStatusMainOff: 'Main server is stopped',
      lanStatusClients: 'Connected devices',
      lanStatusSubOn: 'Connected to main server',
      lanStatusSubOff: 'Not connected to main server',
      lanListeningPort: 'Actual port',
      lanFirewallHint: 'If the sub device cannot connect, allow this app through Windows Firewall (private network): Settings → Privacy & Security → Windows Firewall → Allow an app through firewall.',
      lanTest: 'Test connection',
      lanTestWait: 'Testing...',
      lanTestOk: 'Connection successful — server is available on this port',
      lanTestFail: 'Connection failed',
      lanTestRefused: 'No server on this address/port',
      lanTestTimeout: 'Timeout — the port may be blocked or the address is wrong',
      lanTestUnreachable: 'Address unreachable — make sure both devices are on the same network',
      lanSaved: 'Sync settings saved successfully',
      lanIpRequired: 'Enter the main server IP address first',
      lanRemoteReset: 'Remotely wipe branch data',
      lanRemoteResetConfirm: 'This will wipe all data on the branch device remotely and re-sync it from this main server. Are you sure?',
      printerCard: 'Share printer over LAN',
      printerDesc: 'Share the printer attached to this device with the other cash registers, or install and set the server printer as default on this device.',
      printerShareSide: 'Share this device printer (server)',
      printerInstallSide: 'Use the server printer from this device (sub)',
      printerSelect: 'Local printer',
      printerLoading: 'Loading',
      printerNone: 'No printers',
      printerDefaultNow: 'Current default printer',
      printerShareName: 'Share name',
      printerShareNow: 'Share',
      printerUnshare: 'Unshare',
      printerSharedOk: 'Printer shared successfully - available path:',
      printerUnsharedOk: 'Printer unshared',
      printerServerHost: 'Server address',
      printerBrowse: 'Browse printers',
      printerConnect: 'Connect & set default',
      printerMakeDefault: 'Set default',
      printerConnected: 'Printer connected',
      printerDriverInf: 'Driver INF path (if not installed)',
      printerInstallDriver: 'Install driver',
      printerDrvShare: 'Or a shared driver folder on the server',
      printerInstallDriverShare: 'Install from shared folder',
      printerDriverInstalled: 'Printer driver installed successfully',
      printerFixDesc: 'Requires admin rights and automatically restarts the Spooler service.',
      printerFixNow: 'Fix network printing issues (0x0000011b / 0x00000709)',
      printerFixOk: 'Fix applied and print service restarted',
      printerTest: 'Print a test page',
      printerTestTitle: 'Print Test Page',
      printerSelectFirst: 'Select a printer first',
      printerHostRequired: 'Enter the server address',
      printerLookForDrv: 'Select the driver file (INF) first',
      printerBusy: 'Querying',
      printerNoneShared: 'No shared printers found on that server',
      printerWorking: 'Working...',
      printerInstalling: 'Installing',
      printerUnknownErr: 'An unexpected error occurred',
      printerNeedAdmin: 'This operation needs administrator rights (accept the UAC prompt) - or do it manually from Windows Settings.',
      printerAccessDenied: 'Access denied on the remote device. Make sure printer sharing is enabled in Windows and Everyone is allowed on the printer.',
      printerHostUnreachable: 'Cannot reach the server - make sure both devices are on the same network and the name/address is correct.',
      printerDriverMissing: 'Driver is not installed locally',
      printerDriverMissingHint: 'Install the driver from the INF or shared folder above, then retry.',
      printerDriverNightmare: 'This device is missing the printer driver or has a security restriction (PrintNightmare). Install the driver and retry, or run the Fix printing issues button first.',
      printerDefaultSet: 'Printer set as default',
      lanRemoteResetSent: 'Wipe command sent to the branch — it will clear and re-sync within moments.',
      usersCard: 'User Management', usersDesc: 'Create users and set their application permissions.',
      addUser: 'Add User', newUser: 'New User',
      companiesCard: 'Company Management (Multi)', companiesDesc: 'Create several companies and switch between their data from this device. Each company keeps its own data (products, invoices, customers, suppliers...) fully separate.',
      addCompany: 'Add Company', newCompany: 'New Company',
      companyName: 'Company Name', companyNamePlaceholder: 'e.g. Modern Auto Parts',
      companyStoreName: 'Company Store Name', companyStoreNamePlaceholder: 'e.g. Modern Auto Parts - Main Store',
      companyPassword: 'Company Password', companyPasswordPlaceholder: 'Password to log in as this company' + "'" + 's manager',
      companyActiveHint: 'Currently active company: ',
      enterCompany: 'Log in as Company Manager', exitCompany: 'Exit company scope',
      confirmDeleteCompany: 'Are you sure you want to delete this company and all its data? This cannot be undone.',
      resetCompanyData: 'Clear company data',
      confirmResetCompanyData: 'Clear ALL data of company: ... This cannot be undone!',
      confirmResetCompanyDataFinal: 'Extra confirmation: all products, invoices, customers, suppliers, payments, returns, orders and transfers of this company will be deleted. Continue?',
      resetCompanyDataDone: 'Company data cleared (… records).',
      noCompanies: 'No companies yet',
      companyNameRequired: 'Company name is required',
      companyStoreCodes: 'Branches attached to this company', companyStoreCodesHint: 'Select one or more branches (leave empty = this company will not appear to any branch)', companyNoBranches: 'No branches created yet',
      companyLegalTitle: 'Legal identification (shown on printouts)',
      companyPhone: 'Phone', companyAddress: 'Address', companyNis: 'NIS', companyNif: 'NIF', companyRcc: 'RCC / RC', companyArticle: 'ARTICLE',
      userCompany: 'Company',
      companyManageDenied: 'Company management is only available to the main store.',
      companyNotPermitted: 'This user cannot be assigned to this company; it is not authorized for this store/branch.',
      companyNoPermitted: 'No companies are authorized for this store/branch',
      companyUpdated: 'Company changes saved',
      companyCreated: 'Company created successfully',
      companyIsActive: 'Currently active company',
      enteredCompany: 'You are now in this company' + "'" + 's scope. Only its data will be shown.',
      userName: 'Username', userNamePlaceholder: 'Username',
      userPassword: 'Password', userPasswordPlaceholder: 'Password',
      permissions: 'Permissions',
    },
    storeDebts: {
      title: 'Store Debts', sub: 'Debts by transfer invoices',
      storeCount: 'Stores', owedToUs: 'Owed to Us', weOwe: 'We Owe',
      netDebt: 'Net Debt', transferInvoices: ' transfer invoices',
      owedLabel: 'Owed:', weOweLabel: 'We owe:', paidLabel: 'Paid:',
      totalDebt: 'Total Debt', totalInvoices: 'Total Invoices',
      paid: 'Paid', remaining: 'Remaining',
      typeTransfer: 'Outgoing', typeReception: 'Reception',
      statusPaid: 'Paid', statusRemaining: 'Remaining',
      noTransfers: 'No transfer invoices',
      payTitle: 'Pay Installment', total: 'Total:', paidPreviously: 'Paid Previously:',
      payAmount: 'Payment Amount', confirmPay: 'Confirm Payment', back: 'Back',
      noInvoices: 'No invoices', invoiceDetails: 'Invoice Details',
      invoiceActionsPrint: 'Print', invoiceActionsPay: 'Pay', invoiceActionsEdit: 'Edit',
      printChoiceTitle: 'Choose print type', printChoiceDesc: 'How do you want to print this invoice?', printNormal: 'Normal print', printEmployee: 'Print to employee', employeeDocTitle: 'Preparation list',
      printTotalTitle: 'Printed total',
      printTotalNet: 'After discount', printTotalGross: 'Before discount',
      printTotalNetDesc: 'Unit price unchanged + a discount line', printTotalGrossDesc: 'Total only, no mention of any discount',
      printTotalHintNet: 'The unit price prints as quoted, then the discount line, then the total after discount.',
      printTotalHintGross: 'Only the total before discount prints — no discount line at all.',
      paidAfterDiscount: 'After discount',
      cardDiscountTag: 'Discount',
      cardDiscountTitle: 'Discounted invoice — open it and press i for the rate and the real cost',
      discountOnInvoiceBanner: 'This invoice carries a discount — press {i} or this message to see the discount rate, the real cost and the total after discount ({net}).',
      invoiceActionsDelete: 'Delete', invoiceActionsClose: 'Close',
      totalDebtLabel: 'Total Debt', emptyPlaceholder: 'No transfer invoices',
    },
    branchesMonitor: {
      title: 'Branch Monitor', sub: 'Monitor and manage all branches from one place',
      loading: 'Loading data...',
      online: 'Online', offline: 'Offline',
      productCount: ' products', saleCount: ' sales',
      viewDetails: 'View Details',
      noData: 'No data available', noInventory: 'No inventory', noInvoices: 'No invoices',
      productsLabel: 'Products:', invoicesLabel: 'Invoices:',
      tabInventory: 'Inventory', tabInvoices: 'Invoices', tabPurchases: 'Purchases', tabNet: 'Net Account',
      notAvailable: 'N/A',
      sold: 'Paid', provisional: 'Provisional',
      transferIncome: 'Transfer Income', transferCost: 'Transfer Cost',
      totalSales: 'Total Sales', totalPurchases: 'Total Purchases',
      netAccount: 'Net Account',
      searchPlaceholder: 'Search products...',
      noSearchResults: 'No results in any store',
      outOfStock: 'Out of stock', inStock: 'In stock',
      searchAll: 'Search All Stores', searchAllPlaceholder: 'Search by name or barcode to find which store has the product...',
      branchCount: 'Branches', totalProducts: 'Total Products', totalRevenue: 'Total Revenue',
      branchesList: 'Branch List', refresh: 'Refresh', noBranches: 'No registered branches',
      backToList: 'Back to List', products: 'Products', invoices: 'Invoices',
      sales: 'Sales', purchases: 'Purchase Invoices', loadingPlaceholder: 'Loading...',
    },
    chart: { sales: 'Sales', inventory: 'Inventory', returns: 'Returns' },
    connection: {
      title: 'Connection Settings', sub: 'Cloud connection and store management',
      connected: 'Connected to cloud',
      mainConnected: 'Main store - connected to Supabase',
      branchConnectedMsg: 'Branch connected to main store',
      mainStore: 'Main store', branch: 'Branch',
      branchParenthetical: '(Branch)',
      enterCredentials: 'Enter credentials to start',
      logoutConfirm: 'Are you sure you want to logout?',
      cloudRequired: 'Please connect to cloud first',
      uploading: 'Uploading...', noChanges: 'No changes to upload',
      uploadSuccess: 'Upload successful',
      uploadBackupBtn: 'Upload backup',
      lanSubUploadMsg: 'This device is a LAN sub server: uploading to the cloud is done from this location\'s main server',
      enterStorePassword: 'Enter store password to download:',
      wrongPassword: 'Wrong password',
      verificationError: 'Verification error: ',
      backupEmpty: 'Backup is empty',
      restoreSuccessMsg: 'Restored successfully - restart the app',
      restoreBackupBtn: 'Restore backup',
      lastSync: 'Last sync: ',
      branchNameRequired: 'Please enter branch name',
      passwordRequired: 'Please enter password',
      branchCreated: 'Branch created - Code: ',
      passwordLabel: 'Password: ',
      viewStock: 'View stock', deleteBranchBtn: 'Delete branch',
      deleteBranchConfirm1: 'Delete branch "',
      deleteBranchConfirm2: 'You won\'t be able to restore it.',
      enterStorePasswordView: 'Enter store password to view branch stock:',
      noBranchStock: 'No inventory for this branch',
      barcode: 'Barcode', brand: 'Brand', sellPrice: 'Sell Price',
      emailRequired: 'Please enter a valid email',
      searching: 'Searching...', noPassword: 'No password',
      savingPassword: 'Saving new password...',
      userInfoTitle: 'User Info', emailLabel: 'Email', codeLabel: 'Your Code',
      storeTypeLabel: 'Store Type', mainCodeLabel: 'Main Code',
      statusTitle: 'Disconnected', statusDesc: 'Enter connection credentials to start',
      statusBadge: 'Disconnected', connTab: 'Connection', backupTab: 'Backup',
      branchesTab: 'Branches', recoveryTab: 'Account Recovery',
      cloudStatusCard: 'Cloud Connection Status', cloudStatusDesc: 'Cloud connection is automatic. All your data is safely stored.',
      logoutBtn: 'Logout', uploadCard: 'Upload Backup', uploadDesc: 'The existing backup in the cloud will be replaced...',
      pushTitle: 'Mobile Notifications', pushDesc: 'When a product order or spoiled-goods return is created, an instant notification is sent to your phone even while the website is closed.',
      siteUrlLabel: 'Website URL', siteUrlPlaceholder: 'https://...',
      pushSaveBtn: 'Save', pushUrlRequired: 'Please enter the website URL', pushUrlInvalid: 'The website URL is not valid',
      pushSaved: 'Settings saved',
      autoBackup: 'Auto Backup', backupInterval: 'Interval (minutes)',
      min1: '1 min', min2: '2 min', min5: '5 min', min10: '10 min', min30: '30 min',
      uploadBtn: 'Upload Backup', restoreBtn: 'Restore Backup',
      branchesCard: 'Branches', branchesDesc: 'Branch management is only available for the main store.',
      addBranch: 'Add New Branch', branchName: 'Branch Name', branchNamePlaceholder: 'e.g. Downtown Branch',
      branchPassword: 'Password', branchPasswordPlaceholder: 'Branch password',
      saveBranch: 'Save Branch', cancel2: 'Cancel', addNewBranch: 'Add New Branch', refreshBtn: 'Refresh',
      noBranches2: 'No registered branches', branchStock: 'Branch stock: ',
      recoveryCard: 'Account / Password Recovery', recoveryDesc: 'Enter the email associated with the account...',
      search2: 'Search', storeNameLabel: 'Store Name', codeResult: 'Code', passwordResult: 'Password',
      changePassword: 'Change Password', searchAgain: 'Search Again',
      newPasswordLabel: 'New Password', newPasswordPlaceholder2: 'At least 4 characters',
      confirmPasswordLabel: 'Confirm Password', confirmPasswordPlaceholder2: 'Re-enter password',
      saveNewPassword: 'Save New Password',       backBtn: 'Back',
      scannerTab: 'Phone Scanner', scannerCard: 'Wireless Barcode Scanner',
      scannerDesc: 'Turn any phone on the shop network into a wireless barcode scanner that feeds the same barcode field as a wired scanner. Runs as a fully local HTTPS service with a private certificate — your data never leaves the shop.',
      scannerEnable: 'Enable phone scanner',
      scannerFirewall: 'Verify firewall permission',
      scannerStep1: 'Enable the service and scan the QR code with your phone (same Wi-Fi network).',
      scannerStep2: 'Open the page and point the camera at a product barcode or sales invoice.',
      scannerStep3: 'On first open an approval window appears here — choose "Always" or "This session".',
      scannerStep4: 'Every scanned code is inserted automatically into the open barcode field.',
      scannerStep5: 'The first time you may see a "Not secure" warning — tap More / Continue; the cert becomes trusted after one install.',
      certHelpTitle: 'Install the security certificate on your phone (required for a real app)',
      certHelpDesc: 'If you tapped Continue on the certificate warning, install the CA once from the link below and reopen the page; otherwise Chrome only offers a home-screen shortcut.',
      certHelpOpen: 'Open install guide',
      certHelpCopy: 'Copy guide link',
      scannerDevices: 'Paired devices', scannerNoDevices: 'No devices paired yet',
      scannerStarting: 'Starting service…', scannerStarted: 'Phone scanner is now running',
      scannerStartError: 'Failed to start phone scanner', scannerStopped: 'Phone scanner is off',
      scannerRunning: 'Running', scannerError: 'Error',
      scannerFwChecking: 'Checking firewall permission…', scannerFwOk: 'Firewall permission is fine',
      scannerFwNeedsPermission: 'Admin permission denied — enable the scanner first or allow the firewall rule manually',
      scannerPairTitle: 'Pairing request from phone', scannerPairAlways: 'Always',
      scannerPairSession: 'This session', scannerPairDeny: 'Refuse',
      scannerRemove: 'Remove', scannerRemoveConfirm: 'Remove this device and block it?',
      scannerSell: 'Sell', scannerSellTitle: 'Allow this phone to sell from the shop',
      psaleCard: 'Phone Point of Sale (Sell)',
      psaleDesc: 'Let employees sell from their phones during rush hours: open the sale page on the same shop network, each employee picks their name and sells to customers and suppliers with discounts and price control. The sale is executed on the desktop directly, so invoices, stock and balances update instantly on every device.',
      psaleEnable: 'Enable selling from a phone',
      psaleEnabled: 'Phone selling is now ON', psaleDisabled: 'Phone selling is now OFF',
      psaleRunning: 'Phone selling enabled', psalePaused: 'Selling paused — enable it above',
      psaleStep1: 'Turn selling on and scan the QR with the same barcode-scanner phone (or a new phone — approval will appear here).',
      psaleStep2: 'Open the "ZMT Sell" page and pick the employee from the top bar.',
      psaleStep3: 'Search parts, add them to the cart, choose the customer/supplier, discount and payment method.',
      psaleStep4: 'Confirm the sale — invoice, stock and balances update instantly on the computer.',
    },
    pd: {
      tab: 'Price Display',
      saved: 'Saved',
      tabDesc: 'A full-screen stage that plays your store videos; scanning any barcode shows its retail price for 3 seconds and then the video comes back. Everything stays on this computer only.',
      enable: 'Enable price display',
      enabled: 'Enabled',
      disabled: 'Disabled',
      videosTitle: 'Video clips',
      videosDesc: 'Clips play in order then loop forever. Nothing is uploaded to the cloud — they are copied into the local program data folder.',
      videosAdd: 'Add video',
      videosEmpty: 'No video clips yet',
      videoAdded: 'Clips added',
      mediaTitle: 'Images & videos',
      mediaDesc: 'Items play in order then loop forever: an image stays for its own duration, a video plays in full. Nothing is uploaded to the cloud — they are copied into the local program data folder.',
      mediaAddImage: 'Add image',
      mediaAddVideo: 'Add video',
      mediaEmpty: 'No images or videos yet',
      imageAdded: 'Image added',
      logoTitle: 'Store logo',
      logoDesc: 'Shown at the top of the stage and next to the price. Visible on the price display only.',
      logoPick: 'Choose image',
      logoClear: 'Remove',
      logoSaved: 'Logo saved',
      colorsTitle: 'Colours and fonts',
      bg: 'Page background colour',
      priceColor: 'Number (price) colour',
      nameColor: 'Store name colour',
      nameSize: 'Name font size',
      priceSize: 'Number size',
      font: 'Font',
      tickerTitle: 'Bottom ticker',
      tickerDesc: 'A white scrolling bar at the bottom with the program logo, ZMT SOFTWARE and contact details.',
      tickerOn: 'Show the bottom ticker',
      tickerPhone: 'Phone number in the ticker',
      tickerMail: 'Email in the ticker',
      autoLoginTitle: 'Automatic price display sign-in',
      autoLoginDesc: 'On start the program signs in to this account with no password and opens the display full screen right away.',
      autoLoginOn: 'Enable automatic sign-in',
      autoLoginUser: 'Account',
      autoLoginPass: 'Password',
      autoLoginNeed: 'Pick an account and type its password',
      autoStartTitle: 'Start with Windows',
      autoStartDesc: 'Opens the program automatically when the computer boots, then goes straight to the price display.',
      autoStartOn: 'Launch the program when Windows starts',
      pinTitle: 'Lock PIN',
      pinDesc: 'Asked when leaving the display (lock button or Ctrl+Shift+P). Leave it empty to use the store password instead.',
      pinLabel: 'Lock PIN',
      pinSave: 'Save PIN',
      pinShort: 'At least 3 characters',
      noAccount: '— pick an account —',
      noVideos: 'No video clips yet',
      noVideosHint: 'Add video clips from Connection settings ← Price Display tab',
      currency: 'DA',
      notFound: 'Product not found',
      scanPlaceholder: 'Scan a barcode here',
      lockTitle: 'Manager PIN',
      lockPlaceholder: 'Enter the PIN',
      cancel: 'Cancel',
      unlock: 'Unlock'
    },
    rest: {
      tab: 'Restaurant',
      enable: 'Enable Restaurant feature',
      enabled: 'Restaurant is ON',
      disabled: 'Restaurant is OFF',
      roleLabel: 'This device role',
      roleSend: 'Sender — sends orders (waiter)',
      roleReceive: 'Receiver — gets orders (kitchen/cashier)',
      roleNone: 'Device not participating',
      roleNoneHint: 'Enable restaurant and pick a device role to start.',
      nameLabel: 'This device name',
      namePlaceholder: 'e.g. Kitchen 1 or Waiter Ahmed',
      tablesLabel: 'Table list',
      tablesAdd: 'Add table',
      tablesHint: 'Type a table number then press add. Senders may also type any free table.',
      printerLabel: 'Kitchen ticket printer',
      printerDefault: 'Default printer',
      printerListBtn: 'Refresh list',
      permsTitle: 'Device permissions (manager)',
      permsDesc: 'Set what each device may do: send, control status, confirm sale.',
      permSend: 'Send',
      permControl: 'Control status',
      permConfirm: 'Confirm sale',
      deviceCol: 'Device',
      nameCol: 'Name',
      roleCol: 'Role',
      savePerms: 'Save permissions',
      permSaved: 'Permissions saved and broadcast',
      myDevice: 'This device',
      onlyManager: 'Permission management is manager-only',
      pageTitle: 'Local Orders',
      pageSub: 'Restaurant orders on the local network',
      ordersEmpty: 'No orders yet',
      outgoing: 'My sent orders',
      incoming: 'Orders received here',
      qtyLabel: 'Qty',
      priceLabel: 'Price',
      time: 'Time',
      actions: 'Action',
      statusCol: 'Status',
      tableCol: 'Table',
      senderCol: 'Sender',
      receiverCol: 'Receiver',
      itemsCol: 'Items',
      orderBtn: 'Order',
      orderSelfBtn: 'Order for myself',
      selfReceiver: 'This device (myself)',
      cartTitle: 'Restaurant order tray',
      cartSub: 'Review the items, then send them to the kitchen',
      clear: 'Clear',
      emptyCart: 'Tray is empty — press "Order" on any product',
      emptyCartHint: 'Items are added here one by one before sending',
      close: 'Close',
      notesPlaceholder: 'e.g. no onion, mildly spicy…',
      orderSent: 'Order sent successfully',
      receiverLabel: 'Receiver',
      noReceivers: 'No receiver online',
      tableLabel: 'Table number',
      tablePlaceholder: 'Pick or type the table number',
      notesLabel: 'Notes',
      send: 'Send order',
      addedToCart: 'Added to tray',
      newOrder: 'New order',
      cancel2: 'Close',
      cancel: 'Cancel',
      inprogressBtn: 'In progress',
      doneBtn: 'Done',
      confirmBtn: 'Confirm sale',
      confirmTitle: 'Confirm order sale',
      confirmSub: 'Review the amount and pick a payment method',
      itemsCount: 'items',
      noActions: 'No actions available right now',
      payMethod: 'Payment method',
      payCash: 'Cash',
      payCcp: 'CCP',
      payConfirm: 'Confirm payment & sale',
      customerLabel: 'Customer (optional)',
      stockShort: 'Not enough stock — order kept as new',
      failed: 'Operation failed',
      saleOk: 'Sale done; invoice & stock updated',
      ticketTitle: 'Kitchen ticket',
      tablePrefix: 'Table',
      fromLabel: 'From:',
      itemCol: 'Item',
      invoiceTitle: 'Sale invoice',
      sellerLabel: 'Seller:',
      paidLabel: 'Paid:',
      remainLabel: 'Remaining:',
      thanks: 'Thank you for your visit',
      statusNew: 'New',
      statusInprogress: 'In progress',
      statusDone: 'Done',
      statusConfirmed: 'Confirmed',
      statusCancelled: 'Cancelled',
      orderNo: 'Order #',
      sent: 'Order sent',
      done: 'Done',
      ticketPrinted: 'Kitchen ticket printed',
      noTable: 'Enter the table number',
      total: "Total",
      all: "All",
    },
    login: {
      loginSubtitle: 'Choose login method', managerTab: 'Manager', userTab: 'User', newAccountTab: 'New Account', branchTab: 'Branch',
      codeLabel: '10-digit code', storePassword: 'Store Password', passwordPlaceholder: 'Enter password',
      chooseCompany: 'Select company', enterNow: 'Enter', chooseEmployee: 'Select employee', employeePlaceholder: 'Employee name', needCompany: 'Please choose a company first',
      loginManager: 'Login as Manager', forgotPassword: 'Forgot password?',
      storeCode: 'Store Code', storeCodePlaceholder: 'Enter store code (10 digits)',
      usernameLabel: 'Username', usernamePlaceholder: 'Username',
      userPassword: 'Password', loginAsUser: 'Login as User',
      emailLabel: 'Email', createAccount: 'Create Account', createPasswordLabel: 'Store password (optional, recommended for activation)',
      mainStoreCode: 'Main Store Code', branchPassword: 'Branch Password', branchLogin: 'Connect as Branch',
      accountCreatedTitle: 'Account Created Successfully!', accountCreatedDesc: 'Save this code somewhere safe. You will need it to recover your data.',
      accountCreatedWarning: 'This code cannot be recovered. Write it down or take a photo.', enterApp: 'Enter App',
      recoveryTitle: 'Password Recovery', recoverySubtitle: 'Enter your email to view code and password',
      searchBtn: 'Search', backToLogin: 'Back to Login',
      storeNameSpan: 'Store Name:', codeSpan: 'Code:', passwordSpan: 'Password:',
      loginWithCode: 'Login with Code', resetPassword: 'Reset Password',
      searchAgainLink: 'Search Again', newPasswordTitle: 'Set New Password',
      newPassLabel: 'New Password', newPassPlaceholder: 'Enter new password',
      confirmPassLabel: 'Confirm Password', confirmPassPlaceholder: 'Re-enter password',
      saveNewPass: 'Save New Password', backLink: 'Back',
    },
  },
  fr: {
    appTitle: 'ZMT PIECE',
    online: 'En Ligne', offline: 'Hors Ligne',
    nav: {
      localOrders: 'Commandes Locales',
      priceDisplay: 'Affichage des Prix',
      main: 'Principal', manage: 'Gestion', finance: 'Finances', system: 'Système',
      dashboard: 'Tableau de Bord', brands: 'Marques', sales: 'Ventes', invoices: 'Factures',
      inventory: 'Stock', suppliers: 'Fournisseurs', customers: 'Clients', debts: 'Dettes', debtDetails: 'Détails des Dettes',
      customerMovements: 'Mouvements Clients', supplierMovements: 'Mouvements Fournisseurs',
      employees: 'Employés',
      supplierReturns: 'Marchandises Abîmées', expiry: 'Expiration',
      netAccount: 'Compte Net', expenses: 'Dépenses', discounts: 'Remises', returns: 'Retours',
      reports: 'Rapports', backup: 'Sauvegarde', settings: 'Paramètres',
      zakat: 'Zakat',
      connection: 'Paramètres de Connexion',
      storeDebts: 'Dettes Magasins', branchesMonitor: 'Moniteur Succursales', sharedInventory: 'Stock Partagé',
      orders: 'Commandes',
    },
    expiry: {
      title: 'Expiration', sub: 'Produits périmés ou arrivant à expiration',
      search: 'Rechercher par nom ou code-barres...', refresh: 'Actualiser', noDate: '—',
      filterAll: 'Tous', filterExpired: 'Périmé', filterExpiring: 'Expire bientôt', filterOk: 'OK',
      sumExpired: 'Périmés', sumExpiring: 'Expire bientôt', sumOk: 'OK', sumWarnWindow: 'jours d\'avertissement',
      expired: 'Périmé', expiresToday: 'Expire aujourd\'hui', inDays: 'dans', days: 'jours', overdue: 'en retard',
      warnMsg: 'Avertissement d\'expiration :',
      empty: 'Aucun produit correspondant', editPrompt: 'Nouvelle date d\'expiration (AAAA-MM-JJ):', invalidDate: 'Format de date invalide',
    },
    dash: {
      title: 'Tableau de Bord', sub: 'Aperçu des Ventes et des Stocks',
      s1: 'Articles en Stock', s2: 'Factures ce Mois', s3: 'Clients Inscrits', s4: 'Ventes Totales',
      chart: 'Ventes vs Stock vs Retours', months: 'Mois:',
      m1: 'Mois', m2: 'Mois', m3: 'Mois', m4: 'Mois', m5: 'Mois', m6: 'Mois',
      netProfit: 'Bénéfice Net', cost: 'Coût',
      lowStockItems: ' produits en dessous du seuil',
      andMore: 'et', moreItems: 'autres...',
      lowStock: 'Produits sous le seuil', estimatedProfit: 'Profit Total Estimé', monthSales: 'Ventes ce Mois', profitCostDist: 'Distribution Profit & Coût',
      view: 'Afficher', lowStockModalTitle: 'Produits sous le seuil de stock',
      colProduct: 'Produit', colCode: 'Code-barres / Marque', colThreshold: 'Seuil', openProduct: 'Ouvrir le produit',
      printBw: 'Imprimer en noir et blanc', lowStockPrintTitle: 'Rapport des produits sous le seuil',
      printDate: 'Date d’impression', printCount: 'Produits',
    },
    brands: { title: 'Marques', sub: 'Gérer les catégories et marques', search: 'Rechercher une marque...', favAdd: 'Ajouter aux favoris', favRemove: 'Retirer des favoris', brandsWord: 'marques', addOther: 'Ajouter autre', addOtherHint: 'Ajouter une nouvelle catégorie', backToKinds: 'Catégories', brandsOfKind: 'Marques', addBrand: 'Ajouter une marque', noBrands: 'Aucune marque dans cette catégorie', deleteBrand: 'Supprimer la marque', confirmDelete: 'Supprimer cette marque ?', addKindTitle: 'Ajouter une catégorie', kindName: 'Nom de la catégorie', kindIcon: 'Icône (optionnel)', kindColor: 'Couleur', kindRequired: 'Veuillez saisir un nom de catégorie', kindExists: 'Cette catégorie existe déjà', addBrandTitle: 'Ajouter une marque', brandName: 'Nom de la marque', brandCountry: 'Pays', brandColor: 'Couleur de la marque', brandKind: 'Catégorie', brandNameRequired: 'Veuillez saisir un nom de marque' },
    sales: {
      title: 'Ventes', sub: 'Créer une Nouvelle Facture de Vente',
      searchParts: 'Rechercher Pièces', searchPlaceholder: 'Rechercher par nom ou numéro...',
      emptySearch: 'Tapez pour rechercher des pièces',
      cart: 'Panier', cartEmpty: 'Le panier est vide', total: 'Total:',
      checkout: 'Finaliser',
      confirm: 'Confirmer', transferInvoice: 'Transférer la facture', transferTitle: 'Transférer la facture à un client',
      transferHint: "Choisissez le client au nom duquel cette facture sera enregistrée (ex. si l'acheteur agit pour son compte).",
      transferSelected: 'La facture sera enregistrée au nom de :', transferConfirm: 'Confirmer le transfert',
    },
    invoices: {
      title: 'Factures', sub: 'Toutes les Factures',
      search: 'Rechercher une facture...', newInvoice: 'Nouvelle Facture',
      col1: 'Facture #', col2: 'Date', col3: 'Client', col4: 'Montant', col5: 'Statut', col6: 'Actions',
      empty: 'Aucune facture',
    },
    inventory: {
      title: 'Stock', sub: 'Gérer le Stock de Pièces',
      search: 'Rechercher dans le stock...', add: 'Ajouter Pièce', export: 'Exporter',
      col1: 'Code', col2: 'Nom Pièce', col3: 'Marque', col4: 'Quantité', col5: 'Prix Achat', col6: 'Prix Vente', col7: 'Actions',
      empty: 'Le stock est vide',
    },
    suppliers: {
      title: 'Fournisseurs', sub: 'Gérer les Fournisseurs',
      search: 'Rechercher un fournisseur...', add: 'Ajouter Fournisseur',
      col1: 'Nom', col2: 'Tél', col3: 'Email', col4: 'Marques', col5: 'Solde', col6: 'Actions',
      empty: 'Aucun fournisseur',
      addModalTitle: 'Ajouter un Fournisseur', editModalTitle: 'Modifier le Fournisseur',
      formName: 'Nom du Fournisseur', formNamePl: 'Ex: Société XX Pièces Auto',
      formPhone: 'Numéro de Téléphone', formAddress: 'Adresse', formAddressPl: 'Ex: Riyad - Rue Roi Fahd',
      cancel: 'Annuler', save: 'Enregistrer',
    },
    sdPayment: {
      editTitle: 'Modifier le paiement', note: 'Note', date: 'Date du paiement',
      balanceNote: 'Le solde du fournisseur est ajusté automatiquement de la différence.',
      confirmDelete: 'Supprimer ce paiement ? Son effet sur le solde du fournisseur sera annulé.',
      invalidAmount: 'Veuillez saisir un montant valide', invalidDate: 'Format de date invalide',
      updated: 'Paiement modifié et solde ajusté', deleted: 'Paiement supprimé et solde ajusté',
    },
    movements: {
      custTitle: 'Mouvements Clients', custSub: 'Historique complet des dettes, paiements et factures avec règlements de solde',
      supTitle: 'Mouvements Fournisseurs', supSub: 'Historique complet des dettes, paiements et factures avec règlements de solde',
      partyLabel: 'Partie', searchLabel: 'Rechercher', searchPh: 'Rechercher par nom ou numéro de facture...',
      allCustomers: 'Tous les clients', allSuppliers: 'Tous les fournisseurs',
      viewReport: 'Voir le rapport', print: 'Imprimer', close: 'Fermer', printTitle: 'Rapport des mouvements',
      allowPopups: 'Veuillez autoriser les fenêtres pop-up pour imprimer', nothingToPrint: 'Aucune donnée à imprimer',
      emptyList: 'Aucun résultat correspondant', noMovements: 'Aucun mouvement enregistré',
      legendSale: 'Facture de vente (débit)', legendPurchase: 'Facture d\'achat (débit)',
      legendPayment: 'Paiement (crédit)', legendPaySupplier: 'Paiement au fournisseur (crédit)',
      legendVoucher: 'Reçu de versement', legendDebtNote: 'Billet de dette',
      legendSettle: 'Règlement de solde (solde revenu à zéro)',
      entrySale: 'Facture de vente', entryPurchase: 'Facture d\'achat', entrySupSale: 'Vente au fournisseur',
      entryPayment: 'Paiement', entryReceipt: 'Reçu de versement', entryDebtNote: 'Billet de dette',
      itemsNoun: 'articles',
      opening: 'Solde initial', settledTag: 'Règlement de solde', balanceAfter: 'Solde après',
      movCount: 'Mouvements', settleCount: 'Règlements', currentDue: 'Solde actuel',
      colDate: 'Date', colTime: 'Heure', colDesc: 'Désignation', colRef: 'Référence',
      colDebit: 'Débit (+)', colCredit: 'Crédit (−)', colBalance: 'Solde',
      totalDebit: 'Total débit', totalCredit: 'Total crédit', finalBalance: 'Solde final',
      netTotal: 'Soldes nets', grandTotal: 'Total général',
      sumParties: 'Clients', sumPartiesSup: 'Fournisseurs',
      reportTitleOneCust: 'Rapport des mouvements du client', reportTitleAllCust: 'Rapport des mouvements des clients',
      reportTitleOneSup: 'Rapport des mouvements du fournisseur', reportTitleAllSup: 'Rapport des mouvements des fournisseurs',
      phone: 'Tél', generatedAt: 'Émis le',
      footNote: 'Rapport des mouvements généré automatiquement à partir des enregistrements du programme',
      fromLabel: 'Du', toLabel: 'Au',
      qMonth: 'Ce mois', q30: '30 derniers jours', qAll: 'Tout',
      includeReturns: 'Inclure les retours', legendReturn: 'Retour (ne change pas le solde)',
      entryReturn: 'Retour',
      returnsReport: 'Rapport des retours', monthlyStatement: 'Relevé mensuel',
      settleNow: 'Régler le solde', exportCsv: 'Exporter Excel',
      sendWhatsApp: 'WhatsApp', sendEmail: 'Envoyer par e-mail',
      aging: 'Ancienneté des dettes', oldest: 'Dette la plus ancienne', days: 'jour(s)',
      age0: '0-30 jours', age30: '31-60 jours', age60: '61-90 jours', age90: 'Plus de 90 jours',
      overLimit: 'Plafond de crédit dépassé',
      retCount: 'Nombre de retours', retQty: 'Quantité totale', retValue: 'Valeur des retours',
      retTitleOneCust: 'Rapport des retours du client', retTitleAllCust: 'Rapport des retours clients',
      retTitleOneSup: 'Rapport des retours du fournisseur', retTitleAllSup: 'Rapport des retours fournisseurs',
      retPrintTitle: 'Rapport des retours',
      colInvoice: 'Facture', colProduct: 'Produit', colQty: 'Quantité', colValue: 'Valeur', colReason: 'Motif',
      colParty: 'Partie', period: 'Période',
      noReturns: 'Aucun retour enregistré', nothingToExport: 'Aucune donnée à exporter',
      nothingToSend: 'Aucune donnée à envoyer', exportOk: 'Exporté avec succès', exportFail: 'Échec de l\'export',
      emailTo: 'À', emailSubject: 'Objet', emailBody: 'Message', emailInvalid: 'Adresse e-mail invalide',
      emailSent: 'E-mail envoyé', emailFail: 'Échec de l\'envoi de l\'e-mail', cancel: 'Annuler', send: 'Envoyer',
      mCash: 'Espèces', mCcp: 'CCP', mCheck: 'Chèque', mTransfer: 'Virement', customer: 'Client', supplier: 'Fournisseur',
      settleAmount: 'Montant', settleMethod: 'Mode de paiement', settleNote: 'Note',
      settleDefaultNote: 'Règlement de solde', signature: 'Signature électronique', clearSig: 'Effacer la signature',
      settleSave: 'Enregistrer le règlement', invalidAmount: 'Veuillez saisir un montant valide',
      settleSaved: 'Règlement enregistré avec succès', pickOneParty: 'Choisissez d\'abord une partie précise',
      groupAria: 'Raccourcis rapides',
      btnSell: 'Vendre', btnSellTitle: 'Vendre — ouvrir la page de vente',
      btnQuick: 'Saisie rapide', btnQuickTitle: 'Saisie rapide',
      btnSmart: 'Ajout intelligent', btnSmartTitle: 'Ajout intelligent de facture',
      btnCustomers: 'Mouvements clients', btnCustomersTitle: 'Mouvements clients',
      btnSuppliers: 'Mouvements fournisseurs', btnSuppliersTitle: 'Mouvements fournisseurs',
      btnDebts: 'Détails des dettes', btnDebtsTitle: 'Détails des dettes — créances et dettes',
    },
    customers: {
      title: 'Clients', sub: 'Gérer les Clients',
      search: 'Rechercher un client...', add: 'Ajouter Client',
      col1: 'Nom', col2: 'Tél', col3: 'Adresse', col4: 'Achats', col5: 'Solde', col6: 'Actions',
      empty: 'Aucun client',
      addModalTitle: 'Ajouter un Client', editModalTitle: 'Modifier le Client',
      formName: 'Nom du Client', formNamePl: 'Ex: Ahmed Ali',
      formPhone: 'Numéro de Téléphone', formAddress: 'Adresse', formAddressPl: 'Ex: Alger',
      formType: 'Type de client', typeUnit: 'Détail', typeWhole: 'Gros', formTypeHelp: 'Définit le prix par défaut dans la page de vente (modifiable par produit dans le panier)',
      formDiscount: 'Remise (%)', formDiscountHelp: 'De 0.001% à 100% - Optionnel', formCreditLimit: 'Plafond de crédit (facultatif)', formCreditLimitHelp: '0 signifie aucun plafond — avertit au-delà au moment de la vente',
      cancel: 'Annuler', save: 'Enregistrer',
      totalDebts: 'Total Dettes des Clients',
      totalPaid: 'Total Payé',
      totalCount: 'Total Clients',
    },
    employees: {
      title: 'Employés', sub: 'Gérer les employés, la présence et la paie',
      search: 'Rechercher un employé...', add: 'Ajouter Employé', empty: 'Aucun employé',
      totalCount: 'Total Employés', presentToday: 'Présents aujourd\'hui',
      dueThisMonth: 'Dû ce mois', paidThisMonth: 'Payé ce mois',
      scanLabel: 'Scannez le code-barres de l\'employé pour pointer...', scanReady: 'Prêt au scan',
      scanNotFound: 'Code inconnu — aucun employé avec ce code-barres',
      scanIn: 'Pointer l\'entrée', scanOut: 'Pointer la sortie',
      scanDone: 'Journée terminée pour cet employé (entrée et sortie déjà enregistrées)',
      btnCheckIn: 'Entrée', btnCheckOut: 'Sortie', btnFixDay: 'Modifier', btnDelDay: 'Supprimer',
      statusActive: 'Actif', statusInactive: 'Suspendu',
      todayPresent: 'Présent', todayAbsent: 'Absent', todayRest: 'Repos',
      worked: 'Durée', notOutYet: 'Pas encore sorti',
      addModalTitle: 'Ajouter un Employé', editModalTitle: 'Modifier l\'Employé',
      formName: 'Nom de l\'Employé', formNamePl: 'Ex: Mohamed Amine',
      formPhone: 'Numéro de Téléphone (optionnel)',
      formBarcode: 'Code-barres', formBarcodeGen: 'Générer',
      formBarcodeHelp: 'Code unique par employé — ne se répète jamais avec les produits ni autres employés',
      formPhoto: 'Photo (optionnel)',
      formSalaryType: 'Type de salaire', salaryMonthly: 'Mensuel', salaryDaily: 'Journalier',
      formMonthly: 'Salaire mensuel (DA)', formDaily: 'Tarif journalier (DA)',
      salaryHelp: 'Le mensuel est toujours divisé par 30 jours : 30000 → 1000/jour (février et les mois de 31 jours ne sont jamais réduits)',
      formPayDay: 'Jour de paiement', formPayDayHelp: '1 à 31 — jour de règlement du salaire mensuel',
      timingSection: 'Horaires de travail', timingEnabled: 'Activer les horaires (déduction retard/premature)',
      formWorkStart: 'Début du service', formWorkEnd: 'Fin du service', formGrace: 'Tolérance (minutes)',
      perSecond: 'Taux par seconde',
      restSection: 'Jours de travail et de repos', restEnabled: 'Activer les jours de repos',
      restWork: 'Travail', restPaid: 'Repos payé', restUnpaid: 'Repos non payé',
      restHelp: 'Choisissez l\'état de chaque jour. Un repos non payé sans présence est déduit du salaire mensuel ; avec présence il compte comme jour travaillé.',
      formStatus: 'Statut', formNote: 'Note',
      cancel: 'Annuler', save: 'Enregistrer', del: 'Supprimer l\'Employé',
      confirmDelete: 'Supprimer cet employé et ses pointages ? (les versements de salaire restent dans les dépenses)',
      barcodeTaken: 'Ce code-barres est déjà utilisé par un autre employé',
      nameRequired: 'Veuillez saisir le nom de l\'employé',
      invalidNumber: 'Veuillez saisir un montant valide',
      settlement: 'Règlement de la paie', month: 'Mois',
      colIn: 'Entrée', colOut: 'Sortie', colAbsents: 'Absents', colRest: 'Repos',
      colLate: 'Retard', colEarly: 'Départ anticipé', colDeduct: 'Déduction',
      colGross: 'Brut', colNet: 'Net', colState: 'Statut',
      units: 'unité/j', days: 'jours', seconds: 's',
      paid: 'Payé', unpaid: 'Non payé', partial: 'Payé partiellement',
      btnPay: 'Payer', btnUnpay: 'Annuler le paiement',
      noAttendance: 'Aucun pointage ce mois — considéré comme entièrement absent',
      payTitle: 'Verser le salaire', payAmount: 'Montant', payMethod: 'Mode de paiement',
      paySuccess: 'Versement enregistré dans les dépenses',
      unpayConfirm: 'Annuler ce versement ?',
      payNothing: 'Rien à verser',
      badgeTitle: 'Badge de l\'employé', badgePrint: 'Imprimer',
      barcodeMissing: 'Cet employé n\'a pas de code-barres',
      allowPopups: 'Veuillez autoriser les fenêtres pop-up pour imprimer',
      recTitle: 'Registre de présence', recIn: 'Entrée', recOut: 'Sortie',
      recLate: 'Retard (s)', recEarly: 'Anticipé (s)', recEmpty: 'Aucun enregistrement ce mois',
      recManual: 'Manuel',
      editInTitle: 'Heure d\'entrée', editOutTitle: 'Heure de sortie',
      saveRec: 'Enregistrer', dayOf: 'Jour',
      statsHint: 'L\'absence est déduite des pointages : scans code-barres ou boutons manuels',
    },
    stockTools: {
      syncBtn: 'Synchroniser le stock depuis STOCK.FDB',
      syncTitle: 'Synchroniser le stock depuis l’ancien programme',
      syncHint: 'La quantité de chaque article est lue dans la table ARTICLES de l’ancienne base et appliquée au produit correspondant. Les factures ne sont pas utilisées ici car l’ancien stock les inclut déjà — c’est ce qui doublait les quantités (5 → 10).',
      current: 'Qté actuelle',
      legacy: 'Qté ancien programme',
      difference: 'Écart',
      applyLabel: 'Appliquer',
      selectAll: 'Tout sélectionner',
      noChanges: 'Aucun écart — le stock correspond déjà à l’ancien programme',
      applied: 'Stock synchronisé pour',
      changedCount: 'produits',
      cantEdit: 'Vous n’avez pas la permission de modifier le stock',
      notMatched: 'Non apparié',
      matched: 'Apparié',
      changed: 'Diffère',
      unmatchedCount: 'Non appariés',
      legacyTotal: 'Total ancien',
      currentTotal: 'Total actuel',
      readError: 'Impossible de lire la table ARTICLES de l’ancienne base',
      empty: 'Aucun article dans l’ancienne base',
      backupNote: 'Une sauvegarde a été créée avant l’application.',
    },
    balanceTools: {
      editTitle: 'Modifier le Solde',
      current: 'Solde actuel',
      newBalance: 'Nouveau solde (montant)',
      signToggle: 'Sens',
      owesUs: 'Nous doit',
      weOweHim: 'A un crédit chez nous (avance)',
      weOwe: 'Nous lui devons',
      owesUsSup: 'A un solde chez nous (avance)',
      hintCustomer: 'Positif : le client nous doit. Négatif : il a un crédit chez nous (avance).',
      hintSupplier: 'Positif : nous lui devons. Négatif : il a un solde chez nous (avances payées).',
      save: 'Enregistrer',
      saved: 'Solde mis à jour avec succès',
      emptyEdit: 'Veuillez saisir un solde valide',
      cantEdit: 'Vous n\'avez pas la permission de modifier clients/fournisseurs',
      recalcBtn: 'Recalculer les Soldes depuis les Factures',
      recalcConfirm: 'Les soldes clients et fournisseurs seront recalculés à partir des factures et paiements actuels de la base. Une sauvegarde sera créée d\'abord. Continuer ?',
      recalcDone: 'Soldes recalculés avec succès',
      noDiff: 'Aucune différence — les soldes correspondent déjà aux factures',
      clients: 'clients',
      suppliers: 'fournisseurs',
      syncBtn: 'Synchroniser les Soldes depuis STOCK.FDB',
      syncTitle: 'Synchroniser les Soldes depuis l\'Ancienne Base (Gestion Stock)',
      syncHint: 'Valeurs ci-dessous issues de l\'ancienne base : « Stocké » = CREDIT_CLIENT/CREDIT_FOURNISSEUR, « Calculé » = totaux des factures de vente/achat (FC/FF) et paiements (VC/VF).',
      storedLabel: 'Stocké',
      computedLabel: 'Calculé',
      modeStored: 'Utiliser le solde stocké (CREDIT)',
      modeComputed: 'Utiliser le solde calculé depuis l\'archive',
      applyLabel: 'Appliquer à la sélection',
      selectAll: 'Tout sélectionner',
      noFirebird: 'Aucun fichier d\'ancienne base n\'est ouvert. Ouvrez STOCK.FDB d\'abord dans la section import (Gestion Stock).',
      openFile: 'Ouvrir STOCK.FDB...',
      notMatched: 'Non trouvé (absent de l\'ancienne base)',
      applied: 'Soldes mis à jour :',
      changedCount: 'parties modifiées',
      diffCount: 'diffèrent du solde actuel',
      parties: 'parties',
      matchedFor: 'Parties dans l\'ancienne base :',
      noChanges: 'Aucun changement à appliquer',
      parseErr: 'Impossible de lire l\'ancienne base de données',
      hybridTitle: 'Tiers Mixtes (Client ⇄ Fournisseur)',
      hybridHint: 'Règle : une paire CONFIRMÉE = exactement le même nom dans les tables client et fournisseur + une activité réelle (ventes/achats/paiements) des DEUX côtés. L\'ancien programme traitait cette personne comme un FOURNISSEUR opérant dans les deux sens, donc le vrai solde = crédit client − crédit fournisseur (fiche client = NET, fiche fournisseur = −NET). Les autres paires sont À REVOIR (lien historique / nom proche) : elles restent indépendantes avec leur solde stocké sauf sélection manuelle.',
      sectionSingles: 'Tiers simples',
      sectionHybrid: 'Tiers mixtes',
      hybridCustCol: 'Client',
      hybridSupCol: 'Fournisseur',
      hybridLinkCol: 'Lien',
      hybridCreditC: 'Crédit client',
      hybridCreditF: 'Crédit fournisseur',
      hybridNetCol: 'NET réel',
      hybridSignNote: 'NET positif = nous doit (fiche client) ; la fiche fournisseur affiche −NET (nous lui devons).',
      hybridCreate: 'sera créé',
      basisCf: 'Code CF',
      basisName: 'Nom',
      basisBoth: 'CF + Nom',
      basisDouble: 'Fournisseur bidirectionnel (nom + activité)',
      basisConfirmed: 'Confirmation manuelle',
      hybridConfirmed: 'Confirmé',
      hybridSuspect: 'À revoir',
      hybridPairCount: 'paires mixtes',
      noHybrids: 'Aucun tiers mixte dans la base',
      oldBalance: 'Ancien Solde',
      newBalanceVal: 'Nouveau Solde',
      noPermissionTitle: 'Pas d\'autorisation',
    },
    debts: {
      title: 'Dettes', sub: 'Gérer les Dettes',
      youOwe: 'Dettes dues (aux Fournisseurs)', youOwed: 'Dettes dues par les Clients',
      noDebts: 'Aucune dette en cours',
      logTitle: 'Registre des Dettes',
      col1: 'Date', col2: 'Type', col3: 'Partie', col4: 'Montant', col5: 'Statut', col6: 'Actions',
      empty: 'Aucune transaction',
      totalInvoices: 'Total Factures', totalPurchases: 'Total Achats',
      balance: 'Solde', paid: 'Payé', paidToThem: 'Payé à eux',
      invoices: 'Factures', noInvoices: 'Aucune facture', payBtn: 'Payer',
      payments: 'Paiements', noPayments: 'Aucun paiement',
      net: 'Créances Nettes', chooseSide: 'Choisir une partie de la liste', back: 'Retour',
      searchPlaceholder: 'Rechercher par nom ou numéro de téléphone...', tabCustomers: 'Clients', tabSuppliers: 'Fournisseurs',
      totalCustomerDebts: 'Dettes dues par les Clients', totalSupplierDebts: 'Dettes dues aux Fournisseurs',
      recalcFromOldDb: 'Recalculer les soldes clients/fournisseurs depuis l’ancienne base Gestion Stock sans réimporter',
    },
    debtDetails: {
      title: 'Détails des Dettes', sub: 'Vue complète des créances et des dettes avec les clients et fournisseurs',
      onCustomers: 'Total des dettes des Clients', onCustomersHint: 'Montants que les clients vous doivent',
      toSuppliers: 'Total des dettes envers les Fournisseurs', toSuppliersHint: 'Montants que vous devez aux fournisseurs',
      toCustomers: 'Total des dettes envers les Clients', toCustomersHint: 'Soldes créditeurs clients (ils ont payé plus qu’acheté)',
      fromSuppliers: 'Total des dettes des Fournisseurs', fromSuppliersHint: 'Montants que les fournisseurs vous doivent',
      exportCustomers: 'Exporter la liste des Clients', exportSuppliers: 'Exporter la liste des Fournisseurs',
      groupAll: 'Toutes les parties', groupOwing: 'Ceux qui vous doivent', groupOwed: 'Ceux à qui vous devez',
      exportExcel: 'Exporter Excel', view: 'Afficher',
      resultsTitle: 'Résultats', emptyResults: 'Choisissez une option d’affichage ci-dessus pour voir une liste',
      noMatch: 'Aucune partie ne correspond à ce filtre',
      colIndex: '#', colName: 'Nom', colPhone: 'Tél', colAddress: 'Adresse', colBalance: 'Solde', colStatus: 'Statut',
      statusOwingUs: 'Vous doit', statusWeOwe: 'Vous devez',
      total: 'Total', countLabel: 'Nombre de parties',
      filterAllCust: 'Tous les clients', filterAllSup: 'Tous les fournisseurs',
      filterOwingCust: 'Clients qui vous doivent', filterOwedCust: 'Clients à qui vous devez',
      filterOwingSup: 'Fournisseurs qui vous doivent', filterOwedSup: 'Fournisseurs à qui vous devez',
      print: 'Imprimer', sheetTitle: 'Détails des Dettes', dateLabel: 'Date d’export', by: 'Par',
      nothingToExport: 'Aucune donnée à exporter', exportOk: 'Exportation réussie', exportFail: 'Échec de l’exportation',
      customers: 'Clients', suppliers: 'Fournisseurs',
      searchPh: 'Rechercher par nom de client, de fournisseur ou numéro de téléphone...',
      searchHint: 'Saisissez au moins deux caractères pour rechercher clients et fournisseurs ensemble',
      searchResults: 'Résultats de recherche', noSearchResults: 'Aucun résultat correspondant',
      colType: 'Type', typeCustomer: 'Client', typeSupplier: 'Fournisseur', clear: 'Effacer',
      alertsBtn: 'Alertes de dettes', alertsTitle: 'Alertes de dettes',
      alertsSub: 'Choisissez une portée et une durée ; tout tiers qui vous doit au-delà de cette durée rejoint la liste des dettes critiques.',
      scopeLabel: 'Portée', scopeCustomers: 'Clients', scopeSuppliers: 'Fournisseurs', scopeBoth: 'Les deux',
      stateLabel: 'État', enable: 'Activer', disable: 'Désactiver',
      durationLabel: 'Durée', durWeek: 'Une semaine', durTwoWeeks: 'Deux semaines', durMonth: 'Un mois', durTwoMonths: 'Deux mois',
      alertsSave: 'Enregistrer', alertsCancel: 'Annuler', alertsSaved: 'Paramètres d’alerte enregistrés',
      criticalTitle: 'Dettes critiques', criticalEmpty: 'Aucune dette critique actuellement',
      criticalDisabled: 'Les alertes de dettes sont désactivées', critSearchPh: 'Rechercher les dettes critiques par nom...',
      colOwed: 'Montant dû', colAge: 'Âge (jours)', daysUnit: 'jours',
      reminderTitle: 'Alerte : dettes critiques', reminderMsg1: 'Il y a', reminderMsg2: 'tiers avec des dettes dépassant la durée choisie',
      reminderTotal: 'Montant total dû', later: 'Plus tard',
    },
    net: {
      title: 'Compte Net', sub: 'Résumé Financier',
      s1: 'Ventes Totales', s2: 'Achats Totaux', s3: 'Bénéfice Net', s4: 'Montants en Attente',
      logTitle: 'Registre des Transactions',
      col1: 'Date', col2: 'Description', col3: 'Type', col4: 'Montant', col5: 'Solde',
      empty: 'Aucune transaction récente',
      customerDebt: 'Dû à nous', supplierDebt: 'Nous devons',
      purchaseInvoice: 'Facture d\'achat', purchaseFrom: 'Facture de',
      transferInvoice: 'Facture de transfert', receptionInvoice: 'Facture de réception',
      purchases: 'Achats', paymentFrom: 'Paiement de', paymentFromSupplier: 'Encaissement fournisseur : ',
      paymentNote: 'Paiement', paymentWalkin: 'Paiement client',
      salesPaid: 'Ventes (payé)', supplierReceipt: 'Encaissement fournisseur', paymentTo: 'Paiement à',
      paymentToSupplier: 'Paiement fournisseur', expenses: 'Dépenses',
      stockPurchase: 'Achat stock', stockPurchases: 'Achats stock',
      totalExpenses: 'Total Dépenses', quickTitle: 'Saisie rapide', quickHint: 'Écriture directe sans créer de facture ni modifier le stock.', purchaseAdd: 'Ajouter le montant aux achats', expenseAdd: 'Ajouter aux dépenses', quickNoteLabel: 'Note (optionnelle)', addBtn: 'Ajouter', invalidAmount: 'Veuillez saisir un montant valide', directPurchase: 'Saisie directe - Achat', directExpense: 'Saisie directe - Dépense',
      marginTitle: 'Marge Bénéficiaire', periodLabel: 'Période:', today: "Aujourd'hui", yesterday: 'Hier', last7Days: '7 derniers jours',
      totalMargin: 'Marge Bénéficiaire Totale', periodMargin: 'Marge de la Période', allTime: 'Depuis le début',
      cashLabel: 'Espèces', marginLabel: 'Marge', ccpPaidNote: 'Payée par CCP',
      periodCash: 'Espèces de la période', totalCash: 'Espèces totales',
      detailTitle: 'Détails du journal', detailMethod: 'Moyen de paiement', detailNote: 'Note', detailAmount: 'Montant',
      invoiceDetails: 'Total de la facture', productCol: 'Produit', qtyCol: 'Qté',
      buyPriceCol: "Prix d'achat", sellPriceCol: 'Prix de vente', lineTotalCol: 'Total',
      profitCol: 'Bénéfice', marginPctCol: 'Marge %', costEstimated: 'Coût estimé (dernier prix d\'achat)',
      by: 'Par', byManager: 'Gérant',
    },
    expenses: {
      title: 'Dépenses', sub: 'Registre de toutes les dépenses enregistrées dans le compte net avec heure et date',
      totalLabel: 'Total Dépenses', countLabel: 'Nombre d\\\'opérations',
      searchPlaceholder: 'Rechercher par nom de facture, fournisseur ou client...',
      allYears: 'Toutes les années', allMonths: 'Tous les mois', allDays: 'Tous les jours', allLabel: 'Tout',
      addBtn: 'Ajouter une dépense', addTitle: 'Enregistrer une dépense',
      listTitle: 'Journal des dépenses', showMore: 'Afficher plus',
      reasonLabel: 'Motif', reasonPlaceholder: 'ex: livraison, facture d\\\'électricité, réparations...', amountLabel: 'Montant', saveBtn: 'Enregistrer',
      colDate: 'Date', colDesc: 'Description', colSource: 'Source', colType: 'Type', colMethod: 'Moyen', colAmount: 'Montant',
      typeDirect: 'Dépense directe', typeDispatch: 'Envoi', typeStock: 'Achat stock', typeSupplier: 'Paiement fournisseur', typePurchase: 'Facture d\'achat', typeExpense: 'Dépense', typeSalary: 'Salaire',
      directExpense: 'Dépense directe', noDesc: 'Sans description',
      mixedTotal: 'Total', invalidAmount: 'Veuillez saisir un montant valide', needReason: 'Veuillez saisir le motif de la dépense', saved: 'Dépense enregistrée avec succès',
      chooseYear: 'Choisir année', chooseMonth: 'Choisir mois', chooseDay: 'Choisir jour',
    },
    discounts: {
      title: 'Remises', sub: 'Gérer les Offres et Remises',
      add: 'Ajouter Remise',
      col1: 'Produit', col2: 'Remise %', col3: 'Date Début', col4: 'Date Fin', col5: 'Statut', col6: 'Actions',
      empty: 'Aucune remise',
      unregistered: 'Non enregistré', deleteConfirm: 'Supprimer cet enregistrement?',
      totalDiscounts: 'Total Remises', totalValue: 'Valeur Totale des Remises',
      colDate: 'Date', colInvoice: 'Facture', colCustomer: 'Client', colType: 'Type', colRatio: 'Taux', colAmount: 'Montant', colActions: 'Actions',
      viewInvoice: 'Voir la facture', searchPlaceholder: 'Rechercher par n° de facture ou produit...', periodAll: 'Tous', periodToday: "Aujourd'hui", period7: '7 jours', period30: '30 jours', period90: '90 jours',
    },
    returns: {
      title: 'Retours', sub: 'Gérer les Retours et Remboursements',
      add: 'Enregistrer Retour', export: 'Exporter',
      col1: 'Retour #', col2: 'Facture', col3: 'Pièce', col4: 'Qté', col5: 'Raison', col6: 'Date', col7: 'Actions',
      empty: 'Aucun retour',
      time: 'Heure', defaultReason: 'Ajustement facture',
      printReturnInvoice: 'Imprimer la facture de retour',
      deleteConfirm: 'Supprimer cet enregistrement?',
      noReturnsExport: 'Aucun retour à exporter',
      exportSuccess: 'Retours exportés avec succès',
      exportError: 'Erreur lors de la sauvegarde: ',
    },
    returnInvoice: {
      noReturns: 'Aucun retour enregistré pour cette facture.',
      invoiceMissing: 'Facture introuvable : impossible d\'imprimer la facture de retour.',
    },
    supplierReturns: {
      title: 'Marchandises Abîmées', sub: 'Gérer les retours de marchandises abîmées aux fournisseurs',
      export: 'Exporter', filterAll: 'Tous',
      statusPending: 'En cours de retour', statusReturned: 'Retourné', statusNotReturned: 'Non retourné',
      colProduct: 'Produit', colQty: 'Qté', colAmount: 'Montant',
      colSupplier: 'Fournisseur', colInvoice: 'Facture', colDate: 'Date',
      colStatus: 'Statut', colActions: 'Actions', colStore: 'Magasin / Succursale',
      empty: 'Aucune demande de retour',
      noProduct: 'Produit introuvable', noInvoice: 'Aucune facture d\'achat pour ce produit',
      stock: 'En stock', supplier: 'Fournisseur', qty: 'Qté retournée', invoice: 'Facture d\\\'entrée',
      note: 'Note', notePlaceholder: 'Facultatif...',
      modalTitle: 'Retourner la Marchandise au Fournisseur',
      notOwned: 'Vous ne pouvez pas modifier les demandes d\'un autre magasin',
      invalidQty: 'Saisissez une quantité valide', qtyExceedsStock: 'La quantité dépasse le stock actuel',
      qtyExceedsInvoice: 'La quantité dépasse celle de cette facture',
      created: 'Demande de retour enregistrée',
      confirmReturned: 'Confirmer le retour ?\\nLa quantité sera déduite du stock, la facture du fournisseur réduite et le compte net affecté.',
      confirmNotReturned: 'Confirmer non retourné ?\\nAucun changement sur le stock ni la facture.',
      insufficientStock: 'Le stock actuel est insuffisant', invoiceMissing: 'Facture d\'achat introuvable',
      lineMissing: 'Le produit n\'existe plus sur la facture',
      returnedSuccess: 'Retourné : déduit du stock et facture du fournisseur réduite',
      delete: 'Supprimer la demande', deleteReverse: 'Annuler le retour',
      deleteConfirm: 'Supprimer la demande de retour ?', deleteReturnedConfirm: 'Supprimer la demande ?\\nTous les effets seront annulés (stock restauré et facture augmentée).',
      deleted: 'Demande supprimée',
      refundNote: 'Retour de marchandise fournisseur',
      noExport: 'Rien à exporter', exportSuccess: 'Exporté avec succès', exportError: 'Erreur de sauvegarde : ',
    },
    productDetails: {
      title: 'Détails du Produit',
      batches: 'lots',
      salesHistory: 'Historique des Ventes',
      purchaseHistory: 'Historique des Achats Fournisseurs',
      returnsCount: 'Nombre de Retours',
      customerReturns: 'Retours Clients',
      supplierReturns: 'Retours Fournisseurs (Abîmés)',
      colDate: 'Date', colQty: 'Qté', colPrice: 'Prix de Vente', colTotal: 'Total',
      colBuyPrice: "Prix d'Achat", colCustomer: 'Client', colSupplier: 'Fournisseur', colInvoice: 'Facture',
      noData: 'Aucune donnée',
      adviceTitle: "Conseil d'achat", adviceFrom: 'commandez ce produit chez', adviceLowest: 'prix le plus bas payé', adviceCompare: 'Comparaison des fournisseurs',
    },
    reports: {
      title: 'Rapports', sub: 'Rapports Avancés de Ventes et Stock',
      c1: 'Rapport des Ventes', c1desc: 'Analyse quotidienne, hebdomadaire et mensuelle',
      c2: 'Rapport du Stock', c2desc: 'État du stock et mouvement des pièces',
      c3: 'Rapport des Bénéfices', c3desc: 'Bénéfices et pertes',
      c4: 'Rapport des Clients', c4desc: 'Analyse de la base clients',
      dailySales: 'Ventes Quotidiennes', categoryDist: 'Ventes par Catégorie',
      bestSellers: 'Meilleures Ventes', brandSales: 'Ventes par Marque',
      dailyBreakdown: 'Détail Quotidien',
      period: 'Période:', exportPDF: 'Exporter PDF',
      period7: '7 Derniers Jours', period30: '30 Derniers Jours', period90: '3 Derniers Mois',
      period365: 'Dernière Année', periodAll: 'Tout',
      noSales: 'Aucune vente', profit: 'Bénéfice',
      returnsPieces: 'Retours (pièces)', pieces: ' pièces',
      reportTitle: 'Rapport des Ventes et Retours',
      periodLabel: 'Période:', totalSales: 'Ventes Totales: ',
      totalProfit: 'Bénéfice Total: ', salesInvoiceCount: 'Factures de vente: ',
      returnsCount: 'Nombre de retours: ', netSales: 'Ventes Nettes: ',
      dailyDetails: 'Détail quotidien:', invoicesWord: ' factures',
      period2: 'Période:', thisWeek: 'Cette Semaine', thisMonth: 'Ce Mois', thisYear: 'Cette Année', custom: 'Personnalisé', specificDay: 'Jour Spécifique',
      from: 'Du:', to: 'Au:', date2: 'Date:', totalSales2: 'Ventes Totales', invoices2: 'factures', pieces2: 'pièces',
      profit2: 'Bénéfice', paid2: 'Payé', remaining2: 'Reste', returnCount: 'Nombre de Retours', value: 'Valeur',
      netSales2: 'Ventes Nettes', returnRatio: 'Taux de Retour', profitMargin: 'Marge Bénéficiaire',
      totalProfitMargin: 'Marge Bénéficiaire Totale', ratioLabel: 'Taux', allTimeLabel: 'Total Global',
      salesVsReturns: 'Ventes vs Retours', net: 'Net', dailySalesVsReturns: 'Ventes vs Retours Quotidiens',
      salesTrend: 'Tendance des Ventes', returnsTrend: 'Tendance des Retours', salesByCategory: 'Ventes par Catégorie',
      returnsByReason: 'Retours par Raison', topProducts: 'Meilleurs Produits',
      productCol: 'Produit', barcodeCol: 'Code-barres', qtySoldCol: 'Qté Vendue', totalCol: 'Total', profitCol: 'Bénéfice',
      dailyDetail2: 'Détail Quotidien Ventes & Retours', dateCol: 'Date',
      salesInvoicesCol: 'Factures de Vente', piecesSoldCol: 'Pièces Vendues', salesValueCol: 'Valeur des Ventes',
      returnsCol: 'Retours', piecesReturnedCol: 'Pièces Retournées', netDayCol: 'Net du Jour',
    },
    reportsNet: {
      title: 'Compte Net', period: 'Période :', year: 'Année :', specificDate: 'Date Précise',
      range: 'Plage', sales: 'Total des Ventes', purchases: 'Total des Achats',
      expenses: 'Total des Dépenses', profit: 'Bénéfice Net',
      periodDebt: 'En attente (Période)', currentDebt: 'En attente (Actuel)',
      customerDebt: 'Dû à nous', supplierDebt: 'Nous devons',
      periodMargin: 'Marge de la Période', totalMargin: 'Marge Totale',
    },
    zakat: {
      title: 'Calcul de la Zakat', sub: 'Zakât des biens commerciaux et de la trésorerie selon la doctrine de la majorité',
      nisabLabel: 'Valeur du Nisab pour cette année (DA)', nisabYear: 'Année',
      nisabHint: 'Saisir manuellement selon le cours local de l\'or/argent ou la devise',
      result: 'Zakat due', resultSub: 'Le quart de la dixième (2,5 %) de la base nette',
      noNisab: 'Saisir d\'abord la valeur du Nisab pour déterminer l\'obligation',
      payable: 'Vous devez verser', noZakat: 'Pas de Zakât — la base n\'atteint pas le Nisab',
      deficit: 'Manquant pour atteindre le Nisab', reached: 'La base atteint le Nisab — la Zakat est due',
      payNow: 'Verser la Zakât', noAmount: 'Atteindre d\'abord le Nisab pour activer le versement',
      payConfirm: 'Le montant de la Zakât pour l\'année {year} (DA {amount}) sera enregistré comme dépense dans le journal des dépenses et déduit du compte de clôture, en tant que bien sortant de votre dette. Êtes-vous sûr ?',
      paySuccess: 'La Zakât de l\'année {year} a été enregistrée comme dépense.',
      alreadyPaid: 'La Zakât de l\'année {year} est déjà enregistrée dans les dépenses — le versement ne peut pas être doublé pour la même année.',
      stat1: 'Valeur du stock (prix du marché)', stat2: 'Liquidité espèces', stat3: 'Comptes (CCP / Banque)',
      stat4: 'Créances (dettes recouvrables)', stat5: 'Dettes fournisseurs (exigibles)',
      stat6: 'Base nette', stat7: 'Valeur du Nisab',
      stat8: 'Fonds chez les fournisseurs (dus à nous)', stat9: 'Avoirs des clients (dus à rembourser)',
      lqTitle: 'Détail espèces et comptes', lqSub: 'Entrées moins sorties (depuis le début) + ajustement manuel',
      lqCashIn: 'Espèces reçues', lqCashOut: 'Espèces versées', lqNetCash: 'Net espèces',
      lqCcpIn: 'CCP reçu', lqCcpOut: 'CCP versé', lqNetCcp: 'Net CCP',
      lqAdj: 'Ajustement manuel (solde d\'ouverture / retraits non enregistrés)', lqTotal: 'Liquidité totale',
      lqNote: 'L\'ajustement manuel est sauvegardé localement uniquement pour cette année.',
      invTitle: 'Détail du stock — valorisé au prix du marché (détail)',
      invSub: 'Prix unitaire de vente de chaque produit, indépendamment du coût d\'achat, conformément à la majorité des juristes',
      invColProduct: 'Produit', invColQty: 'Qté', invColBasis: 'Base',
      invColPrice: 'Prix (DA)', invColValue: 'Valeur (DA)', invBasisRetail: 'Détail',
      invTotal: 'Total stock', invEmpty: 'Aucun stock à valoriser',
      debtTitle: 'Dettes', debtCustomers: 'Créances clients (recouvrables)',
      debtSuppliers: 'Dettes fournisseurs (exigibles)', debtColName: 'Nom', debtColBalance: 'Solde (DA)',
      debtAtSuppliers: 'Fonds chez les fournisseurs (avances / trop-perçus)', debtOwedCustomers: 'Acomptes clients détenus (à restituer)',
      debtTotal: 'Total', debtEmpty: 'Aucune',
      debtNote: 'S\'ajoutent à la base : créances clients et fonds chez les fournisseurs (soldes fournisseurs négatifs). Se déduisent : dettes fournisseurs exigibles et acomptes clients détenus (soldes clients négatifs).',
      methodTitle: 'Méthode de calcul', methodRule: 'Principe juridique appliqué',
      methodB1: 'Le stock est valorisé au prix du marché (prix de vente), pas au coût d\'achat — valeur courante du commerce.',
      methodB2: 'Les bénéfices en espèces et en nature sont déjà inclus implicitement ; ils ne sont pas ajoutés deux fois.',
      methodB3: 'Les créances recouvrables (clients) et les fonds chez les fournisseurs s\'ajoutent ; les dettes exigibles et les acomptes clients détenus se déduisent.',
      methodB4: 'La Zakat est payée au taux de 2,5 % sur la base nette entière dès que le Nisab est atteint.',
      methodProfit: 'Bénéfice net de référence (selon Compte Net) :',
      methodProfitNote: 'Affiché à titre indicatif ; il est déjà inclus dans le stock et la trésorerie ci-dessus.',
      print: 'Imprimer le rapport', reportTitle: 'Rapport de calcul de la Zakat', reportDate: 'Date d\'édition',
      countBtn: 'Inventaire', countSub: 'Comptez les quantités physiques et comparez-les aux quantités système ; seules les lignes différentes sont corrigées à l\'enregistrement.',
      countSearch: 'Rechercher par nom ou code-barres...', countAdd: 'Ajouter', countAddAll: 'Ajouter tous les produits',
      countClear: 'Vider la liste', countClearConfirm: 'Toute la liste d\'inventaire sera vidée. Continuer ?',
      countColProduct: 'Produit', countColSystem: 'Qté système', countColActual: 'Qté réelle',
      countColDiff: 'Écart', countColRemove: 'Supprimer',
      countEmpty: 'Aucun produit ajouté. Recherchez et ajoutez des produits, ou utilisez « Ajouter tous les produits ».',
      countNoResults: 'Aucun résultat', countAlreadyAdded: 'Ce produit est déjà dans la liste.',
      countRows: 'Lignes', countDiffs: 'Lignes différentes',
      countSave: 'Enregistrer l\'inventaire', countPrint: 'Imprimer la feuille d\'inventaire',
      countNoChanges: 'Aucun écart à enregistrer — les quantités réelles correspondent au système.',
      countConfirm: 'Les quantités de {n} produit(s) seront corrigées en stock. Aucune dépense ni vente n\'est enregistrée. Continuer ?',
      countSaved: 'Inventaire enregistré et {n} produit(s) corrigé(s).',
      countNoPermission: 'Inventaire non autorisé — réservé au gestionnaire.',
      countFixedNote: 'Produit non quantifié — non valorisé dans la zakat',
      countSheetTitle: 'Feuille d\'inventaire', countDate: 'Date d\'inventaire',
      countSign: 'Signature du compteur', countSignManager: 'Signature du gestionnaire',
    },
    backup: {
      title: 'Sauvegarde', sub: 'Gérer les Sauvegardes',
      c1: 'Créer une Sauvegarde', c1desc: 'Enregistrer une copie de la base',
      c1btn: '<i class="fas fa-save"></i> Exporter',
      c2: 'Restaurer une Sauvegarde', c2desc: 'Restaurer les données depuis une sauvegarde',
      c2btn: '<i class="fas fa-upload"></i> Importer',
      prevTitle: 'Sauvegardes Précédentes',
      empty: 'Aucune sauvegarde précédente',
      restore: 'Restaurer', creating: 'Création de la sauvegarde...',
      operationCancelled: 'Opération annulée',
      createSuccess: '✓ Sauvegarde créée — ',
      createFailed: '✗ Échec de la sauvegarde: ',
      readingFile: 'Lecture du fichier...',
      readFileFailed: '✗ Échec de lecture: ',
      invalidFile: '✗ Fichier invalide — aucune donnée',
      restoreConfirm: 'Restaurer la sauvegarde?',
      store: 'Magasin: ', date: 'Date: ',
      content: 'Contenu:\n',
      products: 'Produits', invoices: 'Factures',
      customers: 'Clients', suppliers: 'Fournisseurs',
      payments: 'Paiements', returns: 'Retours',
      discounts: 'Remises', unknown: 'Inconnu',
      dataWarning: '⚠️ Toutes les données actuelles seront remplacées!',
      restoreCancelled: 'Restauration annulée',
      restoreSuccess: '✓ Données restaurées. Rouvrez les pages pour actualiser.',
      restoreError: '✗ Erreur: ',
      readFileFailed2: '✗ Échec de lecture: ',
      invalidFile2: '✗ Fichier invalide',
      restoreFromFileConfirm: 'Restaurer',
      restoreFromFileWarning: 'Toutes les données actuelles seront remplacées.',
      restoreFromFileSuccess: '✓ Restauré depuis ',
      restoreTitle: 'Restaurer la sauvegarde',
      retagLabel: 'Ré-étiqueter les données avec le code actuel',
      retagHint: 'Activez uniquement si la sauvegarde provient d\'un magasin avec un code différent. Une fois activé, les enregistrements restaurés (produits, factures, commandes...) sont ré-étiquetés avec le code du magasin actuel afin d\'apparaître dans l\'interface.',
      retagWarn: 'Remarque: l\'activation attribue les données de l\'ancien magasin au magasin actuel. Laissez désactivé si la sauvegarde provient du même magasin.',
      retagCurrent: 'Code du magasin actuel:',
      restoreSuccessRetag: '✓ Données restaurées et ré-étiquetées avec le code actuel. Rouvrez les pages pour actualiser.',
      restoreFromFileSuccessRetag: '✓ Restauré et ré-étiqueté depuis ',
      deleteAllConfirm: '⚠️ Supprimer toutes les données?',
      deleteAllDetails: 'Tous les produits, factures, clients, fournisseurs, paiements, retours et remises seront effacés.',
      deleteAllWarning: 'Cette action est irréversible!',
      deleteAllBackupHint: 'Créez une sauvegarde avant de continuer.',
      deleteAllFinalConfirm: 'Confirmation finale: Supprimer toutes les données?\\nImpossible de restaurer sans sauvegarde.',
      deleteAllDone: '✓ Données effacées. Utilisez "Restaurer" pour récupérer.',
      clearData: 'Effacer les Données', clearDataDesc: 'Effacer toutes les données de l\\\'application — utilisé pour tester la restauration de sauvegarde',
      deleteAllBtn: 'Supprimer Toutes les Données',
    },
    sharedInventory: {
      title: 'Stock Partagé', sub: 'Afficher le stock du magasin principal et des succursales',
      searchAll: 'Rechercher Tous les Magasins', searchAllPlaceholder: 'Recherchez par nom ou code-barres pour trouver quel magasin a le produit...',
      loading: 'Chargement des données...', backToList: 'Retour à la Liste',
    },
    migration: {
      title: 'Importer depuis un ancien programme', cardTitle: 'Importer depuis un ancien programme',
      cardDesc: 'Importer les données depuis un autre programme (CSV, Excel, bases de données...)',
      cardBtn: 'Importer depuis un ancien programme',
      dropHere: 'Glissez-déposez un fichier ici ou cliquez pour parcourir',
      supportedFormats: 'Supporte : CSV, Excel, JSON, XML, SQL, SQLite (.db), dBASE (.dbf), Firebird (.fdb), Sable Stock (.gssp/.zgssp), tout texte',
      reading: 'Lecture du fichier...', readError: 'Erreur de lecture du fichier',
      selectTable: 'Sélectionnez la table contenant vos pièces :',
      preview: 'Aperçu des données', columns: 'colonnes',
      mapColumns: 'Correspondance des colonnes',
      mapHint: 'Auto-correspondance tentative — vérifiez et ajustez si nécessaire',
      noMapping: 'Pas de correspondance',
      back: 'Retour', next: 'Suivant',
      totalRows: 'Total des lignes :', mappedFields: 'Champs correspondants :',
      moreRows: 'lignes supplémentaires...',
      importBtn: 'Importer les Données',
      needNameOrBarcode: 'Au moins le nom du produit ou le code-barres doit être mappé',
      importing: 'Importation...', importSuccess: 'Importation terminée avec succès',
      productsImported: 'produits importés', importError: "Erreur d'importation",
      cannotRead: 'Impossible de lire le fichier', parseError: "Erreur d'analyse du fichier",
      forceTypeLabel: 'Type de fichier (manuel) :', forceAuto: 'Automatique (type détecté)',
      forceTypeHint: 'Laissez « Automatique » en temps normal — ne changez que si le programme ne reconnaît pas une ancienne sauvegarde.',
      engineHintSql: 'L’opération SQL Server (LocalDB) n’a pas pu aboutir — consultez le détail ci-dessous ; si nécessaire, vérifiez les droits administrateur et la présence de SqlLocalDB.msi dans l’installateur',
      engineHintFirebird: 'Impossible de démarrer le moteur Firebird — vérifiez la présence de gbak.exe, fbclient.dll et du runtime VC++ dans l’installateur',
      engineHintSqlite: 'Impossible de charger le moteur SQLite (sql.js) — vérifiez que l’installation est complète',
      engineHintGeneric: 'Impossible d’ouvrir le fichier avec le type détecté — essayez de choisir le type manuellement',
      unsupportedDbType: 'Ce type de base de données nécessite une exportation manuelle',
      exportHint: 'Exportez les données depuis votre ancien programme en CSV ou Excel, puis réessayez',
      aiAnalyzing: 'Analyse IA en cours...',
      aiError: 'Erreur IA',
      aiDone: 'Analyse IA terminée',
      aiAnalyzed: 'Analysé par IA',
      chooseMode: 'Choisir la méthode de traitement',
      modeHint: 'Le traitement local est rapide et utilise la correspondance automatique. Le traitement IA analyse intelligemment les données pour comprendre le texte non structuré.',
      localMode: 'Traitement local',
      localHint: 'Correspondance automatique rapide',
      aiMode: "Traitement IA",
      aiHint: 'Analyse intelligente via votre fournisseur IA',
      aiRequiresKey: '* Le traitement IA nécessite une clé API configurée dans Paramètres',
      mssqlNoPath: 'Impossible d’accéder au chemin du fichier de sauvegarde',
      mssqlOpenError: 'Impossible d’ouvrir la sauvegarde SQL Server (.bak)',
      mssqlNoTables: 'Aucune table lisible trouvée dans la sauvegarde SQL Server',
      firebirdNoPath: "Impossible d'accéder au chemin du fichier de base Firebird",
      firebirdNoTables: 'Aucune table lisible trouvée dans la base de données',
      firebirdOpenError: "Impossible d'ouvrir la base de données Firebird",
      firebirdTableError: 'Impossible de lire la table',
      selectRole: 'Que contient cette table ?',
      roleHint: 'Choisissez le type de données pour une importation correcte',
      roleProducts: 'Pièces / Produits',
      roleCustomers: 'Clients',
      roleSuppliers: 'Fournisseurs',
      needName: 'Au moins le champ nom doit être mappé',
      importDone: 'Importation terminée avec succès',
      roleSalesInvoices: 'Factures de Vente',
      rolePurchaseInvoices: "Factures d'Achat",
      importedNote: 'Importé',
      oldInvoiceNote: 'Facture importée',
      oldPaymentNote: 'Paiement importé',
      restoringBackup: 'Restauration de la sauvegarde (gbak)...',
      preparingEngine: 'Préparation du moteur SQL Server...',
      rolePayments: 'Paiements',
      loadingBrands: 'Lecture des marques...',
      brandEmpty: 'Sans marque',
      fullImportPanelTitle: 'Importation complète des données',
      fullImportPanelDesc: 'Base Sable Stock / Gestion Stock détectée — vous pouvez tout importer en une fois : clients, fournisseurs, produits avec prix, factures et avoirs.',
      fullImportBtn: 'Importation complète',
      fullImportPopupTitle: 'Choisir les marques à importer',
      fullImportPopupHint: 'Sélectionnez les marques dont vous voulez importer les produits. Les produits sans marque sont toujours importés.',
      selectAll: 'Tout sélectionner',
      cancelImport: 'Annuler',
      confirmImport: 'Démarrer l\\\'importation',
      creatingBackup: 'Création d\\\'une sauvegarde avant importation...',
      productsNone: 'Aucun produit importé (vérifiez la sélection des marques)',
      markBackfilled: 'Marque restaurée pour les produits existants',
      fullImportDone: 'Importation complète terminée',
      gsspReading: 'Ouverture de la sauvegarde Sable Stock...',
      gsspNotSable: "Ce fichier n'est pas une sauvegarde Sable Stock valide",
      gsspBadPassword: 'Impossible d’ouvrir la sauvegarde Sable Stock — mot de passe de sauvegarde inconnu pour cette version',
      gsspPanelDesc: 'Une sauvegarde Sable Stock (GSSP) a été détectée — tout peut être importé en une fois : clients, fournisseurs, produits avec prix, factures de vente, ventes au comptant et paiements, avec leurs dates réelles.',
      gsspSaleLine: 'Vente',
      gsspCashLine: 'Vente au comptant',
      gsspCashLabel: 'Facture comptant',
      gsspInvoiceNote: 'Facture Sable Stock',
      gsspCashNote: 'Facture comptant Sable Stock',
      gsspPaymentNote: 'Paiement Sable Stock',
      gsspSkipped: 'déjà présent',
      returnsCount: 'Retours',
      avoirReason: 'Retour (Avoir)',
      walkin: 'Client de passage',
      dispatchNote: 'Note du bon d\'envoi', dispatchNotePlaceholder: 'Note imprimée sur le bon d\\\'envoi...',
    },
    brandCat: { brand: 'Marque', category: 'Choisir le Type de Pièce', searchPlaceholder: 'Rechercher un type...', addProduct: 'Ajouter Produit', noCategories: 'Aucune catégorie pour le moment', addCategory: 'Ajouter une catégorie', products: 'produits' },
    catProducts: { title: 'Produits', sub: 'Produits Disponibles', searchPlaceholder: 'Rechercher un produit...', addProduct: 'Ajouter Produit', empty: 'Aucun produit dans cette catégorie', addInvoiceTitle: 'Ajouter un Produit à la Facture', scanPlaceholder: 'Scannez le code-barres...', scannerReady: 'Prêt à scanner', searchProduct: 'Rechercher un produit', newProduct: 'Nouveau Produit', searchExisting: 'Rechercher par nom ou code-barres', searchExistingPlaceholder: 'Nom du produit ou code-barres...', name: 'Nom du Produit', namePlaceholder: 'Nom de la pièce', barcode: 'Code-barres', barcodePlaceholder: 'Entrez le code-barres', generate: 'Générer', qty: 'Quantité', buyPrice: 'Prix d\'Achat', sellPrice: 'Prix de Vente', supplier: 'Fournisseur', supplierPlaceholder: 'Rechercher un fournisseur par nom...', cancel: 'Annuler', addToCart: 'Ajouter au Panier de Facture', cartTitle: 'Panier de Facture', total: 'Total:', clear: 'Vider',       confirmInvoice: 'Confirmer la Facture', fiscalStamp: 'Timbre Fiscal (Timbre Fiscal)', wholesalePrice: 'Prix de Gros' },
    settings: {
      title: 'Paramètres', sub: 'Paramètres de l\\\'Application',
      printSettingsBtn: 'Paramètres d\'impression',
      general: 'Paramètres Généraux',
      storeName: 'Nom du Magasin', currency: 'Devise', language: 'Langue', buttonSound: 'Sons des boutons', introSound: 'Son de début',
      productQR: 'Afficher les codes QR des produits', productQRHint: 'Une fois activé, un petit code QR apparaît sur les fiches produits (inventaire et vente). Désactivé par défaut et mémorisé sur cet appareil.',
      openIsolated: 'Ouvrir une fenêtre isolée', createShortcut: 'Raccourci bureau',
      isolatedHint: 'Ouvre la société dans une fenêtre et un processus séparés, avec des données entièrement isolées.',
      snapshotDone: 'Instantané de la société prêt.', snapshotError: 'Impossible de préparer l’instantané :',
      openDone: 'Fenêtre isolée ouverte.', openError: 'Impossible d’ouvrir la fenêtre isolée :',
      shortcutDone: 'Raccourci créé sur le bureau.', shortcutError: 'Impossible de créer le raccourci :',
      isolatedOnly: 'Cette fenêtre est dédiée à une seule société.',
      staleBuild: 'Cette version installée est ancienne et ne contient pas les fenêtres de société isolées. Fermez l’application et relancez la version mise à jour, ou installez la 3.3.6.',
      notif: 'Notifications de Stock Bas',       autoBackup: 'Sauvegarde Auto',
      info: 'À Propos',
      version: 'Version', developer: 'Développeur', company: 'Société', lastUpdate: 'Dernière Mise à Jour',
      invoiceLogo: 'Logo de l\'entreprise (factures)',
      logoUpload: 'Charger le logo de l\'entreprise', logoPreview: 'Aperçu du logo', logoRemove: 'Supprimer',
      logoLayout: 'Position, taille et opacité du logo', logoSize: 'Taille', logoOpacity: 'Opacité',
      logoLocalHint: 'Enregistré sur cet appareil uniquement — jamais envoyé au cloud.',
      logoPreviewHint: 'Voici comment le logo apparaîtra sur la facture imprimée.', logoPreviewBw: 'Noir et blanc',
      logoSaved: 'Logo de l\'entreprise enregistré', logoRemoved: 'Logo supprimé',
      logoImportFailed: 'Impossible d\'importer le logo', logoNone: 'Aucun logo chargé',
      logoRemoveConfirm: 'Supprimer le logo de l\'entreprise des factures ?',
    },
    chart: { sales: 'Ventes', inventory: 'Stock', returns: 'Retours' },
    connection: {
      title: 'Paramètres de Connexion', sub: 'Connexion cloud et gestion des magasins',
    },
    btn: {
      newInvoice: 'Nouvelle Facture', addPart: 'Ajouter Pièce', export: 'Exporter',
      addSupplier: 'Ajouter Fournisseur', addCustomer: 'Ajouter Client', addDiscount: 'Ajouter Remise',
      addReturn: 'Enregistrer Retour',
    },
    common: {
      save: 'Enregistrer', cancel: 'Annuler', delete: 'Supprimer', edit: 'Modifier', confirm: 'Confirmer',
      close: 'Fermer', print: 'Imprimer', loading: 'Chargement...', processing: 'Traitement...',
      noResults: 'Aucun résultat', empty: 'Vide', search: 'Rechercher',
      noPermission: 'Vous n\'avez pas la permission d\'effectuer cette action',
      noAccessHint: 'Vous n\\\'avez accès à aucune page. Contactez le gestionnaire.',
      page: 'Page', of: 'de', product: 'Produit', piece: 'Pièce', invoice: 'Facture',
      qty: 'Qté', total: 'Total', paid: 'Payé', remaining: 'Reste', debt: 'Dette',
      date: 'Date', name: 'Nom', status: 'Statut', actions: 'Actions',
      yes: 'Oui', no: 'Non', success: 'Succès', error: 'Erreur', warning: 'Attention',
      areYouSure: 'Êtes-vous sûr?', stock: 'Stock', price: 'Prix',
      addItem: 'Ajouter', removeItem: 'Retirer', clearCart: 'Vider le Panier',
      ready: 'Prêt', done: 'Fait', notFound: 'Introuvable', outOfStock: 'Rupture de stock',
      lowStock: 'Stock bas', new: 'Nouveau', provisional: 'Provisoire',
      paidFull: 'Totalement payé', paidPartial: 'Paiement partiel', unpaid: 'Impayé',
      manual: 'Manuel', customer: 'Client',
      back: 'Retour', pay: 'Payer', payFull: 'Payer Tout', searchAll: 'Tout Rechercher', refresh: 'Actualiser', confirmPay: 'Confirmer le Paiement',
      barcode: 'Code-barres', brand: 'Marque', category: 'Catégorie', supplier: 'Fournisseur',
      address: 'Adresse', phone: 'Téléphone', email: 'Email', username: 'Nom d\'utilisateur', password: 'Mot de passe',
      generate: 'Générer', fiscalStamp: 'Timbre Fiscal', cart: 'Panier', clear: 'Vider',
      subtotal: 'Sous-total', discount: 'Remise', totalAfterDiscount: 'Total Après Remise',
      payNow: 'Montant Payé', remainingDebt: 'Reste (Dette)', fullPayment: 'Paiement Complet', noPayment: 'Aucun Paiement',
      real: 'Réel', formal: 'Formel', customerDiscount: 'Remise Client', additionalDiscount: 'Remise Supplémentaire',
    },
    sales: {
      title: 'Ventes', sub: 'Créer une Nouvelle Facture de Vente',
      searchParts: 'Rechercher Pièces', searchPlaceholder: 'Rechercher par nom ou numéro...',
      emptySearch: 'Tapez pour rechercher des pièces',
      emptyResults: 'Aucun résultat', emptyProducts: 'Aucun produit',
      cart: 'Panier', cartEmpty: 'Le panier est vide', total: 'Total:',
      checkout: 'Finaliser',
      unavailable: 'Indisponible', lowStockTip: 'Stock bas',
      scannerReady: 'Prêt', scannerDone: 'Fait', scannerNotFound: 'Introuvable', scannerUnavailable: 'Indisponible',
      scannerMultiple: 'Plusieurs résultats — choisissez le produit dans la liste',
      noCustResults: 'Aucun résultat', discount: 'Remise',
      del: 'Supprimer',
      fullyPaid: 'Totalement payé', partialPay: 'Paiement partiel', enterPaid: 'Montant payé',
      cartEmptyAlert: 'Le panier est vide', notAvailableQty: 'Non disponible en quantité requise', available: 'Disponible:',
      paidExceedsTotal: 'Le montant payé ne peut pas dépasser le total',
      fullPaymentNote: 'Paiement complet à la vente', partialPaymentNote: 'Paiement partiel à la vente',
      overpayTitle: 'Montant payé supérieur au dû', overpayMsg: 'Le montant payé dépasse le total de la facture. Continuer et enregistrer l’excédent ?', overpayContinue: 'Continuer',
      creditWarn: 'Dépassement du plafond de crédit client', creditWarnMsg: 'Cette vente dépasserait le solde autorisé — continuer ?', creditLimit: 'Plafond de crédit', projectedBalance: 'Solde projeté après vente', creditContinue: 'Continuer la vente', creditBlocked: 'Dépassement du plafond de crédit — ajustez le panier ou choisissez un autre moyen de paiement', creditDebtMsg: 'Ce client doit régler ses dettes antérieures pour poursuivre cette opération',
      discountType: 'Client', discountManual: 'Manuel', lineDiscount: 'Remise ligne',
      clearCartConfirm: 'Vider le panier d\'achat?',
      customer: 'Client', customerPlaceholder: 'Rechercher un client...', unregistered: 'Client non enregistré', remove: 'Retirer',
      pickSubCustomer: 'Choisir un client secondaire',
      cartTitle: 'Panier', subtotal: 'Sous-total', customerDiscount: 'Remise Client', additionalDiscount: 'Remise Supplémentaire',
      totalLabel: 'Total', paidLabel: 'Montant Payé', payFull: 'Payer Tout', remainingLabel: 'Reste',
      clear: 'Vider', checkout: 'Finaliser', emptyCartTitle: 'Le Panier est Vide', emptyCartHint: 'Scannez le code-barres ou sélectionnez dans la liste',
      scanPlaceholder: 'Scannez le code-barres ou recherchez par nom...', searchPlaceholder2: 'Rechercher par nom ou code-barres...', productsCount: '0 produits', multiBatches: 'Plusieurs lots', mixedPrice: 'Prix mixte', unit: 'Unité', wholesale: 'Gros', unlimited: 'Illimité', freeBtn: 'Vendre un article non répertorié', freeTitle: 'Vendre un article non répertorié', freeHint: "Article sans fiche de stock : quantité et prix saisis à la main, aucun débit de stock.", freeName: 'Nom de l\'article (facultatif)', freeNamePh: 'Laisser vide pour « Article non répertorié »', freeQty: 'Quantité', freePrice: 'Prix unitaire', freeTotal: 'Total', freeAdd: 'Ajouter au panier', freeDefaultName: 'Article non répertorié', freeTag: 'Non répertorié', freeNoCost: 'Sans coût', freeQtyBad: 'Saisissez une quantité supérieure à zéro', freePriceBad: 'Saisissez un prix pour cet article',
      payMethod: 'Moyen de paiement', payCash: 'Espèces', payCcp: 'CCP', payBoth: 'Les deux',
      cashAmount: 'Montant espèces', ccpAmount: 'Montant CCP',
      marginBtn: 'Réglage marge', marginTitle: 'Marge minimale', marginHint: 'Calculée entre le prix affiché et le coût : aucun prix sous le minimum autorisé.',
      marginEnabled: 'Activer le minimum', marginRetail: 'Détail %', marginWholesale: 'Gros %', marginStore: 'Tout le magasin',
      marginRules: 'Exceptions (catégorie, marque ou produit)', marginScopeCat: 'Catégorie', marginScopeBrand: 'Marque', marginScopeProduct: 'Produit',
      marginPick: 'Choisir', marginAdd: 'Ajouter une exception', marginRemove: 'Supprimer', marginNone: 'Aucune exception',
      marginPwd: 'Mot de passe du magasin', marginPwdBad: 'Mot de passe incorrect', marginSaved: 'Réglages enregistrés',
      marginWarn: 'Ce prix est sous la marge minimale', marginMin: 'Minimum autorisé', marginContinue: 'Continuer', marginAccept: 'Utiliser le minimum',
    },
    orders: {
      title: 'Commandes', sub: 'Commander les pièces manquantes aux fournisseurs',
      tabMine: 'Mes commandes', tabBranches: 'Commandes des succursales',
      suggestions: 'Suggestions de stock faible', noSuggestions: 'Aucun produit en stock faible ou épuisé — parfait !',
      search: 'Rechercher par nom ou code-barres...',
      all: 'Tout', today: 'Aujourd\'hui', week: 'Semaine', month: 'Mois', year: 'Année',
      refresh: 'Actualiser',
      empty: 'Aucune commande pour le moment — ajoutez depuis les suggestions ou la recherche',
      statusPending: 'En attente', statusDone: 'Terminée', statusNotAvailable: 'Indisponible',
      btnDone: 'Terminée', btnNotAvailable: 'Indisponible', btnDelete: 'Supprimer',
      deleteConfirm: 'Supprimer cette commande ?',
      cloudRequired: 'Connexion cloud requise pour voir les commandes des succursales',
      loading: 'Chargement des commandes des succursales...',
      noBranchOrders: 'Aucune commande de succursale pour le moment',
    },
    invoices: {
      title: 'Factures', sub: 'Toutes les Factures',
      search: 'Rechercher une facture...', newInvoice: 'Nouvelle Facture', quickEntry: 'Saisie rapide', smartAdd: 'Ajout intelligent',
      col1: 'Facture #', col2: 'Date', col3: 'Client', col4: 'Montant', col5: 'Statut', col6: 'Actions',
      empty: 'Aucune facture', noMatch: 'Aucune facture correspondante',
      resultsInfo: ' factures',
      typeSale: 'Facture de Vente', typeSupplier: 'Facture Fournisseur', typeWaybill: 'Bon de Livraison',
      typeProforma: 'Facture Proforma', typeDispatch: 'Bon d\'Envoi', typeTransfer: 'Bon de Transfert',
      typeReception: 'Bon de Réception', typePurchase: 'Facture d\'Achat',
      newPaymentInvoice: 'Bon de caisse', typePayment: 'Bon de caisse',
      paymentInvoiceTitle: 'Nouveau bon de caisse',
      paymentInvoiceDesc: 'Enregistrer un encaissement reçu d\'un client ou d\'un fournisseur (revenu), ou un billet de dette fournisseur sans argent — mouvement de solde sans facture.',
      payFromCustomer: 'Encaisser client', payFromSupplier: 'Encaisser fournisseur', payToSupplier: 'Billet de dette fournisseur',
      supplierDebtNote: 'Billet de dette (sans encaissement — exclu du revenu)',
      payParty: 'Client / Fournisseur', payOutstanding: 'Solde actuel (dû)',
      payAmount: 'Montant du bon', payMethod: 'Mode de paiement', payNote: 'Observation (facultatif)',
      confirmPayment: 'Enregistrer', receivedLabel: 'Encaissé',
      selectPayCustomer: 'Choisir le client', selectPaySupplier: 'Choisir le fournisseur',
      payPartySearch: 'Rechercher un client ou un fournisseur...', noDebt: 'Aucune dette', owedOn: 'Dette (il nous doit)', owedFor: 'Crédit (nous lui devons)',
      customerBalance: 'Solde client', supplierBalance: 'Solde fournisseur',
      overpayWarn: 'Le montant dépasse le solde actuel — solde actuel du client :',
      chooseParty: 'Veuillez choisir un client ou un fournisseur', paymentInvoiceSaved: 'Bon {n} enregistré',
      cannotPayVoucher: 'Bon de caisse déjà réglé — aucun paiement à ajouter',
      cannotEditVoucher: 'Bon de caisse en lecture seule — modification impossible',
      custVoucherNote: 'Bon de caisse — règlement de solde sans facture',
      suppVoucherNote: 'Billet de dette fournisseur — mouvement de solde sans facture',
      suppReceiptNote: 'Encaissement fournisseur — règlement de solde sans facture',
      badgeProvisional: 'Provisoire',
      printReturnInvoice: 'Imprimer la facture de retour',
      returnNote: 'Note de retour',
      returnNoteHint: 'Cette facture comporte {count} retour(s) pour {amount} — imprimez la facture de retour pour voir les lignes retournées.',
      itemCount: 'articles', paidLabel: 'Payé', unpaidLabel: 'Impayé', remainingLabel: 'Reste',
      invCardProduct: 'Produit', invCardQty: 'Qté', invCardPrice: 'Prix', invCardDiscount: 'Remise', invCardTotal: 'Total', invCardMoreItems: 'autres articles',
      pageInfo: 'Page', allowPopups: 'Veuillez autoriser les popups pour l\'impression',
      cannotPayReception: 'Impossible d\\\'ajouter un paiement à une facture de réception',
      cannotPayProforma: 'Impossible d\\\'ajouter un paiement à une facture proforma',
      fullyPaidAlert: 'Facture entièrement payée', invalidAmount: 'Montant invalide',
      transferPayNote: 'Paiement sur facture de transfert', regularPayNote: 'Paiement via factures',
      paymentSaved: 'Paiement enregistré avec succès',
      cannotEditDispatch: 'Impossible de modifier le bon d\'envoi',
      cannotEditReception: 'Impossible de modifier la facture de réception',
      cannotEditProformaWaybill: 'Impossible de modifier le bon de livraison provisoire',
      noPermission: 'Vous n\\\'êtes pas autorisé à consulter cette facture',
      editTitle: 'Modifier la Facture',
      editHelpSupplier: 'Facture fournisseur: augmentation du stock et du solde fournisseur.',
      addFromScratch: 'Ajouter de zéro',
      qeUndoRemove: 'Annuler',
      addFromScratchConflict: 'Conflit de code-barres: un autre produit avec le même code-barres a des détails différents',
      editHelpCustomer: 'Modifier quantités, prix unitaire et remise par ligne. Augmentation déduit du stock, diminution retourne au stock. Total calculé automatiquement = (prix × qté) − remise.',
      scanPlaceholder: 'Scannez le barcode ou tapez le nom...',
      editColProduct: 'Produit', editColCurrentQty: 'Qté Actuelle', editColNewQty: 'Nouvelle Qté',
      editColDiscount: 'Remise', editColLineTotal: 'Total Ligne',
      saveEdits: 'Enregistrer', cancelEdit: 'Annuler',
      scanDone: 'Fait', scanReady: 'Prêt', scanNotFound: 'Introuvable', resultCount: 'résultat',
      availableStock: 'Disponible:', notInStock: 'Pas en stock', badgeNew: 'Nouveau',
      cannotBelowZero: 'Impossible de mettre "..." à moins de zéro',
      insufficientStock: 'Stock insuffisant pour "..."',
      noQtyChanged: 'Aucune quantité modifiée',
      noChangesMade: 'Aucun changement effectué',
      invoiceEdited: 'Facture modifiée avec succès',
      deleteConfirm: 'Supprimer cette facture? Les produits seront retournés au stock.',
      cannotDeleteReception: 'Impossible de supprimer la facture de réception',
      cannotDeleteSold: 'Impossible de supprimer - le produit "..." a été vendu',
      invoiceDeleted: 'Facture supprimée',
      transferEditTitle: 'Modifier la Facture de Transfert',
      transferEditHelp: 'Modifier les quantités. Augmentation réduit votre stock, diminution l\\\'augmente.',
      currentTotal: 'Total Actuel:', editColSellPrice: 'Prix Vente',
      newTotal: 'Nouveau Total:', diff: 'Différence:',
      paidEditLabel: 'Montant payé', paidEditHint: 'Modifiez le montant payé en espèces ; le solde du tiers, le compte net, les dépenses, les ventes et la marge sont mis à jour automatiquement.',
      paidEditNote: 'Montant payé corrigé', paidEditRemaining: 'Restant :', paidEditCredit: 'Solde créditeur',
      deleteLine: 'Supprimer la ligne', addFreeLine: 'Ajouter une ligne manuelle',
      freeLineBadge: 'Ligne manuelle', freeLineNamePlaceholder: 'Nom de l\'article (sans produit en stock)',
      freeLineNameRequired: 'Saisissez le nom de la ligne manuelle', freeLineQtyRequired: 'La quantité de la ligne manuelle doit être supérieure à zéro',
    },
    inventory: {
      title: 'Stock', sub: 'Gérer le Stock de Pièces',
      search: 'Rechercher dans le stock...', add: 'Ajouter Pièce', export: 'Exporter',
      col1: 'Code', col2: 'Nom Pièce', col3: 'Marque', col4: 'Quantité', col5: 'Prix Achat', col6: 'Prix Vente', col7: 'Actions',
      empty: 'Le stock est vide',
      customizeBtn: 'Personnaliser les boutons', customizeTitle: 'Personnaliser les boutons d’inventaire',
      customizeHint: 'Choisissez les boutons à afficher sur la page d’inventaire. Votre choix est enregistré automatiquement sur cet appareil.',
      customizeShowAll: 'Tout afficher',
      transferBranch: 'Transférer vers un autre magasin',
      transferMain: 'Transférer vers les succursales',
      scannerReady: 'Prêt à scanner', scannerProcessing: 'Traitement...',
      scannerFound: 'Trouvé:', scannerDone: 'Scan terminé',
      scannerNewBarcode: 'Nouveau produit - Barcode', scannerNew: 'Nouveau produit',
      noResults: 'Aucun résultat',
      enterName: 'Veuillez entrer le nom du produit', enterBarcode: 'Veuillez entrer le barcode',
      clearCartConfirm: 'Vider le panier?', cartEmpty: 'Le panier est vide',
      invoiceSaved: 'Facture enregistrée pour', fiscalStamp: 'Timbre fiscal',
      includes: 'inclut', productUnit: 'produits', pieceUnit: 'pièces',
      editLabelName: 'Nom du Produit', editLabelBarcode: 'Barcode', editLabelBrand: 'Marque',
      editLabelCategory: 'Catégorie', editLabelQty: 'Quantité', editLabelBuyPrice: 'Prix Achat', editLabelSellPrice: 'Prix Vente', editLabelWholesale: 'Prix de Gros',
      editTitle: 'Modifier le Produit',
      diagnoseBtn: 'Diagnostic', diagTitle: 'Rapport de diagnostic du produit',
      diagDuplicateYes: 'Doublon : plusieurs fiches pour le même produit', diagDuplicateNo: 'Aucun doublon (fiche unique)',
      diagGroupCount: 'Fiches partageant cette identité/code-barres',
      diagVerdictLabel: 'Cause probable', diagVerdictSingle: 'Fiche unique (aucun doublon)',
      diagVerdictSplit: 'Séparation intelligente : écart de prix/coût/péremption — comportement voulu',
      diagVerdictIndependent: 'Doublon indépendant : identité identique mais créée deux fois (cache obsolète / seconde fenêtre ou chemin différent)',
      diagVerdictIdentity: 'Un champ d\'identité diffère (nom/marque/référence/pays/marque) — traités comme deux produits différents',
      diagScope: 'Portée actuelle', diagCompany: 'Société :', diagStore: 'Magasin :',
      diagInScope: 'dans la portée', diagOutScope: 'hors portée',
      diagSupplierDiff: 'Le fournisseur diffère entre les fiches — cela explique une fiche avec fournisseur et une sans.',
      diagSupplierSame: 'Le fournisseur est identique sur toutes les fiches.',
      diagCreated: 'Créée', diagSource: 'Source', diagSupplier: 'Fournisseur', diagQty: 'Qté',
      diagBuy: 'Achat', diagSell: 'Vente', diagRealCost: 'Coût réel',
      diagSplitReason: 'Raison de séparation', diagSplitFrom: 'séparée de', diagCurrent: 'actuelle', diagNone: 'aucun',
      diagIdentityDiff: 'Identité différente',
      diagQtyCheck: 'Vérification des quantités', diagGroupQty: 'Qté totale des fiches', diagPurchaseQty: 'Qté des factures d\'achat', diagPurchaseLines: 'Lignes d\'achat',
      diagQtyOk: 'La quantité correspond aux factures d\'achat.', diagQtyMismatch: 'La quantité ne correspond pas aux factures d\'achat — double saisie ou modification manuelle possible.',
      diagAudit: 'Journal des opérations de ce produit', diagNoAudit: 'Aucune opération enregistrée pour ce produit.', diagReason: 'Raison',
      diagHint: 'Deux fiches au même code-barres = séparation intelligente (écart de prix/coût) ou création indépendante. Voir la colonne « Raison de séparation » et la source.',
      diagNotFound: 'Produit introuvable.',
      deleteConfirm: 'Êtes-vous sûr de vouloir supprimer ce produit?',
      importSuccess: 'Importé', importSuccessEnd: 'produits avec succès',
      importCost: 'Coût d\\\'achat:', importRecorded: 'Enregistré dans le compte net',
      importFailed: 'Échec de l\\\'import. Vérifiez le format du fichier.',
      addWithInvoice: 'Ajouter Stock + Facture', transferBtn: 'Transférer Produits', exportExcel: 'Exporter Excel', exportXlsxTitle: 'Exporter le stock vers Excel', exportWithBuy: 'Exporter avec le prix d’achat', exportWithoutBuy: 'Exporter sans le prix d’achat', exportExcludeZero: 'Exclure les produits à quantité zéro', exportExcludeZeroHint: 'Votre choix est mémorisé pour les prochains exports', exportSkippedZero: 'Produits à quantité zéro exclus :', exportSheetTitle: 'Liste du stock', exportDate: 'Date d’exportation', exportCount: 'Nombre de produits', exportBy: 'Par', exportTotal: 'Total', noExport: 'Aucune donnée à exporter', exportSuccess: 'Exportation réussie', exportError: 'Erreur lors de la sauvegarde : ', colName: 'Nom du produit', colBarcode: 'Code-barres', colBrand: 'Marque', colMark: 'Modèle', colReference: 'Référence', colCountry: 'Pays d’origine', colStorage: 'Emplacement de stockage', colQty: 'Quantité', colBuyPrice: 'Prix d’achat', colSellPrice: 'Prix de vente', colWholePrice: 'Prix de gros', colExpiry: 'Date d’expiration', exportCSV: 'Exporter CSV', importCSV: 'Importer CSV / Excel', addDirect: 'Ajouter un produit sans facture', addDirectTitle: 'Ajouter un produit sans facture', addDirectBtn: 'Ajouter le produit au stock', addDirectHint: 'Le produit est ajouté directement au stock sans créer de facture d’achat. Prix d’achat optionnel.', barcodeConflict: 'Ce code-barres est enregistré pour un autre produit', invalidBarcode: 'Code-barres invalide', entryDestination: 'Direction de l’écriture financière (prix d’achat × quantité)',
      addTitle: 'Ajouter Stock + Facture', scanPlaceholder2: 'Scannez le code-barres...',
      searchExisting: 'Rechercher un produit existant (par nom ou code-barres)', searchExistingPlaceholder: 'Nom du produit ou code-barres...',
      category: 'Catégorie', name: 'Nom du Produit', barcode: 'Code-barres', generate2: 'Générer',
      qty: 'Quantité', buyPrice: 'Prix Achat', sellPrice: 'Prix Vente', wholesalePrice: 'Prix de Gros', supplierOptional: 'Fournisseur (optionnel)',
      supplierSearchPlaceholder: 'Rechercher un fournisseur...', addToCart: 'Ajouter au Panier',
      invoiceCart: 'Panier de Facture', fiscalStamp2: 'Timbre Fiscal', totalLabel: 'Total:',
      clear2: 'Vider', confirmInvoice: 'Confirmer la Facture', categoryCol: 'Catégorie',
      quickAdd: 'Ajouter Produit Fixe', quickAddTitle: 'Ajouter Produit Fixe', quickAddHint: 'Produit fixe (ex. plats de restaurant) : ajouté directement sans quantité, sans prix d’achat et sans facture.', quickAddNamePlaceholder: 'Exemple : Grand Burger', quickAddBtn: 'Ajouter le produit', quickAddSuccess: 'Produit ajouté avec succès', quickAddUpdated: 'Prix du produit mis à jour', optional: '(optionnel)', invalidSell: 'Entrez un prix de vente valide',
    },
    transfer: {
      loading: 'Chargement...', chooseDest: 'Choisir la destination', mainStore: 'Magasin Principal',
      loadError: 'Erreur de chargement des destinations',
      scannerProcessing: 'Traitement...', scannerFound: 'Trouvé:', scannerDone: 'Scan terminé',
      scannerNotFound: 'Aucun produit avec ce barcode', scannerNotInStock: 'dans votre stock', scannerNotFoundShort: 'Introuvable',
      noResults: 'Aucun résultat', stock: 'Stock:',
      selectDestFirst: 'Veuillez choisir la destination d\'abord',
      searchFirst: 'Veuillez rechercher un produit d\'abord', qtyZero: 'La quantité doit être supérieure à zéro',
      qtyExceeds: 'La quantité demandée', qtyExceedsAvail: 'dépasse la disponibilité',
      buyPriceZero: 'Le prix d\\\'achat doit être supérieur à zéro',
      donationLabel: 'Envoyer les produits gratuitement (don)',
      donationWarning: 'Attention: la facture de transfert affichera un solde de 0, et la facture de réception affichera aussi un solde de 0 pour le destinataire.',
      donationNote: 'Don (transfert gratuit)',
      available: 'Disponible:',
      clearCartConfirm: 'Vider le panier de transfert?', scannerReady: 'Prêt à scanner',
      selectDest: 'Veuillez choisir la destination', cartEmpty: 'Le panier de transfert est vide',
      paidExceedsTotal: 'Le montant payé ne peut pas dépasser le total',
      confirmTitle: 'Confirmer le Transfert:', confirmFrom: 'De:', confirmTo: 'Vers:',
      confirmProducts: 'Produits:', confirmTotal: 'Total:', confirmPaid: 'Payé:', confirmRemaining: 'Reste (Dette):',
      confirmContinue: 'Voulez-vous continuer?',
      productNotFound: 'Produit "..." introuvable en stock',
      stockLessThanNeeded: 'Stock insuffisant pour "..."',
      payNote: 'Paiement - Transfert vers',
      transferSuccess: 'Facture de transfert créée avec succès!',
      transferredProducts: 'Produits transférés:', transferTotal: 'Total:',
      transferPaid: 'Payé:', transferRemaining: 'Reste (Dette):',
      transferError: 'Erreur lors du transfert:',
      sub: 'Transférer des produits entre magasins avec suivi des dettes',
      senderStore: 'Magasin Envoyeur', destination: 'Destination',
      chooseDestination2: '-- Choisir la Destination --', selectDestination: 'Sélectionner le magasin de destination',
      scanPlaceholder2: 'Scannez le code-barres...', searchExisting: 'Rechercher un produit en stock (par nom ou code-barres)',
      searchPlaceholder2: 'Nom du produit ou code-barres...', productDataTitle: 'Données du Produit pour Transfert',
      productName: 'Nom du Produit', availableQty: 'Qté Disponible', transferQty: 'Qté à Transférer',
      buyPrice: 'Prix Achat', sellPrice2: 'Prix Vente', brand2: 'Marque', category2: 'Catégorie',
      addToCart2: 'Ajouter au Panier de Transfert', transferCart: 'Panier Facture de Transfert', totalLabel2: 'Total:',
      clear3: 'Vider', paymentSection: 'Paiement & Dettes', payNow2: 'Montant Payé',
      remainingDebt2: 'Reste (Dette):', fullPayment2: 'Paiement Complet', noPayment2: 'Aucun Paiement',
      confirmTransfer: 'Confirmer et Exécuter la Facture de Transfert',
    },
    settings: {
      title: 'Paramètres', sub: 'Paramètres de l\\\'Application',
      printSettingsBtn: 'Paramètres d\'impression',
      general: 'Paramètres Généraux',
      storeName: 'Nom du Magasin', currency: 'Devise', language: 'Langue', buttonSound: 'Sons des boutons', introSound: 'Son de début',
      productQR: 'Afficher les codes QR des produits', productQRHint: 'Une fois activé, un petit code QR apparaît sur les fiches produits (inventaire et vente). Désactivé par défaut et mémorisé sur cet appareil.',
      openIsolated: 'Ouvrir une fenêtre isolée', createShortcut: 'Raccourci bureau',
      isolatedHint: 'Ouvre la société dans une fenêtre et un processus séparés, avec des données entièrement isolées.',
      snapshotDone: 'Instantané de la société prêt.', snapshotError: 'Impossible de préparer l’instantané :',
      openDone: 'Fenêtre isolée ouverte.', openError: 'Impossible d’ouvrir la fenêtre isolée :',
      shortcutDone: 'Raccourci créé sur le bureau.', shortcutError: 'Impossible de créer le raccourci :',
      isolatedOnly: 'Cette fenêtre est dédiée à une seule société.',
      staleBuild: 'Cette version installée est ancienne et ne contient pas les fenêtres de société isolées. Fermez l’application et relancez la version mise à jour, ou installez la 3.3.6.',
      notif: 'Notifications de Stock Bas', autoBackup: 'Sauvegarde Auto',
      info: 'À Propos',
      version: 'Version', developer: 'Développeur', company: 'Société', lastUpdate: 'Dernière Mise à Jour',
      settingsSaved: 'Paramètres enregistrés',
      wrongPassword: 'Mot de passe actuel incorrect',
      verifyError: 'Erreur de vérification:',
      passwordMinLength: 'Le mot de passe doit contenir au moins 4 caractères',
      passwordsNoMatch: 'Les mots de passe ne correspondent pas',
      passwordSaved: 'Mot de passe enregistré avec succès',
      errorPrefix: 'Erreur:',
      colPage: 'Page', colView: 'Voir', colEdit: 'Modifier', colDelete: 'Supprimer',
      enterUsername: 'Veuillez entrer le nom d\'utilisateur', enterPassword: 'Veuillez entrer le mot de passe',
      userUpdated: 'Utilisateur mis à jour avec succès', userCreated: 'Utilisateur créé avec succès',
      noPerms: 'Aucune permission',
      delete_user_confirm: 'Êtes-vous sûr de vouloir supprimer l\\\'utilisateur "..."?',
      storeAddress: 'Adresse du Magasin', phoneNumber: 'Numéro de Téléphone', enableFiscalStamp: 'Activer le Timbre Fiscal dans les Factures',
      fiscalRatio: 'Taux:', fiscalMin: 'Min 5 DA - Max 10,000 DA',
      fiscalPercent: '% (0% pour les systèmes basiques)', lowStockThreshold: 'Seuil de Stock Bas',
      lowStockHint: 'En dessous de ce nombre est considéré stock bas', saveSettings: 'Enregistrer les Paramètres',
      storePasswordCard: 'Mot de Passe du Magasin', storePasswordDesc: 'Pour protéger le magasin, créez un mot de passe. Impossible de se connecter en tant que gérant sans.',
      currentPassword: 'Mot de Passe Actuel', currentPasswordPlaceholder: 'Laisser vide si nouveau',
      newPassword: 'Nouveau Mot de Passe', newPasswordPlaceholder: 'Mot de passe du magasin',
      confirmPassword: 'Confirmer le Mot de Passe', confirmPasswordPlaceholder: 'Ressaisir le mot de passe',
      savePassword: 'Enregistrer le Mot de Passe',
      lanCard: 'Synchronisation LAN',
      lanDesc: 'Reliez cet appareil à un autre appareil du même magasin via votre routeur pour une synchronisation instantanée de toutes les ventes, saisies et modifications.',
      lanRole: 'Rôle de cet appareil',
      lanOff: 'Désactivée',
      lanMain: 'Serveur principal (appareil avec IP fixe)',
      lanSub: 'Serveur secondaire (deuxième caisse)',
      lanLocalIps: 'Adresses IP de cet appareil',
      lanLocalIpHint: 'Définissez l\\\'une de ces adresses comme IP fixe dans Windows/le routeur et saisissez la même adresse sur l\\\'appareil secondaire.',
      lanServerIp: 'Adresse IP du serveur principal',
      lanPort: 'Port',
      lanPortHint: 'Démarre à 4512 et se décale automatiquement s\\\'il est occupé',
      lanStatus: 'État de la synchronisation',
      lanStatusOff: 'Synchronisation désactivée',
      lanStatusMainOn: 'Serveur principal en cours',
      lanStatusMainOff: 'Serveur principal arrêté',
      lanStatusClients: 'Appareils connectés',
      lanStatusSubOn: 'Connecté au serveur principal',
      lanStatusSubOff: 'Non connecté au serveur principal',
      lanListeningPort: 'Port réel',
      lanFirewallHint: 'Si l\\\'appareil secondaire ne peut pas se connecter, autorisez ce programme via le pare-feu Windows (réseau privé) : Paramètres → Confidentialité et sécurité → Pare-feu Windows → Autoriser une application via le pare-feu.',
      lanTest: 'Tester la connexion',
      lanTestWait: 'Test en cours...',
      lanTestOk: 'Connexion réussie — le serveur est disponible sur ce port',
      lanTestFail: 'Échec de la connexion',
      lanTestRefused: 'Aucun serveur sur cette adresse/ce port',
      lanTestTimeout: 'Délai dépassé — le port peut être bloqué ou l\\\'adresse est erronée',
      lanTestUnreachable: 'Adresse inaccessible — assurez-vous que les deux appareils sont sur le même réseau',
      lanSaved: 'Paramètres de synchronisation enregistrés',
      lanIpRequired: 'Saisissez d\'abord l\'adresse IP du serveur principal',
      lanRemoteReset: 'Effacer les données du serveur secondaire à distance',
      lanRemoteResetConfirm: 'Cela effacera toutes les données du serveur secondaire à distance et les re-synchronisera depuis ce serveur principal. Êtes-vous sûr ?',
      printerCard: 'Partager une imprimante via le r\u00e9seau (LAN)',
      printerDesc: 'Partagez l\u2019imprimante connect\u00e9e \u00e0 cet appareil avec les autres caisses, ou installez et d\u00e9finissez l\u2019imprimante du serveur comme d\u00e9faut sur cet appareil.',
      printerShareSide: 'Partager l\u2019imprimante de cet appareil (serveur)',
      printerInstallSide: 'Utiliser l\u2019imprimante du serveur depuis cet appareil (secondaire)',
      printerSelect: 'Imprimante locale',
      printerLoading: 'Chargement',
      printerNone: 'Aucune imprimante',
      printerDefaultNow: 'Imprimante par d\u00e9faut actuelle',
      printerShareName: 'Nom du partage',
      printerShareNow: 'Partager',
      printerUnshare: 'Annuler le partage',
      printerSharedOk: 'Imprimante partag\u00e9e avec succ\u00e8s - chemin disponible :',
      printerUnsharedOk: 'Partage d\u00e9sactiv\u00e9',
      printerServerHost: 'Adresse du serveur',
      printerBrowse: 'Parcourir les imprimantes',
      printerConnect: 'Connecter & d\u00e9finir par d\u00e9faut',
      printerMakeDefault: 'D\u00e9finir par d\u00e9faut',
      printerConnected: 'Imprimante connect\u00e9e',
      printerDriverInf: 'Chemin du pilote INF (si non install\u00e9)',
      printerInstallDriver: 'Installer le pilote',
      printerDrvShare: 'Ou un dossier de pilotes partag\u00e9 sur le serveur',
      printerInstallDriverShare: 'Installer depuis le dossier partag\u00e9',
      printerDriverInstalled: 'Pilote d\u2019imprimante install\u00e9 avec succ\u00e8s',
      printerFixDesc: 'N\u00e9cessite des droits administrateur et red\u00e9marre automatiquement le service Spooler.',
      printerFixNow: 'R\u00e9soudre les probl\u00e8mes d\u2019impression r\u00e9seau (0x0000011b / 0x00000709)',
      printerFixOk: 'Correctif appliqu\u00e9 et service d\u2019impression red\u00e9marr\u00e9',
      printerTest: 'Imprimer une page de test',
      printerTestTitle: 'Page de test d\u2019impression',
      printerSelectFirst: 'S\u00e9lectionnez d\u2019abord une imprimante',
      printerHostRequired: 'Entrez l\u2019adresse du serveur',
      printerLookForDrv: 'S\u00e9lectionnez d\u2019abord le fichier pilote (INF)',
      printerBusy: 'Interrogation',
      printerNoneShared: 'Aucune imprimante partag\u00e9e trouv\u00e9e sur ce serveur',
      printerWorking: 'Traitement en cours...',
      printerInstalling: 'Installation',
      printerUnknownErr: 'Une erreur inattendue est survenue',
      printerNeedAdmin: 'Cette op\u00e9ration n\u00e9cessite des droits administrateur (acceptez l\u2019invite UAC) - ou faites-le manuellement depuis les param\u00e8tres Windows.',
      printerAccessDenied: 'Acc\u00e8s refus\u00e9 sur l\u2019appareil distant. Assurez-vous que le partage d\u2019imprimante est activ\u00e9 dans Windows et que Tout le monde est autoris\u00e9 sur l\u2019imprimante.',
      printerHostUnreachable: 'Serveur inaccessible - assurez-vous que les deux appareils sont sur le m\u00eame r\u00e9seau et que le nom/adresse est correct.',
      printerDriverMissing: 'Pilote non installé localement',
      printerDriverMissingHint: 'Installez le pilote depuis le fichier INF ou le dossier partagé ci-dessus, puis réessayez.',
      printerDriverNightmare: 'Le pilote d\u2019imprimante est manquant ou une restriction de s\u00e9curit\u00e9 (PrintNightmare) est active. Installez le pilote puis r\u00e9essayez, ou lancez d\u2019abord le bouton R\u00e9soudre les probl\u00e8mes d\u2019impression.',
      printerDefaultSet: 'Imprimante d\u00e9finie par d\u00e9faut',
      lanRemoteResetSent: 'Commande d\\\'effacement envoyée au secondaire — il se videra et se re-synchronisera sous peu.',
      usersCard: 'Gestion des Utilisateurs', usersDesc: 'Créez des utilisateurs et définissez leurs permissions.',
      addUser: 'Ajouter Utilisateur', newUser: 'Nouvel Utilisateur',
      companiesCard: 'Gestion des Entreprises (Multi)', companiesDesc: "Créez plusieurs entreprises et basculez entre leurs données depuis cet appareil. Chaque entreprise conserve ses données (produits, factures, clients, fournisseurs...) séparément.",
      addCompany: 'Ajouter une Entreprise', newCompany: 'Nouvelle Entreprise',
      companyName: 'Nom de la Societe', companyNamePlaceholder: 'ex. Pieces Auto Modernes',
      companyStoreName: 'Nom du Magasin de la Societe', companyStoreNamePlaceholder: 'ex. Pieces Auto Modernes - Magasin principal',
      companyPassword: 'Mot de passe de la Societe', companyPasswordPlaceholder: "Mot de passe pour se connecter comme manager de cette entreprise",
      companyActiveHint: 'Entreprise active actuellement : ',
      enterCompany: 'Se connecter comme Manager', exitCompany: 'Quitter le scope de l entreprise',
      confirmDeleteCompany: 'Etes-vous sur de vouloir supprimer cette entreprise et toutes ses donnees ? Operation irreversible.',
      resetCompanyData: 'Vider les donnees de l entreprise',
      confirmResetCompanyData: 'Vider TOUTES les donnees de : ... Operation irreversible !',
      confirmResetCompanyDataFinal: 'Confirmation supplementaire: tous les produits, factures, clients, fournisseurs, paiements, retours, commandes et transferts de cette entreprise seront supprimes. Continuer ?',
      resetCompanyDataDone: 'Donnees de l entreprise videes (… enregistrements).',
      noCompanies: 'Aucune entreprise pour le moment',
      companyNameRequired: 'Le nom de la societe est obligatoire',
      companyStoreCodes: 'Filiales rattachées à cette société', companyStoreCodesHint: "Sélectionnez une ou plusieurs filiales (laissez vide = cette société ne s'affichera pour aucune filiale)", companyNoBranches: 'Aucune filiale créée pour le moment',
      companyLegalTitle: 'Identification légale (affichée à limpression)',
      companyPhone: 'Téléphone', companyAddress: 'Adresse', companyNis: 'NIS', companyNif: 'NIF', companyRcc: 'RCC / RC', companyArticle: 'ARTICLE',
      userCompany: 'Entreprise',
      companyManageDenied: 'La gestion des entreprises n\'est disponible que pour le magasin principal.',
      companyNotPermitted: 'Cet utilisateur ne peut pas être assigné à cette entreprise ; elle n\\\'est pas autorisée pour ce magasin/filiale.',
      companyNoPermitted: 'Aucune entreprise n\\\'est autorisée pour ce magasin/filiale',
      companyUpdated: 'Modifications de la societe enregistrees',
      companyCreated: 'Societe creee avec succes',
      companyIsActive: 'Societe active actuellement',
      enteredCompany: 'Vous etes desormais dans le scope de cette societe. Seules ses donnees seront affichees.',
      userName: 'Nom d\'utilisateur', userNamePlaceholder: 'Nom d\'utilisateur',
      userPassword: 'Mot de passe', userPasswordPlaceholder: 'Mot de passe',
      permissions: 'Permissions',
    },
    storeDebts: {
      title: 'Dettes des Magasins', sub: 'Dettes par factures de transfert',
      storeCount: 'Magasins', owedToUs: 'Dus à Nous', weOwe: 'Nous Devons',
      netDebt: 'Dette Nette', transferInvoices: ' factures de transfert',
      owedLabel: 'Dus:', weOweLabel: 'Nous devons:', paidLabel: 'Payé:',
      totalDebt: 'Dette Totale', totalInvoices: 'Total Factures',
      paid: 'Payé', remaining: 'Reste',
      typeTransfer: 'Sortant', typeReception: 'Réception',
      statusPaid: 'Payé', statusRemaining: 'Reste',
      noTransfers: 'Aucune facture de transfert',
      payTitle: 'Payer une Tranche', total: 'Total:', paidPreviously: 'Déjà Payé:',
      payAmount: 'Montant du Paiement', confirmPay: 'Confirmer le Paiement', back: 'Retour',
      noInvoices: 'Aucune facture', invoiceDetails: 'Détails de la Facture',
      invoiceActionsPrint: 'Imprimer', invoiceActionsPay: 'Payer', invoiceActionsEdit: 'Modifier',
      printChoiceTitle: 'Choisissez le type d\'impression', printChoiceDesc: 'Comment voulez-vous imprimer cette facture ?', printNormal: 'Impression normale', printEmployee: 'Impression pour employé', employeeDocTitle: 'Bon de préparation',
      printTotalTitle: 'Total imprimé',
      printTotalNet: 'Après remise', printTotalGross: 'Avant remise',
      printTotalNetDesc: 'Prix unitaire inchangé + ligne de remise', printTotalGrossDesc: 'Total seul, sans aucune mention de remise',
      printTotalHintNet: 'Le prix unitaire s\'imprime tel quel, puis la ligne de remise, puis le total après remise.',
      printTotalHintGross: 'Seul le total avant remise s\'imprime — aucune ligne de remise.',
      paidAfterDiscount: 'Après remise',
      cardDiscountTag: 'Remise',
      cardDiscountTitle: 'Facture avec remise — ouvrez-la et appuyez sur i pour le taux et le coût réel',
      discountOnInvoiceBanner: 'Cette facture comporte une remise — appuyez sur {i} ou sur ce message pour voir le taux, le coût réel et le total après remise ({net}).',
      invoiceActionsDelete: 'Supprimer', invoiceActionsClose: 'Fermer',
      totalDebtLabel: 'Dette Totale', emptyPlaceholder: 'Aucune facture de transfert',
    },
    branchesMonitor: {
      title: 'Moniteur des Succursales', sub: 'Surveillez et gérez toutes les succursales en un seul endroit',
      loading: 'Chargement des données...',
      online: 'En ligne', offline: 'Hors ligne',
      productCount: ' produits', saleCount: ' ventes',
      viewDetails: 'Voir les Détails',
      noData: 'Aucune donnée', noInventory: 'Aucun stock', noInvoices: 'Aucune facture',
      productsLabel: 'Produits:', invoicesLabel: 'Factures:',
      tabInventory: 'Stock', tabInvoices: 'Factures', tabPurchases: 'Achats', tabNet: 'Compte Net',
      notAvailable: 'N/A',
      sold: 'Payé', provisional: 'Provisoire',
      transferIncome: 'Revenu Transfert', transferCost: 'Coût Transfert',
      totalSales: 'Ventes Totales', totalPurchases: 'Achats Totaux',
      netAccount: 'Compte Net',
      searchPlaceholder: 'Rechercher des produits...',
      noSearchResults: 'Aucun résultat dans aucun magasin',
      outOfStock: 'Rupture', inStock: 'En stock',
      searchAll: 'Rechercher Tous les Magasins', searchAllPlaceholder: 'Recherchez par nom ou code-barres pour trouver quel magasin a le produit...',
      branchCount: 'Succursales', totalProducts: 'Total Produits', totalRevenue: 'Revenu Total',
      branchesList: 'Liste des Succursales', refresh: 'Actualiser', noBranches: 'Aucune succursale enregistrée',
      backToList: 'Retour à la Liste', products: 'Produits', invoices: 'Factures',
      sales: 'Ventes', purchases: 'Factures d\'Achat', loadingPlaceholder: 'Chargement...',
    },
    chart: { sales: 'Ventes', inventory: 'Stock', returns: 'Retours' },
    connection: {
      title: 'Paramètres de Connexion', sub: 'Connexion cloud et gestion des magasins',
      connected: 'Connecté au cloud',
      mainConnected: 'Magasin principal - connecté à Supabase',
      branchConnectedMsg: 'Succursale connectée au magasin principal',
      mainStore: 'Magasin principal', branch: 'Succursale',
      branchParenthetical: '(Succursale)',
      enterCredentials: 'Entrez vos identifiants pour commencer',
      logoutConfirm: 'Êtes-vous sûr de vouloir vous déconnecter?',
      cloudRequired: 'Veuillez vous connecter au cloud d\'abord',
      uploading: 'Téléchargement...', noChanges: 'Aucun changement à télécharger',
      uploadSuccess: 'Téléchargement réussi',
      uploadBackupBtn: 'Télécharger la sauvegarde',
      lanSubUploadMsg: 'Cet appareil est un serveur LAN sub : l\'envoi vers le cloud se fait depuis le serveur principal de cet emplacement',
      enterStorePassword: 'Entrez le mot de passe du magasin:',
      wrongPassword: 'Mot de passe incorrect',
      verificationError: 'Erreur de vérification: ',
      backupEmpty: 'La sauvegarde est vide',
      restoreSuccessMsg: 'Restauré avec succès - redémarrez l\\\'application',
      restoreBackupBtn: 'Restaurer la sauvegarde',
      lastSync: 'Dernière synchronisation: ',
      branchNameRequired: 'Veuillez entrer le nom de la succursale',
      passwordRequired: 'Veuillez entrer le mot de passe',
      branchCreated: 'Succursale créée - Code: ',
      passwordLabel: 'Mot de passe: ',
      viewStock: 'Voir le stock', deleteBranchBtn: 'Supprimer la succursale',
      deleteBranchConfirm1: 'Supprimer la succursale "',
      deleteBranchConfirm2: 'Vous ne pourrez pas la restaurer.',
      enterStorePasswordView: 'Entrez le mot de passe pour voir le stock:',
      noBranchStock: 'Aucun stock pour cette succursale',
      barcode: 'Code-barres', brand: 'Marque', sellPrice: 'Prix de vente',
      emailRequired: 'Veuillez entrer un email valide',
      searching: 'Recherche...', noPassword: 'Aucun mot de passe',
      savingPassword: 'Enregistrement du nouveau mot de passe...',
      userInfoTitle: 'Info Utilisateur', emailLabel: 'Email', codeLabel: 'Votre Code',
      storeTypeLabel: 'Type de Magasin', mainCodeLabel: 'Code Principal',
      statusTitle: 'Déconnecté', statusDesc: 'Entrez vos identifiants pour commencer',
      statusBadge: 'Déconnecté', connTab: 'Connexion', backupTab: 'Sauvegarde',
      branchesTab: 'Succursales', recoveryTab: 'Récupération de Compte',
      cloudStatusCard: 'État de la Connexion Cloud', cloudStatusDesc: 'La connexion cloud est automatique. Toutes vos données sont stockées en sécurité.',
      logoutBtn: 'Déconnexion', uploadCard: 'Télécharger Sauvegarde', uploadDesc: 'La sauvegarde existante dans le cloud sera remplacée...',
      pushTitle: 'Notifications Mobiles', pushDesc: 'Lorsqu\\\'une commande de produit ou un retour de marchandise avariée est créé, une notification instantanée est envoyée à votre téléphone même lorsque le site est fermé.',
      siteUrlLabel: 'URL du site', siteUrlPlaceholder: 'https://...',
      pushSaveBtn: 'Enregistrer', pushUrlRequired: 'Veuillez saisir l\'URL du site', pushUrlInvalid: 'L\'URL du site est invalide',
      pushSaved: 'Paramètres enregistrés',
      autoBackup: 'Sauvegarde Auto', backupInterval: 'Intervalle (minutes)',
      min1: '1 min', min2: '2 min', min5: '5 min', min10: '10 min', min30: '30 min',
      uploadBtn: 'Télécharger Sauvegarde', restoreBtn: 'Restaurer la Sauvegarde',
      branchesCard: 'Succursales', branchesDesc: 'La gestion des succursales est réservée au magasin principal.',
      addBranch: 'Ajouter une Succursale', branchName: 'Nom de la Succursale', branchNamePlaceholder: 'Ex: Succursale Centre-Ville',
      branchPassword: 'Mot de passe', branchPasswordPlaceholder: 'Mot de passe de la succursale',
      saveBranch: 'Enregistrer', cancel2: 'Annuler', addNewBranch: 'Ajouter une Succursale', refreshBtn: 'Actualiser',
      noBranches2: 'Aucune succursale enregistrée', branchStock: 'Stock de la succursale: ',
      recoveryCard: 'Récupération de Compte / Mot de Passe', recoveryDesc: 'Entrez l\\\'email associé au compte...',
      search2: 'Rechercher', storeNameLabel: 'Nom du Magasin', codeResult: 'Code', passwordResult: 'Mot de passe',
      changePassword: 'Changer le Mot de Passe', searchAgain: 'Rechercher à Nouveau',
      newPasswordLabel: 'Nouveau Mot de Passe', newPasswordPlaceholder2: '4 caractères minimum',
      confirmPasswordLabel: 'Confirmer le Mot de Passe', confirmPasswordPlaceholder2: 'Ressaisir le mot de passe',
      saveNewPassword: 'Sauvegarder le Nouveau Mot de Passe',       backBtn: 'Retour',
      scannerTab: 'Scanner Téléphone', scannerCard: 'Scanner de Codes-Barres Sans Fil',
      scannerDesc: 'Transformez n\'importe quel téléphone du réseau du magasin en scanner de codes-barres sans fil qui alimente le même champ qu\'un scanner filaire. Service HTTPS 100 % local avec certificat privé — vos données restent dans le magasin.',
      scannerEnable: 'Activer le scanner téléphone',
      scannerFirewall: 'Vérifier la permission du pare-feu',
      scannerStep1: 'Activez le service et scannez le QR code avec votre téléphone (même Wi-Fi).',
      scannerStep2: 'Ouvrez la page et pointez la caméra sur un code produit ou une facture.',
      scannerStep3: 'À la première ouverture, une fenêtre d\'approbation apparaît ici — choisissez « Toujours » ou « Cette session ».',
      scannerStep4: 'Chaque code lu est inséré automatiquement dans le champ actif.',
      scannerStep5: 'La première fois un avertissement « Non sécurisé » peut apparaître — touchez Plus / Continuer ; le certificat devient fiable après installation.',
      certHelpTitle: 'Installer le certificat de sécurité sur le téléphone (requis pour une vraie application)',
      certHelpDesc: 'Si vous avez touché Continuer sur l\'avertissement, installez le certificat une fois depuis le lien ci-dessous et rouvrez la page ; sinon Chrome ne propose qu\'un raccourci.',
      certHelpOpen: 'Ouvrir le guide',
      certHelpCopy: 'Copier le lien du guide',
      scannerDevices: 'Appareils appairés', scannerNoDevices: 'Aucun appareil appairé',
      scannerStarting: 'Démarrage du service…', scannerStarted: 'Le scanner téléphone fonctionne',
      scannerStartError: 'Échec du démarrage du scanner téléphone', scannerStopped: 'Scanner téléphone arrêté',
      scannerRunning: 'En cours', scannerError: 'Erreur',
      scannerFwChecking: 'Vérification du pare-feu…', scannerFwOk: 'Permission pare-feu OK',
      scannerFwNeedsPermission: 'Permission administrateur refusée — activez le scanner d\'abord ou autorisez le pare-feu manuellement',
      scannerPairTitle: 'Demande d\'appairage du téléphone', scannerPairAlways: 'Toujours',
      scannerPairSession: 'Cette session', scannerPairDeny: 'Refuser',
      scannerRemove: 'Retirer', scannerRemoveConfirm: 'Retirer cet appareil et le bloquer ?',
      scannerSell: 'Vente', scannerSellTitle: 'Autoriser ce téléphone à vendre depuis le magasin',
      psaleCard: 'Point de vente téléphone (Vente)',
      psaleDesc: 'Permettez aux employés de vendre depuis leur téléphone pendant les heures d\'affluence : ouvrez la page de vente sur le même réseau, chaque employé choisit son nom et vend aux clients et fournisseurs avec remise et contrôle des prix. La vente est exécutée sur le PC directement — factures, stock et soldes se mettent à jour instantanément sur tous les appareils.',
      psaleEnable: 'Activer la vente depuis un téléphone',
      psaleEnabled: 'La vente depuis téléphone est maintenant ACTIVE', psaleDisabled: 'La vente depuis téléphone est maintenant arrêtée',
      psaleRunning: 'Vente téléphone activée', psalePaused: 'Vente en pause — activez-la ci-dessus',
      psaleStep1: 'Activez la vente et scannez le QR avec le même téléphone du scanner (ou un nouveau — l\'approbation apparaîtra ici).',
      psaleStep2: 'Ouvrez la page « ZMT Vente » et choisissez l\'employé dans la barre supérieure.',
      psaleStep3: 'Cherchez les pièces, ajoutez-les au panier, choisissez client/fournisseur, remise et mode de paiement.',
      psaleStep4: 'Confirmez la vente — facture, stock et soldes se mettent à jour immédiatement.',
    },
    pd: {
      tab: 'Affichage des Prix',
      saved: 'Enregistré',
      tabDesc: 'Un ecran plein ecran diffuse les videos de la boutique; tout code-barres scanne affiche son prix de vente 3 secondes puis la video reprend. Tout reste sur cet ordinateur uniquement.',
      enable: 'Activer l affichage des prix',
      enabled: 'Active',
      disabled: 'Desactive',
      videosTitle: 'Clips video',
      videosDesc: 'Les clips se lisent dans l ordre puis bouclent en boucle. Aucun envoi vers le cloud — ils sont copies dans le dossier local du programme.',
      videosAdd: 'Ajouter une video',
      videosEmpty: 'Aucun clip video',
      videoAdded: 'Clips ajoutes',
      mediaTitle: 'Images et vidéos',
      mediaDesc: 'Les éléments se lisent dans l\'ordre puis bouclent : une image reste selon sa durée, une vidéo se lit en entier. Aucun envoi vers le cloud — ils sont copiés dans le dossier local du programme.',
      mediaAddImage: 'Ajouter une image',
      mediaAddVideo: 'Ajouter une vidéo',
      mediaEmpty: 'Aucune image ni vidéo',
      imageAdded: 'Image ajoutée',
      logoTitle: 'Logo de la boutique',
      logoDesc: 'Affiche en haut de l ecran et a cote du prix. Visible uniquement sur l affichage des prix.',
      logoPick: 'Choisir une image',
      logoClear: 'Retirer',
      logoSaved: 'Logo enregistre',
      colorsTitle: 'Couleurs et polices',
      bg: 'Couleur de fond',
      priceColor: 'Couleur des chiffres (prix)',
      nameColor: 'Couleur du nom de la boutique',
      nameSize: 'Taille du nom',
      priceSize: 'Taille des chiffres',
      font: 'Police',
      tickerTitle: 'Bandeau bas',
      tickerDesc: 'Un bandeau blanc défilant en bas avec le logo du programme, ZMT SOFTWARE et les coordonnees.',
      tickerOn: 'Afficher le bandeau bas',
      tickerPhone: 'Telephone dans le bandeau',
      tickerMail: 'Email dans le bandeau',
      autoLoginTitle: 'Connexion auto a l affichage',
      autoLoginDesc: 'Au demarrage le programme connecte ce compte sans mot de passe et ouvre l ecran en plein ecran.',
      autoLoginOn: 'Activer la connexion automatique',
      autoLoginUser: 'Compte',
      autoLoginPass: 'Mot de passe',
      autoLoginNeed: 'Choisissez un compte et tapez son mot de passe',
      autoStartTitle: 'Demarrage avec Windows',
      autoStartDesc: 'Ouvre le programme des l allumage de l ordinateur puis va directement a l affichage des prix.',
      autoStartOn: 'Lancer le programme au demarrage de Windows',
      pinTitle: 'Code de verrouillage',
      pinDesc: 'Demande pour quitter l ecran (bouton cadenas ou Ctrl+Shift+P). Laissez vide pour utiliser le mot de passe de la boutique.',
      pinLabel: 'Code de verrouillage',
      pinSave: 'Enregistrer',
      pinShort: 'Au moins 3 caracteres',
      noAccount: '— choisir un compte —',
      noVideos: 'Aucun clip video',
      noVideosHint: 'Ajoutez des videos dans Parametres connexion ← onglet Affichage des Prix',
      currency: 'DA',
      notFound: 'Produit introuvable',
      scanPlaceholder: 'Scannez un code-barres ici',
      lockTitle: 'Code manager',
      lockPlaceholder: 'Saisissez le code',
      cancel: 'Annuler',
      unlock: 'Deverrouiller'
    },
    rest: {
      tab: 'Restaurant',
      enable: 'Activer la fonction Restaurant',
      enabled: 'Restaurant activé',
      disabled: 'Restaurant désactivé',
      roleLabel: 'Rôle de cet appareil',
      roleSend: 'Expéditeur — envoie les commandes (serveur)',
      roleReceive: 'Récepteur — reçoit les commandes (cuisine/caisse)',
      roleNone: 'Appareil non participant',
      roleNoneHint: 'Activez le restaurant et choisissez un rôle.',
      nameLabel: 'Nom de cet appareil',
      namePlaceholder: 'ex. Cuisine 1 ou Serveur Ahmed',
      tablesLabel: 'Liste des tables',
      tablesAdd: 'Ajouter une table',
      tablesHint: 'Saisissez un numéro puis ajoutez. Les expéditeurs peuvent aussi taper une table libre.',
      printerLabel: 'Imprimante de ticket cuisine',
      printerDefault: 'Imprimante par défaut',
      printerListBtn: 'Actualiser la liste',
      permsTitle: 'Permissions des appareils (gérant)',
      permsDesc: 'Définissez ce que chaque appareil peut faire : envoyer, contrôler le statut, confirmer la vente.',
      permSend: 'Envoyer',
      permControl: 'Contrôler le statut',
      permConfirm: 'Confirmer la vente',
      deviceCol: 'Appareil',
      nameCol: 'Nom',
      roleCol: 'Rôle',
      savePerms: 'Enregistrer les permissions',
      permSaved: 'Permissions enregistrées et diffusées',
      myDevice: 'Cet appareil',
      onlyManager: 'La gestion des permissions est réservée au gérant',
      pageTitle: 'Commandes Locales',
      pageSub: 'Commandes du restaurant sur le réseau local',
      ordersEmpty: 'Aucune commande pour l’instant',
      outgoing: 'Mes commandes envoyées',
      incoming: 'Commandes reçues ici',
      qtyLabel: 'Qté',
      priceLabel: 'Prix',
      time: 'Heure',
      actions: 'Action',
      statusCol: 'Statut',
      tableCol: 'Table',
      senderCol: 'Expéditeur',
      receiverCol: 'Récepteur',
      itemsCol: 'Articles',
      orderBtn: 'Commander',
      orderSelfBtn: 'Commander pour moi',
      selfReceiver: 'Cet appareil (moi)',
      cartTitle: 'Plateau de commande',
      cartSub: 'Vérifiez les articles puis envoyez-les en cuisine',
      clear: 'Vider',
      emptyCart: 'Plateau vide — appuyez sur "Commander" sur un article',
      emptyCartHint: 'Les articles s\'ajoutent ici un à un avant l\'envoi',
      close: 'Fermer',
      notesPlaceholder: 'ex. sans oignon, légèrement épicé…',
      orderSent: 'Commande envoyée avec succès',
      receiverLabel: 'Récepteur',
      noReceivers: 'Aucun récepteur en ligne',
      tableLabel: 'Numéro de table',
      tablePlaceholder: 'Choisir ou saisir le numéro de table',
      notesLabel: 'Notes',
      send: 'Envoyer la commande',
      addedToCart: 'Ajouté au plateau',
      newOrder: 'Nouvelle commande',
      cancel2: 'Fermer',
      cancel: 'Annuler',
      inprogressBtn: 'En cours',
      doneBtn: 'Terminée',
      confirmBtn: 'Confirmer la vente',
      confirmTitle: 'Confirmer la vente de la commande',
      confirmSub: 'Vérifiez le montant et choisissez le mode de paiement',
      itemsCount: 'articles',
      noActions: 'Aucune action disponible pour le moment',
      payMethod: 'Mode de paiement',
      payCash: 'Espèces',
      payCcp: 'CCP',
      payConfirm: 'Confirmer le paiement & la vente',
      customerLabel: 'Client (optionnel)',
      stockShort: 'Stock insuffisant — commande conservée en "nouveau"',
      failed: 'Échec de l’opération',
      saleOk: 'Vente effectuée ; facture et stock mis à jour',
      ticketTitle: 'Ticket cuisine',
      tablePrefix: 'Table',
      fromLabel: 'De :',
      itemCol: 'Article',
      invoiceTitle: 'Facture de vente',
      sellerLabel: 'Vendeur :',
      paidLabel: 'Payé :',
      remainLabel: 'Reste :',
      thanks: 'Merci de votre visite',
      statusNew: 'Nouvelle',
      statusInprogress: 'En cours',
      statusDone: 'Terminée',
      statusConfirmed: 'Confirmée',
      statusCancelled: 'Annulée',
      orderNo: 'Commande #',
      sent: 'Commande envoyée',
      done: 'Terminée',
      ticketPrinted: 'Ticket cuisine imprimé',
      noTable: 'Saisissez le numéro de table',
      total: "Total",
      all: "Tous",
    },
    login: {
      loginSubtitle: 'Choisir la méthode de connexion', managerTab: 'Gérant', userTab: 'Utilisateur', newAccountTab: 'Nouveau Compte', branchTab: 'Succursale',
      codeLabel: 'Code à 10 chiffres', storePassword: 'Mot de passe du magasin', passwordPlaceholder: 'Entrez le mot de passe',
      chooseCompany: 'Choisir l\'entreprise', enterNow: 'Entrer', chooseEmployee: 'Choisir l\\\'employé', employeePlaceholder: 'Nom de l\\\'employé', needCompany: 'Veuillez choisir une entreprise d\'abord',
      loginManager: 'Connexion en tant que Gérant', forgotPassword: 'Mot de passe oublié?',
      storeCode: 'Code du Magasin', storeCodePlaceholder: 'Entrez le code du magasin (10 chiffres)',
      usernameLabel: 'Nom d\'utilisateur', usernamePlaceholder: 'Nom d\'utilisateur',
      userPassword: 'Mot de passe', loginAsUser: 'Connexion en tant qu\'Utilisateur',
      emailLabel: 'Email', createAccount: 'Créer un Compte', createPasswordLabel: 'Mot de passe du magasin (facultatif mais recommandé pour l\\\'activation)',
      mainStoreCode: 'Code du Magasin Principal', branchPassword: 'Mot de passe de la Succursale', branchLogin: 'Connecter en tant que Succursale',
      accountCreatedTitle: 'Compte Créé avec Succès!', accountCreatedDesc: 'Sauvegardez ce code en lieu sûr. Vous en aurez besoin pour récupérer vos données.',
      accountCreatedWarning: 'Ce code ne peut pas être récupéré. Notez-le ou photographiez-le.', enterApp: 'Entrer dans l\'App',
      recoveryTitle: 'Récupération de Mot de Passe', recoverySubtitle: 'Entrez votre email pour voir le code et le mot de passe',
      searchBtn: 'Rechercher', backToLogin: 'Retour à la Connexion',
      storeNameSpan: 'Nom du Magasin:', codeSpan: 'Code:', passwordSpan: 'Mot de passe:',
      loginWithCode: 'Connexion avec le Code', resetPassword: 'Réinitialiser le Mot de Passe',
      searchAgainLink: 'Rechercher à Nouveau', newPasswordTitle: 'Définir un Nouveau Mot de Passe',
      newPassLabel: 'Nouveau Mot de Passe', newPassPlaceholder: 'Entrez le nouveau mot de passe',
      confirmPassLabel: 'Confirmer le Mot de Passe', confirmPassPlaceholder: 'Ressaisir le mot de passe',
      saveNewPass: 'Sauvegarder le Nouveau Mot de Passe', backLink: 'Retour',
    },
  },
  zh: {
    appTitle: 'ZMT PIECE',
    online: '在线', offline: '离线',
    nav: {
      localOrders: '本地订单',
      priceDisplay: '价格显示屏',
      main: '主页', manage: '管理', finance: '财务', system: '系统',
      dashboard: '控制面板', brands: '品牌', sales: '销售', invoices: '发票',
      inventory: '库存', suppliers: '供应商', customers: '客户', debts: '债务', debtDetails: '债务明细',
      customerMovements: '客户往来', supplierMovements: '供应商往来',
      employees: '员工',
      supplierReturns: '损坏商品', expiry: '到期',
      netAccount: '净账户', expenses: '支出', discounts: '折扣', returns: '退货',
      reports: '报告', backup: '备份', settings: '设置',
      zakat: '天课',
      connection: '连接设置',
      storeDebts: '商店债务', branchesMonitor: '分支监控', sharedInventory: '共享库存',
      orders: '订单',
    },
    expiry: {
      title: '到期', sub: '已过期或即将过期的产品',
      search: '按名称或条码搜索...', refresh: '刷新', noDate: '—',
      filterAll: '全部', filterExpired: '已过期', filterExpiring: '即将过期', filterOk: '正常',
      sumExpired: '已过期', sumExpiring: '即将过期', sumOk: '正常', sumWarnWindow: '警告天数',
      expired: '已过期', expiresToday: '今天到期', inDays: '后', days: '天', overdue: '逾期',
      warnMsg: '过期警告：',
      empty: '没有匹配的产品', editPrompt: '新的到期日期 (YYYY-MM-DD):', invalidDate: '日期格式无效',
    },
    dash: {
      title: '控制面板', sub: '销售与库存概览',
      s1: '库存物品', s2: '本月发票', s3: '注册客户', s4: '总销售额',
      chart: '销售额与库存和退货对比', months: '月数:',
      m1: '月', m2: '月', m3: '月', m4: '月', m5: '月', m6: '月',
      netProfit: '净利润', cost: '成本',
      lowStockItems: ' 个产品低于库存阈值',
      andMore: '和', moreItems: '更多...',
      lowStock: '低库存产品', estimatedProfit: '预计总利润', monthSales: '本月销售额', profitCostDist: '利润与成本分布',
      view: '查看', lowStockModalTitle: '低于库存阈值的产品',
      colProduct: '产品', colCode: '条码 / 标记', colThreshold: '阈值', openProduct: '打开产品',
      printBw: '黑白打印', lowStockPrintTitle: '低库存产品报表',
      printDate: '打印日期', printCount: '产品数量',
    },
    brands: { title: '品牌', sub: '管理品类和品牌', search: '搜索品牌...', favAdd: '添加到收藏', favRemove: '从收藏中移除', brandsWord: '品牌', addOther: '添加其他', addOtherHint: '添加新品类', backToKinds: '品类', brandsOfKind: '品牌', addBrand: '添加品牌', noBrands: '该品类暂无品牌', deleteBrand: '删除品牌', confirmDelete: '删除此品牌？', addKindTitle: '添加新品类', kindName: '品类名称', kindIcon: '图标（可选）', kindColor: '颜色', kindRequired: '请输入品类名称', kindExists: '此品类已存在', addBrandTitle: '添加品牌', brandName: '品牌名称', brandCountry: '国家', brandColor: '品牌颜色', brandKind: '品类', brandNameRequired: '请输入品牌名称' },
    sales: {
      title: '销售', sub: '创建新的销售发票',
      searchParts: '搜索零件', searchPlaceholder: '按零件名称或编号搜索...',
      emptySearch: '输入以开始搜索零件',
      cart: '购物车', cartEmpty: '购物车为空', total: '总计:',
      checkout: '结账',
      confirm: '确认', transferInvoice: '转让发票', transferTitle: '将发票转让给客户',
      transferHint: '选择将记录此发票的客户（例如买方是代其购买）。',
      transferSelected: '发票将记录在以下客户名下：', transferConfirm: '确认转让',
    },
    invoices: {
      title: '发票', sub: '所有销售和采购发票',
      search: '搜索发票...', newInvoice: '新建发票',
      col1: '发票号', col2: '日期', col3: '客户', col4: '金额', col5: '状态', col6: '操作',
      empty: '暂无发票',
    },
    inventory: {
      title: '库存', sub: '管理零件库存',
      search: '搜索库存...', add: '添加零件', export: '导出',
      col1: '代码', col2: '零件名称', col3: '品牌', col4: '数量', col5: '进价', col6: '售价', col7: '操作',
      empty: '库存为空',
    },
    suppliers: {
      title: '供应商', sub: '管理零件供应商',
      search: '搜索供应商...', add: '添加供应商',
      col1: '名称', col2: '电话', col3: '邮箱', col4: '品牌', col5: '余额', col6: '操作',
      empty: '暂无供应商',
      addModalTitle: '添加新供应商', editModalTitle: '编辑供应商',
      formName: '供应商名称', formNamePl: '例如：XX汽配公司',
      formPhone: '电话号码', formAddress: '地址', formAddressPl: '例如：利雅得 - 法赫德国王路',
      cancel: '取消', save: '保存',
    },
    sdPayment: {
      editTitle: '编辑付款', note: '备注', date: '付款日期',
      balanceNote: '供应商余额将按差额自动更新。',
      confirmDelete: '删除这笔付款？其对供应商余额的影响将被撤销。',
      invalidAmount: '请输入有效金额', invalidDate: '付款日期格式无效',
      updated: '付款已修改，余额已更新', deleted: '付款已删除，余额已更新',
    },
    movements: {
      custTitle: '客户往来', custSub: '债务、付款和发票的完整记录，含余额结算',
      supTitle: '供应商往来', supSub: '债务、付款和发票的完整记录，含余额结算',
      partyLabel: '往来方', searchLabel: '搜索', searchPh: '按名称或发票号搜索...',
      allCustomers: '全部客户', allSuppliers: '全部供应商',
      viewReport: '查看报表', print: '打印', close: '关闭', printTitle: '往来报表',
      allowPopups: '请允许弹出窗口以进行打印', nothingToPrint: '没有可打印的数据',
      emptyList: '没有匹配的结果', noMovements: '没有记录',
      legendSale: '销售发票（借方）', legendPurchase: '采购发票（借方）',
      legendPayment: '付款（贷方）', legendPaySupplier: '向供应商付款（贷方）',
      legendVoucher: '收款凭证', legendDebtNote: '欠款单',
      legendSettle: '余额结算（余额归零）',
      entrySale: '销售发票', entryPurchase: '采购发票', entrySupSale: '销售给供应商',
      entryPayment: '付款', entryReceipt: '收款凭证', entryDebtNote: '欠款单',
      itemsNoun: '项',
      opening: '期初余额', settledTag: '余额结算', balanceAfter: '结算后余额',
      movCount: '记录数', settleCount: '结算次数', currentDue: '当前余额',
      colDate: '日期', colTime: '时间', colDesc: '摘要', colRef: '参考',
      colDebit: '借方 (+)', colCredit: '贷方 (−)', colBalance: '余额',
      totalDebit: '借方合计', totalCredit: '贷方合计', finalBalance: '期末余额',
      netTotal: '净余额', grandTotal: '总计',
      sumParties: '客户数', sumPartiesSup: '供应商数',
      reportTitleOneCust: '客户往来报表', reportTitleAllCust: '客户往来报表',
      reportTitleOneSup: '供应商往来报表', reportTitleAllSup: '供应商往来报表',
      phone: '电话', generatedAt: '生成时间',
      footNote: '往来报表由程序记录自动生成',
      fromLabel: '从日期', toLabel: '至日期',
      qMonth: '本月', q30: '最近30天', qAll: '全部',
      includeReturns: '包含退货', legendReturn: '退货（不改变余额）',
      entryReturn: '退货',
      returnsReport: '退货报表', monthlyStatement: '月度报表',
      settleNow: '结清余额', exportCsv: '导出 Excel',
      sendWhatsApp: 'WhatsApp', sendEmail: '发送邮件',
      aging: '债务老龄', oldest: '最旧债务', days: '天',
      age0: '0-30天', age30: '31-60天', age60: '61-90天', age90: '超过90天',
      overLimit: '超出信用限额',
      retCount: '退货数量', retQty: '总数量', retValue: '退货金额',
      retTitleOneCust: '客户退货报表', retTitleAllCust: '客户退货报表',
      retTitleOneSup: '供应商退货报表', retTitleAllSup: '供应商退货报表',
      retPrintTitle: '退货报表',
      colInvoice: '发票', colProduct: '产品', colQty: '数量', colValue: '金额', colReason: '原因',
      colParty: '往来方', period: '期间',
      noReturns: '没有已记录的退货', nothingToExport: '没有可导出的数据',
      nothingToSend: '没有可发送的数据', exportOk: '导出成功', exportFail: '导出失败',
      emailTo: '收件人', emailSubject: '主题', emailBody: '内容', emailInvalid: '邮箱地址无效',
      emailSent: '邮件已发送', emailFail: '发送邮件失败', cancel: '取消', send: '发送',
      mCash: '现金', mCcp: 'CCP', mCheck: '支票', mTransfer: '转账', customer: '客户', supplier: '供应商',
      settleAmount: '金额', settleMethod: '支付方式', settleNote: '备注',
      settleDefaultNote: '结清余额', signature: '电子签名', clearSig: '清除签名',
      settleSave: '保存结算', invalidAmount: '请输入有效金额',
      settleSaved: '结算已成功记录', pickOneParty: '请先选择特定往来方',
      groupAria: '快捷方式',
      btnSell: '销售', btnSellTitle: '销售 — 打开销售页面',
      btnQuick: '快速录入', btnQuickTitle: '快速录入',
      btnSmart: '智能添加', btnSmartTitle: '智能添加发票',
      btnCustomers: '客户往来', btnCustomersTitle: '客户往来',
      btnSuppliers: '供应商往来', btnSuppliersTitle: '供应商往来',
      btnDebts: '债务明细', btnDebtsTitle: '债务明细 — 应收与应付',
    },
    customers: {
      title: '客户', sub: '管理客户',
      search: '搜索客户...', add: '添加客户',
      col1: '名称', col2: '电话', col3: '地址', col4: '购买', col5: '余额', col6: '操作',
      empty: '暂无客户',
      addModalTitle: '添加新客户', editModalTitle: '编辑客户',
      formName: '客户名称', formNamePl: '例如：艾哈迈德',
      formPhone: '电话号码', formAddress: '地址', formAddressPl: '例如：阿尔及尔',
      formType: '客户类型', typeUnit: '零售', typeWhole: '批发', formTypeHelp: '设置销售页面的默认价格（可在购物车中按产品更改）',
      formDiscount: '折扣 (%)', formDiscountHelp: '从0.001%到100% - 可选', formCreditLimit: '信用限额（可选）', formCreditLimitHelp: '0 表示无限制 — 超出时会在销售时提醒',
      cancel: '取消', save: '保存',
      totalDebts: '客户总债务',
      totalPaid: '已付总额',
      totalCount: '客户总数',
    },
    employees: {
      title: '员工', sub: '管理员工、考勤与工资',
      search: '搜索员工...', add: '添加员工', empty: '暂无员工',
      totalCount: '员工总数', presentToday: '今日出勤',
      dueThisMonth: '本月应付', paidThisMonth: '本月已付',
      scanLabel: '扫描员工条码签到/签退...', scanReady: '准备扫描',
      scanNotFound: '未知条码 — 没有员工使用此条码',
      scanIn: '签到', scanOut: '签退',
      scanDone: '该员工今日已完成（签到与签退均已记录）',
      btnCheckIn: '签到', btnCheckOut: '签退', btnFixDay: '编辑', btnDelDay: '删除记录',
      statusActive: '在职', statusInactive: '停用',
      todayPresent: '出勤', todayAbsent: '缺勤', todayRest: '休息',
      worked: '时长', notOutYet: '尚未签退',
      addModalTitle: '添加新员工', editModalTitle: '编辑员工',
      formName: '员工姓名', formNamePl: '例如：穆罕默德',
      formPhone: '电话号码（可选）',
      formBarcode: '条码', formBarcodeGen: '生成',
      formBarcodeHelp: '每位员工唯一 — 不与其他员工或产品重复',
      formPhoto: '照片（可选）',
      formSalaryType: '工资类型', salaryMonthly: '月薪', salaryDaily: '日薪',
      formMonthly: '月薪 (DA)', formDaily: '日薪 (DA)',
      salaryHelp: '月薪始终按30天除：30000 → 1000/天（2月与31天月份不扣减）',
      formPayDay: '发薪日', formPayDayHelp: '1至31 — 每月工资结算日',
      timingSection: '工作时间', timingEnabled: '启用工时（迟到/早退扣款）',
      formWorkStart: '上班时间', formWorkEnd: '下班时间', formGrace: '宽限（分钟）',
      perSecond: '每秒费率',
      restSection: '工作日与休息日', restEnabled: '启用休息日',
      restWork: '工作', restPaid: '带薪休息', restUnpaid: '无薪休息',
      restHelp: '选择每天的状态。无薪休息日无出勤会从月薪中扣除；有出勤则按工作日计算。',
      formStatus: '状态', formNote: '备注',
      cancel: '取消', save: '保存', del: '删除员工',
      confirmDelete: '删除该员工及其考勤记录？（工资发放仍保留在支出中）',
      barcodeTaken: '该条码已被其他员工使用',
      nameRequired: '请输入员工姓名',
      invalidNumber: '请输入有效金额',
      settlement: '工资结算', month: '月份',
      colIn: '签到', colOut: '签退', colAbsents: '缺勤', colRest: '休息',
      colLate: '迟到', colEarly: '早退', colDeduct: '扣款',
      colGross: '合计', colNet: '净额', colState: '状态',
      units: '单位/天', days: '天', seconds: '秒',
      paid: '已付', unpaid: '未付', partial: '部分已付',
      btnPay: '发放', btnUnpay: '撤销发放',
      noAttendance: '本月无考勤记录 — 按完全缺勤计算',
      payTitle: '发放工资', payAmount: '金额', payMethod: '付款方式',
      paySuccess: '发放已记入支出',
      unpayConfirm: '撤销此发放？',
      payNothing: '无应发金额',
      badgeTitle: '员工工牌', badgePrint: '打印',
      barcodeMissing: '该员工没有条码',
      allowPopups: '请允许弹出窗口以进行打印',
      recTitle: '考勤记录', recIn: '签到', recOut: '签退',
      recLate: '迟到(秒)', recEarly: '早退(秒)', recEmpty: '本月无记录',
      recManual: '手动',
      editInTitle: '签到时间', editOutTitle: '签退时间',
      saveRec: '保存', dayOf: '日',
      statsHint: '缺勤由考勤记录推导：条码扫描或手动按钮',
    },
    stockTools: {
      syncBtn: '从 STOCK.FDB 同步库存',
      syncTitle: '从旧程序同步库存',
      syncHint: '每个商品的数量从旧数据库的 ARTICLES 表读取并应用到匹配的产品。这里不使用发票，因为旧库存已经包含它们 — 这正是数量翻倍（5 → 10）的原因。',
      current: '当前数量',
      legacy: '旧程序数量',
      difference: '差值',
      applyLabel: '应用',
      selectAll: '全选',
      noChanges: '没有差异 — 库存已与旧程序一致',
      applied: '已同步库存：',
      changedCount: '个产品',
      cantEdit: '您没有修改库存的权限',
      notMatched: '未匹配',
      matched: '已匹配',
      changed: '有差异',
      unmatchedCount: '未匹配',
      legacyTotal: '旧总数',
      currentTotal: '当前总数',
      readError: '无法从旧数据库读取 ARTICLES 表',
      empty: '旧数据库中没有商品',
      backupNote: '应用前已保存备份。',
    },
    balanceTools: {
      editTitle: '编辑余额',
      current: '当前余额',
      newBalance: '新余额（金额）',
      signToggle: '方向',
      owesUs: '欠我们',
      weOweHim: '在我们这里有余额（预付款）',
      weOwe: '我们欠他',
      owesUsSup: '在我们这里有余额（预付款）',
      hintCustomer: '正数：客户欠我们的。负数：客户在我们这里有预付款/余额。',
      hintSupplier: '正数：我们欠他的。负数：他在这里有预付款余额。',
      save: '保存余额',
      saved: '余额已成功更新',
      emptyEdit: '请输入有效的余额',
      cantEdit: '您没有编辑客户/供应商的权限',
      recalcBtn: '根据发票重新计算余额',
      recalcConfirm: '将根据数据库中现有的发票和付款重新推导所有客户和供应商的余额。会先保存备份。是否继续？',
      recalcDone: '余额已成功重新计算',
      noDiff: '无差异 — 余额已与发票账本一致',
      clients: '客户',
      suppliers: '供应商',
      syncBtn: '从 STOCK.FDB 同步余额',
      syncTitle: '从旧系统同步余额 (Gestion Stock)',
      syncHint: '以下值来自旧数据库：「已存储」= CREDIT_CLIENT/CREDIT_FOURNISSEUR，「已计算」= 销售/采购发票 (FC/FF) 和付款 (VC/VF) 的总计。',
      storedLabel: '已存储',
      computedLabel: '已计算',
      modeStored: '使用存储的余额 (CREDIT)',
      modeComputed: '使用从归档计算出的余额',
      applyLabel: '应用于所选',
      selectAll: '全选',
      noFirebird: '未打开旧数据库文件。请先在导入部分 (Gestion Stock) 打开 STOCK.FDB。',
      openFile: '打开 STOCK.FDB...',
      notMatched: '未匹配（旧库中未列出）',
      applied: '余额已更新：',
      changedCount: '个对象已更新',
      diffCount: '与当前不同',
      parties: '个对象',
      matchedFor: '旧数据库中的对象数：',
      noChanges: '没有可应用的更改',
      parseErr: '无法读取旧数据库',
      hybridTitle: '混合主体（客户 ⇄ 供应商）',
      hybridHint: '规则：已确认配对 = 客户与供应商表中完全相同的名称 + 两侧都有真实业务（销售/采购/付款）。旧程序将此人视为双向贸易的供应商，因此真实余额 = 客户信用 − 供应商信用（客户记录 = NET，供应商记录 = −NET）。其余配对为待审项（旧关联/相似名称）：除非手动勾选，否则保持独立并按存储余额处理。',
      sectionSingles: '单一主体',
      sectionHybrid: '混合主体',
      hybridCustCol: '客户',
      hybridSupCol: '供应商',
      hybridLinkCol: '关联',
      hybridCreditC: '客户信用',
      hybridCreditF: '供应商信用',
      hybridNetCol: '真实 NET',
      hybridSignNote: 'NET 为正 = 客户记录中欠我们；供应商记录显示 −NET（我们欠他）。',
      hybridCreate: '将新建',
      basisCf: 'Code CF',
      basisName: '名称',
      basisBoth: 'CF + 名称',
      basisDouble: '双向供应商（名称+业务）',
      basisConfirmed: '手动确认',
      hybridConfirmed: '已确认',
      hybridSuspect: '待审',
      hybridPairCount: '混合对',
      noHybrids: '数据库中无混合主体',
      oldBalance: '旧余额',
      newBalanceVal: '新余额',
      noPermissionTitle: '无权限',
    },
    debts: {
      title: '债务', sub: '管理债务与应收款',
      youOwe: '欠供应商的债务', youOwed: '客户欠您的债务',
      noDebts: '无未偿债务',
      logTitle: '债务记录',
      col1: '日期', col2: '类型', col3: '方', col4: '金额', col5: '状态', col6: '操作',
      empty: '无交易',
      totalInvoices: '发票总额', totalPurchases: '采购总额',
      balance: '余额', paid: '已付', paidToThem: '已付给他们',
      invoices: '发票', noInvoices: '无发票', payBtn: '支付',
      payments: '付款', noPayments: '无付款',
      net: '净应收', chooseSide: '从列表中选择一方', back: '返回',
      searchPlaceholder: '按姓名或电话号码搜索...', tabCustomers: '客户', tabSuppliers: '供应商',
      totalCustomerDebts: '客户欠您的债务', totalSupplierDebts: '您欠供应商的债务',
      recalcFromOldDb: '从旧版 Gestion Stock 数据库重新计算客户/供应商余额而不重新导入',
    },
    debtDetails: {
      title: '债务明细', sub: '客户与供应商应收应付款项总览',
      onCustomers: '客户欠款总额', onCustomersHint: '客户欠您的金额',
      toSuppliers: '您欠供应商的债务总额', toSuppliersHint: '您欠供应商的金额',
      toCustomers: '您欠客户的债务总额', toCustomersHint: '客户贷方余额（付款超过购买额）',
      fromSuppliers: '供应商欠您的债务总额', fromSuppliersHint: '供应商欠您的金额',
      exportCustomers: '导出客户列表', exportSuppliers: '导出供应商列表',
      groupAll: '全部往来方', groupOwing: '欠您款项的', groupOwed: '您欠款的',
      exportExcel: '导出 Excel', view: '查看',
      resultsTitle: '结果', emptyResults: '请从上方按钮选择查看选项以显示列表',
      noMatch: '没有符合此筛选的往来方',
      colIndex: '#', colName: '名称', colPhone: '电话', colAddress: '地址', colBalance: '余额', colStatus: '状态',
      statusOwingUs: '欠您', statusWeOwe: '您欠',
      total: '合计', countLabel: '往来方数量',
      filterAllCust: '全部客户', filterAllSup: '全部供应商',
      filterOwingCust: '欠您款项的客户', filterOwedCust: '您欠款的客户',
      filterOwingSup: '欠您款项的供应商', filterOwedSup: '您欠款的供应商',
      print: '打印', sheetTitle: '债务明细', dateLabel: '导出日期', by: '操作者',
      nothingToExport: '没有可导出的数据', exportOk: '导出成功', exportFail: '导出失败',
      customers: '客户', suppliers: '供应商',
      searchPh: '按客户或供应商名称或电话号码搜索...',
      searchHint: '输入至少两个字符即可同时搜索客户和供应商',
      searchResults: '搜索结果', noSearchResults: '没有匹配的结果',
      colType: '类型', typeCustomer: '客户', typeSupplier: '供应商', clear: '清除',
      alertsBtn: '债务提醒', alertsTitle: '债务提醒',
      alertsSub: '选择范围和期限；所有欠款超过该期限的往来方将进入关键债务列表。',
      scopeLabel: '范围', scopeCustomers: '客户', scopeSuppliers: '供应商', scopeBoth: '两者',
      stateLabel: '状态', enable: '启用', disable: '停用',
      durationLabel: '期限', durWeek: '一周', durTwoWeeks: '两周', durMonth: '一个月', durTwoMonths: '两个月',
      alertsSave: '保存', alertsCancel: '取消', alertsSaved: '已保存提醒设置',
      criticalTitle: '关键债务', criticalEmpty: '目前没有关键债务',
      criticalDisabled: '债务提醒未启用', critSearchPh: '按名称搜索关键债务...',
      colOwed: '应付金额', colAge: '账龄（天）', daysUnit: '天',
      reminderTitle: '提醒：关键债务', reminderMsg1: '有', reminderMsg2: '个往来方的债务超过了所选期限',
      reminderTotal: '应付总额', later: '稍后',
    },
    net: {
      title: '净账户', sub: '财务摘要',
      s1: '总销售额', s2: '总采购额', s3: '净利润', s4: '待处理金额',
      logTitle: '交易记录',
      col1: '日期', col2: '描述', col3: '类型', col4: '金额', col5: '余额',
      empty: '无近期交易',
      customerDebt: '欠我们的', supplierDebt: '我们欠的',
      purchaseInvoice: '采购发票', purchaseFrom: '发票来自',
      transferInvoice: '转移发票', receptionInvoice: '接收发票',
      purchases: '采购', paymentFrom: '付款来自', paymentFromSupplier: '从供应商收款：',
      paymentNote: '付款', paymentWalkin: '客户付款',
      salesPaid: '销售（已付）', supplierReceipt: '从供应商收款', paymentTo: '付款给',
      paymentToSupplier: '付给供应商', expenses: '支出',
      stockPurchase: '库存采购', stockPurchases: '库存采购',
      totalExpenses: '总支出', quickTitle: '快速录入', quickHint: '直接记账，不创建发票或修改库存。', purchaseAdd: '将金额添加到采购', expenseAdd: '添加到支出', quickNoteLabel: '备注（可选）', addBtn: '添加', invalidAmount: '请输入有效金额', directPurchase: '直接录入 - 采购', directExpense: '直接录入 - 支出',
      marginTitle: '利润率', periodLabel: '期间：', today: '今天', yesterday: '昨天', last7Days: '最近7天',
      totalMargin: '总利润率', periodMargin: '期间利润率', allTime: '自始至终',
      cashLabel: '现金', marginLabel: '利润', ccpPaidNote: '通过CCP支付',
      periodCash: '期间现金收入', totalCash: '总现金收入',
      detailTitle: '日志详情', detailMethod: '支付方式', detailNote: '备注', detailAmount: '金额',
      invoiceDetails: '发票总额', productCol: '产品', qtyCol: '数量',
      buyPriceCol: '采购价', sellPriceCol: '销售价', lineTotalCol: '合计',
      profitCol: '利润', marginPctCol: '利润率%', costEstimated: '成本为估算值（最近采购价）',
      by: '经办', byManager: '店长',
    },
    expenses: {
      title: '支出', sub: '记录净账户中的所有支出（含时间与日期）',
      totalLabel: '总支出', countLabel: '记录数',
      searchPlaceholder: '按发票、供应商或客户名称搜索...',
      allYears: '所有年份', allMonths: '所有月份', allDays: '所有日期', allLabel: '全部',
      addBtn: '添加支出', addTitle: '记录新支出',
      listTitle: '支出记录', showMore: '显示更多',
      reasonLabel: '原因', reasonPlaceholder: '例如：运输、电费、维修...', amountLabel: '金额', saveBtn: '保存支出',
      colDate: '日期', colDesc: '说明', colSource: '来源', colType: '类型', colMethod: '方式', colAmount: '金额',
      typeDirect: '直接支出', typeDispatch: '发送', typeStock: '库存采购', typeSupplier: '供应商付款', typePurchase: '采购发票', typeExpense: '支出', typeSalary: '工资',
      directExpense: '直接支出', noDesc: '无说明',
      mixedTotal: '总计', invalidAmount: '请输入有效金额', needReason: '请输入支出原因', saved: '支出记录成功',
      chooseYear: '选择年份', chooseMonth: '选择月份', chooseDay: '选择日期',
    },
    discounts: {
      title: '折扣', sub: '管理优惠和折扣',
      add: '添加折扣',
      col1: '产品', col2: '折扣率', col3: '开始日期', col4: '结束日期', col5: '状态', col6: '操作',
      empty: '暂无折扣',
      unregistered: '未注册', deleteConfirm: '删除此折扣记录？',
      totalDiscounts: '折扣总数', totalValue: '折扣总价值',
      colDate: '日期', colInvoice: '发票', colCustomer: '客户', colType: '类型', colRatio: '比例', colAmount: '金额', colActions: '操作',
      viewInvoice: '查看发票', searchPlaceholder: '按发票号或产品搜索...', periodAll: '全部', periodToday: '今天', period7: '7天', period30: '30天', period90: '90天',
    },
    returns: {
      title: '退货', sub: '管理退货和退款',
      add: '记录退货', export: '导出',
      col1: '退货号', col2: '发票', col3: '零件', col4: '数量', col5: '原因', col6: '日期', col7: '操作',
      empty: '暂无退货',
      time: '时间', defaultReason: '发票调整',
      printReturnInvoice: '打印退货发票',
      deleteConfirm: '删除此退货记录？',
      noReturnsExport: '无退货可导出',
      exportSuccess: '退货导出成功',
      exportError: '保存时出错: ',
    },
    returnInvoice: {
      noReturns: '此发票没有退货记录。',
      invoiceMissing: '找不到发票：无法打印退货发票。',
    },
    supplierReturns: {
      title: '损坏商品', sub: '管理退回给供应商的损坏商品',
      export: '导出', filterAll: '全部',
      statusPending: '退回中', statusReturned: '已退回', statusNotReturned: '未退回',
      colProduct: '商品', colQty: '数量', colAmount: '金额',
      colSupplier: '供应商', colInvoice: '发票', colDate: '日期',
      colStatus: '状态', colActions: '操作', colStore: '店铺/分店',
      empty: '暂无退回申请',
      noProduct: '商品不存在', noInvoice: '该商品没有采购发票',
      stock: '库存', supplier: '供应商', qty: '退回数量', invoice: '入库发票',
      note: '备注', notePlaceholder: '可选...',
      modalTitle: '将商品退回给供应商',
      notOwned: '无法修改其他店铺的申请',
      invalidQty: '请输入有效数量', qtyExceedsStock: '数量超过当前库存',
      qtyExceedsInvoice: '数量超过该发票上的数量',
      created: '退回申请已登记',
      confirmReturned: '确认已退回？\\n将从库存中扣减数量、减少供应商发票并影响净账户。',
      confirmNotReturned: '确认未退回？\\n库存和发票均不会发生变化。',
      insufficientStock: '当前库存不足', invoiceMissing: '未找到采购发票',
      lineMissing: '商品已不在该发票中',
      returnedSuccess: '已退回：从库存扣减并减少了供应商发票',
      delete: '删除申请', deleteReverse: '撤销退回',
      deleteConfirm: '删除退回申请？', deleteReturnedConfirm: '删除申请？\\n所有影响将被撤销（恢复库存并增加发票）。',
      deleted: '申请已删除',
      refundNote: '供应商商品退回',
      noExport: '没有可导出的数据', exportSuccess: '导出成功', exportError: '保存时出错: ',
    },
    productDetails: {
      title: '产品详情',
      batches: '批次',
      salesHistory: '销售记录',
      purchaseHistory: '供应商采购记录',
      returnsCount: '退货数量',
      customerReturns: '客户退货',
      supplierReturns: '供应商退货（损坏商品）',
      colDate: '日期', colQty: '数量', colPrice: '售价', colTotal: '总计',
      colBuyPrice: '采购价', colCustomer: '客户', colSupplier: '供应商', colInvoice: '发票',
      noData: '无数据',
      adviceTitle: '购买建议', adviceFrom: '请向此供应商采购', adviceLowest: '已付最低价', adviceCompare: '供应商比较',
    },
    reports: {
      title: '报告', sub: '高级销售和库存报告',
      c1: '销售报告', c1desc: '每日、每周和每月销售分析',
      c2: '库存报告', c2desc: '库存状态和零件流动',
      c3: '利润报告', c3desc: '利润和亏损',
      c4: '客户报告', c4desc: '客户群分析',
      dailySales: '每日销售', categoryDist: '按类别销售',
      bestSellers: '最畅销产品', brandSales: '按品牌销售',
      dailyBreakdown: '每日销售明细',
      period: '期间:', exportPDF: '导出PDF',
      period7: '最近7天', period30: '最近30天', period90: '最近3个月',
      period365: '最近一年', periodAll: '全部',
      noSales: '无销售', profit: '利润',
      returnsPieces: '退货（件）', pieces: ' 件',
      reportTitle: '销售与退货报告',
      periodLabel: '期间:', totalSales: '总销售额: ',
      totalProfit: '总利润: ', salesInvoiceCount: '销售发票数: ',
      returnsCount: '退货数: ', netSales: '净销售额: ',
      dailyDetails: '每日明细:', invoicesWord: ' 张发票',
      period2: '时段：', thisWeek: '本周', thisMonth: '本月', thisYear: '今年', custom: '自定义', specificDay: '指定日期',
      from: '从：', to: '到：', date2: '日期：', totalSales2: '总销售额', invoices2: '张发票', pieces2: '件',
      profit2: '利润', paid2: '已付', remaining2: '剩余', returnCount: '退货数量', value: '价值',
      netSales2: '净销售额', returnRatio: '退货率', profitMargin: '利润率',
      totalProfitMargin: '总利润率', ratioLabel: '比率', allTimeLabel: '总合计',
      salesVsReturns: '销售 vs 退货', net: '净', dailySalesVsReturns: '每日销售 vs 退货',
      salesTrend: '销售趋势', returnsTrend: '退货趋势', salesByCategory: '按类别销售',
      returnsByReason: '按原因退货', topProducts: '热销产品',
      productCol: '产品', barcodeCol: '条码', qtySoldCol: '已售数量', totalCol: '总计', profitCol: '利润',
      dailyDetail2: '每日销售与退货明细', dateCol: '日期',
      salesInvoicesCol: '销售发票', piecesSoldCol: '已售件数', salesValueCol: '销售价值',
      returnsCol: '退货', piecesReturnedCol: '退回件数', netDayCol: '当日净额',
    },
    reportsNet: {
      title: '净账户', period: '期间：', year: '年份：', specificDate: '指定日期',
      range: '范围', sales: '总销售额', purchases: '总采购额',
      expenses: '总支出', profit: '净利润',
      periodDebt: '待定（期间）', currentDebt: '待定（当前）',
      customerDebt: '欠我们的', supplierDebt: '我们欠的',
      periodMargin: '期间利润', totalMargin: '总利润',
    },
    zakat: {
      title: '天课计算', sub: '根据多数法学家的学说计算商业货物和资金的天课',
      nisabLabel: '本年度准备金（尼萨布）价值（DA）', nisabYear: '年份',
      nisabHint: '根据当地黄金/白银价格或本币手动输入',
      result: '应缴天课', resultSub: '净基数的四分之一十分之一（2.5%）',
      noNisab: '请先输入准备金额以确定天课义务',
      payable: '您必须缴纳', noZakat: '此财富无需天课——基数未达到准备金',
      deficit: '达到准备金所需的差额', reached: '基数已达到准备金——应缴天课',
      payNow: '支付天课', noAmount: '请先达到准备金再开启支付',
      payConfirm: '{year}年的天课金额（DA {amount}）将作为支出记录在支出日志中，并从结账账户中扣除，作为脱离您责任的财产。您确定吗？',
      paySuccess: '{year}年的天课已成功记录为支出。',
      alreadyPaid: '{year}年的天课已记录在支出中——同一年份不能重复支付。',
      stat1: '库存价值（市场价）', stat2: '现金流动性', stat3: '账户（邮政/银行）',
      stat4: '应收款项（可收回债务）', stat5: '应付款项（欠供应商）',
      stat6: '应课净基数', stat7: '准备金价值',
      stat8: '供应商处资金（应得款项）', stat9: '客户预付款（应付客户）',
      lqTitle: '现金与账户明细', lqSub: '收入减去支出（自记账起）+ 手动调整',
      lqCashIn: '现金收入', lqCashOut: '现金支出', lqNetCash: '现金净额',
      lqCcpIn: '邮政收入', lqCcpOut: '邮政支出', lqNetCcp: '邮政净额',
      lqAdj: '手动调整（期初余额/未记录的取款）', lqTotal: '总流动性',
      lqNote: '手动调整仅本地保存本年度；每个天课年度请重新核对。',
      invTitle: '库存明细 — 按市场价（零售）计价',
      invSub: '每种产品按单位售价计价，不考虑采购成本，符合多数法学家观点',
      invColProduct: '产品', invColQty: '数量', invColBasis: '计价基础',
      invColPrice: '价格（DA）', invColValue: '价值（DA）', invBasisRetail: '零售',
      invTotal: '库存总额', invEmpty: '无可计价库存',
      debtTitle: '债务', debtCustomers: '客户应收（可收回债务）',
      debtSuppliers: '应付供应商（到期）', debtColName: '名称', debtColBalance: '余额（DA）',
      debtAtSuppliers: '供应商处资金（预付款/超额付款）', debtOwedCustomers: '持有的客户预付款（须退回）',
      debtTotal: '合计', debtEmpty: '无',
      debtNote: '加入基数：客户应收款和供应商处资金（供应商负余额）；扣除：到期供应商债务和持有的客户预付款（客户负余额）。',
      methodTitle: '计算方法', methodRule: '应用的原则',
      methodB1: '库存按当前市场价（售价）计价，而非采购成本——现行商业价值。',
      methodB2: '现金和实物利润已隐含在基数中；不会重复计算。',
      methodB3: '可收回的应收款（客户）和供应商处资金加入基数；到期应付款和持有的客户预付款予以扣除。',
      methodB4: '基数达到准备金后，按净基数的2.5%计算天课。',
      methodProfit: '参考净利润（根据净账户）：',
      methodProfitNote: '仅作利润跟踪说明；已包含在上述库存和现金中。',
      print: '打印天课报告', reportTitle: '天课计算报告', reportDate: '签发日期',
      countBtn: '库存盘点', countSub: '清点实际数量并与系统数量核对；保存时仅更正有差异的行。',
      countSearch: '按名称或条码搜索...', countAdd: '添加', countAddAll: '添加所有产品',
      countClear: '清空列表', countClearConfirm: '将清空整个盘点列表。继续？',
      countColProduct: '产品', countColSystem: '系统数量', countColActual: '实际数量',
      countColDiff: '差异', countColRemove: '删除',
      countEmpty: '尚未添加产品。请搜索并添加产品，或使用“添加所有产品”。',
      countNoResults: '无匹配结果', countAlreadyAdded: '该产品已在盘点列表中。',
      countRows: '行数', countDiffs: '差异行',
      countSave: '保存盘点', countPrint: '打印盘点表',
      countNoChanges: '没有需要保存的差异——实际数量与系统数量一致。',
      countConfirm: '将更正 {n} 个产品的库存数量。不会记录任何支出或销售。继续？',
      countSaved: '盘点已保存并更正 {n} 个产品。',
      countNoPermission: '无权盘点——仅限管理员。',
      countFixedNote: '非计量产品——不计入天课价值',
      countSheetTitle: '库存盘点表', countDate: '盘点日期',
      countSign: '盘点人签名', countSignManager: '管理员签名',
    },
    backup: {
      title: '备份', sub: '管理数据备份',
      c1: '创建备份', c1desc: '保存数据库副本',
      c1btn: '<i class="fas fa-save"></i> 导出',
      c2: '恢复备份', c2desc: '从以前的备份恢复数据',
      c2btn: '<i class="fas fa-upload"></i> 导入',
      prevTitle: '以前的备份',
      empty: '没有以前的备份',
      restore: '恢复', creating: '正在创建备份...',
      operationCancelled: '操作已取消',
      createSuccess: '✓ 备份已创建 — ',
      createFailed: '✗ 保存失败: ',
      readingFile: '正在读取文件...',
      readFileFailed: '✗ 读取失败: ',
      invalidFile: '✗ 无效文件 — 无数据',
      restoreConfirm: '恢复备份？',
      store: '商店: ', date: '日期: ',
      content: '内容:\\n',
      products: '产品', invoices: '发票',
      customers: '客户', suppliers: '供应商',
      payments: '付款', returns: '退货',
      discounts: '折扣', unknown: '未知',
      dataWarning: '⚠️ 所有当前数据将被完全替换！',
      restoreCancelled: '恢复已取消',
      restoreSuccess: '✓ 数据恢复成功。重新打开页面以刷新。',
      restoreError: '✗ 错误: ',
      readFileFailed2: '✗ 读取失败: ',
      invalidFile2: '✗ 无效文件',
      restoreFromFileConfirm: '恢复',
      restoreFromFileWarning: '所有当前数据将被替换。',
      restoreFromFileSuccess: '✓ 已从恢复 ',
      restoreTitle: '恢复备份',
      retagLabel: '使用当前代码重新标记数据',
      retagHint: '仅当备份来自不同代码的商店时才启用。启用后，恢复的记录（产品、发票、订单等）将使用当前商店代码重新标记，以便在界面中显示。',
      retagWarn: '注意：启用后会将旧商店的数据归属于当前商店。如果备份来自同一商店，请保持关闭。',
      retagCurrent: '当前商店代码：',
      restoreSuccessRetag: '✓ 数据已恢复并使用当前代码重新标记。重新打开页面以刷新。',
      restoreFromFileSuccessRetag: '✓ 已重新标记并恢复自 ',
      deleteAllConfirm: '⚠️ 删除所有数据？',
      deleteAllDetails: '所有产品、发票、客户、供应商、付款、退货和折扣将被清除。',
      deleteAllWarning: '此操作不可撤销！',
      deleteAllBackupHint: '请在继续前创建备份。',
      deleteAllFinalConfirm: '最终确认：删除所有数据？\\n没有备份将无法恢复。',
      deleteAllDone: '✓ 所有数据已清除。使用"恢复"来恢复数据。',
      clearData: '清除数据', clearDataDesc: '清除应用中所有数据 — 用于测试备份恢复',
      deleteAllBtn: '删除所有数据',
    },
    sharedInventory: {
      title: '共享库存', sub: '查看主店和关联分店库存',
      searchAll: '搜索所有商店', searchAllPlaceholder: '按名称或条码搜索哪个商店有该产品...',
      loading: '加载数据中...', backToList: '返回列表',
    },
    migration: {
      title: '从以前的程序导入', cardTitle: '从以前的程序导入',
      cardDesc: '从其他程序导入数据（CSV、Excel、数据库...）',
      cardBtn: '从以前的程序导入',
      dropHere: '拖放文件到此处或点击浏览',
      supportedFormats: '支持：CSV、Excel、JSON、XML、SQL、SQLite (.db)、dBASE (.dbf)、Firebird (.fdb)、Sable Stock (.gssp/.zgssp)、任何文本',
      reading: '读取文件中...', readError: '读取文件出错',
      selectTable: '选择包含零件的表：',
      preview: '数据预览', columns: '列',
      mapColumns: '列映射',
      mapHint: '已尝试自动映射 — 请检查并按需调整',
      noMapping: '未映射',
      back: '上一步', next: '下一步',
      totalRows: '总行数：', mappedFields: '已映射字段：',
      moreRows: '更多行...',
      importBtn: '导入数据',
      needNameOrBarcode: '至少需要映射产品名称或条码',
      importing: '导入中...', importSuccess: '导入成功完成',
      productsImported: '个产品已导入', importError: '导入错误',
      cannotRead: '无法读取文件', parseError: '解析文件错误',
      forceTypeLabel: '文件类型（手动）：', forceAuto: '自动（检测到的类型）',
      forceTypeHint: '正常情况请保持“自动”——仅当程序无法识别旧备份时才更改。',
      engineHintSql: 'SQL Server（LocalDB）操作未能完成——请查看下方详细错误；必要时请检查管理员权限以及安装包中是否包含 SqlLocalDB.msi',
      engineHintFirebird: '无法启动 Firebird 引擎——请检查安装包中是否包含 gbak.exe、fbclient.dll 和 VC++ 运行库',
      engineHintSqlite: '无法加载 SQLite 引擎（sql.js）——请检查安装是否完整',
      engineHintGeneric: '无法按检测到的类型打开文件——请尝试手动选择类型',
      unsupportedDbType: '此数据库类型需要手动导出',
      exportHint: '从旧程序导出为CSV或Excel格式，然后重试',
      aiAnalyzing: 'AI分析中...',
      aiError: 'AI错误',
      aiDone: 'AI分析完成',
      aiAnalyzed: '已由AI分析',
      chooseMode: '选择处理方法',
      modeHint: '本地处理快速，使用自动匹配。AI处理智能分析数据以理解非结构化文本。',
      localMode: '本地处理',
      localHint: '快速自动匹配',
      aiMode: 'AI处理',
      aiHint: '通过您选择的AI提供商进行智能分析',
      aiRequiresKey: '* AI处理需要在设置中配置API密钥',
      mssqlNoPath: '无法访问备份文件路径',
      mssqlOpenError: '无法打开 SQL Server (.bak) 备份',
      mssqlNoTables: 'SQL Server 备份中找不到可读的表',
      firebirdNoPath: '无法访问Firebird数据库文件路径',
      firebirdNoTables: '数据库中找不到可读的表',
      firebirdOpenError: '无法打开Firebird数据库',
      firebirdTableError: '无法读取表',
      selectRole: '该表包含什么？',
      roleHint: '选择数据类型以便正确导入',
      roleProducts: '零件 / 产品',
      roleCustomers: '客户',
      roleSuppliers: '供应商',
      needName: '至少需要映射名称字段',
      importDone: '导入成功完成',
      roleSalesInvoices: '销售发票',
      rolePurchaseInvoices: '采购发票',
      importedNote: '已导入',
      oldInvoiceNote: '导入的发票',
      oldPaymentNote: '导入的付款',
      restoringBackup: '正在恢复备份 (gbak)...',
      preparingEngine: '正在准备 SQL Server 引擎...',
      rolePayments: '付款',
      loadingBrands: '正在读取品牌...',
      brandEmpty: '无品牌',
      fullImportPanelTitle: '完整数据导入',
      fullImportPanelDesc: '检测到 Sable Stock / Gestion Stock 数据库 — 您可以一次性导入所有内容：客户、供应商、带价格的产品、发票和退货。',
      fullImportBtn: '完整导入',
      fullImportPopupTitle: '选择要导入的品牌',
      fullImportPopupHint: '选择您要导入产品的品牌。无品牌的产品始终会被导入。',
      selectAll: '全选',
      cancelImport: '取消',
      confirmImport: '开始导入',
      creatingBackup: '导入前正在创建备份...',
      productsNone: '未导入任何产品（请检查品牌选择）',
      markBackfilled: '已为现有产品恢复品牌标记',
      fullImportDone: '完整导入完成',
      gsspReading: '正在打开 Sable Stock 备份...',
      gsspNotSable: '此文件不是有效的 Sable Stock 备份',
      gsspBadPassword: '无法打开 Sable Stock 备份——此版本的备份密码未知',
      gsspPanelDesc: '检测到 Sable Stock (GSSP) 备份——可一次性导入全部内容：客户、供应商、带价格的产品、销售发票、现金销售和付款，并保留真实日期。',
      gsspSaleLine: '销售',
      gsspCashLine: '现金销售',
      gsspCashLabel: '现金发票',
      gsspInvoiceNote: 'Sable Stock 发票',
      gsspCashNote: 'Sable Stock 现金发票',
      gsspPaymentNote: 'Sable Stock 付款',
      gsspSkipped: '已存在',
      returnsCount: '退货',
      avoirReason: '退货 (Avoir)',
      walkin: '散客',
      dispatchNote: '发送单备注', dispatchNotePlaceholder: '将打印在发送单上的备注...',
    },
    brandCat: { brand: '品牌', category: '选择零件类型', searchPlaceholder: '搜索类型...', addProduct: '添加产品', noCategories: '暂无分类', addCategory: '添加分类', products: '商品' },
    catProducts: { title: '产品', sub: '可用产品', searchPlaceholder: '搜索产品...', addProduct: '添加产品', empty: '此分类无产品', addInvoiceTitle: '添加产品到发票', scanPlaceholder: '扫描条码...', scannerReady: '准备扫描', searchProduct: '搜索产品', newProduct: '新产品', searchExisting: '按名称或条码搜索', searchExistingPlaceholder: '产品名称或条码...', name: '产品名称', namePlaceholder: '零件名称', barcode: '条码', barcodePlaceholder: '输入条码', generate: '生成', qty: '数量', buyPrice: '进价', sellPrice: '售价', supplier: '供应商', supplierPlaceholder: '按名称搜索供应商...', cancel: '取消', addToCart: '添加到发票购物车', cartTitle: '发票购物车', total: '总计:', clear: '清空',       confirmInvoice: '确认发票', fiscalStamp: '印花税 (Timbre Fiscal)', wholesalePrice: '批发价' },
    settings: {
      title: '设置', sub: '应用程序设置',
      printSettingsBtn: '打印设置',
      general: '常规设置',
      storeName: '店铺名称', currency: '货币', language: '语言', buttonSound: '按钮声音', introSound: '开场声音',
      productQR: '显示产品二维码', productQRHint: '启用后，库存和销售页面的产品卡片会显示小二维码。默认关闭，并在此设备上记住选择。',
      openIsolated: '打开独立窗口', createShortcut: '桌面快捷方式',
      isolatedHint: '在独立的窗口和进程中打开该公司，数据与其他公司完全隔离。',
      snapshotDone: '公司快照已准备好。', snapshotError: '无法准备公司快照：',
      openDone: '独立窗口已打开。', openError: '无法打开独立窗口：',
      shortcutDone: '桌面快捷方式已创建。', shortcutError: '无法创建快捷方式：',
      isolatedOnly: '此窗口仅专用于一家公司。',
      staleBuild: '当前安装版本较旧，不包含独立公司窗口。请关闭程序并重新启动更新版本，或安装 3.3.6。',
      notif: '低库存通知',       autoBackup: '自动备份',
      info: '关于',
      version: '版本', developer: '开发者', company: '公司', lastUpdate: '最后更新',
      invoiceLogo: '企业标志（发票）',
      logoUpload: '上传企业标志', logoPreview: '预览标志', logoRemove: '移除',
      logoLayout: '标志的位置、大小和不透明度', logoSize: '大小', logoOpacity: '不透明度',
      logoLocalHint: '仅保存在本机，绝不上传到云端。',
      logoPreviewHint: '这是标志在打印发票上的显示效果。', logoPreviewBw: '黑白',
      logoSaved: '企业标志已保存', logoRemoved: '标志已移除',
      logoImportFailed: '无法导入标志', logoNone: '未加载标志',
      logoRemoveConfirm: '从发票中移除此企业标志？',
    },
    chart: { sales: '销售额', inventory: '库存', returns: '退货' },
    connection: {
      title: '连接设置', sub: '云连接和商店管理',
    },
    btn: {
      newInvoice: '新建发票', addPart: '添加零件', export: '导出',
      addSupplier: '添加供应商', addCustomer: '添加客户', addDiscount: '添加折扣',
      addReturn: '记录退货',
    },
    common: {
      save: '保存', cancel: '取消', delete: '删除', edit: '编辑', confirm: '确认',
      close: '关闭', print: '打印', loading: '加载中...', processing: '处理中...',
      noResults: '无结果', empty: '空', search: '搜索',
      noPermission: '您没有权限执行此操作',
      noAccessHint: '您无权访问任何页面。请联系管理员。',
      page: '页', of: '/', product: '产品', piece: '件', invoice: '发票',
      qty: '数量', total: '总计', paid: '已付', remaining: '剩余', debt: '债务',
      date: '日期', name: '名称', status: '状态', actions: '操作',
      yes: '是', no: '否', success: '成功', error: '错误', warning: '警告',
      areYouSure: '确定吗？', stock: '库存', price: '价格',
      addItem: '添加', removeItem: '移除', clearCart: '清空购物车',
      ready: '就绪', done: '完成', notFound: '未找到', outOfStock: '缺货',
      lowStock: '库存不足', new: '新', provisional: '临时',
      paidFull: '全额付款', paidPartial: '部分付款', unpaid: '未付款',
      manual: '手动', customer: '客户',
      back: '返回', pay: '付款', payFull: '全额付款', searchAll: '搜索全部', refresh: '刷新', confirmPay: '确认付款',
      barcode: '条码', brand: '品牌', category: '分类', supplier: '供应商',
      address: '地址', phone: '电话', email: '邮箱', username: '用户名', password: '密码',
      generate: '生成', fiscalStamp: '税票', cart: '购物车', clear: '清空',
      subtotal: '小计', discount: '折扣', totalAfterDiscount: '折扣后总额',
      payNow: '已付金额', remainingDebt: '剩余(债务)', fullPayment: '全额付款', noPayment: '无付款',
      real: '真实', formal: '形式', customerDiscount: '客户折扣', additionalDiscount: '额外折扣',
    },
    sales: {
      title: '销售', sub: '创建新的销售发票',
      searchParts: '搜索零件', searchPlaceholder: '按零件名称或编号搜索...',
      emptySearch: '输入以开始搜索零件',
      emptyResults: '无搜索结果', emptyProducts: '无产品',
      cart: '购物车', cartEmpty: '购物车为空', total: '总计:',
      checkout: '结账',
      unavailable: '不可用', lowStockTip: '库存不足',
      scannerReady: '就绪', scannerDone: '完成', scannerNotFound: '未找到', scannerUnavailable: '不可用',
      scannerMultiple: '多个结果 — 请从列表中选择商品',
      noCustResults: '无结果', discount: '折扣',
      del: '删除',
      fullyPaid: '全额付款', partialPay: '部分付款', enterPaid: '输入已付金额',
      cartEmptyAlert: '购物车为空', notAvailableQty: '所需数量不可用', available: '可用:',
      paidExceedsTotal: '已付金额不能超过总计',
      fullPaymentNote: '销售时全额付款', partialPaymentNote: '销售时部分付款',
      overpayTitle: '已付金额超过应付款', overpayMsg: '已付金额大于发票总额。是否继续并记录超出部分？', overpayContinue: '继续',
      creditWarn: '超出客户信用限额', creditWarnMsg: '本次销售将导致客户余额超出限额 — 是否继续？', creditLimit: '信用限额', projectedBalance: '销售后的预计余额', creditContinue: '继续销售', creditBlocked: '无法超出信用限额 — 请调整购物车或选择其他付款方式', creditDebtMsg: '该客户必须先结清以前的欠款才能继续此操作',
      discountType: '客户', discountManual: '手动', lineDiscount: '行折扣',
      clearCartConfirm: '清空购物车？',
      customer: '客户', customerPlaceholder: '搜索客户...', unregistered: '未注册客户', remove: '移除',
      pickSubCustomer: '选择子客户',
      cartTitle: '购物车', subtotal: '小计', customerDiscount: '客户折扣', additionalDiscount: '额外折扣',
      totalLabel: '总计', paidLabel: '已付金额', payFull: '全额付款', remainingLabel: '剩余',
      clear: '清空', checkout: '结账', emptyCartTitle: '购物车为空', emptyCartHint: '扫描商品条码或从产品列表选择',
      scanPlaceholder: '扫描条码或按名称搜索...', searchPlaceholder2: '按名称或条码搜索...', productsCount: '0 件产品', multiBatches: '多批次', mixedPrice: '混合价格', unit: '件', wholesale: '批发', unlimited: '无限', freeBtn: '销售未登记商品', freeTitle: '销售未登记商品', freeHint: '库存中没有该商品的档案：数量与价格手工输入，不从库存扣减。', freeName: '商品名称（可选）', freeNamePh: '留空则显示「库存中不存在的产品」', freeQty: '数量', freePrice: '单价', freeTotal: '合计', freeAdd: '加入购物车', freeDefaultName: '库存中不存在的产品', freeTag: '未登记', freeNoCost: '无成本', freeQtyBad: '请输入大于零的数量', freePriceBad: '请输入商品价格',
      payMethod: '支付方式', payCash: '现金', payCcp: 'CCP', payBoth: '两者',
      cashAmount: '现金金额', ccpAmount: 'CCP金额',
      marginBtn: '利润率设置', marginTitle: '最低利润率', marginHint: '按标价与成本计算：不得低于允许的最低价。',
      marginEnabled: '启用最低价', marginRetail: '零售 %', marginWholesale: '批发 %', marginStore: '全店',
      marginRules: '例外（类别、品牌或产品）', marginScopeCat: '类别', marginScopeBrand: '品牌', marginScopeProduct: '产品',
      marginPick: '选择', marginAdd: '添加例外', marginRemove: '删除', marginNone: '无例外',
      marginPwd: '门店密码', marginPwdBad: '密码错误', marginSaved: '利润率设置已保存',
      marginWarn: '该价格低于最低利润率', marginMin: '允许的最低价', marginContinue: '继续', marginAccept: '使用最低价',
    },
    orders: {
      title: '订单', sub: '向供应商订购缺失零件',
      tabMine: '我的订单', tabBranches: '分店订单',
      suggestions: '库存不足建议', noSuggestions: '没有库存不足或缺货的产品——很好！',
      search: '按名称或条码搜索...',
      all: '全部', today: '今天', week: '本周', month: '本月', year: '今年',
      refresh: '刷新',
      empty: '暂无订单——请从建议或搜索中添加',
      statusPending: '待处理', statusDone: '已完成', statusNotAvailable: '无货',
      btnDone: '已完成', btnNotAvailable: '无货', btnDelete: '删除',
      deleteConfirm: '删除此订单？',
      cloudRequired: '查看分店订单需要云连接',
      loading: '正在加载分店订单...',
      noBranchOrders: '暂无分店订单',
    },
    invoices: {
      title: '发票', sub: '所有销售和采购发票',
      search: '搜索发票...', newInvoice: '新建发票', quickEntry: '快速录入', smartAdd: '智能添加',
      col1: '发票号', col2: '日期', col3: '客户', col4: '金额', col5: '状态', col6: '操作',
      empty: '暂无发票', noMatch: '无匹配发票',
      resultsInfo: ' 张发票',
      typeSale: '销售发票', typeSupplier: '供应商发票', typeWaybill: '发货单 / 送货单',
      typeProforma: '形式发票', typeDispatch: '发送单', typeTransfer: '转移发票',
      typeReception: '接收发票', typePurchase: '采购发票',
      newPaymentInvoice: '收款凭证', typePayment: '收款凭证',
      paymentInvoiceTitle: '新建收款凭证',
      paymentInvoiceDesc: '记录从客户或供应商收到的现金（收入），或不产生现金的供应商欠款凭证（无发票余额变动）。',
      payFromCustomer: '从客户收款', payFromSupplier: '从供应商收款', payToSupplier: '供应商欠款凭证',
      supplierDebtNote: '欠款凭证（无现金 — 不计入收入）',
      payParty: '客户 / 供应商', payOutstanding: '当前余额（欠款）',
      payAmount: '凭证金额', payMethod: '付款方式', payNote: '备注（可选）',
      confirmPayment: '保存凭证', receivedLabel: '已收',
      selectPayCustomer: '选择客户', selectPaySupplier: '选择供应商',
      payPartySearch: '搜索客户或供应商...', noDebt: '无欠款', owedOn: '应收（他欠我们）', owedFor: '应付（我们欠他）',
      customerBalance: '客户余额', supplierBalance: '供应商余额',
      overpayWarn: '金额超过当前余额 — 客户当前余额：',
      chooseParty: '请选择客户或供应商', paymentInvoiceSaved: '凭证 {n} 已保存',
      cannotPayVoucher: '收款凭证已结清，不能添加付款',
      cannotEditVoucher: '收款凭证为只读，不能编辑',
      custVoucherNote: '收款凭证 — 无发票余额结算',
      suppVoucherNote: '供应商欠款凭证 — 无发票余额变动',
      suppReceiptNote: '供应商收款 — 无发票余额结算',
      badgeProvisional: '临时',
      printReturnInvoice: '打印退货发票',
      returnNote: '退货备注',
      returnNoteHint: '此发票有 {count} 条退货，合计 {amount} — 打印退货发票查看退货明细。',
      itemCount: '件', paidLabel: '已付', unpaidLabel: '未付', remainingLabel: '剩余',
      pageInfo: '页', allowPopups: '请允许弹出窗口以进行打印',
      cannotPayReception: '不能为接收发票添加付款',
      cannotPayProforma: '不能为形式发票添加付款',
      fullyPaidAlert: '发票已全额支付', invalidAmount: '金额无效',
      transferPayNote: '转移发票付款', regularPayNote: '通过发票付款',
      paymentSaved: '付款记录成功',
      cannotEditDispatch: '不能编辑发送单',
      cannotEditReception: '不能编辑接收发票',
      cannotEditProformaWaybill: '不能编辑临时发货单',
      noPermission: '您无权查看此发票',
      editTitle: '编辑发票',
      editHelpSupplier: '供应商发票：增加数量增加库存和供应商余额。',
      addFromScratch: '从零添加',
      qeUndoRemove: '撤销',
      addFromScratchConflict: '条码冲突：另一个相同条码的产品具有不同详情',
      editHelpCustomer: '编辑数量、单价和每行折扣。增加从库存扣除，减少返回库存。总计自动计算 = (价格 × 数量) − 折扣。',
      scanPlaceholder: '扫描条码或输入产品名称...',
      editColProduct: '产品', editColCurrentQty: '当前数量', editColNewQty: '新数量',
      editColDiscount: '折扣', editColLineTotal: '行合计',
      saveEdits: '保存编辑', cancelEdit: '取消',
      scanDone: '完成', scanReady: '就绪', scanNotFound: '未找到', resultCount: '结果',
      availableStock: '可用:', notInStock: '无库存', badgeNew: '新',
      cannotBelowZero: '不能将"..."的数量设为零以下',
      insufficientStock: '"..."库存不足',
      noQtyChanged: '未更改任何数量',
      noChangesMade: '未做任何更改',
      invoiceEdited: '发票编辑成功',
      deleteConfirm: '确定删除此发票？产品将退回库存。',
      cannotDeleteReception: '不能删除接收发票',
      cannotDeleteSold: '不能删除 - 产品"..."已被售出',
      invoiceDeleted: '发票已删除',
      transferEditTitle: '编辑转移发票',
      transferEditHelp: '编辑数量。增加减少您的库存并添加到接收方。减少添加到您的库存。',
      currentTotal: '当前总计:', editColSellPrice: '售价',
      newTotal: '新总计:', diff: '差额:',
      paidEditLabel: '已付金额', paidEditHint: '修改已付现金；对方余额、净账户、支出、销售和利润将自动更新。',
      paidEditNote: '已修改已付金额', paidEditRemaining: '剩余:', paidEditCredit: '贷方余额',
      deleteLine: '删除行', addFreeLine: '添加手动行',
      freeLineBadge: '手动行', freeLineNamePlaceholder: '项目名称（非库存商品）',
      freeLineNameRequired: '请输入手动行的名称', freeLineQtyRequired: '手动行数量必须大于零',
    },
    inventory: {
      title: '库存', sub: '管理零部件库存',
      search: '搜索库存...', add: '添加零件', export: '导出',
      col1: '编码', col2: '零件名称', col3: '品牌', col4: '数量', col5: '进价', col6: '售价', col7: '操作',
      empty: '库存为空',
      customizeBtn: '自定义按钮', customizeTitle: '自定义库存页面按钮',
      customizeHint: '选择要在库存页面显示的按钮。您的选择会自动保存在此设备上。',
      customizeShowAll: '全部显示',
      transferBranch: '转移到分店或总店',
      transferMain: '转移到分店',
      scannerReady: '准备扫描', scannerProcessing: '处理中...',
      scannerFound: '找到:', scannerDone: '扫描完成',
      scannerNewBarcode: '新产品 - 条码', scannerNew: '新产品',
      noResults: '无结果',
      enterName: '请输入产品名称', enterBarcode: '请输入条码',
      clearCartConfirm: '清空发票购物车？', cartEmpty: '发票购物车为空',
      invoiceSaved: '发票已登记，金额', fiscalStamp: '印花税',
      includes: '包含', productUnit: '产品', pieceUnit: '件',
      editLabelName: '产品名称', editLabelBarcode: '条码', editLabelBrand: '品牌',
      editLabelCategory: '类别', editLabelQty: '数量', editLabelBuyPrice: '进价', editLabelSellPrice: '售价', editLabelWholesale: '批发价',
      editTitle: '编辑产品',
      diagnoseBtn: '诊断', diagTitle: '产品诊断报告',
      diagDuplicateYes: '重复：同一产品有多张卡片', diagDuplicateNo: '无重复（单张卡片）',
      diagGroupCount: '共享此标识/条码的卡片数',
      diagVerdictLabel: '可能原因', diagVerdictSingle: '单张卡片（无重复）',
      diagVerdictSplit: '智能分离：价格/成本/保质期不同 — 属预期行为',
      diagVerdictIndependent: '独立重复：标识相同但被创建两次（缓存过期/第二个窗口或不同路径）',
      diagVerdictIdentity: '标识字段不同（名称/品牌/参考/产地/标记）— 被视为两个不同产品',
      diagScope: '当前范围', diagCompany: '公司：', diagStore: '门店：',
      diagInScope: '范围内', diagOutScope: '范围外',
      diagSupplierDiff: '卡片之间的供应商不同 — 这解释了一张有供应商、一张没有。',
      diagSupplierSame: '各卡片的供应商相同。',
      diagCreated: '创建时间', diagSource: '来源', diagSupplier: '供应商', diagQty: '数量',
      diagBuy: '进价', diagSell: '售价', diagRealCost: '实际成本',
      diagSplitReason: '分离原因', diagSplitFrom: '分离自', diagCurrent: '当前', diagNone: '无',
      diagIdentityDiff: '标识不同',
      diagQtyCheck: '数量核对', diagGroupQty: '卡片总数量', diagPurchaseQty: '采购发票数量', diagPurchaseLines: '采购行数',
      diagQtyOk: '数量与采购发票一致。', diagQtyMismatch: '数量与采购发票不一致 — 可能重复录入或手动修改。',
      diagAudit: '此产品的操作日志', diagNoAudit: '此产品没有记录的操作。', diagReason: '原因',
      diagHint: '相同条码的两张卡片 = 智能分离（价格/成本不同）或独立创建。请查看“分离原因”列和来源。',
      diagNotFound: '未找到产品。',
      deleteConfirm: '确定删除此产品？',
      importSuccess: '已导入', importSuccessEnd: '件产品',
      importCost: '采购成本:', importRecorded: '已记录到净账户',
      importFailed: '导入失败。请检查文件格式。',
      addWithInvoice: '添加库存 + 发票', transferBtn: '转移产品', exportExcel: '导出Excel', exportXlsxTitle: '将库存导出为Excel', exportWithBuy: '导出含采购价', exportWithoutBuy: '导出不含采购价', exportExcludeZero: '排除数量为零的产品', exportExcludeZeroHint: '将记住您的选择并用于后续导出', exportSkippedZero: '已排除数量为零的产品：', exportSheetTitle: '库存清单', exportDate: '导出日期', exportCount: '产品数量', exportBy: '操作者', exportTotal: '总计', noExport: '没有可导出的数据', exportSuccess: '导出成功', exportError: '保存时出错：', colName: '产品名称', colBarcode: '条码', colBrand: '品牌', colMark: '型号', colReference: '参考号', colCountry: '原产国', colStorage: '存放位置', colQty: '数量', colBuyPrice: '采购价', colSellPrice: '售价', colWholePrice: '批发价', colExpiry: '有效期至', exportCSV: '导出CSV', importCSV: '导入CSV / Excel', addDirect: '无发票添加产品', addDirectTitle: '无发票添加产品', addDirectBtn: '将产品添加到库存', addDirectHint: '产品直接添加到库存，不创建采购发票。采购价格可选。', barcodeConflict: '此条码已注册到另一个产品', invalidBarcode: '条码无效', entryDestination: '财务入账方向（采购价 × 数量）',
      addTitle: '添加库存 + 发票', scanPlaceholder2: '扫描条码...',
      searchExisting: '搜索现有产品（按名称或条码）', searchExistingPlaceholder: '产品名称或条码...',
      category: '类别', name: '产品名称', barcode: '条码', generate2: '生成',
      qty: '数量', buyPrice: '进价', sellPrice: '售价', wholesalePrice: '批发价', supplierOptional: '供应商（可选）',
      supplierSearchPlaceholder: '搜索供应商...', addToCart: '添加到发票购物车',
      invoiceCart: '发票购物车', fiscalStamp2: '印花税', totalLabel: '总计:',
      clear2: '清空', confirmInvoice: '确认发票', categoryCol: '类别',
      quickAdd: '添加固定产品', quickAddTitle: '添加固定产品', quickAddHint: '固定产品（如餐厅菜品）：直接添加，无需数量、无需进价、不创建发票。', quickAddNamePlaceholder: '例如：大汉堡', quickAddBtn: '添加产品', quickAddSuccess: '产品添加成功', quickAddUpdated: '产品价格已更新', optional: '（可选）', invalidSell: '请输入有效的售价',
    },
    transfer: {
      loading: '加载中...', chooseDest: '选择目的地', mainStore: '总店',
      loadError: '加载目的地时出错',
      scannerProcessing: '处理中...', scannerFound: '找到:', scannerDone: '扫描完成',
      scannerNotFound: '没有条码为', scannerNotInStock: '的产品', scannerNotFoundShort: '未找到',
      noResults: '无结果', stock: '库存:',
      selectDestFirst: '请先选择目的地商店',
      searchFirst: '请先搜索产品', qtyZero: '数量必须大于零',
      qtyExceeds: '请求的数量', qtyExceedsAvail: '超过可用量',
      buyPriceZero: '进价必须大于零',
      donationLabel: '免费发送产品（捐赠）',
      donationWarning: '警告：转移发票将显示余额为0，接收发票对接收方也将显示余额为0。',
      donationNote: '捐赠（免费转移）',
      available: '可用:',
      clearCartConfirm: '清空转移购物车？', scannerReady: '准备扫描',
      selectDest: '请选择目的地商店', cartEmpty: '转移购物车为空',
      paidExceedsTotal: '已付金额不能超过总计',
      confirmTitle: '确认转移:', confirmFrom: '从:', confirmTo: '到:',
      confirmProducts: '产品:', confirmTotal: '总计:', confirmPaid: '已付:', confirmRemaining: '剩余(债务):',
      confirmContinue: '是否继续？',
      productNotFound: '产品"..."在库存中未找到',
      stockLessThanNeeded: '"..."的可用量不足',
      payNote: '付款 - 转移到',
      transferSuccess: '转移发票创建成功！',
      transferredProducts: '已转移产品:', transferTotal: '总计:',
      transferPaid: '已付:', transferRemaining: '剩余(债务):',
      transferError: '转移时出错:',
      sub: '在商店之间转移产品并记录债务',
      senderStore: '发送商店', destination: '目的地',
      chooseDestination2: '-- 选择目的地 --', selectDestination: '选择目标商店',
      scanPlaceholder2: '扫描条码...', searchExisting: '在库存中搜索产品（按名称或条码）',
      searchPlaceholder2: '产品名称或条码...', productDataTitle: '转移产品数据',
      productName: '产品名称', availableQty: '可用数量', transferQty: '转移数量',
      buyPrice: '进价', sellPrice2: '售价', brand2: '品牌', category2: '类别',
      addToCart2: '添加到转移购物车', transferCart: '转移发票购物车', totalLabel2: '总计:',
      clear3: '清空', paymentSection: '付款与债务', payNow2: '已付金额',
      remainingDebt2: '剩余(债务):', fullPayment2: '全额付款', noPayment2: '无付款',
      confirmTransfer: '确认并执行转移发票',
    },
    settings: {
      title: '设置', sub: '应用设置',
      general: '常规设置',
      storeName: '商店名称', currency: '货币', language: '语言',
      productQR: '显示产品二维码', productQRHint: '启用后，库存和销售页面的产品卡片会显示小二维码。默认关闭，并在此设备上记住选择。',
      openIsolated: '打开独立窗口', createShortcut: '桌面快捷方式',
      isolatedHint: '在独立的窗口和进程中打开该公司，数据与其他公司完全隔离。',
      snapshotDone: '公司快照已准备好。', snapshotError: '无法准备公司快照：',
      openDone: '独立窗口已打开。', openError: '无法打开独立窗口：',
      shortcutDone: '桌面快捷方式已创建。', shortcutError: '无法创建快捷方式：',
      isolatedOnly: '此窗口仅专用于一家公司。',
      staleBuild: '当前安装版本较旧，不包含独立公司窗口。请关闭程序并重新启动更新版本，或安装 3.3.6。',
      notif: '低库存通知', autoBackup: '自动备份',
      info: '关于',
      version: '版本', developer: '开发者', company: '公司', lastUpdate: '最后更新',
      settingsSaved: '设置已保存',
      wrongPassword: '当前密码不正确',
      verifyError: '验证错误:',
      passwordMinLength: '密码至少需要4个字符',
      passwordsNoMatch: '密码不匹配',
      passwordSaved: '密码保存成功',
      errorPrefix: '错误:',
      colPage: '页面', colView: '查看', colEdit: '编辑', colDelete: '删除',
      enterUsername: '请输入用户名', enterPassword: '请输入密码',
      userUpdated: '用户更新成功', userCreated: '用户创建成功',
      noPerms: '无权限',
      delete_user_confirm: '确定删除用户"..."？',
      storeAddress: '商店地址', phoneNumber: '电话号码', enableFiscalStamp: '在发票中启用印花税',
      fiscalRatio: '比例:', fiscalMin: '最低 5 DA - 最高 10,000 DA',
      fiscalPercent: '%（基本系统为0%）', lowStockThreshold: '低库存阈值',
      lowStockHint: '低于此数量视为低库存', saveSettings: '保存设置',
      storePasswordCard: '商店密码', storePasswordDesc: '为保护商店，请创建密码。没有密码无法以经理身份登录。',
      currentPassword: '当前密码', currentPasswordPlaceholder: '如果是新密码请留空',
      newPassword: '新密码', newPasswordPlaceholder: '商店密码',
      confirmPassword: '确认密码', confirmPasswordPlaceholder: '再次输入密码',
      savePassword: '保存密码',
      lanCard: '局域网同步',
      lanDesc: '通过路由器将此设备与同一商店的另一台设备连接，实时同步所有销售、入库和编辑操作。',
      lanRole: '设备角色',
      lanOff: '已禁用',
      lanMain: '主服务器（静态IP设备）',
      lanSub: '从服务器（第二个收银台）',
      lanLocalIps: '本设备IP地址',
      lanLocalIpHint: '在Windows/路由器设置中将其中一个设为静态IP，并在从设备上输入相同地址。',
      lanServerIp: '主服务器IP地址',
      lanPort: '端口',
      lanPortHint: '从4512开始，若被占用则自动更换',
      lanStatus: '同步状态',
      lanStatusOff: '同步已禁用',
      lanStatusMainOn: '主服务器运行中',
      lanStatusMainOff: '主服务器已停止',
      lanStatusClients: '已连接设备',
      lanStatusSubOn: '已连接主服务器',
      lanStatusSubOff: '未连接主服务器',
      lanListeningPort: '实际端口',
      lanFirewallHint: '如果从设备无法连接，请允许此程序通过Windows防火墙（专用网络）：设置 → 隐私和安全 → Windows防火墙 → 允许应用通过防火墙。',
      lanTest: '测试连接',
      lanTestWait: '正在测试...',
      lanTestOk: '连接成功 — 服务器在此端口可用',
      lanTestFail: '连接失败',
      lanTestRefused: '此地址/端口上没有服务器',
      lanTestTimeout: '超时 — 端口可能被阻止或地址错误',
      lanTestUnreachable: '地址无法访问 — 请确保两台设备在同一网络',
      lanSaved: '同步设置保存成功',
      lanIpRequired: '请先输入主服务器IP地址',
      lanRemoteReset: '远程清空分店数据',
      lanRemoteResetConfirm: '这将远程清空分店设备的所有数据并从本主服务器重新同步。确定吗？',
      printerCard: "通过局域网共享打印机",
      printerDesc: "将此设备上连接的打印机共享给其它收银机，或将服务器打印机设为本机默认。",
      printerShareSide: "共享本机打印机（服务器）",
      printerInstallSide: "在本机使用服务器打印机（客户端）",
      printerSelect: "本地打印机",
      printerLoading: "加载中",
      printerNone: "无打印机",
      printerDefaultNow: "当前默认打印机",
      printerShareName: "共享名称",
      printerShareNow: "共享",
      printerUnshare: "取消共享",
      printerSharedOk: "打印机共享成功 - 可用路径：",
      printerUnsharedOk: "打印机已取消共享",
      printerServerHost: "服务器地址",
      printerBrowse: "浏览打印机",
      printerConnect: "连接并设为默认",
      printerMakeDefault: "设为默认",
      printerConnected: "打印机已连接",
      printerDriverInf: '驱动程序 INF 路径（如果未安装）',
      printerInstallDriver: "安装驱动程序",
      printerDrvShare: "或服务器上的共享驱动文件夹",
      printerInstallDriverShare: "从共享文件夹安装",
      printerDriverInstalled: "打印机驱动程序已成功安装",
      printerFixDesc: "需要管理员权限，并会自动重启打印后台服务。",
      printerFixNow: '修复网络打印问题 (0x0000011b / 0x00000709)',
      printerFixOk: "修复已应用，打印服务已重启",
      printerTest: "打印测试页",
      printerTestTitle: "打印测试页",
      printerSelectFirst: "请先选择打印机",
      printerHostRequired: "请输入服务器地址",
      printerLookForDrv: "请先选择驱动程序文件（INF）",
      printerBusy: "查询中",
      printerNoneShared: "该服务器上没有发现共享打印机",
      printerWorking: '工作中...',
      printerInstalling: "正在安装",
      printerUnknownErr: "发生意外错误",
      printerNeedAdmin: "此操作需要管理员权限（请接受 UAC 提示）—— 或手动在 Windows 设置中操作。",
      printerAccessDenied: "远程设备访问被拒绝。请确保已在 Windows 中启用打印机共享，并允许 Everyone 访问该打印机。",
      printerHostUnreachable: "无法连接服务器 —— 请确保两台设备在同一网络，且名称/地址正确。",
      printerDriverMissing: '未安装本地驱动程序',
      printerDriverMissingHint: '请先从上方 INF 或共享文件夹安装驱动程序，然后重试。',
      printerDriverNightmare: "此设备缺少打印机驱动程序或存在安全限制（PrintNightmare）。请安装驱动后重试，或先点击“修复打印问题”按钮。",
      printerDefaultSet: "打印机已设为默认",
      lanRemoteResetSent: '已向分店发送清空指令 — 它将清空并在片刻后重新同步。',
      usersCard: '用户管理', usersDesc: '创建用户并设置应用权限。',
      addUser: '添加用户', newUser: '新用户',
      companiesCard: '公司管理(多公司)', companiesDesc: '在此设备上创建多个公司并在其数据之间切换。每家公司都拥有独立的数据(产品、发票、客户、供应商...)。',
      addCompany: '添加公司', newCompany: '新公司',
      companyName: '公司名称', companyNamePlaceholder: '例如: 现代汽车配件',
      companyStoreName: '公司所属门店名称', companyStoreNamePlaceholder: '例如: 现代汽车配件 - 总店',
      companyPassword: '公司密码', companyPasswordPlaceholder: '以该公司经理身份登录的密码',
      companyActiveHint: '当前活动公司: ',
      enterCompany: '作为公司经理登录', exitCompany: '退出公司范围',
      confirmDeleteCompany: '确定要删除此公司及其所有数据吗? 此操作无法撤销。',
      resetCompanyData: '清空公司数据',
      confirmResetCompanyData: '删除该公司所有数据: ... 此操作无法撤销!',
      confirmResetCompanyDataFinal: '再次确认: 该公司所有产品、发票、客户、供应商、付款、退货、订单和转账将被删除。继续?',
      resetCompanyDataDone: '公司数据已清空 (… 条记录)。',
      noCompanies: '暂无公司',
      companyNameRequired: '公司名称必填',
      companyStoreCodes: '此公司关联的分支机构', companyStoreCodesHint: '选择一个或多个分支机构（留空 = 此公司不会显示给任何分支机构）', companyNoBranches: '尚未创建分支机构',
      companyLegalTitle: '法定识别信息(打印时显示)',
      companyPhone: '电话', companyAddress: '地址', companyNis: 'NIS', companyNif: 'NIF', companyRcc: 'RCC / RC', companyArticle: 'ARTICLE',
      userCompany: '公司',
      companyManageDenied: '公司管理仅主商店可用。',
      companyNotPermitted: '该用户无法分配到这家公司；该门店/分支机构尚未获得授权。',
      companyNoPermitted: '该门店/分支机构没有授权公司',
      companyUpdated: '公司修改已保存',
      companyCreated: '公司创建成功',
      companyIsActive: '当前活动公司',
      enteredCompany: '您现已进入此公司的范围。今后仅显示该公司的数据。',
      userName: '用户名', userNamePlaceholder: '用户名',
      userPassword: '密码', userPasswordPlaceholder: '密码',
      permissions: '权限',
    },
    storeDebts: {
      title: '商店债务', sub: '按转移发票分类的债务',
      storeCount: '商店数', owedToUs: '应收', weOwe: '应付',
      netDebt: '净债务', transferInvoices: ' 张转移发票',
      owedLabel: '应收:', weOweLabel: '应付:', paidLabel: '已付:',
      totalDebt: '总债务', totalInvoices: '总发票',
      paid: '已付', remaining: '剩余',
      typeTransfer: '转出', typeReception: '接收',
      statusPaid: '已付', statusRemaining: '剩余',
      noTransfers: '无转移发票',
      payTitle: '支付分期', total: '总计:', paidPreviously: '已付:',
      payAmount: '支付金额', confirmPay: '确认付款', back: '返回',
      noInvoices: '无发票', invoiceDetails: '发票详情',
      invoiceActionsPrint: '打印', invoiceActionsPay: '付款', invoiceActionsEdit: '编辑',
      printChoiceTitle: '选择打印类型', printChoiceDesc: '您要如何打印此发票？', printNormal: '普通打印', printEmployee: '员工打印', employeeDocTitle: '备货单',
      printTotalTitle: '打印合计',
      printTotalNet: '折扣后', printTotalGross: '折扣前',
      printTotalNetDesc: '单价不变 + 折扣行', printTotalGrossDesc: '仅显示合计，不显示折扣',
      printTotalHintNet: '按原单价打印，随后是折扣行，最后是折扣后合计。',
      printTotalHintGross: '仅打印折扣前合计，不显示任何折扣行。',
      paidAfterDiscount: '折扣后',
      cardDiscountTag: '折扣',
      cardDiscountTitle: '含折扣发票 — 打开后按 i 查看折扣率和真实成本',
      discountOnInvoiceBanner: '此发票含折扣 — 按 {i} 或点击此提示查看折扣率、真实成本和折后合计（{net}）。',
      invoiceActionsDelete: '删除', invoiceActionsClose: '关闭',
      totalDebtLabel: '总债务', emptyPlaceholder: '无转移发票',
    },
    branchesMonitor: {
      title: '分支监控', sub: '从一处监控和管理所有分支',
      loading: '加载数据中...',
      online: '在线', offline: '离线',
      productCount: ' 件产品', saleCount: ' 笔销售',
      viewDetails: '查看详情',
      noData: '无数据', noInventory: '无库存', noInvoices: '无发票',
      productsLabel: '产品:', invoicesLabel: '发票:',
      tabInventory: '库存', tabInvoices: '发票', tabPurchases: '采购', tabNet: '净账户',
      notAvailable: '无',
      sold: '已付', provisional: '临时',
      transferIncome: '转移收入', transferCost: '转移成本',
      totalSales: '总销售', totalPurchases: '总采购',
      netAccount: '净账户',
      searchPlaceholder: '搜索产品...',
      noSearchResults: '所有商店无结果',
      outOfStock: '缺货', inStock: '有库存',
      searchAll: '搜索所有商店', searchAllPlaceholder: '按名称或条码搜索哪个商店有该产品...',
      branchCount: '分支数', totalProducts: '总产品数', totalRevenue: '总收入',
      branchesList: '分支列表', refresh: '刷新', noBranches: '无注册分支',
      backToList: '返回列表', products: '产品', invoices: '发票',
      sales: '销售', purchases: '采购发票', loadingPlaceholder: '加载中...',
    },
    chart: { sales: '销售额', inventory: '库存', returns: '退货' },
    connection: {
      title: '连接设置', sub: '云连接和商店管理',
      connected: '已连接到云端',
      mainConnected: '总店 - 已连接到 Supabase',
      branchConnectedMsg: '分店已连接到总店',
      mainStore: '总店', branch: '分店',
      branchParenthetical: '(分店)',
      enterCredentials: '输入凭证以开始',
      logoutConfirm: '确定要退出登录吗？',
      cloudRequired: '请先连接到云端',
      uploading: '正在上传...', noChanges: '没有更改需要上传',
      uploadSuccess: '上传成功',
      uploadBackupBtn: '上传备份',
      lanSubUploadMsg: '此设备为 LAN 从服务器：数据上传由该站点的主服务器完成',
      enterStorePassword: '输入商店密码以下载:',
      wrongPassword: '密码错误',
      verificationError: '验证错误: ',
      backupEmpty: '备份为空',
      restoreSuccessMsg: '恢复成功 - 请重启应用',
      restoreBackupBtn: '恢复备份',
      lastSync: '上次同步: ',
      branchNameRequired: '请输入分店名称',
      passwordRequired: '请输入密码',
      branchCreated: '分店已创建 - 代码: ',
      passwordLabel: '密码: ',
      viewStock: '查看库存', deleteBranchBtn: '删除分店',
      deleteBranchConfirm1: '确定删除分店 "',
      deleteBranchConfirm2: '无法恢复。',
      enterStorePasswordView: '输入商店密码以查看分店库存:',
      noBranchStock: '此分店无库存',
      barcode: '条码', brand: '品牌', sellPrice: '售价',
      emailRequired: '请输入有效邮箱',
      searching: '搜索中...', noPassword: '无密码',
      savingPassword: '正在保存新密码...',
      userInfoTitle: '用户信息', emailLabel: '邮箱', codeLabel: '您的代码',
      storeTypeLabel: '商店类型', mainCodeLabel: '主代码',
      statusTitle: '未连接', statusDesc: '输入连接凭证以开始',
      statusBadge: '未连接', connTab: '连接', backupTab: '备份',
      branchesTab: '分店', recoveryTab: '账户恢复',
      cloudStatusCard: '云连接状态', cloudStatusDesc: '云连接是自动的。所有数据安全存储。',
      logoutBtn: '退出登录', uploadCard: '上传备份', uploadDesc: '云端现有备份将被替换...',
      pushTitle: '手机通知', pushDesc: '创建产品订单或变质商品退货时，即使网站已关闭，也会立即向您的手机发送通知。',
      siteUrlLabel: '网站链接', siteUrlPlaceholder: 'https://...',
      pushSaveBtn: '保存', pushUrlRequired: '请输入网站链接', pushUrlInvalid: '网站链接无效',
      pushSaved: '设置已保存',
      autoBackup: '自动备份', backupInterval: '间隔（分钟）',
      min1: '1分钟', min2: '2分钟', min5: '5分钟', min10: '10分钟', min30: '30分钟',
      uploadBtn: '上传备份', restoreBtn: '恢复备份',
      branchesCard: '分店', branchesDesc: '分店管理仅限总店使用。',
      addBranch: '添加新分店', branchName: '分店名称', branchNamePlaceholder: '例如：市中心分店',
      branchPassword: '密码', branchPasswordPlaceholder: '分店密码',
      saveBranch: '保存分店', cancel2: '取消', addNewBranch: '添加新分店', refreshBtn: '刷新',
      noBranches2: '无注册分店', branchStock: '分店库存: ',
      recoveryCard: '账户/密码恢复', recoveryDesc: '输入关联账户的邮箱...',
      search2: '搜索', storeNameLabel: '商店名称', codeResult: '代码', passwordResult: '密码',
      changePassword: '更改密码', searchAgain: '再次搜索',
      newPasswordLabel: '新密码', newPasswordPlaceholder2: '至少4个字符',
      confirmPasswordLabel: '确认密码', confirmPasswordPlaceholder2: '再次输入密码',
      saveNewPassword: '保存新密码',       backBtn: '返回',
      scannerTab: '手机扫码枪', scannerCard: '无线条码扫描器',
      scannerDesc: '将店内网络中的任何手机变成无线条码扫描器，结果直接输入条码字段（与有线扫描器相同）。服务为完全本地的HTTPS并带私有证书——数据不会离开店铺。',
      scannerEnable: '启用手机扫码枪',
      scannerFirewall: '检查防火墙权限',
      scannerStep1: '启用服务并用手机扫描二维码（同一Wi-Fi网络）。',
      scannerStep2: '打开页面，将摄像头对准商品条码或销售发票。',
      scannerStep3: '手机首次打开时此处会出现批准窗口——选择“始终”或“本次会话”。',
      scannerStep4: '每次读取的代码会自动输入到打开的条码字段。',
      scannerStep5: '第一次可能出现“不安全”警告——点更多/继续；安装一次后证书即受信任。',
      certHelpTitle: '在手机上安装安全证书（真正安装应用所需）',
      certHelpDesc: '如果您点过警告中的“继续”，请从下方链接安装一次证书后重新打开页面；否则 Chrome 只会提供桌面快捷方式。',
      certHelpOpen: '打开安装指南',
      certHelpCopy: '复制指南链接',
      scannerDevices: '已配对设备', scannerNoDevices: '暂无配对设备',
      scannerStarting: '正在启动服务…', scannerStarted: '手机扫码枪运行中',
      scannerStartError: '手机扫码枪启动失败', scannerStopped: '手机扫码枪已停止',
      scannerRunning: '运行中', scannerError: '错误',
      scannerFwChecking: '正在检查防火墙权限…', scannerFwOk: '防火墙权限正常',
      scannerFwNeedsPermission: '已拒绝管理员权限——请先启用扫描器或手动允许防火墙规则',
      scannerPairTitle: '手机配对请求', scannerPairAlways: '始终',
      scannerPairSession: '本次会话', scannerPairDeny: '拒绝',
      scannerRemove: '移除', scannerRemoveConfirm: '移除并阻止此设备？',
      scannerSell: '销售', scannerSellTitle: '允许此手机在门店进行销售',
      psaleCard: '手机销售终端（销售）',
      psaleDesc: '让员工在高峰期用手机销售：在门店同一网络打开销售页面，每位员工选择自己的名字，即可面向客户和供应商销售，支持折扣与价格控制。销售直接在电脑上执行——发票、库存与余额在所有设备上即时更新。',
      psaleEnable: '启用手机销售',
      psaleEnabled: '手机销售现已开启', psaleDisabled: '手机销售现已关闭',
      psaleRunning: '手机销售已启用', psalePaused: '销售已暂停——请在上方启用',
      psaleStep1: '开启销售，并用同一部扫码手机或新手机扫描二维码（此处将出现批准）。',
      psaleStep2: '打开“ZMT 销售”页面，在顶部选择员工。',
      psaleStep3: '搜索配件，加入购物车，选择客户/供应商、折扣与支付方式。',
      psaleStep4: '确认销售——发票、库存与余额即刻在电脑上更新。',
    },
    pd: {
      tab: '价格显示屏',
      saved: '已保存',
      tabDesc: '全屏播放商店视频，扫描任何条码时显示售价3秒钟后自动继续播放视频。数据与文件均保存在本机。',
      enable: '启用价格显示屏',
      enabled: '已启用',
      disabled: '已停用',
      videosTitle: '视频片段',
      videosDesc: '片段按顺序播放后循环重复，不上传云端——仅复制到程序本地数据目录。',
      videosAdd: '添加视频',
      videosEmpty: '还没有视频',
      videoAdded: '已添加片段',
      mediaTitle: '图片和视频',
      mediaDesc: '按顺序播放并循环：图片按自身时长停留，视频完整播放。不上传云端——仅复制到程序本地数据目录。',
      mediaAddImage: '添加图片',
      mediaAddVideo: '添加视频',
      mediaEmpty: '还没有图片或视频',
      imageAdded: '已添加图片',
      logoTitle: '商店商标',
      logoDesc: '显示在屏幕顶部和价格旁边，仅在价格显示屏上显示。',
      logoPick: '选择图片',
      logoClear: '移除',
      logoSaved: '已保存商标',
      colorsTitle: '颜色与字体',
      bg: '页面背景色',
      priceColor: '数字（价格）颜色',
      nameColor: '店名颜色',
      nameSize: '店名字号',
      priceSize: '数字字号',
      font: '字体',
      tickerTitle: '底部滚动条',
      tickerDesc: '底部白色滚动条显示程序商标、ZMT SOFTWARE 和联系方式。',
      tickerOn: '显示底部滚动条',
      tickerPhone: '滚动条中的电话',
      tickerMail: '滚动条中的邮箱',
      autoLoginTitle: '自动进入价格显示屏',
      autoLoginDesc: '启动程序时自动登录此账户且不需密码，直接全屏打开显示屏。',
      autoLoginOn: '启用自动登录',
      autoLoginUser: '账户',
      autoLoginPass: '密码',
      autoLoginNeed: '请选择账户并输入密码',
      autoStartTitle: '随 Windows 启动',
      autoStartDesc: '开机时自动打开程序，然后直接进入价格显示屏。',
      autoStartOn: '启动 Windows 时运行程序',
      pinTitle: '锁定码',
      pinDesc: '退出显示屏时需要（锁按钮或 Ctrl+Shift+P）。留空则使用商店密码。',
      pinLabel: '锁定码',
      pinSave: '保存码',
      pinShort: '至少3位',
      noAccount: '— 选择账户 —',
      noVideos: '还没有视频',
      noVideosHint: '在 连接设置 ← 价格显示屏 标签添加视频',
      currency: 'دج',
      notFound: '未找到商品',
      scanPlaceholder: '在此扫描条码',
      lockTitle: '管理员码',
      lockPlaceholder: '输入码',
      cancel: '取消',
      unlock: '解锁'
    },
    rest: {
      tab: '餐厅',
      enable: '启用餐厅功能',
      enabled: '餐厅已开启',
      disabled: '餐厅已关闭',
      roleLabel: '本设备角色',
      roleSend: '发送方 — 发送订单（服务员）',
      roleReceive: '接收方 — 接收订单（厨房/收银）',
      roleNone: '设备未参与',
      roleNoneHint: '请先开启餐厅并选择角色。',
      nameLabel: '本设备名称',
      namePlaceholder: '例：厨房1 或 服务员艾哈德',
      tablesLabel: '桌号列表',
      tablesAdd: '添加桌台',
      tablesHint: '输入桌号后点添加。发送方也可自由输入桌号。',
      printerLabel: '厨房小票打印机',
      printerDefault: '默认打印机',
      printerListBtn: '刷新列表',
      permsTitle: '设备权限（管理员）',
      permsDesc: '设置每台设备的权限：发送、控制状态、确认销售。',
      permSend: '发送',
      permControl: '控制状态',
      permConfirm: '确认销售',
      deviceCol: '设备',
      nameCol: '名称',
      roleCol: '角色',
      savePerms: '保存权限',
      permSaved: '权限已保存并广播',
      myDevice: '本设备',
      onlyManager: '权限管理仅限管理员',
      pageTitle: '本地订单',
      pageSub: '局域网上的餐厅订单',
      ordersEmpty: '尚无订单',
      outgoing: '我发送的订单',
      incoming: '发至本设备的订单',
      qtyLabel: '数量',
      priceLabel: '价格',
      time: '时间',
      actions: '操作',
      statusCol: '状态',
      tableCol: '桌号',
      senderCol: '发送方',
      receiverCol: '接收方',
      itemsCol: '商品',
      orderBtn: '订单',
      orderSelfBtn: '为自己下单',
      selfReceiver: '本设备（我自己）',
      cartTitle: '餐厅订单托盘',
      cartSub: '核对商品后发送到后厨',
      clear: '清空',
      emptyCart: '托盘为空 — 请在任意商品点“订单”',
      emptyCartHint: '商品会在此逐个添加，然后再发送',
      close: '关闭',
      notesPlaceholder: '例如：不要洋葱、微辣…',
      orderSent: '订单发送成功',
      receiverLabel: '接收方',
      noReceivers: '没有在线接收方',
      tableLabel: '桌号',
      tablePlaceholder: '选择或输入桌号',
      notesLabel: '备注',
      send: '发送订单',
      addedToCart: '已加入托盘',
      newOrder: '新订单',
      cancel2: '关闭',
      cancel: '取消',
      inprogressBtn: '进行中',
      doneBtn: '已完成',
      confirmBtn: '确认销售',
      confirmTitle: '确认订单销售',
      confirmSub: '核对金额并选择支付方式',
      itemsCount: '件商品',
      noActions: '当前没有可用操作',
      payMethod: '支付方式',
      payCash: '现金',
      payCcp: 'CCP',
      payConfirm: '确认支付与销售',
      customerLabel: '客户（可选）',
      stockShort: '库存不足 — 订单仍为“新”',
      failed: '操作失败',
      saleOk: '销售已完成，发票和库存已更新',
      ticketTitle: '厨房小票',
      tablePrefix: '桌',
      fromLabel: '来自：',
      itemCol: '商品',
      invoiceTitle: '销售发票',
      sellerLabel: '售货员：',
      paidLabel: '已付：',
      remainLabel: '余额：',
      thanks: '感谢光临',
      statusNew: '新',
      statusInprogress: '进行中',
      statusDone: '已完成',
      statusConfirmed: '已确认',
      statusCancelled: '已取消',
      orderNo: '订单#',
      sent: '订单已发送',
      done: '已完成',
      ticketPrinted: '厨房小票已打印',
      noTable: '请输入桌号',
      total: "合计",
      all: "全部",
    },
    login: {
      loginSubtitle: '选择登录方式', managerTab: '经理', userTab: '用户', newAccountTab: '新账户', branchTab: '分店',
      codeLabel: '10位数代码', storePassword: '商店密码', passwordPlaceholder: '输入密码',
      chooseCompany: '选择公司', enterNow: '进入', chooseEmployee: '选择员工', employeePlaceholder: '员工姓名', needCompany: '请先选择公司',
      loginManager: '以经理身份登录', forgotPassword: '忘记密码？',
      storeCode: '商店代码', storeCodePlaceholder: '输入商店代码（10位数）',
      usernameLabel: '用户名', usernamePlaceholder: '用户名',
      userPassword: '密码', loginAsUser: '以用户身份登录',
      emailLabel: '邮箱', createAccount: '创建账户', createPasswordLabel: '商店密码（可选，但建议填写以用于激活）',
      mainStoreCode: '总店代码', branchPassword: '分店密码', branchLogin: '以分店身份连接',
      accountCreatedTitle: '账户创建成功！', accountCreatedDesc: '请将此代码保存在安全处，恢复数据时需要。',
      accountCreatedWarning: '此代码无法恢复，请写下或拍照。', enterApp: '进入应用',
      recoveryTitle: '密码恢复', recoverySubtitle: '输入邮箱查看代码和密码',
      searchBtn: '搜索', backToLogin: '返回登录',
      storeNameSpan: '商店名称：', codeSpan: '代码：', passwordSpan: '密码：',
      loginWithCode: '使用代码登录', resetPassword: '重置密码',
      searchAgainLink: '再次搜索', newPasswordTitle: '设置新密码',
      newPassLabel: '新密码', newPassPlaceholder: '输入新密码',
      confirmPassLabel: '确认密码', confirmPassPlaceholder: '再次输入密码',
      saveNewPass: '保存新密码', backLink: '返回',
    },
  },
};
const LANG_ORDER = ['ar', 'en', 'fr', 'zh'];
// ===== PRODUCT FAMILY + SUBSTITUTE i18n (injected into the main dictionaries) =====
(function patchLANG() {
  const sets = {
    ar: {
      'quickEntry.title': 'الإدخال السريع', 'quickEntry.subtitle': 'فاتورة شراء سريعة — F1 للإغلاق',
      'quickEntry.hint': 'F1 للإغلاق • الأسهم للتنقّل • + سطر جديد',
      'quickEntry.selectSupplier': 'اختيار المورّد بالاسم...', 'quickEntry.supplier': 'المورّد', 'quickEntry.noSupplier': 'لا يوجد مورّد بهذا الاسم',
      'quickEntry.searchProduct': 'ابحث عن منتج (اسم، باركود، مارك)...', 'quickEntry.createNew': 'إنشاء منتج جديد',
      'quickEntry.scanPlaceholder': 'امسح باركود المنتج...', 'quickEntry.scanReady': 'جاهز للمسح',
      'quickEntry.scanAdded': 'تمت إضافة', 'quickEntry.scanIncremented': 'زيادة الكمية', 'quickEntry.scanNew': 'منتج جديد — أكمل بياناته',
      'quickEntry.addRow': 'إضافة سطر', 'quickEntry.qty': 'الكمية', 'quickEntry.buyPrice': 'سعر الشراء', 'quickEntry.sellPrice': 'سعر البيع', 'quickEntry.wholesalePrice': 'سعر البيع بالجملة',
      'quickEntry.brand': 'العلامة', 'quickEntry.reference': 'المرجع', 'quickEntry.plu': 'PLU الميزان', 'quickEntry.pluPlaceholder': 'مثال: 00123', 'quickEntry.barcode': 'الباركود', 'quickEntry.countryOfOrigin': 'البلد المنشأ', 'quickEntry.mark': 'المارك', 'quickEntry.storageLocation': 'مكان التخزين',
      'quickEntry.family': 'العائلة', 'quickEntry.extraPrices': 'أسعار بيع إضافية (اختياري)', 'quickEntry.minPrice': 'السعر الأدنى', 'quickEntry.minPricePlaceholder': '0 = بدون حد',
      'quickEntry.confirm': 'تأكيد الفاتورة', 'quickEntry.cancel': 'إلغاء', 'quickEntry.total': 'الإجمالي', 'quickEntry.timbre': 'طابع جبائي',
      'quickEntry.purchaseDiscount': 'خصم الشراء %', 'quickEntry.invoiceDiscount': 'خصم الفاتورة',
      'quickEntry.grossTotal': 'الإجمالي قبل الخصم', 'quickEntry.productDiscount': 'خصم المنتجات', 'quickEntry.realTotal': 'الإجمالي الحقيقي',
      'quickEntry.fixedAmount': 'مبلغ ثابت',
      'quickEntry.noSupplierWarn': 'يرجى اختيار المورّد أولاً', 'quickEntry.emptyWarn': 'أضف منتجاً واحداً على الأقل',
      'quickEntry.success': 'تم تسجيل فاتورة بقيمة', 'quickEntry.barcodeConflict': 'هذا الباركود مسجّل لمنتج آخر',
      'quickEntry.expiryRequired': 'تاريخ انتهاء الصلاحية إلزامي — الرجاء إدخاله في جميع الأسطر',
      'quickEntry.familyRequired': 'الرجاء إدخال عائلة المنتج في جميع الأسطر (وضع الصيدلية)',
      'quickEntry.editInvoice': 'تعديل الفاتورة',
      'quickEntry.editInvoiceHint': 'أضف أو احذف الأسطر ثم عد لشاشة التعديل — لا يُحفظ شيء قبل ضغط «حفظ التعديلات»',
      'quickEntry.returnAdds': 'إرجاع بالأسطر',
      'quickEntry.nothingChanged': 'لم يتغيّر أي سطر — أضف أو عدّل أو احذف ثم أعد المحاولة',
      'quickEntry.addSupplier': 'إنشاء مورد', 'quickEntry.newSupplierTitle': 'إنشاء مورد جديد',
      'quickEntry.saveAndSelect': 'حفظ واختيار', 'quickEntry.paidNow': 'المدفوع الآن',
      'quickEntry.remaining': 'المتبقي',
      'quickEntry.needSupplierForPay': 'اختر مورداً أو أنشئه قبل تسجيل الدفعة',
      'quickEntry.purchaseAmount': 'مبلغ المشتريات', 'quickEntry.purchaseAmountBtn': 'إظهار مبلغ المشتريات', 'quickEntry.hidePurchaseAmount': 'إخفاء مبلغ المشتريات', 'quickEntry.productInfo': 'معلومات المنتج',
      'inventory.expiryDate': 'تاريخ انتهاء الصلاحية', 'inventory.expiryRequired': 'تاريخ انتهاء الصلاحية إلزامي — الرجاء إدخاله',
      'inventory.qtyInvalid': 'الكمية يجب أن تكون أكبر من صفر',
      'inventory.family': 'العائلة',
      'inventory.familyRequired': 'الرجاء إدخال عائلة المنتج (مطلوبة في وضع الصيدلية)',
      'inventory.plu': 'رمز الميزان (PLU)',
      'inventory.pluPlaceholder': 'مثال: 00123',
      'inventory.pluConflict': 'هذا الرمز مستعمل لدى منتج آخر',
      'inventory.pluReplaceConfirm': 'هذا المنتج مرتبط بالفعل بالرمز {old}. استبدال الرمز بـ {new}؟ بعد الاستبدال يُسأل الميزان عن الرمز {old} في كل مسح.',
      'inventory.scaleSettings': 'إعدادات الميزان',
      'scale.settingsTitle': 'إعدادات قراءة باركود الميزان',
      'scale.hint': 'حدّد الأنماط التي يطبعها ميزان محلك: البادئة، وموضع رمز المنتج (PLU)، ثم الوزن أو سعر الوحدة أو المبلغ مع طول كل حقل وعدد منازلها. الصق كودًا حقيقيًا في خانة التجربة للتأكد قبل الحفظ.',
      'scale.enable': 'تفعيل قراءة رموز الميزان عند البيع',
      'scale.rejectBadCheck': 'رفض الكود إذا كان رقم التحقق غير صحيح',
      'scale.preview': 'تجربة كود حقيقي',
      'scale.previewPlaceholder': 'الصق الباركود كما خرج من الميزان…',
      'scale.previewHint': 'الصق كودًا ليظهر ما سيفهمه النظام منه.',
      'scale.previewNoMatch': 'لا يطابق أي نمط مفعّل',
      'scale.addField': 'نمط جديد',
      'scale.restorePresets': 'استعادة الأنماط الجاهزة',
      'scale.restoreConfirm': 'سيُحذف كل نمط مخصّص وتعود الأنماط الجاهزة. متابعة؟', 'scale.title': 'الميزان',
      'scale.newPattern': 'نمط الميزان',
      'scale.moduleMissing': 'وحدة الميزان غير محمّلة',
      'scale.fixErrors': 'صحّح مواضع الحقول: تداخل أو خروج عن عدد الخانات',
      'scale.needPattern': 'فعّل نمطًا واحدًا على الأقل قبل الحفظ',
      'scale.fromLabel': 'المبلغ من اللاصقة',
      'scale.priceFromCard': 'السعر من بطاقة المنتج',
      'scale.checkOk': 'رقم التحقق صحيح',
      'scale.checkBad': 'رقم التحقق خاطئ',
      'scale.qty': 'الكمية',
      'scale.total': 'الإجمالي',
      'scale.colPrefix': 'البادئة',
      'scale.colDigits': 'عدد الخانات',
      'scale.colCheck': 'رقم تحقق',
      'scale.colWeight': 'الوزن',
      'scale.colUnitPrice': 'سعر الوحدة',
      'scale.colAmount': 'المبلغ',
      'scale.pos': 'الموضع',
      'scale.len': 'الطول',
      'scale.dec': 'المنازل',
      'scale.errNoPrefix': 'البادئة مطلوبة',
      'scale.errRange': 'الحقل خارج عدد الخانات',
      'scale.errOverlap': 'حقلان يستعملان الخانات نفسها',
      'scale.errPrefix': 'الحقل يبدأ داخل البادئة',
      'scale.preset21Weight': '21 — الوزن (13 خانة)',
      'scale.preset22Unit': '22 — سعر الوحدة (13 خانة)',
      'scale.preset23Amount': '23 — المبلغ (13 خانة)',
      'scale.preset24Count': '24 — عدد القطع (13 خانة)',
      'scale.preset2xWeight': '2* — الوزن (13 خانة)',
      'scale.preset9xWeight': '9* — الوزن (13 خانة)',
      'scale.preset12Weight': '21 — الوزن (12 خانة بلا تحقق)',
'inventory.scaleSync': 'مزامنة الميزان',
'scaleSync.title': 'مزامنة الميزان (تنزيل قائمة الأصناف)',
'scaleSync.sub': 'أرسل قائمة الأصناف (PLU + اسم + سعر) إلى الميزان لكي يطبع اللاصقات. المبلغ المطبوع على اللاصقة هو المرجع عند البيع.',
'scaleSync.profile': 'ملف تعريف الميزان',
'scaleSync.transport': 'طريقة الربط',
'scaleSync.transport.file': 'ملف / USB',
'scaleSync.transport.com': 'منفذ COM',
'scaleSync.transport.raw-com': 'COM خام',
'scaleSync.transport.net': 'شبكة (IP)',
'scaleSync.comPort': 'منفذ COM',
'scaleSync.baudRate': 'سرعة البود',
'scaleSync.host': 'عنوان IP',
'scaleSync.port': 'المنفذ',
'scaleSync.scanPorts': 'مسح المنافذ',
'scaleSync.selection': 'اختيار الأصناف',
'scaleSync.onlyWithPlu': 'أصناف لها PLU فقط',
'scaleSync.onlyWeighed': 'الأصناف الموزونة (غير محدود) فقط',
'scaleSync.brandId': 'الماركة (اختياري)',
'scaleSync.count': 'عدد الأصناف',
'scaleSync.stale': 'أصناف تغيّر سعرها',
'scaleSync.consistency': 'توافق مع إعدادات القراءة',
'scaleSync.preview': 'معاينة الملف',
'scaleSync.exportFile': 'تصدير ملف',
'scaleSync.send': 'إرسال إلى الميزان',
'scaleSync.save': 'حفظ الإعدادات',
'scaleSync.lastSync': 'آخر مزامنة',
'scaleSync.noProducts': 'لا توجد أصناف مختارة',
'scaleSync.advanced': 'متقدّم',
'scaleSync.pluWidth': 'عرض PLU',
'scaleSync.priceDecimals': 'منازل سعر البيع',
'scaleSync.nameMax': 'أقصى طول للاسم',
'scaleSync.nameMode': 'وضع الاسم',
'scaleSync.nameModeRaw': 'كما هو',
'scaleSync.nameModeLatin': 'لاتيني (نقحرة)',
'scaleSync.delimiter': 'الفاصل (CSV)',
'scaleSync.encoding': 'الترميز',
'scaleSync.lineEnding': 'نهاية السطر',
'scaleSync.warnDecodeOff': 'قراءة رموز الميزان معطّلة في «إعدادات الميزان» — فعّلها لقراءة اللاصقات.',
'scaleSync.warnNoPattern': 'لا يوجد نمط قراءة مفعّل — أضف نمطاً في «إعدادات الميزان».',
'scaleSync.warnPluWidth': 'عرض PLU في ملف التصدير لا يطابق عرض PLU في إعدادات القراءة — قد لا يُقرأ الباركود.',
'scaleSync.exported': 'تم تصدير {n} صنف.',
'scaleSync.sent': 'تم إرسال {n} بايت إلى الميزان.',
'scaleSync.saved': 'تم حفظ الإعدادات.',
'scaleSync.noPermission': 'لا تملك صلاحية المزامنة — للمدير فقط.',
'scaleSync.fileHint': 'سيتم حفظ ملف نصي (CSV/TXT) على القرص، ثم حمّله إلى الميزان عبر USB أو بطاقة ذاكرة.',
'scaleSync.scanned': 'تم مسح {n} منفذ.',
'scaleSync.noHardware': 'غير متاح في هذا الإصدار.',
'scaleSync.profileCsv': 'CSV عام (UTF-8)',
'scaleSync.profileCsvLatin': 'CSV لاتيني',
'scaleSync.profileFixed': 'عرض ثابت (ASCII)',
'scaleSync.profileCas': 'CAS',
'scaleSync.profileBizerba': 'Bizerba',
'scaleSync.profileMettler': 'Mettler',
'scaleSync.profileDigi': 'Digi',
'scaleSync.profileExcell': 'Excell',
'scaleSync.profileTScale': 'T-Scale',
'scaleSync.portPicked': 'تم اختيار المنفذ: ',
'scaleSync.comPortManual': 'أو اكتب المنفذ يدوياً (COM3)',
'scaleSync.noPortsFound': 'لم يُعثر على منافذ تلقائياً. اكتب المنفذ يدوياً (COM3) أو تحقق من driver.',
'scaleSync.removed': 'أصناف مُزالَة',
'scaleSync.incremental': 'إرسال المتغيّر فقط (تزايد)',
'scaleSync.articles': 'الأصناف المختارة (اسم ميزان + قسم)',
'scaleSync.saveArticles': 'حفظ الأصناف',
'scaleSync.colPlu': 'PLU',
'scaleSync.colName': 'اسم (ميزان)',
'scaleSync.colDept': 'قسم',
'scaleSync.colPrice': 'سعر',
'scaleSync.savedArticles': 'تم حفظ {n} صنف.',
'scaleSync.printLabel': 'طباعة لاصقة ميزان (بديل)',
'scaleSync.printArticle': 'الصنف',
'scaleSync.printWeight': 'الوزن',
'scaleSync.genCode': 'توليد الكود',
'scaleSync.printNow': 'طباعة',
'scaleSync.codeGenerated': 'تم توليد الكود.',
'scaleSync.noPatternForPrint': 'لا يوجد نمط قراءة (PLU+وزن) مفعّل — أضفه في «إعدادات الميزان».',
'scaleSync.printReady': 'أدخل الوزن ثم اضغط «توليد الكود».',
      'sales.scaleTitle': 'لاصقة الميزان',
      'sales.scaleQty': 'الوزن / الكمية',
      'sales.scalePrice': 'سعر الوحدة',
      'sales.scaleLink': 'ربط بمنتج في المخزن',
      'sales.scaleSearchPh': 'ابحث بالاسم أو الباركود أو المرجع',
      'sales.scaleLinkHint': 'الربط يحفظ رمز الميزان على بطاقة المنتج: كل لاصقة تحمل نفس الرمز تدخل عليه مباشرة بعد اليوم.',
      'sales.scaleFree': 'بيعه كسطر حر',
      'sales.scaleAdd': 'إضافة للسلة',
      'sales.scaleTag': 'ميزان',
      'sales.scaleFromLabelTag': 'المبلغ مطبوع على اللاصقة',
      'sales.scaleNeedQty': 'اللاصقة فيها سعر بلا وزن: اكتب الوزن',
      'sales.scaleUnknownPlu': 'رمز الميزان بلا بطاقة: اربطه بمنتج أو بِعه كسطر حر',
      'sales.scalePick': 'اختر منتجًا للربط به أو اضغط «بيعه كسطر حر»',
      'sales.scaleNone': 'لا يوجد منتج بهذا الاسم',
      'sales.scaleQtyBad': 'اكتب وزنًا أكبر من صفر',
      'sales.findSubstitute': 'ابحث عن معوّض',
      'sales.substituteTitle': 'معوّضات متوفرة',
      'sales.substituteFor': 'معوّضات لـ',
      'sales.substituteEmpty': 'لا توجد بدائل متوفرة في هذه العائلة',
      'sales.substituteAdd': 'إضافة للسلة',
      'sales.substituteNoFamily': 'هذا المنتج بلا عائلة',
      'sales.familyRequired': 'الرجاء إدخال عائلة المنتج (إعدادات → وضع الصيدلية)',
      'sales.expiredBlocked': 'منتهي الصلاحية — لا يمكن بيعه',
      'sales.scannerExpired': 'منتهي الصلاحية — ممنوع البيع',
      'sales.batchExpiredPartial': 'وُجدت وحدات منتهية الصلاحية وتم استبعادها',
      'sales.subShortage': 'متوفر منها',
      'sales.substituteCount': 'بديل متوفر',
      'sales.qtyModalTitle': 'تعديل الكميات بالكيبورد',
      'sales.qtyModalQty': 'الكمية',
      'sales.qtyModalItems': 'منتجات',
      'sales.qtyModalFull': 'أقصى كمية',
      'sales.qtyModalKeys': '↑ ↓ تحريك · أرقام = كمية · Del حذف · Enter / Esc إغلاق · + سطر تالٍ',
      'sales.qtyModalHint': 'اضغط على مفتاح + من الكيبورد لإظهار وتعديل الكميات',
      'invoices.transferBtn': 'تحويل الفاتورة',
      'invoices.transferTitle': 'تحويل الفاتورة إلى مورد',
      'invoices.transferHint': 'اكتب اسم المورد واختره لتُسجَّل عليه هذه الفاتورة كأنها أُنشئت له.',
      'invoices.transferSearchPlaceholder': 'ابحث عن المورد بالاسم أو الهاتف...',
      'invoices.transferSelected': 'سيتم تحويل الفاتورة إلى:',
      'invoices.transferConfirm': 'تأكيد التحويل',
      'invoices.transferNoResults': 'لا يوجد مورد بهذا الاسم',
      'invoices.transferCurrent': 'المورد الحالي',
      'invoices.transferNoSupplier': 'هذه الفاتورة غير مرتبطة بأي مورد حتى الآن',
      'invoices.transferSame': 'الفاتورة مسجّلة بالفعل على هذا المورد',
      'invoices.transferDone': 'تم تحويل الفاتورة إلى المورد: {name}',
      'invoices.transferOweHim': 'علينا له',
      'invoices.transferHeOwes': 'له علينا',
      'invoices.transferItems': 'منتج',
      'invoices.transferCurrentTag': 'الحالي',
      'invoices.transferAmount': 'المبلغ',
      'invoices.transferAfterBal': 'الرصيد بعد التحويل',
      'invoices.transferConfirmMsg': 'تحويل الفاتورة من "{from}" إلى "{to}" بمبلغ {amount}؟ سيُعاد رصيد المورد السابق ويُسجَّل على المورد الجديد.',
      'invoices.convertBtn': 'تحويل إلى عميل',
      'invoices.convertTitle': 'تحويل الفاتورة إلى حساب عميل',
      'invoices.convertExisting': 'اختيار عميل موجود',
      'invoices.convertNew': 'إنشاء عميل جديد',
      'invoices.convertSearchPlaceholder': 'ابحث عن العميل بالاسم أو الهاتف...',
      'invoices.convertSelected': 'ستُسجَّل الفاتورة على:',
      'invoices.convertNewName': 'اسم العميل',
      'invoices.convertNewPhone': 'الهاتف',
      'invoices.convertNewDiscount': 'نسبة الخصم %',
      'invoices.convertNewAddress': 'العنوان',
      'invoices.convertNewType': 'نوع السعر',
      'invoices.convertNewTypeUnit': 'قطعة',
      'invoices.convertNewTypeWhole': 'جملة',
      'invoices.convertConfirm': 'تأكيد التحويل',
      'invoices.convertWalkinLabel': 'زبون نقدي (غير مسجّل)',
      'invoices.convertCashChip': 'مقبوض نقداً',
      'invoices.convertWalkinNotice': 'فاتورة نقدية غير مسجّلة. سيُسجَّل كامل المبلغ {amount} على رصيد العميل، ويُلغى المقبوض النقدي المسجّل ({cash}).',
      'invoices.convertReassignNotice': 'الفاتورة مسجّلة حالياً على «{from}». سيُنقل المتبقي ({amount}) إلى العميل الجديد مع بقاء المبالغ المقبوضة.',
      'invoices.convertPreviewFull': 'سيُضاف كامل المبلغ {amount} إلى رصيد العميل.',
      'invoices.convertPreviewRemaining': 'سيُضاف المتبقي {amount} إلى رصيد العميل.',
      'invoices.convertPreviewOld': 'سيُخصم {amount} من رصيد العميل السابق.',
      'invoices.convertBalanceNow': 'الرصيد الحالي',
      'invoices.convertBalanceAfter': 'بعد التحويل',
      'invoices.convertNewHint': 'أدخل اسم العميل لإنشاء حساب جديد وتحويل الفاتورة إليه.',
      'invoices.convertWillCreate': 'سيُنشأ العميل «{name}».',
      'invoices.convertWillMove': 'سيُضاف {amount} إلى رصيده.',
      'invoices.convertNoResults': 'لا يوجد عميل بهذا الاسم',
      'invoices.convertCurrentTag': 'الحالي',
      'invoices.convertNameRequired': 'الرجاء إدخال اسم العميل',
      'invoices.convertSelectTarget': 'الرجاء اختيار عميل أولاً',
      'invoices.convertConfirmWalkin': 'تحويل الفاتورة إلى «{name}» وتسجيل {amount} على رصيده؟ سيُلغى المقبوض النقدي المسجّل ({cash}).',
      'invoices.convertConfirmReassign': 'نقل الفاتورة من «{from}» إلى «{to}» مع نقل المتبقي {amount}؟',
      'invoices.convertDone': 'تم تحويل الفاتورة إلى العميل: {name}',
      'invoices.convertNoteTitle': 'تم تحويل هذه الفاتورة إلى حساب عميل',
      'invoices.convertNoteFrom': 'المصدر:',
      'invoices.convertNoteCancelled': 'أُلغي المقبوض النقدي المسجّل: {amount}',
      'invoices.convertNoteOn': 'تاريخ التحويل: {date}',
      'invoices.convertErrNotSale': 'يمكن تحويل فواتير البيع فقط',
      'invoices.convertErrProvisional': 'لا يمكن تحويل فاتورة شكلية',
      'invoices.convertErrHasReturns': 'لا يمكن تحويل فاتورة عليها مرتجعات',
      'invoices.convertErrNoCustomer': 'الرجاء اختيار العميل',
      'invoices.convertErrSame': 'الفاتورة مسجّلة بالفعل على هذا العميل',
      'invoices.convertErrZero': 'لا يمكن تحويل فاتورة بمبلغ صفر',
      'invoices.convertErrUnavailable': 'محرّك التحويل غير محمّل',
      'invoices.convertErrGeneric': 'تعذّر تحويل هذه الفاتورة',
      'settings.pharmacyMode': 'وضع الصيدلية',
      'settings.pharmacyModeHint': 'يفعّل حقل تاريخ الصلاحية، ويلزم إدخال العائلة، ويحوّل واجهة البرنامج إلى الأخضر والأبيض والأحمر مع نظام المعوّضات.',
      'settings.pharmaFeatExpiry': 'حقول انتهاء الصلاحية',
      'settings.pharmaFeatFamily': 'العائلة إلزامية مع اقتراحات',
      'settings.pharmaFeatSkin': 'واجهة خضراء/بيضاء/حمراء',
      'settings.pharmaFeatSub': 'زر «ابحث عن معوّض» عند نفاد الكمية',
      'settings.pharmaSwatchOk': 'سليم',
      'settings.pharmaSwatchWarn': 'قريب الانتهاء',
      'settings.pharmaSwatchBad': 'منتهي',
      'settings.customerTree': 'شجرة العملاء',
      'settings.deleteProductsCard': 'أدوات خطرة',
      'settings.deleteProductsTitle': 'حذف المنتجات فقط',
      'settings.deleteProductsBtn': 'حذف المنتجات',
      'settings.deleteProductsHint': 'يُحذف المنتجات من الكتالوج فقط. ستبقى الفواتير بأسماء منتجاتها، والعملاء والموردين بأرصدتهم ودفعاتهم وسنداتهم كما هي.',
      'settings.deleteProductsKeep': 'ما يبقى محفوظاً: الفواتير، أسماء المنتجات داخلها، العملاء، الموردين، الأرصدة، الدفعات، السندات، المرتجعات والإعدادات.',
      'settings.deleteProductsPassword': 'كلمة مرور المتجر',
      'settings.deleteProductsConfirm': 'تأكيد الحذف',
      'settings.deleteProductsWrong': 'كلمة المرور غير صحيحة. لم يُحذف شيء.',
      'settings.deleteProductsManagerOnly': 'لا توجد كلمة مرور للمتجر؛ هذا الإجراء مسموح للمدير فقط. لم يُحذف شيء.',
      'settings.deleteProductsEmpty': 'لا توجد منتجات لحذفها.',
      'settings.deleteProductsDone': 'تم حذف {count} منتج. بقيت الفواتير والعملاء والموردين والدفعات كما هي.',
      'settings.deleteProductsFailed': 'تعذّر حذف المنتجات. لم يُحذف شيء.',
      'customerTree.title': 'شجرة العملاء',
      'customerTree.subCustomers': 'الزبائن التابعون',
      'customerTree.add': 'إضافة زبون تابع',
      'customerTree.edit': 'تعديل الزبون التابع',
      'customerTree.name': 'الاسم (إجباري)',
      'customerTree.phone': 'الهاتف (اختياري)',
      'customerTree.address': 'العنوان (اختياري)',
      'customerTree.none': 'بدون زبون تابع',
      'customerTree.choose': 'اختيار',
      'customerTree.remove': 'إزالة الوسم',
      'customerTree.noParent': 'الرجاء اختيار عميل أولاً قبل استخدام شجرة العملاء (F5).',
      'customerTree.noChildren': 'لا يوجد زبائن تابعون لهذا العميل بعد.',
      'customerTree.nameRequired': 'اسم الزبون التابع مطلوب.',
      'customerTree.saveFailed': 'تعذّر حفظ الزبون التابع. أعد المحاولة، أو تأكد من اختيار عميل أساسي وتفعيل شجرة العملاء.',
      'customerTree.saved': 'تم حفظ الزبون التابع.',
      'customerTree.debt': 'الدين',
      'customerTree.invoices': 'الفواتير',
      'customerTree.payments': 'الدفعات',
      'customerTree.pay': 'دفع',
      'customerTree.voucher': 'سند قبض',
      'customerTree.of': 'التابع لـ',
      'customerTree.historyKept': 'سيبقى السجل المالي محفوظاً باسم العميل الأساسي.',
      'customerTree.deleteConfirm': 'إزالة وسم الزبون التابع فقط؟ سيبقى السجل المالي محفوظاً باسم العميل الأساسي.',
      'customerTree.badge': 'تابع لـ',
      'customerTree.sub': 'زبون تابع',
      'customerTree.selectHint': 'اختر زبوناً تابعاً أو أضف زبوناً جديداً لهذا العميل.',
      'customerTree.printLabel': 'Client secondaire',
    },
    en: {
      'quickEntry.title': 'Quick Entry', 'quickEntry.subtitle': 'Fast purchase invoice — F1 to close',
      'quickEntry.hint': 'F1 to close • Arrows to navigate • + new row',
      'quickEntry.selectSupplier': 'Search supplier by name...', 'quickEntry.supplier': 'Supplier', 'quickEntry.noSupplier': 'No supplier found',
      'quickEntry.searchProduct': 'Search product (name, barcode, mark)...', 'quickEntry.createNew': 'Create new product',
      'quickEntry.scanPlaceholder': 'Scan a product barcode...', 'quickEntry.scanReady': 'Ready to scan',
      'quickEntry.scanAdded': 'Added', 'quickEntry.scanIncremented': 'Quantity increased', 'quickEntry.scanNew': 'New product — complete its details',
      'quickEntry.addRow': 'Add row', 'quickEntry.qty': 'Qty', 'quickEntry.buyPrice': 'Buy price', 'quickEntry.sellPrice': 'Sell price', 'quickEntry.wholesalePrice': 'Wholesale price',
      'quickEntry.brand': 'Brand', 'quickEntry.reference': 'Reference', 'quickEntry.plu': 'Scale PLU', 'quickEntry.pluPlaceholder': 'e.g. 00123', 'quickEntry.barcode': 'Barcode', 'quickEntry.countryOfOrigin': 'Country of origin', 'quickEntry.mark': 'Mark', 'quickEntry.storageLocation': 'Storage location',
      'quickEntry.family': 'Family', 'quickEntry.extraPrices': 'Extra sale prices (optional)', 'quickEntry.minPrice': 'Minimum price', 'quickEntry.minPricePlaceholder': '0 = no limit',
      'quickEntry.confirm': 'Confirm invoice', 'quickEntry.cancel': 'Cancel', 'quickEntry.total': 'Total', 'quickEntry.timbre': 'Fiscal stamp',
      'quickEntry.purchaseDiscount': 'Purchase disc. %', 'quickEntry.invoiceDiscount': 'Invoice discount',
      'quickEntry.grossTotal': 'Total before discount', 'quickEntry.productDiscount': 'Product discount', 'quickEntry.realTotal': 'Real total',
      'quickEntry.fixedAmount': 'Fixed amount',
      'quickEntry.noSupplierWarn': 'Please select a supplier first', 'quickEntry.emptyWarn': 'Add at least one product',
      'quickEntry.success': 'Invoice registered for', 'quickEntry.barcodeConflict': 'This barcode is already registered to another product',
      'quickEntry.expiryRequired': 'Expiry date is required — please fill it in all rows',
      'quickEntry.familyRequired': 'Please enter the product family on all rows (pharmacy mode)',
      'quickEntry.editInvoice': 'Edit invoice',
      'quickEntry.editInvoiceHint': 'Add or remove lines, then return to the edit screen — nothing is saved until you press Save edits',
      'quickEntry.returnAdds': 'Return with lines',
      'quickEntry.nothingChanged': 'No line changed — add, edit or remove and try again',
      'quickEntry.addSupplier': 'Add supplier', 'quickEntry.newSupplierTitle': 'New supplier',
      'quickEntry.saveAndSelect': 'Save and select', 'quickEntry.paidNow': 'Paid now',
      'quickEntry.remaining': 'Remaining',
      'quickEntry.needSupplierForPay': 'Select or create a supplier before recording a payment',
      'quickEntry.purchaseAmount': 'Purchase amount', 'quickEntry.purchaseAmountBtn': 'Show purchase amount', 'quickEntry.hidePurchaseAmount': 'Hide purchase amount', 'quickEntry.productInfo': 'Product info',
      'inventory.expiryDate': 'Expiry date', 'inventory.expiryRequired': 'Expiry date is required — please enter it',
      'inventory.qtyInvalid': 'Quantity must be greater than zero',
      'inventory.family': 'Family',
      'inventory.familyRequired': 'Please enter the product family (required in pharmacy mode)',
      'inventory.plu': 'Scale code (PLU)',
      'inventory.pluPlaceholder': 'e.g. 00123',
      'inventory.pluConflict': 'This code already belongs to another product',
      'inventory.pluReplaceConfirm': 'This product is already linked to code {old}. Replace it with {new}? After the change the scale will ask about {old} again on every scan.',
      'inventory.scaleSettings': 'Scale settings',
      'scale.settingsTitle': 'Scale barcode reading settings',
      'scale.hint': 'Describe what your scale prints: the prefix, the position of the product code (PLU), then the weight, the unit price or the amount with field length and decimals. Paste a real code in the test box to check it before saving.',
      'scale.enable': 'Read scale codes when selling',
      'scale.rejectBadCheck': 'Reject a code whose check digit is wrong',
      'scale.preview': 'Test a real code',
      'scale.previewPlaceholder': 'Paste the barcode exactly as the scale printed it…',
      'scale.previewHint': 'Paste a code to see what the system will read from it.',
      'scale.previewNoMatch': 'Does not match any enabled pattern',
      'scale.addField': 'New pattern',
      'scale.restorePresets': 'Restore built-in patterns',
      'scale.restoreConfirm': 'Every custom pattern will be removed and the built-in ones restored. Continue?', 'scale.title': 'Scale',
      'scale.newPattern': 'Scale pattern',
      'scale.moduleMissing': 'Scale module is not loaded',
      'scale.fixErrors': 'Fix the field positions: overlapping or outside the code',
      'scale.needPattern': 'Enable at least one pattern before saving',
      'scale.fromLabel': 'Amount taken from the label',
      'scale.priceFromCard': 'Price taken from the product card',
      'scale.checkOk': 'Check digit is valid',
      'scale.checkBad': 'Check digit is wrong',
      'scale.qty': 'Quantity',
      'scale.total': 'Total',
      'scale.colPrefix': 'Prefix',
      'scale.colDigits': 'Digits',
      'scale.colCheck': 'Check digit',
      'scale.colWeight': 'Weight',
      'scale.colUnitPrice': 'Unit price',
      'scale.colAmount': 'Amount',
      'scale.pos': 'Position',
      'scale.len': 'Length',
      'scale.dec': 'Decimals',
      'scale.errNoPrefix': 'Prefix is required',
      'scale.errRange': 'Field is outside the code length',
      'scale.errOverlap': 'Two fields use the same digits',
      'scale.errPrefix': 'Field starts inside the prefix',
      'scale.preset21Weight': '21 — weight (13 digits)',
      'scale.preset22Unit': '22 — unit price (13 digits)',
      'scale.preset23Amount': '23 — amount (13 digits)',
      'scale.preset24Count': '24 — piece count (13 digits)',
      'scale.preset2xWeight': '2* — weight (13 digits)',
      'scale.preset9xWeight': '9* — weight (13 digits)',
      'scale.preset12Weight': '21 — weight (12 digits, no check)',
'inventory.scaleSync': 'Scale sync',
'scaleSync.title': 'Scale sync (download article list)',
'scaleSync.sub': 'Send the article list (PLU + name + price) to the scale so it can print labels. The amount printed on the label is the reference at sale.',
'scaleSync.profile': 'Scale profile',
'scaleSync.transport': 'Connection',
'scaleSync.transport.file': 'File / USB',
'scaleSync.transport.com': 'COM port',
'scaleSync.transport.raw-com': 'Raw COM',
'scaleSync.transport.net': 'Network (IP)',
'scaleSync.comPort': 'COM port',
'scaleSync.baudRate': 'Baud rate',
'scaleSync.host': 'IP address',
'scaleSync.port': 'Port',
'scaleSync.scanPorts': 'Scan ports',
'scaleSync.selection': 'Article selection',
'scaleSync.onlyWithPlu': 'Articles with a PLU only',
'scaleSync.onlyWeighed': 'Weighed articles only (non-quantified)',
'scaleSync.brandId': 'Brand (optional)',
'scaleSync.count': 'Articles',
'scaleSync.stale': 'Articles whose price changed',
'scaleSync.consistency': 'Consistency with reading settings',
'scaleSync.preview': 'File preview',
'scaleSync.exportFile': 'Export file',
'scaleSync.send': 'Send to scale',
'scaleSync.save': 'Save settings',
'scaleSync.lastSync': 'Last sync',
'scaleSync.noProducts': 'No articles selected',
'scaleSync.advanced': 'Advanced',
'scaleSync.pluWidth': 'PLU width',
'scaleSync.priceDecimals': 'Price decimals',
'scaleSync.nameMax': 'Max name length',
'scaleSync.nameMode': 'Name mode',
'scaleSync.nameModeRaw': 'As is',
'scaleSync.nameModeLatin': 'Latin (transliterated)',
'scaleSync.delimiter': 'Delimiter (CSV)',
'scaleSync.encoding': 'Encoding',
'scaleSync.lineEnding': 'Line ending',
'scaleSync.warnDecodeOff': 'Scale barcode reading is disabled in scale settings — enable it to read the labels.',
'scaleSync.warnNoPattern': 'No reading pattern enabled — add one in scale settings.',
'scaleSync.warnPluWidth': 'The PLU width in the export does not match the PLU field in reading settings — the barcode may not be read.',
'scaleSync.exported': 'Exported {n} article(s).',
'scaleSync.sent': 'Sent {n} bytes to the scale.',
'scaleSync.saved': 'Settings saved.',
'scaleSync.noPermission': 'You are not allowed to sync the scale — managers only.',
'scaleSync.fileHint': 'A text file (CSV/TXT) will be saved to disk; load it into the scale via USB or a memory card.',
'scaleSync.scanned': 'Scanned {n} port(s).',
'scaleSync.noHardware': 'Not available in this version.',
'scaleSync.profileCsv': 'Generic CSV (UTF-8)',
'scaleSync.profileCsvLatin': 'Latin CSV',
'scaleSync.profileFixed': 'Fixed width (ASCII)',
'scaleSync.profileCas': 'CAS',
'scaleSync.profileBizerba': 'Bizerba',
'scaleSync.profileMettler': 'Mettler',
'scaleSync.profileDigi': 'Digi',
'scaleSync.profileExcell': 'Excell',
'scaleSync.profileTScale': 'T-Scale',
'scaleSync.portPicked': 'Port selected: ',
'scaleSync.comPortManual': 'Or type the port manually (COM3)',
'scaleSync.noPortsFound': 'No ports found automatically. Type the port manually (COM3) or check the driver.',
'scaleSync.removed': 'Removed articles',
'scaleSync.incremental': 'Send changed only (incremental)',
'scaleSync.articles': 'Selected articles (scale name + dept)',
'scaleSync.saveArticles': 'Save articles',
'scaleSync.colPlu': 'PLU',
'scaleSync.colName': 'Name (scale)',
'scaleSync.colDept': 'Dept',
'scaleSync.colPrice': 'Price',
'scaleSync.savedArticles': 'Saved {n} article(s).',
'scaleSync.printLabel': 'Print scale label (fallback)',
'scaleSync.printArticle': 'Article',
'scaleSync.printWeight': 'Weight',
'scaleSync.genCode': 'Generate code',
'scaleSync.printNow': 'Print',
'scaleSync.codeGenerated': 'Code generated.',
'scaleSync.noPatternForPrint': 'No reading pattern with PLU+weight enabled — add one in scale settings.',
'scaleSync.printReady': 'Enter the weight, then click «Generate code».',
      'sales.scaleTitle': 'Scale label',
      'sales.scaleQty': 'Weight / quantity',
      'sales.scalePrice': 'Unit price',
      'sales.scaleLink': 'Link to a stock product',
      'sales.scaleSearchPh': 'Search by name, barcode or reference',
      'sales.scaleLinkHint': 'The link is saved on the product card: every later label with this code goes straight to it.',
      'sales.scaleFree': 'Sell it as a free line',
      'sales.scaleAdd': 'Add to cart',
      'sales.scaleTag': 'scale',
      'sales.scaleFromLabelTag': 'Amount printed on the label',
      'sales.scaleNeedQty': 'The label carries a price but no weight: type the weight',
      'sales.scaleUnknownPlu': 'No card for this scale code: link it or sell it as a free line',
      'sales.scalePick': 'Pick a product to link, or press "Sell it as a free line"',
      'sales.scaleNone': 'No product with that name',
      'sales.scaleQtyBad': 'Enter a weight greater than zero',
      'sales.findSubstitute': 'Find substitute',
      'sales.substituteTitle': 'Available substitutes',
      'sales.substituteFor': 'Substitutes for',
      'sales.substituteEmpty': 'No available substitutes in this family',
      'sales.substituteAdd': 'Add to cart',
      'sales.substituteNoFamily': 'This product has no family',
      'sales.familyRequired': 'Please enter the product family (Settings → Pharmacy mode)',
      'sales.expiredBlocked': 'Expired — cannot be sold',
      'sales.scannerExpired': 'Expired — sale forbidden',
      'sales.batchExpiredPartial': 'Expired units found and excluded',
      'sales.subShortage': 'Available',
      'sales.substituteCount': 'available substitutes',
      'sales.qtyModalTitle': 'Quick quantities',
      'sales.qtyModalQty': 'Qty',
      'sales.qtyModalItems': 'items',
      'sales.qtyModalFull': 'Max qty',
      'sales.qtyModalKeys': '↑ / ↓ move · digits = qty · Del delete · Enter / Esc close · + next line',
      'sales.qtyModalHint': 'Press the + key to view and edit quantities from the keyboard',
      'invoices.transferBtn': 'Transfer invoice',
      'invoices.transferTitle': 'Transfer invoice to a supplier',
      'invoices.transferHint': 'Type the supplier name and pick it; the invoice will be recorded on that supplier as if created for them.',
      'invoices.transferSearchPlaceholder': 'Search supplier by name or phone...',
      'invoices.transferSelected': 'Invoice will be transferred to:',
      'invoices.transferConfirm': 'Confirm transfer',
      'invoices.transferNoResults': 'No supplier with this name',
      'invoices.transferCurrent': 'Current supplier',
      'invoices.transferNoSupplier': 'This invoice is not linked to any supplier yet',
      'invoices.transferSame': 'The invoice is already recorded on this supplier',
      'invoices.transferDone': 'Invoice transferred to supplier: {name}',
      'invoices.transferOweHim': 'We owe',
      'invoices.transferHeOwes': 'Owes us',
      'invoices.transferItems': 'items',
      'invoices.transferCurrentTag': 'current',
      'invoices.transferAmount': 'Amount',
      'invoices.transferAfterBal': 'Balance after transfer',
      'invoices.transferConfirmMsg': 'Transfer the invoice from "{from}" to "{to}" for {amount}? The previous supplier balance will be reverted and recorded on the new supplier.',
      'invoices.convertBtn': 'Convert to customer',
      'invoices.convertTitle': 'Convert invoice to a customer account',
      'invoices.convertExisting': 'Choose an existing customer',
      'invoices.convertNew': 'Create a new customer',
      'invoices.convertSearchPlaceholder': 'Search customer by name or phone...',
      'invoices.convertSelected': 'Invoice will be recorded on:',
      'invoices.convertNewName': 'Customer name',
      'invoices.convertNewPhone': 'Phone',
      'invoices.convertNewDiscount': 'Discount %',
      'invoices.convertNewAddress': 'Address',
      'invoices.convertNewType': 'Price type',
      'invoices.convertNewTypeUnit': 'Unit',
      'invoices.convertNewTypeWhole': 'Wholesale',
      'invoices.convertConfirm': 'Confirm conversion',
      'invoices.convertWalkinLabel': 'Walk-in customer (unregistered)',
      'invoices.convertCashChip': 'cash received',
      'invoices.convertWalkinNotice': 'This is an unregistered cash sale. The full amount {amount} will be recorded on the customer balance and the recorded cash receipt ({cash}) will be cancelled.',
      'invoices.convertReassignNotice': 'The invoice is currently recorded on "{from}". The outstanding balance ({amount}) will move to the new customer; money already collected stays collected.',
      'invoices.convertPreviewFull': 'The full amount {amount} will be added to the customer balance.',
      'invoices.convertPreviewRemaining': 'The outstanding {amount} will be added to the customer balance.',
      'invoices.convertPreviewOld': '{amount} will be removed from the previous customer balance.',
      'invoices.convertBalanceNow': 'Current balance',
      'invoices.convertBalanceAfter': 'After conversion',
      'invoices.convertNewHint': 'Enter the customer name to create a new account and move the invoice to it.',
      'invoices.convertWillCreate': 'Customer "{name}" will be created.',
      'invoices.convertWillMove': '{amount} will be added to their balance.',
      'invoices.convertNoResults': 'No customer with this name',
      'invoices.convertCurrentTag': 'current',
      'invoices.convertNameRequired': 'Please enter the customer name',
      'invoices.convertSelectTarget': 'Please choose a customer first',
      'invoices.convertConfirmWalkin': 'Convert the invoice to "{name}" and record {amount} on their balance? The recorded cash receipt ({cash}) will be cancelled.',
      'invoices.convertConfirmReassign': 'Move the invoice from "{from}" to "{to}" and transfer the outstanding {amount}?',
      'invoices.convertDone': 'Invoice converted to customer: {name}',
      'invoices.convertNoteTitle': 'This invoice was converted to a customer account',
      'invoices.convertNoteFrom': 'Source:',
      'invoices.convertNoteCancelled': 'Recorded cash receipt cancelled: {amount}',
      'invoices.convertNoteOn': 'Conversion date: {date}',
      'invoices.convertErrNotSale': 'Only sale invoices can be converted',
      'invoices.convertErrProvisional': 'A provisional invoice cannot be converted',
      'invoices.convertErrHasReturns': 'An invoice with returns cannot be converted',
      'invoices.convertErrNoCustomer': 'Please choose the customer',
      'invoices.convertErrSame': 'The invoice is already recorded on this customer',
      'invoices.convertErrZero': 'A zero-amount invoice cannot be converted',
      'invoices.convertErrUnavailable': 'The conversion engine is not loaded',
      'invoices.convertErrGeneric': 'This invoice cannot be converted',
      'settings.pharmacyMode': 'Pharmacy mode',
      'settings.pharmacyModeHint': 'Enables expiry-date fields, makes product family required, turns the interface green/white/red and unlocks the substitute system.',
      'settings.pharmaFeatExpiry': 'Expiry-date fields',
      'settings.pharmaFeatFamily': 'Required family with suggestions',
      'settings.pharmaFeatSkin': 'Green / white / red skin',
      'settings.pharmaFeatSub': '“Find a substitute” when out of stock',
      'settings.pharmaSwatchOk': 'OK',
      'settings.pharmaSwatchWarn': 'Expiring soon',
      'settings.pharmaSwatchBad': 'Expired',
      'settings.customerTree': 'Customer tree',
      'settings.deleteProductsCard': 'Danger zone',
      'settings.deleteProductsTitle': 'Delete products only',
      'settings.deleteProductsBtn': 'Delete products',
      'settings.deleteProductsHint': 'Only the catalogue products are deleted. Invoices keep their product names, and customers, suppliers, balances, payments and vouchers stay untouched.',
      'settings.deleteProductsKeep': 'Still preserved: invoices, product names inside them, customers, suppliers, balances, payments, vouchers, returns and settings.',
      'settings.deleteProductsPassword': 'Store password',
      'settings.deleteProductsConfirm': 'Confirm deletion',
      'settings.deleteProductsWrong': 'Incorrect password. Nothing was deleted.',
      'settings.deleteProductsManagerOnly': 'No store password is set; this action is manager-only. Nothing was deleted.',
      'settings.deleteProductsEmpty': 'There are no products to delete.',
      'settings.deleteProductsDone': 'Deleted {count} product(s). Invoices, customers, suppliers and payments were left unchanged.',
      'settings.deleteProductsFailed': 'Could not delete the products. Nothing was deleted.',
      'customerTree.title': 'Customer tree',
      'customerTree.subCustomers': 'Sub-customers',
      'customerTree.add': 'Add sub-customer',
      'customerTree.edit': 'Edit sub-customer',
      'customerTree.name': 'Name (required)',
      'customerTree.phone': 'Phone (optional)',
      'customerTree.address': 'Address (optional)',
      'customerTree.none': 'No sub-customer',
      'customerTree.choose': 'Select',
      'customerTree.remove': 'Remove tag',
      'customerTree.noParent': 'Please select a customer first before using the customer tree (F5).',
      'customerTree.noChildren': 'This customer has no sub-customers yet.',
      'customerTree.nameRequired': 'The sub-customer name is required.',
      'customerTree.saveFailed': 'Could not save the sub-customer. Please retry, and make sure a main customer is selected and the customer tree is enabled.',
      'customerTree.saved': 'Sub-customer saved.',
      'customerTree.debt': 'Debt',
      'customerTree.invoices': 'Invoices',
      'customerTree.payments': 'Payments',
      'customerTree.pay': 'Pay',
      'customerTree.voucher': 'Receipt voucher',
      'customerTree.of': 'of',
      'customerTree.historyKept': 'Financial history stays on the main customer account.',
      'customerTree.deleteConfirm': 'Remove only the sub-customer tag? Financial history stays on the main customer account.',
      'customerTree.badge': 'of',
      'customerTree.sub': 'Sub-customer',
      'customerTree.selectHint': 'Choose a sub-customer or add a new one for this customer.',
      'customerTree.printLabel': 'Client secondaire',
    },
    fr: {
      'quickEntry.title': 'Saisie Rapide', 'quickEntry.subtitle': 'Facture d\'achat rapide — F1 pour fermer',
      'quickEntry.hint': 'F1 pour fermer • Flèches pour naviguer • + nouvelle ligne',
      'quickEntry.selectSupplier': 'Rechercher un fournisseur par nom...', 'quickEntry.supplier': 'Fournisseur', 'quickEntry.noSupplier': 'Aucun fournisseur trouvé',
      'quickEntry.searchProduct': 'Rechercher un produit (nom, code, marque)...', 'quickEntry.createNew': 'Créer un nouveau produit',
      'quickEntry.scanPlaceholder': 'Scannez le code-barres du produit...', 'quickEntry.scanReady': 'Prêt au scan',
      'quickEntry.scanAdded': 'Ajouté', 'quickEntry.scanIncremented': 'Quantité augmentée', 'quickEntry.scanNew': 'Nouveau produit — complétez ses informations',
      'quickEntry.addRow': 'Ajouter une ligne', 'quickEntry.qty': 'Qté', 'quickEntry.buyPrice': 'Prix d\'achat', 'quickEntry.sellPrice': 'Prix de vente', 'quickEntry.wholesalePrice': 'Prix de gros',
      'quickEntry.brand': 'Marque', 'quickEntry.reference': 'Référence', 'quickEntry.plu': 'PLU balance', 'quickEntry.pluPlaceholder': 'ex : 00123', 'quickEntry.barcode': 'Code-barres', 'quickEntry.countryOfOrigin': 'Pays d\'origine', 'quickEntry.mark': 'Marque', 'quickEntry.storageLocation': 'Emplacement de stockage',
      'quickEntry.family': 'Famille', 'quickEntry.extraPrices': 'Prix de vente supplémentaires (facultatif)', 'quickEntry.minPrice': 'Prix minimum', 'quickEntry.minPricePlaceholder': '0 = sans limite',
      'quickEntry.confirm': 'Confirmer la facture', 'quickEntry.cancel': 'Annuler', 'quickEntry.total': 'Total', 'quickEntry.timbre': 'Timbre fiscal',
      'quickEntry.purchaseDiscount': 'Remise achat %', 'quickEntry.invoiceDiscount': 'Remise facture',
      'quickEntry.grossTotal': 'Total avant remise', 'quickEntry.productDiscount': 'Remise produits', 'quickEntry.realTotal': 'Total réel',
      'quickEntry.fixedAmount': 'Montant fixe',
      'quickEntry.noSupplierWarn': 'Veuillez sélectionner un fournisseur d\'abord', 'quickEntry.emptyWarn': 'Ajoutez au moins un produit',
      'quickEntry.success': 'Facture enregistrée pour', 'quickEntry.barcodeConflict': 'Ce code-barres est déjà enregistré pour un autre produit',
      'quickEntry.expiryRequired': 'La date d\'expiration est obligatoire — veuillez la remplir sur toutes les lignes',
      'quickEntry.familyRequired': 'Veuillez saisir la famille du produit sur toutes les lignes (mode pharmacie)',
      'quickEntry.editInvoice': 'Modifier la facture',
      'quickEntry.editInvoiceHint': 'Ajoutez ou supprimez des lignes puis revenuez à l\'écran de modification — rien n\'est enregistré avant «Enregistrer les modifications»',
      'quickEntry.returnAdds': 'Retourner avec les lignes',
      'quickEntry.nothingChanged': 'Aucune ligne modifiée — ajoutez, modifiez ou supprimez puis réessayez',
      'quickEntry.addSupplier': 'Créer un fournisseur', 'quickEntry.newSupplierTitle': 'Nouveau fournisseur',
      'quickEntry.saveAndSelect': 'Enregistrer et sélectionner', 'quickEntry.paidNow': 'Payé maintenant',
      'quickEntry.remaining': 'Restant',
      'quickEntry.needSupplierForPay': 'Sélectionnez ou créez un fournisseur avant d\'enregistrer un paiement',
      'quickEntry.purchaseAmount': 'Montant d\'achat', 'quickEntry.purchaseAmountBtn': 'Afficher le montant d\'achat', 'quickEntry.hidePurchaseAmount': 'Masquer le montant d\'achat', 'quickEntry.productInfo': 'Infos produit',
      'inventory.expiryDate': 'Date d\'expiration', 'inventory.expiryRequired': 'La date d\'expiration est obligatoire — veuillez la saisir',
      'inventory.qtyInvalid': 'La quantité doit être supérieure à zéro',
      'inventory.family': 'Famille',
      'inventory.familyRequired': 'Veuillez saisir la famille du produit (requise en mode pharmacie)',
      'inventory.plu': 'Code balance (PLU)',
      'inventory.pluPlaceholder': 'ex : 00123',
      'inventory.pluConflict': 'Ce code appartient déjà à un autre produit',
      'inventory.pluReplaceConfirm': 'Ce produit est déjà lié au code {old}. Le remplacer par {new} ? Après le changement, la balance redemandera {old} à chaque lecture.',
      'inventory.scaleSettings': 'Paramètres balance',
      'scale.settingsTitle': 'Lecture des codes-barres de balance',
      'scale.hint': 'Décrivez ce que la balance imprime : le préfixe, la position du code produit (PLU), puis le poids, le prix unitaire ou le montant avec la longueur et les décimales. Collez un code réel dans la zone de test avant d\'enregistrer.',
      'scale.enable': 'Lire les codes de balance à la vente',
      'scale.rejectBadCheck': 'Rejeter un code dont la clé de contrôle est fausse',
      'scale.preview': 'Tester un code réel',
      'scale.previewPlaceholder': 'Collez le barcode tel que la balance l\'a imprimé…',
      'scale.previewHint': 'Collez un code pour voir ce que le système en comprendra.',
      'scale.previewNoMatch': 'Ne correspond à aucun pattern activé',
      'scale.addField': 'Nouveau pattern',
      'scale.restorePresets': 'Restaurer les patterns par défaut',
      'scale.restoreConfirm': 'Tous les patterns personnalisés seront supprimés. Continuer ?', 'scale.title': 'Balance',
      'scale.newPattern': 'Pattern balance',
      'scale.moduleMissing': 'Le module balance est absent',
      'scale.fixErrors': 'Corrigez les positions des champs : chevauchement ou hors du code',
      'scale.needPattern': 'Activez au moins un pattern avant d\'enregistrer',
      'scale.fromLabel': 'Montant pris sur l’étiquette',
      'scale.priceFromCard': 'Prix pris sur la fiche produit',
      'scale.checkOk': 'Clé de contrôle valide',
      'scale.checkBad': 'Clé de contrôle fausse',
      'scale.qty': 'Quantité',
      'scale.total': 'Total',
      'scale.colPrefix': 'Préfixe',
      'scale.colDigits': 'Nombre de chiffres',
      'scale.colCheck': 'Clé de contrôle',
      'scale.colWeight': 'Poids',
      'scale.colUnitPrice': 'Prix unitaire',
      'scale.colAmount': 'Montant',
      'scale.pos': 'Position',
      'scale.len': 'Longueur',
      'scale.dec': 'Décimales',
      'scale.errNoPrefix': 'Le préfixe est obligatoire',
      'scale.errRange': 'Le champ dépasse la longueur du code',
      'scale.errOverlap': 'Deux champs utilisent les mêmes chiffres',
      'scale.errPrefix': 'Le champ commence dans le préfixe',
      'scale.preset21Weight': '21 — poids (13 chiffres)',
      'scale.preset22Unit': '22 — prix unitaire (13 chiffres)',
      'scale.preset23Amount': '23 — montant (13 chiffres)',
      'scale.preset24Count': '24 — nombre de pièces (13 chiffres)',
      'scale.preset2xWeight': '2* — poids (13 chiffres)',
      'scale.preset9xWeight': '9* — poids (13 chiffres)',
      'scale.preset12Weight': '21 — poids (12 chiffres, sans clé)',
'inventory.scaleSync': 'Synchronisation balance',
'scaleSync.title': 'Synchronisation balance (télécharger la liste d’articles)',
'scaleSync.sub': 'Envoyez la liste d’articles (PLU + nom + prix) à la balance pour qu’elle imprime les étiquettes. Le montant imprimé sur l’étiquette fait foi à la vente.',
'scaleSync.profile': 'Profil balance',
'scaleSync.transport': 'Liaison',
'scaleSync.transport.file': 'Fichier / USB',
'scaleSync.transport.com': 'Port COM',
'scaleSync.transport.raw-com': 'COM brut',
'scaleSync.transport.net': 'Réseau (IP)',
'scaleSync.comPort': 'Port COM',
'scaleSync.baudRate': 'Débit',
'scaleSync.host': 'Adresse IP',
'scaleSync.port': 'Port',
'scaleSync.scanPorts': 'Scanner les ports',
'scaleSync.selection': 'Sélection des articles',
'scaleSync.onlyWithPlu': 'Articles ayant un PLU uniquement',
'scaleSync.onlyWeighed': 'Articles pesés uniquement (non quantifiés)',
'scaleSync.brandId': 'Marque (optionnel)',
'scaleSync.count': 'Articles',
'scaleSync.stale': 'Articles dont le prix a changé',
'scaleSync.consistency': 'Cohérence avec les réglages de lecture',
'scaleSync.preview': 'Aperçu du fichier',
'scaleSync.exportFile': 'Exporter le fichier',
'scaleSync.send': 'Envoyer à la balance',
'scaleSync.save': 'Enregistrer les réglages',
'scaleSync.lastSync': 'Dernière synchronisation',
'scaleSync.noProducts': 'Aucun article sélectionné',
'scaleSync.advanced': 'Avancé',
'scaleSync.pluWidth': 'Largeur PLU',
'scaleSync.priceDecimals': 'Décimales du prix',
'scaleSync.nameMax': 'Longueur max du nom',
'scaleSync.nameMode': 'Mode du nom',
'scaleSync.nameModeRaw': 'Tel quel',
'scaleSync.nameModeLatin': 'Latin (translittéré)',
'scaleSync.delimiter': 'Délimiteur (CSV)',
'scaleSync.encoding': 'Encodage',
'scaleSync.lineEnding': 'Fin de ligne',
'scaleSync.warnDecodeOff': 'La lecture des codes balance est désactivée dans les réglages balance — activez-la pour lire les étiquettes.',
'scaleSync.warnNoPattern': 'Aucun motif de lecture activé — ajoutez-en un dans les réglages balance.',
'scaleSync.warnPluWidth': 'La largeur PLU de l’export ne correspond pas au champ PLU des réglages de lecture — le code-barres risque de ne pas être lu.',
'scaleSync.exported': '{n} article(s) exporté(s).',
'scaleSync.sent': '{n} octets envoyés à la balance.',
'scaleSync.saved': 'Réglages enregistrés.',
'scaleSync.noPermission': 'Synchronisation non autorisée — réservée au gestionnaire.',
'scaleSync.fileHint': 'Un fichier texte (CSV/TXT) sera enregistré sur le disque ; chargez-le dans la balance via USB ou carte mémoire.',
'scaleSync.scanned': '{n} port(s) scanné(s).',
'scaleSync.noHardware': 'Non disponible dans cette version.',
'scaleSync.profileCsv': 'CSV générique (UTF-8)',
'scaleSync.profileCsvLatin': 'CSV latin',
'scaleSync.profileFixed': 'Largeur fixe (ASCII)',
'scaleSync.profileCas': 'CAS',
'scaleSync.profileBizerba': 'Bizerba',
'scaleSync.profileMettler': 'Mettler',
'scaleSync.profileDigi': 'Digi',
'scaleSync.profileExcell': 'Excell',
'scaleSync.profileTScale': 'T-Scale',
'scaleSync.portPicked': 'Port sélectionné : ',
'scaleSync.comPortManual': 'Ou saisissez le port manuellement (COM3)',
'scaleSync.noPortsFound': 'Aucun port trouvé automatiquement. Saisissez le port manuellement (COM3) ou vérifiez le pilote.',
'scaleSync.removed': 'Articles retirés',
'scaleSync.incremental': 'Envoyer les modifiés seulement (incrémental)',
'scaleSync.articles': 'Articles sélectionnés (nom balance + dept)',
'scaleSync.saveArticles': 'Enregistrer les articles',
'scaleSync.colPlu': 'PLU',
'scaleSync.colName': 'Nom (balance)',
'scaleSync.colDept': 'Dept',
'scaleSync.colPrice': 'Prix',
'scaleSync.savedArticles': '{n} article(s) enregistré(s).',
'scaleSync.printLabel': 'Imprimer étiquette balance (solution de repli)',
'scaleSync.printArticle': 'Article',
'scaleSync.printWeight': 'Poids',
'scaleSync.genCode': 'Générer le code',
'scaleSync.printNow': 'Imprimer',
'scaleSync.codeGenerated': 'Code généré.',
'scaleSync.noPatternForPrint': 'Aucun motif de lecture avec PLU+poids activé — ajoutez-en un dans les réglages balance.',
'scaleSync.printReady': 'Saisissez le poids, puis cliquez sur «Générer le code».',
      'sales.scaleTitle': 'Étiquette de balance',
      'sales.scaleQty': 'Poids / quantité',
      'sales.scalePrice': 'Prix unitaire',
      'sales.scaleLink': 'Lier à un produit du stock',
      'sales.scaleSearchPh': 'Rechercher par nom, code-barres ou référence',
      'sales.scaleLinkHint': 'Le lien est enregistré sur la fiche produit : chaque future étiquette avec ce code y va directement.',
      'sales.scaleFree': 'Vendre en ligne libre',
      'sales.scaleAdd': 'Ajouter au panier',
      'sales.scaleTag': 'balance',
      'sales.scaleFromLabelTag': 'Montant imprimé sur l\'étiquette',
      'sales.scaleNeedQty': 'L\'étiquette porte un prix sans poids : saisissez le poids',
      'sales.scaleUnknownPlu': 'Aucune fiche pour ce code balance : liez-le ou vendez en ligne libre',
      'sales.scalePick': 'Choisissez un produit à lier ou appuyez sur « Vendre en ligne libre »',
      'sales.scaleNone': 'Aucun produit avec ce nom',
      'sales.scaleQtyBad': 'Saisissez un poids supérieur à zéro',
      'sales.findSubstitute': 'Chercher un substitut',
      'sales.substituteTitle': 'Substituts disponibles',
      'sales.substituteFor': 'Substituts pour',
      'sales.substituteEmpty': 'Aucun substitut disponible dans cette famille',
      'sales.substituteAdd': 'Ajouter au panier',
      'sales.substituteNoFamily': 'Ce produit n\u2019a pas de famille',
      'sales.familyRequired': 'Veuillez saisir la famille du produit (Réglages → Mode pharmacie)',
      'sales.expiredBlocked': 'Périmé — impossible de vendre',
      'sales.scannerExpired': 'Périmé — vente interdite',
      'sales.batchExpiredPartial': 'Unités périmées trouvées et exclues',
      'sales.subShortage': 'Disponible',
      'sales.substituteCount': 'substituts disponibles',
      'sales.qtyModalTitle': 'Quantités rapides',
      'sales.qtyModalQty': 'Qté',
      'sales.qtyModalItems': 'articles',
      'sales.qtyModalFull': 'Quantité max',
      'sales.qtyModalKeys': '↑ / ↓ déplacer · chiffres = qté · Del supprimer · Entrée / Échap fermer · + suivant',
      'sales.qtyModalHint': 'Appuyez sur + pour afficher et modifier les quantités au clavier',
      'invoices.transferBtn': 'Transférer la facture',
      'invoices.transferTitle': 'Transférer la facture à un fournisseur',
      'invoices.transferHint': 'Saisissez le nom du fournisseur et sélectionnez-le ; la facture sera enregistrée sur ce fournisseur comme si elle avait été créée pour lui.',
      'invoices.transferSearchPlaceholder': 'Rechercher un fournisseur par nom ou téléphone...',
      'invoices.transferSelected': 'La facture sera transférée à :',
      'invoices.transferConfirm': 'Confirmer le transfert',
      'invoices.transferNoResults': 'Aucun fournisseur avec ce nom',
      'invoices.transferCurrent': 'Fournisseur actuel',
      'invoices.transferNoSupplier': 'Cette facture n’est liée à aucun fournisseur',
      'invoices.transferSame': 'La facture est déjà enregistrée sur ce fournisseur',
      'invoices.transferDone': 'Facture transférée au fournisseur : {name}',
      'invoices.transferOweHim': 'Nous lui devons',
      'invoices.transferHeOwes': 'Il nous doit',
      'invoices.transferItems': 'articles',
      'invoices.transferCurrentTag': 'actuel',
      'invoices.transferAmount': 'Montant',
      'invoices.transferAfterBal': 'Solde après transfert',
      'invoices.transferConfirmMsg': 'Transférer la facture de « {from} » à « {to} » pour {amount} ? Le solde du fournisseur précédent sera annulé et enregistré sur le nouveau fournisseur.',
      'invoices.convertBtn': 'Convertir en client',
      'invoices.convertTitle': 'Convertir la facture en compte client',
      'invoices.convertExisting': 'Choisir un client existant',
      'invoices.convertNew': 'Créer un nouveau client',
      'invoices.convertSearchPlaceholder': 'Rechercher un client par nom ou téléphone...',
      'invoices.convertSelected': 'La facture sera enregistrée sur :',
      'invoices.convertNewName': 'Nom du client',
      'invoices.convertNewPhone': 'Téléphone',
      'invoices.convertNewDiscount': 'Remise %',
      'invoices.convertNewAddress': 'Adresse',
      'invoices.convertNewType': 'Type de prix',
      'invoices.convertNewTypeUnit': 'Unité',
      'invoices.convertNewTypeWhole': 'Gros',
      'invoices.convertConfirm': 'Confirmer la conversion',
      'invoices.convertWalkinLabel': 'Client de passage (non enregistré)',
      'invoices.convertCashChip': 'encaissé',
      'invoices.convertWalkinNotice': 'Vente comptant non enregistrée. Le montant total {amount} sera porté au solde du client et l’encaissement enregistré ({cash}) sera annulé.',
      'invoices.convertReassignNotice': 'La facture est actuellement enregistrée sur « {from} ». Le reste dû ({amount}) sera transféré au nouveau client ; les sommes déjà encaissées restent acquises.',
      'invoices.convertPreviewFull': 'Le montant total {amount} sera ajouté au solde du client.',
      'invoices.convertPreviewRemaining': 'Le reste dû {amount} sera ajouté au solde du client.',
      'invoices.convertPreviewOld': '{amount} sera retiré du solde du client précédent.',
      'invoices.convertBalanceNow': 'Solde actuel',
      'invoices.convertBalanceAfter': 'Après conversion',
      'invoices.convertNewHint': 'Saisissez le nom du client pour créer un compte et y transférer la facture.',
      'invoices.convertWillCreate': 'Le client « {name} » sera créé.',
      'invoices.convertWillMove': '{amount} sera ajouté à son solde.',
      'invoices.convertNoResults': 'Aucun client avec ce nom',
      'invoices.convertCurrentTag': 'actuel',
      'invoices.convertNameRequired': 'Veuillez saisir le nom du client',
      'invoices.convertSelectTarget': 'Veuillez d’abord choisir un client',
      'invoices.convertConfirmWalkin': 'Convertir la facture en « {name} » et enregistrer {amount} sur son solde ? L’encaissement enregistré ({cash}) sera annulé.',
      'invoices.convertConfirmReassign': 'Déplacer la facture de « {from} » vers « {to} » et transférer le reste dû {amount} ?',
      'invoices.convertDone': 'Facture convertie en client : {name}',
      'invoices.convertNoteTitle': 'Cette facture a été convertie en compte client',
      'invoices.convertNoteFrom': 'Source :',
      'invoices.convertNoteCancelled': 'Encaissement enregistré annulé : {amount}',
      'invoices.convertNoteOn': 'Date de conversion : {date}',
      'invoices.convertErrNotSale': 'Seules les factures de vente peuvent être converties',
      'invoices.convertErrProvisional': 'Une facture provisoire ne peut pas être convertie',
      'invoices.convertErrHasReturns': 'Une facture avec des retours ne peut pas être convertie',
      'invoices.convertErrNoCustomer': 'Veuillez choisir le client',
      'invoices.convertErrSame': 'La facture est déjà enregistrée sur ce client',
      'invoices.convertErrZero': 'Une facture à montant nul ne peut pas être convertie',
      'invoices.convertErrUnavailable': 'Le moteur de conversion n’est pas chargé',
      'invoices.convertErrGeneric': 'Cette facture ne peut pas être convertie',
      'settings.pharmacyMode': 'Mode pharmacie',
      'settings.pharmacyModeHint': 'Active les champs de date de péremption, rend la famille obligatoire, passe l’interface au vert/blanc/rouge et débloque le système de substituts.',
      'settings.pharmaFeatExpiry': 'Champs de péremption',
      'settings.pharmaFeatFamily': 'Famille obligatoire avec suggestions',
      'settings.pharmaFeatSkin': 'Thème vert / blanc / rouge',
      'settings.pharmaFeatSub': 'Bouton « Chercher un substitut » en rupture',
      'settings.pharmaSwatchOk': 'OK',
      'settings.pharmaSwatchWarn': 'Expire bientôt',
      'settings.pharmaSwatchBad': 'Périmé',
      'settings.customerTree': 'Arborescence des clients',
      'settings.deleteProductsCard': 'Zone dangereuse',
      'settings.deleteProductsTitle': 'Supprimer les produits uniquement',
      'settings.deleteProductsBtn': 'Supprimer les produits',
      'settings.deleteProductsHint': 'Seuls les produits du catalogue sont supprimés. Les factures gardent le nom de leurs produits ; clients, fournisseurs, soldes, paiements et reçus restent inchangés.',
      'settings.deleteProductsKeep': 'Conservé : factures, noms des produits qu’elles contiennent, clients, fournisseurs, soldes, paiements, reçus, retours et paramètres.',
      'settings.deleteProductsPassword': 'Mot de passe du magasin',
      'settings.deleteProductsConfirm': 'Confirmer la suppression',
      'settings.deleteProductsWrong': 'Mot de passe incorrect. Rien n’a été supprimé.',
      'settings.deleteProductsManagerOnly': 'Aucun mot de passe magasin n’est défini ; cette action est réservée aux responsables. Rien n’a été supprimé.',
      'settings.deleteProductsEmpty': 'Aucun produit à supprimer.',
      'settings.deleteProductsDone': '{count} produit(s) supprimé(s). Factures, clients, fournisseurs et paiements sont restés inchangés.',
      'settings.deleteProductsFailed': 'Impossible de supprimer les produits. Rien n’a été supprimé.',
      'customerTree.title': 'Arborescence des clients',
      'customerTree.subCustomers': 'Clients secondaires',
      'customerTree.add': 'Ajouter un client secondaire',
      'customerTree.edit': 'Modifier le client secondaire',
      'customerTree.name': 'Nom (obligatoire)',
      'customerTree.phone': 'Téléphone (facultatif)',
      'customerTree.address': 'Adresse (facultative)',
      'customerTree.none': 'Sans client secondaire',
      'customerTree.choose': 'Choisir',
      'customerTree.remove': 'Retirer l’étiquette',
      'customerTree.noParent': 'Veuillez d’abord choisir un client avant d’utiliser l’arborescence (F5).',
      'customerTree.noChildren': 'Ce client n’a pas encore de clients secondaires.',
      'customerTree.nameRequired': 'Le nom du client secondaire est obligatoire.',
      'customerTree.saveFailed': 'Impossible d’enregistrer le client secondaire. Réessayez, et vérifiez qu’un client principal est choisi et que l’arborescence est activée.',
      'customerTree.saved': 'Client secondaire enregistré.',
      'customerTree.debt': 'Dette',
      'customerTree.invoices': 'Factures',
      'customerTree.payments': 'Paiements',
      'customerTree.pay': 'Payer',
      'customerTree.voucher': 'Reçu de paiement',
      'customerTree.of': 'de',
      'customerTree.historyKept': 'L’historique financier reste sur le compte du client principal.',
      'customerTree.deleteConfirm': 'Retirer uniquement l’étiquette du client secondaire ? L’historique financier reste sur le compte principal.',
      'customerTree.badge': 'de',
      'customerTree.sub': 'Client secondaire',
      'customerTree.selectHint': 'Choisissez un client secondaire ou ajoutez-en un nouveau pour ce client.',
      'customerTree.printLabel': 'Client secondaire',
    },
    zh: {
      'quickEntry.title': '快速录入', 'quickEntry.subtitle': '快速采购发票 — F1 关闭',
      'quickEntry.hint': 'F1 关闭 • 方向键导航 • + 新行',
      'quickEntry.selectSupplier': '按名称搜索供应商...', 'quickEntry.supplier': '供应商', 'quickEntry.noSupplier': '未找到供应商',
      'quickEntry.searchProduct': '搜索产品（名称、条码、品牌）...', 'quickEntry.createNew': '创建新产品',
      'quickEntry.scanPlaceholder': '扫描产品条码...', 'quickEntry.scanReady': '准备扫描',
      'quickEntry.scanAdded': '已添加', 'quickEntry.scanIncremented': '数量增加', 'quickEntry.scanNew': '新产品 — 请补全信息',
      'quickEntry.addRow': '添加行', 'quickEntry.qty': '数量', 'quickEntry.buyPrice': '进货价', 'quickEntry.sellPrice': '售价', 'quickEntry.wholesalePrice': '批发价',
      'quickEntry.brand': '品牌', 'quickEntry.reference': '参考号', 'quickEntry.plu': '秤码 PLU', 'quickEntry.pluPlaceholder': '例如：00123', 'quickEntry.barcode': '条码', 'quickEntry.countryOfOrigin': '原产国', 'quickEntry.mark': '商标', 'quickEntry.storageLocation': '存放位置',
      'quickEntry.family': '家族', 'quickEntry.extraPrices': '额外售价（可选）', 'quickEntry.minPrice': '最低价', 'quickEntry.minPricePlaceholder': '0 = 不限制',
      'quickEntry.confirm': '确认发票', 'quickEntry.cancel': '取消', 'quickEntry.total': '总计', 'quickEntry.timbre': '印花税',
      'quickEntry.purchaseDiscount': '进货折扣 %', 'quickEntry.invoiceDiscount': '发票折扣',
      'quickEntry.grossTotal': '折扣前总计', 'quickEntry.productDiscount': '产品折扣', 'quickEntry.realTotal': '实际总计',
      'quickEntry.fixedAmount': '固定金额',
      'quickEntry.noSupplierWarn': '请先选择供应商', 'quickEntry.emptyWarn': '请至少添加一个产品',
      'quickEntry.success': '已登记发票，金额', 'quickEntry.barcodeConflict': '此条码已注册给其他产品',
      'quickEntry.expiryRequired': '有效期必填 — 请在所有行填写',
      'quickEntry.familyRequired': '请输入每行的产品家族（药房模式）',
      'quickEntry.editInvoice': '编辑发票',
      'quickEntry.editInvoiceHint': '添加或删除行后返回编辑屏幕 — 在点击保存修改之前不会保存任何内容',
      'quickEntry.returnAdds': '带着行返回',
      'quickEntry.nothingChanged': '没有行被修改 — 请添加、编辑或删除后重试',
      'quickEntry.addSupplier': '添加供应商', 'quickEntry.newSupplierTitle': '新建供应商',
      'quickEntry.saveAndSelect': '保存并选择', 'quickEntry.paidNow': '已支付',
      'quickEntry.remaining': '剩余',
      'quickEntry.needSupplierForPay': '请先选择或新建供应商，再记录付款',
      'quickEntry.purchaseAmount': '采购金额', 'quickEntry.purchaseAmountBtn': '显示采购金额', 'quickEntry.hidePurchaseAmount': '隐藏采购金额', 'quickEntry.productInfo': '产品信息',
      'inventory.expiryDate': '有效期', 'inventory.expiryRequired': '有效期必填 — 请输入',
      'inventory.qtyInvalid': '数量必须大于零',
      'inventory.family': '家族',
      'inventory.familyRequired': '请输入产品家族（药房模式必填）',
      'inventory.plu': '秤码 (PLU)',
      'inventory.pluPlaceholder': '例如：00123',
      'inventory.pluConflict': '该编码已属于其他产品',
      'inventory.pluReplaceConfirm': '该商品已关联编码 {old}。改为 {new}？更改后，每次扫描 {old} 时系统会再次询问。',
      'inventory.scaleSettings': '电子秤设置',
      'scale.settingsTitle': '电子秤条码读取设置',
      'scale.hint': '请描述电子秤打印的内容：前缀、产品编号（PLU）的位置，以及重量、单价或金额的字长与小数位。保存前请在测试框粘贴一个真实条码确认。',
      'scale.enable': '销售时读取电子秤条码',
      'scale.rejectBadCheck': '校验位错误时拒绝该条码',
      'scale.preview': '测试真实条码',
      'scale.previewPlaceholder': '按电子秤打印的样子粘贴条码…',
      'scale.previewHint': '粘贴条码即可查看系统读取结果。',
      'scale.previewNoMatch': '与任何已启用的模式都不匹配',
      'scale.addField': '新建模式',
      'scale.restorePresets': '恢复内置模式',
      'scale.restoreConfirm': '将删除所有自定义模式并恢复内置模式。继续？', 'scale.title': '电子秤',
      'scale.newPattern': '电子秤模式',
      'scale.moduleMissing': '电子秤模块未加载',
      'scale.fixErrors': '请修正字段位置：重叠或超出条码长度',
      'scale.needPattern': '保存前请至少启用一个模式',
      'scale.fromLabel': '金额取自标签',
      'scale.priceFromCard': '价格取自产品卡片',
      'scale.checkOk': '校验位正确',
      'scale.checkBad': '校验位错误',
      'scale.qty': '数量',
      'scale.total': '合计',
      'scale.colPrefix': '前缀',
      'scale.colDigits': '位数',
      'scale.colCheck': '校验位',
      'scale.colWeight': '重量',
      'scale.colUnitPrice': '单价',
      'scale.colAmount': '金额',
      'scale.pos': '位置',
      'scale.len': '长度',
      'scale.dec': '小数位',
      'scale.errNoPrefix': '必须填写前缀',
      'scale.errRange': '字段超出条码位数',
      'scale.errOverlap': '两个字段使用了相同的位数',
      'scale.errPrefix': '字段起始位于前缀之内',
      'scale.preset21Weight': '21 — 重量（13 位）',
      'scale.preset22Unit': '22 — 单价（13 位）',
      'scale.preset23Amount': '23 — 金额（13 位）',
      'scale.preset24Count': '24 — 件数（13 位）',
      'scale.preset2xWeight': '2* — 重量（13 位）',
      'scale.preset9xWeight': '9* — 重量（13 位）',
      'scale.preset12Weight': '21 — 重量（12 位，无校验）',
'inventory.scaleSync': '电子秤同步',
'scaleSync.title': '电子秤同步（下载商品列表）',
'scaleSync.sub': '将商品列表（PLU + 名称 + 价格）发送到电子秤以打印标签。标签上的金额在销售时为参考。',
'scaleSync.profile': '电子秤模板',
'scaleSync.transport': '连接方式',
'scaleSync.transport.file': '文件 / USB',
'scaleSync.transport.com': 'COM 口',
'scaleSync.transport.raw-com': '原始 COM',
'scaleSync.transport.net': '网络 (IP)',
'scaleSync.comPort': 'COM 口',
'scaleSync.baudRate': '波特率',
'scaleSync.host': 'IP 地址',
'scaleSync.port': '端口',
'scaleSync.scanPorts': '扫描端口',
'scaleSync.selection': '商品选择',
'scaleSync.onlyWithPlu': '仅含 PLU 的商品',
'scaleSync.onlyWeighed': '仅称重商品（非计量）',
'scaleSync.brandId': '品牌（可选）',
'scaleSync.count': '商品数',
'scaleSync.stale': '价格已变更的商品',
'scaleSync.consistency': '与读取设置的一致性',
'scaleSync.preview': '文件预览',
'scaleSync.exportFile': '导出文件',
'scaleSync.send': '发送到电子秤',
'scaleSync.save': '保存设置',
'scaleSync.lastSync': '上次同步',
'scaleSync.noProducts': '未选择商品',
'scaleSync.advanced': '高级',
'scaleSync.pluWidth': 'PLU 宽度',
'scaleSync.priceDecimals': '价格小数位',
'scaleSync.nameMax': '名称最大长度',
'scaleSync.nameMode': '名称模式',
'scaleSync.nameModeRaw': '原样',
'scaleSync.nameModeLatin': '拉丁（音译）',
'scaleSync.delimiter': '分隔符（CSV）',
'scaleSync.encoding': '编码',
'scaleSync.lineEnding': '行尾',
'scaleSync.warnDecodeOff': '电子秤条码读取在设置中已关闭 — 请启用以读取标签。',
'scaleSync.warnNoPattern': '未启用任何读取模式 — 请在设置中添加。',
'scaleSync.warnPluWidth': '导出的 PLU 宽度与读取设置中的 PLU 字段不一致 — 可能无法读取条码。',
'scaleSync.exported': '已导出 {n} 个商品。',
'scaleSync.sent': '已向电子秤发送 {n} 字节。',
'scaleSync.saved': '设置已保存。',
'scaleSync.noPermission': '无权同步电子秤 — 仅限管理员。',
'scaleSync.fileHint': '文本文件（CSV/TXT）将保存到磁盘；通过 USB 或存储卡加载到电子秤。',
'scaleSync.scanned': '已扫描 {n} 个端口。',
'scaleSync.noHardware': '此版本不可用。',
'scaleSync.profileCsv': '通用 CSV (UTF-8)',
'scaleSync.profileCsvLatin': '拉丁 CSV',
'scaleSync.profileFixed': '固定宽度 (ASCII)',
'scaleSync.profileCas': 'CAS',
'scaleSync.profileBizerba': 'Bizerba',
'scaleSync.profileMettler': 'Mettler',
'scaleSync.profileDigi': 'Digi',
'scaleSync.profileExcell': 'Excell',
'scaleSync.profileTScale': 'T-Scale',
'scaleSync.portPicked': '已选择端口：',
'scaleSync.comPortManual': '或手动输入端口（COM3）',
'scaleSync.noPortsFound': '未自动找到端口。请手动输入端口（COM3）或检查驱动。',
'scaleSync.removed': '已移除商品',
'scaleSync.incremental': '仅发送已变更（增量）',
'scaleSync.articles': '已选商品（电子秤名称 + 部门）',
'scaleSync.saveArticles': '保存商品',
'scaleSync.colPlu': 'PLU',
'scaleSync.colName': '名称（电子秤）',
'scaleSync.colDept': '部门',
'scaleSync.colPrice': '价格',
'scaleSync.savedArticles': '已保存 {n} 个商品。',
'scaleSync.printLabel': '打印电子秤标签（备选）',
'scaleSync.printArticle': '商品',
'scaleSync.printWeight': '重量',
'scaleSync.genCode': '生成编码',
'scaleSync.printNow': '打印',
'scaleSync.codeGenerated': '编码已生成。',
'scaleSync.noPatternForPrint': '未启用含 PLU+重量的读取模式 — 请在设置中添加。',
'scaleSync.printReady': '输入重量，然后点击「生成编码」。',
      'sales.scaleTitle': '电子秤标签',
      'sales.scaleQty': '重量 / 数量',
      'sales.scalePrice': '单价',
      'sales.scaleLink': '关联库存商品',
      'sales.scaleSearchPh': '按名称、条码或编号搜索',
      'sales.scaleLinkHint': '关联会保存在商品卡上：以后同样编码的标签会直接进入该商品。',
      'sales.scaleFree': '作为自由行销售',
      'sales.scaleAdd': '加入购物车',
      'sales.scaleTag': '秤',
      'sales.scaleFromLabelTag': '金额来自标签',
      'sales.scaleNeedQty': '标签只有价格没有重量：请输入重量',
      'sales.scaleUnknownPlu': '此秤码没有商品卡：请关联商品或作为自由行销售',
      'sales.scalePick': '请选择要关联的商品，或点击“作为自由行销售”',
      'sales.scaleNone': '没有该名称的商品',
      'sales.scaleQtyBad': '请输入大于零的重量',
      'sales.findSubstitute': '查找替代品',
      'sales.substituteTitle': '可用替代品',
      'sales.substituteFor': '替代品：',
      'sales.substituteEmpty': '该家族中没有可用替代品',
      'sales.substituteAdd': '加入购物车',
      'sales.substituteNoFamily': '此产品没有家族',
      'sales.familyRequired': '请输入产品家族（设置 → 药房模式）',
      'sales.expiredBlocked': '已过期 — 无法销售',
      'sales.scannerExpired': '已过期 — 禁止销售',
      'sales.batchExpiredPartial': '发现过期库存，已排除',
      'sales.subShortage': '可选数量',
      'sales.substituteCount': '个可用替代品',
      'sales.qtyModalTitle': '快速修改数量',
      'sales.qtyModalQty': '数量',
      'sales.qtyModalItems': '件',
      'sales.qtyModalFull': '已达上限',
      'sales.qtyModalKeys': '↑ / ↓ 移动 · 数字 = 数量 · Del 删除 · Enter / Esc 关闭 · + 下一行',
      'sales.qtyModalHint': '按键盘 + 键查看并修改数量',
      'invoices.transferBtn': '转移发票',
      'invoices.transferTitle': '将发票转移给供应商',
      'invoices.transferHint': '输入供应商名称并选择，发票将记录在该供应商名下，如同为其创建。',
      'invoices.transferSearchPlaceholder': '按名称或电话搜索供应商...',
      'invoices.transferSelected': '发票将转移至：',
      'invoices.transferConfirm': '确认转移',
      'invoices.transferNoResults': '没有找到此名称的供应商',
      'invoices.transferCurrent': '当前供应商',
      'invoices.transferNoSupplier': '此发票尚未关联任何供应商',
      'invoices.transferSame': '发票已记录在该供应商名下',
      'invoices.transferDone': '发票已转移给供应商：{name}',
      'invoices.transferOweHim': '我们欠他',
      'invoices.transferHeOwes': '他欠我们',
      'invoices.transferItems': '件',
      'invoices.transferCurrentTag': '当前',
      'invoices.transferAmount': '金额',
      'invoices.transferAfterBal': '转移后余额',
      'invoices.transferConfirmMsg': '将发票从“{from}”转移至“{to}”，金额 {amount}？之前供应商的余额将被撤销并记录到新的供应商。',
      'invoices.convertBtn': '转为客户',
      'invoices.convertTitle': '将发票转为客户账户',
      'invoices.convertExisting': '选择现有客户',
      'invoices.convertNew': '新建客户',
      'invoices.convertSearchPlaceholder': '按名称或电话搜索客户...',
      'invoices.convertSelected': '发票将记录在：',
      'invoices.convertNewName': '客户名称',
      'invoices.convertNewPhone': '电话',
      'invoices.convertNewDiscount': '折扣 %',
      'invoices.convertNewAddress': '地址',
      'invoices.convertNewType': '价格类型',
      'invoices.convertNewTypeUnit': '零售',
      'invoices.convertNewTypeWhole': '批发',
      'invoices.convertConfirm': '确认转换',
      'invoices.convertWalkinLabel': '散客（未登记）',
      'invoices.convertCashChip': '已收现金',
      'invoices.convertWalkinNotice': '这是未登记的现金销售。全额 {amount} 将计入客户余额，已记录的现金收款（{cash}）将被取消。',
      'invoices.convertReassignNotice': '发票当前记录在“{from}”名下。未付余额（{amount}）将转移到新客户，已收款项保持不变。',
      'invoices.convertPreviewFull': '全额 {amount} 将加入客户余额。',
      'invoices.convertPreviewRemaining': '未付余额 {amount} 将加入客户余额。',
      'invoices.convertPreviewOld': '{amount} 将从原客户余额中扣除。',
      'invoices.convertBalanceNow': '当前余额',
      'invoices.convertBalanceAfter': '转换后',
      'invoices.convertNewHint': '输入客户名称以创建账户并将发票转入该账户。',
      'invoices.convertWillCreate': '将创建客户“{name}”。',
      'invoices.convertWillMove': '{amount} 将加入其余额。',
      'invoices.convertNoResults': '没有找到此名称的客户',
      'invoices.convertCurrentTag': '当前',
      'invoices.convertNameRequired': '请输入客户名称',
      'invoices.convertSelectTarget': '请先选择客户',
      'invoices.convertConfirmWalkin': '将发票转为“{name}”并在其余额中记录 {amount}？已记录的现金收款（{cash}）将被取消。',
      'invoices.convertConfirmReassign': '将发票从“{from}”转移到“{to}”，并转移未付余额 {amount}？',
      'invoices.convertDone': '发票已转为客户：{name}',
      'invoices.convertNoteTitle': '此发票已转为客户账户',
      'invoices.convertNoteFrom': '来源：',
      'invoices.convertNoteCancelled': '已取消记录的现金收款：{amount}',
      'invoices.convertNoteOn': '转换日期：{date}',
      'invoices.convertErrNotSale': '只能转换销售发票',
      'invoices.convertErrProvisional': '临时发票无法转换',
      'invoices.convertErrHasReturns': '有退货的发票无法转换',
      'invoices.convertErrNoCustomer': '请选择客户',
      'invoices.convertErrSame': '发票已记录在该客户名下',
      'invoices.convertErrZero': '金额为零的发票无法转换',
      'invoices.convertErrUnavailable': '转换引擎未加载',
      'invoices.convertErrGeneric': '无法转换此发票',
      'settings.pharmacyMode': '药房模式',
      'settings.pharmacyModeHint': '启用有效期字段、强制填写家族、界面切换为绿/白/红三色并解锁替代品系统。',
      'settings.pharmaFeatExpiry': '有效期字段',
      'settings.pharmaFeatFamily': '家族必填并带联想',
      'settings.pharmaFeatSkin': '绿 / 白 / 红 主题',
      'settings.pharmaFeatSub': '缺货时显示"查找替代品"按钮',
      'settings.pharmaSwatchOk': '正常',
      'settings.pharmaSwatchWarn': '即将过期',
      'settings.pharmaSwatchBad': '已过期',
      'settings.customerTree': '客户树',
      'settings.deleteProductsCard': '危险操作',
      'settings.deleteProductsTitle': '仅删除商品',
      'settings.deleteProductsBtn': '删除商品',
      'settings.deleteProductsHint': '只删除目录中的商品。发票保留商品名称，客户、供应商、余额、付款和收款单均保持不变。',
      'settings.deleteProductsKeep': '保留内容：发票及其中商品名称、客户、供应商、余额、付款、收款单、退货和设置。',
      'settings.deleteProductsPassword': '门店密码',
      'settings.deleteProductsConfirm': '确认删除',
      'settings.deleteProductsWrong': '密码错误。未删除任何内容。',
      'settings.deleteProductsManagerOnly': '尚未设置门店密码；此操作仅限经理执行。未删除任何内容。',
      'settings.deleteProductsEmpty': '没有可删除的商品。',
      'settings.deleteProductsDone': '已删除 {count} 个商品。发票、客户、供应商和付款均未改变。',
      'settings.deleteProductsFailed': '无法删除商品。未删除任何内容。',
      'customerTree.title': '客户树',
      'customerTree.subCustomers': '子客户',
      'customerTree.add': '添加子客户',
      'customerTree.edit': '编辑子客户',
      'customerTree.name': '名称（必填）',
      'customerTree.phone': '电话（选填）',
      'customerTree.address': '地址（选填）',
      'customerTree.none': '无子客户',
      'customerTree.choose': '选择',
      'customerTree.remove': '移除标签',
      'customerTree.noParent': '使用客户树（F5）前请先选择客户。',
      'customerTree.noChildren': '该客户尚无子客户。',
      'customerTree.nameRequired': '子客户名称必填。',
      'customerTree.saveFailed': '无法保存子客户。请重试，并确认已选择主客户且已启用客户树。',
      'customerTree.saved': '子客户已保存。',
      'customerTree.debt': '欠款',
      'customerTree.invoices': '发票',
      'customerTree.payments': '付款',
      'customerTree.pay': '付款',
      'customerTree.voucher': '收款单',
      'customerTree.of': '的',
      'customerTree.historyKept': '财务记录仍保留在主客户账户。',
      'customerTree.deleteConfirm': '仅移除子客户标签？财务记录仍保留在主客户账户。',
      'customerTree.badge': '属于',
      'customerTree.sub': '子客户',
      'customerTree.selectHint': '选择子客户或为该客户添加新子客户。',
      'customerTree.printLabel': 'Client secondaire',
    },
  };
  for (const lang in sets) {
    const base = LANG[lang];
    if (!base) continue;
    for (const k in sets[lang]) {
      const parts = k.split('.');
      let obj = base;
      for (let i = 0; i < parts.length - 1; i++) {
        if (parts[i] && !obj[parts[i]]) obj[parts[i]] = {};
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = sets[lang][k];
    }
  }
})();

// Phone-scanner polish: network-address picker, clearer errors, copy-link.
(function patchScannerLANG() {
  const sets = {
    ar: {
      'connection.scannerIpLabel': 'عنوان الشبكة المستخدم في رمز QR',
      'connection.scannerIpVirtual': 'وهمي',
      'connection.scannerDetails': 'تفاصيل',
      'connection.scannerErrPort': 'المنفذ مستخدم من برنامج آخر — سيُجرّب منفذ بديل تلقائيًا',
      'connection.scannerErrCert': 'تعذّر توليد شهادة الأمان المحلية',
      'connection.scannerErrTimeout': 'انتهت المهلة أثناء التشغيل',
      'connection.copyLink': 'نسخ الرابط',
      'connection.copyDone': 'تم النسخ',
    },
    en: {
      'connection.scannerIpLabel': 'Network address used in the QR code',
      'connection.scannerIpVirtual': 'virtual',
      'connection.scannerDetails': 'Details',
      'connection.scannerErrPort': 'The port is used by another program — a fallback port will be tried automatically',
      'connection.scannerErrCert': 'Could not generate the local security certificate',
      'connection.scannerErrTimeout': 'Timed out while starting',
      'connection.copyLink': 'Copy link',
      'connection.copyDone': 'Copied',
    },
    fr: {
      'connection.scannerIpLabel': 'Adresse réseau utilisée dans le QR code',
      'connection.scannerIpVirtual': 'virtuel',
      'connection.scannerDetails': 'Détails',
      'connection.scannerErrPort': 'Le port est utilisé par un autre programme — un port de secours sera essayé automatiquement',
      'connection.scannerErrCert': 'Impossible de générer le certificat de sécurité local',
      'connection.scannerErrTimeout': 'Délai dépassé au démarrage',
      'connection.copyLink': 'Copier le lien',
      'connection.copyDone': 'Copié',
    },
    zh: {
      'connection.scannerIpLabel': '二维码使用的网络地址',
      'connection.scannerIpVirtual': '虚拟',
      'connection.scannerDetails': '详情',
      'connection.scannerErrPort': '端口被其他程序占用 — 将自动尝试备用端口',
      'connection.scannerErrCert': '无法生成本地安全证书',
      'connection.scannerErrTimeout': '启动超时',
      'connection.copyLink': '复制链接',
      'connection.copyDone': '已复制',
    },
  };
  for (const lang in sets) {
    const base = LANG[lang];
    if (!base) continue;
    if (!base.connection) base.connection = {};
    for (const k in sets[lang]) {
      base.connection[k.replace('connection.', '')] = sets[lang][k];
    }
  }
})();

/* ---- Display settings (إعدادات العرض) — top-bar panel labels ---- */
(function () {
  const sets = {
    ar: {
      title: 'إعدادات العرض', close: 'إغلاق',
      hint: 'اسحب المؤشر أو اكتب القيمة بدقة، ثم اضغط «حفظ التغييرات». المعاينة أدناه تتبع حركتك لحظيًا.',
      preview: 'معاينة مباشرة',
      tagSales: 'بطاقات البيع', tagInv: 'بطاقات المخزون',
      sample1: 'فلتر زيت BOSCH', sampleMeta1: '12 قطعة في المخزون',
      sample2: 'فلتر هواء MANN', sampleMeta2: 'الباركود: 4024300',
      salesCards: 'حجم بطاقات البيع', invCards: 'حجم بطاقات المخزون',
      salesHeight: 'ارتفاع بطاقات البيع', invHeight: 'ارتفاع بطاقات المخزون',
      sidebar: 'عرض القائمة الجانبية',
      salesName: 'خط أسماء منتجات البيع', invName: 'خط أسماء منتجات المخزون',
      salesCart: 'عرض سلة البيع',
      invoiceGroup: 'أعمدة الفاتورة', invShowReference: 'Référence', invShowMark: 'Marque',
      px: 'بكسل',
      reset: 'إعادة الضبط إلى الافتراضي', save: 'حفظ التغييرات',
      saved: 'تم حفظ التغييرات', dirty: 'تغييرات غير محفوظة',
    },
    en: {
      title: 'Display Settings', close: 'Close',
      hint: 'Drag a slider or type an exact value, then press “Save changes”. The preview below follows your input live.',
      preview: 'Live preview',
      tagSales: 'Sales cards', tagInv: 'Inventory cards',
      sample1: 'Oil filter BOSCH', sampleMeta1: '12 in stock',
      sample2: 'Air filter MANN', sampleMeta2: 'Barcode: 4024300',
      salesCards: 'Sales card size', invCards: 'Inventory card size',
      salesHeight: 'Sales card height', invHeight: 'Inventory card height',
      sidebar: 'Sidebar width',
      salesName: 'Sales product-name font size', invName: 'Inventory product-name font size',
      salesCart: 'Sales cart width',
      invoiceGroup: 'Invoice columns', invShowReference: 'Référence', invShowMark: 'Marque',
      px: 'px',
      reset: 'Reset to defaults', save: 'Save changes',
      saved: 'Changes saved', dirty: 'Unsaved changes',
    },
    fr: {
      title: 'Paramètres d’affichage', close: 'Fermer',
      hint: 'Faites glisser un curseur ou saisissez une valeur exacte, puis appuyez sur « Enregistrer ». L’aperçu ci-dessous suit vos réglages en direct.',
      preview: 'Aperçu en direct',
      tagSales: 'Cartes de vente', tagInv: 'Cartes de stock',
      sample1: 'Filtre à huile BOSCH', sampleMeta1: '12 en stock',
      sample2: 'Filtre à air MANN', sampleMeta2: 'Code-barres : 4024300',
      salesCards: 'Taille des cartes de vente', invCards: 'Taille des cartes de stock',
      salesHeight: 'Hauteur des cartes de vente', invHeight: 'Hauteur des cartes de stock',
      sidebar: 'Largeur de la barre latérale',
      salesName: 'Taille du nom (vente)', invName: 'Taille du nom (stock)',
      salesCart: 'Largeur du panier de vente',
      invoiceGroup: 'Colonnes de la facture', invShowReference: 'Référence', invShowMark: 'Marque',
      px: 'px',
      reset: 'Réinitialiser les valeurs', save: 'Enregistrer les modifications',
      saved: 'Modifications enregistrées', dirty: 'Modifications non enregistrées',
    },
    zh: {
      title: '显示设置', close: '关闭',
      hint: '拖动滑块或输入精确数值，然后点击「保存更改」。下方预览会实时跟随。',
      preview: '实时预览',
      tagSales: '销售卡片', tagInv: '库存卡片',
      sample1: '机油滤清器 BOSCH', sampleMeta1: '库存 12 件',
      sample2: '空气滤清器 MANN', sampleMeta2: '条码：4024300',
      salesCards: '销售卡片大小', invCards: '库存卡片大小',
      salesHeight: '销售卡片高度', invHeight: '库存卡片高度',
      sidebar: '侧边栏宽度',
      salesName: '销售商品名字号', invName: '库存商品名字号',
      salesCart: '销售购物车宽度',
      invoiceGroup: '发票列', invShowReference: 'Référence', invShowMark: 'Marque',
      px: '像素',
      reset: '恢复默认设置', save: '保存更改',
      saved: '更改已保存', dirty: '未保存的更改',
    },
  };
  for (const lang in sets) {
    const base = LANG[lang];
    if (!base) continue;
    base.display = Object.assign({}, base.display || {}, sets[lang]);
  }
})();

/* ---- Optional legal identity fields on supplier/customer forms ----------- */
(function () {
  const sets = {
    ar: { nis: 'NIS (اختياري)', nif: 'NIF (اختياري)', rc: 'RC (اختياري)', article: 'N° article (اختياري)' },
    en: { nis: 'NIS (optional)', nif: 'NIF (optional)', rc: 'RC (optional)', article: 'N° article (optional)' },
    fr: { nis: 'NIS (facultatif)', nif: 'NIF (facultatif)', rc: 'RC (facultatif)', article: 'N° article (facultatif)' },
    zh: { nis: 'NIS（可选）', nif: 'NIF（可选）', rc: 'RC（可选）', article: 'N° article（可选）' },
  };
  for (const lang in sets) {
    const base = LANG[lang];
    if (!base) continue;
    base.partyLegal = Object.assign({}, base.partyLegal || {}, sets[lang]);
  }
})();

/* ---- Form layout (F1 + Smart Add): order / widths / tiered auto-fill ------ */
(function () {
  const sets = {
    ar: {
      title: 'إعدادات نماذج الإدخال', close: 'إغلاق',
      tabOrder: 'ترتيب الحقول', tabWidth: 'عرض الأعمدة', tabAuto: 'الملء التلقائي',
      rowNo: '#', delete: 'حذف', drag: 'اسحب أو استخدم الأسهم',
      fixedFirst: 'ثابت', fixedLast: 'ثابت', hiddenFv: 'مخفي — يبقى في مكانه',
      orderHead: 'الترتيب مشترك بين الإدخال السريع والإضافة الذكية',
      orderHelp: 'اسحب الحقل أو استخدم ↑ ↓. الترتيب نفسه يُطبَّق في الشاشتين؛ رقم السطر وزر الحذف ثابتان، والحقول المخفية تحتفظ بمكانها.',
      widthHelp: 'لكل شاشة عرض مستقل. القيم محصورة بين الحد الأدنى والأقصى مع زر ↺ لكل حقل.',
      autoHelp: 'يعمل الملء على الحقول الفارغة فقط، ويُثبَّت أي حقل عدّلته يدويًا. تغيير سعر الشراء يعيد حساب الحقول غير المثبَّتة فقط.',
      pageQe: 'الإدخال السريع (F1)', pageSmart: 'الإضافة الذكية',
      resetField: 'القيمة الافتراضية', resetAll: 'إعادة الضبط',
      autoOn: 'الملء التلقائي مفعّل', autoOff: 'الملء التلقائي موقوف',
      autoBase: 'الأساس دائمًا هو سعر الشراء — لا يُغيَّر أي حقل كُتب يدويًا',
      bandHelp: 'أدخل الحد الأدنى لكل نطاق فقط. الأول يبدأ من 0 والأخير إلى ما لا نهاية؛ الحد الأعلى يُشتق من الحد التالي بلا فجوات ولا تداخل.',
      from: 'من', to: 'إلى', addBand: 'إضافة نطاق', removeBand: 'حذف النطاق',
      layoutBtn: 'ترتيب الحقول والعرض', autoFillBtn: 'الملء التلقائي للأسعار',
      moveUp: 'تحريك السطر للأعلى', moveDown: 'تحريك السطر للأسفل',
    },
    en: {
      title: 'Entry form layout', close: 'Close',
      tabOrder: 'Field order', tabWidth: 'Column widths', tabAuto: 'Auto-fill',
      rowNo: '#', delete: 'Delete', drag: 'Drag or use the arrows',
      fixedFirst: 'Fixed', fixedLast: 'Fixed', hiddenFv: 'Hidden — keeps its slot',
      orderHead: 'One order shared by Quick Entry and Smart Add',
      orderHelp: 'Drag a field or use ↑ ↓. The same order applies to both screens; the row number and delete button stay fixed and hidden fields keep their slot.',
      widthHelp: 'Each screen has its own widths. Values are clamped to a min/max, with a ↺ button per field.',
      autoHelp: 'Only empty cells are filled; anything you type by hand is locked. Changing the buy price recalculates unlocked cells only.',
      pageQe: 'Quick Entry (F1)', pageSmart: 'Smart Add',
      resetField: 'Default value', resetAll: 'Reset',
      autoOn: 'Auto-fill on', autoOff: 'Auto-fill off',
      autoBase: 'The base is ALWAYS the buy price — manually edited cells are never changed',
      bandHelp: 'Enter each band’s lower bound only. The first starts at 0 and the last runs to infinity; the upper bound is derived from the next one, with no gaps or overlaps.',
      from: 'From', to: 'To', addBand: 'Add band', removeBand: 'Remove band',
      layoutBtn: 'Field order & widths', autoFillBtn: 'Automatic prices',
      moveUp: 'Move row up', moveDown: 'Move row down',
    },
    fr: {
      title: 'Disposition des formulaires', close: 'Fermer',
      tabOrder: 'Ordre des champs', tabWidth: 'Largeur des colonnes', tabAuto: 'Remplissage auto',
      rowNo: '#', delete: 'Supprimer', drag: 'Glissez ou utilisez les flèches',
      fixedFirst: 'Fixe', fixedLast: 'Fixe', hiddenFv: 'Masqué — garde sa place',
      orderHead: 'Un seul ordre partagé par la saisie rapide et l’ajout intelligent',
      orderHelp: 'Glissez un champ ou utilisez ↑ ↓. Le même ordre s’applique aux deux écrans ; le numéro de ligne et le bouton supprimer restent fixes et les champs masqués gardent leur place.',
      widthHelp: 'Chaque écran a ses propres largeurs, bornées par un minimum et un maximum, avec un bouton ↺ par champ.',
      autoHelp: 'Seules les cellules vides sont remplies ; toute saisie manuelle est verrouillée. Modifier le prix d’achat recalcule uniquement les cellules non verrouillées.',
      pageQe: 'Saisie rapide (F1)', pageSmart: 'Ajout intelligent',
      resetField: 'Valeur par défaut', resetAll: 'Réinitialiser',
      autoOn: 'Remplissage auto activé', autoOff: 'Remplissage auto désactivé',
      autoBase: 'La base est TOUJOURS le prix d’achat — aucune cellule saisie manuellement n’est modifiée',
      bandHelp: 'Saisissez uniquement la borne inférieure de chaque palier. Le premier commence à 0 et le dernier va à l’infini ; la borne supérieure est déduite de la suivante, sans trous ni chevauchements.',
      from: 'Depuis', to: 'Jusqu’à', addBand: 'Ajouter un palier', removeBand: 'Supprimer le palier',
      layoutBtn: 'Ordre et largeurs', autoFillBtn: 'Prix automatiques',
      moveUp: 'Monter la ligne', moveDown: 'Descendre la ligne',
    },
    zh: {
      title: '录入表单设置', close: '关闭',
      tabOrder: '字段顺序', tabWidth: '列宽', tabAuto: '自动填价',
      rowNo: '#', delete: '删除', drag: '拖动或使用箭头',
      fixedFirst: '固定', fixedLast: '固定', hiddenFv: '隐藏 — 保留位置',
      orderHead: '快速录入与智能添加共用同一顺序',
      orderHelp: '拖动字段或使用 ↑ ↓。两个界面使用同一顺序；行号和删除按钮固定，隐藏字段保留原位置。',
      widthHelp: '两个界面的列宽各自独立，均有最小/最大限制，每个字段带 ↺ 恢复按钮。',
      autoHelp: '只填写空单元格；手动输入即锁定。修改进价仅重算未锁定的单元格。',
      pageQe: '快速录入 (F1)', pageSmart: '智能添加',
      resetField: '默认值', resetAll: '恢复默认',
      autoOn: '自动填价已开启', autoOff: '自动填价已关闭',
      autoBase: '基准始终是进价 — 手动填写的单元格不会被更改',
      bandHelp: '只需输入每档下限。第一档从 0 开始，最后一档到无穷；上限由下一档自动推导，无间隙无重叠。',
      from: '从', to: '到', addBand: '添加价格档', removeBand: '删除价格档',
      layoutBtn: '字段顺序与列宽', autoFillBtn: '自动填价',
      moveUp: '上移行', moveDown: '下移行',
    },
  };
  for (const lang in sets) {
    const base = LANG[lang];
    if (!base) continue;
    base.formLayout = Object.assign({}, base.formLayout || {}, sets[lang]);
  }
})();

// ---- Waybill merge labels ---------------------------------------------------
// Kept in its own merge pass (mirrors the display-settings block above) so the
// four language objects stay readable and every key lives in exactly one place.
(function mergeI18n() {
  const sets = {
    ar: {
      button: 'دمج وصل التسليم',
      title: 'دمج وصل التسليم في فاتورة بيع',
      hint: 'اختر وصول التسليم المطلوبة ثم حدّد التاريخ والوقت والمبلغ المدفوع. تُدمج كلها في فاتورة بيع واحدة وتُحذف وصول التسليم — دون أي تغيير في المخزون.',
      listTitle: 'وصول التسليم غير المدموجة',
      selectAll: 'كل المتبقي',
      selectNone: 'إلغاء الكل',
      none: 'لا توجد وصول تسليم قابلة للدمج لهذا العميل',
      empty: 'لم تختر أي وصل تسليم',
      dateTime: 'تاريخ ووقت الفاتورة',
      date: 'التاريخ',
      time: 'الوقت',
      payTitle: 'المبلغ المدفوع',
      recorded: 'المسجّل سابقاً:',
      summary: 'الملخص',
      selCount: 'الوصول المختارة',
      sumTotal: 'إجمالي الفاتورة',
      sumPaid: 'المدفوع الجديد',
      sumRemaining: 'المتبقي (دَين)',
      debtDelta: 'تغيّر دَين العميل',
      stockSafe: 'المخزون لا يتأثر إطلاقاً',
      confirm: 'دمج في فاتورة بيع واحدة',
      selectAtLeast: 'اختر وصل تسليم واحداً على الأقل',
      needDate: 'الرجاء تحديد تاريخ صحيح',
      paidExceeds: 'المبلغ المدفوع أكبر من إجمالي الفاتورة',
      confirmTitle: 'تأكيد الدمج',
      confirmMsg: 'سيتم دمج {n} وصل تسليم في فاتورة بيع واحدة بقيمة DA{total}.\nالمدفوع: DA{paid} — المتبقي: DA{remaining}.\nسيتم حذف وصول التسليم المدمجة، ولا يمكن التراجع عن العملية.',
      done: 'تم دمج {n} وصل تسليم في الفاتورة {num}',
      payNote: 'دفع عند دمج وصول التسليم',
      mergedNote: 'مدموجة من وصول التسليم:',
      waybillNo: 'وصل',
    },
    en: {
      button: 'Merge delivery notes',
      title: 'Merge delivery notes into a sale invoice',
      hint: 'Pick the delivery notes, then set the date, time and paid amount. They are merged into one sale invoice and the notes are removed — stock is never touched.',
      listTitle: 'Un-merged delivery notes',
      selectAll: 'All remaining',
      selectNone: 'Clear selection',
      none: 'No delivery notes to merge for this customer',
      empty: 'No delivery note selected',
      dateTime: 'Invoice date & time',
      date: 'Date',
      time: 'Time',
      payTitle: 'Paid amount',
      recorded: 'Previously recorded:',
      summary: 'Summary',
      selCount: 'Selected notes',
      sumTotal: 'Invoice total',
      sumPaid: 'New paid amount',
      sumRemaining: 'Remaining (debt)',
      debtDelta: 'Customer debt change',
      stockSafe: 'Stock is never affected',
      confirm: 'Merge into one sale invoice',
      selectAtLeast: 'Select at least one delivery note',
      needDate: 'Please pick a valid date',
      paidExceeds: 'Paid amount exceeds the invoice total',
      confirmTitle: 'Confirm merge',
      confirmMsg: '{n} delivery notes will be merged into one sale invoice of DA{total}.\nPaid: DA{paid} — Remaining: DA{remaining}.\nThe merged delivery notes will be deleted; this cannot be undone.',
      done: 'Merged {n} delivery notes into invoice {num}',
      payNote: 'Payment on delivery-note merge',
      mergedNote: 'Merged from delivery notes:',
      waybillNo: 'Note',
    },
    fr: {
      button: 'Fusionner les bons de livraison',
      title: 'Fusionner les bons de livraison en une facture de vente',
      hint: 'Sélectionnez les bons de livraison, puis réglez la date, l’heure et le montant payé. Ils sont fusionnés en une seule facture de vente et les bons sont supprimés — le stock n’est jamais modifié.',
      listTitle: 'Bons de livraison non fusionnés',
      selectAll: 'Tout le restant',
      selectNone: 'Tout décocher',
      none: 'Aucun bon de livraison à fusionner pour ce client',
      empty: 'Aucun bon sélectionné',
      dateTime: 'Date et heure de la facture',
      date: 'Date',
      time: 'Heure',
      payTitle: 'Montant payé',
      recorded: 'Déjà enregistré :',
      summary: 'Résumé',
      selCount: 'Bons sélectionnés',
      sumTotal: 'Total facture',
      sumPaid: 'Nouveau montant payé',
      sumRemaining: 'Restant (dette)',
      debtDelta: 'Variation de la dette client',
      stockSafe: 'Le stock n’est jamais modifié',
      confirm: 'Fusionner en une facture de vente',
      selectAtLeast: 'Sélectionnez au moins un bon de livraison',
      needDate: 'Veuillez choisir une date valide',
      paidExceeds: 'Le montant payé dépasse le total de la facture',
      confirmTitle: 'Confirmer la fusion',
      confirmMsg: '{n} bons de livraison seront fusionnés en une facture de vente de DA{total}.\nPayé : DA{paid} — Restant : DA{remaining}.\nLes bons fusionnés seront supprimés ; opération irréversible.',
      done: '{n} bons de livraison fusionnés dans la facture {num}',
      payNote: 'Paiement lors de la fusion des bons',
      mergedNote: 'Fusionné à partir des bons de livraison :',
      waybillNo: 'Bon',
    },
    zh: {
      button: '合并送货单',
      title: '将送货单合并为销售发票',
      hint: '选择送货单，然后设置日期、时间和已付金额。它们将合并为一张销售发票，送货单会被删除——库存不受任何影响。',
      listTitle: '未合并的送货单',
      selectAll: '全部剩余',
      selectNone: '取消全选',
      none: '该客户没有可合并的送货单',
      empty: '未选择任何送货单',
      dateTime: '发票日期与时间',
      date: '日期',
      time: '时间',
      payTitle: '已付金额',
      recorded: '此前已记录：',
      summary: '汇总',
      selCount: '已选送货单',
      sumTotal: '发票总额',
      sumPaid: '新已付金额',
      sumRemaining: '剩余（欠款）',
      debtDelta: '客户欠款变化',
      stockSafe: '库存不受任何影响',
      confirm: '合并为一张销售发票',
      selectAtLeast: '请至少选择一张送货单',
      needDate: '请选择有效的日期',
      paidExceeds: '已付金额超过发票总额',
      confirmTitle: '确认合并',
      confirmMsg: '{n} 张送货单将合并为一张销售发票，金额 DA{total}。\n已付：DA{paid} — 剩余：DA{remaining}。\n合并后的送货单将被删除，操作不可撤销。',
      done: '已将 {n} 张送货单合并到发票 {num}',
      payNote: '合并送货单时的付款',
      mergedNote: '合并自送货单：',
      waybillNo: '送货单',
    },
  };
  for (const lang in sets) {
    const base = LANG[lang];
    if (!base) continue;
    base.merge = Object.assign({}, base.merge || {}, sets[lang]);
  }
})();

// ---- Thermal printer labels (الطباعة الحرارية) + invoice print colour --------
// Same isolated pass as the merge block: every key lives in one place and the
// four language objects stay readable. The printColour keys are folded into the
// effective `invoices` namespace of every language.
(function thermalI18n() {
  const sets = {
    ar: {
      toggleOn: 'طباعة حرارية', settings: 'إعدادات الطابعة الحرارية',
      enabledToast: 'تم تفعيل الطباعة الحرارية', disabledToast: 'تم إيقاف الطباعة الحرارية',
      printed: 'تمت الطباعة على الطابعة الحرارية',
      title: 'إعدادات الطابعة الحرارية',
      hint: 'اضبط الخيارات ثم اضغط «طباعة تجريبية» لرؤية النتيجة فورًا. عند الوصول إلى الشكل المطلوب اضغط «حفظ التغييرات» لتبقى محفوظة على هذا الجهاز.',
      printerSec: 'الطابعة', printer: 'الطابعة', printerDefault: 'الطابعة الافتراضية',
      noPrinters: 'لا توجد طابعات متاحة الآن',
      test: 'طباعة تجريبية', printing: 'جاري الإرسال إلى الطابعة…',
      testOk: 'تم إرسال الوصل إلى الطابعة ✅', testFail: 'فشل الطباعة:',
      noElectron: 'الطباعة الحرارية المباشرة متاحة داخل تطبيق الحاسوب فقط — تم فتح نافذة الطباعة العادية.',
      paperSec: 'الورق والهوامش', paper: 'حجم الورقة', paperCustom: 'مخصّص', paperWidth: 'عرض الورقة (ملم)',
      marginTop: 'الهامش الأعلى', marginBottom: 'الهامش الأسفل', marginRight: 'الهامش الأيمن', marginLeft: 'الهامش الأيسر',
      fontSec: 'الخط', fontFamily: 'نوع الخط', fontMono: 'أحادي المسافة', fontSans: 'بدون زخرفة', fontSerif: 'مزخرف',
      fontWeight: 'سمك الخط', weightNormal: 'عادي', weightBold: 'عريض', weightBlack: 'أسود ثقيل',
      fontSize: 'حجم الخط', lineHeight: 'تباعد الأسطر',
      layoutSec: 'التخطيط', rotation: 'تدوير', scale: 'حجم الطباعة (%)', copies: 'عدد النسخ', direction: 'اتجاه النص',
      contentSec: 'المحتوى', showStore: 'إظهار اسم المحل', showAddress: 'إظهار العنوان والهاتف',
      showDateTime: 'إظهار التاريخ والوقت', showFooter: 'إظهار سطر الشكر', footerText: 'نص سطر الشكر',
      preview: 'معاينة مباشرة', reset: 'إعادة الضبط', save: 'حفظ التغييرات',
      saved: 'تم حفظ الإعدادات على هذا الجهاز', dirty: 'تغييرات غير محفوظة',
      thanks: 'شكرًا لزيارتكم',
      item: 'المنتج', qty: 'كمية', price: 'السعر', total: 'الإجمالي',
      gross: 'الإجمالي', discount: 'التخفيض', netTotal: 'الإجمالي بعد التخفيض',
    },
    en: {
      toggleOn: 'Thermal print', settings: 'Thermal printer settings',
      enabledToast: 'Thermal printing enabled', disabledToast: 'Thermal printing disabled',
      printed: 'Printed on the thermal printer',
      title: 'Thermal printer settings',
      hint: 'Tune the options and press “Test print” to see the result instantly. When it looks right, press “Save changes” to keep it on this device.',
      printerSec: 'Printer', printer: 'Printer', printerDefault: 'Default printer',
      noPrinters: 'No printers available right now',
      test: 'Test print', printing: 'Sending to the printer…',
      testOk: 'Receipt sent to the printer ✅', testFail: 'Print failed:',
      noElectron: 'Direct thermal printing is available in the desktop app only — the normal print window was opened.',
      paperSec: 'Paper & margins', paper: 'Paper size', paperCustom: 'Custom', paperWidth: 'Paper width (mm)',
      marginTop: 'Top margin', marginBottom: 'Bottom margin', marginRight: 'Right margin', marginLeft: 'Left margin',
      fontSec: 'Font', fontFamily: 'Font family', fontMono: 'Monospace', fontSans: 'Sans-serif', fontSerif: 'Serif',
      fontWeight: 'Font weight', weightNormal: 'Normal', weightBold: 'Bold', weightBlack: 'Heavy',
      fontSize: 'Font size', lineHeight: 'Line spacing',
      layoutSec: 'Layout', rotation: 'Rotation', scale: 'Print scale (%)', copies: 'Copies', direction: 'Text direction',
      contentSec: 'Content', showStore: 'Show shop name', showAddress: 'Show address & phone',
      showDateTime: 'Show date & time', showFooter: 'Show thank-you line', footerText: 'Thank-you text',
      preview: 'Live preview', reset: 'Reset', save: 'Save changes',
      saved: 'Settings saved on this device', dirty: 'Unsaved changes',
      thanks: 'Thank you for your visit',
      item: 'Item', qty: 'Qty', price: 'Price', total: 'Total',
      gross: 'Total', discount: 'Discount', netTotal: 'Total after discount',
    },
    fr: {
      toggleOn: 'Impression thermique', settings: 'Paramètres imprimante thermique',
      enabledToast: 'Impression thermique activée', disabledToast: 'Impression thermique désactivée',
      printed: 'Imprimé sur l’imprimante thermique',
      title: 'Paramètres imprimante thermique',
      hint: 'Réglez les options puis cliquez sur « Test d’impression » pour voir le résultat. Une fois satisfait, cliquez sur « Enregistrer » pour conserver les réglages sur cet appareil.',
      printerSec: 'Imprimante', printer: 'Imprimante', printerDefault: 'Imprimante par défaut',
      noPrinters: 'Aucune imprimante disponible',
      test: 'Test d’impression', printing: 'Envoi à l’imprimante…',
      testOk: 'Ticket envoyé à l’imprimante ✅', testFail: 'Échec de l’impression :',
      noElectron: 'L’impression thermique directe n’est disponible que dans l’application de bureau — la fenêtre d’impression normale a été ouverte.',
      paperSec: 'Papier et marges', paper: 'Largeur du papier', paperCustom: 'Personnalisé', paperWidth: 'Largeur (mm)',
      marginTop: 'Marge haute', marginBottom: 'Marge basse', marginRight: 'Marge droite', marginLeft: 'Marge gauche',
      fontSec: 'Police', fontFamily: 'Police', fontMono: 'Monospace', fontSans: 'Sans serif', fontSerif: 'Serif',
      fontWeight: 'Graisse', weightNormal: 'Normale', weightBold: 'Gras', weightBlack: 'Très gras',
      fontSize: 'Taille de police', lineHeight: 'Interligne',
      layoutSec: 'Mise en page', rotation: 'Rotation', scale: 'Échelle (%)', copies: 'Copies', direction: 'Sens du texte',
      contentSec: 'Contenu', showStore: 'Afficher le nom', showAddress: 'Afficher adresse et téléphone',
      showDateTime: 'Afficher date et heure', showFooter: 'Afficher le remerciement', footerText: 'Texte de remerciement',
      preview: 'Aperçu en direct', reset: 'Réinitialiser', save: 'Enregistrer',
      saved: 'Réglages enregistrés sur cet appareil', dirty: 'Modifications non enregistrées',
      thanks: 'Merci de votre visite',
      item: 'Article', qty: 'Qté', price: 'Prix', total: 'Total',
      gross: 'Total', discount: 'Remise', netTotal: 'Total après remise',
    },
    zh: {
      toggleOn: '热敏打印', settings: '热敏打印机设置',
      enabledToast: '已开启热敏打印', disabledToast: '已关闭热敏打印',
      printed: '已在热敏打印机上打印',
      title: '热敏打印机设置',
      hint: '调整选项后点击“测试打印”即可立即查看效果。满意后点击“保存更改”，设置将保留在本设备上。',
      printerSec: '打印机', printer: '打印机', printerDefault: '默认打印机',
      noPrinters: '当前没有可用打印机',
      test: '测试打印', printing: '正在发送到打印机…',
      testOk: '票据已发送到打印机 ✅', testFail: '打印失败：',
      noElectron: '直接热敏打印仅在桌面应用中可用——已打开普通打印窗口。',
      paperSec: '纸张与边距', paper: '纸张宽度', paperCustom: '自定义', paperWidth: '纸张宽度（毫米）',
      marginTop: '上边距', marginBottom: '下边距', marginRight: '右边距', marginLeft: '左边距',
      fontSec: '字体', fontFamily: '字体', fontMono: '等宽', fontSans: '无衬线', fontSerif: '衬线',
      fontWeight: '字重', weightNormal: '常规', weightBold: '加粗', weightBlack: '特粗',
      fontSize: '字号', lineHeight: '行距',
      layoutSec: '布局', rotation: '旋转', scale: '打印缩放 (%)', copies: '份数', direction: '文字方向',
      contentSec: '内容', showStore: '显示店铺名称', showAddress: '显示地址与电话',
      showDateTime: '显示日期与时间', showFooter: '显示致谢行', footerText: '致谢文字',
      preview: '实时预览', reset: '重置', save: '保存更改',
      saved: '设置已保存在本设备', dirty: '未保存的更改',
      thanks: '感谢光临',
      item: '商品', qty: '数量', price: '单价', total: '金额',
      gross: '合计', discount: '折让', netTotal: '折让后合计',
    },
  };
  const printColour = {
    ar: { printColor: 'طباعة ملوّنة', printBw: 'طباعة أبيض وأسود' },
    en: { printColor: 'Colour print', printBw: 'Black & white print' },
    fr: { printColor: 'Impression couleur', printBw: 'Impression noir et blanc' },
    zh: { printColor: '彩色打印', printBw: '黑白打印' },
  };
  for (const lang in sets) {
    const base = LANG[lang];
    if (!base) continue;
    base.thermal = Object.assign({}, base.thermal || {}, sets[lang]);
    base.invoices = Object.assign({}, base.invoices || {}, printColour[lang] || {});
  }
})();

// Shared print-mode label + the read-only «حركات المارك» view (brand movements).
// Purely additive: it only adds translation keys, never changes existing ones.
(function brandMovementsI18n() {
  const mov = {
    ar: { qToday: 'اليوم', brandSettleBlocked: 'ارجع لحركات العملاء قبل تسوية الرصيد' },
    en: { qToday: 'Today', brandSettleBlocked: 'Return to customer movements before settling a balance' },
    fr: { qToday: 'Aujourd’hui', brandSettleBlocked: 'Revenez aux mouvements clients avant de régler un solde' },
    zh: { qToday: '今天', brandSettleBlocked: '返回客户往来后再结算余额' },
  };
  const invLabel = {
    ar: 'نوع الطباعة', en: 'Print mode', fr: 'Mode d’impression', zh: '打印模式',
  };
  const bm = {
    ar: {
      open: 'حركات المارك', title: 'حركات المارك', back: 'رجوع لحركات العملاء',
      pickBrand: '— اختر المارك —', brandLabel: 'المارك',
      searchHint: 'ابحث عن المارك أو منتجها من شريط البحث أعلى الصفحة',
      searchPh: 'ابحث عن مارك أو منتج...',
      salesCard: 'المبيعات', opsUnit: 'عملية', qtyShort: 'الكمية',
      returnsCard: 'المرتجعات', damagedCard: 'السلع الفاسدة', productsCard: 'منتجات المارك',
      invoicesShort: 'فواتير', allTime: 'كل الفترات',
      chooseFirst: 'اختر ماركاً من القائمة أو ابحث عنه في شريط البحث',
      reportTitle: 'تقرير حركات المارك', period: 'الفترة', generatedAt: 'تاريخ الإصدار',
      generated: 'تقرير مُولَّد آلياً من سجلّات البرنامج', phone: 'الهاتف',
      colProduct: 'المنتج', colSales: 'المبيعات (عملية / كمية / قيمة)',
      colReturns: 'المرتجعات', colDamaged: 'السلع الفاسدة',
      colReturnRate: 'نسبة المرتجع', colDamageRate: 'نسبة الهدر', colNet: 'الصافي',
      colDate: 'التاريخ', kind: 'النوع', colRef: 'المرجع', colNote: 'البيان',
      colQty: 'الكمية', colValue: 'القيمة',
      kindSale: 'بيع', kindReturn: 'مرتجع', kindDamaged: 'سلعة فاسدة',
      detailTitle: 'تفاصيل العمليات', noDetail: 'لا توجد عمليات في الفترة المحددة',
      noProducts: 'لا توجد منتجات في هذا المارك',
      noMark: 'بدون مارك',
    },
    en: {
      open: 'Mark movements', title: 'Mark movements', back: 'Back to customer movements',
      pickBrand: '— Choose a mark —', brandLabel: 'Mark',
      searchHint: 'Find the mark or its products using the search box above',
      searchPh: 'Search for a mark or product...',
      salesCard: 'Sales', opsUnit: 'ops', qtyShort: 'Qty',
      returnsCard: 'Returns', damagedCard: 'Damaged goods', productsCard: 'Mark products',
      invoicesShort: 'invoices', allTime: 'All periods',
      chooseFirst: 'Choose a mark from the list or search for it above',
      reportTitle: 'Brand movements report', period: 'Period', generatedAt: 'Generated at',
      generated: 'Report generated automatically from program records', phone: 'Phone',
      colProduct: 'Product', colSales: 'Sales (ops / qty / value)',
      colReturns: 'Returns', colDamaged: 'Damaged goods',
      colReturnRate: 'Return rate', colDamageRate: 'Damage rate', colNet: 'Net',
      colDate: 'Date', kind: 'Type', colRef: 'Ref', colNote: 'Note',
      colQty: 'Qty', colValue: 'Value',
      kindSale: 'Sale', kindReturn: 'Return', kindDamaged: 'Damaged',
      detailTitle: 'Operation details', noDetail: 'No operations in the selected period',
      noProducts: 'No products in this mark',
      noMark: 'No mark',
    },
    fr: {
      open: 'Mouvements par marque produit', title: 'Mouvements par marque produit', back: 'Retour aux mouvements clients',
      pickBrand: '— Choisir une marque produit —', brandLabel: 'Marque produit',
      searchHint: 'Trouvez la marque produit ou ses produits via la recherche ci-dessus',
      searchPh: 'Rechercher une marque produit...',
      salesCard: 'Ventes', opsUnit: 'op.', qtyShort: 'Qté',
      returnsCard: 'Retours', damagedCard: 'Marchandises endommagées', productsCard: 'Produits de la marque',
      invoicesShort: 'factures', allTime: 'Toutes les périodes',
      chooseFirst: 'Choisissez une marque produit dans la liste ou recherchez-la ci-dessus',
      reportTitle: 'Rapport des mouvements par marque produit', period: 'Période', generatedAt: 'Généré le',
      generated: 'Rapport généré automatiquement à partir des données du programme', phone: 'Téléphone',
      colProduct: 'Produit', colSales: 'Ventes (op. / qté / valeur)',
      colReturns: 'Retours', colDamaged: 'Marchandises endommagées',
      colReturnRate: 'Taux de retour', colDamageRate: 'Taux de perte', colNet: 'Net',
      colDate: 'Date', kind: 'Type', colRef: 'Réf.', colNote: 'Note',
      colQty: 'Qté', colValue: 'Valeur',
      kindSale: 'Vente', kindReturn: 'Retour', kindDamaged: 'Endommagé',
      detailTitle: 'Détail des opérations', noDetail: 'Aucune opération sur la période sélectionnée',
      noProducts: 'Aucun produit dans cette marque produit',
      noMark: 'Sans marque',
    },
    zh: {
      open: '标记往来', title: '标记往来', back: '返回客户往来',
      pickBrand: '— 选择标记 —', brandLabel: '标记',
      searchHint: '通过上方搜索框查找标记或其产品',
      searchPh: '搜索标记或产品...',
      salesCard: '销售', opsUnit: '笔', qtyShort: '数量',
      returnsCard: '退货', damagedCard: '损坏商品', productsCard: '标记产品',
      invoicesShort: '发票', allTime: '所有时段',
      chooseFirst: '从列表中选择标记或在上方搜索',
      reportTitle: '标记往来报表', period: '期间', generatedAt: '生成时间',
      generated: '报表由程序记录自动生成', phone: '电话',
      colProduct: '产品', colSales: '销售（笔 / 数量 / 金额）',
      colReturns: '退货', colDamaged: '损坏商品',
      colReturnRate: '退货率', colDamageRate: '损耗率', colNet: '净额',
      colDate: '日期', kind: '类型', colRef: '参考', colNote: '备注',
      colQty: '数量', colValue: '金额',
      kindSale: '销售', kindReturn: '退货', kindDamaged: '损坏',
      detailTitle: '操作详情', noDetail: '所选时段内没有操作',
      noProducts: '此标记下没有产品',
      noMark: '无标记',
    },
  };
  for (const lang in mov) {
    const base = LANG[lang];
    if (!base) continue;
    base.movements = Object.assign({}, base.movements || {}, mov[lang]);
    base.invoices = Object.assign({}, base.invoices || {}, { printModeLabel: invLabel[lang] });
    base.bm = Object.assign({}, base.bm || {}, bm[lang]);
  }
})();

// Cash drawer («درج النقود») — mirrors the thermal block so t('drawer.*') works
// in every language without touching the static literals in connection.html.
(function cashDrawerI18n() {
  const sets = {
    ar: {
      tab: 'درج النقود',
      title: 'درج النقود',
      desc: 'يفتح البرنامج درج النقود تلقائيًا بعد كل عملية بيع، وبالضغط على F12 في أي وقت. الدرج يُفتح عبر طابعتك الحرارية (نبضة ESC/POS)، وليس عبر الكمبيوتر مباشرة.',
      enable: 'فتح الدرج تلقائيًا بعد كل عملية بيع',
      enabled: 'تم تفعيل الفتح التلقائي بعد البيع', disabled: 'تم تعطيل الفتح التلقائي',
      saved: 'تم الحفظ',
      scanTitle: 'المسح والاكتشاف', scanDesc: 'ابحث عن منافذ COM والطابعات المتصلة بهذا الكمبيوتر، ثم اختر الهدف الذي يوجد عليه الدرج.',
      scanBtn: 'مسح واكتشاف', useLastGood: 'استعمال آخر مسار ناجح',
      scanning: 'جارٍ المسح…', scanDone: 'اكتمل المسح', scanFail: 'فشل المسح', targetsCount: 'هدف',
      noTargets: 'لم يُعثر على أي منفذ أو طابعة.',
      noLastGood: 'لا يوجد مسار ناجح محفوظ بعد.', lastGoodRestored: 'تم استرجاع آخر مسار ناجح.',
      wmiFallback: 'وضع التوافق: Win32_Printer',
      escposYes: 'مدعوم', escposMaybe: 'يُرجّح', escposNo: 'غير مدعوم', escposUnknown: 'غير معروف',
      targetTitle: 'الهدف (يدوي)', transport: 'طريقة الاتصال',
      transportAuto: 'تلقائي (يجرّب الكل)', transportCom: 'منفذ COM', transportNet: 'شبكة (IP:9100)', transportWin: 'طابعة ويندوز',
      transportRawUsb: 'كتابة خام — منفذ USB افتراضي', transportRawCom: 'كتابة خام — منفذ COM',
      rawBtn: 'جرّب المسار الخام فقط', rawUsbLabel: 'منفذ USB الخام',
      rawDesc: '«المسار الخام» يفتح منفذ USB الافتراضي (USB001/USB002) كملف جهاز ويرسل النبضة مباشرة متجاوزًا مشغّل الطباعة. قد ينجح أو يفشل حسب الطابعة والنسخة — المحاولة آمنة ولا تضرّ.',
      rawMayWork: 'قد ينجح', rawWarn: 'مسار غير مضمون — قد يتوقّف بعد إعادة التشغيل',
      rawOk: 'نجح المسار الخام — إن لم يُفتح الدرج فطابعتك لا تدعم النبضة.', rawFail: 'المسار الخام لم ينجح على هذا الجهاز — هذا متوقَّع.',
      comPort: 'منفذ COM', host: 'عنوان IP', port: 'المنفذ', printerName: 'اسم الطابعة (ويندوز)',
      pulseTitle: 'أمر الفتح (النبضة)', pulse: 'الأمر', customHex: 'أمر مخصّص (Hex، اختياري)', timeout: 'المهلة (مللي ثانية)',
      pulseDesc: 'إن لم يفتح الدرج، جرّب أمرًا آخر. زر «اختبار الاتصال» يجرّب الأوامر كلها تلقائيًا ويحفظ الذي نجح.',
      testTitle: 'اختبار الاتصال', testBtn: 'اختبار الاتصال (افتح الدرج)',
      testDesc: 'اضغط الزر وراقب الدرج: إن فُتح فقد نجح الإعداد ويُحفظ تلقائيًا.',
      testing: 'جارٍ الإرسال… جرّب الأوامر واحدًا واحدًا.',
      opened: 'تم إرسال أمر الفتح بنجاح — إن لم يُفتح الدرج فطابعتك لا تدعم النبضة.',
      testFail: 'فشل فتح الدرج.',
      colPulse: 'الأمر', colTransport: 'المسار', colTime: 'الزمن', colResult: 'النتيجة', ok: 'نجح',
      fallbackTitle: 'حل احتياطي (غير مُنصَح به)',
      fallbackDesc: 'إن لم تدعم طابعتك النبضة الخام، يمكن طبع صفحة تُفعّل الدرج عبر مشغّل الطباعة. تحذير: يستهلك ورقًا وقد لا ينجح دائمًا.',
      fallbackOn: 'تفعيل الحل الاحتياطي عند فشل النبضة',
      note: 'ملاحظة مهمة: إن لم يُفتح الدرج بأي أمر، فطابعتك لا تدعم الفتح البرمجي — استعمل المفتاح المعدني للدرج، أو استبدل الطابعة بطابعة ESC/POS.',
      statusIdle: 'لم يُختبر بعد', statusReady: 'جاهز', statusVia: 'المسار', statusSelected: 'هدف محدَّد',
      statusAutoOff: 'الفتح التلقائي بعد البيع مُعطَّل',
      toastFail: 'تعذّر فتح درج النقود',
      openedShort: 'تم فتح الدرج',
      fallbackTried: 'تم إرسال صفحة عبر مشغّل الطباعة لفتح الدرج',
      noElectron: 'فتح الدرج متاح داخل تطبيق الحاسوب فقط.',
    },
    en: {
      tab: 'Cash drawer', title: 'Cash drawer',
      desc: 'The app opens the cash drawer automatically after every sale and whenever you press F12. The drawer is opened through your thermal printer (an ESC/POS pulse), not by the computer directly.',
      enable: 'Open the drawer automatically after every sale',
      enabled: 'Automatic opening after sales enabled', disabled: 'Automatic opening disabled',
      saved: 'Saved',
      scanTitle: 'Scan & discover', scanDesc: 'Look for COM ports and printers connected to this computer, then pick the target the drawer sits on.',
      scanBtn: 'Scan & discover', useLastGood: 'Use last working path',
      scanning: 'Scanning…', scanDone: 'Scan complete', scanFail: 'Scan failed', targetsCount: 'target(s)',
      noTargets: 'No port or printer was found.',
      noLastGood: 'No working path has been saved yet.', lastGoodRestored: 'Last working path restored.',
      wmiFallback: 'compatibility mode: Win32_Printer',
      escposYes: 'supported', escposMaybe: 'likely', escposNo: 'not supported', escposUnknown: 'unknown',
      targetTitle: 'Target (manual)', transport: 'Connection method',
      transportAuto: 'Automatic (tries all)', transportCom: 'COM port', transportNet: 'Network (IP:9100)', transportWin: 'Windows printer',
      transportRawUsb: 'Raw write — virtual USB port', transportRawCom: 'Raw write — COM port',
      rawBtn: 'Test the raw path only', rawUsbLabel: 'Raw USB port',
      rawDesc: 'The raw path opens the virtual USB port (USB001/USB002) as a device file and sends the pulse directly, bypassing the print spooler. It may or may not work depending on the printer and Windows build — the attempt is safe.',
      rawMayWork: 'May work', rawWarn: 'Unproven path — may stop after a restart',
      rawOk: 'The raw path succeeded — if the drawer did not open, your printer has no pulse support.', rawFail: 'The raw path did not work on this machine — this is expected.',
      comPort: 'COM port', host: 'IP address', port: 'Port', printerName: 'Printer name (Windows)',
      pulseTitle: 'Open command (pulse)', pulse: 'Command', customHex: 'Custom command (hex, optional)', timeout: 'Timeout (ms)',
      pulseDesc: 'If the drawer does not open, try another command. “Test connection” tries them all automatically and saves the one that worked.',
      testTitle: 'Test connection', testBtn: 'Test connection (open the drawer)',
      testDesc: 'Press the button and watch the drawer: if it opens, the setup works and is saved automatically.',
      testing: 'Sending… trying the commands one by one.',
      opened: 'The open command was sent — if the drawer did not open, your printer does not support the pulse.',
      testFail: 'Opening the drawer failed.',
      colPulse: 'Command', colTransport: 'Path', colTime: 'Time', colResult: 'Result', ok: 'ok',
      fallbackTitle: 'Fallback (not recommended)',
      fallbackDesc: 'If your printer does not support the raw pulse, a page can be printed through the driver to trigger the drawer. Warning: it wastes paper and may not always work.',
      fallbackOn: 'Enable the fallback when the pulse fails',
      note: 'Important: if no command opens the drawer, your printer does not support software opening — use the drawer’s metal key, or replace the printer with an ESC/POS one.',
      statusIdle: 'Not tested yet', statusReady: 'Ready', statusVia: 'Path', statusSelected: 'Selected target',
      statusAutoOff: 'Automatic opening after sales is off',
      toastFail: 'Could not open the cash drawer',
      openedShort: 'Cash drawer opened',
      fallbackTried: 'A page was sent through the print driver to open the drawer',
      noElectron: 'Opening the drawer is available in the desktop app only.',
    },
    fr: {
      tab: 'Tiroir-caisse', title: 'Tiroir-caisse',
      desc: 'L’application ouvre le tiroir-caisse automatiquement après chaque vente et lorsque vous appuyez sur F12. Le tiroir est ouvert via votre imprimante thermique (une impulsion ESC/POS), pas par l’ordinateur directement.',
      enable: 'Ouvrir le tiroir automatiquement après chaque vente',
      enabled: 'Ouverture automatique après vente activée', disabled: 'Ouverture automatique désactivée',
      saved: 'Enregistré',
      scanTitle: 'Analyse et détection', scanDesc: 'Recherchez les ports COM et les imprimantes de cet ordinateur, puis choisissez la cible du tiroir.',
      scanBtn: 'Analyser', useLastGood: 'Utiliser le dernier chemin valide',
      scanning: 'Analyse…', scanDone: 'Analyse terminée', scanFail: 'Échec de l’analyse', targetsCount: 'cible(s)',
      noTargets: 'Aucun port ni imprimante trouvé.',
      noLastGood: 'Aucun chemin valide enregistré.', lastGoodRestored: 'Dernier chemin valide restauré.',
      wmiFallback: 'mode compatibilité : Win32_Printer',
      escposYes: 'pris en charge', escposMaybe: 'probable', escposNo: 'non pris en charge', escposUnknown: 'inconnu',
      targetTitle: 'Cible (manuelle)', transport: 'Mode de connexion',
      transportAuto: 'Automatique (essaie tout)', transportCom: 'Port COM', transportNet: 'Réseau (IP:9100)', transportWin: 'Imprimante Windows',
      transportRawUsb: 'Écriture brute — port USB virtuel', transportRawCom: 'Écriture brute — port COM',
      rawBtn: 'Tester uniquement le chemin brut', rawUsbLabel: 'Port USB brut',
      rawDesc: 'Le chemin brut ouvre le port USB virtuel (USB001/USB002) comme fichier de périphérique et envoie l’impulsion directement, en contournant le spouleur. Cela peut fonctionner ou non selon l’imprimante et la version — la tentative est sans danger.',
      rawMayWork: 'Peut fonctionner', rawWarn: 'Chemin non garanti — peut cesser après un redémarrage',
      rawOk: 'Le chemin brut a réussi — si le tiroir ne s’est pas ouvert, votre imprimante n’a pas de support d’impulsion.', rawFail: 'Le chemin brut n’a pas fonctionné sur cette machine — c’est attendu.',
      comPort: 'Port COM', host: 'Adresse IP', port: 'Port', printerName: 'Nom de l’imprimante (Windows)',
      pulseTitle: 'Commande d’ouverture (impulsion)', pulse: 'Commande', customHex: 'Commande personnalisée (hex, facultatif)', timeout: 'Délai (ms)',
      pulseDesc: 'Si le tiroir ne s’ouvre pas, essayez une autre commande. « Test de connexion » les essaie toutes et enregistre celle qui fonctionne.',
      testTitle: 'Test de connexion', testBtn: 'Test de connexion (ouvrir le tiroir)',
      testDesc: 'Appuyez et surveillez le tiroir : s’il s’ouvre, le réglage fonctionne et est enregistré automatiquement.',
      testing: 'Envoi… essai des commandes une par une.',
      opened: 'La commande d’ouverture a été envoyée — si le tiroir ne s’est pas ouvert, votre imprimante ne prend pas en charge l’impulsion.',
      testFail: 'Échec de l’ouverture du tiroir.',
      colPulse: 'Commande', colTransport: 'Chemin', colTime: 'Temps', colResult: 'Résultat', ok: 'ok',
      fallbackTitle: 'Solution de secours (non recommandée)',
      fallbackDesc: 'Si votre imprimante ne prend pas en charge l’impulsion brute, une page peut être imprimée via le pilote pour déclencher le tiroir. Attention : consomme du papier et peut échouer.',
      fallbackOn: 'Activer la solution de secours si l’impulsion échoue',
      note: 'Important : si aucune commande n’ouvre le tiroir, votre imprimante ne permet pas l’ouverture logicielle — utilisez la clé métallique, ou remplacez l’imprimante par une ESC/POS.',
      statusIdle: 'Pas encore testé', statusReady: 'Prêt', statusVia: 'Chemin', statusSelected: 'Cible choisie',
      statusAutoOff: 'L’ouverture automatique après vente est désactivée',
      toastFail: 'Impossible d’ouvrir le tiroir-caisse',
      openedShort: 'Tiroir-caisse ouvert',
      fallbackTried: 'Une page a été envoyée via le pilote d’impression pour ouvrir le tiroir',
      noElectron: 'L’ouverture du tiroir n’est disponible que dans l’application de bureau.',
    },
    zh: {
      tab: '钱箱', title: '钱箱',
      desc: '每次销售后以及按 F12 时，程序会自动打开钱箱。钱箱通过热敏打印机（ESC/POS 脉冲）打开，而不是由电脑直接打开。',
      enable: '每次销售后自动打开钱箱',
      enabled: '已启用销售后自动打开', disabled: '已禁用自动打开',
      saved: '已保存',
      scanTitle: '扫描与发现', scanDesc: '查找本机的 COM 端口和打印机，然后选择钱箱所连接的目标。',
      scanBtn: '扫描', useLastGood: '使用上次成功的路径',
      scanning: '扫描中…', scanDone: '扫描完成', scanFail: '扫描失败', targetsCount: '个目标',
      noTargets: '未找到任何端口或打印机。',
      noLastGood: '尚无保存的成功路径。', lastGoodRestored: '已恢复上次成功的路径。',
      wmiFallback: '兼容模式：Win32_Printer',
      escposYes: '支持', escposMaybe: '可能支持', escposNo: '不支持', escposUnknown: '未知',
      targetTitle: '目标（手动）', transport: '连接方式',
      transportAuto: '自动（全部尝试）', transportCom: 'COM 端口', transportNet: '网络 (IP:9100)', transportWin: 'Windows 打印机',
      transportRawUsb: '原始写入 — 虚拟 USB 端口', transportRawCom: '原始写入 — COM 端口',
      rawBtn: '仅测试原始路径', rawUsbLabel: '原始 USB 端口',
      rawDesc: '原始路径将虚拟 USB 端口 (USB001/USB002) 作为设备文件打开并直接发送脉冲，绕过打印后台处理程序。是否成功取决于打印机和系统版本——尝试是安全的。',
      rawMayWork: '可能有效', rawWarn: '未经验证的路径 — 重启后可能失效',
      rawOk: '原始路径成功——若钱箱未打开，说明打印机不支持脉冲。', rawFail: '原始路径在此设备上未成功——这是预期结果。',
      comPort: 'COM 端口', host: 'IP 地址', port: '端口', printerName: '打印机名称（Windows）',
      pulseTitle: '打开命令（脉冲）', pulse: '命令', customHex: '自定义命令（十六进制，可选）', timeout: '超时（毫秒）',
      pulseDesc: '如果钱箱未打开，请尝试其他命令。“测试连接”会自动尝试全部命令并保存成功的一条。',
      testTitle: '测试连接', testBtn: '测试连接（打开钱箱）',
      testDesc: '点击按钮并观察钱箱：若打开则说明设置有效，会自动保存。',
      testing: '正在发送… 逐条尝试命令。',
      opened: '打开命令已发送 — 若钱箱未打开，说明打印机不支持该脉冲。',
      testFail: '打开钱箱失败。',
      colPulse: '命令', colTransport: '路径', colTime: '耗时', colResult: '结果', ok: '成功',
      fallbackTitle: '备用方案（不推荐）',
      fallbackDesc: '如果打印机不支持原始脉冲，可通过驱动打印一页来触发钱箱。警告：浪费纸张且未必有效。',
      fallbackOn: '脉冲失败时启用备用方案',
      note: '重要提示：如果任何命令都无法打开钱箱，说明打印机不支持软件打开 — 请使用钱箱的金属钥匙，或更换为 ESC/POS 打印机。',
      statusIdle: '尚未测试', statusReady: '就绪', statusVia: '路径', statusSelected: '已选目标',
      statusAutoOff: '销售后自动打开已关闭',
      toastFail: '无法打开钱箱',
      openedShort: '钱箱已打开',
      fallbackTried: '已通过打印驱动发送页面以打开钱箱',
      noElectron: '仅桌面应用支持打开钱箱。',
    },
  };
  for (const lang in sets) {
    const base = LANG[lang];
    if (!base) continue;
    base.drawer = Object.assign({}, base.drawer || {}, sets[lang]);
  }
})();

// Measurement units + dense-POS labels. Merged into LANG with the same
// Object.assign pattern as the thermal / cash-drawer blocks above, so the four
// large language literals stay untouched and nothing can break them.
(function unitsAndPosI18n() {
  const sets = {
    ar: {
      units: { label: 'الوحدة', customPlaceholder: 'اسم الوحدة', piece: 'قطعة', kg: 'كيلوغرام', g: 'غرام', m: 'متر', cm: 'سنتيمتر', L: 'لتر', custom: 'أخرى', allColumns: 'كل الأعمدة' },
      invUnit: { show: 'إظهار الوحدة في الفاتورة', on: 'الوحدة ظاهرة في الفواتير', off: 'الوحدة مخفية من الفواتير' },
      salesDense: {
        cards: 'بطاقات', list: 'قائمة', allColumns: 'كل الأعمدة', details: 'تفاصيل',
        inCart: 'في السلة', cartWidth: 'عرض السلة', stripOn: 'شريط السلة مفعّل',
        stripOff: 'شريط السلة مخفي', noCartItems: 'السلة فارغة'
      },
      sales: {
        inCartStrip: 'في السلة',
        favBrandsBtn: 'إظهار العلامات المفضلة',
        favBrandsTitle: 'العلامات المفضلة',
        favBrandsRest: 'بقية المنتجات',
        favBrandsEmpty: 'لا توجد علامات مفضلة — أضفها من صفحة العلامات التجارية',
        favBrandsNoProducts: 'لا توجد منتجات لهذه العلامة',
        favBrandsNoRest: 'لا توجد منتجات أخرى',
        favBrandsHide: 'إخفاء منتجات العلامة'
      }
    },
    en: {
      units: { label: 'Unit', customPlaceholder: 'Unit name', piece: 'Piece', kg: 'Kilogram', g: 'Gram', m: 'Metre', cm: 'Centimetre', L: 'Litre', custom: 'Other', allColumns: 'All columns' },
      invUnit: { show: 'Show the unit on invoices', on: 'Unit shown on invoices', off: 'Unit hidden from invoices' },
      salesDense: {
        cards: 'Cards', list: 'List', allColumns: 'All columns', details: 'Details',
        inCart: 'In cart', cartWidth: 'Cart width', stripOn: 'Cart strip enabled',
        stripOff: 'Cart strip hidden', noCartItems: 'Cart is empty'
      },
      sales: {
        inCartStrip: 'In cart',
        favBrandsBtn: 'Show favourite brands',
        favBrandsTitle: 'Favourite brands',
        favBrandsRest: 'Other products',
        favBrandsEmpty: 'No favourite brands yet — add them from the Brands page',
        favBrandsNoProducts: 'No products for this brand',
        favBrandsNoRest: 'No other products',
        favBrandsHide: 'Hide brand products'
      }
    },
    fr: {
      units: { label: 'Unité', customPlaceholder: "Nom de l'unité", piece: 'Pièce', kg: 'Kilogramme', g: 'Gramme', m: 'Mètre', cm: 'Centimètre', L: 'Litre', custom: 'Autre', allColumns: 'Toutes les colonnes' },
      invUnit: { show: "Afficher l'unité sur la facture", on: 'Unité affichée sur les factures', off: 'Unité masquée des factures' },
      salesDense: {
        cards: 'Cartes', list: 'Liste', allColumns: 'Toutes les colonnes', details: 'Détails',
        inCart: 'Au panier', cartWidth: 'Largeur du panier', stripOn: 'Bandeau panier activé',
        stripOff: 'Bandeau panier masqué', noCartItems: 'Panier vide'
      },
      sales: {
        inCartStrip: 'Au panier',
        favBrandsBtn: 'Afficher les marques favorites',
        favBrandsTitle: 'Marques favorites',
        favBrandsRest: 'Autres produits',
        favBrandsEmpty: 'Aucune marque favorite — ajoutez-les depuis la page Marques',
        favBrandsNoProducts: 'Aucun produit pour cette marque',
        favBrandsNoRest: 'Aucun autre produit',
        favBrandsHide: 'Masquer les produits de la marque'
      }
    },
    zh: {
      units: { label: '单位', customPlaceholder: '单位名称', piece: '件', kg: '千克', g: '克', m: '米', cm: '厘米', L: '升', custom: '其他', allColumns: '所有列' },
      invUnit: { show: '在发票上显示单位', on: '单位已在发票上显示', off: '单位已从发票上隐藏' },
      salesDense: {
        cards: '卡片', list: '列表', allColumns: '所有列', details: '详情',
        inCart: '购物车中', cartWidth: '购物车宽度', stripOn: '购物车栏已启用',
        stripOff: '购物车栏已隐藏', noCartItems: '购物车为空'
      },
      sales: {
        inCartStrip: '购物车中',
        favBrandsBtn: '显示收藏品牌',
        favBrandsTitle: '收藏品牌',
        favBrandsRest: '其他产品',
        favBrandsEmpty: '暂无收藏品牌 — 请在品牌页面添加',
        favBrandsNoProducts: '该品牌暂无产品',
        favBrandsNoRest: '没有其他产品',
        favBrandsHide: '隐藏品牌产品'
      }
    }
  };
  for (const lang in sets) {
    const base = LANG[lang];
    if (!base) continue;
    base.units = Object.assign({}, base.units || {}, sets[lang].units || {});
    base.invUnit = Object.assign({}, base.invUnit || {}, sets[lang].invUnit || {});
    base.salesDense = Object.assign({}, base.salesDense || {}, sets[lang].salesDense || {});
    base.sales = Object.assign({}, base.sales || {}, sets[lang].sales || {});
  }
})();


// ===== i18n gap fill (Phase 3 batch 1) =====
// Invoice card / detail action labels that still ship as plain Arabic copy
// in the renderer markup (invoice card quick actions, context menu, detail
// modal footer). The matching keys are added here so t() feeds the same
// dictionaries across ar / en / fr / zh and setLanguage() translates them.
(function patchInvoiceActionsI18n() {
  const sets = {
    ar: {
      invoices: {
        print: 'طباعة',
        preview: 'معاينة',
        pay: 'دفع',
        edit: 'تعديل',
        delete: 'حذف',
        copyToRoute: 'نسخ إلى أذن طريق',
        buyRevealTitle: 'إظهار/إخفاء نسب الخصم والتكلفة الحقيقية (i)',
      },
    },
    en: {
      invoices: {
        print: 'Print',
        preview: 'Preview',
        pay: 'Pay',
        edit: 'Edit',
        delete: 'Delete',
        copyToRoute: 'Copy to route order',
        buyRevealTitle: 'Show/hide discount ratios and real cost (i)',
      },
    },
    fr: {
      invoices: {
        print: 'Imprimer',
        preview: 'Aperçu',
        pay: 'Paiement',
        edit: 'Modifier',
        delete: 'Supprimer',
        copyToRoute: 'Copier vers bon de livraison',
        buyRevealTitle: 'Afficher/masquer les ratios de remise et le coût réel (i)',
      },
    },
    zh: {
      invoices: {
        print: '打印',
        preview: '预览',
        pay: '付款',
        edit: '编辑',
        delete: '删除',
        copyToRoute: '复制到路运单',
        buyRevealTitle: '显示/隐藏折扣率和真实成本 (i)',
      },
    },
  };
  for (const lang in sets) {
    const base = LANG[lang];
    if (!base) continue;
    const g = sets[lang].invoices;
    if (!base.invoices || typeof base.invoices !== 'object') { if (!base.invoices) base.invoices = {}; }
    base.invoices = Object.assign({}, base.invoices, g);
  }
})();

// ===== i18n gap fill (Phase 3 batch 2) =====
// Sales-page runtime strings that still ship as plain Arabic copy.
(function patchSalesRuntimeI18n() {
  const sets = {
    ar: {
      sales: {
        custDebtPrefix: 'دين عليه',
        custCreditPrefix: 'له رصيد',
        custZeroLabel: 'الرصيد: 0',
        creditCancelDiscount: 'إلغاء الخصم',
        creditWillDiscount: 'سيتم خصم',
        creditFromBalance: 'من رصيد العميل',
        creditCustomerBalance: 'رصيد العميل لصالحه',
        creditAfterDiscount: 'الباقي بعد الخصم',
        creditOweNote: 'رصيد لصالح العميل (نحن مدينون له)',
        creditApplyNote: 'عند تطبيقه يُدفع الخصم من رصيده ويبقى المتبقي نقداً',
        creditDiscountNow: 'خصم المبلغ من رصيد العميل',
        supDebtCap: 'علينا له',
        supCreditCap: 'له علينا',
        supZeroCap: 'الرصيد',
        supClearWarn: 'سيتم إفراغ محتوى القائمة الحالية. هل تريد المتابعة؟',
        bundleSaleBlocked: 'هذا المنتج موجود في الباقة لا يمكن بيعه هو يباع عن طريق الباقة الآن',
        switchPriceMode: 'تبديل نوع السعر: قطعة ← جملة',
        switchPriceModeExtra: ' ← أسعار إضافية',
        supCashReceivedNow: 'نقد مقبوض الآن من المورد (اختياري)',
        creditDiscountDone: 'تم خصم',
        creditDiscountSource: 'من رصيد العميل عند البيع',
        loading: 'جارٍ التحميل...',
        loadError: 'تعذّر تحميل سجل المبيعات',
        supNotFound: 'لا يوجد مورد بهذا الاسم',
        supplierName: 'المورد',
      },
    },
    en: {
      sales: {
        custDebtPrefix: 'Owes you',
        custCreditPrefix: 'Has credit',
        custZeroLabel: 'Balance: 0',
        creditCancelDiscount: 'Cancel discount',
        creditWillDiscount: 'A discount of',
        creditFromBalance: 'from the customer balance',
        creditCustomerBalance: 'Customer balance available',
        creditAfterDiscount: 'Remaining after discount',
        creditOweNote: 'Customer credit (we owe him)',
        creditApplyNote: 'When applied, the discount is taken from his balance and the remainder stays cash',
        creditDiscountNow: 'Discount from customer balance',
        supDebtCap: 'We owe him',
        supCreditCap: 'He owes us',
        supZeroCap: 'Balance',
        supClearWarn: 'This will clear the current list. Continue?',
        bundleSaleBlocked: 'This product belongs to a bundle and cannot be sold alone — it is sold through the bundle',
        switchPriceMode: 'Switch price type: piece ← dozen',
        switchPriceModeExtra: ' ← extra price fields',
        supCashReceivedNow: 'Cash received from supplier now (optional)',
        creditDiscountDone: 'Discount applied',
        creditDiscountSource: 'from the customer balance at the time of sale',
        loading: 'Loading...',
        loadError: 'Failed to load the sales history',
        supNotFound: 'No supplier found with this name',
        supplierName: 'Supplier',
      },
    },
    fr: {
      sales: {
        custDebtPrefix: 'Lui doit',
        custCreditPrefix: 'A un crédit',
        custZeroLabel: 'Solde : 0',
        creditCancelDiscount: 'Annuler la remise',
        creditWillDiscount: 'Une remise de',
        creditFromBalance: 'du solde client',
        creditCustomerBalance: 'Solde client disponible',
        creditAfterDiscount: 'Reste après remise',
        creditOweNote: 'Solde client (nous lui devons)',
        creditApplyNote: 'Lorsqu’elle est appliquée, la remise est déduite de son solde et le reste reste en cash',
        creditDiscountNow: 'Remise du solde client',
        supDebtCap: 'Nous lui devons',
        supCreditCap: 'Il nous doit',
        supZeroCap: 'Solde',
        supClearWarn: 'Ceci videra la liste actuelle. Continuer ?',
        bundleSaleBlocked: 'Ce produit appartient à un pack et ne peut pas être vendu seul — il est vendu via le pack',
        switchPriceMode: 'Changer le type de prix : pièce ← douzaine',
        switchPriceModeExtra: ' ← champs de prix supplémentaires',
        supCashReceivedNow: 'Espèces reçues du fournisseur maintenant (facultatif)',
        creditDiscountDone: 'Remise appliquée',
        creditDiscountSource: 'du solde client au moment de la vente',
        loading: 'Chargement…',
        loadError: 'Échec du chargement de l’historique des ventes',
        supNotFound: 'Aucun fournisseur trouvé pour ce nom',
        supplierName: 'Fournisseur',
      },
    },
    zh: {
      sales: {
        custDebtPrefix: '他欠你',
        custCreditPrefix: '有信用',
        custZeroLabel: '余额：0',
        creditCancelDiscount: '取消折扣',
        creditWillDiscount: '将应用折扣',
        creditFromBalance: '从客户余额扣',
        creditCustomerBalance: '客户余额可用',
        creditAfterDiscount: '折扣后剩余',
        creditOweNote: '客户余额（我们欠他）',
        creditApplyNote: '应用时从余额中扣除折扣，剩余部分保持现金',
        creditDiscountNow: '从客户余额折扣',
        supDebtCap: '我们欠他',
        supCreditCap: '他欠我们',
        supZeroCap: '余额',
        supClearWarn: '将清空当前列表，是否继续？',
        bundleSaleBlocked: '该产品属于套餐，无法单独销售，只能通过套餐销售',
        switchPriceMode: '切换价格类型：件 ← 打',
        switchPriceModeExtra: ' ← 附加价格字段',
        supCashReceivedNow: '现在从供应商收到的现金（可选）',
        creditDiscountDone: '已折扣',
        creditDiscountSource: '销售时从客户余额中扣',
        loading: '加载中',
        loadError: '加载销售历史失败',
        supNotFound: '未找到该名称的供应商',
        supplierName: '供应商',
      },
    },
  };
  for (const lang in sets) {
    const base = LANG[lang];
    if (!base) continue;
    const g = sets[lang].sales;
    if (!base.sales || typeof base.sales !== 'object') { if (!base.sales) base.sales = {}; }
    base.sales = Object.assign({}, base.sales, g);
  }
  const invSets = {
    ar: {
      invoices: {
        remainingOnSupplier: 'المتبقي على المورد',
        supDebtSettled: 'دين المورد مسوّى بالكامل',
        invoiceAmount: 'مبلغ الفاتورة',
        cashReceived: 'مقبوض نقداً',
        expenseRecorded: 'مسجّل في المصروفات',
      },
    },
    en: {
      invoices: {
        remainingOnSupplier: 'Remaining from supplier',
        supDebtSettled: 'Supplier debt fully settled',
        invoiceAmount: 'Invoice amount',
        cashReceived: 'Cash received',
        expenseRecorded: 'Recorded in expenses',
      },
    },
    fr: {
      invoices: {
        remainingOnSupplier: 'Restant fournisseur',
        supDebtSettled: 'Dette fournisseur réglée',
        invoiceAmount: 'Montant facture',
        cashReceived: 'Espèces reçues',
        expenseRecorded: 'Enregistré en dépenses',
      },
    },
    zh: {
      invoices: {
        remainingOnSupplier: '剩余供应商款项',
        supDebtSettled: '供应商债务已结清',
        invoiceAmount: '发票金额',
        cashReceived: '已收现金',
        expenseRecorded: '已记入费用',
      },
    },
  };
  for (const lang in invSets) {
    const base = LANG[lang];
    if (!base) continue;
    const g = invSets[lang].invoices;
    if (!base.invoices || typeof base.invoices !== 'object') { if (!base.invoices) base.invoices = {}; }
    base.invoices = Object.assign({}, base.invoices, g);
  }
})();

// ===== i18n gap fill (Phase 3 batch 3) =====
// Customer-detail page runtime strings that still ship as plain Arabic copy.
(function patchCustomerDetailI18n() {
  const sets = {
    ar: {
      customers: {
        emptyDetails: 'لا توجد معلومات إضافية',
        discountOnAll: 'خصم',
        discountOnAllSuffix: '% على جميع المنتجات',
        noInvoicesFound: 'لا توجد نتائج',
        noInvoicesForCustomer: 'لا توجد فواتير لهذا العميل',
        modified: 'معدلة',
        paymentToSupplier: 'دفع لمورد',
        paymentVoucher: 'سند قبض / تسوية',
        invoiceNumber: 'فاتورة #',
        paid: 'مدفوع',
        remaining: 'المتبقي',
        typeSale: 'فاتورة',
        receipt: 'سند قبض',
        productNoun: 'منتج',
        returnType: 'مرتجع',
        noReason: 'بدون سبب',
        historySalesCount: 'عدد عمليات البيع معه',
        historySalesCountInvoice: 'فاتورة',
        historyReturnsCount: 'عدد المرتجعات',
        historyReturnsCountReturn: 'مرتجع',
        paymentsEmpty: 'لا توجد دفعات مسجلة',
        paymentsTotal: 'إجمالي الدفعات',
        paymentForInvoice: 'دفعة فاتورة',
        invoiceDate: 'التاريخ',
        invoiceTotal: 'الإجمالي',
        colProduct: 'المنتج',
        colBarcode: 'الباركود',
        colQty: 'الكمية',
        colPrice: 'السعر',
        colTotal: 'المجموع',
        paidInFull: 'هذه الفاتورة مدفوعة بالكامل',
        amountRequired: 'الرجاء إدخال مبلغ صحيح',
        amountExceedsRemaining: 'لا يمكن تجاوز المبلغ المتبقي',
        paymentAgainstInvoice: 'دفع فاتورة',
        deleteInvoiceConfirm: 'هل أنت متأكد من حذف هذه الفاتورة بالكامل؟\nسيتم إرجاع الكميات للمخزون وحذف الدفعات المرتبطة.',
        receiptReadonly: 'سند القبض قابل للعرض فقط — لا يمكن تعديله',
        notChanged: 'لم تقم بأي تغيير على الكميات',
        qtyUnavailable: 'الكمية غير متوفرة في المخزون',
        stockAvailable: 'المتوفر',
        qtyRequired: 'المطلوب',
        stockInsufficient: 'المخزون غير كافٍ',
        returnReason: 'تعديل فاتورة',
        nameRequired: 'الاسم مطلوب',
        discountRange: 'نسبة الخصم يجب أن تكون بين 0 و 100',
        deleteCustomerConfirm: 'هل أنت متأكد من حذف هذا العميل؟',
        invoiceCreateError: 'تعذّر إنشاء الفاتورة',
        historyEmpty: 'لا يوجد سجل شراء',
        collectionFromCustomer: 'قبض من عميل',
        barcodeLabel: 'باركود',
        currentStock: 'المخزون الحالي',
        unitPriceLabel: 'سعر الوحدة (DA)',
        mergePaymentNote: 'دفع عند دمج وصول التسليم',
        addDirectPayment: 'إضافة دفعة مباشرة', editDirectPayment: 'تعديل الدفعة المباشرة',
        directPayAmount: 'المبلغ', directPayDate: 'التاريخ', directPayMethod: 'طريقة الدفع',
        directPayNote: 'ملاحظة (اختياري)',
        directPayHint: 'يُخصَم المبلغ من دين العميل فوراً. أي زيادة تجعل الرصيد دائناً للعميل، وتُحتسب الدفعة إيراداً بتاريخ العملية.',
        directPayBadge: 'دفعة مباشرة', deletePaymentConfirm: 'هل أنت متأكد من حذف هذه الدفعة؟',
      },
    },
    en: {
      customers: {
        emptyDetails: 'No additional information',
        discountOnAll: 'Discount',
        discountOnAllSuffix: '% on all products',
        noInvoicesFound: 'No results',
        noInvoicesForCustomer: 'No invoices for this customer',
        modified: 'Modified',
        paymentToSupplier: 'Payment to supplier',
        paymentVoucher: 'Receipt / settlement',
        invoiceNumber: 'Invoice #',
        paid: 'Paid',
        remaining: 'Remaining',
        typeSale: 'Invoice',
        receipt: 'Receipt',
        productNoun: 'Product',
        returnType: 'Return',
        noReason: 'No reason',
        historySalesCount: 'Number of sales with him',
        historySalesCountInvoice: 'Invoice',
        historyReturnsCount: 'Number of returns',
        historyReturnsCountReturn: 'Return',
        paymentsEmpty: 'No payments recorded',
        paymentsTotal: 'Total payments',
        paymentForInvoice: 'Payment against invoice',
        invoiceDate: 'Date',
        invoiceTotal: 'Total',
        colProduct: 'Product',
        colBarcode: 'Barcode',
        colQty: 'Quantity',
        colPrice: 'Price',
        colTotal: 'Total',
        paidInFull: 'This invoice is fully paid',
        amountRequired: 'Please enter a valid amount',
        amountExceedsRemaining: 'Cannot exceed the remaining amount',
        paymentAgainstInvoice: 'Payment against invoice',
        deleteInvoiceConfirm: 'Are you sure you want to delete this invoice completely?\nStock will be returned and linked payments deleted.',
        receiptReadonly: 'Receipt is view-only — cannot be edited',
        notChanged: 'No quantity changes were made',
        qtyUnavailable: 'Quantity not available in stock',
        stockAvailable: 'Available',
        qtyRequired: 'Required',
        stockInsufficient: 'Insufficient stock',
        returnReason: 'Invoice adjustment',
        nameRequired: 'Name is required',
        discountRange: 'Discount must be between 0 and 100',
        deleteCustomerConfirm: 'Are you sure you want to delete this customer?',
        invoiceCreateError: 'Failed to create the invoice',
        historyEmpty: 'No purchase history',
        collectionFromCustomer: 'Receipt from customer',
        barcodeLabel: 'Barcode',
        currentStock: 'Current stock',
        unitPriceLabel: 'Unit price (DA)',
        mergePaymentNote: 'Payment when merging waybills',
        addDirectPayment: 'Add direct payment', editDirectPayment: 'Edit direct payment',
        directPayAmount: 'Amount', directPayDate: 'Date', directPayMethod: 'Payment method',
        directPayNote: 'Note (optional)',
        directPayHint: 'The amount is deducted from the customer debt immediately. Any excess makes the balance a customer credit, and the payment is booked as revenue on its date.',
        directPayBadge: 'Direct payment', deletePaymentConfirm: 'Are you sure you want to delete this payment?',
      },
    },
    fr: {
      customers: {
        emptyDetails: 'Aucune information supplémentaire',
        discountOnAll: 'Remise',
        discountOnAllSuffix: '% sur tous les produits',
        noInvoicesFound: 'Aucun résultat',
        noInvoicesForCustomer: 'Aucune facture pour ce client',
        modified: 'Modifié',
        paymentToSupplier: 'Paiement fournisseur',
        paymentVoucher: 'Reçu / règlement',
        invoiceNumber: 'Facture #',
        paid: 'Payé',
        remaining: 'Restant',
        typeSale: 'Facture',
        receipt: 'Reçu',
        productNoun: 'Produit',
        returnType: 'Retour',
        noReason: 'Sans raison',
        historySalesCount: 'Nombre d opérations de vente',
        historySalesCountInvoice: 'Facture',
        historyReturnsCount: 'Nombre de retours',
        historyReturnsCountReturn: 'Retour',
        paymentsEmpty: 'Aucun paiement enregistré',
        paymentsTotal: 'Total des paiements',
        paymentForInvoice: 'Paiement facture',
        invoiceDate: 'Date',
        invoiceTotal: 'Total',
        colProduct: 'Produit',
        colBarcode: 'Code-barres',
        colQty: 'Quantité',
        colPrice: 'Prix',
        colTotal: 'Total',
        paidInFull: 'Cette facture est soldée',
        amountRequired: 'Veuillez saisir un montant valide',
        amountExceedsRemaining: 'Ne peut pas dépasser le montant restant',
        paymentAgainstInvoice: 'Paiement facture',
        deleteInvoiceConfirm: 'Êtes-vous sûr de supprimer cette facture complètement?\nLe stock sera retourné et les paiements associés supprimés.',
        receiptReadonly: 'Reçu en lecture seule — non modifiable',
        notChanged: 'Aucun changement n’a été apporté',
        qtyUnavailable: 'Quantité non disponible en stock',
        stockAvailable: 'Disponible',
        qtyRequired: 'Requis',
        stockInsufficient: 'Stock insuffisant',
        returnReason: 'Ajustement facture',
        nameRequired: 'Nom requis',
        discountRange: 'La remise doit être comprise entre 0 et 100',
        deleteCustomerConfirm: 'Êtes-vous sûr de supprimer ce client?',
        invoiceCreateError: 'Échec de la création de la facture',
        historyEmpty: 'Aucun historique d’achat',
        collectionFromCustomer: 'Encaissement client',
        barcodeLabel: 'Code-barres',
        currentStock: 'Stock actuel',
        unitPriceLabel: 'Prix unitaire (DA)',
        mergePaymentNote: 'Paiement lors de la fusion des bons de livraison',
        addDirectPayment: 'Ajouter un paiement direct', editDirectPayment: 'Modifier le paiement direct',
        directPayAmount: 'Montant', directPayDate: 'Date', directPayMethod: 'Mode de paiement',
        directPayNote: 'Note (facultative)',
        directPayHint: 'Le montant est immédiatement déduit de la dette du client. Tout excédent devient un crédit client et le paiement est compté en recette à sa date.',
        directPayBadge: 'Paiement direct', deletePaymentConfirm: 'Voulez-vous vraiment supprimer ce paiement ?',
      },
    },
    zh: {
      customers: {
        emptyDetails: '无附加信息',
        discountOnAll: '折扣',
        discountOnAllSuffix: '% 在所有商品上',
        noInvoicesFound: '无结果',
        noInvoicesForCustomer: '该客户没有发票',
        modified: '已修改',
        paymentToSupplier: '付款给供应商',
        paymentVoucher: '收款/结算',
        invoiceNumber: '发票 #',
        paid: '已付',
        remaining: '剩余',
        typeSale: '发票',
        receipt: '收款',
        productNoun: '产品',
        returnType: '退货',
        noReason: '无原因',
        historySalesCount: '与他进行的销售笔数',
        historySalesCountInvoice: '发票',
        historyReturnsCount: '退货笔数',
        historyReturnsCountReturn: '退货',
        paymentsEmpty: '无已记录付款',
        paymentsTotal: '付款总额',
        paymentForInvoice: '针对发票的付款',
        invoiceDate: '日期',
        invoiceTotal: '总计',
        colProduct: '产品',
        colBarcode: '条码',
        colQty: '数量',
        colPrice: '价格',
        colTotal: '合计',
        paidInFull: '这张发票已付清',
        amountRequired: '请输入有效金额',
        amountExceedsRemaining: '不能超过剩余金额',
        paymentAgainstInvoice: '针对发票的付款',
        deleteInvoiceConfirm: '确定要完全删除这张发票吗？\n库存将退回，相关付款将被删除。',
        receiptReadonly: '收款单仅可查看，不可修改',
        notChanged: '未更改任何数量',
        qtyUnavailable: '数量在库存中不可用',
        stockAvailable: '可用',
        qtyRequired: '所需',
        stockInsufficient: '库存不足',
        returnReason: '发票调整',
        nameRequired: '需要姓名',
        discountRange: '折扣必须在 0 到 100 之间',
        deleteCustomerConfirm: '确定要删除此客户吗？',
        invoiceCreateError: '创建发票失败',
        historyEmpty: '无购买记录',
        collectionFromCustomer: '客户收款',
        barcodeLabel: '条码',
        currentStock: '当前库存',
        unitPriceLabel: '单价 (DA)',
        mergePaymentNote: '合并送货单时付款',
        addDirectPayment: '添加直接付款', editDirectPayment: '编辑直接付款',
        directPayAmount: '金额', directPayDate: '日期', directPayMethod: '付款方式',
        directPayNote: '备注（可选）',
        directPayHint: '金额会立即从客户欠款中扣除；超额部分转为客户贷方余额，付款按操作日期计入收入。',
        directPayBadge: '直接付款', deletePaymentConfirm: '确定要删除此付款吗？',
      },
    },
  };
  for (const lang in sets) {
    const base = LANG[lang];
    if (!base) continue;
    const g = sets[lang].customers;
    if (!base.customers || typeof base.customers !== 'object') { if (!base.customers) base.customers = {}; }
    base.customers = Object.assign({}, base.customers, g);
  }
})();

const _ph4_extraHint_ar = 'أضف حتى {MAX} حقول سعر إضافية. يظهر كل حقل على بطاقات المخزون والبيع، ويتنقّل زر السعر في سلة البيع بين: قطعة ← جملة ← الحقول الإضافية. ولكل حقل صف خاص في «نسبة البيع».';
// ===== i18n gap fill (Phase 3 batch 4) =====
// Inventory page runtime strings that still ship as plain Arabic copy.
(function patchInventoryI18n() {
  const sets = {
    ar: {
      inventory: {
        extraPricesTitle: 'أسعار بيع إضافية',
        extraPricesNotLoaded: 'وحدة حقول الأسعار الإضافية غير محمّلة',
        fieldPlaceholder: 'اسم الحقل (مثال: نصف جملة)',
        fieldColorTitle: 'لون الحقل',
        addExtraFieldsTitle: 'إدراج حقول بيع إضافية',
        extraFieldsHint: _ph4_extraHint_ar,
        noFieldsHint: 'لا توجد حقول — أضف حقلاً جديداً بالأسفل.',
        addFieldBtn: 'إضافة حقل',
        fieldNameRequired: 'أدخل اسماً واحداً على الأقل لكل حقل',
        hiddenUntilSearch: 'أُخفيت المنتجات حتى البحث — اكتب حرفاً في البحث للعرض…',
        printBarcodeTitle: 'طباعة الباركود',
        showOnlyProducts: 'عرض فقط المنتجات',
        hideUntilSearch: 'إخفاء المنتجات حتى البحث (تظهر المطابقة فقط)',
        saveFailed: 'تعذّر حفظ المنتج',
        productAdded: 'أُضيف المنتج',
        barcodeUsedBy: 'هذا الباركود مستعمل لدى منتج آخر',
        productNotFoundEdit: 'المنتج لم يعد موجوداً — لم يُحفظ التعديل',
        editOutOfScope: 'لم يُحفظ التعديل: المنتج خارج نطاق المحل/الشركة. سجّل الدخول إلى نفس الفرع أو أعد المحاولة.',
        bundleEditTitle: 'تعديل باقة عرض',
        bundleAddTitle: 'إضافة باقة عرض',
        noItems: 'لا توجد عناصر',
        availableLabel: 'المتوفر',
        qtyExceedsStock: 'الكمية المطلوبة أكبر من المخزون المتاح',
        noStockForProduct: 'لا يوجد مخزون لهذا المنتج',
        noComponentsYet: 'لم تُضف منتجات بعد',
        availableParen: '(متاح:',
        bundlePrefix: 'باقة',
        addAtLeastOne: 'أضف منتجًا واحدًا على الأقل',
        barcodeUsedProduct: 'هذا الباركود مستخدم بالفعل لدى المنتج',
        barcodeUsedBundle: 'هذا الباركود مستخدم بالفعل لدى الباقة',
        noBundles: 'لا توجد باقات',
        barcodeLabel: 'الباركود',
        priceLabel: 'السعر',
        printBundleBarcode: 'طباعة باركود الباقة',
        deleteBundleConfirm: 'حذف هذه الحزمة؟',
        bundleNameLabel: 'اسم الباقة (إجباري)',
        bundleNamePh: 'باقة 1',
        searchProductLabel: 'بحث عن منتج',
        searchProductPh: 'بحث عن منتج...',
        componentsLabel: 'المكونات',
        bundlePriceLabel: 'سعر البيع (قابل للتعديل)',
        bundlesTitle: 'الباقات',
      },
    },
    en: {
      inventory: {
        extraPricesTitle: 'Additional selling prices',
        extraPricesNotLoaded: 'Extra price fields module not loaded',
        fieldPlaceholder: 'Field name (e.g. semi-wholesale)',
        fieldColorTitle: 'Field color',
        addExtraFieldsTitle: 'Add extra selling price fields',
        extraFieldsHint: 'Add up to {MAX} extra price fields. Each field appears on inventory and sales cards, and the price button cycles between: piece ← wholesale ← extra fields. Each field has its own row in “Sales margin”.',
        noFieldsHint: 'No fields — add a new field below.',
        addFieldBtn: 'Add field',
        fieldNameRequired: 'Enter at least one name for each field',
        hiddenUntilSearch: 'Products are hidden until search — type something to show…',
        printBarcodeTitle: 'Print barcode',
        showOnlyProducts: 'Show products only',
        hideUntilSearch: 'Hide products until search (only matches appear)',
        saveFailed: 'Failed to save the product',
        productAdded: 'Product added',
        barcodeUsedBy: 'This barcode is already used by another product',
        productNotFoundEdit: 'Product no longer exists — edit not saved',
        editOutOfScope: 'Edit not saved: product is outside the shop/company scope. Sign in to the same branch or try again.',
        bundleEditTitle: 'Edit offer bundle',
        bundleAddTitle: 'Add offer bundle',
        noItems: 'No items',
        availableLabel: 'Available',
        qtyExceedsStock: 'Requested quantity exceeds available stock',
        noStockForProduct: 'No stock for this product',
        noComponentsYet: 'No products added yet',
        availableParen: '(Available:',
        bundlePrefix: 'Bundle',
        addAtLeastOne: 'Add at least one product',
        barcodeUsedProduct: 'This barcode is already used by the product',
        barcodeUsedBundle: 'This barcode is already used by the bundle',
        noBundles: 'No bundles',
        barcodeLabel: 'Barcode',
        priceLabel: 'Price',
        printBundleBarcode: 'Print bundle barcode',
        deleteBundleConfirm: 'Delete this bundle?',
        bundleNameLabel: 'Bundle name (required)',
        bundleNamePh: 'Bundle 1',
        searchProductLabel: 'Search for a product',
        searchProductPh: 'Search for a product...',
        componentsLabel: 'Components',
        bundlePriceLabel: 'Selling price (editable)',
        bundlesTitle: 'Bundles',
      },
    },
    fr: {
      inventory: {
        extraPricesTitle: 'Prix de vente supplémentaires',
        extraPricesNotLoaded: 'Module des champs de prix supplémentaires non chargé',
        fieldPlaceholder: 'Nom du champ (ex. demi-gros)',
        fieldColorTitle: 'Couleur du champ',
        addExtraFieldsTitle: 'Ajouter des champs de prix supplémentaires',
        extraFieldsHint: 'Ajoutez jusqu’à {MAX} champs de prix supplémentaires. Chaque champ apparaît sur les cartes de stock et de vente, et le bouton de prix bascule entre : pièce ← gros ← champs supplémentaires. Chaque champ a sa propre ligne dans « Marge de vente ».',
        noFieldsHint: 'Aucun champ — ajoutez un champ ci-dessous.',
        addFieldBtn: 'Ajouter un champ',
        fieldNameRequired: 'Saisissez au moins un nom pour chaque champ',
        hiddenUntilSearch: 'Produits masqués jusqu’à la recherche — tapez pour afficher…',
        printBarcodeTitle: 'Imprimer le code-barres',
        showOnlyProducts: 'Afficher les produits uniquement',
        hideUntilSearch: 'Masquer les produits jusqu’à la recherche (seuls les correspondants apparaissent)',
        saveFailed: 'Échec de l’enregistrement du produit',
        productAdded: 'Produit ajouté',
        barcodeUsedBy: 'Ce code-barres est déjà utilisé par un autre produit',
        productNotFoundEdit: 'Le produit n’existe plus — modification non enregistrée',
        editOutOfScope: 'Modification non enregistrée : produit hors périmètre du magasin/de la société. Connectez-vous à la même agence ou réessayez.',
        bundleEditTitle: 'Modifier le pack',
        bundleAddTitle: 'Ajouter un pack',
        noItems: 'Aucun élément',
        availableLabel: 'Disponible',
        qtyExceedsStock: 'La quantité demandée dépasse le stock disponible',
        noStockForProduct: 'Aucun stock pour ce produit',
        noComponentsYet: 'Aucun produit ajouté',
        availableParen: '(Disponible :',
        bundlePrefix: 'Pack',
        addAtLeastOne: 'Ajoutez au moins un produit',
        barcodeUsedProduct: 'Ce code-barres est déjà utilisé par le produit',
        barcodeUsedBundle: 'Ce code-barres est déjà utilisé par le pack',
        noBundles: 'Aucun pack',
        barcodeLabel: 'Code-barres',
        priceLabel: 'Prix',
        printBundleBarcode: 'Imprimer le code-barres du pack',
        deleteBundleConfirm: 'Supprimer ce pack ?',
        bundleNameLabel: 'Nom du pack (requis)',
        bundleNamePh: 'Pack 1',
        searchProductLabel: 'Rechercher un produit',
        searchProductPh: 'Rechercher un produit...',
        componentsLabel: 'Composants',
        bundlePriceLabel: 'Prix de vente (modifiable)',
        bundlesTitle: 'Packs',
      },
    },
    zh: {
      inventory: {
        extraPricesTitle: '附加售价',
        extraPricesNotLoaded: '附加价格字段模块未加载',
        fieldPlaceholder: '字段名称（例如：半批发）',
        fieldColorTitle: '字段颜色',
        addExtraFieldsTitle: '添加附加售价字段',
        extraFieldsHint: '最多添加 {MAX} 个附加价格字段。每个字段会显示在库存和销售卡片上，价格按钮在：件 ← 批发 ← 附加字段之间切换。每个字段在“销售利润”中都有自己的行。',
        noFieldsHint: '暂无字段 — 请在下方添加新字段。',
        addFieldBtn: '添加字段',
        fieldNameRequired: '请为每个字段输入至少一个名称',
        hiddenUntilSearch: '产品已隐藏，直到搜索 — 输入内容以显示…',
        printBarcodeTitle: '打印条码',
        showOnlyProducts: '仅显示产品',
        hideUntilSearch: '搜索前隐藏产品（仅显示匹配项）',
        saveFailed: '保存产品失败',
        productAdded: '已添加产品',
        barcodeUsedBy: '此条码已被其他产品使用',
        productNotFoundEdit: '产品已不存在 — 未保存修改',
        editOutOfScope: '未保存修改：产品不在店舗/公司范围内。请登录同一分店或重试。',
        bundleEditTitle: '编辑优惠套餐',
        bundleAddTitle: '添加优惠套餐',
        noItems: '无项目',
        availableLabel: '可用',
        qtyExceedsStock: '所需数量超过可用库存',
        noStockForProduct: '此产品无库存',
        noComponentsYet: '尚未添加产品',
        availableParen: '（可用：',
        bundlePrefix: '套餐',
        addAtLeastOne: '请至少添加一个产品',
        barcodeUsedProduct: '此条码已被该产品使用',
        barcodeUsedBundle: '此条码已被套餐使用',
        noBundles: '无套餐',
        barcodeLabel: '条码',
        priceLabel: '价格',
        printBundleBarcode: '打印套餐条码',
        deleteBundleConfirm: '删除此套餐？',
        bundleNameLabel: '套餐名称（必填）',
        bundleNamePh: '套餐 1',
        searchProductLabel: '搜索产品',
        searchProductPh: '搜索产品...',
        componentsLabel: '组件',
        bundlePriceLabel: '售价（可修改）',
        bundlesTitle: '套餐',
      },
    },
  };
  for (const lang in sets) {
    const base = LANG[lang];
    if (!base) continue;
    const g = sets[lang].inventory;
    if (!base.inventory || typeof base.inventory !== 'object') { if (!base.inventory) base.inventory = {}; }
    base.inventory = Object.assign({}, base.inventory, g);
  }
})();


// ===== i18n gap fill (Phase 3 batch 5) =====
// Route-order (bon de livraison / أذن طريق) editor + list + preview toolbar.
(function patchInvoicesRouteI18n() {
  const sets = {
    ar: {
      sales: {
        supDebtSettled: 'دين المورد مسوّى بالكامل',
      },
      invoices: {
        routeOnlySales: 'نسخة أذن الطريق متاحة لفواتير البيع فقط',
        routeExists: 'أذن الطريق {NUM} موجود بنفس المحتوى — فُتح للتعديل بدل تكراره',
        routeCreated: 'أُنشئ أذن الطريق {NUM} — عدّل الكميات والأسعار ثم اطبعه',
        routeNotFound: 'أذن الطريق غير موجود',
        routePreviewSuffix: '— معاينة',
        deleteRouteConfirm: 'حذف أذن الطريق {NUM}؟',
        routeDeleted: 'تم حذف أذن الطريق',
        noRouteDocs: 'لا توجد أذون طريق — انسخ أي فاتورة بيع من زر الشاحنة على بطاقتها.',
        tabInvoices: 'الفواتير',
        tabRoutes: 'أذون الطريق',
        routeCfgBtn: 'إعدادات نسبة أذن الطريق',
        formalCopy: 'نسخة شكلية',
        fromInvoice: 'من فاتورة',
        cashCustomer: 'زبون نقدي',
        paidPrefix: 'مدفوع',
        routeDocTitle: 'أذن طريق —',
        colLabel: 'التسمية',
        sellPriceLabel: 'سعر البيع',
        searchProductToAdd: 'ابحث عن منتج لإدراجه...',
        discountHint: 'خصم العميل (%) / خصم إضافي / المدفوع (DA)',
        notePh: 'ملاحظة تظهر في الفاتورة',
        routeNet: 'صافي أذن الطريق',
        deleteLineTitle: 'حذف السطر',
        productNamePh: 'تسمية المنتج',
        routeNeedsLine: 'أذن الطريق يحتاج سطراً واحداً على الأقل',
        routeSaved: 'تم حفظ أذن الطريق',
        routeCfgTitle: 'نسبة تسعير أذن الطريق',
        managerPassword: 'كلمة مرور المدير',
        wrongPassword: 'كلمة المرور غير صحيحة',
        pctLabel: 'النسبة المُنجِصة من سعر البيع الأصلي (%)',
        pctExample: 'مثال: 58 % تعني أن سطرًا بسعر 200 DA يظهر في أذن الطريق بـ {VAL} DA، وأن إجمالي الفاتورة والمبلغ المدفوع يُخفضان بالنسبة نفسها. الأذون المنشأة سابقاً لا تتأثر.',
        pctRemainHint: 'يبقى {PCT} % من السعر — مثال: 200 DA ← {VAL} DA.',
        invalidPct: 'أدخل نسبة بين 0 و100',
        pctSaved: 'تم حفظ نسبة أذن الطريق: {PCT} %',
        formalCopyNote: 'نسخة شكلية من {NUM} — لا تدخل الحسابات ولا تنقص المخزون. الأسعار المُدرجة {PCT} % من أسعار الفاتورة الأصلية.',
        previewNote: 'معاينة — هكذا ستطبع الوثيقة',
        enterLabel: 'دخول',
        savePreview: 'حفظ ومعاينة',
        savePrint: 'حفظ وطباعة',
      },
    },
    en: {
      sales: {
        supDebtSettled: 'Supplier debt fully settled',
      },
      invoices: {
        routeOnlySales: 'The route-order copy is available for sale invoices only',
        routeExists: 'Route order {NUM} already exists with the same content — opened for editing instead of duplicating',
        routeCreated: 'Route order {NUM} created — adjust quantities and prices, then print it',
        routeNotFound: 'Route order not found',
        routePreviewSuffix: '— preview',
        deleteRouteConfirm: 'Delete route order {NUM}?',
        routeDeleted: 'Route order deleted',
        noRouteDocs: 'No route orders — copy any sale invoice from the truck button on its card.',
        tabInvoices: 'Invoices',
        tabRoutes: 'Route orders',
        routeCfgBtn: 'Route order pricing rate settings',
        formalCopy: 'Formal copy',
        fromInvoice: 'From invoice',
        cashCustomer: 'Cash customer',
        paidPrefix: 'Paid',
        routeDocTitle: 'Route order —',
        colLabel: 'Label',
        sellPriceLabel: 'Selling price',
        searchProductToAdd: 'Search for a product to add...',
        discountHint: 'Customer discount (%) / extra discount / paid (DA)',
        notePh: 'A note that appears on the invoice',
        routeNet: 'Route order net',
        deleteLineTitle: 'Delete line',
        productNamePh: 'Product label',
        routeNeedsLine: 'A route order needs at least one line',
        routeSaved: 'Route order saved',
        routeCfgTitle: 'Route order pricing rate',
        managerPassword: 'Manager password',
        wrongPassword: 'Incorrect password',
        pctLabel: 'Discount percentage from the original selling price (%)',
        pctExample: 'Example: 58% means a line priced at 200 DA appears on the route order as {VAL} DA, and the invoice total and paid amount are reduced by the same rate. Previously created orders are unaffected.',
        pctRemainHint: '{PCT}% of the price remains — example: 200 DA becomes {VAL} DA.',
        invalidPct: 'Enter a percentage between 0 and 100',
        pctSaved: 'Route order rate saved: {PCT}%',
        formalCopyNote: 'Formal copy of {NUM} — it does not enter the accounts and does not reduce stock. Listed prices are {PCT}% of the original invoice prices.',
        previewNote: 'Preview — this is how the document will print',
        enterLabel: 'Enter',
        savePreview: 'Save & preview',
        savePrint: 'Save & print',
      },
    },
    fr: {
      sales: {
        supDebtSettled: 'Dette fournisseur réglée',
      },
      invoices: {
        routeOnlySales: 'La copie du bon de livraison est réservée aux factures de vente',
        routeExists: 'Le bon de livraison {NUM} existe déjà — ouvert en modification au lieu d’être dupliqué',
        routeCreated: 'Bon de livraison {NUM} créé — ajustez les quantités et les prix, puis imprimez-le',
        routeNotFound: 'Bon de livraison introuvable',
        routePreviewSuffix: '— aperçu',
        deleteRouteConfirm: 'Supprimer le bon de livraison {NUM} ?',
        routeDeleted: 'Bon de livraison supprimé',
        noRouteDocs: 'Aucun bon de livraison — copiez une facture de vente depuis le bouton camion de sa carte.',
        tabInvoices: 'Factures',
        tabRoutes: 'Bons de livraison',
        routeCfgBtn: 'Réglage du taux du bon de livraison',
        formalCopy: 'Copie formelle',
        fromInvoice: 'Depuis la facture',
        cashCustomer: 'Client espèces',
        paidPrefix: 'Payé',
        routeDocTitle: 'Bon de livraison —',
        colLabel: 'Désignation',
        sellPriceLabel: 'Prix de vente',
        searchProductToAdd: 'Rechercher un produit à ajouter...',
        discountHint: 'Remise client (%) / remise supplémentaire / payé (DA)',
        notePh: 'Une note qui apparaît sur la facture',
        routeNet: 'Net du bon de livraison',
        deleteLineTitle: 'Supprimer la ligne',
        productNamePh: 'Désignation du produit',
        routeNeedsLine: 'Un bon de livraison a besoin d’au moins une ligne',
        routeSaved: 'Bon de livraison enregistré',
        routeCfgTitle: 'Taux de prix du bon de livraison',
        managerPassword: 'Mot de passe du manager',
        wrongPassword: 'Mot de passe incorrect',
        pctLabel: 'Pourcentage de réduction du prix de vente d’origine (%)',
        pctExample: 'Exemple : 58 % signifie qu’une ligne à 200 DA apparaît sur le bon de livraison à {VAL} DA, et que le total de la facture ainsi que le montant payé sont réduits au même taux. Les bons déjà créés ne sont pas affectés.',
        pctRemainHint: 'Il reste {PCT} % du prix — exemple : 200 DA devient {VAL} DA.',
        invalidPct: 'Saisissez un pourcentage entre 0 et 100',
        pctSaved: 'Taux du bon de livraison enregistré : {PCT} %',
        formalCopyNote: 'Copie formelle de {NUM} — elle n’entre pas en comptabilité et ne réduit pas le stock. Les prix listés sont {PCT} % des prix de la facture d’origine.',
        previewNote: 'Aperçu — voici comment le document s’imprimera',
        enterLabel: 'Entrer',
        savePreview: 'Enregistrer et prévisualiser',
        savePrint: 'Enregistrer et imprimer',
      },
    },
    zh: {
      sales: {
        supDebtSettled: '供应商债务已结清',
      },
      invoices: {
        routeOnlySales: '路运单副本仅适用于销售发票',
        routeExists: '路运单 {NUM} 已存在且内容相同 — 已打开编辑而非重复创建',
        routeCreated: '已创建路运单 {NUM} — 请调整数量和价格后打印',
        routeNotFound: '未找到路运单',
        routePreviewSuffix: '— 预览',
        deleteRouteConfirm: '删除路运单 {NUM}？',
        routeDeleted: '路运单已删除',
        noRouteDocs: '暂无路运单 — 请从卡片上的卡车按钮复制任意销售发票。',
        tabInvoices: '发票',
        tabRoutes: '路运单',
        routeCfgBtn: '路运单定价比例设置',
        formalCopy: '形式副本',
        fromInvoice: '来自发票',
        cashCustomer: '现金客户',
        paidPrefix: '已付',
        routeDocTitle: '路运单 —',
        colLabel: '名称',
        sellPriceLabel: '售价',
        searchProductToAdd: '搜索要添加的产品...',
        discountHint: '客户折扣（%）/ 额外折扣 / 已付（DA）',
        notePh: '发票上显示的备注',
        routeNet: '路运单净额',
        deleteLineTitle: '删除行',
        productNamePh: '产品名称',
        routeNeedsLine: '路运单至少需要一行',
        routeSaved: '路运单已保存',
        routeCfgTitle: '路运单定价比例',
        managerPassword: '管理员密码',
        wrongPassword: '密码不正确',
        pctLabel: '原售价折扣百分比（%）',
        pctExample: '示例：58% 表示标价 200 DA 的行在路运单上显示为 {VAL} DA，发票总额和已付金额也按相同比例降低。已创建的订单不受影响。',
        pctRemainHint: '保留价格的 {PCT}% — 示例：200 DA 变为 {VAL} DA。',
        invalidPct: '请输入 0 到 100 之间的百分比',
        pctSaved: '路运单比例已保存：{PCT}%',
        formalCopyNote: '{NUM} 的形式副本 — 不计入账目，不减少库存。所列价格为原发票价格的 {PCT}%。',
        previewNote: '预览 — 文档将如此打印',
        enterLabel: '进入',
        savePreview: '保存并预览',
        savePrint: '保存并打印',
      },
    },
  };
  for (const lang in sets) {
    const base = LANG[lang];
    if (!base) continue;
    const g = sets[lang].invoices;
    if (!base.invoices || typeof base.invoices !== 'object') { if (!base.invoices) base.invoices = {}; }
    base.invoices = Object.assign({}, base.invoices, g);
    const gs = sets[lang].sales;
    if (gs) {
      if (!base.sales || typeof base.sales !== 'object') { if (!base.sales) base.sales = {}; }
      base.sales = Object.assign({}, base.sales, gs);
    }
  }
})();

// ===== i18n gap fill (Phase 3 batch 6) =====
// Waybill (wb*), dispatch (disp*), purchase (pur*) and email/PDF toasts in
// renderer/js/pages/invoices.js. Arabic values preserve the shipped copy;
// en / fr / zh mirror it. Note: invoices.dispatchNote already holds the
// note-field label, so the dispatch payment note uses dispatchNoteText.
(function patchInvoicesBatch6I18n() {
  const sets = {
    ar: {
      invoices: {
        noResults: 'لا توجد نتائج',
        wbConfirmProforma: 'تسجيل الفاتورة الشكلية',
        wbConfirmWaybill: 'تسجيل الفاتورة',
        wbCustomerRequired: 'الرجاء إدخال اسم العميل',
        wbNoProducts: 'لا توجد منتجات',
        wbNotAvailable: 'غير متوفر',
        wbInCart: '✓ في السلة',
        wbFullyPaid: 'مدفوعة كلياً ✓',
        wbRemaining: 'الباقي: DA',
        wbCartEmpty: 'السلة فارغة',
        wbFullDeliveryNote: 'دفع كامل عند التسليم',
        wbPartialDeliveryNote: 'دفع جزئي عند التسليم',
        wbSavedPrefix: 'تم تسجيل ال',
        wbAmountLabel: 'المبلغ: DA',
        wbProvisionalNote: '(تسجيل شكلي)',
        soonForm: 'سيتم قريباً إضافة نموذج إدخال {TYPE}',
        dispValidAmount: 'الرجاء إدخال مبلغ صحيح',
        dispChooseSupplier: 'الرجاء اختيار مورد',
        dispChooseCustomer: 'الرجاء اختيار عميل',
        dispRecipientRequired: 'الرجاء إدخال اسم المرسل إليه',
        dispatchItemName: 'مبلغ الإرسال — Montant envoyé',
        dispatchNoteText: 'فاتورة إرسال — Bon d\'envoi',
        dispatchNoteWalkin: 'فاتورة إرسال — {NAME}',
        dispSavedPrefix: 'تم تسجيل فاتورة إرسال بقيمة DA',
        dispTimbrePart: '(طابع جبائي: DA',
        dispSupplierDeduct: 'المبلغ خصم من رصيد المورد',
        dispExpenseLabel: 'المبلغ مسجل كمصروف DA',
        dispCustomerSummary: '، والدفعة الأولى DA{PAY} إيراد — الباقي DA{REMAIN} كدين على العميل',
        purScannerFound: '✓ تم العثور على المنتج',
        purStockLabel: 'المخزون',
        purUseProduct: 'استخدام هذا المنتج',
        purNotFoundNew: '✗ منتج غير موجود — سيتم إدخال منتج جديد',
        purBarcodeLabel: 'الباركود:',
        purProductRequired: 'الرجاء إدخال اسم المنتج',
        purBarcodeRequired: 'الرجاء إدخال الباركود',
        barcodeConflict: 'هذا الباركود مسجّل لمنتج آخر: {NAME} ({CODE})',
        purProductDiscount: 'خصم المنتج',
        purLineInvoiceDiscount: 'خصم الفاتورة على السطر',
        purRealLineCost: 'التكلفة الحقيقية للسطر',
        purClearConfirm: 'تفريغ سلة الفاتورة؟',
        purFixedDiscountLabel: 'خصم الفاتورة (مبلغ ثابت)',
        purPctDiscountLabel: 'خصم الفاتورة ({VAL}%)',
        purGrossTotal: 'الإجمالي قبل الخصم',
        purProductsDiscount: 'خصم المنتجات',
        purNetBeforeDiscount: 'الصافي قبل الخصم',
        purRealTotal: 'الإجمالي الحقيقي للفاتورة',
        purCartEmpty: 'سلة الفاتورة فارغة',
        barcodeInvalid: 'الباركود غير صالح',
        purSavedPrefix: 'تم تسجيل فاتورة بقيمة DA',
        purTimbreSuffix: ' + طابع جبائي DA',
        purSavedIncludes: ' تشمل {CNT} منتج ({QTY} قطعة)',
        pdfGenerateFail: 'تعذّر توليد ملف PDF',
        pdfSavedOk: 'تم حفظ ملف PDF بنجاح',
        pdfSaveFail: 'فشل حفظ الملف',
        pdfErrorPrefix: 'خطأ: ',
        emailRequired: 'الرجاء إدخال بريد المرسل إليه',
        emailInvalid: 'صيغة البريد الإلكتروني غير صحيحة',
        gmailOpened: 'تم فتح Gmail — أرفق ملف PDF ثم أرسل',
        transferFromLabel: 'من:',
      },
    },
    en: {
      invoices: {
        noResults: 'No results',
        wbConfirmProforma: 'Register the proforma invoice',
        wbConfirmWaybill: 'Register the invoice',
        wbCustomerRequired: 'Please enter the customer name',
        wbNoProducts: 'No products',
        wbNotAvailable: 'Out of stock',
        wbInCart: '✓ In cart',
        wbFullyPaid: 'Fully paid ✓',
        wbRemaining: 'Remaining: DA',
        wbCartEmpty: 'Cart is empty',
        wbFullDeliveryNote: 'Full payment on delivery',
        wbPartialDeliveryNote: 'Partial payment on delivery',
        wbSavedPrefix: 'Registered ',
        wbAmountLabel: 'Amount: DA',
        wbProvisionalNote: '(Formal record)',
        soonForm: 'An entry form for {TYPE} will be added soon',
        dispValidAmount: 'Please enter a valid amount',
        dispChooseSupplier: 'Please choose a supplier',
        dispChooseCustomer: 'Please choose a customer',
        dispRecipientRequired: 'Please enter the recipient name',
        dispatchItemName: 'Dispatch amount — Montant envoyé',
        dispatchNoteText: 'Bon d\'envoi — Dispatch invoice',
        dispatchNoteWalkin: 'Bon d\'envoi — {NAME}',
        dispSavedPrefix: 'Dispatch invoice registered for DA',
        dispTimbrePart: '(Fiscal stamp: DA',
        dispSupplierDeduct: 'The amount was deducted from the supplier balance',
        dispExpenseLabel: 'The amount was recorded as an expense DA',
        dispCustomerSummary: ', and the first payment DA{PAY} is revenue — the remainder DA{REMAIN} is a debt on the customer',
        purScannerFound: '✓ Product found',
        purStockLabel: 'Stock',
        purUseProduct: 'Use this product',
        purNotFoundNew: '✗ Product not found — a new product will be entered',
        purBarcodeLabel: 'Barcode:',
        purProductRequired: 'Please enter the product name',
        purBarcodeRequired: 'Please enter the barcode',
        barcodeConflict: 'This barcode is already used by another product: {NAME} ({CODE})',
        purProductDiscount: 'Product discount',
        purLineInvoiceDiscount: 'Invoice discount on line',
        purRealLineCost: 'Real line cost',
        purClearConfirm: 'Empty the invoice cart?',
        purFixedDiscountLabel: 'Invoice discount (fixed amount)',
        purPctDiscountLabel: 'Invoice discount ({VAL}%)',
        purGrossTotal: 'Total before discount',
        purProductsDiscount: 'Product discounts',
        purNetBeforeDiscount: 'Net before discount',
        purRealTotal: 'Real invoice total',
        purCartEmpty: 'Invoice cart is empty',
        barcodeInvalid: 'Invalid barcode',
        purSavedPrefix: 'Invoice registered for DA',
        purTimbreSuffix: ' + fiscal stamp DA',
        purSavedIncludes: ' including {CNT} products ({QTY} pieces)',
        pdfGenerateFail: 'Failed to generate the PDF file',
        pdfSavedOk: 'PDF file saved successfully',
        pdfSaveFail: 'Failed to save the file',
        pdfErrorPrefix: 'Error: ',
        emailRequired: 'Please enter the recipient email',
        emailInvalid: 'Invalid email format',
        gmailOpened: 'Gmail opened — attach the PDF file then send',
        transferFromLabel: 'From:',
      },
    },
    fr: {
      invoices: {
        noResults: 'Aucun résultat',
        wbConfirmProforma: 'Enregistrer la facture proforma',
        wbConfirmWaybill: 'Enregistrer la facture',
        wbCustomerRequired: 'Veuillez saisir le nom du client',
        wbNoProducts: 'Aucun produit',
        wbNotAvailable: 'Indisponible',
        wbInCart: '✓ Dans le panier',
        wbFullyPaid: 'Soldée ✓',
        wbRemaining: 'Reste : DA',
        wbCartEmpty: 'Panier vide',
        wbFullDeliveryNote: 'Paiement intégral à la livraison',
        wbPartialDeliveryNote: 'Paiement partiel à la livraison',
        wbSavedPrefix: 'Enregistré ',
        wbAmountLabel: 'Montant : DA',
        wbProvisionalNote: '(Enregistrement formel)',
        soonForm: 'Un formulaire pour {TYPE} sera ajouté bientôt',
        dispValidAmount: 'Veuillez saisir un montant valide',
        dispChooseSupplier: 'Veuillez choisir un fournisseur',
        dispChooseCustomer: 'Veuillez choisir un client',
        dispRecipientRequired: 'Veuillez saisir le nom du destinataire',
        dispatchItemName: 'Montant envoyé — Dispatch amount',
        dispatchNoteText: 'Bon d\'envoi — Dispatch invoice',
        dispatchNoteWalkin: 'Bon d\'envoi — {NAME}',
        dispSavedPrefix: 'Bon d\'envoi enregistré pour DA',
        dispTimbrePart: '(Timbre fiscal : DA',
        dispSupplierDeduct: 'Le montant a été déduit du solde fournisseur',
        dispExpenseLabel: 'Le montant a été enregistré en dépense DA',
        dispCustomerSummary: ', et le premier paiement DA{PAY} est une recette — le reste DA{REMAIN} est une dette du client',
        purScannerFound: '✓ Produit trouvé',
        purStockLabel: 'Stock',
        purUseProduct: 'Utiliser ce produit',
        purNotFoundNew: '✗ Produit introuvable — un nouveau produit sera saisi',
        purBarcodeLabel: 'Code-barres :',
        purProductRequired: 'Veuillez saisir le nom du produit',
        purBarcodeRequired: 'Veuillez saisir le code-barres',
        barcodeConflict: 'Ce code-barres est déjà utilisé par un autre produit : {NAME} ({CODE})',
        purProductDiscount: 'Remise produit',
        purLineInvoiceDiscount: 'Remise facture sur la ligne',
        purRealLineCost: 'Coût réel de la ligne',
        purClearConfirm: 'Vider le panier de la facture ?',
        purFixedDiscountLabel: 'Remise facture (montant fixe)',
        purPctDiscountLabel: 'Remise facture ({VAL}%)',
        purGrossTotal: 'Total avant remise',
        purProductsDiscount: 'Remises produits',
        purNetBeforeDiscount: 'Net avant remise',
        purRealTotal: 'Total réel de la facture',
        purCartEmpty: 'Le panier de la facture est vide',
        barcodeInvalid: 'Code-barres invalide',
        purSavedPrefix: 'Facture enregistrée pour DA',
        purTimbreSuffix: ' + timbre fiscal DA',
        purSavedIncludes: ' incluant {CNT} produits ({QTY} pièces)',
        pdfGenerateFail: 'Échec de la génération du PDF',
        pdfSavedOk: 'Fichier PDF enregistré avec succès',
        pdfSaveFail: 'Échec de l\'enregistrement du fichier',
        pdfErrorPrefix: 'Erreur : ',
        emailRequired: 'Veuillez saisir l\'e-mail du destinataire',
        emailInvalid: 'Format d\'e-mail invalide',
        gmailOpened: 'Gmail ouvert — joignez le PDF puis envoyez',
        transferFromLabel: 'De :',
      },
    },
    zh: {
      invoices: {
        noResults: '无结果',
        wbConfirmProforma: '登记形式发票',
        wbConfirmWaybill: '登记发票',
        wbCustomerRequired: '请输入客户姓名',
        wbNoProducts: '暂无产品',
        wbNotAvailable: '无库存',
        wbInCart: '✓ 在购物车中',
        wbFullyPaid: '已付清 ✓',
        wbRemaining: '剩余：DA',
        wbCartEmpty: '购物车为空',
        wbFullDeliveryNote: '交货时全额付款',
        wbPartialDeliveryNote: '交货时部分付款',
        wbSavedPrefix: '已登记',
        wbAmountLabel: '金额：DA',
        wbProvisionalNote: '（形式登记）',
        soonForm: '将很快添加 {TYPE} 的输入表单',
        dispValidAmount: '请输入有效金额',
        dispChooseSupplier: '请选择供应商',
        dispChooseCustomer: '请选择客户',
        dispRecipientRequired: '请输入收件人姓名',
        dispatchItemName: '发送金额 — Montant envoyé',
        dispatchNoteText: 'Bon d\'envoi — Dispatch invoice',
        dispatchNoteWalkin: 'Bon d\'envoi — {NAME}',
        dispSavedPrefix: '已登记一笔价值 DA 的发送发票',
        dispTimbrePart: '（财政印花：DA',
        dispSupplierDeduct: '金额已从供应商余额中扣除',
        dispExpenseLabel: '金额已记为费用 DA',
        dispCustomerSummary: '，第一笔付款 DA{PAY} 为收入 — 剩余 DA{REMAIN} 为客户的债务',
        purScannerFound: '✓ 已找到产品',
        purStockLabel: '库存',
        purUseProduct: '使用此产品',
        purNotFoundNew: '✗ 未找到产品 — 将输入新产品',
        purBarcodeLabel: '条码：',
        purProductRequired: '请输入产品名称',
        purBarcodeRequired: '请输入条码',
        barcodeConflict: '此条码已被其他产品使用：{NAME} ({CODE})',
        purProductDiscount: '产品折扣',
        purLineInvoiceDiscount: '本行发票折扣',
        purRealLineCost: '本行真实成本',
        purClearConfirm: '清空发票购物车？',
        purFixedDiscountLabel: '发票折扣（固定金额）',
        purPctDiscountLabel: '发票折扣（{VAL}%）',
        purGrossTotal: '折扣前总计',
        purProductsDiscount: '产品折扣',
        purNetBeforeDiscount: '折扣前净额',
        purRealTotal: '发票实际总计',
        purCartEmpty: '发票购物车为空',
        barcodeInvalid: '条码无效',
        purSavedPrefix: '已登记一张价值 DA 的发票',
        purTimbreSuffix: ' + 财政印花 DA',
        purSavedIncludes: ' 包含 {CNT} 种产品（{QTY} 件）',
        pdfGenerateFail: '生成 PDF 文件失败',
        pdfSavedOk: 'PDF 文件已成功保存',
        pdfSaveFail: '保存文件失败',
        pdfErrorPrefix: '错误：',
        emailRequired: '请输入收件人邮箱',
        emailInvalid: '邮箱格式无效',
        gmailOpened: '已打开 Gmail — 请附加 PDF 文件后发送',
        transferFromLabel: '来自：',
      },
    },
  };
  for (const lang in sets) {
    const base = LANG[lang];
    if (!base) continue;
    const g = sets[lang].invoices;
    if (!base.invoices || typeof base.invoices !== 'object') { if (!base.invoices) base.invoices = {}; }
    base.invoices = Object.assign({}, base.invoices, g);
  }
})();

// ===== i18n gap fill (round 2) =====
// Static Arabic copy that ships in markup / dialogs without a data-i18n
// marker (toolbar menus, support screens, license & auth screens, section
// labels, placeholders ...). The matching data-i18n attributes are added to
// the markup so the very same dictionaries feed setLanguage() -> applyTranslation.
(function patchI18nGapsStatic() {
  const sets = {
    ar: {
      auth: {
        selectEmployee: 'اختر موظف',
        needPasswordFirst: 'أدخل كلمة المرور حتى تتمكن من تفعيل البرنامج بمفتاح المزوّد فور منحه',
        viewTerms: 'عرض الشروط والأحكام كاملة',
        agree: 'أقر بقراءة الشروط وأوافق على استخدام البرنامج',
        offlineActivate: 'أو — تفعيل بدون إنترنت (من هاتف الموزّع)',
        importFile: 'استيراد ملف ترخيص من الهاتف (USB / أي طريقة)',
        activate: 'تفعيل البرنامج',
        activateContinue: 'تفعيل واستمرار',
        enterKey: 'أدخل مفتاح التفعيل',
        keyPlaceholder: 'أدخل المفتاح هنا...',
        keyNewPlaceholder: 'مفتاح التفعيل الجديد (ZMT-XXXX-XXXX-XXXX)',
        noAgree: 'لا أوافق (رجوع لتسجيل الدخول)',
        terms: 'باستخدام برنامج ZMT PIECE فإنك تقر بأن المسؤولية القانونية عن استخدام البرنامج تقع على المستخدم، وأن البرنامج يُقدَّم كم دون أي ضمانات صريحة أو ضمنية. جميع البيانات المدخلة تبقى تحت مسؤوليتك. يُحظر إعادة بيع أو توزيع أو اختراق البرنامج دون إذن خطي من ZMT SOFTWARE. بموافقتك تقر بقبول هذه الشروط.',
        termsFull: 'باستخدام برنامج ZMT PIECE فإنك تقر بأن المسؤولية القانونية عن استخدام البرنامج تقع على المستخدم، وأن البرنامج يُقدَّم كما هو دون أي ضمانات صريحة أو ضمنية. جميع البيانات المدخلة تبقى تحت مسؤوليتك. يُحظر إعادة بيع أو توزيع أو اختراق البرنامج دون إذن خطي من ZMT SOFTWARE. بموافقتك تقر بقبول هذه الشروط.',
        active: 'تم التفعيل بنجاح!',
        login: 'الدخول للبرنامج',
        expired: 'انتهت مدة التفعيل',
        expiredHint: 'يرجى إدخال مفتاح تفعيل جديد لاستمرار العمل',
        dataSaved: 'بياناتك محفوظة وستعود بعد التفعيل',
        deviceId: 'معرف هذا الجهاز (للإخبار به عند الطلب)',
        copyId: 'نسخ معرف الجهاز',
        copyIdStore: 'نسخ معرف الجهاز ورمز المتجر',
        reading: 'جارٍ قراءة الجهاز...',
        storeCode: 'رمز المتجر',
        storePassword: 'كلمة مرور المتجر',
        resetDeviceFirst: 'إعادة تصفير الجهاز كأول مرة',
        resetDevice: 'إعادة تصفير الجهاز',
        resetConfirm: 'سيتم مسح مفتاح التفعيل وبصمة الجهاز وبيانات فحص الوقت نهائياً، ويعود الجهاز كأن البرنامج مُثبَّت لأول مرة. أدخل كلمة المرور للمتابعة.',
        fixClock: 'تصحيح ساعة الجهاز الآن',
        clearKey: 'حذف مفتاح التفعيل نهائياً',
        loginDifferent: 'حساب مختلف — تسجيل الدخول',
        termsTitle: 'شروط الاستخدام — ZMT PIECE',
        online: 'متصل',
        offline: 'غير متصل',
        appTitle: 'ZMT PIECE',
        title: 'ZMT PIECE',
      },
      support: {
        anydesk: 'دعم عن بُعد (AnyDesk)',
        rustdesk: 'اتصال عن بُعد (RustDesk)',
        whatsapp: 'تواصل واتساب',
        email: 'راسلنا بريداً',
        call: 'اتصل بالدعم: 0772363629',
      },
      menu: {
        toggleMenu: 'إظهار/إخفاء القائمة (Ctrl+B)',
        quickLinks: 'إظهار/إخفاء الروابط السريعة',
        quickLinksAria: 'روابط سريعة',
        print: 'نمط الطابعة',
        printPaper: 'نمط الطابعة — حجم ورق الفواتير',
        theme: 'إعدادات العرض',
        updates: 'التحديثات',
        logout: 'تسجيل الخروج',
        thermalPrint: 'عند التفعيل تُطبع الفاتورة مباشرة على الطابعة الحرارية بعد تأكيد البيع',
        currentCompany: 'الشركة الحالية',
      },
      invoices: {
        addSmart: 'إضافة ذكية',
        zeroInvoices: '0 فاتورة',
        purchaseDiscount: 'خصم الشراء على هذا المنتج %',
        realCost: 'التكلفة الحقيقية للوحدة',
        netAfterDiscount: 'بعد خصم المنتج وخصم الفاتورة',
        discountValue: 'قيمة خصم الفاتورة',
        routePermission: 'أذون الطريق',
      },
      sales: {
        plusHint: 'اضغط + لتعديل الكميات بالكيبورد',
        currentBalance: 'الرصيد الحالي:',
        saleOnSupplierAccount: 'بيع على حساب المورد',
        saleToSupplier: 'بيع لمورد',
        saleToSupplierPick: 'بيع لمورد — اختر المورد',
        discountFromBalance: 'خصم المبلغ من رصيد العميل',
        afterDiscount: 'بعد الخصم:',
        discountFromDebt: 'سيتم خصم قيمة البضاعة من دين/رصيد المورد، والنقد المقبوض يُسجّل قبضاً نقدياً.',
        viewNetwork: 'عرض شبكة',
        viewList: 'عرض قائمة',
        toggleFavBar: 'إظهار أو إخفاء شريط العلامات المفضلة',
        showBasketBar: 'إظهار شريط «في السلة»',
        showAllCols: 'إظهار كل الأعمدة في وضع القائمة',
        hideUntilSearch: 'إخفاء المنتجات حتى البحث (تظهر المطابقة فقط)',
        hideUntilSearchShort: 'إخفاء حتى البحث',
        addSaleFields: 'إدراج حقول بيع إضافية',
        zeroSuppliers: '0 مورد',
      },
      inventory: {
        productExtraDetails: 'تفاصيل إضافية للمنتج',
        minPrice: 'سعر أدنى',
        originCountry: 'بلد منشأ',
      },
      quickEntry: {
        supplier: 'المورّد:',
        paidNow: 'المفدوع الآن:',
      },
      discounts: {
        all: 'جميع التخفيضات',
        bySale: 'تخفيض البيع',
        byLine: 'تخفيض البنود',
        manual: 'تخفيض يدوي',
        zeroDiscount: '0 تخفيض',
      },
      customers: {
        customerHistory: 'سجل العميل —',
      },
      customer: {
        history: 'سجل الشراء',
      },
      suppliers: {
        supplierHistory: 'سجلات المورد —',
        returnedGoods: 'السلع الفاسدة المرجعة للمورد',
      },
      supplier: {
        history: 'السجل',
      },
      debts: {
        recalcFromInvoices: 'إعادة حساب أرصدة العملاء والموردين من الفواتير الحالية',
      },
      backup: {
        syncAlert: 'تنبيه: إن كانت «المزامنة السحابية» أو شبكة «LAN» مفعّلة، قد تُعاد البيانات لاحقاً. يُفضّل إيقاف المزامنة السحابية (والانفصال عن LAN) قبل المسح للحصول على مسح نهائي.',
        addBrand: 'أضف علامة أخرى...',
        recalcFromOldDb: 'تصحيح أرصدة العملاء والموردين من قاعدة Gestion Stock القديمة دون إعادة استيراد',
        recalcQtyFromOldDb: 'تصحيح كميات المنتجات من جدول ARTICLES في قاعدة Gestion Stock القديمة دون إعادة استيراد',
      },
      bundle: {
        bundles: 'الباقات',
        nameRequired: 'اسم الباقة (إجباري)',
        addBundle: 'إضافة باقة عرض',
        components: 'المكونات',
        salePrice: 'سعر البيع (قابل للتعديل)',
        bundle1: 'باقة 1',
        searchProduct: 'ابحث عن منتج...',
      },
      common: {
        addBrand: 'أضف علامة أخرى...',
        alert: 'تنبيه:',
        checking: 'جارٍ التحقق...',
      },
    },
    en: {
      auth: {
        selectEmployee: 'Select the employee',
        needPasswordFirst: 'Enter the store password so you can activate the program with the supplier key right away',
        viewTerms: 'View the full terms and conditions',
        agree: 'I have read and accept the terms of use',
        offlineActivate: 'Or — activate without internet (from the distributor phone)',
        importFile: 'Import a license file from the distributor phone (USB / any method)',
        activate: 'Activate the program',
        activateContinue: 'Activate and continue',
        enterKey: 'Enter the activation key',
        keyPlaceholder: 'Enter the key here...',
        keyNewPlaceholder: 'New activation key (ZMT-XXXX-XXXX-XXXX)',
        noAgree: 'I do not agree (back to sign in)',
        terms: 'By using ZMT PIECE you accept that the legal responsibility for using the program lies with the user, and that the program is provided as is, without any explicit or implied warranty. All entered data stays under your responsibility. Reselling, distributing or cracking the program without written permission from ZMT SOFTWARE is forbidden. By accepting you accept these terms.',
        termsFull: 'By using ZMT PIECE you accept that the legal responsibility for using the program lies with the user, and that the program is provided as is, without any explicit or implied warranty. All entered data stays under your responsibility. Reselling, distributing or cracking the program without written permission from ZMT SOFTWARE is forbidden. By accepting you accept these terms.',
        active: 'Activated successfully!',
        login: 'Sign in to the program',
        expired: 'The activation period has expired',
        expiredHint: 'Please enter a new activation key to keep working',
        dataSaved: 'Your data is saved and will return after activation',
        deviceId: 'This device ID (provide it when asked)',
        copyId: 'Copy the device ID',
        copyIdStore: 'Copy the device ID and store code',
        reading: 'Reading the device...',
        storeCode: 'Store code',
        storePassword: 'Store password',
        resetDeviceFirst: 'Reset the device to factory first',
        resetDevice: 'Reset the device',
        resetConfirm: 'The activation key, the device fingerprint and the clock-check data will be wiped for good, and the device will be like a first install. Enter the password to continue.',
        fixClock: 'Fix the device clock now',
        clearKey: 'Delete the activation key permanently',
        loginDifferent: 'A different account — sign in',
        termsTitle: 'Terms of use — ZMT PIECE',
        online: 'Online',
        offline: 'Offline',
        appTitle: 'ZMT PIECE',
        title: 'ZMT PIECE',
      },
      support: {
        anydesk: 'Remote support (AnyDesk)',
        rustdesk: 'Remote support (RustDesk)',
        whatsapp: 'WhatsApp',
        email: 'Write to us by email',
        call: 'Contact support: 0772363629',
      },
      menu: {
        toggleMenu: 'Show/hide the menu (Ctrl+B)',
        quickLinks: 'Show/hide the quick links',
        quickLinksAria: 'Quick links',
        print: 'Print style',
        printPaper: 'Print style — paper size for invoices',
        theme: 'Display settings',
        updates: 'Updates',
        logout: 'Log out',
        thermalPrint: 'When enabled the invoice prints directly on the thermal printer after the sale is confirmed',
        currentCompany: 'Current company',
      },
      invoices: {
        addSmart: 'Add smart invoice',
        zeroInvoices: '0 invoices',
        purchaseDiscount: 'Purchase discount on this product %',
        realCost: 'Real unit cost',
        netAfterDiscount: 'After product discount and invoice discount',
        discountValue: 'Invoice discount value',
        routePermission: 'Route allowance',
      },
      sales: {
        plusHint: 'Press + to edit quantities with the keyboard',
        currentBalance: 'Current balance:',
        saleOnSupplierAccount: 'Sale against the supplier account',
        saleToSupplier: 'Sale to a supplier',
        saleToSupplierPick: 'Sale to a supplier — choose the supplier',
        discountFromBalance: 'Discount the amount from the customer balance',
        afterDiscount: 'After discount:',
        discountFromDebt: 'The goods value will be deducted from the supplier debt/balance, and the cash received will be recorded as cash intake.',
        viewNetwork: 'View network',
        viewList: 'View list',
        toggleFavBar: 'Show/hide the favorites bar',
        showBasketBar: 'Show the basket bar',
        showAllCols: 'Show all columns in list mode',
        hideUntilSearch: 'Hide products until search (show only matches)',
        hideUntilSearchShort: 'Hide until search',
        addSaleFields: 'Add extra sale fields',
        zeroSuppliers: '0 suppliers',
      },
      inventory: {
        productExtraDetails: 'Additional product details',
        minPrice: 'Minimum price',
        originCountry: 'Country of origin',
      },
      quickEntry: {
        supplier: 'Supplier:',
        paidNow: 'Paid now:',
      },
      discounts: {
        all: 'All discounts',
        bySale: 'Sale discount',
        byLine: 'Line discount',
        manual: 'Manual discount',
        zeroDiscount: '0 discount',
      },
      customers: {
        customerHistory: 'Customer history —',
      },
      customer: {
        history: 'Purchase history',
      },
      suppliers: {
        supplierHistory: 'Supplier history —',
        returnedGoods: 'Returned damaged goods by the supplier',
      },
      supplier: {
        history: 'History',
      },
      debts: {
        recalcFromInvoices: 'Recalculate customer/supplier balances from the current invoices',
      },
      backup: {
        syncAlert: 'Warning: if the cloud sync or the LAN network is enabled, the data may be restored later. Stop the cloud sync (and disconnect from LAN) before wiping for a final wipe.',
        addBrand: 'Add another brand...',
        recalcFromOldDb: 'Recalculate customer/supplier balances from the old Gestion Stock database without re-importing',
        recalcQtyFromOldDb: 'Recalculate product quantities from the ARTICLES table in the old Gestion Stock database without re-importing',
      },
      bundle: {
        bundles: 'Bundles',
        nameRequired: 'Bundle name (required)',
        addBundle: 'Add bundle',
        components: 'Components',
        salePrice: 'Sale price (editable)',
        bundle1: 'Bundle 1',
        searchProduct: 'Search for a product...',
      },
      common: {
        addBrand: 'Add another brand...',
        alert: 'Warning:',
        checking: 'Checking...',
      },
    },
    fr: {
      auth: {
        selectEmployee: 'Sélectionnez l’employé',
        needPasswordFirst: 'Saisissez le mot de passe du magasin pour activer le programme avec la clé du fournisseur aussitôt',
        viewTerms: 'Voir les conditions complètes',
        agree: 'J’ai lu et accepté les conditions d’utilisation',
        offlineActivate: 'Ou — activer hors ligne (depuis le téléphone du distributeur)',
        importFile: 'Importer un fichier de licence depuis le téléphone du distributeur (USB / tout autre moyen)',
        activate: 'Activer le programme',
        activateContinue: 'Activer et continuer',
        enterKey: 'Saisir la clé d’activation',
        keyPlaceholder: 'Saisissez la clé ici...',
        keyNewPlaceholder: 'Nouvelle clé d’activation (ZMT-XXXX-XXXX-XXXX)',
        noAgree: 'Je n’accepte pas (retour à la connexion)',
        terms: 'En utilisant ZMT PIECE vous acceptez que la responsabilité légale de l’utilisation du programme incombe à l’utilisateur, et que le programme est fourni tel quel, sans garantie explicite ou implicite. Toutes les données saisies restent sous votre responsabilité. La revente, la distribution ou le contournement du programme sans autorisation écrite de ZMT SOFTWARE est interdite. En acceptant vous acceptez ces conditions.',
        termsFull: 'En utilisant ZMT PIECE vous acceptez que la responsabilité légale de l’utilisation du programme incombe à l’utilisateur, et que le programme est fourni tel quel, sans garantie explicite ou implicite. Toutes les données saisies restent sous votre responsabilité. La revente, la distribution ou le contournement du programme sans autorisation écrite de ZMT SOFTWARE est interdite. En acceptant vous acceptez ces conditions.',
        active: 'Activation réussie !',
        login: 'Connexion au programme',
        expired: 'La période d’activation est expirée',
        expiredHint: 'Veuillez saisir une nouvelle clé d’activation pour continuer',
        dataSaved: 'Vos données sont sauvegardées et reviendront après l’activation',
        deviceId: 'Cet identifiant d’appareil (fournir sur demande)',
        copyId: 'Copier l’identifiant',
        copyIdStore: 'Copier l’identifiant et le code magasin',
        reading: 'Lecture de l’appareil...',
        storeCode: 'Code magasin',
        storePassword: 'Mot de passe du magasin',
        resetDeviceFirst: 'Réinitialiser l’appareil en usine d’abord',
        resetDevice: 'Réinitialiser l’appareil',
        resetConfirm: 'La clé d’activation, l’empreinte de l’appareil et les données de contrôle d’heure seront effacées définitivement, et l’appareil sera comme une première installation. Saisissez le mot de passe pour continuer.',
        fixClock: 'Corriger l’heure de l’appareil maintenant',
        clearKey: 'Supprimer définitivement la clé d’activation',
        loginDifferent: 'Un autre compte — connexion',
        termsTitle: 'Conditions d’utilisation — ZMT PIECE',
        online: 'En ligne',
        offline: 'Hors ligne',
        appTitle: 'ZMT PIECE',
        title: 'ZMT PIECE',
      },
      support: {
        anydesk: 'Support à distance (AnyDesk)',
        rustdesk: 'Support à distance (RustDesk)',
        whatsapp: 'WhatsApp',
        email: 'Écrivez-nous par e-mail',
        call: 'Contacter le support : 0772363629',
      },
      menu: {
        toggleMenu: 'Afficher/masquer le menu (Ctrl+B)',
        quickLinks: 'Afficher/masquer les liens rapides',
        quickLinksAria: 'Liens rapides',
        print: 'Style d’impression',
        printPaper: 'Style d’impression — format papier pour les factures',
        theme: 'Paramètres d’affichage',
        updates: 'Mises à jour',
        logout: 'Déconnexion',
        thermalPrint: 'Lorsque activé, la facture s’imprime directement sur l’imprimante thermique après la confirmation de la vente',
        currentCompany: 'Société actuelle',
      },
      invoices: {
        addSmart: 'Ajouter une facture intelligente',
        zeroInvoices: '0 facture',
        purchaseDiscount: 'Remise achat sur ce produit %',
        realCost: 'Coût réel de l’unité',
        netAfterDiscount: 'Après remise produit et remise facture',
        discountValue: 'Valeur de la remise',
        routePermission: 'Autorisation de tournée',
      },
      sales: {
        plusHint: 'Appuyez sur + pour modifier les quantités au clavier',
        currentBalance: 'Solde actuel :',
        saleOnSupplierAccount: 'Vente contre compte fournisseur',
        saleToSupplier: 'Vente au fournisseur',
        saleToSupplierPick: 'Vente au fournisseur — choisir le fournisseur',
        discountFromBalance: 'Appliquer la remise sur le solde client',
        afterDiscount: 'Après remise :',
        discountFromDebt: 'La valeur des marchandises sera déduite du débite fournisseur, et la trésorerie encaissée sera enregistrée.',
        viewNetwork: 'Voir le réseau',
        viewList: 'Voir la liste',
        toggleFavBar: 'Afficher/masquer la barre de favoris',
        showBasketBar: 'Afficher la barre du panier',
        showAllCols: 'Afficher toutes les colonnes en mode liste',
        hideUntilSearch: 'Masquer les produits jusqu’à la recherche (afficher les correspondances)',
        hideUntilSearchShort: 'Masquer jusqu’à la recherche',
        addSaleFields: 'Ajouter des champs de vente supplémentaires',
        zeroSuppliers: '0 fournisseur',
      },
      inventory: {
        productExtraDetails: 'Détails produit supplémentaires',
        minPrice: 'Prix minimum',
        originCountry: 'Pays d’origine',
      },
      quickEntry: {
        supplier: 'Fournisseur :',
        paidNow: 'Payé maintenant :',
      },
      discounts: {
        all: 'Tous les remises',
        bySale: 'Remise vente',
        byLine: 'Remise ligne',
        manual: 'Remise manuelle',
        zeroDiscount: '0 remise',
      },
      customers: {
        customerHistory: 'Historique client —',
      },
      customer: {
        history: 'Historique d’achat',
      },
      suppliers: {
        supplierHistory: 'Historique fournisseur —',
        returnedGoods: 'Marchandises endommagées retournées par le fournisseur',
      },
      supplier: {
        history: 'Historique',
      },
      debts: {
        recalcFromInvoices: 'Recalculer les soldes clients/fournisseurs depuis les factures',
      },
      backup: {
        syncAlert: 'Attention : si la synchronisation cloud ou le réseau LAN est activé, les données peuvent être restaurées plus tard. Arrêtez la synchronisation cloud (et coupez le LAN) avant d’effacer.',
        addBrand: 'Ajouter une autre marque...',
        recalcFromOldDb: 'Recalculer les soldes clients/fournisseurs depuis l’ancienne base Gestion Stock sans réimporter',
        recalcQtyFromOldDb: 'Recalculer les quantités produits depuis la table ARTICLES de l’ancienne base Gestion Stock sans réimporter',
      },
      bundle: {
        bundles: 'Forfaits',
        nameRequired: 'Nom du forfait (obligatoire)',
        addBundle: 'Ajouter un forfait',
        components: 'Composants',
        salePrice: 'Prix de vente (modifiable)',
        bundle1: 'Forfait 1',
        searchProduct: 'Rechercher un produit...',
      },
      common: {
        addBrand: 'Ajouter une autre marque...',
        alert: 'Attention :',
        checking: 'Contrôle en cours...',
      },
    },
    zh: {
      auth: {
        selectEmployee: '选择员工',
        needPasswordFirst: '请输入门店密码，以便立即使用供应商密钥激活程序',
        viewTerms: '查看完整条款和条件',
        agree: '我已阅读并接受使用条款',
        offlineActivate: '或——离线激活（来自分销商手机）',
        importFile: '从分销商手机导入许可证文件（USB / 任意方式）',
        activate: '激活程序',
        activateContinue: '激活并继续',
        enterKey: '输入激活密钥',
        keyPlaceholder: '在此输入密钥…',
        keyNewPlaceholder: '新激活密钥（ZMT-XXXX-XXXX-XXXX）',
        noAgree: '不同意（返回登录）',
        terms: '使用 ZMT PIECE 即表示您接受法律责任由用户承担，程序按原样提供且不附带任何明示或暗示保证。所有输入的数据均由您承担责任。未经 ZMT SOFTWARE 书面许可，禁止再销售、分发或破解程序。接受即表示您接受这些条款。',
        termsFull: '使用 ZMT PIECE 即表示您接受法律责任由用户承担，程序按原样提供且不附带任何明示或暗示保证。所有输入的数据均由您承担责任。未经 ZMT SOFTWARE 书面许可，禁止再销售、分发或破解程序。接受即表示您接受这些条款。',
        active: '激活成功！',
        login: '登录程序',
        expired: '激活期已过',
        expiredHint: '请输入新的激活密钥以继续使用',
        dataSaved: '数据已保存，激活后将恢复',
        deviceId: '此设备ID（请求时告知）',
        copyId: '复制设备ID',
        copyIdStore: '复制设备ID和门店代码',
        reading: '正在读取设备…',
        storeCode: '门店代码',
        storePassword: '门店密码',
        resetDeviceFirst: '首次重置设备',
        resetDevice: '重置设备',
        resetConfirm: '激活密钥、设备指纹和时钟校验数据将被清除，设备将恢复为首次安装状态。请输入密码以继续。',
        fixClock: '现在修复设备时钟',
        clearKey: '永久删除激活密钥',
        loginDifferent: '另一个账户 — 登录',
        termsTitle: '使用条款 — ZMT PIECE',
        online: '在线',
        offline: '离线',
        appTitle: 'ZMT PIECE',
        title: 'ZMT PIECE',
      },
      support: {
        anydesk: '远程支持（AnyDesk）',
        rustdesk: '远程支持（RustDesk）',
        whatsapp: 'WhatsApp',
        email: '通过电子邮件联系我们',
        call: '联系支持：0772363629',
      },
      menu: {
        toggleMenu: '显示/隐藏菜单（Ctrl+B）',
        quickLinks: '显示/隐藏快速链接',
        quickLinksAria: '快速链接',
        print: '打印样式',
        printPaper: '打印样式 — 发票纸张大小',
        theme: '显示设置',
        updates: '更新',
        logout: '退出登录',
        thermalPrint: '启用后，在确认销售后直接打印发票到热敏打印机',
        currentCompany: '当前公司',
      },
      invoices: {
        addSmart: '添加智能发票',
        zeroInvoices: '0 张发票',
        purchaseDiscount: '此产品采购折扣 %',
        realCost: '实际单位成本',
        netAfterDiscount: '产品折扣和发票折扣之后',
        discountValue: '发票折扣值',
        routePermission: '路线权限',
      },
      sales: {
        plusHint: '按 + 键可通过键盘修改数量',
        currentBalance: '当前余额：',
        saleOnSupplierAccount: '对供应商账户的销售',
        saleToSupplier: '销售给供应商',
        saleToSupplierPick: '销售给供应商 — 选择供应商',
        discountFromBalance: '从客户余额中应用折扣',
        afterDiscount: '折扣后：',
        discountFromDebt: '商品价值将从供应商债务/余额中扣除，收到的现金将记录为现金收入。',
        viewNetwork: '查看网络',
        viewList: '查看列表',
        toggleFavBar: '显示/隐藏收藏栏',
        showBasketBar: '显示购物车栏',
        showAllCols: '列表模式下显示所有列',
        hideUntilSearch: '隐藏产品直到搜索（仅显示匹配项）',
        hideUntilSearchShort: '隐藏直到搜索',
        addSaleFields: '添加额外销售字段',
        zeroSuppliers: '0 个供应商',
      },
      inventory: {
        productExtraDetails: '额外产品详情',
        minPrice: '最低价格',
        originCountry: '原产国',
      },
      quickEntry: {
        supplier: '供应商：',
        paidNow: '已支付：',
      },
      discounts: {
        all: '全部折扣',
        bySale: '销售折扣',
        byLine: '行折扣',
        manual: '手动折扣',
        zeroDiscount: '0 折扣',
      },
      customers: {
        customerHistory: '客户历史 —',
      },
      customer: {
        history: '购买历史',
      },
      suppliers: {
        supplierHistory: '供应商历史 —',
        returnedGoods: '供应商退回的损坏商品',
      },
      supplier: {
        history: '历史',
      },
      debts: {
        recalcFromInvoices: '根据当前发票重新计算客户/供应商余额',
      },
      backup: {
        syncAlert: '警告：如果云同步或局域网启用，数据可能会稍后恢复。请在擦写前停止云同步（并断开 LAN）。',
        addBrand: '添加另一个品牌...',
        recalcFromOldDb: '从旧版 Gestion Stock 数据库重新计算客户/供应商余额而不重新导入',
        recalcQtyFromOldDb: '从旧版 Gestion Stock 数据库 ARTICLES 表重新计算产品数量而不重新导入',
      },
      bundle: {
        bundles: '套餐',
        nameRequired: '套餐名称（必填）',
        addBundle: '添加套餐',
        components: '组件',
        salePrice: '销售价格（可编辑）',
        bundle1: '套餐 1',
        searchProduct: '搜索产品...',
      },
      common: {
        addBrand: '添加另一个品牌...',
        alert: '警告：',
        checking: '正在检查...',
      },
    },
  };

  function merge(dst, src) {
    for (const k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      const v = src[k];
      if (v && typeof v === 'object') {
        if (!dst[k] || typeof dst[k] !== 'object') dst[k] = {};
        merge(dst[k], v);
      } else {
        dst[k] = v;
      }
    }
  }
// ===== i18n gap fill (round 4) =====
// Additional strings that still ship as plain Arabic copy in markup / dialogs.
(function patchI18nGapsStatic4() {
  const sets = {
    ar: {
      settings: {
        scannerModeHint: 'يُطبَّق على حقول المسح بالماسح فقط',
        companyAddressPh: 'مثال: 15 Rue Didouche Mourad, Alger',
        companyPhonePh: 'مثال: 0555 12 34 56',
        lanHostPh: 'مثال: 192.168.1.10',
        lanHostPh2: 'مثال: 192.168.1.10 أو PC-CAISSE',
        lanDetail: 'لكي يتصل الجهاز الفرعي بالرئيسي عبر الشبكة، يجب السماح لهذا البرنامج باستقبال الاتصالات على المنافذ',
        lanWindowDetail: 'الإعدادات ← الخصوصية والأمان ← جدار حماية Windows ← السماح لتطبيق عبر جدار الحماية ← تفعيل هذا البرنامج للشبكات الخاصة.',
        filter: 'تصفية',
      },
      sales: {
        paymentExample: 'مثال: دفعة نقدية',
      },
    },
    en: {
      settings: {
        scannerModeHint: 'Applies to the barcode scan fields only',
        companyAddressPh: 'Example: 15 Rue Didouche Mourad, Alger',
        companyPhonePh: 'Example: 0555 12 34 56',
        lanHostPh: 'Example: 192.168.1.10',
        lanHostPh2: 'Example: 192.168.1.10 or PC-CAISSE',
        lanDetail: 'So the sub device can connect to the main device over the network, this program must be allowed to receive connections on the ports',
        lanWindowDetail: 'Settings → Privacy and security → Windows Firewall → Allow app through firewall → Enable for private networks.',
        filter: 'Filter',
      },
      sales: {
        paymentExample: 'Example: cash payment',
      },
    },
    fr: {
      settings: {
        scannerModeHint: 'S’applique aux champs de scan uniquement',
        companyAddressPh: 'Exemple : 15 Rue Didouche Mourad, Alger',
        companyPhonePh: 'Exemple : 0555 12 34 56',
        lanHostPh: 'Exemple : 192.168.1.10',
        lanHostPh2: 'Exemple : 192.168.1.10 ou PC-CAISSE',
        lanDetail: 'Ainsi, l’appareil secondaire peut se connecter à l’appareil principal via le réseau, ce programme doit être autorisé à recevoir des connexions sur les ports',
        lanWindowDetail: 'Paramètres → Confidentialité et sécurité → Pare-feu Windows → Autoriser l’application à passer le pare-feu → Activer pour les réseaux privés.',
        filter: 'Filtrer',
      },
      sales: {
        paymentExample: 'Exemple : paiement en espèces',
      },
    },
    zh: {
      settings: {
        scannerModeHint: '适用于条码扫描字段',
        companyAddressPh: '示例：15 Rue Didouche Mourad, Alger',
        companyPhonePh: '示例：0555 12 34 56',
        lanHostPh: '示例：192.168.1.10',
        lanHostPh2: '示例：192.168.1.10 或 PC-CAISSE',
        lanDetail: '因此，子设备可以通过网络连接到主设备，此程序必须被允许在端口上接收连接',
        lanWindowDetail: '设置 → 隐私和安全 → Windows 防火墙 → 允许应用通过防火墙 → 为私有网络启用。',
        filter: '筛选',
      },
      sales: {
        paymentExample: '示例：现金支付',
      },
    },
  };

  function merge(dst, src) {
    for (const k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      const v = src[k];
      if (v && typeof v === 'object') {
        if (!dst[k] || typeof dst[k] !== 'object') dst[k] = {};
        merge(dst[k], v);
      } else {
        dst[k] = v;
      }
    }
  }
  for (const lang in sets) {
    if (!LANG[lang]) continue;
    merge(LANG[lang], sets[lang]);
  }
})();
  for (const lang in sets) {
    if (!LANG[lang]) continue;
    merge(LANG[lang], sets[lang]);
  }
})();

// ===== i18n gap fill (round 3) =====
// Strings that still ship as plain Arabic copy (help screens, license steps,
// placeholders, section labels ...). The matching data-i18n markers were just
// added to the markup, so this block is the translation source for them.
(function patchI18nGapsStatic3() {
  const sets = {
    ar: {
      auth: {
        offlineDetail: 'لتفعيل من هاتف الموزّع: امسح رمز QR (أعلاه) بتطبيق محرّر الرخص في الهاتف لملء المعرّف ورمز المتجر تلقائياً.',
        activationKey: 'مفتاح التفعيل',
        termsShort: 'باستخدام برنامج ZMT PIECE فإنك تقر بأن المسؤولية القانونية عن استخدام البرنامج تقع على المستخدم، وأن البرنامج يُقدَّم كما هو دون أي ضمانات. جميع البيانات المدخلة تبقى تحت مسؤوليتك. يُحظر إعادة بيع أو توزيع أو اختراق البرنامج دون إذن خطي من ZMT SOFTWARE. بموافقتك تقر بقبول هذه الشروط.',
        contactSupplier: 'تواصل مع المزود للحصول على مفتاح التفعيل ورمز المتجر',
        offlineSteps: 'في هاتف الموزّع: افتح محرّر الرخص ← امسح رمز QR أعلاه ← اختر المدة ← «توليد ملف الترخيص» ← انقل ملف هنا عبر USB.',
        resetShort: 'تصفير الجهاز',
      },
      support: { pro: 'الدعم الاحترافي' },
      license: { watermarkRemaining: 'متبفي 0 يوم' },
      backup: {
        syncAlertBody: 'إن كانت «المزامنة السحابية» أو شبكة «LAN» مفعّلة، قد تُعاد البيانات لاحقاً. يُفضّل إيقاف المزامنة السحابية (والانفصال عن LAN) قبل المسح للحصول على مسح نهائي.',
        programExample: 'مثال: QuickBooks, Sage, Ciel, Odoo, Peachtree, برنامج محلي...',
      },
      brands: {
        productExample: 'مثال: أدوات رياضية',
        brandExample: 'مثال: Adidas',
        countryExample: 'مثال: ألمانيا',
      },
      categoryProducts: { productExample: 'مثال: مضادات حيوية / متلازمات...' },
      customers: { phoneExample: 'مثال: 0555123456', returnedCustomers: 'مرتجعات العميل' },
      dataMigration: { programExample: 'مثال: QuickBooks, Sage, Ciel, Odoo, Peachtree, برنامج محلي...' },
      inventory: { productExample: 'مثال: مضادات حيوية / متلازمات...' },
      invoices: { deliveryNote: 'وصل تسليم — Bon de livraison', productExample: 'مثال: مضادات حيوية / متلازمات...' },
      pd: { lockClose: 'قفل / خروج' },
      quickEntry: { selectSupplierOpt: 'اختيار المورّد بالاسم... (اختياري)' },
      sales: {
        pullToResize: 'سحب لتغيير عرض السلة',
        saleToCustomerSupplier: 'بيع له (مورد)',
        applyDiscount: 'تطبيق الخصم',
        discountFromDebtPrefix: 'سيُخصم من دين/رصيد المورد:',
        currentBalanceLower: 'رصيده الحالي:',
        currentBalanceAfter: 'الرصيد بعد الخصم:',
        invoicesMirror: 'فواتير البيع فقط — مرآة لصفحة الفواتير',
        discountFromDebt: 'سيُخصم من دين/رصيد المورد، والنقد المقبوض يُسجّل قبضاً نقدياً.',
        searchSupplier: 'ابحث عن مورد بالاسم أو الهاتف...',
        clear: 'مسح',
      },
      settings: {
        companyName: 'اسم الشركة (اختياري)',
        loadLogoFirst: 'حمّل لوغو أولاً',
        langArabic: 'العربية',
        scannerOptical: 'الماسح الضوئي للباركود',
        scannerMode: 'طريقة قراءة البARكود',
        scannerAuto: 'تلقائي (السلوك الحالي)',
        scannerAzerty: 'AZERTY فرنسي (يعكس A↔Q، W↔Z)',
        scannerArabic101: 'عربي 101',
        scannerNoConvert: 'بدون تحويل (QWERTY)',
        scannerCase: 'حالة الأحرف للباركود المقروء',
        scannerNoChange: 'بدون تغيير',
        scannerToUpper: 'تحويل إلى كبيرة',
        scannerToLower: 'تحويل إلى صغيرة',
        legalInfoCompany: 'معلومات قانونية للشركة (NIS / NIF / RC / ARTICLE)',
        legalInfoTitle: 'إظهار هذه المعلومات في الفواتير لـ:',
        invoicesCustomers: 'فواتير العملاء',
        invoicesSuppliers: 'فواتير الموردين',
        invoicesEmployees: 'فواتير الموظفين',
        lanAllow: 'السماح عبر جدار الحماية',
        preview: 'استعراض...',
        apiKey: 'مفتاح API',
        aiSelectProvider: 'اختر مزوداً من القائمة أعلاه للحصول على تعليمات المفتاح',
        nis: 'رقم NIS',
        commercialRegistry: 'رقم السجل التجاري',
        nif: 'رقم NIF',
        addressFull: 'العنوان الكامل',
        activityNumber: 'رقم المادة/النشاط',
        operationsLog: 'سجل العمليات',
        operationsLogDesc: 'كل الحركات التي يقوم بها المديرون (إضافة/تعديل/حذف المنتجات، الفواتير، الدفعات، الموردين، العملاء، الفروع، المستخدمين).',
        allManagers: 'كل المديرين',
        operations: 'كل العمليات',
        fromDate: 'من تاريخ',
        toDate: 'إلى تاريخ',
        clearLog: 'مسح السجل',
        lanAllowPrompt: 'اضغط «محاولة السماح تلقائياً» ليظهر طلب التحكم بالحساب (UAC) — وافق عليه لإضافة القاعدة. أو اسمح يدويًا من:',
        lanPrivate: '(شبكة خاصة).',
        lanAllowWindows: 'السماح عبر جدار حماية Windows',
      },
    },
    en: {
      auth: {
        offlineDetail: 'To activate from the distributor phone: scan the QR code above with the distributor editor app on the phone to fill the device ID and store code automatically.',
        activationKey: 'Activation key',
        termsShort: 'By using ZMT PIECE you accept that the legal responsibility for using the program lies with the user, and that the program is provided as is, without any explicit or implied warranty. All entered data stays under your responsibility. Reselling, distributing or cracking the program without written permission from ZMT SOFTWARE is forbidden. By accepting you accept these terms.',
        contactSupplier: 'Contact the supplier for the activation key and store code',
        offlineSteps: 'On the distributor phone: open the distributor editor ← scan the QR code above ← choose the duration ← «generate the license file» ← move the file here via USB.',
        resetShort: 'Reset the device',
      },
      support: { pro: 'Professional support' },
      license: { watermarkRemaining: '0 days left' },
      backup: {
        syncAlertBody: 'If the cloud sync or the LAN network is enabled, the data may be restored later. Stop the cloud sync (and disconnect from LAN) before wiping for a final wipe.',
        programExample: 'Example: QuickBooks, Sage, Ciel, Odoo, Peachtree, local program...',
      },
      brands: { productExample: 'Example: sports tools', brandExample: 'Example: Adidas', countryExample: 'Example: Germany' },
      categoryProducts: { productExample: 'Example: antibiotics / co-morbidities...' },
      customers: { phoneExample: 'Example: 0555123456', returnedCustomers: 'Customer returns' },
      dataMigration: { programExample: 'Example: QuickBooks, Sage, Ciel, Odoo, Peachtree, local program...' },
      inventory: { productExample: 'Example: antibiotics / co-morbidities...' },
      invoices: { deliveryNote: 'Delivery note — Bon de livraison', productExample: 'Example: antibiotics / co-morbidities...' },
      pd: { lockClose: 'Lock / logout' },
      quickEntry: { selectSupplierOpt: 'Select the supplier by name... (optional)' },
      sales: {
        pullToResize: 'Drag to resize the basket',
        saleToCustomerSupplier: 'Sale to him (supplier)',
        applyDiscount: 'Apply discount',
        discountFromDebtPrefix: 'The discount will be deducted from the supplier debt/balance:',
        currentBalanceLower: 'His balance:',
        currentBalanceAfter: 'Balance after discount:',
        invoicesMirror: 'Sale invoices only — mirror of the invoices page',
        discountFromDebt: 'The goods value will be deducted from the supplier debt/balance, and the cash received will be recorded as cash intake.',
        searchSupplier: 'Search the supplier by name or phone...',
        clear: 'Clear',
      },
      settings: {
        companyName: 'Company name (optional)',
        loadLogoFirst: 'Load the logo first',
        langArabic: 'Arabic',
        scannerOptical: 'Optical barcode scanner',
        scannerMode: 'Barcode reading mode',
        scannerAuto: 'Automatic (current behaviour)',
        scannerAzerty: 'French AZERTY (mirrors A↔Q, W↔Z)',
        scannerArabic101: 'Arabic 101',
        scannerNoConvert: 'No conversion (QWERTY)',
        scannerCase: 'Case state of the scanned barcode',
        scannerNoChange: 'No change',
        scannerToUpper: 'Convert to upper',
        scannerToLower: 'Convert to lower',
        legalInfoCompany: 'Legal info for the company (NIS / NIF / RC / ARTICLE)',
        legalInfoTitle: 'Show this info on the invoices:',
        invoicesCustomers: 'Customer invoices',
        invoicesSuppliers: 'Supplier invoices',
        invoicesEmployees: 'Employee invoices',
        lanAllow: 'Allow through the firewall',
        preview: 'Preview...',
        apiKey: 'API key',
        aiSelectProvider: 'Select a provider from the list above for the key instructions',
        nis: 'NIS number',
        commercialRegistry: 'Commercial registry number',
        nif: 'NIF number',
        addressFull: 'Full address',
        activityNumber: 'Activity/article number',
        operationsLog: 'Operations log',
        operationsLogDesc: 'Every move made by the managers (products, invoices, payments, suppliers, customers, branches, users).',
        allManagers: 'All managers',
        operations: 'All operations',
        fromDate: 'From date',
        toDate: 'To date',
        clearLog: 'Clear the log',
        lanAllowPrompt: 'Press “Allow automatically” to show the UAC prompt for the account control — accept it to add the rule. Or allow manually from:',
        lanPrivate: '(private network).',
        lanAllowWindows: 'Allow through the Windows firewall',
      },
    },
    fr: {
      auth: {
        offlineDetail: 'Pour activer depuis le téléphone du distributeur : scannez le code QR ci-dessus avec l’éditeur du distributeur sur le téléphone pour remplir automatiquement l’identifiant et le code magasin.',
        activationKey: 'Clé d’activation',
        termsShort: 'En utilisant ZMT PIECE vous acceptez que la responsabilité légale de l’utilisation du programme incombe à l’utilisateur, et que le programme est fourni tel quel, sans garantie explicite ou implicite. Toutes les données saisies restent sous votre responsabilité. La revente, la distribution ou le contournement du programme sans autorisation écrite de ZMT SOFTWARE est interdite. En acceptant vous acceptez ces conditions.',
        contactSupplier: 'Contacter le fournisseur pour la clé d’activation et le code magasin',
        offlineSteps: 'Sur le téléphone du distributeur : ouvrir l’éditeur du distributeur ← scanner le code QR ci-dessus ← choisir la durée ← « générer le fichier de licence » ← transférer le fichier ici via USB.',
        resetShort: 'Réinitialiser l’appareil',
      },
      support: { pro: 'Support professionnel' },
      license: { watermarkRemaining: '0 jour restant' },
      backup: {
        syncAlertBody: 'Si la synchronisation cloud ou le réseau LAN est activée, les données peuvent être restaurées plus tard. Arrêtez la synchronisation cloud (et coupez le LAN) avant d’effacer.',
        programExample: 'Exemple : QuickBooks, Sage, Ciel, Odoo, Peachtree, programme local...',
      },
      brands: { productExample: 'Exemple : outils de sport', brandExample: 'Exemple : Adidas', countryExample: 'Exemple : Allemagne' },
      categoryProducts: { productExample: 'Exemple : antibiotiques / comorbidités...' },
      customers: { phoneExample: 'Exemple : 0555123456', returnedCustomers: 'Retours client' },
      dataMigration: { programExample: 'Exemple : QuickBooks, Sage, Ciel, Odoo, Peachtree, programme local...' },
      inventory: { productExample: 'Exemple : antibiotiques / comorbidités...' },
      invoices: { deliveryNote: 'Bon de livraison — Bon de livraison', productExample: 'Exemple : antibiotiques / comorbidités...' },
      pd: { lockClose: 'Verrou / déconnexion' },
      quickEntry: { selectSupplierOpt: 'Sélectionner le fournisseur par nom... (facultatif)' },
      sales: {
        pullToResize: 'Faire glisser pour redimensionner le panier',
        saleToCustomerSupplier: 'Vente à lui (fournisseur)',
        applyDiscount: 'Appliquer la remise',
        discountFromDebtPrefix: 'La remise sera déduite du débite fournisseur :',
        currentBalanceLower: 'Son solde :',
        currentBalanceAfter: 'Solde après remise :',
        invoicesMirror: 'Factures de vente uniquement — miroir de la page factures',
        discountFromDebt: 'La valeur des marchandises sera déduite du débite fournisseur, et la trésorerie encaissée sera enregistrée.',
        searchSupplier: 'Rechercher le fournisseur par nom ou téléphone...',
        clear: 'Effacer',
      },
      settings: {
        companyName: 'Nom de l’entreprise (facultatif)',
        loadLogoFirst: 'Charger le logo d’abord',
        langArabic: 'Arabe',
        scannerOptical: 'Scanner optique de codes-barres',
        scannerMode: 'Mode de lecture du code-barres',
        scannerAuto: 'Automatique (comportement actuel)',
        scannerAzerty: 'AZERTY français (reflète A↔Q, W↔Z)',
        scannerArabic101: 'Arabe 101',
        scannerNoConvert: 'Aucune conversion (QWERTY)',
        scannerCase: 'État des lettres du code-barres scanné',
        scannerNoChange: 'Aucun changement',
        scannerToUpper: 'Convertir en majuscules',
        scannerToLower: 'Convertir en minuscules',
        legalInfoCompany: 'Infos légales de l’entreprise (NIS / NIF / RC / ARTICLE)',
        legalInfoTitle: 'Afficher ces infos sur les factures :',
        invoicesCustomers: 'Factures clients',
        invoicesSuppliers: 'Factures fournisseurs',
        invoicesEmployees: 'Factures employés',
        lanAllow: 'Autoriser via le pare-feu',
        preview: 'Aperçu...',
        apiKey: 'Clé API',
        aiSelectProvider: 'Sélectionner un fournisseur dans la liste ci-dessus pour les instructions de la clé',
        nis: 'Numéro NIS',
        commercialRegistry: 'Numéro registre du commerce',
        nif: 'Numéro NIF',
        addressFull: 'Adresse complète',
        activityNumber: 'Numéro d’activité / article',
        operationsLog: 'Journal des opérations',
        operationsLogDesc: 'Toutes les actions effectuées par les gestionnaires (produits, factures, paiements, fournisseurs, clients, succursales, utilisateurs).',
        allManagers: 'Tous les gestionnaires',
        operations: 'Toutes les opérations',
        fromDate: 'Du',
        toDate: 'Au',
        clearLog: 'Effacer le journal',
        lanAllowPrompt: 'Appuyez sur « Autoriser automatiquement » pour afficher la demande de contrôle de compte (UAC) — acceptez pour ajouter la règle. Ou autoriser manuellement depuis :',
        lanPrivate: '(réseau privé).',
        lanAllowWindows: 'Autoriser via le pare-feu Windows',
      },
    },
    zh: {
      auth: {
        offlineDetail: '从分销商手机激活：使用分销商编辑应用扫描上面的二维码，自动填写设备ID和门店代码。',
        activationKey: '激活密钥',
        termsShort: '使用 ZMT PIECE 即表示您接受法律责任由用户承担，程序按原样提供且不附带任何明示或暗示保证。所有输入的数据均由您承担责任。未经 ZMT SOFTWARE 书面许可，禁止再销售、分发或破解程序。接受即表示您接受这些条款。',
        contactSupplier: '联系分销商获取激活密钥和门店代码',
        offlineSteps: '在分销商手机上：打开分销商编辑程序 ← 扫描上面的二维码 ← 选择时长 ← «生成许可证文件» ← 通过 USB 传输文件到此处。',
        resetShort: '重置设备',
      },
      support: { pro: '专业支持' },
      license: { watermarkRemaining: '剩余 0 天' },
      backup: {
        syncAlertBody: '如果云同步或局域网启用，数据可能会稍后恢复。请在擦写前停止云同步（并断开 LAN）。',
        programExample: '示例：QuickBooks, Sage, Ciel, Odoo, Peachtree, 本地程序...',
      },
      brands: { productExample: '示例：体育用品', brandExample: '示例：Adidas', countryExample: '示例：德国' },
      categoryProducts: { productExample: '示例：抗生素 / 共病...' },
      customers: { phoneExample: '示例：0555123456', returnedCustomers: '客户退货' },
      dataMigration: { programExample: '示例：QuickBooks, Sage, Ciel, Odoo, Peachtree, 本地程序...' },
      inventory: { productExample: '示例：抗生素 / 共病...' },
      invoices: { deliveryNote: '交付单 — Bon de livraison', productExample: '示例：抗生素 / 共病...' },
      pd: { lockClose: '锁定 / 退出' },
      quickEntry: { selectSupplierOpt: '按名称选择供应商...（可选）' },
      sales: {
        pullToResize: '拖动调整购物车大小',
        saleToCustomerSupplier: '卖给他（供应商）',
        applyDiscount: '应用折扣',
        discountFromDebtPrefix: '折扣将从供应商债务/余额中扣除：',
        currentBalanceLower: '他的余额：',
        currentBalanceAfter: '折扣后余额：',
        invoicesMirror: '仅销售发票 — 发票页镜像',
        discountFromDebt: '商品价值将从供应商债务/余额中扣除，收到的现金将记录为现金收入。',
        searchSupplier: '按名称或电话搜索供应商...',
        clear: '清除',
      },
      settings: {
        companyName: '公司名称（可选）',
        loadLogoFirst: '先加载Logo',
        langArabic: '阿拉伯语',
        scannerOptical: '光学条码扫描器',
        scannerMode: '条码读取模式',
        scannerAuto: '自动（当前行为）',
        scannerAzerty: '法语 AZERTY（镜像 A↔Q，W↔Z）',
        scannerArabic101: '阿拉伯语 101',
        scannerNoConvert: '不转换（QWERTY）',
        scannerCase: '扫描条码的大小写状态',
        scannerNoChange: '不更改',
        scannerToUpper: '转换为大写',
        scannerToLower: '转换为小写',
        legalInfoCompany: '公司法律信息（NIS / NIF / RC / ARTICLE）',
        legalInfoTitle: '在发票上显示此信息：',
        invoicesCustomers: '客户发票',
        invoicesSuppliers: '供应商发票',
        invoicesEmployees: '员工发票',
        lanAllow: '允许通过防火墙',
        preview: '预览...',
        apiKey: 'API密钥',
        aiSelectProvider: '从上面的列表中选择服务商获取密钥说明',
        nis: 'NIS号',
        commercialRegistry: '商业登记号',
        nif: 'NIF号',
        addressFull: '完整地址',
        activityNumber: '经营/项目编号',
        operationsLog: '操作日志',
        operationsLogDesc: '所有管理员的操作（产品、发票、付款、供应商、客户、分支、用户）。',
        allManagers: '所有管理员',
        operations: '所有操作',
        fromDate: '从',
        toDate: '到',
        clearLog: '清除日志',
        lanAllowPrompt: '点击“自动允许”显示账户控制请求（UAC）——接受以添加规则。或手动允许：',
        lanPrivate: '（专用网络）。',
        lanAllowWindows: '允许通过Windows防火墙',
      },
    },
  };

  function merge(dst, src) {
    for (const k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      const v = src[k];
      if (v && typeof v === 'object') {
        if (!dst[k] || typeof dst[k] !== 'object') dst[k] = {};
        merge(dst[k], v);
      } else {
        dst[k] = v;
      }
    }
  }
  for (const lang in sets) {
    if (!LANG[lang]) continue;
    merge(LANG[lang], sets[lang]);
  }
})();
// ===== i18n gap fill (round 2) =====
// Static Arabic copy that ships in markup / dialogs without a data-i18n
// marker (toolbar menus, support screens, license & auth screens, section
// labels, placeholders ...). The matching data-i18n attributes are added to
// the markup so the very same dictionaries feed setLanguage() -> applyTranslation.
(function patchI18nGapsStatic() {
  const sets = {
    ar: {
      auth: {
        selectEmployee: 'اختر موظف',
        needPasswordFirst: 'أدخل كلمة المرور حتى تتمكن من تفعيل البرنامج بمفتاح المزوّد فور منحه',
        viewTerms: 'عرض الشروط والأحكام كاملة',
        agree: 'أقر بقراءة الشروط وأوافق على استخدام البرنامج',
        offlineActivate: 'أو — تفعيل بدون إنترنت (من هاتف الموزّع)',
        importFile: 'استيراد ملف ترخيص من الهاتف (USB / أي طريقة)',
        activate: 'تفعيل البرنامج',
        activateContinue: 'تفعيل واستمرار',
        enterKey: 'أدخل مفتاح التفعيل',
        keyPlaceholder: 'أدخل المفتاح هنا...',
        keyNewPlaceholder: 'مفتاح التفعيل الجديد (ZMT-XXXX-XXXX-XXXX)',
        noAgree: 'لا أوافق (رجوع لتسجيل الدخول)',
        terms: 'باستخدام برنامج ZMT PIECE فإنك تقر بأن المسؤولية القانونية عن استخدام البرنامج تقع على المستخدم، وأن البرنامج يُقدَّم كم دون أي ضمانات صريحة أو ضمنية. جميع البيانات المدخلة تبقى تحت مسؤوليتك. يُحظر إعادة بيع أو توزيع أو اختراق البرنامج دون إذن خطي من ZMT SOFTWARE. بموافقتك تقر بقبول هذه الشروط.',
        termsFull: 'باستخدام برنامج ZMT PIECE فإنك تقر بأن المسؤولية القانونية عن استخدام البرنامج تقع على المستخدم، وأن البرنامج يُقدَّم كما هو دون أي ضمانات صريحة أو ضمنية. جميع البيانات المدخلة تبقى تحت مسؤوليتك. يُحظر إعادة بيع أو توزيع أو اختراق البرنامج دون إذن خطي من ZMT SOFTWARE. بموافقتك تقر بقبول هذه الشروط.',
        active: 'تم التفعيل بنجاح!',
        login: 'الدخول للبرنامج',
        expired: 'انتهت مدة التفعيل',
        expiredHint: 'يرجى إدخال مفتاح تفعيل جديد لاستمرار العمل',
        dataSaved: 'بياناتك محفوظة وستعود بعد التفعيل',
        deviceId: 'معرف هذا الجهاز (للإخبار به عند الطلب)',
        copyId: 'نسخ معرف الجهاز',
        copyIdStore: 'نسخ معرف الجهاز ورمز المتجر',
        reading: 'جارٍ قراءة الجهاز...',
        storeCode: 'رمز المتجر',
        storePassword: 'كلمة مرور المتجر',
        resetDeviceFirst: 'إعادة تصفير الجهاز كأول مرة',
        resetDevice: 'إعادة تصفير الجهاز',
        resetConfirm: 'سيتم مسح مفتاح التفعيل وبصمة الجهاز وبيانات فحص الوقت نهائياً، ويعود الجهاز كأن البرنامج مُثبَّت لأول مرة. أدخل كلمة المرور للمتابعة.',
        fixClock: 'تصحيح ساعة الجهاز الآن',
        clearKey: 'حذف مفتاح التفعيل نهائياً',
        loginDifferent: 'حساب مختلف — تسجيل الدخول',
        termsTitle: 'شروط الاستخدام — ZMT PIECE',
        online: 'متصل',
        offline: 'غير متصل',
        appTitle: 'ZMT PIECE',
        title: 'ZMT PIECE',
      },
      support: {
        anydesk: 'دعم عن بُعد (AnyDesk)',
        rustdesk: 'اتصال عن بُعد (RustDesk)',
        whatsapp: 'تواصل واتساب',
        email: 'راسلنا بريداً',
        call: 'اتصل بالدعم: 0772363629',
      },
      menu: {
        toggleMenu: 'إظهار/إخفاء القائمة (Ctrl+B)',
        quickLinks: 'إظهار/إخفاء الروابط السريعة',
        quickLinksAria: 'روابط سريعة',
        print: 'نمط الطابعة',
        printPaper: 'نمط الطابعة — حجم ورق الفواتير',
        theme: 'إعدادات العرض',
        updates: 'التحديثات',
        logout: 'تسجيل الخروج',
        thermalPrint: 'عند التفعيل تُطبع الفاتورة مباشرة على الطابعة الحرارية بعد تأكيد البيع',
        currentCompany: 'الشركة الحالية',
      },
      invoices: {
        addSmart: 'إضافة ذكية',
        zeroInvoices: '0 فاتورة',
        purchaseDiscount: 'خصم الشراء على هذا المنتج %',
        realCost: 'التكلفة الحقيقية للوحدة',
        netAfterDiscount: 'بعد خصم المنتج وخصم الفاتورة',
        discountValue: 'قيمة خصم الفاتورة',
        routePermission: 'أذون الطريق',
      },
      sales: {
        plusHint: 'اضغط + لتعديل الكميات بالكيبورد',
        currentBalance: 'الرصيد الحالي:',
        saleOnSupplierAccount: 'بيع على حساب المورد',
        saleToSupplier: 'بيع لمورد',
        saleToSupplierPick: 'بيع لمورد — اختر المورد',
        discountFromBalance: 'خصم المبلغ من رصيد العميل',
        afterDiscount: 'بعد الخصم:',
        discountFromDebt: 'سيتم خصم قيمة البضاعة من دين/رصيد المورد، والنقد المقبوض يُسجّل قبضاً نقدياً.',
        viewNetwork: 'عرض شبكة',
        viewList: 'عرض قائمة',
        toggleFavBar: 'إظهار أو إخفاء شريط العلامات المفضلة',
        showBasketBar: 'إظهار شريط «في السلة»',
        showAllCols: 'إظهار كل الأعمدة في وضع القائمة',
        hideUntilSearch: 'إخفاء المنتجات حتى البحث (تظهر المطابقة فقط)',
        hideUntilSearchShort: 'إخفاء حتى البحث',
        addSaleFields: 'إدراج حقول بيع إضافية',
        zeroSuppliers: '0 مورد',
      },
      inventory: {
        productExtraDetails: 'تفاصيل إضافية للمنتج',
        minPrice: 'سعر أدنى',
        originCountry: 'بلد منشأ',
      },
      quickEntry: {
        supplier: 'المورّد:',
        paidNow: 'المفدوع الآن:',
      },
      discounts: {
        all: 'جميع التخفيضات',
        bySale: 'تخفيض البيع',
        byLine: 'تخفيض البنود',
        manual: 'تخفيض يدوي',
        zeroDiscount: '0 تخفيض',
      },
      customers: {
        customerHistory: 'سجل العميل —',
      },
      customer: {
        history: 'سجل الشراء',
      },
      suppliers: {
        supplierHistory: 'سجلات المورد —',
        returnedGoods: 'السلع الفاسدة المرجعة للمورد',
      },
      supplier: {
        history: 'السجل',
      },
      debts: {
        recalcFromInvoices: 'إعادة حساب أرصدة العملاء والموردين من الفواتير الحالية',
      },
      backup: {
        syncAlert: 'تنبيه: إن كانت «المزامنة السحابية» أو شبكة «LAN» مفعّلة، قد تُعاد البيانات لاحقاً. يُفضّل إيقاف المزامنة السحابية (والانفصال عن LAN) قبل المسح للحصول على مسح نهائي.',
        addBrand: 'أضف علامة أخرى...',
        recalcFromOldDb: 'تصحيح أرصدة العملاء والموردين من قاعدة Gestion Stock القديمة دون إعادة استيراد',
        recalcQtyFromOldDb: 'تصحيح كميات المنتجات من جدول ARTICLES في قاعدة Gestion Stock القديمة دون إعادة استيراد',
      },
      bundle: {
        bundles: 'الباقات',
        nameRequired: 'اسم الباقة (إجباري)',
        addBundle: 'إضافة باقة عرض',
        components: 'المكونات',
        salePrice: 'سعر البيع (قابل للتعديل)',
        bundle1: 'باقة 1',
        searchProduct: 'ابحث عن منتج...',
      },
      common: {
        addBrand: 'أضف علامة أخرى...',
        alert: 'تنبيه:',
        checking: 'جارٍ التحقق...',
      },
    },
    en: {
      auth: {
        selectEmployee: 'Select the employee',
        needPasswordFirst: 'Enter the store password so you can activate the program with the supplier key right away',
        viewTerms: 'View the full terms and conditions',
        agree: 'I have read and accept the terms of use',
        offlineActivate: 'Or — activate without internet (from the distributor phone)',
        importFile: 'Import a license file from the distributor phone (USB / any method)',
        activate: 'Activate the program',
        activateContinue: 'Activate and continue',
        enterKey: 'Enter the activation key',
        keyPlaceholder: 'Enter the key here...',
        keyNewPlaceholder: 'New activation key (ZMT-XXXX-XXXX-XXXX)',
        noAgree: 'I do not agree (back to sign in)',
        terms: 'By using ZMT PIECE you accept that the legal responsibility for using the program lies with the user, and that the program is provided as is, without any explicit or implied warranty. All entered data stays under your responsibility. Reselling, distributing or cracking the program without written permission from ZMT SOFTWARE is forbidden. By accepting you accept these terms.',
        termsFull: 'By using ZMT PIECE you accept that the legal responsibility for using the program lies with the user, and that the program is provided as is, without any explicit or implied warranty. All entered data stays under your responsibility. Reselling, distributing or cracking the program without written permission from ZMT SOFTWARE is forbidden. By accepting you accept these terms.',
        active: 'Activated successfully!',
        login: 'Sign in to the program',
        expired: 'The activation period has expired',
        expiredHint: 'Please enter a new activation key to keep working',
        dataSaved: 'Your data is saved and will return after activation',
        deviceId: 'This device ID (provide it when asked)',
        copyId: 'Copy the device ID',
        copyIdStore: 'Copy the device ID and store code',
        reading: 'Reading the device...',
        storeCode: 'Store code',
        storePassword: 'Store password',
        resetDeviceFirst: 'Reset the device to factory first',
        resetDevice: 'Reset the device',
        resetConfirm: 'The activation key, the device fingerprint and the clock-check data will be wiped for good, and the device will be like a first install. Enter the password to continue.',
        fixClock: 'Fix the device clock now',
        clearKey: 'Delete the activation key permanently',
        loginDifferent: 'A different account — sign in',
        termsTitle: 'Terms of use — ZMT PIECE',
        online: 'Online',
        offline: 'Offline',
        appTitle: 'ZMT PIECE',
        title: 'ZMT PIECE',
      },
      support: {
        anydesk: 'Remote support (AnyDesk)',
        rustdesk: 'Remote support (RustDesk)',
        whatsapp: 'WhatsApp',
        email: 'Write to us by email',
        call: 'Contact support: 0772363629',
      },
      menu: {
        toggleMenu: 'Show/hide the menu (Ctrl+B)',
        quickLinks: 'Show/hide the quick links',
        quickLinksAria: 'Quick links',
        print: 'Print style',
        printPaper: 'Print style — paper size for invoices',
        theme: 'Display settings',
        updates: 'Updates',
        logout: 'Log out',
        thermalPrint: 'When enabled the invoice prints directly on the thermal printer after the sale is confirmed',
        currentCompany: 'Current company',
      },
      invoices: {
        addSmart: 'Add smart invoice',
        zeroInvoices: '0 invoices',
        purchaseDiscount: 'Purchase discount on this product %',
        realCost: 'Real unit cost',
        netAfterDiscount: 'After product discount and invoice discount',
        discountValue: 'Invoice discount value',
        routePermission: 'Route allowance',
      },
      sales: {
        plusHint: 'Press + to edit quantities with the keyboard',
        currentBalance: 'Current balance:',
        saleOnSupplierAccount: 'Sale against the supplier account',
        saleToSupplier: 'Sale to a supplier',
        saleToSupplierPick: 'Sale to a supplier — choose the supplier',
        discountFromBalance: 'Discount the amount from the customer balance',
        afterDiscount: 'After discount:',
        discountFromDebt: 'The goods value will be deducted from the supplier debt/balance, and the cash received will be recorded as cash intake.',
        viewNetwork: 'View network',
        viewList: 'View list',
        toggleFavBar: 'Show/hide the favorites bar',
        showBasketBar: 'Show the basket bar',
        showAllCols: 'Show all columns in list mode',
        hideUntilSearch: 'Hide products until search (show only matches)',
        hideUntilSearchShort: 'Hide until search',
        addSaleFields: 'Add extra sale fields',
        zeroSuppliers: '0 suppliers',
      },
      inventory: {
        productExtraDetails: 'Additional product details',
        minPrice: 'Minimum price',
        originCountry: 'Country of origin',
      },
      quickEntry: {
        supplier: 'Supplier:',
        paidNow: 'Paid now:',
      },
      discounts: {
        all: 'All discounts',
        bySale: 'Sale discount',
        byLine: 'Line discount',
        manual: 'Manual discount',
        zeroDiscount: '0 discount',
      },
      customers: {
        customerHistory: 'Customer history —',
      },
      customer: {
        history: 'Purchase history',
      },
      suppliers: {
        supplierHistory: 'Supplier history —',
        returnedGoods: 'Returned damaged goods by the supplier',
      },
      supplier: {
        history: 'History',
      },
      debts: {
        recalcFromInvoices: 'Recalculate customer/supplier balances from the current invoices',
      },
      backup: {
        syncAlert: 'Warning: if the cloud sync or the LAN network is enabled, the data may be restored later. Stop the cloud sync (and disconnect from LAN) before wiping for a final wipe.',
        addBrand: 'Add another brand...',
        recalcFromOldDb: 'Recalculate customer/supplier balances from the old Gestion Stock database without re-importing',
        recalcQtyFromOldDb: 'Recalculate product quantities from the ARTICLES table in the old Gestion Stock database without re-importing',
      },
      bundle: {
        bundles: 'Bundles',
        nameRequired: 'Bundle name (required)',
        addBundle: 'Add bundle',
        components: 'Components',
        salePrice: 'Sale price (editable)',
        bundle1: 'Bundle 1',
        searchProduct: 'Search for a product...',
      },
      common: {
        addBrand: 'Add another brand...',
        alert: 'Warning:',
        checking: 'Checking...',
      },
    },
    fr: {
      auth: {
        selectEmployee: 'Sélectionnez l’employé',
        needPasswordFirst: 'Saisissez le mot de passe du magasin pour activer le programme avec la clé du fournisseur aussitôt',
        viewTerms: 'Voir les conditions complètes',
        agree: 'J’ai lu et accepté les conditions d’utilisation',
        offlineActivate: 'Ou — activer hors ligne (depuis le téléphone du distributeur)',
        importFile: 'Importer un fichier de licence depuis le téléphone du distributeur (USB / tout autre moyen)',
        activate: 'Activer le programme',
        activateContinue: 'Activer et continuer',
        enterKey: 'Saisir la clé d’activation',
        keyPlaceholder: 'Saisissez la clé ici...',
        keyNewPlaceholder: 'Nouvelle clé d’activation (ZMT-XXXX-XXXX-XXXX)',
        noAgree: 'Je n’accepte pas (retour à la connexion)',
        terms: 'En utilisant ZMT PIECE vous acceptez que la responsabilité légale de l’utilisation du programme incombe à l’utilisateur, et que le programme est fourni tel quel, sans garantie explicite ou implicite. Toutes les données saisies restent sous votre responsabilité. La revente, la distribution ou le contournement du programme sans autorisation écrite de ZMT SOFTWARE est interdite. En acceptant vous acceptez ces conditions.',
        termsFull: 'En utilisant ZMT PIECE vous acceptez que la responsabilité légale de l’utilisation du programme incombe à l’utilisateur, et que le programme est fourni tel quel, sans garantie explicite ou implicite. Toutes les données saisies restent sous votre responsabilité. La revente, la distribution ou le contournement du programme sans autorisation écrite de ZMT SOFTWARE est interdite. En acceptant vous acceptez ces conditions.',
        active: 'Activation réussie !',
        login: 'Connexion au programme',
        expired: 'La période d’activation est expirée',
        expiredHint: 'Veuillez saisir une nouvelle clé d’activation pour continuer',
        dataSaved: 'Vos données sont sauvegardées et reviendront après l’activation',
        deviceId: 'Cet identifiant d’appareil (fournir sur demande)',
        copyId: 'Copier l’identifiant',
        copyIdStore: 'Copier l’identifiant et le code magasin',
        reading: 'Lecture de l’appareil...',
        storeCode: 'Code magasin',
        storePassword: 'Mot de passe du magasin',
        resetDeviceFirst: 'Réinitialiser l’appareil en usine d’abord',
        resetDevice: 'Réinitialiser l’appareil',
        resetConfirm: 'La clé d’activation, l’empreinte de l’appareil et les données de contrôle d’heure seront effacées définitivement, et l’appareil sera comme une première installation. Saisissez le mot de passe pour continuer.',
        fixClock: 'Corriger l’heure de l’appareil maintenant',
        clearKey: 'Supprimer définitivement la clé d’activation',
        loginDifferent: 'Un autre compte — connexion',
        termsTitle: 'Conditions d’utilisation — ZMT PIECE',
        online: 'En ligne',
        offline: 'Hors ligne',
        appTitle: 'ZMT PIECE',
        title: 'ZMT PIECE',
      },
      support: {
        anydesk: 'Support à distance (AnyDesk)',
        rustdesk: 'Support à distance (RustDesk)',
        whatsapp: 'WhatsApp',
        email: 'Écrivez-nous par e-mail',
        call: 'Contacter le support : 0772363629',
      },
      menu: {
        toggleMenu: 'Afficher/masquer le menu (Ctrl+B)',
        quickLinks: 'Afficher/masquer les liens rapides',
        quickLinksAria: 'Liens rapides',
        print: 'Style d’impression',
        printPaper: 'Style d’impression — format papier pour les factures',
        theme: 'Paramètres d’affichage',
        updates: 'Mises à jour',
        logout: 'Déconnexion',
        thermalPrint: 'Lorsque activé, la facture s’imprime directement sur l’imprimante thermique après la confirmation de la vente',
        currentCompany: 'Société actuelle',
      },
      invoices: {
        addSmart: 'Ajouter une facture intelligente',
        zeroInvoices: '0 facture',
        purchaseDiscount: 'Remise achat sur ce produit %',
        realCost: 'Coût réel de l’unité',
        netAfterDiscount: 'Après remise produit et remise facture',
        discountValue: 'Valeur de la remise',
        routePermission: 'Autorisation de tournée',
      },
      sales: {
        plusHint: 'Appuyez sur + pour modifier les quantités au clavier',
        currentBalance: 'Solde actuel :',
        saleOnSupplierAccount: 'Vente contre compte fournisseur',
        saleToSupplier: 'Vente au fournisseur',
        saleToSupplierPick: 'Vente au fournisseur — choisir le fournisseur',
        discountFromBalance: 'Appliquer la remise sur le solde client',
        afterDiscount: 'Après remise :',
        discountFromDebt: 'La valeur des marchandises sera déduite du débite fournisseur, et la trésorerie encaissée sera enregistrée.',
        viewNetwork: 'Voir le réseau',
        viewList: 'Voir la liste',
        toggleFavBar: 'Afficher/masquer la barre de favoris',
        showBasketBar: 'Afficher la barre du panier',
        showAllCols: 'Afficher toutes les colonnes en mode liste',
        hideUntilSearch: 'Masquer les produits jusqu’à la recherche (afficher les correspondances)',
        hideUntilSearchShort: 'Masquer jusqu’à la recherche',
        addSaleFields: 'Ajouter des champs de vente supplémentaires',
        zeroSuppliers: '0 fournisseur',
      },
      inventory: {
        productExtraDetails: 'Détails produit supplémentaires',
        minPrice: 'Prix minimum',
        originCountry: 'Pays d’origine',
      },
      quickEntry: {
        supplier: 'Fournisseur :',
        paidNow: 'Payé maintenant :',
      },
      discounts: {
        all: 'Tous les remises',
        bySale: 'Remise vente',
        byLine: 'Remise ligne',
        manual: 'Remise manuelle',
        zeroDiscount: '0 remise',
      },
      customers: {
        customerHistory: 'Historique client —',
      },
      customer: {
        history: 'Historique d’achat',
      },
      suppliers: {
        supplierHistory: 'Historique fournisseur —',
        returnedGoods: 'Marchandises endommagées retournées par le fournisseur',
      },
      supplier: {
        history: 'Historique',
      },
      debts: {
        recalcFromInvoices: 'Recalculer les soldes clients/fournisseurs depuis les factures',
      },
      backup: {
        syncAlert: 'Attention : si la synchronisation cloud ou le réseau LAN est activé, les données peuvent être restaurées plus tard. Arrêtez la synchronisation cloud (et coupez le LAN) avant d’effacer.',
        addBrand: 'Ajouter une autre marque...',
        recalcFromOldDb: 'Recalculer les soldes clients/fournisseurs depuis l’ancienne base Gestion Stock sans réimporter',
        recalcQtyFromOldDb: 'Recalculer les quantités produits depuis la table ARTICLES de l’ancienne base Gestion Stock sans réimporter',
      },
      bundle: {
        bundles: 'Forfaits',
        nameRequired: 'Nom du forfait (obligatoire)',
        addBundle: 'Ajouter un forfait',
        components: 'Composants',
        salePrice: 'Prix de vente (modifiable)',
        bundle1: 'Forfait 1',
        searchProduct: 'Rechercher un produit...',
      },
      common: {
        addBrand: 'Ajouter une autre marque...',
        alert: 'Attention :',
        checking: 'Contrôle en cours...',
      },
    },
    zh: {
      auth: {
        selectEmployee: '选择员工',
        needPasswordFirst: '请输入门店密码，以便立即使用供应商密钥激活程序',
        viewTerms: '查看完整条款和条件',
        agree: '我已阅读并接受使用条款',
        offlineActivate: '或——离线激活（来自分销商手机）',
        importFile: '从分销商手机导入许可证文件（USB / 任意方式）',
        activate: '激活程序',
        activateContinue: '激活并继续',
        enterKey: '输入激活密钥',
        keyPlaceholder: '在此输入密钥…',
        keyNewPlaceholder: '新激活密钥（ZMT-XXXX-XXXX-XXXX）',
        noAgree: '不同意（返回登录）',
        terms: '使用 ZMT PIECE 即表示您接受法律责任由用户承担，程序按原样提供且不附带任何明示或暗示保证。所有输入的数据均由您承担责任。未经 ZMT SOFTWARE 书面许可，禁止再销售、分发或破解程序。接受即表示您接受这些条款。',
        termsFull: '使用 ZMT PIECE 即表示您接受法律责任由用户承担，程序按原样提供且不附带任何明示或暗示保证。所有输入的数据均由您承担责任。未经 ZMT SOFTWARE 书面许可，禁止再销售、分发或破解程序。接受即表示您接受这些条款。',
        active: '激活成功！',
        login: '登录程序',
        expired: '激活期已过',
        expiredHint: '请输入新的激活密钥以继续使用',
        dataSaved: '数据已保存，激活后将恢复',
        deviceId: '此设备ID（请求时告知）',
        copyId: '复制设备ID',
        copyIdStore: '复制设备ID和门店代码',
        reading: '正在读取设备…',
        storeCode: '门店代码',
        storePassword: '门店密码',
        resetDeviceFirst: '首次重置设备',
        resetDevice: '重置设备',
        resetConfirm: '激活密钥、设备指纹和时钟校验数据将被清除，设备将恢复为首次安装状态。请输入密码以继续。',
        fixClock: '现在修复设备时钟',
        clearKey: '永久删除激活密钥',
        loginDifferent: '另一个账户 — 登录',
        termsTitle: '使用条款 — ZMT PIECE',
        online: '在线',
        offline: '离线',
        appTitle: 'ZMT PIECE',
        title: 'ZMT PIECE',
      },
      support: {
        anydesk: '远程支持（AnyDesk）',
        rustdesk: '远程支持（RustDesk）',
        whatsapp: 'WhatsApp',
        email: '通过电子邮件联系我们',
        call: '联系支持：0772363629',
      },
      menu: {
        toggleMenu: '显示/隐藏菜单（Ctrl+B）',
        quickLinks: '显示/隐藏快速链接',
        quickLinksAria: '快速链接',
        print: '打印样式',
        printPaper: '打印样式 — 发票纸张大小',
        theme: '显示设置',
        updates: '更新',
        logout: '退出登录',
        thermalPrint: '启用后，在确认销售后直接打印发票到热敏打印机',
        currentCompany: '当前公司',
      },
      invoices: {
        addSmart: '添加智能发票',
        zeroInvoices: '0 张发票',
        purchaseDiscount: '此产品采购折扣 %',
        realCost: '实际单位成本',
        netAfterDiscount: '产品折扣和发票折扣之后',
        discountValue: '发票折扣值',
        routePermission: '路线权限',
      },
      sales: {
        plusHint: '按 + 键可通过键盘修改数量',
        currentBalance: '当前余额：',
        saleOnSupplierAccount: '对供应商账户的销售',
        saleToSupplier: '销售给供应商',
        saleToSupplierPick: '销售给供应商 — 选择供应商',
        discountFromBalance: '从客户余额中应用折扣',
        afterDiscount: '折扣后：',
        discountFromDebt: '商品价值将从供应商债务/余额中扣除，收到的现金将记录为现金收入。',
        viewNetwork: '查看网络',
        viewList: '查看列表',
        toggleFavBar: '显示/隐藏收藏栏',
        showBasketBar: '显示购物车栏',
        showAllCols: '列表模式下显示所有列',
        hideUntilSearch: '隐藏产品直到搜索（仅显示匹配项）',
        hideUntilSearchShort: '隐藏直到搜索',
        addSaleFields: '添加额外销售字段',
        zeroSuppliers: '0 个供应商',
      },
      inventory: {
        productExtraDetails: '额外产品详情',
        minPrice: '最低价格',
        originCountry: '原产国',
      },
      quickEntry: {
        supplier: '供应商：',
        paidNow: '已支付：',
      },
      discounts: {
        all: '全部折扣',
        bySale: '销售折扣',
        byLine: '行折扣',
        manual: '手动折扣',
        zeroDiscount: '0 折扣',
      },
      customers: {
        customerHistory: '客户历史 —',
      },
      customer: {
        history: '购买历史',
      },
      suppliers: {
        supplierHistory: '供应商历史 —',
        returnedGoods: '供应商退回的损坏商品',
      },
      supplier: {
        history: '历史',
      },
      debts: {
        recalcFromInvoices: '根据当前发票重新计算客户/供应商余额',
      },
      backup: {
        syncAlert: '警告：如果云同步或局域网启用，数据可能会稍后恢复。请在擦写前停止云同步（并断开 LAN）。',
        addBrand: '添加另一个品牌...',
        recalcFromOldDb: '从旧版 Gestion Stock 数据库重新计算客户/供应商余额而不重新导入',
        recalcQtyFromOldDb: '从旧版 Gestion Stock 数据库 ARTICLES 表重新计算产品数量而不重新导入',
      },
      bundle: {
        bundles: '套餐',
        nameRequired: '套餐名称（必填）',
        addBundle: '添加套餐',
        components: '组件',
        salePrice: '销售价格（可编辑）',
        bundle1: '套餐 1',
        searchProduct: '搜索产品...',
      },
      common: {
        addBrand: '添加另一个品牌...',
        alert: '警告：',
        checking: '正在检查...',
      },
    },
  };

  function merge(dst, src) {
    for (const k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      const v = src[k];
      if (v && typeof v === 'object') {
        if (!dst[k] || typeof dst[k] !== 'object') dst[k] = {};
        merge(dst[k], v);
      } else {
        dst[k] = v;
      }
    }
  }
  for (const lang in sets) {
    if (!LANG[lang]) continue;
    merge(LANG[lang], sets[lang]);
  }
})();
// ===== i18n gap fill =====
// Keys that the HTML pages already referenced but no dictionary defined.
// They used to fall back to Arabic (or to an empty string when even the
// Arabic entry was missing), so those screens stayed Arabic in EN/FR/ZH.
(function patchI18nGaps() {
  const sets = {
    ar: {
      connection: {
        noBranches: 'لا توجد فروع مسجلة',
        searchBtn: 'بحث',
        newPasswordPlaceholder: '4 أحرف على الأقل',
        confirmPasswordPlaceholder: 'أعد إدخال كلمة المرور',
      },
      customers: {
        formEmail: 'البريد الإلكتروني (اختياري)',
        formPhoto: 'الصورة الشخصية (اختياري)',
      },
      suppliers: { formEmail: 'البريد الإلكتروني (اختياري)' },
      invoices: {
        payModalTitle: 'تسديد دفعة',
        paidPreviously: 'المدفوع سابقاً:',
        filterAllTypes: 'جميع الأنواع',
        typeSupSale: 'فواتير البيع للموردين',
        prev: 'السابق',
        next: 'التالي',
        newInvoiceTitle: 'إضافة فاتورة جديدة',
        chooseType: 'اختر نوع الفاتورة:',
        typePurchaseDesc: 'شراء بضائع من مورد',
        printChoiceTitle: 'اختر نوع الطباعة',
        printChoiceDesc: 'كيف تريد التعامل مع هذه الفاتورة؟',
        printTotalTitle: 'إجمالي الطباعة',
        printTotalNet: 'بعد الخصم',
        printTotalNetDesc: 'سعر الوحدة كما هو + سطر الخصم',
        printTotalGross: 'قبل الخصم',
        printTotalGrossDesc: 'الإجمالي دون أي ذكر للخصم',
        savePdf: 'حفظ كـ PDF',
        sendEmail: 'إرسال بالبريد الإلكتروني',
        printEmployee: 'طباعة إلى الموظف',
        emailTitle: 'إرسال الفاتورة بالبريد',
        emailHint: 'عند الإرسال سيُفتح برنامج البريد لديك مع حفظ نسخة PDF — قم بإرفاق ملف PDF ثم أكمل الإرسال.',
        emailTo: 'إرسال إلى',
        emailSubject: 'الموضوع',
        emailMessage: 'رسالة (اختياري)',
        send: 'إرسال',
        cartTitle: 'سلة الفاتورة',
        regMode: 'نوع التسجيل:',
        walkin: 'وهمي',
        recipientName: 'اسم المرسل إليه',
        addressOptional: 'العنوان (اختياري)',
        firstPayment: 'دفعة أولى (اختياري)',
        payHint: 'أدخل المبلغ المدفوع الآن (إن وجد). الباقي يسجل كدين على العميل.',
        dispatchNote: 'ملاحظة (اختياري)',
        dispatchNotePlaceholder: 'ملاحظة تُطبع على فاتورة الإرسال...',
        confirmDispatch: 'تأكيد فاتورة الإرسال',
      },
      sales: {
        confirm: 'تأكيد',
        transferInvoice: 'تحويل الفاتورة',
        transferTitle: 'تحويل الفاتورة إلى عميل',
        transferHint: 'اختر العميل الذي ستُسجَّل عليه هذه الفاتورة (مثلاً إن كان المشتري وكيلاً عنه).',
        transferSelected: 'سيتم تسجيل الفاتورة على:',
        transferConfirm: 'تأكيد التحويل',
      },
      migration: {
        programNameLabel: 'اسم البرنامج القديم (اختياري — لتحسين دقة AI):',
        selectBrands: 'اختر العلامات التجارية التي تتعامل معها',
        brandHint: 'سيساعدنا ذلك في تحسين اكتشاف عمود العلامة التجارية',
        skipBrands: 'تخطي',
        confirmBrands: 'تأكيد',
      },
      settings: {
        fiscalStampLabel: 'الطابع الجبائي (Timbre Fiscal)',
        expiryGroup: 'انتهاء الصلاحية',
        expiryShow: 'إظهار حقل تاريخ انتهاء الصلاحية',
        expiryShowHint: 'إظهار الحقل عند إضافة/تعديل المنتج',
        expiryRequired: 'إلزامية ملء التاريخ',
        expiryRequiredHint: 'عند تفعيلها لا يُقبل حفظ منتج بلا تاريخ',
        expiryWarn: 'التنبيه قبل انتهاء الصلاحية',
        expiryWeek: 'أسبوع',
        expiryWeeks: 'أسبوعان',
        expiryMonth: 'شهر',
        expiryTwoMonths: 'شهران',
        expiryThreeMonths: '3 أشهر',
        company: 'الشركة المطورة',
        licenseCard: 'الترخيص والتفعيل',
        licenseDesc: 'حالة مفتاح التفعيل على هذا الجهاز. لحذف المفتاح نهائياً والعودة إلى شاشة التفعيل، استخدم الزر أدناه.',
        licenseStatus: 'حالة التفعيل',
        licenseStore: 'رمز المتجر',
        licenseExpiry: 'تاريخ الانتهاء',
        licenseAdminSecret: 'السر الإداري (اختياري)',
        licenseAdminSecretPlaceholder: 'لتحرير الجهاز على الخادم أيضاً',
        licenseDeactivateBtn: 'حذف مفتاح التفعيل نهائياً',
        aiCard: 'الذكاء الاصطناعي (AI Agent)',
        aiDesc: 'اختر مزود الخدمة وأدخل مفتاح API الخاص بك لتحليل البيانات واستيرادها بذكاء.',
        aiProvider: 'مزود AI',
        aiBaseUrl: 'Base URL',
        aiKeyNotSet: 'لم يتم تعيين المفتاح بعد',
        aiTestKey: 'اختبار الاتصال',
        saveApiKey: 'حفظ المفتاح',
        clearApiKey: 'مسح المفتاح',
        noUsers: 'لا يوجد مستخدمون بعد',
        invoiceLogo: 'لوغو العمل (الفواتير)',
        logoUpload: 'تحميل لوغو العمل',
        logoPreview: 'معاينة اللوغو',
        logoRemove: 'إزالة',
        logoLocalHint: 'يُحفظ على هذا الجهاز فقط ولا يُرفع إلى السحابة.',
        logoLayout: 'موضع اللوغو وحجمه وشفافيته',
        logoSize: 'الحجم',
        logoOpacity: 'الشفافية',
        logoPreviewHint: 'هكذا سيظهر اللوغو على الفاتورة المطبوعة.',
        logoPreviewBw: 'أبيض وأسود',
        buttonSound: 'صوت الأزرار',
        introSound: 'صوت المقدمة',
        printSettingsBtn: 'اعدادات الطباعة',
      },
      transfer: { title: 'فاتورة نقل منتجات بين الفروع' },
    },
    en: {
      connection: {
        noBranches: 'No registered branches',
        searchBtn: 'Search',
        newPasswordPlaceholder: 'At least 4 characters',
        confirmPasswordPlaceholder: 'Re-enter the password',
      },
      customers: {
        formEmail: 'Email (optional)',
        formPhoto: 'Photo (optional)',
      },
      suppliers: { formEmail: 'Email (optional)' },
      invoices: {
        payModalTitle: 'Record a payment',
        paidPreviously: 'Previously paid:',
        filterAllTypes: 'All types',
        typeSupSale: 'Sales invoices to suppliers',
        prev: 'Previous',
        next: 'Next',
        newInvoiceTitle: 'Add a new invoice',
        chooseType: 'Choose invoice type:',
        typePurchaseDesc: 'Purchase goods from a supplier',
        printChoiceTitle: 'Choose the print type',
        printChoiceDesc: 'How do you want to handle this invoice?',
        printTotalTitle: 'Print total',
        printTotalNet: 'After discount',
        printTotalNetDesc: 'Unit price as is + discount line',
        printTotalGross: 'Before discount',
        printTotalGrossDesc: 'Total without any mention of the discount',
        savePdf: 'Save as PDF',
        sendEmail: 'Send by email',
        printEmployee: 'Print to employee',
        emailTitle: 'Send invoice by email',
        emailHint: 'Sending opens your mail app and saves a PDF copy — attach the PDF file, then finish sending.',
        emailTo: 'Send to',
        emailSubject: 'Subject',
        emailMessage: 'Message (optional)',
        send: 'Send',
        cartTitle: 'Invoice cart',
        regMode: 'Registration type:',
        walkin: 'Walk-in',
        recipientName: 'Recipient name',
        addressOptional: 'Address (optional)',
        firstPayment: 'First payment (optional)',
        payHint: 'Enter the amount paid now (if any). The remainder is recorded as customer debt.',
        dispatchNote: 'Note (optional)',
        dispatchNotePlaceholder: 'Note printed on the dispatch invoice...',
        confirmDispatch: 'Confirm dispatch invoice',
      },
      sales: {
        confirm: 'Confirm',
        transferInvoice: 'Transfer invoice',
        transferTitle: 'Transfer invoice to a customer',
        transferHint: 'Choose the customer this invoice will be recorded under (e.g. if the buyer is acting on their behalf).',
        transferSelected: 'Invoice will be recorded under:',
        transferConfirm: 'Confirm transfer',
      },
      migration: {
        programNameLabel: 'Old program name (optional — improves AI accuracy):',
        selectBrands: 'Select the brands you deal with',
        brandHint: 'This helps us better detect the brand column',
        skipBrands: 'Skip',
        confirmBrands: 'Confirm',
      },
      settings: {
        fiscalStampLabel: 'Fiscal stamp (Timbre Fiscal)',
        expiryGroup: 'Expiry date',
        expiryShow: 'Show the expiry date field',
        expiryShowHint: 'Show the field when adding/editing a product',
        expiryRequired: 'Date required',
        expiryRequiredHint: 'When enabled, a product cannot be saved without a date',
        expiryWarn: 'Warn before expiry',
        expiryWeek: 'One week',
        expiryWeeks: 'Two weeks',
        expiryMonth: 'One month',
        expiryTwoMonths: 'Two months',
        expiryThreeMonths: '3 months',
        company: 'Developed by',
        licenseCard: 'License & activation',
        licenseDesc: 'Activation key status on this device. To permanently remove the key and return to the activation screen, use the button below.',
        licenseStatus: 'Activation status',
        licenseStore: 'Store code',
        licenseExpiry: 'Expiry date',
        licenseAdminSecret: 'Admin secret (optional)',
        licenseAdminSecretPlaceholder: 'To also unlock the device on the server',
        licenseDeactivateBtn: 'Delete activation key permanently',
        aiCard: 'Artificial Intelligence (AI Agent)',
        aiDesc: 'Choose a provider and enter your API key to analyse and import data intelligently.',
        aiProvider: 'AI provider',
        aiBaseUrl: 'Base URL',
        aiKeyNotSet: 'No key set yet',
        aiTestKey: 'Test connection',
        saveApiKey: 'Save key',
        clearApiKey: 'Clear key',
        noUsers: 'No users yet',
        invoiceLogo: 'Business logo (invoices)',
        logoUpload: 'Upload business logo',
        logoPreview: 'Preview logo',
        logoRemove: 'Remove',
        logoLocalHint: 'Saved on this device only — never uploaded to the cloud.',
        logoLayout: 'Logo position, size and opacity',
        logoSize: 'Size',
        logoOpacity: 'Opacity',
        logoPreviewHint: 'This is how the logo will appear on the printed invoice.',
        logoPreviewBw: 'Black & white',
        buttonSound: 'Button sounds',
        introSound: 'Intro sound',
        printSettingsBtn: 'Print settings',
      },
      transfer: { title: 'Transfer invoice of products between branches' },
    },
    fr: {
      connection: {
        noBranches: 'Aucune succursale enregistrée',
        searchBtn: 'Rechercher',
        newPasswordPlaceholder: 'Au moins 4 caractères',
        confirmPasswordPlaceholder: 'Ressaisissez le mot de passe',
      },
      customers: {
        formEmail: 'E-mail (facultatif)',
        formPhoto: 'Photo (facultatif)',
      },
      suppliers: { formEmail: 'E-mail (facultatif)' },
      invoices: {
        payModalTitle: 'Enregistrer un paiement',
        paidPreviously: 'Déjà payé :',
        filterAllTypes: 'Tous les types',
        typeSupSale: 'Factures de vente aux fournisseurs',
        prev: 'Précédent',
        next: 'Suivant',
        newInvoiceTitle: 'Ajouter une nouvelle facture',
        chooseType: 'Choisissez le type de facture :',
        typePurchaseDesc: "Achat de marchandises auprès d'un fournisseur",
        printChoiceTitle: "Choisissez le type d'impression",
        printChoiceDesc: 'Comment souhaitez-vous traiter cette facture ?',
        printTotalTitle: "Total d'impression",
        printTotalNet: 'Après remise',
        printTotalNetDesc: 'Prix unitaire tel quel + ligne de remise',
        printTotalGross: 'Avant remise',
        printTotalGrossDesc: 'Total sans aucune mention de la remise',
        savePdf: 'Enregistrer en PDF',
        sendEmail: 'Envoyer par e-mail',
        printEmployee: "Imprimer pour l'employé",
        emailTitle: 'Envoyer la facture par e-mail',
        emailHint: "L'envoi ouvre votre application de messagerie et enregistre une copie PDF — joignez le fichier PDF, puis terminez l'envoi.",
        emailTo: 'Envoyer à',
        emailSubject: 'Objet',
        emailMessage: 'Message (facultatif)',
        send: 'Envoyer',
        cartTitle: 'Panier de la facture',
        regMode: "Type d'enregistrement :",
        walkin: 'Client de passage',
        recipientName: 'Nom du destinataire',
        addressOptional: 'Adresse (facultatif)',
        firstPayment: 'Premier paiement (facultatif)',
        payHint: 'Saisissez le montant payé maintenant (le cas échéant). Le reste est enregistré comme dette du client.',
        dispatchNote: 'Note (facultatif)',
        dispatchNotePlaceholder: "Note imprimée sur la facture d'envoi…",
        confirmDispatch: "Confirmer la facture d'envoi",
      },
      sales: {
        confirm: 'Confirmer',
        transferInvoice: 'Transférer la facture',
        transferTitle: 'Transférer la facture à un client',
        transferHint: "Choisissez le client sous lequel cette facture sera enregistrée (par exemple si l'acheteur agit en son nom).",
        transferSelected: 'La facture sera enregistrée sous :',
        transferConfirm: 'Confirmer le transfert',
      },
      migration: {
        programNameLabel: "Nom de l'ancien programme (facultatif — améliore la précision de l'IA) :",
        selectBrands: 'Sélectionnez les marques que vous traitez',
        brandHint: 'Cela nous aide à mieux détecter la colonne de la marque',
        skipBrands: 'Ignorer',
        confirmBrands: 'Confirmer',
      },
      settings: {
        fiscalStampLabel: 'Timbre fiscal',
        expiryGroup: "Date d'expiration",
        expiryShow: "Afficher le champ de date d'expiration",
        expiryShowHint: "Afficher le champ lors de l'ajout/modification d'un produit",
        expiryRequired: 'Date obligatoire',
        expiryRequiredHint: "Si activé, un produit ne peut pas être enregistré sans date",
        expiryWarn: 'Alerte avant expiration',
        expiryWeek: 'Une semaine',
        expiryWeeks: 'Deux semaines',
        expiryMonth: 'Un mois',
        expiryTwoMonths: 'Deux mois',
        expiryThreeMonths: '3 mois',
        company: 'Développé par',
        licenseCard: 'Licence et activation',
        licenseDesc: "État de la clé d'activation sur cet appareil. Pour supprimer définitivement la clé et revenir à l'écran d'activation, utilisez le bouton ci-dessous.",
        licenseStatus: "État de l'activation",
        licenseStore: 'Code du magasin',
        licenseExpiry: "Date d'expiration",
        licenseAdminSecret: 'Secret administrateur (facultatif)',
        licenseAdminSecretPlaceholder: "Pour aussi déverrouiller l'appareil sur le serveur",
        licenseDeactivateBtn: "Supprimer définitivement la clé d'activation",
        aiCard: 'Intelligence artificielle (AI Agent)',
        aiDesc: 'Choisissez un fournisseur et saisissez votre clé API pour analyser et importer les données intelligemment.',
        aiProvider: 'Fournisseur AI',
        aiBaseUrl: 'URL de base',
        aiKeyNotSet: 'Aucune clé définie',
        aiTestKey: 'Tester la connexion',
        saveApiKey: 'Enregistrer la clé',
        clearApiKey: 'Effacer la clé',
        noUsers: 'Aucun utilisateur pour le moment',
        invoiceLogo: "Logo de l'entreprise (factures)",
        logoUpload: 'Téléverser le logo',
        logoPreview: 'Aperçu du logo',
        logoRemove: 'Retirer',
        logoLocalHint: 'Enregistré uniquement sur cet appareil — jamais envoyé au cloud.',
        logoLayout: 'Position, taille et opacité du logo',
        logoSize: 'Taille',
        logoOpacity: 'Opacité',
        logoPreviewHint: 'Voici comment le logo apparaîtra sur la facture imprimée.',
        logoPreviewBw: 'Noir et blanc',
        buttonSound: 'Sons des boutons',
        introSound: 'Son de début',
        printSettingsBtn: "Paramètres d'impression",
      },
      transfer: { title: 'Facture de transfert de produits entre succursales' },
    },
    zh: {
      connection: {
        noBranches: '暂无已注册分店',
        searchBtn: '搜索',
        newPasswordPlaceholder: '至少4个字符',
        confirmPasswordPlaceholder: '再次输入密码',
      },
      customers: {
        formEmail: '电子邮件（可选）',
        formPhoto: '照片（可选）',
      },
      suppliers: { formEmail: '电子邮件（可选）' },
      invoices: {
        payModalTitle: '登记付款',
        paidPreviously: '此前已付：',
        filterAllTypes: '所有类型',
        typeSupSale: '向供应商的销售发票',
        prev: '上一页',
        next: '下一页',
        newInvoiceTitle: '添加新发票',
        chooseType: '选择发票类型：',
        typePurchaseDesc: '从供应商采购商品',
        printChoiceTitle: '选择打印类型',
        printChoiceDesc: '您想如何处理这张发票？',
        printTotalTitle: '打印合计',
        printTotalNet: '折扣后',
        printTotalNetDesc: '原单价 + 折扣行',
        printTotalGross: '折扣前',
        printTotalGrossDesc: '不显示任何折扣信息的总计',
        savePdf: '保存为 PDF',
        sendEmail: '通过电子邮件发送',
        printEmployee: '打印给员工',
        emailTitle: '通过电子邮件发送发票',
        emailHint: '发送时会打开您的邮件程序并保存一份 PDF 副本——请附上 PDF 文件，然后完成发送。',
        emailTo: '发送至',
        emailSubject: '主题',
        emailMessage: '邮件内容（可选）',
        send: '发送',
        cartTitle: '发票购物车',
        regMode: '登记类型：',
        walkin: '散客',
        recipientName: '收件人姓名',
        addressOptional: '地址（可选）',
        firstPayment: '首付款（可选）',
        payHint: '输入现在支付的金额（如有）。剩余部分记为客户的欠款。',
        dispatchNote: '备注（可选）',
        dispatchNotePlaceholder: '将打印在发货发票上的备注……',
        confirmDispatch: '确认发货发票',
      },
      sales: {
        confirm: '确认',
        transferInvoice: '转移发票',
        transferTitle: '将发票转移给客户',
        transferHint: '选择这张发票记在哪个客户名下（例如买方是代其购买）。',
        transferSelected: '发票将记在：',
        transferConfirm: '确认转移',
      },
      migration: {
        programNameLabel: '旧程序名称（可选——提高 AI 识别精度）：',
        selectBrands: '选择您经营的品牌',
        brandHint: '这有助于我们更准确地识别品牌列',
        skipBrands: '跳过',
        confirmBrands: '确认',
      },
      settings: {
        fiscalStampLabel: '印花税（Timbre Fiscal）',
        expiryGroup: '有效期',
        expiryShow: '显示有效期字段',
        expiryShowHint: '添加/编辑产品时显示该字段',
        expiryRequired: '日期必填',
        expiryRequiredHint: '启用后，没有日期的产品不能保存',
        expiryWarn: '到期前提醒',
        expiryWeek: '一周',
        expiryWeeks: '两周',
        expiryMonth: '一个月',
        expiryTwoMonths: '两个月',
        expiryThreeMonths: '3个月',
        company: '开发公司',
        licenseCard: '许可与激活',
        licenseDesc: '此设备上的激活密钥状态。要永久删除密钥并返回激活界面，请使用下方按钮。',
        licenseStatus: '激活状态',
        licenseStore: '商店代码',
        licenseExpiry: '到期日期',
        licenseAdminSecret: '管理员密钥（可选）',
        licenseAdminSecretPlaceholder: '同时在服务器上解锁设备',
        licenseDeactivateBtn: '永久删除激活密钥',
        aiCard: '人工智能（AI Agent）',
        aiDesc: '选择服务商并输入您的 API 密钥，以智能分析和导入数据。',
        aiProvider: 'AI 服务商',
        aiBaseUrl: '基础 URL',
        aiKeyNotSet: '尚未设置密钥',
        aiTestKey: '测试连接',
        saveApiKey: '保存密钥',
        clearApiKey: '清除密钥',
        noUsers: '暂无用户',
        invoiceLogo: '企业标志（发票）',
        logoUpload: '上传企业标志',
        logoPreview: '预览标志',
        logoRemove: '移除',
        logoLocalHint: '仅保存在本设备，绝不上传到云端。',
        logoLayout: '标志位置、大小和透明度',
        logoSize: '大小',
        logoOpacity: '透明度',
        logoPreviewHint: '标志在打印发票上的显示效果。',
        logoPreviewBw: '黑白',
        buttonSound: '按钮音效',
        introSound: '启动音效',
        printSettingsBtn: '打印设置',
      },
      transfer: { title: '分店间产品转移发票' },
    },
  };

  function merge(dst, src) {
    for (const k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      const v = src[k];
      if (v && typeof v === 'object') {
        if (!dst[k] || typeof dst[k] !== 'object') dst[k] = {};
        merge(dst[k], v);
      } else {
        dst[k] = v;
      }
    }
  }
  for (const lang in sets) {
    if (!LANG[lang]) continue;
    merge(LANG[lang], sets[lang]);
  }
})();

// Dynamic strings used by the page scripts (alerts, tooltips, inline status
// messages). Previously they were missing from every dictionary, so their
// Arabic fallbacks leaked into EN/FR/ZH.
(function patchDynamicI18nGaps() {
  const sets = {
    ar: {
      common: {
        ok: 'تأكيد',
        noData: 'لا توجد بيانات',
        type: 'النوع',
        party: 'الطرف',
        scanning: 'جارٍ المسح...',
      },
      settings: {
        darkMode: 'الوضع الليلي',
        lightMode: 'الوضع النهاري',
        aiKeySet: 'المفتاح مضبوط',
        enterApiKey: 'الرجاء إدخال المفتاح',
        apiKeySaved: 'تم حفظ المفتاح بشكل آمن',
        confirmClearKey: 'هل أنت متأكد من مسح المفتاح؟',
        apiKeyCleared: 'تم مسح المفتاح',
        testing: 'جارٍ اختبار الاتصال...',
        testSuccess: 'الاتصال ناجح',
        testFailed: 'فشل الاتصال: ',
        licenseActive: 'مفعّل',
        licenseInactive: 'غير مفعّل',
        confirmDeactivateLicense: 'هل تريد إلغاء التفعيل وحذف مفتاح الترخيص نهائياً من هذا الجهاز؟\n\nبعد الحذف سيعود البرنامج إلى شاشة التفعيل ولن يعمل حتى إدخال مفتاح جديد.',
        deactivating: 'جارٍ إلغاء التفعيل...',
        deactivateFailed: 'فشل إلغاء التفعيل',
        logoImportFailed: 'تعذّر استيراد اللوغو',
        logoSaved: 'تم حفظ لوغو العمل',
        logoRemoveConfirm: 'إزالة لوغو العمل من الفواتير؟',
        logoRemoved: 'تمت إزالة اللوغو',
        logoNone: 'لا يوجد لوغو محمّل',
      },
      tab: { customers: 'عميل', suppliers: 'مورد' },
      backup: { noDataToBackup: 'لا توجد بيانات للنسخ الاحتياطي' },
      connection: { alreadySynced: 'البيانات محدثة في السحابة' },
      expenses: { empty: 'لا توجد مصاريف' },
      invoices: {
        notFound: 'الفاتورة غير موجودة',
        cardDiscountTitle: 'الخصم على الفاتورة',
        cardDiscountTag: 'خصم',
        paidAfterDiscount: 'بعد الخصم',
        discountOnInvoiceBanner: 'تم تطبيق خصم على هذه الفاتورة',
        invoiceDetails: 'تفاصيل الفاتورة',
        employeeDocTitle: 'سند تحضير',
        seller: 'البائع',
        transferBalance: 'الرصيد',
      },
      customers: {
        nameRequired: 'الرجاء إدخال اسم العميل',
        discountRange: 'نسبة الخصم يجب أن تكون بين 0 و 100',
        prompts: { nameRequired: 'أدخل اسم العميل', invalidDiscount: 'الخصم يجب أن يكون بين 0 و 100', invalidCreditLimit: 'سقف الدين يجب أن يكون موجباً أو صفراً (بلا حد)' },
      },
      suppliers: { prompts: { nameRequired: 'أدخل اسم المورد' } },
      sales: { unitPrice: 'السعر' },
      supplierReturns: { markReturned: 'تحديد كمُرتجع', markNotReturned: 'إلغاء تحديد المرتجع' },
    },
    en: {
      common: {
        ok: 'OK',
        noData: 'No data',
        type: 'Type',
        party: 'Party',
        scanning: 'Scanning...',
      },
      settings: {
        darkMode: 'Dark mode',
        lightMode: 'Light mode',
        aiKeySet: 'Key is set',
        enterApiKey: 'Please enter the key',
        apiKeySaved: 'Key saved securely',
        confirmClearKey: 'Are you sure you want to clear the key?',
        apiKeyCleared: 'Key cleared',
        testing: 'Testing connection...',
        testSuccess: 'Connection successful',
        testFailed: 'Connection failed: ',
        licenseActive: 'Active',
        licenseInactive: 'Inactive',
        confirmDeactivateLicense: 'Do you want to deactivate and permanently delete the license key from this device?\n\nAfter deletion the program returns to the activation screen and will not work until a new key is entered.',
        deactivating: 'Deactivating...',
        deactivateFailed: 'Deactivation failed',
        logoImportFailed: 'Could not import the logo',
        logoSaved: 'Business logo saved',
        logoRemoveConfirm: 'Remove the business logo from invoices?',
        logoRemoved: 'Logo removed',
        logoNone: 'No logo loaded',
      },
      tab: { customers: 'Customer', suppliers: 'Supplier' },
      backup: { noDataToBackup: 'No data to back up' },
      connection: { alreadySynced: 'Data is up to date in the cloud' },
      expenses: { empty: 'No expenses' },
      invoices: {
        notFound: 'Invoice not found',
        cardDiscountTitle: 'Invoice discount',
        cardDiscountTag: 'Discount',
        paidAfterDiscount: 'After discount',
        discountOnInvoiceBanner: 'A discount has been applied to this invoice',
        invoiceDetails: 'Invoice details',
        employeeDocTitle: 'Preparation slip',
        seller: 'Seller',
        transferBalance: 'Balance',
      },
      customers: {
        nameRequired: 'Please enter the customer name',
        discountRange: 'The discount must be between 0 and 100',
        prompts: { nameRequired: 'Enter the customer name', invalidDiscount: 'The discount must be between 0 and 100', invalidCreditLimit: 'The credit limit must be positive or zero (unlimited)' },
      },
      suppliers: { prompts: { nameRequired: 'Enter the supplier name' } },
      sales: { unitPrice: 'Price' },
      supplierReturns: { markReturned: 'Mark as returned', markNotReturned: 'Mark as not returned' },
    },
    fr: {
      common: {
        ok: 'OK',
        noData: 'Aucune donnée',
        type: 'Type',
        party: 'Tiers',
        scanning: 'Scan en cours...',
      },
      settings: {
        darkMode: 'Mode sombre',
        lightMode: 'Mode clair',
        aiKeySet: 'Clé définie',
        enterApiKey: 'Veuillez saisir la clé',
        apiKeySaved: 'Clé enregistrée en toute sécurité',
        confirmClearKey: 'Voulez-vous vraiment effacer la clé ?',
        apiKeyCleared: 'Clé effacée',
        testing: 'Test de connexion...',
        testSuccess: 'Connexion réussie',
        testFailed: 'Échec de la connexion : ',
        licenseActive: 'Actif',
        licenseInactive: 'Inactif',
        confirmDeactivateLicense: "Voulez-vous désactiver et supprimer définitivement la clé de licence de cet appareil ?\n\nAprès la suppression, le programme revient à l'écran d'activation et ne fonctionnera pas avant la saisie d'une nouvelle clé.",
        deactivating: 'Désactivation...',
        deactivateFailed: 'Échec de la désactivation',
        logoImportFailed: "Impossible d'importer le logo",
        logoSaved: "Logo de l'entreprise enregistré",
        logoRemoveConfirm: "Retirer le logo de l'entreprise des factures ?",
        logoRemoved: 'Logo retiré',
        logoNone: 'Aucun logo chargé',
      },
      tab: { customers: 'Client', suppliers: 'Fournisseur' },
      backup: { noDataToBackup: 'Aucune donnée à sauvegarder' },
      connection: { alreadySynced: 'Les données sont à jour dans le cloud' },
      expenses: { empty: 'Aucune dépense' },
      invoices: {
        notFound: 'Facture introuvable',
        cardDiscountTitle: 'Remise sur la facture',
        cardDiscountTag: 'Remise',
        paidAfterDiscount: 'Après remise',
        discountOnInvoiceBanner: 'Une remise a été appliquée à cette facture',
        invoiceDetails: 'Détails de la facture',
        employeeDocTitle: 'Bon de préparation',
        seller: 'Vendeur',
        transferBalance: 'Solde',
      },
      customers: {
        nameRequired: 'Veuillez saisir le nom du client',
        discountRange: 'La remise doit être comprise entre 0 et 100',
        prompts: { nameRequired: 'Saisissez le nom du client', invalidDiscount: 'La remise doit être comprise entre 0 et 100', invalidCreditLimit: 'Le plafond de crédit doit être positif ou nul (aucune limite)' },
      },
      suppliers: { prompts: { nameRequired: 'Saisissez le nom du fournisseur' } },
      sales: { unitPrice: 'Prix' },
      supplierReturns: { markReturned: 'Marquer comme retourné', markNotReturned: 'Marquer comme non retourné' },
    },
    zh: {
      common: {
        ok: '确定',
        noData: '暂无数据',
        type: '类型',
        party: '往来方',
        scanning: '正在扫描...',
      },
      settings: {
        darkMode: '夜间模式',
        lightMode: '日间模式',
        aiKeySet: '密钥已设置',
        enterApiKey: '请输入密钥',
        apiKeySaved: '密钥已安全保存',
        confirmClearKey: '确定要清除密钥吗？',
        apiKeyCleared: '密钥已清除',
        testing: '正在测试连接……',
        testSuccess: '连接成功',
        testFailed: '连接失败：',
        licenseActive: '已激活',
        licenseInactive: '未激活',
        confirmDeactivateLicense: '要取消激活并从本设备永久删除许可证密钥吗？\n\n删除后程序将返回激活界面，未输入新密钥前无法使用。',
        deactivating: '正在取消激活……',
        deactivateFailed: '取消激活失败',
        logoImportFailed: '无法导入标志',
        logoSaved: '企业标志已保存',
        logoRemoveConfirm: '要从发票中移除企业标志吗？',
        logoRemoved: '标志已移除',
        logoNone: '未加载标志',
      },
      tab: { customers: '客户', suppliers: '供应商' },
      backup: { noDataToBackup: '没有可备份的数据' },
      connection: { alreadySynced: '云端数据已是最新' },
      expenses: { empty: '暂无费用' },
      invoices: {
        notFound: '未找到发票',
        cardDiscountTitle: '发票折扣',
        cardDiscountTag: '折扣',
        paidAfterDiscount: '折扣后',
        discountOnInvoiceBanner: '此发票已应用折扣',
        invoiceDetails: '发票详情',
        employeeDocTitle: '备货单',
        seller: '卖家',
        transferBalance: '余额',
        invCardMoreItems: '更多商品',
        invCardDiscount: '折扣',
        invCardProduct: '产品',
        invCardQty: '数量',
        invCardPrice: '价格',
        invCardTotal: '合计',
      },
      customers: {
        nameRequired: '请输入客户姓名',
        discountRange: '折扣必须在 0 到 100 之间',
        prompts: { nameRequired: '请输入客户姓名', invalidDiscount: '折扣必须在 0 到 100 之间', invalidCreditLimit: '信用限额必须为正数或零（无限制）' },
      },
      suppliers: { prompts: { nameRequired: '请输入供应商名称' } },
      sales: { unitPrice: '价格' },
      supplierReturns: { markReturned: '标记为已退货', markNotReturned: '标记为未退货' },
    },
  };

  function merge(dst, src) {
    for (const k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      const v = src[k];
      if (v && typeof v === 'object') {
        if (!dst[k] || typeof dst[k] !== 'object') dst[k] = {};
        merge(dst[k], v);
      } else {
        dst[k] = v;
      }
    }
  }
  for (const lang in sets) {
    if (!LANG[lang]) continue;
    merge(LANG[lang], sets[lang]);
  }
})();

const LANG_LABELS = { ar: 'AR', en: 'EN', fr: 'FR', zh: '中文' };
// The chosen language survives logout and app restarts. Older builds never
// persisted it, so a missing/invalid value falls back to Arabic.
const LANG_STORAGE_KEY = 'zmt_lang';
function readSavedLanguage() {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved && LANG_ORDER.indexOf(saved) !== -1) return saved;
  } catch (e) {}
  return 'ar';
}
let __lang = readSavedLanguage();
window.__lang = __lang;

// Arabic is the only RTL language shipped today; every other language uses
// the LTR reading order (tables, arrow-key navigation, sliding panels...).
function isRTL(lang) {
  const code = (typeof lang === 'string' && lang) ? lang : __lang;
  return code === 'ar';
}
window.isRTL = isRTL;

function t(key) {
  const parts = key.split('.');
  function dig(obj) {
    let v = obj;
    for (const p of parts) {
      if (v && typeof v === 'object') v = v[p];
      else return undefined;
    }
    return v;
  }
  const cur = LANG[__lang] || LANG.ar;
  let val = dig(cur);
  if (val === undefined || val === '') val = dig(LANG.ar);
  return val || '';
}
window.t = t;

/// Convert any Arabic-Indic/Persian digits to regular 0-9 (always).
/// e.g. ١٢٣٤ -> 1234, ۱۲۳۴ -> 1234. Applied globally so every machine,
/// whatever its locale, shows and stores the same Western digits.
window.toLatinDigits = function (v) {
  if (v == null) return v;
  return String(v).replace(/[\u0660-\u0669\u06F0-\u06F9]/g, function (d) {
    const c = d.charCodeAt(0);
    return String(c >= 0x06F0 ? c - 0x06F0 : c - 0x0660);
  });
};

window.fmtMoney = function (n) {
  const v = (Number(String(n).replace(/[\u0660-\u0669\u06F0-\u06F9]/g, function (d) {
    const c = d.charCodeAt(0);
    return String(c >= 0x06F0 ? c - 0x06F0 : c - 0x0660);
  })) || 0).toFixed(2);
  return window.toLatinDigits(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// Digit guard for every field in the app: a scan/phone/typed Arabic-Indic
// digit becomes a regular 0-9 immediately, so stored values stay consistent.
// Numeric-only fields (class .num-input) also drop any non-numeric character.
document.addEventListener('input', function (e) {
  const el = e.target;
  if (!el || typeof el.value !== 'string') return;
  const tag = (el.tagName || '').toUpperCase();
  if (tag !== 'INPUT' && tag !== 'TEXTAREA') return;
  let fixed = window.toLatinDigits(el.value);
  if (el.classList && el.classList.contains('num-input')) {
    const im = String(el.getAttribute('inputmode') || '').toLowerCase();
    if (im === 'numeric') {
      fixed = fixed.replace(/[^0-9]/g, '');
    } else if (im === 'decimal') {
      fixed = fixed.replace(/[^0-9.]/g, '');
      const dot = fixed.indexOf('.');
      if (dot !== -1) fixed = fixed.slice(0, dot + 1) + fixed.slice(dot + 1).replace(/\./g, '');
    }
  }
  if (fixed !== el.value) el.value = fixed;
}, true);

// App-wide digit display guard: convert any remaining <input type="number">
// to text+inputmode so the browser can never localize how their digits are
// drawn (device locale would otherwise show Arabic-Indic/Persian numerals).
// Runs on every page load; dynamically injected numeric inputs are expected
// to carry the .num-input class already.
window.__zmtDigitizeInputs = function (root) {
  const inputs = (root || document).querySelectorAll('input[type="number"]');
  for (let i = 0; i < inputs.length; i++) {
    const el = inputs[i];
    const step = el.getAttribute('step');
    const im = (step && /^[1-9]\d*$/.test(step)) ? 'numeric' : 'decimal';
    el.setAttribute('inputmode', im);
    el.setAttribute('type', 'text');
    el.classList.add('num-input');
  }
};

function applyTranslation(root) {
  const scope = root || document;
  const dir = isRTL() ? 'rtl' : 'ltr';
  document.documentElement.dir = dir;
  document.documentElement.lang = __lang;
  scope.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const translated = t(key);
    if (translated) el.innerHTML = translated;
  });
  scope.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    const translated = t(key);
    if (translated) el.placeholder = translated;
  });
  // Hover tooltips, accessible names and button values also need translating;
  // without this they stay Arabic in every other language.
  scope.querySelectorAll('[data-i18n-title]').forEach(el => {
    const translated = t(el.dataset.i18nTitle);
    if (translated) el.title = translated;
  });
  scope.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
    const translated = t(el.dataset.i18nAriaLabel);
    if (translated) el.setAttribute('aria-label', translated);
  });
  scope.querySelectorAll('[data-i18n-value]').forEach(el => {
    const translated = t(el.dataset.i18nValue);
    if (translated) el.value = translated;
  });
  const label = document.getElementById('langLabel');
  if (label) label.textContent = LANG_LABELS[__lang] || 'AR';
  const titleEl = document.getElementById('appTitleText');
  if (titleEl) titleEl.textContent = t('appTitle');
  document.title = t('appTitle');
  // Keep the display-settings + thermal-printer button/panel labels in sync.
  try { if (window.DisplaySettings) window.DisplaySettings.refreshLabels(); } catch (e) {}
  try { if (window.FormLayout) window.FormLayout.refreshLabels(); } catch (e) {}
  try { if (window.ThermalPrint) window.ThermalPrint.refreshLabels(); } catch (e) {}
}

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.classList.add('transitioning');
  if (isDark) {
    html.removeAttribute('data-theme');
    localStorage.setItem('zmt_theme', 'light');
    document.getElementById('btnTheme').innerHTML = '<i class="fas fa-moon"></i>';
    document.getElementById('btnTheme').title = t('settings.darkMode') || 'الوضع الليلي';
  } else {
    html.setAttribute('data-theme', 'dark');
    localStorage.setItem('zmt_theme', 'dark');
    document.getElementById('btnTheme').innerHTML = '<i class="fas fa-sun"></i>';
    document.getElementById('btnTheme').title = t('settings.lightMode') || 'الوضع النهاري';
  }
  setTimeout(() => html.classList.remove('transitioning'), 300);
}

// Pharmacy mode: swaps the accent to the medical green/white/red skin without
// disturbing the dark/light choice (the two compose). Global so any page can call it.
window.setPharmacyMode = function setPharmacyMode(on) {
  const html = document.documentElement;
  html.classList.add('transitioning');
  if (on) html.setAttribute('data-pharmacy', '1');
  else html.removeAttribute('data-pharmacy');
  window.dispatchEvent(new CustomEvent('zmt:pharmacy-toggle', { detail: { enabled: !!on } }));
  setTimeout(() => html.classList.remove('transitioning'), 300);
};

// Expose the flag to every page (falls back to reading localStorage directly).
window.getPharmacyMode = function getPharmacyMode() {
  return localStorage.getItem('zmt_pharmacy_mode') === '1';
};

// Single entry point for changing the language (language button, settings
// selector, programmatic calls). Keeps the flag, storage, dir, labels, dialogs
// and open pages in sync.
function setLanguage(code) {
  const next = LANG_ORDER.indexOf(code) !== -1 ? code : 'ar';
  const changed = next !== __lang;
  __lang = next;
  window.__lang = __lang;
  try { localStorage.setItem(LANG_STORAGE_KEY, __lang); } catch (e) {}

  // One global pass covers the chrome AND #pageContainer. The old second pass
  // translated the whole open page twice on every language change.
  applyTranslation();
  applyConnectionText();

  // Keep the settings selector on the real current language.
  const langSelect = document.getElementById('settingsLang');
  if (langSelect) langSelect.value = __lang;

  // Re-render chart if on dashboard
  if (typeof renderChart === 'function') {
    const sel = document.getElementById('monthSelect');
    if (sel) renderChart(parseInt(sel.value));
  }

  // Pages with JS-rendered content (tables, modals, empty states) subscribe to
  // this instead of re-running their whole init (which would duplicate
  // listeners and clear live form data).
  if (changed) {
    try {
      window.dispatchEvent(new CustomEvent('zmt:language', {
        detail: { lang: __lang, rtl: isRTL() }
      }));
    } catch (e) {}
  }
  return __lang;
}
window.setLanguage = setLanguage;

function switchLanguage() {
  const idx = LANG_ORDER.indexOf(__lang);
  setLanguage(LANG_ORDER[(idx + 1) % LANG_ORDER.length]);
}

// ===== CONNECTION STATUS =====
function applyConnectionText() {
  const dot = document.getElementById('connDot');
  const text = document.getElementById('connText');
  if (!dot || !text) return;
  const online = navigator.onLine;
  const t = LANG[__lang] || LANG.ar;
  dot.className = 'conn-dot' + (online ? '' : ' offline');
  text.textContent = online ? t.online : t.offline;
}

function setupConnectionStatus() {
  applyConnectionText();
  window.addEventListener('online', applyConnectionText);
  window.addEventListener('offline', applyConnectionText);
}

// ===== PAGER CLASS =====
/**
 * Smart pagination component.
 * Usage: new Pager({ data, container, render, pageSize?, infoEl?, controlsEl? })
 */
class Pager {
  constructor(opts) {
    this._data = opts.data || [];
    this._container = opts.container;
    this._render = opts.render;
    this._pageSize = opts.pageSize || 20;
    this._infoEl = opts.infoEl || null;
    this._controlsEl = opts.controlsEl || null;
    this._page = 1;
    this._totalPages = Math.max(1, Math.ceil(this._data.length / this._pageSize));
    this._onchange = opts.onchange || null;
    this._bar = null;
    this._keyHandler = null;
    this._buildDOM();
    this.goTo(1);
  }

  _buildDOM() {
    this._bar = document.createElement('div');
    this._bar.className = 'pagination-bar';
    this._bar.style.display = 'none';

    // Info
    this._info = document.createElement('div');
    this._info.className = 'pagination-info';
    this._bar.appendChild(this._info);

    // Controls wrapper
    const ctrlWrap = document.createElement('div');
    ctrlWrap.className = 'pagination-controls';
    this._bar.appendChild(ctrlWrap);

    // Page size
    const sizeSel = document.createElement('select');
    sizeSel.className = 'pagination-size-select';
    [10, 20, 50, 100].forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      if (v === this._pageSize) opt.selected = true;
      sizeSel.appendChild(opt);
    });
    sizeSel.addEventListener('change', () => {
      this._pageSize = parseInt(sizeSel.value);
      this._totalPages = Math.max(1, Math.ceil(this._data.length / this._pageSize));
      this.goTo(1);
    });
    ctrlWrap.appendChild(sizeSel);

    // Prev button
    this._prevBtn = this._makeBtn('‹', () => this.goTo(this._page - 1));
    ctrlWrap.appendChild(this._prevBtn);

    // Numbered buttons container
    this._numContainer = document.createElement('div');
    this._numContainer.className = 'pagination-controls';
    ctrlWrap.appendChild(this._numContainer);

    // Next button
    this._nextBtn = this._makeBtn('›', () => this.goTo(this._page + 1));
    ctrlWrap.appendChild(this._nextBtn);

    // Insert after container
    if (this._controlsEl) {
      this._controlsEl.appendChild(this._bar);
    } else if (this._container && this._container.parentNode) {
      this._container.parentNode.insertBefore(this._bar, this._container.nextSibling);
    }
  }

  _makeBtn(label, onClick) {
    const btn = document.createElement('button');
    btn.className = 'pagination-btn';
    btn.innerHTML = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  goTo(page) {
    this._page = Math.max(1, Math.min(page, this._totalPages));
    const start = (this._page - 1) * this._pageSize;
    const end = Math.min(start + this._pageSize, this._data.length);
    const slice = this._data.slice(start, end);

    // Animate container
    if (this._container) {
      this._container.classList.remove('pagination-page-animate');
      void this._container.offsetWidth;
      this._container.classList.add('pagination-page-animate');
    }

    this._render(slice, {
      page: this._page,
      totalPages: this._totalPages,
      start: this._data.length > 0 ? start + 1 : 0,
      end,
      total: this._data.length,
      pageSize: this._pageSize,
    });

    this._updateControls();
    if (this._onchange) this._onchange(this._page);
  }

  _updateControls() {
    const total = this._data.length;
    if (total === 0 || this._totalPages <= 1) {
      this._bar.style.display = 'none';
      return;
    }
    this._bar.style.display = 'flex';
    this._info.textContent = `${this._page > 1 ? ((this._page - 1) * this._pageSize + 1) : 1}–${Math.min(this._page * this._pageSize, total)} من ${total}`;

    this._prevBtn.disabled = this._page <= 1;
    this._nextBtn.disabled = this._page >= this._totalPages;

    // Build number buttons
    this._numContainer.innerHTML = '';
    const tp = this._totalPages;
    const cp = this._page;
    const pages = [];

    if (tp <= 7) {
      for (let i = 1; i <= tp; i++) pages.push(i);
    } else {
      pages.push(1);
      if (cp > 3) pages.push('...');
      const startP = Math.max(2, cp - 1);
      const endP = Math.min(tp - 1, cp + 1);
      for (let i = startP; i <= endP; i++) pages.push(i);
      if (cp < tp - 2) pages.push('...');
      pages.push(tp);
    }

    pages.forEach(p => {
      if (p === '...') {
        const el = document.createElement('span');
        el.className = 'pagination-btn ellipsis';
        el.textContent = '…';
        this._numContainer.appendChild(el);
      } else {
        const btn = this._makeBtn(p, () => this.goTo(p));
        if (p === cp) btn.classList.add('active');
        this._numContainer.appendChild(btn);
      }
    });
  }

  /** Update data array (e.g., after search/filter) and reset to page 1 */
  updateData(newData) {
    this._data = newData;
    this._totalPages = Math.max(1, Math.ceil(this._data.length / this._pageSize));
    this.goTo(1);
  }

  /**
   * Update data but STAY on the current page (clamped to the new page count).
   * Used by LAN sync refreshes so a live update never bounces the user back
   * to page 1 while they are reading page 4 of a long list.
   */
  updateDataKeepPage(newData) {
    this._data = newData || [];
    this._totalPages = Math.max(1, Math.ceil(this._data.length / this._pageSize));
    this.goTo(this._page);
    return this._page;
  }

  /** Clean up DOM */
  destroy() {
    if (this._bar && this._bar.parentNode) this._bar.parentNode.removeChild(this._bar);
  }
}

/**
 * Infinite scroll pager — appends items in batches as user scrolls, and WINDOWS
 * the rendered DOM: leading rows are dropped once the live node count exceeds
 * maxNodes, so a genuinely huge list (100k+ rows) never grows >~400 DOM nodes.
 * Scrolling back to the top re-renders the trimmed head. No library; plain DOM.
 */
class InfiniteScrollPager {
  constructor(opts) {
    this._data = opts.data || [];
    this._container = opts.container;
    this._renderItem = opts.renderItem;
    this._renderEmpty = opts.renderEmpty || null;
    this._pageSize = opts.pageSize || 50;
    this._scrollContainer = opts.scrollContainer || window;
    this._onchange = opts.onchange || null;
    this._maxNodes = opts.maxNodes || 400; // soft ceiling on live DOM nodes
    this._start = 0;    // first index currently rendered
    this._loaded = 0;   // next index to render at the tail
    this._loading = false;
    this._destroyed = false;
    this._boundScroll = this._onScroll.bind(this);
    this._scrollContainer.addEventListener('scroll', this._boundScroll, { passive: true });
    this._loadMore();
  }

  _onScroll() {
    if (this._destroyed || this._loading) return;
    // user scrolled back into the trimmed head -> re-render as needed
    if (this._start > 0) {
      const scrollEl = this._scrollContainer;
      const pos = scrollEl === window ? window.scrollY : scrollEl.scrollTop;
      if (pos <= 120) { this._prepend(); return; }
    }
    if (this._loaded >= this._data.length) return;
    const scrollEl = this._scrollContainer;
    const threshold = (scrollEl === window ? window.innerHeight : scrollEl.clientHeight) + 500;
    const scrollPos = scrollEl === window ? window.scrollY : scrollEl.scrollTop;
    const scrollHeight = scrollEl === window ? document.documentElement.scrollHeight : scrollEl.scrollHeight;
    if (scrollPos + threshold >= scrollHeight) {
      this._loadMore();
    }
  }

  _loadMore() {
    if (this._loading || this._destroyed) return;
    // Empty state: only when there is genuinely no data (never alongside cards)
    if (this._loaded === 0 && this._data.length === 0) {
      if (this._renderEmpty) {
        const emptyHtml = this._renderEmpty();
        if (emptyHtml) this._container.innerHTML = emptyHtml;
      }
      this._loading = false;
      if (this._onchange) this._onchange(0, 0);
      return;
    }
    if (this._loaded >= this._data.length) return;
    this._loading = true;
    const start = this._loaded;
    const end = Math.min(start + this._pageSize, this._data.length);
    let html = '';
    for (let i = start; i < end; i++) html += this._renderItem(this._data[i], i);
    if (html) this._container.insertAdjacentHTML('beforeend', html);
    this._loaded = end;
    this._loading = false;
    this._trimHead();
    if (this._onchange) this._onchange(this._loaded, this._data.length);
  }

  // virtual-list windowing: drop leading rows above maxNodes/over the soft
  // ceiling while adjusting scroll position so the viewport doesn't jump.
  _trimHead() {
    if (this._maxNodes <= 0) return;
    const scrollEl = this._scrollContainer;
    while (this._container.childElementCount > this._maxNodes) {
      const first = this._container.firstElementChild;
      if (!first) break;
      const h = first.getBoundingClientRect().height + 8;
      first.parentNode.removeChild(first);
      this._start++;
      if (scrollEl === window) {
        window.scrollBy(0, -h);
      } else if (scrollEl) {
        scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop - h);
      }
    }
  }

  // Re-render rows dropped by windowing so scrolling back up stays seamless.
  _prepend() {
    if (this._start <= 0) return;
    this._loading = true;
    const from = Math.max(0, this._start - this._pageSize);
    let html = '';
    for (let i = from; i < this._start; i++) html += this._renderItem(this._data[i], i);
    if (html) {
      const scrollEl = this._scrollContainer;
      const first = this._container.firstChild;
      const prevTop = first ? first.getBoundingClientRect().top : 0;
      this._container.insertAdjacentHTML('afterbegin', html);
      if (first) {
        const delta = Math.max(0, first.getBoundingClientRect().top - prevTop);
        if (scrollEl === window) window.scrollBy(0, delta);
        else if (scrollEl) scrollEl.scrollTop += delta;
      }
    }
    this._start = from;
    this._loading = false;
  }

  /** Replace data and reset (e.g., after search) */
  updateData(newData) {
    this._data = newData;
    this._start = 0;
    this._loaded = 0;
    this._container.innerHTML = '';
    this._scrollContainer.addEventListener('scroll', this._boundScroll, { passive: true });
    this._loading = false;
    this._loadMore();
  }

  /**
   * Replace data while visually preserving scroll position. The currently
   * visible row at the top of the scroll port is captured by its `data-id`
   * attribute, the list is reloaded, and the scroll is anchored back to that
   * row (or the nearest available equivalent). Page 1 is always reloaded first
   * so the user never sees a flash; rows beyond that are loaded on-demand up to
   * the anchor index (bounded by the 400-node virtual window cap).
   */
  updateDataKeepScroll(newData) {
    const anchor = this._captureAnchor();
    this._data = newData || [];
    this._start = 0;
    this._loaded = 0;
    this._container.innerHTML = '';
    this._scrollContainer.addEventListener('scroll', this._boundScroll, { passive: true });
    this._loading = false;
    this._loadMore();
    if (anchor) {
      this._restoreAnchor(anchor);
    }
  }

  // ===== SCROLL ANCHOR HELPERS =====

  /** Return the id/index of the first fully visible row in the scroll port */
  _captureAnchor() {
    if (!this._container || !this._container.childElementCount) return null;
    const sc = this._scrollContainer;
    let bestEl = null;
    let bestIdx = -1;
    // Element scrollers: pick the first child whose top edge is inside the visible
    // scroll port.  Window scrollers: the first child whose top edge is near or
    // below the viewport top (scrolled into view) is the anchor.
    const children = Array.from(this._container.children);
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const r = child.getBoundingClientRect();
      if (sc && sc !== window) {
        const scR = sc.getBoundingClientRect();
        // child is inside (or crossing) the visible port
        if (r.bottom >= scR.top && r.top <= scR.bottom) {
          bestEl = child; bestIdx = i; break;
        }
      } else {
        // window scroller: child is inside the viewport
        if (r.bottom >= 0 && r.top <= window.innerHeight) {
          bestEl = child; bestIdx = i; break;
        }
      }
    }
    if (!bestEl) return null;
    const id = bestEl.getAttribute('data-id');
    const globalIdx = this._start + bestIdx; // index in _data[]
    return { id, globalIdx };
  }

  /**
   * Scroll the container so that the element matching `anchor` is displayed
   * at roughly the same viewport position it occupied before the re-render.
   */
  _restoreAnchor(anchor) {
    if (!this._container) return;
    // Find element by data-id, falling back to index if id missing/not found
    let target = null;
    let guard = 0;
    const maxLoad = 80; // ~2000 extra rows max to avoid expensive loops on huge lists
    const safeEscape = (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') ? CSS.escape : (s => String(s).replace(/["\\]/g, '\\$&'));
    function findById(id) { return this._container.querySelector('[data-id="' + safeEscape(id) + '"]'); }
    const findByIdBound = findById.bind(this);
    if (anchor.id && this._loaded > anchor.globalIdx) {
      target = findByIdBound(anchor.id);
    }
    // If not yet rendered (beyond loaded window), load forward in batches
    if (!target && anchor.globalIdx >= this._loaded) {
      while (this._loaded <= anchor.globalIdx && this._loaded < this._data.length && guard++ < maxLoad) {
        this._loadMore();
      }
      if (anchor.id) {
        target = findByIdBound(anchor.id);
      }
    }
    // Fallback to index-based position
    if (!target) {
      const offset = anchor.globalIdx - this._start;
      if (offset >= 0 && offset < this._container.children.length) {
        target = this._container.children[offset];
      }
    }
    if (!target) return; // couldn't recover — browser keeps natural scrollTop
    const sc = this._scrollContainer;
    const targetR = target.getBoundingClientRect();
    if (sc && sc !== window) {
      const scR = sc.getBoundingClientRect();
      sc.scrollTop += targetR.top - scR.top;
    } else {
      window.scrollTo(window.scrollX, window.scrollY + targetR.top);
    }
  }

  destroy() {
    this._destroyed = true;
    this._scrollContainer.removeEventListener('scroll', this._boundScroll);
    this._data = [];
    this._container = null;
  }
}

// ===== PAGE LISTENER REGISTRY =====
window._pageListeners = [];

// Re-run current page init safely (used after LAN sync receives remote changes)
window.refreshCurrentPageApp = function(pageId) {
  if (!pageId) return;
  if (typeof _currentPageId === 'string' && _currentPageId !== pageId) return;
  if (typeof executePageScript === 'function') {
    executePageScript(pageId);
  } else {
    const script = document.createElement('script');
    script.src = 'js/pages/' + pageId + '.js';
    script.onload = () => {
      const fn = window['init_' + pageId.replace(/-/g, '_')];
      if (typeof fn === 'function') { try { fn(); } catch (e) {} }
    };
    document.body.appendChild(script);
  }
};

/**
 * Non-destructive refresh helper used by LAN sync handlers.  Captures the
 * current search-input values + cursor positions, the active element, and the
 * window scroll position BEFORE a re-render, executes `opts.render()`, then
 * restores all captured state.  Pages that use a Pager/InfiniteScrollPager
 * should call updateDataKeepPage/updateDataKeepScroll inside their render
 * function — this helper handles the toolbar/input/window layer on top.
 *
 * @param {Object} opts
 * @param {string[]} opts.search   – IDs of search inputs whose value/cursor to preserve
 * @param {Function}  opts.render  – synchronous re-render callback
 * @param {boolean}   [opts.restoreWindowScroll=true]
 */
window.syncPreserveRefresh = function syncPreserveRefresh(opts) {
  if (!opts || typeof opts.render !== 'function') return;
  const searchInputs = (opts.search || []).map(id => {
    const el = document.getElementById(id);
    if (!el) return null;
    return { el, val: el.value, start: el.selectionStart, end: el.selectionEnd };
  }).filter(Boolean);
  const active = (document.activeElement && document.activeElement !== document.body) ? document.activeElement : null;
  const winX = window.scrollX, winY = window.scrollY;

  try { opts.render(); } catch (e) { console.error('[syncPreserveRefresh] render error:', e); }

  // Restore search inputs (values + cursor position)
  for (const s of searchInputs) {
    if (!s.el.isConnected) continue;
    s.el.value = s.val;
    if (s.el.setSelectionRange && s.start != null) {
      try { s.el.setSelectionRange(s.start, s.end != null ? s.end : s.start); } catch (e) {}
    }
  }
  if (opts.restoreWindowScroll !== false) {
    if (window.scrollX !== winX || window.scrollY !== winY) window.scrollTo(winX, winY);
  }
  // Restore focus (the toolbar/search inputs usually survive since they are
  // outside the list node; this is a safety net for elements inside modals
  // or unusual layouts).
  if (active && active.isConnected) {
    try { active.focus({ preventScroll: true }); } catch (e) {}
  }
};

// ===== INIT =====
function userLogout() {
  if (!confirm('هل تريد تسجيل الخروج؟')) return;
  Auth.signOut();
  if (typeof CloudService !== 'undefined') CloudService.stopAutoSync();
  showLogin();
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[App] DOM ready');
  const _appStartTime = Date.now();
  window.__lang = __lang;
  window.switchLanguage = switchLanguage;
  window.toggleTheme = toggleTheme;
  setupConnectionStatus();
  applyTranslation();
  // Only the main window subscribes to scanner/phone-sale bridges: the
  // standalone quick-entry window must not double-handle scanned barcodes or
  // forwarded phone sales while the operator works in the other window.
  if (!window.__standaloneQuickEntry) {
    setupPhoneScannerBridge();
    setupPhoneSaleBridge();
  }
  document.getElementById('btnLang')?.addEventListener('click', switchLanguage);

  // Restore theme
  const savedTheme = localStorage.getItem('zmt_theme');
  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    const btn = document.getElementById('btnTheme');
    if (btn) { btn.innerHTML = '<i class="fas fa-sun"></i>'; btn.title = 'الوضع النهاري'; }
  }
  document.getElementById('btnTheme')?.addEventListener('click', toggleTheme);

  // Restore pharmacy mode (green/white/red skin) — composes with dark/light
  if (localStorage.getItem('zmt_pharmacy_mode') === '1') {
    document.documentElement.setAttribute('data-pharmacy', '1');
  }
  window.refreshFamilySuggestions();

  // ===== PROFESSIONAL SUPPORT (dropdown) =====
  setupSupportButton();

  // ===== LICENSE CHECK =====
  const licenseOk = await checkAndEnforceLicense();
  if (!licenseOk) {
    if (_licenseState.noLicense || _licenseState.machineMismatch || _licenseState.invalidLegacy) {
      // No license (or a leftover license bound to another machine) on this
      // machine yet: close the splash and let the store log in or register.
      // licenseGateAfterLogin() then routes to the activation overlay
      // (pre-filled with code + password).
      if (window.electronAPI?.splashClose) {
        window.electronAPI.splashClose();
      }
      await ensureLoginHtml();
      if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
        showLicenseOverlay(_licenseState.machineMismatch
          ? 'هذا المفتاح مربوط بجهاز آخر'
          : _licenseState.invalidLegacy
            ? 'المفتاح القديم ملغي — استخدم المفتاح الجديد من الموزّع'
            : undefined);
      } else {
        initLoginView();
      }
    }
    console.log('[License] Not activated or expired — app will boot after activation');
    return;
  }

  await bootApp();

  // Close splash screen — app is ready (but let animation play at least ~3.5s)
  const MIN_SPLASH_MS = 3500;
  const elapsed = Date.now() - _appStartTime;
  const wait = Math.max(0, MIN_SPLASH_MS - elapsed);
  if (wait > 0) {
    await new Promise(r => setTimeout(r, wait));
  }
  if (window.electronAPI?.splashClose) {
    window.electronAPI.splashClose();
  }

  // ===== PERIODIC LICENSE CHECK =====
  setInterval(async () => {
    const tamper = await window.electronAPI.licenseTimeTamper();
    if (tamper.tampered) {
      showFreezeOverlay(tamper.message);
      return;
    }
    const lic = await window.electronAPI.licenseCheck();
    if (lic && lic.status === 'expired') {
      _licenseState.expired = true;
      _licenseState.valid = false;
      showFreezeOverlay('انتهت مدة التفعيل — أدخل مفتاح جديد للاستمرار');
    }
  }, 5 * 60 * 1000);

});

// ===== ENSURE LOGIN HTML =====
// The login overlay's inner HTML (login.html fragment) is only injected in the
// no_license/machine_mismatch/invalid_legacy branch at boot. When the freeze
// overlay is shown (tampered/expired) and the user clicks "حساب مختلف",
// doLicenseSwitchAccount() calls initLoginView() but the fragment is missing,
// so resetLoginForm() finds no elements and the screen stays blank.
// This helper fetches and injects the fragment if it is not already loaded,
// making the login flow work from any entry path.
let _loginHtmlLoading = null;
async function ensureLoginHtml() {
  const overlay = document.getElementById('loginOverlay');
  if (!overlay) return;
  if (overlay.querySelector('#loginStep1')) return; // already loaded
  if (_loginHtmlLoading) return _loginHtmlLoading;
  _loginHtmlLoading = (async () => {
    try {
      const res = await fetch('pages/login.html');
      if (res.ok) overlay.innerHTML = await res.text();
    } catch (e) { console.warn('[Auth] Failed to load login.html:', e); }
    _loginHtmlLoading = null;
  })();
  return _loginHtmlLoading;
}

// ===== SIDEBAR ACTIVE-COMPANY BANNER =====
// Fills the sidebar banner with the current company's name. Prefers the company
// the session is inside (Auth.getCompanyName), then the deterministic default
// company, then the shared local company/store name. Called at boot and whenever
// the user enters/leaves a company (settings page) so the banner is always in
// step. Hides itself when there is genuinely no company name to show.
function renderSidebarCompany() {
  const wrap = document.getElementById('sidebarCompany');
  const nameEl = document.getElementById('sidebarCompanyName');
  if (!wrap || !nameEl) return;
  let name = '';
  try {
    if (typeof Auth !== 'undefined' && typeof Auth.getCompanyName === 'function') {
      name = Auth.getCompanyName() || '';
    }
  } catch (e) {}
  if (!name) {
    try {
      const def = (typeof DB !== 'undefined' && typeof DB.getDefaultCompany === 'function')
        ? DB.getDefaultCompany() : null;
      name = (def && def.name) || '';
    } catch (e) {}
  }
  if (!name) {
    try { name = localStorage.getItem('zmt_company_name') || localStorage.getItem('zmt_store_name') || ''; } catch (e) {}
  }
  name = String(name || '').trim();
  if (!name) { wrap.style.display = 'none'; return; }
  nameEl.textContent = name;
  wrap.title = name;
  wrap.style.display = '';
}
window.renderSidebarCompany = renderSidebarCompany;

// ===== BOOT =====
// Loads data + shows login or dashboard. Runs once at startup (after the
// license check passes) and again after activation from the license/freeze
// overlays, so the app is never left empty after entering a key.
let _bootFinalized = false;

async function bootApp() {
  // ===== PROGRESSIVE DATA LOADING =====
  const loadOverlay = document.createElement('div');
  loadOverlay.id = 'dataLoadOverlay';
  loadOverlay.style.cssText = 'position:fixed;inset:0;background:var(--bg, #1a1a2e);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:99999;transition:opacity .4s';
  loadOverlay.innerHTML = '<div class="spinner" style="width:48px;height:48px;border:4px solid var(--silver-700,#333);border-top-color:var(--bmw-blue,#0066B1);border-radius:50%;animation:spin .8s linear infinite;margin-bottom:20px"></div>'
    + '<div id="dataLoadText" style="color:var(--silver-400,#999);font-size:15px">جاري تحميل البيانات...</div>'
    + '<div id="dataLoadProgress" style="width:280px;height:6px;background:var(--silver-700,#333);border-radius:3px;margin-top:16px;overflow:hidden">'
    + '<div id="dataLoadBar" style="width:0%;height:100%;background:var(--bmw-blue,#0066B1);border-radius:3px;transition:width .3s"></div></div>';
  document.body.appendChild(loadOverlay);
  try {
    await DB.initProgressive((store, done, total, count) => {
      const textEl = document.getElementById('dataLoadText');
      const barEl = document.getElementById('dataLoadBar');
      if (!store) {
        if (textEl) textEl.textContent = 'تم تحميل جميع البيانات';
        if (barEl) barEl.style.width = '100%';
        return;
      }
      const names = { products: 'المنتجات', invoices: 'الفواتير', customers: 'العملاء', suppliers: 'الموردين', payments: 'المدفوعات', discounts: 'الخصومات', returns: 'المرتجعات', transfers: 'التحويلات', meta: 'الإعدادات' };
      const label = names[store] || store;
      if (textEl) textEl.textContent = `جاري تحميل ${label} (${count})`;
      if (barEl) barEl.style.width = Math.round((done / total) * 100) + '%';
    });

    // Isolated company process: import its own on-demand, company-scoped
    // snapshot. The shared main instance is untouched, and legacy data stays
    // in the base profile until the user has verified every company window.
    if (window.CompanyProfile && window.CompanyProfile.isolated) {
      try {
        const textEl = document.getElementById('dataLoadText');
        if (textEl) textEl.textContent = 'جاري تجهيز بيانات الشركة...';
        const result = await window.CompanyProfile.init();
        if (result && !result.skipped) console.info('[CompanyProfile]', JSON.stringify(result));
      } catch (e) {
        console.error('[CompanyProfile] boot migration error:', e);
      }
    }

    // Offline safety net: if the local database is empty and we are offline,
    // restore the newest auto-backup saved to disk so the app is never blank.
    if (!navigator.onLine && typeof DB.tryOfflineRestore === 'function') {
      try {
        const restored = await DB.tryOfflineRestore();
        if (restored && restored.restored) {
          console.log('[App] Offline auto-restore from', restored.file);
        }
      } catch (e) {
        console.error('[App] Offline restore error:', e);
      }
    }
    if (typeof window.updateOrdersBadge === 'function') window.updateOrdersBadge();
  } catch (e) {
    console.error('[DB] Progressive init error:', e);
  } finally {
    loadOverlay.style.opacity = '0';
    setTimeout(() => { if (loadOverlay.parentNode) loadOverlay.parentNode.removeChild(loadOverlay); }, 400);
  }

  // Load login page HTML
  try {
    const res = await fetch('pages/login.html');
    if (res.ok) {
      const loginHtml = await res.text();
      document.getElementById('loginOverlay').innerHTML = loginHtml;
    }
  } catch (e) { console.warn('[Auth] Failed to load login.html:', e); }

  // Require a password on every app start: clear any persisted session so the
  // login screen is always shown instead of silently resuming a previous login.
  // PRICE DISPLAY: a dedicated kiosk account may be configured to skip the
  // password screen entirely — wipe first, then sign straight back in.
  window.__pdKioskMode = false;
  let _pdAutoLoggedIn = false;
  // Standalone quick-entry window (F1): never wipe the shared session here —
  // it reuses the main window's login (same localStorage origin), otherwise the
  // password screen would appear and would also log the main window out.
  if (!window.__standaloneQuickEntry) {
    try {
      if (typeof Auth.requirePasswordOnStart === 'function') Auth.requirePasswordOnStart();
      // Audit the data scope at every boot (company/store) into the ring buffer —
      // used to diagnose "my edit reverted" reports on the customer's machine.
      if (typeof Auth.reportScope === 'function') Auth.reportScope('boot');
      const pdCfg = JSON.parse(localStorage.getItem('zmt_pd_settings') || 'null');
      const _al = pdCfg && pdCfg.autoLogin;
      if (pdCfg && pdCfg.enabled === true && _al && _al.enabled && _al.username && _al.password && _al.code &&
          typeof Auth.loginAsUser === 'function') {
        const _au = Auth.loginAsUser(_al.code, _al.username, _al.password);
        if (_au) {
          // The kiosk account only needs to *see* the price display stage, even if
          // its saved permission grid still has the row switched off.
          if (_au.role === 'user') {
            _au.permissions = _au.permissions || {};
            _au.permissions['price-display'] = Object.assign({}, _au.permissions['price-display'], { view: true });
            // Persist through the session helper rather than writing the storage
            // key directly, so the in-memory copy and localStorage can never
            // drift apart (every Auth.getCurrentUser() re-parses this key).
            if (typeof Auth.updateSession === 'function') {
              Auth.updateSession({ permissions: _au.permissions });
            } else {
              try { localStorage.setItem('zmt_auth_user', JSON.stringify(_au)); } catch (e) {}
            }
          }
          _pdAutoLoggedIn = true;
          window.__pdKioskMode = true;
          console.log('[PD] auto-login as', _au.username);
        }
      }
    } catch (e) {
      console.warn('[PD] auto-login failed:', e && e.message);
      _pdAutoLoggedIn = false;
      window.__pdKioskMode = false;
      try { Auth.signOut(); } catch (e2) {}
    }
  }

  // The license gate still applies to a kiosk boot.
  if (_pdAutoLoggedIn && typeof licenseGateAfterLogin === 'function' && !licenseGateAfterLogin()) {
    _pdAutoLoggedIn = false;
    window.__pdKioskMode = false;
    try { Auth.signOut(); } catch (e) {}
  }

  // Check auth state
  if (!Auth.isLoggedIn()) {
    document.querySelector('.app-container').style.display = 'none';
    document.getElementById('loginOverlay').style.display = 'flex';
    initLoginView();
    return;
  }

  // A company window must never resume a session bound to another company.
  if (window.CompanyProfile && window.CompanyProfile.isolated && typeof Auth.enforceLaunchCompany === 'function') {
    Auth.enforceLaunchCompany();
  }

  // User is logged in - init app normally
  document.getElementById('loginOverlay').style.display = 'none';
  document.querySelector('.app-container').style.display = '';

  // Update sidebar user info
  const user = Auth.getCurrentUser();
  const nameEl = document.getElementById('sidebarUserName');
  if (user && nameEl) {
    nameEl.textContent = user.role === 'user' ? (user.username || 'مستخدم') : 'المدير';
  }
  // Show which company the session's data belongs to (active, else default).
  try { renderSidebarCompany(); } catch (e) {}

  if (!Auth.isManager()) {
    document.body.classList.add('user-mode');
    document.querySelectorAll('.nav-item').forEach(nav => {
      const page = nav.dataset.page;
      if (page && !Auth.canView(page)) {
        nav.style.display = 'none';
      }
    });
  } else {
    document.body.classList.remove('user-mode');
  }

  if (Auth.isLoggedIn()) {
    const navMonitor = document.getElementById('navBranchesMonitor');
    const navShared = document.getElementById('navSharedInventory');
    // Both main and branch can see branches monitor
    if (navMonitor) navMonitor.style.display = '';
    if (navShared) navShared.style.display = 'none';
  }

  // Standalone F1 window: land directly on the entry form, no password step.
  if (window.__standaloneQuickEntry) {
    setTimeout(() => { try { navigateTo('quick-entry'); } catch (e) {} }, 50);
    // Diagnostics...
    try {
      window.addEventListener('resize', function () {
        console.log('[QE-DIAG] resize', window.outerWidth, 'x', window.outerHeight, 'inner', window.innerWidth, 'x', window.innerHeight);
      });
      document.addEventListener('visibilitychange', function () {
        console.log('[QE-DIAG] visibilitychange', document.visibilityState);
      });
      window.addEventListener('blur', function () { console.log('[QE-DIAG] blur'); });
      window.addEventListener('focus', function () { console.log('[QE-DIAG] focus'); });
    } catch (e) {}
  } else if (window.__pdKioskMode && Auth.canView('price-display')) {
    // A kiosk (price display) boot always lands on the price display stage.
    navigateTo('price-display');
  } else {
    navigateTo(Auth.firstViewablePage() || 'dashboard');
  }

  // One-time expiry warning after first render (per machine session)
  checkExpiryWarning();

  // Once-a-day debt-alerts reminder (critical debts), after the same first render
  checkDebtAlertsWarning();

  // One-time only: LAN + cloud init must not run again on re-boot after activation
  if (_bootFinalized) return;
  _bootFinalized = true;

  // Machine-level LAN/cloud services belong ONLY to the shared main instance.
  // Company processes (and standalone quick-entry windows) must never bind the
  // fixed LAN ports or upload a different company into the same remote path.
  const _sharedServiceOwner = !window.__standaloneQuickEntry && !(window.CompanyProfile && window.CompanyProfile.isolated);

  // Initialize LAN sync (main/sub server) — machine-level, persists across logins
  if (_sharedServiceOwner && typeof LANSync !== 'undefined') {
    LANSync.hookDb();
    LANSync.start();
  }

  // Initialize cloud command polling (website → desktop orders) on every boot
  // when connected, independent of the full-backup auto-sync setting.
  if (_sharedServiceOwner && typeof CloudService !== 'undefined' && CloudService.isCloudConnected()) {
    CloudService.startCommandPolling();
  }

  // Initialize cloud auto-sync if enabled
  if (_sharedServiceOwner && typeof CloudService !== 'undefined' && localStorage.getItem('zmt_cloud_autosync') === '1' && CloudService.isCloudConnected()) {
    CloudService.startAutoSync(CloudService.getAutoSyncInterval());
    console.log('[Cloud] Auto-sync started');
  }
}

/* ===== SIDEBAR COLLAPSE (3-state: full → slim → hidden → full) ===== */
var SIDEBAR_KEY = 'zmt_sidebar_state';

function getSidebarState() {
  var app = document.querySelector('.app-container');
  if (!app) return 'full';
  if (app.classList.contains('sidebar-hidden')) return 'hidden';
  if (app.classList.contains('sidebar-slim')) return 'slim';
  return 'full';
}
function applySidebarState(s) {
  var app = document.querySelector('.app-container');
  if (!app) return;
  app.classList.toggle('sidebar-slim', s === 'slim');
  app.classList.toggle('sidebar-hidden', s === 'hidden');
  try { localStorage.setItem(SIDEBAR_KEY, s); } catch (e) {}
  var btn = document.getElementById('btnToggleSidebar');
  if (btn) {
    var icon = btn.querySelector('i');
    if (icon) icon.className = (s === 'hidden') ? 'fas fa-bars' : (s === 'slim' ? 'fas fa-bars-staggered' : 'fas fa-bars');
  }
}
function cycleSidebar() {
  var cur = getSidebarState();
  var next = cur === 'full' ? 'slim' : (cur === 'slim' ? 'hidden' : 'full');
  applySidebarState(next);
}

// Apply saved state on boot
(function () {
  try {
    var saved = localStorage.getItem(SIDEBAR_KEY);
    if (saved === 'slim' || saved === 'hidden') applySidebarState(saved);
  } catch (e) {}
})();

// Wire the toggle button once the DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () {
    var b = document.getElementById('btnToggleSidebar');
    if (b) b.addEventListener('click', cycleSidebar);
  });
} else {
  var _b = document.getElementById('btnToggleSidebar');
  if (_b) _b.addEventListener('click', cycleSidebar);
}

// Ctrl+B toggles the sidebar from anywhere
document.addEventListener('keydown', function (e) {
  if (e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'b' || e.key === 'B')) {
    e.preventDefault();
    cycleSidebar();
  }
});

/* ===== TITLE-BAR SHORTCUTS (feature 2) =====
   Phone + company chips sit between the brand and the connection status.
   The chevron collapses them (state remembered); narrow windows collapse the
   labels automatically so the title bar never pushes the window controls away. */
var TITLE_SHORTCUTS_KEY = 'zmt_title_shortcuts_collapsed';

function applyTitleShortcutsCollapsed(collapsed) {
  var nav = document.getElementById('titleShortcuts');
  if (!nav) return;
  nav.classList.toggle('is-collapsed', !!collapsed);
  var btn = document.getElementById('titleShortcutsToggle');
  if (btn) {
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    var icon = btn.querySelector('i');
    if (icon) icon.className = collapsed ? 'fas fa-chevron-left' : 'fas fa-chevron-down';
  }
}

function toggleTitleShortcuts() {
  var nav = document.getElementById('titleShortcuts');
  if (!nav) return;
  var collapsed = !nav.classList.contains('is-collapsed');
  try { localStorage.setItem(TITLE_SHORTCUTS_KEY, collapsed ? '1' : '0'); } catch (e) {}
  applyTitleShortcutsCollapsed(collapsed);
}

(function () {
  var saved = false;
  try { saved = localStorage.getItem(TITLE_SHORTCUTS_KEY) === '1'; } catch (e) {}
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { applyTitleShortcutsCollapsed(saved); });
  } else {
    applyTitleShortcutsCollapsed(saved);
  }
})();

/* ===== Quick Entry page launcher (F1 shortcut + toolbar buttons, permission-gated) ===== */

// Set at parse time: this window is the standalone quick-entry window that main
// opens on F1 (renderer/index.html?standalone=quick-entry).
window.__standaloneQuickEntry = (typeof location !== 'undefined') && /[?&]standalone=quick-entry/i.test(location.search || '');

window.openQuickEntryPage = async function () {
  // Inside a standalone window, F1 opens ANOTHER window (multi-window support)
  // instead of being a no-op. Guard against re-entrancy with a simple flag.
  if (window.__standaloneQuickEntry) {
    if (window._qeOpening) return;
    window._qeOpening = true;
    try {
      if (typeof window.electronAPI !== 'undefined' && typeof window.electronAPI.openQuickEntryWindow === 'function') {
        await window.electronAPI.openQuickEntryWindow();
      }
    } catch (e) { console.warn('[QE] open window failed', e); }
    window._qeOpening = false;
    return;
  }
  var cur = window._currentPageId || '';
  if (cur === 'quick-entry') {
    navigateTo(window._qeReturnPage || 'invoices');
    return;
  }
  // While the purchase/supplier invoice edit screen is open, F1 opens the
  // quick-entry bound to that invoice ("add from scratch") in-page — the
  // standalone window has no way to return lines to the edit screen.
  if (cur === 'invoices' && typeof window.openInvQEAddIfEditing === 'function' && window.openInvQEAddIfEditing()) return;
  // Open from anywhere, but only for employees granted the quick-entry permission.
  // Managers (no perms object) and users with view permission are allowed.
  if (typeof Auth !== 'undefined' && Auth.isLoggedIn() && !Auth.canView('quick-entry')) {
    return;
  }
  // F1 now opens a separate minimizable window instead of leaving the current
  // page. Unfinished entries there are preserved while it is minimized, and the
  // operator keeps working in the main window in parallel.
  if (typeof window.electronAPI !== 'undefined' && typeof window.electronAPI.openQuickEntryWindow === 'function') {
    var ok = false;
    try { ok = await window.electronAPI.openQuickEntryWindow(); } catch (e) { console.warn('[QE] open window failed', e); }
    if (ok === true) return;
    // Window failed to open: fall back to the classic in-window quick-entry so
    // the shortcut always does something visible.
  }
  // Fallback: classic in-window quick-entry navigation.
  window._qeReturnPage = cur;
  window._qePrevSidebar = getSidebarState();
  applySidebarState('slim');
  navigateTo('quick-entry');
};

// Standalone quick-entry window: whenever it regains focus, re-sync the shared
// IndexedDB cache (main window may have sold/edited meanwhile) WITHOUT touching
// the in-window form, so unfinished entries stay intact.
window.addEventListener('focus', async function () {
  if (!window.__standaloneQuickEntry) return;
  try {
    if (typeof DB !== 'undefined' && typeof DB.initProgressive === 'function') {
      await DB.initProgressive();
    }
  } catch (e) {
    console.warn('[QE] refresh failed', e);
  }
});

// The main-process 'quick-entry-refresh' channel triggers the same re-sync
// (fires when the window is focused/restored from a minimized state).
if (typeof window.electronAPI !== 'undefined' && typeof window.electronAPI.onQuickEntryRefresh === 'function') {
  window.electronAPI.onQuickEntryRefresh(async () => {
    if (!window.__standaloneQuickEntry) return;
    try {
      if (typeof DB !== 'undefined' && typeof DB.initProgressive === 'function') {
        await DB.initProgressive();
      }
    } catch (e) {
      console.warn('[QE] refresh failed', e);
    }
  });
}

// Cross-window DB change bus (both windows, same handler):
// The standalone quick-entry child and the main window share the same
// IndexedDB but keep separate in-memory caches. When the OTHER window writes
// (e.g. the child saves an invoice), reload this window's cache live and tell
// any open page to re-render — so an invoice saved in the F1 window shows up in
// the main invoices list without restarting the app. The reload is debounced so
// the child's batch of product+invoice writes lands as one refresh.
(function () {
  if (typeof window.electronAPI === 'undefined' || typeof window.electronAPI.onDbChanged !== 'function') return;
  var _reloadTimer = null;
  window.electronAPI.onDbChanged(function () {
    if (_reloadTimer) clearTimeout(_reloadTimer);
    _reloadTimer = setTimeout(async function () {
      try {
        if (typeof DB !== 'undefined' && typeof DB.initProgressive === 'function') {
          await DB.initProgressive();
        }
      } catch (e) {
        console.warn('[Sync] cross-window reload failed', e);
      }
      try {
        window.dispatchEvent(new CustomEvent('zmt:data-refreshed'));
      } catch (e) { /* best effort */ }
    }, 700);
  });
})();

/* ===== Flush-on-close =====
 * The main process asks us to persist any pending (debounced/batched) IndexedDB
 * writes before the window closes, and waits for the ack. This guarantees the
 * last edit is not lost on a normal close (the "change reverted next morning"
 * symptom). Bounded by a main-side timeout as a safety net. */
(function () {
  if (typeof window.electronAPI === 'undefined' || typeof window.electronAPI.onAppFlush !== 'function') return;
  var _flushing = false;
  window.electronAPI.onAppFlush(async function () {
    if (_flushing) return;
    _flushing = true;
    try {
      if (typeof DB !== 'undefined' && typeof DB.flush === 'function') {
        await DB.flush();
      }
    } catch (e) {
      console.warn('[Flush] DB.flush failed on close', e);
    } finally {
      try { if (typeof window.electronAPI.appFlushDone === 'function') window.electronAPI.appFlushDone(); } catch (e) { /* best effort */ }
    }
  });
})();

document.addEventListener('keydown', function (e) {
  if (e.key !== 'F1') return;
  e.preventDefault();
  window.openQuickEntryPage();
});

/* ===== Buy Price Visibility Toggle (Ctrl+X) ===== */
(function () {
  function _buyPriceToast(visible) {
    var old = document.getElementById('zmt-buyprice-toast');
    if (old) old.remove();
    var el = document.createElement('div');
    el.id = 'zmt-buyprice-toast';
    el.textContent = visible ? '✓ سعر الشراء ظاهر' : '✓ سعر الشراء مخفي';
    el.setAttribute('style',
      'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
      'padding:10px 20px;border-radius:8px;color:#fff;font-weight:600;font-size:13px;' +
      'z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,0.25);opacity:0;transition:opacity 0.2s;' +
      'background:' + (visible ? 'var(--bmw-blue-1,#2196F3)' : 'var(--silver-600,#666)')
    );
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.style.opacity = '1'; });
    setTimeout(function () { el.style.opacity = '0'; setTimeout(function () { el.remove(); }, 300); }, 2000);
  }

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && e.code === 'KeyX') {
      if (typeof Auth === 'undefined' || !Auth.isLoggedIn() || !Auth.isManager()) return;
      // Let the native Ctrl+X cut work while typing inside a field.
      var tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
      e.preventDefault();
      var visible = Auth.toggleBuyPrice();
      _buyPriceToast(visible);
      window.dispatchEvent(new CustomEvent('zmt:buyprice-toggle', { detail: { visible: visible } }));
    }
  });
})();

/* ===== Balance Tools: تعديل الرصيد اليدوي + إعادة الحساب من الفواتير ===== */

window._zmtCanEditBalance = function (pageKey) {
  if (typeof Auth === 'undefined' || !Auth) return true;
  if (typeof Auth.isManager === 'function' && Auth.isManager()) return true;
  if (pageKey === 'customers' && typeof Auth.canEdit === 'function' && Auth.canEdit('customers')) return true;
  if (pageKey === 'suppliers' && typeof Auth.canEdit === 'function' && Auth.canEdit('suppliers')) return true;
  if (typeof Auth.canEdit === 'function' && Auth.canEdit('debts')) return true;
  return false;
};

window.applySingleBalanceChange = function (type, id, name, oldVal, newVal) {
  if (Math.abs(newVal - oldVal) < 0.005) return false;
  if (typeof createPreImportBackup === 'function') { try { createPreImportBackup(); } catch (e) {} }
  if (type === 'customer') {
    const list = DB.getCustomers();
    const idx = list.findIndex(c => c.id === id);
    if (idx === -1) return false;
    list[idx].balance = newVal;
    DB.saveCustomers(list);
  } else {
    const list = DB.getSuppliers();
    const idx = list.findIndex(s => s.id === id);
    if (idx === -1) return false;
    list[idx].balance = newVal;
    DB.saveSuppliers(list);
  }
  if (typeof DB.logAudit === 'function') {
    DB.logAudit({ action: 'balance-update', entity: type, entityId: id, detail: (name || '') + ' | ' + (Number(oldVal) || 0).toFixed(2) + ' -> ' + (Number(newVal) || 0).toFixed(2) });
  }
  return true;
};

window._refreshBalanceUIs = function () {
  if (document.getElementById('debtsList') && typeof renderDebts === 'function') renderDebts();
  if (document.getElementById('cdName') && typeof renderCdStats === 'function') renderCdStats();
  if (document.getElementById('sdName') && typeof renderSdStats === 'function') renderSdStats();
};

window.openBalanceEditModal = function (type, id) {
  const pageKey = type === 'customer' ? 'customers' : 'suppliers';
  if (!window._zmtCanEditBalance(pageKey)) {
    window._zmtToastMsg && window._zmtToastMsg(t('balanceTools.cantEdit') || 'لا تملك صلاحية تعديل العملاء/الموردين', 'error');
    if (!window._zmtToastMsg) alert(t('balanceTools.cantEdit') || 'لا تملك صلاحية تعديل العملاء/الموردين');
    return;
  }
  const entity = type === 'customer' ? DB.getCustomer(id) : DB.getSuppliers().find(s => s.id === id);
  if (!entity || !entity.id) return;
  const name = entity.name || '';
  const current = parseFloat(entity.balance) || 0;
  const isNeg = current < 0;

  const dirOptions = type === 'customer'
    ? '<option value="pos">' + (t('balanceTools.owesUs') || 'مدين لنا') + '</option><option value="neg">' + (t('balanceTools.weOweHim') || 'له ائتمان عندنا (سلفة)') + '</option>'
    : '<option value="pos">' + (t('balanceTools.weOwe') || 'علينا دين له') + '</option><option value="neg">' + (t('balanceTools.owesUsSup') || 'له رصيد عندنا (سلفة)') + '</option>';

  const old = document.getElementById('zmtBalanceModal');
  if (old) old.remove();
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'zmtBalanceModal';
  modal.style.display = 'flex';
  modal.innerHTML =
    '<div class="modal" style="max-width:430px">' +
      '<div class="modal-header">' +
        '<h3><i class="fas fa-balance-scale"></i> ' + (t('balanceTools.editTitle') || 'تعديل الرصيد') + '</h3>' +
        '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button>' +
      '</div>' +
      '<div class="modal-body" style="padding-top:4px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
          '<div>' +
            '<div style="font-size:14px;font-weight:800">' + escHtml(name) + '</div>' +
            '<div style="font-size:11px;color:var(--silver-500,#999);margin-top:2px">' + (type === 'customer' ? (t('tab.customers') || 'عميل') : (t('tab.suppliers') || 'مورد')) + '</div>' +
          '</div>' +
          '<div style="text-align:center">' +
            '<div style="font-size:10px;color:var(--silver-500,#999)">' + (t('balanceTools.current') || 'الرصيد الحالي') + '</div>' +
            '<div style="font-size:19px;font-weight:800;line-height:1.1;color:' + (current < 0 ? '#28a745' : current > 0 ? '#e65100' : 'var(--silver-500,#999)') + '">' + (current < 0 ? '−' : current > 0 ? '+' : '') + fmtMoney(Math.abs(current)) + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="margin-bottom:10px">' +
          '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">' + (t('balanceTools.signToggle') || 'الاتجاه') + '</label>' +
          '<select class="form-input" id="zmtBalDir" style="max-width:100%">' + dirOptions + '</select>' +
        '</div>' +
        '<div style="margin-bottom:10px">' +
          '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">' + (t('balanceTools.newBalance') || 'الرصيد الجديد (المبلغ)') + '</label>' +
          '<input type="text" class="form-input num-input" id="zmtBalAmount" inputmode="decimal" min="0" step="0.01" placeholder="0.00" style="max-width:100%;font-weight:700">' +
        '</div>' +
        '<div style="font-size:11px;color:var(--silver-500,#666);background:var(--silver-50,#f7f7f7);border:1px solid var(--silver-200,#e0e0e0);border-radius:8px;padding:8px 10px">' +
          (type === 'customer' ? (t('balanceTools.hintCustomer') || 'القيمة الموجبة: العميل مدين لنا. السالبة: له ائتمان عندنا.') : (t('balanceTools.hintSupplier') || 'القيمة الموجبة: علينا دين له. السالبة: له رصيد عندنا.')) +
        '</div>' +
      '</div>' +
      '<div class="modal-footer">' +
        '<button class="btn" onclick="this.closest(\'.modal-overlay\').remove()">' + (t('common.cancel') || 'إلغاء') + '</button>' +
        '<button class="btn btn-success" id="zmtBalSave"><i class="fas fa-check"></i> ' + (t('balanceTools.save') || 'حفظ الرصيد') + '</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);

  const dir = document.getElementById('zmtBalDir');
  dir.value = isNeg ? 'neg' : 'pos';
  const amount = document.getElementById('zmtBalAmount');
  amount.value = Math.abs(current).toFixed(2);

  document.getElementById('zmtBalSave').onclick = function () {
    const v = parseFloat(amount.value);
    if (isNaN(v) || v < 0) { alert(t('balanceTools.emptyEdit') || 'يرجى إدخال رصيد صحيح'); return; }
    const signed = (dir.value === 'neg' ? -1 : 1) * v;
    const changed = window.applySingleBalanceChange(type, id, name, current, signed);
    if (changed) {
      modal.remove();
      alert(t('balanceTools.saved') || 'تم تحديث الرصيد بنجاح');
      window.dispatchEvent(new CustomEvent('zmt:balances-updated', { detail: { type: type, id: id } }));
      window._refreshBalanceUIs();
    }
  };
  modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
};

window.recalculateAllBalances = async function (opts) {
  if (!window._zmtCanEditBalance('debts')) return null;
  opts = opts || {};
  const customers = DB.getCustomers();
  const suppliers = DB.getSuppliers();
  const allInvoices = (DB.getInvoices ? DB.getInvoices() : []) || [];
  const allPayments = (DB.getPayments ? DB.getPayments() : []) || [];
  const out = { customers: [], suppliers: [] };

  if (opts.customers !== false) {
    for (const c of customers) {
      let salesSum = 0;
      for (const inv of allInvoices) {
        if (inv.customerId !== c.id || inv.type === 'payment') continue;
        salesSum += (parseFloat(inv.totalAmount) || 0) - (parseFloat(inv.extraDiscount) || 0);
      }
      let paySum = 0;
      for (const p of allPayments) {
        if (p.customerId === c.id) paySum += parseFloat(p.amount) || 0;
      }
      const next = salesSum - paySum;
      if (Math.abs(next - (parseFloat(c.balance) || 0)) > 0.005) out.customers.push({ id: c.id, name: c.name || '', old: parseFloat(c.balance) || 0, next: next });
    }
  }
  if (opts.suppliers !== false) {
    for (const s of suppliers) {
      let purchases = 0, salesTotal = 0;
      const supSaleIds = new Set();
      for (const inv of allInvoices) {
        if (inv.supplierId !== s.id) continue;
        if (inv.type === 'payment' || inv.type === 'dispatch') continue;
        const amt = parseFloat(inv.totalAmount) || 0;
        if (inv.type === 'sup_sale') { salesTotal += amt; supSaleIds.add(inv.id); }
        else purchases += amt;
      }
      let pmtReg = 0, pmtSup = 0;
      for (const p of allPayments) {
        if (p.supplierId !== s.id) continue;
        if (p.isSupSaleExpense) continue; // مصاريف بيع لمورد: لا تمس الرصيد
        const amt = parseFloat(p.amount) || 0;
        if (p.invoiceId && supSaleIds.has(p.invoiceId)) pmtSup += amt; else pmtReg += amt;
      }
      // رصيد المورد = مشتريات − دفعات عادية + دفعات على «بيع لمورد» − قيمة بيع لمورد.
      const next = purchases - pmtReg + pmtSup - salesTotal;
      if (Math.abs(next - (parseFloat(s.balance) || 0)) > 0.005) out.suppliers.push({ id: s.id, name: s.name || '', old: parseFloat(s.balance) || 0, next: next });
    }
  }
  return out;
};

window.applyRecalculatedBalances = async function (result) {
  if (!result || !result.customers || !result.suppliers) return;
  const total = result.customers.length + result.suppliers.length;
  if (!total) return;
  if (typeof createPreImportBackup === 'function') { try { createPreImportBackup(); } catch (e) {} }
  if (result.customers.length) {
    const list = DB.getCustomers();
    for (const r of result.customers) {
      const idx = list.findIndex(c => c.id === r.id);
      if (idx >= 0) list[idx].balance = r.next;
    }
    DB.saveCustomers(list);
    if (typeof DB.logAudit === 'function') DB.logAudit({ action: 'balance-recalc', entity: 'customer', detail: result.customers.length + ' ' + (t('balanceTools.clients') || 'عميل') });
  }
  if (result.suppliers.length) {
    const list = DB.getSuppliers();
    for (const r of result.suppliers) {
      const idx = list.findIndex(s => s.id === r.id);
      if (idx >= 0) list[idx].balance = r.next;
    }
    DB.saveSuppliers(list);
    if (typeof DB.logAudit === 'function') DB.logAudit({ action: 'balance-recalc', entity: 'supplier', detail: result.suppliers.length + ' ' + (t('balanceTools.suppliers') || 'مورد') });
  }
  window.dispatchEvent(new CustomEvent('zmt:balances-updated'));
  window._refreshBalanceUIs();
};
